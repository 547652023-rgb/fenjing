import { useState, type FormEvent } from "react";
import {
  ASPECT_RATIO_OPTIONS,
  normalizeAspectRatio,
  type ProjectUpdate,
  type StoryboardProject,
} from "../domain/storyboard";

type ProjectSettingsProps = {
  project: StoryboardProject;
  onChange: (update: ProjectUpdate) => void;
  onClose: () => void;
};

export function ProjectSettings({ project, onChange, onClose }: ProjectSettingsProps) {
  const current = project.aspectRatio || "16:9";
  const isPreset = (ASPECT_RATIO_OPTIONS as readonly string[]).includes(current);
  const [mode, setMode] = useState(isPreset ? current : "custom");
  const [custom, setCustom] = useState(isPreset ? "" : current);
  const [error, setError] = useState("");

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = mode === "custom" ? custom : mode;
    try {
      const aspectRatio = normalizeAspectRatio(value);
      onChange((latest) => ({ ...latest, aspectRatio }));
      onClose();
    } catch {
      setError("请输入画幅比例");
    }
  }

  return (
    <dialog className="project-settings" open aria-labelledby="project-settings-title">
      <div className="project-settings__header">
        <div>
          <p className="field-settings__eyebrow">项目配置</p>
          <h2 id="project-settings-title">项目设置</h2>
        </div>
        <button type="button" className="field-settings__close" aria-label="关闭项目设置" onClick={onClose}>×</button>
      </div>
      <form onSubmit={save} className="project-settings__form">
        <label>
          画幅比例
          <select value={mode} onChange={(event) => setMode(event.target.value)}>
            {ASPECT_RATIO_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            <option value="custom">自定义</option>
          </select>
        </label>
        {mode === "custom" ? (
          <label>
            自定义比例
            <input value={custom} placeholder="例如 2.35:1" onChange={(event) => { setCustom(event.target.value); setError(""); }} />
          </label>
        ) : null}
        {error ? <p className="field-settings__error" role="alert">{error}</p> : null}
        <div className="project-settings__actions">
          <button type="submit">保存</button>
          <button type="button" className="button-secondary" onClick={onClose}>取消</button>
        </div>
      </form>
    </dialog>
  );
}
