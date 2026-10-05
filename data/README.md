# Historical source pipeline

`raw/` holds downloaded source files. `processed/` holds machine-readable extracts that can be reviewed before they are promoted into the curated `BOTSWANA_EVENTS` data in `events.js`.

The first extract is the Botswana Notes & Records publication index. It is a discovery layer: article titles and authors are preserved, while event dates and summaries still need source verification. Run:

```sh
python3 scripts/extract-bnr-index.py
```

The resulting CSV is intentionally separate from the interactive ruler. The extractor also writes `processed/bnr-review-candidates.csv`, a title-based queue for articles that mention historical, political, economic, social, or geographic topics. These are leads for review, not automatically promoted events; each candidate needs a verified date, summary, and page-level citation before it enters the public timeline.

The Statistics Botswana catalog is captured separately as `raw/statistics-botswana-catalog.json` and flattened to `processed/statistics-botswana-catalog.csv` for selecting contextual series later.

DailyNews article metadata can be refreshed with `DAILYNEWS_PAGES=100 python3 scripts/harvest-dailynews-leads.py`. The collector covers event-heavy categories and keeps article URLs, dates, titles, and short snippets. It does not promote crime allegations or court reports automatically; those require careful wording and source review before entering `events.js`.

Run `python3 scripts/select-monthly-dailynews.py` to create a one-lead-per-month review queue, then run `python3 scripts/build-dailynews-events.py` to regenerate the browser data layer. The selector skips clearly foreign-only syndicated stories, and the ruler keeps one visible marker per calendar month, choosing the most precise and important record when curated and newspaper records overlap. The score only prioritizes likely public events; it is not a truth or importance rating.
