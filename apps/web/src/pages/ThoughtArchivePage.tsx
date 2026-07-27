import { Archive, CircleDot, Clock3, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type SnapshotStatus = "completed" | "pending";

type ReflectionSnapshotListItem = {
  created_at: string;
  question: string;
  snapshot: {
    snapshot_id: string;
    status: SnapshotStatus;
    provider: string;
    provider_model: string | null;
    pending_reason: string | null;
    content: {
      topic: string;
      title: string;
      user_position: string;
      confidence: number;
      emotional_tone: string | null;
      core_question: string;
      key_insights: string[];
      tensions: string[];
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

export function ThoughtArchivePage({ apiBaseUrl }: ThoughtArchivePageProps) {
  const [items, setItems] = useState<ReflectionSnapshotListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="thought-archive-page" id="archive">
      <header className="archive-hero">
        <p className="section-kicker">THOUGHT ARCHIVE</p>
        <h1>思想时间线</h1>
        <p>
          这里会把每次对话后的思想快照串起来：哪些观点已经成形，哪些问题还在等待补生成，
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
          <h2>正在读取思想快照</h2>
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
          <h2>还没有思想快照</h2>
          <p>完成一次对话并保存后，这里会出现第一条思想变化记录。</p>
        </section>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <section className="thought-timeline" aria-label="思想快照时间线">
          {items.map((item) => {
            const content = item.snapshot.content;
            return (
              <article className={`timeline-card ${item.snapshot.status}`} key={item.snapshot.snapshot_id}>
                <div className="timeline-rail" aria-hidden="true">
                  <span />
                </div>
                <div className="timeline-card-body">
                  <div className="timeline-meta">
                    <span>{formatSnapshotTime(item.created_at)}</span>
                    <strong>{item.snapshot.status === "completed" ? "已生成" : "待补生成"}</strong>
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
                          下一步：{content.next_question}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
