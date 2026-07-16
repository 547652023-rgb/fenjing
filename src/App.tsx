import { useState } from "react";
import { FieldSettings } from "./components/FieldSettings";
import { ProjectHeader } from "./components/ProjectHeader";
import { StoryboardTable } from "./components/StoryboardTable";
import { createProject, type StoryboardProject } from "./domain/storyboard";
import { loadProject, saveProject } from "./storage/projectRepository";

export function App() {
  const [project, setProject] = useState<StoryboardProject>(() =>
    loadProject() ?? createProject(),
  );
  const [showFieldSettings, setShowFieldSettings] = useState(false);

  function updateProject(nextProject: StoryboardProject) {
    setProject(nextProject);
    saveProject(nextProject);
  }

  function updateTitle(title: string) {
    updateProject({ ...project, title });
  }

  return (
    <main className="workbench-shell">
      <ProjectHeader title={project.title} onTitleChange={updateTitle} />
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
