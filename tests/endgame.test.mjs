// node --test tests/*.test.mjs — fim de jogo: pedidos, foguetes, legado, enfeites, conquistas
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, idx } from '../src/sim.js';
import { Meta, ACHIEVEMENTS } from '../src/meta.js';
import { MACHINES, ERAS, MAX_ERA, CONTRACTS, ROCKET_PARTS, LEGACY, START_COINS, HUB_COLORS, WIN_UNLOCK } from '../src/data.js';

function lab(opts) {
  const g = new Game('LAB', opts);
  g.landEra.fill(1); g.ore.fill(null); g.tree.fill(0);
  g.coins = 1e6;
  Object.keys(MACHINES).forEach((m) => g.unlocked.add(m));
  return g;
}
const run = (g, s) => { for (let t = 0; t < s; t += 0.05) g.step(0.05); };
function win(g) {
  const pad = [...g.ents.values()].find((e) => e.kind === 'pad') || g.place('plataforma', 3, 3, 0);
  while (!g.won) {
    const d = g.goalDef;
    for (const [it, n] of Object.entries(d.need)) for (let k = 0; k < n; k++) d.at === 'pad' ? g.accept(pad, it, 0) : g.deliver(it, false);
  }
  return pad;
}
function memStorage() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; }

test('pedidos aparecem na era 2, contam entregas, pagam e se renovam', () => {
  const g = lab();
  g.era = 2;
  g.delivered = { chapa: 5, barra_ferro: 5, barra_cobre: 5, engrenagem: 5 };
  run(g, 4);
  assert.ok(g.contracts.length >= 1, 'apareceu um pedido');
  run(g, CONTRACTS.respawn * 3);
  assert.equal(g.contracts.length, CONTRACTS.slots, 'quadro cheio');
  const c = g.contracts.find((q) => !q.timed) || g.contracts[0];
  const before = g.coins;
  for (let i = 0; i < c.need; i++) g.deliver(c.it, false);
  assert.ok(!g.contracts.includes(c), 'saiu do quadro');
  assert.equal(g.stats.contracts, 1);
  assert.ok(g.coins >= before + c.reward, 'pagou a recompensa');
  assert.ok(g.ev.some((e) => e.t === 'contract'));
  run(g, CONTRACTS.respawn + 1);
  assert.equal(g.contracts.length, CONTRACTS.slots, 'repôs o pedido');
});

test('pedido relâmpago vence e some; trocar pedido só antes de entregar', () => {
  const g = lab();
  g.era = 3;
  g.delivered = { motor: 3, chapa: 3, engrenagem: 3 };
  g.rng = () => 0.1; // força relâmpago
  const c = g.newContract();
  assert.ok(c.timed && c.left > 0 && c.gear === 1);
  const other = g.newContract();
  assert.ok(g.rerollContract(other.id), 'troca pedido sem entregas');
  g.deliver(g.contracts[1].it, false);
  if (g.contracts[1].got > 0) assert.equal(g.rerollContract(g.contracts[1].id), false, 'não troca depois de começar');
  run(g, c.time + 1);
  assert.ok(!g.contracts.includes(c), 'venceu');
  assert.ok(g.ev.some((e) => e.t === 'contractFail'));
});

test('sem entrega nenhuma, não há pedido (nada para pedir)', () => {
  const g = lab();
  g.era = 2;
  run(g, 30);
  assert.equal(g.contracts.length, 0);
});

test('depois da vitória, cada 20 peças montam outro foguete para lançar', () => {
  const g = lab();
  const pad = win(g);
  assert.equal(g.launches, 1);
  assert.equal(g.rocketParts, 0, 'o primeiro foguete já subiu');
  for (const u of WIN_UNLOCK) assert.ok(g.unlocked.has(u));
  assert.equal(g.launchRocket(), false, 'sem peças não lança');
  for (let k = 0; k < ROCKET_PARTS; k++) assert.ok(g.accept(pad, 'peca_foguete', 0));
  assert.ok(g.ev.some((e) => e.t === 'rocketReady'));
  assert.equal(g.accept(pad, 'peca_foguete', 0), false, 'plataforma cheia até lançar');
  assert.ok(g.launchRocket());
  assert.equal(g.launches, 2);
  assert.equal(g.rocketParts, 0);
  assert.ok(g.ev.some((e) => e.t === 'launch' && e.gears === 3));
});

test('legado acelera, barateia, paga mais e dá moedas iniciais', () => {
  const base = lab();
  const L = { fabrica: 2, esteira: 1, mina: 3, venda: 2, inicio: 2, desconto: 4, marco: 1 };
  const g = new Game('X', { legacy: L });
  assert.equal(g.coins, START_COINS + 2 * LEGACY.inicio.per);
  assert.equal(g.costOf('fornalha'), Math.round(MACHINES.fornalha.cost * 0.8));
  assert.ok(g.beltSpeed() > base.beltSpeed());
  g.landEra.fill(1); g.coins = 1000;
  g.unlocked.add('fornalha');
  const f = g.place('fornalha', 3, 3, 0);
  assert.equal(g.coins, 1000 - g.costOf('fornalha'));
  g.remove(3, 3);
  assert.equal(g.coins, 1000, 'devolve o que foi pago');
  const c0 = g.coins; g.deliver('motor', false);
  assert.equal(g.coins - c0, Math.round(30 * 1.2), 'venda +20%');
  const legacyOver = new Game('Y', { legacy: { fabrica: 99, lixo: 5 } });
  assert.equal(legacyOver.legacy.fabrica, LEGACY.fabrica.cost.length, 'nível limitado ao máximo');
  assert.equal(legacyOver.legacy.lixo, undefined);
});

test('enfeites: liberam por era, podem ir em qualquer terra e não recebem itens', () => {
  const g = new Game('DECO');
  assert.equal(g.canPlace('flores', 20, 20).why, 'locked');
  for (let e = 1; e < 4; e++) { const E = ERAS[e]; E.goals.forEach((q) => Object.entries(q.need).forEach(([it, n]) => { for (let k = 0; k < n; k++) g.deliver(it, false); })); }
  assert.equal(g.era, 4);
  for (const d of ['arvore', 'flores', 'banco', 'poste', 'bandeira', 'fonte']) assert.ok(g.unlocked.has(d), d);
  assert.ok(!g.unlocked.has('estatua'));
  g.coins = 1e5;
  const spot = [...Array(48 * 48).keys()].find((i) => g.landEra[i] <= g.era && !g.occ[i]);
  const d = g.place('fonte', spot % 48, (spot / 48) | 0, 0);
  assert.ok(d && d.kind === 'deco');
  assert.equal(g.accept(d, 'barra_ferro', 0), false);
});

test('pintar a Sede e fogos custam moedas; save guarda tudo do fim de jogo', () => {
  const g = lab();
  g.coins = 2000;
  assert.equal(g.paintHub(HUB_COLORS[0]), false, 'mesma cor não cobra');
  assert.ok(g.paintHub(HUB_COLORS[2]));
  assert.ok(g.buyFireworks());
  win(g);
  g.era = MAX_ERA;
  g.delivered = { robo: 2 };
  g.newContract();
  g.place('estatua', 10, 10, 1);
  const s = JSON.parse(JSON.stringify(g.serialize()));
  const h = Game.load(s, { legacy: { fabrica: 1 } });
  assert.equal(h.hubColor, HUB_COLORS[2]);
  assert.equal(h.launches, 1);
  assert.equal(h.contracts.length, 1);
  assert.equal(h.contracts[0].it, 'robo');
  assert.equal(h.entAt(10, 10).type, 'estatua');
  assert.equal(h.legacy.fabrica, 1);
  assert.ok(h.unlocked.has('balao'));
});

test('save antigo (antes do fim de jogo) ganha os enfeites da era e o foguete conta', () => {
  const g = new Game('OLD');
  const s = g.serialize();
  s.era = 5; s.won = false;
  s.unlocked = ['esteira', 'mina'];
  delete s.launches; delete s.contracts; delete s.stats; delete s.rocketParts; delete s.hubColor;
  const h = Game.load(s);
  for (const m of ['fornalha', 'prensa', 'turbina', 'bomba', 'flores', 'fonte']) assert.ok(h.unlocked.has(m), m);
  assert.deepEqual(h.contracts, []);
  const w = Game.load({ ...s, won: true, era: 6 });
  assert.equal(w.launches, 1);
  assert.ok(w.unlocked.has('estatua'));
});

test('meta: engrenagens por foguete, pedido relâmpago e conquistas; legado limitado', () => {
  const st = memStorage();
  const m = new Meta(st);
  const g = lab();
  m.onEvent({ t: 'victory', gears: 3 });
  m.onEvent({ t: 'contract', c: { gear: 1 } });
  assert.equal(m.gears, 4);
  g.ore[idx(5, 5)] = 'ferro';
  g.place('mina', 5, 5, 0);
  const got = m.checkAchievements(g);
  assert.ok(got.some((a) => a.id === 'primeira_mina'));
  assert.ok(got.some((a) => a.id === 'foguete'));
  assert.equal(m.gears, 4 + got.length);
  assert.equal(m.checkAchievements(g).length, 0, 'não ganha de novo');
  m.d.gears = 100;
  let n = 0;
  while (m.buyLegacy('desconto')) n++;
  assert.equal(n, LEGACY.desconto.cost.length);
  const again = new Meta(st);
  assert.equal(again.legacy.desconto, LEGACY.desconto.cost.length, 'salvou');
  assert.ok(again.d.ach.includes('primeira_mina'));
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length, 'ids únicos');
});
