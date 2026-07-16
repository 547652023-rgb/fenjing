import { useState } from "react";
import { ProjectHeader } from "./components/ProjectHeader";
import { StoryboardTable } from "./components/StoryboardTable";
import { createProject, type StoryboardProject } from "./domain/storyboard";
import { loadProject, saveProject } from "./storage/projectRepository";

export function App() {
  const [project, setProject] = useState<StoryboardProject>(() =>
    loadProject() ?? createProject(),
  );

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
        <button type="button">字段设置</button>
      </div>
      <StoryboardTable project={project} onChange={updateProject} />
    </main>
  );
}
