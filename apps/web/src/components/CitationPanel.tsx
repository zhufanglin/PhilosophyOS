import { useState } from "react";

export type EvidenceCategory = "primary" | "research" | "ai_inference";

export type CitationSummary = {
  citation_id: string;
  category: EvidenceCategory;
  title: string;
  author: string;
  source_level: string;
  source_version: string;
  location: string | null;
  context_preview: string;
  canonical_url: string | null;
  direct_quote: string | null;
};

type CitationDetail = Omit<CitationSummary, "context_preview"> & {
  context: string;
};

type CitationPanelProps = {
  apiBaseUrl: string;
  citations: CitationSummary[];
};

const categoryLabels: Record<EvidenceCategory, string> = {
  primary: "原典",
  research: "研究解释",
  ai_inference: "AI 推论",
};

export function evidenceLabel(category: EvidenceCategory) {
  return categoryLabels[category];
}

export function CitationPanel({ apiBaseUrl, citations }: CitationPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CitationDetail>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleCitation(citation: CitationSummary) {
    if (expandedId === citation.citation_id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(citation.citation_id);
    setError(null);
    if (details[citation.citation_id]) {
      return;
    }

    setLoadingId(citation.citation_id);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/citations/${citation.citation_id}`,
      );
      if (!response.ok) {
        throw new Error(`来源上下文返回 ${response.status}`);
      }
      const detail = (await response.json()) as CitationDetail;
      setDetails((current) => ({ ...current, [citation.citation_id]: detail }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法展开来源");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section className="citation-panel" aria-labelledby="citation-title">
      <div className="section-heading compact-heading">
        <div>
          <p className="section-kicker">EVIDENCE</p>
          <h2 id="citation-title">来源与上下文</h2>
        </div>
        <span className="source-count">{citations.length} 项</span>
      </div>

      {citations.length === 0 ? (
        <p className="empty-source">当前没有足够的已审核来源。</p>
      ) : (
        <div className="citation-list">
          {citations.map((citation, index) => {
            const isExpanded = expandedId === citation.citation_id;
            const detail = details[citation.citation_id];
            return (
              <article className={`citation-card ${citation.category}`} key={citation.citation_id}>
                <div className="citation-meta-row">
                  <span className="evidence-badge">
                    {categoryLabels[citation.category]} {index + 1}
                  </span>
                  <span className="source-level">{citation.source_level}</span>
                </div>
                <h3>{citation.title}</h3>
                <p className="citation-author">{citation.author}</p>
                <dl className="citation-facts">
                  <div>
                    <dt>版本</dt>
                    <dd>{citation.source_version}</dd>
                  </div>
                  {citation.location ? (
                    <div>
                      <dt>位置</dt>
                      <dd>{citation.location}</dd>
                    </div>
                  ) : null}
                </dl>
                <p className="citation-preview">
                  {detail?.context ?? citation.context_preview}
                </p>
                {citation.direct_quote ? (
                  <blockquote>{citation.direct_quote}</blockquote>
                ) : (
                  <p className="no-quote">仅支持审核转述，未展示直接引语。</p>
                )}
                <div className="citation-actions">
                  <button
                    className="text-button"
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => void toggleCitation(citation)}
                  >
                    {loadingId === citation.citation_id
                      ? "正在展开…"
                      : isExpanded
                        ? "收起上下文"
                        : "展开上下文"}
                  </button>
                  {citation.canonical_url ? (
                    <a href={citation.canonical_url} target="_blank" rel="noreferrer">
                      查看来源网站
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {error ? <p className="inline-error">{error}</p> : null}
    </section>
  );
}
