# Ruler

An interactive historical timeline application for exploring Botswana's history via a dynamic horizontal SVG ruler interface, supported by a source-linked data pipeline.

## Overview

**Ruler** presents historical events and news leads from Botswana in an accessible, interactive timeline. Users can smoothly scroll through time, zoom between high-level month view and detailed day view, jump to historical landmarks or specific dates, and inspect source citations for each event.

## Features

- **Interactive SVG Ruler**: Custom horizontal timeline ruler with smooth physics-based scrolling, inertia, and edge bounces.
- **Dual Time Granularity**: Switch between **Months** view for broad historical eras and **Days** view for detailed day-by-day exploration.
- **Keyboard & Touch Controls**:
  - Scroll using mouse wheel or touch drag.
  - Zoom with pinch gestures or `+` / `-` keys.
  - Navigate between events using Left/Right Arrow keys or UI buttons.
  - Skip months/years with Up/Down Arrow keys, `PageUp`/`PageDown`, and `Shift + Arrow`.
- **Landmark Jump Links**: Quick navigation to major historical landmarks (e.g., Bechuanaland Protectorate, Independence, Year 2000).
- **Date Picker Dialog**: Jump directly to any year and month within the historical range or jump to the latest recorded event.
- **Source-Linked Events**: Events include verifiable source citations from official institutions, academic publication indices, and national news archives.
- **Accessibility Support**: Built with ARIA live regions, focus management, screen-reader descriptions, and `prefers-reduced-motion` compliance.

## Project Structure

```
.
├── index.html                  # HTML entry point for the timeline application
├── styles.css                  # UI styles for the ruler, cards, and modal dialogs
├── script.js                   # Timeline interaction logic, SVG renderer, and animation engine
├── events.js                   # Curated source-linked historical events & source definitions
├── package.json                # Project scripts and configuration
├── scripts/                    # Python ETL scripts for data harvesting and processing
│   ├── extract-bnr-index.py         # Extracts Botswana Notes & Records publication index
│   ├── extract-statsbots-catalog.py # Flattens Statistics Botswana microdata catalog
│   ├── harvest-dailynews-leads.py   # Collects news leads from Botswana DailyNews
│   ├── select-monthly-dailynews.py  # Filters one lead candidate per month
│   └── build-dailynews-events.py    # Builds processed DailyNews JavaScript data file
└── data/                       # Data pipeline storage
    ├── raw/                         # Raw downloaded source files
    ├── processed/                   # Intermediate CSVs and processed JS datasets
    ├── sources.json                 # Source registry and metadata
    └── README.md                    # Data pipeline details
```

## Getting Started

### Prerequisites

- **Python 3** (for local development server and data pipeline scripts)
- **Node.js** (optional, for running syntax check scripts)

### Running Locally

Start a local development server using `npm`:

```sh
npm run dev
```

Or directly with Python:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173` in your browser.

## NPM Scripts

- `npm run dev`: Starts a local HTTP server on port 4173.
- `npm run check`: Performs a syntax check on `script.js`.
- `npm run extract:bnr`: Extracts the Botswana Notes & Records index to `data/processed/`.
- `npm run extract:statsbots`: Flattens the Statistics Botswana catalog to `data/processed/`.
- `npm run harvest:dailynews`: Scrapes recent news leads from Botswana DailyNews.
- `npm run select:monthly`: Generates a monthly review queue of DailyNews leads.
- `npm run build:dailynews`: Builds `data/processed/dailynews-events.js` for browser consumption.

## Data Pipeline

See [`data/README.md`](data/README.md) for detailed information on how source datasets (Botswana Notes & Records, Statistics Botswana, DailyNews) are collected, transformed, and verified before being promoted into the timeline.
