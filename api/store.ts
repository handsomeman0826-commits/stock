import { Redis } from "@upstash/redis";

// 支援兩種環境變數名稱：
//   Vercel KV（官方）：KV_REST_API_URL / KV_REST_API_TOKEN
//   Upstash 直接整合：UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
const url =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  "";
const token =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  "";

const redis = new Redis({ url, token });

// 資料存取 API：GET 讀取、PUT/POST 寫入
// 呼叫方式：
//   GET  /api/store?key=holdings
//   PUT  /api/store   body: { key: "holdings", value: "...JSON字串..." }

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 若環境變數未設定，回傳明確錯誤
  if (!url || !token) {
    return res.status(500).json({
      error: "Redis env vars not set",
      hint: "Set KV_REST_API_URL+KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL+UPSTASH_REDIS_REST_TOKEN in Vercel",
    });
  }

  try {
    if (req.method === "GET") {
      const key = (req.query.key || "").toString();
      if (!key) return res.status(400).json({ error: "missing key" });
      const value = await redis.get(`app:${key}`);
      return res.status(200).json({ value: value ?? null });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { key, value } = body || {};
      if (!key) return res.status(400).json({ error: "missing key" });
      await redis.set(`app:${key}`, value);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: "method not allowed" });
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
