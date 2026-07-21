import {
  addShot as addLocalShot,
  createProject as createLocalProject,
  deleteShot as deleteLocalShot,
  moveShot,
  type Shot,
  type StoryboardProject,
} from "../domain/storyboard";
import type {
  AuthUser,
  ProjectEvent,
  ProjectEventListener,
  ProjectMember,
  ProjectMetaPatch,
  ProjectRole,
  ProjectSummary,
  RemoteImage,
  StoryboardTemplate,
  TemplateSnapshot,
  Unsubscribe,
  UploadImageInput,
  VersionedShot,
} from "../domain/models";
import {
  BUILT_IN_TEMPLATES,
  templateToProject,
  type DeepReadonly,
} from "../domain/templates";
import { GatewayError, type StoryboardGateway } from "./gateway";

type StoredUser = AuthUser & { password: string };

function cloneProject(project: StoryboardProject): StoryboardProject {
  return {
    ...project,
    fields: project.fields.map((field) => ({
      ...field,
      options: field.options ? [...field.options] : undefined,
    })),
    shots: project.shots.map((shot) => ({
      ...shot,
      values: { ...shot.values },
    })),
  };
}

function cloneSnapshot(snapshot: DeepReadonly<TemplateSnapshot>): TemplateSnapshot {
  const project = templateToProject(snapshot, "template-snapshot", snapshot.title);
  const { id: _id, ...cloned } = project;
  return cloned;
}

function cloneTemplate(
  template: DeepReadonly<StoryboardTemplate>,
): StoryboardTemplate {
  return { ...template, snapshot: cloneSnapshot(template.snapshot) };
}

export class FakeStoryboardGateway implements StoryboardGateway {
  private readonly users = new Map<string, StoredUser>();
  private readonly projects = new Map<string, StoryboardProject>();
  private readonly owners = new Map<string, string>();
  private readonly memberships = new Map<string, Map<string, ProjectRole>>();
  private readonly templates = new Map<string, StoryboardTemplate>();
  private readonly versions = new Map<string, number>();
  private readonly authListeners = new Set<(user: AuthUser | null) => void>();
  private readonly projectListeners = new Map<
    string,
    Set<ProjectEventListener>
  >();
  private currentUser: AuthUser | null = null;
  private nextUserId = 1;
  private nextProjectId = 1;
  private nextTemplateId = 1;
  private nextConflict: { projectId: string; shot: Shot } | null = null;

  async getSession(): Promise<AuthUser | null> {
    return this.currentUser ? { ...this.currentUser } : null;
  }

  onAuthChange(listener: (user: AuthUser | null) => void): Unsubscribe {
    this.authListeners.add(listener);
    return () => this.authListeners.delete(listener);
  }

  async signUp(email: string, password: string): Promise<AuthUser> {
    const normalizedEmail = email.trim().toLowerCase();
    if (this.users.has(normalizedEmail)) {
      throw new GatewayError("already_registered");
    }
    const user = {
      id: `user-${this.nextUserId++}`,
      email: normalizedEmail,
      password,
    };
    this.users.set(normalizedEmail, user);
    this.setCurrentUser(user);
    return { id: user.id, email: user.email };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const user = this.users.get(email.trim().toLowerCase());
    if (!user || user.password !== password) {
      throw new GatewayError("invalid_credentials");
    }
    this.setCurrentUser(user);
    return { id: user.id, email: user.email };
  }

  async signOut(): Promise<void> {
    this.currentUser = null;
    this.notifyAuth();
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const user = this.requireUser();
    return [...this.projects.keys()]
      .filter((projectId) => this.memberships.get(projectId)?.has(user.id))
      .map((projectId) => this.summaryFor(projectId));
  }

  async createProject(
    title: string,
    template?: TemplateSnapshot,
  ): Promise<ProjectSummary> {
    const user = this.requireUser();
    const id = `project-${this.nextProjectId++}`;
    const project = template
      ? {
          ...templateToProject(template, id, title.trim()),
          shots: template.shots.map((shot, index) => ({
            ...shot,
            id: `${id}-shot-${index + 1}`,
            values: { ...shot.values },
          })),
        }
      : { ...createLocalProject(), id, title: title.trim() };
    this.projects.set(id, project);
    this.owners.set(id, user.id);
    this.memberships.set(id, new Map([[user.id, "owner"]]));
    project.shots.forEach((shot) => this.versions.set(shot.id, 1));
    return this.summaryFor(id);
  }

  async listTemplates(): Promise<StoryboardTemplate[]> {
    const user = this.requireUser();
    const builtIns = BUILT_IN_TEMPLATES.map(cloneTemplate);
    const custom = [...this.templates.values()]
      .filter((template) =>
        this.memberships.get(template.sourceProjectId!)?.has(user.id),
      )
      .map(cloneTemplate);
    return [...builtIns, ...custom];
  }

  async createTemplate(
    sourceProjectId: string,
    name: string,
    snapshot: TemplateSnapshot,
  ): Promise<StoryboardTemplate> {
    this.requireProjectMember(sourceProjectId);
    const template: StoryboardTemplate = {
      id: `template-${this.nextTemplateId++}`,
      sourceProjectId,
      name: name.trim(),
      snapshot: cloneSnapshot(snapshot),
      builtIn: false,
      updatedAt: new Date().toISOString(),
    };
    this.templates.set(template.id, template);
    return cloneTemplate(template);
  }

  async updateTemplate(
    templateId: string,
    name: string,
    snapshot: TemplateSnapshot,
  ): Promise<void> {
    const template = this.requireTemplate(templateId);
    this.requireProjectMember(template.sourceProjectId!);
    this.templates.set(templateId, {
      ...template,
      name: name.trim(),
      snapshot: cloneSnapshot(snapshot),
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteTemplate(templateId: string): Promise<void> {
    const template = this.requireTemplate(templateId);
    this.requireProjectMember(template.sourceProjectId!);
    this.templates.delete(templateId);
  }

  async renameProject(projectId: string, title: string): Promise<void> {
    const project = this.requireProjectMember(projectId);
    this.projects.set(projectId, { ...project, title: title.trim() });
    this.emit(projectId, { type: "project.changed" });
  }

  async deleteProject(projectId: string): Promise<void> {
    const user = this.requireUser();
    this.requireProject(projectId);
    if (this.owners.get(projectId) !== user.id) {
      throw new GatewayError("forbidden");
    }
    this.projects.delete(projectId);
    this.owners.delete(projectId);
    this.memberships.delete(projectId);
    for (const [templateId, template] of this.templates) {
      if (template.sourceProjectId === projectId) this.templates.delete(templateId);
    }
    this.emit(projectId, { type: "project.changed" });
  }

  async loadProject(projectId: string): Promise<StoryboardProject> {
    return cloneProject(this.requireProjectMember(projectId));
  }

  async saveProjectMeta(
    projectId: string,
    patch: ProjectMetaPatch,
  ): Promise<void> {
    const project = this.requireProjectMember(projectId);
    this.projects.set(projectId, {
      ...project,
      title: patch.title ?? project.title,
      aspectRatio: patch.aspectRatio ?? project.aspectRatio,
      fields: patch.fields
        ? patch.fields.map((field) => ({ ...field }))
        : project.fields,
    });
    this.emit(projectId, { type: "project.changed" });
  }

  async saveShot(
    projectId: string,
    shot: Shot,
    expectedVersion: number,
  ): Promise<VersionedShot> {
    const project = this.requireProjectMember(projectId);
    if (this.nextConflict?.projectId === projectId) {
      const serverShot = this.nextConflict.shot;
      this.nextConflict = null;
      this.projects.set(projectId, {
        ...project,
        shots: project.shots.map((current) =>
          current.id === serverShot.id
            ? { ...serverShot, values: { ...serverShot.values } }
            : current,
        ),
      });
      this.versions.set(serverShot.id, (this.versions.get(serverShot.id) ?? 1) + 1);
      throw new GatewayError("conflict");
    }
    const version = this.versions.get(shot.id) ?? 1;
    if (version !== expectedVersion) {
      throw new GatewayError("conflict");
    }
    const nextVersion = version + 1;
    const nextShot = { ...shot, values: { ...shot.values } };
    this.projects.set(projectId, {
      ...project,
      shots: project.shots.map((current) =>
        current.id === shot.id ? nextShot : current,
      ),
    });
    this.versions.set(shot.id, nextVersion);
    const saved = { shot: nextShot, version: nextVersion };
    this.emit(projectId, { type: "shot.updated", shot: saved });
    return saved;
  }

  async addShot(projectId: string): Promise<VersionedShot> {
    const project = this.requireProjectMember(projectId);
    const nextProject = addLocalShot(project);
    const shot = nextProject.shots[nextProject.shots.length - 1];
    this.projects.set(projectId, nextProject);
    this.versions.set(shot.id, 1);
    this.emit(projectId, { type: "structure.changed" });
    return { shot: { ...shot, values: { ...shot.values } }, version: 1 };
  }

  async deleteShot(projectId: string, shotId: string): Promise<void> {
    const project = this.requireProjectMember(projectId);
    this.projects.set(projectId, deleteLocalShot(project, shotId));
    this.versions.delete(shotId);
    this.emit(projectId, { type: "shot.deleted", shotId });
  }

  async reorderShots(
    projectId: string,
    orderedShotIds: string[],
  ): Promise<void> {
    let project = this.requireProjectMember(projectId);
    if (
      orderedShotIds.length !== project.shots.length ||
      orderedShotIds.some((id) => !project.shots.some((shot) => shot.id === id))
    ) {
      throw new GatewayError("conflict");
    }
    orderedShotIds.forEach((shotId, index) => {
      project = moveShot(project, shotId, index);
    });
    this.projects.set(projectId, project);
    this.emit(projectId, { type: "structure.changed" });
  }

  async listMembers(projectId: string): Promise<ProjectMember[]> {
    this.requireProjectMember(projectId);
    const memberships = this.memberships.get(projectId) ?? new Map();
    return [...memberships].map(([userId, role]) => ({
      userId,
      role,
      email:
        [...this.users.values()].find((user) => user.id === userId)?.email ?? "",
    }));
  }

  async inviteMember(projectId: string, email: string): Promise<void> {
    this.requireOwner(projectId);
    const user = this.users.get(email.trim().toLowerCase());
    if (!user) {
      throw new GatewayError("user_not_found");
    }
    const memberships = this.memberships.get(projectId)!;
    if (memberships.has(user.id)) {
      throw new GatewayError("already_member");
    }
    memberships.set(user.id, "editor");
    this.emit(projectId, { type: "project.changed" });
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    this.requireOwner(projectId);
    if (this.owners.get(projectId) === userId) {
      throw new GatewayError("forbidden");
    }
    this.memberships.get(projectId)?.delete(userId);
    this.emit(projectId, { type: "project.changed" });
  }

  async uploadImage(input: UploadImageInput): Promise<RemoteImage> {
    this.requireProjectMember(input.projectId);
    return {
      path: `${input.projectId}/${input.shotId}/${input.fieldId}/${input.file.name}`,
      url: URL.createObjectURL(input.file),
      name: input.file.name,
      position: input.position,
    };
  }

  async deleteImage(projectId: string, _path: string): Promise<void> {
    this.requireProjectMember(projectId);
  }

  subscribeProject(
    projectId: string,
    listener: ProjectEventListener,
  ): Unsubscribe {
    this.requireProjectMember(projectId);
    const listeners = this.projectListeners.get(projectId) ?? new Set();
    listeners.add(listener);
    this.projectListeners.set(projectId, listeners);
    return () => listeners.delete(listener);
  }

  async importLocalProject(
    localProject: StoryboardProject,
  ): Promise<ProjectSummary> {
    const summary = await this.createProject(localProject.title);
    this.projects.set(summary.id, cloneProject({ ...localProject, id: summary.id }));
    return this.summaryFor(summary.id);
  }

  emit(projectId: string, event: ProjectEvent): void {
    this.projectListeners.get(projectId)?.forEach((listener) => listener(event));
  }

  failNextSaveWithConflict(projectId: string, serverShot: Shot): void {
    this.nextConflict = {
      projectId,
      shot: { ...serverShot, values: { ...serverShot.values } },
    };
  }

  private setCurrentUser(user: AuthUser): void {
    this.currentUser = { id: user.id, email: user.email };
    this.notifyAuth();
  }

  private notifyAuth(): void {
    const user = this.currentUser ? { ...this.currentUser } : null;
    this.authListeners.forEach((listener) => listener(user));
  }

  private requireUser(): AuthUser {
    if (!this.currentUser) {
      throw new GatewayError("not_authenticated");
    }
    return this.currentUser;
  }

  private requireProject(projectId: string): StoryboardProject {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new GatewayError("not_found");
    }
    return project;
  }

  private requireProjectMember(projectId: string): StoryboardProject {
    const user = this.requireUser();
    const project = this.requireProject(projectId);
    if (!this.memberships.get(projectId)?.has(user.id)) {
      throw new GatewayError("forbidden");
    }
    return project;
  }

  private requireOwner(projectId: string): void {
    const user = this.requireUser();
    this.requireProject(projectId);
    if (this.owners.get(projectId) !== user.id) {
      throw new GatewayError("forbidden");
    }
  }

  private requireTemplate(templateId: string): StoryboardTemplate {
    const template = this.templates.get(templateId);
    if (!template) throw new GatewayError("not_found");
    return template;
  }

  private summaryFor(projectId: string): ProjectSummary {
    const project = this.requireProject(projectId);
    const ownerId = this.owners.get(projectId)!;
    const user = this.requireUser();
    return {
      id: project.id,
      title: project.title,
      ownerId,
      ownerEmail:
        [...this.users.values()].find((candidate) => candidate.id === ownerId)
          ?.email ?? "",
      role: this.memberships.get(projectId)?.get(user.id) ?? "editor",
      memberCount: this.memberships.get(projectId)?.size ?? 0,
      updatedAt: new Date(0).toISOString(),
    };
  }
}
