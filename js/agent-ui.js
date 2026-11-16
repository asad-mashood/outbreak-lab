/* =====================================================================
   OUTBREAK LAB v16: AGENT TEAM TAB (interface) + CITY CSV
   The thinking lives in mayor.js (window.OLCore). This file wires it to
   the page: live watch, proposals with alternatives, deny list, your own
   ideas, experiments, and the CSV city loader / calibration.
   ===================================================================== */
(function () {
  'use strict';
  const C = window.OLCore;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fx = (v, d) => (v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(d == null ? 0 : d));
  const pc = (v) => Math.round(v * 100);
  const { DOM: KEYS, LABEL, ACT, Mayor, runAsync, burdenOf, parseIdea, critique, dayClock } = C;
  const TIER_COL = { emergency: 'danger', high: 'warn', normal: 'accent', low: 'muted', none: 'muted' };
  const job = { cancel: false, busy: false };
  /* raw world run (used by calibration) */
  function runWorld(params, days, onHour, progress) {
    return new Promise((resolve) => {
      const w = new World(Object.assign({}, params)), total = days * 1440;
      let t = 0;
      (function slice() {
        const end = Math.min(total, t + 240);
        for (; t < end; t++) { w.step(); if (w.tick % 60 === 0 && onHour) onHour(w); }
        if (progress) progress(t / total);
        if (job.cancel) return resolve(null);
        if (t >= total) resolve({ w }); else setTimeout(slice, 0);
      })();
    });
  }
  const POLICIES = {
    masks: ['Masks 70%', { masks: 70 }],
    testmask: ['Test and isolate + masks 50%', { quarantine: true, masks: 50 }],
    schoolwfh: ['Schools closed + 40% work from home', { schoolsOpen: false, distancing: 40 }],
    lockdown: ['Light lockdown (60% home, no gatherings, no schools)', { distancing: 60, gatheringsOpen: false, schoolsOpen: false }],
    clean: ['Clean air pack (clean kilns, construction ban, dust control)', { cleanKilns: true, constructionAqiBan: true, dustControl: true }],
    roads: ['Safe roads (30 km/h, 8 police, cameras)', { speedLimit: 30, trafficPolice: 8, challanCameras: 8 }],
    power: ['Power saver (demand response 30%, adaptive lights, water 85%)', { demandResponse: 30, streetlights: 'adaptive', waterPerCapita: 85 }],
  };
  const GOAL_POLICIES = { lives: ['masks', 'testmask', 'schoolwfh', 'lockdown'], air: ['clean', 'power'], infra: ['power', 'roads', 'clean'], balanced: ['masks', 'testmask', 'clean', 'roads', 'power'] };
  const copyText = (text, app) => {
    const done = () => app && app.toast && app.toast('Copied to the clipboard.');
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, () => fallback()); return; } } catch (e) { /* fall through */ }
    fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { app && app.toast && app.toast('Could not copy. Select the text and copy it yourself.'); } document.body.removeChild(ta); }
  };

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
    const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim())); row = []; }
      else cur += ch;
    }
    row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim()));
    return rows;
  }
  const norm = (s) => String(s).toLowerCase().replace(/%/g, 'pct').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const num = (s) => { const v = parseFloat(String(s).replace(/,/g, '').replace(/%/g, '')); return Number.isFinite(v) && /\d/.test(String(s)) ? v : NaN; };
  const truthy = (s) => /^(1|true|yes|y|on)$/i.test(String(s).trim());
  /* alias list: [names], model setting, converter */
  const ALIASES = [
    [['population', 'pop', 'city_population', 'inhabitants'], '@population'],
    [['hospital_beds_per_1000', 'beds_per_1000', 'hospital_beds_per_1000_people'], '@beds'],
    [['hospital_beds', 'beds'], 'hospitalBeds'],
    [['kilns', 'brick_kilns', 'number_of_kilns'], 'kilns'],
    [['zigzag_share_pct', 'zigzag_pct', 'zigzag_share'], 'zigzagShare'],
    [['avg_temp_c', 'mean_temp_c', 'temperature_c', 'average_temperature', 'avg_temperature', 'mean_temperature'], 'baseTemp'],
    [['rainy_days_pct', 'rain_days_pct', 'rainy_days_percent'], 'rainChance'],
    [['foggy_mornings_pct', 'fog_days_pct', 'foggy_days_pct'], 'fogChance'],
    [['smokers_pct', 'smoking_rate', 'smokers'], 'smokers'],
    [['gym_goers_pct', 'gym_pct'], 'gymGoers'],
    [['vaccinated_pct', 'vaccination_rate', 'vaccinated'], 'vaccinated'],
    [['mask_pct', 'masks_pct', 'mask_wearing_pct'], 'masks'],
    [['flights_per_day', 'flights'], 'flightsPerDay'],
    [['buses_per_hour'], 'busesPerHour'],
    [['speed_limit_kmh', 'speed_limit'], 'speedLimit'],
    [['traffic_police', 'traffic_officers'], 'trafficPolice'],
    [['ambulances'], 'ambulances'],
    [['solar_kw', 'solar_capacity_kw'], 'solarKw'],
    [['battery_kwh'], 'batteryKwh'],
    [['grid_capacity_kw', 'grid_kw'], 'gridCapacity'],
    [['electricity_price', 'tariff_per_kwh', 'price_per_kwh'], 'electricityPrice'],
    [['fuel_price', 'petrol_price', 'fuel_price_per_litre'], 'fuelPrice'],
    [['wifi_aps', 'wifi_access_points'], 'wifiAps'],
    [['diabetes_pct', 'diabetic_pct'], 'diabeticShare'],
    [['hypertension_pct', 'high_blood_pressure_pct'], 'hypertensionShare'],
    [['asthma_pct'], 'asthmaShare'],
    [['road_danger_pct', 'accident_risk_pct'], 'roadDanger'],
    [['factory_smoke_pct'], 'factorySmoke'],
    [['traffic_smoke_pct'], 'trafficSmoke'],
    [['heatwave'], 'heatwave'],
    [['season', 'start_season'], 'startSeason'],
    [['avg_aqi', 'mean_aqi', 'average_aqi', 'aqi'], '@aqi'],
  ];
  const ALIAS = Object.create(null); for (const [names, key] of ALIASES) for (const n of names) ALIAS[n] = key;
  const SERIES = Object.assign(Object.create(null), { aqi: 'aqi', temp_c: 'temp', temperature: 'temp', temp: 'temp', infectious_pct: 'inf', infected_pct: 'inf', active_cases_pct: 'inf', power_kw: 'power', electricity_kw: 'power', demand_kw: 'power' });
  const SERIES_LABEL = { aqi: 'Air quality index', temp: 'Temperature (°C)', inf: 'Infectious people (% of population)', power: 'Power demand (kW, city scale)' };
  function mapProfile(pairs, base, paramInfo) {
    const out = [], changes = {}, targets = {};
    for (const [rawKey, rawVal] of pairs) {
      const key = ALIAS[norm(rawKey)];
      if (!key) { out.push([rawKey, '–', '–', 'not recognised, ignored']); continue; }
      if (key === '@aqi') { const v = num(rawVal); if (!Number.isNaN(v)) { targets.aqi = v; out.push([rawKey, 'calibration target', fx(v), 'used by Auto-calibrate']); } continue; }
      if (key === '@population') {
        const v = num(rawVal); if (Number.isNaN(v) || v <= 0) { out.push([rawKey, 'population', '–', 'not a number']); continue; }
        if (v <= 1000) { changes.population = Math.round(v / 50) * 50 || 100; changes.realCityScale = 1; out.push([rawKey, 'Population', changes.population, v === changes.population ? '' : 'rounded to the slider step']); }
        else { changes.population = 500; changes.realCityScale = clamp(Math.round(v / 500), 1, 50000); out.push([rawKey, 'Population + Real-world scale', `500 × ${changes.realCityScale.toLocaleString()}`, 'the model simulates a representative 500-person slice and scales its resource needs up']); }
        continue;
      }
      if (key === '@beds') { const v = num(rawVal), n = changes.population || base.population; if (Number.isNaN(v)) continue; const pi = paramInfo.hospitalBeds; const raw = Math.round(v * n / 1000); changes.hospitalBeds = clamp(raw, pi ? pi.min : 1, pi ? pi.max : 40); out.push([rawKey, 'Hospital beds', changes.hospitalBeds, `${v} per 1000 × ${n} simulated people = ${raw}${raw !== changes.hospitalBeds ? ', limited to the model range' : ''}`]); continue; }
      const pi = paramInfo[key]; if (!pi) { out.push([rawKey, key, '–', 'setting not available']); continue; }
      let v;
      if (pi.type === 'toggle') v = truthy(rawVal);
      else if (pi.type === 'select') { v = String(rawVal).trim().toLowerCase(); if (!pi.options.some((o) => o[0] === v)) { out.push([rawKey, pi.label, '–', `allowed: ${pi.options.map((o) => o[0]).join(', ')}`]); continue; } }
      else {
        v = num(rawVal); if (Number.isNaN(v)) { out.push([rawKey, pi.label, '–', 'not a number']); continue; }
        let note = '';
        if (pi.max <= 100 && v > 0 && v <= 1 && /share|rate|ratio|frac/.test(norm(rawKey))) { v *= 100; note = 'fraction converted to %; '; }
        const c = clamp(v, pi.min, pi.max), r = pi.step ? Math.round(c / pi.step) * pi.step : c;
        if (c !== v) note += `limited to the model range ${pi.min}–${pi.max}; `; else if (r !== c) note += 'rounded to the slider step; ';
        v = Math.round(r * 1000) / 1000; out.push([rawKey, pi.label, pi.fmt ? pi.fmt(v).replace(/<[^>]+>/g, '') : v, note.replace(/; $/, '')]); changes[key] = v; continue;
      }
      changes[key] = v; out.push([rawKey, pi.label, String(v), '']);
    }
    return { rows: out, changes, targets };
  }
  function classify(rows) {
    if (rows.length < 2) return { kind: 'bad' };
    const head = rows[0].map(norm);
    const ki = head.findIndex((h) => /^(parameter|name|metric|field|setting|key|variable)$/.test(h)), vi = head.findIndex((h) => /^(value|val|amount)$/.test(h));
    if (ki >= 0 && vi >= 0) return { kind: 'profile', pairs: rows.slice(1).map((r) => [r[ki], r[vi]]).filter((p) => p[0]) };
    const timeCol = head.findIndex((h) => /^(day|date|time|datetime|timestamp|hour)$/.test(h));
    const serCols = head.map((h, i) => (SERIES[h] ? i : -1)).filter((i) => i >= 0 && i !== timeCol);
    if (serCols.length && rows.length > 2) return { kind: 'series', head, timeCol, serCols, rows: rows.slice(1) };
    if (rows.length === 2 && rows[0].length >= 2) return { kind: 'profile', pairs: rows[0].map((h, i) => [h, rows[1][i]]).filter((p) => p[0]) };
    if (rows[0].length === 2 && Number.isNaN(num(rows[0][0]))) return { kind: 'profile', pairs: rows.filter((r) => r[0]).map((r) => [r[0], r[1]]) };
    if (timeCol >= 0 || head.length > 1) return { kind: 'series', head, timeCol, serCols, rows: rows.slice(1) };
    return { kind: 'bad' };
  }
  function seriesFrom(c) {
    const out = {};
    let t0 = null;
    const idx = (s, i) => {
      if (c.timeCol < 0) return i;
      const raw = s[c.timeCol], n = num(raw);
      if (!Number.isNaN(n) && !/[-/]/.test(raw)) return n;
      const d = Date.parse(raw); if (Number.isNaN(d)) return i; if (t0 == null) t0 = d; return Math.round((d - t0) / 86400000);
    };
    let first = null;
    c.rows.forEach((r, i) => {
      let d = idx(r, i); if (first == null) first = d; d -= first;
      for (const ci of c.serCols) { const v = num(r[ci]); if (Number.isNaN(v)) continue; const key = SERIES[c.head[ci]]; (out[key] = out[key] || {})[d] = v; }
    });
    return out;
  }
  function modelDaily(w, key) {
    const h = w.history, byDay = {}, N = Math.max(1, w.params.population), scale = Math.max(1, w.params.realCityScale || 1);
    for (let i = 0; i < h.t.length; i++) {
      const d = Math.floor(h.t[i]); let v;
      if (key === 'aqi') v = h.AQI[i]; else if (key === 'temp') v = h.TEMP[i]; else if (key === 'inf') v = (h.I[i] / N) * 100; else if (key === 'power') v = h.KW[i] * scale; else continue;
      if (v == null) continue; (byDay[d] = byDay[d] || []).push(v);
    }
    const out = {}; for (const d in byDay) out[d] = byDay[d].reduce((a, b) => a + b, 0) / byDay[d].length; return out;
  }
  function compare(obs, mod) {
    const days = Object.keys(obs).map(Number).filter((d) => mod[d] != null).sort((a, b) => a - b);
    if (!days.length) return null;
    const O = days.map((d) => obs[d]), M = days.map((d) => mod[d]), n = days.length;
    const mae = O.reduce((s, v, i) => s + Math.abs(v - M[i]), 0) / n, bias = M.reduce((s, v, i) => s + (v - O[i]), 0) / n;
    const mo = O.reduce((a, b) => a + b, 0) / n, mm = M.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (O[i] - mo) * (M[i] - mm); sxx += (O[i] - mo) ** 2; syy += (M[i] - mm) ** 2; }
    return { days, O, M, n, mae, bias, r: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null };
  }
  const SAMPLE_PROFILE = `parameter,value
population,450000
hospital_beds_per_1000,1.2
kilns,6
zigzag_share_pct,15
avg_temp_c,24
rainy_days_pct,25
foggy_mornings_pct,35
smokers_pct,22
flights_per_day,4
buses_per_hour,3
speed_limit_kmh,50
avg_aqi,190`;
  const SAMPLE_SERIES = (() => { const rows = ['day,aqi,temp_c']; const aqi = [168, 181, 195, 188, 176, 201, 210, 186], tmp = [23.5, 24.1, 24.8, 23.9, 22.7, 24.4, 25.0, 24.2]; for (let i = 0; i < 8; i++) rows.push(`${i + 1},${aqi[i]},${tmp[i]}`); return rows.join('\n'); })();
  const TEMPLATE = `# City profile (use either style). Any column you leave out keeps its current model value.
parameter,value
population,450000
hospital_beds_per_1000,1.2
kilns,6
avg_temp_c,24
rainy_days_pct,25
foggy_mornings_pct,35
smokers_pct,22
flights_per_day,4
avg_aqi,190

# Observed series (a different file): day or date, then any of aqi, temp_c, infectious_pct, power_kw
day,aqi,temp_c
1,168,23.5
2,181,24.1
3,195,24.8`;


  /* ---------- UI + wiring ---------- */
  const MAX_CSV = 2000000, MAX_ROWS = 20000, MAX_FILE = 2 * 1024 * 1024;
  /* a CSV cell that spreadsheet programs will not run as a formula */
  const cell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  function boot() {
    const app = window.outbreakLab; if (!app || !$('#tab-agent') || !C) return;
    const ALL = window.__OL_PARAMS || [], info = {}; for (const it of ALL) info[it.key] = it;
    /* who is writing a setting right now? the auditor needs to know */
    let writer = null;
    const apply = (k, v) => { const was = writer; writer = writer || 'agent'; try { app.setParam(k, v); try { app.syncParamInputs(); } catch (e) { /* ignore */ } } finally { writer = was; } };
    let lastToast = 0;
    const mayor = new Mayor({ goal: 'balanced', autonomy: 'ask', every: 15, denyDays: 2, forecast: true, apply, audit: (t) => app.auditAdd && app.auditAdd(t), lessons: C.loadLessons(),
      notify: (kind, text) => { if ((kind === 'emergency' || kind === 'alarm') && Date.now() - lastToast > 5000) { lastToast = Date.now(); try { app.toast(text); } catch (e) { /* ignore */ } } } });
    window.outbreakAgent = mayor;
    const state = { city: null, series: null, lastTest: null, bestPolicy: null, idea: null, filter: 'all', confirm: null, sig: {}, undo: [], calib: null, unexplained: 0, audits: 0, exitAuto: true };

    /* ----- the auditor: every write is recorded with who made it ----- */
    const writes = [];
    const sp = app.setParam.bind(app);
    app.setParam = (k, v) => {
      const by = writer || 'you', before = app.params[k]; sp(k, v);
      if (app.params[k] !== before) { writes.push({ t: app.world.tick, k, by }); if (writes.length > 1000) writes.shift(); if (by === 'you') mayor.noteUser(k, app.params[k], app.world.tick); }
    };
    let audSnap = Object.assign({}, app.world.params), audT = app.world.tick;
    function auditor() {
      const cur = app.world.params, odd = [];
      for (const k of Object.keys(cur)) if (cur[k] !== audSnap[k] && !(typeof cur[k] === 'number' && Number.isNaN(cur[k]) && Number.isNaN(audSnap[k]))) {
        if (!writes.some((x) => x.k === k && x.t >= audT)) odd.push(`${k}: ${audSnap[k]} → ${cur[k]}`);
      }
      state.audits++;
      if (odd.length) { state.unexplained += odd.length; mayor.led('unexplained change', null, odd.join('; ')); mayor.say('alarm', `Auditor: ${odd.length} change${odd.length === 1 ? '' : 's'} without a recorded reason: ${odd.join('; ')}`, app.world.tick); }
      audSnap = Object.assign({}, cur); audT = app.world.tick;
    }

    const origStep = app.stepWorld.bind(app);
    app.stepWorld = function () { origStep(); mayor.step(app.world); if (app.world.tick % 60 === 0) auditor(); };
    const origReset = app.afterReset.bind(app);
    app.afterReset = function () { const fresh = !mayor.ledger.length && !mayor.on; origReset(); mayor.clear(); if (fresh) { mayor.ledger = []; mayor.epoch = 0; } audSnap = Object.assign({}, app.world.params); audT = app.world.tick; state.sig = {}; };
    // the forecaster works in small slices so the page never freezes
    setInterval(() => { if (mayor.on && mayor.forecast && mayor.fq.length) { try { mayor.pumpForecasts(app.world, 60); } catch (e) { mayor.fault(app.world, e); } } }, 200);

    const bindSel = (id, fn) => $(id).addEventListener('change', (e) => fn(e.target.value));
    bindSel('#agGoal', (v) => { const g = mayor.setGoal(v); mayor.say('plan', `Goal changed to "${g}".`, app.world.tick); mayor.lastDelib = -1e9; });
    bindSel('#agAuto', (v) => { if (!mayor.setAutonomy(v)) { $('#agAuto').value = mayor.autonomy; result(false, 'That mode is not available: this agent always asks you first.'); } mayor.say('plan', `Mode: ${mayor.autonomy === 'advise' ? 'advise only' : 'ask before every action'}.`, app.world.tick); });
    bindSel('#agEvery', (v) => { mayor.setEvery(v); });
    bindSel('#agDeny', (v) => { mayor.setDenyDays(v); });
    bindSel('#agLogFilter', (v) => { state.filter = v; render(true); });
    $('#agFc').addEventListener('change', (e) => { mayor.forecast = !!e.target.checked && typeof World.prototype.fork === 'function'; if (!mayor.forecast) mayor.fq = []; });
    $('#agToggle').addEventListener('click', () => {
      if (!mayor.on) { mayor.on = true; mayor.lastDelib = -1e9; mayor.say('plan', `Agent team switched on. Goal: ${mayor.goal}. Mode: ${mayor.autonomy === 'advise' ? 'advise only' : 'ask before every action'}. Planning every ${mayor.every} min, alarms on, forecaster ${mayor.forecast ? 'on' : 'off'}.`, app.world.tick); if (!app.playing) app.toast('Agents are on. Press Start on the Simulation tab so time passes.'); }
      else mayor.stop(app.world, 'switched off by you');
      render(true);
    });
    const ex = $('#agExitAuto'); if (ex) { try { const v = localStorage.getItem('ol_exit_auto'); if (v === '0') { state.exitAuto = false; ex.checked = false; } } catch (e) { /* storage may be unavailable */ } ex.addEventListener('change', (e) => { state.exitAuto = !!e.target.checked; try { localStorage.setItem('ol_exit_auto', state.exitAuto ? '1' : '0'); } catch (er) { /* ignore */ } render(true); }); }
    $('#agForget').addEventListener('click', () => { mayor.lessons = {}; mayor.saveLessons(); render(true); app.toast('Lessons forgotten.'); });
    function result(ok, msg) { const el = $('#agResult'); el.textContent = msg || ''; el.className = 'ag-result ' + (ok ? 'ok' : 'no'); }
    const needsRole = () => (app.role === 'viewer' ? 'Your role is Viewer (read only): ask an Operator or Admin to decide.' : '');

    /* ----- decisions: every click goes through the agent's checks ----- */
    $('#agPending').addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return; const k = b.dataset.k, o = b.dataset.o, r = Number(b.dataset.r), a = b.dataset.a, w = app.world;
      // after a decision the list re-draws; a fast second click must not land on the NEXT proposal
      if (e.detail > 1 || Date.now() < (state.lockUntil || 0)) { return; }
      state.lockUntil = Date.now() + 800;
      const role = needsRole(); if (role && a !== 'cancel') { result(false, role); app.auditAdd && app.auditAdd('DENIED: agent decision by a viewer'); return; }
      let res = null;
      if (a === 'ok') { res = mayor.approve(w, k, o, r, undefined, state.exitAuto); if (res.needConfirm) { state.confirm = { k, o, r, until: Date.now() + 15000 }; result(false, res.msg + ' Press Confirm to go ahead.'); render(true); return; } }
      else if (a === 'confirm') { const c = state.confirm; state.confirm = null; if (!c || c.k !== k || c.o !== o || c.r !== r || Date.now() > c.until) { result(false, 'The confirmation expired. Press Approve again.'); render(true); return; } res = mayor.approve(w, k, o, r, true, state.exitAuto); }
      else if (a === 'cancel') { state.confirm = null; result(true, 'Nothing was changed.'); render(true); return; }
      else if (a === 'no') res = mayor.refuse(w, k, o, r);
      else if (a === 'never') { res = mayor.refuse(w, k, o, r, 'never'); if (res.ok) { const e = mayor.never[o]; res = { ok: true, msg: `Never offered again (not even in an emergency): ${e ? e.label : o}. You can allow it again from the list below.` }; } }
      else if (a === 'all') res = mayor.refuse(w, k, null, r);
      else if (a === 'keep') res = mayor.refuse(w, k, null, r);
      if (res) result(res.ok, res.msg);
      state.confirm = null; render(true);
    });
    $('#agDenyList').addEventListener('click', (e) => { const b = e.target.closest('[data-allow]'); if (!b) return; const res = mayor.allow(app.world, b.dataset.allow); result(res.ok, res.msg); render(true); });
    $('#agMeasures').addEventListener('click', (e) => {
      const b = e.target.closest('[data-undo]'); if (!b) return; const uid = Number(b.dataset.undo);
      if (e.detail > 1 || Date.now() < (state.lockUntil || 0)) return; state.lockUntil = Date.now() + 800;
      const role = needsRole(); if (role) { result(false, role); return; }
      if (b.dataset.c !== '1') { state.confirm = { k: 'undo:' + uid, until: Date.now() + 15000 }; render(true); result(false, 'Press "Confirm undo" to restore the earlier setting.'); return; }
      const c = state.confirm; state.confirm = null; if (!c || c.k !== 'undo:' + uid || Date.now() > c.until) { result(false, 'The confirmation expired.'); render(true); return; }
      const m0 = mayor.measures.find((y) => y.uid === uid), res = mayor.undo(app.world, uid);
      result(res.ok, res.ok ? `Undone: ${m0 ? m0.label : 'the measure'}. The earlier setting is back${/Left alone/.test(res.msg) ? ', except what you changed since' : ''}.` : res.msg); render(true);
    });
    const csvOf = (rows) => rows.map((r) => r.map(cell).join(',')).join('\n');
    $('#agLogCsv').addEventListener('click', () => copyText(csvOf([['time', 'kind', 'text']].concat(mayor.log.slice().reverse().map((l) => [l.t != null ? dayClock(l.t) : '', l.kind, l.text]))), app));
    $('#agLedCsv').addEventListener('click', () => copyText(csvOf([['n', 'run', 'time', 'decision', 'id', 'what', 'area', 'details']].concat(mayor.ledger.slice().reverse().map((e) => [e.n, e.run, e.clock, e.what, e.id, e.label, e.domain, e.detail]))), app));

    /* ----- rendering ----- */
    function lineChart(cv, series, opt) {
      if (!cv) return; const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, H = cv.clientHeight || 110;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const all = series.flatMap((s) => s.data.filter((v) => v != null && Number.isFinite(v))); if (!all.length) { ctx.fillStyle = '#7c8896'; ctx.font = '11px monospace'; ctx.fillText('waiting for data', 6, 14); return; }
      let lo = opt.min != null ? opt.min : Math.min.apply(null, all), hi = opt.max != null ? opt.max : Math.max.apply(null, all); if (hi - lo < 1e-6) hi = lo + 1;
      const n = Math.max.apply(null, series.map((s) => s.data.length)), X = (i) => 3 + (i / Math.max(1, n - 1)) * (W - 6), Y = (v) => H - 4 - ((v - lo) / (hi - lo)) * (H - 10);
      for (const s of series) { ctx.strokeStyle = s.color; ctx.lineWidth = 1.6; ctx.setLineDash(s.dash || []); ctx.beginPath(); let pen = false; s.data.forEach((v, i) => { if (v == null || !Number.isFinite(v)) { pen = false; return; } if (pen) ctx.lineTo(X(i), Y(v)); else { ctx.moveTo(X(i), Y(v)); pen = true; } }); ctx.stroke(); ctx.setLineDash([]); }
      if (opt.marks) for (const m of opt.marks) { ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(X(m.i), Y(m.v), 3, 0, 6.283); ctx.fill(); }
      ctx.fillStyle = '#7c8896'; ctx.font = '10px monospace'; ctx.fillText(fx(hi, opt.d || 0), 4, 10); ctx.fillText(fx(lo, opt.d || 0), 4, H - 3);
    }
    const arrow = (s) => (s > 0.004 ? '▲' : s < -0.004 ? '▼' : '■');
    /* only rebuild a block when its content changed, so a button never disappears under the mouse */
    const put = (id, html, force) => { if (force || state.sig[id] !== html) { state.sig[id] = html; $(id).innerHTML = html; } };
    const chips = (x) => `${x.big ? ' <span class="chip mono">big decision</span>' : ''}${x.standing ? ' <span class="chip mono">standing rule</span>' : ''}${x.hard ? ' <span class="chip mono">hard to undo</span>' : ''}${x.pkg ? ' <span class="chip mono" style="color:var(--accent)">package</span>' : ''}${x.cost && x.cost.level !== 'fine' ? ` <span class="chip mono" style="color:var(--${x.cost.level === 'tight' ? 'warn' : 'danger'})">${x.cost.level === 'nofunds' ? 'no funds' : x.cost.level === 'over' ? 'over budget' : 'budget tight'}</span>` : ''}${x.reraise ? ' <span class="chip mono" style="color:var(--danger)">re-raised: emergency</span>' : ''}`;
    const fcLine = (q, x) => {
      if (!mayor.forecast || q.kind !== 'act') return '';
      if (x.fc) { const f = x.fc; return `<div class="ag-fc">Forecaster, next ${Math.round(f.h / 60)} h in a copy of the city: harm ${f.dJ >= 0 ? '−' : '+'}${fx(Math.abs(f.dJ) * 100, 1)}, burden ${f.dB >= 0 ? '+' : '−'}${fx(Math.abs(f.dB) * 100, 1)} → net <b style="color:var(--${f.dC > 0.002 ? 'ok' : f.dC < -0.002 ? 'danger' : 'muted'})">${f.dC >= 0 ? '+' : '−'}${fx(Math.abs(f.dC) * 100, 1)}</b> points${q.domain === 'health' ? ' <small>(health measures work over days; one day mostly shows their cost, not yet their benefit)</small>' : ''}</div>`; }
      const qd = mayor.fq.some((j) => j.key === q.key) && q.options.indexOf(x) < mayor.forecastTop && C.ACT[x.id] && C.ACT[x.id].sets; return qd ? '<div class="ag-fc">Forecaster: trying it on a copy of the city…</div>' : '';
    };
    const revNotes = (x) => (x.review && x.review.notes.length ? `<ul class="ag-rev">${x.review.notes.map((n) => `<li class="${n.type}">${n.type === 'caution' ? '⚠ ' : ''}${esc(n.text)}</li>`).join('')}</ul>` : '');
    function proposalsHtml() {
      if (!mayor.pending.length) return `<p class="stat-line">${mayor.on ? 'Nothing waiting. The officers are watching.' : 'The agents are off.'}</p>`;
      const cf = state.confirm && Date.now() <= state.confirm.until ? state.confirm : null;
      return mayor.pending.slice().sort((a, b) => C.TIERS.indexOf(b.tier) - C.TIERS.indexOf(a.tier)).map((q) => {
        const col = TIER_COL[q.tier], R = `data-k="${esc(q.key)}" data-r="${q.rev}"`;
        const rows = q.options.map((x, i) => {
          const conf = cf && cf.k === q.key && cf.o === x.id && cf.r === q.rev;
          const btns = q.mode === 'advice' ? '' : q.kind === 'lift' && !conf
            ? `<button type="button" class="btn small" data-a="ok" ${R} data-o="${esc(x.id)}">Lift it${mayor.needsConfirm(x) ? '…' : ''}</button><button type="button" class="btn small" data-a="keep" ${R}>Keep in force</button>`
            : conf ? `<button type="button" class="btn small warn" data-a="confirm" ${R} data-o="${esc(x.id)}">Confirm: ${esc(x.label)}</button><button type="button" class="btn small" data-a="cancel" ${R}>Cancel</button>`
              : `<button type="button" class="btn small" data-a="ok" ${R} data-o="${esc(x.id)}">Approve${mayor.needsConfirm(x) ? '…' : ''}</button><button type="button" class="btn small" data-a="no" ${R} data-o="${esc(x.id)}" title="Deny for ${mayor.denyDays} day${mayor.denyDays === 1 ? '' : 's'}">Deny</button><button type="button" class="btn small" data-a="never" ${R} data-o="${esc(x.id)}" title="Never offer this again until I allow it">Never</button>`;
          return `<div class="ag-opt${x.review && x.review.level === 'caution' ? ' caution' : ''}"><div><b>${i + 1}. ${esc(x.label)}</b>${chips(x)}<div class="stat-line" style="margin:2px 0 0">${esc(x.why || '')}${i ? ' · ' + esc(x.note || '') : ''}</div>${x.cost ? `<div class="stat-line" style="margin:2px 0 0"><b>Price:</b> ${esc(x.cost.text)}${x.cost.level === 'fine' ? ' · affordable' : ' · ' + esc(x.cost.why)}</div>` : ''}${x.parts ? `<div class="stat-line" style="margin:2px 0 0"><b>Parts:</b> ${x.parts.map(esc).join(' · ')}</div>` : ''}${x.exit && q.kind === 'act' ? `<div class="stat-line" style="margin:2px 0 0"><b>Exit rule:</b> ${esc(x.exit)}</div>` : ''}${revNotes(x)}${fcLine(q, x)}</div><div class="ag-btns">${btns}</div></div>`;
        }).join('');
        return `<div class="ag-prop" style="border-left:3px solid var(--${col})"><div class="ag-prop-h"><b>${esc(q.officer || '')}</b> · ${LABEL[q.domain]} <span class="chip mono" style="color:var(--${col})">${q.kind === 'lift' ? 'lift?' : q.tier}${q.tier === 'emergency' ? ' ⚠' : ''}</span> <small class="mono">waiting since ${dayClock(q.since)} · version ${q.rev}</small></div><div class="stat-line" style="margin:2px 0 6px">${esc(q.why || '')}</div>${q.fcAdvice === 'wait' && mayor.forecast ? '<div class="ag-fc" style="margin:0 0 6px"><b>Forecaster\'s advice:</b> none of the options it tried did better than doing nothing in a copy of the city' + (q.domain === 'health' ? ' over the next day (too short to show most health benefits)' : '') + '. Waiting (Deny all) may be the better choice unless you know something the model does not.</div>' : ''}${rows}${q.kind === 'act' && q.options.length > 1 && q.mode !== 'advice' ? `<div class="ag-btns" style="margin-top:6px"><button type="button" class="btn small" data-a="all" ${R}>Deny all of these</button></div>` : ''}</div>`;
      }).join('');
    }
    function teamHtml() {
      const w = app.world, line = (name, job, now) => `<tr><td><b>${name}</b></td><td>${job}</td><td>${now}</td></tr>`;
      const offi = C.OFFICERS.map((o) => { const p = o.domains.map((d) => `${LABEL[d].toLowerCase()} ${pc(mayor.sm(d))}%${mayor.tier[d] && mayor.tier[d] !== 'none' ? ' (' + mayor.tier[d] + ')' : ''}`).join(', '), open = mayor.pending.filter((q) => o.domains.includes(q.domain)).length; return line(o.name, `Watches ${o.domains.map((d) => LABEL[d].toLowerCase()).join(', ')} every minute, explains causes, ranks options`, mayor.on ? `${p}; ${open} proposal${open === 1 ? '' : 's'} open` : 'off'); }).join('');
      const cautions = mayor.pending.reduce((n, q) => n + q.options.filter((x) => x.review && x.review.level === 'caution').length, 0);
      const fcDone = mayor.pending.reduce((n, q) => n + q.options.filter((x) => x.fc).length, 0);
      return offi
        + line('Coordinator (the Mayor)', 'Merges the officers\' plans, sets the order, wakes on alarms, re-plans every few minutes', mayor.on ? `${mayor.nDelib} planning rounds, ${mayor.trigCount} alarms, plans every ${mayor.every} min` : 'off')
        + line('Safety reviewer', 'Checks every option: total burden, your own recent edits, earlier denials, sensor faults, standing rules, forecasts', `${cautions} caution${cautions === 1 ? '' : 's'} on open options`)
        + line('Forecaster', 'Tries the top options on a copy of the city as it is now (same future for each, so only the option differs)', mayor.forecast ? `${mayor.fq.length} job${mayor.fq.length === 1 ? '' : 's'} queued, ${fcDone} option${fcDone === 1 ? '' : 's'} forecast` : 'switched off')
        + line('Auditor', 'Records every decision; checks hourly that each change to the city has a recorded reason', `${mayor.ledger.length} entries, ${mayor.blocked} blocked attempt${mayor.blocked === 1 ? '' : 's'}, ${state.unexplained} unexplained change${state.unexplained === 1 ? '' : 's'} (${state.audits} checks)`);
    }
    function render(force) {
      const w = app.world, last = mayor.hist[mayor.hist.length - 1], now = mayor.o, wait = mayor.pending.filter((q) => q.mode !== 'advice').length, emerg = mayor.pending.some((q) => q.tier === 'emergency');
      if (state.confirm && Date.now() > state.confirm.until) state.confirm = null;
      $('#agChip').textContent = mayor.on ? 'ON · ' + (mayor.autonomy === 'advise' ? 'advise' : 'ask') : 'off'; $('#agToggle').textContent = mayor.on ? 'Switch agents OFF' : 'Switch agents ON';
      $('#agStatus').textContent = mayor.faults && !mayor.on ? `Paused after an internal error (${mayor.lastFault}). Nothing was changed. Switch on to retry.` : mayor.on ? `Running. Watching every minute (${mayor.minutes} readings). ${mayor.approved} decision${mayor.approved === 1 ? '' : 's'} approved by you, ${mayor.denied} denied, ${mayor.trigCount} alarm${mayor.trigCount === 1 ? '' : 's'}. Nothing changes without your click.` : 'The agents are off. Start the simulation, then switch them on.';
      const tb = document.getElementById('tabbtn-agent'); if (tb) tb.textContent = 'AI Agent' + (emerg ? ' ⚠' : wait ? ' (' + wait + ')' : '');
      if (last && now) {
        $('#agCost').textContent = `pressure ${pc(last.J)}% · burden ${pc(burdenOf(w.params))}`;
        put('#agPress', KEYS.map((k) => { const v = mayor.sm(k), sl = mayor.slope(k), t = mayor.tier[k] || 'none'; return `<div class="sc-row"><span>${LABEL[k]}</span><div class="sc-bar"><i style="width:${clamp(pc(v), 0, 100)}%;background:${v < 0.25 ? 'var(--ok)' : v < 0.5 ? 'var(--warn)' : 'var(--danger)'}"></i></div><b title="trend per hour">${pc(v)} ${arrow(sl)}</b></div>${t !== 'none' && mayor.cause[k] ? `<div class="stat-line" style="margin:0 0 4px"><b style="color:var(--${TIER_COL[t]})">${t}</b> ${esc(mayor.cause[k])}</div>` : ''}`; }).join(''));
      } else { $('#agCost').textContent = '–'; put('#agPress', '<p class="stat-line">Readings appear after the first simulated minutes. Press Start on the Simulation tab.</p>'); }
      const H = mayor.hist.slice(-240), marks = []; for (const m of mayor.measures) { const i = H.findIndex((x) => x.t >= m.t0); if (i >= 0) marks.push({ i, v: H[i].J * 100 }); }
      lineChart($('#agChart'), [{ data: H.map((x) => x.J * 100), color: '#46c6e6' }, { data: H.map((x) => x.B * 100), color: '#ffb83d', dash: [4, 3] }], { min: 0, max: Math.max(30, ...H.map((x) => Math.max(x.J, x.B) * 100)), marks });
      put('#agTeam', teamHtml());
      $('#agWarnN').textContent = mayor.warnings.length;
      put('#agWarn', mayor.warnings.length ? mayor.warnings.map((x) => `<div class="req"><b>${esc(x.text)}</b></div>`).join('') : '<p class="stat-line">No trend is heading for trouble in the next day.</p>');
      $('#agPendN').textContent = mayor.pending.length;
      put('#agPending', proposalsHtml(), force);
      const dk = Object.keys(mayor.deny), nk = Object.keys(mayor.never); $('#agDenyN').textContent = dk.length + nk.length;
      put('#agDenyList', (dk.map((id) => { const e = mayor.deny[id]; return `<div class="ag-opt"><div><b>${esc(e.label)}</b><div class="stat-line" style="margin:2px 0 0">denied ${dayClock(e.t)} · back ${dayClock(e.returnAt)}, or sooner as a question if ${LABEL[e.domain] ? LABEL[e.domain].toLowerCase() : 'its area'} becomes an emergency</div></div><div class="ag-btns"><button type="button" class="btn small" data-allow="${esc(id)}">Allow now</button></div></div>`; })
        .concat(nk.map((id) => { const e = mayor.never[id]; return `<div class="ag-opt"><div><b>${esc(e.label)}</b> <span class="chip mono">never</span><div class="stat-line" style="margin:2px 0 0">since ${dayClock(e.t)} · not offered again, not even in an emergency</div></div><div class="ag-btns"><button type="button" class="btn small" data-allow="${esc(id)}">Allow again</button></div></div>`; }))).join('') || '<p class="stat-line">Empty. Options you deny are listed here with the day they return.</p>');
      const lg = mayor.log.filter((l) => state.filter === 'all' || l.kind === state.filter || (state.filter === 'watch' && l.kind === 'brief') || (state.filter === 'plan' && l.kind === 'learn')); $('#agLogN').textContent = lg.length;
      const badge = { alarm: 'danger', watch: 'muted', brief: 'muted', plan: 'accent', act: 'run3', reflect: 'warn', learn: 'ok', ask: 'run5' };
      put('#agLog', lg.slice(0, 80).map((l) => `<div class="ag-line"><small class="mono">${l.t != null ? dayClock(l.t) : ''}</small> <b style="color:var(--${badge[l.kind] || 'ink'})">${l.kind}</b> ${esc(l.text)}</div>`).join('') || '<p class="stat-line">Switch the agents on to see their reasoning here.</p>');
      const cf = state.confirm && Date.now() <= state.confirm.until ? state.confirm : null;
      put('#agMeasures', mayor.measures.slice(-12).reverse().map((m) => { const can = !m.oneShot && !m.lifted && (m.live || m.held), c = cf && cf.k === 'undo:' + m.uid; return `<tr><td>${esc(m.label)}</td><td>${dayClock(m.t0)}</td><td class="n">${pc(m.before)}% → ${pc(m.now)}%</td><td>${m.verdict ? esc(m.verdict) : 'checking...'}${m.lifted ? ' · lifted' : m.live || m.held ? ' · in force' : ''}${m.stage && !m.lifted ? ' · eased ' + m.stage + 'x' : ''}${m.autoLift && !m.lifted ? ' · lifts itself (you agreed)' : ''}</td><td>${can ? `<button type="button" class="btn small${c ? ' warn' : ''}" data-undo="${m.uid}" data-c="${c ? 1 : 0}">${c ? 'Confirm undo' : 'Undo'}</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="5">No measures yet.</td></tr>', force);
      put('#agLessons', Object.keys(mayor.lessons).map((id) => { const l = mayor.lessons[id], a = ACT[id]; if (!a || !l.n) return ''; const avg = l.sum / l.n; return `<tr><td>${esc(a.label)}</td><td class="n">${l.n}</td><td class="n">${avg > 0 ? '+' : ''}${fx(avg * 100, 1)}</td><td>${mayor.prio(id) > 1.1 ? 'high' : mayor.prio(id) < 0.9 ? 'low' : 'normal'}</td></tr>`; }).join('') || '<tr><td colspan="4">Nothing learned yet.</td></tr>');
      $('#agLedN').textContent = mayor.ledger.length;
      $('#agAudit').textContent = `The auditor checked ${state.audits} time${state.audits === 1 ? '' : 's'} (every simulated hour): ${state.unexplained ? state.unexplained + ' change' + (state.unexplained === 1 ? '' : 's') + ' without a recorded reason (see the ledger).' : 'every change to the city had a recorded reason.'} ${mayor.blocked} attempt${mayor.blocked === 1 ? '' : 's'} to act without approval ${mayor.blocked === 1 ? 'was' : 'were'} blocked.`;
      put('#agLedger', mayor.ledger.slice(0, 60).map((e) => `<tr><td class="n">${e.n}</td><td class="mono">${e.run > 1 ? 'run ' + e.run + ', ' : ''}${esc(e.clock)}</td><td><b>${esc(e.what)}</b></td><td>${esc(e.label || '')}</td><td>${esc(e.detail || '')}</td></tr>`).join('') || '<tr><td colspan="5">No decisions yet.</td></tr>');
      $('#agUndoLast').hidden = !state.undo.length;
      renderFit();
    }
    setInterval(() => { if (app.tab === 'agent') render(); }, 1000);
    const tabBtn = document.querySelector('[data-tab="agent"]'); if (tabBtn) tabBtn.addEventListener('click', () => setTimeout(() => render(true), 50));
    setInterval(() => { const tb = document.getElementById('tabbtn-agent'); if (!tb || app.tab === 'agent') return; const wait = mayor.pending.filter((q) => q.mode !== 'advice').length, em = mayor.pending.some((q) => q.tier === 'emergency'); tb.textContent = 'AI Agent' + (em ? ' ⚠' : wait ? ' (' + wait + ')' : ''); }, 2000);

    /* ----- changes you apply yourself (idea, best policy): confirm first, undo later ----- */
    const prettyPatch = (patch) => Object.keys(patch).map((k) => `${(info[k] && info[k].label) || k} = ${typeof patch[k] === 'boolean' ? (patch[k] ? 'on' : 'off') : patch[k]}`).join(', ');
    const prettyDiff = (patch) => Object.keys(patch).map((k) => { const it = info[k], f = (v) => (typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v)); return `${(it && it.label) || k}: ${f(app.params[k])} → ${f(patch[k])}`; }).join('; ');
    let clickDetail = 0; document.addEventListener('click', (e) => { clickDetail = e.detail; }, true);
    function armConfirm(btn, label, run) {
      if (clickDetail > 1) return; // a double-click never confirms
      if (btn.dataset.armed === '1' && Date.now() - Number(btn.dataset.armedAt || 0) < 700) return; // too fast to have read it
      if (btn.dataset.armed === '1' && Date.now() < Number(btn.dataset.until)) { btn.dataset.armed = '0'; btn.textContent = btn.dataset.text; btn.classList.remove('warn'); run(); return; }
      btn.dataset.text = btn.dataset.text || btn.textContent; btn.dataset.armed = '1'; btn.dataset.armedAt = String(Date.now()); btn.dataset.until = String(Date.now() + 12000); btn.textContent = 'Confirm: ' + label; btn.classList.add('warn');
      setTimeout(() => { if (btn.dataset.armed === '1' && Date.now() >= Number(btn.dataset.until)) { btn.dataset.armed = '0'; btn.textContent = btn.dataset.text; btn.classList.remove('warn'); } }, 12500);
    }
    function applyPatch(patch, label) {
      const role = needsRole(); if (role) { result(false, role); return false; }
      const prev = {}, set = {}; const was = writer; writer = 'you';
      try { for (const k in patch) { prev[k] = app.params[k]; app.setParam(k, patch[k]); set[k] = app.params[k]; } } finally { writer = was; }
      try { app.syncParamInputs(); } catch (e) { /* ignore */ }
      const changed = Object.keys(set).filter((k) => set[k] !== prev[k]);
      state.undo.push({ label, prev, set }); if (state.undo.length > 20) state.undo.shift();
      mayor.led('you applied', { id: 'you', label, domain: '' }, changed.map((k) => `${k}: ${prev[k]} → ${set[k]}`).join(', ') || 'nothing changed');
      mayor.say('act', `You applied: ${label} (${prettyPatch(patch)}).`, app.world.tick); app.auditAdd && app.auditAdd(`Applied: ${label}`); render(true);
      return true;
    }
    $('#agUndoLast').addEventListener('click', (e) => {
      const u = state.undo[state.undo.length - 1]; if (!u) return;
      armConfirm(e.currentTarget, `undo "${u.label}"`, () => {
        state.undo.pop(); const kept = [], back = {}; for (const k in u.prev) { if (app.params[k] === u.set[k]) back[k] = u.prev[k]; else kept.push(k); }
        const was = writer; writer = 'you'; try { for (const k in back) app.setParam(k, back[k]); } finally { writer = was; }
        mayor.led('you undid', { id: 'you', label: u.label, domain: '' }, Object.keys(back).join(', ') + (kept.length ? '; left alone (changed since): ' + kept.join(', ') : ''));
        result(true, `Undone: ${u.label}.${kept.length ? ' Left alone because they changed since: ' + kept.join(', ') + '.' : ''}`); render(true);
      });
    });

    /* ----- experiments ----- */
    const setProg = (id, wrap, f) => { $(wrap).hidden = false; $(id).style.width = Math.round(f * 100) + '%'; };
    const busy = (b, cancelId) => { job.busy = b; job.cancel = false; $(cancelId).hidden = !b; for (const id of ['#agTestBtn', '#agSearchBtn', '#agCalib', '#agIdeaTest', '#agIdeaNow']) $(id).disabled = b; };
    function showTest(rows, best) {
      $('#agTestBody').innerHTML = rows.map((r) => `<tr${r === best ? ' style="font-weight:600"' : ''}><td>${esc(r.name)}${r === best ? ' ★' : ''}</td><td class="n">${fx(r.J * 100, 1)}%</td><td class="n">${fx(r.B * 100, 0)}</td><td class="n">${fx(r.peakInf, 1)}%</td><td class="n">${r.deaths}</td><td class="n">${fx(r.peakAqi)}</td><td class="n">${r.acc}</td></tr>`).join('');
    }
    const baseParams = () => Object.assign({}, app.params);
    $('#agCancelBtn').addEventListener('click', () => { job.cancel = true; });
    $('#agTestBtn').addEventListener('click', async () => {
      if (job.busy) return; const days = parseInt($('#agDays').value, 10) || 3, goal = mayor.goal; busy(true, '#agCancelBtn'); $('#agTestChip').textContent = 'running'; $('#agApplyBar').hidden = true;
      try {
        $('#agTestMsg').textContent = 'Run 1 of 2: the city with no agent...';
        const r1 = await runAsync(baseParams(), days, { controller: 'none', goal }, (f) => setProg('#agProg', '#agProgWrap', f * 0.5), job); if (!r1) throw new Error('cancelled');
        $('#agTestMsg').textContent = 'Run 2 of 2: the same city with the agent team, a simulated you approving every proposal after 1 h...';
        const r2 = await runAsync(baseParams(), days, { controller: 'consent', goal, lessons: JSON.parse(JSON.stringify(mayor.lessons)), mayorOpt: { every: mayor.every, denyDays: mayor.denyDays } }, (f) => setProg('#agProg', '#agProgWrap', 0.5 + f * 0.5), job); if (!r2) throw new Error('cancelled');
        const a = Object.assign({ name: 'No agent' }, r1), b = Object.assign({ name: `Agent team (${goal}, ${r2.acts} approved actions)` }, r2), best = b.C < a.C ? b : a;
        showTest([a, b], best); state.lastTest = { a, b };
        const dJ = ((a.J - b.J) / Math.max(1e-6, a.J)) * 100, dC = ((a.C - b.C) / Math.max(1e-6, a.C)) * 100;
        $('#agTestMsg').textContent = `Same seed, ${days} days. Harm ${fx(a.J * 100, 1)}% → ${fx(b.J * 100, 1)}% (${dJ >= 0 ? dJ.toFixed(0) + '% lower' : Math.abs(dJ).toFixed(0) + '% higher'}); burden on people ${fx(a.B * 100, 0)} → ${fx(b.B * 100, 0)}; harm plus burden ${dC >= 0 ? dC.toFixed(0) + '% lower with the agents' : Math.abs(dC).toFixed(0) + '% higher: the agents did not pay off here'}. One seed is one sample: for real statistics use the Paper Lab tab.`; $('#agTestChip').textContent = 'done';
      } catch (e) { $('#agTestMsg').textContent = e.message === 'cancelled' ? 'Cancelled.' : 'Test failed: ' + e.message; $('#agTestChip').textContent = '–'; }
      $('#agProgWrap').hidden = true; busy(false, '#agCancelBtn');
    });
    $('#agSearchBtn').addEventListener('click', async () => {
      if (job.busy) return; const days = parseInt($('#agDays').value, 10) || 3, goal = mayor.goal, ids = GOAL_POLICIES[goal] || GOAL_POLICIES.balanced; busy(true, '#agCancelBtn'); $('#agTestChip').textContent = 'searching'; $('#agApplyBar').hidden = true;
      const rows = [];
      try {
        const list = [['Current settings (baseline)', {}]].concat(ids.map((id) => POLICIES[id]));
        for (let i = 0; i < list.length; i++) {
          $('#agTestMsg').textContent = `Testing ${i + 1} of ${list.length}: ${list[i][0]}`;
          const r = await runAsync(baseParams(), days, { controller: 'none', goal, patch: list[i][1] }, (f) => setProg('#agProg', '#agProgWrap', (i + f) / list.length), job); if (!r) throw new Error('cancelled');
          rows.push(Object.assign({ name: list[i][0], changes: list[i][1] }, r));
        }
        const best = rows.slice().sort((a, b) => a.C - b.C)[0]; showTest(rows, best); state.bestPolicy = best;
        $('#agTestMsg').textContent = `Lowest harm plus burden for "${goal}" over ${days} days: ${best.name} (${fx(best.C * 100, 1)} versus ${fx(rows[0].C * 100, 1)} now). Policies were tested one at a time on a fresh city, so combinations may behave differently.`;
        $('#agApplyBar').hidden = !Object.keys(best.changes).length; $('#agApplyMsg').textContent = ''; $('#agTestChip').textContent = 'done';
      } catch (e) { $('#agTestMsg').textContent = e.message === 'cancelled' ? 'Cancelled.' : 'Search failed: ' + e.message; $('#agTestChip').textContent = '–'; }
      $('#agProgWrap').hidden = true; busy(false, '#agCancelBtn');
    });
    $('#agApplyBest').addEventListener('click', (e) => {
      const b = state.bestPolicy; if (!b) return;
      armConfirm(e.currentTarget, prettyDiff(b.changes), () => { if (applyPatch(b.changes, 'planner policy: ' + b.name)) { $('#agApplyMsg').textContent = `Applied: ${b.name}. Undo it from the decision ledger.`; $('#agApplyBar').hidden = true; } });
    });

    /* ----- your own idea: the officers and the reviewer read it, the forecaster tries it ----- */
    $('#agIdeaCheck').addEventListener('click', () => {
      const text = $('#agIdea').value.slice(0, 600).trim(), out = $('#agIdeaOut'); $('#agIdeaTable').hidden = true; $('#agIdeaApply').hidden = true; $('#agIdeaMsg').textContent = ''; $('#agIdeaNow').hidden = true; $('#agIdeaTest').hidden = true; state.idea = null;
      if (!text) { out.innerHTML = '<p class="stat-line">Type an idea first.</p>'; return; }
      const idea = parseIdea(text, app.params);
      const negNote = idea.negated.length ? `<div class="ag-line">ℹ I read a "not" in the part about: ${esc(idea.negated.join(', '))}. I never do the opposite of what you wrote, so I left that part out. If you meant to reopen or allow something, say so (for example "reopen schools").</div>` : '';
      if (!idea.understood) { out.innerHTML = negNote + '<p class="stat-line"><b>I could not match that to a city control.</b> I understand ideas about: schools, masks, work from home, lockdown, testing, markets, parks, gyms, gatherings, hospital beds, ambulances, kilns (clean technology or inspections), construction dust, factory smoke, vehicle smoke, buses, speed limit, police, cameras, seat belts, snow ploughs, street lights, power use, generators, water, leaks, Wi-Fi, alerts, flights; and "reopen ..." for schools, market, parks, gyms and gatherings. English or Roman Urdu.</p>'; $('#agIdeaChip').textContent = idea.negated.length ? 'not applied' : 'not understood'; return; }
      if (!Object.keys(idea.patch).length) { out.innerHTML = negNote + '<p class="stat-line">Everything in that idea is already in place in the current city, so there is nothing to change.</p>'; $('#agIdeaChip').textContent = 'already so'; return; }
      const cr = critique(idea, mayor, app.world); state.idea = { text, idea, cr };
      const ico = { good: '✔', warn: '⚠', gap: '＋', add: '＋', info: 'ℹ' };
      const rev = Object.keys(idea.patch).map((k) => { const u = mayor.userSet[k]; return u && app.world.tick - u.t < 1440 && u.v !== idea.patch[k] ? `<div class="ag-line">⚠ You changed "${esc((info[k] && info[k].label) || k)}" yourself at ${dayClock(u.t)}; this idea would change it again.</div>` : ''; }).join('');
      out.innerHTML = negNote + `<p class="stat-line"><b>I understood:</b> ${esc(idea.recognised.join(', '))}.<br><b>That changes:</b> ${esc(prettyDiff(idea.patch))}.</p>` + cr.notes.map((n) => `<div class="ag-line">${ico[n.type] || ''} ${esc(n.text)}</div>`).join('') + rev + (Object.keys(cr.extras).length ? `<p class="stat-line"><b>The officers would add:</b> ${esc(prettyPatch(cr.extras))}.</p>` : '<p class="stat-line">The officers would not add anything to this idea.</p>');
      $('#agIdeaChip').textContent = 'checked'; $('#agIdeaTest').hidden = false; $('#agIdeaNow').hidden = typeof World.prototype.fork !== 'function';
    });
    $('#agIdeaCancel').addEventListener('click', () => { job.cancel = true; });
    const ideaVariants = (S) => { const v = [['Current city (nothing new)', {}], ['Your idea', S.idea.patch]]; if (Object.keys(S.cr.extras).length) v.push(['Your idea + the officers\' additions', Object.assign({}, S.idea.patch, S.cr.extras)]); return v; };
    function showIdeaRows(rows, nSeeds, note) {
      $('#agIdeaBody').innerHTML = rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${fx(r.J * 100, 1)}%</td><td class="n">${fx(r.B * 100, 0)}</td><td class="n">${fx(r.C * 100, 1)}</td><td class="n">${fx(r.peakInf, 1)}%</td><td class="n">${fx(r.deaths, 1)}</td><td class="n">${r.better == null ? '–' : r.better + ' of ' + nSeeds}</td></tr>`).join(''); $('#agIdeaTable').hidden = false;
      const base = rows[0], verdict = (r) => { const dC = (base.C - r.C) / Math.max(1e-6, base.C), dJ = (base.J - r.J) / Math.max(1e-6, base.J); return dC > 0.05 && (nSeeds === 1 || r.better >= 2) ? `helps: total cost ${(dC * 100).toFixed(0)}% lower (harm ${(dJ * 100).toFixed(0)}% lower, burden up ${fx((r.B - base.B) * 100, 0)})` : dC < -0.05 ? `costs more than it gains here (harm ${dJ >= 0 ? (dJ * 100).toFixed(0) + '% lower' : 'not lower'}, burden up ${fx((r.B - base.B) * 100, 0)})` : 'no clear difference from the current city'; };
      $('#agIdeaMsg').textContent = `Your idea ${verdict(rows[1])}.` + (rows[2] ? ` With the additions it ${verdict(rows[2])}.` : '') + ' ' + note;
      state.idea.rows = rows; $('#agIdeaApply').hidden = false; $('#agIdeaApply [data-idea="plus"]').hidden = !rows[2]; $('#agIdeaChip').textContent = 'tested';
    }
    $('#agIdeaNow').addEventListener('click', async () => {
      const S = state.idea; if (!S || job.busy) return; const H = 1440, vars = ideaVariants(S); busy(true, '#agIdeaCancel'); $('#agIdeaCancel').hidden = false; $('#agIdeaChip').textContent = 'forecasting';
      try {
        const memo0 = JSON.stringify(mayor.memo || {}), runs = vars.map((v) => { const f = app.world.fork(); f.setParams(Object.assign({}, v[1])); return { f, memo: JSON.parse(memo0), J: 0, B: 0, n: 0, peakInf: 0, d0: f.counts().D + f.counts().X }; });
        let t = 0;
        await new Promise((resolve, reject) => { (function slice() { if (job.cancel) return reject(new Error('cancelled')); const end = Math.min(H, t + 60); for (; t < end; t++) for (const r of runs) { r.f.step(); if (t % 10 === 0) { const o = C.observe(r.f, r.memo); r.J += C.costOf(o, mayor.goal); r.B += burdenOf(r.f.params); r.n++; r.peakInf = Math.max(r.peakInf, o.infPct); } } setProg('#agIdeaProg', '#agIdeaProgWrap', t / H); if (t >= H) resolve(); else setTimeout(slice, 0); })(); });
        const rows = vars.map((v, i) => { const r = runs[i], c = r.f.counts(); const J = r.J / Math.max(1, r.n), B = r.B / Math.max(1, r.n); return { name: v[0], J, B, C: J + C.MU * B, peakInf: r.peakInf, deaths: c.D + c.X - r.d0, better: null }; });
        showIdeaRows(rows, 1, 'Forecast from the city as it is right now, next 24 hours, the same future for each plan (one possible future of the model, not a promise).');
      } catch (e) { $('#agIdeaMsg').textContent = e.message === 'cancelled' ? 'Cancelled.' : 'Forecast failed: ' + e.message; }
      $('#agIdeaProgWrap').hidden = true; busy(false, '#agIdeaCancel'); $('#agIdeaCancel').hidden = true;
    });
    $('#agIdeaTest').addEventListener('click', async () => {
      const S = state.idea; if (!S || job.busy) return; const days = parseInt($('#agDays').value, 10) || 3, goal = mayor.goal, p0 = baseParams(), seeds = [p0.seed, p0.seed + 1, p0.seed + 2];
      const variants = ideaVariants(S);
      busy(true, '#agIdeaCancel'); $('#agIdeaCancel').hidden = false; $('#agIdeaChip').textContent = 'testing'; $('#agIdeaApply').hidden = true; const res = variants.map(() => []);
      try {
        const total = variants.length * seeds.length; let n = 0;
        for (let v = 0; v < variants.length; v++) for (let s = 0; s < seeds.length; s++) {
          $('#agIdeaMsg').textContent = `Testing "${variants[v][0]}", seed ${s + 1} of ${seeds.length} (${n + 1}/${total})...`;
          const r = await runAsync(p0, days, { controller: 'none', goal, patch: variants[v][1], seed: seeds[s] }, (f) => setProg('#agIdeaProg', '#agIdeaProgWrap', (n + f) / total), job); if (!r) throw new Error('cancelled'); res[v].push(r); n++;
        }
        const mean = (arr, k) => arr.reduce((a, r) => a + r[k], 0) / arr.length;
        const rows = variants.map((vr, v) => ({ name: vr[0], J: mean(res[v], 'J'), B: mean(res[v], 'B'), C: mean(res[v], 'C'), peakInf: mean(res[v], 'peakInf'), deaths: mean(res[v], 'deaths'), better: v === 0 ? null : res[v].filter((r, i) => r.C < res[0][i].C).length }));
        showIdeaRows(rows, seeds.length, `Tested over ${days} days on ${seeds.length} seeds from a fresh start with your current settings; 3 seeds is a small sample, so small gaps are noise.`);
      } catch (e) { $('#agIdeaMsg').textContent = e.message === 'cancelled' ? 'Cancelled.' : 'Test failed: ' + e.message; $('#agIdeaChip').textContent = 'checked'; }
      $('#agIdeaProgWrap').hidden = true; busy(false, '#agIdeaCancel'); $('#agIdeaCancel').hidden = true;
    });
    $('#agIdeaApply').addEventListener('click', (e) => {
      const b = e.target.closest('[data-idea]'); const S = state.idea; if (!b || !S) return;
      const patch = b.dataset.idea === 'plus' ? Object.assign({}, S.idea.patch, S.cr.extras) : S.idea.patch;
      armConfirm(b, prettyDiff(patch), () => { if (applyPatch(patch, `your idea "${S.text.slice(0, 80)}"`)) { $('#agIdeaMsg').textContent = 'Applied to the live city. You can undo it from the decision ledger.'; $('#agIdeaApply').hidden = true; } });
    });

    /* ----- CSV ----- */
    function readText(text) {
      $('#agMapTable').hidden = true; $('#agApplyCity').hidden = true;
      text = String(text || '');
      if (text.length > MAX_CSV) { $('#agCsvChip').textContent = 'too big'; $('#agCsvMsg').textContent = `This text is ${(text.length / 1e6).toFixed(1)} MB; the limit is 2 MB. A city profile is a few lines and a daily series a few hundred rows.`; return; }
      const lines = text.split(/\r?\n/); if (lines.length > MAX_ROWS) { $('#agCsvChip').textContent = 'too long'; $('#agCsvMsg').textContent = `This CSV has ${lines.length.toLocaleString()} rows; the limit is ${MAX_ROWS.toLocaleString()}. Aggregate it to daily values first.`; return; }
      const rows = parseCSV(lines.filter((l) => !/^\s*#/.test(l)).join('\n')), c = classify(rows);
      if (c.kind === 'bad') { $('#agCsvChip').textContent = 'unreadable'; $('#agCsvMsg').textContent = 'Could not read this as a city profile or an observed series. Press "Show the template" to see the expected layout.'; return; }
      if (c.kind === 'profile') {
        const m = mapProfile(c.pairs, app.params, info); state.city = m;
        $('#agMapBody').innerHTML = m.rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td class="n">${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`).join(''); $('#agMapTable').hidden = false;
        const n = Object.keys(m.changes).length; $('#agCsvChip').textContent = `profile · ${n} settings`;
        $('#agCsvMsg').textContent = `Read ${c.pairs.length} rows: ${n} model settings matched${m.targets.aqi ? ', plus an AQI calibration target of ' + fx(m.targets.aqi) : ''}. Check the table, then apply (a second click confirms, because the simulation restarts).`;
        $('#agApplyCity').hidden = !n;
      } else {
        const s = seriesFrom(c), keys = Object.keys(s); state.series = s;
        $('#agCsvChip').textContent = `series · ${keys.length}`; $('#agCsvMsg').textContent = keys.length ? `Read ${c.rows.length} days of ${keys.map((k) => SERIES_LABEL[k]).join(', ')}. Run the simulation to compare, then try Auto-calibrate.` : 'No recognised columns. Use aqi, temp_c, infectious_pct or power_kw.';
        $('#agSeries').innerHTML = keys.map((k) => `<option value="${esc(k)}">${esc(SERIES_LABEL[k])}</option>`).join(''); renderFit();
      }
    }
    $('#agRead').addEventListener('click', () => readText($('#agCsvText').value));
    $('#agFile').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > MAX_FILE) { $('#agCsvChip').textContent = 'too big'; $('#agCsvMsg').textContent = `"${f.name}" is ${(f.size / 1048576).toFixed(1)} MB; the limit is 2 MB.`; e.target.value = ''; return; }
      const fr = new FileReader(); fr.onload = () => { const t = String(fr.result || ''); $('#agCsvText').value = t.length > 200000 ? t.slice(0, 200000) + '\n# (preview cut here; the whole file is used)' : t; readText(t); }; fr.readAsText(f);
    });
    $('#agSample').addEventListener('click', () => { $('#agCsvText').value = SAMPLE_PROFILE; readText(SAMPLE_PROFILE); $('#agCsvMsg').textContent += ' (Sample numbers are invented for the demo.)'; });
    $('#agTemplate').addEventListener('click', () => { $('#agCsvText').value = TEMPLATE; });
    function restartWith(changes, label) {
      const role = ROLE_OK(); if (!role) { result(false, 'Restart settings need the Admin role.'); return false; }
      const prev = {}; for (const k in changes) prev[k] = app.params[k];
      app.params = Object.assign({}, app.params, changes); app.scenarioId = 'baseline'; app.modified = true;
      try { app.syncParamInputs(); } catch (e) { /* ignore */ }
      app.reset(); app.auditAdd && app.auditAdd(label);
      mayor.led('you applied', { id: 'you', label, domain: '' }, Object.keys(changes).map((k) => `${k}: ${prev[k]} → ${changes[k]}`).join(', ') + '; simulation restarted');
      return true;
    }
    const ROLE_OK = () => app.role !== 'viewer' && app.role !== 'operator';
    $('#agApplyCity').addEventListener('click', (e) => {
      const m = state.city; if (!m) return;
      armConfirm(e.currentTarget, `${Object.keys(m.changes).length} settings, restart`, () => {
        if (!restartWith(m.changes, `City profile imported from CSV: ${Object.keys(m.changes).length} settings`)) return;
        mayor.say('plan', `City profile applied (${Object.keys(m.changes).length} settings). The model was restarted.`, 0);
        $('#agCsvMsg').textContent = `Applied ${Object.keys(m.changes).length} settings and restarted the simulation. Start it to see your city.`; $('#agApplyCity').hidden = true;
      });
    });
    function renderFit() {
      const S = state.series; $('#agFit').hidden = !(S && Object.keys(S).length) && !(state.city && state.city.targets.aqi); if ($('#agFit').hidden) return;
      const w = app.world, keys = S ? Object.keys(S) : [], rows = [];
      for (const k of keys) { const c = compare(S[k], modelDaily(w, k)); rows.push(`<tr><td>${esc(SERIES_LABEL[k])}</td>${c ? `<td class="n">${c.n}</td><td class="n">${fx(c.mae, 1)}</td><td class="n">${c.bias > 0 ? '+' : ''}${fx(c.bias, 1)}</td><td class="n">${c.r == null ? '–' : fx(c.r, 2)}</td>` : '<td class="n" colspan="4">run the simulation for at least one day</td>'}</tr>`); }
      if (state.city && state.city.targets.aqi) { const m = modelDaily(w, 'aqi'), v = Object.values(m); rows.push(`<tr><td>Average AQI (profile target ${fx(state.city.targets.aqi)})</td><td class="n">${v.length}</td><td class="n">${v.length ? fx(Math.abs(v.reduce((a, b) => a + b, 0) / v.length - state.city.targets.aqi), 1) : '–'}</td><td class="n">${v.length ? fx(v.reduce((a, b) => a + b, 0) / v.length - state.city.targets.aqi, 1) : '–'}</td><td class="n">–</td></tr>`); }
      put('#agFitBody', rows.join(''));
      const sel = $('#agSeries').value || keys[0]; if (sel && S && S[sel]) { const c = compare(S[sel], modelDaily(w, sel)); if (c) lineChart($('#agFitChart'), [{ data: c.O, color: '#ffb83d' }, { data: c.M, color: '#46c6e6', dash: [4, 3] }], { d: 0 }); }
    }
    $('#agSeries').addEventListener('change', renderFit);
    $('#agCalibCancel').addEventListener('click', () => { job.cancel = true; });
    $('#agCalib').addEventListener('click', async () => {
      if (job.busy) return; const S = state.series, tgt = state.city && state.city.targets.aqi;
      const obsA = S && S.aqi ? S.aqi : null, obsT = S && S.temp ? S.temp : null;
      if (!obsA && !tgt && !obsT) { $('#agCalMsg').textContent = 'Load a CSV with an aqi series, a temp_c series or an avg_aqi profile row first.'; return; }
      busy(true, '#agCalibCancel'); $('#agCalibCancel').hidden = false; $('#agCalibApply').hidden = true; state.calib = null; const log = [];
      try {
        const p0 = baseParams(), changes = {};
        if (obsT) { const vals = Object.values(obsT).filter(Number.isFinite), mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length), dT = (SEASONS.find((s) => s.key === p0.startSeason) || { dT: 0 }).dT; changes.baseTemp = clamp(Math.round(mean - dT - 1), 5, 42); log.push(`baseTemp ${p0.baseTemp} → ${changes.baseTemp} °C (observed mean ${fx(mean, 1)} °C)`); }
        if (obsA || tgt) {
          const days = clamp(obsA ? Object.keys(obsA).length : 3, 2, 4), score = (w) => { const m = modelDaily(w, 'aqi'); if (obsA) { const c = compare(obsA, m); return c ? c.mae : 1e9; } const v = Object.values(m); return v.length ? Math.abs(v.reduce((a, b) => a + b, 0) / v.length - tgt) : 1e9; };
          const trial = async (patch, label) => { const r = await runWorld(Object.assign({}, p0, changes, patch), days, null, null); if (!r) throw new Error('cancelled'); return { patch, label, e: score(r.w) }; };
          const tests = []; let n = 0; const total = 9, tick = () => setProg('#agCalProg', '#agCalWrap', (++n) / total);
          let best = null;
          for (const k of [0, 2, 4, 6, 8]) { $('#agCalMsg').textContent = `Trying ${k} kilns...`; const r = await trial({ kilns: k, kilnWinterStop: false }, `kilns ${k}`); tick(); tests.push(r); if (!best || r.e < best.e) best = r; }
          for (const d of [-1, 1]) { const k = clamp(best.patch.kilns + d, 0, 8); if (tests.some((t) => t.patch.kilns === k)) { tick(); continue; } $('#agCalMsg').textContent = `Refining: ${k} kilns...`; const r = await trial({ kilns: k, kilnWinterStop: false }, `kilns ${k}`); tick(); tests.push(r); if (r.e < best.e) best = r; }
          for (const f of [70, 130]) { $('#agCalMsg').textContent = `Trying other smoke sources at ${f}%...`; const r = await trial({ kilns: best.patch.kilns, kilnWinterStop: false, factorySmoke: f, trafficSmoke: f }, `smoke ${f}%`); tick(); tests.push(r); if (r.e < best.e) best = r; }
          const first = tests[0], base = tests.find((t) => t.patch.kilns === p0.kilns && t.patch.factorySmoke == null) || first;
          Object.assign(changes, best.patch); log.push(`${best.label}: AQI error ${fx(best.e, 1)} (the best of ${tests.length} tried; ${p0.kilns} kilns gave ${fx(base.e, 1)})`);
        }
        state.calib = { changes, log };
        $('#agCalMsg').textContent = 'Calibration found: ' + log.join('. ') + '. Nothing has been changed yet: press "Apply calibration and restart" (and confirm) to use it. Short test runs only, so treat this as a starting point, not a fitted model.';
        $('#agCalibApply').hidden = false;
      } catch (e) { $('#agCalMsg').textContent = e.message === 'cancelled' ? 'Cancelled, nothing was changed.' : 'Calibration failed: ' + e.message; }
      $('#agCalWrap').hidden = true; busy(false, '#agCalibCancel'); $('#agCalibCancel').hidden = true;
    });
    $('#agCalibApply').addEventListener('click', (e) => {
      const c = state.calib; if (!c) return;
      armConfirm(e.currentTarget, `${Object.keys(c.changes).length} settings, restart`, () => { if (restartWith(c.changes, 'Auto-calibrated to CSV: ' + c.log.join('; '))) { $('#agCalMsg').textContent = 'Calibration applied and the simulation restarted.'; $('#agCalibApply').hidden = true; state.calib = null; } });
    });
    window.outbreakAgentCsv = { parseCSV, classify, mapProfile: (txt) => { const c = classify(parseCSV(txt)); return c.kind === 'profile' ? mapProfile(c.pairs, app.params, info) : c; }, SAMPLE_SERIES, SAMPLE_PROFILE };
    render(true);
  }
  if (typeof document !== 'undefined') {
    const go = () => setTimeout(boot, 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})();

