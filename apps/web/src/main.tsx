import { Archive, BookMarked, Compass, MessageSquare, UserRound, Users } from "lucide-react";
import { StrictMode, useEffect, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import { ThoughtTransition, type ThoughtTransitionState } from "./components/ThoughtTransition";
import { ExplorePage } from "./pages/ExplorePage";
import { ConceptPage, type ConceptTransitionRequest } from "./pages/ConceptPage";
import { DialoguePage, type ModelProfile } from "./pages/DialoguePage";
import { DailyQuestionView, TodayPage } from "./pages/TodayPage";
import socratesPortrait from "./assets/philosophers/socrates-louvre.jpg";
import "./styles.css";

type HealthResponse = {
  status: string;
  service: string;
  version: string;
};

type ModelProfileStatus = {
  profile: ModelProfile;
  label: string;
  configured: boolean;
  model: string;
  base_url_host: string | null;
  api_style: "responses" | "chat_completions";
};

type ModelProfilesResponse = {
  selected_profile: ModelProfile;
  profiles: ModelProfileStatus[];
};

type ModelProfileConnectionTestResponse = {
  profile: ModelProfile;
  ok: boolean;
  code:
    | "ok"
    | "not_configured"
    | "authentication_failed"
    | "model_not_found"
    | "rate_limited"
    | "timeout"
    | "upstream_error";
  message: string;
  model: string;
};

type ModelProfileTestState = {
  profile: ModelProfile;
  status: "testing" | "success" | "error";
  message: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type AppView = "today" | "dialogue" | "explore" | "concept";

const fallbackQuestion: DailyQuestionView = {
  id: "q014",
  domain: "伦理学",
  difficulty: "进阶",
  era: "古希腊",
  prompt: "当诚实地生活必然带来损失时，我们仍有理由坚持诚实吗？",
  tension: "德性与结果",
  philosopher: "苏格拉底",
  source: "审核问题库 · 30 天内未出现",
  portraitUrl: socratesPortrait,
};

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelProfiles, setModelProfiles] = useState<ModelProfileStatus[]>([]);
  const [modelProfileTest, setModelProfileTest] = useState<ModelProfileTestState | null>(null);
  const [view, setView] = useState<AppView>(() => {
    const hash = window.location.hash.slice(1);
    return hash === "dialogue" || hash === "explore" || hash === "concept" ? hash : "today";
  });
  const [activeQuestion, setActiveQuestion] = useState(fallbackQuestion);
  const [modelProfile, setModelProfile] = useState<ModelProfile>(() => {
    const saved = window.localStorage.getItem("philosophyos:model-profile");
    return saved === "gpt" || saved === "deepseek" ? saved : "free";
  });
  const [thoughtTransition, setThoughtTransition] = useState<ThoughtTransitionState | null>(null);
  const transitionTimers = useRef<number[]>([]);

  useEffect(() => () => {
    transitionTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSystemStatus() {
      try {
        const [healthResponse, profilesResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/health`, { signal: controller.signal }),
          fetch(`${apiBaseUrl}/api/v1/model-profiles`, { signal: controller.signal }),
        ]);
        if (!healthResponse.ok) {
          throw new Error(`API 返回 ${healthResponse.status}`);
        }
        if (!profilesResponse.ok) {
          throw new Error(`模型配置返回 ${profilesResponse.status}`);
        }
        setHealth((await healthResponse.json()) as HealthResponse);
        const profilesPayload = (await profilesResponse.json()) as ModelProfilesResponse;
        setModelProfiles(profilesPayload.profiles);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }

        try {
          const response = await fetch(`${apiBaseUrl}/health`, {
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(`API 返回 ${response.status}`);
          }
          setHealth((await response.json()) as HealthResponse);
          setError("模型配置状态暂时不可用");
        } catch (healthError) {
          if (healthError instanceof DOMException && healthError.name === "AbortError") {
            return;
          }
          setError(healthError instanceof Error ? healthError.message : "无法连接 API");
        }
      }
    }

    void loadSystemStatus();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!health) {
      return;
    }

    const controller = new AbortController();

    async function loadModelProfiles() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/model-profiles`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`模型配置返回 ${response.status}`);
        }
        const payload = (await response.json()) as ModelProfilesResponse;
        setModelProfiles(payload.profiles);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError("模型配置状态暂时不可用");
      }
    }

    void loadModelProfiles();
    return () => controller.abort();
  }, [health]);

  useEffect(() => {
    function syncViewFromHash() {
      const hash = window.location.hash.slice(1);
      setView(hash === "dialogue" || hash === "explore" || hash === "concept" ? hash : "today");
    }
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  function navigate(nextView: AppView) {
    window.location.hash = nextView;
    setView(nextView);
  }

  function changeModelProfile(nextProfile: ModelProfile) {
    setModelProfile(nextProfile);
    setModelProfileTest(null);
    window.localStorage.setItem("philosophyos:model-profile", nextProfile);
  }

  async function testActiveModelProfile() {
    setModelProfileTest({
      profile: modelProfile,
      status: "testing",
      message: `${activeModelStatus?.label ?? "当前模型"} 连接测试中`,
    });

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/model-profiles/${modelProfile}/test-connection`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`模型测试返回 ${response.status}`);
      }
      const payload = (await response.json()) as ModelProfileConnectionTestResponse;
      setModelProfileTest({
        profile: payload.profile,
        status: payload.ok ? "success" : "error",
        message: payload.message,
      });
    } catch (requestError) {
      setModelProfileTest({
        profile: modelProfile,
        status: "error",
        message: requestError instanceof Error ? requestError.message : "模型连接测试失败",
      });
    }
  }

  const activeModelStatus = modelProfiles.find((profile) => profile.profile === modelProfile);
  const modelStatusCopy = activeModelStatus
    ? `${activeModelStatus.configured ? "已配置" : "未配置"} · ${activeModelStatus.model}`
    : "等待模型状态";

  function startDialogue(question: DailyQuestionView) {
    setActiveQuestion(question);
    navigate("dialogue");
  }

  function startConceptDialogue(request: ConceptTransitionRequest) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      startDialogue(request.question);
      return;
    }

    setThoughtTransition({
      phase: "contract",
      philosopher: request.philosopher,
      era: request.era,
      portraitUrl: request.portraitUrl,
      portraitPosition: request.portraitPosition,
      quote: request.quote,
      quoteSource: request.quoteSource,
      originX: request.originX,
      originY: request.originY,
    });

    transitionTimers.current.push(window.setTimeout(() => {
      setActiveQuestion(request.question);
      navigate("dialogue");
      setThoughtTransition((current) => current ? { ...current, phase: "portrait" } : null);

      transitionTimers.current.push(window.setTimeout(() => {
        const answerControl = document.querySelector(".send-button")?.getBoundingClientRect()
          ?? document.querySelector(".dialogue-composer")?.getBoundingClientRect();
        setThoughtTransition((current) => current ? {
          ...current,
          phase: "reveal",
          targetX: answerControl ? answerControl.left + answerControl.width / 2 : window.innerWidth / 2,
          targetY: answerControl ? answerControl.top + answerControl.height / 2 : window.innerHeight * 0.78,
        } : null);

        transitionTimers.current.push(window.setTimeout(() => {
          setThoughtTransition(null);
        }, 760));
      }, 1500));
    }, 560));
  }

  const arrivalStyle = thoughtTransition?.phase === "reveal"
    ? ({
        "--thought-target-x": `${thoughtTransition.targetX}px`,
        "--thought-target-y": `${thoughtTransition.targetY}px`,
      } as CSSProperties)
    : undefined;

  if (view === "concept") {
    return (
      <>
        <ConceptPage
          onExit={() => navigate("today")}
          onStart={startConceptDialogue}
          transitionOrigin={thoughtTransition?.phase === "contract"
            ? { x: thoughtTransition.originX, y: thoughtTransition.originY }
            : undefined}
        />
        {thoughtTransition ? <ThoughtTransition transition={thoughtTransition} /> : null}
      </>
    );
  }

  return (
    <>
    <div
      className={`app-frame${thoughtTransition?.phase === "reveal" ? " thought-arriving" : ""}`}
      style={arrivalStyle}
    >
      <aside className="side-nav">
        <div>
          <a className="brand" href="#today" aria-label="PhilosophyOS 今日页">
            <span>Φ</span>
            <span className="brand-copy">
              <strong>PhilosophyOS</strong>
              <small>WESTERN PHILOSOPHY</small>
            </span>
          </a>
          <nav aria-label="主导航">
            <small className="nav-section-label">每日研习</small>
            <a className={view === "today" ? "active" : ""} href="#today" aria-current={view === "today" ? "page" : undefined}><BookMarked size={17} /> 今日</a>
            <a className={view === "dialogue" ? "active" : ""} href="#dialogue" aria-current={view === "dialogue" ? "page" : undefined}><MessageSquare size={17} /> 对话</a>
            <a className={view === "explore" ? "active" : ""} href="#explore" aria-current={view === "explore" ? "page" : undefined}><Compass size={17} /> 探索</a>
            <small className="nav-section-label archive-label">个人馆藏</small>
            <span aria-disabled="true"><Archive size={17} /> 思想档案</span>
            <span aria-disabled="true"><Users size={17} /> 好友</span>
            <span aria-disabled="true"><BookMarked size={17} /> 笔记工作台</span>
          </nav>
        </div>
        <div className="edition-mark">
          <span>EDITION 01</span>
          <p>西方哲学 · MVP</p>
        </div>
      </aside>

      <div className="content-frame">
        <header className="top-bar">
          <div className="mobile-brand">
            <span>Φ</span>
            <span className="brand-copy">
              <strong>PhilosophyOS</strong>
              <small>WESTERN PHILOSOPHY</small>
            </span>
          </div>
          <div className="top-bar-actions">
            <div className="api-status" aria-live="polite">
              <span className={health ? "status-dot online" : "status-dot"} />
              <strong>{health ? "知识服务在线" : error ? "知识服务离线" : "正在连接"}</strong>
              <span className="api-version">{health ? `v${health.version}` : error ?? apiBaseUrl}</span>
            </div>
            <div className="model-switcher" aria-label="选择大模型">
              <span>模型</span>
              <button
                className={modelProfile === "free" ? "active" : ""}
                type="button"
                aria-pressed={modelProfile === "free"}
                onClick={() => changeModelProfile("free")}
              >
                免费
              </button>
              <button
                className={modelProfile === "gpt" ? "active" : ""}
                type="button"
                aria-pressed={modelProfile === "gpt"}
                onClick={() => changeModelProfile("gpt")}
              >
                GPT
              </button>
              <button
                className={modelProfile === "deepseek" ? "active" : ""}
                type="button"
                aria-pressed={modelProfile === "deepseek"}
                onClick={() => changeModelProfile("deepseek")}
              >
                DeepSeek
              </button>
            </div>
            <div
              className={`model-profile-status${activeModelStatus?.configured ? " configured" : ""}`}
              title={activeModelStatus?.base_url_host ?? undefined}
            >
              <span>{activeModelStatus?.label ?? "模型"}</span>
              <strong>{modelStatusCopy}</strong>
              <button
                type="button"
                onClick={testActiveModelProfile}
                disabled={!health || modelProfileTest?.status === "testing"}
                aria-label={`测试${activeModelStatus?.label ?? "当前模型"}连接`}
              >
                {modelProfileTest?.status === "testing" ? "测试中" : "测试"}
              </button>
            </div>
            {modelProfileTest ? (
              <div
                className={`model-test-result ${modelProfileTest.status}`}
                role="status"
                aria-live="polite"
              >
                {modelProfileTest.message}
              </div>
            ) : null}
            <button className="profile-button" type="button" aria-label="个人账户" title="个人账户"><UserRound size={18} /></button>
          </div>
        </header>
        {view === "today" ? <TodayPage onStart={startDialogue} /> : null}
        {view === "dialogue" ? (
          <DialoguePage
            apiBaseUrl={apiBaseUrl}
            question={activeQuestion}
            modelProfile={modelProfile}
            onBack={() => navigate("today")}
          />
        ) : null}
        {view === "explore" ? <ExplorePage apiBaseUrl={apiBaseUrl} /> : null}
      </div>

      <nav className="mobile-nav" aria-label="移动端主导航">
        <a className={view === "today" ? "active" : ""} href="#today"><BookMarked size={19} /><span>今日</span></a>
        <a className={view === "dialogue" ? "active" : ""} href="#dialogue"><MessageSquare size={19} /><span>对话</span></a>
        <a className={view === "explore" ? "active" : ""} href="#explore"><Compass size={19} /><span>探索</span></a>
      </nav>
    </div>
    {thoughtTransition ? <ThoughtTransition transition={thoughtTransition} /> : null}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
