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
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "framer-motion";

import { DialogueOutline, OutlineStep } from "../components/DialogueOutline";
import { ReflectionReview } from "../components/ReflectionReview";
import { DialogueSource, SourceDrawer } from "../components/SourceDrawer";
import { VoiceInputButton } from "../components/VoiceInputButton";
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

type DialogueFlyingMessage = {
  id: string;
  text: string;
  phase: "source" | "target";
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
  { id: "socratic" as const, label: "追问", intent: "继续问你为什么", icon: Sparkles },
  { id: "explain" as const, label: "解释", intent: "帮你拆清概念", icon: Lightbulb },
  { id: "compare" as const, label: "比较", intent: "找相反或相邻立场", icon: GitCompareArrows },
  { id: "reflect" as const, label: "反思", intent: "检查你的前提", icon: Columns3 },
  { id: "organize" as const, label: "整理", intent: "沉淀成思想节点", icon: ListTree },
];

const modelProfileLabels: Record<ModelProfile, string> = {
  deepseek: "DeepSeek",
  free: "Doubao / Volcano Ark",
  kimi: "Kimi / Moonshot AI",
  gpt: "OpenAI",
  qwen: "Qwen / Alibaba Cloud Bailian",
  siliconflow: "SiliconFlow",
  zhipu: "Zhipu GLM",
};

const modelFailureGuidance: Record<ModelProfile, string> = {
  free: "Doubao / Volcano Ark 暂时不可用，请检查火山方舟配置，或稍后再试。",
  gpt: "OpenAI 暂时不可用，你可以切换到 Doubao 继续，或稍后再试。",
  deepseek: "DeepSeek 暂时不可用，你可以切换到 Doubao 继续，或稍后再试。",
  qwen: "Qwen 暂时不可用，你可以切换到 Doubao 继续，或稍后再试。",
  kimi: "Kimi 暂时不可用，你可以切换到 Doubao 继续，或稍后再试。",
  zhipu: "Zhipu GLM 暂时不可用，你可以切换到 Doubao 继续，或稍后再试。",
  siliconflow: "SiliconFlow 暂时不可用，你可以切换到 Doubao 继续，或稍后再试。",
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

const dialogueMessageSpring = {
  type: "spring" as const,
  stiffness: 360,
  damping: 30,
  mass: 0.72,
};

const dialogueSendSpring = {
  type: "spring" as const,
  stiffness: 340,
  damping: 28,
  mass: 0.8,
};

function socraticNextQuestion(userTurnCount: number) {
  if (userTurnCount === 0) {
    return "先说出你的直觉判断，再指出：是什么理由让你愿意相信它？";
  }
  if (userTurnCount === 1) {
    return "现在试着提出一个反例：在什么情境下，你的判断可能不再成立？";
  }
  if (userTurnCount === 2) {
    return "把这个判断的边界说清楚：你愿意为它承担什么后果？";
  }
  return "回看刚才的回答：哪一个前提最值得你重新检查？";
}

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
  const [flyingMessage, setFlyingMessage] = useState<DialogueFlyingMessage | null>(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const progressTimer = useRef<number | null>(null);
  const thinkingCopy = `${modelProfileLabels[thinkingProfile ?? modelProfile]} 正在思考中`;

  function cancelMessageScroll() {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }

  function appendVoiceTranscript(text: string) {
    setDraft((current) => {
      const separator = current.trim().length > 0 && !/[\s，。！？；：、]$/.test(current) ? " " : "";
      return `${current}${separator}${text}`;
    });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function findMessageElement(messageId: string) {
    return messageListRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId)}"]`,
    ) ?? null;
  }

  function focusDialogueMessage(
    messageId: string,
    block: ScrollLogicalPosition = "start",
  ) {
    setFocusedMessageId(messageId);
    cancelMessageScroll();
    let attempts = 0;
    const frame = () => {
      const target = findMessageElement(messageId);
      if (!target && attempts < 12) {
        attempts += 1;
        scrollFrameRef.current = window.requestAnimationFrame(frame);
        return;
      }
      scrollFrameRef.current = null;
      if (!target) return;
      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block,
        inline: "nearest",
      });
    };
    scrollFrameRef.current = window.requestAnimationFrame(frame);
    window.setTimeout(() => {
      setFocusedMessageId((current) => (current === messageId ? null : current));
    }, 850);
  }

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
    cancelMessageScroll();
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
    setFlyingMessage(null);
    setFocusedMessageId(null);
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
    cancelMessageScroll();
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

    const assistantMessageId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      {
        id: assistantMessageId,
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
    return assistantMessageId;
  }

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = draft.trim();
    if (!answer || thinking || restoringSession || finished) return;

    const userTurns = messages.filter((message) => message.role === "user").length;
    const nextStepId = userTurns === 0 ? "reason" : userTurns === 1 ? "boundary" : "summary";
    const userMessageId = crypto.randomUUID();
    const pendingTurn = { answer, mode, turnNumber: userTurns + 1, modelProfile };
    setFlyingMessage({ id: userMessageId, text: answer, phase: "source" });
    setMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", body: answer },
    ]);
    setDraft("");
    setFailedTurn(null);
    setThinkingProfile(modelProfile);
    setThinking(true);

    animateProgressTo(nextStepId);
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      setFlyingMessage({ id: userMessageId, text: answer, phase: "target" });
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      focusDialogueMessage(userMessageId, "start");
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      setFlyingMessage(null);
      const assistantMessageId = await requestAssistantTurn(pendingTurn);
      focusDialogueMessage(assistantMessageId, "center");
    } catch {
      setFailedTurn(pendingTurn);
      setFlyingMessage(null);
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
      const assistantMessageId = await requestAssistantTurn(failedTurn);
      focusDialogueMessage(assistantMessageId, "center");
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
      const assistantMessageId = await requestAssistantTurn(freeTurn);
      focusDialogueMessage(assistantMessageId, "center");
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
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="dialogue-message-flight">
    <main className="dialogue-page dialogue-native" id="dialogue" data-od-id="reasoning-workspace">
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

        <div className="mode-bar" aria-label="对话意图">
          <span>下一步让 AI</span>
          <div className="mode-control" role="group" aria-label="选择对话方式">
            {modes.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={mode === item.id ? "active" : ""}
                  type="button"
                  key={item.id}
                  title={`${item.label}：${item.intent}`}
                  aria-label={`${item.label}：${item.intent}`}
                  aria-pressed={mode === item.id}
                  onClick={() => setMode(item.id)}
                >
                  <Icon size={15} />
                  <span className="mode-copy">
                    <strong>{item.label}</strong>
                    <small>{item.intent}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="dialogue-workspace dialogue-native-workspace">
        <DialogueOutline steps={outline} pulseStepId={pulseStepId} />
        <section className="conversation" aria-label="哲学对话" data-od-id="reasoning-conversation">
          <div className="message-list dialogue-native-messages" ref={messageListRef} aria-live="polite">
            {restoringSession ? (
              <div className="dialogue-restoring" role="status">正在恢复上次思考…</div>
            ) : null}
            {messages.map((message) => {
              const isFlightTarget = flyingMessage?.phase === "target" && message.id === flyingMessage.id;
              const isLatestAssistant = message.role === "assistant" && message.id === messages[messages.length - 1]?.id;
              const userTurnCount = messages.filter((item) => item.role === "user").length;
              return (
              <motion.article
                className={`message dialogue-native-message ${message.role}${message.id === focusedMessageId ? " is-focus-anchor" : ""}${isFlightTarget ? " is-flight-target" : ""}`}
                data-message-id={message.id}
                key={message.id}
                initial={isFlightTarget ? false : { opacity: 0, y: 14, x: message.role === "assistant" ? -10 : 0 }}
                animate={isFlightTarget ? { opacity: 1 } : { opacity: 1, y: 0, x: 0 }}
                transition={isFlightTarget ? { duration: 0 } : dialogueMessageSpring}
              >
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
                  <motion.div
                    className="dialogue-native-message-copy"
                    layoutId={isFlightTarget ? `dialogue-flight-${flyingMessage?.id}` : undefined}
                    initial={isFlightTarget ? { opacity: 0.86, scale: 0.94 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={isFlightTarget ? dialogueSendSpring : { duration: 0.18 }}
                  >
                    <p>{message.body}</p>
                  </motion.div>
                  {isLatestAssistant && !finished ? (
                    <motion.div
                      className="dialogue-native-next-question"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12, duration: 0.22 }}
                    >
                      <span>下一问</span>
                      <strong>{socraticNextQuestion(userTurnCount)}</strong>
                    </motion.div>
                  ) : null}
                </div>
              </motion.article>
              );
            })}
            {thinking ? (
              <motion.div
                className="philosopher-thinking-card"
                role="status"
                aria-live="polite"
                initial={{ opacity: 0, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="philosopher-thinking-portrait" aria-hidden="true">
                  {question.portraitUrl ? (
                    <img src={question.portraitUrl} alt="" />
                  ) : (
                    <span>Φ</span>
                  )}
                  <i />
                </div>
                <div className="philosopher-thinking-copy">
                  <span>正在沉思</span>
                  <strong>{question.philosopher || "今日哲学家"} 正在思考你的判断</strong>
                  <p>{thinkingCopy} · 正在沿着“{activeContext}”检查理由与前提。</p>
                </div>
                <div className="philosopher-thinking-pulse" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </motion.div>
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

          <form className={`dialogue-composer dialogue-native-composer${flyingMessage ? " is-sending" : ""}`} onSubmit={submitAnswer} data-od-id="thought-launcher">
            <label htmlFor="dialogue-answer">你的回答</label>
            <div className="dialogue-native-input-stage">
              <textarea
                id="dialogue-answer"
                ref={inputRef}
                rows={3}
                className={flyingMessage ? "is-flying" : undefined}
                value={draft}
                disabled={finished || restoringSession}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={finished ? "本轮对话已结束" : "写下你的判断或理由…"}
              />
              <AnimatePresence initial={false}>
                {flyingMessage?.phase === "source" ? (
                  <motion.div
                    className="dialogue-native-send-flight-source"
                    key={flyingMessage.id}
                    layoutId={`dialogue-flight-${flyingMessage.id}`}
                    initial={{ opacity: 0.2, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={dialogueSendSpring}
                    aria-hidden="true"
                  >
                    {flyingMessage.text}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
            <div>
              <span>{draft.length}/2000</span>
              <div className="composer-action-cluster">
                <VoiceInputButton
                  disabled={thinking || restoringSession || finished || Boolean(flyingMessage)}
                  onTranscript={appendVoiceTranscript}
                />
                <button ref={sendButtonRef} className="send-button" type="submit" disabled={!draft.trim() || thinking || restoringSession || finished} aria-label="发送回答" title="发送回答">
                  <Send size={18} />
                </button>
              </div>
            </div>
          </form>
        </section>
        <aside className="dialogue-context dialogue-native-context" aria-label="当前推演上下文" data-od-id="reasoning-track">
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
      </LayoutGroup>
    </MotionConfig>
  );
}
