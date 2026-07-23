import { Redis } from "@upstash/redis";

const url =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  "";
const token =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  "";
const redis = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;

// 伺服器預設用 UTC 時間，這裡固定換算成台北時間（UTC+8）算出「今天」的日期，
// 讓捷徑記的日期跟 App 前端顯示的日期邏輯一致。
function todayTaipei() {
  const now = new Date();
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = taipei.getUTCFullYear();
  const m = String(taipei.getUTCMonth() + 1).padStart(2, "0");
  const d = String(taipei.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function uid() {
  return "p" + Math.random().toString(36).slice(2, 9);
}

// 給 Apple 捷徑（Siri）呼叫的快速記帳端點
// 呼叫方式： GET /api/quick-expense?amount=60&category=餐費&note=早餐&key=你設定的密語
//
// - amount：必填，金額
// - category：選填，類別文字，沒填預設「雜費」；填跟 App 裡一樣的類別名稱
//   （例如：餐費、交通、娛樂…）畫面上的類別標籤才會完全對上，其他文字也能存，只是不會對到固定標籤
// - note：選填，備註
// - key：如果有在 Vercel 設定 QUICK_EXPENSE_SECRET 這個環境變數，這裡就要帶一樣的密語才能寫入，
//   避免網址被別人猜到就能亂寫資料
export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!redis) return res.status(500).json({ success: false, message: "Redis 未設定" });
  try {
    const secret = (req.query.key || "").toString();
    if (process.env.QUICK_EXPENSE_SECRET && secret !== process.env.QUICK_EXPENSE_SECRET) {
      return res.status(401).json({ success: false, message: "驗證失敗，請確認捷徑裡的 key 是否正確" });
    }

    const rawAmount = (req.query.amount || "").toString();
    // 去除可能夾帶的空白、中括號、逗號等干擾字元，只留下數字跟小數點
    const cleanedAmount = rawAmount.replace(/[^\d.]/g, "");
    const amount = parseFloat(cleanedAmount);
    const category = (req.query.category || "雜費").toString().trim();
    const note = (req.query.note || "").toString().trim();

    if (!amount || amount <= 0 || Number.isNaN(amount)) {
      return res.status(400).json({
        success: false,
        message: `金額不正確，請確認有講清楚數字（實際收到的內容：「${rawAmount}」）`,
      });
    }

    const raw = await redis.get("app:expenses");
    let expenses: any[] = [];
    if (raw) {
      try { expenses = JSON.parse(raw as string); } catch (e) { expenses = []; }
    }

    const entry = { id: uid(), date: todayTaipei(), category, amount, note };
    expenses.push(entry);
    await redis.set("app:expenses", JSON.stringify(expenses));

    return res.status(200).json({
      success: true,
      message: `已記錄：${category} ${amount} 元${note ? "（" + note + "）" : ""}`,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: String(e.message || e) });
  }
}
