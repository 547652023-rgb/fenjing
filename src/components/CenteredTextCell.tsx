import { useLayoutEffect, useRef } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function CenteredTextCell({ label, value, onChange }: Props) {
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
  </>;
}
