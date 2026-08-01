# 模型 API 接入与用户路径

本文说明 PhilosophyOS 的模型接入方式：普通用户默认不应该理解或管理 API Key；API Key 配置只作为本地 Beta、高级用户和开发者入口保留。

## 产品路径

### 1. 普通用户：打开即用

商业化版本的默认路径应该是 PhilosophyOS 托管模型额度：

- 用户注册或登录后即可对话。
- 用户看到的是“套餐额度 / 本月剩余额度 / 当前模型状态”，不是 API Key 表单。
- 后台统一管理供应商 API Key、调用成本、限流、失败兜底和账单。
- 当一个供应商失败时，系统可以自动切换到备用供应商，用户只看到“正在重试”或“已切换备用模型”。

这是面向大众用户的主路径。设置中心里的 API Key 表单不应该成为首次使用门槛。

### 2. 高级用户：自带 API Key

自带 Key 适合：

- 开发者、研究者、重度用户。
- 已经有 OpenAI、DeepSeek、阿里云、火山方舟等账号的用户。
- 企业或团队希望成本走自己的供应商账户。

自带 Key 的配置保存在本机后端或未来的加密服务端密钥库中。前端只提交新 Key，不读取已保存 Key。

### 3. 本地 Beta：用 API Key 验证端到端能力

当前本地 Beta 没有云端托管额度，所以需要用户自己配置模型 Key。这个限制只属于本地测试阶段，不应成为正式商业版的核心体验。

## 安全边界

- 不要把真实 API Key 写入 Git、README、截图、日志或前端代码。
- 不要使用 `VITE_` 前缀暴露模型 Key。
- 前端只能看到某个模型是否已配置、模型名、Base URL host 和连接测试结果。
- 后端保存 Key 时使用加密 envelope；接口不会回传明文 Key。
- 更换设备时，需要重新配置本地 Key。商业化云同步应使用服务端密钥管理，而不是把 Key 明文导出。

## 当前支持的供应商

模型在前端按英文首字母 / 中文拼音排序。所有非 OpenAI 官方供应商当前都走 OpenAI-compatible Chat Completions 或 Responses 风格。

| Profile | 官方名称 | Key 获取入口 | 文档入口 | 默认 Base URL | 默认模型 | API Style | 费用归属 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `deepseek` | DeepSeek | [DeepSeek API Keys](https://platform.deepseek.com/api_keys) | [DeepSeek API Docs](https://api-docs.deepseek.com/zh-cn/) | `https://api.deepseek.com` | `deepseek-v4-flash` | `chat_completions` | 用户自己的 DeepSeek 账号 |
| `free` | Doubao / Volcano Ark | [Volcano Ark API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) | [Volcano Ark API Docs](https://api.volcengine.com/api-docs/view?action=ChatCompletions&serviceCode=ark&version=2024-01-01) | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-0-lite-260428` | `responses` | 用户自己的火山方舟账号 |
| `kimi` | Kimi / Moonshot AI | [Kimi API Keys](https://platform.moonshot.cn/console/api-keys) | [Kimi API Docs](https://platform.kimi.com/docs/api/overview) | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | `chat_completions` | 用户自己的 Moonshot AI 账号 |
| `gpt` | OpenAI | [OpenAI API Keys](https://platform.openai.com/api-keys) | [OpenAI Quickstart](https://platform.openai.com/docs/quickstart) | `https://api.openai.com/v1` | `gpt-5.6` | `responses` | 用户自己的 OpenAI 账号 |
| `qwen` | Qwen / Alibaba Cloud Bailian | [Alibaba Cloud Bailian API Key](https://bailian.console.aliyun.com/?tab=model#/api-key) | [DashScope OpenAI compatibility](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | `chat_completions` | 用户自己的阿里云账号 |
| `siliconflow` | SiliconFlow | [SiliconFlow API Keys](https://cloud.siliconflow.cn/account/ak) | [SiliconFlow Chat Completions](https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions) | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-72B-Instruct` | `chat_completions` | 用户自己的 SiliconFlow 账号 |
| `zhipu` | Zhipu GLM | [Zhipu API Keys](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) | [Zhipu API docs](https://docs.bigmodel.cn/cn/guide/start/introduction) | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-plus` | `chat_completions` | 用户自己的智谱账号 |

## 本地 Beta 配置步骤

1. 启动后端和前端。
2. 打开页面右上角的模型设置中心。
3. 选择供应商卡片。
4. 点击“打开 API Keys”去官方控制台创建 Key。
5. 回到 PhilosophyOS，填入：
   - API Key
   - Model
   - Base URL
   - API Style
6. 点击“保存配置”。
7. 点击“测试连接”。
8. 点击“使用这个模型”。

如果测试连接失败，优先检查：

- Key 是否复制完整。
- Base URL 是否包含正确版本路径，例如 `/v1` 或 `/api/v3`。
- 模型名是否在该供应商账号下可用。
- 账号是否有余额或免费额度。
- API Style 是否匹配供应商协议。

## `.env` 示例

本地开发也可以直接在 `apps/api/.env` 中配置。该文件已被 `.gitignore` 忽略，不应提交。

```env
PHILOSOPHYOS_MODEL_PROFILE=deepseek
PHILOSOPHYOS_AI_PROVIDER=auto

DEEPSEEK_API_KEY=<your-deepseek-key>
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_STYLE=chat_completions
```

切换到其他 profile 时，改 `PHILOSOPHYOS_MODEL_PROFILE` 并填写对应前缀，例如 `QWEN_*`、`KIMI_*`、`ZHIPU_*` 或 `SILICONFLOW_*`。

## 商业化实现建议

正式商业版建议把模型能力拆成两条线：

| 能力 | 普通用户 | 高级用户 / 团队 |
| --- | --- | --- |
| 默认调用 | PhilosophyOS 托管额度 | 可选托管额度或自带 Key |
| UI 表达 | 套餐、剩余额度、模型状态 | 供应商、Base URL、模型名、连接测试 |
| 成本控制 | 后台统一限流和计费 | 工作区级用量账本 |
| 失败兜底 | 自动切换备用模型 | 可配置主备供应商 |
| 密钥存储 | 服务端密钥管理 | 工作区密钥库，按角色授权 |

这样 PhilosophyOS 对普通用户像一个完整产品，对专业用户又保留开放性。
