import type {
  FieldDefinition,
  FieldType,
  Shot,
  StoryboardProject,
} from "../domain/storyboard";
import type {
  AuthUser,
  ProjectEventListener,
  ProjectFolder,
  ProjectHomeSettings,
  ProjectMember,
  ProjectMetaPatch,
  ProjectSummary,
  PermanentDeleteRequestStatus,
  RemoteImage,
  StoryboardTemplate,
  TemplateSnapshot,
  Unsubscribe,
  UploadImageInput,
  VersionedShot,
} from "../domain/models";
import {
  GatewayError,
  type GatewayErrorCode,
  type StoryboardGateway,
} from "./gateway";
import { DEFAULT_ASPECT_RATIO } from "../domain/storyboard";
import {
  BUILT_IN_TEMPLATES,
  templateToProject,
  type DeepReadonly,
} from "../domain/templates";

export type SupabaseClientLike = any;

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  status?: number;
};

export function mapSupabaseError(
  error: SupabaseErrorLike,
  fallback: GatewayErrorCode = "network",
): GatewayError {
  const message = error.message ?? fallback;
  if (error.code === "42501" || error.status === 401 || error.status === 403) {
    return new GatewayError("forbidden", message);
  }
  if (error.code === "23505") {
    return new GatewayError("already_member", message);
  }
  if (error.code === "P0002" || message.includes("user_not_found")) {
    return new GatewayError("user_not_found", message);
  }
  if (error.code === "PGRST116") {
    return new GatewayError("not_found", message);
  }
  if (message.toLowerCase().includes("invalid login")) {
    return new GatewayError("invalid_credentials", message);
  }
  if (message.toLowerCase().includes("already registered")) {
    return new GatewayError("already_registered", message);
  }
  if (message.toLowerCase().includes("fetch") || message.toLowerCase().includes("network")) {
    return new GatewayError("network", message);
  }
  return new GatewayError(fallback, message);
}

function requireData<T>(result: { data: T | null; error: SupabaseErrorLike | null }, fallback?: GatewayErrorCode): T {
  if (result.error) throw mapSupabaseError(result.error, fallback);
  if (result.data === null) throw new GatewayError("not_found");
  return result.data;
}

function authUser(user: any): AuthUser {
  if (!user?.id || !user?.email) throw new GatewayError("not_authenticated");
  return { id: user.id, email: user.email };
}

function rowToShot(row: any): Shot {
  return { id: row.id, values: { ...(row.values ?? {}) } };
}

function rowToVersionedShot(row: any): VersionedShot {
  return { shot: rowToShot(row), version: row.version ?? 1 };
}

function cloneSnapshot(snapshot: DeepReadonly<TemplateSnapshot>): TemplateSnapshot {
  const project = templateToProject(snapshot, "template-snapshot", snapshot.title);
  const { id: _id, ...cloned } = project;
  return cloned;
}

function rowToTemplate(row: any): StoryboardTemplate {
  return {
    id: row.id,
    sourceProjectId: row.source_project_id,
    name: row.name,
    snapshot: cloneSnapshot(row.snapshot),
    builtIn: false,
    updatedAt: row.updated_at,
  };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function refreshImageUrlsInValues(
  values: Record<string, string>,
  imageFieldIds: Set<string>,
  signPath: (path: string) => Promise<string>,
): Promise<Record<string, string>> {
  const next = { ...values };
  for (const fieldId of imageFieldIds) {
    const stored = values[fieldId];
    if (!stored) continue;
    try {
      const images: RemoteImage[] = JSON.parse(stored);
      if (!Array.isArray(images)) continue;
      next[fieldId] = JSON.stringify(
        await Promise.all(
          images.map(async (image) => ({
            ...image,
            url: await signPath(image.path),
          })),
        ),
      );
    } catch {
      // Legacy values remain unchanged and can be migrated later.
    }
  }
  return next;
}

class SupabaseStoryboardGateway implements StoryboardGateway {
  constructor(private readonly client: SupabaseClientLike) {}

  async getSession(): Promise<AuthUser | null> {
    const result = await this.client.auth.getSession();
    if (result.error) throw mapSupabaseError(result.error);
    return result.data.session?.user ? authUser(result.data.session.user) : null;
  }

  onAuthChange(listener: (user: AuthUser | null) => void): Unsubscribe {
    const { data } = this.client.auth.onAuthStateChange((_event: string, session: any) => {
      listener(session?.user ? authUser(session.user) : null);
    });
    return () => data.subscription.unsubscribe();
  }

  async signUp(email: string, password: string): Promise<AuthUser> {
    const result = await this.client.auth.signUp({ email: email.trim().toLowerCase(), password });
    if (result.error) throw mapSupabaseError(result.error);
    return authUser(result.data.user);
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const result = await this.client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (result.error) throw mapSupabaseError(result.error, "invalid_credentials");
    return authUser(result.data.user);
  }

  async signOut(): Promise<void> {
    const result = await this.client.auth.signOut();
    if (result.error) throw mapSupabaseError(result.error);
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const user = await this.requireUser();
    const projectRows = requireData<any[]>(
      await this.client
        .from("projects")
        .select("id,title,aspect_ratio,owner_id,icon,created_at,updated_at,deleted_at,permanent_delete_requested_at,shots(count)")
        .order("updated_at", { ascending: false }),
    ).filter((row) => !row.deleted_at || row.owner_id === user.id);
    if (projectRows.length === 0) return [];
    const projectIds = projectRows.map((row) => row.id);
    const memberships = requireData<any[]>(
      await this.client.from("project_members").select("project_id,user_id,role").in("project_id", projectIds),
    );
    const ownerIds = [...new Set(projectRows.map((row) => row.owner_id))];
    const profiles = requireData<any[]>(
      await this.client.from("profiles").select("id,email").in("id", ownerIds),
    );
    return projectRows.map((row) => ({
      id: row.id,
      title: row.title,
      aspectRatio: row.aspect_ratio || DEFAULT_ASPECT_RATIO,
      icon: row.icon ?? null,
      ownerId: row.owner_id,
      ownerEmail: profiles.find((profile) => profile.id === row.owner_id)?.email ?? "",
      role: row.owner_id === user.id
        ? "owner"
        : memberships.find(
            (membership) => membership.project_id === row.id && membership.user_id === user.id,
          )?.role ?? "editor",
      memberCount: memberships.filter((membership) => membership.project_id === row.id).length,
      shotCount: row.shots?.[0]?.count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? null,
      permanentDeleteRequestedAt: row.permanent_delete_requested_at ?? null,
    }));
  }

  async listFolders(): Promise<ProjectFolder[]> {
    const rows = requireData<any[]>(
      await this.client
        .from("project_folders")
        .select("id,name,updated_at")
        .order("updated_at", { ascending: true }),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at,
    }));
  }

  async createFolder(name: string): Promise<ProjectFolder> {
    const user = await this.requireUser();
    const rows = requireData<any[]>(
      await this.client
        .from("project_folders")
        .insert({ user_id: user.id, name: name.trim() })
        .select("id,name,updated_at"),
    );
    const row = rows[0];
    if (!row) throw new GatewayError("not_found");
    return { id: row.id, name: row.name, updatedAt: row.updated_at };
  }

  async renameFolder(folderId: string, name: string): Promise<void> {
    const result = await this.client
      .from("project_folders")
      .update({ name: name.trim() })
      .eq("id", folderId);
    if (result.error) throw mapSupabaseError(result.error);
  }

  async deleteFolder(folderId: string): Promise<void> {
    const result = await this.client.from("project_folders").delete().eq("id", folderId);
    if (result.error) throw mapSupabaseError(result.error);
  }

  async setProjectFolder(
    projectId: string,
    folderId: string | null,
  ): Promise<void> {
    const user = await this.requireUser();
    if (folderId === null) {
      const result = await this.client
        .from("project_folder_assignments")
        .delete()
        .eq("project_id", projectId);
      if (result.error) throw mapSupabaseError(result.error);
      return;
    }
    const result = await this.client.from("project_folder_assignments").upsert(
      { user_id: user.id, project_id: projectId, folder_id: folderId },
      { onConflict: "user_id,project_id" },
    );
    if (result.error) throw mapSupabaseError(result.error);
  }

  async listProjectFolderAssignments(): Promise<Record<string, string>> {
    const rows = requireData<any[]>(
      await this.client
        .from("project_folder_assignments")
        .select("project_id,folder_id"),
    );
    return Object.fromEntries(
      rows.map((row) => [row.project_id as string, row.folder_id as string]),
    );
  }

  async listHomeSettings(): Promise<ProjectHomeSettings> {
    const user = await this.requireUser();
    const result = await this.client
      .from("project_home_settings")
      .select("sort_by")
      .eq("user_id", user.id)
      .maybeSingle();
    if (result.error) throw mapSupabaseError(result.error);
    return { sortBy: result.data?.sort_by ?? "updated" };
  }

  async saveHomeSettings(settings: ProjectHomeSettings): Promise<void> {
    const user = await this.requireUser();
    const result = await this.client
      .from("project_home_settings")
      .upsert({ user_id: user.id, sort_by: settings.sortBy });
    if (result.error) throw mapSupabaseError(result.error);
  }

  async setProjectIcon(projectId: string, icon: string | null): Promise<void> {
    const result = await this.client
      .from("projects")
      .update({ icon })
      .eq("id", projectId);
    if (result.error) throw mapSupabaseError(result.error);
  }

  async moveProjectToTrash(projectId: string): Promise<void> {
    const result = await this.client
      .from("projects")
      .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", projectId);
    if (result.error) throw mapSupabaseError(result.error);
    if (result.count === 0) throw new GatewayError("forbidden");
  }

  async restoreProject(projectId: string): Promise<void> {
    const result = await this.client
      .from("projects")
      .update({ deleted_at: null }, { count: "exact" })
      .eq("id", projectId);
    if (result.error) throw mapSupabaseError(result.error);
    if (result.count === 0) throw new GatewayError("forbidden");
  }

  async permanentlyDeleteProject(
    projectId: string,
  ): Promise<PermanentDeleteRequestStatus> {
    const result = await this.client.rpc("request_project_permanent_deletion", {
      p_project_id: projectId,
    });
    if (result.error) throw mapSupabaseError(result.error, "forbidden");
    if (result.data !== "requested" && result.data !== "pending") {
      throw new GatewayError("network", "Unexpected permanent-deletion request status");
    }
    return result.data;
  }

  async createProject(
    title: string,
    template?: TemplateSnapshot,
  ): Promise<ProjectSummary> {
    const user = await this.requireUser();
    const templateProject = template
      ? templateToProject(template, "template-snapshot", title.trim())
      : undefined;
    const created = requireData<any>(
      await this.client.rpc("create_storyboard_project", {
        p_title: title.trim(),
        p_aspect_ratio: templateProject?.aspectRatio ?? null,
      }),
    );
    const row = Array.isArray(created) ? created[0] : created;
    if (!row) throw new GatewayError("not_found");
    if (templateProject) {
      await this.replaceFields(row.id, templateProject.fields);
      const removeShots = await this.client.from("shots").delete().eq("project_id", row.id);
      if (removeShots.error) throw mapSupabaseError(removeShots.error);
      if (templateProject.shots.length > 0) {
        const insertShots = await this.client.from("shots").insert(
          templateProject.shots.map((shot, position) => ({
            project_id: row.id,
            position,
            values: { ...shot.values },
          })),
        );
        if (insertShots.error) throw mapSupabaseError(insertShots.error);
      }
    }
    return {
      id: row.id,
      title: row.title,
      aspectRatio:
        row.aspect_ratio || templateProject?.aspectRatio || DEFAULT_ASPECT_RATIO,
      icon: row.icon ?? null,
      ownerId: row.owner_id,
      ownerEmail: user.email,
      role: "owner",
      memberCount: 1,
      shotCount: templateProject
        ? templateProject.shots.length
        : row.shots?.[0]?.count ?? 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? null,
      permanentDeleteRequestedAt: row.permanent_delete_requested_at ?? null,
    };
  }

  async listTemplates(): Promise<StoryboardTemplate[]> {
    const rows = requireData<any[]>(
      await this.client
        .from("project_templates")
        .select("id,source_project_id,name,snapshot,updated_at")
        .order("updated_at", { ascending: false }),
    );
    return [
      ...BUILT_IN_TEMPLATES.map((template) =>
        ({ ...template, snapshot: cloneSnapshot(template.snapshot) }),
      ),
      ...rows.map(rowToTemplate),
    ];
  }

  async createTemplate(
    sourceProjectId: string,
    name: string,
    snapshot: TemplateSnapshot,
  ): Promise<StoryboardTemplate> {
    const rows = requireData<any[]>(
      await this.client
        .from("project_templates")
        .insert({
          source_project_id: sourceProjectId,
          name: name.trim(),
          snapshot: cloneSnapshot(snapshot),
        })
        .select("id,source_project_id,name,snapshot,updated_at"),
    );
    if (!rows[0]) throw new GatewayError("not_found");
    return rowToTemplate(rows[0]);
  }

  async updateTemplate(
    templateId: string,
    name: string,
    snapshot: TemplateSnapshot,
  ): Promise<void> {
    const result = await this.client
      .from("project_templates")
      .update({ name: name.trim(), snapshot: cloneSnapshot(snapshot) })
      .eq("id", templateId);
    if (result.error) throw mapSupabaseError(result.error);
  }

  async deleteTemplate(templateId: string): Promise<void> {
    const result = await this.client.from("project_templates").delete().eq("id", templateId);
    if (result.error) throw mapSupabaseError(result.error);
  }

  async renameProject(projectId: string, title: string): Promise<void> {
    const result = await this.client.from("projects").update({ title: title.trim() }).eq("id", projectId);
    if (result.error) throw mapSupabaseError(result.error);
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.moveProjectToTrash(projectId);
  }

  async loadProject(projectId: string): Promise<StoryboardProject> {
    const [projectResult, fieldsResult, optionsResult, shotsResult] = await Promise.all([
      this.client.from("projects").select("id,title,aspect_ratio").eq("id", projectId).single(),
      this.client.from("fields").select("id,field_key,label,field_type,visible,position,allow_custom_value").eq("project_id", projectId).order("position"),
      this.client.from("field_options").select("field_id,value,position").order("position"),
      this.client.from("shots").select("id,values,version,position").eq("project_id", projectId).order("position"),
    ]);
    const projectRow = requireData<any>(projectResult);
    const fieldRows = requireData<any[]>(fieldsResult);
    const optionRows = requireData<any[]>(optionsResult);
    const shotRows = requireData<any[]>(shotsResult);
    const imageFieldIds = new Set(
      fieldRows
        .filter((row) => row.field_type === "image")
        .map((row) => row.field_key as string),
    );
    const shots = await Promise.all(
      shotRows.map(async (row) => ({
        id: row.id,
        values: await refreshImageUrlsInValues(
          { ...(row.values ?? {}) },
          imageFieldIds,
          async (path) => {
            const signed = await this.client.storage
              .from("storyboard-images")
              .createSignedUrl(path, 3600);
            if (signed.error) throw mapSupabaseError(signed.error, "upload_failed");
            return signed.data.signedUrl;
          },
        ),
      })),
    );
    return {
      id: projectRow.id,
      title: projectRow.title,
      aspectRatio: projectRow.aspect_ratio || DEFAULT_ASPECT_RATIO,
      fields: fieldRows.map((row) => ({
        id: row.field_key,
        label: row.label,
        type: row.field_type as FieldType,
        visible: row.visible,
        order: row.position,
        allowCustomValue: row.allow_custom_value,
        options: optionRows
          .filter((option) => option.field_id === row.id)
          .sort((left, right) => left.position - right.position)
          .map((option) => option.value),
      })),
      shots,
    };
  }

  async saveProjectMeta(projectId: string, patch: ProjectMetaPatch): Promise<void> {
    const projectPatch: Record<string, string> = {};
    if (patch.title !== undefined) projectPatch.title = patch.title;
    if (patch.aspectRatio !== undefined) projectPatch.aspect_ratio = patch.aspectRatio;
    if (Object.keys(projectPatch).length > 0) {
      const result = await this.client.from("projects").update(projectPatch).eq("id", projectId);
      if (result.error) throw mapSupabaseError(result.error);
    }
    if (!patch.fields) return;
    await this.replaceFields(projectId, patch.fields);
  }

  private async replaceFields(
    projectId: string,
    fields: FieldDefinition[],
  ): Promise<void> {
    const removeFields = await this.client.from("fields").delete().eq("project_id", projectId);
    if (removeFields.error) throw mapSupabaseError(removeFields.error);
    const rows = requireData<any[]>(
      await this.client
        .from("fields")
        .insert(
          fields.map((field) => ({
            project_id: projectId,
            field_key: field.id,
            label: field.label,
            field_type: field.type,
            visible: field.visible,
            position: field.order,
            allow_custom_value: field.allowCustomValue ?? false,
          })),
        )
        .select("id,field_key"),
    );
    const options = fields.flatMap((field) => {
      const fieldId = rows.find((row) => row.field_key === field.id)?.id;
      if (!fieldId) return [];
      return (field.options ?? []).map((value, position) => ({
        field_id: fieldId,
        value,
        position,
      }));
    });
    if (options.length > 0) {
      const insertOptions = await this.client.from("field_options").insert(options);
      if (insertOptions.error) throw mapSupabaseError(insertOptions.error);
    }
  }

  async saveShot(projectId: string, shot: Shot, expectedVersion: number): Promise<VersionedShot> {
    const result = await this.client
      .from("shots")
      .update({ values: shot.values })
      .eq("id", shot.id)
      .eq("project_id", projectId)
      .eq("version", expectedVersion)
      .select("id,values,version");
    if (result.error) throw mapSupabaseError(result.error);
    if (!result.data?.[0]) throw new GatewayError("conflict");
    return rowToVersionedShot(result.data[0]);
  }

  async addShot(projectId: string): Promise<VersionedShot> {
    const rows = requireData<any[]>(
      await this.client.from("shots").select("position").eq("project_id", projectId).order("position", { ascending: false }).limit(1),
    );
    const position = (rows[0]?.position ?? -1) + 1;
    const inserted = requireData<any[]>(
      await this.client
        .from("shots")
        .insert({ project_id: projectId, position, values: { shotNumber: String(position + 1) } })
        .select("id,values,version"),
      "conflict",
    );
    return rowToVersionedShot(inserted[0]);
  }

  async deleteShot(projectId: string, shotId: string): Promise<void> {
    const removeResult = await this.client.from("shots").delete().eq("id", shotId).eq("project_id", projectId);
    if (removeResult.error) throw mapSupabaseError(removeResult.error);
    const rows = requireData<any[]>(
      await this.client.from("shots").select("id").eq("project_id", projectId).order("position"),
    );
    if (rows.length > 0) await this.reorderShots(projectId, rows.map((row) => row.id));
  }

  async reorderShots(projectId: string, orderedShotIds: string[]): Promise<void> {
    const result = await this.client.rpc("reorder_project_shots", {
      p_project_id: projectId,
      p_ordered_shot_ids: orderedShotIds,
    });
    if (result.error) throw mapSupabaseError(result.error, "conflict");
  }

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    const memberships = requireData<any[]>(
      await this.client.from("project_members").select("user_id,role").eq("project_id", projectId),
    );
    const profiles = memberships.length === 0
      ? []
      : requireData<any[]>(
          await this.client.from("profiles").select("id,email").in("id", memberships.map((row) => row.user_id)),
        );
    return memberships.map((membership) => ({
      userId: membership.user_id,
      role: membership.role,
      email: profiles.find((profile) => profile.id === membership.user_id)?.email ?? "",
    }));
  }

  async inviteMember(projectId: string, email: string): Promise<void> {
    const existing = await this.listMembers(projectId);
    if (existing.some((member) => member.email === email.trim().toLowerCase())) {
      throw new GatewayError("already_member");
    }
    const result = await this.client.rpc("invite_project_member", {
      p_project_id: projectId,
      p_email: email.trim().toLowerCase(),
    });
    if (result.error) throw mapSupabaseError(result.error);
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    const result = await this.client
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("role", "editor");
    if (result.error) throw mapSupabaseError(result.error);
  }

  async uploadImage(input: UploadImageInput): Promise<RemoteImage> {
    const unique = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const path = `${input.projectId}/${input.shotId}/${input.fieldId}/${unique}-${sanitizeFileName(input.file.name)}`;
    const uploadResult = await this.client.storage.from("storyboard-images").upload(path, input.file, {
      upsert: false,
      contentType: input.file.type,
    });
    if (uploadResult.error) throw mapSupabaseError(uploadResult.error, "upload_failed");
    const signed = await this.client.storage.from("storyboard-images").createSignedUrl(path, 3600);
    if (signed.error) throw mapSupabaseError(signed.error, "upload_failed");
    return {
      path,
      url: signed.data.signedUrl,
      name: input.file.name,
      position: input.position,
    };
  }

  async deleteImage(projectId: string, path: string): Promise<void> {
    if (!path.startsWith(`${projectId}/`)) throw new GatewayError("forbidden");
    const result = await this.client.storage.from("storyboard-images").remove([path]);
    if (result.error) throw mapSupabaseError(result.error);
  }

  subscribeProject(projectId: string, listener: ProjectEventListener): Unsubscribe {
    const channel = this.client.channel(`project:${projectId}`);
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "shots", filter: `project_id=eq.${projectId}` },
      (payload: any) => {
        if (payload.eventType === "DELETE") {
          listener({ type: "shot.deleted", shotId: payload.old.id });
        } else {
          listener({ type: "shot.updated", shot: rowToVersionedShot(payload.new) });
        }
      },
    );
    for (const table of ["projects", "project_members", "fields", "field_options"]) {
      const filter = table === "projects"
        ? `id=eq.${projectId}`
        : table === "field_options"
          ? undefined
          : `project_id=eq.${projectId}`;
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        () => listener({ type: table === "projects" ? "project.changed" : "structure.changed" }),
      );
    }
    channel.subscribe();
    return () => void this.client.removeChannel(channel);
  }

  async importLocalProject(project: StoryboardProject): Promise<ProjectSummary> {
    const summary = await this.createProject(project.title);
    await this.saveProjectMeta(summary.id, {
      title: project.title,
      aspectRatio: project.aspectRatio || DEFAULT_ASPECT_RATIO,
      fields: project.fields,
    });
    const online = await this.loadProject(summary.id);
    if (project.shots[0] && online.shots[0]) {
      await this.saveShot(summary.id, { ...online.shots[0], values: project.shots[0].values }, 1);
    }
    for (const localShot of project.shots.slice(1)) {
      const added = await this.addShot(summary.id);
      await this.saveShot(summary.id, { ...added.shot, values: localShot.values }, added.version);
    }
    return summary;
  }

  private async requireUser(): Promise<AuthUser> {
    const user = await this.getSession();
    if (!user) throw new GatewayError("not_authenticated");
    return user;
  }
}

export function createSupabaseGateway(client: SupabaseClientLike): StoryboardGateway {
  return new SupabaseStoryboardGateway(client);
}
