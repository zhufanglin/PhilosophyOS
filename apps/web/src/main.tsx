import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { ExplorePage } from "./pages/ExplorePage";
import "./styles.css";

type HealthResponse = {
  status: string;
  service: string;
  version: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="app-frame">
      <aside className="side-nav">
        <div>
          <a className="brand" href="#top" aria-label="PhilosophyOS 首页">
            <span>Φ</span>
            <strong>PhilosophyOS</strong>
          </a>
          <nav aria-label="主导航">
            <a href="#today">今日</a>
            <a href="#dialogue">对话</a>
            <a className="active" href="#top" aria-current="page">探索</a>
            <a href="#archive">思想档案</a>
            <a href="#friends">好友</a>
            <a href="#notebook">笔记工作台</a>
          </nav>
        </div>
        <p>西方哲学 · MVP</p>
      </aside>

      <div className="content-frame" id="top">
        <header className="top-bar">
          <div className="mobile-brand">
            <span>Φ</span>
            <strong>PhilosophyOS</strong>
          </div>
          <div className="api-status" aria-live="polite">
            <span className={health ? "status-dot online" : "status-dot"} />
            <div>
              <strong>{health ? "知识服务在线" : error ? "知识服务离线" : "正在连接"}</strong>
              <span>{health ? `v${health.version}` : error ?? apiBaseUrl}</span>
            </div>
          </div>
        </header>
        <ExplorePage apiBaseUrl={apiBaseUrl} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
