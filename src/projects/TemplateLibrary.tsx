import { useEffect, useState, type FormEvent } from "react";
import type { ProjectSummary, StoryboardTemplate } from "../domain/models";
import type { DeepReadonly } from "../domain/templates";

type TemplateLibraryProps = {
  templates: readonly DeepReadonly<StoryboardTemplate>[];
  projects?: readonly ProjectSummary[];
  onCreate: (sourceProjectId: string, name: string) => void | Promise<void>;
  onUpdate: (templateId: string, name: string) => void | Promise<void>;
  onDelete: (templateId: string) => void | Promise<void>;
  onClose: () => void;
};

type EditingTemplate = {
  id: string;
  name: string;
};

export function TemplateLibrary({
  templates,
  projects = [],
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}: TemplateLibraryProps) {
  const [name, setName] = useState("");
  const [sourceProjectId, setSourceProjectId] = useState(projects[0]?.id ?? "");
  const [editing, setEditing] = useState<EditingTemplate | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!projects.some((project) => project.id === sourceProjectId)) {
      setSourceProjectId(projects[0]?.id ?? "");
    }
  }, [projects, sourceProjectId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("请输入模板名称");
      return;
    }
    if (!sourceProjectId) {
      setError("请选择来源项目");
      return;
    }

    setPending(true);
    setError("");
    try {
      await onCreate(sourceProjectId, name.trim());
      setName("");
    } catch {
      setError("模板创建失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing?.name.trim()) {
      setError("请输入模板名称");
      return;
    }

    setPending(true);
    setError("");
    try {
      await onUpdate(editing.id, editing.name.trim());
      setEditing(null);
    } catch {
      setError("模板更新失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  async function remove(template: DeepReadonly<StoryboardTemplate>) {
    if (!window.confirm(`确定删除模板“${template.name}”吗？此操作无法撤销。`)) {
      return;
    }

    setPending(true);
    setError("");
    try {
      await onDelete(template.id);
      if (editing?.id === template.id) setEditing(null);
    } catch {
      setError("模板删除失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  const builtIns = templates.filter((template) => template.builtIn);
  const custom = templates.filter((template) => !template.builtIn);

  return (
    <dialog aria-labelledby="template-library-title" className="template-library" open>
      <header>
        <div>
          <p className="project-header__eyebrow">共享资源</p>
          <h2 id="template-library-title">模板库</h2>
        </div>
        <button aria-label="关闭模板库" type="button" onClick={onClose}>×</button>
      </header>

      <form className="template-library__form" onSubmit={create}>
        <label>
          <span>模板名称</span>
          <input
            aria-label="模板名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span>来源项目</span>
          <select
            aria-label="来源项目"
            value={sourceProjectId}
            onChange={(event) => setSourceProjectId(event.target.value)}
          >
            {projects.length === 0 ? <option value="">暂无可用项目</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.title}</option>
            ))}
          </select>
        </label>
        <button disabled={pending || projects.length === 0} type="submit">创建模板</button>
      </form>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <section aria-labelledby="built-in-templates-title">
        <h3 id="built-in-templates-title">内置模板</h3>
        <ul className="template-library__list">
          {builtIns.map((template) => (
            <li key={template.id}>
              <div>
                <strong>{template.name}</strong>
                <span>内置 · 只读</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="shared-templates-title">
        <h3 id="shared-templates-title">共享模板</h3>
        {custom.length === 0 ? <p className="empty-state">还没有共享模板</p> : null}
        <ul className="template-library__list">
          {custom.map((template) => (
            <li key={template.id}>
              {editing?.id === template.id ? (
                <form className="template-library__edit" onSubmit={update}>
                  <label>
                    <span>模板名称</span>
                    <input
                      aria-label="编辑模板名称"
                      autoFocus
                      value={editing.name}
                      onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                    />
                  </label>
                  <button disabled={pending} type="submit">保存模板</button>
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => setEditing(null)}
                  >
                    取消
                  </button>
                </form>
              ) : (
                <>
                  <div>
                    <strong>{template.name}</strong>
                    <span>共享模板</span>
                  </div>
                  <div className="template-library__actions">
                    <button
                      aria-label={`编辑${template.name}`}
                      className="button-secondary"
                      type="button"
                      onClick={() => setEditing({ id: template.id, name: template.name })}
                    >
                      编辑
                    </button>
                    <button
                      aria-label={`删除${template.name}`}
                      className="button-danger"
                      disabled={pending}
                      type="button"
                      onClick={() => void remove(template)}
                    >
                      删除
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </dialog>
  );
}
