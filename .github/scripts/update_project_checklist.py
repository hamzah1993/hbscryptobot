#!/usr/bin/env python3
"""Append one merged pull request to docs/project-checklist.md, once."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path


START = "<!-- AUTO-MERGED-PRS:START -->"
END = "<!-- AUTO-MERGED-PRS:END -->"


def clean(value: str) -> str:
    return " ".join(value.replace("|", "-").split())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="docs/project-checklist.md")
    parser.add_argument("--number", required=True, type=int)
    parser.add_argument("--title", required=True)
    parser.add_argument("--author", required=True)
    parser.add_argument("--merged-at", required=True)
    parser.add_argument("--sha", required=True)
    args = parser.parse_args()

    path = Path(args.file)
    text = path.read_text(encoding="utf-8")
    if START not in text or END not in text:
        raise SystemExit("project checklist auto-history markers are missing")

    before, remainder = text.split(START, 1)
    history, after = remainder.split(END, 1)
    needle = f"PR #{args.number} |"
    if needle in history:
        print(f"PR #{args.number} is already recorded; no change needed")
        return 0

    try:
        merged_at = datetime.fromisoformat(args.merged_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SystemExit(f"invalid merged-at value: {args.merged_at}") from exc
    merged_date = merged_at.astimezone(timezone.utc).date().isoformat()

    entry = (
        f"- {merged_date} | PR #{args.number} | {clean(args.title)} | "
        f"@{clean(args.author)} | `{clean(args.sha)[:12]}`"
    )
    existing = history.strip("\n")
    updated_history = f"\n{existing}\n{entry}\n" if existing else f"\n{entry}\n"
    path.write_text(before + START + updated_history + END + after, encoding="utf-8")
    print(f"Recorded PR #{args.number}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
