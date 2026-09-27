import { describe, expect, it } from 'vitest';
import {
  passwordMatches,
  readCookie,
  sessionCookie,
  sessionSecret,
  signSession,
  verifySession,
} from '../api/_admin.js';
import { checkRecommendation, recKey, youtubeUrlFrom } from '../api/_recommendation.js';
import { cleanVideoTitle } from '../api/_recs.js';

const NOW = 1_800_000_000_000;
const secret = sessionSecret('clave-de-prueba');

describe('sesion del panel', () => {
  it('una firma valida y sin caducar pasa', () => {
    expect(verifySession(signSession(NOW + 60_000, secret), secret, NOW)).toBe(true);
  });

  it('caducada, alterada o de otra contraseña, no', () => {
    const cookie = signSession(NOW + 60_000, secret);
    expect(verifySession(signSession(NOW - 1, secret), secret, NOW)).toBe(false);
    expect(verifySession(cookie.replace(/^\d+/, String(NOW + 9e9)), secret, NOW)).toBe(false);
    expect(verifySession(cookie, sessionSecret('otra'), NOW)).toBe(false);
    expect(verifySession('', secret, NOW)).toBe(false);
    expect(verifySession(null, secret, NOW)).toBe(false);
    expect(verifySession(cookie, '', NOW)).toBe(false);
  });

  it('la contraseña se compara entera', () => {
    expect(passwordMatches('clave', 'clave')).toBe(true);
    expect(passwordMatches('clav', 'clave')).toBe(false);
    expect(passwordMatches('', 'clave')).toBe(false);
    expect(passwordMatches('clave', '')).toBe(false);
    expect(passwordMatches(undefined, 'clave')).toBe(false);
  });

  it('lee una cookie entre varias', () => {
    const req = { headers: { cookie: 'a=1; admin=123.abc; b=2' } };
    expect(readCookie(req, 'admin')).toBe('123.abc');
    expect(readCookie(req, 'nada')).toBeNull();
    expect(readCookie({ headers: {} }, 'admin')).toBeNull();
  });

  it('la cookie solo viaja al panel y no la lee JavaScript', () => {
    const header = sessionCookie('x', { maxAge: 60, secure: true });
    expect(header).toContain('Path=/api/admin');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Secure');
    expect(sessionCookie('x', { maxAge: 60, secure: false })).not.toContain('Secure');
  });
});

describe('recomendaciones en el panel', () => {
  it('las nuevas llevan id; las viejas se reconocen por la fecha', () => {
    const { entry } = checkRecommendation({
      song: 'Berghain — Rosalía',
      name: 'Lu',
      elapsed: 12_000,
    });
    expect(entry.id).toMatch(/^[a-z0-9]{10,}$/);
    expect(recKey(entry)).toBe(entry.id);
    expect(recKey({ at: '2026-09-27T15:24:00.000Z' })).toBe('2026-09-27T15:24:00.000Z');
  });

  it('reconoce los links de YouTube', () => {
    expect(youtubeUrlFrom('mirá https://www.youtube.com/watch?v=8LATUJGwcJU&list=RD')).toBe(
      'https://www.youtube.com/watch?v=8LATUJGwcJU&list=RD',
    );
    expect(youtubeUrlFrom('https://youtu.be/8LATUJGwcJU')).toBe('https://youtu.be/8LATUJGwcJU');
    expect(youtubeUrlFrom('https://open.spotify.com/track/x')).toBeNull();
  });

  it('limpia el titulo del video para buscarlo', () => {
    expect(cleanVideoTitle('Bad Bunny - DtMF (Official Video)')).toBe('Bad Bunny - DtMF');
    expect(cleanVideoTitle('Artista - Tema [Lyric Video] HD')).toBe('Artista - Tema HD');
  });
});
