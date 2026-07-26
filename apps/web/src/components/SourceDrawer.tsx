import { BookOpen, ExternalLink, X } from "lucide-react";
import { useEffect } from "react";

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
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <>
      <button className="drawer-backdrop" type="button" aria-label="关闭来源" onClick={onClose} />
      <aside className="source-drawer open" role="dialog" aria-modal="true" aria-labelledby="source-drawer-title">
        <header>
          <div>
            <p className="section-kicker">EVIDENCE</p>
            <h2 id="source-drawer-title">相关来源</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭来源" title="关闭来源">
            <X size={19} />
          </button>
        </header>
        <div className="drawer-source-list">
          {sources.map((source) => (
            <article className="drawer-source" key={source.id}>
              <div className="drawer-source-meta">
                <span><BookOpen size={14} /> {source.kind}</span>
                <small>{source.locator}</small>
              </div>
              <h3>{source.title}</h3>
              <p className="drawer-source-author">{source.author}</p>
              <p>{source.summary}</p>
              {source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer">
                  查看来源 <ExternalLink size={14} />
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </aside>
    </>
  );
}
