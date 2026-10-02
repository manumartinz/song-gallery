import { beforeEach, describe, expect, it, vi } from 'vitest';

/* Un Redis en memoria con lo justo para el límite: INCR, EXPIRE (con y sin NX)
   y SET ... NX. El reloj es `now`, que el test adelanta a mano. */
let now = 0;
const store = new Map();

function alive(key) {
  const item = store.get(key);
  if (item && item.expires !== null && item.expires <= now) store.delete(key);
  return store.get(key);
}

function run([cmd, key, ...args]) {
  if (cmd === 'INCR') {
    const item = alive(key) || { value: 0, expires: null };
    item.value += 1;
    store.set(key, item);
    return item.value;
  }
  if (cmd === 'EXPIRE') {
    const item = alive(key);
    if (!item || (args[1] === 'NX' && item.expires !== null)) return 0;
    item.expires = now + Number(args[0]) * 1000;
    return 1;
  }
  if (cmd === 'SET') {
    if (args.includes('NX') && alive(key)) return null;
    store.set(key, { value: args[0], expires: null });
    return 'OK';
  }
  return null;
}

vi.mock('../api/_kv.js', () => ({
  kvConfigured: () => true,
  kvPipeline: async (commands) => commands.map(run),
  readJson: async (req) => req.body,
  sameOrigin: () => true,
  clientIp: () => '1.2.3.4',
}));

const { default: handler } = await import('../api/recommend.js');

const HOUR = 3600 * 1000;
let n = 0;

async function send() {
  n += 1;
  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { song: `Canción número ${n}`, name: 'Ana', elapsed: 5000 },
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };
  await handler(req, res);
  return res.statusCode;
}

describe('límite de recomendaciones por persona', () => {
  beforeEach(() => {
    now = 0;
    store.clear();
  });

  it('deja mandar 5 y corta la sexta', async () => {
    for (let i = 0; i < 5; i += 1) expect(await send()).toBe(200);
    expect(await send()).toBe(429);
  });

  it('la pausa son 6 horas desde la quinta, no desde la primera', async () => {
    await send();
    now += 5 * HOUR;
    for (let i = 0; i < 4; i += 1) expect(await send()).toBe(200);

    now += 5 * HOUR; // 10 h desde la primera, 5 desde la quinta
    expect(await send()).toBe(429);

    now += 1 * HOUR + 1;
    expect(await send()).toBe(200);
  });

  it('quien se queda corta recupera el cupo a las 6 horas', async () => {
    for (let i = 0; i < 3; i += 1) await send();
    now += 6 * HOUR + 1;
    for (let i = 0; i < 5; i += 1) expect(await send()).toBe(200);
  });
});
