/** Estados de carga, error y arranque en vacio. */

export function LoadingList() {
  return (
    <ul className="skeleton" aria-label="Cargando playlist">
      {Array.from({ length: 8 }, (_, index) => (
        <li key={index}>
          <span className="shimmer" style={{ width: '3.5rem', height: '3.5rem', flex: 'none' }} />
          <span style={{ flex: 1 }}>
            <span
              className="shimmer"
              style={{ display: 'block', height: '1rem', width: `${45 + ((index * 13) % 35)}%` }}
            />
            <span
              className="shimmer"
              style={{ display: 'block', height: '0.7rem', width: '28%', marginTop: '0.5rem' }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state">
      <h2 className="state__title">No se pudo cargar</h2>
      <p className="state__body">{message}</p>
      {onRetry ? (
        <div className="state__form">
          <button type="button" className="state__button" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({ onAdd }) {
  return (
    <div className="state">
      <h2 className="state__title">Empieza pegando una playlist</h2>
      <p className="state__body">
        Cualquier playlist <strong>pública de Spotify creada por un usuario</strong> vale. Las
        editoriales y algorítmicas de Spotify (Discover Weekly, Top 50, Radar) estan bloqueadas en
        la API publica.
        <br />
        <br />
        Para dejarlas fijas en el menu, añádelas en <code>src/config/playlists.js</code>.
      </p>
      <div className="state__form">
        <button type="button" className="state__button" onClick={onAdd}>
          Pegar link de playlist
        </button>
      </div>
    </div>
  );
}

export function NoMatches({ query, onClear }) {
  return (
    <div className="state">
      <h2 className="state__title">Nada coincide</h2>
      <p className="state__body">
        Ninguna canción de esta playlist encaja con <strong>{query}</strong>.
      </p>
      <div className="state__form">
        <button type="button" className="state__button" onClick={onClear}>
          Limpiar la búsqueda
        </button>
      </div>
    </div>
  );
}
