import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildRounds, QUIZ_OPTIONS, QUIZ_ROUNDS, verdict } from '../lib/quiz.js';
import Cover from './Cover.jsx';

const SNIPPET_MS = 7000; // lo que suena antes de tener que adivinar

/**
 * "Adiviná la canción" con las de la fuente abierta.
 *
 * Suena el principio de una, se elige entre cuatro títulos y al acertar (o
 * fallar) sigue sonando entera mientras se ve la portada: el premio es
 * escucharla. Usa el mismo reproductor que la lista, con claves propias
 * (`quiz-…`) para que nada de la lista crea que es una de sus filas.
 *
 * El fragmento se corta a los siete segundos contados desde que SUENA, no
 * desde que se pide: con una conexión lenta el corte llegaría antes que el
 * audio y la canción sonaría entera sin adivinar nada.
 */
export default function Quiz({ pool, sourceName, player, onClose, onShareResult }) {
  const [rounds, setRounds] = useState([]);
  const [step, setStep] = useState(-1); // -1: portada del juego
  const [choice, setChoice] = useState(null);
  const [score, setScore] = useState(0);
  const [take, setTake] = useState(0); // sube con "escuchar de nuevo"
  const closeRef = useRef(null);

  const round = rounds[step];
  const done = step >= 0 && step >= rounds.length;
  const key = round ? `quiz-${step}-${take}` : null;

  const { play, pause, stop } = player;

  useEffect(() => {
    closeRef.current?.focus();
    document.body.classList.add('is-now');
    return () => {
      document.body.classList.remove('is-now');
      stop();
    };
  }, [stop]);

  // Arranca el fragmento de cada ronda (y el de "escuchar de nuevo").
  useEffect(() => {
    if (!round || !key) return;
    play(round.answer, key);
  }, [round, key, play]);

  // Corta el fragmento a los siete segundos de sonar, mientras no se conteste.
  useEffect(() => {
    if (choice || !player.isPlaying || player.key !== key) return undefined;
    const timer = setTimeout(pause, SNIPPET_MS);
    return () => clearTimeout(timer);
  }, [choice, player.isPlaying, player.key, key, pause]);

  const answer = useCallback(
    (option) => {
      if (!round || choice) return;
      setChoice(option);
      if (option === round.answer) setScore((n) => n + 1);
      // Al contestar sigue sonando: el premio es escucharla.
      if (!player.isPlaying) play(round.answer, key);
    },
    [round, choice, player.isPlaying, play, key],
  );

  const next = useCallback(() => {
    setChoice(null);
    setTake(0);
    setStep((n) => n + 1);
    if (step + 1 >= rounds.length) stop();
  }, [step, rounds.length, stop]);

  // Las rondas se arman al empezar, con las canciones que haya en ese momento.
  const start = useCallback(() => {
    const built = buildRounds(pool);
    // Cuatro canciones con el mismo titulo no dan para una ronda: no se empieza.
    if (!built.length) return;
    setRounds(built);
    setScore(0);
    setChoice(null);
    setTake(0);
    setStep(0);
  }, [pool]);

  // Teclado: 1-4 para contestar, Enter para seguir, Escape para salir.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (round && !choice && /^[1-4]$/.test(event.key)) {
        event.stopPropagation();
        answer(round.options[Number(event.key) - 1]);
      } else if (round && choice && event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        next();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [round, choice, answer, next, onClose]);

  const total = rounds.length;
  const ready = pool.length >= QUIZ_OPTIONS;
  const progress = useMemo(() => (total ? Math.min(step, total) / total : 0), [step, total]);

  return (
    <div className="quiz" role="dialog" aria-modal="true" aria-labelledby="quiz-title">
      <button
        ref={closeRef}
        type="button"
        className="now__close"
        onClick={onClose}
        aria-label="Salir del juego"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>

      <div className="quiz__body">
        <p className="quiz__eyebrow">
          Adiviná la canción · {sourceName}
          {round ? (
            <span className="quiz__count">
              {' '}
              · {step + 1} de {total}
            </span>
          ) : null}
        </p>

        {round || done ? (
          <span className="quiz__progress" style={{ '--progress': progress }} aria-hidden="true" />
        ) : null}

        {step === -1 ? (
          <>
            <h2 id="quiz-title" className="quiz__title">
              ¿Cuántas reconocés?
            </h2>
            <p className="quiz__text">
              Suenan siete segundos de una canción de «{sourceName}» y elegís entre cuatro. Son{' '}
              {Math.min(QUIZ_ROUNDS, pool.length) || QUIZ_ROUNDS} rondas.
            </p>
            <button
              type="button"
              className="play-all quiz__start"
              onClick={start}
              disabled={!ready}
            >
              {ready ? 'Empezar' : 'Cargando canciones…'}
            </button>
          </>
        ) : done ? (
          <>
            <h2 id="quiz-title" className="quiz__title">
              {score} de {total}
            </h2>
            <p className="quiz__text">{verdict(score, total)}</p>
            <div className="quiz__actions">
              <button type="button" className="play-all" onClick={start}>
                Otra vez
              </button>
              <button type="button" className="shuffle" onClick={() => onShareResult(score, total)}>
                Compartir resultado
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={`quiz__art${choice ? ' quiz__art--on' : ''}`}>
              {choice ? (
                <Cover art={round.answer.art} sizes="240px" />
              ) : (
                <span className="quiz__mystery" aria-hidden="true">
                  ?
                </span>
              )}
            </div>

            <h2 id="quiz-title" className="sr-only">
              Ronda {step + 1}
            </h2>

            <ol className="quiz__options">
              {round.options.map((option, i) => {
                const state = !choice
                  ? ''
                  : option === round.answer
                    ? ' quiz__option--right'
                    : option === choice
                      ? ' quiz__option--wrong'
                      : ' quiz__option--off';
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      className={`quiz__option${state}`}
                      onClick={() => answer(option)}
                      disabled={Boolean(choice)}
                    >
                      <span className="quiz__key">{i + 1}</span>
                      <span className="quiz__option-text">
                        <span className="quiz__option-title">{option.title}</span>
                        <span className="quiz__option-artist">{option.artistLine}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="quiz__actions">
              {choice ? (
                <button type="button" className="play-all" onClick={next}>
                  {step + 1 >= total ? 'Ver resultado' : 'Siguiente'}
                </button>
              ) : (
                <button type="button" className="shuffle" onClick={() => setTake((n) => n + 1)}>
                  Escuchar de nuevo
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
