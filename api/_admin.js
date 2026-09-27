/**
 * La sesión del panel /admin, sin red ni Redis: se prueba sola.
 *
 * Una sola persona entra, con la contraseña de ADMIN_PASSWORD. Al entrar se
 * deja una cookie `admin=<caducidad>.<firma>`: no guarda nada en el servidor,
 * la firma basta para saber que la emitió quien conoce la contraseña. La clave
 * de la firma sale de la propia contraseña, así que cambiarla cierra todas las
 * sesiones abiertas.
 *
 * Solo corre en Node (usa node:crypto), nunca en el edge.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'admin';
export const SESSION_DAYS = 30;

const sha256 = (value) => createHash('sha256').update(String(value)).digest();

/** La clave de firma: derivada, para no firmar con la contraseña tal cual. */
export function sessionSecret(password) {
  return createHash('sha256').update(`song-gallery-admin:${password}`).digest('hex');
}

/** Compara en tiempo constante, sobre hashes para que el largo no cuente. */
export function passwordMatches(given, expected) {
  if (!expected || typeof given !== 'string' || !given) return false;
  return timingSafeEqual(sha256(given), sha256(expected));
}

function signature(exp, secret) {
  return createHmac('sha256', secret).update(String(exp)).digest('base64url');
}

export function signSession(exp, secret) {
  return `${exp}.${signature(exp, secret)}`;
}

/** true si la cookie la firmó esta clave y todavía no caducó. */
export function verifySession(value, secret, now = Date.now()) {
  const match = /^(\d{10,16})\.([A-Za-z0-9_-]+)$/.exec(String(value ?? ''));
  if (!match || !secret) return false;

  const exp = Number(match[1]);
  if (!Number.isFinite(exp) || exp <= now) return false;

  const expected = Buffer.from(signature(exp, secret));
  const given = Buffer.from(match[2]);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Una cookie de la petición, o null. */
export function readCookie(req, name) {
  const header = req.headers?.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/**
 * La cabecera Set-Cookie. `Path=/api/admin`: la cookie solo viaja al panel,
 * nunca a la galería ni a sus imágenes. `Secure` en todo lo que no sea local,
 * donde se sirve por http.
 */
export function sessionCookie(value, { maxAge, secure }) {
  return [
    `${COOKIE}=${value}`,
    'Path=/api/admin',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');
}
