// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, genWorld, idx } from '../src/sim.js';
import { N, C, ERAS, MAX_ERA, RECIPES, MACHINES, ORES } from '../src/data.js';

// mundo de laboratório: tudo é terra da era 1, sem minério nem árvores
function lab({ era = 1, coins = 1e6, unlockAll = true } = {}) {
  const g = new Game('LAB');
  g.landEra.fill(1);
  g.ore.fill(null);
  g.tree.fill(0);
  g.coins = coins;
  g.era = era;
  if (unlockAll) Object.keys(MACHINES).forEach((m) => g.unlocked.add(m));
  return g;
}
const run = (g, s) => { for (let t = 0; t < s; t += 0.05) g.step(0.05); };
// linha reta de esteiras de (x1,y) até (x2,y) inclusive, apontando no sentido do movimento
function beltX(g, x1, x2, y) {
  const d = x2 >= x1 ? 0 : 2, s = x2 >= x1 ? 1 : -1;
  for (let x = x1; x !== x2 + s; x += s) assert.ok(g.place('esteira', x, y, d), `esteira ${x},${y}`);
}
function beltY(g, x, y1, y2) {
  const d = y2 >= y1 ? 1 : 3, s = y2 >= y1 ? 1 : -1;
  for (let y = y1; y !== y2 + s; y += s) assert.ok(g.place('esteira', x, y, d), `esteira ${x},${y}`);
}

test('mina de ferro → esteira → Sede completa o primeiro marco', () => {
  const g = lab({ unlockAll: false });
  g.coins = 60;
  g.ore[idx(C - 8, C)] = 'ferro';
  assert.ok(g.place('mina', C - 8, C, 0));
  beltX(g, C - 7, C - 2, C);
  const before = g.coins;
  run(g, 20);
  assert.ok(g.delivered.minerio_ferro >= 10, 'entregou ferro');
  assert.equal(g.goal, 1, 'marco 1 concluído');
  assert.ok(g.unlocked.has('fornalha'), 'liberou a fornalha');
  assert.ok(g.coins > before + 50, 'pagou a recompensa e as entregas');
  assert.ok(g.ev.some((e) => e.t === 'goal'));
});

test('fornalha escolhe a receita sozinha e manda barras para a Sede', () => {
  const g = lab();
  g.ore[idx(C - 9, C)] = 'ferro';
  g.place('mina', C - 9, C, 0);
  g.place('esteira', C - 8, C, 0);
  const f = g.place('fornalha', C - 7, C, 0);
  beltX(g, C - 6, C - 2, C);
  run(g, 15);
  assert.equal(f.recipe, 'barra_ferro');
  assert.ok(g.delivered.barra_ferro > 5, `barras: ${g.delivered.barra_ferro}`);
  assert.ok(!g.delivered.minerio_ferro, 'minério não passou direto');
});

test('máquina não aceita item de outra receita e mostra falta de insumo', () => {
  const g = lab({ era: 3 });
  const m = g.place('montadora', 5, 5, 0);
  assert.ok(g.accept(m, 'engrenagem', 0));
  assert.equal(m.recipe, 'motor');
  assert.equal(g.accept(m, 'fio', 0), false, 'fio não entra na receita do motor');
  assert.equal(g.accept(m, 'chapa', 2), false, 'não entra pela frente (saída)');
  g.step(0.05);
  assert.equal(m.st, 'noinput');
});

test('divisor alterna entre as saídas livres', () => {
  const g = lab();
  g.ore[idx(10, 10)] = 'ferro';
  g.place('mina', 10, 10, 0);
  g.place('divisor', 11, 10, 0);
  const up = g.place('esteira', 11, 9, 3);
  const dn = g.place('esteira', 11, 11, 1);
  const fw = g.place('esteira', 12, 10, 0);
  run(g, 8);
  const got = [up, dn, fw].map((b) => b.items.length);
  assert.ok(got.every((n) => n >= 1), `todas receberam: ${got}`);
});

test('cruzamento deixa dois fluxos se cruzarem', () => {
  const g = lab();
  g.ore[idx(C - 10, C)] = 'ferro';
  g.ore[idx(C - 6, C - 5)] = 'cobre';
  g.place('mina', C - 10, C, 0);
  beltX(g, C - 9, C - 7, C);
  g.place('cruzamento', C - 6, C, 0);
  beltX(g, C - 5, C - 2, C);                    // ferro segue para a Sede
  g.place('mina', C - 6, C - 5, 1);
  beltY(g, C - 6, C - 4, C - 1);                // cobre desce pelo cruzamento
  const sink = g.place('esteira', C - 6, C + 1, 1);
  g.place('esteira', C - 6, C + 2, 0);
  run(g, 20);
  assert.ok(g.delivered.minerio_ferro > 3, 'ferro chegou na Sede');
  assert.ok(!g.delivered.minerio_cobre, 'cobre não desviou para a Sede');
  assert.ok(sink.items.length + g.entAt(C - 6, C + 2).items.length > 0, 'cobre atravessou');
});

test('energia: sem gerador as máquinas desaceleram; com carvão voltam ao normal', () => {
  const g = lab({ era: 2 });
  for (let i = 0; i < 12; i++) { g.ore[idx(2 + i * 2, 2)] = 'ferro'; g.place('mina', 2 + i * 2, 2, 1); }
  g.step(0.05);
  assert.ok(g.power.demand > g.power.supply, `demanda ${g.power.demand} > oferta ${g.power.supply}`);
  assert.ok(g.power.ratio < 1);
  const gen = g.place('gerador', 30, 30, 0);
  for (let i = 0; i < 5; i++) assert.ok(g.accept(gen, 'carvao', 0));
  assert.equal(g.accept(gen, 'barra_ferro', 0), false);
  g.step(0.05);
  assert.equal(g.power.ratio, 1);
  assert.ok(gen.fuel < 5, 'queimou carvão');
});

test('era 1 não tem energia; a partir da era 2 a rede base cobre uma fábrica pequena', () => {
  const g = lab({ era: 1 });
  for (let i = 0; i < 6; i++) { g.ore[idx(2 + i * 2, 2)] = 'ferro'; g.place('mina', 2 + i * 2, 2, 1); }
  g.step(0.05);
  assert.equal(g.power.ratio, 1);
  g.era = 2;
  g.step(0.05);
  assert.equal(g.power.ratio, 1, '6 minas (12 MW) cabem nos 20 MW da rede base');
});

test('marcos avançam as eras, liberam máquinas e o foguete fecha o jogo', () => {
  const g = lab({ unlockAll: false });
  const pad = { kind: 'pad', type: 'plataforma', count: 0 };
  for (let e = 1; e <= MAX_ERA; e++) {
    assert.equal(g.era, e);
    for (const u of ERAS[e].unlock) assert.ok(g.unlocked.has(u), `${u} liberado na era ${e}`);
    ERAS[e].goals.forEach((goal, i) => {
      assert.equal(g.goal, i);
      for (const [it, n] of Object.entries(goal.need)) {
        for (let k = 0; k < n; k++) goal.at === 'pad' ? g.accept(pad, it, 0) : g.deliver(it, false);
      }
    });
  }
  assert.ok(g.won);
  assert.ok(g.ev.some((e) => e.t === 'victory'));
  assert.equal(g.ev.filter((e) => e.t === 'era').length, MAX_ERA - 1);
});

test('toda receita tem máquina liberada até a sua era e insumos alcançáveis', () => {
  const unlockedBy = {};
  ERAS.forEach((E, e) => {
    if (!E) return;
    E.unlock.forEach((m) => (unlockedBy[m] ??= e));
    E.goals.forEach((g) => (g.unlock || []).forEach((m) => (unlockedBy[m] ??= e)));
  });
  const oreEra = {};
  ERAS.forEach((E, e) => E && (E.ores || []).forEach((o) => (oreEra[ORES[o]] ??= e)));
  const itemEra = { ...oreEra };
  // repete até estabilizar: dentro da mesma era uma receita pode depender de outra
  for (let changed = true; changed;) {
    changed = false;
    for (const r of RECIPES) {
      const ready = Math.max(r.era, ...Object.keys(r.in).map((k) => itemEra[k] ?? 99));
      if (ready < (itemEra[r.out] ?? 99)) { itemEra[r.out] = ready; changed = true; }
    }
  }
  for (const r of RECIPES) {
    assert.ok(unlockedBy[r.m] <= r.era, `${r.m} liberada até a era ${r.era}`);
    for (const inp of Object.keys(r.in)) assert.ok(itemEra[inp] <= r.era, `${inp} existe na era ${r.era} (receita ${r.id})`);
  }
  ERAS.forEach((E, e) => E && E.goals.forEach((g) => Object.keys(g.need).forEach((it) =>
    assert.ok(itemEra[it] <= e, `${it} dá para produzir na era ${e}`))));
});

test('ilha: cada era mostra os minérios que ela pede, longe da Sede', () => {
  for (const seed of ['A', 'B', 'C', 'ZZZZ', '1234', 'FUNDICAO', 'X9', 'Q']) {
    const w = genWorld(seed);
    for (let e = 1; e <= MAX_ERA; e++) {
      for (const o of ERAS[e].ores || []) {
        let n = 0;
        for (let i = 0; i < N * N; i++) if (w.ore[i] === o && w.landEra[i] <= e) n++;
        assert.ok(n >= 5, `semente ${seed}: ${o} na era ${e} (${n} casas)`);
      }
    }
    for (let y = C - 2; y <= C + 2; y++) for (let x = C - 2; x <= C + 2; x++) {
      assert.equal(w.ore[idx(x, y)], null);
      assert.equal(w.landEra[idx(x, y)], 1);
    }
  }
});

test('salvar e carregar mantém a fábrica e o progresso', () => {
  const g = lab({ era: 2 });
  g.ore[idx(C - 9, C)] = 'ferro';
  g.place('mina', C - 9, C, 0);
  g.place('esteira', C - 8, C, 0);
  g.place('fornalha', C - 7, C, 0);
  beltX(g, C - 6, C - 2, C);
  run(g, 10);
  g.buyUpgrade('esteiras');
  const s = JSON.parse(JSON.stringify(g.serialize()));
  const h = Game.load(s);
  assert.equal(h.ents.size, g.ents.size);
  assert.equal(h.coins, g.coins);
  assert.equal(h.era, 2);
  assert.equal(h.up.esteiras, 1);
  assert.equal(h.entAt(C - 7, C).recipe, 'barra_ferro');
  assert.deepEqual(h.delivered, g.delivered);
});

test('remover devolve as moedas; não dá para remover a Sede nem construir na água', () => {
  const g = lab({ coins: 100 });
  g.place('fornalha', 3, 3, 0);
  assert.equal(g.coins, 70);
  assert.ok(g.remove(3, 3));
  assert.equal(g.coins, 100);
  assert.equal(g.remove(C, C), false);
  g.landEra[idx(4, 4)] = 99;
  assert.equal(g.canPlace('fornalha', 4, 4).why, 'water');
  assert.equal(g.canPlace('mina', 5, 5).why, 'needore');
});

test('dica aponta o próximo passo do começo do jogo', () => {
  const g = new Game('DICA');
  let h = g.hint();
  assert.equal(h.k, 'hint_mine');
  assert.ok(h.at, 'mostra onde fica o ferro');
  const [x, y] = h.at;
  assert.equal(g.oreAt(x, y), 'ferro');
  g.place('mina', x, y, 0);
  h = g.hint();
  assert.equal(h.k, 'hint_to_hub');
});
