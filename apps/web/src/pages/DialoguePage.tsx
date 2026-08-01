import {
  ArrowLeft,
  BookOpen,
  Columns3,
  GitCompareArrows,
  Lightbulb,
  ListTree,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Square,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { DialogueOutline, OutlineStep } from "../components/DialogueOutline";
import { ReflectionReview } from "../components/ReflectionReview";
import { DialogueSource, SourceDrawer } from "../components/SourceDrawer";
import { DailyQuestionView } from "./TodayPage";

type DialogueMode = "socratic" | "explain" | "compare" | "reflect" | "organize";
export type ModelProfile = "free" | "gpt" | "deepseek" | "qwen" | "kimi" | "zhipu" | "siliconflow";

type DialoguePageProps = {
  apiBaseUrl: string;
  question: DailyQuestionView;
  modelProfile: ModelProfile;
  onModelProfileChange: (profile: ModelProfile) => void;
  onOpenModelSettings: () => void;
  onBack: () => void;
};

type Message = {
  id: string;
  role: "assistant" | "user";
  body: string;
  mode?: DialogueMode;
};

type ProgressFlight = {
  id: number;
  fromX: number;
  fromY: number;
  deltaX: number;
  deltaY: number;
};

type DialogueTurnResponse = {
  mode: DialogueMode;
  assistant_message: string;
  model_profile: ModelProfile;
  provider_model: string | null;
  conversation_id: string | null;
};

type DialogueSessionSummary = {
  conversation_id: string;
  title: string;
  topic: string;
  current_mode: DialogueMode;
  model_profile: ModelProfile;
  turn_count: number;
  updated_at: string;
};

type DialogueSessionDetail = DialogueSessionSummary & {
  finished: boolean;
  messages: Array<{
    message_id: string;
    role: "assistant" | "user";
    body: string;
    mode: DialogueMode | null;
  }>;
};

type DialogueSessionListResponse = {
  items: DialogueSessionSummary[];
};

type PendingDialogueTurn = {
  answer: string;
  mode: DialogueMode;
  turnNumber: number;
  modelProfile: ModelProfile;
};

const modes = [
  { id: "socratic" as const, label: "追问", icon: Sparkles },
  { id: "explain" as const, label: "解释", icon: Lightbulb },
  { id: "compare" as const, label: "比较", icon: GitCompareArrows },
  { id: "reflect" as const, label: "反思", icon: Columns3 },
  { id: "organize" as const, label: "整理", icon: ListTree },
];

const modelProfileLabels: Record<ModelProfile, string> = {
  free: "豆包",
  gpt: "GPT",
  deepseek: "DeepSeek",
  qwen: "通义千问",
  kimi: "Kimi",
  zhipu: "智谱 GLM",
  siliconflow: "硅基流动",
};

const modelFailureGuidance: Record<ModelProfile, string> = {
  free: "豆包暂时不可用，请检查火山方舟配置，或稍后再试。",
  gpt: "GPT 暂时不可用，你可以切换到豆包继续，或稍后再试。",
  deepseek: "DeepSeek 暂时不可用，你可以切换到豆包继续，或稍后再试。",
  qwen: "通义千问暂时不可用，你可以切换到豆包继续，或稍后再试。",
  kimi: "Kimi 暂时不可用，你可以切换到豆包继续，或稍后再试。",
  zhipu: "智谱 GLM 暂时不可用，你可以切换到豆包继续，或稍后再试。",
  siliconflow: "硅基流动暂时不可用，你可以切换到豆包继续，或稍后再试。",
};

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

const activeDialogueStorageKey = "philosophyos-active-dialogue-id";

function openingMessage(question: DailyQuestionView) {
  if (question.isHistoricalFollowup) {
    return `我们接着上次留下的问题继续：“${question.prompt}”。先不用重复原来的思想节点，只说你现在对这个问题的第一反应变了吗？为什么？`;
  }
  return `先给出你的直觉判断。面对“${question.tension}”，你目前更倾向哪一方？为什么？`;
}

function isDialogueTurnResponse(value: unknown): value is DialogueTurnResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DialogueTurnResponse>;
  return (
    typeof candidate.assistant_message === "string" &&
    modes.some((item) => item.id === candidate.mode)
  );
}

function isDialogueSessionListResponse(value: unknown): value is DialogueSessionListResponse {
  return Boolean(value && typeof value === "object" && Array.isArray((value as DialogueSessionListResponse).items));
}

function isDialogueSessionDetail(value: unknown): value is DialogueSessionDetail {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DialogueSessionDetail>;
  return (
    typeof candidate.conversation_id === "string" &&
    typeof candidate.topic === "string" &&
    Array.isArray(candidate.messages)
  );
}

export function DialoguePage({
  apiBaseUrl,
  question,
  modelProfile,
  onModelProfileChange,
  onOpenModelSettings,
  onBack,
}: DialoguePageProps) {
  const [mode, setMode] = useState<DialogueMode>("socratic");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      mode: "socratic",
      body: openingMessage(question),
    },
  ]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionQuestion, setSessionQuestion] = useState(question.prompt);
  const [recentSessions, setRecentSessions] = useState<DialogueSessionSummary[]>([]);
  const [restoringSession, setRestoringSession] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [failedTurn, setFailedTurn] = useState<PendingDialogueTurn | null>(null);
  const [thinkingProfile, setThinkingProfile] = useState<ModelProfile | null>(null);
  const [progressFlight, setProgressFlight] = useState<ProgressFlight | null>(null);
  const [pulseStepId, setPulseStepId] = useState<string | null>(null);
  const [activeContext, setActiveContext] = useState(question.tension);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const progressTimer = useRef<number | null>(null);
  const thinkingCopy = `${modelProfileLabels[thinkingProfile ?? modelProfile]} 正在思考中`;

  async function loadRecentSessions() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/dialogue-sessions?limit=8`);
      if (!response.ok) return;
      const payload: unknown = await response.json();
      if (isDialogueSessionListResponse(payload)) setRecentSessions(payload.items);
    } catch {
      // Dialogue remains usable when the recent-session index is temporarily unavailable.
    }
  }

  async function restoreSession(id: string) {
    setRestoringSession(true);
    setFailedTurn(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/dialogue-sessions/${id}`);
      if (!response.ok) throw new Error(`Dialogue session returned ${response.status}`);
      const payload: unknown = await response.json();
      if (!isDialogueSessionDetail(payload)) throw new Error("Invalid dialogue session");

      setConversationId(payload.conversation_id);
      setSessionQuestion(payload.topic);
      setMessages(payload.messages.map((message) => ({
        id: message.message_id,
        role: message.role,
        body: message.body,
        mode: message.mode ?? undefined,
      })));
      setMode(payload.current_mode);
      setFinished(payload.finished);
      setReviewing(false);
      onModelProfileChange(payload.model_profile);
      window.localStorage.setItem(activeDialogueStorageKey, payload.conversation_id);
    } catch {
      window.localStorage.removeItem(activeDialogueStorageKey);
      setConversationId(null);
    } finally {
      setRestoringSession(false);
    }
  }

  function startNewDialogue() {
    window.localStorage.removeItem(activeDialogueStorageKey);
    setConversationId(null);
    setSessionQuestion(question.prompt);
    setMode("socratic");
    setMessages([{
      id: crypto.randomUUID(),
      role: "assistant",
      mode: "socratic",
      body: openingMessage(question),
    }]);
    setDraft("");
    setFinished(false);
    setReviewing(false);
    setFailedTurn(null);
    setActiveContext(question.tension);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  useEffect(() => {
    void loadRecentSessions();
    const savedConversationId = window.localStorage.getItem(activeDialogueStorageKey);
    if (savedConversationId) {
      void restoreSession(savedConversationId);
    } else {
      setRestoringSession(false);
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    setActiveContext(question.tension);
  }, [question.id, question.tension]);
  useEffect(() => () => {
    if (progressTimer.current !== null) window.clearTimeout(progressTimer.current);
  }, []);

  const outline = useMemo<OutlineStep[]>(() => {
    const userTurns = messages.filter((message) => message.role === "user").length;
    return [
      { id: "intuition", label: "直觉判断", detail: "先说你倾向的答案", state: userTurns > 0 ? "complete" : "current" },
      { id: "reason", label: "检验理由", detail: "寻找最关键的依据", state: userTurns > 0 ? (userTurns > 1 ? "complete" : "current") : "upcoming" },
      { id: "boundary", label: "概念边界", detail: "用反例测试判断", state: userTurns > 1 ? "current" : "upcoming" },
      { id: "summary", label: "整理观点", detail: "结束后由你确认", state: finished ? "complete" : "upcoming" },
    ];
  }, [finished, messages]);

  function animateProgressTo(nextStepId: string) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const start = sendButtonRef.current?.getBoundingClientRect();
      const target = document.querySelector(`[data-step-id="${nextStepId}"] .outline-marker`)?.getBoundingClientRect();
      if (start && target) {
        const fromX = start.left + start.width / 2;
        const fromY = start.top + start.height / 2;
        setProgressFlight({
          id: Date.now(),
          fromX,
          fromY,
          deltaX: target.left + target.width / 2 - fromX,
          deltaY: target.top + target.height / 2 - fromY,
        });
        setPulseStepId(nextStepId);
        if (progressTimer.current !== null) window.clearTimeout(progressTimer.current);
        progressTimer.current = window.setTimeout(() => {
          setProgressFlight(null);
          setPulseStepId(null);
          progressTimer.current = null;
        }, 820);
      }
  }

  async function requestAssistantTurn(turn: PendingDialogueTurn) {
    const response = await fetch(`${apiBaseUrl}/api/v1/dialogue-turns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_message: turn.answer,
        current_mode: turn.mode,
        requested_mode: turn.mode,
        model_profile: turn.modelProfile,
        topic: sessionQuestion,
        turn_number: turn.turnNumber,
        conversation_id: conversationId,
        initial_assistant_message: conversationId ? null : messages[0]?.body,
      }),
    });
    if (!response.ok) {
      throw new Error(`Dialogue API returned ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!isDialogueTurnResponse(payload)) {
      throw new Error("Dialogue API returned an invalid response");
    }

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        body: payload.assistant_message,
        mode: payload.mode,
      },
    ]);
    if (payload.conversation_id) {
      setConversationId(payload.conversation_id);
      window.localStorage.setItem(activeDialogueStorageKey, payload.conversation_id);
    }
    setMode(payload.mode);
    setFailedTurn(null);
    void loadRecentSessions();
  }

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = draft.trim();
    if (!answer || thinking || restoringSession || finished) return;

    const userTurns = messages.filter((message) => message.role === "user").length;
    const nextStepId = userTurns === 0 ? "reason" : userTurns === 1 ? "boundary" : "summary";
    const pendingTurn = { answer, mode, turnNumber: userTurns + 1, modelProfile };
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", body: answer },
    ]);
    setDraft("");
    setFailedTurn(null);
    setThinkingProfile(modelProfile);
    setThinking(true);

    animateProgressTo(nextStepId);
    try {
      await requestAssistantTurn(pendingTurn);
    } catch {
      setFailedTurn(pendingTurn);
    } finally {
      setThinking(false);
      setThinkingProfile(null);
      inputRef.current?.focus();
    }
  }

  async function retryFailedTurn() {
    if (!failedTurn || thinking || finished) return;
    setThinkingProfile(failedTurn.modelProfile);
    setThinking(true);
    try {
      await requestAssistantTurn(failedTurn);
    } catch {
      setFailedTurn(failedTurn);
    } finally {
      setThinking(false);
      setThinkingProfile(null);
      inputRef.current?.focus();
    }
  }

  async function switchToFreeAndRetry() {
    if (!failedTurn || failedTurn.modelProfile === "free" || thinking || finished) return;
    const freeTurn = { ...failedTurn, modelProfile: "free" as const };
    onModelProfileChange("free");
    setFailedTurn(freeTurn);
    setThinkingProfile("free");
    setThinking(true);
    try {
      await requestAssistantTurn(freeTurn);
    } catch {
      setFailedTurn(freeTurn);
    } finally {
      setThinking(false);
      setThinkingProfile(null);
      inputRef.current?.focus();
    }
  }

  function finishDialogue() {
    setFinished(true);
    setReviewing(true);
  }

  if (reviewing) {
    return (
      <ReflectionReview
        apiBaseUrl={apiBaseUrl}
        modelProfile={modelProfile}
        question={sessionQuestion}
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
    <main className="dialogue-page" id="dialogue" data-od-id="reasoning-workspace">
      <header className="dialogue-header" data-od-id="reasoning-header">
        <div className="dialogue-header-toolbar">
          <button className="icon-button" type="button" onClick={onBack} aria-label="返回今日" title="返回今日">
            <ArrowLeft size={20} />
          </button>
          <span>思考工作台</span>
          <div className="dialogue-header-actions">
            <label className="dialogue-session-picker">
              <span>最近会话</span>
              <select
                value={conversationId ?? ""}
                onChange={(event) => {
                  if (event.target.value) void restoreSession(event.target.value);
                }}
                disabled={restoringSession || thinking}
                aria-label="恢复最近会话"
              >
                <option value="">当前新对话</option>
                {recentSessions.map((session) => (
                  <option value={session.conversation_id} key={session.conversation_id}>
                    {session.title} · {session.turn_count} 轮
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-button new-dialogue-button" type="button" onClick={startNewDialogue} disabled={restoringSession || thinking}>
              <Plus size={16} /> 新建
            </button>
            <button className="secondary-button source-trigger" type="button" onClick={() => setSourcesOpen(true)}>
              <BookOpen size={17} /> 来源 <span>{sources.length}</span>
            </button>
            <button className="secondary-button finish-button" type="button" onClick={finishDialogue} disabled={finished || restoringSession}>
              <Square size={15} /> {finished ? "已结束" : "结束"}
            </button>
          </div>
        </div>

        <div className="dialogue-question-title">
          <span>{question.domain} · {question.difficulty}</span>
          <h1>{sessionQuestion}</h1>
        </div>

        <div className="mode-bar" aria-label="对话模式">
          <span>研究方法</span>
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
      </header>

      <div className="dialogue-workspace">
        <DialogueOutline steps={outline} pulseStepId={pulseStepId} />
        <section className="conversation" aria-label="哲学对话" data-od-id="reasoning-conversation">
          <div className="message-list" aria-live="polite">
            {restoringSession ? (
              <div className="dialogue-restoring" role="status">正在恢复上次思考…</div>
            ) : null}
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <div className="message-label">
                  <span aria-hidden="true">{message.role === "assistant" ? "Φ" : "你"}</span>
                  <div>
                    <strong>{message.role === "assistant" ? "哲学引导" : "研究者"}</strong>
                    <small>
                      {message.role === "assistant"
                        ? `PhilosophyOS · ${modes.find((item) => item.id === message.mode)?.label ?? "回应"}`
                        : "个人论证 · 本轮记录"}
                    </small>
                  </div>
                </div>
                <div className="message-argument">
                  <p>{message.body}</p>
                </div>
              </article>
            ))}
            {thinking ? (
              <div className="thinking-state" role="status">
                <span /><span /><span /> {thinkingCopy}
              </div>
            ) : null}
            {failedTurn ? (
              <div className="dialogue-retry-notice" role="status">
                <div>
                  <strong>{modelProfileLabels[failedTurn.modelProfile]} 暂时没有完成回应</strong>
                  <p>{modelFailureGuidance[failedTurn.modelProfile]} 你的回答已经保留，系统只会重新请求哲学引导，不会重复记录你的发言。</p>
                </div>
                <div className="dialogue-retry-actions">
                  {failedTurn.modelProfile !== "free" ? (
                    <button type="button" onClick={switchToFreeAndRetry} disabled={thinking || finished}>
                      <RotateCcw size={15} /> 切换到豆包并重试
                    </button>
                  ) : null}
                  <button type="button" onClick={retryFailedTurn} disabled={thinking || finished}>
                    <RotateCcw size={15} /> 重试原模型
                  </button>
                  <button type="button" className="dialogue-settings-action" onClick={onOpenModelSettings}>
                    <Settings2 size={15} /> 打开设置中心
                  </button>
                </div>
              </div>
            ) : null}
            {finished ? <div className="dialogue-complete">本轮对话已整理，下一步将确认哪些内容属于你的观点。</div> : null}
          </div>

          <form className="dialogue-composer" onSubmit={submitAnswer} data-od-id="thought-launcher">
            <label htmlFor="dialogue-answer">你的回答</label>
            <textarea
              id="dialogue-answer"
              ref={inputRef}
              rows={3}
              value={draft}
              disabled={finished || restoringSession}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={finished ? "本轮对话已结束" : "写下你的判断或理由…"}
            />
            <div>
              <span>{draft.length}/2000</span>
              <button ref={sendButtonRef} className="send-button" type="submit" disabled={!draft.trim() || thinking || restoringSession || finished} aria-label="发送回答" title="发送回答">
                <Send size={18} />
              </button>
            </div>
          </form>
        </section>
        <aside className="dialogue-context" aria-label="当前推演上下文" data-od-id="reasoning-track">
          <div className="context-panel-heading">
            <div>
              <span className="context-panel-kicker">推演轨道</span>
              <h2>推演现场</h2>
            </div>
            <span className={`context-live${thinking ? " thinking" : ""}`}><i />{thinking ? "推演中" : "已连接"}</span>
          </div>

          <div className="dialogue-context-status">
            <span className="status-orbit" aria-hidden="true"><i /></span>
            <div>
              <strong>{thinking ? thinkingCopy : "等待下一次判断"}</strong>
              <p>{thinking ? "正在检视当前论证与相关概念的关系。" : "你的回答会进入这条推理链，而不是被当作普通聊天记录。"}</p>
            </div>
          </div>

          <div className="context-chain" aria-label="当前推理链">
            {[question.tension, question.domain, question.philosopher].map((item, index) => (
              <button
                className={`context-chain-item${activeContext === item ? " selected" : ""}`}
                type="button"
                key={item}
                aria-pressed={activeContext === item}
                onClick={() => setActiveContext(item)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item}</strong>
                <small>{index === 0 ? "当前命题" : index === 1 ? "正在展开" : "待检验"}</small>
              </button>
            ))}
          </div>

          <div className="dialogue-context-note">
            <span>当前焦点</span>
            <strong>{activeContext}</strong>
            <p>点击路径节点切换上下文，右侧内容会跟随当前论证焦点变化。</p>
          </div>

          <button className="context-source-button" type="button" onClick={() => setSourcesOpen(true)}>
            <BookOpen size={15} /> 查看相关来源 <span>{sources.length}</span>
          </button>
        </aside>
      </div>

      {progressFlight ? (
        <span
          className="dialogue-progress-flight"
          key={progressFlight.id}
          style={{
            "--flight-from-x": `${progressFlight.fromX}px`,
            "--flight-from-y": `${progressFlight.fromY}px`,
            "--flight-delta-x": `${progressFlight.deltaX}px`,
            "--flight-delta-y": `${progressFlight.deltaY}px`,
          } as CSSProperties}
          aria-hidden="true"
        />
      ) : null}

      <SourceDrawer open={sourcesOpen} sources={sources} onClose={() => setSourcesOpen(false)} />
    </main>
  );
}
