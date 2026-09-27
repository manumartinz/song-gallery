import { useEffect, useRef } from 'react';
import { paramFor, SOURCE_PARAMS } from '../lib/sources.js';

/**
 * Mantiene la URL sincronizada sin ensuciar el historial, para que la barra
 * de direcciones sea siempre un enlace valido de lo que se esta viendo:
 * ?p= la playlist, ?a= el album, ?m= una de mi cuenta, ?t= la cancion que suena.
 *
 * Los tres primeros son EXCLUYENTES y por eso se borra siempre el que no toca:
 * si al saltar de un album a una playlist se quedase el ?a= colgando, al
 * recargar volveria el album, que es justo lo que uno acaba de dejar.
 *
 * `onDeepLink(index)` se llama UNA vez, cuando la cancion pedida por ?t= al
 * entrar aparece en la lista cargada.
 */
export default function useUrlSync({ id, kind, trackId, tracks, onDeepLink }) {
  useEffect(() => {
    const url = new URL(location.href);
    const param = paramFor(kind);

    for (const other of Object.values(SOURCE_PARAMS)) {
      if (other !== param) url.searchParams.delete(other);
    }
    if (id) url.searchParams.set(param, id);
    else url.searchParams.delete(param);

    if (trackId) url.searchParams.set('t', trackId);
    else url.searchParams.delete('t');

    history.replaceState(null, '', url);
  }, [id, kind, trackId]);

  /* Se guarda en una ref y se consume UNA vez: a partir de ahi la URL la
     escribimos nosotros con lo que suena, y volver a leerla nos devolveria a la
     de partida en cada cambio. */
  const deepLinkRef = useRef(new URLSearchParams(location.search).get('t'));

  useEffect(() => {
    const wanted = deepLinkRef.current;
    if (!wanted || !tracks.length) return;
    deepLinkRef.current = null;

    const index = tracks.findIndex((track) => track.id === wanted);
    if (index === -1) return; // el enlace no es de esta playlist

    onDeepLink(index);
  }, [tracks, onDeepLink]);
}
