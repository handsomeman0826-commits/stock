import { useState, useEffect, useRef, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Settings, Plus, X, Trash2, TrendingUp, TrendingDown, AlertTriangle,
  ShoppingCart, XCircle, Minus, Search, Landmark, Receipt, Pencil,
} from "lucide-react";

const DEFAULT_THRESHOLD = 7;
const TICK_MS = 4000;
const LOT = 1000; // 台股一張 = 1,000 股
const UNCATEGORIZED = "未分類";

const DEFAULT_HOLDINGS = [
  { id: "h6", symbol: "AAPL", name: "蘋果", qty: 5, cost: 180, bank: "銀行B", market: "US" },
  { id: "h7", symbol: "NVDA", name: "輝達", qty: 3, cost: 120, bank: "銀行B", market: "US" },
];

const STOCK_DB_TW = [
  { symbol: "2330", name: "台積電" }, { symbol: "2317", name: "鴻海" },
  { symbol: "2454", name: "聯發科" }, { symbol: "0050", name: "元大台灣50" },
  { symbol: "2603", name: "長榮" }, { symbol: "2609", name: "陽明" },
  { symbol: "2615", name: "萬海" }, { symbol: "2308", name: "台達電" },
  { symbol: "2882", name: "國泰金" }, { symbol: "2891", name: "中信金" },
  { symbol: "2881", name: "富邦金" }, { symbol: "2412", name: "中華電" },
  { symbol: "3008", name: "大立光" }, { symbol: "2382", name: "廣達" },
  { symbol: "2303", name: "聯電" }, { symbol: "1301", name: "台塑" },
  { symbol: "1303", name: "南亞" }, { symbol: "2002", name: "中鋼" },
  { symbol: "2886", name: "兆豐金" }, { symbol: "0056", name: "元大高股息" },
  { symbol: "00878", name: "國泰永續高股息" }, { symbol: "3711", name: "日月光投控" },
  { symbol: "2357", name: "華碩" }, { symbol: "2379", name: "瑞昱" },
].map((s) => ({ ...s, market: "TW" }));
const STOCK_DB_US = [
  { symbol: "AAPL", name: "蘋果" }, { symbol: "TSLA", name: "特斯拉" },
  { symbol: "NVDA", name: "輝達" }, { symbol: "MSFT", name: "微軟" },
  { symbol: "GOOGL", name: "谷歌" }, { symbol: "AMZN", name: "亞馬遜" },
  { symbol: "META", name: "Meta" }, { symbol: "NFLX", name: "網飛" },
  { symbol: "AMD", name: "超微" }, { symbol: "AVGO", name: "博通" },
].map((s) => ({ ...s, market: "US" }));
const STOCK_DB = [...STOCK_DB_TW, ...STOCK_DB_US];
const QUICK_PICKS = ["2330", "2317", "2454", "0050", "2882", "00878"];
const QUICK_PICKS_US = ["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "AMZN"];
const PIE_COLORS = ["#E38A38", "#4FAF7C", "#D9B44A", "#5B8DBF", "#B5502F", "#8A6BA8", "#6FA089", "#9A9086"];
const EXPENSE_CATEGORIES = ["餐費", "孝親", "股票", "保險", "房貸", "醫療", "訂閱", "社交", "治裝", "娛樂", "交通", "雜費", "菸", "貓貓"];

function money(n) {
  return "NT$" + Math.round(n).toLocaleString("zh-TW");
}
function moneyFor(n, market) {
  return (market === "US" ? "US$" : "NT$") + Math.round(n).toLocaleString("zh-TW");
}
function pct(n) {
  const v = Math.round(n * 100) / 100;
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}
function nowLabel() {
  const d = new Date();
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0") + ":" + d.getSeconds().toString().padStart(2, "0");
}
function dateLabel(d) {
  return (d.getMonth() + 1) + "/" + d.getDate();
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function monthKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function uid() {
  return "p" + Math.random().toString(36).slice(2, 9);
}
function simulateNextPrice(price) {
  const drift = (Math.random() - 0.5) * 0.02;
  const next = price * (1 + drift);
  return Math.max(next, 0.1);
}
function buildDailyHistory(numPoints, endValue, stepDays, volatility) {
  const today = new Date();
  let v = endValue * (0.85 + Math.random() * 0.1);
  const arr = [];
  for (let i = numPoints - 1; i >= 0; i--) {
    v = v * (1 + (Math.random() - 0.48) * volatility);
    const d = new Date(today);
    d.setDate(d.getDate() - i * stepDays);
    arr.push({ t: dateLabel(d), v: i === 0 ? Math.round(endValue) : Math.round(v) });
  }
  return arr;
}

// 本機儲存包裝（取代 Claude Artifact 專屬的 window.storage，改用瀏覽器原生 localStorage）
async function storageGet(key) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : { value: v };
  } catch (e) {
    return null;
  }
}
async function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return { value };
  } catch (e) {
    return null;
  }
}

const RANGE_LABELS = [
  { key: "day", label: "每日" },
  { key: "week", label: "每週" },
  { key: "month", label: "每月" },
  { key: "quarter", label: "每季" },
];
const VIEW_LABELS = [
  { key: "overview", label: "總資產市值" },
  { key: "trend", label: "資產走勢" },
  { key: "allocation", label: "標的佔比" },
];

const emptyForm = { symbol: "", name: "", qty: "", cost: "", amount: "", mode: "qty", bank: "", market: "TW" };
const emptyExpenseForm = { date: todayStr(), category: EXPENSE_CATEGORIES[0], amount: "", note: "" };

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState("assets"); // "assets" | "expenses"

  const [holdings, setHoldings] = useState([]);
  const [live, setLive] = useState({});
  const [histories, setHistories] = useState({ day: [], week: [], month: [], quarter: [] });
  const [heroView, setHeroView] = useState("overview");
  const [chartRange, setChartRange] = useState("day");
  const [assetMarketTab, setAssetMarketTab] = useState("TW");
  const [confirmClearMarket, setConfirmClearMarket] = useState(false);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [quoteMode, setQuoteMode] = useState("simulated"); // "simulated" | "live" | "error"
  const [log, setLog] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const tickRef = useRef(null);

  const [expenses, setExpenses] = useState([]);
  const [expenseView, setExpenseView] = useState("overview"); // "overview" | "category"
  const now0 = new Date();
  const [selectedYear, setSelectedYear] = useState(now0.getFullYear());
  const [selectedMonthNum, setSelectedMonthNum] = useState(now0.getMonth() + 1);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [confirmDeleteExpenseId, setConfirmDeleteExpenseId] = useState(null);

  useEffect(() => {
    (async () => {
      let hs = DEFAULT_HOLDINGS;
      let th = DEFAULT_THRESHOLD;
      let api = "";
      let ex = [];
      try {
        const r = await storageGet("holdings");
        if (r && r.value) hs = JSON.parse(r.value);
      } catch (e) { /* 尚無資料，使用預設 */ }
      try {
        const r2 = await storageGet("settings");
        if (r2 && r2.value) {
          const s = JSON.parse(r2.value);
          th = s.threshold ?? DEFAULT_THRESHOLD;
          api = s.apiBaseUrl || "";
        }
      } catch (e) { /* 尚無資料，使用預設 */ }
      try {
        const r3 = await storageGet("expenses");
        if (r3 && r3.value) ex = JSON.parse(r3.value);
      } catch (e) { /* 尚無資料，預設為空 */ }

      const liveInit = {};
      hs.forEach((h) => {
        let startPrice = h.cost;
        let prevClose = h.cost;
        if (h.symbol === "2603" && hs === DEFAULT_HOLDINGS) {
          prevClose = h.cost * 1.03;
          startPrice = prevClose * 0.92;
        }
        liveInit[h.id] = { price: startPrice, prevClose, alertDismissed: false };
      });
      const total0 = hs.reduce((s, h) => s + (liveInit[h.id]?.price ?? h.cost) * h.qty, 0);

      const dayHist = [];
      let v = total0 * (0.95 + Math.random() * 0.03);
      for (let i = 14; i >= 0; i--) {
        v = v * (1 + (Math.random() - 0.48) * 0.01);
        dayHist.push({ t: `D-${i}`, v: Math.round(i === 0 ? total0 : v) });
      }
      const weekHist = buildDailyHistory(7, total0, 1, 0.02);
      const monthHist = buildDailyHistory(30, total0, 1, 0.018);
      const quarterHist = buildDailyHistory(13, total0, 7, 0.045);

      setHoldings(hs);
      setLive(liveInit);
      setThreshold(th);
      setApiBaseUrl(api);
      setHistories({ day: dayHist, week: weekHist, month: monthHist, quarter: quarterHist });
      setExpenses(ex);
      setLoaded(true);
    })();
  }, []);

  const persistHoldings = useCallback(async (hs) => {
    try { await storageSet("holdings", JSON.stringify(hs)); } catch (e) { /* 略過儲存失敗 */ }
  }, []);
  const persistSettings = useCallback(async (th, api) => {
    try { await storageSet("settings", JSON.stringify({ threshold: th, apiBaseUrl: api })); } catch (e) { /* 略過儲存失敗 */ }
  }, []);
  const persistExpenses = useCallback(async (ex) => {
    try { await storageSet("expenses", JSON.stringify(ex)); } catch (e) { /* 略過儲存失敗 */ }
  }, []);

  useEffect(() => {
    if (!loaded) return;

    async function tick() {
      if (apiBaseUrl) {
        try {
          const symbolsParam = holdings.map((h) => `${h.market || "TW"}:${h.symbol}`).join(",");
          const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/quotes?symbols=${encodeURIComponent(symbolsParam)}`);
          if (!res.ok) throw new Error("bad response");
          const data = await res.json();
          setLive((prev) => {
            const next = { ...prev };
            holdings.forEach((h) => {
              const key = `${h.market || "TW"}:${h.symbol}`;
              const q = data[key];
              const cur = next[h.id];
              if (q && typeof q.price === "number" && !Number.isNaN(q.price)) {
                next[h.id] = {
                  ...cur,
                  price: q.price,
                  prevClose: typeof q.prevClose === "number" && !Number.isNaN(q.prevClose) ? q.prevClose : cur?.prevClose,
                };
              }
            });
            return next;
          });
          setQuoteMode("live");
          return;
        } catch (e) {
          setQuoteMode("error");
          // 抓不到就繼續往下用模擬報價，確保畫面還是會動
        }
      } else {
        setQuoteMode("simulated");
      }
      setLive((prev) => {
        const next = { ...prev };
        holdings.forEach((h) => {
          const cur = next[h.id];
          if (!cur) return;
          next[h.id] = { ...cur, price: simulateNextPrice(cur.price) };
        });
        return next;
      });
    }

    tick();
    tickRef.current = setInterval(tick, TICK_MS);
    return () => clearInterval(tickRef.current);
  }, [loaded, holdings, apiBaseUrl]);

  useEffect(() => {
    if (!loaded) return;
    const total = holdings.reduce((s, h) => s + (live[h.id]?.price ?? h.cost) * h.qty, 0);
    if (total <= 0) return;
    const t = setTimeout(() => {
      setHistories((prev) => {
        const day = [...prev.day, { t: nowLabel(), v: Math.round(total) }].slice(-30);
        const patchLast = (arr) => arr.length
          ? [...arr.slice(0, -1), { ...arr[arr.length - 1], v: Math.round(total) }]
          : arr;
        return { day, week: patchLast(prev.week), month: patchLast(prev.month), quarter: patchLast(prev.quarter) };
      });
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  if (!loaded) {
    return <div className="pw-loading">載入資料中…</div>;
  }

  const rows = holdings.map((h) => {
    const l = live[h.id] || { price: h.cost, prevClose: h.cost, alertDismissed: false };
    const value = l.price * h.qty;
    const costValue = h.cost * h.qty;
    const gain = value - costValue;
    const gainPct = costValue > 0 ? (gain / costValue) * 100 : 0;
    const dayChangePct = l.prevClose > 0 ? ((l.price - l.prevClose) / l.prevClose) * 100 : 0;
    const isAlert = dayChangePct <= -threshold && !l.alertDismissed;
    return { ...h, live: l, value, gain, gainPct, dayChangePct, isAlert };
  });

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost * r.qty, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const alerts = rows.filter((r) => r.isAlert);

  const bankMap = {};
  rows.forEach((r) => {
    const b = r.bank && r.bank.trim() ? r.bank.trim() : UNCATEGORIZED;
    if (!bankMap[b]) bankMap[b] = { bank: b, value: 0, cost: 0, count: 0 };
    bankMap[b].value += r.value;
    bankMap[b].cost += r.cost * r.qty;
    bankMap[b].count += 1;
  });
  const bankRows = Object.values(bankMap)
    .map((b) => ({ ...b, gain: b.value - b.cost, gainPct: b.cost > 0 ? ((b.value - b.cost) / b.cost) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  const uniqueBanks = [...new Set(holdings.map((h) => h.bank).filter(Boolean))];

  const pieData = rows
    .filter((r) => r.value > 0)
    .map((r) => ({ key: r.id, label: `${r.symbol} ${r.name}`, value: r.value }))
    .sort((a, b) => b.value - a.value);

  const marketRows = rows.filter((r) => (r.market || "TW") === assetMarketTab);

  // ---- 消費紀錄計算 ----
  const selectedMonthKey = selectedYear + "-" + String(selectedMonthNum).padStart(2, "0");
  const monthExpenses = expenses.filter((e) => e.date && e.date.startsWith(selectedMonthKey));
  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const allExpenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const catMap = {};
  monthExpenses.forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + e.amount; });
  const catPieData = Object.entries(catMap)
    .map(([k, v]) => ({ key: k, label: k, value: v }))
    .sort((a, b) => b.value - a.value);
  const sortedExpenses = [...monthExpenses].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

  function updateLive(id, patch) {
    setLive((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }
  function addLog(entry) {
    setLog((prev) => [{ time: nowLabel(), ...entry }, ...prev].slice(0, 12));
  }
  function handleSell(row) {
    const newHoldings = holdings.filter((h) => h.id !== row.id);
    setHoldings(newHoldings);
    persistHoldings(newHoldings);
    addLog({ action: "賣出", symbol: row.symbol, name: row.name, price: row.live.price });
  }
  function handleBuyDip(row) {
    const addQty = Math.max(1, Math.round(row.qty * 0.5));
    const newCost = (row.cost * row.qty + row.live.price * addQty) / (row.qty + addQty);
    const newHoldings = holdings.map((h) =>
      h.id === row.id ? { ...h, qty: h.qty + addQty, cost: newCost } : h
    );
    setHoldings(newHoldings);
    persistHoldings(newHoldings);
    updateLive(row.id, { prevClose: row.live.price, alertDismissed: true });
    addLog({ action: "加碼買入", symbol: row.symbol, name: row.name, price: row.live.price, qty: addQty });
  }
  function handleDelete(id) {
    const newHoldings = holdings.filter((h) => h.id !== id);
    setHoldings(newHoldings);
    persistHoldings(newHoldings);
  }
  function clearMarketHoldings(market) {
    const newHoldings = holdings.filter((h) => (h.market || "TW") !== market);
    setHoldings(newHoldings);
    persistHoldings(newHoldings);
    setConfirmClearMarket(false);
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setSearchQuery("");
    setSearchOpen(false);
    setShowAdd(true);
  }
  function openEdit(row) {
    setEditing(row.id);
    setForm({ symbol: row.symbol, name: row.name, qty: String(row.qty), cost: String(row.cost), amount: "", mode: "qty", bank: row.bank || "", market: row.market || "TW" });
    setSearchQuery(row.symbol + " " + row.name);
    setSearchOpen(false);
    setShowAdd(true);
  }

  const matches = searchQuery.trim()
    ? STOCK_DB.filter((s) => s.market === form.market && (s.symbol.includes(searchQuery.trim()) || s.name.includes(searchQuery.trim()))).slice(0, 6)
    : [];

  function pickStock(s) {
    setForm((f) => ({ ...f, symbol: s.symbol, name: s.name }));
    setSearchQuery(s.symbol + " " + s.name);
    setSearchOpen(false);
  }

  function adjustQty(step) {
    setForm((f) => {
      const cur = parseFloat(f.qty) || 0;
      const next = Math.max(0, cur + step);
      return { ...f, qty: String(next) };
    });
  }

  const costNum = parseFloat(form.cost) || 0;
  const derivedQty = form.mode === "amount" && costNum > 0
    ? Math.round((parseFloat(form.amount) || 0) / costNum)
    : parseFloat(form.qty) || 0;

  function submitForm() {
    const qty = derivedQty;
    const cost = costNum;
    if (!form.symbol.trim() || !form.name.trim() || !qty || !cost) return;
    const bank = form.bank.trim() || UNCATEGORIZED;
    const market = form.market || "TW";
    if (editing) {
      const newHoldings = holdings.map((h) =>
        h.id === editing ? { ...h, symbol: form.symbol.trim(), name: form.name.trim(), qty, cost, bank, market } : h
      );
      setHoldings(newHoldings);
      persistHoldings(newHoldings);
    } else {
      const id = uid();
      const newHoldings = [...holdings, { id, symbol: form.symbol.trim(), name: form.name.trim(), qty, cost, bank, market }];
      setHoldings(newHoldings);
      persistHoldings(newHoldings);
      setLive((prev) => ({ ...prev, [id]: { price: cost, prevClose: cost, alertDismissed: false } }));
    }
    setShowAdd(false);
  }

  function saveThreshold(v) {
    setThreshold(v);
    persistSettings(v, apiBaseUrl);
  }
  function saveApiBaseUrl(v) {
    setApiBaseUrl(v);
    persistSettings(threshold, v);
  }

  function openAddExpense() {
    setEditingExpenseId(null);
    setExpenseForm(emptyExpenseForm);
    setShowAddExpense(true);
  }
  function openEditExpense(e) {
    setEditingExpenseId(e.id);
    setExpenseForm({ date: e.date, category: e.category, amount: String(e.amount), note: e.note || "" });
    setShowAddExpense(true);
  }
  function submitExpense() {
    const amount = parseFloat(expenseForm.amount);
    if (!amount || amount <= 0 || !expenseForm.date) return;
    if (editingExpenseId) {
      const newExpenses = expenses.map((e) =>
        e.id === editingExpenseId
          ? { ...e, date: expenseForm.date, category: expenseForm.category, amount, note: expenseForm.note.trim() }
          : e
      );
      setExpenses(newExpenses);
      persistExpenses(newExpenses);
    } else {
      const newExpenses = [...expenses, { id: uid(), date: expenseForm.date, category: expenseForm.category, amount, note: expenseForm.note.trim() }];
      setExpenses(newExpenses);
      persistExpenses(newExpenses);
    }
    setShowAddExpense(false);
    setEditingExpenseId(null);
  }
  function deleteExpense(id) {
    const newExpenses = expenses.filter((e) => e.id !== id);
    setExpenses(newExpenses);
    persistExpenses(newExpenses);
    setConfirmDeleteExpenseId(null);
  }

  return (
    <div className="pw-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700&family=Noto+Sans+TC:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        :root{
          --bg:#141210; --surface:#1E1B17; --surface2:#26221D; --ink:#F1EAE0; --muted:#9A9086;
          --line:#332C22; --gain:#DD5B47; --loss:#4FAF7C; --accent:#C1671E; --accent-hi:#E38A38;
          --alert:#E39536; --alertbg:rgba(227,149,54,0.10); --on-accent:#1B140C;
        }
        .pw-app{ font-family:'Noto Sans TC',sans-serif; background:var(--bg); color:var(--ink);
          min-height:100vh; padding:28px; box-sizing:border-box; }
        .pw-loading{ font-family:'Noto Sans TC',sans-serif; padding:60px; text-align:center; color:var(--muted);
          background:var(--bg); min-height:100vh; }
        .pw-page-nav{ display:flex; gap:26px; margin-bottom:20px; }
        .pw-page-nav button{ background:none; border:none; color:var(--muted); font-size:15px; font-weight:700;
          padding:6px 2px 12px; cursor:pointer; border-bottom:2px solid transparent; font-family:'Noto Serif TC',serif;
          display:flex; align-items:center; gap:6px; }
        .pw-page-nav button.active{ color:var(--ink); border-bottom-color:var(--accent); }
        .pw-page-nav button:hover:not(.active){ color:var(--accent-hi); }
        .pw-topbar{ display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:22px;
          padding-bottom:16px; border-bottom:1px solid var(--line); }
        .pw-brand h1{ font-family:'Noto Serif TC',serif; font-size:22px; font-weight:700; margin:0;
          letter-spacing:.02em; color:var(--ink); }
        .pw-brand p{ margin:4px 0 0; color:var(--muted); font-size:12.5px; }
        .pw-actions{ display:flex; gap:8px; }
        .pw-icon-btn{ display:flex; align-items:center; justify-content:center; width:38px; height:38px;
          border-radius:10px; border:1px solid var(--line); background:var(--surface); color:var(--ink); cursor:pointer; }
        .pw-icon-btn:hover{ border-color:var(--accent); color:var(--accent-hi); }
        .pw-add-btn{ display:flex; align-items:center; gap:6px; padding:0 16px; height:38px; border-radius:10px;
          border:1px solid var(--accent); background:var(--accent); color:var(--on-accent); font-size:13.5px; font-weight:700; cursor:pointer; }
        .pw-add-btn:hover{ background:var(--accent-hi); border-color:var(--accent-hi); }
        .pw-card{ background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:18px 20px; }
        .pw-overview-card{ margin-bottom:22px; }
        .pw-view-tabs{ display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; }
        .pw-view-tabs button{ background:var(--surface2); color:var(--muted); border:1px solid var(--line);
          border-radius:20px; padding:7px 16px; font-size:13px; cursor:pointer; font-weight:500; }
        .pw-view-tabs button.active{ background:var(--accent); color:var(--on-accent); border-color:var(--accent); }
        .pw-view-tabs button:hover:not(.active){ border-color:var(--accent); color:var(--accent-hi); }
        .pw-range-tabs{ display:flex; gap:6px; margin-bottom:14px; }
        .pw-range-tabs button{ background:none; color:var(--muted); border:1px solid var(--line);
          border-radius:8px; padding:5px 13px; font-size:12.5px; cursor:pointer; }
        .pw-range-tabs button.active{ background:rgba(193,103,30,0.16); color:var(--accent-hi); border-color:var(--accent); }
        .pw-value-label{ font-size:12.5px; color:var(--muted); margin:0 0 6px; }
        .pw-value-big{ font-family:'IBM Plex Mono',monospace; font-size:34px; font-weight:600; margin:0; color:var(--ink); }
        .pw-value-sub{ margin-top:10px; font-size:14px; font-family:'IBM Plex Mono',monospace; }
        .pw-value-sub.gain{ color:var(--gain); } .pw-value-sub.loss{ color:var(--loss); }
        .pw-mini-row-wrap{ display:flex; gap:28px; margin-top:18px; flex-wrap:wrap; }
        .pw-mini-row{ font-size:12.5px; color:var(--muted); }
        .pw-mini-row b{ display:block; font-family:'IBM Plex Mono',monospace; color:var(--ink); font-weight:600; font-size:15px; margin-top:3px; }
        .pw-alerts{ margin-bottom:22px; }
        .pw-alerts-title{ display:flex; align-items:center; gap:6px; font-size:13.5px; font-weight:700;
          color:var(--alert); margin:0 0 10px; }
        .pw-alert-row{ border:1.5px dashed var(--alert); background:var(--alertbg); border-radius:10px;
          padding:14px 18px; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:12px; flex-wrap:wrap; }
        .pw-alert-left{ display:flex; align-items:center; gap:12px; }
        .pw-stamp{ display:inline-block; border:1px solid var(--alert); color:var(--alert); padding:3px 10px;
          border-radius:20px; font-family:'IBM Plex Mono',monospace; font-size:12px; font-weight:600; transform:rotate(-2deg); background:var(--surface); }
        .pw-alert-name{ font-size:14px; font-weight:700; color:var(--ink); }
        .pw-alert-sub{ font-size:12px; color:var(--muted); margin-top:2px; }
        .pw-pill-group{ display:flex; gap:8px; }
        .pw-pill{ display:flex; align-items:center; gap:5px; border-radius:20px; padding:7px 14px; font-size:13px;
          border:1.5px dashed var(--accent); background:transparent; color:var(--accent-hi); cursor:pointer; font-weight:500; }
        .pw-pill.sell{ border-color:var(--loss); color:var(--loss); }
        .pw-pill:hover{ background:rgba(255,255,255,0.04); }
        .pw-section-title{ font-size:14px; font-weight:700; margin:0 0 10px; color:var(--ink); }
        .pw-section-title-row{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
        .pw-section-title-row .pw-section-title{ margin-bottom:0; }
        .pw-table-wrap{ background:var(--surface); border:1px solid var(--line); border-radius:14px; overflow:hidden; margin-bottom:22px; overflow-x:auto; }
        table.pw-table{ width:100%; border-collapse:collapse; }
        table.pw-table th{ text-align:right; font-size:11.5px; color:var(--muted); font-weight:500;
          padding:10px 14px; border-bottom:1px solid var(--line); white-space:nowrap; }
        table.pw-table th:first-child, table.pw-table td:first-child{ text-align:left; }
        table.pw-table td{ padding:11px 14px; border-bottom:1px solid var(--line); font-family:'IBM Plex Mono',monospace;
          font-size:13.5px; text-align:right; color:var(--ink); white-space:nowrap; }
        table.pw-table tr:last-child td{ border-bottom:none; }
        table.pw-table tr.alert-row td{ background:var(--alertbg); }
        .pw-name-cell{ display:flex; flex-direction:column; }
        .pw-symbol{ font-weight:600; font-size:13.5px; font-family:'IBM Plex Mono',monospace; color:var(--ink); }
        .pw-stockname{ font-size:11.5px; color:var(--muted); font-family:'Noto Sans TC',sans-serif; }
        .pw-bank-tag{ display:inline-block; font-family:'Noto Sans TC',sans-serif; font-size:11.5px;
          color:var(--accent-hi); background:rgba(193,103,30,0.12); border-radius:6px; padding:2px 8px; }
        .pw-gain{ color:var(--gain); } .pw-loss{ color:var(--loss); }
        .pw-row-actions{ display:flex; gap:10px; justify-content:flex-end; align-items:center; }
        .pw-row-icon{ background:none; border:none; cursor:pointer; color:var(--muted); padding:4px; font-family:'Noto Sans TC',sans-serif; font-size:12.5px; }
        .pw-row-icon:hover{ color:var(--accent-hi); }
        .pw-confirm-del{ color:var(--gain); font-weight:700; white-space:nowrap; }
        .pw-confirm-del:hover{ color:var(--gain); opacity:0.8; }
        .pw-log{ background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:16px 20px; }
        .pw-log-item{ display:flex; justify-content:space-between; font-size:12.5px; padding:6px 0;
          border-bottom:1px solid var(--line); font-family:'IBM Plex Mono',monospace; color:var(--ink); }
        .pw-log-item:last-child{ border-bottom:none; }
        .pw-log-empty{ color:var(--muted); font-size:12.5px; }
        .pw-bank-cards{ display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:10px; margin-bottom:22px; }
        .pw-bank-card{ background:var(--surface); border:1px solid var(--line); border-radius:14px;
          padding:14px 16px; display:flex; justify-content:space-between; align-items:center; gap:10px; }
        .pw-bank-left{ display:flex; align-items:center; gap:10px; min-width:0; }
        .pw-bank-icon{ width:34px; height:34px; border-radius:9px; background:rgba(193,103,30,0.14);
          color:var(--accent-hi); display:flex; align-items:center; justify-content:center; flex:none; }
        .pw-bank-name{ font-size:13.5px; font-weight:700; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .pw-bank-sub{ font-size:11px; color:var(--muted); margin-top:2px; white-space:nowrap; }
        .pw-bank-right{ text-align:right; flex:none; }
        .pw-bank-value{ font-family:'IBM Plex Mono',monospace; font-size:14.5px; font-weight:600; color:var(--ink); }
        .pw-bank-gain{ font-family:'IBM Plex Mono',monospace; font-size:11.5px; margin-top:2px; }
        .pw-pie-wrap{ display:grid; grid-template-columns:1fr 1fr; gap:20px; align-items:center; }
        @media (max-width:640px){ .pw-pie-wrap{ grid-template-columns:1fr; } }
        .pw-pie-legend{ display:flex; flex-direction:column; gap:7px; max-height:220px; overflow-y:auto; }
        .pw-pie-legend-item{ display:flex; justify-content:space-between; font-size:12.5px; color:var(--ink); }
        .pw-pie-legend-item .pw-swatch{ display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:6px; }
        .pw-pie-legend-item .pw-lname{ display:flex; align-items:center; color:var(--ink); }
        .pw-pie-legend-item .pw-lpct{ color:var(--muted); font-family:'IBM Plex Mono',monospace; }
        .pw-cat-chip{ display:inline-flex; align-items:center; gap:6px; font-size:11.5px; border-radius:6px; padding:2px 8px; }
        .pw-month-picker{ display:flex; align-items:center; gap:14px; margin-bottom:16px; flex-wrap:wrap; }
        .pw-year-switch{ display:flex; align-items:center; gap:10px; font-family:'IBM Plex Mono',monospace;
          font-size:13.5px; color:var(--ink); font-weight:600; flex:none; }
        .pw-year-switch button{ background:var(--surface); border:1px solid var(--line); color:var(--ink);
          width:26px; height:26px; border-radius:6px; cursor:pointer; font-size:14px; }
        .pw-year-switch button:hover{ border-color:var(--accent); color:var(--accent-hi); }
        .pw-month-chips{ display:flex; flex-wrap:wrap; gap:6px; }
        .pw-month-chip{ border:1px solid var(--line); background:var(--surface); color:var(--muted);
          border-radius:8px; padding:6px 11px; font-size:12.5px; cursor:pointer; font-family:'IBM Plex Mono',monospace; }
        .pw-month-chip:hover{ border-color:var(--accent); color:var(--accent-hi); }
        .pw-month-chip.active{ background:var(--accent); color:var(--on-accent); border-color:var(--accent); font-weight:600; }
        .pw-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center;
          justify-content:center; z-index:50; }
        .pw-modal{ background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:22px 24px; width:360px; max-width:90vw; }
        .pw-modal h3{ font-family:'Noto Serif TC',serif; font-size:17px; margin:0 0 16px; display:flex; justify-content:space-between; align-items:center; color:var(--ink); }
        .pw-field{ margin-bottom:12px; position:relative; }
        .pw-field label{ display:block; font-size:12px; color:var(--muted); margin-bottom:5px; }
        .pw-field input{ width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid var(--line);
          border-radius:8px; font-size:14px; font-family:'IBM Plex Mono',monospace; background:var(--surface2); color:var(--ink); }
        .pw-field input::placeholder{ color:var(--muted); }
        .pw-field input:focus{ outline:none; border-color:var(--accent); }
        .pw-search-wrap input{ font-family:'Noto Sans TC',sans-serif; }
        .pw-search-icon{ position:absolute; right:10px; top:32px; color:var(--muted); pointer-events:none; }
        .pw-suggest{ position:absolute; top:100%; left:0; right:0; background:var(--surface2); border:1px solid var(--line);
          border-radius:8px; margin-top:4px; z-index:10; overflow:hidden; }
        .pw-suggest-item{ display:flex; justify-content:space-between; padding:9px 12px; font-size:13px; cursor:pointer; color:var(--ink); }
        .pw-suggest-item:hover{ background:rgba(193,103,30,0.12); }
        .pw-suggest-item span:last-child{ color:var(--muted); font-size:12px; }
        .pw-chips{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
        .pw-chip{ border:1px solid var(--line); background:var(--surface2); color:var(--ink); border-radius:20px;
          padding:5px 12px; font-size:12px; cursor:pointer; }
        .pw-chip:hover{ border-color:var(--accent); color:var(--accent-hi); }
        .pw-chip.active{ background:var(--accent); color:var(--on-accent); border-color:var(--accent); }
        .pw-segment{ display:flex; border:1px solid var(--line); border-radius:8px; overflow:hidden; margin-bottom:14px; }
        .pw-segment button{ flex:1; background:var(--surface2); color:var(--muted); border:none; padding:8px 0;
          font-size:13px; cursor:pointer; font-weight:500; }
        .pw-segment button.active{ background:var(--accent); color:var(--on-accent); }
        .pw-stepper{ display:flex; align-items:center; gap:8px; }
        .pw-stepper input{ text-align:center; }
        .pw-stepper button{ width:34px; height:34px; flex:none; border-radius:8px; border:1px solid var(--line);
          background:var(--surface2); color:var(--ink); cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .pw-stepper button:hover{ border-color:var(--accent); color:var(--accent-hi); }
        .pw-derived{ font-size:12px; color:var(--muted); margin-top:6px; }
        .pw-derived b{ color:var(--accent-hi); font-family:'IBM Plex Mono',monospace; }
        .pw-modal-actions{ display:flex; gap:8px; margin-top:16px; }
        .pw-btn-primary{ flex:1; background:var(--accent); color:var(--on-accent); border:none; border-radius:8px;
          padding:10px; font-size:13.5px; font-weight:700; cursor:pointer; }
        .pw-btn-primary:hover{ background:var(--accent-hi); }
        .pw-btn-secondary{ flex:1; background:none; border:1px solid var(--line); color:var(--ink);
          border-radius:8px; padding:10px; font-size:13.5px; cursor:pointer; }
        .pw-hint{ font-size:11.5px; color:var(--muted); margin-top:14px; line-height:1.6; }
        .pw-empty{ text-align:center; padding:30px; color:var(--muted); font-size:13px; }
      `}</style>

      <div className="pw-page-nav">
        <button className={page === "assets" ? "active" : ""} onClick={() => setPage("assets")}>
          <Landmark size={15} /> 股票資產
        </button>
        <button className={page === "expenses" ? "active" : ""} onClick={() => setPage("expenses")}>
          <Receipt size={15} /> 消費紀錄
        </button>
      </div>

      {page === "assets" && (
        <>
          <div className="pw-topbar">
            <div className="pw-brand">
              <h1>股票總資產</h1>
              <p>
                {quoteMode === "live" ? "即時報價" : quoteMode === "error" ? "後端連線失敗，暫用模擬報價" : "模擬報價"}
                {" "}· 每 {TICK_MS / 1000} 秒更新 · 跌幅提醒門檻 {threshold}%
              </p>
            </div>
            <div className="pw-actions">
              <button className="pw-icon-btn" onClick={() => setShowSettings(true)} aria-label="設定">
                <Settings size={18} />
              </button>
              <button className="pw-add-btn" onClick={openAdd}>
                <Plus size={16} /> 新增倉位
              </button>
            </div>
          </div>

          <div className="pw-card pw-overview-card">
            <div className="pw-view-tabs">
              {VIEW_LABELS.map((v) => (
                <button key={v.key} className={heroView === v.key ? "active" : ""} onClick={() => setHeroView(v.key)}>
                  {v.label}
                </button>
              ))}
            </div>

            {heroView === "overview" && (
              <div>
                <p className="pw-value-label">總資產市值</p>
                <p className="pw-value-big">{money(totalValue)}</p>
                <p className={"pw-value-sub " + (totalGain >= 0 ? "gain" : "loss")}>
                  {totalGain >= 0 ? <TrendingUp size={15} style={{ verticalAlign: "-2px", marginRight: 4 }} /> : <TrendingDown size={15} style={{ verticalAlign: "-2px", marginRight: 4 }} />}
                  {money(totalGain)}（{pct(totalGainPct)}）
                </p>
                <div className="pw-mini-row-wrap">
                  <div className="pw-mini-row">總成本<b>{money(totalCost)}</b></div>
                  <div className="pw-mini-row">持股檔數<b>{holdings.length}</b></div>
                  <div className="pw-mini-row">銀行數<b>{uniqueBanks.length || 1}</b></div>
                </div>
              </div>
            )}

            {heroView === "trend" && (
              <div>
                <div className="pw-range-tabs">
                  {RANGE_LABELS.map((r) => (
                    <button key={r.key} className={chartRange === r.key ? "active" : ""} onClick={() => setChartRange(r.key)}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <AreaChart data={histories[chartRange]} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pwFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#C1671E" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#C1671E" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#332C22" vertical={false} />
                      <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#9A9086" }} axisLine={{ stroke: "#332C22" }} tickLine={false} minTickGap={24} />
                      <YAxis tick={{ fontSize: 10, fill: "#9A9086" }} axisLine={false} tickLine={false} width={54}
                        tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                      <Tooltip formatter={(v) => money(v)} labelStyle={{ fontSize: 12, color: "#141210" }}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #332C22", background: "#1E1B17", color: "#F1EAE0" }}
                        itemStyle={{ color: "#F1EAE0" }} />
                      <Area type="monotone" dataKey="v" stroke="#E38A38" strokeWidth={2} fill="url(#pwFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {heroView === "allocation" && (
              <div className="pw-pie-wrap">
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="label" cx="50%" cy="50%"
                        innerRadius={54} outerRadius={90} paddingAngle={2} stroke="none">
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => money(v)}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #332C22", background: "#1E1B17", color: "#F1EAE0" }}
                        itemStyle={{ color: "#F1EAE0" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="pw-pie-legend">
                  {pieData.map((d, i) => (
                    <div className="pw-pie-legend-item" key={d.key}>
                      <span className="pw-lname">
                        <span className="pw-swatch" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}></span>
                        {d.label}
                      </span>
                      <span className="pw-lpct">{totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : "0.0"}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="pw-section-title">銀行別損益</p>
          <div className="pw-bank-cards">
            {bankRows.map((b) => (
              <div className="pw-bank-card" key={b.bank}>
                <div className="pw-bank-left">
                  <div className="pw-bank-icon"><Landmark size={16} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="pw-bank-name">{b.bank}</div>
                    <div className="pw-bank-sub">{b.count} 檔持股 · 成本 {money(b.cost)}</div>
                  </div>
                </div>
                <div className="pw-bank-right">
                  <div className="pw-bank-value">{money(b.value)}</div>
                  <div className={"pw-bank-gain " + (b.gain >= 0 ? "pw-gain" : "pw-loss")}>{money(b.gain)}（{pct(b.gainPct)}）</div>
                </div>
              </div>
            ))}
          </div>

          {alerts.length > 0 && (
            <div className="pw-alerts">
              <p className="pw-alerts-title"><AlertTriangle size={15} /> 跌幅提醒（{alerts.length}）</p>
              {alerts.map((row) => (
                <div className="pw-alert-row" key={row.id}>
                  <div className="pw-alert-left">
                    <span className="pw-stamp">{pct(row.dayChangePct)}</span>
                    <div>
                      <div className="pw-alert-name">{row.symbol} {row.name}</div>
                      <div className="pw-alert-sub">現價 {money(row.live.price)} · 持有 {row.qty} 股 · {row.bank || UNCATEGORIZED}</div>
                    </div>
                  </div>
                  <div className="pw-pill-group">
                    <button className="pw-pill sell" onClick={() => handleSell(row)}>
                      <XCircle size={14} /> 停損賣出
                    </button>
                    <button className="pw-pill" onClick={() => handleBuyDip(row)}>
                      <ShoppingCart size={14} /> 逢低買入
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pw-section-title-row">
            <p className="pw-section-title">股票現價</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {marketRows.length > 0 && (
                confirmClearMarket ? (
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>確定清空{assetMarketTab === "TW" ? "台股" : "美股"}全部倉位？</span>
                    <button className="pw-row-icon pw-confirm-del" onClick={() => clearMarketHoldings(assetMarketTab)}>確定清空</button>
                    <button className="pw-row-icon" onClick={() => setConfirmClearMarket(false)}>取消</button>
                  </span>
                ) : (
                  <button className="pw-row-icon" onClick={() => setConfirmClearMarket(true)}>
                    清空{assetMarketTab === "TW" ? "台股" : "美股"}倉位
                  </button>
                )
              )}
              <div className="pw-view-tabs" style={{ marginBottom: 0 }}>
                <button className={assetMarketTab === "TW" ? "active" : ""} onClick={() => { setAssetMarketTab("TW"); setConfirmClearMarket(false); }}>台股</button>
                <button className={assetMarketTab === "US" ? "active" : ""} onClick={() => { setAssetMarketTab("US"); setConfirmClearMarket(false); }}>美股</button>
              </div>
            </div>
          </div>
          <div className="pw-table-wrap">
            {marketRows.length === 0 ? (
              <div className="pw-empty">{assetMarketTab === "TW" ? "尚無台股倉位" : "尚無美股倉位"}，點右上角「新增倉位」開始追蹤。</div>
            ) : (
              <table className="pw-table">
                <thead>
                  <tr>
                    <th>股票</th><th>銀行</th><th>股數</th><th>成本價</th><th>現價</th><th>今日漲跌</th>
                    <th>市值</th><th>損益</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {marketRows.map((row) => (
                    <tr key={row.id} className={row.isAlert ? "alert-row" : ""}>
                      <td>
                        <div className="pw-name-cell">
                          <span className="pw-symbol">{row.symbol}</span>
                          <span className="pw-stockname">{row.name}</span>
                        </div>
                      </td>
                      <td><span className="pw-bank-tag">{row.bank || UNCATEGORIZED}</span></td>
                      <td>{row.qty}</td>
                      <td>{row.cost.toFixed(2)}</td>
                      <td>{row.live.price.toFixed(2)}</td>
                      <td className={row.dayChangePct >= 0 ? "pw-gain" : "pw-loss"}>{pct(row.dayChangePct)}</td>
                      <td>{moneyFor(row.value, row.market)}</td>
                      <td className={row.gain >= 0 ? "pw-gain" : "pw-loss"}>{moneyFor(row.gain, row.market)}（{pct(row.gainPct)}）</td>
                      <td>
                        <div className="pw-row-actions">
                          <button className="pw-row-icon" onClick={() => openEdit(row)} aria-label="編輯">編輯</button>
                          <button className="pw-row-icon" onClick={() => handleDelete(row.id)} aria-label="刪除">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="pw-section-title">操作紀錄</p>
          <div className="pw-log">
            {log.length === 0 ? (
              <p className="pw-log-empty">目前尚無操作紀錄。</p>
            ) : (
              log.map((l, i) => (
                <div className="pw-log-item" key={i}>
                  <span>{l.time} · {l.action} {l.symbol} {l.name}{l.qty ? `（${l.qty}股）` : ""}</span>
                  <span>@{l.price.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>

          {showAdd && (
            <div className="pw-overlay" onClick={() => setShowAdd(false)}>
              <div className="pw-modal" onClick={(e) => e.stopPropagation()}>
                <h3>{editing ? "編輯倉位" : "新增倉位"}
                  <button className="pw-row-icon" onClick={() => setShowAdd(false)} aria-label="關閉"><X size={18} /></button>
                </h3>

                <div className="pw-segment">
                  <button className={form.market === "TW" ? "active" : ""} onClick={() => { setForm({ ...form, market: "TW" }); setSearchQuery(""); }}>台股</button>
                  <button className={form.market === "US" ? "active" : ""} onClick={() => { setForm({ ...form, market: "US" }); setSearchQuery(""); }}>美股</button>
                </div>

                {!editing && (
                  <div className="pw-chips">
                    {(form.market === "US" ? QUICK_PICKS_US : QUICK_PICKS).map((sym) => {
                      const s = STOCK_DB.find((d) => d.symbol === sym && d.market === form.market);
                      return (
                        <button className="pw-chip" key={sym} onClick={() => pickStock(s)}>
                          {s.symbol} {s.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="pw-field pw-search-wrap">
                  <label>搜尋股票（打代號或名稱都可以）</label>
                  <input
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                    onFocus={() => setSearchOpen(true)}
                    placeholder="例如「台積電」或「2330」"
                  />
                  <Search size={15} className="pw-search-icon" />
                  {searchOpen && matches.length > 0 && (
                    <div className="pw-suggest">
                      {matches.map((s) => (
                        <div className="pw-suggest-item" key={s.symbol} onClick={() => pickStock(s)}>
                          <span>{s.name}</span><span>{s.symbol}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pw-field">
                  <label>股票代號 / 名稱（確認或手動修改）</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={{ width: "40%" }} value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="代號" />
                    <input style={{ flex: 1, fontFamily: "'Noto Sans TC',sans-serif" }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="名稱" />
                  </div>
                </div>

                <div className="pw-field">
                  <label>銀行 / 券商帳戶</label>
                  {uniqueBanks.length > 0 && (
                    <div className="pw-chips" style={{ marginBottom: 8 }}>
                      {uniqueBanks.map((b) => (
                        <button className="pw-chip" key={b} onClick={() => setForm({ ...form, bank: b })}>{b}</button>
                      ))}
                    </div>
                  )}
                  <input style={{ fontFamily: "'Noto Sans TC',sans-serif" }} value={form.bank}
                    onChange={(e) => setForm({ ...form, bank: e.target.value })} placeholder="例如「銀行A」或實際券商名稱" />
                </div>

                <div className="pw-segment">
                  <button className={form.mode === "qty" ? "active" : ""} onClick={() => setForm({ ...form, mode: "qty" })}>依股數輸入</button>
                  <button className={form.mode === "amount" ? "active" : ""} onClick={() => setForm({ ...form, mode: "amount" })}>依投入金額輸入</button>
                </div>

                <div className="pw-field">
                  <label>成本價（每股）</label>
                  <input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="例如 850" />
                </div>

                {form.mode === "qty" ? (
                  <div className="pw-field">
                    <label>持有股數（1 張 = 1,000 股）</label>
                    <div className="pw-stepper">
                      <button onClick={() => adjustQty(-LOT)} aria-label="減少一張"><Minus size={15} /></button>
                      <input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="例如 1000" />
                      <button onClick={() => adjustQty(LOT)} aria-label="增加一張"><Plus size={15} /></button>
                    </div>
                  </div>
                ) : (
                  <div className="pw-field">
                    <label>投入金額（新台幣）</label>
                    <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="例如 100000" />
                    <p className="pw-derived">約可買 <b>{derivedQty.toLocaleString("zh-TW")}</b> 股（依成本價自動換算）</p>
                  </div>
                )}

                <div className="pw-modal-actions">
                  <button className="pw-btn-secondary" onClick={() => setShowAdd(false)}>取消</button>
                  <button className="pw-btn-primary" onClick={submitForm}>{editing ? "儲存變更" : "新增"}</button>
                </div>
              </div>
            </div>
          )}

          {showSettings && (
            <div className="pw-overlay" onClick={() => setShowSettings(false)}>
              <div className="pw-modal" onClick={(e) => e.stopPropagation()}>
                <h3>提醒 / 報價設定
                  <button className="pw-row-icon" onClick={() => setShowSettings(false)} aria-label="關閉"><X size={18} /></button>
                </h3>
                <div className="pw-field">
                  <label>跌幅提醒門檻（%）</label>
                  <input type="number" value={threshold} onChange={(e) => saveThreshold(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="pw-field">
                  <label>後端 API 網址（選填，留空則用模擬報價）</label>
                  <input style={{ fontFamily: "'Noto Sans TC',sans-serif" }} value={apiBaseUrl}
                    onChange={(e) => saveApiBaseUrl(e.target.value)} placeholder="例如 http://localhost:3001" />
                </div>
                <p className="pw-hint">
                  {quoteMode === "live"
                    ? "目前已成功連線後端，顯示的是真實報價。"
                    : quoteMode === "error"
                      ? "後端網址連不上，暫時自動改用模擬報價，請確認伺服器是否已啟動、網址是否正確。"
                      : "目前為模擬行情，方便展示介面與提醒邏輯。"}
                  若要串接真實股價，需要一個後端服務去呼叫證交所或資料商（如 TWSE、Stooq）的 API，
                  再回傳給前端，因為瀏覽器安全限制無法直接跨網域呼叫券商資料源。把後端伺服器的網址填在上面即可切換成真實報價。
                  倉位資料（股票、股數、成本、銀行）會保存下來，重新開啟仍會保留。
                  每週／每月／每季走勢為模擬歷史資料，僅供介面展示參考。
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {page === "expenses" && (
        <>
          <div className="pw-topbar">
            <div className="pw-brand">
              <h1>消費紀錄</h1>
              <p>記錄日常花費，掌握每月支出狀況</p>
            </div>
            <div className="pw-actions">
              <button className="pw-add-btn" onClick={openAddExpense}>
                <Plus size={16} /> 新增消費
              </button>
            </div>
          </div>

          <div className="pw-month-picker">
            <div className="pw-year-switch">
              <button onClick={() => setSelectedYear((y) => y - 1)} aria-label="上一年">‹</button>
              <span>{selectedYear} 年</span>
              <button onClick={() => setSelectedYear((y) => y + 1)} aria-label="下一年">›</button>
            </div>
            <div className="pw-month-chips">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <button key={m} className={"pw-month-chip" + (m === selectedMonthNum ? " active" : "")}
                  onClick={() => setSelectedMonthNum(m)}>{m}月</button>
              ))}
            </div>
          </div>

          <div className="pw-card pw-overview-card">
            <div className="pw-view-tabs">
              <button className={expenseView === "overview" ? "active" : ""} onClick={() => setExpenseView("overview")}>當月總覽</button>
              <button className={expenseView === "category" ? "active" : ""} onClick={() => setExpenseView("category")}>類別佔比</button>
            </div>

            {expenseView === "overview" && (
              <div>
                <p className="pw-value-label">{selectedYear}年{selectedMonthNum}月支出</p>
                <p className="pw-value-big pw-loss">{money(monthTotal)}</p>
                <div className="pw-mini-row-wrap">
                  <div className="pw-mini-row">當月筆數<b>{monthExpenses.length}</b></div>
                  <div className="pw-mini-row">累計總支出<b>{money(allExpenseTotal)}</b></div>
                  <div className="pw-mini-row">總筆數<b>{expenses.length}</b></div>
                </div>
              </div>
            )}

            {expenseView === "category" && (
              <div className="pw-pie-wrap">
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={catPieData} dataKey="value" nameKey="label" cx="50%" cy="50%"
                        innerRadius={54} outerRadius={90} paddingAngle={2} stroke="none">
                        {catPieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => money(v)}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #332C22", background: "#1E1B17", color: "#F1EAE0" }}
                        itemStyle={{ color: "#F1EAE0" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="pw-pie-legend">
                  {catPieData.length === 0 && <p className="pw-log-empty">{selectedYear}年{selectedMonthNum}月尚無消費紀錄。</p>}
                  {catPieData.map((d, i) => (
                    <div className="pw-pie-legend-item" key={d.key}>
                      <span className="pw-lname">
                        <span className="pw-swatch" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}></span>
                        {d.label}
                      </span>
                      <span className="pw-lpct">{monthTotal > 0 ? ((d.value / monthTotal) * 100).toFixed(1) : "0.0"}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="pw-section-title">消費明細（{selectedYear}年{selectedMonthNum}月）</p>
          <div className="pw-table-wrap">
            {sortedExpenses.length === 0 ? (
              <div className="pw-empty">{selectedYear}年{selectedMonthNum}月尚無消費紀錄，點右上角「新增消費」開始記帳。</div>
            ) : (
              <table className="pw-table">
                <thead>
                  <tr><th>日期</th><th>類別</th><th>備註</th><th>金額</th><th></th></tr>
                </thead>
                <tbody>
                  {sortedExpenses.map((e) => (
                    <tr key={e.id}>
                      <td>{e.date}</td>
                      <td><span className="pw-bank-tag">{e.category}</span></td>
                      <td style={{ fontFamily: "'Noto Sans TC',sans-serif", color: "var(--muted)" }}>{e.note || "—"}</td>
                      <td>{money(e.amount)}</td>
                      <td>
                        <div className="pw-row-actions">
                          {confirmDeleteExpenseId === e.id ? (
                            <>
                              <button className="pw-row-icon pw-confirm-del" onClick={() => deleteExpense(e.id)}>確定刪除</button>
                              <button className="pw-row-icon" onClick={() => setConfirmDeleteExpenseId(null)}>取消</button>
                            </>
                          ) : (
                            <>
                              <button className="pw-row-icon" onClick={() => openEditExpense(e)} aria-label="編輯">
                                <Pencil size={14} />
                              </button>
                              <button className="pw-row-icon" onClick={() => setConfirmDeleteExpenseId(e.id)} aria-label="刪除">
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {showAddExpense && (
            <div className="pw-overlay" onClick={() => { setShowAddExpense(false); setEditingExpenseId(null); }}>
              <div className="pw-modal" onClick={(e) => e.stopPropagation()}>
                <h3>{editingExpenseId ? "編輯消費" : "新增消費"}
                  <button className="pw-row-icon" onClick={() => { setShowAddExpense(false); setEditingExpenseId(null); }} aria-label="關閉"><X size={18} /></button>
                </h3>
                <div className="pw-field">
                  <label>日期</label>
                  <input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} />
                </div>
                <div className="pw-field">
                  <label>類別</label>
                  <div className="pw-chips" style={{ marginBottom: 0 }}>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <button key={c} className={"pw-chip" + (expenseForm.category === c ? " active" : "")}
                        onClick={() => setExpenseForm({ ...expenseForm, category: c })}>{c}</button>
                    ))}
                  </div>
                </div>
                <div className="pw-field">
                  <label>金額</label>
                  <input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} placeholder="例如 350" />
                </div>
                <div className="pw-field">
                  <label>備註</label>
                  <input style={{ fontFamily: "'Noto Sans TC',sans-serif" }} value={expenseForm.note}
                    onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })} placeholder="例如「午餐」" />
                </div>
                <div className="pw-modal-actions">
                  <button className="pw-btn-secondary" onClick={() => { setShowAddExpense(false); setEditingExpenseId(null); }}>取消</button>
                  <button className="pw-btn-primary" onClick={submitExpense}>{editingExpenseId ? "儲存變更" : "新增"}</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}