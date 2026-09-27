import { useEffect, useState } from 'react';

const POLL_MS = 60_000;

/**
 * Lo que estoy escuchando (o lo último que escuché) en Spotify.
 *
 * Pregunta a /api/now al montar y cada minuto mientras la pestaña está a la
 * vista. Si el endpoint no está configurado responde 204 y esto no pinta
 * nada: es un adorno, y un hueco vacío o un error aquí sobrarían.
 */
export function useNowListening() {
  const [now, setNow] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/now');
        if (cancelled) return;
        setNow(response.status === 200 ? await response.json() : null);
      } catch {
        /* sin red: se queda lo que hubiera */
      }
    };

    load();
    timer = setInterval(load, POLL_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

  return now;
}

export default function NowListening({ now }) {
  if (!now) return null;

  return (
    <a
      className={`listening${now.playing ? ' listening--live' : ''}`}
      href={now.url || undefined}
      target="_blank"
      rel="noreferrer"
      data-no-drag
    >
      {now.art ? <img className="listening__art" src={now.art} alt="" /> : null}
      <span className="listening__text">
        <span className="listening__label">
          {now.playing ? (
            <>
              <span className="listening__dot" aria-hidden="true" />
              Ahora estoy escuchando
            </>
          ) : (
            'Lo último que escuché'
          )}
        </span>
        <span className="listening__track">
          {now.title} <span className="listening__artist">— {now.artist}</span>
        </span>
      </span>
    </a>
  );
}
