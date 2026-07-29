# Obsidian 演示数据说明

这个脚本用于把本地 Obsidian 库「Stu 的哲学思考」转换成 PhilosophyOS 的演示思想快照，方便做端到端测试。

## 默认来源

- Obsidian 库：`D:\Obsidian\storage\Stu的哲学思考`
- 跳过目录：`.obsidian`
- 读取类型：Markdown 文件

当前演示节点会参考这些笔记：

- `哲学思考整理/09-自由意志、决定论与行动自由.md`
- `哲学思考整理/02-自我、存在与意义.md`
- `哲学思考整理/03-理性的边界与语言的塑形.md`
- `视频笔记-历史的发展有方向吗.md`

## 默认写入位置

后端开发脚本会在 `apps/api` 目录启动服务，因此默认快照日志写入：

```powershell
apps\api\data\local\thought-snapshots.jsonl
```

该目录属于本地数据，已经被 `.gitignore` 忽略，不会提交到 GitHub。

## 使用方式

在仓库根目录运行：

```powershell
python scripts\seed-obsidian-demo-snapshots.py --replace
```

`--replace` 只会替换脚本生成的 `demo_obsidian_` 演示记录，不会删除真实对话产生的思想快照。

## 端到端测试方式

1. 启动后端和前端。
2. 打开 `http://127.0.0.1:5174/#archive`。
3. 检查 Archive 页面是否出现 4 条演示记录。
4. 展开任意节点，测试思想节点详情、演化地图、变化证据和校对面板。

## 安全边界

- 脚本不会读取 `.obsidian` 配置目录。
- 脚本不会读取 `.env`。
- 脚本不会写入任何 API Key。
- 脚本只写入本地 JSONL 快照日志。
