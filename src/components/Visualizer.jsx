import { useEffect, useRef } from 'react';
import { readSpectrum } from '../lib/analyser.js';

const BARS = 40;
const GAP = 0.45; // hueco entre barras, en fraccion del ancho de cada una

/**
 * Espectro en un <canvas>, en espejo arriba y abajo de una linea central.
 *
 * Canvas y no DOM: son cuarenta barras a sesenta cuadros por segundo, y el
 * mismo motivo por el que el fondo se difumina a mano. El color es el acento
 * de la portada, leido de la variable CSS cada medio segundo para que siga
 * al cambio de tema sin volver a montar nada.
 *
 * Sin datos reales (Safari de iOS, fuente sin CORS, pausa) cae a una onda
 * suave calculada, que se aplana del todo en pausa.
 */
export default function Visualizer({ playing }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    const smooth = new Array(BARS).fill(0);
    let raf = 0;
    let color = '#f4f1ea';
    let colorAt = -Infinity;

    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      const { width, height } = canvas;
      if (!width || !height) return;

      const live = playing ? readSpectrum(BARS) : null;
      for (let i = 0; i < BARS; i += 1) {
        const target = live
          ? live[i]
          : playing
            ? 0.18 + 0.14 * Math.sin(now / 420 + i * 0.5) * Math.sin(now / 900 + i * 0.13)
            : 0.02;
        // Sube rapido y cae despacio, como un vumetro: se lee mejor el pulso.
        smooth[i] += (target - smooth[i]) * (target > smooth[i] ? 0.55 : 0.12);
      }

      context.clearRect(0, 0, width, height);
      // Leer estilos fuerza un recalculo: dos veces por segundo sobra.
      if (now - colorAt > 500) {
        colorAt = now;
        color =
          getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || color;
      }
      context.fillStyle = color;

      const slot = width / BARS;
      const bar = slot * (1 - GAP);
      const middle = height / 2;
      for (let i = 0; i < BARS; i += 1) {
        const half = Math.max(1, smooth[i] * middle * 0.95);
        const x = i * slot + (slot - bar) / 2;
        context.globalAlpha = 0.35 + smooth[i] * 0.65;
        context.beginPath();
        context.roundRect(x, middle - half, bar, half * 2, bar / 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [playing]);

  return <canvas ref={canvasRef} className="viz" aria-hidden="true" />;
}
