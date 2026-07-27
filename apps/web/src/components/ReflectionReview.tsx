import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  CheckCircle2,
  CircleHelp,
  Pencil,
  Quote,
  Route,
  Save,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

type ReflectionOrigin = "user" | "ai" | "unresolved";
type ReflectionKind = "viewpoint" | "reason" | "concept" | "question" | "related";

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
  modelProfile: "free" | "gpt" | "deepseek";
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
  content: {
    title: string;
    topic: string;
    user_position: string;
    next_question: string | null;
  } | null;
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const selectedItems = useMemo(() => items.filter((item) => item.selected), [items]);
  const canSave = selectedItems.some(
    (item) => item.kind === "viewpoint" && item.origin === "user",
  );

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

  async function createReflectionSnapshot() {
    const response = await fetch(`${apiBaseUrl}/api/v1/reflection-snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        user_statements: userStatements,
        selected_items: selectedItems.map((item) => ({
          label: item.label,
          text: item.text,
          origin: item.origin === "ai" ? "ai" : "user",
        })),
        model_profile: modelProfile,
      }),
    });
    if (!response.ok) {
      throw new Error(`Reflection snapshot API returned ${response.status}`);
    }
    return (await response.json()) as ReflectionSnapshotResponse;
  }

  async function saveObsidianDraft() {
    if (!canSave || savingDraft) return;
    setSavingDraft(true);
    setSaveError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/obsidian-drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          user_statements: userStatements,
          selected_items: selectedItems.map((item) => ({
            label: item.label,
            text: item.text,
            origin: item.origin === "ai" ? "ai" : "user",
          })),
        }),
      });
      if (!response.ok) {
        throw new Error(`Obsidian draft API returned ${response.status}`);
      }
      const payload = (await response.json()) as ObsidianDraftResponse;
      setDraftResult(payload);
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
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存 Obsidian 草稿失败");
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
        ) : null}
        {snapshotResult ? (
          <div className={`thought-snapshot-result ${snapshotResult.status}`} role="status">
            <strong>
              {snapshotResult.status === "completed"
                ? "AI 思想快照已生成"
                : "原始记录已保存，思想快照待补生成"}
            </strong>
            {snapshotResult.content ? (
              <>
                <span>{snapshotResult.content.title}</span>
                <p>{snapshotResult.content.user_position}</p>
              </>
            ) : (
              <span>{snapshotResult.pending_reason}</span>
            )}
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
          <span>{saveError ?? "未勾选的内容不会保存，保存后会生成 Obsidian 草稿"}</span>
        </div>
        <button className="primary-button" type="button" disabled={!canSave || savingDraft} onClick={saveObsidianDraft}>
          <Save size={17} /> {savingDraft ? "正在生成草稿" : "保存到 Obsidian 草稿"}
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
