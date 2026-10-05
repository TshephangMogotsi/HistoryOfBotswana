#!/usr/bin/env python3
"""Select one high-signal DailyNews lead per available calendar month."""

from __future__ import annotations

import csv
import re
from datetime import datetime
from pathlib import Path


TERMS = {
    "murder": 8,
    "death row": 8,
    "death-row": 8,
    "death sentence": 8,
    "death penalty": 8,
    "capital punishment": 8,
    "hanging": 8,
    "execution": 8,
    "sentenced": 5,
    "accused": 5,
    "election": 8,
    "president": 7,
    "hospital": 7,
    "clinic": 6,
    "opens": 6,
    "opening": 6,
    "celebrat": 5,
    "independence": 7,
    "anniversary": 5,
    "parliament": 5,
    "commission": 4,
    "road": 3,
    "bridge": 4,
    "school": 3,
    "museum": 4,
}
CATEGORY_BONUS = {
    "crime": 3,
    "elections": 3,
    "politics": 2,
    "development": 2,
    "parliament": 2,
    "general": 1,
    "art-culture": 1,
    "dikgang": 1,
}
FOREIGN_MARKERS = (
    "china", "xi ", "tibet", "silk road", "sri lanka", "korea",
    "united states", "beijing", "france24",
)
BOTSWANA_MARKERS = (
    "botswana", "batswana", "gaborone", "maun", "palapye", "tonota",
    "serowe", "kasane", "francistown", "molepolole", "mogoditshane",
    "kanye", "shakawe", "tutume", "mophane", "mashatu", "boko",
    "masisi", "khama", "mokgweetsi", "duma",
)


def score(row: dict[str, str]) -> tuple[int, str]:
    text = f"{row['title']} {row['summary']}".lower()
    matches = [term for term in TERMS if term in text]
    value = sum(TERMS[term] for term in matches) + CATEGORY_BONUS.get(row["category"], 0)
    if any(term in text for term in FOREIGN_MARKERS) and not any(term in text for term in BOTSWANA_MARKERS):
        value -= 12
    return value, ", ".join(matches)


def is_foreign_only(row: dict[str, str]) -> bool:
    text = f"{row['title']} {row['summary']}".lower()
    return (
        any(term in text for term in FOREIGN_MARKERS)
        and not any(term in text for term in BOTSWANA_MARKERS)
    )


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    input_path = root / "data" / "processed" / "dailynews-article-leads.csv"
    output_path = root / "data" / "processed" / "dailynews-monthly-review.csv"
    rows = list(csv.DictReader(input_path.open(encoding="utf-8")))
    monthly: dict[str, dict[str, str]] = {}
    for row in rows:
        if is_foreign_only(row):
            continue
        match = re.search(r"(\d{2})\s+([A-Za-z]{3})\s+(\d{4})$", row["date"])
        if not match:
            continue
        month_key = datetime.strptime(f"{match.group(1)} {match.group(2)} {match.group(3)}", "%d %b %Y").strftime("%Y-%m")
        value, matches = score(row)
        row = {**row, "score": str(value), "selection_reason": matches, "status": "lead"}
        current = monthly.get(month_key)
        if current is None or int(row["score"]) > int(current["score"]):
            monthly[month_key] = row

    fields = ["date", "title", "summary", "url", "category", "source", "score", "selection_reason", "status"]
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(monthly[key] for key in sorted(monthly))
    print(f"Selected {len(monthly)} monthly DailyNews leads to {output_path}")


if __name__ == "__main__":
    main()
