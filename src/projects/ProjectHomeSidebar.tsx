import { useState, type FormEvent } from "react";
import type { ProjectFolder } from "../domain/models";

export type ProjectHomeScope = "all" | "ungrouped" | "trash" | string;

type ProjectHomeSidebarProps = {
  folders: ProjectFolder[];
  active: ProjectHomeScope;
  onSelect: (scope: ProjectHomeScope) => void;
  onCreateFolder: (name: string) => void | Promise<void>;
  onRenameFolder: (folderId: string, name: string) => void | Promise<void>;
  onDeleteFolder: (folderId: string) => void | Promise<void>;
};

export function ProjectHomeSidebar({
  folders,
  active,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: ProjectHomeSidebarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<ProjectFolder | null>(null);
  const [renameName, setRenameName] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      await onCreateFolder(name);
      setNewName("");
      setCreating(false);
    } catch {
      // The dashboard presents the gateway error and the form remains editable.
    }
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = renameName.trim();
    if (!renaming || !name) return;
    try {
      await onRenameFolder(renaming.id, name);
      setRenaming(null);
      setRenameName("");
    } catch {
      // The dashboard presents the gateway error and the form remains editable.
    }
  }

  function scopeButton(scope: ProjectHomeScope, label: string, icon: string) {
    return (
      <button
        aria-current={active === scope ? "page" : undefined}
        className="project-home-sidebar__scope"
        type="button"
        onClick={() => onSelect(scope)}
      >
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </button>
    );
  }

  return (
    <aside className="project-home-sidebar" aria-label="项目分类">
      <nav className="project-home-sidebar__nav">
        {scopeButton("all", "全部项目", "▦")}
        {scopeButton("ungrouped", "未分组", "⌑")}

        <div className="project-home-sidebar__heading">
          <span>我的文件夹</span>
          <button
            aria-label="新建文件夹"
            className="project-home-sidebar__icon-button"
            title="新建文件夹"
            type="button"
            onClick={() => setCreating(true)}
          >
            ＋
          </button>
        </div>

        {creating ? (
          <form className="project-home-sidebar__form" onSubmit={create}>
            <label>
              <span>文件夹名称</span>
              <input
                aria-label="文件夹名称"
                autoFocus
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </label>
            <div>
              <button type="submit">创建文件夹</button>
              <button
                className="button-quiet"
                type="button"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                取消
              </button>
            </div>
          </form>
        ) : null}

        <div className="project-home-sidebar__folders">
          {folders.map((folder) =>
            renaming?.id === folder.id ? (
              <form
                className="project-home-sidebar__form"
                key={folder.id}
                onSubmit={rename}
              >
                <label>
                  <span>文件夹名称</span>
                  <input
                    aria-label={`重命名${folder.name}`}
                    autoFocus
                    value={renameName}
                    onChange={(event) => setRenameName(event.target.value)}
                  />
                </label>
                <div>
                  <button type="submit">保存文件夹名称</button>
                  <button
                    className="button-quiet"
                    type="button"
                    onClick={() => setRenaming(null)}
                  >
                    取消
                  </button>
                </div>
              </form>
            ) : (
              <div className="project-home-sidebar__folder" key={folder.id}>
                <button
                  aria-current={active === folder.id ? "page" : undefined}
                  className="project-home-sidebar__scope"
                  type="button"
                  onClick={() => onSelect(folder.id)}
                >
                  <span aria-hidden="true">⌑</span>
                  <span>{folder.name}</span>
                </button>
                <button
                  aria-label={`重命名${folder.name}`}
                  className="project-home-sidebar__icon-button"
                  title={`重命名${folder.name}`}
                  type="button"
                  onClick={() => {
                    setRenaming(folder);
                    setRenameName(folder.name);
                  }}
                >
                  ✎
                </button>
                <button
                  aria-label={`删除${folder.name}`}
                  className="project-home-sidebar__icon-button project-home-sidebar__icon-button--danger"
                  title={`删除${folder.name}`}
                  type="button"
                  onClick={() => void onDeleteFolder(folder.id)}
                >
                  ×
                </button>
              </div>
            ),
          )}
        </div>

        <div className="project-home-sidebar__trash">
          {scopeButton("trash", "回收站", "♲")}
        </div>
      </nav>
    </aside>
  );
}
