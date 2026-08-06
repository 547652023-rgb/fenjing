import { useCallback, useEffect, useRef, useState } from "react";
import { FieldSettings } from "../components/FieldSettings";
import { ProjectHeader } from "../components/ProjectHeader";
import {
  StoryboardTable,
  type ShotCreationOptions,
  type StoryboardImageActions,
} from "../components/StoryboardTable";
import type { StoryboardGateway } from "../data/gateway";
import type { AuthUser, RemoteImage, SaveState } from "../domain/models";
import type { ProjectRole } from "../domain/models";
import { ExportActions } from "../export/ExportActions";
import { MemberManager } from "../projects/MemberManager";
import { ProjectSettings } from "./ProjectSettings";
import type {
  ProjectUpdate,
  Shot,
  StoryboardProject,
} from "../domain/storyboard";
import { ensureProductionStatusField, updateShotValue } from "../domain/storyboard";
import {
  createNamedStoryboardView,
  normalizeColumnPresentation,
  type ColumnPresentation,
} from "../domain/storyboardViews";
import type { ProjectEvent } from "../domain/models";
import { useProjectRealtime } from "./useProjectRealtime";
import { SaveTemplateDialog } from "./SaveTemplateDialog";
import type { TemplateSnapshot } from "../domain/models";

type ProjectWorkbenchProps = {
  gateway: StoryboardGateway;
  projectId: string;
  user: AuthUser;
  onBack: () => void;
};

function fieldSignature(project: StoryboardProject): string {
  return JSON.stringify(project.fields);
}

function personalViewKey(userId: string, projectId: string): string {
  return `fenjing.storyboard-view.v1:${userId}:${projectId}`;
}

function readPersonalView(userId: string, projectId: string): ColumnPresentation[] | null {
  try {
    const stored = localStorage.getItem(personalViewKey(userId, projectId));
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    return Array.isArray(parsed) ? parsed as ColumnPresentation[] : null;
  } catch {
    return null;
  }
}

function copiedShotValues(shot: Shot, imageFieldIds: Set<string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(shot.values).filter(
      ([fieldId]) => fieldId !== "shotNumber" && !imageFieldIds.has(fieldId),
    ),
  );
}

export function ProjectWorkbench({
  gateway,
  projectId,
  user,
  onBack,
}: ProjectWorkbenchProps) {
  const [project, setProject] = useState<StoryboardProject | null>(null);
  const [showFieldSettings, setShowFieldSettings] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showMemberManager, setShowMemberManager] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateMessage, setTemplateMessage] = useState("");
  const [role, setRole] = useState<ProjectRole>("editor");
  const [saveStatus, setSaveStatus] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [columnPresentation, setColumnPresentation] = useState<ColumnPresentation[] | null>(null);
  const versions = useRef(new Map<string, number>());
  const serverProject = useRef<StoryboardProject | null>(null);
  const projectRef = useRef<StoryboardProject | null>(null);
  const dirtyFields = useRef(new Set<string>());
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const reload = useCallback(async () => {
    try {
      const [loaded, summaries] = await Promise.all([
        gateway.loadProject(projectId),
        gateway.listProjects(),
      ]);
      const normalized = ensureProductionStatusField(loaded);
      if (normalized !== loaded) {
        await gateway.saveProjectMeta(projectId, { fields: normalized.fields });
      }
      setProject(normalized);
      projectRef.current = normalized;
      serverProject.current = normalized;
      setRole(
        summaries.find((summary) => summary.id === projectId)?.role ?? "editor",
      );
      const projectDefaultView = await gateway.getProjectDefaultView(projectId).catch(() => null);
      const personalView = readPersonalView(user.id, projectId);
      setColumnPresentation(normalizeColumnPresentation(
        normalized.fields,
        personalView ?? projectDefaultView ?? createNamedStoryboardView("director", normalized.fields).columns,
      ));
      normalized.shots.forEach((shot) => {
        versions.current.set(shot.id, shot.version ?? 1);
      });
      setError("");
    } catch {
      setError("项目加载失败或你已失去访问权限");
    }
  }, [gateway, projectId, user.id]);

  function handleColumnPresentationChange(nextPresentation: ColumnPresentation[]) {
    setColumnPresentation(nextPresentation);
    localStorage.setItem(personalViewKey(user.id, projectId), JSON.stringify(nextPresentation));
  }

  async function handleSetProjectDefaultView(nextPresentation: ColumnPresentation[]) {
    await gateway.setProjectDefaultView(projectId, nextPresentation);
  }

  useEffect(() => {
    void reload();
    return () => {
      saveTimers.current.forEach(clearTimeout);
      saveTimers.current.clear();
    };
  }, [reload]);

  function replaceServerShot(server: StoryboardProject, shot: Shot) {
    return {
      ...server,
      shots: server.shots.map((candidate) =>
        candidate.id === shot.id ? shot : candidate,
      ),
    };
  }

  function handleProjectEvent(event: ProjectEvent) {
    if (event.type === "project.changed" || event.type === "structure.changed") {
      void reload();
      return;
    }
    if (event.type === "shot.deleted") {
      setProject((current) => {
        if (!current) return current;
        const next = {
          ...current,
          shots: current.shots.filter((shot) => shot.id !== event.shotId),
        };
        projectRef.current = next;
        return next;
      });
      if (serverProject.current) {
        serverProject.current = {
          ...serverProject.current,
          shots: serverProject.current.shots.filter(
            (shot) => shot.id !== event.shotId,
          ),
        };
      }
      return;
    }

    versions.current.set(event.shot.shot.id, event.shot.version);
    const previousServerShot = serverProject.current?.shots.find(
      (shot) => shot.id === event.shot.shot.id,
    );
    setProject((current) => {
      if (!current) return current;
      const next = {
        ...current,
        shots: current.shots.map((shot) => {
          if (shot.id !== event.shot.shot.id) return shot;
          const values = { ...event.shot.shot.values };
          if (previousServerShot) {
            Object.keys(shot.values).forEach((fieldId) => {
              if (dirtyFields.current.has(`${shot.id}:${fieldId}`)) {
                values[fieldId] = shot.values[fieldId];
              }
            });
          }
          return { ...event.shot.shot, values };
        }),
      };
      projectRef.current = next;
      return next;
    });
    if (serverProject.current) {
      serverProject.current = replaceServerShot(
        serverProject.current,
        event.shot.shot,
      );
    }
  }

  useProjectRealtime({ gateway, projectId, onEvent: handleProjectEvent });

  async function persistChange(
    previous: StoryboardProject,
    next: StoryboardProject,
  ) {
    setSaveStatus("saving");
    try {
      if (
        previous.title !== next.title ||
        previous.aspectRatio !== next.aspectRatio ||
        fieldSignature(previous) !== fieldSignature(next)
      ) {
        await gateway.saveProjectMeta(projectId, {
          title: next.title,
          aspectRatio: next.aspectRatio,
          fields: next.fields,
        });
      }

      const previousIds = previous.shots.map(({ id }) => id);
      const nextIds = next.shots.map(({ id }) => id);
      const added = nextIds.filter((id) => !previousIds.includes(id));
      const removed = previousIds.filter((id) => !nextIds.includes(id));
      if (added.length > 0) {
        await gateway.addShot(projectId);
      } else if (removed.length > 0) {
        for (const shotId of removed) {
          await gateway.deleteShot(projectId, shotId);
        }
      } else if (previousIds.join("|") !== nextIds.join("|")) {
        await gateway.reorderShots(projectId, nextIds);
      } else {
        for (const nextShot of next.shots) {
          const previousShot = previous.shots.find(({ id }) => id === nextShot.id);
          if (
            previousShot &&
            JSON.stringify(previousShot.values) !== JSON.stringify(nextShot.values)
          ) {
            const saved = await gateway.saveShot(
              projectId,
              nextShot,
              versions.current.get(nextShot.id) ?? 1,
            );
            versions.current.set(nextShot.id, saved.version);
            if (serverProject.current) {
              serverProject.current = replaceServerShot(
                serverProject.current,
                saved.shot,
              );
            }
            Object.keys(nextShot.values).forEach((fieldId) => {
              const key = `${nextShot.id}:${fieldId}`;
              if (
                projectRef.current?.shots.find((shot) => shot.id === nextShot.id)
                  ?.values[fieldId] === nextShot.values[fieldId]
              ) {
                dirtyFields.current.delete(key);
              }
            });
          }
        }
      }
      setSaveStatus("saved");
    } catch (caughtError) {
      const code =
        caughtError && typeof caughtError === "object" && "code" in caughtError
          ? caughtError.code
          : "error";
      setSaveStatus(code === "conflict" ? "conflict" : "error");
      await reload();
    }
  }

  function updateProject(update: ProjectUpdate, immediate = false) {
    setProject((current) => {
      if (!current) return current;
      const next = typeof update === "function" ? update(current) : update;
      projectRef.current = next;
      const changedShots = next.shots.filter((nextShot) => {
        const previousShot = current.shots.find((shot) => shot.id === nextShot.id);
        return previousShot &&
          JSON.stringify(previousShot.values) !== JSON.stringify(nextShot.values);
      });
      changedShots.forEach((nextShot) => {
        const previousShot = current.shots.find((shot) => shot.id === nextShot.id)!;
        Object.keys(nextShot.values).forEach((fieldId) => {
          if (previousShot.values[fieldId] !== nextShot.values[fieldId]) {
            dirtyFields.current.add(`${nextShot.id}:${fieldId}`);
          }
        });
      });
      const onlyCellValuesChanged =
        changedShots.length > 0 &&
        current.title === next.title &&
        fieldSignature(current) === fieldSignature(next) &&
        current.shots.map(({ id }) => id).join("|") ===
          next.shots.map(({ id }) => id).join("|");
      if (onlyCellValuesChanged && !immediate) {
        changedShots.forEach((changedShot) => {
          const currentTimer = saveTimers.current.get(changedShot.id);
          if (currentTimer) clearTimeout(currentTimer);
          const timer = setTimeout(() => {
            saveTimers.current.delete(changedShot.id);
            const latest = projectRef.current;
            const server = serverProject.current;
            if (latest && server) void persistChange(server, latest);
          }, 400);
          saveTimers.current.set(changedShot.id, timer);
        });
      } else {
        void persistChange(current, next);
      }
      return next;
    });
  }

  async function copySelectedShots(shotIds: string[]) {
    const current = projectRef.current;
    if (!current) return;
    const selected = new Set(shotIds);
    const sourceShots = current.shots.filter((shot) => selected.has(shot.id));
    if (sourceShots.length === 0) return;

    setSaveStatus("saving");
    try {
      const imageFieldIds = new Set(
        current.fields
          .filter((field) => field.type === "image")
          .map((field) => field.id),
      );
      const copyIds: string[] = [];
      for (const sourceShot of sourceShots) {
        const added = await gateway.addShot(projectId);
        const saved = await gateway.saveShot(
          projectId,
          { ...added.shot, values: copiedShotValues(sourceShot, imageFieldIds) },
          added.version,
        );
        versions.current.set(saved.shot.id, saved.version);
        copyIds.push(saved.shot.id);
      }
      const lastSelectedIndex = current.shots.reduce(
        (lastIndex, shot, index) => (selected.has(shot.id) ? index : lastIndex),
        -1,
      );
      const order = [
        ...current.shots.slice(0, lastSelectedIndex + 1).map((shot) => shot.id),
        ...copyIds,
        ...current.shots.slice(lastSelectedIndex + 1).map((shot) => shot.id),
      ];
      await gateway.reorderShots(projectId, order);
      await reload();
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
      await reload();
    }
  }

  async function createShots(options: ShotCreationOptions): Promise<string[]> {
    const current = projectRef.current;
    if (!current || options.count < 1) return [];
    const sourceShotId = options.copyShotId ?? options.afterShotId;
    const sourceShot = sourceShotId
      ? current.shots.find((shot) => shot.id === sourceShotId)
      : undefined;
    if (sourceShotId && !sourceShot) return [];
    if (
      options.beforeShotId &&
      !current.shots.some((shot) => shot.id === options.beforeShotId)
    ) return [];

    setSaveStatus("saving");
    try {
      const imageFieldIds = new Set(
        current.fields
          .filter((field) => field.type === "image")
          .map((field) => field.id),
      );
      const createdShotIds: string[] = [];
      for (let index = 0; index < options.count; index += 1) {
        const added = await gateway.addShot(projectId);
        if (sourceShot && options.copyShotId) {
          const saved = await gateway.saveShot(
            projectId,
            { ...added.shot, values: copiedShotValues(sourceShot, imageFieldIds) },
            added.version,
          );
          versions.current.set(saved.shot.id, saved.version);
          createdShotIds.push(saved.shot.id);
        } else {
          versions.current.set(added.shot.id, added.version);
          createdShotIds.push(added.shot.id);
        }
      }
      const insertionIndex = options.beforeShotId
        ? current.shots.findIndex((shot) => shot.id === options.beforeShotId)
        : sourceShotId
          ? current.shots.findIndex((shot) => shot.id === sourceShotId) + 1
          : current.shots.length;
      const order = [
        ...current.shots.slice(0, insertionIndex).map((shot) => shot.id),
        ...createdShotIds,
        ...current.shots.slice(insertionIndex).map((shot) => shot.id),
      ];
      await gateway.reorderShots(projectId, order);
      await reload();
      setSaveStatus("saved");
      return createdShotIds;
    } catch {
      setSaveStatus("error");
      await reload();
      return [];
    }
  }

  async function deleteSelectedShots(shotIds: string[]) {
    if (shotIds.length === 0) return;
    setSaveStatus("saving");
    try {
      for (const shotId of shotIds) {
        await gateway.deleteShot(projectId, shotId);
      }
      await reload();
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
      await reload();
    }
  }

  async function createScene() {
    setSaveStatus("saving");
    try {
      await gateway.createScene(projectId, { name: "未命名场次" });
      await reload();
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }

  async function updateScene(scene: StoryboardProject["scenes"][number]) {
    setSaveStatus("saving");
    try {
      await gateway.updateScene(projectId, scene);
      await reload();
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
      await reload();
    }
  }

  async function assignShotsToScene(shotIds: string[], sceneId: string | null) {
    const current = projectRef.current;
    if (!current || shotIds.length === 0) return;
    const selected = new Set(shotIds);
    setSaveStatus("saving");
    try {
      for (const shot of current.shots.filter((candidate) => selected.has(candidate.id))) {
        const saved = await gateway.saveShot(
          projectId,
          { ...shot, sceneId: sceneId ?? undefined },
          versions.current.get(shot.id) ?? 1,
        );
        versions.current.set(shot.id, saved.version);
      }
      await reload();
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
      await reload();
    }
  }

  async function deleteScene(
    sceneId: string,
    treatment: "ungroup" | "delete-shots",
  ) {
    const current = projectRef.current;
    if (!current) return;
    setSaveStatus("saving");
    try {
      if (treatment === "delete-shots") {
        for (const shot of current.shots.filter((candidate) => candidate.sceneId === sceneId)) {
          await gateway.deleteShot(projectId, shot.id);
        }
      }
      await gateway.deleteScene(projectId, sceneId);
      await reload();
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
      await reload();
    }
  }

  function updateSelectedShots(shotIds: string[], fieldId: string, value: string) {
    updateProject(
      (current) =>
        shotIds.reduce(
          (nextProject, shotId) => updateShotValue(nextProject, shotId, fieldId, value),
          current,
        ),
      true,
    );
  }

  async function saveTemplate(name: string, snapshot: TemplateSnapshot) {
    setTemplateMessage("");
    await gateway.createTemplate(projectId, name, snapshot);
    setShowSaveTemplate(false);
    setTemplateMessage(`模板“${name}”已保存`);
  }

  const imageActions: StoryboardImageActions = {
    async upload(shotId, fieldId, currentImages, files) {
      const remaining = Math.max(
        0,
        (fieldId === "frame" ? 5 : 1) - currentImages.length,
      );
      const accepted = files.slice(0, remaining);
      const uploaded: RemoteImage[] = [];
      for (const [index, file] of accepted.entries()) {
        uploaded.push(
          await gateway.uploadImage({
            projectId,
            shotId,
            fieldId,
            file,
            position: currentImages.length + index,
          }),
        );
      }
      const nextImages = [...currentImages, ...uploaded];
      updateProject((current) => ({
        ...current,
        shots: current.shots.map((shot) =>
          shot.id === shotId
            ? {
                ...shot,
                values: {
                  ...shot.values,
                  [fieldId]: JSON.stringify(nextImages),
                },
              }
            : shot,
        ),
      }), true);
      return uploaded;
    },
    async remove(shotId, fieldId, currentImages, image) {
      await gateway.deleteImage(projectId, image.path);
      const nextImages = currentImages
        .filter((candidate) => candidate.path !== image.path)
        .map((candidate, position) => ({ ...candidate, position }));
      updateProject((current) => ({
        ...current,
        shots: current.shots.map((shot) =>
          shot.id === shotId
            ? {
                ...shot,
                values: {
                  ...shot.values,
                  [fieldId]: nextImages.length === 0 ? "" : JSON.stringify(nextImages),
                },
              }
            : shot,
        ),
      }), true);
    },
  };

  if (error) {
    return (
      <main className="centered-state">
        <section>
          <p role="alert">{error}</p>
          <button type="button" onClick={onBack}>返回项目</button>
        </section>
      </main>
    );
  }
  if (!project) {
    return <main className="centered-state" role="status">正在加载项目…</main>;
  }

  return (
    <main className="workbench-shell studio-shell">
      <ProjectHeader
        title={project.title}
        saveStatus={saveStatus}
        onTitleChange={(title) =>
          updateProject((current) => ({ ...current, title }))
        }
      />
      <div className="workbench-actions">
        <div className="workbench-actions__group">
          <button className="button-secondary" type="button" onClick={onBack}>返回项目</button>
          <span className="workbench-actions__account">{user.email}</span>
        </div>
        <div className="workbench-actions__group">
          {role === "owner" ? <button type="button" onClick={() => setShowMemberManager(true)}>成员管理</button> : null}
          <button type="button" onClick={() => setShowFieldSettings(true)}>字段设置</button>
          <button type="button" onClick={() => setShowProjectSettings(true)}>项目设置</button>
          <button type="button" onClick={() => { setTemplateMessage(""); setShowSaveTemplate(true); }}>保存为模板</button>
        </div>
        <div className="workbench-actions__group workbench-actions__group--delivery"><ExportActions project={project} /></div>
      </div>
      {templateMessage ? (
        <p
          aria-label="模板保存状态"
          className="save-status"
          role="status"
        >
          {templateMessage}
        </p>
      ) : null}
      <StoryboardTable
        imageActions={imageActions}
        onBatchCopy={copySelectedShots}
        onBatchDelete={deleteSelectedShots}
        onBatchUpdate={updateSelectedShots}
        onAssignShotsToScene={assignShotsToScene}
        onCreateScene={createScene}
        onCreateShots={createShots}
        onDeleteScene={deleteScene}
        onUpdateScene={updateScene}
        project={project}
        onChange={updateProject}
        columnPresentation={columnPresentation ?? undefined}
        onColumnPresentationChange={handleColumnPresentationChange}
        canSetProjectDefaultView={role === "owner"}
        onSetProjectDefaultView={handleSetProjectDefaultView}
      />
      {showFieldSettings ? (
        <FieldSettings
          project={project}
          onChange={updateProject}
          onClose={() => setShowFieldSettings(false)}
        />
      ) : null}
      {showProjectSettings ? (
        <ProjectSettings
          project={project}
          onChange={updateProject}
          onClose={() => setShowProjectSettings(false)}
        />
      ) : null}
      {showMemberManager ? (
        <MemberManager
          gateway={gateway}
          projectId={projectId}
          onClose={() => setShowMemberManager(false)}
        />
      ) : null}
      {showSaveTemplate ? (
        <SaveTemplateDialog
          project={project}
          onClose={() => setShowSaveTemplate(false)}
          onSave={saveTemplate}
        />
      ) : null}
    </main>
  );
}
