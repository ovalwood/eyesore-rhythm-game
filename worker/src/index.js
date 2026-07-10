const ALLOWED_ORIGINS = new Set([
  "https://ovalwood.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "null",
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://ovalwood.github.io",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(request, body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(request),
      "Cache-Control": "no-store",
    },
  });
}

async function topScores(db) {
  const { results } = await db
    .prepare(
      `SELECT initials, score, accuracy, combo, created_at AS createdAt
       FROM scores
       ORDER BY score DESC, accuracy DESC, created_at ASC
       LIMIT 10`,
    )
    .all();
  return results;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    if (url.pathname === "/scores" && request.method === "GET") {
      return json(request, await topScores(env.DB));
    }

    if (url.pathname === "/scores" && request.method === "POST") {
      const contentLength = +(request.headers.get("Content-Length") || 0);
      if (contentLength > 512) return json(request, { error: "Payload too large" }, 413);

      let body;
      try {
        body = await request.json();
      } catch {
        return json(request, { error: "Invalid JSON" }, 400);
      }

      const initials = String(body.initials || "").toUpperCase();
      const score = Number(body.score);
      const accuracy = Number(body.accuracy);
      const combo = Number(body.combo);
      if (!/^[A-Z0-9]{1,3}$/.test(initials)) {
        return json(request, { error: "Initials must be 1-3 letters or numbers" }, 400);
      }
      if (!Number.isInteger(score) || score < 0 || score > 2_000_000) {
        return json(request, { error: "Invalid score" }, 400);
      }
      if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
        return json(request, { error: "Invalid accuracy" }, 400);
      }
      if (!Number.isInteger(combo) || combo < 0 || combo > 1000) {
        return json(request, { error: "Invalid combo" }, 400);
      }

      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO scores (initials, score, accuracy, combo) VALUES (?, ?, ?, ?)",
        ).bind(initials, score, accuracy, combo),
        env.DB.prepare(
          `DELETE FROM scores
           WHERE id NOT IN (
             SELECT id FROM scores
             ORDER BY score DESC, accuracy DESC, created_at ASC
             LIMIT 10
           )`,
        ),
      ]);
      return json(request, await topScores(env.DB), 201);
    }

    return json(request, { error: "Not found" }, 404);
  },
};
