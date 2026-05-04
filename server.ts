import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";
import { format } from "date-fns";
import FirecrawlApp from "@mendable/firecrawl-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
const STOPWORDS = new Set(["de", "do", "da", "o", "a", "e", "em", "um", "uma", "com", "no", "na", "para", "por", "que", "se", "como"]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function expandKeyword(kw: string): string[] {
  const norm = normalize(kw.trim());
  if (!norm) return [];
  const variants = new Set<string>([norm]);
  if (norm.endsWith("o") || norm.endsWith("a")) variants.add(norm.slice(0, -1));
  if (norm.endsWith("os") || norm.endsWith("as")) variants.add(norm.slice(0, -2));
  if (norm.endsWith("idade") && norm.length > 7) variants.add(norm.slice(0, -5));
  if (norm.endsWith("idade") && norm.length > 7) variants.add(norm.slice(0, -4)); // e.g. sexualidade -> sexualid
  if (norm.endsWith(" sexual") || norm.startsWith("sexual ")) variants.add("sexo");
  if (norm === "sexualidade") variants.add("sexo");
  if (norm.endsWith("cao") && norm.length > 5) variants.add(norm.slice(0, -3));
  if (norm.endsWith("mento") && norm.length > 7) variants.add(norm.slice(0, -5));
  return Array.from(variants);
}

// Boolean Search Evaluator
type SearchNode = 
  | { type: "TERM", value: string, isPhrase: boolean }
  | { type: "AND", left: SearchNode, right: SearchNode }
  | { type: "OR", left: SearchNode, right: SearchNode }
  | { type: "NOT", operand: SearchNode };

function parseQuery(query: string): SearchNode | null {
  const q = query.trim();
  if (!q) return null;

  // 1. Check for phrase matching default: spaces but no operators
  if (q.includes(" ") && !q.includes("\"") && !/\b(AND|OR|NOT)\b/.test(q)) {
    return { type: "TERM", value: q, isPhrase: true };
  }

  // Simple recursive descent-ish parsing for AND/OR/NOT
  // For simplicity, we'll handle basic cases. For complex apps, use a parser generator.
  
  // Handle NOT
  if (q.startsWith("NOT ")) {
    const sub = parseQuery(q.slice(4));
    return sub ? { type: "NOT", operand: sub } : null;
  }

  // Handle OR (lowest precedence)
  const orMatch = q.split(/\bOR\b/);
  if (orMatch.length > 1) {
    // Cap OR clauses at 4
    const clauses = orMatch.slice(0, 4).map(parseQuery).filter((n): n is SearchNode => n !== null);
    return clauses.reduce((acc, curr) => ({ type: "OR", left: acc, right: curr }));
  }

  // Handle AND
  const andMatch = q.split(/\bAND\b/);
  if (andMatch.length > 1) {
    const clauses = andMatch.map(p => {
      let part = p.trim();
      // Strip stopwords inside AND clauses
      if (!part.startsWith("\"")) {
        part = part.split(/\s+/).filter(w => !STOPWORDS.has(w.toLowerCase())).join(" ");
      }
      return parseQuery(part);
    }).filter((n): n is SearchNode => n !== null);
    if (!clauses.length) return null;
    return clauses.reduce((acc, curr) => ({ type: "AND", left: acc, right: curr }));
  }

  // Handle Quoted Phrases or single terms
  if (q.startsWith("\"") && q.endsWith("\"")) {
    return { type: "TERM", value: q.slice(1, -1), isPhrase: true };
  }

  return { type: "TERM", value: q, isPhrase: q.includes(" ") };
}

function evaluate(node: SearchNode, text: string): boolean {
  const hay = normalize(text);
  switch (node.type) {
    case "TERM":
      const variants = node.isPhrase ? [normalize(node.value)] : expandKeyword(node.value);
      return variants.some(v => hay.includes(v));
    case "AND":
      return evaluate(node.left, text) && evaluate(node.right, text);
    case "OR":
      return evaluate(node.left, text) || evaluate(node.right, text);
    case "NOT":
      return !evaluate(node.operand, text);
  }
}

// Extract search terms for DDG (discovery)
function extractDdgTerms(node: SearchNode): string[] {
  switch (node.type) {
    case "TERM": return [node.isPhrase ? `"${node.value}"` : node.value];
    case "AND": return [...extractDdgTerms(node.left), ...extractDdgTerms(node.right)];
    case "OR": return [...extractDdgTerms(node.left), ...extractDdgTerms(node.right)];
    case "NOT": return []; // Ignore NOT for discovery phase
  }
}

function parseDateOnly(dateStr: string): Date | null {
  if (!dateStr) return null;
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  }
  return null;
}

function dateFromUrl(url: string): string {
  const m = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`;
}

function inDateRange(iso: string, start?: string, end?: string): boolean {
  if (!start && !end) return true;
  if (!iso) return false;
  const articleDate = parseDateOnly(iso);
  if (!articleDate) return false;
  const t = articleDate.getTime();
  const startDate = start ? parseDateOnly(start) : null;
  const endDate = end ? parseDateOnly(end) : null;
  if (startDate && t < startDate.getTime()) return false;
  if (endDate && t > endDate.getTime()) return false;
  return true;
}

function monthsBetween(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cur.getTime() <= stop.getTime()) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
    out.push(`${y}-${m}`);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

async function fetchText(url: string, extraHeaders?: Record<string, string>, retries = 2): Promise<string> {
  try {
    const res = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "max-age=0",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        ...(extraHeaders || {}),
      },
      timeout: 30000,
    });
    return res.data;
  } catch (err) {
    if (retries > 0) {
      console.log(`[Fetch] Retrying ${url} (${retries} left)`);
      await new Promise(r => setTimeout(r, 3000));
      return fetchText(url, extraHeaders, retries - 1);
    }
    throw err;
  }
}

async function fetchSitemapIndex(): Promise<string[]> {
  try {
    const xml = await fetchText("https://observador.pt/wp-sitemap.xml");
    const matches = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
    console.log(`[Sitemap] Index found ${matches.length} entries`);
    return matches;
  } catch (err) {
    console.error("[Sitemap] Failed to fetch index", err);
    return [];
  }
}

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  try {
    const xml = await fetchText(sitemapUrl);
    const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g))
      .map((m) => m[1])
      .filter((u) => u.includes("observador.pt") && /\/\d{4}\/\d{2}\/\d{2}\//.test(u));
    console.log(`[Sitemap] ${sitemapUrl} yielded ${urls.length} articles`);
    return urls;
  } catch (err) {
    console.error(`[Sitemap] Failed to fetch sub-sitemap ${sitemapUrl}`, err);
    return [];
  }
}

function slugTextFromUrl(url: string): string {
  // Observador: https://observador.pt/2024/05/22/titulo-do-artigo/
  const m = url.match(/\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\/?/);
  if (!m) return url;
  return m[1].replace(/-/g, " ");
}

function decodeDdgUrl(href: string): string | null {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return null;
    }
  }
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return "https:" + href;
  return null;
}

async function ddgSearch(keyword: string, maxPages = 3, startDate?: string, endDate?: string): Promise<string[]> {
  const found = new Set<string>();
  
  // Build query with date filters if possible
  let dateFilter = "";
  if (startDate && endDate) {
    // DDG doesn't always support before/after perfectly in HTML, but we can try
    // We'll also just add the year/month to help the engine
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (start && end) {
      if (start.getFullYear() === end.getFullYear()) {
        dateFilter = ` ${start.getFullYear()}`;
      }
    }
  }

  for (let page = 0; page < maxPages; page++) {
    const offset = page * 30;
    const q = encodeURIComponent(`site:observador.pt "${keyword}"${dateFilter}`);
    const url =
      page === 0
        ? `https://html.duckduckgo.com/html/?q=${q}`
        : `https://html.duckduckgo.com/html/?q=${q}&s=${offset}&dc=${offset + 1}`;
    try {
      const html = await fetchText(url, { Referer: "https://html.duckduckgo.com/" });
      const before = found.size;
      const hrefs = Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
      for (const h of hrefs) {
        const decoded = decodeDdgUrl(h);
        if (decoded && /^https?:\/\/(www\.)?observador\.pt\//.test(decoded) && /\/\d{4}\/\d{2}\/\d{2}\//.test(decoded)) {
          found.add(decoded.split("#")[0].split("?")[0]);
        }
      }
      if (found.size === before) break;
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error("DDG fetch failed", err);
      break;
    }
  }
  return Array.from(found);
}

async function internalSearch(keyword: string): Promise<string[]> {
  const found = new Set<string>();
  try {
    // Observador search: https://observador.pt/?s=keyword
    const url = `https://observador.pt/?s=${encodeURIComponent(keyword)}`;
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    
    // Most Observador articles in search results are in <h2> or <a> tags within a list
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && /^https?:\/\/(www\.)?observador\.pt\//.test(href) && /\/\d{4}\/\d{2}\/\d{2}\//.test(href)) {
        found.add(href.split('#')[0].split('?')[0]);
      }
    });
  } catch (err) {
    console.error("[InternalSearch] Failed", err);
  }
  return Array.from(found);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

    app.post("/api/search", async (req, res) => {
    try {
      const { query, startDate, endDate, maxScrapes = 100 } = req.body;
      if (!query || !query.trim()) {
        return res.status(400).json({ error: "Query required" });
      }

      const rootNode = parseQuery(query);
      if (!rootNode) return res.status(400).json({ error: "Invalid query" });

      const ddgTerms = Array.from(new Set(extractDdgTerms(rootNode)));
      console.log(`[Scraper] Query: "${query}" | DDG Terms: ${ddgTerms.join(", ")}`);

      // 1. DuckDuckGo & Internal Search discovery
      const [ddgResults, internalResults] = await Promise.all([
        Promise.all(ddgTerms.slice(0, 10).map((k: string) => ddgSearch(k, 8, startDate, endDate).catch(() => []))),
        Promise.all(ddgTerms.slice(0, 5).map((k: string) => internalSearch(k).catch(() => [])))
      ]);
      const discoveredUrls = Array.from(new Set([...ddgResults.flat(), ...internalResults.flat()])) as string[];
      const discoveryInRange = discoveredUrls.filter((u) => inDateRange(dateFromUrl(u), startDate, endDate));
      console.log(`[Discovery] DDG+Internal found ${discoveredUrls.length} total, ${discoveryInRange.length} articles in range`);

      // 2. Sitemap discovery
      const end = endDate ? parseDateOnly(endDate) || new Date() : new Date();
      const start = startDate ? parseDateOnly(startDate) || new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 3, 1)) : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 6, 1));
      
      let inRangeUrls: string[] = [];
      let slugMatches: string[] = [];

      try {
        const allSitemaps = await fetchSitemapIndex();
        const targetSitemaps = allSitemaps.filter((u) => 
          u.includes("post-sitemap") || 
          u.includes("artigos-sitemap") || 
          u.includes("sitemap-pt-post") ||
          u.includes("wp-sitemap-posts-post")
        );
        
        console.log(`[Discovery] Full index has ${allSitemaps.length} sitemaps, targeting ${targetSitemaps.length}`);
        
        // If the date range includes very old articles (e.g. 2014), we need a much deeper scan.
        // Observador started in May 2014.
        const startDateObj = startDate ? parseDateOnly(startDate) : null;
        const isDeep = startDateObj && startDateObj.getFullYear() < 2022;
        const isAncient = startDateObj && startDateObj.getFullYear() < 2017;
        
        // Use more sitemaps for deep searches. 
        // We'll scan from the end (latest) but go deeper if requested.
        let scanDepth = 150;
        if (isDeep) scanDepth = 600;
        if (isAncient) scanDepth = targetSitemaps.length;

        const recentSitemaps = targetSitemaps.slice(-scanDepth); 
        
        console.log(`[Discovery] Scanning ${recentSitemaps.length} sitemaps (Deep: ${isDeep}, Ancient: ${isAncient})`);
        
        // Process in chunks to avoid overwhelming memory
        const chunkSize = 20;
        const sitemapResults: string[][] = [];
        for (let i = 0; i < recentSitemaps.length; i += chunkSize) {
          const chunk = recentSitemaps.slice(i, i + chunkSize);
          const chunkUrls = await Promise.all(chunk.map(fetchSitemapUrls));
          sitemapResults.push(...chunkUrls);
        }
        
        const allUrls = Array.from(new Set(sitemapResults.flat())) as string[];
        inRangeUrls = allUrls.filter((u) => inDateRange(dateFromUrl(u), startDate, endDate));
        slugMatches = inRangeUrls.filter((u) => evaluate(rootNode, slugTextFromUrl(u)));
        
        // If we have few matches but many articles in range, expand the candidate pool
        // to check bodies even if the slug doesn't match perfectly.
        // We scan up to maxScrapes candidates.
        if (slugMatches.length < maxScrapes && inRangeUrls.length > 0) {
          const needed = maxScrapes - slugMatches.length;
          // Take a more dense spread of articles from the range
          const otherCandidates: string[] = [];
          if (inRangeUrls.length > needed) {
            // We'll take up to 100 extra candidates for body checking if results are sparse
            const extraCount = Math.min(inRangeUrls.length, 100);
            const step = Math.max(1, Math.floor(inRangeUrls.length / extraCount));
            for (let i = 0; i < inRangeUrls.length && otherCandidates.length < extraCount; i += step) {
              otherCandidates.push(inRangeUrls[i]);
            }
          } else {
            otherCandidates.push(...inRangeUrls);
          }
          slugMatches = Array.from(new Set([...slugMatches, ...otherCandidates]));
        }
        
        console.log(`[Discovery] Sitemap found ${allUrls.length} total URLs, ${inRangeUrls.length} in range, ${slugMatches.length} candidates after deep-scan expansion`);
      } catch (err) {
        console.error("Sitemap discovery failed", err);
      }

      // Merge candidates
      const candidates = Array.from(new Set([...discoveryInRange, ...slugMatches])).slice(0, maxScrapes) as string[];
      console.log(`[Scraper] Found ${candidates.length} candidates on Observador. Starting scrape...`);

      const articles: any[] = [];
      const concurrency = 5;
      let cursor = 0;

      async function worker() {
        while (cursor < candidates.length) {
          const url = candidates[cursor++];
          try {
            // Add a small randomized delay between requests
            const delay = 500 + Math.random() * 1000;
            await new Promise(r => setTimeout(r, delay));
            
            const html = await fetchText(url, { Referer: "https://observador.pt/" });
            const $ = cheerio.load(html);
            
            const title = ($('h1').first().text() || $('meta[property="og:title"]').attr('content') || $('title').text() || "").trim();
            const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || "";
            
            // 1. Tags and Topics
            const tags: string[] = [];
            $('meta[property="article:tag"]').each((_, el) => { tags.push($(el).attr('content') || ""); });
            $('.article-tags a, .article-topics a, .tags a, .topics a').each((_, el) => { tags.push($(el).text().trim()); });
            const section = $('meta[property="article:section"]').attr('content') || "";
            const tagsText = [...new Set(tags)].join(" ");

            // 2. Body Text
            const bodySelectors = ['.article-body', '.article-content', 'article', '.entry-content', '.article-entry', '.main-content', 'main', '.post-content', '.obs-article-body', '.article-body-content', '.content-body'];
            let bodyText = bodySelectors.map(sel => $(sel).text()).join(" ");
            
            // Try JSON-LD fallback
            $('script[type="application/ld+json"]').each((_, el) => {
              try {
                const inner = $(el).html();
                if (inner) {
                  const data = JSON.parse(inner);
                  const bodies = Array.isArray(data) ? data : [data];
                  for (const d of bodies) {
                    if (d.articleBody) bodyText += " " + d.articleBody;
                    if (d.description) bodyText += " " + d.description;
                    if (d.keywords) bodyText += " " + d.keywords;
                  }
                }
              } catch {}
            });

            // Even simpler fallback: paragraphs
            if (bodyText.length < 300) {
              bodyText += " " + $('p').map((_, el) => $(el).text()).get().join(" ");
            }

            // 3. Unified searchable text including URL and Tags
            const urlText = url.replace(/-/g, " ");
            const combinedText = `${title} ${description} ${tagsText} ${section} ${urlText} ${bodyText}`;
            
            console.log(`[Scraper] Checking ${url} (Length: ${combinedText.length})`);
            if (evaluate(rootNode!, combinedText)) {
              console.log(`[Scraper] Match found: ${title.substring(0, 30)}...`);
              articles.push({
                url,
                title: title.trim(),
                date: dateFromUrl(url),
                matched: true,
                source: "Observador"
              });
            }
          } catch (e) {
            console.error(`Failed to scrape ${url}`, e);
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }, worker));
      articles.sort((a, b) => b.date.localeCompare(a.date));

      res.json({ 
        articles,
        stats: {
          candidates: candidates.length,
          matched: articles.length
        }
      });
    } catch (error: any) {
      console.error("[Scraper] Error:", error.message);
      res.status(500).json({ error: "Scraping failed." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
