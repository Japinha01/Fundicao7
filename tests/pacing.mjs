// Simula o ritmo do jogo: um jogador "médio" monta linhas de produção conforme
// tem dinheiro e mede quanto tempo cada era leva. node tests/pacing.mjs
import { ITEMS, MACHINES, RECIPES, ERAS, MAX_ERA, START_COINS, BASE_POWER } from '../src/data.js';

const MINE_T = { mina: 1.2, bomba: 1.0 };
const oreOf = { minerio_ferro: 'mina', minerio_cobre: 'mina', carvao: 'mina', areia: 'mina', petroleo: 'bomba', minerio_titanio: 'mina' };
const BELT_TILES = 14;                 // esteiras por linha (média)
const EFFICIENCY = 0.75;               // jogador real perde tempo com ajustes, esteiras bloqueadas etc.
const BUILD_SECONDS = 25;              // tempo para montar cada linha

// custo, energia e taxa (itens/s) de uma linha que produz `it`, com cada insumo alimentado na medida
function line(it, rate) {
  if (oreOf[it]) {
    const m = oreOf[it];
    const n = Math.ceil(rate * MINE_T[m] - 1e-9);
    return { cost: n * MACHINES[m].cost, pw: n * MACHINES[m].pw, parts: n };
  }
  const r = RECIPES.find((q) => q.out === it);
  const perMachine = r.q / r.t;
  const n = Math.ceil(rate / perMachine - 1e-9);
  let cost = n * MACHINES[r.m].cost, pw = n * (MACHINES[r.m].pw || 0), parts = n;
  for (const [k, q] of Object.entries(r.in)) {
    const sub = line(k, rate * q / r.q);
    cost += sub.cost; pw += sub.pw; parts += sub.parts;
  }
  return { cost, pw, parts };
}

let t = 0, coins = START_COINS, revenueRate = 0, power = 0;
const lines = {}; // item → itens/s entregues
const report = [];
for (let era = 1; era <= MAX_ERA; era++) {
  const t0 = t;
  for (const goal of ERAS[era].goals) {
    const left = { ...goal.need };
    while (Object.values(left).some((v) => v > 0)) {
      // compra uma linha nova do item mais atrasado, se couber no bolso
      const it = Object.keys(left).filter((k) => left[k] > 0).sort((a, b) => (lines[a] || 0) - (lines[b] || 0))[0];
      const base = oreOf[it] ? 1 / MINE_T[oreOf[it]] : (() => { const r = RECIPES.find((q) => q.out === it); return r.q / r.t; })();
      const L = line(it, base);
      const powerCost = era >= 2 ? Math.max(0, power + L.pw - BASE_POWER) > 0 ? Math.ceil(L.pw / 25) * (MACHINES.gerador.cost + MACHINES.mina.cost) : 0 : 0;
      const price = L.cost + powerCost + L.parts * BELT_TILES * MACHINES.esteira.cost / 2;
      const maxLines = 4;
      if (coins >= price && (lines[it] || 0) < base * maxLines) {
        coins -= price;
        t += BUILD_SECONDS;
        lines[it] = (lines[it] || 0) + base * EFFICIENCY;
        power += L.pw;
        revenueRate += base * EFFICIENCY * ITEMS[it].price;
        continue;
      }
      // espera 5 s produzindo
      const dt = 5;
      t += dt;
      coins += revenueRate * dt;
      for (const k of Object.keys(left)) left[k] -= (lines[k] || 0) * dt;
    }
    coins += goal.reward;
  }
  report.push({ era, minutos: +((t - t0) / 60).toFixed(1), total: +(t / 60).toFixed(1), moedas: Math.round(coins) });
}
console.table(report);
