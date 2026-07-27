import { BookOpen, ExternalLink, X } from "lucide-react";
import { useEffect, useRef } from "react";

export type DialogueSource = {
  id: string;
  kind: "原典" | "研究解释";
  title: string;
  author: string;
  locator: string;
  summary: string;
  url?: string;
};

type SourceDrawerProps = {
  open: boolean;
  sources: DialogueSource[];
  onClose: () => void;
};

export function SourceDrawer({ open, sources, onClose }: SourceDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button className="drawer-backdrop" type="button" aria-label="关闭来源" onClick={onClose} />
      <aside ref={drawerRef} className="source-drawer open" role="dialog" aria-modal="true" aria-labelledby="source-drawer-title" aria-describedby="source-drawer-description">
        <header>
          <div>
            <p className="section-kicker">BIBLIOGRAPHY</p>
            <h2 id="source-drawer-title">文献与页边注</h2>
            <p id="source-drawer-description">区分原典文本与研究解释，保留可核查的位置和出处。</p>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="关闭来源" title="关闭来源">
            <X size={19} />
          </button>
        </header>
        <ol className="drawer-source-list">
          {sources.map((source, index) => (
            <li className="drawer-source" key={source.id}>
              <span className="drawer-source-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div className="drawer-source-meta">
                <span><BookOpen size={14} /> {source.kind}</span>
              </div>
              <h3>{source.title}</h3>
              <p className="drawer-source-citation"><strong>{source.author}</strong><span>{source.locator}</span></p>
              <p className="drawer-source-summary">{source.summary}</p>
              {source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer">
                  查阅原始页面 <ExternalLink size={14} />
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      </aside>
    </>
  );
}
