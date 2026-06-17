// Vercel Serverless Function — runs on the server, not the browser.
// This avoids CORS/browser security blocks that stop direct RSS fetches from working.
// 100% free on Vercel's free tier. No API key needed.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

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
  // Yahoo Finance RSS — free, no key, no rate limit issues for personal use
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketIntelApp/1.0)" },
  });

  if (!resp.ok) return [];

  const xml = await resp.text();
  return parseRssItems(xml, ticker).slice(0, 6);
}

function parseRssItems(xml, ticker) {
  const items = [];
  const itemBlocks = xml.split("<item>").slice(1);

  for (const block of itemBlocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const description = extractTag(block, "description");

    if (title && link) {
      items.push({
        ticker,
        headline: decodeEntities(title),
        sourceUrl: link.trim(),
        publishedAt: pubDate || "",
        summary: decodeEntities(stripHtml(description || "")).slice(0, 280),
        source: "Yahoo Finance",
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
