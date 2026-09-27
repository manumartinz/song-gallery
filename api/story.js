import { ImageResponse } from '@vercel/og';
import { createElement as h } from 'react';
import { describeShare, readShareParams, SITE } from './_share.js';
import { loadInter } from './_fonts.js';

/**
 * GET /api/story?p=|a=&t=<pista>[&c=<color>]
 *
 * Imagen vertical (1080x1920) de una cancion para subir a historias de
 * Instagram: portada grande, titulo, artista, la nota si la hay, y la
 * direccion de la web. Instagram no deja enlaces dentro de la imagen, asi que
 * la direccion va escrita; el enlace de verdad se pone con su sticker.
 *
 * `c` es el color de acento que la web ya saco de la portada (un hex sin #).
 * Aqui no hay canvas para calcularlo, y pedirlo es mas barato que decodificar
 * la imagen en el edge. Sin el, el lavado calido de siempre.
 */
export const config = { runtime: 'edge' };

const INK = '#07070a';
const BONE = '#f4f1ea';
const MUTED = 'rgba(244, 241, 234, 0.68)';
const NOTE_MAX = 170; // unas cuatro lineas a este tamaño

function readColor(value) {
  return /^[0-9a-f]{6}$/i.test(value || '') ? `#${value}` : '#8a6a3a';
}

function clip(text, max) {
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

function titleSize(text) {
  const length = text.length;
  if (length <= 16) return 104;
  if (length <= 28) return 86;
  if (length <= 44) return 70;
  return 58;
}

export default async function handler(request) {
  const url = new URL(request.url);
  const params = readShareParams(url.searchParams);

  if (!params.trackId) {
    return new Response(JSON.stringify({ error: 'Falta la canción (?t=).' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const [meta, fonts] = await Promise.all([describeShare(params), loadInter()]);
  if (meta.kind !== 'track') {
    return new Response(JSON.stringify({ error: 'No encontré esa canción.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const accent = readColor(url.searchParams.get('c'));
  const cover = meta.art?.lg || meta.art?.md;
  const note = clip(meta.note, NOTE_MAX);
  const host = url.host.replace(/^www\./, '');

  const text = (style, content) => h('div', { style: { display: 'flex', ...style } }, content);

  return new ImageResponse(
    h(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '150px 110px 120px',
          background: INK,
          /* El acento arriba, fundiendo a negro: el mismo gesto que el fondo de
             la web, que se tiñe con la portada que suena. */
          backgroundImage: `linear-gradient(180deg, ${accent} 0%, ${INK} 62%)`,
          color: BONE,
          fontFamily: 'Inter, sans-serif',
        },
      },
      text(
        {
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: MUTED,
        },
        'Una canción que recomiendo',
      ),
      cover
        ? h('img', {
            src: cover,
            width: 860,
            height: 860,
            style: {
              marginTop: 60,
              borderRadius: 18,
              boxShadow: '0 40px 90px rgba(0,0,0,0.6)',
            },
          })
        : null,
      text(
        {
          marginTop: 70,
          fontSize: titleSize(meta.trackTitle),
          fontWeight: 700,
          letterSpacing: '-0.03em',
          lineHeight: 1.04,
          textAlign: 'center',
          justifyContent: 'center',
        },
        meta.trackTitle,
      ),
      text({ marginTop: 20, fontSize: 44, color: MUTED, textAlign: 'center' }, meta.artist),
      note
        ? text(
            {
              marginTop: 56,
              fontSize: 38,
              lineHeight: 1.4,
              textAlign: 'center',
              justifyContent: 'center',
              color: BONE,
            },
            `“${note}”`,
          )
        : null,
      h('div', { style: { display: 'flex', flex: 1 } }),
      text({ fontSize: 34, fontWeight: 600 }, SITE),
      text({ marginTop: 10, fontSize: 30, color: MUTED }, host),
    ),
    {
      width: 1080,
      height: 1920,
      fonts,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400',
      },
    },
  );
}
