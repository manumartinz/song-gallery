/**
 * La búsqueda por ánimo sin red ni Redis: se prueba sola.
 *
 * La IA elige de un catálogo CERRADO (mis playlists) y devuelve ids. Todo lo
 * que diga se filtra acá: un id que no está en el catálogo es una canción
 * inventada, y no llega a la web.
 */

export const LIMITS = { q: 80, minQ: 3, picks: 8, why: 110, intro: 160, avoid: 40 };

export function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** La frase tal como se enseña, o null si no vale. */
export function cleanQuery(value) {
  const q = clean(value, LIMITS.q);
  if (q.length < LIMITS.minQ) return null;
  if (/https?:\/\/|www\./i.test(q)) return null;
  // Un mismo carácter diez veces seguidas es teclado aporreado.
  if (/(.)\1{9,}/.test(q)) return null;
  return q;
}

/**
 * Con qué se reconoce la misma frase escrita distinto: «Para CORRER» y
 * «para correr!» son la misma, y comparten la memoria de lo ya elegido.
 */
export function queryKey(q) {
  return String(q ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* Cada selección tiene su id: es lo que va en `?mood=`, así un link compartido
   abre exactamente lo que vio quien lo compartió, aunque la misma frase dé
   otra cosa la próxima vez. */
const MOOD_ID = /^[a-z0-9]{10}$/;

export function newMoodId() {
  let id = '';
  while (id.length < 10) id += Math.random().toString(36).slice(2);
  return id.slice(0, 10);
}

export function parseMoodId(value) {
  const id = String(value ?? '').trim();
  return MOOD_ID.test(id) ? id : null;
}

/** Una pista normalizada a lo poco que la IA necesita para elegir. */
export function catalogEntry(track) {
  return {
    id: track.id,
    title: track.title,
    artist: track.artistLine,
    genre: track.genre || null,
    year: track.year || null,
  };
}

/** Las de varias playlists juntas, sin repetir la misma canción. */
export function mergeCatalog(lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const entry of list) {
      if (!entry?.id || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

/**
 * Una línea por canción: es lo que se le manda a la IA. Con `ids: false` va
 * sin el id, para cuando el catálogo es solo el gusto de fondo y no de dónde
 * elegir (las parecidas): son tokens de menos.
 */
export function catalogText(catalog, { ids = true } = {}) {
  return catalog
    .map((e) =>
      [...(ids ? [e.id] : []), e.title, e.artist, e.genre || '-', e.year || '-']
        .map((part) => String(part).replace(/\|/g, '/'))
        .join(' | '),
    )
    .join('\n');
}

/**
 * Lo que devolvió la IA, ya limpio: solo ids del catálogo, sin repetir, con su
 * porqué recortado. Null si no queda nada que enseñar.
 */
export function checkPicks(raw, catalog) {
  const known = new Set(catalog.map((entry) => entry.id));
  const seen = new Set();
  const picks = [];

  for (const pick of Array.isArray(raw?.picks) ? raw.picks : []) {
    const id = String(pick?.id ?? '').trim();
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    picks.push({ id, why: clean(pick.why, LIMITS.why) || null });
    if (picks.length === LIMITS.picks) break;
  }

  if (!picks.length) return null;
  return { intro: clean(raw.intro, LIMITS.intro) || null, picks };
}
