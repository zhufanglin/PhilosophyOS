import { Archive, BookMarked, Compass, MessageSquare, UserRound, Users } from "lucide-react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { ExplorePage } from "./pages/ExplorePage";
import { DialoguePage } from "./pages/DialoguePage";
import { DailyQuestionView, TodayPage } from "./pages/TodayPage";
import "./styles.css";

type HealthResponse = {
  status: string;
  service: string;
  version: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type AppView = "today" | "dialogue" | "explore";

const fallbackQuestion: DailyQuestionView = {
  id: "q014",
  domain: "伦理学",
  difficulty: "进阶",
  era: "古希腊",
  prompt: "当诚实地生活必然带来损失时，我们仍有理由坚持诚实吗？",
  tension: "德性与结果",
  philosopher: "苏格拉底",
  source: "审核问题库 · 30 天内未出现",
  portraitUrl: "https://upload.wikimedia.org/wikipedia/commons/b/bc/Socrate_du_Louvre.jpg",
};

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<AppView>(() => {
    const hash = window.location.hash.slice(1);
    return hash === "dialogue" || hash === "explore" ? hash : "today";
  });
  const [activeQuestion, setActiveQuestion] = useState(fallbackQuestion);

  useEffect(() => {
    const controller = new AbortController();

    async function loadHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/health`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`API 返回 ${response.status}`);
        }
        setHealth((await response.json()) as HealthResponse);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "无法连接 API");
      }
    }

    void loadHealth();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function syncViewFromHash() {
      const hash = window.location.hash.slice(1);
      setView(hash === "dialogue" || hash === "explore" ? hash : "today");
    }
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  function navigate(nextView: AppView) {
    window.location.hash = nextView;
    setView(nextView);
  }

  function startDialogue(question: DailyQuestionView) {
    setActiveQuestion(question);
    navigate("dialogue");
  }

  return (
    <div className="app-frame">
      <aside className="side-nav">
        <div>
          <a className="brand" href="#today" aria-label="PhilosophyOS 今日页">
            <span>Φ</span>
            <strong>PhilosophyOS</strong>
          </a>
          <nav aria-label="主导航">
            <a className={view === "today" ? "active" : ""} href="#today" aria-current={view === "today" ? "page" : undefined}><BookMarked size={17} /> 今日</a>
            <a className={view === "dialogue" ? "active" : ""} href="#dialogue" aria-current={view === "dialogue" ? "page" : undefined}><MessageSquare size={17} /> 对话</a>
            <a className={view === "explore" ? "active" : ""} href="#explore" aria-current={view === "explore" ? "page" : undefined}><Compass size={17} /> 探索</a>
            <span><Archive size={17} /> 思想档案</span>
            <span><Users size={17} /> 好友</span>
            <span><BookMarked size={17} /> 笔记工作台</span>
          </nav>
        </div>
        <p>西方哲学 · MVP</p>
      </aside>

      <div className="content-frame">
        <header className="top-bar">
          <div className="mobile-brand">
            <span>Φ</span>
            <strong>PhilosophyOS</strong>
          </div>
          <div className="top-bar-actions">
            <div className="api-status" aria-live="polite">
            <span className={health ? "status-dot online" : "status-dot"} />
            <div>
              <strong>{health ? "知识服务在线" : error ? "知识服务离线" : "正在连接"}</strong>
              <span>{health ? `v${health.version}` : error ?? apiBaseUrl}</span>
            </div>
            </div>
            <button className="profile-button" type="button" aria-label="个人账户" title="个人账户"><UserRound size={18} /></button>
          </div>
        </header>
        {view === "today" ? <TodayPage onStart={startDialogue} /> : null}
        {view === "dialogue" ? <DialoguePage question={activeQuestion} onBack={() => navigate("today")} /> : null}
        {view === "explore" ? <ExplorePage apiBaseUrl={apiBaseUrl} /> : null}
      </div>

      <nav className="mobile-nav" aria-label="移动端主导航">
        <a className={view === "today" ? "active" : ""} href="#today"><BookMarked size={19} /><span>今日</span></a>
        <a className={view === "dialogue" ? "active" : ""} href="#dialogue"><MessageSquare size={19} /><span>对话</span></a>
        <a className={view === "explore" ? "active" : ""} href="#explore"><Compass size={19} /><span>探索</span></a>
      </nav>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
