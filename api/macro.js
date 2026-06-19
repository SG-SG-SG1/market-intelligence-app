// Vercel Serverless Function — fetches recent macro/economic event news
// (Fed rate decisions, CPI, jobs reports, tariffs) from free Google News RSS.
// Runs server-side to avoid CORS issues. No API key needed.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const QUERIES = [
    { type: "FED_RATE", q: "Federal Reserve interest rate decision" },
    { type: "CPI", q: "CPI inflation report US" },
    { type: "JOBS", q: "US jobs report unemployment" },
    { type: "TARIFF", q: "tariff trade policy United States" },
  ];

  try {
    const results = await Promise.allSettled(
      QUERIES.map(({ type, q }) => fetchMacroQuery(type, q))
    );

    const events = results
      .filter(r => r.status === "fulfilled")
      .flatMap(r => r.value);

    res.status(200).json({ events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function fetchMacroQuery(type, query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en&_=${Date.now()}`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketIntelApp/1.0)" },
  });

  if (!resp.ok) return [];

  const xml = await resp.text();
  const items = parseRssItems(xml).slice(0, 2);

  return items.map(item => ({
    type,
    headline: item.headline,
    source: item.source,
    sourceUrl: item.sourceUrl,
    publishedAt: item.publishedAt,
    summary: item.summary,
    direction: inferDirection(type, item.headline + " " + item.summary),
  }));
}

function inferDirection(type, text) {
  const t = text.toLowerCase();
  if (type === "FED_RATE") {
    if (/cut|lower|ease/.test(t)) return "cut";
    if (/hike|raise|increase/.test(t)) return "hike";
    return "hold";
  }
  if (type === "CPI") {
    if (/cool|eases|slow|below expect/.test(t)) return "cooling";
    if (/hot|accelerat|above expect|surge/.test(t)) return "hot";
    return "inline";
  }
  if (type === "JOBS") {
    if (/strong|beat|exceed|robust/.test(t)) return "strong";
    if (/weak|miss|below|disappoint/.test(t)) return "weak";
    return "inline";
  }
  if (type === "TARIFF") {
    if (/new tariff|escalat|impose|raise tariff/.test(t)) return "escalation";
    return "easing";
  }
  return "neutral";
}

function parseRssItems(xml) {
  const items = [];
  const itemBlocks = xml.split("<item>").slice(1);

  for (const block of itemBlocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const description = extractTag(block, "description");
    const sourceTag = extractTag(block, "source");

    if (title && link) {
      items.push({
        headline: decodeEntities(title),
        sourceUrl: link.trim(),
        publishedAt: pubDate || "",
        summary: decodeEntities(stripHtml(description || "")).slice(0, 220),
        source: sourceTag || "Google News",
      });
    }
  }
  return items;
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  if (!match) return "";
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1").trim();
}

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
