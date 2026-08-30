/**
 * Cliente de /api/playlist con cache en localStorage.
 *
 * La funcion serverless ya cachea en el edge de Vercel; esta capa evita
 * ademas el viaje de red en recargas y al ir y volver entre playlists.
 */

const TTL_MS = 60 * 60 * 1000; // 1 h
/* La version va en la clave: al cambiar la forma de la respuesta (por ejemplo
   al añadir el tamaño intermedio de portada) hay que subirla, o quien vuelva
   con caché de una hora recibiria datos con la forma vieja. */
const PREFIX = 'song-gallery:playlist:v2:';

function readCache(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || Date.now() - entry.at > TTL_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null; // modo privado o cuota llena: seguimos sin cache
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* sin cache, sin drama */
  }
}

/** Extrae el id de playlist de una URL, un URI o un id pelado. */
export function parsePlaylistRef(ref) {
  if (!ref) return null;
  const value = String(ref).trim();
  const match =
    value.match(/playlist[/:]([A-Za-z0-9]{22})/) || value.match(/^([A-Za-z0-9]{22})$/);
  return match ? match[1] : null;
}

export async function fetchPlaylist(ref, { signal } = {}) {
  const id = parsePlaylistRef(ref);
  if (!id) {
    throw new Error('Ese link no parece una playlist de Spotify.');
  }

  const cached = readCache(id);
  if (cached) return cached;

  const response = await fetch(`/api/playlist?ref=${encodeURIComponent(id)}`, { signal });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || `No se pudo cargar la playlist (${response.status}).`);
  }

  writeCache(id, body);
  return body;
}

/**
 * Resuelve las URLs de preview de un tramo de la playlist.
 *
 * Devuelve entradas indexadas por id de pista, no por posicion: el endpoint de
 * metadata descarta episodios y pistas locales, asi que las posiciones del
 * cliente no coinciden con los offsets de Spotify.
 */
export async function fetchPreviews(id, offset, limit, { signal } = {}) {
  const response = await fetch(
    `/api/previews?ref=${encodeURIComponent(id)}&offset=${offset}&limit=${limit}`,
    { signal },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `No se pudieron resolver los previews (${response.status}).`);
  }

  const body = await response.json();
  return Array.isArray(body.previews) ? body.previews : [];
}

/**
 * Reescribe la entrada cacheada conservando SOLO la metadata.
 *
 * Las URLs de preview van firmadas y caducan a los ~15 minutos, asi que
 * guardarlas seria servir enlaces muertos a quien vuelva: la playlist cargaria
 * pero no sonaria ni una cancion. Se cachea lo caro (los datos de Spotify) y
 * los audios se vuelven a resolver, que es rapido.
 */
export function cachePlaylist(id, data) {
  const tracks = data.tracks.map(({ previewUrl, previewSource, ...rest }) => rest);
  writeCache(id, { ...data, tracks });
}
