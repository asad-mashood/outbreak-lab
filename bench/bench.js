#!/usr/bin/env node
/* Outbreak Lab benchmark: the Paper Lab experiment, run headless in Node.
 *
 *   node bench/bench.js [out.json] [seeds] [days] [controllers] [scenarios]
 *
 *   out.json     where to write the results        (default data/results.json)
 *   seeds        runs per scenario and controller   (default 5, first seed 201)
 *   days         simulated days per run             (default 3)
 *   controllers  comma list, or "all"               (default: the Paper Lab defaults)
 *   scenarios    comma list                         (default: epi,smog,grid,compound)
 *
 * It runs every scenario x controller x seed with the same code the browser
 * uses (js/model.js + js/econ.js + js/mayor.js) and writes one JSON file in
 * the format that js/paper.js and bench/make_paper.js read.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const C = require(path.join(root, 'js', 'mayor.js'));

const out = path.resolve(process.argv[2] || path.join(root, 'data', 'results.json'));
const K = Math.max(1, parseInt(process.argv[3], 10) || 5);
const days = Math.max(1, parseInt(process.argv[4], 10) || 3);
const PAPER_LAB_DEFAULTS = Object.keys(C.CONTROLLERS).filter((k) => !['consentF', 'mayor60', 'consentAsk'].includes(k));
const ctlArg = process.argv[5];
const ctls = !ctlArg ? PAPER_LAB_DEFAULTS : ctlArg === 'all' ? Object.keys(C.CONTROLLERS) : ctlArg.split(',');
const scs = process.argv[6] ? process.argv[6].split(',') : Object.keys(C.SCENARIOS);
for (const c of ctls) if (!C.CONTROLLERS[c]) throw new Error('Unknown controller: ' + c + '. Known: ' + Object.keys(C.CONTROLLERS).join(', '));
for (const s of scs) if (!C.SCENARIOS[s]) throw new Error('Unknown scenario: ' + s + '. Known: ' + Object.keys(C.SCENARIOS).join(', '));

const S0 = 201;
const seeds = Array.from({ length: K }, (_, i) => S0 + i);
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'js', f))).digest('hex').slice(0, 12);

const jobs = [];
for (const seed of seeds) for (const sc of scs) for (const c of ctls) jobs.push({ seed, sc, c });

const rows = [];
const t0 = Date.now();
jobs.forEach((j, i) => {
  const base = Object.assign({}, C.DEFAULT_PARAMS, C.SCENARIOS[j.sc].patch);
  const r = C.runSync(base, days, { controller: j.c, seed: j.seed, goal: 'balanced' });
  rows.push(Object.assign({ scenario: j.sc, controller: j.c, seed: j.seed, days }, r));
  const el = (Date.now() - t0) / 1000;
  process.stderr.write(`\r${i + 1}/${jobs.length}  ${j.sc} / ${j.c} / seed ${j.seed}  (${el.toFixed(0)} s)        `);
});
process.stderr.write('\n');

const scenarios = {}; for (const k of scs) scenarios[k] = C.SCENARIOS[k];
const controllers = {}; for (const k of ctls) controllers[k] = C.CONTROLLERS[k].name;
const res = {
  meta: {
    tool: 'Outbreak Lab', version: 'v17', date: new Date().toISOString(),
    seeds: K, seedList: seeds, days, goal: 'balanced', MU: C.MU, node: process.version,
    files: { 'model.js': hash('model.js'), 'econ.js': hash('econ.js'), 'mayor.js': hash('mayor.js') },
    scenarios, controllers, population: C.DEFAULT_PARAMS.population,
    wallSeconds: Math.round((Date.now() - t0) / 1000),
  },
  rows,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log(`Wrote ${rows.length} runs to ${path.relative(process.cwd(), out)} in ${res.meta.wallSeconds} s.`);
