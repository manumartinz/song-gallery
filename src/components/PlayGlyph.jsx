/**
 * Triangulo de play o las dos barras de pausa.
 *
 * Vive aparte porque lo comparten la fila de la lista y el mini-reproductor, y
 * son el mismo gesto: si el icono difiere entre los dos sitios, parecen
 * controles distintos.
 */
export default function PlayGlyph({ playing }) {
  return playing ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}
