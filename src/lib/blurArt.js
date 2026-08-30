/**
 * Prepara la mancha de color que hace de fondo, a partir de la portada.
 *
 * El desenfoque se calcula a mano porque las dos vias obvias no sirven:
 * `filter: blur()` en CSS se rasteriza a la escala final y se rehace en cada
 * frame, lo que atascaba la interfaz mientras sonaba musica; y
 * `context.filter` en canvas no existe en Safari anterior a la 17.
 *
 * Reducir la imagen y volver a ampliarla tampoco vale: la interpolacion es
 * lineal a trozos y deja a la vista la rejilla pequeña en forma de celdas.
 *
 * El resultado es una textura de 256 px que la GPU estira, calculada una sola
 * vez por portada.
 */

const cache = new Map();

/* Lado de la textura. No hace falta mas: despues de difuminar no queda detalle
   que una resolucion mayor pudiera conservar. */
const SIZE = 256;

/* Radio de CADA pasada de caja, como fraccion del lado del lienzo.
 *
 * Ojo con leer este numero como "el desenfoque": no lo es. Al encadenar varias
 * pasadas las varianzas se SUMAN, asi que ROUNDS cajas de radio R equivalen a
 * una gaussiana de sigma ~= R, cuyo alcance visible son unos 6 sigma. Con R=13
 * sobre 256 eso barria 81 px, o sea un tercio de la portada: por eso cualquier
 * valor del 5% para arriba daba el mismo lavado de color, sin diferencia
 * apreciable entre ellos.
 *
 * La escala util esta bastante mas abajo de lo que parece:
 *   ~1%  (R=3)  se reconoce la portada, casi una foto desenfocada
 *   ~2%  (R=5)  se intuye la composicion: manchas grandes y de donde salen
 *   ~4%  (R=10) formas muy vagas
 *   >5%  (R=13) lavado de color, ya da igual cuanto se suba
 */
const RADIUS = Math.round(SIZE * 0.02);

/* Tres cajas seguidas convergen a una gaussiana (es el teorema del limite
   central aplicado a la convolucion). Con dos se notan los bordes rectos; a
   partir de cuatro no se gana nada visible. */
const ROUNDS = 3;

// Equivalente a `saturate(1.65) brightness(0.72)`, el filtro que llevaba antes.
const SATURATION = 1.65;
const BRIGHTNESS = 0.72;

/**
 * Desenfoque de caja en una direccion, escribiendo la salida TRANSPUESTA.
 *
 * Lo de transponer no es un capricho: llamando dos veces se difumina en las dos
 * direcciones y la imagen vuelve sola a su orientacion, sin escribir un segundo
 * bucle casi identico ni saltar por la memoria a zancadas del ancho de la fila.
 *
 * La suma corrida es lo que hace que el coste no dependa del radio: en cada
 * paso se resta el pixel que sale de la ventana y se suma el que entra, en vez
 * de recorrerla entera.
 */
function boxPass(src, dst, side, radius) {
  const span = radius * 2 + 1;
  const last = side - 1;
  const clamp = (value) => (value < 0 ? 0 : value > last ? last : value);

  for (let y = 0; y < side; y += 1) {
    const row = y * side * 4;
    let r = 0;
    let g = 0;
    let b = 0;

    /* Ventana inicial. Los bordes se repiten en vez de tratarse como negro: si
       no, el fondo saldria con un marco oscuro alrededor. */
    for (let i = -radius; i <= radius; i += 1) {
      const p = row + clamp(i) * 4;
      r += src[p];
      g += src[p + 1];
      b += src[p + 2];
    }

    for (let x = 0; x < side; x += 1) {
      const q = (x * side + y) * 4; // transpuesto
      dst[q] = r / span;
      dst[q + 1] = g / span;
      dst[q + 2] = b / span;
      dst[q + 3] = 255;

      const leaving = row + clamp(x - radius) * 4;
      const entering = row + clamp(x + radius + 1) * 4;
      r += src[entering] - src[leaving];
      g += src[entering + 1] - src[leaving + 1];
      b += src[entering + 2] - src[leaving + 2];
    }
  }
}

/** Satura y oscurece pixel a pixel. 65k pixeles: se va en un suspiro. */
function tint(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Luminancia percibida: es el gris del que `saturate()` aleja cada canal.
    const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    data[i] = (grey + (r - grey) * SATURATION) * BRIGHTNESS;
    data[i + 1] = (grey + (g - grey) * SATURATION) * BRIGHTNESS;
    data[i + 2] = (grey + (b - grey) * SATURATION) * BRIGHTNESS;
  }
}

/**
 * Data URL con el fondo ya preparado, o `null` si no se pudo (portada sin CORS,
 * o sin canvas). Quien llama debe tener un plan para el null; nunca rechaza.
 */
export function blurredArt(src) {
  if (!src) return Promise.resolve(null);
  if (cache.has(src)) return Promise.resolve(cache.get(src));

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous'; // i.scdn.co lo permite, igual que en color.js

    /* Avisa en consola al caer al plan B. Sin esto el fallo era mudo: el fondo
       pasaba a difuminarse por CSS y cualquier ajuste de RADIUS dejaba de tener
       efecto, sin ninguna pista de por que. */
    const fail = (cause) => {
      console.warn('[fondo] sin pre-difuminado, se usa el respaldo de CSS:', cause);
      cache.set(src, null);
      resolve(null);
    };

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;

        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return fail('sin contexto 2d');

        context.drawImage(image, 0, 0, SIZE, SIZE);

        const frame = context.getImageData(0, 0, SIZE, SIZE);
        const front = frame.data;
        const back = new Uint8ClampedArray(front.length);

        // Cada vuelta son dos pasadas, y dos transposiciones que se cancelan.
        for (let round = 0; round < ROUNDS; round += 1) {
          boxPass(front, back, SIZE, RADIUS);
          boxPass(back, front, SIZE, RADIUS);
        }

        tint(front);
        context.putImageData(frame, 0, 0);

        /* PNG y no JPEG: el JPEG comprime en bloques de 8x8 y esta textura se
           amplia mas de diez veces, asi que cada bloque acabaria siendo un
           parche visible. Un degradado ademas es lo que mejor comprime PNG. */
        const url = canvas.toDataURL('image/png');
        cache.set(src, url);
        resolve(url);
      } catch (cause) {
        fail(cause); // tipicamente: canvas contaminado por falta de CORS
      }
    };

    image.onerror = () => fail('la portada no cargo');
    image.src = src;
  });
}
