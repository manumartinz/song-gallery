import { useEffect, useRef } from 'react';
import { SORTS } from '../lib/search.js';

/**
 * Buscador y criterios de orden. Vive en la cabecera de la playlist y no en la
 * barra superior, que ya carga el menu y el conmutador de vista.
 */
export default function Toolbar({ query, onQuery, sortBy, sortDir, onSort, count, total }) {
  const inputRef = useRef(null);

  // La tecla "/" enfoca el buscador desde cualquier sitio.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== '/' || event.target.closest?.('input, textarea')) return;
      event.preventDefault();
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="tools">
      <div className="tools__search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          className="tools__input"
          value={query}
          data-no-drag
          placeholder="Buscar por título, artista, álbum, año o género"
          aria-label="Buscar en la playlist"
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onQuery('');
              event.currentTarget.blur();
            }
          }}
        />
        {query ? (
          <span className="tools__count">
            {count} de {total}
          </span>
        ) : null}
      </div>

      <div className="tools__sorts" role="group" aria-label="Ordenar por">
        {Object.entries(SORTS).map(([key, { label }]) => {
          const active = key === sortBy;
          return (
            <button
              key={key}
              type="button"
              className={`tools__sort${active ? ' tools__sort--on' : ''}`}
              onClick={() => onSort(key)}
              aria-pressed={active}
            >
              {label}
              {active && key !== 'original' ? (
                <span className="tools__dir">{sortDir === 1 ? '\u2191' : '\u2193'}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
