import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Cover from './Cover.jsx';
import EqBars from './EqBars.jsx';
import PlayGlyph from './PlayGlyph.jsx';
import { fetchSimilar } from '../lib/api.js';

/**
 * Lo que el panel necesita de App, por contexto y no por props: la fila es un
 * `memo` y pasar esto por TrackList → TrackRow la re-renderizaría entera cada
 * vez que algo suena. `{ enabled, playExtra, extraKey, isPlaying, openSimilar }`;
 * el último abre el panel lateral (SimilarDrawer) desde la cuadrícula.
 */
export const SimilarContext = createContext(null);

export const extraKeyFor = (id) => `sim:${id}`;

/**
 * «Parecidas a esta»: tres canciones NUEVAS del mismo estilo que `trackId`
 * (ver api/similar.js), con su porqué, que suenan ahí mismo con el reproductor
 * de siempre. «Otras» pide otra tanda.
 *
 * En la ficha de la lista espera a que se lo pidan con su botón; en el panel
 * lateral de la cuadrícula (`autoLoad`) ya se abrió para esto y carga solo.
 */
export default function SimilarPanel({ trackId, autoLoad = false }) {
  const ctx = useContext(SimilarContext);
  const [state, setState] = useState({ status: 'idle', tracks: [], error: null });
  const controllerRef = useRef(null);

  const load = useCallback(
    async (more = false) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState((prev) => ({ ...prev, status: 'loading', error: null }));
      try {
        const tracks = await fetchSimilar(trackId, { more, signal: controller.signal });
        if (controller.signal.aborted) return;
        setState({
          status: 'done',
          tracks,
          error: tracks.length ? null : 'No encontré parecidas que existan en Spotify. Probá con «Otras».',
        });
      } catch (cause) {
        if (controller.signal.aborted || cause.name === 'AbortError') return;
        setState((prev) => ({ ...prev, status: prev.tracks.length ? 'done' : 'idle', error: cause.message }));
      }
    },
    [trackId],
  );

  // Otra canción (al reordenar, o otra celda en el panel) o desmontar: lo pedido ya no va.
  useEffect(() => {
    setState({ status: 'idle', tracks: [], error: null });
    if (autoLoad && ctx?.enabled) load();
    return () => controllerRef.current?.abort();
  }, [trackId, autoLoad, ctx?.enabled, load]);

  if (!ctx?.enabled) return null;

  const loading = state.status === 'loading';

  return (
    /* La fila entera es un botón que además se arrastra: lo que pase acá dentro
       no la tiene que tocar. */
    <div className="similar" data-no-drag onClick={(event) => event.stopPropagation()}>
      {state.status === 'idle' || (loading && !state.tracks.length) ? (
        <button type="button" className="similar__ask" onClick={() => load()} disabled={loading}>
          {loading ? (
            <>
              <EqBars playing />
              <span>Buscando parecidas…</span>
            </>
          ) : (
            <>
              <span className="similar__spark" aria-hidden="true">
                ✦
              </span>
              Parecidas a esta
            </>
          )}
        </button>
      ) : null}

      {state.tracks.length ? (
        <>
          <p className="similar__head">
            <span>✦ Parecidas, que no están en mis playlists</span>
            <button type="button" className="similar__more" onClick={() => load(true)} disabled={loading}>
              {loading ? 'Buscando…' : 'Otras'}
            </button>
          </p>
          <ul className="similar__list">
            {state.tracks.map((track) => {
              const key = extraKeyFor(track.id);
              const current = ctx.extraKey === key;
              const playable = Boolean(track.previewUrl);
              return (
                <li
                  key={track.id}
                  className={`similar__item${current ? ' similar__item--on' : ''}${playable ? '' : ' similar__item--dead'}`}
                >
                  <button
                    type="button"
                    className="similar__play"
                    onClick={() => ctx.playExtra(track)}
                    disabled={!playable}
                    aria-label={
                      playable
                        ? `${current && ctx.isPlaying ? 'Pausar' : 'Escuchar'} ${track.title} de ${track.artistLine}`
                        : `${track.title} no tiene preview`
                    }
                  >
                    <Cover art={track.art} sizes="44px" />
                    {playable ? (
                      <span className="similar__glyph">
                        {current && ctx.isPlaying ? <EqBars playing /> : <PlayGlyph playing={false} />}
                      </span>
                    ) : null}
                  </button>
                  <div className="similar__text">
                    <span className="similar__title">{track.title}</span>
                    <span className="similar__artist">{track.artistLine}</span>
                    {track.why ? <span className="similar__why">{track.why}</span> : null}
                  </div>
                  {track.spotifyUrl ? (
                    <a
                      className="similar__link"
                      href={track.spotifyUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Abrir ${track.title} en Spotify`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 17L17 7M9 7h8v8" />
                      </svg>
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {state.error ? <p className="similar__error">{state.error}</p> : null}
    </div>
  );
}
