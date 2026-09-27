/**
 * Validación de una recomendación, sin red ni Redis: se prueba sola.
 *
 * Devuelve una de tres cosas:
 *   { ok: true, entry, fingerprint }  -> se guarda
 *   { ok: false, error }              -> se le explica a la persona (400)
 *   { ok: false, silent: true }       -> parece un bot: se le dice que sí y
 *                                        no se guarda nada, para no enseñarle
 *                                        qué lo delató
 */

export const LIMITS = { song: 200, name: 60, message: 400 };
/* Una persona tarda más que esto en leer el modal y escribir una canción y su
   nombre. Un script que rellena y envía, no. */
export const MIN_FILL_MS = 3000;
const MAX_LINKS = 2;

function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const countLinks = (text) => (text.match(/https?:\/\/|www\./gi) || []).length;

/** Para reconocer la misma canción mandada otra vez con otra ortografía. */
export function normalizeSong(song) {
  return song
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\?.*$/, '') // el ?si= de los links de Spotify cambia en cada copia
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 120);
}

const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8).padEnd(6, '0');

/** Con qué se identifica una recomendación guardada: su id, o su fecha si es vieja. */
export const recKey = (rec) => rec?.id || rec?.at || null;

/** El primer link de YouTube del texto (youtube.com o youtu.be), o null. */
export function youtubeUrlFrom(text) {
  const match = String(text ?? '').match(
    /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch|shorts\/)|youtu\.be\/)\S+/i,
  );
  return match ? match[0] : null;
}

/** El id de canción de un link de Spotify pegado en el texto, o null. */
export function trackIdFrom(text) {
  const match = String(text ?? '').match(/track[/:]([A-Za-z0-9]{22})/);
  return match ? match[1] : null;
}

/**
 * Lo que se le pregunta al buscador de Spotify por una recomendación escrita a
 * mano ("Canción — Artista", "canción de artista"...): sin links ni rayas, que
 * el buscador lee como parte del título.
 */
export function searchQueryFor(text) {
  return String(text ?? '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[—–\-|·"“”«»]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkRecommendation(body = {}) {
  // Trampas para bots: el campo invisible y la velocidad de relleno.
  if (body.website) return { ok: false, silent: true };
  const elapsed = Number(body.elapsed);
  if (!Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) return { ok: false, silent: true };

  const song = clean(body.song, LIMITS.song);
  const name = clean(body.name, LIMITS.name);
  const message = clean(body.message, LIMITS.message) || null;

  if (song.length < 3) return { ok: false, error: 'Poné el link o el nombre de la canción.' };
  if (name.length < 2) return { ok: false, error: 'Poné tu nombre, así sé quién sos.' };

  const all = [song, name, message || ''].join(' ');
  if (/<[a-z/!]/i.test(all)) return { ok: false, error: 'Sin etiquetas HTML, por favor.' };
  if (countLinks(name)) return { ok: false, error: 'El nombre no puede ser un link.' };
  if (countLinks(all) > MAX_LINKS) {
    return { ok: false, error: 'Demasiados links. Con el de la canción alcanza.' };
  }
  // Un mismo carácter veinte veces seguidas es teclado aporreado o relleno.
  if (/(.)\1{19,}/.test(all)) return { ok: false, error: 'Eso no parece una canción.' };

  return {
    ok: true,
    /* `id` es con lo que el panel marca la recomendación como agregada o
       descartada. Las anteriores no lo tienen y se reconocen por `at`. No es
       un secreto, solo tiene que no repetirse. */
    entry: { id: newId(), song, name, message, at: new Date().toISOString() },
    fingerprint: normalizeSong(song),
  };
}
