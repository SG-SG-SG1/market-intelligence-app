import { useState, useCallback, useEffect } from "react";

// ─── Default Portfolio ────────────────────────────────────────────────────────
const DEFAULT_PORTFOLIO = [
  { ticker: "NVDA", name: "NVIDIA Corp",      weight: 20 },
  { ticker: "MSFT", name: "Microsoft",         weight: 20 },
  { ticker: "AAPL", name: "Apple Inc",         weight: 15 },
  { ticker: "GOOGL", name: "Alphabet",         weight: 15 },
  { ticker: "AMZN", name: "Amazon",            weight: 15 },
  { ticker: "VOO",  name: "Vanguard S&P 500",  weight: 8  },
  { ticker: "QQQ",  name: "Invesco Nasdaq",    weight: 7  },
];

// ─── Sentiment (negation-aware, local — instant, free) ────────────────────────
const POS_WORDS = ["surge","surges","jumps","beat","beats","upgrade","growth","record","rally","gain","profit","rises","boost","strong","outperform","soar","higher","positive","bullish","expands","wins","launches","partnership","deal","approved","best"];
const NEG_WORDS = ["falls","drops","misses","downgrade","loss","decline","cut","crash","warn","warning","weak","bearish","slump","plunge","below","concern","risk","layoffs","recall","fine","lawsuit","probe","restrict","ban","tariff","tumbles","sinks","hurt","pressure","delay","cancel","investigation","fraud","worst"];
const NEGATIONS = ["not","no","never","without","despite","although"];

function sentiment(text) {
  const words = text.toLowerCase().split(/\W+/);
  let p = 0, n = 0;
  words.forEach((w, i) => {
    const negated = NEGATIONS.includes(words[i-1] || "");
    if (POS_WORDS.includes(w)) negated ? n++ : p++;
    if (NEG_WORDS.includes(w)) negated ? p++ : n++;
  });
  if (p > n) return "Positive";
  if (n > p) return "Negative";
  return "Neutral";
}

function category(text) {
  const t = text.toLowerCase();
  if (["form 4","insider","ceo buy","director buy","bought shares"].some(w => t.includes(w))) return "Insider";
  if (["fed ","federal reserve","inflation","cpi","gdp","fomc","interest rate","tariff","treasury","unemployment","jobs report"].some(w => t.includes(w))) return "Macro";
  if (["earnings","revenue","eps","quarterly","guidance","q1","q2","q3","q4","outlook","results"].some(w => t.includes(w))) return "Earnings";
  if (["analyst","price target","rating","upgrade","downgrade","overweight"].some(w => t.includes(w))) return "Analyst";
  return "News";
}

function priority(text, sent) {
  const hi = ["earnings","fed","fomc","cpi","merger","acquisition","lawsuit","breaking","record","crash","insider","bankrupt","sec","investigation","fraud","guidance","results"];
  if (hi.some(w => text.toLowerCase().includes(w))) return sent === "Negative" ? "Critical" : "High";
  if (sent !== "Neutral") return "High";
  return "Medium";
}

function makeId() { return Math.random().toString(36).slice(2,10); }

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

// ─── Fetch news from our FREE serverless function (no API key, no cost) ──────
async function fetchNewsFree(portfolio) {
  const tickers = portfolio.map(p => p.ticker).join(",");
  const res = await fetch(`/api/news?tickers=${encodeURIComponent(tickers)}`);
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (data.items || []).map(item => {
    const text = `${item.headline} ${item.summary}`;
    const sent = sentiment(text);
    return {
      id: makeId(),
      ticker: item.ticker,
      headline: item.headline,
      source: item.source,
      sourceUrl: item.sourceUrl,
      publishedAt: timeAgo(item.publishedAt),
      summary: item.summary,
      sentiment: sent,
      category: category(text),
      priority: priority(text, sent),
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
  return portfolio.map(p => {
    const relevant = allNews.filter(n => n.ticker === p.ticker);
    if (!relevant.length) return { ticker: p.ticker, score: 5, label: "Unknown", color: "#6b7280" };
    const neg = relevant.filter(n => n.sentiment === "Negative").length;
    const crit = relevant.filter(n => n.priority === "Critical").length;
    const pos = relevant.filter(n => n.sentiment === "Positive").length;
    let score = 5 + (neg * 1.5) + (crit * 2) - (pos * 1);
    score = Math.max(1, Math.min(10, Math.round(score)));
    const label = score >= 8 ? "High Risk" : score >= 5 ? "Moderate" : "Low Risk";
    const color = score >= 8 ? "#ef4444" : score >= 5 ? "#f59e0b" : "#22c55e";
    return { ticker: p.ticker, score, label, color };
  });
}

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
  const totalPos = allNews.filter(i => i.sentiment === "Positive").length;
  const totalNeg = allNews.filter(i => i.sentiment === "Negative").length;

  let mood = "MIXED";
  if (critItems.some(i => i.sentiment === "Negative")) mood = "BEARISH";
  else if (totalPos > totalNeg * 1.5) mood = "BULLISH";
  else if (totalNeg > totalPos * 1.5) mood = "CAUTIOUS";

  const parts = [];
  if (positives.length) parts.push(`${positives.slice(0, 3).join(", ")} ${positives.length === 1 ? "is" : "are"} showing positive momentum today`);
  if (negatives.length) parts.push(`${negatives.slice(0, 3).join(", ")} ${negatives.length === 1 ? "is" : "are"} facing headwinds — worth a closer look`);
  if (critItems.length) parts.push(`Biggest thing to watch: ${critItems[0].headline.slice(0, 80)}${critItems[0].headline.length > 80 ? "…" : ""} (${critItems[0].ticker})`);
  if (!parts.length) parts.push("No major sentiment swings detected across your holdings right now — a relatively quiet news cycle.");

  return { mood, text: parts.join(". ") + "." };
}

// ─── Colour maps ──────────────────────────────────────────────────────────────
const SC = {
  Positive: { color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.28)", bar: "#22c55e" },
  Negative: { color: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.28)", bar: "#ef4444" },
  Neutral:  { color: "#60a5fa", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.28)", bar: "#60a5fa" },
};
const PC = {
  Critical: { color: "#ef4444", bg: "rgba(239,68,68,0.16)", label: "🔴 Critical" },
  High:     { color: "#f59e0b", bg: "rgba(245,158,11,0.13)", label: "🟡 High" },
  Medium:   { color: "#60a5fa", bg: "rgba(96,165,250,0.12)", label: "🔵 Medium" },
  Low:      { color: "#6b7280", bg: "rgba(107,114,128,0.1)", label: "⚪ Low" },
};
const CAT_ICON = { Insider: "🔍", Macro: "🌐", Earnings: "📊", Analyst: "🎯", News: "📰" };
const MOOD_CFG = {
  BULLISH:  { color: "#22c55e", label: "🟢 Bullish" },
  CAUTIOUS: { color: "#f59e0b", label: "🟡 Cautious" },
  BEARISH:  { color: "#ef4444", label: "🔴 Bearish" },
  MIXED:    { color: "#60a5fa", label: "🔵 Mixed Signals" },
};

const DECISION_MAP = {
  Critical_Negative: { label: "⚠️ Review Position",  color: "#ef4444", bg: "rgba(239,68,68,0.12)",  tip: "Significant negative event. Reassess your position size." },
  High_Negative:     { label: "👀 Watch Closely",     color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  tip: "Negative news with high impact. Monitor for further developments." },
  High_Positive:      { label: "✅ Hold / Add",        color: "#22c55e", bg: "rgba(34,197,94,0.1)",   tip: "Strong positive signal. Consider adding if within your plan." },
  Critical_Positive:  { label: "✅ Strong Buy Signal", color: "#22c55e", bg: "rgba(34,197,94,0.15)",  tip: "Major positive event. High conviction to hold or increase." },
  Medium_Positive:    { label: "🟢 Hold",              color: "#22c55e", bg: "rgba(34,197,94,0.08)",  tip: "Positive development. No action needed — hold your position." },
  Medium_Negative:    { label: "👀 Monitor",           color: "#f59e0b", bg: "rgba(245,158,11,0.08)", tip: "Developing negative story. Keep an eye on it." },
  _default:           { label: "⏸️ No Action Needed",  color: "#6b7280", bg: "rgba(107,114,128,0.08)", tip: "Neutral news. No immediate action required." },
};
function getDecision(item) { return DECISION_MAP[`${item.priority}_${item.sentiment}`] || DECISION_MAP._default; }

// ─── Portfolio Health ─────────────────────────────────────────────────────────
function PortfolioHealth({ brief, news }) {
  if (!brief) return null;
  const mood = MOOD_CFG[brief.mood] || MOOD_CFG.MIXED;
  const pos = news.filter(n => n.sentiment === "Positive").length;
  const neg = news.filter(n => n.sentiment === "Negative").length;
  return (
    <div style={{ background: "linear-gradient(135deg,rgba(37,99,235,0.1),rgba(96,165,250,0.04))", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 14, padding: "13px 15px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span style={{ fontSize: 14 }}>🌅</span>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: mood.color }}>{mood.label}</p>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", padding: "2px 7px", borderRadius: 20 }}>🟢{pos} 🔴{neg}</span>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.8 }}>{brief.text}</p>
    </div>
  );
}

function CorrelationAlert({ news }) {
  const negNews = news.filter(n => n.sentiment === "Negative");
  const tickerSet = new Set(negNews.map(n => n.ticker));
  if (tickerSet.size < 2) return null;
  const tickers = [...tickerSet].slice(0, 4);
  return (
    <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "11px 14px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>⚡</span>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#ef4444" }}>Correlated risk detected</p>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "#fca5a5", lineHeight: 1.5 }}>
            {tickers.join(", ")} all have negative news today — {tickers.length} holdings facing headwinds simultaneously.
          </p>
        </div>
      </div>
    </div>
  );
}

function RiskDashboard({ riskScores }) {
  if (!riskScores || !riskScores.length) return null;
  return (
    <div style={{ background: "#13161f", border: "1px solid #1e2535", borderRadius: 14, padding: "13px 15px", marginBottom: 14 }}>
      <p style={{ margin: "0 0 11px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Risk score by holding</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {riskScores.map(r => (
          <div key={r.ticker} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", width: 44, flexShrink: 0 }}>{r.ticker}</span>
            <div style={{ flex: 1, height: 6, background: "#1e2535", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${r.score * 10}%`, height: "100%", background: r.color, borderRadius: 3, transition: "width 0.6s ease" }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: r.color, width: 80, textAlign: "right", flexShrink: 0 }}>{r.score}/10 {r.label}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 10, color: "#4b5563" }}>Based on news sentiment & critical alerts</p>
    </div>
  );
}

function AllocationChart({ portfolio }) {
  const colors = ["#2563eb", "#22c55e", "#f59e0b", "#a78bfa", "#ef4444", "#60a5fa", "#f97316", "#14b8a6"];
  const total = portfolio.reduce((s, p) => s + (p.weight || 0), 0) || 100;
  return (
    <div>
      <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Allocation</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {portfolio.map((h, i) => {
          const fallback = portfolio.length > 0 ? Math.round(100 / portfolio.length) : 0;
          const pct = total > 0 ? Math.round((h.weight || fallback) / total * 100) : 0;
          return (
            <div key={h.ticker} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors[i % colors.length], width: 44, flexShrink: 0 }}>{h.ticker}</span>
              <div style={{ flex: 1, height: 6, background: "#1e2535", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: colors[i % colors.length], borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 10, color: "#6b7280", width: 32, textAlign: "right", flexShrink: 0 }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── NewsCard ─────────────────────────────────────────────────────────────────
function NewsCard({ item, portfolioWeights }) {
  const [open, setOpen] = useState(false);
  const sc = SC[item.sentiment] || SC.Neutral;
  const pc = PC[item.priority] || PC.Medium;
  const decision = getDecision(item);
  const weight = (portfolioWeights || {})[item.ticker];

  return (
    <div style={{ background: "#13161f", border: "1px solid #1e2535", borderLeft: `3px solid ${sc.bar}`, borderRadius: 14, marginBottom: 9, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "13px 14px 11px", cursor: "pointer" }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: pc.bg, color: pc.color }}>{pc.label}</span>
          <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{item.sentiment}</span>
          <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "rgba(255,255,255,0.05)", color: "#9ca3af" }}>{CAT_ICON[item.category]} {item.category}</span>
          <span style={{ fontSize: 9, color: "#4b5563", marginLeft: "auto" }}>{item.publishedAt}</span>
        </div>
        <p style={{ margin: "0 0 9px", fontSize: 13, fontWeight: 600, lineHeight: 1.45, color: "#f1f5f9" }}>{item.headline}</p>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.2)" }}>{item.ticker}</span>
          {weight != null && <span style={{ fontSize: 9, color: "#6b7280" }}>{weight}% of portfolio</span>}
          <span style={{ fontSize: 10, color: "#4b5563", marginLeft: 4 }}>· {item.source}</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#4b5563", display: "inline-block", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }}>▾</span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: "1px solid #1e2535", padding: "12px 14px 14px" }}>
          <div style={{ background: decision.bg, borderRadius: 10, padding: "10px 13px", marginBottom: 12 }}>
            <p style={{ margin: "0 0 3px", fontSize: 11, fontWeight: 700, color: decision.color }}>Decision: {decision.label}</p>
            <p style={{ margin: 0, fontSize: 11, color: decision.color, opacity: 0.85, lineHeight: 1.5 }}>{decision.tip}</p>
          </div>

          {item.summary && <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#9ca3af", lineHeight: 1.75 }}>{item.summary}</p>}

          <div style={{ background: "rgba(96,165,250,0.07)", borderLeft: "2px solid rgba(96,165,250,0.4)", borderRadius: 9, padding: "10px 12px", marginBottom: 12 }}>
            <p style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.6px" }}>What this means for you</p>
            <p style={{ margin: 0, fontSize: 12, color: "#cbd5e1", lineHeight: 1.65 }}>
              {item.sentiment === "Positive"
                ? `Good news for your ${item.ticker} holding${weight != null ? ` (${weight}% of your portfolio)` : ""}. Positive developments like this can push the stock price higher.`
                : item.sentiment === "Negative"
                ? `Watch your ${item.ticker} position${weight != null ? ` (${weight}% of your portfolio)` : ""}. This kind of news can put downward pressure on the stock.`
                : `A developing story around ${item.ticker}. Worth monitoring — no immediate action needed.`}
            </p>
          </div>

          {item.sourceUrl?.startsWith("http") && (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 14px", background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 9, color: "#60a5fa", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
              📰 Read full article on {item.source} ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Skeleton({ count = 5 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ background: "#13161f", border: "1px solid #1e2535", borderRadius: 14, padding: "16px 14px", borderLeft: "3px solid #1e2535" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {[70, 55, 45].map((w, j) => (
              <div key={j} style={{ width: w, height: 16, borderRadius: 20, background: "linear-gradient(90deg,#1e2535 25%,#2a3048 50%,#1e2535 75%)", backgroundSize: "200% 100%", animation: `shimmer 1.4s infinite ${j * 0.15}s` }} />
            ))}
          </div>
          <div style={{ height: 13, borderRadius: 6, background: "linear-gradient(90deg,#1e2535 25%,#2a3048 50%,#1e2535 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite", marginBottom: 7 }} />
          <div style={{ height: 13, borderRadius: 6, width: "72%", background: "linear-gradient(90deg,#1e2535 25%,#2a3048 50%,#1e2535 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite 0.1s" }} />
        </div>
      ))}
    </div>
  );
}

function SummaryBar({ items }) {
  const pos = items.filter(i => i.sentiment === "Positive").length;
  const neg = items.filter(i => i.sentiment === "Negative").length;
  const crit = items.filter(i => i.priority === "Critical").length;
  return (
    <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
      {[
        { label: "Total", value: items.length, color: "#9ca3af", bg: "rgba(255,255,255,0.05)" },
        { label: "🟢 Good", value: pos, color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
        { label: "🔴 Risk", value: neg, color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
        ...(crit > 0 ? [{ label: "🚨 Critical", value: crit, color: "#ef4444", bg: "rgba(239,68,68,0.18)" }] : []),
      ].map(s => (
        <div key={s.label} style={{ flex: 1, minWidth: 52, background: s.bg, borderRadius: 10, padding: "8px 8px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: s.color }}>{s.value}</p>
          <p style={{ margin: "2px 0 0", fontSize: 9, color: s.color, opacity: 0.85, whiteSpace: "nowrap" }}>{s.label}</p>
        </div>
      ))}
    </div>
  );
}

function FilterBar({ active, onChange, counts }) {
  const filters = [
    { key: "all", label: "All" }, { key: "Critical", label: "🔴 Critical" }, { key: "Positive", label: "🟢 Good" },
    { key: "Negative", label: "🔴 Bad" }, { key: "Earnings", label: "📊 Earnings" }, { key: "Macro", label: "🌐 Macro" },
    { key: "Analyst", label: "🎯 Analyst" }, { key: "Insider", label: "🔍 Insider" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 12, scrollbarWidth: "none" }}>
      {filters.map(f => {
        const c = f.key === "all" ? counts.all : (counts[f.key] || 0);
        if (f.key !== "all" && c === 0) return null;
        const isActive = active === f.key;
        return (
          <button key={f.key} onClick={() => onChange(f.key)} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 20, border: isActive ? "1px solid #2563eb" : "1px solid #1e2535", background: isActive ? "#2563eb" : "#13161f", color: isActive ? "#fff" : "#9ca3af", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            {f.label}{c > 0 ? ` (${c})` : ""}
          </button>
        );
      })}
    </div>
  );
}

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  const colors = { success: "#22c55e", error: "#ef4444", info: "#60a5fa" };
  return (
    <div onClick={onClose} style={{ position: "fixed", bottom: 86, left: "50%", transform: "translateX(-50%)", background: "#1a1d2e", border: `1px solid ${colors[type] || colors.info}`, color: "#f1f5f9", padding: "10px 18px", borderRadius: 12, fontSize: 13, fontWeight: 500, zIndex: 9999, whiteSpace: "nowrap", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", maxWidth: "88vw", cursor: "pointer" }}>
      {msg}
    </div>
  );
}

function PortfolioScreen({ portfolio, setPortfolio }) {
  const [editing, setEditing] = useState(false);
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");

  const add = () => {
    const t = ticker.toUpperCase().trim();
    if (!t || portfolio.find(p => p.ticker === t)) return;
    setPortfolio(prev => [...prev, { ticker: t, name: name.trim() || t, weight: Number(weight) || Math.round(100 / (prev.length + 1)) }]);
    setTicker(""); setName(""); setWeight("");
  };

  const totalWeight = portfolio.reduce((s, p) => s + (p.weight || 0), 0);

  return (
    <div style={{ padding: "14px 14px 90px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>Your holdings</p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6b7280" }}>{portfolio.length} stocks & ETFs · {totalWeight}% allocated</p>
        </div>
        <button onClick={() => setEditing(e => !e)} style={{ background: editing ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.05)", color: editing ? "#60a5fa" : "#9ca3af", border: `1px solid ${editing ? "rgba(96,165,250,0.3)" : "#1e2535"}`, borderRadius: 9, padding: "7px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
          {editing ? "Done ✓" : "Edit"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {portfolio.map((h, i) => {
          const colors = ["#2563eb", "#22c55e", "#f59e0b", "#a78bfa", "#ef4444", "#60a5fa", "#f97316", "#14b8a6"];
          return (
            <div key={h.ticker} style={{ background: "#13161f", border: "1px solid #1e2535", borderRadius: 12, padding: "11px 13px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#60a5fa" }}>{h.ticker}</p>
                  {editing ? (
                    <input type="number" min="0" max="100" value={h.weight || ""} onChange={e => {
                      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      setPortfolio(prev => prev.map(p => p.ticker === h.ticker ? { ...p, weight: v } : p));
                    }} placeholder="%" style={{ width: 42, background: "#0d1017", border: "1px solid #1e2535", borderRadius: 5, padding: "2px 6px", color: "#f59e0b", fontSize: 11, textAlign: "center" }} />
                  ) : (
                    <span style={{ fontSize: 10, color: colors[i % colors.length], fontWeight: 600 }}>{h.weight || 0}%</span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 10, color: "#4b5563" }}>{h.name}</p>
                <div style={{ marginTop: 5, height: 3, background: "#1e2535", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min((h.weight || 0), 100)}%`, height: "100%", background: colors[i % colors.length], borderRadius: 2 }} />
                </div>
              </div>
              {editing && (
                <button onClick={() => setPortfolio(prev => prev.filter(p => p.ticker !== h.ticker))} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", borderRadius: 6, width: 22, height: 22, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, marginLeft: 6, flexShrink: 0 }}>×</button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ background: "#13161f", border: "1px solid #1e2535", borderRadius: 14, padding: "14px 15px", marginBottom: 14 }}>
        <AllocationChart portfolio={portfolio} />
      </div>

      {editing && (
        <div style={{ background: "#13161f", border: "1px solid #1e2535", borderRadius: 14, padding: 15, marginBottom: 14 }}>
          <p style={{ margin: "0 0 11px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Add a holding</p>
          <div style={{ display: "flex", gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
            <input value={ticker} onChange={e => setTicker(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Ticker" style={{ flex: "0 0 80px", background: "#0d1017", border: "1px solid #1e2535", borderRadius: 9, padding: "9px 10px", color: "#f1f5f9", fontSize: 13 }} />
            <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Company name" style={{ flex: 2, background: "#0d1017", border: "1px solid #1e2535", borderRadius: 9, padding: "9px 10px", color: "#f1f5f9", fontSize: 13 }} />
            <input type="number" min="0" max="100" value={weight} onChange={e => setWeight(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="%" style={{ flex: "0 0 52px", background: "#0d1017", border: "1px solid #1e2535", borderRadius: 9, padding: "9px 8px", color: "#f59e0b", fontSize: 13, textAlign: "center" }} />
          </div>
          <button onClick={add} style={{ width: "100%", background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add to portfolio</button>
        </div>
      )}

      <div style={{ background: "#13161f", border: "1px solid #1e2535", borderRadius: 12, padding: "13px 15px" }}>
        <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.6px" }}>How it works</p>
        {[
          ["🆓", "100% free, forever", "Yahoo Finance RSS — no API key, no cost, ever"],
          ["⚡", "Server-side fetching", "Runs on Vercel's free tier — fast and reliable"],
          ["🎯", "Decision signals", "Buy/Hold/Watch for every article"],
          ["⚖️", "Weighted impact", "Holdings with higher % matter more"],
          ["📱", "Works everywhere", "Phone, tablet, or computer — same link"],
        ].map(([icon, title, desc]) => (
          <div key={title} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #1e2535" }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{title}</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6b7280" }}>{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  { id: "feed", label: "My Feed", icon: "📡" },
  { id: "portfolio", label: "Portfolio", icon: "💼" },
];

export default function App() {
  const [portfolio, setPortfolio] = useState(DEFAULT_PORTFOLIO);
  const [tab, setTab] = useState("feed");
  const [news, setNews] = useState([]);
  const [brief, setBrief] = useState(null);
  const [riskScores, setRiskScores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("all");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);

  const showToast = (msg, type = "info") => setToast({ msg, type });
  const portfolioWeights = Object.fromEntries(portfolio.map(p => [p.ticker, p.weight || 0]));

  const fetchNews = useCallback(async () => {
    if (loading) return;
    setLoading(true); setError(null); setFilter("all");
    try {
      const items = await fetchNewsFree(portfolio);
      if (!items.length) { setError("No articles found right now. Try again in a moment."); setLoading(false); return; }
      const PRIO = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const sorted = dedup(items).sort((a, b) => (PRIO[a.priority] ?? 4) - (PRIO[b.priority] ?? 4));
      setNews(sorted);
      setRiskScores(computeRiskScores(sorted, portfolio));
      setBrief(computeBrief(sorted));
      setLoaded(true);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      showToast(`${sorted.length} articles loaded — free ✓`, "success");
    } catch (e) {
      setError(`Couldn't load news: ${e.message}. Tap to retry.`);
    } finally {
      setLoading(false);
    }
  }, [portfolio, loading]);

  const filtered = news.filter(item => {
    if (filter === "all") return true;
    if (filter === "Critical") return item.priority === "Critical";
    if (filter === "Positive") return item.sentiment === "Positive";
    if (filter === "Negative") return item.sentiment === "Negative";
    return item.category === filter;
  });

  const counts = {
    all: news.length,
    Critical: news.filter(i => i.priority === "Critical").length,
    Positive: news.filter(i => i.sentiment === "Positive").length,
    Negative: news.filter(i => i.sentiment === "Negative").length,
    Earnings: news.filter(i => i.category === "Earnings").length,
    Macro: news.filter(i => i.category === "Macro").length,
    Analyst: news.filter(i => i.category === "Analyst").length,
    Insider: news.filter(i => i.category === "Insider").length,
  };

  const critCount = news.filter(i => i.priority === "Critical").length;

  return (
    <div style={{ background: "#0c0e14", minHeight: "100vh", fontFamily: "'Inter',system-ui,sans-serif", color: "#f1f5f9", maxWidth: 500, margin: "0 auto" }}>
      <style>{`*{box-sizing:border-box} input{outline:none;font-family:inherit} ::-webkit-scrollbar{width:0;height:0} @keyframes spin{to{transform:rotate(360deg)}} button:active{opacity:.85}`}</style>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div style={{ padding: "14px 16px 11px", borderBottom: "1px solid #1a1d28", background: "#0c0e14", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: critCount > 0 ? 10 : 0 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.3px" }}>
              Market<span style={{ color: "#2563eb" }}>Intel</span>{" "}
              <span style={{ fontSize: 10, fontWeight: 400, color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", padding: "2px 7px", borderRadius: 20 }}>Free Forever</span>
            </h1>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "#4b5563" }}>
              {portfolio.length} holdings · {lastUpdated ? `Updated ${lastUpdated}` : "No API key needed"}
            </p>
          </div>
          <button onClick={fetchNews} disabled={loading} style={{ background: loading ? "#1a1d28" : "#2563eb", color: loading ? "#4b5563" : "#fff", border: "none", borderRadius: 10, padding: "9px 15px", fontSize: 12, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {loading ? <><span style={{ width: 12, height: 12, border: "2px solid #4b5563", borderTop: "2px solid #9ca3af", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />Loading…</> : <>↻ Refresh</>}
          </button>
        </div>
        {critCount > 0 && (
          <div style={{ padding: "7px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 9, fontSize: 11, color: "#fca5a5", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            🚨 {critCount} critical alert{critCount > 1 ? "s" : ""} in your feed
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#0d0f17", borderBottom: "1px solid #1a1d28" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "10px 4px 9px", background: "none", border: "none", borderBottom: tab === t.id ? "2px solid #2563eb" : "2px solid transparent", color: tab === t.id ? "#60a5fa" : "#6b7280", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 17 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {tab === "feed" && (
        <div style={{ padding: "13px 13px 90px" }}>
          {loaded && !loading && (<><PortfolioHealth brief={brief} news={news} /><CorrelationAlert news={news} /><RiskDashboard riskScores={riskScores} /></>)}

          {!loaded && !loading && !error && (
            <div style={{ textAlign: "center", padding: "52px 20px 40px" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 18px", background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📡</div>
              <p style={{ fontWeight: 600, fontSize: 15, color: "#f1f5f9", margin: "0 0 8px" }}>Your feed is ready</p>
              <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24, lineHeight: 1.65 }}>Tap below to get real news for your portfolio — 100% free, forever.</p>
              <button onClick={fetchNews} style={{ background: "#2563eb", color: "#fff", border: "none", padding: "13px 32px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Get my news feed →</button>
            </div>
          )}

          {loading && (<><div style={{ textAlign: "center", padding: "20px 16px 0" }}><p style={{ fontSize: 13, color: "#6b7280" }}>🔍 Fetching from Yahoo Finance…</p></div><div style={{ marginTop: 16 }}><Skeleton /></div></>)}

          {error && !loading && (
            <div style={{ margin: "24px 0", padding: "16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "#fca5a5", marginBottom: 12 }}>{error}</p>
              <button onClick={fetchNews} style={{ background: "#2563eb", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Try again</button>
            </div>
          )}

          {loaded && !loading && (
            <>
              <SummaryBar items={news} />
              <FilterBar active={filter} onChange={setFilter} counts={counts} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 11 }}>
                <p style={{ margin: 0, fontSize: 11, color: "#4b5563" }}>{filtered.length} articles · {portfolio.length} holdings</p>
                <button onClick={fetchNews} style={{ background: "none", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Refresh</button>
              </div>
              {filtered.length === 0
                ? <div style={{ textAlign: "center", padding: "36px 20px", color: "#6b7280", fontSize: 13 }}>No {filter} stories right now.</div>
                : filtered.map(item => <NewsCard key={item.id} item={item} portfolioWeights={portfolioWeights} />)}
            </>
          )}
        </div>
      )}

      {tab === "portfolio" && <PortfolioScreen portfolio={portfolio} setPortfolio={setPortfolio} />}

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 500, background: "#0d0f17", borderTop: "1px solid #1a1d28", padding: "7px 0 12px", display: "flex", zIndex: 99 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, background: "none", border: "none", padding: "4px 0", color: tab === t.id ? "#60a5fa" : "#4b5563", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontSize: 10, fontWeight: tab === t.id ? 600 : 400 }}>
            <span style={{ fontSize: 20 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
