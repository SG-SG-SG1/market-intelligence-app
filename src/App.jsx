import { useState, useCallback, useEffect, useMemo, useRef } from "react";

// ─── Theme tokens — Mono Slate ─────────────────────────────────────────────────
const C = {
  bgPage: "#E8E8EA",
  bgCard: "#FFFFFF",
  bgSubtle: "#F4F4F5",
  bgSubtle2: "#EDEDEF",
  border: "#E5E5E8",
  borderStrong: "#DCDCE0",
  textPrimary: "#1F1F23",
  textSecondary: "#6B6B72",
  textTertiary: "#B4B4B9",
  ink: "#2C2C30",
  accent: "#1F1F23",
  link: "#378ADD",
  gainBg: "#E1F5EE",
  gainText: "#0F6E56",
  gainStrong: "#1D9E75",
  riskBg: "#FAECE7",
  riskText: "#993C1D",
  riskStrong: "#D85A30",
  watchBg: "#FCEFD8",
  watchText: "#8A5A0B",
  danger: "#E24B4A",
};

const SANS = "'Inter',-apple-system,system-ui,sans-serif";

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
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return "recently"; }
}

// ─── Plain-English summary per item ────────────────────────────────────────────
function simplify(item) {
  const t = item.ticker;
  if (item.sentiment === "Positive") {
    if (item.category === "Earnings") return `${t} made more money than expected last quarter — a good sign.`;
    if (item.category === "Analyst") return `An expert just said ${t} looks like a better buy than before.`;
    if (item.category === "Insider") return `Someone running ${t} bought more of their own company's stock.`;
    if (item.category === "Macro") return `Today's economic news is mildly good for ${t}.`;
    return `Good news for ${t} today.`;
  }
  if (item.sentiment === "Negative") {
    if (item.category === "Earnings") return `${t} made less money than expected last quarter.`;
    if (item.category === "Analyst") return `An expert just lowered their opinion on ${t}.`;
    if (item.category === "Macro") return `Today's economic news is mildly bad for ${t}.`;
    return `A setback for ${t} — worth watching closely.`;
  }
  return `Not a strong signal either way for ${t} — just keep it on your radar.`;
}

// ─── "So what" line — the consequence, always shown, separate from headline ──
function soWhat(item) {
  const t = item.ticker;
  if (item.sentiment === "Positive") {
    if (item.category === "Earnings") return `Could support a higher stock price`;
    if (item.category === "Analyst") return `May attract more buyers`;
    if (item.category === "Insider") return `Often signals confidence from leadership`;
    if (item.category === "Macro") return `Slight tailwind for ${t}`;
    return `Worth noting as a positive sign`;
  }
  if (item.sentiment === "Negative") {
    if (item.category === "Earnings") return `Could pressure the stock short-term`;
    if (item.category === "Analyst") return `May cool investor demand`;
    if (item.category === "Macro") return `Slight headwind for ${t}`;
    return `Worth watching for follow-through`;
  }
  return `No clear direction yet`;
}

// ─── Trim original article text to one brief, clean sentence ─────────────────
function briefSummary(text) {
  if (!text) return "";
  // Cut at the first sentence boundary, capped at ~110 chars so it stays brief
  const cleaned = text.replace(/\s+/g, " ").trim();
  const firstSentence = cleaned.match(/^.*?[.!?](?:\s|$)/);
  let result = firstSentence ? firstSentence[0].trim() : cleaned;
  if (result.length > 120) result = result.slice(0, 117).trim() + "…";
  return result;
}

// ─── Macro events ───────────────────────────────────────────────────────────
const MACRO_EVENT_TYPES = {
  FED_RATE: {
    short: "Fed rates",
    affects: () => true,
    explain: (direction, p) => {
      const growthHeavy = ["NVDA","MSFT","GOOGL","AMZN","QQQ"].includes(p.ticker);
      if (direction === "cut") return growthHeavy
        ? `Cheaper borrowing usually helps growth stocks like ${p.ticker}.`
        : `Mildly positive for ${p.ticker} — lowers its cost of capital.`;
      if (direction === "hike") return growthHeavy
        ? `Higher rates often pressure growth stocks like ${p.ticker} the most.`
        : `A mild headwind, raising ${p.ticker}'s cost of capital.`;
      return `Rates held steady — broadly neutral for ${p.ticker}.`;
    }
  },
  CPI: {
    short: "Inflation",
    affects: () => true,
    explain: (direction, p) => direction === "cooling"
      ? `Cooling inflation is good news for ${p.ticker} — raises odds of rate cuts.`
      : direction === "hot"
      ? `Hotter inflation is a headwind for ${p.ticker} — lowers odds of rate cuts.`
      : `Inflation was roughly as expected — limited impact on ${p.ticker}.`
  },
  JOBS: {
    short: "Jobs report",
    affects: () => true,
    explain: (direction, p) => direction === "strong"
      ? `A strong jobs report signals a healthy economy for ${p.ticker}.`
      : direction === "weak"
      ? `A weaker report raises some concern, though it may bring rate cuts closer.`
      : `Jobs data was in line with expectations for ${p.ticker}.`
  },
  TARIFF: {
    short: "Trade policy",
    affects: (p) => ["NVDA","AAPL","AMZN"].includes(p.ticker),
    explain: (direction, p) => `This directly touches ${p.ticker}'s supply chain or international sales.`
  },
};
function buildMacroImpact(event, portfolio) {
  const type = MACRO_EVENT_TYPES[event.type];
  if (!type) return [];
  return portfolio.filter(p => type.affects(p)).map(p => ({ ticker: p.ticker, text: type.explain(event.direction, p) }));
}
async function fetchMacroEvents() {
  const res = await fetch(`/api/macro?_=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.events || [];
}

// ─── Insider trading (real SEC EDGAR Form 4 data) ─────────────────────────────
async function fetchInsiderTrades(portfolio) {
  const tickers = portfolio.map(p => p.ticker).join(",");
  const res = await fetch(`/api/insider?tickers=${encodeURIComponent(tickers)}&_=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.transactions || [];
}
function formatTxDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diffDays < 1) return "today";
    if (diffDays === 1) return "1 day ago";
    if (diffDays < 30) return `${diffDays} days ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch { return dateStr; }
}

// ─── Fetch news (free serverless endpoint) ────────────────────────────────────
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
// ─── Smart grouping: merge stories covering the same underlying event ────────
// Different outlets write different headlines for the same event (e.g. a Fed
// rate cut). Exact-text dedup misses these. Instead, group by significant
// word overlap within the same ticker + similar time window, keep the
// clearest/shortest headline as the representative, and track source count.
const STOPWORDS = new Set(["the","a","an","and","or","but","of","to","in","on","for","with","is","are","was","were","be","as","at","by","from","this","that","it","its","has","have","had","will","would","could","should","new","says","said"]);

function significantWords(text) {
  return new Set(
    (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w))
  );
}
function overlapScore(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

function dedup(items) {
  const groups = [];
  for (const item of items) {
    const words = significantWords(item.headline);
    let matched = null;
    for (const g of groups) {
      if (g.ticker !== item.ticker) continue;
      if (overlapScore(words, g.words) >= 0.55) { matched = g; break; }
    }
    if (matched) {
      matched.sources.add(item.source);
      matched.items.push(item);
      // Keep the shortest, clearest headline as the representative
      if (item.headline.length < matched.representative.headline.length) {
        matched.representative = item;
      }
    } else {
      groups.push({ ticker: item.ticker, words, sources: new Set([item.source]), items: [item], representative: item });
    }
  }
  return groups.map(g => ({
    ...g.representative,
    sourceCount: g.sources.size,
    otherSources: [...g.sources].filter(s => s !== g.representative.source),
  }));
}
function computeBrief(allNews, portfolio) {
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
  const totalPos = allNews.filter(i => i.sentiment === "Positive").length;
  const totalNeg = allNews.filter(i => i.sentiment === "Negative").length;
  const mood = totalPos > totalNeg * 1.3 ? "Positive day" : totalNeg > totalPos * 1.3 ? "Watch closely" : "Mixed day";
  return { mood, positives: positives.slice(0, 2), negatives: negatives.slice(0, 2), totalPos, totalNeg };
}
function computeRiskLabel(allNews, ticker) {
  const relevant = allNews.filter(n => n.ticker === ticker);
  if (!relevant.length) return { label: "Steady", isRising: null };
  const pos = relevant.filter(n => n.sentiment === "Positive").length;
  const neg = relevant.filter(n => n.sentiment === "Negative").length;
  if (pos > neg) return { label: "Rising", isRising: true };
  if (neg > pos) return { label: "Watch", isRising: false };
  return { label: "Steady", isRising: null };
}

// ─── Small shared bits ────────────────────────────────────────────────────────
function Avatar({ ticker, size = 34, filled = false }) {
  const colors = ["#2C2C30", "#4A4A52", "#5B5B63", "#6B6B72"];
  const idx = ticker.charCodeAt(0) % colors.length;
  return (
    <div style={{
      width: size, height: size, borderRadius: filled ? 10 : "50%",
      background: filled ? colors[idx] : C.bgSubtle2,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.32, fontWeight: 600, color: filled ? "#fff" : C.textPrimary,
      flexShrink: 0,
    }}>
      {filled ? ticker[0] : ticker.slice(0, 2)}
    </div>
  );
}
function SentimentPill({ sentiment: s }) {
  const cfg = s === "Positive"
    ? { bg: C.gainBg, text: C.gainText, icon: "↗", label: "Rising" }
    : s === "Negative"
    ? { bg: C.riskBg, text: C.riskText, icon: "⏱", label: "Watch" }
    : { bg: C.bgSubtle2, text: C.textSecondary, icon: "•", label: "Steady" };
  return (
    <div style={{ background: cfg.bg, color: cfg.text, padding: "5px 11px", borderRadius: 20, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
      <span>{cfg.icon}</span> {cfg.label}
    </div>
  );
}
function GlossaryTerm({ children, definition }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <span onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }} style={{ borderBottom: `1px dotted ${C.textTertiary}`, cursor: "pointer" }}>{children}</span>
      {open && (
        <span style={{ display: "block", marginTop: 6, padding: "8px 10px", background: C.bgSubtle, borderRadius: 8, fontSize: 11.5, color: C.textSecondary, lineHeight: 1.55 }}>
          {definition}
        </span>
      )}
    </span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, []);
  const color = type === "success" ? C.gainStrong : type === "error" ? C.riskStrong : C.textPrimary;
  return (
    <div onClick={onClose} style={{ position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", background: C.textPrimary, color: "#fff", padding: "10px 18px", borderRadius: 24, fontSize: 13, fontWeight: 500, zIndex: 9999, whiteSpace: "nowrap", maxWidth: "88vw", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", cursor: "pointer" }}>
      {msg}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ count = 4 }) {
  return (
    <div>
      <style>{`@keyframes pf{0%{opacity:.4}50%{opacity:.85}100%{opacity:.4}}`}</style>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.bgSubtle2, animation: `pf 1.3s infinite ${i * 0.1}s` }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 12, width: "75%", background: C.bgSubtle2, marginBottom: 6, animation: `pf 1.3s infinite ${i * 0.1}s` }} />
            <div style={{ height: 9, width: "35%", background: C.bgSubtle2, animation: `pf 1.3s infinite ${i * 0.1 + 0.1}s` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Briefing card ──────────────────────────────────────────────────────────
function BriefingCard({ brief, onRefresh }) {
  if (!brief) return null;
  const isPositive = brief.mood === "Positive day";
  const isWatch = brief.mood === "Watch closely";
  const moodColor = isPositive ? C.gainStrong : isWatch ? C.riskStrong : C.textSecondary;
  const moodBg = isPositive ? C.gainBg : isWatch ? C.riskBg : C.bgSubtle2;
  const moodTextColor = isPositive ? C.gainText : isWatch ? C.riskText : C.textSecondary;

  return (
    <div style={{ background: C.bgSubtle, borderRadius: 14, padding: "14px 16px", border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 15 }}>✨</span>
          <span style={{ fontSize: 11.5, color: C.ink, fontWeight: 600 }}>Today's briefing</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, background: C.bgCard, padding: "4px 10px", borderRadius: 20 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: moodColor }} />
          <span style={{ fontSize: 10.5, fontWeight: 600, color: moodTextColor }}>{brief.mood}</span>
        </div>
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: "0 0 12px", color: C.textPrimary }}>
        Your portfolio is looking <strong>{isPositive ? "mostly positive" : isWatch ? "a bit mixed" : "fairly balanced"}</strong> today.
        {brief.positives.length > 0 && (
          <> {brief.positives.map((t, i) => (
            <span key={t}>
              <span style={{ background: C.bgSubtle2, color: C.ink, padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>{t}</span>
              {i < brief.positives.length - 1 ? " and " : " "}
            </span>
          ))} {brief.positives.length === 1 ? "is" : "are"} leading the way{brief.negatives.length > 0 ? ", while" : "."}</>
        )}
        {brief.negatives.length > 0 && (
          <> {brief.negatives.map((t, i) => (
            <span key={t}>
              <span style={{ background: C.bgSubtle2, color: C.ink, padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>{t}</span>
              {i < brief.negatives.length - 1 ? " and " : " " }
            </span>
          ))}{brief.negatives.length === 1 ? " needs" : " need"} a closer look.</>
        )}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onRefresh} style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: "9px", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 9, color: C.textPrimary, cursor: "pointer" }}>
          ↻ Refresh briefing
        </button>
      </div>
    </div>
  );
}

// ─── Swipeable holding cards ───────────────────────────────────────────────────
function HoldingCards({ portfolio, news, portfolioWeights }) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef(null);

  if (!portfolio.length) return null;
  const h = portfolio[Math.min(index, portfolio.length - 1)];
  const risk = computeRiskLabel(news, h.ticker);
  const relevantNews = news.filter(n => n.ticker === h.ticker);
  const headline = relevantNews[0]?.summary || relevantNews[0]?.headline || "No recent news for this holding yet — tap refresh to check.";

  const go = (dir) => setIndex(i => Math.max(0, Math.min(portfolio.length - 1, i + dir)));

  const onTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStart.current == null) return;
    const delta = e.changedTouches[0].clientX - touchStart.current;
    if (delta > 50) go(-1);
    else if (delta < -50) go(1);
    touchStart.current = null;
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: C.textSecondary, fontWeight: 500 }}>Your holdings</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, color: C.textTertiary, fontSize: 11 }}>
          <span>←</span><span>swipe</span><span>→</span>
        </div>
      </div>

      <div style={{ position: "relative" }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div style={{ position: "absolute", top: 8, left: 8, right: -8, bottom: -8, background: C.bgSubtle2, borderRadius: 18, zIndex: 0 }} />
        <div onClick={() => go(1)} style={{ position: "relative", zIndex: 1, background: C.bgCard, borderRadius: 18, padding: "1.1rem", border: `1px solid ${C.border}`, cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar ticker={h.ticker} size={38} filled />
              <div>
                <p style={{ fontSize: 18, fontWeight: 600, margin: 0, color: C.textPrimary }}>{h.ticker}</p>
                <p style={{ fontSize: 10.5, color: C.textTertiary, margin: "1px 0 0" }}>{h.weight}% of your book</p>
              </div>
            </div>
            <SentimentPill sentiment={risk.isRising === true ? "Positive" : risk.isRising === false ? "Negative" : "Neutral"} />
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 12px", color: C.textSecondary }}>{headline}</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {portfolio.map((_, i) => (
                <span key={i} style={{ width: 18, height: 4, borderRadius: 2, background: i === index ? C.ink : C.border }} />
              ))}
            </div>
            <span style={{ fontSize: 10.5, color: C.textTertiary }}>{index + 1} of {portfolio.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Story row ────────────────────────────────────────────────────────────────
// ─── Category icon map for B2 design ───────────────────────────────────────
const CATEGORY_ICON = {
  Earnings: { glyph: "📊", iconName: "chart-bar" },
  Macro: { iconName: "world" },
  Insider: { iconName: "user-dollar" },
  Analyst: { iconName: "target-arrow" },
  News: { iconName: "news" },
};
function CategoryBadge({ category: cat, sentiment: s }) {
  const isPos = s === "Positive";
  const isNeg = s === "Negative";
  const bg = isPos ? C.gainBg : isNeg ? C.riskBg : C.bgSubtle2;
  const fg = isPos ? C.gainText : isNeg ? C.riskText : C.textSecondary;
  const iconMap = {
    Earnings: "M3 17h2v3H3v-3zm4-6h2v9H7v-9zm4-4h2v13h-2V7zm4 7h2v6h-2v-6zm4-9h2v15h-2V5z",
  };
  return (
    <div style={{ width: 28, height: 28, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {cat === "Earnings" && <><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></>}
        {cat === "Macro" && <><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></>}
        {cat === "Insider" && <><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></>}
        {cat === "Analyst" && <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.5"/></>}
        {cat === "News" && <><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/></>}
      </svg>
    </div>
  );
}

function StoryRow({ item, isLast }) {
  const [open, setOpen] = useState(false);
  const edgeColor = item.sentiment === "Positive" ? C.gainStrong : item.sentiment === "Negative" ? C.riskStrong : C.borderStrong;
  const plainLine = simplify(item);
  const consequence = soWhat(item);
  const isPos = item.sentiment === "Positive";
  const isNeg = item.sentiment === "Negative";
  const consequenceBg = isPos ? C.gainBg : isNeg ? C.riskBg : C.bgSubtle2;
  const consequenceFg = isPos ? C.gainText : isNeg ? C.riskText : C.textSecondary;

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${C.border}`, borderLeft: `3px solid ${edgeColor}` }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 0 11px 12px", cursor: "pointer" }}>
        <CategoryBadge category={item.category} sentiment={item.sentiment} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Ticker + meta */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: C.textSecondary }}>{item.ticker}</span>
            <span style={{ fontSize: 10, color: C.textTertiary }}>· {item.category} · {item.publishedAt}</span>
          </div>
          {/* Fix 1: plain-English line leads, bold and prominent */}
          <p style={{ fontSize: 13.5, margin: "0 0 3px", lineHeight: 1.4, color: C.textPrimary, fontWeight: 500 }}>{plainLine}</p>
          {/* Original headline demoted to small attribution */}
          <p style={{ fontSize: 10.5, color: C.textTertiary, margin: "0 0 6px", lineHeight: 1.4, fontStyle: "italic" }}>
            via "{item.headline.length > 60 ? item.headline.slice(0, 57) + "…" : item.headline}"
            {item.sourceCount > 1 && <span style={{ fontStyle: "normal" }}> · {item.sourceCount} sources</span>}
          </p>
          {/* Fix 2: always-visible "so what" consequence line */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: consequenceBg, padding: "3px 9px", borderRadius: 20 }}>
            {isPos && <span style={{ fontSize: 11, color: consequenceFg }}>↗</span>}
            {isNeg && <span style={{ fontSize: 11, color: consequenceFg }}>↘</span>}
            <span style={{ fontSize: 11, color: consequenceFg, fontWeight: 500 }}>{consequence}</span>
          </div>
        </div>
      </div>
      {open && (
        <div style={{ padding: "0 0 14px 51px" }}>
          {item.summary && <p style={{ fontSize: 11.5, color: C.textSecondary, lineHeight: 1.6, margin: "0 0 10px" }}>{briefSummary(item.summary)}</p>}
          {/* Fix 3: show other sources covering the same story, if grouped */}
          {item.otherSources?.length > 0 && (
            <p style={{ fontSize: 11, color: C.textTertiary, margin: "0 0 10px" }}>
              Also covered by {item.otherSources.slice(0, 3).join(", ")}{item.otherSources.length > 3 ? ` and ${item.otherSources.length - 3} more` : ""}
            </p>
          )}
          {item.sourceUrl?.startsWith("http") && (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, fontWeight: 600, color: C.link, textDecoration: "none" }}>
              Read full story on {item.source} →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Macro event card ───────────────────────────────────────────────────────
function MacroCard({ event, portfolio, isLast }) {
  const [open, setOpen] = useState(false);
  const typeInfo = MACRO_EVENT_TYPES[event.type];
  const impacts = useMemo(() => buildMacroImpact(event, portfolio), [event, portfolio]);
  const isNeg = ["hike", "hot", "weak", "escalation"].includes(event.direction);
  const isPos = ["cut", "cooling", "strong", "easing"].includes(event.direction);
  const dotColor = isNeg ? C.riskStrong : isPos ? C.gainStrong : C.textTertiary;

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${C.border}` }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", cursor: "pointer" }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.bgSubtle2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10.5, color: C.textTertiary, margin: "0 0 3px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>{typeInfo?.short || "Macro"}</p>
          <p style={{ fontSize: 13, margin: 0, lineHeight: 1.45, color: C.textPrimary }}>{event.headline}</p>
          <p style={{ fontSize: 10.5, color: C.textTertiary, margin: "5px 0 0" }}>Affects {impacts.length} of your holdings · {event.publishedAt}</p>
        </div>
      </div>
      {open && (
        <div style={{ padding: "0 0 14px 46px" }}>
          {event.summary && <p style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.65, margin: "0 0 11px" }}>{briefSummary(event.summary)}</p>}
          <p style={{ fontSize: 10.5, fontWeight: 600, color: C.textSecondary, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.3px" }}>How this affects you</p>
          {impacts.map(impact => (
            <div key={impact.ticker} style={{ display: "flex", gap: 9, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.textPrimary, width: 46, flexShrink: 0 }}>{impact.ticker}</span>
              <span style={{ fontSize: 11.5, color: C.textSecondary, lineHeight: 1.6 }}>{impact.text}</span>
            </div>
          ))}
          {event.sourceUrl?.startsWith("http") && (
            <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, fontWeight: 600, color: C.link, textDecoration: "none", display: "inline-block", marginTop: 4 }}>
              Read full story on {event.source} →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Home screen ────────────────────────────────────────────────────────────
function HomeScreen({ portfolio, news, brief, loading, loaded, error, onFetch, filter, setFilter, counts, filteredNews, portfolioWeights }) {
  return (
    <div style={{ paddingBottom: 90 }}>
      {/* Briefing */}
      <div style={{ padding: "0 16px 16px" }}>
        {!loaded && !loading && !error && (
          <div style={{ background: C.bgSubtle, borderRadius: 14, padding: "28px 20px", textAlign: "center", border: `1px solid ${C.border}` }}>
            <p style={{ fontSize: 13, color: C.textSecondary, marginBottom: 16, lineHeight: 1.6 }}>Get your first briefing — see what's happening with your portfolio today.</p>
            <button onClick={onFetch} style={{ background: C.textPrimary, color: "#fff", border: "none", padding: "11px 24px", borderRadius: 24, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Get my briefing
            </button>
          </div>
        )}
        {loading && (
          <div style={{ background: C.bgSubtle, borderRadius: 14, padding: "20px 16px", border: `1px solid ${C.border}` }}>
            <Skeleton count={2} />
          </div>
        )}
        {error && !loading && (
          <div onClick={onFetch} style={{ background: C.riskBg, borderRadius: 14, padding: "16px", textAlign: "center", cursor: "pointer" }}>
            <p style={{ fontSize: 12.5, color: C.riskText }}>{error} — tap to retry</p>
          </div>
        )}
        {loaded && !loading && <BriefingCard brief={brief} onRefresh={onFetch} />}
      </div>

      {/* Holdings */}
      {loaded && !loading && (
        <div style={{ padding: "0 16px 16px" }}>
          <HoldingCards portfolio={portfolio} news={news} portfolioWeights={portfolioWeights} />
        </div>
      )}

      {/* Filter pills */}
      {loaded && !loading && (
        <div style={{ padding: "0 16px 8px" }}>
          <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
            {[{ k: "all", l: "All" }, { k: "Positive", l: "Good news" }, { k: "Negative", l: "Watch" }].map(f => (
              <button key={f.k} onClick={() => setFilter(f.k)} style={{
                flexShrink: 0, fontSize: 11.5, fontWeight: 600, padding: "6px 14px", borderRadius: 20,
                background: filter === f.k ? C.textPrimary : C.bgSubtle, color: filter === f.k ? "#fff" : C.textSecondary,
                border: "none", cursor: "pointer",
              }}>{f.l}{f.k !== "all" ? ` (${counts[f.k] || 0})` : ""}</button>
            ))}
          </div>
        </div>
      )}

      {/* Stories */}
      {loaded && !loading && (
        <div style={{ padding: "8px 16px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: C.textSecondary, fontWeight: 500 }}>Recent stories</span>
            <span style={{ fontSize: 11.5, color: C.textTertiary }}>{filteredNews.length} stories</span>
          </div>
          {filteredNews.length === 0
            ? <p style={{ textAlign: "center", padding: "30px 0", fontSize: 12.5, color: C.textTertiary }}>No stories in this filter.</p>
            : filteredNews.map((item, i) => <StoryRow key={item.id} item={item} isLast={i === filteredNews.length - 1} />)
          }
        </div>
      )}
    </div>
  );
}

// ─── Insider trading screen (real SEC EDGAR data) ──────────────────────────
function InsiderRow({ tx, isLast }) {
  const isBuy = tx.direction === "Buy";
  const edgeColor = isBuy ? C.gainStrong : tx.direction === "Sell" ? C.riskStrong : C.borderStrong;
  const bg = isBuy ? C.gainBg : tx.direction === "Sell" ? C.riskBg : C.bgSubtle2;
  const fg = isBuy ? C.gainText : tx.direction === "Sell" ? C.riskText : C.textSecondary;

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${C.border}`, borderLeft: `3px solid ${edgeColor}`, padding: "12px 0 12px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: C.textSecondary }}>{tx.ticker}</span>
        <span style={{ fontSize: 10, color: C.textTertiary }}>· {formatTxDate(tx.transactionDate)}</span>
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 600, color: fg, background: bg, padding: "2px 9px", borderRadius: 20 }}>
          {tx.direction === "Buy" ? "↗ Bought" : tx.direction === "Sell" ? "↘ Sold" : tx.direction}
        </span>
      </div>
      <p style={{ fontSize: 13.5, margin: "0 0 3px", color: C.textPrimary, fontWeight: 500 }}>{tx.insiderName}</p>
      <p style={{ fontSize: 11.5, color: C.textSecondary, margin: "0 0 7px" }}>{tx.title}</p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {tx.shares && <span style={{ fontSize: 11.5, color: C.textSecondary }}><strong style={{ color: C.textPrimary }}>{tx.shares}</strong> shares</span>}
        {tx.totalValue && <span style={{ fontSize: 11.5, color: C.textSecondary }}>worth <strong style={{ color: C.textPrimary }}>{tx.totalValue}</strong></span>}
      </div>
      {tx.filingUrl?.startsWith("http") && (
        <a href={tx.filingUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 600, color: C.link, textDecoration: "none", display: "inline-block", marginTop: 8 }}>
          View official SEC filing →
        </a>
      )}
    </div>
  );
}

function InsiderScreen({ portfolio }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const items = await fetchInsiderTrades(portfolio);
      if (!items.length) { setError("No recent insider trades found for your holdings"); setLoading(false); return; }
      const sorted = [...items].sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));
      setTransactions(sorted); setLoaded(true);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [loading, portfolio]);

  const buyCount = transactions.filter(t => t.direction === "Buy").length;
  const sellCount = transactions.filter(t => t.direction === "Sell").length;

  return (
    <div style={{ padding: "16px 16px 90px" }}>
      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 17, fontWeight: 600, margin: 0, color: C.textPrimary }}>Insider activity</p>
        <p style={{ fontSize: 12.5, color: C.textSecondary, margin: "4px 0 0", lineHeight: 1.6 }}>
          Real trades by company executives and directors, pulled directly from official SEC filings.
        </p>
      </div>

      {!loaded && !loading && !error && (
        <div style={{ background: C.bgSubtle, borderRadius: 14, padding: "28px 20px", textAlign: "center", border: `1px solid ${C.border}` }}>
          <button onClick={load} style={{ background: C.textPrimary, color: "#fff", border: "none", padding: "11px 24px", borderRadius: 24, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Load insider trades
          </button>
          <p style={{ fontSize: 11, color: C.textTertiary, margin: "12px 0 0" }}>Sourced from SEC EDGAR — may take a few seconds</p>
        </div>
      )}
      {loading && (
        <>
          <p style={{ textAlign: "center", fontSize: 12, color: C.textTertiary, marginBottom: 12 }}>Checking official SEC filings…</p>
          <Skeleton count={3} />
        </>
      )}
      {error && !loading && (
        <div onClick={load} style={{ background: C.riskBg, borderRadius: 14, padding: "16px", textAlign: "center", cursor: "pointer" }}>
          <p style={{ fontSize: 12.5, color: C.riskText }}>{error} — tap to retry</p>
        </div>
      )}
      {loaded && !loading && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1, background: C.gainBg, borderRadius: 12, padding: "10px", textAlign: "center" }}>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: C.gainText }}>{buyCount}</p>
              <p style={{ fontSize: 10, color: C.gainText, margin: "2px 0 0" }}>Insider buys</p>
            </div>
            <div style={{ flex: 1, background: C.riskBg, borderRadius: 12, padding: "10px", textAlign: "center" }}>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: C.riskText }}>{sellCount}</p>
              <p style={{ fontSize: 10, color: C.riskText, margin: "2px 0 0" }}>Insider sells</p>
            </div>
          </div>
          <div style={{ background: C.bgCard, borderRadius: 14, border: `1px solid ${C.border}` }}>
            {transactions.map((tx, i) => <InsiderRow key={i} tx={tx} isLast={i === transactions.length - 1} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Macro screen ───────────────────────────────────────────────────────────
function MacroScreen({ portfolio }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const items = await fetchMacroEvents();
      if (!items.length) { setError("No events found right now"); setLoading(false); return; }
      setEvents(items); setLoaded(true);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [loading]);

  return (
    <div style={{ padding: "16px 16px 90px" }}>
      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 17, fontWeight: 600, margin: 0, color: C.textPrimary }}>Big picture</p>
        <p style={{ fontSize: 12.5, color: C.textSecondary, margin: "4px 0 0", lineHeight: 1.6 }}>
          Fed decisions, inflation, jobs reports, and trade policy — and exactly how each one touches your holdings.
        </p>
      </div>

      {!loaded && !loading && !error && (
        <div style={{ background: C.bgSubtle, borderRadius: 14, padding: "28px 20px", textAlign: "center", border: `1px solid ${C.border}` }}>
          <button onClick={load} style={{ background: C.textPrimary, color: "#fff", border: "none", padding: "11px 24px", borderRadius: 24, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Load latest events
          </button>
        </div>
      )}
      {loading && <Skeleton count={3} />}
      {error && !loading && (
        <div onClick={load} style={{ background: C.riskBg, borderRadius: 14, padding: "16px", textAlign: "center", cursor: "pointer" }}>
          <p style={{ fontSize: 12.5, color: C.riskText }}>{error} — tap to retry</p>
        </div>
      )}
      {loaded && !loading && (
        <div style={{ background: C.bgCard, borderRadius: 14, padding: "4px 16px", border: `1px solid ${C.border}` }}>
          {events.map((event, i) => <MacroCard key={i} event={event} portfolio={portfolio} isLast={i === events.length - 1} />)}
        </div>
      )}
    </div>
  );
}

// ─── Portfolio / Holdings screen ───────────────────────────────────────────────
function HoldingsScreen({ portfolio, setPortfolio }) {
  const [editing, setEditing] = useState(false);
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");

  const add = () => {
    const t = ticker.toUpperCase().trim();
    if (!t || portfolio.find(p => p.ticker === t)) return;
    setPortfolio(prev => [...prev, { ticker: t, name: name.trim() || t, weight: Number(weight) || Math.round(100 / (prev.length + 1)), sector: "Other", exposure: "Unclassified" }]);
    setTicker(""); setName(""); setWeight("");
  };
  const totalWeight = portfolio.reduce((s, p) => s + (p.weight || 0), 0);

  return (
    <div style={{ padding: "16px 16px 90px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 17, fontWeight: 600, margin: 0, color: C.textPrimary }}>Your holdings</p>
          <p style={{ fontSize: 12, color: C.textSecondary, margin: "2px 0 0" }}>{portfolio.length} positions · {totalWeight}% allocated</p>
        </div>
        <button onClick={() => setEditing(e => !e)} style={{
          background: editing ? C.textPrimary : C.bgSubtle, color: editing ? "#fff" : C.textPrimary,
          border: `1px solid ${editing ? C.textPrimary : C.borderStrong}`, fontSize: 12.5, fontWeight: 600,
          padding: "8px 16px", borderRadius: 20, cursor: "pointer",
        }}>
          {editing ? "✓ Done" : "✎ Edit"}
        </button>
      </div>

      <div style={{ background: C.bgCard, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 16, overflow: "hidden" }}>
        {portfolio.map((h, i) => (
          <div key={h.ticker} style={{ padding: "13px 15px", borderBottom: i < portfolio.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar ticker={h.ticker} size={36} filled />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14.5, fontWeight: 600, margin: 0, color: C.textPrimary }}>{h.ticker}</p>
                <p style={{ fontSize: 11.5, color: C.textSecondary, margin: "1px 0 0" }}>{h.name}</p>
              </div>
              {editing ? (
                <input type="number" min="0" max="100" value={h.weight || ""} onChange={e => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  setPortfolio(prev => prev.map(p => p.ticker === h.ticker ? { ...p, weight: v } : p));
                }} style={{ width: 50, background: C.bgSubtle, border: `1px solid ${C.borderStrong}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, textAlign: "center", color: C.textPrimary }} />
              ) : (
                <span style={{ fontSize: 12.5, color: C.textTertiary, fontWeight: 500 }}>{h.weight || 0}%</span>
              )}
              {editing && (
                <button onClick={() => setPortfolio(prev => prev.filter(p => p.ticker !== h.ticker))} style={{ background: C.riskBg, border: "none", color: C.riskText, width: 26, height: 26, borderRadius: "50%", fontSize: 14, cursor: "pointer", flexShrink: 0 }}>×</button>
              )}
            </div>
            {h.exposure && (
              <p style={{ fontSize: 10.5, color: C.textTertiary, margin: "7px 0 0 48px", fontStyle: "italic" }}>What this bets on: {h.exposure}</p>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div style={{ background: C.bgCard, borderRadius: 14, border: `1px solid ${C.border}`, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: C.textSecondary, marginBottom: 11 }}>Add a holding</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input value={ticker} onChange={e => setTicker(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Ticker"
              style={{ flex: "0 0 90px", background: C.bgSubtle, border: `1px solid ${C.borderStrong}`, borderRadius: 9, padding: "9px 10px", fontSize: 13, color: C.textPrimary }} />
            <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Company name"
              style={{ flex: 1, background: C.bgSubtle, border: `1px solid ${C.borderStrong}`, borderRadius: 9, padding: "9px 10px", fontSize: 13, color: C.textPrimary }} />
            <input type="number" min="0" max="100" value={weight} onChange={e => setWeight(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="%"
              style={{ flex: "0 0 54px", background: C.bgSubtle, border: `1px solid ${C.borderStrong}`, borderRadius: 9, padding: "9px 6px", fontSize: 13, textAlign: "center", color: C.textPrimary }} />
          </div>
          <button onClick={add} style={{ width: "100%", background: C.textPrimary, color: "#fff", border: "none", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Add to portfolio
          </button>
        </div>
      )}

      <div style={{ background: C.bgCard, borderRadius: 14, border: `1px solid ${C.border}`, padding: "14px 16px" }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: C.textTertiary, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 10 }}>How it works</p>
        {[
          ["Free, always", "No API key, no login, no subscription"],
          ["Live news", "Yahoo Finance + Google News, fetched fresh each time"],
          ["Plain English", "Every story explained simply, no jargon"],
        ].map(([title, desc]) => (
          <div key={title} style={{ padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: C.textPrimary, margin: 0 }}>{title}</p>
            <p style={{ fontSize: 11.5, color: C.textSecondary, margin: "2px 0 0" }}>{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Calendar (placeholder simple screen) ──────────────────────────────────────
function CalendarScreen() {
  return (
    <div style={{ padding: "16px 16px 90px", textAlign: "center" }}>
      <p style={{ fontSize: 17, fontWeight: 600, color: C.textPrimary, marginBottom: 8 }}>Calendar</p>
      <p style={{ fontSize: 12.5, color: C.textSecondary, lineHeight: 1.6 }}>Earnings dates and upcoming events for your holdings — coming soon.</p>
    </div>
  );
}

// ─── Bottom nav ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "holdings", label: "Holdings", icon: "💼" },
  { id: "insider", label: "Insider", icon: "🔍" },
  { id: "macro", label: "Big picture", icon: "🌐" },
  { id: "calendar", label: "Calendar", icon: "📅" },
];

function BottomNav({ active, onChange }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 520, background: C.bgCard, borderTop: `1px solid ${C.border}`, padding: "10px 16px 12px", display: "flex", justifyContent: "space-around" }}>
      {NAV_ITEMS.map(item => (
        <button key={item.id} onClick={() => onChange(item.id)} style={{
          background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
        }}>
          <span style={{ fontSize: 19, opacity: active === item.id ? 1 : 0.45 }}>{item.icon}</span>
          <span style={{ fontSize: 9.5, color: active === item.id ? C.textPrimary : C.textTertiary, fontWeight: active === item.id ? 600 : 400 }}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [portfolio, setPortfolio] = useState(DEFAULT_PORTFOLIO);
  const [screen, setScreen] = useState("home");
  const [news, setNews] = useState([]);
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "info") => setToast({ msg, type });
  const portfolioWeights = useMemo(() => Object.fromEntries(portfolio.map(p => [p.ticker, p.weight || 0])), [portfolio]);

  const fetchNews = useCallback(async () => {
    if (loading) return;
    setLoading(true); setError(null); setFilter("all");
    try {
      const items = await fetchNewsFree(portfolio);
      if (!items.length) { setError("No stories found"); setLoading(false); return; }
      const P = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const sorted = dedup(items).sort((a, b) => (P[a.priority] ?? 4) - (P[b.priority] ?? 4));
      setNews(sorted);
      setBrief(computeBrief(sorted, portfolio));
      setLoaded(true);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      showToast(`Updated with ${sorted.length} stories`, "success");
    } catch (e) {
      setError("Couldn't load news");
    } finally { setLoading(false); }
  }, [portfolio, loading]);

  const filteredNews = news.filter(item => {
    if (filter === "all") return true;
    if (filter === "Positive") return item.sentiment === "Positive";
    if (filter === "Negative") return item.sentiment === "Negative";
    return true;
  });
  const counts = {
    Positive: news.filter(i => i.sentiment === "Positive").length,
    Negative: news.filter(i => i.sentiment === "Negative").length,
  };

  return (
    <div style={{ background: C.bgPage, minHeight: "100vh", fontFamily: SANS }}>
      <style>{`
        *{box-sizing:border-box}
        input{outline:none}
        ::-webkit-scrollbar{width:0;height:0}
        button:active{opacity:.85}
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      `}</style>

      <div style={{ maxWidth: 520, margin: "0 auto", background: C.bgPage, minHeight: "100vh" }}>
        {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

        {/* Header */}
        <div style={{ background: C.bgCard, padding: "16px 16px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 18, fontWeight: 600, margin: 0, color: C.textPrimary }}>Good morning</p>
              <p style={{ fontSize: 11, color: C.textTertiary, margin: "2px 0 0" }}>
                {portfolio.length} holdings · {lastUpdated ? `updated ${lastUpdated}` : "not yet refreshed"}
              </p>
            </div>
            <button onClick={fetchNews} disabled={loading} style={{ position: "relative", background: "none", border: "none", cursor: loading ? "default" : "pointer", padding: 4 }}>
              <span style={{ fontSize: 19, color: C.textSecondary, display: "inline-block", animation: loading ? "spin 1s linear infinite" : "none" }}>↻</span>
              {!loading && <span style={{ position: "absolute", top: 2, right: 2, width: 7, height: 7, borderRadius: "50%", background: C.danger }} />}
            </button>
          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ height: 1, background: C.border, marginTop: 14 }} />
        </div>

        {/* Screens */}
        {screen === "home" && (
          <HomeScreen
            portfolio={portfolio} news={news} brief={brief}
            loading={loading} loaded={loaded} error={error} onFetch={fetchNews}
            filter={filter} setFilter={setFilter} counts={counts}
            filteredNews={filteredNews} portfolioWeights={portfolioWeights}
          />
        )}
        {screen === "holdings" && <HoldingsScreen portfolio={portfolio} setPortfolio={setPortfolio} />}
        {screen === "insider" && <InsiderScreen portfolio={portfolio} />}
        {screen === "macro" && <MacroScreen portfolio={portfolio} />}
        {screen === "calendar" && <CalendarScreen />}

        <BottomNav active={screen} onChange={setScreen} />
      </div>
    </div>
  );
}
