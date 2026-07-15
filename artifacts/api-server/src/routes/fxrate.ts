import { Router } from "express";

const router = Router();

// ---------- 美元兌新台幣匯率：透過免金鑰匯率 API ----------
let fxRateCache: { rate: number | null; day: string } = { rate: null, day: "" };

async function fetchUsdTwdRate() {
  const today = new Date().toISOString().slice(0, 10);
  if (fxRateCache.rate && fxRateCache.day === today) return fxRateCache.rate;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json: any = await res.json();
    const rate = json?.rates?.TWD;
    if (typeof rate === "number") {
      fxRateCache = { rate, day: today };
      return rate;
    }
  } catch (e) {
    console.error("取得美元兌台幣匯率失敗", e);
  }
  return fxRateCache.rate; // 抓不到就回傳上一次快取到的值（可能是 null）
}

// 呼叫方式： GET /api/fxrate  → { "rate": 31.42 }
router.get("/fxrate", async (_req, res) => {
  try {
    const rate = await fetchUsdTwdRate();
    res.json({ rate });
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

export default router;
