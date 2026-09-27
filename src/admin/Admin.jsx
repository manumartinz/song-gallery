import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useInView from '../hooks/useInView.js';

/**
 * El panel donde reviso lo que me recomiendan: lo nuevo, lo que agregué, lo
 * que descarté y la playlist misma. Todo habla con /api/admin, que es quien
 * decide si hay sesión; aquí solo se pinta lo que contesta.
 */

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function call(op, { body, params } = {}) {
  const url = new URL('/api/admin', location.origin);
  url.searchParams.set('op', op);
  for (const [key, value] of Object.entries(params || {})) {
    if (value) url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `Error ${response.status}`, response.status);
  return data;
}

const TABS = [
  ['new', 'Nuevas'],
  ['added', 'Agregadas'],
  ['discarded', 'Descartadas'],
  ['playlist', 'Playlist'],
];

const formatDate = (iso) =>
  new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

/** El texto de la recomendación con sus links clickeables. */
function Linked({ text }) {
  const parts = String(text).split(/(https?:\/\/\S+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer noopener">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export default function Admin() {
  // null: preguntando; false: sin sesión; true: dentro; 'off': panel apagado.
  const [session, setSession] = useState(null);

  useEffect(() => {
    call('session')
      .then((data) => setSession(Boolean(data.ok)))
      .catch((error) => setSession(error.status === 404 ? 'off' : false));
  }, []);

  if (session === null) return <main className="adm adm--center">Cargando…</main>;
  if (session === 'off') {
    return (
      <main className="adm adm--center">
        El panel no está encendido: falta ADMIN_PASSWORD o Redis.
      </main>
    );
  }
  if (!session) return <Login onDone={() => setSession(true)} />;
  return <Panel onLogout={() => setSession(false)} />;
}

function Login({ onDone }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await call('login', { body: { password } });
      onDone();
    } catch (cause) {
      setError(cause.message);
      setBusy(false);
    }
  };

  return (
    <main className="adm adm--center">
      <form className="adm__login" onSubmit={submit}>
        <h1 className="adm__title">Recomendaciones</h1>
        <input
          type="password"
          className="adm__input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Contraseña"
          aria-label="Contraseña"
          autoComplete="current-password"
          autoFocus
        />
        <button type="submit" className="adm__btn adm__btn--main" disabled={busy || !password}>
          Entrar
        </button>
        {error ? <p className="adm__error">{error}</p> : null}
      </form>
    </main>
  );
}

function Panel({ onLogout }) {
  const [tab, setTab] = useState('new');
  const [recs, setRecs] = useState(null);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  /* Un solo reproductor para todo el panel: escuchar un candidato corta el
     anterior, en vez de sonar cinco a la vez. */
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(null);
  const togglePreview = useCallback((id, url) => {
    const audio = audioRef.current || (audioRef.current = new Audio());
    audio.onended = () => setPlaying(null);
    if (playing === id) {
      audio.pause();
      setPlaying(null);
      return;
    }
    audio.src = url;
    audio.play().catch(() => setPlaying(null));
    setPlaying(id);
  }, [playing]);

  useEffect(() => () => audioRef.current?.pause(), []);

  /* Cualquier 401 es la sesión vencida: de vuelta al login. */
  const guard = useCallback(
    async (task) => {
      setError('');
      try {
        return await task();
      } catch (cause) {
        if (cause.status === 401) onLogout();
        else setError(cause.message);
        return undefined;
      }
    },
    [onLogout],
  );

  const loadRecs = useCallback(
    () => guard(async () => setRecs((await call('recs')).recs)),
    [guard],
  );
  const loadItems = useCallback(
    () => guard(async () => setItems((await call('playlist')).items)),
    [guard],
  );

  useEffect(() => {
    loadRecs();
  }, [loadRecs]);

  useEffect(() => {
    if (tab === 'playlist') loadItems();
  }, [tab, loadItems]);

  const counts = useMemo(() => {
    const out = { new: 0, added: 0, discarded: 0 };
    for (const rec of recs || []) out[rec.state] += 1;
    return out;
  }, [recs]);

  const act = useCallback(
    (op, body) =>
      guard(async () => {
        await call(op, { body });
        await loadRecs();
        if (op === 'add' || op === 'remove' || op === 'move') setItems(null);
        return true;
      }),
    [guard, loadRecs],
  );

  const logout = async () => {
    audioRef.current?.pause();
    await call('logout', { body: {} }).catch(() => {});
    onLogout();
  };

  const shown = (recs || []).filter((rec) => rec.state === tab);

  return (
    <main className="adm">
      <header className="adm__head">
        <h1 className="adm__title">Recomendaciones</h1>
        <button type="button" className="adm__btn" onClick={logout}>
          Salir
        </button>
      </header>

      <nav className="adm__tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`adm__tab${tab === key ? ' adm__tab--on' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
            {key !== 'playlist' && counts[key] ? (
              <span className="adm__count">{counts[key]}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {error ? (
        <p className="adm__error" role="alert">
          {error}
        </p>
      ) : null}

      {tab === 'playlist' ? (
        <Playlist
          items={items}
          onMove={(from, to) => act('move', { from, to }).then(loadItems)}
          onRemove={(trackId) => act('remove', { trackId }).then(loadItems)}
          playing={playing}
          onPreview={togglePreview}
        />
      ) : recs === null ? (
        <p className="adm__empty">Cargando…</p>
      ) : shown.length === 0 ? (
        <p className="adm__empty">
          {tab === 'new' ? 'No hay nada nuevo.' : 'Nada por acá.'}
        </p>
      ) : (
        <ul className="adm__list">
          {shown.map((rec) => (
            <RecCard
              key={rec.key}
              rec={rec}
              act={act}
              guard={guard}
              playing={playing}
              onPreview={togglePreview}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function RecCard({ rec, act, guard, playing, onPreview }) {
  const [result, setResult] = useState(null);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  /* Busca sola al asomar en pantalla (con un margen, para que ya esté al
     llegar), y no todas de golpe: cada búsqueda son varias peticiones a
     Spotify y a Deezer, y la bandeja puede tener cientos. */
  const [cardRef, inView] = useInView({ rootMargin: '300px 0px' });

  const search = useCallback(
    async (q = '') => {
      setSearching(true);
      const data = await guard(() => call('resolve', { params: { key: rec.key, q } }));
      setSearching(false);
      if (!data) return;
      setResult(data);
      /* Queda elegida la primera: con un link es la única, y con una búsqueda
         es la más probable. Se ve marcada, y se cambia con un toque. */
      setChosen(data.candidates[0]?.id || null);
    },
    [guard, rec.key],
  );

  useEffect(() => {
    if (inView && rec.state === 'new') search();
  }, [inView, rec.state, search]);

  const run = async (op, body) => {
    setBusy(true);
    await act(op, { key: rec.key, ...body });
    setBusy(false);
  };

  return (
    <li className="adm__card" ref={cardRef}>
      <div className="adm__meta">
        <strong>{rec.name}</strong>
        <span>{formatDate(rec.at)}</span>
      </div>
      <p className="adm__song">
        <Linked text={rec.song} />
      </p>
      {rec.message ? <blockquote className="adm__msg">{rec.message}</blockquote> : null}

      {rec.state === 'added' && rec.trackId ? (
        <p className="adm__note">
          En la playlist ·{' '}
          <a href={`https://open.spotify.com/track/${rec.trackId}`} target="_blank" rel="noreferrer">
            abrir en Spotify
          </a>
        </p>
      ) : null}

      {rec.state === 'new' ? (
        <>
          {result ? (
            <div className="adm__found">
              {result.query ? <p className="adm__note">Buscado: «{result.query}»</p> : null}
              {result.candidates.length ? (
                <ul className="adm__cands">
                  {result.candidates.map((cand) => (
                    <li key={cand.id}>
                      <Track
                        track={cand}
                        selected={chosen === cand.id}
                        onSelect={() => setChosen(cand.id)}
                        playing={playing === cand.id}
                        onPreview={onPreview}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="adm__note">No encontré nada. Probá con otro texto o pegá el link.</p>
              )}
            </div>
          ) : null}

          <form
            className="adm__search"
            onSubmit={(event) => {
              event.preventDefault();
              search(query);
            }}
          >
            <input
              className="adm__input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="¿No es esa? Otra búsqueda o link de Spotify"
              aria-label="Buscar otra canción"
            />
            <button type="submit" className="adm__btn" disabled={searching || !query.trim()}>
              Buscar
            </button>
          </form>

          <div className="adm__actions">
            <button
              type="button"
              className="adm__btn adm__btn--main"
              disabled={busy || searching || !chosen}
              onClick={() => run('add', { trackId: chosen })}
            >
              {searching
                ? 'Buscando…'
                : result && !result.candidates.length
                  ? 'Sin resultados'
                  : result && !chosen
                    ? 'Elegí una canción'
                    : 'Agregar a la playlist'}
            </button>
            <button type="button" className="adm__btn" disabled={busy} onClick={() => run('discard')}>
              Descartar
            </button>
          </div>
        </>
      ) : null}

      {rec.state === 'discarded' ? (
        <div className="adm__actions">
          <button type="button" className="adm__btn" disabled={busy} onClick={() => run('restore')}>
            Restaurar
          </button>
        </div>
      ) : null}
    </li>
  );
}

function Track({ track, selected, onSelect, playing, onPreview, children }) {
  return (
    <div className={`adm__track${selected ? ' adm__track--on' : ''}`}>
      {onSelect ? (
        <button
          type="button"
          className="adm__pick"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`Elegir ${track.title} de ${track.artist}`}
        />
      ) : null}
      {track.art ? <img src={track.art} alt="" width="48" height="48" /> : <span className="adm__noart" />}
      <div className="adm__info">
        <span className="adm__ttl">{track.title}</span>
        <span className="adm__art">{track.artist}</span>
      </div>
      {track.previewUrl ? (
        <button
          type="button"
          className="adm__icon"
          onClick={() => onPreview(track.id, track.previewUrl)}
          aria-label={playing ? 'Pausar' : `Escuchar ${track.title}`}
        >
          {playing ? '❚❚' : '▶'}
        </button>
      ) : null}
      {track.url ? (
        <a className="adm__icon" href={track.url} target="_blank" rel="noreferrer" aria-label="Abrir en Spotify">
          ↗
        </a>
      ) : null}
      {children}
    </div>
  );
}

function Playlist({ items, onMove, onRemove, playing, onPreview }) {
  const [confirm, setConfirm] = useState(null);

  if (items === null) return <p className="adm__empty">Cargando…</p>;
  if (!items.length) return <p className="adm__empty">La playlist está vacía.</p>;

  return (
    <ol className="adm__list adm__list--plain">
      {items.map((item, i) => (
        <li key={`${item.id}-${i}`} className="adm__row">
          <Track track={item} playing={playing === item.id} onPreview={onPreview}>
            <div className="adm__rowctl">
              <button
                type="button"
                className="adm__icon"
                disabled={i === 0}
                onClick={() => onMove(i, i - 1)}
                aria-label="Subir"
              >
                ↑
              </button>
              <button
                type="button"
                className="adm__icon"
                disabled={i === items.length - 1}
                onClick={() => onMove(i, i + 1)}
                aria-label="Bajar"
              >
                ↓
              </button>
              {confirm === item.id ? (
                <>
                  <button
                    type="button"
                    className="adm__btn adm__btn--danger"
                    onClick={() => {
                      setConfirm(null);
                      onRemove(item.id);
                    }}
                  >
                    Quitar
                  </button>
                  <button type="button" className="adm__btn" onClick={() => setConfirm(null)}>
                    No
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="adm__icon"
                  onClick={() => setConfirm(item.id)}
                  aria-label={`Quitar ${item.title}`}
                >
                  ✕
                </button>
              )}
            </div>
          </Track>
          {item.by ? <p className="adm__note adm__by">Recomendó {item.by}</p> : null}
        </li>
      ))}
    </ol>
  );
}
