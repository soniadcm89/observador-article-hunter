# Observador Scraper & Analyzer

A research tool designed to search, analyze, filter, and export articles from the Portuguese news outlet **Observador** (`observador.pt`).

---

## Features

- **Boolean Query Operator Support**: Enter search terms using `AND`, `OR`, `NOT`, and exact phrases in double quotes (`"..."`).
- **Flexible Date Filtering**: Select predefined date ranges, use the interactive calendar picker with month/year navigation, or type dates manually (`YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`).
- **Multi-Engine Article Discovery**: Combines DuckDuckGo web search, Observador's native site search, and automatic parsing of official Observador XML Sitemaps (`/sitemap-pt-index.xml`).
- **Deep Scraper & Content Evaluator**: Extracts article body text, headlines, topics, article tags, categories, and structured JSON-LD metadata.
- **Bot Evasion & Anti-Block Protections**: Employs browser header spoofing, randomized request delays (jitter), and automatic retry backoff.
- **Excel (.xlsx) Export**: Export search results with titles, URLs, publication dates, match status, and extracted tags.

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Radix UI / shadcn/ui components, ExcelJS.
- **Backend**: Node.js, Express, Cheerio, Axios, Firecrawl SDK.

---

## License

This project uses a dual licensing model:

- **Source Code & Application**: Licensed under the [MIT License](./LICENSE). You are free to use, modify, distribute, and commercialize the software codebase.
- **Documentation & Content**: Licensed under the [Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/). Documentation files (e.g., `DOCUMENTATION.md`, `README.md`, `CHAT_HISTORY.md`, `CHAT_CONVERSATION.md`) are free to share and adapt for non-commercial purposes with appropriate attribution.

For full license terms, see the [LICENSE](./LICENSE) file.

- **To cite** Dalla Costa Montanari, S. (2026). observador-article-hunter. GitHub repository. [https://github.com/soniadcm89/rr-article-hunter](https://github.com/soniadcm89/observador-article-hunter)
