import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function RowActionMenu({ anchor, label, onClose, children }: {
  anchor: HTMLButtonElement; label: string; onClose: () => void; children: ReactNode;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      element.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - bounds.width - 8))}px`;
      const below = rect.bottom + 6;
      element.style.top = `${Math.max(8, Math.min(below + bounds.height > window.innerHeight - 8 ? rect.top - bounds.height - 6 : below, window.innerHeight - bounds.height - 8))}px`;
    };
    place();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => observer.disconnect();
  }, [anchor]);
  useEffect(() => {
    const element = menu.current;
    element?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      if (!(event.target instanceof Node) || (!element?.contains(event.target) && !anchor.contains(event.target))) close.current();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close.current(); };
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !element?.contains(event.target)) close.current(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", scroll);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", scroll);
      if (element?.contains(document.activeElement) || document.activeElement === document.body) anchor.focus({ preventScroll: true });
    };
  }, [anchor]);
  return createPortal(<div ref={menu} role="menu" aria-label={label} className="shot-actions__menu" onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),select"));
    const index = controls.indexOf(document.activeElement as HTMLElement);
    if ((event.shiftKey && index === 0) || (!event.shiftKey && index === controls.length - 1)) {
      event.preventDefault();
      controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
    }
  }}>{children}</div>, document.body);
}
