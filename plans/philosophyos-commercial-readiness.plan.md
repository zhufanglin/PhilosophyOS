# Plan: PhilosophyOS Commercial Readiness

| Field | Value |
| --- | --- |
| Status | in_progress |
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

### 1.2 [x] 增加模型配置的空状态引导 *(completed 2026-08-01)*

- **Files:** `apps/web/src/main.tsx`, `apps/web/src/pages/DialoguePage.tsx`, `apps/web/src/styles.css`
- **What:** 当当前模型未配置时，在顶部状态与对话失败提示中给出更明确的“去设置中心配置 API”的路径。
- **Acceptance:** 用户选择未配置模型时，不会只看到失败，而能直接打开设置中心完成配置。

### 1.3 [x] 扩展常用模型 API 接口并恢复豆包命名 *(completed 2026-08-01)*

- **Files:** `apps/api/app/settings.py`, `apps/api/app/routes/model_profiles.py`, `apps/api/app/schemas/dialogue.py`, `apps/api/app/storage/model_profile_repository.py`, `apps/web/src/main.tsx`, `apps/web/src/pages/DialoguePage.tsx`, `apps/web/src/styles.css`, `apps/api/tests/`
- **What:** 将模型配置从豆包、GPT、DeepSeek 扩展到豆包、GPT、DeepSeek、通义千问、Kimi、智谱 GLM、硅基流动；保留 API Key 只进本机后端的边界。
- **Acceptance:** 七类模型都能在设置中心保存、选择、测试连接；免费入口显示为豆包；前后端测试通过。

### 1.4 [x] 增加模型配置帮助文档 *(completed 2026-08-01)*

- **Files:** `README.md`, `docs/product/model-api-onboarding.md`
- **What:** 写清楚常用服务商的申请路径、Base URL、模型名、费用归属和隐私边界。
- **Acceptance:** 新用户不看代码也能完成模型 Key 配置；文档不包含任何真实 Key。

## Milestone 2: Commercial Account Boundary

### 2.1 [x] 落地 user_id / workspace_id 数据模型 *(completed 2026-08-01)*

- **Files:** `apps/api/app/models/`, `apps/api/migrations/`, `apps/api/tests/`
- **What:** 在后端模型中为未来账号、工作区、多用户隔离建立最小字段与迁移路线。
- **Acceptance:** 现有单机 Beta 不破坏；新增字段有默认/迁移策略；测试覆盖隔离边界。

### 2.2 [x] 设计本地账户与云账户切换边界 *(completed 2026-08-01)*

- **Files:** `docs/architecture/knowledge-model.md`, `docs/product/mvp-scope.md`, `plans/`
- **What:** 明确本地模式、云同步模式、团队工作区模式的权限和数据流差异。
- **Acceptance:** 产品与技术文档能解释“无账号可本地用，有账号可同步”的路线。

## Milestone 3: Product Polish

### 3.1 [x] 哲学家图鉴继续扩充西方哲学家 *(completed 2026-08-01)*

- **Files:** `apps/web/src/pages/PhilosopherAtlasPage.tsx`, `apps/web/src/styles.css`
- **What:** 继续补充西方哲学家资料、时代分组、核心思想标签与肖像展示。
- **Acceptance:** 图鉴覆盖主要西方哲学传统；不混入非西方哲学家。

### 3.2 [x] 关系图谱继续打磨为网状群落 *(completed 2026-08-01)*

- **Files:** `apps/web/src/pages/ThoughtArchivePage.tsx`, `apps/web/src/styles.css`
- **What:** 继续优化群落翻页、节点文字避让、交互状态恢复与缩放体验。
- **Acceptance:** 图谱更接近 Obsidian 网状知识图，不再像单中心发散图。

## Milestone 4: Digital Identity / Avatar Customization

**Goal:** 为用户提供一个可分层换装、可收藏、可扩展的数字身份系统；先交付免费实时编辑器，再为商城、虚拟货币和未来社交展示建立服务端边界。

详细产品契约见 [`docs/product/avatar-customization-system.md`](../docs/product/avatar-customization-system.md)。

### 4.1 [ ] Avatar 数据模型与 Layer Renderer

- **Files:** `docs/product/avatar-customization-system.md`, `apps/api/app/models/`, `apps/web/src/components/`
- **What:** 建立 `AvatarConfig`、Layer 槽位、锚点版本和回退规则；角色由基础人物、脸部、发型、服装、饰品和特效分层合成。
- **Acceptance:** 每个 Layer 可独立替换；缺失素材不导致角色消失；配置只保存 Layer ID，不依赖单张最终图片。

### 4.2 [ ] 免费实时换装编辑器

- **Files:** `apps/web/src/components/AvatarPreview.tsx`, `ClothingSelector.tsx`, `AccessorySelector.tsx`, `ItemCard.tsx`
- **What:** 提供角色预览、分类选择、装备/卸下、重置和保存；本地模式无需支付或 API Key。
- **Acceptance:** 点击物品后无刷新更新；免费物品可直接装备；锁定物品可预览但不可静默装备。

### 4.3 [ ] Inventory / ownership / locked 状态

- **Files:** `apps/api/app/routes/avatars.py`, `apps/api/app/storage/`, `apps/api/tests/`
- **What:** 建立库存、拥有关系、收藏、锁定和下架后的使用规则。
- **Acceptance:** `owned` 由服务端确认；商品下架不影响已拥有物品；跨 workspace 读取和装备全部拒绝。

### 4.4 [ ] Currency ledger 与商品目录

- **Files:** `apps/api/app/models/commerce.py`, `apps/api/app/services/currency.py`, `apps/api/tests/`
- **What:** 建立 `CatalogItem` 与不可变 `CurrencyLedger`，为演示币、赠送、购买、退款和人工调整预留原因与幂等键。
- **Acceptance:** 余额不允许客户端直接覆盖；重复请求不会重复扣款；每次变更都能追溯到订单或审计事件。

### 4.5 [ ] Avatar Shop 浏览、筛选、详情、收藏

- **Files:** `apps/web/src/pages/AvatarShopPage.tsx`, `apps/web/src/components/AvatarShop.tsx`
- **What:** 增加分类、稀有度、价格、收藏、限定时间和详情面板；不把页面做成普通电商货架。
- **Acceptance:** 商品可预览、筛选和收藏；没有支付配置时明确显示“即将开放/演示币”。

### 4.6 [ ] 购买事务和审计边界

- **Files:** `apps/api/app/routes/orders.py`, `apps/api/app/services/orders.py`, `apps/api/tests/`
- **What:** 将订单、库存归属、货币账本和审计事件放进同一事务边界；支持幂等、退款和撤销状态。
- **Acceptance:** 重复购买、并发扣款、退款和越权操作都有确定结果；审计不记录完整支付凭据或 API Key。

### 4.7 [ ] 社交展示与分享

- **Files:** `docs/product/avatar-customization-system.md`, `apps/api/app/routes/avatars.py`, `apps/web/src/pages/`
- **What:** 预留私有、工作区可见和公开三种可见性；分享使用脱敏快照，不暴露内部商品、订单或用户标识。
- **Acceptance:** 关闭公开后旧快照不可继续访问；删除工作区时私有角色和生成资产按保留策略处理。

### 4.8 [ ] AI 生成服装与收藏体系预留

- **Files:** `docs/product/avatar-customization-system.md`, `docs/architecture/`
- **What:** 预留生成提示词、参考素材、审核状态、系列编号和展示柜字段；NFT-like 仅作为收藏数据模型，不承诺链上资产。
- **Acceptance:** AI 生成结果默认私有；生成、审核、发布和撤回状态可追踪；不与真实支付或金融价值绑定。
