import { useEffect, useState } from "react";
import { FieldSettings } from "./components/FieldSettings";
import { ProjectHeader } from "./components/ProjectHeader";
import { StoryboardTable } from "./components/StoryboardTable";
import {
  createProject,
  type ProjectUpdate,
  type StoryboardProject,
} from "./domain/storyboard";
import { loadProject, saveProject } from "./storage/projectRepository";

export function App() {
  const [project, setProject] = useState<StoryboardProject>(() =>
    loadProject() ?? createProject(),
  );
  const [showFieldSettings, setShowFieldSettings] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | "error">(
    "saving",
  );

  useEffect(() => {
    const result = saveProject(project);
    setSaveStatus(result.ok ? "saved" : "error");
  }, [project]);

  function updateProject(update: ProjectUpdate) {
    setSaveStatus("saving");
    setProject((currentProject) =>
      typeof update === "function" ? update(currentProject) : update,
    );
  }

  function updateTitle(title: string) {
    updateProject((currentProject) => ({ ...currentProject, title }));
  }

  return (
    <main className="workbench-shell">
      <ProjectHeader
        title={project.title}
        onTitleChange={updateTitle}
        saveStatus={saveStatus}
      />
      <div className="workbench-actions">
        <button onClick={() => setShowFieldSettings(true)} type="button">
          字段设置
        </button>
      </div>
      <StoryboardTable project={project} onChange={updateProject} />
      {showFieldSettings ? (
        <FieldSettings
          onChange={updateProject}
          onClose={() => setShowFieldSettings(false)}
          project={project}
        />
      ) : null}
    </main>
  );
}
