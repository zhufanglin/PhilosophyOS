"""Tests for Obsidian vault parsing."""

from __future__ import annotations

from pathlib import Path

from app.vault.parser import OpenQuestion, parse_vault


FIXTURE_ROOT = Path(__file__).parents[1] / "fixtures" / "obsidian-vault"


def test_parse_vault_extracts_frontmatter_tags_links_sections_and_tasks() -> None:
    parsed = parse_vault(FIXTURE_ROOT)
    freedom = _note_by_name(parsed.notes, "freedom.md")

    assert freedom.frontmatter["title"] == "Freedom and Responsibility"
    assert freedom.frontmatter["aliases"] == ["自由", "responsibility"]
    assert {"ethics", "freedom", "responsibility", "open-question"} <= set(freedom.tags)
    assert [section.title for section in freedom.sections] == [
        "Freedom and Responsibility",
        "Tasks",
        "Open Questions",
    ]
    assert [(link.target, link.section, link.alias) for link in freedom.links] == [
        ("Kant", None, "Kant's duty"),
        ("Aristotle", "Virtue", None),
    ]
    assert [(task.text, task.checked) for task in freedom.tasks] == [
        ("Compare negative freedom with moral responsibility", False),
        ("Read a short passage from Aristotle", True),
        ("When do limits still permit responsibility?", False),
    ]


def test_parse_vault_extracts_open_questions_from_sections_tasks_and_tags() -> None:
    parsed = parse_vault(FIXTURE_ROOT)
    freedom = _note_by_name(parsed.notes, "freedom.md")
    weekly = _note_by_name(parsed.notes, "weekly-review.md")

    assert _question_texts(freedom.open_questions) == [
        "When do limits still permit responsibility?",
        "How can a person distinguish discipline from self-betrayal?",
    ]
    assert _question_texts(weekly.open_questions) == [
        "Which tension appeared most often this week?",
    ]


def test_parse_vault_excludes_obsidian_hidden_and_private_directories() -> None:
    parsed = parse_vault(FIXTURE_ROOT)

    relative_paths = {note.relative_path for note in parsed.notes}
    all_note_text = "\n".join(
        "\n".join(
            [
            note.relative_path,
            str(note.frontmatter),
            " ".join(note.tags),
            " ".join(_question_texts(note.open_questions)),
            ]
        )
        for note in parsed.notes
    )

    assert relative_paths == {
        "PhilosophyOS/freedom.md",
        "PhilosophyOS/kant.md",
        "Projects/weekly-review.md",
    }
    assert "DO_NOT_PARSE_OBSIDIAN_SENTINEL" not in all_note_text
    assert "SECRET_PRIVATE_SENTINEL" not in all_note_text


def _note_by_name(notes, file_name: str):
    return next(note for note in notes if note.path.name == file_name)


def _question_texts(questions: list[OpenQuestion]) -> list[str]:
    return [question.text for question in questions]
