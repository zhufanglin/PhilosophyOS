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
