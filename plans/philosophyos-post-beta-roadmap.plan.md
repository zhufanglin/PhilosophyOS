# Plan: PhilosophyOS Beta 后路线图

| Field | Value |
|-------|-------|
| Status | complete |
| Created | 2026-08-01 |
| Ticket | N/A |
| Branch | main |

## Context

功能 Beta 已完成：用户可以在本地完成今日命题、AI 对话、思想快照校对、思想档案管理、关系图谱探索、模型配置和西方哲学家图鉴浏览。下一阶段不能继续把功能堆成“更会聊天的 AI”，而要强化 PhilosophyOS 的核心差异：结构化思想记忆、可追踪的观点变化、哲学家影响轨迹和可商业化的安全边界。

本路线图把后续工作分成三条线：

1. **思想记忆增强：** 先做能立刻体现产品差异的能力。
2. **Obsidian 安全沉淀：** 只在安全写入、差异预览和撤销可验证后开放。
3. **商业化基础设施：** 在上云、账号和计费前补齐加密、隔离、合规和运维。
4. **数字身份层：** 在商业化基础设施稳定后，为用户提供可分层换装、可收藏、可分享的 Avatar。

## Architecture Decisions

- **先强化个人闭环：** 哲学家影响轨迹、反问质量和每周报告优先于好友与云同步。
- **影响必须有证据：** 哲学家关联不能只列名字，必须展示来自哪次对话、哪个思想节点和哪条原因。
- **报告先作为草稿：** 每周思想报告先生成 Markdown/本地草稿，经用户确认后再进入长期档案。
- **Obsidian 写入仍然后置：** 在解析器、差异预览、冲突检测和撤销通过前，不开放真实写回。
- **商业化前必须处理 Key：** 当前 API Key 本地明文 SQLite 只适合本地 Beta，商业化前必须加密或接入系统密钥管理。
- **商业化数据边界：** 后续账号、云同步、计费和团队能力必须以 `user_id` 与 `workspace_id` 为核心隔离字段；导出不得包含完整 API Key 或加密 envelope，删除必须区分单对象、Obsidian 文件撤销和 owner-only 工作区删除。
- **商业化上线门槛：** 正式收费前必须先通过 workspace 隔离、usage ledger 成本账本、备份恢复演练、监控审计和合规文档清单；欠费用户保留只读、导出和删除能力。
- **数字身份先免费后商业化：** Avatar 首阶段提供免费角色创建和实时换装；虚拟货币、商城、订单和真实支付必须以后端库存、账本、审计和恢复能力为前置，不把支付逻辑塞进前端渲染器。

## Milestones Overview

1. **思想记忆增强** - 让用户看到“我如何被哪些问题、张力和哲学家影响”。
2. **Obsidian 安全沉淀** - 从可选 Markdown 草稿升级到安全、可撤销的知识库写入。
3. **商业化基础设施** - 为多用户、云同步、计费和合规做产品级地基。
4. **数字身份与 Avatar** - 让用户通过分层角色表达自己的思想气质，并为商城与社交展示预留扩展边界。

---

## Milestone 1: 思想记忆增强

**Why this matters:** 这是 PhilosophyOS 区别于普通大语言模型的核心。普通模型能记住上下文，但 PhilosophyOS 要让用户看到自己的思想节点、反复出现的张力、借用过的概念和受哪些哲学家影响。

**Success criteria:** 用户能在思想档案中看到影响自己的哲学家、常见思想张力、未完成追问和一份可校对的周报草稿；所有结论都有来源节点和原因。

### 1.1 [x] 哲学家影响轨迹 *(completed 2026-08-01)*
- **Files:** `apps/api/app/routes/reflection_snapshots.py`, `apps/api/app/services/reflection_snapshots.py`, `apps/web/src/pages/ThoughtArchivePage.tsx`, `apps/web/src/styles.css`, `apps/api/tests/`
- **What:** 聚合思想快照中的 `related_philosophers`，生成“影响我的哲学家”视图：出现频率、相关主题、关联节点、影响原因和进入图鉴/档案的跳转。
- **Acceptance:** 思想档案页能展示哲学家影响列表；每个哲学家至少显示一个证据节点和原因；点击人物可跳到西方哲学家图鉴或筛选对应档案；无数据时显示可恢复的空状态。
- **Dependencies:** 功能 Beta 3.1, 3.3

### 1.2 [x] 思想张力聚合 *(completed 2026-08-01)*
- **Files:** `apps/api/app/services/reflection_snapshots.py`, `apps/web/src/pages/ThoughtArchivePage.tsx`, `apps/web/src/styles.css`, `apps/api/tests/`
- **What:** 把思想快照中的 `tensions` 聚合为独立洞察，展示最常出现、最近出现和可继续追问的张力。
- **Acceptance:** 档案页顶部显示张力分布；点击张力能筛选对应节点；每个张力保留至少一个来源节点；移动端无横向溢出。
- **Dependencies:** 1.1

### 1.3 [x] 历史追问回到今日页 *(completed 2026-08-01)*
- **Files:** `apps/api/app/routes/reflection_snapshots.py`, `apps/web/src/pages/TodayPage.tsx`, `apps/web/src/pages/ThoughtArchivePage.tsx`, `apps/api/tests/`, `apps/web/e2e/`
- **What:** 从思想节点里的 `next_question` 和开放问题生成今日页“继续上次未完成追问”的入口。
- **Acceptance:** 今日页能展示一个历史遗留追问；用户可一键进入对话；进入后不重复创建原思想节点；E2E 覆盖从档案到今日再到对话。
- **Dependencies:** 1.2

### 1.4 [x] 每周思想报告草稿 *(completed 2026-08-01)*
- **Files:** `apps/api/app/routes/reflection_snapshots.py`, `apps/api/app/services/weekly_report.py`, `apps/web/src/pages/ThoughtArchivePage.tsx`, `apps/api/tests/`
- **What:** 基于本周思想节点生成本周主题、张力、哲学家、观点变化和下周建议的 Markdown 草稿。
- **Acceptance:** 用户可生成周报草稿；草稿不自动进入长期档案；内容包含来源节点；没有足够数据时不伪造报告。
- **Dependencies:** 1.3

### 1.5 [x] 反问质量机制 *(completed 2026-08-01)*
- **Files:** `apps/api/app/agent/reflection.py`, `apps/api/app/services/reflection_snapshots.py`, `apps/web/src/pages/DialoguePage.tsx`, `apps/api/tests/agent/`
- **What:** 在每次对话总结中明确保存“最值得继续追问的问题”和原因，用于今日页复访和周报。
- **Acceptance:** 新思想节点包含可追踪的继续追问；用户可修改或拒绝 AI 提出的追问；追问不会在用户拒绝后继续进入推荐。
- **Dependencies:** 1.4

---

## Milestone 2: Obsidian 安全沉淀

**Why this matters:** Obsidian 是高级用户的长期知识资产。写入能力必须可预览、可确认、可撤销，不允许任何自动覆盖。

### 2.1 [x] 合成 Obsidian 仓库与解析器 *(completed 2026-08-01)*
- **Files:** `tests/fixtures/obsidian-vault/`, `apps/api/app/vault/parser.py`, `apps/api/tests/vault/test_parser.py`
- **What:** 建立合成仓库，解析 YAML、标签、双向链接、章节、任务和开放问题。
- **Acceptance:** 不读取 `.obsidian`；开放问题提取准确；解析器单测覆盖隐私排除目录。
- **Dependencies:** None

### 2.2 [x] Markdown 差异预览与确认写入 *(completed 2026-08-01)*
- **Files:** `apps/api/app/vault/drafts.py`, `apps/api/app/vault/writer.py`, `apps/web/src/components/MarkdownDiff.tsx`, `apps/api/tests/vault/`
- **What:** 生成草稿和结构化 diff，用户确认后才写入目标文件。
- **Acceptance:** 未确认写入为 0；冲突时阻止写入；写入后保留审计记录。
- **Dependencies:** 2.1

### 2.3 [x] 撤销最近一次 AI 写入 *(completed 2026-08-01)*
- **Files:** `apps/api/app/vault/writer.py`, `apps/api/app/models/audit.py`, `apps/api/tests/vault/test_writer.py`
- **What:** 记录写入前哈希和备份，支持撤销最近一次 AI 写入。
- **Acceptance:** 撤销后文件哈希与写入前一致；失败时不破坏当前文件。
- **Dependencies:** 2.2

---

## Milestone 3: 商业化基础设施

**Why this matters:** 商业化不是加一个付款按钮，而是账号、隔离、密钥、安全、成本和合规同时成立。

### 3.1 [x] API Key 加密与密钥边界 *(completed 2026-08-01)*
- **Files:** `apps/api/app/models/memory.py`, `apps/api/app/services/model_profiles.py`, `apps/api/tests/`
- **What:** 将本地明文 Key 存储升级为可迁移的加密或系统密钥管理策略。
- **Acceptance:** 数据库不保存完整明文 Key；读取接口仍不回传明文；旧本地配置可迁移。
- **Dependencies:** None

### 3.2 [x] 账号与多用户隔离设计 *(completed 2026-08-01)*
- **Files:** `docs/architecture/knowledge-model.md`, `docs/product/mvp-scope.md`, `plans/`
- **What:** 定义用户、工作区、档案、模型配置和导出数据的隔离边界。
- **Acceptance:** 所有核心数据对象都有 owner 或 workspace 边界；删除流程和导出范围明确。
- **Dependencies:** 3.1

### 3.3 [x] 云同步、计费与运维路线图 *(completed 2026-08-01)*
- **Files:** `plans/`, `docs/operations/`, `docs/architecture/technical-spikes.md`
- **What:** 拆分云数据库、对象存储、订阅计费、额度限流、备份恢复、监控审计和合规文档。
- **Acceptance:** 每个商业化模块都有最小可交付任务、阻断风险和上线前验收门槛。
- **Dependencies:** 3.2

## Recommended Next Task

先执行 `1.1 哲学家影响轨迹`。它最能让用户感到 PhilosophyOS 不是普通聊天模型，而是一套能整理个人思想结构的系统。
