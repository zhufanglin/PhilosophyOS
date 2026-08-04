import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleEllipsis,
  GitBranch,
  Menu,
  PanelRight,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "framer-motion";

import {
  CitationPanel,
  CitationSummary,
  EvidenceCategory,
  evidenceLabel,
} from "./CitationPanel";
import { VoiceInputButton } from "./VoiceInputButton";

import "../explore.css";

type AnswerStatus = "supported" | "corrected" | "insufficient" | "exploratory";

type AnswerClaim = {
  text: string;
  category: EvidenceCategory;
  citation_ids: string[];
};

type ExploreAnswer = {
  question: string;
  status: AnswerStatus;
  answer: string;
  correction: string | null;
  evidence_note: string;
  claims: AnswerClaim[];
  citations: CitationSummary[];
  followup?: string;
};

type ExploreMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  answer?: ExploreAnswer;
  followup?: string;
  timestamp: string;
};

type ExploreThread = {
  id: string;
  title: string;
  preview: string;
  updated: string;
  messages: ExploreMessage[];
};

type ExploreThreadDemoProps = {
  apiBaseUrl: string;
};

type FlyingMessage = {
  id: string;
  text: string;
  phase: "source" | "target";
};

const panelSpring = {
  type: "spring" as const,
  stiffness: 360,
  damping: 32,
  mass: 0.72,
};

const messageSpring = {
  type: "spring" as const,
  stiffness: 380,
  damping: 30,
  mass: 0.7,
};

const sendFlightSpring = {
  type: "spring" as const,
  stiffness: 340,
  damping: 27,
  mass: 0.82,
};

const statusCopy: Record<AnswerStatus, { label: string }> = {
  supported: { label: "证据充分" },
  corrected: { label: "前提纠正" },
  insufficient: { label: "资料不足" },
  exploratory: { label: "探索引导" },
};

const demoCitations: CitationSummary[] = [
  {
    citation_id: "ethics-part-1",
    category: "primary",
    title: "《伦理学》第一部：论神",
    author: "巴鲁赫·斯宾诺莎",
    source_level: "原典",
    source_version: "1677 / 中文校订本",
    location: "第一部，定义与命题",
    context_preview: "自由的事物仅仅由其自身本性的必然性而存在，并由自身决定行动。",
    canonical_url: null,
    direct_quote: "我称那仅仅由其自身本性的必然性而存在，并由自身决定行动的事物为自由。",
  },
  {
    citation_id: "spinoza-freedom-study",
    category: "research",
    title: "Spinoza on Freedom and Necessity",
    author: "Gilles Deleuze",
    source_level: "研究解释",
    source_version: "1981 / English edition",
    location: "Chapter 4",
    context_preview: "认识因果关系并不摧毁行动，而是改变行动者与自身情感的关系。",
    canonical_url: "https://plato.stanford.edu/entries/spinoza/",
    direct_quote: null,
  },
];

const openingAnswer: ExploreAnswer = {
  question: "斯宾诺莎的自由是否只是认识必然？",
  status: "supported",
  answer:
    "斯宾诺莎并不把自由理解为脱离因果链的任意选择。对他而言，自由首先是理解我们为何如此行动：当一个人只被外部原因推动时，他处在被动状态；当他通过理性认识行动的原因时，行动便逐渐成为自己的表达。\n\n因此，“认识必然”不是取消自由，而是把自由从任性移动到自我规定。这个答案仍然保留一个张力：理性能够提高行动的主动性，却不意味着我们成为因果秩序之外的例外。",
  correction: null,
  evidence_note: "回答基于《伦理学》中的主动情感、必然性与自由概念，并区分了原典与研究解释。",
  claims: [
    { text: "自由不是脱离因果链的任意选择。", category: "primary", citation_ids: ["ethics-part-1"] },
    { text: "理解行动原因会让人从被动状态转向更主动的行动。", category: "research", citation_ids: ["spinoza-freedom-study"] },
    { text: "认识必然会把自由转化为自我规定，而不是取消自由。", category: "ai_inference", citation_ids: ["ethics-part-1", "spinoza-freedom-study"] },
  ],
  citations: demoCitations,
  followup: "你更关心的是：自由是否需要可能做出不同选择，还是自由只要求行动来自自己的理解？",
};

const initialThreads: ExploreThread[] = [
  {
    id: "demo-spinoza",
    title: "自由与必然",
    preview: "斯宾诺莎的自由是否只是认识必然？",
    updated: "刚刚",
    messages: [
      { id: "demo-user-1", role: "user", text: openingAnswer.question, timestamp: "刚刚" },
      {
        id: "demo-assistant-1",
        role: "assistant",
        text: openingAnswer.answer,
        answer: openingAnswer,
        followup: openingAnswer.followup,
        timestamp: "刚刚",
      },
    ],
  },
  {
    id: "demo-kant",
    title: "道德是否需要自由",
    preview: "康德如何区分自然因果与实践自由？",
    updated: "昨天",
    messages: [],
  },
  {
    id: "demo-sartre",
    title: "处境与选择",
    preview: "如果处境限制选择，责任还剩下什么？",
    updated: "7 月 30 日",
    messages: [],
  },
];

function nowLabel() {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function makeDemoReply(question: string): ExploreAnswer {
  return {
    ...openingAnswer,
    question,
    answer:
      "你把问题推进到了“" +
      question +
      "”。先把它拆成两个层次：第一层是概念本身的定义，第二层是这个概念在具体处境中如何改变判断。\n\n在哲学探索里，重要的不是马上选择一个立场，而是观察一个立场需要承担哪些后果。我们可以先沿着斯宾诺莎的路径继续：如果自由意味着理解行动的原因，那么你的问题会转向“谁拥有解释行动的权力”。",
    followup: "当一个人能够解释自己的行动，却无法改变行动的外部条件时，你还会称他为自由吗？",
  };
}

export function ExploreThreadDemo({ apiBaseUrl }: ExploreThreadDemoProps) {
  const [threads, setThreads] = useState(initialThreads);
  const [activeThreadId, setActiveThreadId] = useState(initialThreads[0].id);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [flyingMessage, setFlyingMessage] = useState<FlyingMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [acceptedRelation, setAcceptedRelation] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const followFrameRef = useRef<number | null>(null);
  const followAnchorRef = useRef<string | null>(null);
  const autoFollowRef = useRef(true);
  const programmaticScrollUntilRef = useRef(0);
  const [showLatestButton, setShowLatestButton] = useState(false);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? threads[0];
  const activeAnswer = [...activeThread.messages].reverse().find((message) => message.answer)?.answer;
  const filteredThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? threads.filter((thread) => (thread.title + thread.preview).toLowerCase().includes(query))
      : threads;
  }, [search, threads]);

  function isNearMessageEnd(container: HTMLDivElement, threshold = 132) {
    return container.scrollHeight - (container.scrollTop + container.clientHeight) <= threshold;
  }

  function findMessageElement(messageId: string) {
    return messagesRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId)}"]`,
    ) ?? null;
  }

  function cancelScheduledScroll() {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }

  function scheduleMessageScroll(
    messageId: string,
    block: ScrollLogicalPosition = "start",
  ) {
    cancelScheduledScroll();
    programmaticScrollUntilRef.current = Date.now() + 1450;

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
      setShowLatestButton(false);
    };

    scrollFrameRef.current = window.requestAnimationFrame(frame);
  }

  function scrollToLatest() {
    const latestMessage = activeThread.messages[activeThread.messages.length - 1];
    if (!latestMessage) return;

    autoFollowRef.current = true;
    followAnchorRef.current = latestMessage.id;
    scheduleMessageScroll(latestMessage.id, "end");
  }

  function focusConversationAnchor(messageId: string) {
    setFocusedMessageId(messageId);
    autoFollowRef.current = true;
    followAnchorRef.current = messageId;
    scheduleMessageScroll(messageId, "start");
    window.setTimeout(() => {
      setFocusedMessageId((current) => (current === messageId ? null : current));
    }, 900);
  }

  function handleMessageScroll() {
    const container = messagesRef.current;
    if (!container || Date.now() < programmaticScrollUntilRef.current) return;

    const nearEnd = isNearMessageEnd(container);
    autoFollowRef.current = nearEnd;
    setShowLatestButton(!nearEnd);
  }

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleMessageScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleMessageScroll);
  }, [activeThreadId]);

  useEffect(() => {
    if (!loading || !autoFollowRef.current) return;

    let lastFollowAt = 0;
    const followWhileGenerating = (timestamp: number) => {
      if (!autoFollowRef.current) {
        followFrameRef.current = null;
        return;
      }

      if (timestamp - lastFollowAt > 140 && followAnchorRef.current) {
        const target = findMessageElement(followAnchorRef.current);
        const isAssistantAnchor = target?.classList.contains("assistant");
        target?.scrollIntoView({
          // This loop runs repeatedly while the answer streams. Re-starting a
          // smooth scroll every 140ms causes the viewport to ease against
          // itself, which reads as a hitch or a brief "穿模" through the
          // message. The first anchor jump is smooth; streaming follow-up
          // corrections should be immediate and tiny.
          behavior: "auto",
          block: isAssistantAnchor ? "end" : "start",
          inline: "nearest",
        });
        lastFollowAt = timestamp;
      }

      followFrameRef.current = window.requestAnimationFrame(followWhileGenerating);
    };

    followFrameRef.current = window.requestAnimationFrame(followWhileGenerating);
    return () => {
      if (followFrameRef.current !== null) {
        window.cancelAnimationFrame(followFrameRef.current);
        followFrameRef.current = null;
      }
    };
  }, [loading]);

  useEffect(() => {
    if (!loading) return;
    const latestMessage = activeThread.messages[activeThread.messages.length - 1];
    if (latestMessage) followAnchorRef.current = latestMessage.id;
  }, [activeThread.messages, loading]);

  useEffect(() => {
    return () => {
      cancelScheduledScroll();
      if (followFrameRef.current !== null) {
        window.cancelAnimationFrame(followFrameRef.current);
      }
    };
  }, []);

  function updateThread(threadId: string, messages: ExploreMessage[]) {
    setThreads((current) =>
      current.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              title: thread.title === "新的探索" && messages.length > 0
                ? messages[0].text.slice(0, 18) + (messages[0].text.length > 18 ? "…" : "")
                : thread.title,
              messages,
              preview: messages.length > 0 ? messages[messages.length - 1].text : thread.preview,
              updated: "刚刚",
            }
          : thread,
      ),
    );
  }

  function startNewThread() {
    const thread: ExploreThread = {
      id: "explore-" + Date.now(),
      title: "新的探索",
      preview: "还没有问题",
      updated: "刚刚",
      messages: [],
    };
    setThreads((current) => [thread, ...current]);
    setActiveThreadId(thread.id);
    setDraft("");
    setFlyingMessage(null);
    setSending(false);
    setSidebarOpen(false);
    setError(null);
  }

  function openSidebar() {
    setSidebarCollapsed(false);
    setSidebarOpen(true);
  }

  function closeSidebar() {
    setSidebarOpen(false);
    setSidebarCollapsed(true);
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (question.length < 2 || loading || sending) return;

    const userMessage: ExploreMessage = {
      id: "user-" + Date.now(),
      role: "user",
      text: question,
      timestamp: nowLabel(),
    };
    const nextMessages = [...activeThread.messages, userMessage];
    setSending(true);
    setFlyingMessage({ id: userMessage.id, text: question, phase: "source" });
    setDraft("");
    setError(null);

    // Let the source capsule mount in the composer before handing it to the message stream.
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => window.setTimeout(resolve, 70));

    updateThread(activeThread.id, nextMessages);
    setFlyingMessage({ id: userMessage.id, text: question, phase: "target" });
    // Let React commit the target node before calculating the anchor. This
    // keeps the FLIP projection and the scroll anchor from measuring two
    // different layouts in the same frame.
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    focusConversationAnchor(userMessage.id);

    // Keep the shared layout id alive for the spring landing, then return to a normal message.
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    setFlyingMessage(null);
    setLoading(true);

    try {
      let answer: ExploreAnswer;
      if (liveMode) {
        const response = await fetch(apiBaseUrl + "/api/v1/knowledge-answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });
        if (!response.ok) throw new Error("知识接口返回 " + response.status);
        answer = (await response.json()) as ExploreAnswer;
        answer = {
          ...answer,
          followup: "你希望继续追问这个概念，还是比较另一位哲学家的回答？",
        };
        const assistantMessage: ExploreMessage = {
          id: "assistant-" + Date.now(),
          role: "assistant",
          text: answer.answer,
          answer,
          followup: answer.followup,
          timestamp: nowLabel(),
        };
        updateThread(activeThread.id, [...nextMessages, assistantMessage]);
        followAnchorRef.current = assistantMessage.id;
        if (autoFollowRef.current) {
          scheduleMessageScroll(assistantMessage.id, "center");
        } else {
          setShowLatestButton(true);
        }
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 520));
        answer = makeDemoReply(question);

        const assistantMessageId = "assistant-" + Date.now();
        followAnchorRef.current = assistantMessageId;
        const chunks = answer.answer.match(/.{1,28}(?:[，。！？；：\n]|$)/gu) ?? [answer.answer];
        let streamedText = "";

        for (const chunk of chunks) {
          streamedText += chunk;
          updateThread(activeThread.id, [
            ...nextMessages,
            {
              id: assistantMessageId,
              role: "assistant",
              text: streamedText,
              timestamp: nowLabel(),
            },
          ]);
          await new Promise((resolve) => window.setTimeout(resolve, 34));
        }

        const assistantMessage: ExploreMessage = {
          id: assistantMessageId,
          role: "assistant",
          text: answer.answer,
          answer,
          followup: answer.followup,
          timestamp: nowLabel(),
        };
        updateThread(activeThread.id, [...nextMessages, assistantMessage]);
        if (autoFollowRef.current) {
          scheduleMessageScroll(assistantMessage.id, "center");
        } else {
          setShowLatestButton(true);
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "暂时无法连接知识库");
    } finally {
      setLoading(false);
      setSending(false);
    }
  }

  function useFollowup(followup: string) {
    setDraft(followup);
    window.setTimeout(
      () => document.querySelector<HTMLTextAreaElement>(".explore-composer textarea")?.focus(),
      0,
    );
  }

  function appendVoiceTranscript(text: string) {
    setDraft((current) => {
      const separator = current.trim().length > 0 && !/[\s，。！？；：、]$/.test(current) ? " " : "";
      return `${current}${separator}${text}`;
    });
    window.setTimeout(
      () => document.querySelector<HTMLTextAreaElement>(".explore-composer textarea")?.focus(),
      0,
    );
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (draft.trim() && !loading && !sending) {
        event.currentTarget.form?.requestSubmit();
      }
    }
  }

  const flightLayoutId = flyingMessage ? `message-flight-${flyingMessage.id}` : undefined;

  function renderComposerInput(placeholder: string, ariaLabel: string) {
    return (
      <div className={"explore-composer-input-stage" + (flyingMessage ? " is-flying" : "")}>
        <textarea
          className={flyingMessage ? "is-flying" : undefined}
          value={draft}
          rows={3}
          readOnly={sending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
        />
        <AnimatePresence initial={false}>
          {flyingMessage?.phase === "source" ? (
            <motion.div
              className="explore-send-flight-source"
              key={flyingMessage.id}
              layoutId={flightLayoutId}
              initial={{ opacity: 0.2, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={sendFlightSpring}
              aria-hidden="true"
            >
              {flyingMessage.text}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="explore-message-flight">
        <motion.main
        className="explore-demo"
        id="explore"
        data-od-id="explore-workspace"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
      >
      <header className="explore-topbar" data-od-id="explore-header">
        <button
          className="explore-mobile-button"
          type="button"
          aria-label="打开探索历史"
          onClick={openSidebar}
        >
          <Menu size={18} />
        </button>
      </header>

      <div className={"explore-layout" + (sidebarOpen ? " sidebar-visible" : "") + (sidebarCollapsed ? " sidebar-collapsed" : "") + (evidenceOpen ? " evidence-visible" : " evidence-hidden")}>
        <motion.aside
          className="explore-sidebar"
          aria-label="探索历史"
          initial={false}
          animate={sidebarCollapsed ? "collapsed" : "expanded"}
          variants={{
            collapsed: { opacity: 1, x: 0 },
            expanded: { opacity: 1, x: 0 },
          }}
          transition={panelSpring}
        >
          <div className="explore-sidebar-rail" aria-label="最近探索快捷入口">
            <button type="button" className="explore-sidebar-rail-button" onClick={openSidebar} aria-label="展开最近探索" title="展开最近探索">
              <Menu size={17} />
            </button>
            <button type="button" className="explore-sidebar-rail-button" onClick={startNewThread} aria-label="新探索" title="新探索">
              <Plus size={17} />
            </button>
            <span className="explore-sidebar-rail-rule" />
            <span className="explore-sidebar-rail-dot" aria-hidden="true" />
          </div>
          <div className="explore-sidebar-tools" data-od-id="explore-history-tools">
            <label className="explore-search">
              <Search size={15} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索探索" aria-label="搜索探索" />
            </label>
            <button className="explore-new-button" type="button" onClick={startNewThread} data-od-id="explore-new-thread"><Plus size={15} /> 新探索</button>
          </div>
          <div className="explore-sidebar-heading">
            <span>最近探索</span>
            <div className="explore-sidebar-heading-actions">
              <button className="explore-sidebar-collapse" type="button" aria-label="收起最近探索" title="收起最近探索" onClick={closeSidebar}><ChevronLeft size={16} /></button>
              <button className="explore-sidebar-close" type="button" aria-label="关闭探索历史" title="关闭探索历史" onClick={closeSidebar}><X size={16} /></button>
            </div>
          </div>
          <div className="explore-thread-list">
            {filteredThreads.map((thread) => (
              <button className={"explore-thread-item" + (thread.id === activeThread.id ? " active" : "")} type="button" key={thread.id} onClick={() => { setActiveThreadId(thread.id); setSidebarOpen(false); }}>
                <span className="explore-thread-icon"><BookOpen size={15} /></span>
                <span className="explore-thread-copy"><strong>{thread.title}</strong><small>{thread.preview}</small></span>
                <time>{thread.updated}</time>
              </button>
            ))}
            {filteredThreads.length === 0 ? <p className="explore-empty-search">没有找到匹配的探索。</p> : null}
          </div>
          <div className="explore-sidebar-footer"><span><span className="explore-status-dot" />本地探索模式</span><small>证据优先 · 可恢复</small></div>
        </motion.aside>

        <section className="explore-thread" aria-label="当前探索对话" data-od-id="explore-thread">
          <div className="explore-thread-meta">
            <span>探索线程 / {activeThread.title}</span>
            <div className="explore-thread-meta-actions">
              {evidenceOpen ? null : <button className="explore-panel-restore explore-context-trigger" type="button" aria-label="打开证据与关系" title="打开证据与关系" onClick={() => setEvidenceOpen(true)}><PanelRight size={14} />证据与关系</button>}
              <span>{activeThread.messages.length > 0 ? activeThread.messages.length + " 条消息" : "等待你的问题"}</span>
            </div>
          </div>
          <motion.div
            layoutScroll
            ref={messagesRef}
            className={"explore-messages" + (activeThread.messages.length === 0 ? " is-empty" : "")}
            aria-live="polite"
            onWheel={handleMessageScroll}
            onTouchMove={handleMessageScroll}
          >
            {activeThread.messages.length === 0 ? (
              <div className="explore-welcome">
                <div className="explore-welcome-mark"><Sparkles size={21} /></div>
                <h2>从一个问题开始</h2>
                <p>你可以问一个概念，也可以把一个判断交给我一起拆开。回答会附带来源，并在最后留下一个可继续的问题。</p>
                <div className="explore-suggestion-row">
                  {["自由是否需要可能做出不同选择？", "康德的义务为什么不能只靠结果判断？", "存在主义如何理解责任？"].map((suggestion) => (
                    <button type="button" key={suggestion} onClick={() => setDraft(suggestion)}>{suggestion}<ChevronRight size={14} /></button>
                  ))}
                </div>
                <motion.form
                  className={"explore-composer explore-composer-centered" + (sending ? " is-sending" : "")}
                  onSubmit={submitQuestion}
                  data-od-id="explore-composer-empty"
                  whileFocus={{ scale: 1.008 }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                >
                  <div className="explore-composer-mode"><span className="explore-composer-mark"><Sparkles size={14} /></span><span>{liveMode ? "真实知识库" : "演示探索"}</span><button type="button" className="explore-mode-toggle" onClick={() => setLiveMode((value) => !value)}>{liveMode ? "切换演示" : "接入真实 API"}</button></div>
                  {renderComposerInput("从这里写下你的第一个问题…", "写下你的第一个探索问题")}
                  <div className="explore-composer-footer"><span>Enter 发送 · Shift + Enter 换行</span><div><button type="button" aria-label="重新生成" title="重新生成"><RotateCcw size={15} /></button><VoiceInputButton disabled={loading || sending} onTranscript={appendVoiceTranscript} /><button className="explore-send" type="submit" disabled={!draft.trim() || loading || sending} aria-label="发送问题"><Send size={16} /></button></div></div>
                </motion.form>
              </div>
            ) : null}
            {activeThread.messages.map((message) => (
              <motion.article
                className={
                  "explore-message " +
                  message.role +
                  (message.id === focusedMessageId ? " is-focus-anchor" : "") +
                  (flyingMessage?.phase === "target" && message.id === flyingMessage.id ? " is-flight-target" : "")
                }
                data-message-id={message.id}
                key={message.id}
                initial={
                  flyingMessage?.phase === "target" && message.id === flyingMessage.id
                    ? false
                    : {
                        opacity: 0,
                        x: message.role === "assistant" ? -12 : 0,
                        y: 15,
                        scale: 0.99,
                      }
                }
                animate={
                  flyingMessage?.phase === "target" && message.id === flyingMessage.id
                    ? { opacity: 1 }
                    : { opacity: 1, x: 0, y: 0, scale: 1 }
                }
                transition={
                  flyingMessage?.phase === "target" && message.id === flyingMessage.id
                    ? { duration: 0 }
                    : messageSpring
                }
              >
                <div className="explore-message-avatar">{message.role === "assistant" ? <Sparkles size={15} /> : "你"}</div>
                <div className="explore-message-body">
                  <div className="explore-message-header"><strong>{message.role === "assistant" ? "PhilosophyOS" : "你"}</strong><time>{message.timestamp}</time><button type="button" aria-label="更多消息操作"><CircleEllipsis size={16} /></button></div>
                  <motion.div
                    className="explore-message-copy"
                    layoutId={
                      flyingMessage?.phase === "target" && message.id === flyingMessage.id
                        ? flightLayoutId
                        : undefined
                    }
                    initial={flyingMessage?.phase === "target" && message.id === flyingMessage.id ? { opacity: 0.88, scale: 0.94 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={
                      flyingMessage?.phase === "target" && message.id === flyingMessage.id
                        ? sendFlightSpring
                        : { duration: 0.16 }
                    }
                  >
                    {message.text.split(/\n\n/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </motion.div>
                  {message.answer ? (
                    <>
                      {message.answer.correction ? (
                        <aside className="explore-correction-note">
                          <span>前提纠正</span>
                          <strong>{message.answer.correction}</strong>
                        </aside>
                      ) : null}
                      {message.answer.claims.length > 0 ? (
                        <section className="explore-claims" aria-label="回答主张">
                          <div className="explore-answer-section-label">逐条主张</div>
                          <ol>
                            {message.answer.claims.map((claim) => (
                              <li key={`${claim.text}-${claim.category}`}>
                                <span className={`explore-claim-kind ${claim.category}`}>{evidenceLabel(claim.category)}</span>
                                <p>{claim.text}</p>
                                <small>{claim.citation_ids.join(" · ")}</small>
                              </li>
                            ))}
                          </ol>
                        </section>
                      ) : null}
                      <div className="explore-evidence-note"><span>i</span><p>{message.answer.evidence_note}</p></div>
                      <div className="explore-answer-tools">
                        <span className={"explore-evidence-pill " + message.answer.status}><span />{statusCopy[message.answer.status].label}</span>
                        <span>{message.answer.claims.length} 条主张</span>
                        <span>{message.answer.citations.length} 个来源</span>
                        <button type="button" onClick={() => setEvidenceOpen(true)}><BookOpen size={14} />查看证据</button>
                      </div>
                    </>
                  ) : null}
                  {message.followup ? <button className="explore-followup" type="button" onClick={() => useFollowup(message.followup as string)}><span>继续追问</span><strong>{message.followup}</strong><ArrowUpRight size={15} /></button> : null}
                </div>
              </motion.article>
            ))}
            {focusedMessageId || loading ? (
              <div className="explore-focus-tail" aria-hidden="true" />
            ) : null}
            <AnimatePresence initial={false}>
              {loading ? (
                <motion.div
                  className="explore-generating"
                  key="generating"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  <span className="explore-generating-dot" /><span className="explore-generating-dot" /><span className="explore-generating-dot" /><strong>正在整理你的问题</strong><small>{liveMode ? "检索相关来源" : "演示模式 · 即将生成回答"}</small>
                </motion.div>
              ) : null}
              {showLatestButton ? (
                <motion.button
                  className="explore-jump-latest"
                  key="jump-latest"
                  type="button"
                  onClick={scrollToLatest}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={panelSpring}
                >
                  <span>回到最新回复</span>
                  <ChevronRight size={14} />
                </motion.button>
              ) : null}
            </AnimatePresence>
          </motion.div>
          {activeThread.messages.length > 0 ? (
            <motion.form
              className={"explore-composer" + (sending ? " is-sending" : "")}
              onSubmit={submitQuestion}
              data-od-id="explore-composer"
              whileFocus={{ scale: 1.008 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            >
              <div className="explore-composer-mode"><span className="explore-composer-mark"><Sparkles size={14} /></span><span>{liveMode ? "真实知识库" : "演示探索"}</span><button type="button" className="explore-mode-toggle" onClick={() => setLiveMode((value) => !value)}>{liveMode ? "切换演示" : "接入真实 API"}</button></div>
              {renderComposerInput("继续写下你的问题…", "继续写下你的问题")}
              <div className="explore-composer-footer"><span>Enter 发送 · Shift + Enter 换行</span><div><button type="button" aria-label="重新生成" title="重新生成"><RotateCcw size={15} /></button><VoiceInputButton disabled={loading || sending} onTranscript={appendVoiceTranscript} /><button className="explore-send" type="submit" disabled={!draft.trim() || loading || sending} aria-label="发送问题"><Send size={16} /></button></div></div>
            </motion.form>
          ) : null}
          {error ? <div className="explore-inline-error" role="alert">{error}<button type="button" onClick={() => setError(null)}><X size={14} /></button></div> : null}
        </section>

        <motion.aside
          className="explore-evidence"
          aria-label="证据与关系"
          data-od-id="explore-evidence"
          initial={false}
          animate={evidenceOpen ? "open" : "closed"}
          variants={{
            open: { opacity: 1, x: 0, scale: 1 },
            closed: { opacity: 0, x: 28, scale: 0.985 },
          }}
          transition={panelSpring}
        >
          <div className="explore-evidence-heading"><div><span>当前上下文</span><h2>证据与关系</h2></div><button type="button" aria-label="收起当前上下文" title="收起当前上下文" onClick={() => setEvidenceOpen(false)}><ChevronRight size={16} /></button></div>
          {activeAnswer ? (
            <>
              <div className="explore-context-card"><span>当前焦点</span><strong>自由与必然</strong><p>从本轮回答中识别出的核心概念。</p><a className="explore-context-link" href="#archive"><GitBranch size={14} />打开思想图谱</a></div>
              <div className="explore-relation-card"><div className="explore-panel-label"><span>待确认关系</span><span className="explore-relation-pending">待确认</span></div><div className="explore-relation-line"><strong>认识必然</strong><ChevronRight size={14} /><strong>行动自由</strong></div><p>两者在本轮回答中以“理解行动原因”的论证发生关联。</p><div className="explore-relation-actions"><button type="button" className={acceptedRelation ? "accepted" : ""} onClick={() => setAcceptedRelation(true)}><Check size={14} />{acceptedRelation ? "已加入图谱" : "加入图谱"}</button><button type="button" onClick={() => setAcceptedRelation(false)}>稍后</button></div></div>
              <div className="explore-citation-wrap"><CitationPanel apiBaseUrl={apiBaseUrl} citations={activeAnswer.citations} /></div>
            </>
          ) : <div className="explore-evidence-empty"><PanelRight size={20} /><strong>证据会在回答后出现</strong><p>提出一个问题，右侧会显示来源、主张和可以加入思想图谱的关系。</p></div>}
        </motion.aside>
      </div>
        </motion.main>
      </LayoutGroup>
    </MotionConfig>
  );
}
