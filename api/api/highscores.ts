// api/highscores.ts
import { sql } from '@vercel/postgres';

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      // letzte 20 Zeiten, beste zuerst
      const result = await sql`
        SELECT id, nickname, time_ms, created_at
        FROM highscores
        ORDER BY time_ms ASC
        LIMIT 20;
      `;
      return res.status(200).json(result.rows);
    }

    if (req.method === 'POST') {
      const { nickname, timeMs } = req.body as { nickname?: string; timeMs?: number };

      if (!nickname || typeof timeMs !== 'number') {
        return res.status(400).json({ error: 'nickname und timeMs nötig' });
      }

      const result = await sql`
        INSERT INTO highscores (nickname, time_ms)
        VALUES (${nickname}, ${timeMs})
        RETURNING id, nickname, time_ms, created_at;
      `;

      return res.status(201).json(result.rows[0]);
    }

    // alles andere blocken
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}