import express from "express";
import Parser from "rss-parser";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const parser = new Parser({
  timeout: 9000,
  headers: {
    "User-Agent": "NothingNews/0.1 (+personal reader)"
  }
});

const PORT = Number(process.env.PORT || 8787);
const REFRESH_MS = Number(process.env.NEWS_REFRESH_MS || 5 * 60 * 1000);
const MAX_ITEMS = 120;

let cache = {
  updatedAt: null,
  items: [],
  sources: [],
  errors: []
};

function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function classify(text, fallback = "Мир") {
  const value = text.toLowerCase();
  const rules = [
    ["Технологии", ["ии", "ai", "openai", "apple", "google", "microsoft", "технолог", "смартфон", "нейросет", "робот", "чип", "software", "startup"]],
    ["Бизнес", ["банк", "рынок", "акци", "эконом", "бизнес", "нефт", "рубл", "доллар", "инфляц", "company", "market", "econom"]],
    ["Наука", ["наука", "исследован", "космос", "nasa", "spacex", "учен", "science", "research"]],
    ["Культура", ["кино", "музык", "культур", "фильм", "сериал", "игр", "music", "film", "game"]],
    ["Здоровье", ["здоров", "медицин", "врач", "болезн", "health", "medicine"]],
    ["Спорт", ["спорт", "футбол", "хоккей", "теннис", "formula", "football", "sport"]]
  ];
  const found = rules.find(([, words]) => words.some(word => value.includes(word)));
  return found ? found[0] : fallback;
}

function pickImage(item) {
  const enclosure = item.enclosure?.url;
  const media = item["media:content"]?.url || item["media:thumbnail"]?.url;
  return enclosure || media || null;
}

function normalizeKey(title) {
  return title.toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .replace(/\b(новости|news|сегодня|today)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 110);
}

async function loadSources() {
  const raw = await fs.readFile(path.join(__dirname, "config", "sources.json"), "utf8");
  return JSON.parse(raw);
}

async function fetchFeed(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = (feed.items || []).slice(0, 35).map((item, index) => {
      const title = cleanText(item.title || "Без заголовка");
      const summary = cleanText(item.contentSnippet || item.content || item.summary || item.description || "");
      const publishedAt = item.isoDate || item.pubDate || new Date(Date.now() - index * 60_000).toISOString();
      return {
        id: Buffer.from((item.guid || item.link || title) + source.name).toString("base64url").slice(0, 24),
        title,
        summary: summary.slice(0, 420),
        source: source.name,
        url: item.link || source.url,
        publishedAt,
        category: classify(title + " " + summary, source.category || "Мир"),
        image: pickImage(item)
      };
    });
    return { source: source.name, items, error: null };
  } catch (error) {
    return { source: source.name, items: [], error: error?.message || "feed error" };
  }
}

async function refreshNews() {
  const sources = await loadSources();
  const results = await Promise.all(sources.map(fetchFeed));
  const deduped = new Map();

  for (const result of results) {
    for (const item of result.items) {
      const key = normalizeKey(item.title);
      if (!key) continue;
      const existing = deduped.get(key);
      if (!existing || new Date(item.publishedAt) > new Date(existing.publishedAt)) {
        deduped.set(key, item);
      }
    }
  }

  const items = [...deduped.values()]
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX_ITEMS);

  cache = {
    updatedAt: new Date().toISOString(),
    items,
    sources: sources.map(s => s.name),
    errors: results.filter(r => r.error).map(r => ({ source: r.source, error: r.error }))
  };

  console.log("[nothing-news] refreshed", items.length, "stories", cache.errors.length, "source errors");
  return cache;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"],
  maxAge: process.env.NODE_ENV === "production" ? "5m" : 0
}));

app.get("/api/news", async (req, res) => {
  const category = cleanText(req.query.category || "");
  const query = cleanText(req.query.q || "").toLowerCase();
  const limit = Math.min(60, Math.max(1, Number(req.query.limit || 30)));

  if (!cache.updatedAt || Date.now() - new Date(cache.updatedAt).getTime() > REFRESH_MS * 2) {
    try { await refreshNews(); } catch (_) {}
  }

  let items = cache.items;
  if (category && category !== "Все") items = items.filter(item => item.category === category);
  if (query) items = items.filter(item => (item.title + " " + item.summary + " " + item.source).toLowerCase().includes(query));

  res.json({
    updatedAt: cache.updatedAt,
    items: items.slice(0, limit),
    total: items.length,
    sources: cache.sources,
    errors: cache.errors
  });
});

app.post("/api/refresh", async (_req, res) => {
  try {
    const data = await refreshNews();
    res.json({ ok: true, updatedAt: data.updatedAt, count: data.items.length, errors: data.errors });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "refresh failed" });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, updatedAt: cache.updatedAt, count: cache.items.length });
});

app.listen(PORT, async () => {
  console.log("[nothing-news] http://localhost:" + PORT);
  try { await refreshNews(); } catch (error) { console.error("[nothing-news] initial refresh failed", error); }
  setInterval(() => refreshNews().catch(error => console.error("[nothing-news] refresh failed", error)), REFRESH_MS).unref();
});
