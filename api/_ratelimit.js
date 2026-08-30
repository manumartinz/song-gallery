/**
 * Limite de peticiones por IP, para que una web publica no deje la cuota de
 * Spotify (y las invocaciones de Vercel) a merced de cualquiera.
 *
 * El contador vive en memoria de la instancia, asi que con varias instancias en
 * caliente el limite efectivo es mayor. Es a proposito: frena el curioseo y los
 * scripts tontos, que es el caso realista, sin montar un Redis para una galeria
 * de musica. Un atacante decidido no se para con esto.
 *
 * Ojo: las respuestas servidas por la cache del edge NUNCA llegan aqui, asi que
 * el visitante normal apenas gasta cupo.
 */

const WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const MAX_HITS = 60; // ~10 cargas de playlist completas por ventana

const hits = new Map(); // ip -> { count, resetAt }

/** Vercel pone la IP real en x-forwarded-for; en local vale cualquier cosa. */
function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'local';
}

/**
 * Devuelve true si la peticion se ha atendido con un 429. Quien llama debe
 * cortar en ese caso.
 */
export function rateLimited(req, res) {
  const ip = clientIp(req);
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });

    // Poda barata: sin esto el Map crece sin fin en una instancia longeva.
    if (hits.size > 5000) {
      for (const [key, value] of hits) if (value.resetAt <= now) hits.delete(key);
    }
    return false;
  }

  entry.count += 1;
  if (entry.count <= MAX_HITS) return false;

  const seconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  res.setHeader('Retry-After', String(seconds));
  res.status(429).json({
    error: 'Demasiadas peticiones seguidas. Prueba de nuevo en unos minutos.',
  });
  return true;
}
