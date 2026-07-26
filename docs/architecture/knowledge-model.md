# PhilosophyOS 知识与记忆模型

## 1. 设计目标

- 同时支持哲学史时间线、问题比较、RAG 引用和个人思想档案。
- 明确区分公共哲学知识与用户私人观点。
- 西方哲学先行，但允许后期增加中国哲学的独立分类体系。
- MVP 可用关系数据库和向量索引实现，不依赖 Neo4j。

## 2. 领域分层

```mermaid
flowchart LR
    S[Source 文献来源] --> C[SourceChunk 文献片段]
    C --> E[PhilosophyEntity 公共实体]
    E --> R[Relation 公共关系]
    V[VaultNote Obsidian 笔记] --> O[OpenQuestion 开放问题]
    D[Dialogue 对话] --> A[Attribution 观点归属]
    A --> VC[ViewpointCard 用户观点]
    VC --> E
    D --> ND[NoteDraft 笔记草稿]
    ND --> V
    F[Friendship 好友关系] --> DR[DiscussionRoom 私密讨论]
    DR --> DM[DiscussionMessage 多人消息]
    DM --> PD[PersonalDiscussionDraft 个人总结草稿]
    PD --> VC
```

## 3. 公共知识实体

### 3.1 PhilosophyEntity

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | UUID | 稳定标识 |
| tradition | enum | `western`；后期增加 `chinese` |
| entity_type | enum | philosopher/concept/work/school/question/period |
| canonical_name | string | 标准中文名 |
| original_name | string? | 原文名称 |
| aliases | string[] | 常用译名、别名 |
| summary | text | 中性简介 |
| period_id | UUID? | 所属时代 |
| depth_level | enum | L1/L2/L3 |
| review_status | enum | draft/reviewed/published/retired |

`tradition` 只负责内容域隔离，不意味着中西哲学共享同一分期和概念层级。

### 3.2 Relation

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| source_entity_id | UUID | 起点 |
| relation_type | enum | 关系词表 |
| target_entity_id | UUID | 终点 |
| direction | enum | directed/undirected |
| claim | text | 关系的具体说明 |
| confidence | enum | high/medium/low/disputed |
| evidence_ids | UUID[] | 支撑来源 |
| review_status | enum | 审核状态 |

首批关系词：

- `authored`：创作。
- `proposed`：提出或系统发展。
- `influenced`：影响。
- `criticized`：批判。
- `developed`：继承并发展。
- `belongs_to`：属于流派或时代。
- `addresses`：回应哲学问题。
- `uses_concept`：使用核心概念。
- `contrasts_with`：形成重要对照。
- `translated_as`：术语或译名对应。

`influenced` 和 `criticized` 必须有来源，不允许仅因时间先后自动生成。

### 3.3 Source 与 SourceChunk

Source 保存作者、标题、版本、译者、语言、版权状态、来源等级和可引用范围。SourceChunk 保存章节、位置、片段、向量和内容哈希。

直接引语必须引用 `SourceChunk`，而且对应 Source 的等级为 S1、版权状态允许展示。

## 4. 用户思想数据

### 4.1 Attribution

用于解决“谁说的”问题。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| subject_type | enum | user/third_party/author/assistant/unknown |
| subject_label | string? | 如“女朋友”“康德” |
| proposition | text | 观点内容 |
| evidence_message_id | UUID | 原始对话消息 |
| confidence | number | 识别置信度 |
| user_confirmed | boolean | 是否经用户确认 |

`unknown` 或未确认的第三方转述不能写入用户长期立场。

### 4.2 ViewpointCard

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| topic_entity_ids | UUID[] | 关联问题和概念 |
| proposition | text | 用户观点的中性摘要 |
| reasons | text[] | 用户给出的理由 |
| open_questions | text[] | 尚未解决的问题 |
| stance_status | enum | tentative/confirmed/revised/withdrawn |
| source_dialogue_id | UUID | 来源对话 |
| confirmed_at | datetime? | 用户确认时间 |

不保存“用户是存在主义者”这类固定标签；只保存带时间和来源的具体观点。

### 4.3 OpenQuestion

来源可以是每日挑战、对话或 Obsidian 章节。状态为 open/in_progress/revisit/resolved/archived，并保存下次复访时间。

## 5. Obsidian 模型

### 5.1 VaultNote

| 字段 | 说明 |
| --- | --- |
| relative_path | 相对仓库路径，不保存无必要的绝对路径 |
| title/type/status/tags | YAML 属性 |
| headings | 标题及行号 |
| wikilinks | 双向链接目标 |
| tasks | 未完成任务 |
| content_hash | 写入冲突检测 |
| indexed_at | 最近索引时间 |

### 5.2 NoteDraft

保存目标文件、操作类型 create/update、草稿、结构化差异、关联来源和确认状态。写入前重新计算 `content_hash`；文件已变化时停止写入并要求重新生成差异。

## 6. 推荐数据流

```mermaid
sequenceDiagram
    participant U as 用户
    participant O as Orchestrator
    participant V as Vault Tool
    participant R as RAG Tool
    participant M as Memory Tool
    participant N as Note Draft Tool

    U->>O: 开始今日问题
    O->>V: 查询开放问题和相关旧笔记
    O->>M: 查询已确认观点
    O-->>U: 问题与推荐原因
    U->>O: 回答并讨论
    O->>R: 按需检索哲学来源
    R-->>O: 来源片段与证据状态
    O-->>U: 追问或带引用解释
    U->>O: 结束并整理
    O->>N: 生成 Markdown 草稿
    N-->>U: 展示观点归属和差异
    U->>N: 确认写入
```

## 7. 好友与讨论数据

### 7.1 Friendship 与 FriendRequest

FriendRequest 保存发起者、接收者、来源、状态和过期时间。Friendship 只在请求被接受后创建，使用无方向的用户对关系；拉黑关系单独保存并在所有好友和房间接口前校验。

### 7.2 DiscussionRoom

| 字段 | 说明 |
| --- | --- |
| id | 不可猜测的房间标识 |
| title/question | 讨论标题和核心问题 |
| created_by | 创建者 |
| visibility | MVP 固定为 private |
| ai_moderator_enabled | 是否启用 AI 主持 |
| retention_policy | 7 天/30 天/永久 |
| invite_policy | 仅创建者/所有成员 |
| status | active/closed/archived |

成员关系保存 joined/left/removed 状态和对应时间。服务端每次读取消息、来源和总结前检查当前成员权限。

### 7.3 DiscussionMessage 与共享内容

每条消息必须绑定明确作者。分享对象使用快照和来源引用保存，避免原始观点卡片修改后静默改变房间历史。快照只包含用户主动选择的内容，不包含整篇 Obsidian 笔记或思想档案。

### 7.4 多人总结

共同总结保存各参与者观点、共同点、分歧和开放问题，但不能直接进入个人长期记忆。系统为每位参与者生成独立 PersonalDiscussionDraft，只提取该用户自己的观点；用户确认后才能转为 ViewpointCard 或 NoteDraft。

### 7.5 社交安全

- Block：阻止请求、邀请和新消息。
- Report：保存目标、类别、说明、证据消息和处理状态。
- RateLimit：限制好友请求、邀请和消息频率。
- Audit：记录成员变更和权限决策，不记录无必要的完整私密正文。

## 8. MVP 存储建议

- PostgreSQL：公共实体、关系、用户、对话、观点和审计记录。
- pgvector 或独立向量数据库：文献片段和授权笔记片段。
- 本地文件索引：Obsidian 路径、哈希和链接。
- 对象存储：仅保存用户明确上传且允许保存的文档。
- Neo4j：Phase 3 图谱查询复杂度证明有必要后再引入。

## 9. 中国哲学扩展约束

后期增加 `tradition=chinese` 时：

- 新建中国哲学自己的 Period 数据，不复用西方时期枚举。
- 经典可具有经、传、注、疏等版本关系。
- 人物与学派关系允许师承、注疏、判教等独立关系类型。
- 跨传统映射使用 `compared_with` 并附比较维度，不使用 `same_as`。
