# PhilosophyOS

PhilosophyOS 是一个以每日哲学挑战、苏格拉底式对话、可信文献检索和 Obsidian 思想沉淀为核心的个人哲学学习智能体。

当前版本优先覆盖从古希腊到当代的西方哲学。中国哲学在西方哲学核心体验稳定后作为独立内容域加入。

## 前期文档

| 文档 | 用途 |
| --- | --- |
| [PhilosophyOS-PRD.md](PhilosophyOS-PRD.md) | 完整产品需求与版本范围 |
| [docs/product/mvp-scope.md](docs/product/mvp-scope.md) | MVP 边界、成功标准和演示路径 |
| [docs/content/western-philosophy-map.md](docs/content/western-philosophy-map.md) | 西方哲学时代、人物与内容深度地图 |
| [docs/content/source-policy.md](docs/content/source-policy.md) | 来源、版权、引用和版本管理规范 |
| [docs/architecture/knowledge-model.md](docs/architecture/knowledge-model.md) | 知识实体、关系、记忆和 Obsidian 数据模型 |
| [docs/product/wireframes.md](docs/product/wireframes.md) | 核心页面低保真原型与状态说明 |
| [docs/product/social-discussion.md](docs/product/social-discussion.md) | 好友关系、私密讨论、权限和安全规范 |
| [docs/agent/behavior-spec.md](docs/agent/behavior-spec.md) | Agent 模式、工具调用和输出约束 |
| [docs/evaluation/evaluation-plan.md](docs/evaluation/evaluation-plan.md) | 质量评测维度、门槛和回归流程 |
| [docs/architecture/technical-spikes.md](docs/architecture/technical-spikes.md) | RAG 与 Obsidian 两项技术验证方案 |
| [data/seed/philosophers.csv](data/seed/philosophers.csv) | 首批哲学家种子数据 |
| [data/seed/questions.csv](data/seed/questions.csv) | 首批每日问题种子数据 |
| [data/evals/cases.csv](data/evals/cases.csv) | 首批回归评测案例 |
| [plans/philosophyos-mvp.plan.md](plans/philosophyos-mvp.plan.md) | 后续实现里程碑与任务 |

## 当前决策

- MVP 形态：桌面优先的 Web 应用，与本地 Obsidian 仓库集成。
- 内容范围：西方哲学从古希腊至当代。
- 内容策略：全时代 L1 覆盖，重点人物达到 L2/L3。
- Agent 架构：一个编排器加受控工具，不在首版部署自由协作的多 Agent。
- 写入策略：Obsidian 默认只读，草稿或差异经用户确认后才写入。
- 社交策略：核心单人闭环后加入好友和 2–8 人私密哲学讨论，不建设公开动态广场。
- 后期扩展：中国哲学使用独立分期与概念体系，作为 Phase 4 加入。

## 本地运行与 AI 配置

PhilosophyOS 的浏览器前端只访问本地 FastAPI。OpenAI API key 只能放在后端环境变量中，不能使用 `VITE_` 前缀，也不能写进前端代码。

### 1. 安装后端依赖

```powershell
cd C:\Users\30290\Desktop\PhilosophyOS\apps\api
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

### 2. 启动 deterministic mode

不配置 `OPENAI_API_KEY` 时，系统默认使用确定性降级回复，适合本地演示和自动测试。

```powershell
cd C:\Users\30290\Desktop\PhilosophyOS\apps\api
$env:PHILOSOPHYOS_AI_PROVIDER='deterministic'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

### 3. 启动 OpenAI mode

复制 `.env.example` 作为本机配置参考，然后只在后端 shell 或 `apps/api/.env` 中设置真实 key。

```powershell
cd C:\Users\30290\Desktop\PhilosophyOS\apps\api
$env:OPENAI_API_KEY='<只在后端设置的 OpenAI API key>'
$env:OPENAI_MODEL='gpt-5.6'
$env:PHILOSOPHYOS_AI_PROVIDER='auto'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

如果使用 OpenAI-compatible 中转站，额外设置 `OPENAI_BASE_URL`。不设置时会使用官方 OpenAI 默认地址。

```powershell
cd C:\Users\30290\Desktop\PhilosophyOS\apps\api
$env:OPENAI_API_KEY='<中转站提供的 key>'
$env:OPENAI_BASE_URL='https://你的中转站地址/v1'
$env:OPENAI_MODEL='<中转站支持的模型名>'
$env:OPENAI_API_STYLE='responses'
$env:PHILOSOPHYOS_AI_PROVIDER='auto'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

如果希望同时保留免费模型、GPT 和 DeepSeek 三套 API，推荐使用 profile 配置。启动后可以在前端顶部的“模型”切换器选择“免费 / GPT / DeepSeek”；`.env` 只负责保存后端密钥和默认 profile。

```env
PHILOSOPHYOS_MODEL_PROFILE=free

FREE_API_KEY=<填入平台免费模型 key，例如豆包/火山方舟>
FREE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
FREE_MODEL=doubao-seed-2-0-lite-260428
FREE_API_STYLE=responses

GPT_API_KEY=<填入你的 GPT 或 GPT 中转站 key>
GPT_BASE_URL=https://api.synapai.top/v1
GPT_MODEL=gpt-5.6
GPT_API_STYLE=responses

DEEPSEEK_API_KEY=<填入你的 DeepSeek key>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_API_STYLE=chat_completions

PHILOSOPHYOS_AI_PROVIDER=auto
```

免费模型目前建议使用豆包/火山方舟免费额度。后续如果替换成通义、OpenRouter Free 或其他免费模型，只需要改 `FREE_*` 这一组配置，不影响 GPT 和 DeepSeek。

DeepSeek 官方 API 使用 OpenAI-compatible 的 Chat Completions 风格。只想默认启动 DeepSeek 时，将 `apps/api/.env` 改成：

```env
PHILOSOPHYOS_MODEL_PROFILE=deepseek
DEEPSEEK_API_KEY=<填入你的 DeepSeek key>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_API_STYLE=chat_completions
PHILOSOPHYOS_AI_PROVIDER=auto
```

DeepSeek 的 Base URL 默认使用 `https://api.deepseek.com`。模型只建议提供两个选项：

- `deepseek-v4-flash`：默认选项，适合速度和成本优先。
- `deepseek-v4-pro`：更强回答质量，适合复杂哲学推理。

### 4. 使用本地 `.env` 和一键启动脚本

为了避免每次手动输入环境变量，可以把本机密钥放在 `apps/api/.env`。这个文件已被 `.gitignore` 忽略，不应提交到 GitHub。

```env
OPENAI_API_KEY=<填入你的新中转站 key>
OPENAI_BASE_URL=https://api.synapai.top/v1
OPENAI_MODEL=gpt-5.6
OPENAI_API_STYLE=responses
PHILOSOPHYOS_MODEL_PROFILE=gpt
PHILOSOPHYOS_AI_PROVIDER=auto
```

配置好后，在项目根目录运行：

```powershell
cd C:\Users\30290\Desktop\PhilosophyOS
.\scripts\start-dev.ps1
```

如果 PowerShell 拦截 `.ps1` 脚本，可以改用：

```powershell
.\scripts\start-dev.cmd
```

脚本会打开两个 PowerShell 窗口：

- 后端：`http://127.0.0.1:8001`
- 前端：`http://127.0.0.1:5174/#today`

这两个窗口需要保持打开；关闭窗口会停止对应服务。

### 5. 对话 API smoke test

```powershell
$body = @{
  user_message = '即使诚实带来损失，我仍然倾向坚持诚实。'
  current_mode = 'socratic'
  requested_mode = 'socratic'
  topic = '诚实与德性'
  turn_number = 1
} | ConvertTo-Json

Invoke-WebRequest -UseBasicParsing `
  -Uri 'http://127.0.0.1:8001/api/v1/dialogue-turns' `
  -Method Post `
  -ContentType 'application/json' `
  -Body $body
```

返回 JSON 中的 `provider` 会显示本轮使用了 `deterministic` 还是 `openai`；如果 OpenAI provider 失败，`provider_fallback_reason` 会说明降级原因。

## 下一步

真实 AI 对话接入完成后，下一阶段可以继续推进 Obsidian 安全沉淀、个人思想档案，或好友哲学讨论功能。
