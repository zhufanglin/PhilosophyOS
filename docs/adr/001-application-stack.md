# ADR-001: 应用技术栈与本地数据边界

**Status:** accepted
**Date:** 2026-07-26
**Deciders:** PhilosophyOS project

## Context

PhilosophyOS 需要同时支持流式 AI 对话、哲学 RAG、结构化数据、Obsidian 本地文件接入和桌面/移动浏览器界面。首位验证用户运行 Windows，并希望现有 Obsidian 仓库保持本地优先和默认私密。

任务 1.1 只建立可启动骨架，不读取真实 Obsidian 仓库，也不连接外部模型或数据库。

## Decision

### Web 前端

使用 React、TypeScript 和 Vite。

- 本地开发地址：`http://127.0.0.1:5173`。
- 前端通过 `VITE_API_BASE_URL` 连接 API，默认 `http://127.0.0.1:8000`。
- 首版保持单页应用结构，待页面数量增加后再引入路由和状态管理。

### API 后端

使用 Python 3.12、FastAPI、Pydantic v2 和 Uvicorn。

- 本地开发地址：`http://127.0.0.1:8000`。
- 健康检查：`GET /health`。
- API 文档：`/docs`。
- 当前只允许本地 Vite 地址进行跨域访问。

### 后续数据层

计划使用 PostgreSQL 与 pgvector 保存公共哲学知识、用户记忆和向量索引。任务 1.1 不启动数据库，避免在模型和数据结构尚未完成前引入迁移负担。

### Obsidian 边界

- 任务 1.1 不读取 `D:\Obsidian\storage\Stu的哲学思考`。
- 后续先使用合成测试仓库验证只读索引、差异预览、冲突检测和撤销。
- 默认忽略 `.obsidian`、插件配置、认证数据和用户排除路径。
- 任何真实笔记写入都需要用户确认具体文件和差异。

### 配置与秘密

- `.env` 和 `.env.*` 不提交 Git；示例配置可以使用 `.env.example`。
- 模型密钥、Obsidian Local REST API 令牌和私人路径不得写入前端包、日志或版本库。
- 浏览器只访问 PhilosophyOS API，不直接访问本地文件系统。

## Consequences

**Positive:**

- Python 生态适合 RAG、文本处理和模型评测。
- React/Vite 提供快速的本地界面开发与类型检查。
- 前后端边界清晰，未来可以替换本地桥接或部署方式。
- Obsidian 权限集中在本地后端，浏览器不会直接获得仓库访问权。

**Negative:**

- 本地需要同时运行 API 和 Web 两个进程。
- 公开部署时不能直接读取用户本地 Obsidian，需要桌面桥接或插件。
- 前后端契约需要额外维护，后续应生成或共享类型。

## Alternatives Considered

- **Next.js 全栈：** 单仓体验更紧凑，但 Python RAG 工具仍需要独立服务，本地文件访问边界也不会消失。
- **纯 Python 服务端渲染：** 部署简单，但复杂对话、差异预览和实时多人讨论的前端体验受限。
- **Electron/Tauri 桌面应用：** 本地文件接入自然，但首版开发和发布成本更高。可在 Web MVP 验证后重新评估。
- **Obsidian 插件作为主界面：** 与仓库结合紧密，但不利于独立产品界面、移动访问和好友讨论。

## Local Development

后端：

```powershell
cd apps/api
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev]"
.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

前端：

```powershell
cd apps/web
pnpm install
pnpm dev
```
