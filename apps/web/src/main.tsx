import { Archive, BookMarked, Compass, MessageSquare, Settings2, UserRound, Users, X } from "lucide-react";
import { StrictMode, useEffect, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import { ThoughtTransition, type ThoughtTransitionState } from "./components/ThoughtTransition";
import { ExplorePage } from "./pages/ExplorePage";
import { ConceptPage, type ConceptTransitionRequest } from "./pages/ConceptPage";
import { DialoguePage, type ModelProfile } from "./pages/DialoguePage";
import { DailyQuestionView, TodayPage } from "./pages/TodayPage";
import { ThoughtArchivePage } from "./pages/ThoughtArchivePage";
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

type ModelProfileTestStates = Partial<Record<ModelProfile, ModelProfileTestState>>;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type AppView = "today" | "dialogue" | "explore" | "concept" | "archive";

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
  const [modelProfileTests, setModelProfileTests] = useState<ModelProfileTestStates>({});
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [view, setView] = useState<AppView>(() => {
    const hash = window.location.hash.slice(1);
    return hash === "dialogue" || hash === "explore" || hash === "concept" || hash === "archive"
      ? hash
      : "today";
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
      setView(
        hash === "dialogue" || hash === "explore" || hash === "concept" || hash === "archive"
          ? hash
          : "today",
      );
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
    window.localStorage.setItem("philosophyos:model-profile", nextProfile);
  }

  async function testModelProfileConnection(profile: ModelProfile) {
    const targetStatus = modelProfiles.find((item) => item.profile === profile);
    setModelProfileTests((current) => ({
      ...current,
      [profile]: {
        profile,
        status: "testing",
        message: `${targetStatus?.label ?? "当前模型"} 连接测试中`,
      },
    }));

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/model-profiles/${profile}/test-connection`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`模型测试返回 ${response.status}`);
      }
      const payload = (await response.json()) as ModelProfileConnectionTestResponse;
      setModelProfileTests((current) => ({
        ...current,
        [payload.profile]: {
          profile: payload.profile,
          status: payload.ok ? "success" : "error",
          message: payload.message,
        },
      }));
    } catch (requestError) {
      setModelProfileTests((current) => ({
        ...current,
        [profile]: {
          profile,
          status: "error",
          message: requestError instanceof Error ? requestError.message : "模型连接测试失败",
        },
      }));
    }
  }

  useEffect(() => {
    if (!modelPanelOpen) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModelPanelOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [modelPanelOpen]);

  const activeModelStatus = modelProfiles.find((profile) => profile.profile === modelProfile);
  const activeModelTest = modelProfileTests[modelProfile];
  const modelStatusCopy = activeModelStatus
    ? `${activeModelStatus.configured ? "已配置" : "未配置"} · ${activeModelStatus.model}`
    : "等待模型状态";
  const profileOrder: ModelProfile[] = ["free", "gpt", "deepseek"];
  const orderedModelProfiles = profileOrder
    .map((profile) => modelProfiles.find((item) => item.profile === profile))
    .filter((profile): profile is ModelProfileStatus => Boolean(profile));

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

  function renderModelPanel() {
    if (!modelPanelOpen) {
      return null;
    }

    return (
      <div className="model-panel-layer" role="presentation" onMouseDown={() => setModelPanelOpen(false)}>
        <section
          className="model-settings-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="model-settings-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header>
            <div>
              <p className="section-kicker">MODEL ROUTING</p>
              <h2 id="model-settings-title">模型设置</h2>
              <p>选择本轮对话使用的模型，并在本地后端安全测试连接。API Key 只保存在后端环境变量中。</p>
            </div>
            <button className="icon-button" type="button" onClick={() => setModelPanelOpen(false)} aria-label="关闭模型设置">
              <X size={18} />
            </button>
          </header>

          <div className="model-profile-grid">
            {orderedModelProfiles.map((profile) => {
              const testState = modelProfileTests[profile.profile];
              const selected = modelProfile === profile.profile;
              return (
                <article className={`model-profile-card${selected ? " selected" : ""}`} key={profile.profile}>
                  <div className="model-card-heading">
                    <div>
                      <span className={profile.configured ? "profile-ready" : "profile-missing"}>
                        {profile.configured ? "已配置" : "未配置"}
                      </span>
                      <h3>{profile.label}</h3>
                    </div>
                    {selected ? <strong>当前使用</strong> : null}
                  </div>

                  <dl>
                    <div>
                      <dt>模型</dt>
                      <dd>{profile.model}</dd>
                    </div>
                    <div>
                      <dt>服务</dt>
                      <dd>{profile.base_url_host ?? "默认服务"}</dd>
                    </div>
                    <div>
                      <dt>接口</dt>
                      <dd>{profile.api_style === "responses" ? "Responses" : "Chat Completions"}</dd>
                    </div>
                  </dl>

                  {testState ? (
                    <p className={`model-card-result ${testState.status}`} role="status" aria-live="polite">
                      {testState.message}
                    </p>
                  ) : (
                    <p className="model-card-hint">
                      {profile.configured ? "可测试该模型是否能正常回答。" : "请先在后端 .env 中填写这一组 API Key。"}
                    </p>
                  )}

                  <div className="model-card-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => changeModelProfile(profile.profile)}
                      disabled={selected}
                    >
                      {selected ? "已选择" : "切换到此模型"}
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void testModelProfileConnection(profile.profile)}
                      disabled={!health || testState?.status === "testing"}
                      aria-label={`测试${profile.label}连接`}
                    >
                      {testState?.status === "testing" ? "测试中" : "测试连接"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <footer>
            <span>配置文件</span>
            <strong>apps/api/.env</strong>
            <p>前端只选择模型档位，不接触、不存储任何 API Key。</p>
          </footer>
        </section>
      </div>
    );
  }

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
            <a className={view === "archive" ? "active" : ""} href="#archive" aria-current={view === "archive" ? "page" : undefined}><Archive size={17} /> 思想档案</a>
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
                onClick={() => setModelPanelOpen(true)}
                aria-expanded={modelPanelOpen}
                aria-label="打开模型设置"
              >
                <Settings2 size={13} /> 设置
              </button>
            </div>
            {activeModelTest ? (
              <div
                className={`model-test-result ${activeModelTest.status}`}
                role="status"
                aria-live="polite"
              >
                {activeModelTest.message}
              </div>
            ) : null}
            <button className="profile-button" type="button" aria-label="个人账户" title="个人账户"><UserRound size={18} /></button>
          </div>
        </header>
        {view === "today" ? <TodayPage onStart={startDialogue} /> : null}
        {view === "archive" ? <ThoughtArchivePage apiBaseUrl={apiBaseUrl} /> : null}
        {view === "dialogue" ? (
          <DialoguePage
            apiBaseUrl={apiBaseUrl}
            question={activeQuestion}
            modelProfile={modelProfile}
            onModelProfileChange={changeModelProfile}
            onBack={() => navigate("today")}
          />
        ) : null}
        {view === "explore" ? <ExplorePage apiBaseUrl={apiBaseUrl} /> : null}
      </div>

      <nav className="mobile-nav" aria-label="移动端主导航">
        <a className={view === "today" ? "active" : ""} href="#today"><BookMarked size={19} /><span>今日</span></a>
        <a className={view === "dialogue" ? "active" : ""} href="#dialogue"><MessageSquare size={19} /><span>对话</span></a>
        <a className={view === "explore" ? "active" : ""} href="#explore"><Compass size={19} /><span>探索</span></a>
        <a className={view === "archive" ? "active" : ""} href="#archive"><Archive size={19} /><span>档案</span></a>
      </nav>
    </div>
    {renderModelPanel()}
    {thoughtTransition ? <ThoughtTransition transition={thoughtTransition} /> : null}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
