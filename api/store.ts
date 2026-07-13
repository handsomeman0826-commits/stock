import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// 資料存取 API：GET 讀取、PUT/POST 寫入
// 呼叫方式：
//   GET  /api/store?key=holdings
//   PUT  /api/store   body: { key: "holdings", value: "...JSON字串..." }
//
// 這支 API 沒有帳號登入機制，任何知道網址的人理論上都能讀寫這份資料，
// 適合個人自用；如果之後要多人使用或更嚴謹，需要另外加上驗證機制。

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
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
