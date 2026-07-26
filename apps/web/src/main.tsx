import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

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
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">PHILOSOPHYOS · LOCAL MVP</p>
        <h1 id="page-title">把哲学问题变成长期可回看的思想轨迹。</h1>
        <p className="intro">
          当前工程骨架已建立。后续将在这里加入每日哲学挑战、可信引用、Obsidian
          沉淀与好友讨论。
        </p>

        <div className="status-card" aria-live="polite">
          <span className={health ? "status-dot online" : "status-dot"} />
          <div>
            <strong>{health ? "API 已连接" : error ? "API 未连接" : "正在检查 API"}</strong>
            <p>
              {health
                ? `${health.service} · v${health.version}`
                : error ?? `连接 ${apiBaseUrl}`}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
