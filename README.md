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

## 下一步

先完成计划中的 Milestone 1：内容种子与质量基线，再开展 RAG 和 Obsidian 技术验证。
