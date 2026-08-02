# PhilosophyOS 🏛️✨

> 一座给个人思想使用的「数字哲学博物馆」。
>
> PhilosophyOS 不是普通的 AI 聊天页，也不是只会塞知识点的学习工具。它想做的是：每天给你一个值得认真对话的问题，把你的回答、犹豫、立场变化和哲学家参照沉淀成一座可以回看的思想档案。

PhilosophyOS 当前处在本地 Beta 阶段，优先覆盖从古希腊到当代的西方哲学。核心体验围绕四件事展开：

- 🌅 每日哲学命题：从一个问题开始，而不是从一堆菜单开始。
- 🧭 苏格拉底式对话：追问、澄清、比较、整理，让观点慢慢成形。
- 🗂️ 思想档案：把每次对话沉淀成本地可检索、可导出、可回看的思想节点。
- 🕸️ 关系图谱与哲学家图鉴：像 Obsidian 一样探索思想之间的联系，也能从哲学家进入相关问题。

---

## 现在能用什么？🚀

本地 Beta 的主导航只保留已经有实际功能的模块：

| 模块 | 用来做什么 |
| --- | --- |
| 🌅 今日 | 进入每日哲学问题，开启当天的思考 |
| 💬 对话 | 完成苏格拉底式追问、解释、比较和整理 |
| 🔍 探索 | 使用本地 RAG 与模型 API 查询西方哲学知识 |
| 🗂️ 思想档案 | 查看、筛选、导出、导入和删除本地思想快照 |
| 🕸️ 关系图谱 | 以网状图查看问题、主题、张力、哲学家和标签的关系 |
| 🏛️ 哲学家图鉴 | 浏览西方思想家，进入相关档案与思想关系 |

暂不在主导航展示的能力包括：好友讨论、笔记工作台、云同步、计费、Obsidian 双向同步。这些还在计划里，但不会用空入口假装已经完成。

---

## 项目气质 🎨

PhilosophyOS 的视觉方向不是「AI 产品模板」，而是：

- 古典哲学 × 数字人文
- 羊皮纸、手稿、博物馆展签
- Obsidian 式知识探索
- Apple 官网那种克制的空间叙事
- 安静、深邃、可长期使用

一句话：打开页面时，应该感觉像走进一座收藏人类思想的数字博物馆。

---

## 快速启动 🛠️

### 1. 启动后端

不配置真实模型 key 时，系统会使用 deterministic mode，适合本地演示和自动化测试。

```powershell
cd C:\Users\30290\Desktop\PhilosophyOS\apps\api
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
$env:PHILOSOPHYOS_AI_PROVIDER='deterministic'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

后端默认地址：

```text
http://127.0.0.1:8001
```

### 2. 启动前端

```powershell
cd C:\Users\30290\Desktop\PhilosophyOS\apps\web
npm.cmd install
npm.cmd run dev
```

前端默认地址：

```text
http://127.0.0.1:5174/#today
```

### 3. 一键启动

也可以在项目根目录运行：

```powershell
cd C:\Users\30290\Desktop\PhilosophyOS
.\scripts\start-dev.ps1
```

如果 PowerShell 拦截 `.ps1`：

```powershell
.\scripts\start-dev.cmd
```

---

## 模型 API 配置 🤖

PhilosophyOS 的浏览器前端不会直接保存 API Key。真实 key 只能放在后端环境变量、本地 `.env` 或后端模型配置接口中。

常见配置方式：

```env
PHILOSOPHYOS_MODEL_PROFILE=free
PHILOSOPHYOS_AI_PROVIDER=auto

FREE_API_KEY=<豆包/火山方舟 key>
FREE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
FREE_MODEL=doubao-seed-2-0-lite-260428
FREE_API_STYLE=responses

GPT_API_KEY=<OpenAI 或 OpenAI-compatible key>
GPT_BASE_URL=https://api.openai.com/v1
GPT_MODEL=gpt-5.6
GPT_API_STYLE=responses

DEEPSEEK_API_KEY=<DeepSeek key>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_API_STYLE=chat_completions
```

普通用户未来应该默认使用 PhilosophyOS 托管模型额度；自带 API Key 更适合高级用户、团队和本地 Beta。

---

## 数据与隐私边界 🔐

- 本地运行状态和日志保存在 `.runtime`，不提交到 Git。
- 思想档案、对话和模型 profile 存在本地 SQLite。
- 前端只能看到配置状态，不能读回完整 API Key。
- `.env`、真实 API Key、本地数据库、Obsidian 私人路径都不应该提交到 GitHub。
- 测试默认不调用真实 GPT、DeepSeek 或豆包额度。

---

## 哲学家肖像与版权 🖼️

当前图鉴已经接入部分 Wikimedia Commons 肖像素材，并保留来源 metadata。后续补图时请优先使用：

- Public Domain
- CC0
- CC BY
- CC BY-SA

不要直接使用 Pinterest、百度图片、Getty、Alamy 或来源不明的现代照片。现代思想家的照片尤其要谨慎：找不到明确授权时，宁可使用占位图或后续原创插画方案。

素材目录：

```text
photo/
apps/web/public/philosopher-portraits/
```

缺图清单：

```text
photo/_missing_portraits_for_manual_download.csv
```

---

## 文档地图 🗺️

| 文档 | 内容 |
| --- | --- |
| [PhilosophyOS-PRD.md](PhilosophyOS-PRD.md) | 产品愿景、需求与版本范围 |
| [docs/product/mvp-scope.md](docs/product/mvp-scope.md) | MVP 边界、成功标准和演示路径 |
| [docs/content/western-philosophy-map.md](docs/content/western-philosophy-map.md) | 西方哲学时代、人物与内容深度地图 |
| [docs/content/source-policy.md](docs/content/source-policy.md) | 来源、版权、引用和版本管理规范 |
| [docs/architecture/knowledge-model.md](docs/architecture/knowledge-model.md) | 知识实体、关系、记忆和 Obsidian 数据模型 |
| [docs/product/model-api-onboarding.md](docs/product/model-api-onboarding.md) | 模型 API 申请、Base URL、隐私边界和用户路径 |
| [docs/product/social-discussion.md](docs/product/social-discussion.md) | 好友关系、私密讨论、权限和安全规范 |
| [docs/agent/behavior-spec.md](docs/agent/behavior-spec.md) | Agent 模式、工具调用和输出约束 |
| [docs/evaluation/evaluation-plan.md](docs/evaluation/evaluation-plan.md) | 质量评测维度、门槛和回归流程 |
| [plans/philosophyos-mvp.plan.md](plans/philosophyos-mvp.plan.md) | MVP 实现计划 |

---

## 开发检查 ✅

前端类型检查：

```powershell
cd C:\Users\30290\Desktop\PhilosophyOS\apps\web
npm.cmd run typecheck
```

后端测试：

```powershell
cd C:\Users\30290\Desktop\PhilosophyOS\apps\api
.\.venv\Scripts\python.exe -m pytest
```

---

## 下一步 🌱

本地 Beta 收口后，下一阶段会继续补齐：

- 更稳的 RAG 与引用链路
- 更完整的哲学家图鉴与肖像版权清单
- 思想档案的长期记忆能力
- 好友私密讨论
- Obsidian 安全同步
- 面向商业化的托管模型额度与账户系统

PhilosophyOS 的目标不是替你思考，而是让你的思考有地方生长。
