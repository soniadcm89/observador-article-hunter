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

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)**.

[![CC BY-NC 4.0](https://licensebuttons.net/l/by-nc/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc/4.0/)

### Summary of CC BY-NC 4.0 Terms:
- **Attribution**: You must give appropriate credit, provide a link to the license, and indicate if changes were made.
- **NonCommercial**: You may not use the material for commercial purposes.
- **Share & Adapt**: You are free to copy, redistribute, remix, transform, and build upon the material in any medium or format under these terms.

For the full legal code, see the [LICENSE](./LICENSE) file or visit [https://creativecommons.org/licenses/by-nc/4.0/](https://creativecommons.org/licenses/by-nc/4.0/).
