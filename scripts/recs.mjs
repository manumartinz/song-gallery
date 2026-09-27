/**
 * npm run recs [cantidad]        las recomendaciones, de la más nueva a la más vieja
 * npm run recs add <n> [link]    manda la número <n> a la playlist de recomendaciones
 *
 * Lo mismo que el panel (/admin), desde la terminal: los dos usan api/_recs.js,
 * así que lo que se agrega o descarta en uno aparece en el otro.
 *
 * `add` es la aprobación: nada entra solo en una playlist pública a mi nombre.
 * Si la recomendación trae link de canción, va esa; si es texto (o un video de
 * YouTube), se busca en Spotify y se pregunta antes de agregar. Si el buscador
 * se equivoca, el link correcto va como tercer argumento y manda sobre todo.
 *
 * Lee de .env.local el Redis, SPOTIFY_RECS_PLAYLIST y SPOTIFY_REFRESH_TOKEN
 * (con el permiso playlist-modify-public: `npm run spotify-token`).
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

const { kvConfigured } = await import('../api/_kv.js');
if (!kvConfigured()) {
  console.error('Faltan KV_REST_API_URL y KV_REST_API_TOKEN en .env.local.');
  process.exit(1);
}

const recs = await import('../api/_recs.js');

const MARKS = { added: '  ✓ en la playlist', discarded: '  ✗ descartada', new: '' };

const [command, ...args] = process.argv.slice(2);

if (command === 'add') await add(Number(args[0]), args[1]);
else await list(Math.max(1, Number(command) || 50));

async function list(count) {
  const items = (await recs.listRecs()).slice(0, count);
  if (!items.length) console.log('Todavía no hay recomendaciones.');

  items.forEach((rec, i) => {
    const when = new Date(rec.at).toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    console.log(`\n${i + 1}. ${when}${rec.name ? ` · ${rec.name}` : ''}${MARKS[rec.state]}`);
    console.log(`  ${rec.song}`);
    if (rec.message) console.log(`  “${rec.message}”`);
  });

  if (items.length) console.log('\nPara agregar una: npm run recs add <número>  (o desde /admin)');
}

async function add(n, override = '') {
  if (!Number.isInteger(n) || n < 1) {
    console.error('Uso: npm run recs add <número> [link de la canción]');
    process.exit(1);
  }
  if (!recs.recsPlaylistId()) {
    console.error('Falta SPOTIFY_RECS_PLAYLIST en .env.local (el link de la playlist).');
    process.exit(1);
  }
  if (!process.env.SPOTIFY_REFRESH_TOKEN) {
    console.error('Falta SPOTIFY_REFRESH_TOKEN. Corré npm run spotify-token.');
    process.exit(1);
  }

  const rec = (await recs.listRecs())[n - 1];
  if (!rec) {
    console.error(`No hay recomendación número ${n}.`);
    process.exit(1);
  }
  if (rec.state === 'added') {
    console.log(`Esa ya está en la playlist (spotify:track:${rec.trackId}).`);
    return;
  }

  const { exact, query, candidates } = await recs.resolveRec(rec.song, override);
  const track = candidates[0];
  if (!track) {
    console.error(
      `Spotify no encontró nada${query ? ` para «${query}»` : ''}. Pasá el link: npm run recs add ${n} <link>`,
    );
    process.exit(1);
  }

  console.log(`\n${rec.name} recomendó: ${rec.song}`);
  console.log(`Canción: ${track.title} — ${track.artist}`);
  if (track.url) console.log(`         ${track.url}`);

  // Lo que salió del buscador se confirma; un link es exactamente lo que es.
  if (!exact) {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question('¿Es esa? [s/N] ');
    prompt.close();
    if (!/^s/i.test(answer.trim())) {
      console.log(`No se agregó. Con el link correcto: npm run recs add ${n} <link>`);
      return;
    }
  }

  await recs.addRec(rec.key, track.id);
  console.log('Agregada a la playlist.');
}
