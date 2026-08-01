# Plan: PhilosophyOS Commercial Readiness

| Field | Value |
| --- | --- |
| Status | in-progress |
| Started | 2026-08-01 |
| Owner | Codex |

## Context

PhilosophyOS 已经完成 Beta 后的关键安全边界：模型 Key 不回传前端、Obsidian 写入需要确认、最近一次 AI 写入可撤销。下一阶段要把这些能力收束成可商业化的产品骨架：用户能自己接入模型，未来能进入账号、工作区、云同步、用量与付费。

## Milestone 1: Model API Onboarding

**Goal:** 用户能在前端看到每个模型服务商的官方入口，跳转获取 API Key，并在 PhilosophyOS 中完成本机安全配置。

### 1.1 [x] 标出模型 API 官网入口与文档入口 *(completed 2026-08-01)*

- **Files:** `apps/web/src/main.tsx`, `apps/web/src/styles.css`
- **What:** 在模型配置卡片中增加官方 Key 获取入口、API 文档入口和接入提示；保留 Key 只提交给本机后端、不回传前端的边界。
- **Acceptance:** OpenAI、DeepSeek、豆包/火山方舟三类配置都能看到“拿 Key / 看文档 / 填 Key、Model、Base URL”的完整路径；前端构建通过。

### 1.2 [ ] 增加模型配置的空状态引导

- **Files:** `apps/web/src/main.tsx`, `apps/web/src/styles.css`
- **What:** 当当前模型未配置时，在顶部状态与对话失败提示中给出更明确的“去设置中心配置 API”的路径。
- **Acceptance:** 用户选择未配置模型时，不会只看到失败，而能直接打开设置中心完成配置。

### 1.3 [ ] 增加模型配置帮助文档

- **Files:** `README.md`, `docs/product/model-api-onboarding.md`
- **What:** 写清楚三类服务商的申请路径、Base URL、模型名、费用归属和隐私边界。
- **Acceptance:** 新用户不看代码也能完成模型 Key 配置；文档不包含任何真实 Key。

## Milestone 2: Commercial Account Boundary

### 2.1 [ ] 落地 user_id / workspace_id 数据模型

- **Files:** `apps/api/app/models/`, `apps/api/migrations/`, `apps/api/tests/`
- **What:** 在后端模型中为未来账号、工作区、多用户隔离建立最小字段与迁移路线。
- **Acceptance:** 现有单机 Beta 不破坏；新增字段有默认/迁移策略；测试覆盖隔离边界。

### 2.2 [ ] 设计本地账户与云账户切换边界

- **Files:** `docs/architecture/knowledge-model.md`, `docs/product/mvp-scope.md`, `plans/`
- **What:** 明确本地模式、云同步模式、团队工作区模式的权限和数据流差异。
- **Acceptance:** 产品与技术文档能解释“无账号可本地用，有账号可同步”的路线。

## Milestone 3: Product Polish

### 3.1 [ ] 哲学家图鉴继续扩充西方哲学家

- **Files:** `apps/web/src/pages/PhilosopherAtlasPage.tsx`, `apps/web/src/styles.css`
- **What:** 继续补充西方哲学家资料、时代分组、核心思想标签与肖像展示。
- **Acceptance:** 图鉴覆盖主要西方哲学传统；不混入非西方哲学家。

### 3.2 [ ] 关系图谱继续打磨为网状群落

- **Files:** `apps/web/src/pages/ThoughtArchivePage.tsx`, `apps/web/src/styles.css`
- **What:** 继续优化群落翻页、节点文字避让、交互状态恢复与缩放体验。
- **Acceptance:** 图谱更接近 Obsidian 网状知识图，不再像单中心发散图。

