/**
 * Salida a Spotify de una playlist que no se enseña entera.
 *
 * Dos formas, porque las dos vistas tienen gramaticas distintas: en la lista es
 * una fila mas al final, y en la cuadricula tiene que ser una casilla, o se
 * queda una barra suelta bajo un mosaico y no se lee como parte de el.
 *
 *   variant="list"  va DEBAJO de la <ul>, como hermana
 *   variant="grid"  va DENTRO de la <ul>, como ultima casilla
 *
 * En la lista puede quedarse fuera porque una fila de mas no descuadra nada. En
 * la cuadricula no hay esa opcion: para ocupar una celda de la reticula tiene
 * que ser hija de `.grid`. No pasa nada, porque lo unico que hay que evitar es
 * entrar en el registro de filas y en la navegacion por teclado, y para eso
 * basta con no llamar a `register` ni traer indice: es un enlace, no una pista.
 *
 * `count` es lo que falta contra el total REAL de Spotify, no contra lo que
 * mando el server: si la playlist tiene 512 y se enseñan 49, lo honesto es
 * decir 463 y no 151.
 */
export default function MoreOnSpotify({ count, url, variant = 'list', slot = 0, onHover }) {
  if (!url || count <= 0) return null;

  const songs = count === 1 ? 'canción más' : 'canciones más';

  if (variant === 'grid') {
    return (
      <li className="cell cell--more" style={{ '--i': slot }}>
        <a
          className="more-cell"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          /* Sin esto la ultima celda por la que se paso se queda resaltada al
             entrar aqui: el `onMouseLeave` de la reticula no llega a dispararse
             porque no se ha salido de ella. */
          onMouseEnter={() => onHover?.(null)}
          aria-label={`Ver la playlist completa en Spotify: ${count} ${songs}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
          <span className="more-cell__count">+{count}</span>
          <span className="more-cell__label">Ver completa</span>
        </a>
      </li>
    );
  }

  return (
    <a className="more" href={url} target="_blank" rel="noopener noreferrer">
      <span className="more__label">
        Ver playlist completa
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </span>
      <span className="more__count">
        {count} {songs} en Spotify
      </span>
    </a>
  );
}
