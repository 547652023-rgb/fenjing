import { useLayoutEffect, useRef, useState } from "react";

import { createPortal } from "react-dom";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function CenteredTextCell({ label, value, onChange }: Props) {
  const [expanded, setExpanded] = useState<{ original: string; draft: string }>();
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const expandedInput = useRef<HTMLTextAreaElement>(null);
  const isExpanded = expanded !== undefined;
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!isExpanded || !element) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.open = true;
    expandedInput.current?.focus();
    return () => {
      if (typeof element.close === "function" && element.open) element.close();
      opener.current?.focus();
    };
  }, [isExpanded]);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const cell = input?.closest("td");
    if (!input || !cell) return;
    const fitContent = () => {
      // Measuring at zero height also lets the editor shrink when text is removed.
      input.style.height = "0px";
      const border = input.offsetHeight - input.clientHeight;
      const contentHeight = Math.max(1, input.scrollHeight + border);
      input.style.height = `${Math.min(contentHeight, cell.clientHeight || contentHeight)}px`;
    };
    fitContent();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fitContent);
    observer.observe(cell);
    return () => observer.disconnect();
  }, [value]);

  return <>
    <div className="centered-text-cell__minimum" aria-hidden="true" />
    <textarea ref={inputRef} aria-label={label} rows={2} value={value}
      onChange={event => onChange(event.target.value)} />
    {value.includes("\n") || value.length >= 50 ? (
      <button aria-label={`展开${label}`} className="centered-text-cell__expand" ref={opener}
        type="button" onClick={() => setExpanded({ original: value, draft: value })}>展开</button>
    ) : null}
    {expanded ? createPortal(
      <dialog aria-label={label} className="expanded-text-editor" ref={dialog}
        onCancel={() => setExpanded(undefined)} onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()} onPaste={event => event.stopPropagation()}>
        <h2>编辑完整文字</h2>
        <textarea aria-label="完整文字" ref={expandedInput} rows={9} value={expanded.draft}
          onChange={event => setExpanded({ ...expanded, draft: event.target.value })} />
        {value !== expanded.original ? <p role="alert">原单元格已更新。请取消后重新打开，避免覆盖新内容。</p> : null}
        <div className="expanded-text-editor__actions">
          <button type="button" onClick={() => setExpanded(undefined)}>取消</button>
          <button type="button" disabled={value !== expanded.original} onClick={() => {
            if (expanded.draft !== value) onChange(expanded.draft);
            setExpanded(undefined);
          }}>保存修改</button>
        </div>
      </dialog>, document.body,
    ) : null}
  </>;
}
