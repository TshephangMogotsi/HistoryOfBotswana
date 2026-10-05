#!/usr/bin/env python3
"""Extract the Botswana Notes & Records publication index from XLSX files.

The source workbooks are public indexes, not event data. This script preserves
their bibliographic fields so article titles can be reviewed and promoted into
the curated timeline with a page-level source citation.
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree


NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
TEXT_TAG = "{%s}t" % NS["main"]
SOURCE_URL = "https://www.thebotswanasociety.net/botswana-notes-records"
YEAR_RE = re.compile(r"(?<!\d)(1[89]\d{2}|20\d{2})(?!\d)")
REVIEW_TERMS = re.compile(
    r"\b(history|historical|election|independence|constitution|chief|politic|war|colonial|"
    r"protectorate|migration|migrant|mine|diamond|drought|famine|disease|education|railway|"
    r"road|urban|development|law|legislation|museum|archaeolog|settlement|census|president|"
    r"government|party|land|water|livestock|agriculture)\b",
    re.IGNORECASE,
)


def shared_strings(archive: ZipFile) -> list[str]:
    root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    values = []
    for item in root.findall("main:si", NS):
        values.append("".join(text.text or "" for text in item.iter(TEXT_TAG)))
    return values


def cell_value(cell, strings: list[str]) -> str:
    value = cell.find("main:v", NS)
    if value is None or value.text is None:
        inline = cell.find("main:is", NS)
        return "".join(text.text or "" for text in inline.iter(TEXT_TAG)) if inline is not None else ""
    raw = value.text
    if cell.get("t") == "s":
        return strings[int(raw)]
    return raw


def records_from_workbook(path: Path) -> list[dict[str, str]]:
    records = []
    with ZipFile(path) as archive:
        strings = shared_strings(archive)
        sheet_names = sorted(
            name for name in archive.namelist()
            if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
        )
        for sheet_name in sheet_names:
            root = ElementTree.fromstring(archive.read(sheet_name))
            for row in root.findall(".//main:sheetData/main:row", NS):
                values = [cell_value(cell, strings) for cell in row.findall("main:c", NS)]
                if len(values) < 5 or values[0].strip() != "Notes & Records":
                    continue
                title = values[3].strip()
                author = values[4].strip()
                records.append({
                    "collection": "Botswana Notes & Records",
                    "volume": values[1].strip(),
                    "pages": values[2].strip(),
                    "title": title,
                    "author": author,
                    "candidate_years": ";".join(dict.fromkeys(YEAR_RE.findall(title))),
                    "review_candidate": "yes" if REVIEW_TERMS.search(title) else "no",
                    "source_url": SOURCE_URL,
                    "source_file": path.name,
                })
    return records


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    raw_dir = root / "data" / "raw"
    output_path = root / "data" / "processed" / "botswana-notes-records-index.csv"
    workbooks = sorted(raw_dir.glob("botswana-notes-records-index-*.xlsx"))
    if not workbooks:
        print(f"No BNR workbooks found in {raw_dir}", file=sys.stderr)
        return 1

    unique: dict[tuple[str, str, str, str], dict[str, str]] = {}
    for workbook in workbooks:
        for record in records_from_workbook(workbook):
            key = (record["volume"], record["pages"], record["title"], record["author"])
            unique[key] = record

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["collection", "volume", "pages", "title", "author", "candidate_years", "review_candidate", "source_url", "source_file"]
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(sorted(unique.values(), key=lambda row: (float(row["volume"] or 0), row["title"].lower())))

    candidates_path = output_path.with_name("bnr-review-candidates.csv")
    with candidates_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(
            row for row in sorted(unique.values(), key=lambda row: (float(row["volume"] or 0), row["title"].lower()))
            if row["review_candidate"] == "yes"
        )

    candidate_count = sum(row["review_candidate"] == "yes" for row in unique.values())
    print(f"Extracted {len(unique)} unique BNR records to {output_path}")
    print(f"Created {candidate_count} title-based review candidates at {candidates_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
