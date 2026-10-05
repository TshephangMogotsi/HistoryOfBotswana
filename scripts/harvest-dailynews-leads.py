#!/usr/bin/env python3
"""Harvest dated article leads from DailyNews category pages.

This deliberately collects metadata and short snippets only. A human review
step is still required before an article becomes a historical timeline event.
"""

from __future__ import annotations

import csv
import html
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen


CATEGORIES = {
    "crime": 33,
    "elections": 38,
    "politics": 2,
    "development": 34,
    "dikgang": 10,
    "general": 35,
    "art-culture": 11,
    "parliament": 22,
}
PAGES = int(os.environ.get("DAILYNEWS_PAGES", "3"))
CARD_RE = re.compile(
    r'<div class="newsbox3">.*?'
    r'<a href="(?P<url>https://dailynews\.gov\.bw/news-detail/\d+)">.*?'
    r'<span>(?P<date>[^<]+)</span>.*?'
    r'<h4[^>]*>(?P<title>.*?)</h4>.*?'
    r'<div class="limit">(?P<summary>.*?)</div>',
    re.IGNORECASE | re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")


def clean(value: str) -> str:
    value = TAG_RE.sub(" ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def fetch(url: str) -> str:
    request = Request(url, headers={"User-Agent": "HistoryOfBotswana/1.0 research collector"})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    output = root / "data" / "processed" / "dailynews-article-leads.csv"
    records = {}
    jobs = [
        (category, page, f"https://dailynews.gov.bw/news-list/srccategory/{category_id}/{page}")
        for category, category_id in CATEGORIES.items()
        for page in range(1, PAGES + 1)
    ]

    def collect(job: tuple[str, int, str]) -> list[dict[str, str]]:
        category, page, url = job
        try:
            source = fetch(url)
        except Exception as error:
            print(f"Skipping {url}: {error}")
            return []
        rows = []
        for match in CARD_RE.finditer(source):
            rows.append({
                "date": clean(match.group("date")),
                "title": clean(match.group("title")),
                "summary": clean(match.group("summary")),
                "url": match.group("url"),
                "category": category,
                "source": "Botswana DailyNews",
            })
        return rows

    with ThreadPoolExecutor(max_workers=8) as executor:
        for future in as_completed(executor.submit(collect, job) for job in jobs):
            for record in future.result():
                records[record["url"]] = record

    fields = ["date", "title", "summary", "url", "category", "source"]
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(sorted(records.values(), key=lambda row: (row["date"], row["title"])))
    print(f"Harvested {len(records)} unique DailyNews article leads to {output}")


if __name__ == "__main__":
    main()
