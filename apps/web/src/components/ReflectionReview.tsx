import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  CheckCircle2,
  CircleHelp,
  Pencil,
  Quote,
  RotateCcw,
  Route,
  Save,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ReflectionOrigin = "user" | "ai" | "unresolved";
type ReflectionKind = "viewpoint" | "reason" | "concept" | "question" | "related";
type SnapshotDecision = "approved" | "edit" | "rejected" | "raw_only";

type ReviewItem = {
  id: string;
  kind: ReflectionKind;
  label: string;
  text: string;
  origin: ReflectionOrigin;
  selected: boolean;
  editing: boolean;
};

type ReflectionReviewProps = {
  apiBaseUrl: string;
  modelProfile: "free" | "gpt" | "deepseek" | "qwen" | "kimi" | "zhipu" | "siliconflow";
  question: string;
  userStatements: string[];
  onBack: () => void;
  onReturnToday: () => void;
};

type ObsidianDraftResponse = {
  file_name: string;
  absolute_path: string;
  message: string;
};

type ReflectionSnapshotResponse = {
  snapshot_id: string;
  status: "completed" | "pending";
  provider: string;
  provider_model: string | null;
  pending_reason: string | null;
  user_decision?: SnapshotDecision | null;
  decision_updated_at?: string | null;
  content: {
    title: string;
    topic: string;
    user_position: string;
    tensions: string[];
    next_question: string | null;
    next_question_reason?: string | null;
    next_question_status?: "suggested" | "approved" | "rejected";
  } | null;
};

type ReflectionSnapshotCorrectionResponse = {
  snapshot_id: string;
  content: NonNullable<ReflectionSnapshotResponse["content"]>;
  revision: {
    updated_at: string;
  };
};

type ReflectionSnapshotDecisionResponse = {
  snapshot_id: string;
  user_decision: SnapshotDecision;
  decision_updated_at: string;
};

const aiItems: ReviewItem[] = [
  {
    id: "concept",
    kind: "concept",
    label: "概念校正",
    text: "把“诚实”区分为不说假话、完整披露和忠于承诺，避免把不同义务混为一谈。",
    origin: "ai",
    selected: false,
    editing: false,
  },
  {
    id: "question",
    kind: "question",
    label: "开放问题",
    text: "当诚实会伤害无辜者时，例外的判断标准应由什么决定？",
    origin: "ai",
    selected: false,
    editing: false,
  },
  {
    id: "related",
    kind: "related",
    label: "关联建议",
    text: "比较苏格拉底的德性立场与结果论对行动后果的衡量。",
    origin: "ai",
    selected: false,
    editing: false,
  },
];

const kindIcons = {
  viewpoint: UserRoundCheck,
  reason: Quote,
  concept: BookOpenCheck,
  question: CircleHelp,
  related: Route,
};

const decisionCopy: Record<SnapshotDecision, string> = {
  approved: "已标记：认可这个 AI 总结。",
  edit: "已标记：稍后修改这个总结。",
  rejected: "已标记：不同意这个 AI 总结。",
  raw_only: "已标记：只保留用户原文，不采纳 AI 判断。",
};

function initialItems(userStatements: string[]): ReviewItem[] {
  const viewpoint = userStatements[0]?.trim();
  const reason = userStatements[1]?.trim();
  return [
    {
      id: "viewpoint",
      kind: "viewpoint",
      label: "我的暂定立场",
      text: viewpoint || "尚未识别出明确的用户观点，请用自己的话补充。",
      origin: viewpoint ? "user" : "unresolved",
      selected: false,
      editing: !viewpoint,
    },
    {
      id: "reason",
      kind: "reason",
      label: "我的理由",
      text: reason || "尚未识别出明确理由，请补充或修改。",
      origin: reason ? "user" : "unresolved",
      selected: false,
      editing: false,
    },
    ...aiItems.map((item) => ({ ...item })),
  ];
}

export function ReflectionReview({
  apiBaseUrl,
  modelProfile,
  question,
  userStatements,
  onBack,
  onReturnToday,
}: ReflectionReviewProps) {
  const [items, setItems] = useState<ReviewItem[]>(() => initialItems(userStatements));
  const [saved, setSaved] = useState(false);
  const [draftResult, setDraftResult] = useState<ObsidianDraftResponse | null>(null);
  const [snapshotResult, setSnapshotResult] = useState<ReflectionSnapshotResponse | null>(null);
  const [snapshotDecision, setSnapshotDecision] = useState<SnapshotDecision | null>(null);
  const [snapshotDecisionMessage, setSnapshotDecisionMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [retryingSnapshot, setRetryingSnapshot] = useState(false);
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [snapshotActionMessage, setSnapshotActionMessage] = useState<string | null>(null);
  const [correctedPosition, setCorrectedPosition] = useState("");
  const [correctedTensions, setCorrectedTensions] = useState("");
  const [correctedNextQuestion, setCorrectedNextQuestion] = useState("");
  const [correctedNextQuestionReason, setCorrectedNextQuestionReason] = useState("");
  const selectedItems = useMemo(() => items.filter((item) => item.selected), [items]);
  const canSave = selectedItems.some(
    (item) => item.kind === "viewpoint" && item.origin === "user",
  );

  useEffect(() => {
    if (!snapshotResult?.content) return;
    setCorrectedPosition(snapshotResult.content.user_position);
    setCorrectedTensions(snapshotResult.content.tensions.join("\n"));
    setCorrectedNextQuestion(snapshotResult.content.next_question ?? "");
    setCorrectedNextQuestionReason(snapshotResult.content.next_question_reason ?? "");
  }, [snapshotResult?.content]);

  function updateItem(itemId: string, update: Partial<ReviewItem>) {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...update } : item)),
    );
  }

  function toggleSelected(item: ReviewItem) {
    if (item.origin === "unresolved") {
      updateItem(item.id, { editing: true });
      return;
    }
    updateItem(item.id, { selected: !item.selected });
  }

  function saveEdit(item: ReviewItem) {
    const text = item.text.trim();
    if (!text) return;
    updateItem(item.id, {
      text,
      editing: false,
      origin: item.origin === "unresolved" ? "user" : item.origin,
    });
  }

  function selectedItemsPayload() {
    return selectedItems.map((item) => ({
      label: item.label,
      text: item.text,
      origin: item.origin === "ai" ? "ai" : "user",
      kind: item.kind,
    }));
  }

  async function createReflectionSnapshot() {
    const response = await fetch(`${apiBaseUrl}/api/v1/reflection-snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        user_statements: userStatements,
        selected_items: selectedItemsPayload(),
        model_profile: modelProfile,
      }),
    });
    if (!response.ok) {
      throw new Error(`Reflection snapshot API returned ${response.status}`);
    }
    return (await response.json()) as ReflectionSnapshotResponse;
  }

  async function storeSnapshotDecision(decision: SnapshotDecision) {
    setSnapshotDecision(decision);
    setSnapshotDecisionMessage(decisionCopy[decision]);

    if (!snapshotResult || snapshotResult.snapshot_id === "pending") {
      return;
    }

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/reflection-snapshots/${snapshotResult.snapshot_id}/decision`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      if (!response.ok) {
        throw new Error(`Reflection snapshot decision API returned ${response.status}`);
      }
      const payload = (await response.json()) as ReflectionSnapshotDecisionResponse;
      setSnapshotResult((current) =>
        current
          ? {
              ...current,
              user_decision: payload.user_decision,
              decision_updated_at: payload.decision_updated_at,
            }
          : current,
      );
      setSnapshotDecisionMessage(`${decisionCopy[decision]}已写入思想档案。`);
    } catch {
      setSnapshotDecisionMessage(`${decisionCopy[decision]}已在本页标记，暂未写入思想档案。`);
    }
  }

  async function retrySnapshotGeneration() {
    if (!snapshotResult || retryingSnapshot) return;
    setRetryingSnapshot(true);
    setSnapshotActionMessage(null);
    try {
      const response = snapshotResult.snapshot_id === "pending"
        ? await createReflectionSnapshot()
        : await fetch(
            `${apiBaseUrl}/api/v1/reflection-snapshots/${snapshotResult.snapshot_id}/retry`,
            { method: "POST" },
          ).then(async (result) => {
            if (!result.ok) throw new Error(`Reflection snapshot retry returned ${result.status}`);
            return (await result.json()) as ReflectionSnapshotResponse;
          });
      setSnapshotResult(response);
      setSnapshotActionMessage(
        response.status === "completed" ? "思想节点已补生成。" : "模型仍不可用，原始记录保持不变。",
      );
    } catch {
      setSnapshotActionMessage("暂时无法重试，原始记录仍已保存。");
    } finally {
      setRetryingSnapshot(false);
    }
  }

  async function saveSnapshotCorrection() {
    if (!snapshotResult?.content || !correctedPosition.trim() || savingCorrection) return;
    setSavingCorrection(true);
    setSnapshotActionMessage(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/reflection-snapshots/${snapshotResult.snapshot_id}/content`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_position: correctedPosition.trim(),
            tensions: correctedTensions.split("\n").map((value) => value.trim()).filter(Boolean),
            next_question: correctedNextQuestion.trim() || null,
            next_question_reason: correctedNextQuestionReason.trim() || null,
            next_question_status: correctedNextQuestion.trim() ? "approved" : "rejected",
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`Reflection snapshot correction returned ${response.status}`);
      }
      const payload = (await response.json()) as ReflectionSnapshotCorrectionResponse;
      setSnapshotResult((current) => current ? {
        ...current,
        content: payload.content,
        user_decision: "edit",
        decision_updated_at: payload.revision.updated_at,
      } : current);
      setSnapshotDecision("edit");
      setSnapshotDecisionMessage("修改后的总结已写入思想档案。");
      setSnapshotActionMessage("档案与关系图谱会使用这个修正版本。");
    } catch {
      setSnapshotActionMessage("修改暂未写入，请保留本页并稍后重试。 ");
    } finally {
      setSavingCorrection(false);
    }
  }

  async function saveReflection() {
    if (!canSave || savingDraft) return;
    setSavingDraft(true);
    setSaveError(null);

    try {
      try {
        setSnapshotResult(await createReflectionSnapshot());
      } catch (error) {
        setSnapshotResult({
          snapshot_id: "pending",
          status: "pending",
          provider: "none",
          provider_model: null,
          pending_reason: error instanceof Error ? error.message : "思想快照暂未生成",
          content: null,
        });
      }
      setSaved(true);

      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/obsidian-drafts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            user_statements: userStatements,
            selected_items: selectedItemsPayload(),
          }),
        });
        if (!response.ok) {
          throw new Error(`Obsidian draft API returned ${response.status}`);
        }
        setDraftResult((await response.json()) as ObsidianDraftResponse);
      } catch {
        setSaveError("思想档案已保存；本机未写入可选的 Obsidian 草稿。");
      }
    } finally {
      setSavingDraft(false);
    }
  }

  if (saved) {
    return (
      <main className="reflection-page reflection-saved" id="reflection">
        <div className="saved-mark"><CheckCircle2 size={30} /></div>
        <p className="section-kicker">REFLECTION SAVED</p>
        <h1>这次思考已经确认。</h1>
        <p>仅保存了你明确勾选的 {selectedItems.length} 项，其余草稿仍未进入长期记忆。</p>
        <div className="saved-summary">
          {selectedItems.map((item) => (
            <div key={item.id}>
              <Check size={16} />
              <span>{item.label}<small>{item.origin === "ai" ? "AI 建议" : "你的观点"}</small></span>
              <strong>{item.text}</strong>
            </div>
          ))}
        </div>
        {draftResult ? (
          <div className="obsidian-draft-result" role="status">
            <strong>{draftResult.message}</strong>
            <span>{draftResult.file_name}</span>
            <code>{draftResult.absolute_path}</code>
          </div>
        ) : saveError ? (
          <div className="obsidian-draft-result" role="status">
            <strong>{saveError}</strong>
          </div>
        ) : null}
        {snapshotResult ? (
          <div className={`thought-snapshot-result ${snapshotResult.status}`} role="status">
            <strong>
              {snapshotResult.status === "completed"
                ? "AI 思想节点已生成"
                : "原始记录已保存，思想节点待补生成"}
            </strong>
            {snapshotResult.content ? (
              <>
                <span>{snapshotResult.content.title}</span>
                <p>{snapshotResult.content.user_position}</p>
                {snapshotResult.content.next_question ? (
                  <em className="snapshot-followup-line">
                    {"\u4e0b\u6b21\u8ffd\u95ee\uff1a"}{snapshotResult.content.next_question}
                    {snapshotResult.content.next_question_reason ? ` ? ${snapshotResult.content.next_question_reason}` : ""}
                  </em>
                ) : snapshotResult.content.next_question_status === "rejected" ? (
                  <em className="snapshot-followup-line">{"\u8fd9\u6761 AI \u8ffd\u95ee\u5df2\u88ab\u62d2\u7edd\uff0c\u4e0d\u4f1a\u56de\u5230\u4eca\u65e5\u9875\u63a8\u8350\u3002"}</em>
                ) : null}
              </>
            ) : (
              <>
                <span>{snapshotResult.pending_reason}</span>
                <button
                  className="snapshot-retry-button"
                  type="button"
                  disabled={retryingSnapshot}
                  onClick={() => void retrySnapshotGeneration()}
                >
                  <RotateCcw size={15} /> {retryingSnapshot ? "正在补生成" : "重新生成这一条"}
                </button>
              </>
            )}
            {snapshotResult.status === "completed" ? (
              <div className="snapshot-decision-panel" aria-label="处理 AI 总结">
                <span>AI 总结需要你的态度：它只是建议，不会自动替你定论。</span>
                <div>
                  <button
                    className={snapshotDecision === "approved" ? "active" : ""}
                    type="button"
                    onClick={() => void storeSnapshotDecision("approved")}
                  >
                    认可这个总结
                  </button>
                  <button
                    className={snapshotDecision === "edit" ? "active" : ""}
                    type="button"
                    onClick={() => void storeSnapshotDecision("edit")}
                  >
                    我要修改
                  </button>
                  <button
                    className={snapshotDecision === "rejected" ? "active" : ""}
                    type="button"
                    onClick={() => void storeSnapshotDecision("rejected")}
                  >
                    我不同意
                  </button>
                  <button
                    className={snapshotDecision === "raw_only" ? "active" : ""}
                    type="button"
                    onClick={() => void storeSnapshotDecision("raw_only")}
                  >
                    只保存原文
                  </button>
                </div>
                {snapshotDecisionMessage ? <p>{snapshotDecisionMessage}</p> : null}
                {snapshotDecision === "edit" ? (
                  <div className="snapshot-correction-form">
                    <label>
                      <span>我的当前立场</span>
                      <textarea rows={3} value={correctedPosition} onChange={(event) => setCorrectedPosition(event.target.value)} />
                    </label>
                    <label>
                      <span>仍在拉扯的问题（每行一个）</span>
                      <textarea rows={3} value={correctedTensions} onChange={(event) => setCorrectedTensions(event.target.value)} />
                    </label>
                    <label>
                      <span>{"\u4e0b\u4e00\u6b65\u8ffd\u95ee\uff08\u6e05\u7a7a\u5c31\u8868\u793a\u62d2\u7edd\u8fd9\u6761\u8ffd\u95ee\uff09"}</span>
                      <textarea rows={2} value={correctedNextQuestion} onChange={(event) => setCorrectedNextQuestion(event.target.value)} />
                    </label>
                    <label>
                      <span>{"\u4e3a\u4ec0\u4e48\u8fd9\u6761\u8ffd\u95ee\u503c\u5f97\u7ee7\u7eed"}</span>
                      <textarea rows={2} value={correctedNextQuestionReason} onChange={(event) => setCorrectedNextQuestionReason(event.target.value)} />
                    </label>
                    <button type="button" disabled={!correctedPosition.trim() || savingCorrection} onClick={() => void saveSnapshotCorrection()}>
                      {savingCorrection ? "正在写入" : "保存修正版本"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {snapshotActionMessage ? <p className="snapshot-action-message">{snapshotActionMessage}</p> : null}
          </div>
        ) : null}
        <button className="primary-button" type="button" onClick={onReturnToday}>
          返回今日
        </button>
      </main>
    );
  }

  const userItems = items.filter((item) => item.origin !== "ai");
  const suggestions = items.filter((item) => item.origin === "ai");

  return (
    <main className="reflection-page" id="reflection">
      <header className="reflection-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="返回对话" title="返回对话">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="section-kicker">REVIEW BEFORE SAVING</p>
          <h1>确认这次思考</h1>
          <p>{question}</p>
        </div>
        <span className="pending-badge">待确认</span>
      </header>

      <div className="reflection-layout">
        <section className="reflection-user-section" aria-labelledby="user-reflection-title">
          <div className="reflection-section-heading">
            <div>
              <span className="origin-badge user"><UserRoundCheck size={15} /> 来自你的回答</span>
              <h2 id="user-reflection-title">你的观点</h2>
            </div>
            <p>勾选后才会保存为你的长期观点。</p>
          </div>
          <div className="review-item-list">
            {userItems.map((item) => (
              <ReviewItemRow item={item} key={item.id} onEdit={updateItem} onSave={saveEdit} onToggle={toggleSelected} />
            ))}
          </div>
        </section>

        <section className="reflection-ai-section" aria-labelledby="ai-reflection-title">
          <div className="reflection-section-heading">
            <div>
              <span className="origin-badge ai"><ShieldCheck size={15} /> AI 建议</span>
              <h2 id="ai-reflection-title">可选的澄清与延伸</h2>
            </div>
            <p>始终保留 AI 来源，不会合并为你的原话。</p>
          </div>
          <div className="review-item-list">
            {suggestions.map((item) => (
              <ReviewItemRow item={item} key={item.id} onEdit={updateItem} onSave={saveEdit} onToggle={toggleSelected} />
            ))}
          </div>
        </section>
      </div>

      <footer className="reflection-actions">
        <div>
          <strong>{selectedItems.length} 项已选择</strong>
          <span>{saveError ?? "未勾选的内容不会保存；思想档案保存在本机，Obsidian 草稿是可选副本。"}</span>
        </div>
        <button className="primary-button" type="button" disabled={!canSave || savingDraft} onClick={saveReflection}>
          <Save size={17} /> {savingDraft ? "正在保存" : "保存到思想档案"}
        </button>
      </footer>
    </main>
  );
}

type ReviewItemRowProps = {
  item: ReviewItem;
  onToggle: (item: ReviewItem) => void;
  onEdit: (itemId: string, update: Partial<ReviewItem>) => void;
  onSave: (item: ReviewItem) => void;
};

function ReviewItemRow({ item, onToggle, onEdit, onSave }: ReviewItemRowProps) {
  const Icon = kindIcons[item.kind];
  return (
    <article className={`review-item ${item.origin} ${item.selected ? "selected" : ""}`}>
      <button
        className="review-check"
        type="button"
        aria-label={`${item.selected ? "取消选择" : "选择"}${item.label}`}
        aria-pressed={item.selected}
        onClick={() => onToggle(item)}
      >
        {item.selected ? <Check size={15} /> : null}
      </button>
      <div className="review-item-content">
        <div className="review-item-label">
          <Icon size={16} />
          <strong>{item.label}</strong>
          <span className={`review-origin ${item.origin}`}>
            {item.origin === "ai" ? "AI 来源" : item.origin === "user" ? "用户原文" : "主体待确认"}
          </span>
        </div>
        {item.kind === "question" ? (
          <small className="review-followup-hint">
            {item.selected
              ? "\u5df2\u9009\u4e2d\uff1a\u8fd9\u6761\u8ffd\u95ee\u4f1a\u6210\u4e3a\u4eca\u65e5\u9875\u53ef\u7ee7\u7eed\u5165\u53e3\u3002"
              : "\u672a\u9009\u4e2d\uff1a\u8868\u793a\u62d2\u7edd AI \u8ffd\u95ee\uff0c\u4e0d\u4f1a\u8fdb\u5165\u4eca\u65e5\u9875\u63a8\u8350\u3002"}
          </small>
        ) : null}
        {item.editing ? (
          <textarea
            rows={3}
            value={item.text}
            aria-label={`编辑${item.label}`}
            onChange={(event) => onEdit(item.id, { text: event.target.value })}
          />
        ) : (
          <p>{item.text}</p>
        )}
      </div>
      {item.editing ? (
        <button className="item-action" type="button" onClick={() => onSave(item)} aria-label={`保存${item.label}`} title="保存修改">
          <Check size={17} />
        </button>
      ) : (
        <button className="item-action" type="button" onClick={() => onEdit(item.id, { editing: true })} aria-label={`编辑${item.label}`} title="编辑">
          <Pencil size={16} />
        </button>
      )}
    </article>
  );
}
