/**
 * Redis de Upstash por su API REST, sin dependencias.
 *
 * Es lo que Vercel ofrece como almacenamiento clave-valor (Marketplace ->
 * Upstash). Al conectarlo al proyecto crea KV_REST_API_URL y KV_REST_API_TOKEN;
 * si se crea a mano en upstash.com las variables se llaman
 * UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN. Valen las dos.
 *
 * Sin ninguna, `kvConfigured()` es false y las funciones que lo usan (las
 * reacciones y las recomendaciones) responden 503: la web lee eso como "esto
 * no está encendido" y no enseña los botones.
 */

function credentials() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

export function kvConfigured() {
  return credentials() !== null;
}

/**
 * Varios comandos en una sola petición. Devuelve el resultado de cada uno, en
 * orden; un comando que falle deja `null` en su sitio en vez de tumbar a los
 * demás.
 */
export async function kvPipeline(commands) {
  const creds = credentials();
  if (!creds) throw new Error('KV sin configurar');

  const response = await fetch(`${creds.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!response.ok) throw new Error(`KV ${response.status}`);

  const results = await response.json();
  return results.map((item) => (item && 'result' in item ? item.result : null));
}

export async function kv(...command) {
  const [result] = await kvPipeline([command]);
  return result;
}

/** Vercel pone la IP real en x-forwarded-for; en local vale cualquier cosa. */
export function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'local';
}

/**
 * Solo desde la propia web. Los navegadores mandan Origin en todo POST. Lo
 * usan los dos endpoints que escriben: las recomendaciones y el panel.
 */
export function sameOrigin(req) {
  const origin = req.headers?.origin;
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Límite por IP guardado en el propio Redis, compartido entre instancias (el de
 * _ratelimit.js vive en memoria y vale para frenar curiosos, no para proteger
 * algo que escribe). Devuelve true si hay que rechazar.
 */
export async function overLimit(req, bucket, max, windowSeconds) {
  const key = `rl:${bucket}:${clientIp(req)}`;
  const [count] = await kvPipeline([
    ['INCR', key],
    ['EXPIRE', key, String(windowSeconds), 'NX'],
  ]);
  return Number(count) > max;
}

/** El cuerpo JSON de un POST, venga ya parseado (Vercel) o en crudo (dev-api). */
export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10_000) throw new Error('Cuerpo demasiado grande');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
