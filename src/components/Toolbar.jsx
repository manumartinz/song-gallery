import { useEffect, useRef } from 'react';
import { SORTS } from '../lib/search.js';

/**
 * Buscador y criterios de orden. Vive en la cabecera de la fuente y no en la
 * barra superior, que ya carga el menu y el conmutador de vista.
 *
 * `omit` son los criterios que esta fuente no puede ofrecer. Lo usa el modo
 * album con "Añadidas": alli `addedAt` es null en todas las pistas, el
 * comparador devuelve 0 para cualquier par y el boton quedaria puesto sin hacer
 * nada, que es peor que no estar.
 */
export default function Toolbar({
  query,
  onQuery,
  filtering,
  sortBy,
  sortDir,
  onSort,
  count,
  total,
  omit,
  facetChoices,
  facets,
  onFacets,
  canFilterUnheard,
}) {
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
          aria-label="Buscar entre las canciones"
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onQuery('');
              event.currentTarget.blur();
            }
          }}
        />
        {filtering ? (
          <span className="tools__count">
            {count} de {total}
          </span>
        ) : null}
      </div>

      <div className="tools__sorts" role="group" aria-label="Ordenar por">
        {Object.entries(SORTS)
          .filter(([key]) => !omit?.includes(key))
          .map(([key, { label }]) => {
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

      <Facets
        choices={facetChoices}
        facets={facets}
        onFacets={onFacets}
        canFilterUnheard={canFilterUnheard}
      />
    </div>
  );
}

/**
 * Chips de genero, decada y "sin escuchar", en una tira bajo el buscador.
 * Pulsar el encendido lo apaga: son interruptores, no pestañas.
 */
function Facets({ choices, facets, onFacets, canFilterUnheard }) {
  if (!choices || !facets) return null;
  const { genres, decades } = choices;
  if (!genres.length && !decades.length && !canFilterUnheard) return null;

  const chip = (key, label, on, change) => (
    <button
      key={key}
      type="button"
      className={`chip${on ? ' chip--on' : ''}`}
      onClick={() => onFacets(change)}
      aria-pressed={on}
    >
      {label}
    </button>
  );

  return (
    <div className="tools__facets" role="group" aria-label="Filtrar">
      {canFilterUnheard || facets.unheard
        ? chip('unheard', 'Sin escuchar', Boolean(facets.unheard), { unheard: !facets.unheard })
        : null}
      {decades.map(({ value, label }) =>
        chip(`d${value}`, label, facets.decade === value, {
          decade: facets.decade === value ? null : value,
        }),
      )}
      {genres.map(({ value, label }) =>
        chip(`g${value}`, label, facets.genre === value, {
          genre: facets.genre === value ? null : value,
        }),
      )}
    </div>
  );
}
