// api/highscores.ts
import { Client } from "pg";

// Wir versuchen mehrere mögliche ENV-Namen, damit es mit der Vercel/Neon-Integration
// sicher funktioniert.
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.STORAGE_URL; // falls du ein Prefix gesetzt hast

if (!connectionString) {
  console.error("⚠️ Keine DB-Verbindungs-URL gefunden (DATABASE_URL / POSTGRES_URL / STORAGE_URL).");
}

// kleine Helper-Funktion, die bei jedem Request einmal verbindet
async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  if (!connectionString) {
    throw new Error(
      "Keine Datenbank-Verbindungs-URL gefunden. Prüfe deine Vercel-Umgebungsvariablen."
    );
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// Vercel-Node-Handler (Typen als any, damit du kein @vercel/node installieren musst)
export default async function handler(req: any, res: any) {
  try {
    // --- GET: Highscores abfragen ---
    if (req.method === "GET") {
      const rows = await withClient(async (client) => {
        const result = await client.query(
          `
          SELECT id, nickname, time_ms, created_at
          FROM highscores
          ORDER BY time_ms ASC
          LIMIT 50;
        `
        );
        return result.rows;
      });

      res.status(200).json({ rows });
      return;
    }

    // --- POST: neuen Highscore speichern ---
    if (req.method === "POST") {
      // Body kann bei Vercel schon als Objekt vorliegen oder als JSON-String
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

      const nickname = String(body.nickname || "").trim();
      const time_ms = Number(body.time_ms);

      if (!nickname || !Number.isFinite(time_ms)) {
        res.status(400).json({ error: "nickname (string) und time_ms (number) sind nötig." });
        return;
      }

      await withClient(async (client) => {
        await client.query(
          `
          INSERT INTO highscores (nickname, time_ms)
          VALUES ($1, $2);
        `,
          [nickname, time_ms]
        );
      });

      res.status(201).json({ ok: true });
      return;
    }

    // --- andere Methoden ablehnen ---
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("❌ Highscores-API Fehler:", err);
    res
      .status(500)
      .json({
        error: "Internal server error",
        // Für Debugging: Fehlermeldung mitschicken (später wieder entfernen!)
        detail: err?.message ?? String(err),
      });
  }
}