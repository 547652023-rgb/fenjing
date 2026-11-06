import { useEffect, useRef, useState } from "react";

export type StoryboardDisplay = {
  textSize: 14 | 16 | 18;
  alignment: "center" | "left" | "top-left";
  imageFit: "contain" | "cover";
};
const defaults: StoryboardDisplay = { textSize: 14, alignment: "center", imageFit: "contain" };

function readDisplay(key: string): StoryboardDisplay {
  try {
    const candidate = JSON.parse(localStorage.getItem(key) ?? "null");
    return {
      textSize: [14, 16, 18].includes(candidate?.textSize) ? candidate.textSize : defaults.textSize,
      alignment: ["center", "left", "top-left"].includes(candidate?.alignment) ? candidate.alignment : defaults.alignment,
      imageFit: ["contain", "cover"].includes(candidate?.imageFit) ? candidate.imageFit : defaults.imageFit,
    };
  } catch { return { ...defaults }; }
}

export function useStoryboardDisplay(key: string) {
  const [stored, setStored] = useState(() => ({ key, display: readDisplay(key) }));
  const display = stored.key === key ? stored.display : readDisplay(key);
  function change(patch: Partial<StoryboardDisplay>) {
    const next = { ...display, ...patch };
    setStored({ key, display: next });
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Current controls keep working without storage. */ }
  }
  return { display, change };
}

export function StoryboardDisplaySettings({ display, onChange, aspectRatio, onOpenProjectSettings }: {
  display: StoryboardDisplay;
  onChange: (patch: Partial<StoryboardDisplay>) => void;
  aspectRatio: string;
  onOpenProjectSettings?: () => void;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: Event) => {
      if (event.target instanceof Node && !disclosure.current?.contains(event.target) && disclosure.current) disclosure.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !disclosure.current?.open) return;
      disclosure.current.open = false;
      disclosure.current.querySelector("summary")?.focus();
    };
    const resize = () => { if (disclosure.current) disclosure.current.open = false; };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", outside, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", outside, true);
    };
  }, []);
  return <details ref={disclosure} className="storyboard-display-settings" onToggle={event => {
    if (!event.currentTarget.open || !panel.current) return;
    const anchor = event.currentTarget.querySelector("summary")!.getBoundingClientRect();
    const bounds = panel.current.getBoundingClientRect();
    panel.current.style.left = `${Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8))}px`;
    panel.current.style.top = `${Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - bounds.height - 8))}px`;
  }}>
    <summary>分镜设置</summary>
    <div ref={panel} className="storyboard-display-settings__panel">
      <label>表格字号<select value={display.textSize} onChange={event => onChange({ textSize: Number(event.target.value) as StoryboardDisplay["textSize"] })}>
        <option value={14}>小</option><option value={16}>中</option><option value={18}>大</option>
      </select></label>
      <label>文字对齐<select value={display.alignment} onChange={event => onChange({ alignment: event.target.value as StoryboardDisplay["alignment"] })}>
        <option value="center">居中</option><option value="left">居左</option><option value="top-left">居左上</option>
      </select></label>
      <label>图片适配<select value={display.imageFit} onChange={event => onChange({ imageFit: event.target.value as StoryboardDisplay["imageFit"] })}>
        <option value="contain">适应（完整显示）</option><option value="cover">缩放（填满画框）</option>
      </select></label>
      <div className="storyboard-display-settings__ratio"><span>图片比例 {aspectRatio}</span>
        {onOpenProjectSettings ? <button className="button-quiet" type="button" onClick={onOpenProjectSettings}>修改画幅比例</button> : null}
      </div>
      <small>字号、对齐和适配仅影响你的工作台显示。</small>
    </div>
  </details>;
}
