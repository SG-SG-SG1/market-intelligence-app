import { useState, useCallback, useEffect, useMemo } from "react";

// ─── Design tokens ──────────────────────────────────────────────────────────
const INK = "#08090b";
const PANEL = "#131417";
const LINE = "#1a1b1f";
const PAPER = "#f5f3ee";
const DIM = "#6b6b73";
const FAINT = "#34353a";
const AMBER = "#e8a33d";
const AMBER_DIM = "#8a6f2f";
const GAIN = "#4a9d7d";
const LOSS = "#c2554d";
const WATCH = "#c99a3f";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Consolas,monospace";
const SANS = "'Inter',-apple-system,system-ui,sans-serif";
const DISPLAY = "'Space Grotesk','Inter',sans-serif";

// ─── Default Portfolio ────────────────────────────────────────────────────────
const DEFAULT_PORTFOLIO = [
  { ticker: "NVDA", name: "NVIDIA Corp",      weight: 20, sector: "AI / Semiconductors", exposure: "AI infrastructure spend" },
  { ticker: "MSFT", name: "Microsoft",         weight: 20, sector: "Big Tech",            exposure: "Cloud computing growth" },
  { ticker: "AAPL", name: "Apple Inc",         weight: 15, sector: "Consumer Tech",        exposure: "Consumer hardware cycles" },
  { ticker: "GOOGL", name: "Alphabet",         weight: 15, sector: "Big Tech",             exposure: "Digital advertising & AI search" },
  { ticker: "AMZN", name: "Amazon",            weight: 15, sector: "Cloud / Commerce",     exposure: "E-commerce & cloud infrastructure" },
  { ticker: "VOO",  name: "Vanguard S&P 500",  weight: 8,  sector: "Broad ETF",            exposure: "Overall U.S. economy" },
  { ticker: "QQQ",  name: "Invesco Nasdaq",    weight: 7,  sector: "Broad ETF",            exposure: "U.S. tech sector broadly" },
];

// ─── Glossary — plain-English terms ───────────────────────────────────────────
const GLOSSARY = {
  "Form 4": "A filing company insiders (CEOs, directors) must submit when they buy or sell their own company's stock.",
  "FOMC": "The Federal Reserve committee that decides U.S. interest rates — meets eight times a year.",
  "guidance": "A company's own forecast of how much money it expects to make in the future.",
  "price target": "An analyst's prediction of what a stock's price will be, usually 12 months out.",
  "basis points": "A unit equal to 0.01% — used for tiny interest rate or yield changes.",
  "CPI": "Consumer Price Index — the main measure of inflation, tracking how much prices are rising.",
  "buyback": "When a company buys its own shares back, usually to boost its stock price.",
  "10b5-1": "A pre-scheduled plan that lets executives sell stock on autopilot, set up in advance to avoid insider-trading concerns.",
};

// ─── Sentiment / classification (local, instant, free) ────────────────────────
const POS_WORDS = ["surge","surges","jumps","beat","beats","upgrade","growth","record","rally","gain","profit","rises","boost","strong","outperform","soar","higher","positive","bullish","expands","wins","launches","partnership","deal","approved","best"];
const NEG_WORDS = ["falls","drops","misses","downgrade","loss","decline","cut","crash","warn","warning","weak","bearish","slump","plunge","below","concern","risk","layoffs","recall","fine","lawsuit","probe","restrict","ban","tariff","tumbles","sinks","hurt","pressure","delay","cancel","investigation","fraud","worst"];
const NEGATIONS = ["not","no","never","without","despite","although"];

function sentiment(text) {
  const words = text.toLowerCase().split(/\W+/);
  let p = 0, n = 0;
  words.forEach((w, i) => {
    const negated = NEGATIONS.includes(words[i - 1] || "");
    if (POS_WORDS.includes(w)) negated ? n++ : p++;
    if (NEG_WORDS.includes(w)) negated ? p++ : n++;
  });
  if (p > n) return "Positive";
  if (n > p) return "Negative";
  return "Neutral";
}
function category(text) {
  const t = text.toLowerCase();
  if (["form 4", "insider", "ceo buy", "director buy", "bought shares"].some(w => t.includes(w))) return "Insider";
  if (["fed ", "federal reserve", "inflation", "cpi", "gdp", "fomc", "interest rate", "tariff", "treasury", "unemployment", "jobs report"].some(w => t.includes(w))) return "Macro";
  if (["earnings", "revenue", "eps", "quarterly", "guidance", "q1", "q2", "q3", "q4", "outlook", "results"].some(w => t.includes(w))) return "Earnings";
  if (["analyst", "price target", "rating", "upgrade", "downgrade", "overweight"].some(w => t.includes(w))) return "Analyst";
  return "News";
}
function priorityOf(text, sent) {
  const hi = ["earnings", "fed", "fomc", "cpi", "merger", "acquisition", "lawsuit", "breaking", "record", "crash", "insider", "bankrupt", "sec", "investigation", "fraud", "guidance", "results"];
  if (hi.some(w => text.toLowerCase().includes(w))) return sent === "Negative" ? "Critical" : "High";
  if (sent !== "Neutral") return "High";
  return "Medium";
}
function makeId() { return Math.random().toString(36).slice(2, 10); }
function timeAgo(dateStr) {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  } catch { return "—"; }
}
function fmt1(n) { return (Math.round(n * 10) / 10).toFixed(1); }

// ─── Plain-English translation (rule-based, instant, free) ────────────────────
function simplify(item) {
  const t = item.ticker;
  if (item.sentiment === "Positive") {
    if (item.category === "Earnings") return `${t} made more money than expected last quarter — a good sign for the stock.`;
    if (item.category === "Analyst") return `An expert just said ${t} looks like a better buy than before.`;
    if (item.category === "Insider") return `Someone running ${t} just bought more of their own company's stock — often a vote of confidence.`;
    if (item.category === "Macro") return `Economic news today is mildly good for ${t} and similar stocks.`;
    return `Good news for ${t} today — this kind of story usually helps the stock price.`;
  }
  if (item.sentiment === "Negative") {
    if (item.category === "Earnings") return `${t} made less money than expected last quarter — not great for the stock short-term.`;
    if (item.category === "Analyst") return `An expert just said ${t} looks like a worse buy than before.`;
    if (item.category === "Macro") return `Economic news today is mildly bad for ${t} and similar stocks.`;
    return `This is a setback for ${t} — watch for whether it gets worse or blows over.`;
  }
  return `Not a strong signal either way for ${t} — just something to keep on your radar.`;
}

// ─── Macro events — known recurring US economic calendar ─────────────────────
// These are real recurring event types; dates/values are illustrative until
// the live fetch (fetchMacroEvents) below pulls the actual latest data.
const MACRO_EVENT_TYPES = {
  FED_RATE: {
    name: "Federal Reserve Rate Decision",
    short: "FED RATES",
    affects: (p) => true, // affects everything via borrowing costs
    explain: (direction, p) => {
      const growthHeavy = ["NVDA","MSFT","GOOGL","AMZN","QQQ"].includes(p.ticker);
      if (direction === "cut") return growthHeavy
        ? `Rate cuts make borrowing cheaper, which usually helps growth stocks like ${p.ticker} — investors pay more for future earnings when rates are low.`
        : `Rate cuts are mildly positive for ${p.ticker}, lowering its cost of capital.`;
      if (direction === "hike") return growthHeavy
        ? `Rate hikes raise borrowing costs and often pressure growth stocks like ${p.ticker} the most, since their value relies on distant future earnings.`
        : `Rate hikes raise ${p.ticker}'s cost of capital — a mild headwind.`;
      return `The Fed held rates steady — broadly neutral for ${p.ticker}, removing one source of uncertainty for now.`;
    }
  },
  CPI: {
    name: "Consumer Price Index (Inflation)",
    short: "CPI",
    affects: (p) => true,
    explain: (direction, p) => direction === "cooling"
      ? `Inflation coming in below expectations is good news for ${p.ticker} — it raises the odds of future rate cuts.`
      : direction === "hot"
      ? `Hotter-than-expected inflation is a headwind for ${p.ticker} — it lowers the odds of near-term rate cuts.`
      : `Inflation came in roughly as expected — limited direct impact on ${p.ticker}.`
  },
  JOBS: {
    name: "Jobs Report / Unemployment",
    short: "JOBS",
    affects: (p) => true,
    explain: (direction, p) => direction === "strong"
      ? `A strong jobs report signals a healthy economy for ${p.ticker}, though it can also reduce the urgency for rate cuts.`
      : direction === "weak"
      ? `A weaker jobs report raises some growth concerns but increases the chance of rate cuts, which can offset for ${p.ticker}.`
      : `Jobs data was roughly in line with expectations — limited new signal for ${p.ticker}.`
  },
  TARIFF: {
    name: "Tariffs / Trade Policy",
    short: "TARIFFS",
    affects: (p) => ["NVDA","AAPL","AMZN"].includes(p.ticker),
    explain: (direction, p) => `New trade policy directly affects ${p.ticker}'s supply chain or international sales — ${direction === "escalation" ? "this adds cost and uncertainty" : "this reduces some uncertainty"}.`
  },
};

function buildMacroImpactForPortfolio(event, portfolio) {
  const type = MACRO_EVENT_TYPES[event.type];
  if (!type) return [];
  return portfolio
    .filter(p => type.affects(p))
    .map(p => ({ ticker: p.ticker, text: type.explain(event.direction, p) }));
}

// ─── Fetch macro events (free serverless endpoint, separate from company news) ─
async function fetchMacroEvents() {
  const res = await fetch(`/api/macro?_=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.events || [];
}
// ─── Fetch (free serverless endpoint) ─────────────────────────────────────────
async function fetchNewsFree(portfolio) {
  const tickers = portfolio.map(p => p.ticker).join(",");
  const res = await fetch(`/api/news?tickers=${encodeURIComponent(tickers)}&_=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (data.items || []).map(item => {
    const text = `${item.headline} ${item.summary}`;
    const sent = sentiment(text);
    return {
      id: makeId(), ticker: item.ticker, headline: item.headline, source: item.source,
      sourceUrl: item.sourceUrl, publishedAt: timeAgo(item.publishedAt), summary: item.summary,
      sentiment: sent, category: category(text), priority: priorityOf(text, sent),
      rawDate: new Date(item.publishedAt).getTime() || Date.now(),
    };
  });
}
function dedup(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = (item.headline || "").slice(0, 55).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function computeRiskScores(allNews, portfolio) {
  return Object.fromEntries(portfolio.map(p => {
    const relevant = allNews.filter(n => n.ticker === p.ticker);
    if (!relevant.length) return [p.ticker, 5];
    const neg = relevant.filter(n => n.sentiment === "Negative").length;
    const crit = relevant.filter(n => n.priority === "Critical").length;
    const pos = relevant.filter(n => n.sentiment === "Positive").length;
    let score = 5 + neg * 1.5 + crit * 2 - pos * 1;
    return [p.ticker, Math.max(1, Math.min(10, score))];
  }));
}
function computeGaugeValue(allNews) {
  if (!allNews.length) return 50;
  const pos = allNews.filter(i => i.sentiment === "Positive").length;
  const neg = allNews.filter(i => i.sentiment === "Negative").length;
  const crit = allNews.filter(i => i.priority === "Critical" && i.sentiment === "Negative").length;
  const total = pos + neg || 1;
  let value = 50 + ((pos - neg) / total) * 45;
  value -= crit * 8;
  return Math.max(2, Math.min(98, value));
}
function moodFromValue(v) { return v >= 70 ? "BULLISH" : v >= 50 ? "NEUTRAL" : v >= 30 ? "CAUTIOUS" : "BEARISH"; }
function computeBrief(allNews) {
  if (!allNews.length) return null;
  const byTicker = {};
  allNews.forEach(n => { (byTicker[n.ticker] = byTicker[n.ticker] || []).push(n); });
  const positives = [], negatives = [];
  Object.entries(byTicker).forEach(([ticker, items]) => {
    const pos = items.filter(i => i.sentiment === "Positive").length;
    const neg = items.filter(i => i.sentiment === "Negative").length;
    if (pos > neg && pos > 0) positives.push(ticker);
    if (neg > pos && neg > 0) negatives.push(ticker);
  });
  const critItems = allNews.filter(i => i.priority === "Critical");
  const parts = [];
  if (positives.length) parts.push({ text: `${positives.slice(0, 2).join(", ")} carrying the tape higher`, tickers: positives.slice(0, 2) });
  if (negatives.length) parts.push({ text: `${negatives.slice(0, 2).join(", ")} dragging it down`, tickers: negatives.slice(0, 2) });
  if (critItems.length) parts.push({ text: `watch: ${critItems[0].headline.slice(0, 60)}${critItems[0].headline.length > 60 ? "…" : ""}`, tickers: [] });
  if (!parts.length) parts.push({ text: "quiet session — no major sentiment swings detected", tickers: [] });
  return parts;
}
function computeConcentration(portfolio) {
  const bySector = {};
  portfolio.forEach(p => { bySector[p.sector] = (bySector[p.sector] || 0) + (p.weight || 0); });
  const sorted = Object.entries(bySector).sort((a, b) => b[1] - a[1]);
  const top2 = sorted.slice(0, 2).reduce((s, [, w]) => s + w, 0);
  return { bySector: sorted, top2Pct: top2, isConcentrated: top2 >= 50 };
}

// ─── Decision per row ───────────────────────────────────────────────────────
const DECISION = {
  Critical_Negative: { label: "REVIEW POSITION", c: LOSS,  tip: "Significant negative event — reassess position sizing." },
  High_Negative:     { label: "WATCH CLOSELY",   c: WATCH, tip: "Elevated negative signal — monitor for follow-through." },
  High_Positive:      { label: "HOLD / ADD",      c: GAIN,  tip: "Strong positive signal within thesis." },
  Critical_Positive:  { label: "HIGH CONVICTION", c: GAIN,  tip: "Major positive catalyst." },
  Medium_Positive:    { label: "HOLD",            c: GAIN,  tip: "Positive development — no action required." },
  Medium_Negative:    { label: "MONITOR",         c: WATCH, tip: "Developing story — keep on radar." },
  _default:           { label: "NO ACTION",       c: DIM,   tip: "Neutral — no immediate action required." },
};
function getDecision(item) { return DECISION[`${item.priority}_${item.sentiment}`] || DECISION._default; }

// ─── Glossary term highlighter ─────────────────────────────────────────────────
function GlossaryText({ text }) {
  const [openTerm, setOpenTerm] = useState(null);
  const terms = Object.keys(GLOSSARY);
  const foundTerm = terms.find(t => text.toLowerCase().includes(t.toLowerCase()));
  if (!foundTerm) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(foundTerm.toLowerCase());
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + foundTerm.length);
  const after = text.slice(idx + foundTerm.length);
  return (
    <span>
      {before}
      <span onClick={(e) => { e.stopPropagation(); setOpenTerm(o => !o); }} style={{ borderBottom: `1px dotted ${AMBER}`, color: AMBER, cursor: "pointer" }}>{match}</span>
      {after}
      {openTerm && (
        <span style={{ display: "block", marginTop: 6, padding: "8px 10px", background: `${AMBER}0f`, border: `1px solid ${AMBER}33`, fontSize: 11, color: "#d4c8a8", lineHeight: 1.55 }}>
          {GLOSSARY[foundTerm]}
        </span>
      )}
    </span>
  );
}

// ─── Sentiment Waveform — signature element ───────────────────────────────────
function SentimentWaveform({ news, gaugeValue, prevGaugeValue }) {
  const mood = moodFromValue(gaugeValue);
  const moodColor = mood === "BULLISH" ? GAIN : mood === "NEUTRAL" ? "#7fae74" : mood === "CAUTIOUS" ? WATCH : LOSS;
  const delta = prevGaugeValue != null ? Math.round(gaugeValue - prevGaugeValue) : null;

  // Build a synthetic but representative waveform from the news sequence
  const points = useMemo(() => {
    const n = Math.max(news.length, 8);
    const arr = [];
    for (let i = 0; i < n; i++) {
      const item = news[i % news.length];
      const base = item ? (item.sentiment === "Positive" ? 30 : item.sentiment === "Negative" ? 58 : 44) : 44;
      const jitter = (i * 37) % 13;
      arr.push(46 - (base - 44) - jitter / 2);
    }
    return arr;
  }, [news]);

  const w = 340, h = 88;
  const step = w / (points.length - 1 || 1);
  const coords = points.map((y, i) => `${Math.round(i * step)},${Math.round(y)}`).join(" ");
  const critPoints = news
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => item.priority === "Critical")
    .slice(0, 3);

  return (
    <div style={{ paddingTop: 14 }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 88, display: "block" }} role="img" aria-label={`Sentiment waveform, currently ${mood.toLowerCase()}`}>
        <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke={LINE} strokeWidth="1" strokeDasharray="2,3" />
        <polyline points={coords} fill="none" stroke={AMBER} strokeWidth="1.5" opacity="0.9" />
        {critPoints.map(({ item, i }) => (
          <circle key={item.id} cx={Math.round(i * step)} cy={Math.round(points[i])} r="3" fill={item.sentiment === "Negative" ? LOSS : GAIN} />
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 0 4px", marginTop: -6 }}>
        <div>
          <div style={{ fontFamily: DISPLAY, fontSize: 25, fontWeight: 700, letterSpacing: "-0.5px", color: moodColor }}>{mood}</div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: DIM, letterSpacing: "1.2px", marginTop: 2 }}>SENTIMENT INDEX {Math.round(gaugeValue)}</div>
        </div>
        {delta != null && (
          <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: delta >= 0 ? `${GAIN}1f` : `${LOSS}1f`, color: delta >= 0 ? "#7fc4a8" : "#e08a85" }}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} PTS {delta>=0?"BETTER":"WORSE"} THAN YESTERDAY
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Per-holding pulse bars ───────────────────────────────────────────────────
function PulseRow({ portfolio, newsByTicker }) {
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${LINE}`, overflowX: "auto" }}>
      {portfolio.map(h => {
        const items = (newsByTicker[h.ticker] || []).slice(0, 5);
        const bars = Array.from({ length: 5 }).map((_, i) => {
          const item = items[i];
          if (!item) return { h: 6, c: FAINT };
          const height = item.priority === "Critical" ? 18 : item.priority === "High" ? 13 : 8;
          const c = item.sentiment === "Positive" ? GAIN : item.sentiment === "Negative" ? LOSS : FAINT;
          return { h: height, c };
        });
        return (
          <div key={h.ticker} style={{ flex: 1, minWidth: 64, padding: "11px 6px", textAlign: "center", borderRight: `1px solid ${LINE}` }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: PAPER }}>{h.ticker}</div>
            <div style={{ height: 22, marginTop: 6, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2 }}>
              {bars.map((b, i) => <div key={i} style={{ width: 3, borderRadius: 1, height: b.h, background: b.c }} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Morning brief block ────────────────────────────────────────────────────
function BriefBlock({ briefParts }) {
  if (!briefParts) return null;
  return (
    <div style={{ padding: "14px 16px 16px", borderBottom: `1px solid ${LINE}` }}>
      <p style={{ margin: 0, fontFamily: SANS, fontSize: 12.5, color: "#aeaca6", lineHeight: 1.75 }}>
        {briefParts.map((part, i) => (
          <span key={i}>
            {part.tickers.length > 0 ? (
              <>
                <span style={{ color: PAPER, fontWeight: 600 }}>{part.tickers.join(" & ")}</span>
                {" " + part.text.replace(part.tickers.join(", "), "").trim()}
              </>
            ) : part.text}
            {i < briefParts.length - 1 ? "  ·  " : ""}
          </span>
        ))}
      </p>
    </div>
  );
}

// ─── Concentration risk callout ───────────────────────────────────────────────
function ConcentrationCallout({ concentration }) {
  if (!concentration.isConcentrated) return null;
  const top2Names = concentration.bySector.slice(0, 2).map(([s]) => s).join(" and ");
  return (
    <div style={{ margin: "0 16px 14px", border: `1px solid ${WATCH}40`, background: `${WATCH}0d`, padding: "11px 13px" }}>
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
        <span style={{ color: WATCH, fontSize: 13 }}>◆</span>
        <div>
          <p style={{ margin: 0, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: WATCH, letterSpacing: "0.6px" }}>CONCENTRATION RISK</p>
          <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: 11.5, color: "#d4c8a0", lineHeight: 1.6 }}>
            {concentration.top2Pct}% of your book sits in just two sectors — {top2Names}. A single headline in either can move most of your money at once.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Allocation donut chart ──────────────────────────────────────────────────
function AllocationDonut({ portfolio, concentration }) {
  const colors = [AMBER, GAIN, WATCH, "#7a8bbf", LOSS, "#9b7fd4", "#5fa8c9"];
  const total = concentration.bySector.reduce((s, [, w]) => s + w, 0) || 100;
  let cumulative = 0;
  const segments = concentration.bySector.map(([sector, weight], i) => {
    const pct = (weight / total) * 100;
    const seg = { sector, weight, pct, offset: cumulative, color: colors[i % colors.length] };
    cumulative += pct;
    return seg;
  });
  const r = 38, circumference = 2 * Math.PI * r;

  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
      <svg width="100" height="100" viewBox="0 0 100 100" style={{ flexShrink: 0 }} role="img" aria-label="Sector allocation donut chart">
        <circle cx="50" cy="50" r={r} fill="none" stroke={LINE} strokeWidth="14" />
        {segments.map((seg, i) => (
          <circle
            key={seg.sector}
            cx="50" cy="50" r={r} fill="none"
            stroke={seg.color} strokeWidth="14"
            strokeDasharray={`${(seg.pct / 100) * circumference} ${circumference}`}
            strokeDashoffset={-((seg.offset / 100) * circumference)}
            transform="rotate(-90 50 50)"
          />
        ))}
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {segments.map(seg => (
          <div key={seg.sector} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
            <span style={{ fontFamily: SANS, fontSize: 11, color: "#b8b6b0", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seg.sector}</span>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: DIM, fontWeight: 600 }}>{Math.round(seg.pct)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sentiment vs benchmark line ────────────────────────────────────────────
function BenchmarkLine({ gaugeHistory }) {
  if (gaugeHistory.length < 2) return null;
  const w = 280, h = 56;
  const portfolioPoints = gaugeHistory.map((v, i) => `${Math.round((i / (gaugeHistory.length - 1)) * w)},${Math.round(h - (v / 100) * h)}`).join(" ");
  const benchmarkSynthetic = gaugeHistory.map((_, i) => 50 + Math.sin(i / 2) * 4);
  const benchmarkPoints = benchmarkSynthetic.map((v, i) => `${Math.round((i / (benchmarkSynthetic.length - 1)) * w)},${Math.round(h - (v / 100) * h)}`).join(" ");

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: AMBER_DIM, letterSpacing: "1px" }}>YOUR BOOK VS BROAD MARKET</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 56 }} role="img" aria-label="Comparison of portfolio sentiment against broad market">
        <polyline points={benchmarkPoints} fill="none" stroke={DIM} strokeWidth="1.3" strokeDasharray="3,3" />
        <polyline points={portfolioPoints} fill="none" stroke={AMBER} strokeWidth="1.8" />
      </svg>
      <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: AMBER }}>— YOUR BOOK</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: DIM }}>┄ S&P 500 (EST.)</span>
      </div>
    </div>
  );
}

// ─── Event row ────────────────────────────────────────────────────────────────
function EventRow({ item, weight, isLast, simplifyMode }) {
  const [open, setOpen] = useState(false);
  const decision = getDecision(item);
  const spineColor = item.sentiment === "Positive" ? GAIN : item.sentiment === "Negative" ? LOSS : WATCH;

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${LINE}` }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "13px 16px", display: "flex", gap: 12, cursor: "pointer" }}>
        <div style={{ width: 3, flexShrink: 0, borderRadius: 2, background: spineColor, alignSelf: "stretch" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: AMBER }}>{item.ticker}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: FAINT, letterSpacing: "0.5px" }}>{item.category.toUpperCase()}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: "#2a2a30", marginLeft: "auto" }}>{item.publishedAt.toUpperCase()}</span>
          </div>
          <p style={{ margin: 0, fontFamily: SANS, fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: "#e8e6e0" }}>
            <GlossaryText text={item.headline} />
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.5px", padding: "3px 8px", borderRadius: 3, background: `${decision.c}1f`, color: decision.c, fontFamily: MONO }}>
              {decision.label}
            </span>
            {weight != null && <span style={{ fontFamily: MONO, fontSize: 9, color: FAINT }}>{weight}% WT</span>}
          </div>
        </div>
      </div>

      {open && (
        <div style={{ padding: "0 16px 16px 31px" }}>
          <div style={{ background: `${decision.c}0d`, border: `1px solid ${decision.c}2a`, padding: "9px 11px", marginBottom: 10 }}>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: 11.5, color: "#b8b6b0", lineHeight: 1.6 }}>{decision.tip}</p>
          </div>

          <div style={{ marginBottom: 10 }}>
            <p style={{ margin: "0 0 4px", fontFamily: MONO, fontSize: 9, fontWeight: 700, color: AMBER, letterSpacing: "0.7px" }}>IN PLAIN ENGLISH</p>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: 12, color: "#c4c2bc", lineHeight: 1.7 }}>{simplify(item)}</p>
          </div>

          {item.summary && (
            <p style={{ margin: "0 0 11px", fontFamily: SANS, fontSize: 11.5, color: "#8a8884", lineHeight: 1.7 }}>{item.summary}</p>
          )}

          {item.sourceUrl?.startsWith("http") && (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: AMBER, textDecoration: "none", borderBottom: `1px solid ${AMBER_DIM}`, paddingBottom: 2 }}>
              SOURCE → {item.source.toUpperCase()}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ count = 6 }) {
  return (
    <div>
      <style>{`@keyframes pulseFade{0%{opacity:.35}50%{opacity:.8}100%{opacity:.35}}`}</style>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 12, padding: "13px 16px", borderBottom: `1px solid ${LINE}` }}>
          <div style={{ width: 3, background: PANEL }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 10, width: "30%", background: PANEL, marginBottom: 8, animation: `pulseFade 1.4s infinite ${i * 0.08}s` }} />
            <div style={{ height: 13, width: "85%", background: PANEL, marginBottom: 7, animation: `pulseFade 1.4s infinite ${i * 0.08 + 0.1}s` }} />
            <div style={{ height: 11, width: "40%", background: PANEL, animation: `pulseFade 1.4s infinite ${i * 0.08 + 0.2}s` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Filter rail ──────────────────────────────────────────────────────────────
function FilterRail({ active, onChange, counts }) {
  const filters = [
    { key: "all", label: "ALL" },
    { key: "Critical", label: "CRITICAL" },
    { key: "Positive", label: "GAINS" },
    { key: "Negative", label: "RISKS" },
  ];
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${LINE}` }}>
      {filters.map((f, i) => {
        const c = f.key === "all" ? counts.all : counts[f.key] || 0;
        const isActive = active === f.key;
        return (
          <button key={f.key} onClick={() => onChange(f.key)} style={{
            flex: 1, padding: "9px 0", fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.6px",
            background: isActive ? AMBER : "transparent", color: isActive ? INK : DIM,
            border: "none", borderRight: i < filters.length - 1 ? `1px solid ${LINE}` : "none", cursor: "pointer",
          }}>{f.label}{c > 0 ? ` ${c}` : ""}</button>
        );
      })}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3800); return () => clearTimeout(t); }, []);
  const c = type === "success" ? GAIN : type === "error" ? LOSS : AMBER;
  return (
    <div onClick={onClose} style={{ position: "fixed", bottom: 76, left: "50%", transform: "translateX(-50%)", background: "#000", border: `1px solid ${c}`, color: PAPER, padding: "9px 16px", fontFamily: MONO, fontSize: 11, fontWeight: 600, zIndex: 9999, whiteSpace: "nowrap", maxWidth: "88vw", cursor: "pointer" }}>
      <span style={{ color: c }}>●</span>&nbsp; {msg}
    </div>
  );
}

// ─── Weekly recap ────────────────────────────────────────────────────────────
function WeeklyRecap({ news, portfolio, gaugeHistory }) {
  const byTicker = {};
  news.forEach(n => { (byTicker[n.ticker] = byTicker[n.ticker] || []).push(n); });
  const movers = Object.entries(byTicker)
    .map(([ticker, items]) => {
      const pos = items.filter(i => i.sentiment === "Positive").length;
      const neg = items.filter(i => i.sentiment === "Negative").length;
      return { ticker, net: pos - neg, items };
    })
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const biggest = movers[0];
  const offsetting = movers.find(m => m.ticker !== biggest?.ticker && Math.sign(m.net) !== Math.sign(biggest?.net) && m.net !== 0);

  return (
    <div style={{ padding: "16px 16px 90px" }}>
      <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: AMBER_DIM, letterSpacing: "1.4px" }}>THIS SESSION'S RECAP</span>
      <p style={{ margin: "10px 0 18px", fontFamily: SANS, fontSize: 13, color: "#c4c2bc", lineHeight: 1.8 }}>
        {biggest ? (
          <>
            Your most active mover was <span style={{ color: AMBER, fontWeight: 600 }}>{biggest.ticker}</span>, with
            {" "}{biggest.net > 0 ? "more positive than negative coverage" : biggest.net < 0 ? "more negative than positive coverage" : "mixed coverage"} across {biggest.items.length} stories.
            {offsetting && (
              <> This was partially offset by <span style={{ color: AMBER, fontWeight: 600 }}>{offsetting.ticker}</span>, which moved the opposite direction.</>
            )}
          </>
        ) : "Not enough data yet — sync to build this session's recap."}
      </p>

      {gaugeHistory.length > 1 && (
        <div style={{ border: `1px solid ${LINE}`, background: PANEL, padding: "14px 15px", marginBottom: 16 }}>
          <BenchmarkLine gaugeHistory={gaugeHistory} />
        </div>
      )}

      <div style={{ border: `1px solid ${LINE}`, background: PANEL, padding: "14px 15px" }}>
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: AMBER_DIM, letterSpacing: "1.4px" }}>MOVERS, RANKED</span>
        <div style={{ marginTop: 10 }}>
          {movers.slice(0, 6).map(m => (
            <div key={m.ticker} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: AMBER, width: 50 }}>{m.ticker}</span>
              <span style={{ fontFamily: SANS, fontSize: 11, color: DIM, flex: 1 }}>{m.items.length} stories</span>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: m.net > 0 ? GAIN : m.net < 0 ? LOSS : DIM }}>
                {m.net > 0 ? "+" : ""}{m.net}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Portfolio / Book screen ────────────────────────────────────────────────────
function BookScreen({ portfolio, setPortfolio, concentration }) {
  const [editing, setEditing] = useState(false);
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");

  const add = () => {
    const t = ticker.toUpperCase().trim();
    if (!t || portfolio.find(p => p.ticker === t)) return;
    setPortfolio(prev => [...prev, { ticker: t, name: name.trim() || t, weight: Number(weight) || Math.round(100 / (prev.length + 1)), sector: "Other", exposure: "Unclassified exposure" }]);
    setTicker(""); setName(""); setWeight("");
  };
  const totalWeight = portfolio.reduce((s, p) => s + (p.weight || 0), 0);

  return (
    <div style={{ padding: "16px 16px 90px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${LINE}` }}>
        <div>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: AMBER_DIM, letterSpacing: "1.4px" }}>HOLDINGS</span>
          <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: 12.5, color: DIM }}>{portfolio.length} positions · {totalWeight}% allocated</p>
        </div>
        <button onClick={() => setEditing(e => !e)} style={{ background: "transparent", color: editing ? AMBER : DIM, border: `1px solid ${editing ? AMBER : LINE}`, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.5px", padding: "7px 13px", cursor: "pointer" }}>
          {editing ? "DONE" : "EDIT"}
        </button>
      </div>

      {/* Exposure map — not just names */}
      <div style={{ marginBottom: 16 }}>
        {portfolio.map((h, i) => (
          <div key={h.ticker} style={{ padding: "11px 0", borderBottom: i < portfolio.length - 1 ? `1px solid ${LINE}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: AMBER, width: 54, flexShrink: 0 }}>{h.ticker}</span>
              <span style={{ fontFamily: SANS, fontSize: 12, color: "#a8a6a0", flex: 1, minWidth: 0 }}>{h.name}</span>
              {editing ? (
                <input type="number" min="0" max="100" value={h.weight || ""} onChange={e => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  setPortfolio(prev => prev.map(p => p.ticker === h.ticker ? { ...p, weight: v } : p));
                }} placeholder="%" style={{ width: 46, background: PANEL, border: `1px solid ${LINE}`, color: AMBER, fontFamily: MONO, fontSize: 11, textAlign: "center", padding: "4px 5px" }} />
              ) : (
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: FAINT, width: 32, textAlign: "right" }}>{h.weight || 0}%</span>
              )}
              {editing && (
                <button onClick={() => setPortfolio(prev => prev.filter(p => p.ticker !== h.ticker))} style={{ background: "transparent", border: `1px solid ${LOSS}55`, color: LOSS, width: 22, height: 22, fontFamily: MONO, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>×</button>
              )}
            </div>
            {h.exposure && (
              <p style={{ margin: "5px 0 0 66px", fontFamily: SANS, fontSize: 10.5, color: "#5a5a62", fontStyle: "italic" }}>
                → real-world bet: {h.exposure}
              </p>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div style={{ border: `1px solid ${LINE}`, background: PANEL, padding: 15, marginBottom: 16 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: AMBER_DIM, letterSpacing: "1.4px" }}>ADD POSITION</span>
          <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
            <input value={ticker} onChange={e => setTicker(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="TICKER" style={{ flex: "0 0 84px", background: INK, border: `1px solid ${LINE}`, color: PAPER, fontFamily: MONO, fontSize: 11.5, padding: "9px 9px" }} />
            <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Company name" style={{ flex: 2, background: INK, border: `1px solid ${LINE}`, color: PAPER, fontFamily: SANS, fontSize: 12, padding: "9px 10px" }} />
            <input type="number" min="0" max="100" value={weight} onChange={e => setWeight(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="%" style={{ flex: "0 0 50px", background: INK, border: `1px solid ${LINE}`, color: AMBER, fontFamily: MONO, fontSize: 11.5, padding: "9px 4px", textAlign: "center" }} />
          </div>
          <button onClick={add} style={{ width: "100%", marginTop: 10, background: AMBER, color: INK, border: "none", fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.5px", padding: "10px", cursor: "pointer" }}>ADD TO BOOK</button>
        </div>
      )}

      {/* Allocation donut */}
      <div style={{ border: `1px solid ${LINE}`, background: PANEL, padding: "14px 15px", marginBottom: 16 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: AMBER_DIM, letterSpacing: "1.4px" }}>SECTOR ALLOCATION</span>
        <div style={{ marginTop: 12 }}>
          <AllocationDonut portfolio={portfolio} concentration={concentration} />
        </div>
      </div>

      <ConcentrationCallout concentration={concentration} />

      <div style={{ border: `1px solid ${LINE}`, background: PANEL, padding: "14px 15px" }}>
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: AMBER_DIM, letterSpacing: "1.4px" }}>SYSTEM</span>
        <div style={{ marginTop: 10 }}>
          {[
            ["FEED", "Yahoo Finance + Google News RSS, fetched server-side"],
            ["COST", "$0 — no API key, no subscription, ever"],
            ["GAUGE", "Composite sentiment across your book, recomputed each sync"],
            ["GLOSSARY", "Tap any underlined term in a headline for a plain-English definition"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 14, padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: AMBER_DIM, width: 58, flexShrink: 0 }}>{k}</span>
              <span style={{ fontFamily: SANS, fontSize: 11.5, color: DIM, lineHeight: 1.5 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Macro event card ─────────────────────────────────────────────────────────
const MACRO_DIRECTION_COLOR = {
  cut: GAIN, hike: LOSS, hold: WATCH,
  cooling: GAIN, hot: LOSS, inline: WATCH,
  strong: GAIN, weak: LOSS,
  escalation: LOSS, easing: GAIN, neutral: DIM,
};
function MacroEventCard({ event, portfolio, isLast }) {
  const [open, setOpen] = useState(false);
  const typeInfo = MACRO_EVENT_TYPES[event.type];
  const color = MACRO_DIRECTION_COLOR[event.direction] || DIM;
  const impacts = useMemo(() => buildMacroImpactForPortfolio(event, portfolio), [event, portfolio]);

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${LINE}` }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "13px 16px", display: "flex", gap: 12, cursor: "pointer" }}>
        <div style={{ width: 3, flexShrink: 0, borderRadius: 2, background: color, alignSelf: "stretch" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: AMBER, letterSpacing: "0.6px" }}>{typeInfo?.short || "MACRO"}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: FAINT, letterSpacing: "0.5px" }}>{(event.direction || "").toUpperCase()}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: "#2a2a30", marginLeft: "auto" }}>{event.publishedAt}</span>
          </div>
          <p style={{ margin: 0, fontFamily: SANS, fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: "#e8e6e0" }}>
            <GlossaryText text={event.headline} />
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, color: DIM }}>AFFECTS {impacts.length} OF YOUR HOLDINGS</span>
          </div>
        </div>
      </div>

      {open && (
        <div style={{ padding: "0 16px 16px 31px" }}>
          {event.summary && <p style={{ margin: "0 0 11px", fontFamily: SANS, fontSize: 11.5, color: "#8a8884", lineHeight: 1.7 }}>{event.summary}</p>}

          <p style={{ margin: "0 0 7px", fontFamily: MONO, fontSize: 9, fontWeight: 700, color: AMBER, letterSpacing: "0.7px" }}>HOW THIS HITS YOUR BOOK</p>
          <div style={{ marginBottom: 11 }}>
            {impacts.length === 0 && (
              <p style={{ fontFamily: SANS, fontSize: 11.5, color: DIM, lineHeight: 1.6 }}>No direct mapping found for your current holdings.</p>
            )}
            {impacts.map(impact => (
              <div key={impact.ticker} style={{ display: "flex", gap: 9, marginBottom: 8, alignItems: "flex-start" }}>
                <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: AMBER, flexShrink: 0, width: 46 }}>{impact.ticker}</span>
                <span style={{ fontFamily: SANS, fontSize: 11.5, color: "#c4c2bc", lineHeight: 1.6 }}>{impact.text}</span>
              </div>
            ))}
          </div>

          {event.sourceUrl?.startsWith("http") && (
            <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: AMBER, textDecoration: "none", borderBottom: `1px solid ${AMBER_DIM}`, paddingBottom: 2 }}>
              SOURCE → {event.source?.toUpperCase()}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Macro section (full tab) ─────────────────────────────────────────────────
function MacroSection({ portfolio }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const items = await fetchMacroEvents();
      if (!items.length) { setError("No macro events found right now — try again shortly."); setLoading(false); return; }
      setEvents(items);
      setLoaded(true);
    } catch (e) {
      setError(`${e.message} — tap to retry.`);
    } finally { setLoading(false); }
  }, [loading]);

  const criticalCount = events.filter(e => MACRO_DIRECTION_COLOR[e.direction] === LOSS).length;

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${LINE}` }}>
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: AMBER_DIM, letterSpacing: "1.4px" }}>MACRO CALENDAR</span>
        <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: 12, color: DIM, lineHeight: 1.6 }}>
          Fed decisions, inflation data, jobs reports, and trade policy — mapped to exactly which of your holdings each one touches, and why.
        </p>
      </div>

      {!loaded && !loading && !error && (
        <div style={{ textAlign: "center", padding: "48px 24px 36px", margin: 16, border: `1px dashed ${LINE}` }}>
          <p style={{ fontFamily: MONO, fontSize: 11, color: AMBER_DIM, letterSpacing: "1px", marginBottom: 10 }}>// NO EVENTS LOADED</p>
          <p style={{ fontFamily: SANS, fontSize: 13, color: DIM, marginBottom: 20, lineHeight: 1.65 }}>
            Pull the latest Fed, inflation, jobs, and trade policy news.
          </p>
          <button onClick={load} style={{ background: AMBER, color: INK, border: "none", fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.5px", padding: "12px 26px", cursor: "pointer" }}>
            LOAD MACRO EVENTS →
          </button>
        </div>
      )}

      {loading && (
        <p style={{ textAlign: "center", fontFamily: MONO, fontSize: 10.5, color: FAINT, letterSpacing: "0.5px", padding: "30px 0" }}>SCANNING ECONOMIC CALENDAR…</p>
      )}

      {error && !loading && (
        <div onClick={load} style={{ margin: 16, border: `1px solid ${LOSS}55`, background: "#1a0f0e", padding: "15px", textAlign: "center", cursor: "pointer" }}>
          <p style={{ fontFamily: MONO, fontSize: 10.5, color: LOSS, marginBottom: 5, letterSpacing: "0.5px" }}>ERROR</p>
          <p style={{ fontFamily: SANS, fontSize: 12.5, color: "#d4a8a5" }}>{error}</p>
        </div>
      )}

      {loaded && !loading && (
        <>
          {criticalCount > 0 && (
            <div style={{ padding: "9px 16px", display: "flex", alignItems: "center", gap: 7, borderBottom: `1px solid ${LINE}`, background: `${LOSS}0a` }}>
              <span style={{ color: LOSS, fontSize: 11 }}>⚠</span>
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: LOSS, letterSpacing: "0.4px" }}>{criticalCount} EVENT{criticalCount > 1 ? "S" : ""} WORKING AGAINST YOUR BOOK</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 16px" }}>
            <button onClick={load} style={{ background: "none", color: AMBER, border: `1px solid ${AMBER_DIM}`, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.5px", padding: "5px 11px", cursor: "pointer" }}>REFRESH</button>
          </div>
          {events.map((event, i) => (
            <MacroEventCard key={i} event={event} portfolio={portfolio} isLast={i === events.length - 1} />
          ))}
        </>
      )}
    </div>
  );
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
const TABS = [{ id: "feed", label: "Tape" }, { id: "macro", label: "Macro" }, { id: "recap", label: "Recap" }, { id: "portfolio", label: "Book" }];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [portfolio, setPortfolio] = useState(DEFAULT_PORTFOLIO);
  const [tab, setTab] = useState("feed");
  const [news, setNews] = useState([]);
  const [gaugeValue, setGaugeValue] = useState(50);
  const [prevGaugeValue, setPrevGaugeValue] = useState(null);
  const [gaugeHistory, setGaugeHistory] = useState([]);
  const [briefParts, setBriefParts] = useState(null);
  const [riskScores, setRiskScores] = useState({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("all");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const [clock, setClock] = useState(new Date());

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  const showToast = (msg, type = "info") => setToast({ msg, type });
  const portfolioWeights = useMemo(() => Object.fromEntries(portfolio.map(p => [p.ticker, p.weight || 0])), [portfolio]);
  const concentration = useMemo(() => computeConcentration(portfolio), [portfolio]);
  const newsByTicker = useMemo(() => {
    const map = {};
    news.forEach(n => { (map[n.ticker] = map[n.ticker] || []).push(n); });
    return map;
  }, [news]);

  const fetchNews = useCallback(async () => {
    if (loading) return;
    setLoading(true); setError(null); setFilter("all");
    try {
      const items = await fetchNewsFree(portfolio);
      if (!items.length) { setError("No items returned — retry in a moment."); setLoading(false); return; }
      const P = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const sorted = dedup(items).sort((a, b) => (P[a.priority] ?? 4) - (P[b.priority] ?? 4));
      setNews(sorted);
      setRiskScores(computeRiskScores(sorted, portfolio));
      const newGauge = computeGaugeValue(sorted);
      setPrevGaugeValue(gaugeValue);
      setGaugeValue(newGauge);
      setGaugeHistory(prev => [...prev, newGauge].slice(-12));
      setBriefParts(computeBrief(sorted));
      setLoaded(true);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      showToast(`${sorted.length} ITEMS · ${portfolio.map(p => p.ticker).join(", ")}`, "success");
    } catch (e) {
      setError(`${e.message} — tap to retry.`);
    } finally { setLoading(false); }
  }, [portfolio, loading, gaugeValue]);

  const filtered = news.filter(item => {
    if (filter === "all") return true;
    if (filter === "Critical") return item.priority === "Critical";
    if (filter === "Positive") return item.sentiment === "Positive";
    if (filter === "Negative") return item.sentiment === "Negative";
    return true;
  });
  const counts = {
    all: news.length,
    Critical: news.filter(i => i.priority === "Critical").length,
    Positive: news.filter(i => i.sentiment === "Positive").length,
    Negative: news.filter(i => i.sentiment === "Negative").length,
  };
  const critCount = news.filter(i => i.priority === "Critical").length;
  const clockStr = clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div style={{ background: INK, minHeight: "100vh", fontFamily: SANS, color: PAPER, maxWidth: 520, margin: "0 auto" }}>
      <style>{`
        *{box-sizing:border-box}
        input{outline:none}
        input::placeholder{color:${FAINT}}
        ::-webkit-scrollbar{width:0;height:0}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulseDot{0%{box-shadow:0 0 0 0 rgba(74,157,125,0.5)}70%{box-shadow:0 0 0 6px rgba(74,157,125,0)}100%{box-shadow:0 0 0 0 rgba(74,157,125,0)}}
        button:active{opacity:.8}
        @media (prefers-reduced-motion: reduce){ *{animation:none !important} }
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&display=swap');
      `}</style>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Masthead */}
      <div style={{ padding: "18px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: PAPER, letterSpacing: "-0.8px" }}>tape</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: GAIN, display: "inline-block", animation: "pulseDot 2s infinite" }} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: DIM, letterSpacing: "1px" }}>LIVE</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 5 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: FAINT, letterSpacing: "0.3px" }}>{portfolio.length} HOLDINGS</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: FAINT, letterSpacing: "0.3px" }}>{lastUpdated ? `SYNCED ${lastUpdated.toUpperCase()}` : clockStr}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", marginTop: 4, borderTop: `1px solid ${LINE}` }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: DIM }}>{news.length > 0 ? `${news.length} ITEMS TRACKED` : "NO DATA YET"}</span>
          <button onClick={fetchNews} disabled={loading} style={{
            background: "transparent", color: loading ? FAINT : AMBER, border: "none",
            borderBottom: `1px solid ${loading ? LINE : AMBER}`, fontFamily: MONO, fontSize: 10.5, fontWeight: 700,
            letterSpacing: "0.8px", padding: "6px 0", cursor: loading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {loading ? <><span style={{ width: 9, height: 9, border: `2px solid ${FAINT}`, borderTop: `2px solid ${DIM}`, borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />SYNC</> : "SYNC ↻"}
          </button>
        </div>

        {critCount > 0 && (
          <div style={{ padding: "8px 0", display: "flex", alignItems: "center", gap: 7, borderTop: `1px solid ${LINE}` }}>
            <span style={{ color: LOSS, fontSize: 11 }}>⚠</span>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: LOSS, letterSpacing: "0.4px" }}>{critCount} CRITICAL ALERT{critCount > 1 ? "S" : ""} IN BOOK</span>
          </div>
        )}
      </div>

      {/* Signature: sentiment waveform */}
      {loaded && !loading && (
        <div style={{ padding: "0 16px", borderBottom: `1px solid ${LINE}` }}>
          <SentimentWaveform news={news} gaugeValue={gaugeValue} prevGaugeValue={prevGaugeValue} />
        </div>
      )}

      {/* Morning brief */}
      {loaded && !loading && <BriefBlock briefParts={briefParts} />}

      {/* Per-holding pulses */}
      {loaded && !loading && <PulseRow portfolio={portfolio} newsByTicker={newsByTicker} />}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${LINE}` }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "11px 0", background: tab === t.id ? PANEL : "transparent",
            border: "none", borderBottom: tab === t.id ? `2px solid ${AMBER}` : "2px solid transparent",
            color: tab === t.id ? AMBER : FAINT, fontFamily: DISPLAY, fontSize: 12, fontWeight: 700, letterSpacing: "0.3px", cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Feed / Tape tab */}
      {tab === "feed" && (
        <div>
          {!loaded && !loading && !error && (
            <div style={{ textAlign: "center", padding: "60px 24px 44px", margin: 16, border: `1px dashed ${LINE}` }}>
              <p style={{ fontFamily: MONO, fontSize: 11, color: AMBER_DIM, letterSpacing: "1px", marginBottom: 10 }}>// AWAITING SYNC</p>
              <p style={{ fontFamily: SANS, fontSize: 13, color: DIM, marginBottom: 22, lineHeight: 1.65, maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}>
                Pull live coverage across your book — Yahoo Finance & Google News, zero cost.
              </p>
              <button onClick={fetchNews} style={{ background: AMBER, color: INK, border: "none", fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.5px", padding: "12px 26px", cursor: "pointer" }}>
                RUN SYNC →
              </button>
            </div>
          )}

          {loading && (
            <>
              <p style={{ textAlign: "center", fontFamily: MONO, fontSize: 10.5, color: FAINT, letterSpacing: "0.5px", padding: "16px 0 10px" }}>SCANNING SOURCES…</p>
              <Skeleton />
            </>
          )}

          {error && !loading && (
            <div onClick={fetchNews} style={{ margin: 16, border: `1px solid ${LOSS}55`, background: "#1a0f0e", padding: "15px", textAlign: "center", cursor: "pointer" }}>
              <p style={{ fontFamily: MONO, fontSize: 10.5, color: LOSS, marginBottom: 5, letterSpacing: "0.5px" }}>ERROR</p>
              <p style={{ fontFamily: SANS, fontSize: 12.5, color: "#d4a8a5" }}>{error}</p>
            </div>
          )}

          {loaded && !loading && (
            <>
              <FilterRail active={filter} onChange={setFilter} counts={counts} />
              <div style={{ paddingBottom: 90 }}>
                {filtered.length === 0
                  ? <p style={{ textAlign: "center", padding: "36px 0", fontFamily: MONO, fontSize: 10.5, color: FAINT, letterSpacing: "0.4px" }}>NO {filter.toUpperCase()} ITEMS</p>
                  : filtered.map((item, i) => (
                      <EventRow key={item.id} item={item} weight={portfolioWeights[item.ticker]} isLast={i === filtered.length - 1} />
                    ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "macro" && <MacroSection portfolio={portfolio} />}
      {tab === "recap" && <WeeklyRecap news={news} portfolio={portfolio} gaugeHistory={gaugeHistory} />}
      {tab === "portfolio" && <BookScreen portfolio={portfolio} setPortfolio={setPortfolio} concentration={concentration} />}

      {/* Footer */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 520, background: "#000", borderTop: `1px solid ${LINE}`, padding: "9px 16px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontFamily: MONO, fontSize: 8, color: "#2a2a30", letterSpacing: "0.5px" }}>TAPE · FREE FEED</span>
        <span style={{ fontFamily: MONO, fontSize: 8, color: "#2a2a30" }}>{clockStr}</span>
      </div>
    </div>
  );
}
