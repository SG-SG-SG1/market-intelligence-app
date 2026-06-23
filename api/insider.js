// Vercel Serverless Function — fetches real insider trading data (Form 4 filings)
// from SEC EDGAR's free, public, no-key APIs.
//
// Pipeline:
//   1. Resolve ticker -> CIK using SEC's free company_tickers.json
//   2. Pull that company's recent Form 4 filings from data.sec.gov submissions API
//   3. Fetch each filing's actual XML document and parse the real transaction
//      details (insider name, title, shares, price, buy/sell direction)
//
// SEC requires a descriptive User-Agent with contact info on every request —
// this is their stated policy, not optional. No API key needed.

const SEC_HEADERS = {
  "User-Agent": "MarketIntelApp/1.0 (free open-source portfolio news app; contact: app-support@example.com)",
  "Accept-Encoding": "gzip, deflate",
};

let tickerCikCache = null; // in-memory cache for the lifetime of this function instance

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const { tickers } = req.query;
  if (!tickers) {
    return res.status(400).json({ error: "Missing tickers query param" });
  }
  const tickerList = tickers.split(",").map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 8); // cap tickers per request

  try {
    const cikMap = await getCikMap();
    // Process tickers sequentially with a small delay between each to stay
    // well under SEC's 10 req/sec limit (each ticker can issue several
    // requests internally: submissions + up to 3 filing lookups).
    const allTransactions = [];
    for (const ticker of tickerList) {
      try {
        const trades = await fetchInsiderTrades(ticker, cikMap[ticker]);
        allTransactions.push(...trades);
      } catch {
        // skip this ticker on failure, continue with others
      }
      await sleep(120);
    }

    res.status(200).json({ transactions: allTransactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Resolve tickers to CIK numbers using SEC's free public mapping file ──────
async function getCikMap() {
  if (tickerCikCache) return tickerCikCache;
  const resp = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: SEC_HEADERS });
  if (!resp.ok) throw new Error("Could not load SEC ticker directory");
  const data = await resp.json();
  const map = {};
  Object.values(data).forEach(entry => {
    map[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, "0");
  });
  tickerCikCache = map;
  return map;
}

// ─── Fetch a company's recent Form 4 filings and parse the real transactions ──
async function fetchInsiderTrades(ticker, cik) {
  if (!cik) return [];

  // Step 1: get this company's recent filings list
  const subResp = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: SEC_HEADERS });
  if (!subResp.ok) return [];
  const subData = await subResp.json();

  const recent = subData.filings?.recent;
  if (!recent) return [];

  // Find indices of Form 4 filings, most recent first, capped at 3 to stay
  // within Vercel's free-tier execution time limit (each filing requires
  // 2 sequential SEC requests: index.json discovery + XML fetch).
  const form4Indices = [];
  for (let i = 0; i < recent.form.length && form4Indices.length < 3; i++) {
    if (recent.form[i] === "4") form4Indices.push(i);
  }
  if (!form4Indices.length) return [];

  // Step 2: fetch + parse each Form 4's actual XML for real transaction data
  const transactions = await Promise.allSettled(
    form4Indices.map(i => parseForm4(cik, recent.accessionNumber[i], recent.primaryDocument[i], ticker))
  );

  return transactions.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
}

async function parseForm4(cik, accessionNumber, primaryDocument, ticker) {
  const accessionNoDashes = accessionNumber.replace(/-/g, "");
  const cikNum = String(Number(cik)); // strip leading zeros for the Archives path

  // primaryDocument from the submissions API is usually the HTML rendering of
  // the Form 4, NOT the raw XML — the actual XML file has a filing-agent-
  // specific name (form4.xml, wf-form4_xxx.xml, etc). We discover the real
  // file by reading the filing's index.json rather than guessing.
  let xmlFilename = null;
  try {
    const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionNoDashes}/index.json`;
    const indexResp = await fetch(indexUrl, { headers: SEC_HEADERS });
    if (indexResp.ok) {
      const indexData = await indexResp.json();
      const files = indexData?.directory?.item || [];
      // Look for an .xml file that is NOT inside the xslF345X05 rendered-view subfolder
      const xmlFile = files.find(f => f.name?.toLowerCase().endsWith(".xml") && !f.name.includes("/"));
      xmlFilename = xmlFile?.name || null;
    }
  } catch {
    // fall through; we'll bail below if we still have nothing
  }

  if (!xmlFilename) return null;

  const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionNoDashes}/${xmlFilename}`;

  let xml;
  try {
    const resp = await fetch(xmlUrl, { headers: SEC_HEADERS });
    if (!resp.ok) return null;
    xml = await resp.text();
  } catch {
    return null;
  }

  if (!xml.includes("<ownershipDocument") && !xml.includes("<nonDerivativeTable")) {
    return null;
  }

  const ownerName = extractTag(xml, "rptOwnerName");
  const isOfficer = extractTag(xml, "isOfficer") === "1" || extractTag(xml, "isOfficer") === "true";
  const isDirector = extractTag(xml, "isDirector") === "1" || extractTag(xml, "isDirector") === "true";
  const officerTitle = extractTag(xml, "officerTitle");

  let title = officerTitle || (isDirector ? "Director" : isOfficer ? "Officer" : "Insider");

  // Pull the first non-derivative transaction (the actual open-market buy/sell)
  const txBlock = extractBlock(xml, "nonDerivativeTransaction");
  if (!txBlock) return null;

  const shares = extractTag(txBlock, "value", "transactionShares");
  const price = extractTag(txBlock, "value", "transactionPricePerShare");
  const code = extractTag(txBlock, "value", "transactionCode") || extractTag(txBlock, "transactionCode");
  const acqDisp = extractTag(txBlock, "value", "transactionAcquiredDisposedCode") || extractTag(txBlock, "transactionAcquiredDisposedCode");
  const txDate = extractTag(txBlock, "value", "transactionDate") || extractTag(txBlock, "transactionDate");

  if (!shares) return null;

  const sharesNum = parseFloat(shares);
  const priceNum = parseFloat(price) || 0;
  const totalValue = sharesNum * priceNum;
  const direction = acqDisp === "A" ? "Buy" : acqDisp === "D" ? "Sell" : "Unknown";

  return {
    ticker,
    insiderName: ownerName || "Unknown insider",
    title,
    direction,
    transactionCode: code,
    shares: Math.round(sharesNum).toLocaleString(),
    pricePerShare: priceNum ? `$${priceNum.toFixed(2)}` : null,
    totalValue: totalValue ? `$${Math.round(totalValue).toLocaleString()}` : null,
    transactionDate: txDate,
    filingUrl: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionNoDashes}/${primaryDocument}`,
  };
}

// ─── Minimal XML tag extraction (no external deps, works on Vercel free tier) ─
function extractTag(xml, tag, innerTag) {
  if (innerTag) {
    // e.g. <transactionShares><value>1000</value></transactionShares>
    const outerMatch = xml.match(new RegExp(`<${innerTag}>([\\s\\S]*?)<\\/${innerTag}>`));
    if (!outerMatch) return "";
    const innerMatch = outerMatch[1].match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    return innerMatch ? innerMatch[1].trim() : "";
  }
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : "";
}

function extractBlock(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1] : null;
}
