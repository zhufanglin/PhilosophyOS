import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  MessageSquare,
  Network,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";

const metricCards = [
  {
    label: "Today Prompt",
    value: "Q014",
    note: "伦理学 · 进阶",
    icon: BookOpenCheck,
  },
  {
    label: "Active Dialogue",
    value: "3 turns",
    note: "苏格拉底式追问",
    icon: MessageSquare,
  },
  {
    label: "Knowledge Hits",
    value: "18",
    note: "RAG 可引用片段",
    icon: Database,
  },
  {
    label: "Archive Drafts",
    value: "5",
    note: "等待用户校对",
    icon: FileText,
  },
];

const activityItems = [
  {
    title: "今日命题已生成",
    description: "围绕“诚实与损失”的伦理张力进入思考。",
    time: "09:20",
  },
  {
    title: "RAG 检索完成",
    description: "命中苏格拉底、康德与义务论相关片段。",
    time: "09:21",
  },
  {
    title: "关系图谱准备中",
    description: "3 个核心概念、2 条可追问路径。",
    time: "09:22",
  },
];

const relationRows = [
  { name: "伦理学", value: 92 },
  { name: "德性与结果", value: 76 },
  { name: "苏格拉底式追问", value: 68 },
  { name: "灵魂照料", value: 45 },
];

export function ShadcnAdminDemoPage() {
  return (
    <main className="shadcn-admin-demo-page" id="shadcn-demo">
      <header className="admin-demo-header">
        <div>
          <p className="admin-demo-kicker">FRAMEWORK PREVIEW / satnaing/shadcn-admin</p>
          <h1>PhilosophyOS 工作台演示</h1>
          <p>
            这是按 shadcn-admin 的 Dashboard 骨架做的独立演示页：顶部工具栏、指标卡、主图表区、
            右侧活动流和设置入口。先看框架感，满意后再迁移到正式页面。
          </p>
        </div>
        <div className="admin-demo-actions">
          <label className="admin-demo-search">
            <Search size={15} />
            <input placeholder="搜索命题、概念或引用" />
          </label>
          <button type="button">
            <Settings2 size={16} />
            Settings
          </button>
        </div>
      </header>

      <section className="admin-demo-tabs" aria-label="演示视图">
        <button className="active" type="button">Overview</button>
        <button type="button">Analytics</button>
        <button type="button">Archive</button>
        <button type="button" disabled>Billing</button>
      </section>

      <section className="admin-demo-metrics" aria-label="核心指标">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="admin-demo-card admin-demo-metric-card" key={card.label}>
              <div>
                <span>{card.label}</span>
                <Icon size={17} />
              </div>
              <strong>{card.value}</strong>
              <p>{card.note}</p>
            </article>
          );
        })}
      </section>

      <section className="admin-demo-grid">
        <article className="admin-demo-card admin-demo-main-card">
          <header>
            <div>
              <span>Overview</span>
              <h2>今日思想运行情况</h2>
              <p>用 Dashboard 的方式展示命题、检索、对话、归档的状态。</p>
            </div>
            <button type="button">
              进入今日 <ArrowUpRight size={15} />
            </button>
          </header>
          <div className="admin-demo-chart" aria-label="演示图表">
            {[46, 68, 38, 82, 61, 76, 52, 90, 73, 58, 84, 69].map((height, index) => (
              <span key={`${height}-${index}`} style={{ height: `${height}%` }} />
            ))}
          </div>
        </article>

        <aside className="admin-demo-card admin-demo-feed-card">
          <header>
            <div>
              <span>Recent Activity</span>
              <h2>最近工作流</h2>
            </div>
            <Activity size={17} />
          </header>
          <ol>
            {activityItems.map((item) => (
              <li key={item.title}>
                <i />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
                <time>{item.time}</time>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="admin-demo-grid secondary">
        <article className="admin-demo-card admin-demo-relations-card">
          <header>
            <div>
              <span>Concept Relations</span>
              <h2>概念热度</h2>
            </div>
            <Network size={17} />
          </header>
          <div className="admin-demo-bars">
            {relationRows.map((row) => (
              <div key={row.name}>
                <span>{row.name}</span>
                <strong>{row.value}%</strong>
                <em><i style={{ width: `${row.value}%` }} /></em>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-demo-card admin-demo-status-card">
          <header>
            <div>
              <span>System Status</span>
              <h2>产品模块状态</h2>
            </div>
            <CheckCircle2 size={17} />
          </header>
          <div className="admin-demo-status-list">
            <p><Brain size={16} /> Socratic Dialogue <strong>Ready</strong></p>
            <p><Sparkles size={16} /> RAG Explore <strong>Online</strong></p>
            <p><BarChart3 size={16} /> Thought Archive <strong>Indexed</strong></p>
            <p><Clock3 size={16} /> Daily Prompt <strong>Scheduled</strong></p>
          </div>
        </article>
      </section>
    </main>
  );
}
