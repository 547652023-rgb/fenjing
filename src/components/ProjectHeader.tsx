type ProjectHeaderProps = {
  title: string;
  onTitleChange: (title: string) => void;
  saveStatus: "saving" | "saved" | "error";
};

export function ProjectHeader({ title, onTitleChange, saveStatus }: ProjectHeaderProps) {
  return (
    <header className="project-header">
      <div>
        <p className="project-header__eyebrow">Storyboard Workbench</p>
        <h1>分镜工作台</h1>
      </div>
      <label className="project-title">
        <span>项目名称</span>
        <input
          aria-label="项目名称"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>
      <p className="save-status" role="status">
        {saveStatus === "saved"
          ? "已保存到本机"
          : saveStatus === "saving"
            ? "正在保存…"
            : "保存失败，请释放本机存储空间后重试"}
      </p>
    </header>
  );
}
