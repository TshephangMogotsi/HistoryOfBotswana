#!/usr/bin/env python3
"""Flatten the public Statistics Botswana catalog API response into CSV."""

from __future__ import annotations

import csv
import json
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    payload = json.loads((root / "data" / "raw" / "statistics-botswana-catalog.json").read_text(encoding="utf-8"))
    rows = payload["result"]["rows"]
    fields = ["id", "idno", "type", "title", "nation", "authoring_entity", "form_model", "year_start", "year_end", "url"]
    output = root / "data" / "processed" / "statistics-botswana-catalog.csv"
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows({field: row.get(field, "") for field in fields} for row in rows)
    print(f"Extracted {len(rows)} Statistics Botswana catalog entries to {output}")


if __name__ == "__main__":
    main()
