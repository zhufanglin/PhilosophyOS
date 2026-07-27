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
  question: string;
  userStatements: string[];
  onBack: () => void;
  onReturnToday: () => void;
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
  question,
  userStatements,
  onBack,
  onReturnToday,
}: ReflectionReviewProps) {
  const [items, setItems] = useState<ReviewItem[]>(() => initialItems(userStatements));
  const [saved, setSaved] = useState(false);
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
          <span>未勾选的内容不会保存</span>
        </div>
        <button className="primary-button" type="button" disabled={!canSave} onClick={() => setSaved(true)}>
          <Save size={17} /> 确认并保存
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
