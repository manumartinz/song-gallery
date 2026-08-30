/**
 * Portada de album con srcset.
 *
 * Spotify entrega tres tamaños (64 / 300 / 640) y hasta ahora se usaba siempre
 * el de 640, incluso en las celdas de ~100 px de la cuadricula. Con `sizes`
 * correcto el navegador elige el que toca y el peso de imagenes cae mucho en
 * playlists largas.
 */
export default function Cover({ art, sizes }) {
  if (!art?.lg) return null;

  // Los datos cacheados de antes de este cambio no traen `md`: en ese caso se
  // sirve la grande y ya se corregira al refrescarse la playlist.
  const srcSet =
    art.sm && art.md ? `${art.sm} 64w, ${art.md} 300w, ${art.lg} 640w` : undefined;

  return (
    <img
      src={art.md || art.lg}
      srcSet={srcSet}
      sizes={sizes}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}
