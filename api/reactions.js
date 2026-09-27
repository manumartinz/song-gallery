/**
 * Reacciones de quien escucha, por canción: "me gustó" y "no la conocía".
 *
 *   GET  /api/reactions?ids=a,b,c   -> { a: { love: 3, new: 1 }, ... }
 *   POST /api/reactions  { id, kind: 'love' | 'new', undo?: true }
 *
 * No hay cuentas: cada navegador recuerda lo que marcó y el servidor confía.
 * Lo que frena el abuso es el límite por IP, no un sistema de votos; para una
 * galería personal es la proporción justa. Lo que me interesa de verdad es
 * "no la conocía": dice qué descubre la gente.
 *
 * Sin Redis configurado el GET responde 204 y la web no enseña los botones.
 */
import { kvConfigured, kvPipeline, overLimit, readJson } from './_kv.js';

const KINDS = ['love', 'new'];
const TRACK_ID = /^[A-Za-z0-9]{22}$/;
const MAX_IDS = 100;

const key = (id) => `reactions:${id}`;

export default async function handler(req, res) {
  if (!kvConfigured()) {
    /* Un GET recibe 204 y no 503: es la pregunta de siempre al cargar la
       pagina, y un error en la consola de cada visitante por algo que
       simplemente esta apagado seria ruido. */
    if (req.method === 'GET') {
      res.statusCode = 204;
      return res.end();
    }
    return res.status(503).json({ error: 'Reacciones apagadas.' });
  }

  try {
    if (req.method === 'GET') {
      const ids = String(req.query?.ids || '')
        .split(',')
        .filter((id) => TRACK_ID.test(id))
        .slice(0, MAX_IDS);
      if (!ids.length) return res.status(200).json({});

      const results = await kvPipeline(ids.map((id) => ['HGETALL', key(id)]));
      const counts = {};
      ids.forEach((id, i) => {
        // HGETALL por REST llega como lista plana: [campo, valor, campo, valor].
        const flat = results[i] || [];
        const entry = {};
        for (let j = 0; j < flat.length; j += 2)
          entry[flat[j]] = Math.max(0, Number(flat[j + 1]) || 0);
        if (Object.keys(entry).length) counts[id] = entry;
      });

      // Unos segundos en el edge: muchos visitantes a la vez leen lo mismo.
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      return res.status(200).json(counts);
    }

    if (req.method === 'POST') {
      if (await overLimit(req, 'reactions', 60, 600)) {
        return res.status(429).json({ error: 'Demasiadas reacciones seguidas.' });
      }
      const { id, kind, undo } = await readJson(req);
      if (!TRACK_ID.test(id || '') || !KINDS.includes(kind)) {
        return res.status(400).json({ error: 'Reacción no válida.' });
      }
      const [value] = await kvPipeline([['HINCRBY', key(id), kind, undo ? '-1' : '1']]);
      return res.status(200).json({ id, kind, count: Math.max(0, Number(value) || 0) });
    }

    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    console.error(JSON.stringify({ route: 'reactions', error: error.message }));
    return res.status(500).json({ error: 'No se pudo guardar la reacción.' });
  }
}
