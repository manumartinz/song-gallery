import useInView from '../hooks/useInView.js';
import RecommendForm from './RecommendForm.jsx';

/**
 * Cierre al final del scroll. No es una barra fija: se llega a el bajando.
 * Entra animado cuando asoma en pantalla, no al cargar la pagina.
 */
export default function Footer({
  playlistUrl,
  album = false,
  onRandom,
  canShuffle,
  radio,
  onRadio,
  onQuiz,
}) {
  const [ref, visible] = useInView();

  return (
    <footer ref={ref} className={`foot${visible ? ' foot--in' : ''}`}>
      <div className="foot__rule" />

      <p className="foot__label">{album ? 'Fin del álbum' : 'Fin de la playlist'}</p>

      <div className="foot__actions">
        <button type="button" className="foot__action" onClick={onRandom} disabled={!canShuffle}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 7h4l3.5 5L7 17H3M21 7h-4l-7 10H3" />
            <path d="M18 4l3 3-3 3M18 14l3 3-3 3" />
          </svg>
          Sonar una al azar
        </button>

        {onQuiz ? (
          <button type="button" className="foot__action" onClick={onQuiz}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.8M12 17.2v.1" />
            </svg>
            Adiviná la canción
          </button>
        ) : null}

        {/* La radio no es de esta playlist: es todo lo de la web, saltando de
            una fuente a otra. Por eso vive aqui, al final, y no arriba. */}
        {onRadio ? (
          <button
            type="button"
            className={`foot__action${radio ? ' foot__action--on' : ''}`}
            onClick={onRadio}
            aria-pressed={radio}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="2" />
              <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
            </svg>
            {radio ? 'Radio encendida' : 'Radio: todo al azar'}
          </button>
        ) : null}

        {playlistUrl ? (
          <a className="foot__action" href={playlistUrl} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
            {album ? 'Abrirlo en Spotify' : 'Abrirla en Spotify'}
          </a>
        ) : null}
      </div>

      {/* Cierra el circulo que abre el splash: alli la recomendacion es mia,
          aqui se le devuelve el turno a quien haya llegado hasta el final. */}
      <p className="foot__note">
        Si llegaste hasta acá, escribime. Me encantaría saber qué te pareció, o que la próxima
        canción me la recomiendes vos.
      </p>

      <RecommendForm />

      <div className="foot__social">
        <a href="https://www.instagram.com/manumartinezx/" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.2" cy="6.8" r="1" />
          </svg>
          Instagram
        </a>

        {/* Sin el `?si=`: es un token de compartir, no parte de la direccion. */}
        <a href="https://open.spotify.com/user/manumartinez6" target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M7.2 9.3c3.2-.9 6.7-.6 9.5.9" />
            <path d="M7.8 12.6c2.6-.7 5.4-.5 7.7.8" />
            <path d="M8.4 15.7c2-.5 4.2-.4 6 .6" />
          </svg>
          Spotify
        </a>
      </div>

      <p className="foot__credits">
        Datos de{' '}
        <a href="https://developer.spotify.com" target="_blank" rel="noreferrer">
          Spotify
        </a>
        {' · '}audio de{' '}
        <a href="https://developers.deezer.com" target="_blank" rel="noreferrer">
          Deezer
        </a>{' '}
        y{' '}
        <a href="https://www.apple.com/apple-music/" target="_blank" rel="noreferrer">
          Apple
        </a>
        {' · '}
        {new Date().getFullYear()}
      </p>
    </footer>
  );
}
