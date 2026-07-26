import {
  ArrowLeft,
  BookOpen,
  Columns3,
  GitCompareArrows,
  Lightbulb,
  ListTree,
  Send,
  Sparkles,
  Square,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { DialogueOutline, OutlineStep } from "../components/DialogueOutline";
import { ReflectionReview } from "../components/ReflectionReview";
import { DialogueSource, SourceDrawer } from "../components/SourceDrawer";
import { DailyQuestionView } from "./TodayPage";

type DialogueMode = "socratic" | "explain" | "compare" | "reflect" | "organize";

type DialoguePageProps = {
  question: DailyQuestionView;
  onBack: () => void;
};

type Message = {
  id: number;
  role: "assistant" | "user";
  body: string;
  mode?: DialogueMode;
};

const modes = [
  { id: "socratic" as const, label: "追问", icon: Sparkles },
  { id: "explain" as const, label: "解释", icon: Lightbulb },
  { id: "compare" as const, label: "比较", icon: GitCompareArrows },
  { id: "reflect" as const, label: "反思", icon: Columns3 },
  { id: "organize" as const, label: "整理", icon: ListTree },
];

const sources: DialogueSource[] = [
  {
    id: "plato-apology",
    kind: "原典",
    title: "Apology",
    author: "Plato",
    locator: "28b–38a",
    summary: "苏格拉底为未经省察的生活、德性与城邦义务之间的关系进行辩护。",
  },
  {
    id: "sep-socrates",
    kind: "研究解释",
    title: "Socrates",
    author: "Stanford Encyclopedia of Philosophy",
    locator: "Ethics section",
    summary: "梳理苏格拉底式省察、德性知识与坚持正当行动之间的联系。",
    url: "https://plato.stanford.edu/entries/socrates/",
  },
];

function responseFor(mode: DialogueMode) {
  const responses: Record<DialogueMode, string> = {
    socratic: "先只检验一个前提：如果诚实带来的损失会伤害无辜的人，你的理由仍然成立吗？",
    explain: "这里的冲突不只是诚实与利益，而是德性本身的价值与行动后果的价值。德性伦理会问诚实塑造了怎样的人，结果论则会继续计算损失由谁承担。",
    compare: "苏格拉底式立场把正当地生活置于外在得失之上；结果论更关注行动造成的总体影响。真正的分歧在于，德性能否独立于后果构成充分理由。",
    reflect: "先把理论放在一边。回想一次你因为诚实而付出代价的经历，那次选择保护了什么价值？",
    organize: "暂定观点：诚实通常值得坚持。主要理由：它维护信任与自我一致。当前张力：对无辜者造成严重损失时，这一原则是否仍无例外。",
  };
  return responses[mode];
}

export function DialoguePage({ question, onBack }: DialoguePageProps) {
  const [mode, setMode] = useState<DialogueMode>("socratic");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      mode: "socratic",
      body: "先给出你的直觉判断。你认为坚持诚实的理由，主要来自结果还是来自它本身？",
    },
  ]);
  const [thinking, setThinking] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const outline = useMemo<OutlineStep[]>(() => {
    const userTurns = messages.filter((message) => message.role === "user").length;
    return [
      { id: "intuition", label: "直觉判断", detail: "先说你倾向的答案", state: userTurns > 0 ? "complete" : "current" },
      { id: "reason", label: "检验理由", detail: "寻找最关键的依据", state: userTurns > 0 ? (userTurns > 1 ? "complete" : "current") : "upcoming" },
      { id: "boundary", label: "概念边界", detail: "用反例测试判断", state: userTurns > 1 ? "current" : "upcoming" },
      { id: "summary", label: "整理观点", detail: "结束后由你确认", state: finished ? "complete" : "upcoming" },
    ];
  }, [finished, messages]);

  function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = draft.trim();
    if (!answer || thinking || finished) return;

    const nextId = messages.length + 1;
    setMessages((current) => [...current, { id: nextId, role: "user", body: answer }]);
    setDraft("");
    setThinking(true);
    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        { id: nextId + 1, role: "assistant", body: responseFor(mode), mode },
      ]);
      setThinking(false);
      inputRef.current?.focus();
    }, 420);
  }

  function finishDialogue() {
    setFinished(true);
    setReviewing(true);
  }

  if (reviewing) {
    return (
      <ReflectionReview
        question={question.prompt}
        userStatements={messages.filter((message) => message.role === "user").map((message) => message.body)}
        onBack={() => {
          setFinished(false);
          setReviewing(false);
        }}
        onReturnToday={onBack}
      />
    );
  }

  return (
    <main className="dialogue-page" id="dialogue">
      <header className="dialogue-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="返回今日" title="返回今日">
          <ArrowLeft size={20} />
        </button>
        <div className="dialogue-question-title">
          <span>{question.domain} · {question.difficulty}</span>
          <h1>{question.prompt}</h1>
        </div>
        <div className="dialogue-header-actions">
          <button className="secondary-button source-trigger" type="button" onClick={() => setSourcesOpen(true)}>
            <BookOpen size={17} /> 来源 <span>{sources.length}</span>
          </button>
          <button className="secondary-button finish-button" type="button" onClick={finishDialogue} disabled={finished}>
            <Square size={15} /> {finished ? "已结束" : "结束"}
          </button>
        </div>
      </header>

      <div className="mode-bar" aria-label="对话模式">
        <span>对话方式</span>
        <div className="mode-control" role="group" aria-label="选择对话方式">
          {modes.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={mode === item.id ? "active" : ""}
                type="button"
                key={item.id}
                aria-pressed={mode === item.id}
                onClick={() => setMode(item.id)}
              >
                <Icon size={15} /> {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="dialogue-workspace">
        <DialogueOutline steps={outline} />
        <section className="conversation" aria-label="哲学对话">
          <div className="message-list" aria-live="polite">
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <div className="message-label">
                  <span>{message.role === "assistant" ? "Φ" : "你"}</span>
                  <strong>{message.role === "assistant" ? "PhilosophyOS" : "你的回答"}</strong>
                  {message.mode ? <small>{modes.find((item) => item.id === message.mode)?.label}</small> : null}
                </div>
                <p>{message.body}</p>
              </article>
            ))}
            {thinking ? <div className="thinking-state"><span /><span /><span /> 正在整理这一点</div> : null}
            {finished ? <div className="dialogue-complete">本轮对话已整理，下一步将确认哪些内容属于你的观点。</div> : null}
          </div>

          <form className="dialogue-composer" onSubmit={submitAnswer}>
            <label htmlFor="dialogue-answer">你的回答</label>
            <textarea
              id="dialogue-answer"
              ref={inputRef}
              rows={3}
              value={draft}
              disabled={finished}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={finished ? "本轮对话已结束" : "写下你的判断或理由…"}
            />
            <div>
              <span>{draft.length}/2000</span>
              <button className="send-button" type="submit" disabled={!draft.trim() || thinking || finished} aria-label="发送回答" title="发送回答">
                <Send size={18} />
              </button>
            </div>
          </form>
        </section>
      </div>

      <SourceDrawer open={sourcesOpen} sources={sources} onClose={() => setSourcesOpen(false)} />
    </main>
  );
}
