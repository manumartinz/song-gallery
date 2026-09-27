/**
 * Las fuentes que salen de MI cuenta de Spotify y no de una playlist. Hoy es
 * una, lo que más escuché este mes, y se arma sola: no hay nada que mantener a
 * mano. Es una lista para que sumar otra sea una entrada más y no otra ruta.
 *
 * Las sirve /api/mine con el refresh token de SPOTIFY_REFRESH_TOKEN, y cada una
 * pide su permiso. Si el token no lo tiene, esa fuente no aparece en el menú
 * (ver `npm run spotify-token`).
 *
 * `label` es el rótulo del menú, en minúscula como las playlists; `name` y
 * `description` son los de la cabecera. Lo usan el cliente y el servidor (las
 * tarjetas al compartir), así que vive aquí y no en uno de los dos.
 */
export const MINE = [
  {
    id: 'top',
    label: 'mi mes',
    name: 'Mi mes',
    description: 'Lo que más escuché en las últimas cuatro semanas, según Spotify.',
    scope: 'user-top-read',
  },
];

/** `top` o null. No hay ids de Spotify aquí: son nombres fijos. */
export function parseMineRef(ref) {
  const value = String(ref ?? '').trim();
  return MINE.some((item) => item.id === value) ? value : null;
}

export function mineById(id) {
  return MINE.find((item) => item.id === id) || null;
}
