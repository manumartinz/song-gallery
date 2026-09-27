/**
 * /api/admin?op=...  El panel donde reviso las recomendaciones.
 *
 *   GET  session            -> { ok } ¿hay sesión?
 *   POST login  { password }
 *   POST logout
 *   GET  recs               -> { recs, playlist } todas, con su estado
 *   GET  resolve  &key=&q=  -> candidatos para una recomendación
 *   POST add      { key, trackId }
 *   POST discard  { key }  /  POST restore { key }
 *   GET  playlist           -> { items } lo que hay en la playlist
 *   POST remove   { trackId }
 *   POST move     { from, to }
 *
 * Una sola función y no una por operación: el plan de Vercel limita cuántas
 * hay por deploy, y la galería ya usa casi todas.
 *
 * Sin ADMIN_PASSWORD o sin Redis responde 404, como si no existiera. Todo lo
 * que no sea mirar la sesión o entrar pide la cookie firmada (_admin.js), y
 * todo POST tiene que venir de la propia web.
 */
import {
  COOKIE,
  SESSION_DAYS,
  passwordMatches,
  readCookie,
  sessionCookie,
  sessionSecret,
  signSession,
  verifySession,
} from './_admin.js';
import { kvConfigured, overLimit, readJson, sameOrigin } from './_kv.js';
import {
  addRec,
  discardRec,
  findRec,
  listRecs,
  moveItem,
  playlistItems,
  recsPlaylistId,
  removeItem,
  resolveRec,
  restoreRec,
} from './_recs.js';
import { SpotifyError } from './_spotify.js';
import { logError } from './_log.js';

const LOGIN_TRIES = 5;
const LOGIN_WINDOW = 15 * 60;

const isLocal = (req) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers?.host || '');

function authed(req) {
  const password = process.env.ADMIN_PASSWORD;
  return verifySession(readCookie(req, COOKIE), password && sessionSecret(password));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (!process.env.ADMIN_PASSWORD || !kvConfigured()) {
    return res.status(404).json({ error: 'No existe.' });
  }

  const op = req.query?.op;
  const post = req.method === 'POST';
  if (post && !sameOrigin(req)) return res.status(403).json({ error: 'No permitido.' });

  try {
    if (op === 'session' && req.method === 'GET') {
      return res.status(200).json({ ok: authed(req), playlist: Boolean(recsPlaylistId()) });
    }

    if (op === 'login' && post) {
      if (await overLimit(req, 'admin-login', LOGIN_TRIES, LOGIN_WINDOW)) {
        return res.status(429).json({ error: 'Demasiados intentos. Probá en 15 minutos.' });
      }
      const { password } = await readJson(req);
      if (!passwordMatches(password, process.env.ADMIN_PASSWORD)) {
        return res.status(401).json({ error: 'Contraseña incorrecta.' });
      }
      const maxAge = SESSION_DAYS * 86_400;
      const value = signSession(Date.now() + maxAge * 1000, sessionSecret(process.env.ADMIN_PASSWORD));
      res.setHeader('Set-Cookie', sessionCookie(value, { maxAge, secure: !isLocal(req) }));
      return res.status(200).json({ ok: true });
    }

    if (op === 'logout' && post) {
      res.setHeader('Set-Cookie', sessionCookie('', { maxAge: 0, secure: !isLocal(req) }));
      return res.status(200).json({ ok: true });
    }

    if (!authed(req)) return res.status(401).json({ error: 'Sesión vencida. Entrá de nuevo.' });

    if (op === 'recs' && req.method === 'GET') {
      return res.status(200).json({ recs: await listRecs() });
    }

    if (op === 'resolve' && req.method === 'GET') {
      const rec = await findRec(req.query.key);
      if (!rec) return res.status(404).json({ error: 'Esa recomendación ya no está.' });
      return res.status(200).json(await resolveRec(rec.song, String(req.query.q || '')));
    }

    if (op === 'playlist' && req.method === 'GET') {
      if (!recsPlaylistId()) return res.status(409).json({ error: 'Falta SPOTIFY_RECS_PLAYLIST.' });
      return res.status(200).json({ items: await playlistItems() });
    }

    if (post) {
      const body = await readJson(req);

      if (op === 'add' || op === 'discard' || op === 'restore') {
        const rec = await findRec(body.key);
        if (!rec) return res.status(404).json({ error: 'Esa recomendación ya no está.' });
        if (op === 'add') {
          if (!recsPlaylistId()) {
            return res.status(409).json({ error: 'Falta SPOTIFY_RECS_PLAYLIST.' });
          }
          await addRec(rec.key, body.trackId);
        } else if (op === 'discard') await discardRec(rec.key);
        else await restoreRec(rec.key);
        return res.status(200).json({ ok: true });
      }

      if (op === 'remove') {
        await removeItem(String(body.trackId || ''));
        return res.status(200).json({ ok: true });
      }

      if (op === 'move') {
        await moveItem(Number(body.from), Number(body.to));
        return res.status(200).json({ ok: true });
      }
    }

    return res.status(400).json({ error: 'Operación desconocida.' });
  } catch (error) {
    const status = error instanceof SpotifyError ? error.status : 500;
    logError('admin', { status, message: error.message }, { op });
    return res.status(status).json({ error: error.message || 'Error inesperado.' });
  }
}
