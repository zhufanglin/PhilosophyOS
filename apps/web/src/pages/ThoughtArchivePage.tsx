import { Archive, ChevronDown, CircleDot, Clock3, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type SnapshotStatus = "completed" | "pending";
type SnapshotDecision = "approved" | "edit" | "rejected" | "raw_only";

type ReflectionSnapshotListItem = {
  created_at: string;
  question: string;
  snapshot: {
    snapshot_id: string;
    status: SnapshotStatus;
    provider: string;
    provider_model: string | null;
    pending_reason: string | null;
    user_decision: SnapshotDecision | null;
    decision_updated_at: string | null;
    content: {
      topic: string;
      title: string;
      user_position: string;
      confidence: number;
      emotional_tone: string | null;
      core_question: string;
      key_insights: string[];
      tensions: string[];
      related_philosophers: { name: string; reason: string }[];
      change_signal: {
        changed: boolean;
        previous_position: string | null;
        current_position: string | null;
        change_type: string | null;
      };
      next_question: string | null;
      tags: string[];
    } | null;
  };
};

type ReflectionSnapshotListResponse = {
  items: ReflectionSnapshotListItem[];
};

type ThoughtArchivePageProps = {
  apiBaseUrl: string;
};

type ArchiveAggregate = {
  label: string;
  count: number;
};

type CompletedSnapshotItem = ReflectionSnapshotListItem & {
  snapshot: ReflectionSnapshotListItem["snapshot"] & {
    content: NonNullable<ReflectionSnapshotListItem["snapshot"]["content"]>;
  };
};

function hasSnapshotContent(item: ReflectionSnapshotListItem): item is CompletedSnapshotItem {
  return item.snapshot.content !== null;
}

function formatSnapshotTime(value: string) {
  if (!value) return "时间待确认";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待确认";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function collectAggregates(values: string[], limit = 5): ArchiveAggregate[] {
  const counts = new Map<string, number>();
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));

  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0], "zh-CN"))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

const snapshotDecisionLabels: Record<SnapshotDecision, string> = {
  approved: "\u5df2\u8ba4\u53ef",
  edit: "\u5f85\u4fee\u6539",
  rejected: "\u4e0d\u540c\u610f",
  raw_only: "\u53ea\u4fdd\u7559\u539f\u6587",
};

export function ThoughtArchivePage({ apiBaseUrl }: ThoughtArchivePageProps) {
  const [items, setItems] = useState<ReflectionSnapshotListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSnapshots() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/reflection-snapshots?limit=30`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`思想快照接口返回 ${response.status}`);
        }
        const payload = (await response.json()) as ReflectionSnapshotListResponse;
        setItems(payload.items);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "暂时无法读取思想档案");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadSnapshots();
    return () => controller.abort();
  }, [apiBaseUrl]);

  const completedCount = useMemo(
    () => items.filter((item) => item.snapshot.status === "completed").length,
    [items],
  );
  const pendingCount = items.length - completedCount;
  const completedContents = useMemo(
    () => items.map((item) => item.snapshot.content).filter((content) => content !== null),
    [items],
  );
  const completedSnapshotItems = useMemo(() => items.filter(hasSnapshotContent), [items]);
  const evolutionItems = useMemo(
    () => [...completedSnapshotItems].reverse().slice(-6),
    [completedSnapshotItems],
  );
  const topicHighlights = useMemo(
    () => collectAggregates(completedContents.map((content) => content.topic)),
    [completedContents],
  );
  const tensionHighlights = useMemo(
    () => collectAggregates(completedContents.flatMap((content) => content.tensions)),
    [completedContents],
  );
  const changedCount = useMemo(
    () => completedContents.filter((content) => content.change_signal.changed).length,
    [completedContents],
  );

  return (
    <main className="thought-archive-page" id="archive">
      <header className="archive-hero">
        <p className="section-kicker">THOUGHT ARCHIVE</p>
        <h1>思想时间线</h1>
        <p>
          这里会把每次对话后的思想节点串起来：哪些观点已经成形，哪些问题还在等待补生成，
          以及你的哲学思考正在往哪里移动。
        </p>
        <div className="archive-stats" aria-label="思想档案统计">
          <span><Archive size={16} /> {items.length} 条记录</span>
          <span><Sparkles size={16} /> {completedCount} 条已生成</span>
          <span><Clock3 size={16} /> {pendingCount} 条待补生成</span>
        </div>
      </header>

      {loading ? (
        <section className="archive-empty" role="status">
          <CircleDot size={22} />
          <h2>正在读取思想节点</h2>
          <p>我在翻你的思想版本日志，稍等一口气。</p>
        </section>
      ) : null}

      {!loading && error ? (
        <section className="archive-empty error" role="alert">
          <CircleDot size={22} />
          <h2>思想档案暂时不可用</h2>
          <p>{error}</p>
        </section>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <section className="archive-empty">
          <CircleDot size={22} />
          <h2>还没有思想节点</h2>
          <p>完成一次对话并保存后，这里会出现第一条思想变化记录。</p>
        </section>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <section className="archive-insights" aria-label="思想档案洞察">
          <article>
            <span>反复出现的主题</span>
            <h2>{topicHighlights[0]?.label ?? "主题仍在形成"}</h2>
            <div>
              {topicHighlights.length > 0
                ? topicHighlights.map((topic) => (
                    <small key={topic.label}>{topic.label} × {topic.count}</small>
                  ))
                : <small>完成更多对话后会自动聚合</small>}
            </div>
          </article>
          <article>
            <span>思想张力</span>
            <h2>{tensionHighlights[0]?.label ?? "暂无反复张力"}</h2>
            <div>
              {tensionHighlights.length > 0
                ? tensionHighlights.map((tension) => (
                    <small key={tension.label}>{tension.label} × {tension.count}</small>
                  ))
                : <small>节点里的未解决问题会在这里沉淀</small>}
            </div>
          </article>
          <article>
            <span>观点变化</span>
            <h2>{changedCount} 次</h2>
            <p>已识别的立场移动会在节点详情中保留证据。</p>
          </article>
        </section>
      ) : null}

      {!loading && !error && evolutionItems.length > 0 ? (
        <ThoughtEvolutionMap items={evolutionItems} />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <section className="thought-timeline" aria-label="思想节点时间线">
          {items.map((item) => (
            <TimelineCard
              expanded={expandedSnapshotId === item.snapshot.snapshot_id}
              item={item}
              key={item.snapshot.snapshot_id}
              onToggle={() =>
                setExpandedSnapshotId((current) =>
                  current === item.snapshot.snapshot_id ? null : item.snapshot.snapshot_id,
                )
              }
            />
          ))}
        </section>
      ) : null}
    </main>
  );
}

type TimelineCardProps = {
  item: ReflectionSnapshotListItem;
  expanded: boolean;
  onToggle: () => void;
};

function ThoughtEvolutionMap({ items }: { items: CompletedSnapshotItem[] }) {
  const latest = items.at(-1);
  const topicTrail = collectAggregates(items.map((item) => item.snapshot.content.topic), 4);
  const tensionTrail = collectAggregates(
    items.flatMap((item) => item.snapshot.content.tensions),
    4,
  );
  const decisionTrail = collectAggregates(
    items
      .map((item) =>
        item.snapshot.user_decision ? snapshotDecisionLabels[item.snapshot.user_decision] : "",
      )
      .filter(Boolean),
    4,
  );
  const changeEvidence = items.filter((item) => item.snapshot.content.change_signal.changed);

  return (
    <section className="thought-evolution-map" aria-label={"\u601d\u60f3\u6f14\u5316\u5730\u56fe"}>
      <header className="evolution-map-header">
        <div>
          <p className="section-kicker">EVOLUTION MAP</p>
          <h2>{"\u601d\u60f3\u6f14\u5316\u5730\u56fe"}</h2>
        </div>
        <p>
          {"\u8fd9\u91cc\u4e0d\u628a\u8282\u70b9\u5f53\u4f5c\u804a\u5929\u8bb0\u5f55\uff0c\u800c\u662f\u628a\u5b83\u4eec\u770b\u6210\u4e00\u7ec4\u601d\u60f3\u8bc1\u636e\uff1a\u4e3b\u9898\u5982\u4f55\u53cd\u590d\u51fa\u73b0\uff0c\u5f20\u529b\u5982\u4f55\u6c89\u6dc0\uff0c\u4ee5\u53ca\u4f60\u662f\u5426\u63a5\u53d7 AI \u5bf9\u81ea\u5df1\u7684\u6982\u62ec\u3002"}
        </p>
      </header>

      {latest ? (
        <article className="evolution-current-axis">
          <span>{"\u5f53\u524d\u601d\u60f3\u5750\u6807"}</span>
          <h3>{latest.snapshot.content.topic}</h3>
          <p>{latest.snapshot.content.user_position}</p>
        </article>
      ) : null}

      <div className="evolution-node-lane" aria-label={"\u6700\u8fd1\u601d\u60f3\u8282\u70b9\u8f68\u8ff9"}>
        {items.map((item, index) => {
          const content = item.snapshot.content;
          const decision = item.snapshot.user_decision;
          return (
            <article
              className={`evolution-node ${content.change_signal.changed ? "changed" : "stable"}`}
              key={item.snapshot.snapshot_id}
            >
              <span className="evolution-node-index">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <small>{formatSnapshotTime(item.created_at)}</small>
                <strong>{content.topic}</strong>
                <p>{content.title}</p>
              </div>
              <footer>
                <span>
                  {content.change_signal.changed
                    ? "\u89c2\u70b9\u6709\u79fb\u52a8"
                    : "\u89c2\u70b9\u8f83\u7a33\u5b9a"}
                </span>
                {decision ? <em>{snapshotDecisionLabels[decision]}</em> : null}
              </footer>
            </article>
          );
        })}
      </div>

      {changeEvidence.length > 0 ? (
        <div className="evolution-evidence" aria-label={"\u89c2\u70b9\u53d8\u5316\u8bc1\u636e"}>
          <header>
            <span>{"\u53d8\u5316\u8bc1\u636e"}</span>
            <strong>{"\u7cfb\u7edf\u4e3a\u4ec0\u4e48\u8ba4\u4e3a\u4f60\u53d1\u751f\u4e86\u89c2\u70b9\u79fb\u52a8"}</strong>
          </header>
          <div>
            {changeEvidence.slice(-3).map((item) => {
              const signal = item.snapshot.content.change_signal;
              return (
                <article key={`${item.snapshot.snapshot_id}-evidence`}>
                  <small>{formatSnapshotTime(item.created_at)}</small>
                  <h3>{signal.change_type ?? "\u89c2\u70b9\u53d8\u5316"}</h3>
                  <dl>
                    <div>
                      <dt>{"\u4e4b\u524d"}</dt>
                      <dd>{signal.previous_position ?? "\u6ca1\u6709\u53ef\u6bd4\u5bf9\u7684\u65e9\u671f\u7acb\u573a"}</dd>
                    </div>
                    <div>
                      <dt>{"\u73b0\u5728"}</dt>
                      <dd>{signal.current_position ?? item.snapshot.content.user_position}</dd>
                    </div>
                  </dl>
                  <p>{item.snapshot.content.core_question}</p>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="evolution-ledger" aria-label={"\u601d\u60f3\u6f14\u5316\u8d26\u672c"}>
        <article>
          <span>{"\u4e3b\u9898\u56de\u58f0"}</span>
          <strong>{topicTrail[0]?.label ?? "\u4e3b\u9898\u4ecd\u5728\u5f62\u6210"}</strong>
          <div>
            {topicTrail.map((topic) => (
              <small key={topic.label}>{topic.label} × {topic.count}</small>
            ))}
          </div>
        </article>
        <article>
          <span>{"\u672a\u89e3\u5f20\u529b"}</span>
          <strong>{tensionTrail[0]?.label ?? "\u6682\u65e0\u53cd\u590d\u5f20\u529b"}</strong>
          <div>
            {tensionTrail.length > 0
              ? tensionTrail.map((tension) => (
                  <small key={tension.label}>{tension.label} × {tension.count}</small>
                ))
              : <small>{"\u540e\u7eed\u8282\u70b9\u4f1a\u6c89\u6dc0\u771f\u6b63\u53cd\u590d\u51fa\u73b0\u7684\u95ee\u9898"}</small>}
          </div>
        </article>
        <article>
          <span>{"\u6821\u5bf9\u6001\u5ea6"}</span>
          <strong>{decisionTrail[0]?.label ?? "\u7b49\u5f85\u4f60\u7684\u5224\u65ad"}</strong>
          <div>
            {decisionTrail.length > 0
              ? decisionTrail.map((decision) => (
                  <small key={decision.label}>{decision.label} × {decision.count}</small>
                ))
              : <small>{"\u8ba4\u53ef\u3001\u4fee\u6539\u3001\u4e0d\u540c\u610f\u90fd\u4f1a\u6210\u4e3a\u601d\u60f3\u6863\u6848\u7684\u4e00\u90e8\u5206"}</small>}
          </div>
        </article>
      </div>
    </section>
  );
}
function TimelineCard({ item, expanded, onToggle }: TimelineCardProps) {
  const content = item.snapshot.content;
  return (
    <article className={`timeline-card ${item.snapshot.status} ${expanded ? "expanded" : ""}`}>
      <div className="timeline-rail" aria-hidden="true">
        <span />
      </div>
      <div className="timeline-card-body">
        <div className="timeline-meta">
          <span>{formatSnapshotTime(item.created_at)}</span>
          <strong>{item.snapshot.status === "completed" ? "已生成" : "待补生成"}</strong>
          {item.snapshot.user_decision ? (
            <em className={`snapshot-decision-badge ${item.snapshot.user_decision}`}>
              {snapshotDecisionLabels[item.snapshot.user_decision]}
            </em>
          ) : null}
        </div>
        <h2>{content?.title ?? item.question}</h2>
        <p>{content?.user_position ?? item.snapshot.pending_reason ?? "原始记录已保存，等待模型补生成。"}</p>

        {content ? (
          <>
            <div className="timeline-topic-row">
              <span>{content.topic}</span>
              <span>置信度 {Math.round(content.confidence * 100)}%</span>
              {content.emotional_tone ? <span>{content.emotional_tone}</span> : null}
            </div>
            {content.tensions.length > 0 ? (
              <div className="timeline-tensions">
                <strong>仍在拉扯的问题</strong>
                <ul>
                  {content.tensions.slice(0, 3).map((tension) => (
                    <li key={tension}>{tension}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {content.next_question ? (
              <div className="timeline-next-question">下一步：{content.next_question}</div>
            ) : null}
          </>
        ) : null}

        <button
          className="timeline-detail-toggle"
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded ? "收起思想节点" : "展开思想节点"}
          <ChevronDown size={16} />
        </button>

        {expanded ? <TimelineDetail item={item} /> : null}
      </div>
    </article>
  );
}

function TimelineDetail({ item }: { item: ReflectionSnapshotListItem }) {
  const content = item.snapshot.content;

  return (
    <div className="timeline-detail-panel">
      <section>
        <strong>核心问题</strong>
        <p>{content?.core_question ?? item.question}</p>
      </section>

      {content?.change_signal.changed ? (
        <section>
          <strong>观点变化</strong>
          <p>
            {content.change_signal.previous_position
              ? `从“${content.change_signal.previous_position}”`
              : "这次出现了新的立场变化"}
            {content.change_signal.current_position
              ? ` 转向“${content.change_signal.current_position}”。`
              : "。"}
            {content.change_signal.change_type ? ` 类型：${content.change_signal.change_type}。` : ""}
          </p>
        </section>
      ) : null}

      {content?.key_insights.length ? (
        <section>
          <strong>关键洞见</strong>
          <ul>
            {content.key_insights.map((insight) => (
              <li key={insight}>{insight}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {content?.related_philosophers.length ? (
        <section>
          <strong>相关哲学家</strong>
          <div className="timeline-philosophers">
            {content.related_philosophers.map((philosopher) => (
              <span key={`${philosopher.name}-${philosopher.reason}`}>
                <b>{philosopher.name}</b>
                {philosopher.reason}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {content?.tags.length ? (
        <section>
          <strong>标签</strong>
          <div className="timeline-tags">
            {content.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <strong>模型来源</strong>
        <p>
          {item.snapshot.provider_model ?? item.snapshot.provider}
          {item.snapshot.status === "pending" && item.snapshot.pending_reason
            ? `；待补生成原因：${item.snapshot.pending_reason}`
            : ""}
        </p>
      </section>

      {item.snapshot.user_decision ? (
        <section>
          <strong>AI 总结处理态度</strong>
          <p>
            {snapshotDecisionLabels[item.snapshot.user_decision]}
            {item.snapshot.decision_updated_at
              ? `；${formatSnapshotTime(item.snapshot.decision_updated_at)} 更新`
              : ""}
          </p>
        </section>
      ) : null}
    </div>
  );
}
