/**
 * Tus playlists fijas: aparecen siempre en el menú superior.
 *
 * Las playlists que añadas desde la web con el botón "+" se guardan aparte, en
 * el navegador de cada visitante; estas viven en el repo y las ve todo el mundo.
 *
 * Los links van sin el `?si=...` a propósito: ese parámetro es un token de
 * compartir y no pinta nada en un repositorio público.
 *
 * Ojo: solo funcionan playlists PÚBLICAS creadas por un usuario. Las que son
 * propiedad de Spotify (Discover Weekly, Top 50, Radar, This Is...) están
 * bloqueadas en la API pública y devuelven 404.
 *
 * `sort` es opcional: el criterio con el que abre la playlist, uno de las
 * claves de SORTS (`original`, `year`, `added`, `artist`). Sin él abre en
 * `original`, que es el orden tal cual viene de Spotify. Entra en el mismo
 * sentido que si pulsaras el botón: las fechas, de lo último a lo primero.
 */
export const PLAYLISTS = [
  { label: 'show up', ref: 'https://open.spotify.com/playlist/3tCIRspolGNY9rj5pMaDbc' },
  { label: 'trip up', ref: 'https://open.spotify.com/playlist/6O285yjCB4RTJzDadCI93P', sort: 'added' },
];
