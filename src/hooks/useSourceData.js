import { useCallback, useEffect, useState } from 'react';
import { cachePlaylist, fetchPreviews, fetchSource } from '../lib/api.js';
import { mergePreviews } from '../lib/sources.js';

const PREVIEW_CHUNK = 40; // tramo con el que se van pidiendo los previews

/**
 * Carga la fuente abierta (playlist o album) y le va resolviendo los previews.
 *
 * `onReset` se llama al empezar cada carga, con la fuente nueva: es donde App
 * para la reproduccion y deja en blanco lo que pertenecia a la anterior. Tiene
 * que ser estable, o cada render volveria a cargar.
 *
 * `trackLimit` es un numero, no un objeto: solo cambia de valor al pasar de una
 * playlist del repo a una pegada, y eso ya trae un id nuevo. Estar en las
 * dependencias no dispara recargas de mas.
 */
export default function useSourceData({ kind, id, trackLimit, onReset }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  /* Sube para pedir la misma fuente otra vez (el boton de reintentar): el id
     no cambia y sin esto el efecto no se enteraria. */
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const source = { kind, id };

    if (!id) {
      setData(null);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    onReset(source);

    /* Los previews llegan despues, por tramos, para que la lista aparezca en
       cuanto responde Spotify en vez de esperar a 200 resoluciones. Vive dentro
       de este efecto a proposito: su ciclo de vida es el de la playlist, y el
       mismo AbortController lo corta al cambiar de una a otra. */
    const streamPreviews = async (payload) => {
      if (payload.tracks.every((track) => track.previewUrl !== undefined)) return;

      /* `trackCount` es lo que el server MANDO; `totalCount` es lo que tiene la
         playlist en Spotify, que puede ser mucho mas porque /api/playlist corta
         en 200. Recorrer el segundo era pedir tramos de canciones que no estan
         en el payload: con una playlist de 5.000 salian 125 peticiones de las
         que servian 5, y `mergePreviews` tiraba el resto por no encontrar los
         ids. Ademas reventaba el limite por IP y dejaba al visitante sin poder
         cargar nada durante diez minutos.

         El tope de las pegadas entra tambien aqui: si solo se enseñan 49, pedir
         previews de la 50 en adelante es gastar por gusto. */
      const total = Math.min(payload.trackCount ?? payload.tracks.length, trackLimit);
      let merged = payload;

      for (let offset = 0; offset < total; offset += PREVIEW_CHUNK) {
        if (controller.signal.aborted) return;

        try {
          const previews = await fetchPreviews(source, offset, PREVIEW_CHUNK, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;

          merged = mergePreviews(merged, previews);
          setData((prev) => (prev && prev.id === payload.id ? mergePreviews(prev, previews) : prev));
        } catch (cause) {
          if (controller.signal.aborted || cause.name === 'AbortError') return;
          /* Un 429 no es un tramo que ha fallado, es el limite por IP diciendo
             que pares: seguir pidiendo solo consume la ventana entera para que
             la siguiente playlist tampoco cargue. Los demas errores si son de
             su tramo y no deben tumbar a los otros. */
          if (cause.status === 429) return;
        }
      }

      // Completa: se cachea ya fusionada para que la proxima visita no repita.
      if (!controller.signal.aborted) cachePlaylist(source, merged);
    };

    fetchSource(source, { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setData(payload);
        window.scrollTo({ top: 0, behavior: 'instant' });
        streamPreviews(payload);
      })
      .catch((cause) => {
        if (controller.signal.aborted || cause.name === 'AbortError') return;
        setError(cause.message);
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [kind, id, trackLimit, onReset, attempt]);

  /** Adelanta el tramo que contiene una pista concreta, sin esperar su turno. */
  const resolveNow = useCallback(
    async (index) => {
      if (!id) return;
      try {
        // Ventana alrededor del indice: como se cruza por id, basta con que la
        // pista caiga dentro aunque el offset de Spotify no cuadre exacto.
        const previews = await fetchPreviews({ kind, id }, Math.max(0, index - 2), 10);
        setData((prev) => (prev ? mergePreviews(prev, previews) : prev));
      } catch {
        // Da igual: el recorrido secuencial acabara cubriendola.
      }
    },
    [kind, id],
  );

  /** Devuelve una pista al estado "pendiente" para que se vuelva a resolver. */
  const expirePreview = useCallback((index) => {
    setData((prev) => {
      if (!prev) return prev;
      const tracks = prev.tracks.map((track, i) => {
        if (i !== index) return track;
        const { previewUrl, previewSource, ...rest } = track;
        return rest; // sin previewUrl = pendiente
      });
      return { ...prev, tracks };
    });
  }, []);

  return { data, loading, error, retry, resolveNow, expirePreview };
}
