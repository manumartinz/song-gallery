/**
 * Extrae el color dominante de una portada para teñir los acentos.
 *
 * Dibuja la miniatura en un canvas diminuto y promedia los pixeles. Requiere
 * que la imagen llegue con CORS (i.scdn.co lo permite); si no, se cae con
 * gracia al acento neutro en vez de romper nada.
 */

const cache = new Map();
const FALLBACK = '#f4f1ea';
const SAMPLE = 12; // 12x12 px es suficiente para un promedio estable

/** Sube la luminosidad hasta que el color sirva de acento sobre fondo oscuro. */
function ensureReadable(r, g, b) {
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance >= 0.55) return [r, g, b];
  const boost = Math.min(2.6, 0.62 / Math.max(luminance, 0.06));
  return [r, g, b].map((channel) => Math.min(255, Math.round(channel * boost)));
}

export function dominantColor(src) {
  if (!src) return Promise.resolve(FALLBACK);
  if (cache.has(src)) return Promise.resolve(cache.get(src));

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE;
        canvas.height = SAMPLE;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
        const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE);

        let r = 0;
        let g = 0;
        let b = 0;
        let counted = 0;

        for (let i = 0; i < data.length; i += 4) {
          const [pr, pg, pb] = [data[i], data[i + 1], data[i + 2]];
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          // Ignora pixeles casi grises: no aportan identidad cromatica.
          if (max - min < 18) continue;
          r += pr;
          g += pg;
          b += pb;
          counted += 1;
        }

        if (!counted) {
          cache.set(src, FALLBACK);
          resolve(FALLBACK);
          return;
        }

        const [nr, ng, nb] = ensureReadable(r / counted, g / counted, b / counted);
        const color = `rgb(${nr}, ${ng}, ${nb})`;
        cache.set(src, color);
        resolve(color);
      } catch {
        // Canvas contaminado por falta de CORS: acento neutro.
        cache.set(src, FALLBACK);
        resolve(FALLBACK);
      }
    };

    image.onerror = () => {
      cache.set(src, FALLBACK);
      resolve(FALLBACK);
    };

    image.src = src;
  });
}
