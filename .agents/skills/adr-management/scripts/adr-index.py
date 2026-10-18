#!/usr/bin/env python3
"""docs/adr/*.md 프런트매터를 읽어 README.md 인덱스 표를 재생성한다 (ADR-0010).

의존성: python3 (표준 라이브러리만)
사용법: python3 scripts/adr-index.py [adr-dir]   (기본 docs/adr)
종료 코드: 0 정상, 2 README 없음
"""
import re
import sys
from pathlib import Path

adr_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/adr")
readme = adr_dir / "README.md"
START, END = "<!-- ADR_INDEX:START -->", "<!-- ADR_INDEX:END -->"


def frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    data = {}
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                data[key.strip()] = value.strip()
    return data


def main() -> int:
    if not readme.exists():
        print(f"README 없음: {readme} — 먼저 docs/adr/README.md를 준비하세요", file=sys.stderr)
        return 2

    rows = []
    for path in sorted(adr_dir.glob("[0-9][0-9][0-9][0-9]-*.md")):
        fm = frontmatter(path)
        rows.append(
            (
                fm.get("id", f"ADR-{path.stem[:4]}"),
                fm.get("title", path.stem),
                fm.get("status", "?"),
                fm.get("date", "?"),
                path.name,
            )
        )

    table = ["| ADR | 제목 | 상태 | 날짜 | 파일 |", "| --- | --- | --- | --- | --- |"]
    for adr_id, title, status, date, name in rows:
        table.append(f"| {adr_id} | {title} | {status} | {date} | [{name}](./{name}) |")
    block = START + "\n" + "\n".join(table) + "\n" + END

    text = readme.read_text(encoding="utf-8")
    if START in text and END in text:
        text = re.sub(re.escape(START) + r".*?" + re.escape(END), block, text, flags=re.S)
    else:
        text = text.rstrip() + "\n\n" + block + "\n"
    readme.write_text(text, encoding="utf-8")

    print(f"OK: ADR {len(rows)}건 인덱스 갱신 -> {readme}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
