/**
 * Mis Wrapped, un año por entrada: el bloque «Mis Wrapped» bajo las playlists.
 *
 * No son las playlists «Tus canciones favoritas 20XX» que arma Spotify: ésas son
 * propiedad de Spotify y la API pública las bloquea (devuelven 404, como Discover
 * Weekly). Son COPIAS en mi cuenta, públicas: en la app, abrir la de cada año,
 * Ctrl+A, «Añadir a playlist» → «Nueva playlist», y ponerla pública.
 *
 * Se copian las cien enteras aunque se vean WRAPPED_TRACKS: el corte vive aquí,
 * así que enseñar más es cambiar un número y no volver a copiar nueve playlists.
 * Los previews se resuelven sólo para las que se ven, no para las cien.
 *
 * El orden es el de los chips, del más nuevo al más viejo. El rótulo es el año;
 * el nombre de la cabecera sale de Spotify, así que conviene llamarlas
 * «Wrapped 20XX».
 *
 * Los links van sin el `?si=...`, como en `playlists.js`.
 */
export const WRAPPED_TRACKS = 30;

export const WRAPPED = [
  { year: 2025, ref: 'https://open.spotify.com/playlist/1ikdj2AvRamEcKo2xbysgR' },
  { year: 2024, ref: 'https://open.spotify.com/playlist/06id5ObHRXgphk7TczNtYB' },
  { year: 2023, ref: 'https://open.spotify.com/playlist/5iCeRcBfm8xsaaZEIMgKgN' },
  { year: 2022, ref: 'https://open.spotify.com/playlist/5xw3EockXIqn8gTrOxaCj8' },
  { year: 2021, ref: 'https://open.spotify.com/playlist/5lkpwMRDrx6ULhkDnXe7VS' },
  { year: 2020, ref: 'https://open.spotify.com/playlist/2wvy920ZWC7gkTZNJmTpab' },
  { year: 2019, ref: 'https://open.spotify.com/playlist/5VTZbuIqZZDSW66ZVyBKA6' },
  { year: 2018, ref: 'https://open.spotify.com/playlist/3o0mXtBaihvaRkMjjnlfaf' },
  { year: 2017, ref: 'https://open.spotify.com/playlist/3bhiodtrPoTVQANNnOO1DB' },
];
