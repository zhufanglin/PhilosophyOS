import { Archive, BookMarked, Compass, Landmark, MessageSquare, Search, Settings2, UserRound, X } from "lucide-react";
import { StrictMode, useEffect, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import { ThoughtTransition, type ThoughtTransitionState } from "./components/ThoughtTransition";
import { ExplorePage } from "./pages/ExplorePage";
import { ConceptPage, type ConceptTransitionRequest } from "./pages/ConceptPage";
import { DialoguePage, type ModelProfile } from "./pages/DialoguePage";
import { DailyQuestionView, TodayPage } from "./pages/TodayPage";
import { ThoughtArchivePage } from "./pages/ThoughtArchivePage";
import { PhilosopherAtlasPage } from "./pages/PhilosopherAtlasPage";
import socratesPortrait from "./assets/philosophers/socrates-louvre.jpg";
import "./styles.css";
import "./editorial.css";

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
  base_url: string | null;
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

type ModelProfileDraft = {
  apiKey: string;
  model: string;
  baseUrl: string;
  apiStyle: "responses" | "chat_completions";
};

type ModelProfileGuide = {
  name: string;
  description: string;
  signupUrl: string;
  signupLabel: string;
  defaultModel: string;
  modelOptions: string[];
  defaultBaseUrl: string;
  apiStyle: "responses" | "chat_completions";
};

const modelProfileGuides: Record<ModelProfile, ModelProfileGuide> = {
  free: {
    name: "豆包 / 火山方舟",
    description: "适合先免费体验，Key 在火山引擎方舟控制台创建。",
    signupUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    signupLabel: "打开火山方舟控制台",
    defaultModel: "doubao-seed-2-0-lite-260428",
    modelOptions: ["doubao-seed-2-0-lite-260428"],
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiStyle: "responses",
  },
  gpt: {
    name: "GPT / OpenAI",
    description: "使用 OpenAI 官方 API。需要在平台创建 API Key，费用由平台账户承担。",
    signupUrl: "https://platform.openai.com/api-keys",
    signupLabel: "打开 OpenAI API Keys",
    defaultModel: "gpt-5.6",
    modelOptions: ["gpt-5.6", "gpt-4.1-mini"],
    defaultBaseUrl: "https://api.openai.com/v1",
    apiStyle: "responses",
  },
  deepseek: {
    name: "DeepSeek",
    description: "使用 DeepSeek 官方平台创建 Key，可选择 Flash 或 Pro。",
    signupUrl: "https://platform.deepseek.com/api_keys",
    signupLabel: "打开 DeepSeek API Keys",
    defaultModel: "deepseek-v4-flash",
    modelOptions: ["deepseek-v4-flash", "deepseek-v4-pro"],
    defaultBaseUrl: "https://api.deepseek.com",
    apiStyle: "chat_completions",
  },
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8001";

type AppView = "today" | "dialogue" | "explore" | "concept" | "archive" | "philosophers";

const appViews: AppView[] = ["today", "dialogue", "explore", "concept", "archive", "philosophers"];

const settingsArchiveNotes = [
  {
    label: "思想快照",
    value: "对话结束后由 AI 生成阶段性总结，等待你校对后再进入档案。",
  },
  {
    label: "Markdown / Obsidian",
    value: "保存时生成可读的 Markdown 草稿；没有 Obsidian 也可以作为普通文件使用。",
  },
  {
    label: "用户校对",
    value: "你可以认可、反对、重写或只保留原文，系统不会把 AI 总结当成最终真理。",
  },
];

const settingsPrivacyNotes = [
  "API Key 由本机后端写入 SQLite 私有配置；前端可以提交新 Key，但不会存储或再次读取明文。",
  "发送给模型的是本轮哲学回答与必要上下文，不会自动上传整个本地档案。",
  "思想档案优先保留在你的本地服务中，后续商业化同步功能需要单独授权。",
];

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
  const [modelProfileDrafts, setModelProfileDrafts] = useState<Partial<Record<ModelProfile, ModelProfileDraft>>>({});
  const [savingProfile, setSavingProfile] = useState<ModelProfile | null>(null);
  const [modelProfileSaveMessages, setModelProfileSaveMessages] = useState<Partial<Record<ModelProfile, string>>>({});
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [view, setView] = useState<AppView>(() => {
    const hash = window.location.hash.slice(1).split("?")[0];
    return appViews.includes(hash as AppView) ? hash as AppView : "today";
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
    let cancelled = false;
    let retryTimer: number | undefined;

    async function loadSystemStatus() {
      const controller = new AbortController();
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
        if (cancelled) {
          return;
        }
        setHealth((await healthResponse.json()) as HealthResponse);
        setError(null);
        const profilesPayload = (await profilesResponse.json()) as ModelProfilesResponse;
        setModelProfiles(profilesPayload.profiles);
        setModelProfile(profilesPayload.selected_profile);
        window.localStorage.setItem("philosophyos:model-profile", profilesPayload.selected_profile);
        setModelProfileDrafts((current) => {
          const next = { ...current };
          profilesPayload.profiles.forEach((profile) => {
            if (!next[profile.profile]) {
              const guide = modelProfileGuides[profile.profile];
              next[profile.profile] = {
                apiKey: "",
                model: profile.model || guide.defaultModel,
                baseUrl: profile.base_url ?? guide.defaultBaseUrl,
                apiStyle: profile.api_style,
              };
            }
          });
          return next;
        });
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
          if (cancelled) {
            return;
          }
          setHealth((await response.json()) as HealthResponse);
          setError("模型配置状态暂时不可用");
        } catch (healthError) {
          if (healthError instanceof DOMException && healthError.name === "AbortError") {
            return;
          }
          if (cancelled) {
            return;
          }
          setHealth(null);
          setError(
            !window.navigator.onLine
              ? "网络连接异常，请检查网络后重试"
              : healthError instanceof TypeError
              ? "后端未启动，请运行 scripts\\start-dev.cmd"
              : healthError instanceof Error
                ? `后端响应异常：${healthError.message}`
                : "网络连接异常，请稍后重试",
          );
        }
      } finally {
        if (!cancelled) {
          retryTimer = window.setTimeout(() => void loadSystemStatus(), 10_000);
        }
      }
    }

    void loadSystemStatus();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }
    };
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
        setModelProfile(payload.selected_profile);
        window.localStorage.setItem("philosophyos:model-profile", payload.selected_profile);
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
      const hash = window.location.hash.slice(1).split("?")[0];
      setView(appViews.includes(hash as AppView) ? hash as AppView : "today");
    }
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  function navigate(nextView: AppView) {
    window.location.hash = nextView;
    setView(nextView);
  }

  const selectedProfile = modelProfiles.find((profile) => profile.profile === modelProfile);
  const modelNeedsConfiguration = Boolean(health && selectedProfile && !selectedProfile.configured);

  async function saveModelProfile(profile: ModelProfile, selected: boolean) {
    const draft = modelProfileDrafts[profile];
    if (!draft) {
      return;
    }
    setSavingProfile(profile);
    setModelProfileSaveMessages((current) => ({ ...current, [profile]: "正在保存到本机…" }));
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/model-profiles/${profile}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: draft.apiKey.trim() || null,
          model: draft.model.trim(),
          base_url: draft.baseUrl.trim() || null,
          api_style: draft.apiStyle,
          selected,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || `保存失败（${response.status}）`);
      }
      const payload = (await response.json()) as ModelProfilesResponse;
      setModelProfiles(payload.profiles);
      if (selected) {
        setModelProfile(profile);
        window.localStorage.setItem("philosophyos:model-profile", profile);
      }
      setModelProfileDrafts((current) => ({
        ...current,
        [profile]: { ...draft, apiKey: "" },
      }));
      setModelProfileSaveMessages((current) => ({
        ...current,
        [profile]: "已保存。Key 只保存在本机后端。",
      }));
    } catch (requestError) {
      setModelProfileSaveMessages((current) => ({
        ...current,
        [profile]: requestError instanceof Error ? requestError.message : "保存失败，请稍后重试。",
      }));
    } finally {
      setSavingProfile(null);
    }
  }

  function changeModelProfile(nextProfile: ModelProfile) {
    setModelProfile(nextProfile);
    window.localStorage.setItem("philosophyos:model-profile", nextProfile);
    void saveModelProfile(nextProfile, true);
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
              <p className="section-kicker">SETTINGS / TRUST LEDGER</p>
              <h2 id="model-settings-title">设置中心</h2>
              <p>
                在这里确认模型路由、思想档案保存方式和隐私边界。PhilosophyOS 的设置不是后台杂项，
                而是让用户知道：谁在思考、内容存在哪里、哪些数据会被发送给模型。
              </p>
            </div>
            <button className="icon-button" type="button" onClick={() => setModelPanelOpen(false)} aria-label="关闭设置中心">
              <X size={18} />
            </button>
          </header>

          <section className="settings-ledger" aria-label="设置概览">
            <article>
              <span>当前模型</span>
              <strong>{activeModelStatus?.label ?? "免费模型"}</strong>
              <p>{modelStatusCopy}</p>
            </article>
            <article>
              <span>档案策略</span>
              <strong>先校对，再归档</strong>
              <p>AI 快照默认作为草稿，最终思想节点由用户确认。</p>
            </article>
            <article>
              <span>隐私边界</span>
              <strong>Key 不留在浏览器</strong>
              <p>浏览器只负责提交，Key 由本机后端保存且不会再次回传。</p>
            </article>
          </section>

          <section className="settings-section" aria-labelledby="settings-model-title">
            <div className="settings-section-heading">
              <span>01 / MODEL API</span>
              <h3 id="settings-model-title">模型与 API</h3>
              <p>在这里填写自己的 API。官方申请入口会标在每张卡片里，Key 只发送给本机后端保存。</p>
            </div>
            <div className="model-profile-grid">
              {orderedModelProfiles.map((profile) => {
                const guide = modelProfileGuides[profile.profile];
                const draft = modelProfileDrafts[profile.profile] ?? {
                  apiKey: "",
                  model: profile.model || guide.defaultModel,
                  baseUrl: guide.defaultBaseUrl,
                  apiStyle: guide.apiStyle,
                };
                const testState = modelProfileTests[profile.profile];
                const selected = modelProfile === profile.profile;
                const updateDraft = (changes: Partial<ModelProfileDraft>) => {
                  setModelProfileDrafts((current) => ({
                    ...current,
                    [profile.profile]: { ...draft, ...changes },
                  }));
                };
                return (
                  <article className={`model-profile-card${selected ? " selected" : ""}`} key={profile.profile}>
                    <div className="model-card-heading">
                      <div>
                        <span className={profile.configured ? "profile-ready" : "profile-missing"}>
                          {profile.configured ? "已配置" : "未配置"}
                        </span>
                        <h3>{guide.name}</h3>
                      </div>
                      {selected ? <strong>当前使用</strong> : null}
                    </div>
                    <p className="model-card-description">{guide.description}</p>
                    <a className="provider-link" href={guide.signupUrl} target="_blank" rel="noreferrer">
                      {guide.signupLabel}<span aria-hidden="true">↗</span>
                    </a>
                    <div className="model-config-fields">
                      <label>
                        <span>API Key</span>
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={draft.apiKey}
                          placeholder={profile.configured ? "已保存，留空表示不更换" : "粘贴 API Key"}
                          onChange={(event) => updateDraft({ apiKey: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>Model</span>
                        <input
                          list={`${profile.profile}-models`}
                          value={draft.model}
                          onChange={(event) => updateDraft({ model: event.target.value })}
                        />
                        <datalist id={`${profile.profile}-models`}>
                          {guide.modelOptions.map((option) => <option value={option} key={option} />)}
                        </datalist>
                      </label>
                      <label>
                        <span>Base URL</span>
                        <input
                          type="url"
                          value={draft.baseUrl}
                          onChange={(event) => updateDraft({ baseUrl: event.target.value })}
                        />
                      </label>
                    </div>

                    {modelProfileSaveMessages[profile.profile] ? (
                      <p className="model-card-result" role="status">{modelProfileSaveMessages[profile.profile]}</p>
                    ) : null}
                    {testState ? (
                      <p className={`model-card-result ${testState.status}`} role="status" aria-live="polite">
                        {testState.message}
                      </p>
                    ) : null}

                    <div className="model-card-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void saveModelProfile(profile.profile, selected)}
                        disabled={savingProfile === profile.profile}
                      >
                        {savingProfile === profile.profile ? "保存中…" : "保存配置"}
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => void testModelProfileConnection(profile.profile)}
                        disabled={!health || testState?.status === "testing" || !profile.configured}
                        aria-label={`测试${guide.name}连接`}
                      >
                        {testState?.status === "testing" ? "测试中" : "测试连接"}
                      </button>
                    </div>
                    {!selected ? (
                      <button className="model-select-link" type="button" onClick={() => changeModelProfile(profile.profile)}>
                        使用这个模型
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="settings-section settings-archive-section" aria-labelledby="settings-archive-title">
            <div className="settings-section-heading">
              <span>02 / ARCHIVE POLICY</span>
              <h3 id="settings-archive-title">思想档案与保存</h3>
              <p>这里强调 PhilosophyOS 与普通聊天的区别：不是保存所有废话，而是保存可追溯、可校对的思想节点。</p>
            </div>
            <div className="settings-note-list">
              {settingsArchiveNotes.map((item) => (
                <article key={item.label}>
                  <strong>{item.label}</strong>
                  <p>{item.value}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="settings-section settings-privacy-section" aria-labelledby="settings-privacy-title">
            <div className="settings-section-heading">
              <span>03 / PRIVACY BOUNDARY</span>
              <h3 id="settings-privacy-title">隐私与数据边界</h3>
              <p>这块先作为产品级说明入口，后续可以扩展为用户可配置的隐私面板。</p>
            </div>
            <ul>
              {settingsPrivacyNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>

          <footer>
            <span>本机私有配置</span>
            <strong>SQLite</strong>
            <p>更换设备时需要重新填写 API；当前 Key 不会进入浏览器存储或任何读取响应。</p>
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
      <aside className="side-nav" data-od-id="workspace-navigation">
        <div>
          <a className="brand" href="#today" aria-label="PhilosophyOS 今日页">
            <span>Φ</span>
            <span className="brand-copy">
              <strong>PhilosophyOS</strong>
              <small>西方哲学工作区</small>
            </span>
          </a>
          <nav aria-label="主导航">
            <small className="nav-section-label">每日研习</small>
            <a className={view === "today" ? "active" : ""} href="#today" aria-current={view === "today" ? "page" : undefined}><BookMarked size={17} /> 今日</a>
            <a className={view === "dialogue" ? "active" : ""} href="#dialogue" aria-current={view === "dialogue" ? "page" : undefined}><MessageSquare size={17} /> 对话</a>
            <a className={view === "explore" ? "active" : ""} href="#explore" aria-current={view === "explore" ? "page" : undefined}><Compass size={17} /> 探索</a>
            <small className="nav-section-label archive-label">个人馆藏</small>
            <a className={view === "archive" ? "active" : ""} href="#archive" aria-current={view === "archive" ? "page" : undefined}><Archive size={17} /> 思想档案</a>
            <a className={view === "philosophers" ? "active" : ""} href="#philosophers" aria-current={view === "philosophers" ? "page" : undefined}><Landmark size={17} /> 西方哲学家</a>
          </nav>
        </div>
        <div className="edition-mark">
          <span>思想期号 01</span>
          <p>西方哲学 · MVP</p>
        </div>
      </aside>

      <div className="content-frame">
        <header className="top-bar" data-od-id="workspace-toolbar">
          <div className="top-bar-leading">
            <div className="workspace-context">
              <span>思想空间 / 西方哲学</span>
              <strong>命题轨道 01</strong>
            </div>
            <label className="workspace-search">
              <Search size={15} aria-hidden="true" />
              <input type="search" placeholder="搜索思想、命题或引用" aria-label="搜索思想、命题或引用" />
              <kbd>⌘ K</kbd>
            </label>
          </div>
          <div className="mobile-brand">
            <span>Φ</span>
            <span className="brand-copy">
              <strong>PhilosophyOS</strong>
              <small>西方哲学工作区</small>
            </span>
          </div>
          <div className="top-bar-actions">
            <div className="api-status" aria-live="polite">
              <span className={health ? "status-dot online" : "status-dot"} />
              <strong>{modelNeedsConfiguration ? "模型尚未配置" : health ? "知识服务在线" : error ? "知识服务离线" : "正在连接"}</strong>
              <span className="api-version">{modelNeedsConfiguration ? "打开设置填写 API" : health ? `v${health.version}` : error ?? apiBaseUrl}</span>
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
                aria-label="打开设置中心"
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
        {view === "philosophers" ? <PhilosopherAtlasPage /> : null}
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
        <a className={view === "philosophers" ? "active" : ""} href="#philosophers"><Landmark size={19} /><span>图鉴</span></a>
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
