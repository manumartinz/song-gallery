/**
 * Tus álbumes fijos: los rótulos que flotan a la izquierda.
 *
 * Son del repo, como las playlists de `playlists.js` y a diferencia de las que
 * pega el visitante: éstos los ve todo el mundo igual. Desde la web no se
 * pueden añadir álbumes a propósito — el `+` del riel sigue siendo sólo para
 * playlists, y sólo sale en su cara de playlists.
 *
 * El orden es el que se ve en la columna, de arriba abajo.
 *
 * Cuántos caben: la columna va centrada a lo alto y no tiene scroll propio, así
 * que la limita la pantalla. Con once rótulos mide unos 410 px y entra de sobra
 * hasta en una ventana de 600 px de alto; a partir de unos quince empezaría a
 * salirse por arriba y por abajo en portátiles bajos.
 *
 * El `label` es lo único que se ve. Se escribe aquí y no se le pide a Spotify
 * —igual que en `playlists.js`— porque son nombres que no cambian nunca, y
 * traerlos por red era una petición en cada visita para escribir un texto que
 * ya está en el repo. Eso deja además acortar los que vienen kilométricos, que
 * es lo que hace falta en una columna estrecha: Spotify llama a uno de estos
 * "Man On The Moon II: The Legend Of Mr. Rager" y a otro "Born To Die - The
 * Paradise Edition".
 *
 * Los links van sin el `?si=...` y sin el `/intl-xx/` a propósito: el primero
 * es un token de compartir que no pinta nada en un repositorio público, y el
 * segundo es el idioma con el que se abrió la web de Spotify ese día.
 */
export const ALBUMS = [
  { label: 'La Vida Era Más Corta', ref: 'https://open.spotify.com/album/0sQR1p7NyAUqMPmWdZ6UBd' },
  { label: 'The Car', ref: 'https://open.spotify.com/album/2GROf0WKoP5Er2M9RXVNNs' },
  { label: 'The Slow Rush', ref: 'https://open.spotify.com/album/31qVWUdRrlb8thMvts0yYL' },
  { label: 'Currents', ref: 'https://open.spotify.com/album/79dL7FLiJFOO0EoehUHQBv' },
  /* Llegó como link de canción ("The Adults Are Talking"); es la que abre este
     disco, así que va el disco. */
  { label: 'The New Abnormal', ref: 'https://open.spotify.com/album/2xkZV2Hl1Omi8rk2D7t5lN' },
  { label: 'Man on the Moon II', ref: 'https://open.spotify.com/album/08eM9GRdr5BCCHNqS3Wwud' },
  { label: 'Future Present Past', ref: 'https://open.spotify.com/album/1SQjs5LxCj7J5WIZYg3h1D' },
  { label: 'Born to Die', ref: 'https://open.spotify.com/album/5VoeRuTrGhTbKelUfwymwu' },
  { label: "La Síntesis O'Konor", ref: 'https://open.spotify.com/album/7oEJJ7TxrfWGJXczcuOWpK' },
  {
    label: 'First Impressions of Earth',
    ref: 'https://open.spotify.com/album/1HQ61my1h3VWp2EBWKlp0n',
  },
  { label: 'A Mermaid in Lisbon', ref: 'https://open.spotify.com/album/1NnqLqMQgh9ftyQPtUuKJd' },
];
