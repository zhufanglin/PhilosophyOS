"""Seed PhilosophyOS demo thought snapshots from Stu's Obsidian vault.

This script reads a small, explicit set of Markdown notes from the local
Obsidian vault and writes idempotent demo records into the local
`thought-snapshots.jsonl` store used by the Archive page.

It never reads `.obsidian/`, never reads environment files, and never writes
API keys. Existing non-demo snapshot records are preserved.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_VAULT = Path(r"D:\Obsidian\storage\Stu的哲学思考")
DEFAULT_OUTPUT = REPO_ROOT / "apps" / "api" / "data" / "local" / "thought-snapshots.jsonl"
DEMO_PREFIX = "demo_obsidian_"


DEMO_BLUEPRINTS: list[dict[str, Any]] = [
    {
        "slug": "freedom_will",
        "file": Path("哲学思考整理") / "09-自由意志、决定论与行动自由.md",
        "question": "如果我的选择受到性格、处境和因果链影响，我还算自由吗？",
        "topic": "自由意志与行动自由",
        "title": "自由不是脱离因果，而是在限制中形成可承担的行动",
        "user_position": "我倾向于把自由理解为行动中的自我承担，而不是完全摆脱因果条件。",
        "confidence": 0.72,
        "emotional_tone": "谨慎但更愿意承担责任",
        "core_question": "当决定论看似削弱选择时，责任是否还能成立？",
        "key_insights": [
            "自由可以从“能否另选”转向“能否把行动承认为自己的”。",
            "处境限制并不自动取消责任，但会改变责任的范围。",
            "决定论和行动自由之间需要区分形而上学问题与实践问题。",
        ],
        "tensions": ["因果限制与责任承担", "行动自由与形而上自由"],
        "related_philosophers": [
            {"name": "康德", "reason": "把自由与道德责任联系起来。"},
            {"name": "斯宾诺莎", "reason": "提醒人理解必然性本身也可能改变行动。"},
        ],
        "change_signal": {
            "changed": True,
            "previous_position": "自由必须意味着我本可以完全不受限制地选择。",
            "current_position": "自由更像是在限制中理解原因，并仍然承认自己的行动。",
            "change_type": "从绝对自由转向兼容论式自由",
        },
        "next_question": "如果自由依赖自我理解，那么教育和反思是否会扩大自由？",
        "tags": ["自由意志", "决定论", "责任", "行动自由"],
        "decision": "approved",
        "review": {
            "verdict": "accurate",
            "note": "这条总结基本符合我现在对自由与责任关系的理解。",
        },
        "model_profile": "deepseek",
        "provider": "deepseek",
        "provider_model": "deepseek-v4-flash",
    },
    {
        "slug": "self_meaning",
        "file": Path("哲学思考整理") / "02-自我、存在与意义.md",
        "question": "如果意义不是预先给定的，我如何避免把人生理解成任意选择？",
        "topic": "自我、存在与意义",
        "title": "意义不是被发现的物品，而是在持续承诺中被建构",
        "user_position": "我更愿意把意义理解成一种被实践不断确认的方向，而不是一次性找到的答案。",
        "confidence": 0.66,
        "emotional_tone": "开放、仍有不安",
        "core_question": "没有外部保证时，个人承诺如何避免滑向自我安慰？",
        "key_insights": [
            "意义的稳定性来自重复实践，而不只是某个宏大解释。",
            "怀疑意义并不等于否定意义，怀疑也可能是重新选择的入口。",
            "自我不是固定实体，更像一条不断被叙述和修正的线索。",
        ],
        "tensions": ["主观建构与外部承认", "存在焦虑与行动承诺"],
        "related_philosophers": [
            {"name": "萨特", "reason": "强调人在没有预设本质时仍要为选择负责。"},
            {"name": "加缪", "reason": "荒诞处境中仍然保留行动姿态。"},
        ],
        "change_signal": {
            "changed": True,
            "previous_position": "意义如果不能被证明，就可能只是心理安慰。",
            "current_position": "意义可以不靠最终证明，而靠持续实践和自我校对获得重量。",
            "change_type": "从证明式意义转向实践式意义",
        },
        "next_question": "什么样的承诺值得长期维持，而不是短暂情绪的产物？",
        "tags": ["存在主义", "意义", "自我", "承诺"],
        "decision": "edit",
        "review": {
            "verdict": "rewrite",
            "note": "“意义被建构”还需要写得更具体，不能只停在存在主义口号上。",
        },
        "model_profile": "gpt",
        "provider": "openai-compatible",
        "provider_model": "gpt-5.6",
    },
    {
        "slug": "language_reason",
        "file": Path("哲学思考整理") / "03-理性的边界与语言的塑形.md",
        "question": "语言是在表达思想，还是也在塑造我能想到什么？",
        "topic": "理性的边界与语言",
        "title": "语言不是思想的外壳，而是思想可被整理的条件之一",
        "user_position": "我认为语言会塑造思想的清晰度；表达不只是输出，也会反过来改变理解。",
        "confidence": 0.78,
        "emotional_tone": "清醒、偏分析",
        "core_question": "如果语言塑造思想，那么沉默或含混是否也构成思想的一部分？",
        "key_insights": [
            "概念会划分经验，让某些问题变得可见。",
            "表达困难可能不是语言失败，而是思想尚未成形的信号。",
            "理性需要语言，但语言也会把复杂经验压缩成可处理的结构。",
        ],
        "tensions": ["经验的丰富性与概念的压缩", "表达清晰与意义损失"],
        "related_philosophers": [
            {"name": "维特根斯坦", "reason": "语言边界与世界理解之间有直接关联。"},
            {"name": "康德", "reason": "提醒经验需要形式条件才能被理解。"},
        ],
        "change_signal": {
            "changed": False,
            "previous_position": None,
            "current_position": "语言既表达思想，也参与塑造思想。",
            "change_type": None,
        },
        "next_question": "我应该如何训练概念，而不是被概念自动牵着走？",
        "tags": ["语言", "理性", "认识论", "概念"],
        "decision": "raw_only",
        "review": {
            "verdict": "raw_only",
            "note": "这条暂时只保留原文，AI 的概括还不够贴近我的语感。",
        },
        "model_profile": "free",
        "provider": "volcengine-ark",
        "provider_model": "doubao-seed-2-0-lite-260428",
    },
    {
        "slug": "history_direction",
        "file": Path("视频笔记-历史的发展有方向吗.md"),
        "question": "历史的发展有方向吗，还是只是我们事后赋予了它方向？",
        "topic": "历史哲学与方向感",
        "title": "历史可以有趋势，但趋势不等于预设终点",
        "user_position": "我倾向于承认历史中存在长期趋势，但反对把趋势理解成必然命运。",
        "confidence": 0.69,
        "emotional_tone": "警惕宏大叙事",
        "core_question": "怎样区分结构性趋势和事后解释出来的必然性？",
        "key_insights": [
            "进步需要先说明评价标准，而不能只用时间先后代替价值判断。",
            "结构会限制可能性，但具体结果仍受行动、偶然和制度影响。",
            "历史目的论有解释力，也有把现实合理化的风险。",
        ],
        "tensions": ["历史趋势与偶然事件", "进步叙事与现实代价"],
        "related_philosophers": [
            {"name": "黑格尔", "reason": "历史目的论与精神展开是核心参照。"},
            {"name": "马克思", "reason": "把历史运动放在生产方式与社会关系中理解。"},
        ],
        "change_signal": {
            "changed": False,
            "previous_position": None,
            "current_position": "历史有条件化的方向，但没有脱离行动的保证。",
            "change_type": None,
        },
        "next_question": "如果历史没有保证，政治行动的意义应当建立在哪里？",
        "tags": ["历史哲学", "黑格尔", "马克思", "进步"],
        "decision": "approved",
        "review": {
            "verdict": "accurate",
            "note": "适合作为历史哲学主题的演示节点。",
        },
        "model_profile": "free",
        "provider": "volcengine-ark",
        "provider_model": "doubao-seed-2-0-lite-260428",
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed demo Archive snapshots from an Obsidian vault.")
    parser.add_argument("--vault", type=Path, default=DEFAULT_VAULT, help="Obsidian vault root.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="thought-snapshots.jsonl path.")
    parser.add_argument("--replace", action="store_true", help="Remove existing demo records before appending.")
    return parser.parse_args()


def strip_markdown_noise(text: str) -> str:
    text = re.sub(r"^---.*?---", "", text, flags=re.DOTALL)
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    text = re.sub(r"!\[[^\]]*]\([^)]*\)", "", text)
    text = re.sub(r"\[\[([^]|]+)(?:\|([^]]+))?]]", lambda match: match.group(2) or match.group(1), text)
    text = re.sub(r"\[([^]]+)]\([^)]*\)", r"\1", text)
    text = re.sub(r"^#+\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[>\-\*\d. ]+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def read_excerpt(vault: Path, relative_path: Path, *, limit: int = 520) -> str:
    if ".obsidian" in relative_path.parts:
        raise ValueError("Refusing to read .obsidian files.")
    path = vault / relative_path
    if not path.exists():
        return f"演示来源文件暂未找到：{relative_path.as_posix()}"
    text = path.read_text(encoding="utf-8", errors="ignore")
    excerpt = strip_markdown_noise(text)
    return excerpt[:limit].strip() or f"演示来源：{relative_path.as_posix()}"


def make_record(blueprint: dict[str, Any], created_at: datetime, vault: Path) -> dict[str, Any]:
    snapshot_id = f"{DEMO_PREFIX}{blueprint['slug']}"
    excerpt = read_excerpt(vault, blueprint["file"])
    decision_updated_at = (created_at + timedelta(minutes=8)).isoformat()
    review_updated_at = (created_at + timedelta(minutes=12)).isoformat()
    return {
        "created_at": created_at.isoformat(),
        "request": {
            "question": blueprint["question"],
            "user_statements": [
                blueprint["user_position"],
                f"Obsidian 来源：{blueprint['file'].as_posix()}",
            ],
            "selected_items": [
                {
                    "label": f"Obsidian 摘录：{blueprint['file'].name}",
                    "text": excerpt,
                    "origin": "user",
                },
                {
                    "label": "演示节点说明",
                    "text": "这是一条由 Stu 的哲学思考库生成的 PhilosophyOS 演示快照，用于端到端测试。",
                    "origin": "ai",
                },
            ],
            "model_profile": blueprint["model_profile"],
        },
        "response": {
            "snapshot_id": snapshot_id,
            "status": "completed",
            "content": {
                "topic": blueprint["topic"],
                "title": blueprint["title"],
                "user_position": blueprint["user_position"],
                "confidence": blueprint["confidence"],
                "emotional_tone": blueprint["emotional_tone"],
                "core_question": blueprint["core_question"],
                "key_insights": blueprint["key_insights"],
                "tensions": blueprint["tensions"],
                "related_philosophers": blueprint["related_philosophers"],
                "change_signal": blueprint["change_signal"],
                "next_question": blueprint["next_question"],
                "tags": blueprint["tags"],
            },
            "provider": blueprint["provider"],
            "provider_model": blueprint["provider_model"],
            "pending_reason": None,
            "user_decision": blueprint["decision"],
            "decision_updated_at": decision_updated_at,
            "snapshot_review": {
                "verdict": blueprint["review"]["verdict"],
                "note": blueprint["review"]["note"],
                "updated_at": review_updated_at,
            },
        },
    }


def load_existing_records(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            records.append({"_raw": line})
    return records


def is_demo_record(record: dict[str, Any]) -> bool:
    response = record.get("response")
    return isinstance(response, dict) and str(response.get("snapshot_id", "")).startswith(DEMO_PREFIX)


def main() -> None:
    args = parse_args()
    vault = args.vault.expanduser()
    output = args.output.expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)

    if not vault.exists():
        raise SystemExit(f"Obsidian vault does not exist: {vault}")

    existing = load_existing_records(output)
    if args.replace:
        kept_records = [record for record in existing if not is_demo_record(record)]
    else:
        existing_demo_ids = {
            record["response"]["snapshot_id"]
            for record in existing
            if is_demo_record(record) and isinstance(record.get("response"), dict)
        }
        kept_records = existing
        DEMO_BLUEPRINTS[:] = [
            blueprint
            for blueprint in DEMO_BLUEPRINTS
            if f"{DEMO_PREFIX}{blueprint['slug']}" not in existing_demo_ids
        ]

    base_time = datetime.now(UTC) - timedelta(days=len(DEMO_BLUEPRINTS))
    demo_records = [
        make_record(blueprint, base_time + timedelta(days=index), vault)
        for index, blueprint in enumerate(DEMO_BLUEPRINTS)
    ]
    final_records = kept_records + demo_records
    output.write_text(
        "\n".join(json.dumps(record, ensure_ascii=False) for record in final_records) + "\n",
        encoding="utf-8",
    )
    print(f"Seeded {len(demo_records)} Obsidian demo snapshot(s) into {output}")


if __name__ == "__main__":
    main()
