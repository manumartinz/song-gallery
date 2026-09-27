/**
 * npm run recs [cantidad]        las recomendaciones, de la más nueva a la más vieja
 * npm run recs add <n> [link]    manda la número <n> a la playlist de recomendaciones
 *
 * Lee las credenciales del Redis de .env.local (en Vercel: `vercel env pull`).
 *
 * `add` es la aprobación: nada entra solo en una playlist pública a mi nombre.
 * Si la recomendación trae link de canción, va esa; si es texto, se busca en
 * Spotify y se pregunta antes de agregar. Si el buscador se equivoca, el link
 * correcto va como tercer argumento y manda sobre todo lo demás.
 *
 * Necesita, además del Redis:
 *   SPOTIFY_RECS_PLAYLIST  el link de la playlist (creala a mano en Spotify,
 *                          pública, una sola vez)
 *   SPOTIFY_REFRESH_TOKEN  con el permiso playlist-modify-public
 *                          (`npm run spotify-token`)
 */
import fs from 'node:fs';
import readline from 'node:readline/promises';

for (const name of ['.env.local', '.env']) {
  if (!fs.existsSync(name)) continue;
  for (const line of fs.readFileSync(name, 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.trim().startsWith('#')) {
      const key = line.slice(0, eq).trim();
      if (!(key in process.env))
        process.env[key] = line
          .slice(eq + 1)
          .trim()
          .replace(/^["']|["']$/g, '');
    }
  }
}

const { kv, kvConfigured } = await import('../api/_kv.js');
if (!kvConfigured()) {
  console.error('Faltan KV_REST_API_URL y KV_REST_API_TOKEN en .env.local.');
  process.exit(1);
}

/* Las ya mandadas, por la fecha de la recomendación (que no cambia) y no por
   su número (que corre con cada una nueva que llega). */
const ADDED = 'recs:added';

const [command, ...args] = process.argv.slice(2);

if (command === 'add') await add(Number(args[0]), args[1]);
else await list(Math.max(1, Number(command) || 50));

async function list(count) {
  const [raw, added] = await Promise.all([
    kv('LRANGE', 'recs', '0', String(count - 1)),
    kv('HGETALL', ADDED),
  ]);
  const items = raw || [];
  if (!items.length) console.log('Todavía no hay recomendaciones.');

  // HGETALL por REST llega como lista plana: campo, valor, campo, valor...
  const done = new Set((added || []).filter((_, i) => i % 2 === 0));

  items.forEach((entry, i) => {
    const rec = JSON.parse(entry);
    const when = new Date(rec.at).toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    const mark = done.has(rec.at) ? '  ✓ en la playlist' : '';
    console.log(`\n${i + 1}. ${when}${rec.name ? ` · ${rec.name}` : ''}${mark}`);
    console.log(`  ${rec.song}`);
    if (rec.message) console.log(`  “${rec.message}”`);
  });

  if (items.length) console.log('\nPara agregar una: npm run recs add <número>');
}

async function add(n, override) {
  if (!Number.isInteger(n) || n < 1) {
    console.error('Uso: npm run recs add <número> [link de la canción]');
    process.exit(1);
  }

  const { parsePlaylistId } = await import('../api/_spotify.js');
  const playlistId = parsePlaylistId(process.env.SPOTIFY_RECS_PLAYLIST);
  if (!playlistId) {
    console.error('Falta SPOTIFY_RECS_PLAYLIST en .env.local (el link de la playlist).');
    process.exit(1);
  }
  if (!process.env.SPOTIFY_REFRESH_TOKEN) {
    console.error('Falta SPOTIFY_REFRESH_TOKEN. Corré npm run spotify-token.');
    process.exit(1);
  }

  const raw = await kv('LINDEX', 'recs', String(n - 1));
  if (!raw) {
    console.error(`No hay recomendación número ${n}.`);
    process.exit(1);
  }
  const rec = JSON.parse(raw);

  const already = await kv('HGET', ADDED, rec.at);
  if (already) {
    console.log(`Esa ya está en la playlist (spotify:track:${already}).`);
    return;
  }

  const { spotifyGet } = await import('../api/_spotify.js');
  const { searchQueryFor, trackIdFrom } = await import('../api/_recommendation.js');

  let trackId = trackIdFrom(override) || trackIdFrom(rec.song);
  let track;

  if (trackId) {
    track = await spotifyGet(`/tracks/${trackId}`);
  } else {
    const query = searchQueryFor(rec.song);
    const found = await spotifyGet(`/search?type=track&limit=1&q=${encodeURIComponent(query)}`);
    track = found.tracks?.items?.[0];
    if (!track) {
      console.error(`Spotify no encontró nada para «${query}». Pasá el link: npm run recs add ${n} <link>`);
      process.exit(1);
    }
    trackId = track.id;
  }

  const artists = (track.artists || []).map((artist) => artist.name).join(', ');
  console.log(`\n${rec.name} recomendó: ${rec.song}`);
  console.log(`Canción: ${track.name} — ${artists}`);
  console.log(`         ${track.external_urls?.spotify || ''}`);

  // Lo que salió del buscador se confirma; un link es exactamente lo que es.
  if (!trackIdFrom(override) && !trackIdFrom(rec.song)) {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question('¿Es esa? [s/N] ');
    prompt.close();
    if (!/^s/i.test(answer.trim())) {
      console.log(`No se agregó. Con el link correcto: npm run recs add ${n} <link>`);
      return;
    }
  }

  const { userFetch } = await import('../api/_user.js');
  await userFetch(`/playlists/${playlistId}/tracks`, {
    method: 'POST',
    body: { uris: [`spotify:track:${trackId}`] },
  });
  await kv('HSET', ADDED, rec.at, trackId);
  console.log('Agregada a la playlist.');
}
