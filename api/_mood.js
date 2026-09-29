/**
 * La búsqueda por ánimo sin red ni Redis: se prueba sola.
 *
 * La IA elige de un catálogo CERRADO (mis playlists) y devuelve ids. Todo lo
 * que diga se filtra acá: un id que no está en el catálogo es una canción
 * inventada, y no llega a la web.
 */

/* `perList` y `perArtist`: cuántas de una misma playlist y de un mismo
   artista entran en una selección. trip up es dos tercios del catálogo y, sin
   tope, la IA la elegía casi siempre (y a RÜFÜS DU SOL tres veces seguidas). */
export const LIMITS = {
  q: 80,
  minQ: 3,
  picks: 8,
  perList: 4,
  perArtist: 2,
  minPicks: 5,
  why: 110,
  intro: 160,
  avoid: 40,
};

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

/**
 * Una pista normalizada a lo poco que la IA necesita para elegir, con el
 * rótulo de la playlist de la que sale (`list`), para poder mezclarlas.
 */
export function catalogEntry(track, list = null) {
  return {
    id: track.id,
    title: track.title,
    artist: track.artistLine,
    genre: track.genre || null,
    year: track.year || null,
    list,
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

/** Las canciones del catálogo agrupadas por playlist, en el orden en que aparecen. */
export function groupByList(catalog) {
  const groups = new Map();
  for (const entry of catalog) {
    const list = entry.list || '-';
    if (!groups.has(list)) groups.set(list, []);
    groups.get(list).push(entry);
  }
  return groups;
}

/**
 * El catálogo en una sección por playlist. Así se le manda a la búsqueda por
 * ánimo: con la playlist como una columna más, la IA elegía casi todo de la
 * más grande; separadas, las recorre una por una.
 */
export function catalogSections(catalog) {
  return [...groupByList(catalog)]
    .map(([list, entries]) => `### Playlist «${list}»\n${catalogText(entries)}`)
    .join('\n\n');
}

const mainArtist = (artist) => String(artist ?? '').split(',')[0].trim().toLowerCase();

/**
 * Lo que devolvió la IA, ya limpio: solo ids del catálogo, sin repetir, con su
 * porqué recortado, y mezclando.
 *
 * La IA devuelve sus elegidas por playlist (`lists`) y acá se intercalan por
 * turnos, una de cada una, para que la selección suene variada de punta a
 * punta. La playlist de cada canción se lee del catálogo, no de lo que diga la
 * IA. Van como mucho `perList` de una misma playlist y `perArtist` de un
 * mismo artista; las que se pasan quedan de reserva y vuelven, en su orden,
 * solo si sin ellas la selección se queda en menos de `minPicks`: si el pedido
 * solo encaja en una playlist, mejor eso que una selección de tres.
 *
 * También acepta una lista plana (`picks`), que se agrupa igual.
 * Null si no queda nada que enseñar.
 */
export function checkPicks(raw, catalog) {
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  const seen = new Set();

  const proposed = Array.isArray(raw?.lists)
    ? raw.lists.flatMap((group) => (Array.isArray(group?.picks) ? group.picks : []))
    : Array.isArray(raw?.picks)
      ? raw.picks
      : [];

  // Por playlist, en el orden de la IA (de la que mejor encaja a la que menos).
  const groups = new Map();
  for (const pick of proposed) {
    const id = String(pick?.id ?? '').trim();
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);
    const list = byId.get(id).list || '-';
    if (!groups.has(list)) groups.set(list, []);
    groups.get(list).push({ id, why: clean(pick.why, LIMITS.why) || null });
  }

  // Por turnos: la primera de cada playlist, después la segunda de cada una...
  const queues = [...groups.values()];
  const interleaved = [];
  for (let round = 0; queues.some((queue) => round < queue.length); round += 1) {
    for (const queue of queues) if (round < queue.length) interleaved.push(queue[round]);
  }

  const perList = new Map();
  const perArtist = new Map();
  const picks = [];
  const spare = [];
  for (const entry of interleaved) {
    const { list, artist } = byId.get(entry.id);
    const who = mainArtist(artist);
    const overList = list && (perList.get(list) || 0) >= LIMITS.perList;
    const overArtist = who && (perArtist.get(who) || 0) >= LIMITS.perArtist;
    if (overList || overArtist || picks.length === LIMITS.picks) {
      spare.push(entry);
      continue;
    }
    if (list) perList.set(list, (perList.get(list) || 0) + 1);
    if (who) perArtist.set(who, (perArtist.get(who) || 0) + 1);
    picks.push(entry);
  }

  while (picks.length < LIMITS.minPicks && spare.length) picks.push(spare.shift());

  if (!picks.length) return null;
  return { intro: clean(raw.intro, LIMITS.intro) || null, picks };
}
