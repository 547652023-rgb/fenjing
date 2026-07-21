import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { StoryboardGateway } from "../data/gateway";
import type { AuthUser, ProjectSummary, StoryboardTemplate } from "../domain/models";
import { projectToTemplateSnapshot } from "../domain/templates";
import { LocalImportPrompt } from "../migration/LocalImportPrompt";
import { TemplateLibrary } from "./TemplateLibrary";
import { TemplatePicker, type TemplateSelection } from "./TemplatePicker";

type ProjectDashboardProps = {
  gateway: StoryboardGateway;
  user: AuthUser;
  onOpenProject: (projectId: string) => void;
  onSignOut: () => void;
};

type ProjectCardProps = {
  project: ProjectSummary;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
};

function ProjectCard({ project, onOpen, onRename, onDelete }: ProjectCardProps) {
  return (
    <article className="project-card">
      <div>
        <p className="project-card__role">
          {project.role === "owner" ? "我创建的" : `所有者：${project.ownerEmail}`}
        </p>
        <h3>{project.title}</h3>
      </div>
      <dl>
        <div><dt>成员</dt><dd>{project.memberCount} 人</dd></div>
        <div><dt>更新时间</dt><dd>{new Date(project.updatedAt).toLocaleDateString("zh-CN")}</dd></div>
      </dl>
      <div className="project-card__actions">
        <button aria-label={`进入${project.title}`} type="button" onClick={onOpen}>
          进入项目
        </button>
        {project.role === "owner" ? (
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
              aria-label={`删除${project.title}`}
              className="button-danger"
              type="button"
              onClick={onDelete}
            >
              删除
            </button>
          </>
        ) : null}
      </div>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateSelection>("blank");
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [nextProjects, nextTemplates] = await Promise.all([
        gateway.listProjects(),
        gateway.listTemplates(),
      ]);
      setProjects(nextProjects);
      setTemplates(nextTemplates);
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

  async function remove(project: ProjectSummary) {
    if (!window.confirm(`确定删除项目“${project.title}”吗？此操作无法撤销。`)) {
      return;
    }
    try {
      await gateway.deleteProject(project.id);
      await refresh();
    } catch {
      setError("项目删除失败，请稍后重试");
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

  const owned = projects.filter((project) => project.role === "owner");
  const invited = projects.filter((project) => project.role === "editor");

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="project-header__eyebrow">Storyboard Workbench</p>
          <h1>我的项目</h1>
        </div>
        <div className="dashboard-account">
          <span>{user.email}</span>
          <button type="button" onClick={onSignOut}>退出登录</button>
        </div>
      </header>

      <LocalImportPrompt gateway={gateway} onImported={() => void refresh()} user={user} />

      <div className="dashboard-toolbar">
        <p>{loading ? "正在加载项目…" : `共 ${projects.length} 个项目`}</p>
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
          projects={projects}
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

      <section className="project-section">
        <h2>我创建的项目</h2>
        <div className="project-grid">
          {owned.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => onOpenProject(project.id)}
              onRename={() => {
                setRenaming(project);
                setRenameTitle(project.title);
              }}
              onDelete={() => void remove(project)}
            />
          ))}
          {!loading && owned.length === 0 ? <p className="empty-state">还没有自建项目</p> : null}
        </div>
      </section>

      <section className="project-section">
        <h2>受邀项目</h2>
        <div className="project-grid">
          {invited.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => onOpenProject(project.id)}
              onRename={() => undefined}
              onDelete={() => undefined}
            />
          ))}
          {!loading && invited.length === 0 ? <p className="empty-state">还没有受邀项目</p> : null}
        </div>
      </section>
    </main>
  );
}
