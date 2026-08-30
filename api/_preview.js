/**
 * Resuelve la URL del preview de 30 s de cada tema.
 *
 * Spotify dejo de exponer `preview_url` (siempre null con Client Credentials),
 * asi que buscamos el audio en otro catalogo:
 *   1. Deezer por ISRC  -> coincidencia exacta, sin ambiguedad.
 *   2. Deezer por texto -> por si el ISRC no esta indexado.
 *   3. iTunes por texto -> ultimo recurso.
 *
 * Corre en el servidor porque api.deezer.com no envia cabeceras CORS.
 * La reproduccion si funciona desde el navegador: un <audio src> plano
 * no necesita CORS (solo lo necesitaria un analisis con Web Audio).
 */

const TIMEOUT_MS = 2500;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null; // timeout, red caida o JSON invalido: se trata como "sin preview"
  } finally {
    clearTimeout(timer);
  }
}

/** Normaliza para comparar titulos: sin acentos, sin parentesis, sin sufijos de edicion. */
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(feat|ft|featuring|with|remaster(ed)?|radio edit|single version|deluxe)\b.*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** true si dos cadenas normalizadas coinciden o una contiene a la otra. */
function looselyEqual(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

async function fromDeezerIsrc(isrc) {
  if (!isrc) return null;
  const data = await fetchJson(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`);
  if (!data || data.error || !data.preview) return null;
  return { previewUrl: data.preview, previewSource: 'deezer' };
}

async function fromDeezerSearch(title, artist) {
  const query = `artist:"${artist}" track:"${title}"`;
  const data = await fetchJson(
    `https://api.deezer.com/search?limit=5&q=${encodeURIComponent(query)}`,
  );
  const candidates = data && Array.isArray(data.data) ? data.data : [];
  const hit = candidates.find(
    (item) => item.preview && looselyEqual(item.title, title) && looselyEqual(item.artist?.name, artist),
  );
  return hit ? { previewUrl: hit.preview, previewSource: 'deezer' } : null;
}

async function fromItunes(title, artist, durationMs) {
  const data = await fetchJson(
    `https://itunes.apple.com/search?entity=song&limit=8&term=${encodeURIComponent(`${artist} ${title}`)}`,
  );
  const candidates = data && Array.isArray(data.results) ? data.results : [];

  const scored = candidates
    .filter((item) => item.previewUrl)
    .map((item) => {
      let score = 0;
      if (looselyEqual(item.trackName, title)) score += 3;
      if (looselyEqual(item.artistName, artist)) score += 2;
      // Un preview del tema correcto suele durar lo mismo (+-3 s).
      if (durationMs && Math.abs(item.trackTimeMillis - durationMs) < 3000) score += 1;
      return { item, score };
    })
    .filter((entry) => entry.score >= 4)
    .sort((a, b) => b.score - a.score);

  return scored.length
    ? { previewUrl: scored[0].item.previewUrl, previewSource: 'itunes' }
    : null;
}

/** Devuelve { previewUrl, previewSource } o null si ningun catalogo tiene el tema. */
export async function resolvePreview({ isrc, title, artist, durationMs }) {
  return (
    (await fromDeezerIsrc(isrc)) ||
    (await fromDeezerSearch(title, artist)) ||
    (await fromItunes(title, artist, durationMs)) ||
    null
  );
}

/** Ejecuta `worker` sobre `items` con un limite de peticiones simultaneas. */
export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}
