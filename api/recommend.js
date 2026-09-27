/**
 * "Recomendame una": quien escucha me deja una canción.
 *
 *   GET  /api/recommend  -> 200 { enabled: true } | 204 si está apagado
 *   POST /api/recommend  { song, name?, message?, website? }
 *
 * `song` es un link o un "canción — artista", como a cada uno le salga. Se
 * guarda en una lista de Redis (`recs`, las 2000 más recientes) que leo con
 * `npm run recs`. `website` es una trampa para bots: un campo que la persona
 * no ve y un bot rellena; si viene, se contesta que sí y no se guarda nada.
 */
import { kvConfigured, kvPipeline, overLimit, readJson } from './_kv.js';

const LIMITS = { song: 200, name: 60, message: 400 };
const KEEP = 2000;

function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max);
}

export default async function handler(req, res) {
  if (!kvConfigured()) {
    if (req.method === 'GET') {
      res.statusCode = 204;
      return res.end();
    }
    return res.status(503).json({ error: 'Las recomendaciones están apagadas.' });
  }

  if (req.method === 'GET') return res.status(200).json({ enabled: true });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  try {
    const body = await readJson(req);
    if (body.website) return res.status(200).json({ ok: true }); // bot: como si nada

    const song = clean(body.song, LIMITS.song);
    if (song.length < 3) {
      return res.status(400).json({ error: 'Poné el link o el nombre de la canción.' });
    }

    if (await overLimit(req, 'recommend', 5, 3600)) {
      return res.status(429).json({ error: 'Ya me dejaste varias. Gracias: probá más tarde.' });
    }

    const entry = {
      song,
      name: clean(body.name, LIMITS.name) || null,
      message: clean(body.message, LIMITS.message) || null,
      at: new Date().toISOString(),
    };
    await kvPipeline([
      ['LPUSH', 'recs', JSON.stringify(entry)],
      ['LTRIM', 'recs', '0', String(KEEP - 1)],
    ]);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ route: 'recommend', error: error.message }));
    return res.status(500).json({ error: 'No se pudo guardar. Probá de nuevo en un rato.' });
  }
}
