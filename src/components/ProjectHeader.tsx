import type { SaveState } from "../domain/models";

type ProjectHeaderProps = {
  title: string;
  onTitleChange: (title: string) => void;
  saveStatus: SaveState;
  pendingImages?: number;
};

export function ProjectHeader({ title, onTitleChange, saveStatus, pendingImages = 0 }: ProjectHeaderProps) {
  return (
    <header className="project-header">
      <div>
        <h1>分镜工作台</h1>
        <p className="project-header__subtitle">镜头、协作与交付在同一处推进</p>
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
          ? (pendingImages ? "其他改动已保存" : "已在线保存")
          : saveStatus === "saving"
            ? "正在保存…"
            : saveStatus === "offline"
              ? "当前离线，修改尚未保存"
              : saveStatus === "reconnecting"
                ? "正在重新连接…"
                : saveStatus === "conflict"
                  ? "内容已被其他成员更新"
                  : "保存失败，请检查网络后重试"}
      </p>
      {pendingImages > 0 ? <p className="save-status image-upload-status" role="status">还有 {pendingImages} 张图片正在上传</p> : null}
    </header>
  );
}
