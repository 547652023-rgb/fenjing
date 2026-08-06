import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type { StoryboardGateway } from "../data/gateway";
import type {
  AuthUser,
  ProjectFolder,
  ProjectHomeSettings,
  ProjectSummary,
  StoryboardTemplate,
} from "../domain/models";
import { projectToTemplateSnapshot } from "../domain/templates";
import { LocalImportPrompt } from "../migration/LocalImportPrompt";
import {
  ProjectHomeSidebar,
  type ProjectHomeScope,
} from "./ProjectHomeSidebar";
import { TemplateLibrary } from "./TemplateLibrary";
import { TemplatePicker, type TemplateSelection } from "./TemplatePicker";
import { SupervisorDashboard } from "./SupervisorDashboard";

type ProjectDashboardProps = {
  gateway: StoryboardGateway;
  user: AuthUser;
  onOpenProject: (projectId: string) => void;
  onSignOut: () => void;
};

type ProjectCardProps = {
  project: ProjectSummary;
  folders: ProjectFolder[];
  folderId: string | undefined;
  onOpen: () => void;
  onRename: () => void;
  onMoveToTrash: () => void;
  onRestore: () => void;
  onRequestPermanentDelete: () => void;
  onAssignFolder: (folderId: string | null) => void;
  onSetIcon: (icon: string | null) => void;
};

const emojiPattern = /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)/u;

function firstEmoji(value: string): string {
  return value.match(emojiPattern)?.[0] ?? "";
}

function ProjectIconEditor({
  project,
  onSetIcon,
}: Pick<ProjectCardProps, "project" | "onSetIcon">) {
  const [value, setValue] = useState(project.icon ?? "");

  useEffect(() => {
    setValue(project.icon ?? "");
  }, [project.icon]);

  return (
    <label className="project-card__icon-editor">
      <span className="sr-only">设置{project.title}图标</span>
      <input
        aria-label={`设置${project.title}图标`}
        inputMode="text"
        placeholder="🎬"
        value={value}
        onBlur={() => {
          const normalized = firstEmoji(value);
          const icon = normalized || null;
          setValue(normalized);
          if (icon !== project.icon) onSetIcon(icon);
        }}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
}

function ProjectCard({
  project,
  folders,
  folderId,
  onOpen,
  onRename,
  onMoveToTrash,
  onRestore,
  onRequestPermanentDelete,
  onAssignFolder,
  onSetIcon,
}: ProjectCardProps) {
  const titleId = `project-card-title-${project.id}`;
  const isOwner = project.role === "owner";
  const isTrashed = project.deletedAt !== null;
  const permanentDeletePending = project.permanentDeleteRequestedAt !== null;

  return (
    <article
      aria-labelledby={titleId}
      className={`project-card${isTrashed ? " project-card--trashed" : ""}`}
    >
      <div className="project-card__topline">
        {isOwner && !isTrashed ? (
          <ProjectIconEditor project={project} onSetIcon={onSetIcon} />
        ) : (
          <span className="project-card__icon" aria-hidden="true">
            {project.icon ?? "🎬"}
          </span>
        )}
        <p className="project-card__role">
          {isOwner ? "所有者" : `协作者 · ${project.ownerEmail}`}
        </p>
      </div>

      <h3 id={titleId}>{project.title}</h3>

      <dl className="project-card__metadata">
        <div>
          <dt>画幅</dt>
          <dd>{project.aspectRatio}</dd>
        </div>
        <div>
          <dt>镜头</dt>
          <dd>{project.shotCount} 个镜头</dd>
        </div>
        <div>
          <dt>更新</dt>
          <dd>{new Date(project.updatedAt).toLocaleDateString("zh-CN")}</dd>
        </div>
      </dl>

      {!isTrashed ? (
        <label className="project-card__folder-select">
          <span>个人文件夹</span>
          <select
            aria-label={`将${project.title}移到文件夹`}
            value={folderId ?? ""}
            onChange={(event) => onAssignFolder(event.target.value || null)}
          >
            <option value="">未分组</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      {!isTrashed ? (
        <div className="project-card__actions">
          <button aria-label={`进入${project.title}`} type="button" onClick={onOpen}>
            进入项目
          </button>
          {isOwner ? (
            <>
              <button
                aria-label={`重命名${project.title}`}
                className="button-secondary"
                type="button"
                onClick={onRename}
              >
                重命名
              </button>
              <button
                aria-label={`移入回收站${project.title}`}
                className="button-danger"
                type="button"
                onClick={onMoveToTrash}
              >
                移入回收站
              </button>
            </>
          ) : null}
        </div>
      ) : (
        <>
          <p
            className={`project-card__trashed-note${
              permanentDeletePending ? " project-card__trashed-note--pending" : ""
            }`}
          >
            {permanentDeletePending
              ? "彻底删除请求处理中，期间无法恢复"
              : "项目将在回收站保留 30 天，之后由系统自动彻底删除"}
          </p>
          {isOwner && !permanentDeletePending ? (
            <div className="project-card__actions">
              <button
                aria-label={`恢复${project.title}`}
                type="button"
                onClick={onRestore}
              >
                恢复项目
              </button>
              <button
                aria-label={`彻底删除${project.title}`}
                className="button-danger"
                type="button"
                onClick={onRequestPermanentDelete}
              >
                彻底删除
              </button>
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}

export function ProjectDashboard({
  gateway,
  user,
  onOpenProject,
  onSignOut,
}: ProjectDashboardProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [templates, setTemplates] = useState<StoryboardTemplate[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<ProjectHomeSettings["sortBy"]>("updated");
  const [active, setActive] = useState<ProjectHomeScope>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateSelection>("blank");
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [showSupervisor, setShowSupervisor] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextProjects, nextTemplates, nextFolders, nextAssignments, settings] =
        await Promise.all([
          gateway.listProjects(),
          gateway.listTemplates(),
          gateway.listFolders(),
          gateway.listProjectFolderAssignments(),
          gateway.listHomeSettings(),
        ]);
      setProjects(nextProjects);
      setTemplates(nextTemplates);
      setFolders(nextFolders);
      setAssignments(nextAssignments);
      setSortBy(settings.sortBy);
      setError("");
    } catch {
      setError("项目或模板加载失败，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  }, [gateway]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void gateway.isSupervisor().then(setIsSupervisor).catch(() => setIsSupervisor(false));
  }, [gateway]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTitle.trim() || "项目";
    const template = templates.find(({ id }) => id === selectedTemplate);
    if (selectedTemplate !== "blank" && !template) {
      setError("所选模板不可用，请重新选择");
      return;
    }
    try {
      if (template) {
        await gateway.createProject(title, template.snapshot);
      } else {
        await gateway.createProject(title);
      }
      setNewTitle("");
      setSelectedTemplate("blank");
      setShowCreate(false);
      await refresh();
    } catch {
      setError("项目创建失败，请稍后重试");
    }
  }

  async function saveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renaming || !renameTitle.trim()) {
      setError("请输入项目名称");
      return;
    }
    try {
      await gateway.renameProject(renaming.id, renameTitle);
      setRenaming(null);
      await refresh();
    } catch {
      setError("项目重命名失败，请稍后重试");
    }
  }

  async function moveToTrash(project: ProjectSummary) {
    try {
      await gateway.moveProjectToTrash(project.id);
      await refresh();
    } catch {
      setError("项目移入回收站失败，请稍后重试");
    }
  }

  async function restore(project: ProjectSummary) {
    try {
      await gateway.restoreProject(project.id);
      await refresh();
    } catch {
      setError("项目恢复失败，请稍后重试");
    }
  }

  async function requestPermanentDelete(project: ProjectSummary) {
    if (
      !window.confirm(
        `确定申请彻底删除项目“${project.title}”吗？请求提交后将由系统安全处理，期间无法恢复。`,
      )
    ) {
      return;
    }
    try {
      await gateway.permanentlyDeleteProject(project.id);
      await refresh();
    } catch {
      setError("彻底删除请求提交失败，请稍后重试");
    }
  }

  async function createFolder(name: string) {
    try {
      const folder = await gateway.createFolder(name);
      setFolders((current) => [...current, folder]);
      setActive(folder.id);
      setError("");
    } catch (caught) {
      setError("文件夹创建失败，请检查名称是否重复");
      throw caught;
    }
  }

  async function renameFolder(folderId: string, name: string) {
    try {
      await gateway.renameFolder(folderId, name);
      setFolders((current) =>
        current.map((folder) =>
          folder.id === folderId ? { ...folder, name } : folder,
        ),
      );
      setError("");
    } catch (caught) {
      setError("文件夹重命名失败，请检查名称是否重复");
      throw caught;
    }
  }

  async function deleteFolder(folderId: string) {
    try {
      await gateway.deleteFolder(folderId);
      setFolders((current) => current.filter((folder) => folder.id !== folderId));
      setAssignments((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([, assigned]) => assigned !== folderId),
        ),
      );
      if (active === folderId) setActive("ungrouped");
      setError("");
    } catch {
      setError("文件夹删除失败，请稍后重试");
    }
  }

  async function assignFolder(projectId: string, folderId: string | null) {
    try {
      await gateway.setProjectFolder(projectId, folderId);
      setAssignments((current) => {
        const next = { ...current };
        if (folderId) next[projectId] = folderId;
        else delete next[projectId];
        return next;
      });
      setError("");
    } catch {
      setError("项目归类失败，请稍后重试");
    }
  }

  async function setIcon(projectId: string, icon: string | null) {
    try {
      await gateway.setProjectIcon(projectId, icon);
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, icon } : project,
        ),
      );
      setError("");
    } catch {
      setError("项目图标保存失败，请稍后重试");
    }
  }

  async function changeSort(event: ChangeEvent<HTMLSelectElement>) {
    const nextSort = event.target.value as ProjectHomeSettings["sortBy"];
    const previous = sortBy;
    setSortBy(nextSort);
    try {
      await gateway.saveHomeSettings({ sortBy: nextSort });
      setError("");
    } catch {
      setSortBy(previous);
      setError("排序设置保存失败，请稍后重试");
    }
  }

  async function createTemplate(sourceProjectId: string, name: string) {
    const sourceProject = await gateway.loadProject(sourceProjectId);
    await gateway.createTemplate(
      sourceProjectId,
      name,
      projectToTemplateSnapshot(sourceProject),
    );
    setTemplates(await gateway.listTemplates());
  }

  async function updateTemplate(templateId: string, name: string) {
    const template = templates.find(({ id }) => id === templateId);
    if (!template || template.builtIn || !template.sourceProjectId) {
      throw new Error("template_not_editable");
    }
    const sourceProject = await gateway.loadProject(template.sourceProjectId);
    await gateway.updateTemplate(
      templateId,
      name,
      projectToTemplateSnapshot(sourceProject),
    );
    setTemplates(await gateway.listTemplates());
  }

  async function deleteTemplate(templateId: string) {
    const template = templates.find(({ id }) => id === templateId);
    if (!template || template.builtIn) {
      throw new Error("template_not_editable");
    }
    await gateway.deleteTemplate(templateId);
    setTemplates(await gateway.listTemplates());
    if (selectedTemplate === templateId) setSelectedTemplate("blank");
  }

  const visibleProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("zh-CN");
    return projects
      .filter((project) => {
        if (active === "trash") return project.deletedAt !== null;
        if (project.deletedAt !== null) return false;
        if (active === "all") return true;
        if (active === "ungrouped") return !assignments[project.id];
        return assignments[project.id] === active;
      })
      .filter((project) =>
        project.title.toLocaleLowerCase("zh-CN").includes(normalizedSearch),
      )
      .sort((left, right) => {
        if (sortBy === "name") return left.title.localeCompare(right.title, "zh-CN");
        const key = sortBy === "created" ? "createdAt" : "updatedAt";
        return new Date(right[key]).getTime() - new Date(left[key]).getTime();
      });
  }, [active, assignments, projects, search, sortBy]);

  const owned = visibleProjects.filter((project) => project.role === "owner");
  const invited = visibleProjects.filter((project) => project.role === "editor");
  const activeFolder = folders.find((folder) => folder.id === active);
  const scopeTitle =
    active === "all"
      ? "全部项目"
      : active === "ungrouped"
        ? "未分组"
        : active === "trash"
          ? "回收站"
          : activeFolder?.name ?? "我的文件夹";

  function cards(items: ProjectSummary[]) {
    return items.map((project) => (
      <ProjectCard
        folderId={assignments[project.id]}
        folders={folders}
        key={project.id}
        project={project}
        onAssignFolder={(folderId) => void assignFolder(project.id, folderId)}
        onMoveToTrash={() => void moveToTrash(project)}
        onOpen={() => onOpenProject(project.id)}
        onRename={() => {
          setRenaming(project);
          setRenameTitle(project.title);
        }}
        onRequestPermanentDelete={() => void requestPermanentDelete(project)}
        onRestore={() => void restore(project)}
        onSetIcon={(icon) => void setIcon(project.id, icon)}
      />
    ));
  }

  if (showSupervisor) {
    return <SupervisorDashboard gateway={gateway} user={user} onBack={() => setShowSupervisor(false)} />;
  }

  return (
    <main className="dashboard-shell studio-shell">
      <header className="dashboard-header">
        <div>
          <h1>我的项目</h1>
          <p>从项目档案到最终分镜，一切都在场。</p>
        </div>
        <div className="dashboard-account">
          <span>{user.email}</span>
          {isSupervisor ? (
            <button className="button-secondary" type="button" onClick={() => setShowSupervisor(true)}>主管后台</button>
          ) : null}
          <button type="button" onClick={onSignOut}>退出登录</button>
        </div>
      </header>

      <LocalImportPrompt gateway={gateway} onImported={() => void refresh()} user={user} />

      <div className="project-home-layout">
        <ProjectHomeSidebar
          active={active}
          folders={folders}
          onCreateFolder={createFolder}
          onDeleteFolder={deleteFolder}
          onRenameFolder={renameFolder}
          onSelect={setActive}
        />

        <section className="project-home-content" aria-labelledby="project-home-title">
          <div className="dashboard-toolbar">
            <div>
              <h2 id="project-home-title">{scopeTitle}</h2>
              <p>{loading ? "正在加载项目…" : `共 ${visibleProjects.length} 个项目`}</p>
            </div>
            <div className="dashboard-toolbar__actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => setShowTemplateLibrary(true)}
              >
                模板库
              </button>
              <button type="button" onClick={() => setShowCreate(true)}>新建项目</button>
            </div>
          </div>

          <div className="project-home-filters">
            <label className="project-home-search">
              <span>搜索项目</span>
              <input
                aria-label="搜索项目"
                placeholder="按项目名称搜索"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="project-home-sort">
              <span>项目排序</span>
              <select aria-label="项目排序" value={sortBy} onChange={(event) => void changeSort(event)}>
                <option value="updated">最近更新</option>
                <option value="created">创建时间</option>
                <option value="name">名称</option>
              </select>
            </label>
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          {showCreate ? (
            <form className="project-inline-form" onSubmit={create}>
              <label>
                <span>项目名称</span>
                <input
                  aria-label="新项目名称"
                  autoFocus
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                />
              </label>
              <TemplatePicker
                templates={templates}
                value={selectedTemplate}
                onSelect={setSelectedTemplate}
              />
              <div className="project-inline-form__actions">
                <button type="submit">创建</button>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setNewTitle("");
                    setSelectedTemplate("blank");
                  }}
                >
                  取消
                </button>
              </div>
            </form>
          ) : null}

          {showTemplateLibrary ? (
            <TemplateLibrary
              projects={projects.filter((project) => project.deletedAt === null)}
              templates={templates}
              onClose={() => setShowTemplateLibrary(false)}
              onCreate={createTemplate}
              onDelete={deleteTemplate}
              onUpdate={updateTemplate}
            />
          ) : null}

          {renaming ? (
            <form className="project-inline-form" onSubmit={saveRename}>
              <label>
                <span>新项目名称</span>
                <input
                  aria-label={`重命名${renaming.title}`}
                  autoFocus
                  value={renameTitle}
                  onChange={(event) => setRenameTitle(event.target.value)}
                />
              </label>
              <button type="submit">保存项目名称</button>
              <button className="button-secondary" type="button" onClick={() => setRenaming(null)}>
                取消
              </button>
            </form>
          ) : null}

          {active === "trash" ? (
            <section className="project-section">
              <h2>已删除项目</h2>
              <div className="project-grid">{cards(owned)}</div>
            </section>
          ) : (
            <>
              <section className="project-section">
                <h2>我创建的项目</h2>
                <div className="project-grid">
                  {cards(owned)}
                  {!loading && owned.length === 0 ? <p className="empty-state">还没有自建项目</p> : null}
                </div>
              </section>

              <section className="project-section">
                <h2>受邀项目</h2>
                <div className="project-grid">
                  {cards(invited)}
                  {!loading && invited.length === 0 ? <p className="empty-state">还没有受邀项目</p> : null}
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
