/**
 * Cliente de /api/playlist y /api/album con cache en localStorage.
 *
 * La funcion serverless ya cachea en el edge de Vercel; esta capa evita
 * ademas el viaje de red en recargas y al ir y volver entre fuentes.
 *
 * Una "fuente" es siempre `{ kind, id }`, con kind 'playlist' o 'album'. Los
 * dos tipos de id son indistinguibles a simple vista (22 caracteres en base62),
 * asi que el tipo viaja al lado y nunca se adivina.
 */

const TTL_MS = 60 * 60 * 1000; // 1 h
/* La version va en la clave: al cambiar la forma de la respuesta (por ejemplo
   al añadir el tamaño intermedio de portada) hay que subirla, o quien vuelva
   con caché de una hora recibiria datos con la forma vieja.

   Los albumes estrenan su propio prefijo en vez de compartir el de playlists:
   asi nadie que ya tenga playlists guardadas pierde su caché por un cambio que
   no le afecta. */
const PREFIXES = {
  playlist: 'song-gallery:playlist:v2:',
  /* v2: se añadió `art` a la respuesta del álbum para la portada de la
     cabecera. Sin subirla, quien tuviera un álbum cacheado de la hora anterior
     lo abriría sin portada hasta que caducase. */
  album: 'song-gallery:album:v2:',
};

function prefixFor(kind) {
  return PREFIXES[kind] || PREFIXES.playlist;
}

function readCache(kind, key) {
  try {
    const raw = localStorage.getItem(prefixFor(kind) + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || Date.now() - entry.at > TTL_MS) {
      localStorage.removeItem(prefixFor(kind) + key);
      return null;
    }
    return entry.data;
  } catch {
    return null; // modo privado o cuota llena: seguimos sin cache
  }
}

function writeCache(kind, key, data) {
  try {
    localStorage.setItem(prefixFor(kind) + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* sin cache, sin drama */
  }
}

/**
 * Error de red con el codigo HTTP colgado.
 *
 * Sin el status, quien llama no puede distinguir "este tramo ha fallado" de
 * "me estan frenando", y la diferencia importa: lo primero se reintenta con el
 * siguiente tramo, lo segundo obliga a parar.
 */
function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Olvida la playlist cacheada.
 *
 * La usa el borrado de playlists pegadas: cada payload ocupa del orden de
 * 170 KB en una de 200 pistas, y hasta ahora nada los desalojaba salvo volver
 * a leerlos ya caducados. Al quitar la playlist del menu no queda ninguna
 * ocasion de releerla, asi que su hueco se quedaria ocupado para siempre.
 */
export function dropPlaylistCache(ref) {
  const id = parsePlaylistRef(ref);
  if (!id) return;
  try {
    localStorage.removeItem(PREFIXES.playlist + id);
  } catch {
    /* sin almacenamiento no habia nada que borrar */
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

/** Lo mismo para albumes. Un id pelado tambien vale: quien llama sabe que pide. */
export function parseAlbumRef(ref) {
  if (!ref) return null;
  const value = String(ref).trim();
  const match = value.match(/album[/:]([A-Za-z0-9]{22})/) || value.match(/^([A-Za-z0-9]{22})$/);
  return match ? match[1] : null;
}

/** Carga la fuente entera (metadata, sin previews) tirando de caché si la hay. */
export async function fetchSource({ kind, id }, { signal } = {}) {
  if (!id) {
    throw new Error('Ese link no parece una playlist ni un álbum de Spotify.');
  }

  const cached = readCache(kind, id);
  if (cached) return cached;

  const route = kind === 'album' ? 'album' : 'playlist';
  const response = await fetch(`/api/${route}?ref=${encodeURIComponent(id)}`, { signal });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw httpError(
      body.error ||
        `No se pudo cargar ${kind === 'album' ? 'el álbum' : 'la playlist'} (${response.status}).`,
      response.status,
    );
  }

  writeCache(kind, id, body);
  return body;
}

/**
 * Resuelve las URLs de preview de un tramo de la playlist.
 *
 * Devuelve entradas indexadas por id de pista, no por posicion: el endpoint de
 * metadata descarta episodios y pistas locales, asi que las posiciones del
 * cliente no coinciden con los offsets de Spotify.
 */
export async function fetchPreviews({ kind, id }, offset, limit, { signal } = {}) {
  const response = await fetch(
    `/api/previews?ref=${encodeURIComponent(id)}&kind=${kind}&offset=${offset}&limit=${limit}`,
    { signal },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw httpError(
      body.error || `No se pudieron resolver los previews (${response.status}).`,
      response.status,
    );
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
export function cachePlaylist({ kind, id }, data) {
  const tracks = data.tracks.map(({ previewUrl, previewSource, ...rest }) => rest);
  writeCache(kind, id, { ...data, tracks });
}

