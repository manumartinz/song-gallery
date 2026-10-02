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
 *  4. Límites en Redis, compartidos entre instancias: hasta 5 por IP y, con
 *     la quinta, 6 horas de pausa contadas desde ella; y 150 por día en total,
 *     que es el techo de lo que puede crecer la lista aunque lleguen desde
 *     muchas IPs a la vez.
 *  5. La misma canción dos veces en un día cuenta una: la segunda se acepta
 *     sin guardarse.
 */
import { clientIp, kvConfigured, kvPipeline, readJson, sameOrigin } from './_kv.js';
import { checkRecommendation } from './_recommendation.js';
import { logError } from './_log.js';

const KEEP = 2000;
const DAY = 86_400;
/* Cada persona manda hasta PER_IP; con la última se le corta PAUSE segundos.
   Si se queda corta, el cupo se renueva solo PAUSE después del primer envío. */
const PER_IP = 5;
const PAUSE = 6 * 3600;
const GLOBAL_DAY = 150;

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
    const ipKey = `rl:rec:ip:${ip}`;
    const globalKey = `rl:rec:all:${today}`;

    // Todo en un solo viaje a Redis.
    const [sent, , global] = await kvPipeline([
      ['INCR', ipKey],
      ['EXPIRE', ipKey, String(PAUSE), 'NX'],
      ['INCR', globalKey],
      ['EXPIRE', globalKey, String(DAY), 'NX'],
    ]);

    if (Number(sent) > PER_IP) {
      return res
        .status(429)
        .json({ error: `Ya me mandaste ${PER_IP}. ¡Gracias! En unas horas podés mandarme más.` });
    }
    // Con la última del cupo, la pausa empieza a contar desde ahora y no desde
    // la primera: si no, quien las espacia casi no tendría pausa.
    if (Number(sent) === PER_IP) await kvPipeline([['EXPIRE', ipKey, String(PAUSE)]]);
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
