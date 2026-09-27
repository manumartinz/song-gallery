/**
 * "Recomendame una": quien escucha me deja una canción.
 *
 *   GET  /api/recommend  -> 200 { enabled: true } | 204 si está apagado
 *   POST /api/recommend  { song, name, message?, website, elapsed }
 *
 * `song` es un link o un "canción — artista", como a cada uno le salga; el
 * nombre es obligatorio. Se guarda en una lista de Redis (`recs`, las 2000
 * más recientes) que leo con `npm run recs`.
 *
 * Es el único endpoint que escribe texto libre de desconocidos, así que va
 * con varias capas, de la más barata a la más cara:
 *
 *  1. Mismo origen y JSON: un formulario de otra web no puede postear aquí.
 *  2. Trampas para bots (campo invisible y relleno demasiado rápido): se les
 *     contesta que sí y no se guarda nada, para no enseñarles qué los delató.
 *  3. Validación del contenido (_recommendation.js): largos, nombre, sin HTML,
 *     pocos links.
 *  4. Límites en Redis, compartidos entre instancias: 3 por hora y 8 por día
 *     por IP, y 150 por día en total, que es el techo de lo que puede crecer
 *     la lista aunque lleguen desde muchas IPs a la vez.
 *  5. La misma canción dos veces en un día cuenta una: la segunda se acepta
 *     sin guardarse.
 */
import { clientIp, kvConfigured, kvPipeline, readJson } from './_kv.js';
import { checkRecommendation } from './_recommendation.js';
import { logError } from './_log.js';

const KEEP = 2000;
const DAY = 86_400;
const PER_IP_HOUR = 3;
const PER_IP_DAY = 8;
const GLOBAL_DAY = 150;

/** Solo desde la propia web. Los navegadores mandan Origin en todo POST. */
function sameOrigin(req) {
  const origin = req.headers?.origin;
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
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

  if (
    !sameOrigin(req) ||
    !String(req.headers?.['content-type'] || '').includes('application/json')
  ) {
    return res.status(403).json({ error: 'No permitido.' });
  }

  try {
    const result = checkRecommendation(await readJson(req));
    if (!result.ok && result.silent) return res.status(200).json({ ok: true });
    if (!result.ok) return res.status(400).json({ error: result.error });

    const ip = clientIp(req);
    const today = new Date().toISOString().slice(0, 10);
    const hourKey = `rl:rec:h:${ip}`;
    const dayKey = `rl:rec:d:${ip}`;
    const globalKey = `rl:rec:all:${today}`;

    // Todo en un solo viaje a Redis.
    const [hour, , day, , global] = await kvPipeline([
      ['INCR', hourKey],
      ['EXPIRE', hourKey, '3600', 'NX'],
      ['INCR', dayKey],
      ['EXPIRE', dayKey, String(DAY), 'NX'],
      ['INCR', globalKey],
      ['EXPIRE', globalKey, String(DAY), 'NX'],
    ]);

    if (Number(hour) > PER_IP_HOUR || Number(day) > PER_IP_DAY) {
      return res.status(429).json({ error: 'Ya me dejaste varias. Gracias: probá más tarde.' });
    }
    if (Number(global) > GLOBAL_DAY) {
      logError('recommend', { status: 429, message: 'techo diario global alcanzado' });
      return res
        .status(429)
        .json({ error: 'Hoy ya me recomendaron un montón. Probá mañana, en serio.' });
    }

    // Misma canción en el mismo día: se acepta y no se guarda otra vez.
    const [fresh] = await kvPipeline([
      ['SET', `recdup:${result.fingerprint}`, '1', 'EX', String(DAY), 'NX'],
    ]);
    if (fresh !== 'OK') return res.status(200).json({ ok: true });

    await kvPipeline([
      ['LPUSH', 'recs', JSON.stringify(result.entry)],
      ['LTRIM', 'recs', '0', String(KEEP - 1)],
    ]);
    return res.status(200).json({ ok: true });
  } catch (error) {
    logError('recommend', error);
    return res.status(500).json({ error: 'No se pudo guardar. Probá de nuevo en un rato.' });
  }
}
