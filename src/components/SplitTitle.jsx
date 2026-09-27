/**
 * Titulo que entra letra a letra cuando su cancion empieza a sonar.
 *
 * Sin `animate` devuelve el texto pelado: las filas que no suenan no pagan ni
 * un span de mas. La cascada la hace el CSS (`.split__char`) con el indice de
 * cada letra en `--c`, asi que no hay estado ni temporizadores aqui.
 *
 * Se parte primero en palabras y luego en letras: cada palabra va en un bloque
 * que no se corta, o un titulo en dos lineas partiria por mitad de palabra.
 * `Array.from` y no `split('')` para no romper emojis ni acentos compuestos.
 */
export default function SplitTitle({ text, animate }) {
  if (!animate || !text) return text;

  let c = 0;
  const words = text.split(' ');

  return (
    <span className="split" aria-label={text}>
      {words.map((word, w) => (
        <span key={w} aria-hidden="true">
          <span className="split__word">
            {Array.from(word).map((char, i) => (
              <span key={i} className="split__char" style={{ '--c': c++ }}>
                {char}
              </span>
            ))}
          </span>
          {w < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </span>
  );
}
