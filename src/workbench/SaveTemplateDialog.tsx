import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TemplateSnapshot } from "../domain/models";
import type { StoryboardProject } from "../domain/storyboard";
import { projectToTemplateSnapshot } from "../domain/templates";

type SaveTemplateDialogProps = {
  project: StoryboardProject;
  onSave: (name: string, snapshot: TemplateSnapshot) => void | Promise<void>;
  onClose: () => void;
};

export function SaveTemplateDialog({
  project,
  onSave,
  onClose,
}: SaveTemplateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    }
    inputRef.current?.focus();

    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("请输入模板名称");
      return;
    }

    setPending(true);
    setError("");
    try {
      await onSave(normalizedName, projectToTemplateSnapshot(project));
    } catch {
      setError("模板保存失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="save-template-title"
      aria-modal="true"
      className="project-settings"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <div className="project-settings__header">
        <div>
          <p className="field-settings__eyebrow">共享资源</p>
          <h2 id="save-template-title">保存为模板</h2>
        </div>
        <button
          aria-label="关闭保存模板"
          className="field-settings__close"
          disabled={pending}
          type="button"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <form className="project-settings__form" onSubmit={save}>
        <label>
          模板名称
          <input
            ref={inputRef}
            aria-label="模板名称"
            aria-describedby={error ? "save-template-error" : undefined}
            aria-invalid={error ? "true" : undefined}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
          />
        </label>
        {error ? (
          <p className="field-settings__error" id="save-template-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="project-settings__actions">
          <button disabled={pending} type="submit">
            {pending ? "正在保存…" : "保存模板"}
          </button>
          <button
            className="button-secondary"
            disabled={pending}
            type="button"
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </form>
    </dialog>
  );
}
