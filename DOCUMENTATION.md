# Observador Scraper: Documentation & How It Works

This application is a specialized research tool designed to search, filter, and export articles from the Portuguese news outlet **Observador**. It combines multiple discovery techniques with a custom scraper to bypass common limitations of standard search engines.

---

## 1. System Architecture

The app uses a full-stack architecture:
- **Frontend**: React (Vite) + Tailwind CSS + shadcn/ui. Handles user input, date parsing, results display, and Excel generation.
- **Backend**: Node.js (Express). Executes the heavy lifting of indexing, fetching, and content evaluation to avoid CORS issues and manage request rate-limiting.

---

## 2. The Discovery Engine (How articles are found)

Finding articles by date on a news site is difficult because search engines don't always index every URL immediately. This app uses a **three-tier discovery strategy**:

1.  **Search Engine Indexing (DuckDuckGo)**: The app queries DuckDuckGo for the specified terms to find high-relevance articles already indexed by the web.
2.  **Internal Site Search**: It performs a native search on `observador.pt` using their internal engine, which often reveals the most recent or hyper-specific content.
3.  **Sitemap Deep-Dive (Exhaustive)**: For large date ranges, the app fetches and parses the official Observador XML Sitemaps (`/sitemap-pt-index.xml`). It calculates which monthly/yearly archives to download based on your chosen dates, ensuring that no article published in that period is missed.

---

## 3. The Scraper & Content Evaluation

Once a list of "candidate" URLs is found, the backend proceeds to evaluate them:

### Scraped Targets
The scraper doesn't just look at the visible text; it analyzes:
- **Title & Description**: Standard metadata.
- **Article Body**: Multiple CSS selectors are checked (e.g., `.article-body`, `article`, etc.).
- **Metadata (Tags & Topics)**: It extracts hidden SEO tags and the "Topics" listed at the bottom of articles.
- **Section**: Detects the category (e.g., "Política", "Economia").
- **URL Slug**: The words in the URL itself are indexed (e.g., `morreu-marco-paulo`).
- **JSON-LD Fallback**: Parses structural data scripts for extra precision.

### Logic Evaluation
The app supports logical operators in the keyword input:
- `A B` (Space) = **AND** (Article must contain both)
- `A, B` (Comma) = **OR** (Article contains either)
- `-C` (Minus) = **NOT** (Exclude articles containing this)

---

## 4. Resilience & Security (Bypassing Blocks)

Observador uses Cloudflare and anti-bot measures. The app implements several techniques to ensure successful scraping:
- **Header Spoofing**: Mimics a real Chrome browser on Windows.
- **Referer Spoofing**: Makes requests look like they are coming from the Observador homepage.
- **Randomized Jitter**: Each request has a 0.5s to 1.5s randomized delay to avoid triggering "rate limit" flags.
- **Automatic Retries**: Failed requests (e.g., 403 or 503) are automatically retried with increased delays.

---

## 5. UI Features

### Advanced Date Selection
- **Manual Input**: Supports `YYYY-MM-DD`, `DD/MM/YYYY`, and `MM/DD/YYYY`.
- **Calendar Picker**: Includes dropdowns for fast Month/Year navigation.
- **Relative Ranges**: Quick presets for "Last 7 Days", "This Month", etc.

### Data Management
- **Excel Export**: Uses `exceljs` to generate a formatted `.xlsx` file including Titles, URLs, Found Metadata, and Scrape Status.
- **Live Counters**: Displays real-time stats on how many articles were scanned versus how many matched your criteria.

---

## 6. Limitations
- **JavaScript Content**: The scraper fetches the raw HTML. If an article's content is entirely gated behind a login or loaded via client-side JavaScript after the page loads, the content might be incomplete.
- **Rate Limits**: Excessive scraping (thousands of articles in minutes) may still result in a temporary IP block from the provider.

---

## 7. License

- **Documentation & Content**: Licensed under the [Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/).
- **Application & Source Code**: Licensed under the [MIT License](https://opensource.org/licenses/MIT).

