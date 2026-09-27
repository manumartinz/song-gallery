import { describe, expect, it } from 'vitest';
import { checkRecommendation, normalizeSong } from '../api/_recommendation.js';

const valid = {
  song: 'https://open.spotify.com/track/52p6Vadc9zlHxihhrlfhPS?si=abc',
  name: 'Lu',
  message: 'Escuchala de noche.',
  website: '',
  elapsed: 12_000,
};

describe('checkRecommendation', () => {
  it('acepta una recomendacion normal y la limpia', () => {
    const result = checkRecommendation({ ...valid, song: '  Basquiat   —  Black Hibiscus ' });
    expect(result.ok).toBe(true);
    expect(result.entry).toMatchObject({ song: 'Basquiat — Black Hibiscus', name: 'Lu' });
  });

  it('el mensaje es opcional; el nombre no', () => {
    expect(checkRecommendation({ ...valid, message: '' }).entry.message).toBeNull();
    expect(checkRecommendation({ ...valid, name: ' ' })).toMatchObject({ ok: false });
    expect(checkRecommendation({ ...valid, name: undefined }).error).toMatch(/nombre/);
  });

  it('a los bots les dice que si sin guardar: campo trampa o relleno instantaneo', () => {
    expect(checkRecommendation({ ...valid, website: 'http://spam' })).toEqual({
      ok: false,
      silent: true,
    });
    expect(checkRecommendation({ ...valid, elapsed: 400 }).silent).toBe(true);
    expect(checkRecommendation({ ...valid, elapsed: undefined }).silent).toBe(true);
  });

  it('rechaza HTML, nombres que son links, demasiados links y relleno', () => {
    expect(checkRecommendation({ ...valid, message: '<script>x</script>' }).ok).toBe(false);
    expect(checkRecommendation({ ...valid, name: 'www.spam.com' }).ok).toBe(false);
    expect(
      checkRecommendation({ ...valid, message: 'https://a.com https://b.com' }).error,
    ).toMatch(/links/);
    expect(checkRecommendation({ ...valid, message: 'a'.repeat(30) }).ok).toBe(false);
  });

  it('corta lo que se pasa de largo en vez de guardarlo entero', () => {
    const { entry } = checkRecommendation({ ...valid, message: 'hola '.repeat(200) });
    expect(entry.message.length).toBeLessThanOrEqual(400);
  });
});

describe('normalizeSong', () => {
  it('reconoce la misma cancion con otro ?si= u otra ortografia', () => {
    expect(normalizeSong('https://open.spotify.com/track/abc?si=1')).toBe(
      normalizeSong('https://open.spotify.com/track/abc?si=2'),
    );
    expect(normalizeSong('Canción — Artista')).toBe(normalizeSong('cancion artista'));
  });
});
