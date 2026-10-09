import { useEffect, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import type { ColumnWidth } from "../domain/storyboardViews";

type Props = {
  label: string;
  fixed: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  width: ColumnWidth;
  onMove: (offset: number) => void;
  onHide: () => void;
  onWidth: (width: ColumnWidth) => void;
  onRename: (name: string) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
};

export function ColumnHeader({ label, fixed, canMoveLeft, canMoveRight, width, onMove, onHide, onWidth, onRename, onDragStart, onDragEnd }: Props) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(label);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!position) return;
    const menuElement = menu.current;
    const sourceTrigger = trigger.current;
    menuElement?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const closeOutside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setPosition(null); trigger.current?.focus(); }
    };
    const closeOnScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) setPosition(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
      if (menuElement?.contains(document.activeElement) || document.activeElement === document.body) sourceTrigger?.focus({ preventScroll: true });
    };
  }, [position]);

  useEffect(() => {
    if (!renaming || !dialog.current) return;
    if (dialog.current.showModal) dialog.current.showModal();
    else dialog.current.setAttribute("open", "");
    dialog.current.querySelector("input")?.focus();
    return () => trigger.current?.focus();
  }, [renaming]);

  function act(action: () => void) { action(); setPosition(null); }

  return <div className="column-header">
    {!fixed ? <button type="button" className="column-header__drag" aria-label={`拖动${label}列`} title="拖动以调整整列顺序" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>⠿</button> : null}
    <span className="column-header__label">{label}</span>
    <button ref={trigger} type="button" className="column-header__toggle" aria-label={`${label}列操作`} aria-expanded={Boolean(position)} aria-haspopup="dialog" onClick={() => {
      if (position) { setPosition(null); return; }
      const rect = trigger.current!.getBoundingClientRect();
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 228)), top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 300)) });
    }}>⋯</button>
    {position ? createPortal(<div ref={menu} role="dialog" aria-label={`${label}列设置`} className="column-header-menu" style={position} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select"));
      const index = controls.indexOf(document.activeElement as HTMLElement);
      if ((event.shiftKey && index === 0) || (!event.shiftKey && index === controls.length - 1)) {
        event.preventDefault();
        controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
      }
    }}>
      <p>排序和显示仅影响你的视图</p>
      <button type="button" disabled={!canMoveLeft} onClick={() => act(() => onMove(-1))}>向左移动</button>
      <button type="button" disabled={!canMoveRight} onClick={() => act(() => onMove(1))}>向右移动</button>
      <button type="button" onClick={() => act(() => { setName(label); setError(""); setRenaming(true); })}>重命名字段</button>
      <label>列宽<select aria-label={`${label}列宽`} value={width} onChange={event => onWidth(event.target.value as ColumnWidth)}><option value="compact">窄</option><option value="standard">标准</option><option value="wide">宽</option></select></label>
      <button type="button" disabled={fixed} onClick={() => act(onHide)}>隐藏此列</button>
    </div>, document.body) : null}
    {renaming ? createPortal(<dialog ref={dialog} className="column-rename-dialog" aria-labelledby="column-rename-title" onCancel={event => { event.preventDefault(); setRenaming(false); }}>
      <form onSubmit={event => {
        event.preventDefault();
        try { onRename(name); setRenaming(false); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "字段名称修改失败"); }
      }}>
        <h2 id="column-rename-title">重命名字段</h2>
        <p>名称修改将影响整个项目，已有内容保留。</p>
        <label>新的字段名称<input autoFocus value={name} aria-invalid={Boolean(error)} aria-describedby={error ? "column-name-error" : undefined} onChange={event => { setName(event.target.value); setError(""); }} /></label>
        {error ? <p id="column-name-error" role="alert">{error}</p> : null}
        <footer><button type="button" onClick={() => setRenaming(false)}>取消</button><button type="submit">保存名称</button></footer>
      </form>
    </dialog>, document.body) : null}
  </div>;
}
