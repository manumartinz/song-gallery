/**
 * Las ilustraciones de «Cómo funciona»: un esquema de la parte de la web que
 * cuenta cada tarjeta, no una captura.
 *
 * Esquemas y no capturas a proposito: una captura envejece con cada portada o
 * playlist que cambia, pesa, y no sabe de anchos. Estos son SVG en linea que
 * toman los colores de la hoja (`.tart__*` en app.css), asi que lo que la
 * tarjeta explica va en el acento y lo demas en tono bajo, como en la pagina.
 *
 * El movimiento vive en el CSS; con movimiento reducido tokens.css lo recorta
 * y queda el dibujo quieto, que se entiende igual.
 */

const W = 240;
const H = 150;

function Frame({ label, children }) {
  return (
    <svg className="tart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/* Barras del ecualizador sobre una portada. */
function Eq({ x, y }) {
  return (
    <g className="tart__eq">
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={x + i * 6} y={y - 14} width="3.5" height="14" rx="1" />
      ))}
    </g>
  );
}

function Listen() {
  const size = 44;
  const gap = 10;
  const x0 = (W - (size * 3 + gap * 2)) / 2;
  const y0 = 22;
  return (
    <Frame label="Una cuadrícula de portadas; la que se toca empieza a sonar">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const x = x0 + (i % 3) * (size + gap);
        const y = y0 + Math.floor(i / 3) * (size + gap);
        const on = i === 1;
        return (
          <rect
            key={i}
            className={on ? 'tart__cover tart__cover--on' : 'tart__cover'}
            x={x}
            y={y}
            width={size}
            height={size}
            rx="6"
          />
        );
      })}
      <Eq x={x0 + size + gap + 12} y={y0 + size - 8} />
      {/* El toque: un circulo que se abre sobre la portada encendida. */}
      <circle className="tart__tap" cx={x0 + size + gap + size - 8} cy={y0 + size - 6} r="7" />
    </Frame>
  );
}

function ChooseWide() {
  const labels = [34, 48, 40, 54];
  return (
    <Frame label="A la izquierda, la lista de playlists y los años de Wrapped">
      {/* El riel: rotulos cortos, uno encendido. */}
      {labels.map((w, i) => (
        <rect
          key={i}
          className={i === 1 ? 'tart__line tart__line--on' : 'tart__line'}
          x="18"
          y={22 + i * 15}
          width={w}
          height="5"
          rx="2.5"
        />
      ))}
      <rect className="tart__rule" x="18" y="86" width="64" height="1" />
      <text className="tart__eyebrow" x="18" y="100">
        MIS WRAPPED
      </text>
      {['25', '24', '23', '22', '21', '20'].map((year, i) => (
        <text
          key={year}
          className={i === 0 ? 'tart__chip tart__chip--on' : 'tart__chip'}
          x={18 + (i % 3) * 22}
          y={116 + Math.floor(i / 3) * 14}
        >
          {`'${year}`}
        </text>
      ))}
      {/* La pagina, a la derecha y apagada: no es lo que se cuenta. */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect
          key={i}
          className="tart__cover"
          x={108 + (i % 3) * 40}
          y={22 + Math.floor(i / 3) * 40}
          width="32"
          height="32"
          rx="4"
        />
      ))}
      <path className="tart__arrow" d="M96 50h-10m4-4l-4 4 4 4" />
    </Frame>
  );
}

function ChooseCompact() {
  return (
    <Frame label="Arriba, el menú que se abre con las playlists, los álbumes y los Wrapped">
      <rect className="tart__bar" x="20" y="14" width="200" height="22" rx="6" />
      <rect className="tart__line" x="30" y="23" width="34" height="5" rx="2.5" />
      <rect className="tart__pill tart__pill--on" x="146" y="18" width="64" height="14" rx="7" />
      <path className="tart__chev" d="M196 23l3 3 3-3" />
      {/* El panel que sube desde abajo. */}
      <g className="tart__sheet">
        <rect className="tart__panel" x="20" y="46" width="200" height="98" rx="10" />
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            className={i === 0 ? 'tart__line tart__line--on' : 'tart__line'}
            x="34"
            y={60 + i * 14}
            width={[46, 38, 52][i]}
            height="5"
            rx="2.5"
          />
        ))}
        <text className="tart__eyebrow" x="34" y="112">
          MIS WRAPPED
        </text>
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            className={i === 0 ? 'tart__pill tart__pill--on' : 'tart__pill'}
            x={34 + i * 44}
            y="118"
            width="38"
            height="16"
            rx="8"
          />
        ))}
      </g>
    </Frame>
  );
}

function Mood() {
  return (
    <Frame label="Una caja donde escribís lo que querés escuchar y aparecen canciones">
      <rect className="tart__field" x="20" y="18" width="200" height="28" rx="14" />
      <rect className="tart__typing" x="34" y="29.5" width="120" height="5" rx="2.5" />
      <rect className="tart__caret" x="34" y="26" width="1.5" height="12" />
      {[0, 1, 2].map((i) => (
        <g key={i} className={`tart__result tart__result--${i}`}>
          <rect className="tart__cover" x="20" y={60 + i * 28} width="22" height="22" rx="3" />
          <rect className="tart__line" x="50" y={65 + i * 28} width={[90, 70, 104][i]} height="5" rx="2.5" />
          <rect className="tart__line tart__line--faint" x="50" y={74 + i * 28} width="50" height="4" rx="2" />
        </g>
      ))}
    </Frame>
  );
}

function Track({ reactions = true, similar = true }) {
  return (
    <Frame label="La fila de la canción que suena, abierta con sus reacciones y Parecidas a esta">
      <rect className="tart__panel" x="16" y="16" width="208" height="118" rx="10" />
      <rect className="tart__cover tart__cover--on" x="28" y="28" width="40" height="40" rx="5" />
      <Eq x={36} y={60} />
      <rect className="tart__line tart__line--strong" x="78" y="34" width="96" height="6" rx="3" />
      <rect className="tart__line" x="78" y="46" width="64" height="5" rx="2.5" />
      <rect className="tart__progress" x="78" y="60" width="130" height="2" rx="1" />
      <rect className="tart__progress tart__progress--on" x="78" y="60" width="52" height="2" rx="1" />
      <rect className="tart__rule" x="28" y="80" width="184" height="1" />
      {reactions
        ? [0, 1, 2].map((i) => (
            <circle
              key={i}
              className={i === 0 ? 'tart__react tart__react--on' : 'tart__react'}
              cx={40 + i * 22}
              cy="106"
              r="8"
            />
          ))
        : null}
      {similar ? (
        <g className="tart__similar">
          <rect className="tart__pill tart__pill--on" x={reactions ? 112 : 28} y="97" width="100" height="18" rx="9" />
          <text className="tart__label tart__label--on" x={reactions ? 162 : 78} y="109.5" textAnchor="middle">
            Parecidas a esta
          </text>
        </g>
      ) : null}
    </Frame>
  );
}

function End() {
  return (
    <Frame label="Al pie de la lista, la radio y el juego de adivinar la canción">
      <rect className="tart__rule" x="40" y="30" width="160" height="1" />
      <text className="tart__eyebrow" x="120" y="50" textAnchor="middle">
        FIN DE LA PLAYLIST
      </text>
      {/* Radio: un punto con ondas que se abren. */}
      <g>
        <rect className="tart__pill tart__pill--on" x="22" y="70" width="96" height="30" rx="15" />
        <circle className="tart__dot" cx="42" cy="85" r="2.5" />
        <path className="tart__wave tart__wave--1" d="M37 80a7 7 0 0 0 0 10M47 80a7 7 0 0 1 0 10" />
        <path className="tart__wave tart__wave--2" d="M34 77a11 11 0 0 0 0 16M50 77a11 11 0 0 1 0 16" />
        <text className="tart__label tart__label--on" x="58" y="88.5">
          Radio
        </text>
      </g>
      <g>
        <rect className="tart__pill" x="126" y="70" width="96" height="30" rx="15" />
        <circle className="tart__ring" cx="144" cy="85" r="7" />
        <text className="tart__label" x="144" y="88.5" textAnchor="middle">
          ?
        </text>
        <text className="tart__label" x="158" y="88.5">
          Adiviná
        </text>
      </g>
    </Frame>
  );
}

function Turn() {
  return (
    <Frame label="En la barra de arriba, el botón Recomendame una">
      <rect className="tart__bar" x="14" y="50" width="212" height="32" rx="8" />
      <rect className="tart__line tart__line--strong" x="26" y="63.5" width="44" height="5" rx="2.5" />
      <rect className="tart__pulse" x="112" y="56" width="104" height="20" rx="10" />
      <rect className="tart__pill tart__pill--solid" x="112" y="56" width="104" height="20" rx="10" />
      <text className="tart__label tart__label--ink" x="164" y="69.5" textAnchor="middle">
        Recomendame una
      </text>
      <path className="tart__arrow" d="M164 104v-16m-4 4l4-4 4 4" />
    </Frame>
  );
}

const ART = {
  listen: Listen,
  choose: ChooseWide,
  'choose-compact': ChooseCompact,
  mood: Mood,
  track: Track,
  end: End,
  turn: Turn,
};

export default function TourArt({ name, ...props }) {
  const Art = ART[name];
  return Art ? (
    <div className="tour__art">
      <Art {...props} />
    </div>
  ) : null;
}
