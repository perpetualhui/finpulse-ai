import fallbackNewsData from "../public/data/news.json";

export interface NewsApiEnv {
  DB: D1Database;
  NEWS_INGEST_TOKEN?: string;
}

async function ensureTable(database: D1Database) {
  await database.prepare(`CREATE TABLE IF NOT EXISTS news_snapshots (
    id TEXT PRIMARY KEY NOT NULL,
    issue TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`).run();
}

export async function handleNewsRequest(request: Request, env: NewsApiEnv) {
  if (request.method === "GET") {
    await ensureTable(env.DB);
    const snapshot = await env.DB
      .prepare("SELECT payload FROM news_snapshots WHERE id = ?")
      .bind("current")
      .first<{ payload: string }>();

    return Response.json(snapshot ? JSON.parse(snapshot.payload) : fallbackNewsData, {
      headers: { "cache-control": "no-store" },
    });
  }

  if (request.method === "PUT") {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!env.NEWS_INGEST_TOKEN || token !== env.NEWS_INGEST_TOKEN) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json() as typeof fallbackNewsData;
    if (!/^\d{8}$/.test(payload.meta?.issue ?? "") || !Array.isArray(payload.items) || payload.items.length < 10) {
      return Response.json({ error: "Invalid news snapshot" }, { status: 400 });
    }

    await ensureTable(env.DB);
    await env.DB.prepare(`INSERT INTO news_snapshots (id, issue, updated_at, payload)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET issue = excluded.issue, updated_at = excluded.updated_at, payload = excluded.payload`)
      .bind("current", payload.meta.issue, payload.meta.lastUpdated, JSON.stringify(payload))
      .run();

    return Response.json({ ok: true, issue: payload.meta.issue, items: payload.items.length });
  }

  return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, PUT" } });
}
