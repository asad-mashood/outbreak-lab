#!/usr/bin/env node
/* Export the model's built-in data as JSON files in data/.
 *
 *   node tools/export-data.js
 *
 * These files are a readable copy of constants that live in the code
 * (js/model.js and js/mayor.js). The simulator does not read them; the code is
 * the source of truth. Run this again after changing the code.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const M = require(path.join(root, 'js', 'model.js'));
const C = require(path.join(root, 'js', 'mayor.js'));
const dir = path.join(root, 'data');
fs.mkdirSync(dir, { recursive: true });

const write = (name, about, data) => {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(Object.assign({ _about: about }, data), null, 2) + '\n');
  console.log('data/' + name);
};
/* keep plain values only: functions (for example an action's eff() rule) stay in the code */
const plain = (o, up = []) => {
  if (typeof o === 'function' || o === undefined) return undefined;
  if (o === null || typeof o !== 'object') return o;
  if (up.includes(o)) return undefined; // a link back to its own parent (bus stops point at their route)
  const next = up.concat([o]);
  if (Array.isArray(o) || ArrayBuffer.isView(o)) return Array.from(o, (v) => { const c = plain(v, next); return c === undefined ? null : c; });
  if (o instanceof Set) return Array.from(o);
  const out = {};
  for (const k of Object.keys(o)) { const c = plain(o[k], next); if (c !== undefined) out[k] = c; }
  return out;
};

write('default-params.json', 'Default value of every model setting (DEFAULT_PARAMS in js/model.js).', { params: M.DEFAULT_PARAMS });

write('city.json', 'The city layout and population constants from js/model.js.', {
  size: { cityW: M.CITY_W, cityH: M.CITY_H, worldW: M.WORLD_W, worldH: M.WORLD_H, block: M.BLOCK, cols: M.COLS, rows: M.ROWS },
  time: { ticksPerDay: M.TICKS_PER_DAY, ticksPerHour: M.TICKS_PER_HOUR, startMinute: M.START_MINUTE, dayNames: M.DAY_NAMES },
  roads: { roadX: M.ROAD_X, roadY: M.ROAD_Y, mainX: M.MAIN_X, mainY: M.MAIN_Y },
  cityPlan: plain(M.CITY_PLAN), placeNames: plain(M.PLACE_NAMES), placeRisk: plain(M.PLACE_RISK),
  ageGroups: plain(M.AGE_GROUPS), stateNames: plain(M.STATE_NAMES), seasons: plain(M.SEASONS),
  prayers: plain(M.PRAYERS), busRoutes: plain(M.BUS_ROUTES), kilnSites: plain(M.KILN_SITES),
});

write('scenarios.json', 'Benchmark stress scenarios (SCENARIOS in js/mayor.js). Each one is a patch over the default settings.', { scenarios: plain(C.SCENARIOS) });

write('controllers.json', 'The ways of running the city that the benchmark compares (CONTROLLERS in js/mayor.js).', { staticPack: plain(C.STATIC_PACK), controllers: plain(C.CONTROLLERS) });

write('agent-team.json', 'Configuration of the agent team (js/mayor.js): problem areas, goals, officers and timings.', {
  domains: C.DOM, labels: C.LABEL, goals: C.GOALS, burdenWeightMU: C.MU, tiers: C.TIERS,
  officers: plain(C.OFFICERS), departmentOf: plain(C.DEPT_OF), forecastHorizonMinutes: plain(C.HORIZON),
});

write('agent-actions.json', 'Every measure the agent team can propose (ACTIONS in js/mayor.js). "sets" is what changes in the city when you approve it; "burden" is the cost to people (0-1); "cool" is the minimum minutes before it is suggested again. The expected-effect rule eff() of each action is a function and stays in the code.', {
  count: C.ACTIONS.length, actions: plain(C.ACTIONS),
});
