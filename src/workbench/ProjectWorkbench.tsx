import { useCallback, useEffect, useRef, useState } from "react";
import { FieldSettings } from "../components/FieldSettings";
import { ProjectHeader } from "../components/ProjectHeader";
import {
  StoryboardTable,
  type StoryboardImageActions,
} from "../components/StoryboardTable";
import type { StoryboardGateway } from "../data/gateway";
import type { AuthUser, RemoteImage, SaveState } from "../domain/models";
import type { ProjectRole } from "../domain/models";
import { MemberManager } from "../projects/MemberManager";
import type {
  ProjectUpdate,
  StoryboardProject,
} from "../domain/storyboard";

type ProjectWorkbenchProps = {
  gateway: StoryboardGateway;
  projectId: string;
  user: AuthUser;
  onBack: () => void;
};

function fieldSignature(project: StoryboardProject): string {
  return JSON.stringify(project.fields);
}

export function ProjectWorkbench({
  gateway,
  projectId,
  user,
  onBack,
}: ProjectWorkbenchProps) {
  const [project, setProject] = useState<StoryboardProject | null>(null);
  const [showFieldSettings, setShowFieldSettings] = useState(false);
  const [showMemberManager, setShowMemberManager] = useState(false);
  const [role, setRole] = useState<ProjectRole>("editor");
  const [saveStatus, setSaveStatus] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const versions = useRef(new Map<string, number>());

  const reload = useCallback(async () => {
    try {
      const [loaded, summaries] = await Promise.all([
        gateway.loadProject(projectId),
        gateway.listProjects(),
      ]);
      setProject(loaded);
      setRole(
        summaries.find((summary) => summary.id === projectId)?.role ?? "editor",
      );
      loaded.shots.forEach((shot) => {
        if (!versions.current.has(shot.id)) {
          versions.current.set(shot.id, 1);
        }
      });
      setError("");
    } catch {
      setError("项目加载失败或你已失去访问权限");
    }
  }, [gateway, projectId]);

  useEffect(() => {
    void reload();
    const unsubscribe = gateway.subscribeProject(projectId, () => void reload());
    return unsubscribe;
  }, [gateway, projectId, reload]);

  async function persistChange(
    previous: StoryboardProject,
    next: StoryboardProject,
  ) {
    setSaveStatus("saving");
    try {
      if (
        previous.title !== next.title ||
        fieldSignature(previous) !== fieldSignature(next)
      ) {
        await gateway.saveProjectMeta(projectId, {
          title: next.title,
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

  function updateProject(update: ProjectUpdate) {
    setProject((current) => {
      if (!current) return current;
      const next = typeof update === "function" ? update(current) : update;
      void persistChange(current, next);
      return next;
    });
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
      }));
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
      }));
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
    <main className="workbench-shell">
      <ProjectHeader
        title={project.title}
        saveStatus={saveStatus}
        onTitleChange={(title) =>
          updateProject((current) => ({ ...current, title }))
        }
      />
      <div className="workbench-actions workbench-actions--spread">
        <button className="button-secondary" type="button" onClick={onBack}>
          返回项目
        </button>
        <span>{user.email}</span>
        {role === "owner" ? (
          <button type="button" onClick={() => setShowMemberManager(true)}>
            成员管理
          </button>
        ) : null}
        <button type="button" onClick={() => setShowFieldSettings(true)}>
          字段设置
        </button>
      </div>
      <StoryboardTable
        imageActions={imageActions}
        project={project}
        onChange={updateProject}
      />
      {showFieldSettings ? (
        <FieldSettings
          project={project}
          onChange={updateProject}
          onClose={() => setShowFieldSettings(false)}
        />
      ) : null}
      {showMemberManager ? (
        <MemberManager
          gateway={gateway}
          projectId={projectId}
          onClose={() => setShowMemberManager(false)}
        />
      ) : null}
    </main>
  );
}
