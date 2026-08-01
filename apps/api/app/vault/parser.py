"""Dependency-light parser for local Obsidian Markdown vaults."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


EXCLUDED_DIRECTORY_NAMES = {
    ".git",
    ".obsidian",
    ".trash",
    ".trashes",
    ".venv",
    "__pycache__",
    "private",
    "secrets",
}

FRONTMATTER_RE = re.compile(r"\A---\s*\n(?P<yaml>.*?)\n---\s*(?:\n|\Z)", re.DOTALL)
HEADING_RE = re.compile(r"^(?P<level>#{1,6})\s+(?P<title>.+?)\s*$")
TASK_RE = re.compile(r"^\s*[-*]\s+\[(?P<checked>[ xX])]\s+(?P<text>.+?)\s*$")
WIKI_LINK_RE = re.compile(r"\[\[(?P<target>[^\]|#]+)(?:#(?P<section>[^\]|]+))?(?:\|(?P<alias>[^\]]+))?]]")
TAG_RE = re.compile(r"(?<![\w/])#(?P<tag>[\w\u4e00-\u9fff][\w\-/\u4e00-\u9fff]*)")
OPEN_QUESTION_MARKER_RE = re.compile(
    r"(开放问题|未完成追问|继续追问|open\s+questions?|next\s+questions?|unfinished\s+follow-ups?|follow-ups?)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class VaultSection:
    """A Markdown heading in a note."""

    level: int
    title: str
    line: int


@dataclass(frozen=True)
class VaultTask:
    """A Markdown task item."""

    text: str
    checked: bool
    line: int


@dataclass(frozen=True)
class VaultLink:
    """A bidirectional Obsidian-style wiki link."""

    target: str
    section: str | None
    alias: str | None
    line: int


@dataclass(frozen=True)
class OpenQuestion:
    """A question that should remain available for future reflection."""

    text: str
    line: int
    source: str


@dataclass(frozen=True)
class ParsedVaultNote:
    """Structured representation of one Markdown note."""

    path: Path
    relative_path: str
    frontmatter: dict[str, Any]
    tags: list[str]
    links: list[VaultLink]
    sections: list[VaultSection]
    tasks: list[VaultTask]
    open_questions: list[OpenQuestion]


@dataclass(frozen=True)
class ParsedVault:
    """Structured representation of a parsed vault."""

    root: Path
    notes: list[ParsedVaultNote] = field(default_factory=list)


def parse_vault(
    vault_root: str | Path,
    *,
    excluded_directory_names: set[str] | None = None,
) -> ParsedVault:
    """Parse Markdown notes from a vault while excluding private/system directories."""

    root = Path(vault_root).expanduser().resolve()
    excluded_names = {
        name.lower() for name in (excluded_directory_names or EXCLUDED_DIRECTORY_NAMES)
    }
    notes = [
        parse_note(path, root=root)
        for path in sorted(_iter_markdown_files(root, excluded_names), key=lambda item: item.as_posix())
    ]
    return ParsedVault(root=root, notes=notes)


def parse_note(path: str | Path, *, root: str | Path | None = None) -> ParsedVaultNote:
    """Parse one Markdown note."""

    note_path = Path(path).resolve()
    vault_root = Path(root).resolve() if root is not None else note_path.parent
    raw_markdown = note_path.read_text(encoding="utf-8")
    frontmatter, body = _split_frontmatter(raw_markdown)
    lines = body.splitlines()

    sections = _parse_sections(lines)
    tasks = _parse_tasks(lines)
    links = _parse_links(lines)
    body_tags = _parse_inline_tags(body)
    frontmatter_tags = _frontmatter_tags(frontmatter)
    open_questions = _parse_open_questions(lines)

    return ParsedVaultNote(
        path=note_path,
        relative_path=note_path.relative_to(vault_root).as_posix(),
        frontmatter=frontmatter,
        tags=_unique_sorted([*frontmatter_tags, *body_tags]),
        links=links,
        sections=sections,
        tasks=tasks,
        open_questions=open_questions,
    )


def _iter_markdown_files(root: Path, excluded_names: set[str]) -> list[Path]:
    if not root.exists():
        raise FileNotFoundError(f"Vault root does not exist: {root}")

    markdown_files: list[Path] = []
    for path in root.rglob("*.md"):
        relative_parts = path.relative_to(root).parts
        normalized_parts = {part.lower() for part in relative_parts[:-1]}
        if normalized_parts & excluded_names:
            continue
        if any(part.startswith(".") for part in relative_parts[:-1]):
            continue
        markdown_files.append(path)
    return markdown_files


def _split_frontmatter(markdown: str) -> tuple[dict[str, Any], str]:
    match = FRONTMATTER_RE.match(markdown)
    if not match:
        return {}, markdown

    frontmatter = _parse_simple_yaml(match.group("yaml").splitlines())
    return frontmatter, markdown[match.end() :]


def _parse_simple_yaml(lines: list[str]) -> dict[str, Any]:
    data: dict[str, Any] = {}
    current_list_key: str | None = None

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        if current_list_key and stripped.startswith("- "):
            value = _coerce_yaml_scalar(stripped[2:].strip())
            data.setdefault(current_list_key, []).append(value)
            continue

        current_list_key = None
        if ":" not in line:
            continue

        key, raw_value = line.split(":", 1)
        key = key.strip()
        raw_value = raw_value.strip()
        if not key:
            continue

        if raw_value == "":
            data[key] = []
            current_list_key = key
        elif raw_value.startswith("[") and raw_value.endswith("]"):
            data[key] = [
                _coerce_yaml_scalar(part.strip())
                for part in raw_value[1:-1].split(",")
                if part.strip()
            ]
        else:
            data[key] = _coerce_yaml_scalar(raw_value)

    return data


def _coerce_yaml_scalar(value: str) -> str | bool | int | float:
    unquoted = value.strip().strip('"').strip("'")
    lowered = unquoted.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    try:
        return int(unquoted)
    except ValueError:
        pass
    try:
        return float(unquoted)
    except ValueError:
        return unquoted


def _frontmatter_tags(frontmatter: dict[str, Any]) -> list[str]:
    raw_tags = frontmatter.get("tags", [])
    if isinstance(raw_tags, str):
        return [raw_tags.strip().lstrip("#")] if raw_tags.strip() else []
    if isinstance(raw_tags, list):
        return [str(tag).strip().lstrip("#") for tag in raw_tags if str(tag).strip()]
    return []


def _parse_inline_tags(markdown: str) -> list[str]:
    return [match.group("tag").strip("/") for match in TAG_RE.finditer(markdown)]


def _parse_sections(lines: list[str]) -> list[VaultSection]:
    sections: list[VaultSection] = []
    for index, line in enumerate(lines, start=1):
        match = HEADING_RE.match(line)
        if match:
            sections.append(
                VaultSection(
                    level=len(match.group("level")),
                    title=match.group("title").strip(),
                    line=index,
                )
            )
    return sections


def _parse_tasks(lines: list[str]) -> list[VaultTask]:
    tasks: list[VaultTask] = []
    for index, line in enumerate(lines, start=1):
        match = TASK_RE.match(line)
        if match:
            tasks.append(
                VaultTask(
                    text=match.group("text").strip(),
                    checked=match.group("checked").lower() == "x",
                    line=index,
                )
            )
    return tasks


def _parse_links(lines: list[str]) -> list[VaultLink]:
    links: list[VaultLink] = []
    for index, line in enumerate(lines, start=1):
        for match in WIKI_LINK_RE.finditer(line):
            links.append(
                VaultLink(
                    target=match.group("target").strip(),
                    section=_clean_optional(match.group("section")),
                    alias=_clean_optional(match.group("alias")),
                    line=index,
                )
            )
    return links


def _parse_open_questions(lines: list[str]) -> list[OpenQuestion]:
    questions: list[OpenQuestion] = []
    in_open_question_section = False
    open_question_heading_level: int | None = None

    for index, line in enumerate(lines, start=1):
        heading_match = HEADING_RE.match(line)
        if heading_match:
            title = heading_match.group("title").strip()
            level = len(heading_match.group("level"))
            in_open_question_section = bool(OPEN_QUESTION_MARKER_RE.search(title))
            open_question_heading_level = level if in_open_question_section else None
            continue

        if in_open_question_section and heading_match is None:
            if line.startswith("#") and open_question_heading_level is not None:
                in_open_question_section = False
                open_question_heading_level = None
                continue
            extracted = _question_from_list_item(line)
            if extracted:
                questions.append(OpenQuestion(text=extracted, line=index, source="section"))

        if "#open-question" in line.lower() or "#开放问题" in line:
            extracted = _question_from_list_item(line) or _strip_open_question_marker(line)
            if extracted and _looks_like_question(extracted):
                questions.append(OpenQuestion(text=extracted, line=index, source="tag"))

    return _dedupe_open_questions(questions)


def _question_from_list_item(line: str) -> str | None:
    task_match = TASK_RE.match(line)
    if task_match:
        return _strip_open_question_marker(task_match.group("text").strip())

    stripped = line.strip()
    bullet_prefixes = ("- ", "* ", "1. ", "2. ", "3. ", "4. ", "5. ")
    if any(stripped.startswith(prefix) for prefix in bullet_prefixes):
        text = re.sub(r"^([-*]|\d+\.)\s+", "", stripped)
        return _strip_open_question_marker(text)
    return None


def _strip_open_question_marker(text: str) -> str:
    return (
        text.replace("#open-question", "")
        .replace("#OpenQuestion", "")
        .replace("#开放问题", "")
        .strip(" -")
    )


def _looks_like_question(text: str) -> bool:
    return text.endswith(("?", "？"))


def _dedupe_open_questions(questions: list[OpenQuestion]) -> list[OpenQuestion]:
    seen: set[str] = set()
    deduped: list[OpenQuestion] = []
    for question in questions:
        normalized = question.text.casefold()
        if normalized and normalized not in seen:
            seen.add(normalized)
            deduped.append(question)
    return deduped


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _unique_sorted(values: list[str]) -> list[str]:
    return sorted({value for value in values if value})
