import { Archive, ChevronDown, CircleDot, Clock3, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from "react";

type SnapshotStatus = "completed" | "pending";
type SnapshotDecision = "approved" | "edit" | "rejected" | "raw_only";
type SnapshotReviewVerdict = "accurate" | "inaccurate" | "rewrite" | "raw_only";

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
    snapshot_review: {
      verdict: SnapshotReviewVerdict;
      note: string | null;
      updated_at: string;
    } | null;
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

type GraphNodeKind = "snapshot" | "topic" | "tension" | "philosopher" | "tag";

type ThoughtGraphNode = {
  id: string;
  label: string;
  kind: GraphNodeKind;
  weight: number;
  description: string;
};

type ThoughtGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: string;
};

type GraphPosition = {
  x: number;
  y: number;
};

const graphNodeKindLabels: Record<GraphNodeKind, string> = {
  snapshot: "思想节点",
  topic: "主题",
  tension: "思想张力",
  philosopher: "哲学家",
  tag: "标签",
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

function graphNodeId(kind: GraphNodeKind, value: string) {
  return `${kind}:${value}`;
}

function addGraphNode(nodes: Map<string, ThoughtGraphNode>, node: ThoughtGraphNode) {
  const existing = nodes.get(node.id);
  if (existing) {
    nodes.set(node.id, {
      ...existing,
      weight: existing.weight + node.weight,
    });
    return;
  }
  nodes.set(node.id, node);
}

function buildThoughtGraph(items: CompletedSnapshotItem[]) {
  const nodes = new Map<string, ThoughtGraphNode>();
  const edges = new Map<string, ThoughtGraphEdge>();

  items.slice(-8).forEach((item) => {
    const content = item.snapshot.content;
    const snapshotId = graphNodeId("snapshot", item.snapshot.snapshot_id);
    addGraphNode(nodes, {
      id: snapshotId,
      label: content.title,
      kind: "snapshot",
      weight: 3,
      description: content.user_position,
    });

    const topicId = graphNodeId("topic", content.topic);
    addGraphNode(nodes, {
      id: topicId,
      label: content.topic,
      kind: "topic",
      weight: 2,
      description: content.core_question,
    });
    edges.set(`${snapshotId}->${topicId}`, {
      id: `${snapshotId}->${topicId}`,
      source: snapshotId,
      target: topicId,
      relation: "主题",
    });

    content.tensions.slice(0, 3).forEach((tension) => {
      const tensionId = graphNodeId("tension", tension);
      addGraphNode(nodes, {
        id: tensionId,
        label: tension,
        kind: "tension",
        weight: 1.4,
        description: `反复拉扯：${content.core_question}`,
      });
      edges.set(`${topicId}->${tensionId}`, {
        id: `${topicId}->${tensionId}`,
        source: topicId,
        target: tensionId,
        relation: "张力",
      });
    });

    content.related_philosophers.slice(0, 3).forEach((philosopher) => {
      const philosopherId = graphNodeId("philosopher", philosopher.name);
      addGraphNode(nodes, {
        id: philosopherId,
        label: philosopher.name,
        kind: "philosopher",
        weight: 1.6,
        description: philosopher.reason,
      });
      edges.set(`${topicId}->${philosopherId}`, {
        id: `${topicId}->${philosopherId}`,
        source: topicId,
        target: philosopherId,
        relation: "哲学家",
      });
    });

    content.tags.slice(0, 3).forEach((tag) => {
      const tagId = graphNodeId("tag", tag);
      addGraphNode(nodes, {
        id: tagId,
        label: tag,
        kind: "tag",
        weight: 1,
        description: `来自思想节点《${content.title}》的标签。`,
      });
      edges.set(`${topicId}->${tagId}`, {
        id: `${topicId}->${tagId}`,
        source: topicId,
        target: tagId,
        relation: "标签",
      });
    });
  });

  const sortedNodes = [...nodes.values()]
    .sort((first, second) => {
      const kindOrder: Record<GraphNodeKind, number> = {
        topic: 0,
        snapshot: 1,
        tension: 2,
        philosopher: 3,
        tag: 4,
      };
      return kindOrder[first.kind] - kindOrder[second.kind] || second.weight - first.weight;
    })
    .slice(0, 26);
  const allowedNodeIds = new Set(sortedNodes.map((node) => node.id));
  return {
    nodes: sortedNodes,
    edges: [...edges.values()].filter(
      (edge) => allowedNodeIds.has(edge.source) && allowedNodeIds.has(edge.target),
    ),
  };
}

function buildInitialGraphPositions(nodes: ThoughtGraphNode[]): Record<string, GraphPosition> {
  const positions: Record<string, GraphPosition> = {};
  const centerX = 480;
  const centerY = 235;
  const rings: Record<GraphNodeKind, number> = {
    topic: 92,
    snapshot: 166,
    tension: 244,
    philosopher: 292,
    tag: 328,
  };

  nodes.forEach((node, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = rings[node.kind] + (index % 3) * 12;
    positions[node.id] = {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius * 0.58,
    };
  });
  return positions;
}

const snapshotDecisionLabels: Record<SnapshotDecision, string> = {
  approved: "\u5df2\u8ba4\u53ef",
  edit: "\u5f85\u4fee\u6539",
  rejected: "\u4e0d\u540c\u610f",
  raw_only: "\u53ea\u4fdd\u7559\u539f\u6587",
};

const snapshotReviewLabels: Record<SnapshotReviewVerdict, string> = {
  accurate: "准确",
  inaccurate: "不准确",
  rewrite: "需要重写",
  raw_only: "只保留原文",
};

type SnapshotReviewResponse = {
  snapshot_id: string;
  snapshot_review: NonNullable<ReflectionSnapshotListItem["snapshot"]["snapshot_review"]>;
};

export function ThoughtArchivePage({ apiBaseUrl }: ThoughtArchivePageProps) {
  const [items, setItems] = useState<ReflectionSnapshotListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);
  const [focusedGraphSnapshotId, setFocusedGraphSnapshotId] = useState<string | null>(null);
  const [highlightedSnapshotIds, setHighlightedSnapshotIds] = useState<string[]>([]);
  const timelineCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const highlightTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

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
  const graphData = useMemo(() => buildThoughtGraph(completedSnapshotItems), [completedSnapshotItems]);

  function updateSnapshotReview(snapshotId: string, review: SnapshotReviewResponse["snapshot_review"]) {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.snapshot.snapshot_id === snapshotId
          ? { ...item, snapshot: { ...item.snapshot, snapshot_review: review } }
          : item,
      ),
    );
  }

  function focusTimelineSnapshots(snapshotIds: string[]) {
    const uniqueSnapshotIds = [...new Set(snapshotIds)].filter(Boolean);
    const firstSnapshotId = uniqueSnapshotIds[0];
    if (!firstSnapshotId) return;

    setExpandedSnapshotId(firstSnapshotId);
    setFocusedGraphSnapshotId(firstSnapshotId);
    setHighlightedSnapshotIds(uniqueSnapshotIds);

    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        timelineCardRefs.current[firstSnapshotId]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    });

    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedSnapshotIds([]);
      highlightTimerRef.current = null;
    }, 2600);
  }

  function toggleTimelineSnapshot(snapshotId: string) {
    setExpandedSnapshotId((current) => {
      const nextSnapshotId = current === snapshotId ? null : snapshotId;
      setFocusedGraphSnapshotId(nextSnapshotId);
      return nextSnapshotId;
    });
  }

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

      {!loading && !error && graphData.nodes.length > 0 ? (
        <ThoughtRelationGraph
          focusedSnapshotId={focusedGraphSnapshotId}
          graph={graphData}
          items={completedSnapshotItems}
          onNavigateSnapshots={focusTimelineSnapshots}
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <section className="thought-timeline" aria-label="思想节点时间线">
          {items.map((item) => (
            <TimelineCard
              apiBaseUrl={apiBaseUrl}
              expanded={expandedSnapshotId === item.snapshot.snapshot_id}
              highlighted={highlightedSnapshotIds.includes(item.snapshot.snapshot_id)}
              item={item}
              key={item.snapshot.snapshot_id}
              onReviewSaved={updateSnapshotReview}
              registerCard={(node) => {
                timelineCardRefs.current[item.snapshot.snapshot_id] = node;
              }}
              onToggle={() => toggleTimelineSnapshot(item.snapshot.snapshot_id)}
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
  highlighted: boolean;
  apiBaseUrl: string;
  onReviewSaved: (
    snapshotId: string,
    review: SnapshotReviewResponse["snapshot_review"],
  ) => void;
  registerCard: (node: HTMLElement | null) => void;
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

function ThoughtRelationGraph({
  focusedSnapshotId,
  graph,
  items,
  onNavigateSnapshots,
}: {
  focusedSnapshotId: string | null;
  graph: ReturnType<typeof buildThoughtGraph>;
  items: CompletedSnapshotItem[];
  onNavigateSnapshots: (snapshotIds: string[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [positions, setPositions] = useState<Record<string, GraphPosition>>({});
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [pulseNodeId, setPulseNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const dragState = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const positionsRef = useRef<Record<string, GraphPosition>>({});
  const velocityRef = useRef<Record<string, GraphPosition>>({});
  const springFrameRef = useRef<number | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const lastDragDeltaRef = useRef({ x: 0, y: 0 });

  const initialPositions = useMemo(() => buildInitialGraphPositions(graph.nodes), [graph.nodes]);

  useEffect(() => {
    setPositions(initialPositions);
    positionsRef.current = initialPositions;
    velocityRef.current = {};
    setActiveNodeId(null);
    setHoverNodeId(null);
    setPulseNodeId(null);
    setDraggingNodeId(null);
    setZoom(1);
    if (springFrameRef.current) {
      cancelAnimationFrame(springFrameRef.current);
      springFrameRef.current = null;
    }
  }, [initialPositions]);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    return () => {
      if (springFrameRef.current) {
        cancelAnimationFrame(springFrameRef.current);
      }
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
      }
      if (pulseTimerRef.current) {
        window.clearTimeout(pulseTimerRef.current);
      }
    };
  }, []);

  const externalFocusedNodeId = focusedSnapshotId ? `snapshot:${focusedSnapshotId}` : null;
  const focusedNodeId = hoverNodeId ?? activeNodeId ?? externalFocusedNodeId;
  const focusedNode = graph.nodes.find((node) => node.id === focusedNodeId) ?? null;
  const connectedNodeIds = useMemo(() => {
    if (!focusedNodeId) return new Set<string>();
    const connected = new Set<string>([focusedNodeId]);
    graph.edges.forEach((edge) => {
      if (edge.source === focusedNodeId) connected.add(edge.target);
      if (edge.target === focusedNodeId) connected.add(edge.source);
    });
    return connected;
  }, [focusedNodeId, graph.edges]);
  const selectedSnapshots = useMemo(() => {
    if (!focusedNode) return [];
    return snapshotsForNode(focusedNode.id);
  }, [focusedNode, items]);

  const focusedPosition = focusedNodeId ? positionFor(focusedNodeId) : null;
  const tooltipPosition = focusedPosition
    ? {
        x: 480 + (focusedPosition.x - 480) * zoom,
        y: 235 + (focusedPosition.y - 235) * zoom,
      }
    : null;

  function pointerToGraphPoint(event: PointerEvent<SVGSVGElement | SVGGElement>) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const rawX = ((event.clientX - rect.left) / rect.width) * 960;
    const rawY = ((event.clientY - rect.top) / rect.height) * 470;
    return {
      x: 480 + (rawX - 480) / zoom,
      y: 235 + (rawY - 235) / zoom,
    };
  }

  function positionFor(nodeId: string) {
    return positions[nodeId] ?? { x: 480, y: 235 };
  }

  function beginDrag(nodeId: string, event: PointerEvent<SVGGElement>) {
    if (springFrameRef.current) {
      cancelAnimationFrame(springFrameRef.current);
      springFrameRef.current = null;
    }
    const position = positionFor(nodeId);
    const point = pointerToGraphPoint(event);
    dragState.current = {
      nodeId,
      offsetX: point.x - position.x,
      offsetY: point.y - position.y,
    };
    velocityRef.current = {};
    dragMovedRef.current = false;
    lastDragDeltaRef.current = { x: 0, y: 0 };
    setActiveNodeId(nodeId);
    setHoverNodeId(nodeId);
    setDraggingNodeId(nodeId);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function activateNode(nodeId: string) {
    setActiveNodeId(nodeId);
    setHoverNodeId(nodeId);
    setPulseNodeId(nodeId);
    const relatedSnapshotIds = snapshotsForNode(nodeId).map((item) => item.snapshot.snapshot_id);
    onNavigateSnapshots(relatedSnapshotIds);
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => {
      setPulseNodeId(null);
      pulseTimerRef.current = null;
    }, 760);
  }

  function snapshotsForNode(nodeId: string) {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return [];
    if (node.kind === "snapshot") {
      const snapshotId = node.id.replace("snapshot:", "");
      return items.filter((item) => item.snapshot.snapshot_id === snapshotId);
    }
    return items.filter((item) => {
      const content = item.snapshot.content;
      if (node.kind === "topic") return content.topic === node.label;
      if (node.kind === "tension") return content.tensions.includes(node.label);
      if (node.kind === "philosopher") {
        return content.related_philosophers.some((philosopher) => philosopher.name === node.label);
      }
      return content.tags.includes(node.label);
    });
  }

  function scheduleNodePreview(nodeId: string) {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setHoverNodeId(nodeId);
      hoverTimerRef.current = null;
    }, 100);
  }

  function clearNodePreview() {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (!dragState.current) setHoverNodeId(null);
  }

  function graphPullStrength(nodeId: string, draggedNodeId: string) {
    if (nodeId === draggedNodeId) return 1;
    const connected = graph.edges.some(
      (edge) =>
        (edge.source === draggedNodeId && edge.target === nodeId) ||
        (edge.target === draggedNodeId && edge.source === nodeId),
    );
    if (connected) return 0.48;
    const draggedBase = initialPositions[draggedNodeId] ?? { x: 480, y: 235 };
    const nodeBase = initialPositions[nodeId] ?? { x: 480, y: 235 };
    const distance = Math.hypot(nodeBase.x - draggedBase.x, nodeBase.y - draggedBase.y);
    return Math.max(0.08, 0.24 - distance / 2200);
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    const currentDrag = dragState.current;
    if (!currentDrag) return;
    const point = pointerToGraphPoint(event);
    const draggedBase = initialPositions[currentDrag.nodeId] ?? positionFor(currentDrag.nodeId);
    const draggedTarget = {
      x: Math.min(920, Math.max(40, point.x - currentDrag.offsetX)),
      y: Math.min(430, Math.max(40, point.y - currentDrag.offsetY)),
    };
    const delta = {
      x: draggedTarget.x - draggedBase.x,
      y: draggedTarget.y - draggedBase.y,
    };
    if (Math.hypot(delta.x, delta.y) > 3) {
      dragMovedRef.current = true;
    }
    const previousDelta = lastDragDeltaRef.current;
    lastDragDeltaRef.current = delta;
    const nextPositions: Record<string, GraphPosition> = {};
    const nextVelocities: Record<string, GraphPosition> = {};

    graph.nodes.forEach((node) => {
      const base = initialPositions[node.id] ?? { x: 480, y: 235 };
      const strength = graphPullStrength(node.id, currentDrag.nodeId);
      const sway = node.id === currentDrag.nodeId ? 0 : Math.sin((base.x + base.y + delta.x) / 95) * 4 * strength;
      nextPositions[node.id] = {
        x: Math.min(930, Math.max(30, base.x + delta.x * strength + sway)),
        y: Math.min(440, Math.max(30, base.y + delta.y * strength - sway * 0.5)),
      };
      nextVelocities[node.id] = {
        x: (delta.x - previousDelta.x) * strength * 0.12,
        y: (delta.y - previousDelta.y) * strength * 0.12,
      };
    });
    velocityRef.current = nextVelocities;
    positionsRef.current = nextPositions;
    setPositions(nextPositions);
  }

  function endDrag() {
    dragState.current = null;
    setDraggingNodeId(null);
    startSpringBack();
  }

  function startSpringBack() {
    if (springFrameRef.current) {
      cancelAnimationFrame(springFrameRef.current);
    }
    const stiffness = 0.055;
    const damping = 0.78;

    function tick() {
      let moving = false;
      const nextPositions: Record<string, GraphPosition> = {};
      const nextVelocities: Record<string, GraphPosition> = {};

      graph.nodes.forEach((node) => {
        const current = positionsRef.current[node.id] ?? initialPositions[node.id] ?? { x: 480, y: 235 };
        const target = initialPositions[node.id] ?? current;
        const velocity = velocityRef.current[node.id] ?? { x: 0, y: 0 };
        const nextVelocity = {
          x: (velocity.x + (target.x - current.x) * stiffness) * damping,
          y: (velocity.y + (target.y - current.y) * stiffness) * damping,
        };
        const nextPosition = {
          x: current.x + nextVelocity.x,
          y: current.y + nextVelocity.y,
        };
        const nodeMoving =
          Math.abs(nextVelocity.x) > 0.08 ||
          Math.abs(nextVelocity.y) > 0.08 ||
          Math.hypot(nextPosition.x - target.x, nextPosition.y - target.y) > 0.8;

        if (nodeMoving) moving = true;
        nextPositions[node.id] = nodeMoving ? nextPosition : target;
        nextVelocities[node.id] = nodeMoving ? nextVelocity : { x: 0, y: 0 };
      });

      positionsRef.current = nextPositions;
      velocityRef.current = nextVelocities;
      setPositions(nextPositions);
      if (moving) {
        springFrameRef.current = requestAnimationFrame(tick);
      } else {
        springFrameRef.current = null;
      }
    }

    springFrameRef.current = requestAnimationFrame(tick);
  }

  function resetLayout() {
    if (springFrameRef.current) {
      cancelAnimationFrame(springFrameRef.current);
      springFrameRef.current = null;
    }
    positionsRef.current = initialPositions;
    velocityRef.current = {};
    setPositions(initialPositions);
    setActiveNodeId(null);
    setHoverNodeId(null);
    setPulseNodeId(null);
    setZoom(1);
  }

  function changeZoom(delta: number) {
    setZoom((currentZoom) => Math.min(1.9, Math.max(0.62, Number((currentZoom + delta).toFixed(2)))));
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    changeZoom(event.deltaY > 0 ? -0.08 : 0.08);
  }

  return (
    <section className="thought-relation-graph" aria-label="思想关系图谱">
      <header className="relation-graph-header">
        <div>
          <p className="section-kicker">OBSIDIAN GRAPH</p>
          <h2>思想关系图谱</h2>
        </div>
        <p>
          悬停 100ms 浮出节点信息；抓住一个节点时，整张网会被柔和牵动，松手后带着惯性回到思想坐标。
        </p>
        <div className="relation-graph-controls" aria-label="图谱控制">
          <button type="button" onClick={() => changeZoom(-0.12)} aria-label="缩小图谱">－</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => changeZoom(0.12)} aria-label="放大图谱">＋</button>
          <button type="button" onClick={resetLayout}>重置视图</button>
        </div>
      </header>

      <div className="relation-graph-workspace">
        <div className="relation-graph-stage">
          <div className="relation-graph-ambient" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <svg
            ref={svgRef}
            className="relation-graph-canvas"
            viewBox="0 0 960 470"
            role="img"
            aria-label="可拖动思想关系图谱"
            onWheel={handleWheel}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerLeave={() => {
              endDrag();
              clearNodePreview();
            }}
          >
            <defs>
              <radialGradient id="graphNodeGlow" cx="50%" cy="45%" r="62%">
                <stop offset="0%" stopColor="#fffdf7" />
                <stop offset="100%" stopColor="#e7d8bc" />
              </radialGradient>
            </defs>
            <g transform={`translate(480 235) scale(${zoom}) translate(-480 -235)`}>
              <g className="relation-graph-links">
                {graph.edges.map((edge, edgeIndex) => {
                  const source = positionFor(edge.source);
                  const target = positionFor(edge.target);
                  const active = focusedNodeId === edge.source || focusedNodeId === edge.target;
                  const dimmed = Boolean(focusedNodeId) && !active;
                  const lineProps = {
                    x1: source.x,
                    x2: target.x,
                    y1: source.y,
                    y2: target.y,
                  };
                  return (
                    <g key={edge.id} className="relation-graph-link">
                      <line
                        className={`${active ? "active" : ""}${dimmed ? " dimmed" : ""}`}
                        pathLength={1}
                        style={{ animationDelay: `${edgeIndex * 70}ms` }}
                        {...lineProps}
                      />
                      <line
                        className={`relation-flow-line${active ? " active" : ""}${dimmed ? " dimmed" : ""}`}
                        pathLength={1}
                        style={{ animationDelay: `${edgeIndex * 230}ms` }}
                        {...lineProps}
                      />
                    </g>
                  );
                })}
              </g>
              <g className="relation-graph-nodes">
                {graph.nodes.map((node, nodeIndex) => {
                  const position = positionFor(node.id);
                  const active = node.id === focusedNodeId;
                  const connected = connectedNodeIds.has(node.id);
                  const dimmed = Boolean(focusedNodeId) && !connected;
                  const dragging = node.id === draggingNodeId;
                  const pulsing = node.id === pulseNodeId;
                  const radius = Math.min(21, 8.5 + node.weight * 2);
                  const nodeMotionStyle = {
                    "--node-enter-delay": `${Math.min(720, 80 + nodeIndex * 45)}ms`,
                    "--node-float-duration": `${10 + (nodeIndex % 5) * 1.8}s`,
                    "--node-breathe-duration": `${6.8 + (nodeIndex % 4) * 0.9}s`,
                    "--node-float-x": `${((nodeIndex % 3) - 1) * 2.6}px`,
                    "--node-float-y": `${nodeIndex % 2 === 0 ? -3.2 : 2.8}px`,
                  } as CSSProperties;
                  return (
                    <g
                      className={`thought-graph-node ${node.kind}${active ? " active" : ""}${connected ? " connected" : ""}${dimmed ? " dimmed" : ""}${dragging ? " dragging" : ""}${pulsing ? " pulsing" : ""}`}
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${node.label}，${graphNodeKindLabels[node.kind]}节点，可拖动`}
                      transform={`translate(${position.x} ${position.y})`}
                      onClick={() => {
                        if (dragMovedRef.current) {
                          dragMovedRef.current = false;
                          return;
                        }
                        activateNode(node.id);
                      }}
                      onFocus={() => setHoverNodeId(node.id)}
                      onBlur={clearNodePreview}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          activateNode(node.id);
                        }
                      }}
                      onPointerEnter={() => scheduleNodePreview(node.id)}
                      onPointerLeave={clearNodePreview}
                      onPointerDown={(event) => beginDrag(node.id, event)}
                    >
                      <g className="node-body" style={nodeMotionStyle}>
                        {pulsing ? <circle className="graph-node-ripple" r={radius + 5} /> : null}
                        <circle className="graph-node-core" r={radius} />
                        <text y={radius + 16}>{node.label.length > 8 ? `${node.label.slice(0, 8)}…` : node.label}</text>
                      </g>
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>

          {hoverNodeId && focusedNode && tooltipPosition ? (
            <div
              className="relation-graph-tooltip"
              role="status"
              style={{
                left: `${(tooltipPosition.x / 960) * 100}%`,
                top: `${(tooltipPosition.y / 470) * 100}%`,
              }}
            >
              <div className="relation-graph-tooltip-heading">
                <span>{graphNodeKindLabels[focusedNode.kind]}</span>
                <strong>{focusedNode.label}</strong>
              </div>
              <p>{focusedNode.description}</p>
              {selectedSnapshots.length > 0 ? (
                <div className="relation-graph-tooltip-links">
                  <span>{selectedSnapshots.length} 个关联思想</span>
                  {selectedSnapshots.slice(0, 2).map((item) => (
                    <small key={item.snapshot.snapshot_id}>{item.snapshot.content.title}</small>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="relation-graph-hint">悬停节点查看思想卡片，拖动节点感受整张网的弹性牵引。</p>
          )}
        </div>
      </div>
    </section>
  );
}

function TimelineCard({
  item,
  expanded,
  highlighted,
  apiBaseUrl,
  onReviewSaved,
  registerCard,
  onToggle,
}: TimelineCardProps) {
  const content = item.snapshot.content;
  return (
    <article
      className={`timeline-card ${item.snapshot.status} ${expanded ? "expanded" : ""}${highlighted ? " graph-focused" : ""}`}
      ref={registerCard}
    >
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

        {expanded ? (
          <TimelineDetail apiBaseUrl={apiBaseUrl} item={item} onReviewSaved={onReviewSaved} />
        ) : null}
      </div>
    </article>
  );
}

function TimelineDetail({
  item,
  apiBaseUrl,
  onReviewSaved,
}: {
  item: ReflectionSnapshotListItem;
  apiBaseUrl: string;
  onReviewSaved: (
    snapshotId: string,
    review: SnapshotReviewResponse["snapshot_review"],
  ) => void;
}) {
  const content = item.snapshot.content;
  const [reviewVerdict, setReviewVerdict] = useState<SnapshotReviewVerdict>(
    item.snapshot.snapshot_review?.verdict ?? "accurate",
  );
  const [reviewNote, setReviewNote] = useState(item.snapshot.snapshot_review?.note ?? "");
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [savingReview, setSavingReview] = useState(false);

  async function saveSnapshotReview() {
    if (savingReview) return;
    setSavingReview(true);
    setReviewStatus(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/reflection-snapshots/${item.snapshot.snapshot_id}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            verdict: reviewVerdict,
            note: reviewNote.trim() || null,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`Reflection snapshot review API returned ${response.status}`);
      }
      const payload = (await response.json()) as SnapshotReviewResponse;
      onReviewSaved(item.snapshot.snapshot_id, payload.snapshot_review);
      setReviewStatus("校对已写入思想档案。");
    } catch {
      setReviewStatus("校对暂未写入思想档案，请稍后重试。");
    } finally {
      setSavingReview(false);
    }
  }

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

      <section className="snapshot-review-panel" aria-label="思想节点校对">
        <div>
          <strong>思想节点校对</strong>
          <p>这里记录你对这个节点的最终判断。AI 可以概括你，但不能替你盖章。</p>
        </div>
        <div className="snapshot-review-options">
          {(Object.keys(snapshotReviewLabels) as SnapshotReviewVerdict[]).map((verdict) => (
            <button
              className={reviewVerdict === verdict ? "active" : ""}
              key={verdict}
              type="button"
              onClick={() => setReviewVerdict(verdict)}
            >
              {snapshotReviewLabels[verdict]}
            </button>
          ))}
        </div>
        <label>
          <span>你的批注</span>
          <textarea
            rows={3}
            value={reviewNote}
            placeholder="例如：这里 AI 把我的意思理解窄了；或者这个总结基本准确，但我还没想清楚责任边界。"
            onChange={(event) => setReviewNote(event.target.value)}
          />
        </label>
        <footer>
          <button type="button" disabled={savingReview} onClick={() => void saveSnapshotReview()}>
            {savingReview ? "正在写入" : "保存校对"}
          </button>
          {item.snapshot.snapshot_review ? (
            <span>{formatSnapshotTime(item.snapshot.snapshot_review.updated_at)} 已校对</span>
          ) : null}
          {reviewStatus ? <em>{reviewStatus}</em> : null}
        </footer>
      </section>
    </div>
  );
}
