/**
 * Cierre de una playlist que no se enseña entera.
 *
 * Se pinta DEBAJO de la lista y no como una fila mas de dentro. Parece la
 * siguiente, pero no serlo evita meter en el registro de filas, en la
 * navegacion por teclado y en la retIcula de la cuadricula un elemento que no
 * tiene pista, ni indice, ni nada que reproducir. De paso sirve igual para las
 * dos vistas con un solo componente.
 *
 * `count` es lo que falta contra el total REAL de Spotify, no contra lo que
 * mando el server: si la playlist tiene 512 y se enseñan 49, lo honesto es
 * decir 463 y no 151.
 */
export default function MoreOnSpotify({ count, url }) {
  if (!url || count <= 0) return null;

  return (
    <a className="more" href={url} target="_blank" rel="noopener noreferrer">
      <span className="more__label">
        Ver playlist completa
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </span>
      <span className="more__count">
        {count} {count === 1 ? 'canción más' : 'canciones más'} en Spotify
      </span>
    </a>
  );
}
