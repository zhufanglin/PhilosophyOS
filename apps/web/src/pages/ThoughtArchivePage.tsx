import { Archive, ChevronDown, CircleDot, Clock3, Sparkles } from "lucide-react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";
import { ChevronLeft, ChevronRight, Download, RotateCcw, Search, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
    revisions: Array<{
      source: "user";
      updated_at: string;
      previous_user_position: string;
      previous_tensions: string[];
      previous_next_question: string | null;
    }>;
    generation_attempts: number;
    last_generation_attempt_at: string | null;
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

type ReflectionPhilosopherInfluenceResponse = {
  items: Array<{
    name: string;
    count: number;
    topics: string[];
    evidence: Array<{
      snapshot_id: string;
      created_at: string;
      title: string;
      topic: string;
      question: string;
      reason: string;
    }>;
  }>;
};

type ReflectionWeeklyReportDraft = {
  week_start: string;
  week_end: string;
  generated_at: string;
  enough_data: boolean;
  node_count: number;
  markdown: string;
  sources: Array<{
    snapshot_id: string;
    created_at: string;
    title: string;
    topic: string;
    question: string;
  }>;
  message: string | null;
};

type ThoughtArchivePageProps = {
  apiBaseUrl: string;
};

type ArchiveAggregate = {
  label: string;
  count: number;
};

type TensionInsight = {
  label: string;
  count: number;
  topics: string[];
  evidence: Array<{
    snapshotId: string;
    createdAt: string;
    title: string;
    topic: string;
    question: string;
    nextQuestion: string | null;
  }>;
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

type ForceThoughtNode = ThoughtGraphNode &
  Partial<GraphPosition> & {
    vx?: number;
    vy?: number;
    fx?: number;
    fy?: number;
  };

type ForceThoughtLink = Omit<ThoughtGraphEdge, "source" | "target"> & {
  source: string | ForceThoughtNode;
  target: string | ForceThoughtNode;
};

type GraphLabelBox = {
  x: number;
  y: number;
  width: number;
  height: number;
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

  function addGraphEdge(source: string, target: string, relation: string) {
    if (source === target) return;
    const id = `${source}->${target}:${relation}`;
    edges.set(id, {
      id,
      source,
      target,
      relation,
    });
  }

  items.slice(-8).forEach((item) => {
    const content = item.snapshot.content;
    const snapshotId = graphNodeId("snapshot", item.snapshot.snapshot_id);
    const tensionIds: string[] = [];
    const philosopherIds: string[] = [];
    const tagIds: string[] = [];
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
    addGraphEdge(snapshotId, topicId, "主题");

    content.tensions.slice(0, 3).forEach((tension) => {
      const tensionId = graphNodeId("tension", tension);
      tensionIds.push(tensionId);
      addGraphNode(nodes, {
        id: tensionId,
        label: tension,
        kind: "tension",
        weight: 1.4,
        description: `反复拉扯：${content.core_question}`,
      });
      addGraphEdge(topicId, tensionId, "张力");
    });

    content.related_philosophers.slice(0, 3).forEach((philosopher) => {
      const philosopherId = graphNodeId("philosopher", philosopher.name);
      philosopherIds.push(philosopherId);
      addGraphNode(nodes, {
        id: philosopherId,
        label: philosopher.name,
        kind: "philosopher",
        weight: 1.6,
        description: philosopher.reason,
      });
      addGraphEdge(topicId, philosopherId, "哲学家");
    });

    content.tags.slice(0, 3).forEach((tag) => {
      const tagId = graphNodeId("tag", tag);
      tagIds.push(tagId);
      addGraphNode(nodes, {
        id: tagId,
        label: tag,
        kind: "tag",
        weight: 1,
        description: `来自思想节点《${content.title}》的标签。`,
      });
      addGraphEdge(topicId, tagId, "标签");
    });

    const childNodeIds = [...tensionIds, ...philosopherIds, ...tagIds];
    childNodeIds.forEach((nodeId, index) => {
      const nextNodeId = childNodeIds[index + 1];
      if (nextNodeId) addGraphEdge(nodeId, nextNodeId, "共现");
    });
    if (childNodeIds.length > 2) {
      addGraphEdge(childNodeIds[childNodeIds.length - 1], childNodeIds[0], "共现闭环");
    }
    if (childNodeIds.length > 0) {
      addGraphEdge(snapshotId, childNodeIds[0], "思想证据");
      if (childNodeIds.length > 3) {
        addGraphEdge(snapshotId, childNodeIds[Math.floor(childNodeIds.length / 2)], "思想证据");
      }
    }
    tensionIds.forEach((tensionId, index) => {
      const philosopherId = philosopherIds[index % Math.max(philosopherIds.length, 1)];
      if (philosopherId) addGraphEdge(tensionId, philosopherId, "张力参照");
    });
    tagIds.forEach((tagId, index) => {
      const tensionId = tensionIds[index % Math.max(tensionIds.length, 1)];
      if (tensionId) addGraphEdge(tagId, tensionId, "标签线索");
    });
  });

  const degreeByNode = new Map<string, number>();
  edges.forEach((edge) => {
    degreeByNode.set(edge.source, (degreeByNode.get(edge.source) ?? 0) + 1);
    degreeByNode.set(edge.target, (degreeByNode.get(edge.target) ?? 0) + 1);
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
      return (
        (degreeByNode.get(second.id) ?? 0) - (degreeByNode.get(first.id) ?? 0) ||
        kindOrder[first.kind] - kindOrder[second.kind] ||
        second.weight - first.weight
      );
    })
    .slice(0, 32);
  const allowedNodeIds = new Set(sortedNodes.map((node) => node.id));
  return {
    nodes: sortedNodes,
    edges: [...edges.values()].filter(
      (edge) => allowedNodeIds.has(edge.source) && allowedNodeIds.has(edge.target),
    ),
  };
}

function buildTensionInsights(items: CompletedSnapshotItem[], limit = 8): TensionInsight[] {
  const tensionMap = new Map<
    string,
    {
      count: number;
      topics: Set<string>;
      evidence: TensionInsight["evidence"];
    }
  >();

  items.forEach((item) => {
    const content = item.snapshot.content;
    const seenInSnapshot = new Set<string>();
    content.tensions
      .map((tension) => tension.trim())
      .filter(Boolean)
      .forEach((tension) => {
        const current = tensionMap.get(tension) ?? {
          count: 0,
          topics: new Set<string>(),
          evidence: [],
        };
        if (!seenInSnapshot.has(tension)) {
          current.count += 1;
          seenInSnapshot.add(tension);
        }
        current.topics.add(content.topic);
        current.evidence.push({
          snapshotId: item.snapshot.snapshot_id,
          createdAt: item.created_at,
          title: content.title,
          topic: content.topic,
          question: item.question,
          nextQuestion: content.next_question,
        });
        tensionMap.set(tension, current);
      });
  });

  return [...tensionMap.entries()]
    .map(([label, value]) => ({
      label,
      count: value.count,
      topics: [...value.topics].sort((first, second) => first.localeCompare(second, "zh-CN")).slice(0, 6),
      evidence: [...value.evidence].sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, 3),
    }))
    .sort((first, second) => {
      const firstLatest = first.evidence[0]?.createdAt ?? "";
      const secondLatest = second.evidence[0]?.createdAt ?? "";
      return second.count - first.count || secondLatest.localeCompare(firstLatest) || first.label.localeCompare(second.label, "zh-CN");
    })
    .slice(0, limit);
}

function graphSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 9973;
  }
  return hash / 9973;
}

function buildGraphClusters(nodes: ThoughtGraphNode[], edges: ThoughtGraphEdge[] = []) {
  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((node) => adjacency.set(node.id, new Set()));
  edges.forEach((edge) => {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });

  const visited = new Set<string>();
  const clusters: ThoughtGraphNode[][] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  nodes.forEach((node) => {
    if (visited.has(node.id)) return;
    const queue = [node.id];
    const cluster: ThoughtGraphNode[] = [];
    visited.add(node.id);

    while (queue.length > 0) {
      const currentId = queue.shift();
      const currentNode = currentId ? nodeById.get(currentId) : null;
      if (!currentId || !currentNode) continue;
      cluster.push(currentNode);
      adjacency.get(currentId)?.forEach((nextId) => {
        if (visited.has(nextId)) return;
        visited.add(nextId);
        queue.push(nextId);
      });
    }

    clusters.push(cluster);
  });

  return clusters.sort(
    (first, second) =>
      second.length - first.length ||
      second.reduce((total, node) => total + node.weight, 0) -
        first.reduce((total, node) => total + node.weight, 0),
  );
}

function buildClusterCenters(clusterCount: number): GraphPosition[] {
  if (clusterCount <= 1) return [{ x: 480, y: 235 }];
  if (clusterCount === 2) {
    return [
      { x: 335, y: 235 },
      { x: 625, y: 235 },
    ];
  }
  if (clusterCount === 3) {
    return [
      { x: 480, y: 145 },
      { x: 330, y: 310 },
      { x: 650, y: 306 },
    ];
  }

  return Array.from({ length: clusterCount }, (_, index) => {
    const angle = (index / clusterCount) * Math.PI * 2 - Math.PI / 2;
    const radiusX = 255;
    const radiusY = 142;
    return {
      x: 480 + Math.cos(angle) * radiusX,
      y: 235 + Math.sin(angle) * radiusY,
    };
  });
}

function buildInitialGraphPositions(
  nodes: ThoughtGraphNode[],
  edges: ThoughtGraphEdge[] = [],
): Record<string, GraphPosition> {
  const positions: Record<string, GraphPosition> = {};
  const clusters = buildGraphClusters(nodes, edges);
  const centers = buildClusterCenters(clusters.length);
  const degreeByNode = new Map<string, number>();
  edges.forEach((edge) => {
    degreeByNode.set(edge.source, (degreeByNode.get(edge.source) ?? 0) + 1);
    degreeByNode.set(edge.target, (degreeByNode.get(edge.target) ?? 0) + 1);
  });

  clusters.forEach((cluster, clusterIndex) => {
    const center = centers[clusterIndex] ?? { x: 480, y: 235 };
    const columns = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(cluster.length * 1.18))));
    const rows = Math.ceil(cluster.length / columns);
    const gapX = cluster.length > 14 ? 94 : 108;
    const gapY = cluster.length > 14 ? 68 : 82;
    const sortedCluster = [...cluster].sort((first, second) => {
      const kindOrder: Record<GraphNodeKind, number> = {
        topic: 0,
        snapshot: 1,
        tension: 2,
        philosopher: 3,
        tag: 4,
      };
      return (
        (degreeByNode.get(second.id) ?? 0) - (degreeByNode.get(first.id) ?? 0) ||
        kindOrder[first.kind] - kindOrder[second.kind] ||
        second.weight - first.weight
      );
    });

    sortedCluster.forEach((node, nodeIndex) => {
      const seed = graphSeed(`${node.id}:${clusterIndex}`);
      const column = nodeIndex % columns;
      const row = Math.floor(nodeIndex / columns);
      const organicX = (seed - 0.5) * 16;
      const organicY = (graphSeed(`${node.id}:y:${clusterIndex}`) - 0.5) * 12;
      positions[node.id] = {
        x: Math.min(
          918,
          Math.max(42, center.x + (column - (columns - 1) / 2) * gapX + organicX),
        ),
        y: Math.min(
          428,
          Math.max(42, center.y + (row - (rows - 1) / 2) * gapY + organicY),
        ),
      };
    });
  });

  return positions;
}

function graphLabelFor(node: ThoughtGraphNode) {
  const characters = Array.from(node.label);
  return characters.length > 10
    ? `${characters.slice(0, 9).join("")}…`
    : node.label;
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

type SnapshotCorrectionResponse = {
  snapshot_id: string;
  content: NonNullable<ReflectionSnapshotListItem["snapshot"]["content"]>;
  revision: ReflectionSnapshotListItem["snapshot"]["revisions"][number];
};

export function ThoughtArchivePage({ apiBaseUrl }: ThoughtArchivePageProps) {
  const [items, setItems] = useState<ReflectionSnapshotListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [influences, setInfluences] = useState<ReflectionPhilosopherInfluenceResponse["items"]>([]);
  const [influenceError, setInfluenceError] = useState<string | null>(null);
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);
  const [focusedGraphSnapshotId, setFocusedGraphSnapshotId] = useState<string | null>(null);
  const [highlightedSnapshotIds, setHighlightedSnapshotIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [tensionFilter, setTensionFilter] = useState("");
  const [philosopherFilter, setPhilosopherFilter] = useState(() => new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("philosopher") ?? "");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [archiveActionStatus, setArchiveActionStatus] = useState<string | null>(null);
  const [archiveActionBusy, setArchiveActionBusy] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState<ReflectionWeeklyReportDraft | null>(null);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);
  const [weeklyReportStatus, setWeeklyReportStatus] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const timelineCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const highlightTimerRef = useRef<number | null>(null);

  async function reloadPhilosopherInfluences(signal?: AbortSignal) {
    const response = await fetch(
      `${apiBaseUrl}/api/v1/reflection-archive/philosopher-influences?limit=8`,
      { signal },
    );
    if (!response.ok) {
      throw new Error(`哲学家影响接口返回 ${response.status}`);
    }
    const payload = (await response.json()) as ReflectionPhilosopherInfluenceResponse;
    setInfluences(payload.items);
    setInfluenceError(null);
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadSnapshots() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/reflection-snapshots?limit=100`, {
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
    const controller = new AbortController();

    async function loadPhilosopherInfluences() {
      try {
        await reloadPhilosopherInfluences(controller.signal);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setInfluenceError(requestError instanceof Error ? requestError.message : "暂时无法读取哲学家影响轨迹");
      }
    }

    void loadPhilosopherInfluences();
    return () => controller.abort();
  }, [apiBaseUrl]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const topicOptions = useMemo(
    () => [...new Set(items.flatMap((item) => item.snapshot.content?.topic ?? []))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [items],
  );
  const philosopherOptions = useMemo(
    () => [...new Set(items.flatMap((item) => item.snapshot.content?.related_philosophers.map((entry) => entry.name) ?? []))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [items],
  );
  const tensionOptions = useMemo(
    () => [...new Set(items.flatMap((item) => item.snapshot.content?.tensions ?? []))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [items],
  );
  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase("zh-CN");
    return items.filter((item) => {
      const content = item.snapshot.content;
      const createdDate = item.created_at.slice(0, 10);
      if (fromDate && createdDate < fromDate) return false;
      if (toDate && createdDate > toDate) return false;
      if (topicFilter && content?.topic !== topicFilter) return false;
      if (tensionFilter && !content?.tensions.includes(tensionFilter)) return false;
      if (philosopherFilter && !content?.related_philosophers.some((entry) => entry.name === philosopherFilter)) return false;
      if (!query) return true;
      return [item.question, content?.title, content?.topic, content?.user_position, content?.core_question, ...(content?.tensions ?? []), ...(content?.tags ?? []), ...(content?.related_philosophers.map((entry) => entry.name) ?? [])]
        .filter(Boolean).join(" " ).toLocaleLowerCase("zh-CN").includes(query);
    });
  }, [fromDate, items, philosopherFilter, searchTerm, tensionFilter, toDate, topicFilter]);
  const hasFilters = Boolean(searchTerm || topicFilter || tensionFilter || philosopherFilter || fromDate || toDate);
  const completedCount = useMemo(
    () => filteredItems.filter((item) => item.snapshot.status === "completed").length,
    [filteredItems],
  );
  const pendingCount = filteredItems.length - completedCount;
  const completedContents = useMemo(
    () => filteredItems.map((item) => item.snapshot.content).filter((content) => content !== null),
    [filteredItems],
  );
  const completedSnapshotItems = useMemo(() => filteredItems.filter(hasSnapshotContent), [filteredItems]);
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
  const tensionInsights = useMemo(
    () => buildTensionInsights(completedSnapshotItems),
    [completedSnapshotItems],
  );
  const changedCount = useMemo(
    () => completedContents.filter((content) => content.change_signal.changed).length,
    [completedContents],
  );
  const graphData = useMemo(() => buildThoughtGraph(completedSnapshotItems), [completedSnapshotItems]);

  function clearFilters() {
    setSearchTerm("");
    setTopicFilter("");
    setTensionFilter("");
    setPhilosopherFilter("");
    setFromDate("");
    setToDate("");
  }

  async function reloadArchive() {
    const response = await fetch(`${apiBaseUrl}/api/v1/reflection-snapshots?limit=100`);
    if (!response.ok) throw new Error("无法刷新思想档案");
    const payload = (await response.json()) as ReflectionSnapshotListResponse;
    setItems(payload.items);
    try {
      await reloadPhilosopherInfluences();
    } catch (requestError) {
      setInfluenceError(requestError instanceof Error ? requestError.message : "暂时无法刷新哲学家影响轨迹");
    }
  }

  async function importArchive(file: File) {
    setArchiveActionBusy(true);
    setArchiveActionStatus(null);
    try {
      const packageText = await file.text();
      const packageData = JSON.parse(packageText) as unknown;
      const response = await fetch(`${apiBaseUrl}/api/v1/reflection-archive/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(packageData),
      });
      if (!response.ok) throw new Error("文件格式不正确，现有档案没有改变。");
      const result = (await response.json()) as { imported: number };
      await reloadArchive();
      setArchiveActionStatus(`已安全恢复 ${result.imported} 条思想记录。`);
    } catch (importError) {
      setArchiveActionStatus(importError instanceof Error ? importError.message : "导入失败，现有档案没有改变。");
    } finally {
      setArchiveActionBusy(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function deleteSnapshot(snapshotId: string) {
    if (!window.confirm("确定删除这一条思想档案吗？此操作无法撤销。")) return;
    const response = await fetch(`${apiBaseUrl}/api/v1/reflection-snapshots/${snapshotId}`, { method: "DELETE" });
    if (!response.ok) { setArchiveActionStatus("删除失败，请稍后重试。"); return; }
    setItems((current) => current.filter((item) => item.snapshot.snapshot_id !== snapshotId));
    void reloadPhilosopherInfluences().catch((requestError: unknown) => {
      setInfluenceError(requestError instanceof Error ? requestError.message : "暂时无法刷新哲学家影响轨迹");
    });
    setArchiveActionStatus("这条思想档案已删除。");
  }

  async function clearArchive() {
    const phrase = window.prompt("此操作无法撤销。请输入“清空全部档案”继续：");
    if (phrase !== "清空全部档案") {
      if (phrase !== null) setArchiveActionStatus("确认文字不匹配，未删除任何数据。");
      return;
    }
    setArchiveActionBusy(true);
    const response = await fetch(`${apiBaseUrl}/api/v1/reflection-archive`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: phrase }),
    });
    if (response.ok) { setItems([]); setInfluences([]); setArchiveActionStatus("全部思想档案已清空。"); }
    else setArchiveActionStatus("清空失败，现有档案没有改变。");
    setArchiveActionBusy(false);
  }

  async function generateWeeklyReport() {
    if (weeklyReportLoading) return;
    setWeeklyReportLoading(true);
    setWeeklyReportStatus(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/reflection-archive/weekly-report`);
      if (!response.ok) throw new Error(`Weekly report returned ${response.status}`);
      const payload = (await response.json()) as ReflectionWeeklyReportDraft;
      setWeeklyReport(payload);
      setWeeklyReportStatus(payload.message ?? (payload.enough_data ? "\u5468\u62a5\u8349\u7a3f\u5df2\u751f\u6210\u3002" : "\u672c\u5468\u6570\u636e\u6682\u65f6\u4e0d\u8db3\u3002"));
    } catch {
      setWeeklyReportStatus("\u5468\u62a5\u8349\u7a3f\u6682\u65f6\u65e0\u6cd5\u751f\u6210\uff0c\u8bf7\u786e\u8ba4\u540e\u7aef\u670d\u52a1\u53ef\u7528\u540e\u518d\u8bd5\u3002");
    } finally {
      setWeeklyReportLoading(false);
    }
  }

  async function copyWeeklyReport() {
    if (!weeklyReport?.markdown) return;
    try {
      await navigator.clipboard.writeText(weeklyReport.markdown);
      setWeeklyReportStatus("Markdown \u5df2\u590d\u5236\u3002\u8349\u7a3f\u4ecd\u672a\u5199\u5165\u957f\u671f\u6863\u6848\u3002");
    } catch {
      setWeeklyReportStatus("\u6d4f\u89c8\u5668\u6682\u65f6\u4e0d\u5141\u8bb8\u590d\u5236\uff0c\u8bf7\u624b\u52a8\u9009\u4e2d\u8349\u7a3f\u5185\u5bb9\u590d\u5236\u3002");
    }
  }

  function updateSnapshotReview(snapshotId: string, review: SnapshotReviewResponse["snapshot_review"]) {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.snapshot.snapshot_id === snapshotId
          ? { ...item, snapshot: { ...item.snapshot, snapshot_review: review } }
          : item,
      ),
    );
  }

  function updateSnapshot(
    snapshotId: string,
    update: Partial<ReflectionSnapshotListItem["snapshot"]>,
  ) {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.snapshot.snapshot_id === snapshotId
          ? { ...item, snapshot: { ...item.snapshot, ...update } }
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
          <span><Archive size={16} /> {filteredItems.length} / {items.length} 条记录</span>
          <span><Sparkles size={16} /> {completedCount} 条已生成</span>
          <span><Clock3 size={16} /> {pendingCount} 条待补生成</span>
        </div>
      </header>

      {!loading && !error ? (
        <section className="archive-preservation-desk" aria-label="思想档案保全与迁移">
          <div className="archive-preservation-copy">
            <span><ShieldCheck size={16} /> LOCAL FIRST</span>
            <h2>馆藏保全台</h2>
            <p>把思想带走、恢复到另一台设备，或清理不再保留的记录。JSON 可完整恢复，Markdown 适合阅读。</p>
          </div>
          <div className="archive-preservation-actions">
            <a href={`${apiBaseUrl}/api/v1/reflection-archive/export`} download><Download size={16} />备份 JSON</a>
            <a href={`${apiBaseUrl}/api/v1/reflection-archive/export.md`} download><Download size={16} />导出 Markdown</a>
            <button type="button" disabled={archiveActionBusy} onClick={() => importInputRef.current?.click()}><Upload size={16} />导入备份</button>
            <input ref={importInputRef} className="archive-import-input" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importArchive(file); }} />
            <button className="archive-clear-button" type="button" disabled={archiveActionBusy || items.length === 0} onClick={() => void clearArchive()}><Trash2 size={16} />清空全部</button>
          </div>
          {archiveActionStatus ? <p className="archive-action-status" role="status">{archiveActionStatus}</p> : null}
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="weekly-report-draft-panel" aria-label="\u672c\u5468\u601d\u60f3\u62a5\u544a\u8349\u7a3f">
          <div className="weekly-report-draft-copy">
            <span>WEEKLY DRAFT</span>
            <h2>{"\u672c\u5468\u601d\u60f3\u62a5\u544a\u8349\u7a3f"}</h2>
            <p>{"\u57fa\u4e8e\u672c\u5468\u5df2\u5b8c\u6210\u601d\u60f3\u8282\u70b9\u751f\u6210 Markdown \u8349\u7a3f\u3002\u5b83\u53ea\u4f9b\u4f60\u9884\u89c8\u3001\u590d\u5236\u548c\u6821\u5bf9\uff0c\u4e0d\u4f1a\u81ea\u52a8\u8fdb\u5165\u957f\u671f\u6863\u6848\u3002"}</p>
          </div>
          <div className="weekly-report-draft-actions">
            <button type="button" disabled={weeklyReportLoading} onClick={() => void generateWeeklyReport()}>
              {weeklyReportLoading ? "\u6b63\u5728\u751f\u6210" : "\u751f\u6210\u672c\u5468\u8349\u7a3f"}
            </button>
            <button type="button" disabled={!weeklyReport?.markdown} onClick={() => void copyWeeklyReport()}>
              {"\u590d\u5236 Markdown"}
            </button>
          </div>
          {weeklyReportStatus ? <p className="weekly-report-draft-status" role="status">{weeklyReportStatus}</p> : null}
          {weeklyReport ? (
            <article className={`weekly-report-preview ${weeklyReport.enough_data ? "ready" : "insufficient"}`}>
              <header>
                <span>{weeklyReport.week_start} {"\u2014"} {weeklyReport.week_end}</span>
                <strong>{weeklyReport.node_count} {"\u4e2a\u6765\u6e90\u8282\u70b9"}</strong>
              </header>
              <pre>{weeklyReport.markdown}</pre>
            </article>
          ) : null}
        </section>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <section className="archive-filter-ledger" aria-label="搜索和筛选思想档案">
          <label className="archive-search-field">
            <span>搜索档案</span>
            <div><Search size={16} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="主题、立场、张力、哲学家或标签" /></div>
          </label>
          <label><span>主题</span><select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}><option value="">全部主题</option>{topicOptions.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select></label>
          <label><span>张力</span><select value={tensionFilter} onChange={(event) => setTensionFilter(event.target.value)}><option value="">全部张力</option>{tensionOptions.map((tension) => <option key={tension} value={tension}>{tension}</option>)}</select></label>
          <label><span>哲学家</span><select value={philosopherFilter} onChange={(event) => setPhilosopherFilter(event.target.value)}><option value="">全部哲学家</option>{philosopherOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label><span>开始日期</span><input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label><span>结束日期</span><input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} /></label>
          {hasFilters ? <button type="button" onClick={clearFilters}><X size={15} />清除筛选</button> : null}
        </section>
      ) : null}

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

      {!loading && !error && items.length > 0 && filteredItems.length === 0 ? (
        <section className="archive-empty archive-filter-empty">
          <Search size={22} />
          <h2>没有找到符合条件的思想</h2>
          <p>换一个关键词，或者恢复全部档案后再沿时间线寻找。</p>
          <button type="button" onClick={clearFilters}>恢复全部档案</button>
        </section>
      ) : null}

      {!loading && !error && filteredItems.length > 0 ? (
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

      {!loading && !error && completedSnapshotItems.length > 0 ? (
        <section className="tension-insight-panel" aria-label="思想张力聚合">
          <header className="tension-insight-header">
            <div>
              <p className="section-kicker">TENSION INDEX</p>
              <h2>反复出现的思想张力</h2>
            </div>
            <p>
              张力不是结论失败，而是思想还在生长的地方。这里会把反复出现的未解问题保留来源，方便你回到具体节点继续追问。
            </p>
          </header>
          {tensionInsights.length > 0 ? (
            <div className="tension-insight-grid">
              {tensionInsights.map((insight, index) => {
                const latestEvidence = insight.evidence[0];
                return (
                  <article key={insight.label}>
                    <div className="tension-insight-rank">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{insight.count} 次</strong>
                    </div>
                    <div className="tension-insight-copy">
                      <h3>{insight.label}</h3>
                      <div>
                        {insight.topics.slice(0, 4).map((topic) => (
                          <small key={topic}>{topic}</small>
                        ))}
                      </div>
                      {latestEvidence ? (
                        <p>
                          最近证据：《{latestEvidence.title}》 · {formatSnapshotTime(latestEvidence.createdAt)}
                        </p>
                      ) : null}
                      {latestEvidence?.nextQuestion ? (
                        <em>可继续追问：{latestEvidence.nextQuestion}</em>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTensionFilter(insight.label);
                        focusTimelineSnapshots(insight.evidence.map((evidence) => evidence.snapshotId));
                      }}
                    >
                      筛选这条张力
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="tension-insight-empty">
              <h3>还没有可聚合的思想张力</h3>
              <p>当思想节点里出现未解决的问题或概念拉扯时，它们会在这里成为可追踪的线索。</p>
            </div>
          )}
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="philosopher-influence-archive" aria-label="影响我的哲学家">
          <header className="philosopher-influence-header">
            <div>
              <p className="section-kicker">PHILOSOPHER TRAIL</p>
              <h2>影响我的哲学家</h2>
            </div>
            <p>
              这里不是“最常见哲学家”列表，而是从你的思想节点里抽出证据：谁反复进入你的问题、在什么主题里出现、理由是什么。
            </p>
          </header>
          {influenceError ? <p className="philosopher-influence-error">{influenceError}</p> : null}
          {influences.length > 0 ? (
            <div className="philosopher-influence-grid">
              {influences.map((influence) => {
                const firstEvidence = influence.evidence[0];
                return (
                  <article key={influence.name}>
                    <div className="philosopher-influence-topline">
                      <strong>{influence.name}</strong>
                      <span>{influence.count} 次出现</span>
                    </div>
                    <div className="philosopher-influence-tags">
                      {influence.topics.slice(0, 4).map((topic) => (
                        <small key={topic}>{topic}</small>
                      ))}
                    </div>
                    {firstEvidence ? (
                      <div className="philosopher-influence-evidence">
                        <span>证据节点</span>
                        <h3>{firstEvidence.title}</h3>
                        <p>{firstEvidence.reason}</p>
                        <small>{firstEvidence.topic} · {firstEvidence.question}</small>
                      </div>
                    ) : (
                      <p className="philosopher-influence-empty">还没有找到足够证据，继续完成更多思想节点后会补全。</p>
                    )}
                    <div className="philosopher-influence-actions">
                      <a href={`#philosophers?search=${encodeURIComponent(influence.name)}`}>打开图鉴</a>
                      <button type="button" onClick={() => setPhilosopherFilter(influence.name)}>筛选档案</button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="philosopher-influence-empty-state">
              <h3>还没有形成稳定影响轨迹</h3>
              <p>完成更多带有哲学家关联的思想节点后，这里会自动长出来。</p>
            </div>
          )}
        </section>
      ) : null}

      {!loading && !error && evolutionItems.length > 0 ? (
        <ThoughtEvolutionMap items={evolutionItems} />
      ) : null}

      {!loading && !error && graphData.nodes.length > 0 ? (
        <ForceThoughtRelationGraph
          focusedSnapshotId={focusedGraphSnapshotId}
          graph={graphData}
          items={completedSnapshotItems}
          onNavigateSnapshots={focusTimelineSnapshots}
        />
      ) : null}

      {!loading && !error && filteredItems.length > 0 ? (
        <section className="thought-timeline" aria-label="思想节点时间线">
          {filteredItems.map((item) => (
            <TimelineCard
              apiBaseUrl={apiBaseUrl}
              expanded={expandedSnapshotId === item.snapshot.snapshot_id}
              highlighted={highlightedSnapshotIds.includes(item.snapshot.snapshot_id)}
              item={item}
              key={item.snapshot.snapshot_id}
              onReviewSaved={updateSnapshotReview}
              onSnapshotUpdated={updateSnapshot}
              onDelete={() => void deleteSnapshot(item.snapshot.snapshot_id)}
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
  onSnapshotUpdated: (
    snapshotId: string,
    update: Partial<ReflectionSnapshotListItem["snapshot"]>,
  ) => void;
  onDelete: () => void;
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

function graphEndpointId(endpoint: unknown) {
  if (typeof endpoint === "string" || typeof endpoint === "number") return String(endpoint);
  if (endpoint && typeof endpoint === "object" && "id" in endpoint) {
    return String((endpoint as { id?: string | number }).id ?? "");
  }
  return "";
}

function ForceThoughtRelationGraph({
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
  type GraphApi = ForceGraphMethods<
    NodeObject<ForceThoughtNode>,
    LinkObject<ForceThoughtNode, ForceThoughtLink>
  >;

  const sectionRef = useRef<HTMLElement | null>(null);
  const graphViewportRef = useRef<HTMLDivElement | null>(null);
  const forceGraphRef = useRef<GraphApi | undefined>(undefined);
  const labelBoxesRef = useRef<GraphLabelBox[]>([]);
  const hoverTimerRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const fitTimerRef = useRef<number | null>(null);
  const zoomFrameRef = useRef<number | null>(null);
  const initialFitDoneRef = useRef(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [pulseNodeId, setPulseNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [tooltipPoint, setTooltipPoint] = useState<GraphPosition | null>(null);
  const [graphPlaced, setGraphPlaced] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [graphSize, setGraphSize] = useState({ width: 960, height: 470 });
  const [graphPageIndex, setGraphPageIndex] = useState(0);

  const graphPages = useMemo(() => {
    return buildGraphClusters(graph.nodes, graph.edges).map((nodes) => {
      const nodeIds = new Set(nodes.map((node) => node.id));
      return {
        nodes,
        edges: graph.edges.filter(
          (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
        ),
      };
    });
  }, [graph.nodes, graph.edges]);
  const visibleGraph = graphPages[graphPageIndex] ?? { nodes: [], edges: [] };

  const initialPositions = useMemo(
    () => buildInitialGraphPositions(visibleGraph.nodes, visibleGraph.edges),
    [visibleGraph.nodes, visibleGraph.edges],
  );
  const graphData = useMemo(() => {
    const nodes: ForceThoughtNode[] = visibleGraph.nodes.map((node) => {
        const position = initialPositions[node.id] ?? { x: 480, y: 235 };
        return {
          ...node,
          x: position.x - 480,
          y: position.y - 235,
        };
      });
    const links: ForceThoughtLink[] = visibleGraph.edges.map((edge) => ({ ...edge }));
    return { nodes, links };
  }, [visibleGraph.nodes, visibleGraph.edges, initialPositions]);

  const externalFocusedNodeId = focusedSnapshotId ? `snapshot:${focusedSnapshotId}` : null;
  const focusedNodeId = hoverNodeId ?? activeNodeId ?? externalFocusedNodeId;
  const focusedNode = visibleGraph.nodes.find((node) => node.id === focusedNodeId) ?? null;
  const connectedNodeIds = useMemo(() => {
    if (!focusedNodeId) return new Set<string>();
    const connected = new Set<string>([focusedNodeId]);
    visibleGraph.edges.forEach((edge) => {
      if (edge.source === focusedNodeId) connected.add(edge.target);
      if (edge.target === focusedNodeId) connected.add(edge.source);
    });
    return connected;
  }, [focusedNodeId, visibleGraph.edges]);

  const snapshotsForNode = useCallback(
    (nodeId: string) => {
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
    },
    [graph.nodes, items],
  );

  const selectedSnapshots = useMemo(
    () => (focusedNode ? snapshotsForNode(focusedNode.id) : []),
    [focusedNode, snapshotsForNode],
  );

  useEffect(() => {
    setGraphPageIndex((currentPage) =>
      Math.min(currentPage, Math.max(0, graphPages.length - 1)),
    );
  }, [graphPages.length]);

  useEffect(() => {
    if (!externalFocusedNodeId) return;
    const targetPage = graphPages.findIndex((page) =>
      page.nodes.some((node) => node.id === externalFocusedNodeId),
    );
    if (targetPage >= 0 && targetPage !== graphPageIndex) {
      setGraphPageIndex(targetPage);
    }
  }, [externalFocusedNodeId, graphPageIndex, graphPages]);

  useEffect(() => {
    const viewport = graphViewportRef.current;
    if (!viewport) return undefined;
    const updateSize = () => {
      const rect = viewport.getBoundingClientRect();
      setGraphSize({
        width: Math.max(300, Math.round(rect.width)),
        height: Math.max(340, Math.round(rect.height)),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = graphViewportRef.current;
    if (!viewport) return undefined;
    const preventPageScroll = (event: globalThis.WheelEvent) => event.preventDefault();
    viewport.addEventListener("wheel", preventPageScroll, { passive: false });
    return () => viewport.removeEventListener("wheel", preventPageScroll);
  }, []);

  useEffect(() => {
    const instance = forceGraphRef.current;
    if (!instance) return;

    type ConfigurableForce = {
      distance?: (value: number | ((link: ForceThoughtLink) => number)) => ConfigurableForce;
      strength?: (
        value: number | ((nodeOrLink: ForceThoughtNode | ForceThoughtLink) => number),
      ) => ConfigurableForce;
      distanceMax?: (value: number) => ConfigurableForce;
    };

    const nodeById = new Map(graphData.nodes.map((node) => [node.id, node]));
    const linkForce = instance.d3Force("link") as ConfigurableForce | undefined;
    linkForce?.distance?.((link) => {
      const source = nodeById.get(graphEndpointId(link.source));
      const target = nodeById.get(graphEndpointId(link.target));
      if (link.relation === "共现闭环") return 74;
      if (link.relation === "思想证据") return 68;
      if (source?.kind === "snapshot" || target?.kind === "snapshot") return 62;
      if (source?.kind === "topic" || target?.kind === "topic") return 64;
      return 58;
    });
    linkForce?.strength?.(0.38);

    const chargeForce = instance.d3Force("charge") as ConfigurableForce | undefined;
    chargeForce?.strength?.((nodeOrLink) => {
      const node = nodeOrLink as ForceThoughtNode;
      if (node.kind === "topic") return -158;
      if (node.kind === "snapshot") return -146;
      return -122;
    });
    chargeForce?.distanceMax?.(560);
    instance.d3ReheatSimulation();
  }, [graphData]);

  useEffect(() => {
    initialFitDoneRef.current = false;
    setActiveNodeId(null);
    setHoverNodeId(null);
    setPulseNodeId(null);
    setDraggingNodeId(null);
    setTooltipPoint(null);
    setZoom(1);
    setGraphPlaced(false);
    if (fitTimerRef.current) window.clearTimeout(fitTimerRef.current);
    fitTimerRef.current = window.setTimeout(() => {
      forceGraphRef.current?.d3ReheatSimulation();
      forceGraphRef.current?.zoomToFit(420, 72);
      setGraphPlaced(true);
      fitTimerRef.current = null;
    }, 70);
  }, [graphData]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setGraphPlaced(false);
        if (fitTimerRef.current) window.clearTimeout(fitTimerRef.current);
        fitTimerRef.current = window.setTimeout(() => {
          forceGraphRef.current?.d3ReheatSimulation();
          forceGraphRef.current?.zoomToFit(460, 72);
          setGraphPlaced(true);
          fitTimerRef.current = null;
        }, 70);
      },
      { rootMargin: "-12% 0px -25% 0px", threshold: 0.26 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      if (fitTimerRef.current) window.clearTimeout(fitTimerRef.current);
      if (zoomFrameRef.current) window.cancelAnimationFrame(zoomFrameRef.current);
    };
  }, []);

  function clearNodePreview() {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverNodeId(null);
    setTooltipPoint(null);
  }

  function clearGraphFocus() {
    clearNodePreview();
    setActiveNodeId(null);
    setPulseNodeId(null);
  }

  function scheduleNodePreview(node: NodeObject) {
    clearNodePreview();
    hoverTimerRef.current = window.setTimeout(() => {
      const nodeId = String(node.id ?? "");
      if (!nodeId) return;
      const point =
        typeof node.x === "number" && typeof node.y === "number"
          ? forceGraphRef.current?.graph2ScreenCoords(node.x, node.y)
          : null;
      setHoverNodeId(nodeId);
      setTooltipPoint(point ?? { x: graphSize.width / 2, y: graphSize.height / 2 });
      hoverTimerRef.current = null;
    }, 100);
  }

  function activateNode(node: NodeObject) {
    const nodeId = String(node.id ?? "");
    if (!nodeId) return;
    setActiveNodeId(nodeId);
    setPulseNodeId(nodeId);
    const snapshotIds = nodeId.startsWith("snapshot:")
      ? [nodeId.slice("snapshot:".length)]
      : snapshotsForNode(nodeId).map((item) => item.snapshot.snapshot_id);
    onNavigateSnapshots(snapshotIds);
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => {
      setPulseNodeId(null);
      pulseTimerRef.current = null;
    }, 520);
  }

  function resetLayout() {
    graphData.nodes.forEach((node) => {
      const position = initialPositions[node.id] ?? { x: 480, y: 235 };
      node.x = position.x - 480;
      node.y = position.y - 235;
      node.vx = 0;
      node.vy = 0;
      node.fx = undefined;
      node.fy = undefined;
    });
    clearGraphFocus();
    forceGraphRef.current?.d3ReheatSimulation();
    if (fitTimerRef.current) window.clearTimeout(fitTimerRef.current);
    fitTimerRef.current = window.setTimeout(() => {
      forceGraphRef.current?.zoomToFit(420, 72);
      fitTimerRef.current = null;
    }, 80);
  }

  function changeZoom(direction: -1 | 1) {
    const instance = forceGraphRef.current;
    if (!instance) return;
    const currentZoom = instance.zoom();
    const minimumZoom = graphSize.width < 540 ? 0.28 : 0.5;
    const nextZoom = Math.min(
      2.4,
      Math.max(minimumZoom, currentZoom * (direction > 0 ? 1.18 : 0.85)),
    );
    instance.zoom(nextZoom, 180);
  }

  function changeGraphPage(direction: -1 | 1) {
    clearGraphFocus();
    setGraphPlaced(false);
    setGraphPageIndex((currentPage) =>
      Math.min(graphPages.length - 1, Math.max(0, currentPage + direction)),
    );
  }

  function updateZoomLabel(nextZoom: number) {
    if (zoomFrameRef.current) window.cancelAnimationFrame(zoomFrameRef.current);
    zoomFrameRef.current = window.requestAnimationFrame(() => {
      setZoom(nextZoom);
      zoomFrameRef.current = null;
    });
  }

  const resetLabelLayout = useCallback(() => {
    labelBoxesRef.current = [];
  }, []);

  const drawNode = useCallback(
    (rawNode: NodeObject, context: CanvasRenderingContext2D, globalScale: number) => {
      const node = rawNode as ForceThoughtNode;
      if (typeof node.x !== "number" || typeof node.y !== "number") return;
      const nodeX = node.x;
      const nodeY = node.y;
      const nodeId = String(node.id);
      const active = nodeId === focusedNodeId;
      const connected = connectedNodeIds.has(nodeId);
      const dimmed = Boolean(focusedNodeId) && !connected;
      const dragging = nodeId === draggingNodeId;
      const pulsing = nodeId === pulseNodeId;
      const scale = Math.max(globalScale, 0.01);
      const radius =
        (active || dragging ? 4.1 : connected ? 2.8 : Math.min(2.6, 1.75 + node.weight * 0.22)) /
        scale;
      const nodeColors: Record<GraphNodeKind, string> = {
        topic: "#55595c",
        snapshot: "#6b6f72",
        tension: "#b9bcbe",
        philosopher: "#adb1b4",
        tag: "#c6c9cb",
      };

      context.save();
      context.globalAlpha = dimmed ? 0.2 : 1;
      if (pulsing) {
        context.beginPath();
        context.arc(nodeX, nodeY, radius + 5 / scale, 0, Math.PI * 2);
        context.strokeStyle = "rgba(118, 89, 220, 0.28)";
        context.lineWidth = 1 / scale;
        context.stroke();
      }
      context.beginPath();
      context.arc(nodeX, nodeY, radius, 0, Math.PI * 2);
      context.fillStyle = active ? "#7659dc" : connected ? "#8f9497" : nodeColors[node.kind];
      context.fill();
      if (active) {
        context.beginPath();
        context.arc(nodeX, nodeY, radius + 2.6 / scale, 0, Math.PI * 2);
        context.strokeStyle = "rgba(118, 89, 220, 0.32)";
        context.lineWidth = 0.9 / scale;
        context.stroke();
      }

      const compactViewport = graphSize.width < 540;
      const lines = [graphLabelFor(node)];
      const fontSize = (compactViewport ? 10.2 : 11.2) / scale;
      const lineHeight = 13.4 / scale;
      context.font = `540 ${fontSize}px "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif`;
      const labelWidth = Math.max(...lines.map((line) => context.measureText(line).width));
      const labelHeight = lines.length * lineHeight;
      const baseY = nodeY + radius + 4 / scale;
      const horizontalSteps = compactViewport
        ? [-0.52, -0.26, 0, 0.26, 0.52]
        : [-0.62, -0.31, 0, 0.31, 0.62];
      const rowCount = compactViewport ? 8 : 6;
      const candidates = Array.from({ length: rowCount }, (_, row) =>
        horizontalSteps.map((step) => ({
          x: step * Math.max(labelWidth, 52 / scale),
          y: row * (labelHeight + 4 / scale),
        })),
      ).flat();
      let placement = candidates[0];
      let bestOverlapCount = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        const box: GraphLabelBox = {
          x: nodeX + candidate.x - labelWidth / 2,
          y: baseY + candidate.y,
          width: labelWidth,
          height: labelHeight,
        };
        const paddingX = 4 / scale;
        const paddingY = 2 / scale;
        const screenPosition = forceGraphRef.current?.graph2ScreenCoords(
          nodeX + candidate.x,
          baseY + candidate.y,
        );
        const screenWidth = labelWidth * scale;
        const screenHeight = labelHeight * scale;
        const outsideViewport = screenPosition
          ? screenPosition.x - screenWidth / 2 < 8 ||
            screenPosition.x + screenWidth / 2 > graphSize.width - 8 ||
            screenPosition.y < 8 ||
            screenPosition.y + screenHeight > graphSize.height - 8
          : false;
        const overlaps = labelBoxesRef.current.some(
          (placed) =>
            box.x < placed.x + placed.width + paddingX &&
            box.x + box.width + paddingX > placed.x &&
            box.y < placed.y + placed.height + paddingY &&
            box.y + box.height + paddingY > placed.y,
        );
        if (outsideViewport) continue;
        const overlapCount = labelBoxesRef.current.filter(
          (placed) =>
            box.x < placed.x + placed.width + paddingX &&
            box.x + box.width + paddingX > placed.x &&
            box.y < placed.y + placed.height + paddingY &&
            box.y + box.height + paddingY > placed.y,
        ).length;
        if (!overlaps) {
          placement = candidate;
          break;
        }
        if (overlapCount < bestOverlapCount) {
          bestOverlapCount = overlapCount;
          placement = candidate;
        }
      }
      const finalScreenPosition = forceGraphRef.current?.graph2ScreenCoords(
        nodeX + placement.x,
        baseY + placement.y,
      );
      if (finalScreenPosition) {
        const halfScreenWidth = (labelWidth * scale) / 2;
        const clampedScreenX = Math.min(
          graphSize.width - halfScreenWidth - 8,
          Math.max(halfScreenWidth + 8, finalScreenPosition.x),
        );
        placement = {
          x: placement.x + (clampedScreenX - finalScreenPosition.x) / scale,
          y: placement.y,
        };
      }
      const labelBox: GraphLabelBox = {
        x: nodeX + placement.x - labelWidth / 2,
        y: baseY + placement.y,
        width: labelWidth,
        height: labelHeight,
      };
      labelBoxesRef.current.push(labelBox);

      context.globalAlpha = dimmed ? 0.16 : active ? 1 : 0.88;
      context.fillStyle = active ? "#2b2057" : "#25282a";
      context.textAlign = "center";
      context.textBaseline = "top";
      lines.forEach((line, lineIndex) => {
        context.fillText(
          line,
          nodeX + placement.x,
          baseY + placement.y + lineIndex * lineHeight,
        );
      });
      context.restore();
    },
    [connectedNodeIds, draggingNodeId, focusedNodeId, graphSize.width, pulseNodeId],
  );

  const paintNodePointerArea = useCallback(
    (
      node: NodeObject,
      paintColor: string,
      context: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      if (typeof node.x !== "number" || typeof node.y !== "number") return;
      context.beginPath();
      context.arc(node.x, node.y, Math.max(5, 8 / Math.max(globalScale, 0.01)), 0, Math.PI * 2);
      context.fillStyle = paintColor;
      context.fill();
    },
    [],
  );

  const linkColor = useCallback(
    (link: LinkObject) => {
      const sourceId = graphEndpointId(link.source);
      const targetId = graphEndpointId(link.target);
      if (!focusedNodeId) return "rgba(98, 105, 112, 0.29)";
      return sourceId === focusedNodeId || targetId === focusedNodeId
        ? "rgba(118, 89, 220, 0.72)"
        : "rgba(98, 105, 112, 0.055)";
    },
    [focusedNodeId],
  );

  const linkWidth = useCallback(
    (link: LinkObject) => {
      const active =
        graphEndpointId(link.source) === focusedNodeId || graphEndpointId(link.target) === focusedNodeId;
      if (!focusedNodeId) return 1.05;
      return active ? 1.65 : 0.34;
    },
    [focusedNodeId],
  );

  const tooltipPosition = tooltipPoint
    ? (() => {
        const halfWidth = Math.min(145, Math.max(110, (graphSize.width - 24) / 2));
        return {
          x: Math.min(graphSize.width - halfWidth - 8, Math.max(halfWidth + 8, tooltipPoint.x)),
          y: Math.min(graphSize.height - 16, Math.max(142, tooltipPoint.y)),
        };
      })()
    : null;

  return (
    <section
      className={`thought-relation-graph force-graph-enabled${graphPlaced ? " graph-placed" : ""}`}
      ref={sectionRef}
      aria-label="思想关系图谱"
    >
      <header className="relation-graph-header">
        <div>
          <p className="section-kicker">OBSIDIAN GRAPH</p>
          <h2>思想关系图谱</h2>
        </div>
        <p>每页是一组真实相连的思想；拖住一个节点时，整张关系网会像柔软织物一样随之移动。</p>
        <div className="relation-graph-controls" aria-label="图谱控制">
          <select
            aria-label="定位图谱节点"
            value={activeNodeId ?? ""}
            onChange={(event) => {
              const node = graphData.nodes.find((candidate) => candidate.id === event.target.value);
              if (node) activateNode(node);
            }}
          >
            <option value="">定位节点</option>
            {graphData.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label} · {graphNodeKindLabels[node.kind]}
              </option>
            ))}
          </select>
          {graphPages.length > 1 ? (
            <div className="relation-graph-pagination" aria-label="思想群落翻页">
              <button
                type="button"
                onClick={() => changeGraphPage(-1)}
                disabled={graphPageIndex === 0}
                aria-label="上一组思想关系"
                title="上一组思想关系"
              >
                <ChevronLeft size={15} strokeWidth={1.8} />
              </button>
              <span>{graphPageIndex + 1} / {graphPages.length}</span>
              <button
                type="button"
                onClick={() => changeGraphPage(1)}
                disabled={graphPageIndex === graphPages.length - 1}
                aria-label="下一组思想关系"
                title="下一组思想关系"
              >
                <ChevronRight size={15} strokeWidth={1.8} />
              </button>
            </div>
          ) : null}
          <button type="button" onClick={() => changeZoom(-1)} aria-label="缩小图谱">－</button>
          <span className="relation-graph-zoom">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => changeZoom(1)} aria-label="放大图谱">＋</button>
          <button type="button" onClick={resetLayout}>重置视图</button>
        </div>
      </header>

      <div className="relation-graph-workspace">
        <div
          className="relation-graph-stage"
          onMouseLeave={clearGraphFocus}
          role="img"
          aria-label="可拖动、缩放和悬停查看信息的思想关系图谱"
        >
          <div
            className={`relation-force-graph-shell relation-graph-constellation${graphPlaced ? " graph-page-settled" : " graph-page-arriving"}`}
            onMouseLeave={clearNodePreview}
            ref={graphViewportRef}
          >
            <ForceGraph2D
              ref={forceGraphRef}
              width={graphSize.width}
              height={graphSize.height}
              graphData={graphData}
              backgroundColor="#f4f4f2"
              nodeRelSize={1}
              nodeVal={() => 1}
              nodeLabel={() => ""}
              nodeCanvasObjectMode={() => "replace"}
              nodeCanvasObject={drawNode}
              nodePointerAreaPaint={paintNodePointerArea}
              linkColor={linkColor}
              linkWidth={linkWidth}
              linkCurvature={0}
              minZoom={graphSize.width < 540 ? 0.28 : 0.5}
              maxZoom={2.4}
              warmupTicks={8}
              cooldownTicks={320}
              cooldownTime={9000}
              d3AlphaDecay={0.018}
              d3VelocityDecay={0.22}
              enableNodeDrag
              enablePanInteraction
              enableZoomInteraction
              onRenderFramePre={resetLabelLayout}
              onNodeHover={(node) => {
                if (node) scheduleNodePreview(node);
                else clearNodePreview();
              }}
              onNodeClick={activateNode}
              onNodeDrag={(node) => {
                setDraggingNodeId(String(node.id ?? ""));
                setActiveNodeId(String(node.id ?? ""));
                clearNodePreview();
              }}
              onNodeDragEnd={(node) => {
                node.fx = node.x;
                node.fy = node.y;
                setDraggingNodeId(null);
              }}
              onBackgroundClick={clearGraphFocus}
              onZoom={({ k }) => updateZoomLabel(k)}
              onEngineStop={() => {
                if (initialFitDoneRef.current || graphData.nodes.length === 0) return;
                initialFitDoneRef.current = true;
                forceGraphRef.current?.zoomToFit(420, 72);
              }}
            />
          </div>

          {hoverNodeId && focusedNode && tooltipPosition ? (
            <div
              className="relation-graph-tooltip"
              role="status"
              style={{ left: tooltipPosition.x, top: tooltipPosition.y }}
            >
              <div className="relation-graph-tooltip-heading">
                <span>{graphNodeKindLabels[focusedNode.kind]}</span>
                <strong>{focusedNode.label}</strong>
              </div>
              <p>{focusedNode.description}</p>
              {selectedSnapshots.length > 0 ? (
                <div className="relation-graph-tooltip-links">
                  <span>
                    {selectedSnapshots.length} 个关联思想
                    {selectedSnapshots[0] ? ` · 最近 ${formatSnapshotTime(selectedSnapshots[0].created_at)}` : ""}
                  </span>
                  {selectedSnapshots.slice(0, 2).map((item) => (
                    <small key={item.snapshot.snapshot_id}>{item.snapshot.content.title}</small>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
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
  onSnapshotUpdated,
  onDelete,
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
              <div className="timeline-next-question">
                <span>下一步：{content.next_question}</span>
                <a href={`#today?continue=${encodeURIComponent(item.snapshot.snapshot_id)}`}>
                  回到今日继续
                </a>
              </div>
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
        <button className="timeline-delete-button" type="button" onClick={onDelete} aria-label="删除这条思想档案"><Trash2 size={14} />删除</button>

        {expanded ? (
          <TimelineDetail
            apiBaseUrl={apiBaseUrl}
            item={item}
            onReviewSaved={onReviewSaved}
            onSnapshotUpdated={onSnapshotUpdated}
          />
        ) : null}
      </div>
    </article>
  );
}

function buildRelationExplanation(content: NonNullable<ReflectionSnapshotListItem["snapshot"]["content"]>) {
  const philosophers = content.related_philosophers.slice(0, 2);
  const tensions = content.tensions.slice(0, 2);
  const tags = content.tags.slice(0, 3);
  const philosopherNames = philosophers.map((philosopher) => philosopher.name).join("、");
  const tensionText = tensions.join(" / ");
  const tagText = tags.join("、");

  return {
    summary:
      `这条思想被归入“${content.topic}”，因为它围绕“${content.core_question}”展开；` +
      (tensionText ? `其中最明显的张力是 ${tensionText}。` : "目前还没有形成稳定的张力线索。"),
    anchors: [
      { label: "主题", value: content.topic },
      { label: "哲学家", value: philosopherNames || "等待后续对话建立参照" },
      { label: "张力", value: tensionText || "暂无明显张力" },
      { label: "标签", value: tagText || "暂无标签" },
    ],
    philosopherNote:
      philosophers.length > 0
        ? philosophers
            .map((philosopher) => `${philosopher.name}：${philosopher.reason}`)
            .join("；")
        : null,
  };
}

function TimelineDetail({
  item,
  apiBaseUrl,
  onReviewSaved,
  onSnapshotUpdated,
}: {
  item: ReflectionSnapshotListItem;
  apiBaseUrl: string;
  onReviewSaved: (
    snapshotId: string,
    review: SnapshotReviewResponse["snapshot_review"],
  ) => void;
  onSnapshotUpdated: (
    snapshotId: string,
    update: Partial<ReflectionSnapshotListItem["snapshot"]>,
  ) => void;
}) {
  const content = item.snapshot.content;
  const relationExplanation = content ? buildRelationExplanation(content) : null;
  const [reviewVerdict, setReviewVerdict] = useState<SnapshotReviewVerdict>(
    item.snapshot.snapshot_review?.verdict ?? "accurate",
  );
  const [reviewNote, setReviewNote] = useState(item.snapshot.snapshot_review?.note ?? "");
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [savingReview, setSavingReview] = useState(false);
  const [retryingSnapshot, setRetryingSnapshot] = useState(false);
  const [snapshotActionStatus, setSnapshotActionStatus] = useState<string | null>(null);
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [correctedPosition, setCorrectedPosition] = useState(content?.user_position ?? "");
  const [correctedTensions, setCorrectedTensions] = useState(content?.tensions.join("\n") ?? "");
  const [correctedNextQuestion, setCorrectedNextQuestion] = useState(content?.next_question ?? "");

  useEffect(() => {
    if (!content) return;
    setCorrectedPosition(content.user_position);
    setCorrectedTensions(content.tensions.join("\n"));
    setCorrectedNextQuestion(content.next_question ?? "");
  }, [content]);

  async function retrySnapshot() {
    if (retryingSnapshot) return;
    setRetryingSnapshot(true);
    setSnapshotActionStatus(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/reflection-snapshots/${item.snapshot.snapshot_id}/retry`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(`Snapshot retry returned ${response.status}`);
      const payload = (await response.json()) as ReflectionSnapshotListItem["snapshot"];
      onSnapshotUpdated(item.snapshot.snapshot_id, payload);
      setSnapshotActionStatus(
        payload.status === "completed" ? "思想节点已补生成。" : "模型仍不可用，原话保持不变。",
      );
    } catch {
      setSnapshotActionStatus("补生成暂时失败，请恢复连接后再试。");
    } finally {
      setRetryingSnapshot(false);
    }
  }

  async function saveCorrection() {
    if (!content || !correctedPosition.trim() || savingCorrection) return;
    setSavingCorrection(true);
    setSnapshotActionStatus(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/reflection-snapshots/${item.snapshot.snapshot_id}/content`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_position: correctedPosition.trim(),
            tensions: correctedTensions.split("\n").map((value) => value.trim()).filter(Boolean),
            next_question: correctedNextQuestion.trim() || null,
          }),
        },
      );
      if (!response.ok) throw new Error(`Snapshot correction returned ${response.status}`);
      const payload = (await response.json()) as SnapshotCorrectionResponse;
      onSnapshotUpdated(item.snapshot.snapshot_id, {
        content: payload.content,
        user_decision: "edit",
        decision_updated_at: payload.revision.updated_at,
        revisions: [...item.snapshot.revisions, payload.revision],
      });
      setSnapshotActionStatus("修正已保存，档案与关系图谱已同步更新。");
    } catch {
      setSnapshotActionStatus("修正暂未写入，请稍后重试。");
    } finally {
      setSavingCorrection(false);
    }
  }

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
      {item.snapshot.status === "pending" ? (
        <section className="snapshot-recovery-panel" aria-label="补生成思想节点">
          <div>
            <strong>原话已经保存</strong>
            <p>只重新请求这一条思想总结，不会重复记录对话或新建节点。</p>
          </div>
          <button type="button" disabled={retryingSnapshot} onClick={() => void retrySnapshot()}>
            <RotateCcw size={15} /> {retryingSnapshot ? "正在补生成" : "重新生成"}
          </button>
          {snapshotActionStatus ? <em>{snapshotActionStatus}</em> : null}
        </section>
      ) : null}
      {relationExplanation ? (
        <section className="timeline-relation-note" aria-label="图谱关系解释">
          <div className="relation-note-heading">
            <span>关系解释</span>
            <strong>这条思想为什么会出现在图谱这里</strong>
          </div>
          <p>{relationExplanation.summary}</p>
          {relationExplanation.philosopherNote ? <em>{relationExplanation.philosopherNote}</em> : null}
          <div className="relation-note-anchors">
            {relationExplanation.anchors.map((anchor) => (
              <span key={anchor.label}>
                <b>{anchor.label}</b>
                {anchor.value}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <strong>核心问题</strong>
        <p>{content?.core_question ?? item.question}</p>
      </section>

      {content?.change_signal.changed ? (
        <section className="thought-change-comparison">
          <strong>观点变化</strong>
          <div className="thought-change-columns">
            <div><span>此前</span><p>{content.change_signal.previous_position ?? item.snapshot.revisions.at(-1)?.previous_user_position ?? "此前没有形成明确立场"}</p></div>
            <div><span>现在</span><p>{content.change_signal.current_position ?? content.user_position}</p></div>
          </div>
          <small>证据来源：{item.snapshot.revisions.length > 0 ? `用户修正记录（${item.snapshot.revisions.length} 次）` : "本次对话原话与 AI 思想快照"}{content.change_signal.change_type ? ` · ${content.change_signal.change_type}` : ""}</small>
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
              <a href={`#philosophers?search=${encodeURIComponent(philosopher.name)}`} key={`${philosopher.name}-${philosopher.reason}`}>
                <b>{philosopher.name}</b>
                {philosopher.reason}
              </a>
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

      {content ? (
        <section className="snapshot-correction-panel" aria-label="修正思想节点内容">
          <div>
            <strong>修正 AI 总结</strong>
            <p>修改会成为档案当前版本，上一版内容与修改时间仍会保留。</p>
          </div>
          <label>
            <span>我的当前立场</span>
            <textarea rows={3} value={correctedPosition} onChange={(event) => setCorrectedPosition(event.target.value)} />
          </label>
          <label>
            <span>仍在拉扯的问题（每行一个）</span>
            <textarea rows={3} value={correctedTensions} onChange={(event) => setCorrectedTensions(event.target.value)} />
          </label>
          <label>
            <span>下一步问题</span>
            <textarea rows={2} value={correctedNextQuestion} onChange={(event) => setCorrectedNextQuestion(event.target.value)} />
          </label>
          <footer>
            <button type="button" disabled={!correctedPosition.trim() || savingCorrection} onClick={() => void saveCorrection()}>
              {savingCorrection ? "正在写入" : "保存修正版本"}
            </button>
            {item.snapshot.revisions.length > 0 ? (
              <span>{item.snapshot.revisions.length} 次用户修正</span>
            ) : null}
            {snapshotActionStatus ? <em>{snapshotActionStatus}</em> : null}
          </footer>
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
