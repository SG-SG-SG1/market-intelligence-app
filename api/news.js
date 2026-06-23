// Vercel Serverless Function — runs on the server, not the browser.
// This avoids CORS/browser security blocks that stop direct RSS fetches from working.
// 100% free on Vercel's free tier. No API key needed.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Prevent Vercel's edge network AND the browser from caching this response.
  // Without this, requests can silently return a stale cached result instead
  // of fetching fresh news from Yahoo Finance every time.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const { tickers } = req.query;
  if (!tickers) {
    return res.status(400).json({ error: "Missing tickers query param" });
  }

  const tickerList = tickers.split(",").map(t => t.trim()).filter(Boolean);

  try {
    const results = await Promise.allSettled(
      tickerList.map(ticker => fetchTickerNews(ticker))
    );

    const allItems = results
      .filter(r => r.status === "fulfilled")
      .flatMap(r => r.value);

    res.status(200).json({ items: allItems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function fetchTickerNews(ticker) {
  const [yahooItems, googleItems] = await Promise.allSettled([
    fetchYahooFinance(ticker),
    fetchGoogleNews(ticker),
  ]);

  const items = [
    ...(yahooItems.status === "fulfilled" ? yahooItems.value : []),
    ...(googleItems.status === "fulfilled" ? googleItems.value : []),
  ];

  // Deduplicate by similar headline text across the two sources
  const seen = new Set();
  const deduped = items.filter(item => {
    const key = item.headline.slice(0, 50).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.slice(0, 8);
}

async function fetchYahooFinance(ticker) {
  // Yahoo Finance RSS — free, no key. Add a cache-busting param so we don't
  // get an identical cached response from any intermediate cache.
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US&_=${Date.now()}`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketIntelApp/1.0)" },
    cache: "no-store",
  });

  if (!resp.ok) return [];
  const xml = await resp.text();
  return parseRssItems(xml, ticker);
}

async function fetchGoogleNews(ticker) {
  // Google News RSS search — free, no key, updates much more frequently
  // than Yahoo's feed, which gives genuinely fresh results on each refresh.
  const query = encodeURIComponent(`${ticker} stock`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en&_=${Date.now()}`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketIntelApp/1.0)" },
    cache: "no-store",
  });

  if (!resp.ok) return [];
  const xml = await resp.text();
  return parseRssItems(xml, ticker, "Google News");
}

function parseRssItems(xml, ticker, sourceOverride) {
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
        ticker,
        headline: decodeEntities(title),
        sourceUrl: link.trim(),
        publishedAt: pubDate || "",
        summary: stripHtml(description || "").slice(0, 160),
        source: sourceOverride || sourceTag || "Yahoo Finance",
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
  // Decode entities FIRST so escaped tags like &lt;a href=...&gt; become
  // real tags, then strip them. Wrong order lets escaped link markup
  // leak through as visible text in summaries.
  const decoded = decodeEntities(str);
  return decoded.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
