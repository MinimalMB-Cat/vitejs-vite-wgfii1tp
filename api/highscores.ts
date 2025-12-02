// @ts-nocheck
import type { VercelRequest, VercelResponse } from '@vercel/node';

// api/highscores.ts
import { Client } from 'pg';

// ---- DB URL aus den Vercel-Env-Variablen holen ----
const DB_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.STORAGE_URL;

if (!DB_URL) {
  console.warn(
    'WARNUNG: Keine DB-Verbindungs-URL gefunden (DATABASE_URL / POSTGRES_URL / STORAGE_URL).'
  );
}

// kleine Helper-Funktion für eine kurze Verbindung pro Request
async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  if (!DB_URL) {
    throw new Error('Keine Datenbank-Verbindungs-URL konfiguriert.');
  }

  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// ---- Haupt-Handler für /api/highscores ----
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!DB_URL) {
      res
        .status(500)
        .json({ error: 'Keine Datenbank-Verbindungs-URL konfiguriert.' });
      return;
    }

    if (req.method === 'GET') {
      return handleGet(req, res);
    }

    if (req.method === 'POST') {
      return handlePost(req, res);
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Highscores-API Fehler:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---- GET: Highscores holen (mit Modus-Filter) ----
// /api/highscores?mode=today
// /api/highscores?mode=best
// /api/highscores?mode=date&date=2025-12-02
async function handleGet(req: VercelRequest, res: VercelResponse) {
  const modeRaw = req.query.mode;
  const mode =
    typeof modeRaw === 'string' ? modeRaw.toLowerCase() : 'today';

  const dateRaw = req.query.date;
  const dateStr = typeof dateRaw === 'string' ? dateRaw : undefined;

  const rows = await withClient(async (client) => {
    // Beste Zeit (global, unabhängig vom Datum)
    if (mode === 'best') {
      const result = await client.query(
        `
        SELECT id, nickname, time_ms, created_at
        FROM highscores
        ORDER BY time_ms ASC
        LIMIT 20;
      `
      );
      return result.rows;
    }

    // Bestimmtes Datum (aus Datepicker)
    if (mode === 'date' && dateStr) {
      const result = await client.query(
        `
        SELECT id, nickname, time_ms, created_at
        FROM highscores
        WHERE created_at::date = $1::date
        ORDER BY time_ms ASC
        LIMIT 20;
      `,
        [dateStr]
      );
      return result.rows;
    }

    // Standard: "Heute"
    const result = await client.query(
      `
      SELECT id, nickname, time_ms, created_at
      FROM highscores
      WHERE created_at::date = CURRENT_DATE
      ORDER BY time_ms ASC
      LIMIT 20;
    `
    );
    return result.rows;
  });

  res.status(200).json({ rows });
}

// ---- POST: neuen Highscore speichern ----
// erwartet JSON-Body: { "nickname": "Max", "timeMs": 12345 }
async function handlePost(req: VercelRequest, res: VercelResponse) {
  const body = req.body as unknown;

  // Vercel parst JSON automatisch, wenn "Content-Type: application/json"
  const { nickname, timeMs } = (body || {}) as {
    nickname?: string;
    timeMs?: number;
  };

  if (!nickname || typeof nickname !== 'string') {
    res.status(400).json({ error: 'Nickname fehlt oder ist ungültig.' });
    return;
  }

  if (
    typeof timeMs !== 'number' ||
    !Number.isFinite(timeMs) ||
    timeMs <= 0
  ) {
    res.status(400).json({ error: 'timeMs fehlt oder ist ungültig.' });
    return;
  }

  const nickClean = nickname.trim().slice(0, 32); // max 32 Zeichen
  const timeInt = Math.round(timeMs);

  const row = await withClient(async (client) => {
    const result = await client.query(
      `
      INSERT INTO highscores (nickname, time_ms)
      VALUES ($1, $2)
      RETURNING id, nickname, time_ms, created_at;
    `,
      [nickClean, timeInt]
    );
    return result.rows[0];
  });

  res.status(201).json({ row });
}