# PhilosophyOS 商业化基础设施路线图

这份路线图把云同步、计费与运维拆成最小可交付模块。目标不是立刻把 PhilosophyOS 做成完整 SaaS，而是在商业化前消除最危险的隐患：数据串户、成本失控、无法恢复、无法删除、无法解释供应商边界。

## 1. 模块总览

| 模块 | 最小可交付任务 | 阻断风险 | 上线前验收门槛 |
| --- | --- | --- | --- |
| 云数据库 | 建立 PostgreSQL schema：users、workspaces、memberships、dialogues、snapshots、model_profiles、exports、audit_events | 查询遗漏 `workspace_id` 导致串户 | 越权测试 100% 拒绝；所有私有表具备 owner/workspace 边界 |
| 对象存储 | 建立 workspace 前缀：exports、uploads、support-bundles、vault-drafts | URL 泄露或路径猜测导致跨工作区访问 | 所有对象使用短期签名 URL；对象 key 不含真实文件绝对路径 |
| 订阅计费 | 接入订阅状态、套餐、账单 owner、欠费状态 | 付费状态与功能开关不一致 | 欠费工作区只读可导出；owner 可恢复订阅；账单事件有审计 |
| 额度限流 | 建立 usage ledger：workspace、provider、model、token、cost、source | 平台托管模型成本失控 | 每次平台 Key 调用都落账；达到额度后阻断新调用但保留档案 |
| 备份恢复 | 自动数据库备份、对象存储版本化、恢复演练文档 | 无法恢复或恢复后审计断裂 | RPO <= 24h；RTO <= 4h；每月恢复演练一次 |
| 监控审计 | API 错误率、模型失败率、成本异常、备份失败、越权拒绝 | 出事后无法定位 | 高风险动作进入 audit_events；告警有 owner 和处理步骤 |
| 合规文档 | 隐私政策、数据导出、删除说明、供应商清单、DPA 草案 | 用户不知道数据流向，无法处理删除请求 | 文档覆盖收集、用途、保存期、删除、第三方供应商 |
| 数字身份 / Avatar | 分层角色、库存归属、商品目录、货币账本、商城与分享快照 | 客户端改余额、重复扣款、跨工作区泄露角色 | 角色可免费创建；库存与账本服务端确认；删除、导出、审计和恢复链路通过 |

## 2. 云数据库路线

最小迁移顺序：

1. 为本地核心对象补齐逻辑边界字段：`user_id`、`workspace_id`、`created_by_user_id`。
2. 建立云端 PostgreSQL schema，只同步已确认的结构化对象，不直接同步未确认草稿。
3. 引入 membership 检查中间层，所有私有查询必须从当前用户解析工作区。
4. 建立迁移脚本：本地单用户数据进入默认 workspace。
5. 为导入、导出、删除、模型配置变更加审计事件。

阻断风险：

- 旧代码路径绕过 workspace 过滤。
- 本地 Obsidian 绝对路径被同步到云端。
- 多设备同时修改同一思想快照导致冲突。

上线门槛：

- 所有私有 API 测试都覆盖“其他 workspace 不可见”。
- 本地路径只保存为用户设备内配置，不进入云端公开导出。
- 冲突策略明确：最后写入不可静默覆盖，必须生成待确认差异。

## 3. 对象存储路线

对象存储只保存用户明确允许进入云端的文件：

- 导出包；
- 用户上传资料；
- 支持包；
- 可选的 Obsidian 草稿副本。

不保存：

- 完整 Obsidian 仓库；
- API Key 或加密 envelope；
- provider 原始响应头；
- 未经用户确认的 AI 临时草稿。

上线门槛：

- object key 格式固定为 `workspace/{workspace_id}/{type}/{object_id}`。
- 下载全部使用短期签名 URL。
- 删除 workspace 时对象存储同步清理或进入不可恢复删除队列。

## 4. 订阅与计费路线

建议先做三档：

| 套餐 | 适用 | 模型 Key | 限制 |
| --- | --- | --- | --- |
| Local | 本地单机用户 | 用户自带 Key | 无云同步，无平台模型额度 |
| Personal Cloud | 单人云同步 | 用户自带 Key 或小额平台额度 | 限 workspace 数、导出包大小、月度模型成本 |
| Pro | 重度用户/早期团队 | 可使用平台托管 Key | 更高额度、备份保留更久 |

欠费策略：

- 保留登录、读取、导出和删除。
- 阻断新的平台付费模型调用。
- 不删除用户数据。
- 明确提示如何恢复订阅和导出数据。

## 5. 额度与成本控制

每次模型调用都写入 usage ledger：

| 字段 | 说明 |
| --- | --- |
| workspace_id | 成本归属 |
| user_id | 发起者 |
| provider | OpenAI / DeepSeek / Doubao / platform |
| model | 实际调用模型 |
| profile | free / gpt / deepseek / managed |
| prompt_tokens / completion_tokens | 若供应商返回则记录 |
| estimated_cost | 缺失 token 时使用估算 |
| source_feature | dialogue / snapshot / weekly_report / test_connection |
| status | success / failed / rate_limited / timeout |

上线门槛：

- 平台托管 Key 的所有调用必须落账。
- workspace 达到额度后，新模型调用被阻断或降级到用户自带 Key。
- 成本异常有告警，例如单 workspace 单小时超过阈值。

## 6. 备份与恢复

最小目标：

- PostgreSQL 每日自动备份。
- 对象存储开启版本化或保留删除标记。
- 加密密钥有轮换与恢复策略。
- 每月做一次恢复演练。

验收：

- RPO <= 24 小时。
- RTO <= 4 小时。
- 恢复后能说明哪些审计事件可能缺失。
- 恢复演练记录保存到运维文档。

## 7. 监控与审计

必须监控：

- API 5xx 错误率；
- provider 失败率、限流率、超时率；
- 模型成本异常；
- 导出/删除/模型配置变更；
- 备份失败；
- 越权访问被拒绝次数。

审计事件必须包含：

- actor_user_id；
- workspace_id；
- action；
- target_type / target_id；
- created_at；
- request_id；
- 结果状态。

审计事件不得包含：

- 完整 API Key；
- 加密 Key envelope；
- provider Authorization header；
- 不必要的完整对话正文。

## 8. 合规文档清单

商业化前至少准备：

- 隐私政策；
- 用户数据导出说明；
- 用户数据删除说明；
- AI 供应商与数据处理边界；
- Cookie / 本地存储说明；
- 安全事件响应流程；
- 备份与保留周期说明；
- 客服访问用户数据的审批规则。

## 9. 推荐实施顺序

1. 数据模型补齐 `user_id` / `workspace_id`。
2. 云数据库原型与越权测试。
3. usage ledger 与成本阈值。
4. 对象存储导出包。
5. 订阅状态与欠费只读模式。
6. 备份恢复演练。
7. 监控告警和审计面板。
8. 合规文档和供应商清单。

做到第 4 步，才适合开放小范围云同步内测；做到第 8 步，才适合正式商业化收费。

## 10. 数字身份与 Avatar 商业化路线

Avatar 不是首期支付功能，而是建立在账号、工作区和审计边界之上的独立产品线。第一阶段先让普通用户免费创建角色和实时换装，避免把核心体验锁在登录或支付之后；第二阶段再接入演示币、库存和商城；真实支付必须最后接入。

### 数据边界

- `AvatarConfig`、库存、收藏、订单和货币账本都属于 `user_id` / `workspace_id`。
- 公共哲学家、公共素材和商品目录可以跨工作区复用，但用户装备、收藏和生成资产不能跨工作区读取。
- 角色保存 Layer ID 和锚点版本，最终合成图仅作为缓存或分享快照。
- 删除工作区时，私有角色、库存关联、生成资产和审计记录按保留策略处理；公共目录不受影响。

### 推荐交付顺序

1. `AvatarConfig` 与分层渲染器。
2. 免费实时换装编辑器和本地保存。
3. Inventory、owned/locked/favorited 状态。
4. CatalogItem 与不可变 Currency Ledger。
5. Avatar Shop 浏览、筛选、详情和收藏。
6. 订单事务、幂等、退款和审计。
7. 私有/工作区/公开展示与分享快照。
8. AI 生成服装、系列收藏和成长系统扩展。

### 商业化上线门槛

- 用户可以在不付费、不填 API Key 的情况下创建基础角色。
- 商品下架不影响已拥有物品的装备和展示。
- 客户端不能直接修改 `owned`、`locked`、余额或订单状态。
- 每笔购买、退款、赠送和人工调整都有幂等键、账本记录和审计事件。
- 跨 workspace 的角色、库存、收藏、订单和生成素材访问测试全部拒绝。
- 导出不包含支付凭据、API Key、内部成本或其他工作区数据。
- 删除、备份恢复和公开分享撤回测试通过。
- AI 生成服装默认私有，内容审核通过后才能进入公开目录或展示柜。
- NFT-like 收藏只作为可迁移的收藏元数据，不对外承诺链上所有权或金融价值。

详细的数据契约、组件边界和动效建议见 [`docs/product/avatar-customization-system.md`](../product/avatar-customization-system.md)。
