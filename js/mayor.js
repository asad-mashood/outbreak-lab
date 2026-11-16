/* =====================================================================
   OUTBREAK LAB v17: THE AGENT TEAM (core)
   ---------------------------------------------------------------------
   Works in the browser and in Node (used by the benchmark that feeds the
   research paper). No language model, no network: a transparent
   sense -> diagnose -> plan -> (ask) -> act -> reflect -> learn loop.

   sense      every simulated MINUTE: six pressures, smoothed, with trends
   triggers   edge events (AQI passes 200, beds fill, outage starts ...)
              wake the planner at once; otherwise it plans every N minutes
   plan       per problem area: ranked options + alternatives, with the
              expected benefit, the burden (cost to people) and the reason
   ask        proposals wait for you; a denied option goes on the deny list
              and returns after N days, or at once (as a new request)
              only if its problem becomes an emergency
   v17        every option now has a price tag and a budget check (fine / tight /
              over budget / no funds); finance, welfare and birth-centre officers;
              packages of measures; funding actions (reserve, grant, loan, levy);
              exit rules: measures ease in steps and lift by themselves when things
              get better, if you agreed to that when you approved them
   ===================================================================== */
(function (root) {
  'use strict';
  const M = typeof World !== 'undefined' ? { World, DEFAULT_PARAMS } : require('./model.js');
  const WorldClass = M.World, DEF = M.DEFAULT_PARAMS;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DOM = ['health', 'air', 'roads', 'power', 'water', 'net', 'budget', 'welfare', 'maternal'];
  const LABEL = { health: 'Health', air: 'Air quality', roads: 'Road safety', power: 'Power', water: 'Water', net: 'Connectivity', budget: 'City budget', welfare: 'Household hardship', maternal: 'Mothers and newborns' };
  const GOALS = {
    balanced: { health: 1.5, air: 1.2, roads: 1, power: 1, water: 1, net: 0.4, budget: 0.9, welfare: 1, maternal: 0.9 },
    lives: { health: 3, air: 1, roads: 1.2, power: 0.5, water: 0.5, net: 0.2, budget: 0.4, welfare: 0.7, maternal: 1.5 },
    air: { health: 1, air: 3, roads: 0.5, power: 0.5, water: 0.3, net: 0.1, budget: 0.4, welfare: 0.5, maternal: 0.5 },
    infra: { health: 0.8, air: 0.6, roads: 1.5, power: 2.2, water: 2.2, net: 0.8, budget: 1.2, welfare: 0.7, maternal: 0.5 },
  };
  const MU = 0.4; // weight of the burden (restrictions on people) in the total cost
  const TIERS = ['none', 'low', 'normal', 'high', 'emergency'];
  const dayClock = (tick) => { const m = (tick + 360) % 1440, d = Math.floor((tick + 360) / 1440); return `Day ${d} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  const pc = (v) => Math.round(v * 100);

  /* ---------- tracks: smoothed value + trend per hour ---------- */
  class Track {
    constructor(k) { this.k = k || 0.1; this.v = null; this.ring = new Float32Array(61); this.i = 0; this.n = 0; }
    push(x) {
      if (!Number.isFinite(x)) return; // a broken reading never poisons the average
      this.v = this.v == null ? x : this.v + (x - this.v) * this.k;
      this.ring[this.i] = this.v; this.i = (this.i + 1) % 61; if (this.n < 61) this.n++;
    }
    get slope() { if (this.n < 20) return 0; const old = this.ring[(this.i + 61 - this.n) % 61]; return (this.v - old) / (this.n / 60); } // per hour
  }

  /* what people actually breathe, compared with the open-air reading: purifiers in homes and filters in public buildings
     cut the indoor part (assumed time split: 30% outdoors, 50% at home, 20% in other buildings; same factors as the model) */
  const breathRatio = (p, eco) => (eco ? (0.3 + 0.325 * (1 - 0.55 * clamp((p.purifiers || 0) / 100, 0, 1)) + 0.13 * (p.bldgFilters ? 0.6 : 1)) / 0.755 : 1);
  const airCut = (o, w, sets) => { if (!w.eco) return 0; const r0 = breathRatio(w.params, true), r1 = breathRatio(Object.assign({}, w.params, sets), true), a0 = o.aqiMax * r0 - 100; return a0 > 0 ? clamp(1 - (o.aqiMax * r1 - 100) / a0, 0, 1) : 0; };
  /* ---------- observation (works on any World) ---------- */
  function observe(w, memo) {
    const p = w.params, N = Math.max(1, w.agents.length), c = w.counts(), E = w.en, W = w.wa, st = w.stats;
    const fc = w.fc && w.fc.aqi && w.fc.aqi.length ? Math.max.apply(null, w.fc.aqi) : w.aqi;
    const aqiMax = Math.max(w.aqi, fc * 0.9);
    let acc24 = 0;
    if (memo) {
      const a = memo.accHist || (memo.accHist = []);
      if (!a.length || w.tick - a[a.length - 1].t >= 60) { a.push({ t: w.tick, n: st.accidents }); if (a.length > 26) a.shift(); }
      const first = a[0], span = Math.max(1, (w.tick - first.t) / 60);
      acc24 = span < 6 ? 0 : ((st.accidents - first.n) / span) * 24;
    }
    const hazard = clamp(w.fog * 0.5 + w.rain * 0.3 + (w.snow || 0) * 0.5, 0, 1);
    const sev = (c.E + c.I) / N, dead = (c.D + c.X) / N, bedLoad = c.H / Math.max(1, p.hospitalBeds);
    const demandRatio = E.demand / Math.max(1, p.gridCapacity), tank = W.tank / Math.max(1, p.tankCapacity || W.tank0 || 1);
    const o = {
      tick: w.tick, aqi: w.aqi, aqiMax, breath: breathRatio(p, !!w.eco), hazard, snow: w.snow || 0, fog: w.fog, rain: w.rain, infPct: sev * 100, deaths: c.D + c.X, bedLoad, demandRatio, tank, acc24, wind: w.windSpd || 0,
      health: clamp(sev * 6 + Math.max(0, bedLoad - 0.6) * 0.8 + dead * 25, 0, 1),
      air: clamp((aqiMax * breathRatio(p, !!w.eco) - 100) / 250, 0, 1),
      roads: clamp((acc24 / 8) * 0.6 + hazard * 0.5, 0, 1),
      power: clamp((1 - Math.min(E.ratio.home, E.ratio.critical)) * 2 + (E.outageUntil > w.tick ? 0.3 : 0) + Math.max(0, demandRatio - 0.9) * 2, 0, 1),
      water: clamp((W.demand > 0 ? (W.unmet / W.demand) * 3 : 0) + Math.max(0, 0.25 - tank) * 3, 0, 1),
      net: w.wifi ? clamp((60 - w.wifi.coverage) / 60, 0, 1) * 0.5 : 0,
    };
    // where does the smoke come from? (estimated shares of PM emissions)
    const all = Math.max(1, w.emAll || 1), day = w.minuteNow >= 420 && w.minuteNow < 1140;
    const kiln = clamp((w.emK || 0) / all, 0, 1), dust = clamp(((w.cons && w.cons.dust) || 0) / all, 0, 1);
    const fac = day && w.factories ? clamp((260 * w.factories.length * (p.factorySmoke / 100)) / (all * 1.6), 0, 1) : 0;
    o.src = { kiln, dust, factory: Math.min(fac, 1 - kiln - dust), traffic: Math.max(0, 1 - kiln - dust - fac) };
    // v17: money, hardship and mothers (all zero when the economy layer is off)
    o.budget = 0; o.welfare = 0; o.maternal = 0; o.cashDays = 999; o.reserve = 0; o.distress = 0; o.cpi = 1; o.dueSoon = 0; o.matLoad = 0; o.grantPending = 0; o.debt = 0; o.trust = 0.65; o.surplus = 0;
    if (w.eco && typeof w.fiscal === 'function') {
      const f = w.fiscal(), mt = w.maternal();
      const dayExp = Math.max(1, f.dayExp), cashDays = f.cash / dayExp;
      let b = f.runway < 60 ? ((60 - f.runway) / 60) * 0.8 : 0;
      if (cashDays < 10) b = Math.max(b, ((10 - cashDays) / 10) * 0.6);
      if (f.cash < 0) b = Math.max(b, 0.6 + Math.min(0.4, f.arrears / (dayExp * 5)));
      o.budget = clamp(b, 0, 1); o.cashDays = cashDays; o.reserve = f.reserve; o.debt = f.debt; o.trust = f.trust; o.cpi = f.cpi; o.distress = f.distress; o.grantPending = f.pending;
      o.welfare = clamp((f.distress - 0.06) * 3 + Math.max(0, f.cpi - 1.15) * 1.2, 0, 1);
      o.surplus = f.cash - 25 * dayExp;
      if (mt) {
        const cap = Math.max(1, Math.min(mt.rooms, mt.midwives * 2)), load = mt.dueSoon / cap; o.matLoad = load; o.dueSoon = mt.dueSoon;
        let m = clamp((load - 0.7) * 0.7, 0, 0.5);
        if (!mt.power && (mt.labourNow || mt.dueSoon)) m += 0.3;
        if (memo) {
          const h = memo.turnHist || (memo.turnHist = []);
          if (!h.length || w.tick - h[h.length - 1].t >= 60) { h.push({ t: w.tick, n: mt.turnedAway }); if (h.length > 26) h.shift(); }
          m += Math.min(0.35, (mt.turnedAway - h[0].n) * 0.15);
        }
        if (mt.antenatal < 30 && mt.pregnant > 0) m += 0.05;
        o.maternal = clamp(m, 0, 1);
      }
    }
    return o;
  }
  const costOf = (o, goal) => { const g = GOALS[goal] || GOALS.balanced; let s = 0, t = 0; for (const k of DOM) { s += g[k] * o[k]; t += g[k]; } return s / t; };

  /* ---------- how heavy are the restrictions on people right now? ---------- */
  function burdenOf(p) {
    let b = 0;
    if (!p.schoolsOpen) b += 0.25; if (!p.gatheringsOpen) b += 0.1; if (!p.marketOpen) b += 0.2; if (!p.parksOpen) b += 0.04; if (!p.gymOpen) b += 0.04;
    b += 0.35 * p.distancing / 100 + 0.05 * p.masks / 100 + (p.quarantine ? 0.05 : 0);
    b += (p.sickStayHome > 50 ? 0.03 : 0) + (p.prayerAttendance < 20 ? 0.05 : 0) + (p.speedLimit < 50 ? 0.03 * (50 - p.speedLimit) / 20 : 0);
    b += Math.max(0, p.demandResponse) / 50 * 0.1 + (p.streetlights !== 'full' ? 0.02 : 0);
    b += (!p.constructionOn || p.constructionAqiBan ? 0.03 : 0) + (p.dustControl ? 0.01 : 0) + (p.cleanKilns ? 0.08 : 0);
    b += 0.15 * Math.max(0, 1 - p.factorySmoke / 100) + 0.1 * Math.max(0, 1 - p.trafficSmoke / 100);
    b += Math.max(0, p.hospitalBeds - 8) * 0.004 + Math.max(0, p.ambulances - 3) * 0.01 + Math.max(0, p.trafficPolice - 4) * 0.004 + Math.max(0, p.gridCapacity - 420) / 420 * 0.15;
    b += Math.max(0, 100 - p.waterPerCapita) / 100 * 0.15 + (p.flightsPerDay < 3 ? 0.05 : 0);
    b += (p.oddEven ? 0.04 : 0) + Math.max(0, (p.taxRate || 100) - 100) / 100 * 0.3 + (p.spendingFreeze ? 0.01 : 0);
    return b;
  }

  /* ---------- the toolbox ---------- */
  // eff(o,w) is the PRIOR belief (0..1) of how much of the problem the option can remove; the agent learns from experience.
  const A = [];
  const add = (id, label, domain, sets, o) => { A.push(Object.assign({ id, label, domain, sets, burden: 0.05, cool: 30, eff: () => 0.2 }, o)); };
  const need = (v, lo) => (v > lo ? v : 0);
  const heal = (o) => o.health;
  // --- health
  add('masks50', 'Ask people to wear masks (50%)', 'health', { masks: 50 }, { burden: 0.03, eff: () => 0.2, relax: 0.04, hold: 720, kind: 'masks' });
  add('masks70', 'Masks in public (70%)', 'health', { masks: 70 }, { burden: 0.04, eff: () => 0.3, relax: 0.04, hold: 720, kind: 'masks' });
  add('masks90', 'Strict mask rule (90%)', 'health', { masks: 90 }, { burden: 0.05, eff: () => 0.38, relax: 0.04, hold: 720, kind: 'masks' });
  add('quarantine', 'Start test and isolate', 'health', { quarantine: true }, { burden: 0.05, eff: () => 0.3, relax: 0.03, hold: 720, kind: 'testing' });
  add('testing', 'Test more people (detection 85%)', 'health', { detectionRate: 85 }, { burden: 0.03, eff: (o, w) => (w.params.quarantine ? 0.3 : 0.08), relax: 0.03, hold: 720, kind: 'testing' });
  add('sickhome', 'Paid sick leave: sick people stay home (90%)', 'health', { sickStayHome: 90 }, { burden: 0.04, eff: () => 0.2, relax: 0.03, hold: 720, kind: 'behaviour' });
  add('wfh20', 'Work and study from home (20%)', 'health', { distancing: 20 }, { burden: 0.07, eff: () => 0.18, relax: 0.05, hold: 720, kind: 'distancing' });
  add('wfh40', 'Work and study from home (40%)', 'health', { distancing: 40 }, { burden: 0.14, eff: () => 0.34, relax: 0.05, hold: 720, kind: 'distancing' });
  add('wfh60', 'Work and study from home (60%)', 'health', { distancing: 60 }, { burden: 0.21, eff: () => 0.5, relax: 0.05, hold: 720, kind: 'distancing', big: true });
  add('schools', 'Close schools and university', 'health', { schoolsOpen: false }, { burden: 0.25, eff: () => 0.25, relax: 0.05, hold: 1440, big: true, cool: 120, kind: 'closure' });
  add('gatherings', 'Stop Friday prayers and weddings', 'health', { gatheringsOpen: false }, { burden: 0.1, eff: () => 0.2, relax: 0.06, hold: 1440, big: true, cool: 120, kind: 'closure' });
  add('market', 'Close the market and bazaar', 'health', { marketOpen: false }, { burden: 0.2, eff: () => 0.28, relax: 0.06, hold: 1440, big: true, cool: 120, kind: 'closure' });
  add('gym', 'Close gyms', 'health', { gymOpen: false }, { burden: 0.04, eff: () => 0.08, relax: 0.06, hold: 1440, kind: 'closure' });
  add('delivery', 'Push grocery delivery (40% of trips)', 'health', { groceryDelivery: 40 }, { burden: 0.02, eff: () => 0.1, relax: 0.05, hold: 720, kind: 'behaviour' });
  add('prayers', 'Limit mosque attendance (10%)', 'health', { prayerAttendance: 10 }, { burden: 0.05, eff: () => 0.1, relax: 0.05, hold: 720, kind: 'behaviour' });
  add('beds4', 'Open 4 more hospital beds', 'health', { hospitalBeds: 12 }, { burden: 0.016, eff: (o) => 0.03 + 0.17 * clamp((o.bedLoad - 0.6) / 0.4, 0, 1), cool: 60, kind: 'capacity' });
  add('beds10', 'Open 10 more hospital beds (field hospital)', 'health', { hospitalBeds: 18 }, { burden: 0.04, eff: (o) => 0.03 + 0.27 * clamp((o.bedLoad - 0.6) / 0.4, 0, 1), cool: 60, kind: 'capacity' });
  add('amb', 'Add 2 ambulances', 'health', { ambulances: 5 }, { burden: 0.02, eff: (o) => (o.bedLoad > 0.5 ? 0.12 : 0.04), cool: 60, kind: 'capacity' });
  // --- air
  add('alert', 'Send an emergency smog alert to every phone', 'air', null, { oneShot: true, burden: 0.01, cool: 360, eff: (o) => (o.aqiMax > 200 ? 0.2 : 0.05), run: (ctx) => ctx.w.sendAlert(), kind: 'alert' });
  add('media', 'Run a public-awareness campaign (alerts followed by 85%)', 'air', { mediaReach: 90, alertCompliance: 85 }, { burden: 0.01, eff: () => 0.1, kind: 'alert' });
  add('inspect', 'Send inspectors to the kilns the satellite flagged', 'air', null, { oneShot: true, burden: 0.03, cool: 120, eff: (o, w) => (w.sat && w.sat.passes && w.sat.hot > 0 && !w.params.autoDispatch ? 0.15 + 0.7 * o.src.kiln : 0), run: (ctx) => ctx.w.dispatch(false), kind: 'kilns' });
  add('autoinspect', 'Dispatch inspectors automatically from now on', 'air', { autoDispatch: true }, { burden: 0.03, eff: (o, w) => 0.1 + 0.8 * o.src.kiln, kind: 'kilns' });
  add('cleankilns', 'Order kilns to switch to clean zigzag technology', 'air', { cleanKilns: true }, { burden: 0.08, eff: (o) => 0.65 * o.src.kiln + 0.02, big: true, cool: 240, kind: 'kilns' });
  add('aqiban', 'Pause construction while the air is bad', 'air', { constructionAqiBan: true }, { burden: 0.03, eff: (o) => 0.2 + 0.9 * o.src.dust, relax: 0.15, hold: 240, kind: 'construction' });
  add('dust', 'Water spray and covers at the construction site', 'air', { dustControl: true }, { burden: 0.01, eff: (o) => 0.1 + 0.6 * o.src.dust, relax: 0.12, hold: 240, kind: 'construction' });
  add('factory', 'Cut factory smoke by 40% (filters, shorter shifts)', 'air', { factorySmoke: 60 }, { burden: 0.09, eff: (o) => 0.25 + 0.6 * o.src.factory, relax: 0.15, hold: 480, kind: 'industry' });
  add('vehicles', 'Check exhausts and ban smoky vehicles (-30% traffic smoke)', 'air', { trafficSmoke: 70 }, { burden: 0.03, eff: (o) => 0.1 + 0.6 * o.src.traffic, relax: 0.15, hold: 480, kind: 'traffic' });
  add('buses', 'Double the bus service to get cars off the road', 'air', { busesPerHour: 4 }, { burden: 0.015, eff: (o) => 0.05 + 0.25 * o.src.traffic, cool: 240, kind: 'traffic' });
  add('burning', 'Ban open waste burning', 'air', { wasteBurning: 0 }, { burden: 0.01, eff: () => 0.08, kind: 'waste' });
  add('smogschools', 'Close schools on smog days', 'air', { smogSchoolClose: true }, { burden: 0.05, eff: () => 0.05, kind: 'closure' });
  // --- roads
  add('slow40', 'Lower the speed limit to 40 km/h', 'roads', { speedLimit: 40 }, { burden: 0.02, eff: () => 0.2, relax: 0.15, hold: 360, kind: 'speed' });
  add('slow30', 'Lower the speed limit to 30 km/h', 'roads', { speedLimit: 30 }, { burden: 0.03, eff: () => 0.34, relax: 0.15, hold: 360, kind: 'speed' });
  add('police8', 'Put more traffic police on the junctions (8)', 'roads', { trafficPolice: 8 }, { burden: 0.016, eff: () => 0.22, relax: 0.1, hold: 360, kind: 'police' });
  add('police12', 'Maximum traffic police (12)', 'roads', { trafficPolice: 12 }, { burden: 0.032, eff: () => 0.32, relax: 0.1, hold: 360, kind: 'police' });
  add('cameras', 'Add speed cameras (8 junctions)', 'roads', { challanCameras: 8 }, { burden: 0.01, eff: () => 0.18, kind: 'police' });
  add('belts', 'Seat-belt campaign (90% of drivers)', 'roads', { seatbelts: 90 }, { burden: 0.005, eff: () => 0.12, kind: 'behaviour' });
  add('ploughs', 'Send snow ploughs', 'roads', { snowPloughs: true }, { burden: 0.01, eff: (o) => (o.snow > 0.1 ? 0.5 : 0), kind: 'snow' });
  add('motorway', 'Close the motorway in fog', 'roads', { motorwayFogClose: true }, { burden: 0.02, eff: (o) => (o.fog > 0.3 ? 0.3 : 0), kind: 'fog' });
  // --- power
  add('dr15', 'Ask households to cut evening-peak use (15%)', 'power', { demandResponse: 15 }, { burden: 0.03, eff: () => 0.2, relax: 0.05, hold: 480, kind: 'demand' });
  add('dr30', 'Ask households to cut evening-peak use (30%)', 'power', { demandResponse: 30 }, { burden: 0.06, eff: () => 0.35, relax: 0.05, hold: 480, kind: 'demand' });
  add('dr45', 'Strong demand response (45% cut at the peak)', 'power', { demandResponse: 45 }, { burden: 0.09, eff: () => 0.5, relax: 0.05, hold: 480, kind: 'demand' });
  add('lights', 'Dim street lights when streets are empty', 'power', { streetlights: 'adaptive' }, { burden: 0.02, eff: () => 0.12, relax: 0.05, hold: 480, kind: 'lights' });
  add('gens', 'Rent emergency generators (+15% grid capacity)', 'power', { gridCapacity: 485 }, { burden: 0.15 * 65 / 420, eff: (o) => (o.demandRatio > 0.85 ? 0.35 : 0.1), cool: 120, kind: 'supply' });
  add('hospgen', 'Make sure the hospital generator is on', 'power', { hospitalGenerator: true }, { burden: 0.01, eff: () => 0.15, kind: 'supply' });
  // --- water
  add('water90', 'Water-saving campaign (90% use)', 'water', { waterPerCapita: 90 }, { burden: 0.015, eff: () => 0.15, relax: 0.05, hold: 480, kind: 'water' });
  add('water80', 'Strong water saving (80% use)', 'water', { waterPerCapita: 80 }, { burden: 0.03, eff: () => 0.28, relax: 0.05, hold: 480, kind: 'water' });
  add('water65', 'Water rationing (65% use)', 'water', { waterPerCapita: 65 }, { burden: 0.05, eff: () => 0.42, relax: 0.05, hold: 480, kind: 'water' });
  add('leaks', 'Repair crews fix pipe leaks (leakage 5%)', 'water', { leakRate: 5 }, { burden: 0.02, eff: () => 0.22, cool: 240, kind: 'supply' });
  // --- net
  add('wifi', 'Switch on every Wi-Fi access point', 'net', { wifiAps: 10 }, { burden: 0.01, eff: () => 0.5, kind: 'net' });
  /* ---------- v17: out-of-the-box measures (each is priced by the economy layer before you see it) ---------- */
  const dayExp = (w) => Math.max(1, (w.fiscal && w.fiscal() ? w.fiscal().dayExp : 1));
  // health
  add('vax1', 'Vaccination drive: 1% of the city a day, highest risk first', 'health', { vaxDrive: 1 }, { burden: 0.01, eff: (o) => 0.06 + 0.22 * clamp(o.infPct / 6, 0, 1), relax: 0.04, hold: 1440, kind: 'vaccine', cool: 240 });
  add('vax3', 'Big vaccination drive: 3% of the city a day', 'health', { vaxDrive: 3 }, { burden: 0.015, eff: (o) => 0.1 + 0.4 * clamp(o.infPct / 6, 0, 1), relax: 0.04, hold: 1440, kind: 'vaccine', cool: 240 });
  // air
  add('purif20', 'Subsidised air purifiers for the 20% most vulnerable homes (elders, asthma, children)', 'air', { purifiers: 20 }, { burden: 0.004, eff: (o, w) => airCut(o, w, { purifiers: 20 }), cool: 240, sunk: true, kind: 'filters' });
  add('purif50', 'Air purifiers for half of all homes', 'air', { purifiers: 50 }, { burden: 0.006, eff: (o, w) => airCut(o, w, { purifiers: 50 }), cool: 240, sunk: true, kind: 'filters' });
  add('bldgfilt', 'Air filters in schools, the hospital and offices', 'air', { bldgFilters: true }, { burden: 0.004, eff: (o, w) => airCut(o, w, { bldgFilters: true }), cool: 240, sunk: true, kind: 'filters' });
  add('spray', 'Anti-smog water-mist guns (4) on dry, smoggy days', 'air', { sprayGuns: 4 }, { burden: 0.006, eff: (o) => (o.rain > 0.2 ? 0.02 : 0.04 + 0.16 * clamp((o.aqiMax - 100) / 250, 0, 1)), cool: 240, sunk: true, kind: 'spray' });
  add('seed_air', 'Cloud seeding flights to bring rain and wash the air', 'air', { cloudSeeding: true }, { burden: 0.005, eff: (o) => 0.04 + 0.2 * clamp((o.aqiMax - 120) / 200, 0, 1), relax: 0.1, hold: 1440, kind: 'weather' });
  add('oddeven', 'Odd-even rule: half the cars stay home each day', 'air', { oddEven: true }, { burden: 0.04, eff: (o) => 0.04 + 0.22 * o.src.traffic, relax: 0.15, hold: 480, kind: 'carfree', ladder: [] });
  add('freebus', 'Free bus rides, so people leave the car at home', 'air', { busFare: 0 }, { burden: 0.005, eff: (o) => 0.04 + 0.2 * o.src.traffic, relax: 0.15, hold: 480, kind: 'transit', ladder: [{ busFare: 30 }] });
  // water
  add('seed_water', 'Cloud seeding flights to bring rain for the water tank', 'water', { cloudSeeding: true }, { burden: 0.005, eff: (o) => 0.03 + 0.2 * clamp((0.4 - o.tank) / 0.4, 0, 1), relax: 0.05, hold: 1440, kind: 'weather' });
  add('tankers', 'Hire 3 water tankers', 'water', { tankers: 3 }, { burden: 0.005, eff: (o) => 0.1 + 0.25 * clamp((0.4 - o.tank) / 0.4, 0, 1), relax: 0.05, hold: 480, kind: 'tankers', cool: 120 });
  // power
  add('solar', 'Build 100 kW more solar', 'power', { solarKw: 220 }, { burden: 0.01, eff: (o) => (o.demandRatio > 0.8 ? 0.2 : 0.07), cool: 480, sunk: true, kind: 'supply' });
  add('battery', 'Add 400 kWh of grid battery', 'power', { batteryKwh: 800 }, { burden: 0.01, eff: (o) => (o.demandRatio > 0.8 ? 0.2 : 0.07), cool: 480, sunk: true, kind: 'storage' });
  // welfare
  add('cash_s', 'Cash relief: Rs 300 a day to the poorest 40% of households', 'welfare', { cashTransfer: 300, transferShare: 40 }, { burden: 0.01, eff: () => 0.28, relax: 0.08, hold: 1440, kind: 'cash', ladder: [{ cashTransfer: 150 }] });
  add('cash_l', 'Cash relief: Rs 700 a day to the poorest 60%', 'welfare', { cashTransfer: 700, transferShare: 60 }, { burden: 0.02, eff: () => 0.5, relax: 0.08, hold: 1440, kind: 'cash', ladder: [{ cashTransfer: 350 }, { cashTransfer: 150 }] });
  add('foodsub', 'Food subsidy: 20% off the basket', 'welfare', { foodSubsidy: 20 }, { burden: 0.01, eff: () => 0.2, relax: 0.08, hold: 1440, kind: 'subsidy', ladder: [{ foodSubsidy: 10 }] });
  add('wagesup', 'Wage support: the city pays half of lost wages', 'welfare', { wageSupport: 50 }, { burden: 0.01, eff: () => 0.28, relax: 0.08, hold: 1440, kind: 'wages', ladder: [{ wageSupport: 25 }] });
  // mothers and newborns
  add('rooms', 'Birth centre: 2 more delivery rooms', 'maternal', { birthRooms: 5 }, { burden: 0.01, eff: (o) => 0.05 + 0.4 * clamp(o.matLoad - 0.4, 0, 1), cool: 360, sunk: true, kind: 'rooms' });
  add('midwives', 'Birth centre: 4 more midwives', 'maternal', { midwives: 8 }, { burden: 0.01, eff: (o) => 0.05 + 0.35 * clamp(o.matLoad - 0.4, 0, 1), cool: 360, kind: 'midwives' });
  add('incub', 'Birth centre: 2 more incubators for early babies', 'maternal', { incubators: 4 }, { burden: 0.01, eff: () => 0.12, cool: 360, sunk: true, kind: 'incubators' });
  add('antenatal', 'Antenatal care drive: 75% of mothers', 'maternal', { antenatal: 75 }, { burden: 0.01, eff: () => 0.16, cool: 720, kind: 'care' });
  add('hospgen_m', 'Make sure the birth centre has backup power', 'maternal', { hospitalGenerator: true }, { burden: 0.005, eff: (o, w) => (w.maternal && w.maternal() && !w.maternal().power ? 0.45 : 0.04), kind: 'supply' });
  // the budget: funding actions (the finance officer proposes them when money is short or when another proposal cannot be paid for)
  add('fund_reserve', 'Use the emergency fund (up to 10 days of spending)', 'budget', null, { oneShot: true, fund: true, burden: 0.003, cool: 720, eff: (o) => ((o.cashDays < 12 || o.needFunds) && o.reserve > 0 ? 0.55 : 0), run: (ctx) => ctx.w.ecoUseReserve(10 * dayExp(ctx.w)), kind: 'fund' });
  add('fund_grant', 'Ask the province for a grant (10 days of spending; may be part or none)', 'budget', null, { oneShot: true, fund: true, burden: 0.003, cool: 4320, eff: (o) => (o.grantPending > 0 ? 0 : o.cashDays < 25 || o.needFunds ? 0.35 : 0), run: (ctx) => ctx.w.ecoRequestGrant(10 * dayExp(ctx.w)), kind: 'fund' });
  add('fund_borrow', 'Borrow from the bank (up to 12 days of spending)', 'budget', null, { oneShot: true, fund: true, big: true, burden: 0.02, cool: 1440, eff: (o) => ((o.cashDays < 15 || o.needFunds) ? 0.45 : 0), run: (ctx) => ctx.w.ecoBorrow(12 * dayExp(ctx.w)), kind: 'fund' });
  add('fund_levy', 'Emergency levy: property tax +30% for a while (a small yield)', 'budget', { taxRate: 130 }, { big: true, burden: 0.1, eff: (o) => ((o.cashDays < 20 || o.needFunds) ? 0.3 : 0), relax: 0.06, hold: 2880, kind: 'levy', ladder: [{ taxRate: 115 }] });
  add('fund_freeze', 'Freeze non-urgent spending', 'budget', { spendingFreeze: true }, { burden: 0.03, eff: (o) => ((o.cashDays < 20 || o.needFunds) ? 0.12 : 0), relax: 0.06, hold: 1440, kind: 'freeze' });
  add('fund_realloc', 'Move 20% of the education (or transport) budget to the department that is short', 'budget', null, { oneShot: true, fund: true, burden: 0.004, cool: 1440, eff: (o) => (o.needDept ? 0.32 : 0), run: (ctx) => { const w = ctx.w, to = w.mayorNeedDept || 'health', from = !w.params.schoolsOpen && to !== 'education' ? 'education' : to !== 'transport' ? 'transport' : 'education'; return w.ecoMove(from, to, 0.2); }, kind: 'fund' });
  add('fund_repay', 'Good times: repay debt and refill the emergency fund', 'budget', null, { oneShot: true, fund: true, burden: 0.001, cool: 2880, eff: (o) => (o.surplus > 0 && (o.debt > 0 || o.reserve < 1) ? 0.3 : 0), run: (ctx) => { const w = ctx.w, f = w.fiscal(), spare = Math.max(0, f.cash - 25 * f.dayExp); return [w.ecoRepay(Math.min(f.debt, spare)), w.ecoRefillReserve(Math.max(0, spare - f.debt))].join(' '); }, kind: 'fund' });
  /* packages: the strategist combines measures that work better together (with their own exit rules) */
  const CREATIVE = new Set(['filters', 'spray', 'weather', 'carfree', 'transit', 'tankers', 'storage', 'cash', 'subsidy', 'wages', 'vaccine', 'package']);
  for (const x of A) x.creative = CREATIVE.has(x.kind);
  const byId = (id) => A.find((x) => x.id === id);
  const pkg = (id, label, domain, parts, o) => {
    const sets = {}; let burden = 0; for (const pid of parts) { Object.assign(sets, byId(pid).sets); burden += byId(pid).burden; }
    add(id, 'Package: ' + label, domain, sets, Object.assign({ pkg: true, parts, big: true, burden: burden * 0.9, kind: 'package', creative: true, cool: 360,
      eff: (oo, w) => 0.9 * (1 - parts.reduce((m, pid) => m * (1 - fin(byId(pid).eff(oo, w), 0)), 1)) }, o || {}));
  };
  pkg('pk_smog', 'clean-air push (home purifiers, building filters, water-mist guns, free buses, odd-even, cloud seeding)', 'air', ['purif20', 'bldgfilt', 'spray', 'freebus', 'oddeven', 'seed_air'], { relax: 0.12, hold: 1440, sunset: 7 });
  pkg('pk_epi', 'protect and support (masks, test-and-isolate, vaccination drive, wage support)', 'health', ['masks70', 'quarantine', 'vax1', 'wagesup'], { relax: 0.05, hold: 1440, sunset: 14 });
  pkg('pk_hard', 'hardship support (cash relief, cheaper food, wage support)', 'welfare', ['cash_s', 'foodsub', 'wagesup'], { relax: 0.08, hold: 1440, sunset: 14 });
  pkg('pk_mother', 'safe births (rooms, midwives, incubators, antenatal care)', 'maternal', ['rooms', 'midwives', 'incub', 'antenatal'], { relax: null, big: false });
  pkg('pk_water', 'water relief (tankers, cloud seeding, saving campaign)', 'water', ['tankers', 'seed_water', 'water80'], { relax: 0.05, hold: 1440, sunset: 7 });
  // staged easing: measures that come down in steps before they are lifted
  const LADDER = { masks90: [{ masks: 70 }, { masks: 50 }], masks70: [{ masks: 50 }], wfh60: [{ distancing: 40 }, { distancing: 20 }], wfh40: [{ distancing: 20 }], slow30: [{ speedLimit: 40 }], dr45: [{ demandResponse: 30 }, { demandResponse: 15 }], dr30: [{ demandResponse: 15 }], water65: [{ waterPerCapita: 80 }], water80: [{ waterPerCapita: 90 }] };
  const SUNSET = { closure: 7, distancing: 10, behaviour: 14, masks: 21, testing: 21 };
  for (const x of A) { if (LADDER[x.id] && !x.ladder) x.ladder = LADDER[x.id]; if (x.sunset == null) x.sunset = SUNSET[x.kind] || 21; }
  const SUNK_KEYS = new Set(['purifiers', 'bldgFilters', 'sprayGuns', 'birthRooms', 'incubators', 'solarKw', 'batteryKwh', 'hospitalBeds', 'ambulances', 'gridCapacity', 'cleanKilns', 'wifiAps', 'challanCameras', 'leakRate', 'midwives', 'antenatal']);
  const ACT = Object.create(null); for (const a of A) ACT[a.id] = a;
  const inForce = (a, p) => {
    if (a.oneShot) return false;
    for (const k in a.sets) {
      const v = a.sets[k], d = DEF[k];
      if (typeof v === 'number') { if (d == null || v >= d) { if (!(p[k] >= v)) return false; } else if (!(p[k] <= v)) return false; } else if (p[k] !== v) return false;
    }
    return true;
  };
  const SETTLE = { health: 720, air: 180, roads: 360, power: 120, water: 180, net: 60, budget: 1440, welfare: 1440, maternal: 720 }; // minutes to wait for an action to show its effect
  const LS = 'ol_agent_lessons2';
  /* standing rules: after approval the CITY applies them by itself whenever conditions are met */
  const STANDING = { autoinspect: 1, aqiban: 1, smogschools: 1, lights: 1, motorway: 1, ploughs: 1 };
  const HARD_TO_UNDO = { cleankilns: 'switching kilns to zigzag is a costly, slow change for kiln owners' };
  for (const a of A) { a.standing = !!STANDING[a.id]; a.hard = HARD_TO_UNDO[a.id] || ''; }
  /* the agent team: four specialist officers, a coordinator, a safety reviewer, a forecaster and an auditor */
  const OFFICERS = [
    { id: 'health', name: 'Health officer', domains: ['health'] },
    { id: 'air', name: 'Air-quality officer', domains: ['air'] },
    { id: 'traffic', name: 'Traffic officer', domains: ['roads'] },
    { id: 'utilities', name: 'Utilities officer', domains: ['power', 'water', 'net'] },
    { id: 'finance', name: 'Finance officer', domains: ['budget'] },
    { id: 'welfare', name: 'Welfare officer', domains: ['welfare'] },
    { id: 'maternal', name: 'Birth-centre officer', domains: ['maternal'] },
  ];
  const OFFICER_OF = {}; for (const o of OFFICERS) for (const d of o.domains) OFFICER_OF[d] = o;
  const rsM = (v) => { const a = Math.abs(v); return (v < 0 ? '-' : '') + 'Rs ' + (a >= 1e9 ? (a / 1e9).toFixed(2) + ' bn' : a >= 1e6 ? (a / 1e6).toFixed(1) + ' M' : a >= 1e3 ? Math.round(a / 1e3) + ' k' : Math.round(a)); };
  const DEPT_OF = { health: 'health', air: 'environment', roads: 'safety', power: 'utilities', water: 'utilities', net: 'utilities', budget: 'admin', welfare: 'welfare', maternal: 'health' };
  /* the exit rule, in words: how and when a measure comes off */
  function exitText(a) {
    if (a.oneShot) return 'One-off action: nothing to lift.';
    if (a.sunk && !a.pkg) return 'Built or bought, so it stays; you can undo it by hand from the measures table.';
    if (a.relax == null) return 'No automatic exit: you lift it yourself from the measures table.';
    const steps = a.ladder && a.ladder.length ? `eases in ${a.ladder.length + 1} steps` : 'is lifted';
    return `${a.pkg ? 'Package ' : ''}${steps} when ${LABEL[a.domain].toLowerCase()} pressure stays under ${pc(a.relax)}% for ${Math.round((a.hold || 720) / 60)} h and is not rising${a.hard || a.standing ? '; asks you first (hard to undo)' : ''}. Review by you after ${a.sunset || 21} days at most.`;
  }
  const HORIZON = { health: 1440, air: 720, roads: 720, power: 360, water: 720, net: 180, budget: 1440, welfare: 1440, maternal: 1440 }; // forecaster look-ahead, minutes
  const EVERY_OK = [1, 5, 15, 30, 60, 360];
  const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
  const fin = (v, d) => (Number.isFinite(v) ? v : d);

  /* lessons come from browser storage, which anyone can edit: keep only sane numbers for known actions */
  function cleanLessons(L) {
    const out = {}; if (!L || typeof L !== 'object') return out;
    for (const id of Object.keys(L)) {
      if (!own(ACT, id)) continue; const l = L[id]; if (!l || typeof l !== 'object') continue;
      const n = Number(l.n), sum = Number(l.sum);
      if (!Number.isFinite(n) || !Number.isFinite(sum) || n < 1 || n > 100000) continue;
      const k = Math.round(n); out[id] = { n: k, sum: clamp(sum, -k, k), good: clamp(Math.round(fin(Number(l.good), 0)), 0, k), bad: clamp(Math.round(fin(Number(l.bad), 0)), 0, k) };
    }
    return out;
  }

  /* ---------- the agent ---------- */
  class Mayor {
    constructor(opt) {
      opt = opt || {};
      // simulation = a headless copy used by experiments; it may act on its own. The live agent never does.
      this.simulation = !!opt.simulation;
      this.strict = opt.strict != null ? !!opt.strict : !this.simulation;
      this.goal = 'balanced'; this.setGoal(opt.goal);
      this.every = 30; this.setEvery(opt.every == null ? 30 : opt.every);
      this.denyDays = 2; this.setDenyDays(opt.denyDays == null ? 2 : opt.denyDays);
      // safety switches cannot be flipped later from outside (e.g. the browser console)
      if (this.strict) { Object.defineProperty(this, 'strict', { value: true, writable: false, configurable: false, enumerable: true }); Object.defineProperty(this, 'simulation', { value: this.simulation, writable: false, configurable: false, enumerable: true }); }
      let aut = 'ask';
      Object.defineProperty(this, 'autonomy', { get: () => aut, set: (v) => { if ((this.strict ? ['ask', 'advise'] : ['auto', 'ask', 'advise']).includes(v)) aut = v; }, enumerable: true, configurable: false });
      this.setAutonomy(opt.autonomy || (this.strict ? 'ask' : 'auto'));
      this.guard = opt.guard !== false; this.triggers = opt.triggers !== false;
      this.evalH = clamp(Math.round(fin(Number(opt.evalH), 12)), 1, 72);
      this.emergencyAuto = !this.strict && !!opt.emergencyAuto;
      if (this.strict) Object.defineProperty(this, 'emergencyAuto', { value: false, writable: false, configurable: false });
      this.forecast = !!opt.forecast && typeof WorldClass.prototype.fork === 'function';
      this.forecastSync = !!opt.forecastSync; this.forecastTop = clamp(Math.round(fin(Number(opt.forecastTop), 3)), 1, 4);
      this.apply = typeof opt.apply === 'function' ? opt.apply : () => {};
      this.audit = opt.audit || (() => {}); this.quiet = !!opt.quiet; this.on = false;
      this.lessons = cleanLessons(opt.lessons);
      this.notify = opt.notify || (() => {});
      // kept across restarts of the simulation: your decisions
      this.ledger = []; this.ledSeq = 0; this.never = {}; this.deny = {}; this.epoch = 0; this.revSeq = 0; this.uid = 0; this.lastTick = 0;
      this.blocked = 0; this.faults = 0; this.lastFault = ''; this.userSet = {}; this.fq = [];
      this.clear(true);
    }
    /* ---- validated settings ---- */
    setAutonomy(v) { this.autonomy = v; return this.autonomy === v; }
    setEvery(v) { const n = parseInt(v, 10); this.every = EVERY_OK.includes(n) ? n : EVERY_OK.reduce((b, x) => (Math.abs(x - n) < Math.abs(b - n) ? x : b), 30); return this.every; }
    setDenyDays(v) { const n = parseInt(v, 10); this.denyDays = Number.isFinite(n) ? clamp(n, 1, 5) : 2; return this.denyDays; }
    setGoal(v) { this.goal = own(GOALS, v) ? v : 'balanced'; return this.goal; }
    clear(first) {
      // a restart starts a new day 0: timed denials keep the time they had left; "never" stays
      if (!first) {
        this.epoch++;
        for (const id of Object.keys(this.deny)) { const e = this.deny[id], left = Math.max(60, e.returnAt - this.lastTick); e.t = 0; e.returnAt = left; }
        for (const k of Object.keys(this.userSet)) this.userSet[k].t -= this.lastTick; // keep "how long ago" right on the new clock
        this.led('restart', null, 'Simulation restarted: proposals withdrawn; your deny list and "never" list are kept');
      }
      this.log = []; this.pending = []; this.measures = []; this.lastAct = {}; this.lastDomAct = {}; this.lowSince = {}; this.lastRaise = {}; this.edge = {};
      this.memo = {}; this.tr = {}; for (const k of DOM) this.tr[k] = new Track(0.12); for (const k of ['aqiMax', 'bedLoad', 'infPct', 'demandRatio', 'tank', 'cashDays']) this.tr[k] = new Track(0.12);
      this.shown = {}; this.needFunds = null; this.needDept = null; this.exitAuto = false;
      this.hist = []; this.lastDelib = -1e9; this.nDelib = 0; this.acts = 0; this.minutes = 0; this.warnings = []; this.U = {}; this.tier = {}; this.cause = {}; this.lastTop = {}; this.lastLine = ''; this.lastHour = -1;
      this.denied = 0; this.reraised = 0; this.approved = 0; this.trigCount = 0; this.o = null; this.lastBrief = -1; this.sinceAsk = {}; this.badReads = []; this.lastTick = 0; this.fq = []; this.deathsSeen = 0;
    }
    say(kind, text, tick) { if (this.quiet) return; this.log.unshift({ kind, text, t: tick }); if (this.log.length > 400) this.log.length = 400; }
    /* the auditor's ledger: every decision, by whom, when */
    led(what, x, detail, extra) {
      const e = Object.assign({ n: ++this.ledSeq, t: this.lastTick, clock: dayClock(this.lastTick), run: this.epoch + 1, what, id: x ? x.id : '', label: x ? x.label : '', domain: x ? x.domain || '' : '', detail: detail || '' }, extra || {});
      this.ledger.unshift(e); if (this.ledger.length > 2000) this.ledger.length = 2000; return e;
    }
    prio(id) { const l = this.lessons[id]; return l && l.n ? clamp(fin(1 - (l.sum / l.n) * 4, 1), 0.4, 1.6) : 1; }
    explore(id) { const l = this.lessons[id]; return 1 + 0.3 / (1 + (l ? l.n : 0)); }
    slope(k) { return fin(this.tr[k].slope, 0); }
    sm(k) { return this.tr[k].v == null ? 0 : this.tr[k].v; }
    /* the page tells the agent about changes YOU made, so it does not quietly undo your choices */
    noteUser(k, v, tick) { if (typeof k === 'string') this.userSet[k] = { v, t: fin(tick, this.lastTick) }; }

    /* ----- every minute ----- */
    step(w) {
      try { return this._step(w); } catch (e) { this.fault(w, e); return null; }
    }
    fault(w, e) {
      this.faults++; this.lastFault = String((e && e.message) || e);
      this.say('alarm', `Internal error, the agent paused itself for safety: ${this.lastFault}. Nothing in the city was changed. Switch it on again to retry.`, w ? w.tick : null);
      this.led('fault', null, this.lastFault); this.stop(w, 'internal error');
    }
    stop(w, why) {
      const n = this.pending.length; this.on = false; this.pending = []; this.fq = [];
      if (n) this.say('ask', `Agent off${why ? ' (' + why + ')' : ''}: ${n} open proposal${n === 1 ? '' : 's'} withdrawn. Measures already approved stay in force.`, w ? w.tick : null);
    }
    _step(w) {
      const o = observe(w, this.memo); this.lastTick = w.tick;
      // sensor check: a broken reading is ignored and remembered (the safety reviewer reports it)
      let bad = 0; for (const k of DOM) if (!Number.isFinite(o[k])) { bad++; o[k] = this.sm(k); }
      for (const k of ['aqi', 'aqiMax', 'bedLoad', 'infPct', 'demandRatio', 'tank']) if (!Number.isFinite(o[k])) { bad++; o[k] = k === 'aqi' || k === 'aqiMax' ? this.sm('aqiMax') : this.sm(k) || 0; }
      if (bad) { this.badReads.push(w.tick); if (this.badReads.length > 50) this.badReads.shift(); }
      o.needFunds = this.needFunds && w.tick - this.needFunds.t < 720 ? 1 : 0;
      o.needDept = this.needDept && w.tick - this.needDept.t < 720 ? 1 : 0; w.mayorNeedDept = o.needDept ? this.needDept.dept : null;
      this.o = o; this.minutes++;
      for (const k of DOM) this.tr[k].push(o[k]);
      this.tr.cashDays.push(Math.min(o.cashDays, 400)); this.tr.aqiMax.push(o.aqiMax); this.tr.bedLoad.push(o.bedLoad); this.tr.infPct.push(o.infPct); this.tr.demandRatio.push(o.demandRatio); this.tr.tank.push(o.tank);
      const sm = {}; for (const k of DOM) sm[k] = this.sm(k);
      const J = costOf(sm, this.goal);
      if (w.tick % 10 === 0) { this.hist.push({ t: w.tick, J, B: burdenOf(w.params), o: Object.assign({}, sm) }); if (this.hist.length > 2500) this.hist.shift(); }
      this.reflect(w, sm);
      if (!this.on) return o;
      const hr = Math.floor(w.tick / 60);
      if (hr !== this.lastHour) { this.lastHour = hr; this.hourly(w, o, sm, J); }
      const trig = this.triggers ? this.detect(w, o) : null;
      if (trig) { this.trigCount++; this.say('alarm', trig, w.tick); this.notify('alarm', trig); }
      if (this.minutes < 30) return o; // let the sensors warm up before judging
      if (trig || w.tick - this.lastDelib >= this.every) this.deliberate(w, o, sm, trig);
      if (this.forecastSync) this.pumpForecasts(w, 1e9);
      return o;
    }
    sensorsBad(w) { return this.badReads.filter((t) => w.tick - t <= 60).length; }
    edgeOn(key, cond) { const was = this.edge[key]; this.edge[key] = !!cond; return cond && !was; }
    detect(w, o) {
      const t = [];
      if (this.edgeOn('aqi200', o.aqiMax >= 200)) t.push(`Air quality forecast passed 200 (now ${Math.round(o.aqi)}, peak ${Math.round(o.aqiMax)})`);
      if (this.edgeOn('aqi300', o.aqiMax >= 300)) t.push('Air quality forecast passed 300: hazardous');
      if (this.edgeOn('inf1', o.infPct >= 1)) t.push(`Infections passed 1% of the city (${o.infPct.toFixed(1)}%)`);
      if (this.edgeOn('inf5', o.infPct >= 5)) t.push(`Infections passed 5% of the city (${o.infPct.toFixed(1)}%)`);
      if (this.edgeOn('inf15', o.infPct >= 15)) t.push(`Infections passed 15% of the city (${o.infPct.toFixed(1)}%)`);
      if (this.edgeOn('bed80', o.bedLoad >= 0.8)) t.push(`Hospital is ${pc(o.bedLoad)}% full`);
      if (this.edgeOn('bed100', o.bedLoad >= 1)) t.push('Hospital is full: new patients have no bed');
      if (o.deaths > this.deathsSeen) { t.push(`${o.deaths} death${o.deaths > 1 ? 's' : ''} so far`); this.deathsSeen = o.deaths; }
      if (this.edgeOn('outage', w.en.outageUntil > w.tick)) t.push('Grid outage has started');
      if (this.edgeOn('overload', o.demandRatio >= 0.95)) t.push(`Power demand is ${pc(o.demandRatio)}% of grid capacity`);
      if (this.edgeOn('tank', o.tank < 0.25)) t.push(`Water tank down to ${pc(o.tank)}%`);
      if (this.edgeOn('storm', w.weather === 'storm' || (o.rain > 0.6 && w.lightningNow))) t.push('Storm over the city');
      if (this.edgeOn('snow', o.snow > 0.2)) t.push('Snow is settling on the roads');
      if (this.edgeOn('fog', o.fog > 0.5)) t.push('Thick fog');
      const a0 = this.memo.accHist; if (a0 && a0.length) { const recent = a0.filter((x) => w.tick - x.t <= 120); if (recent.length >= 2 && this.edgeOn('accs', w.stats.accidents - recent[0].n >= 3)) t.push('Three or more accidents in two hours'); }
      if (w.eco) {
        if (this.edgeOn('cash10', o.cashDays < 10)) t.push(`Treasury is down to ${Math.max(0, Math.round(o.cashDays))} days of spending`);
        if (this.edgeOn('cash0', o.cashDays < 0)) t.push('The treasury is overdrawn: bills are going unpaid');
        if (this.edgeOn('distress15', o.distress >= 0.15)) t.push(`${pc(o.distress)}% of households are out of savings`);
        if (this.edgeOn('cpi120', o.cpi >= 1.2)) t.push(`Cost of living is up ${pc(o.cpi - 1)}%`);
        const mt = w.maternal && w.maternal(); if (mt) { const seen = this.memo.turnSeen || 0; if (mt.turnedAway > seen) t.push(`${mt.turnedAway - seen} mother${mt.turnedAway - seen > 1 ? 's' : ''} in labour could not use the birth centre`); this.memo.turnSeen = mt.turnedAway; const nd = mt.neoDeaths + mt.matDeaths, sn = this.memo.natSeen || 0; if (nd > sn) t.push('A mother or newborn died around birth'); this.memo.natSeen = nd; }
      }
      if (this.edgeOn('sensors', this.sensorsBad(w) >= 3)) t.push('Several sensor readings were invalid in the last hour');
      return t.length ? t.join('; ') : null;
    }
    hourly(w, o, sm, J) {
      const line = `Hour check. Pressure ${pc(J)}%. ${this.diagnose(sm)}. AQI ${Math.round(o.aqi)} (peak ahead ${Math.round(o.aqiMax)}), ${o.infPct.toFixed(1)}% infected, hospital ${pc(o.bedLoad)}% full, power ${pc(o.demandRatio)}% of capacity.`;
      if (w.tick % 360 === 0 || line.replace(/[\d.]+/g, '#') !== this.lastLine) { this.say('watch', line, w.tick); this.lastLine = line.replace(/[\d.]+/g, '#'); }
      if (w.tick % 1440 === 0 && w.tick > 0 && this.lastBrief !== w.tick) { this.lastBrief = w.tick; this.brief(w, o); }
    }
    brief(w, o) {
      const c = w.counts(), st = w.stats;
      this.say('brief', `Morning briefing, ${dayClock(w.tick)}: ${c.I + c.E} people exposed or infectious, ${c.D + c.X} dead in total, ${st.accidents} accidents so far. You approved ${this.approved} action${this.approved === 1 ? '' : 's'} and denied ${this.denied}; ${this.pending.length} proposal${this.pending.length === 1 ? '' : 's'} wait for you.`, w.tick);
    }
    diagnose(sm) { const parts = DOM.filter((k) => sm[k] > 0.15).sort((a, b) => sm[b] - sm[a]).map((k) => `${LABEL[k].toLowerCase()} ${pc(sm[k])}%`); return parts.length ? 'Under pressure: ' + parts.join(', ') : 'Nothing needs attention'; }

    /* ----- root causes, in words (each officer explains its own area) ----- */
    explain(d, o, w) {
      if (d === 'air') {
        const s = o.src, top = Object.keys(s).sort((a, b) => s[b] - s[a])[0], nm = { kiln: 'brick kilns', dust: 'construction dust', factory: 'factory chimneys', traffic: 'traffic exhaust' };
        const trap = o.wind < 1.5 || o.fog > 0.4 ? ` The air is trapped (${o.fog > 0.4 ? 'fog' : 'light wind'}${o.wind < 1.5 ? ', wind ' + o.wind.toFixed(1) + ' m/s' : ''}).` : '';
        return `AQI ${Math.round(o.aqi)}; the biggest estimated source is ${nm[top]} (${pc(s[top])}%).` + trap;
      }
      if (d === 'health') { const r = w.rt && w.rt(); const g = this.slope('infPct'); return `${o.infPct.toFixed(1)}% infected${g > 0.05 ? ' and rising ' + g.toFixed(1) + ' points per hour' : g < -0.05 ? ' and falling' : ''}${r != null && Number.isFinite(r) ? '; each case infects about ' + r.toFixed(1) + ' others' : ''}; hospital ${pc(o.bedLoad)}% full.`; }
      if (d === 'roads') return `${Math.round(o.acc24)} accidents per day lately; ${o.fog > 0.4 ? 'fog, ' : ''}${o.rain > 0.3 ? 'rain, ' : ''}${o.snow > 0.1 ? 'snow, ' : ''}road hazard ${pc(o.hazard)}%.`;
      if (d === 'power') return `Demand is ${pc(o.demandRatio)}% of grid capacity${w.en.outageUntil > w.tick ? ' during a grid outage' : ''}; homes get ${pc(w.en.ratio.home)}% of what they need.`;
      if (d === 'water') return `Tank at ${pc(o.tank)}%; ${pc(w.wa.demand > 0 ? w.wa.unmet / w.wa.demand : 0)}% of demand unmet.`;
      if (d === 'budget') { const f = w.fiscal ? w.fiscal() : null; if (!f) return 'The economy layer is off.'; return `Treasury Rs ${Math.round(f.cash / 1e6)}M (${f.cash < 0 ? 'overdrawn' : Math.round(o.cashDays) + ' days of spending'}), emergency fund Rs ${Math.round(f.reserve / 1e6)}M, debt Rs ${Math.round(f.debt / 1e6)}M; income Rs ${Math.round(f.dayRev / 1e6)}M a day against spending Rs ${Math.round(f.dayExp / 1e6)}M${f.arrears > 0 ? '; unpaid bills Rs ' + Math.round(f.arrears / 1e6) + 'M' : ''}. Public trust ${pc(f.trust)}%.`; }
      if (d === 'welfare') return `${pc(o.distress)}% of households are in distress (out of savings); the cost-of-living index is ${(o.cpi * 100).toFixed(0)}.`;
      if (d === 'maternal') { const m = w.maternal ? w.maternal() : null; if (!m) return 'No data.'; return `${m.pregnant} women are pregnant, ${m.dueSoon} due soon, for ${m.rooms} delivery rooms and ${m.midwives} midwives${m.power ? '' : '; the hospital has no power'}; ${m.turnedAway} mothers were turned away so far.`; }
      return `Wi-Fi coverage ${w.wifi ? Math.round(w.wifi.coverage) : '?'}%.`;
    }

    /* ----- plan: urgency per area, ranked options with alternatives ----- */
    urgency(w, o, sm) {
      const U = {}, tier = {};
      for (const k of DOM) {
        const s = this.sm(k), sl = this.slope(k), look = k === 'health' ? 12 : 3, proj3 = clamp(s + sl * look, 0, 1), proj6 = clamp(s + sl * 6, 0, 1);
        U[k] = Math.max(s, proj3);
        let t = U[k] >= 0.45 ? 'high' : U[k] >= 0.25 ? 'normal' : U[k] >= 0.12 ? 'low' : 'none';
        if (s >= 0.7 || (proj6 >= 0.9 && sl > 0.02 && s >= 0.5)) t = 'emergency';
        if (k === 'health' && o.bedLoad >= 1 && this.slope('infPct') > 0) t = 'emergency';
        if (k === 'air' && o.aqiMax >= 300) t = 'emergency';
        tier[k] = t;
      }
      if (w.eco) {
        // a proposal that cannot be paid for makes money a live question; a surplus after a crisis is a chance to repay
        if ((o.needFunds || o.needDept) && U.budget < 0.3) { U.budget = 0.3; if (tier.budget === 'none' || tier.budget === 'low') tier.budget = 'normal'; }
        else if (o.surplus > 0 && (o.debt > 0 || o.reserve < 1) && U.budget < 0.15) { U.budget = 0.15; if (tier.budget === 'none') tier.budget = 'low'; }
      }
      return { U, tier };
    }
    options(w, o, d, U, tier) {
      const p = w.params, g = GOALS[this.goal] || GOALS.balanced, gsum = DOM.reduce((a, k) => a + g[k], 0), now = w.tick, out = [];
      // measures already in force overlap with new ones: each new option removes less of what is left
      const cover = {}; for (const b of A) if (b.domain === d && !b.oneShot && inForce(b, p)) { const e = fin(b.eff(o, w), 0); if (e > (cover[b.kind] || 0)) cover[b.kind] = e; }
      const covered = Object.keys(cover).reduce((x, k) => x + cover[k], 0), overlap = 1 / (1 + 1.2 * covered);
      for (const a of A) {
        if (a.domain !== d) continue;
        if (this.never[a.id]) continue; // you said never
        if (now - (this.lastAct[a.id] == null ? -1e9 : this.lastAct[a.id]) < a.cool) continue;
        if (!a.oneShot && inForce(a, p)) continue;
        if (this.measures.some((m) => m.id === a.id && m.live)) continue;
        let eff = fin(a.eff(o, w), 0) * (a.kind === 'capacity' || a.kind === 'supply' || a.kind === 'alert' ? 1 : overlap); if (!(eff > 0.02)) continue;
        const dn = this.deny[a.id]; let reraise = false;
        if (dn) {
          if (tier === 'emergency' && now - (this.lastRaise[a.id] == null ? -1e9 : this.lastRaise[a.id]) >= 360) reraise = true; else continue;
        }
        const learn = this.prio(a.id), bonus = this.explore(a.id), wd = g[d] / gsum;
        const benefit = U * eff * learn * bonus * wd;
        const fz = this.fiscalOf(w, a, o);
        const cost = a.burden * MU * (1 - 0.4 * U) + (fz ? fz.score : 0);
        const score = benefit - cost;
        if (!Number.isFinite(score) || score <= (a.creative ? -0.03 : 0.003)) continue;
        out.push({ id: a.id, label: a.label, kind: a.kind, big: !!a.big, pkg: !!a.pkg, creative: !!a.creative, near: score <= 0.003, parts: a.parts ? a.parts.map((id) => ACT[id].label) : null, standing: !!a.standing, hard: a.hard, domain: d, score, benefit, pred: U * eff * learn, burden: a.burden, cost: fz, exit: exitText(a), reraise, why: `expected to remove about ${pc(U * eff * learn)} points of ${LABEL[d].toLowerCase()} pressure; burden ${(a.burden * 100).toFixed(0)}/100; net value ${(score * 100).toFixed(1)}` });
      }
      out.sort((x, y) => y.score - x.score);
      // keep alternatives different in kind (e.g. not three mask levels)
      const good = out.filter((c) => !c.near), seen = new Set(), pick = [];
      for (const c of good) { if (seen.has(c.kind) && pick.length >= 1 && pick.length < 4 && good.length > 4) continue; seen.add(c.kind); pick.push(c); if (pick.length >= 4) break; }
      // the strategist always slips in one out-of-the-box idea when the area is under real pressure, with its honest price
      if (good.length || tier === 'high' || tier === 'emergency') {
        const rank = (c) => c.score - 0.008 * Math.min(10, this.shown[c.id] || 0); // an idea that was shown often steps aside for a fresh one
        const crs = out.filter((c) => c.creative).sort((a, b) => rank(b) - rank(a));
        { const have = pick.filter((c) => c.creative && !c.near), fresh = crs.find((c) => !pick.includes(c)); if (have.length && fresh && have.every((c) => (this.shown[c.id] || 0) >= 3) && (this.shown[fresh.id] || 0) < 2) pick[pick.indexOf(have[have.length - 1])] = fresh; } // a creative idea shown 3 times makes room for a fresh one
        if (!pick.some((c) => c.creative)) { const cr = crs.find((c) => !pick.includes(c)); if (cr) { if (pick.length >= 4) pick[pick.length - 1] = cr; else pick.push(cr); } }
        if ((tier === 'high' || tier === 'emergency') && pick.filter((c) => c.creative).length < 2) { const cr = crs.find((c) => !pick.includes(c)); if (cr) { if (pick.length >= 5) pick[pick.length - 1] = cr; else pick.push(cr); } }
      }
      if (!pick.length) return pick;
      const top = pick[0];
      for (const c of pick) c.note = c === top ? 'best score' : c.near ? 'out-of-the-box idea: it costs more than it removes today, but it builds protection for later' : c.creative && c.score < top.score ? 'out-of-the-box alternative' : (c.burden > top.burden ? 'heavier burden than the top pick' : c.pred < top.pred ? 'weaker expected effect' : 'close alternative');
      return pick;
    }

    /* ----- v17: what will it cost, and can the city pay? ----- */
    fiscalOf(w, a, o, fresh) {
      if (!w.eco || typeof w.ecoPreview !== 'function' || a.fund) return null;
      const memo = this.memo.cc || (this.memo.cc = {}), hr = Math.floor(w.tick / 60), key = a.id;
      if (!fresh && memo[key] && memo[key].hr === hr) return memo[key].v;
      const f = w.fiscal(), pv = a.sets ? w.ecoPreview(a.sets) : { once: 0, perDay: 0, revLoss: 0 };
      const ongoing = pv.perDay + pv.revLoss, cashAfter = f.cash - pv.once, deficit = f.dayExp - f.dayRev + ongoing;
      const runway = deficit <= 0 ? 999 : Math.max(0, cashAfter) / deficit;
      const dep = DEPT_OF[a.domain], plan = w.eco.gov.plan[dep] || 1, deptPct = pv.perDay / plan;
      let level = 'fine', why = '';
      if (pv.once > Math.max(0, f.cash)) { level = 'nofunds'; why = `needs ${rsM(pv.once)} now but the treasury has ${rsM(Math.max(0, f.cash))}`; }
      else if (cashAfter < 0) { level = 'nofunds'; why = 'would overdraw the treasury'; }
      else if (runway < 10) { level = 'over'; why = `would leave only ${Math.round(runway)} days of money at the new daily deficit`; }
      else if (deptPct > 0.35 && pv.perDay > 0.02 * f.dayExp) { level = 'over'; why = `would raise the ${dep} department's daily spending by ${pc(deptPct)}%`; }
      else if (runway < 30 || pv.once > 0.5 * Math.max(1, f.cash)) { level = 'tight'; why = runway < 30 ? `treasury would last about ${Math.round(runway)} days` : 'uses over half of the treasury'; }
      const norm = Math.max(1, f.dayRev) * 90, press = 1 + 2 * (o ? o.budget : 0);
      const score = clamp(0.6 * press * (pv.once + 7 * Math.max(0, ongoing)) / norm, 0, 1);
      const v = { once: pv.once, perDay: pv.perDay, revLoss: pv.revLoss, level, why, runway, deptPct, dept: dep, score, text: `${pv.once > 0 ? 'one-off ' + rsM(pv.once) : ''}${pv.once > 0 && ongoing !== 0 ? ' and ' : ''}${ongoing > 0 ? rsM(ongoing) + ' a day' + (pv.revLoss > 0 ? ' (incl. ' + rsM(pv.revLoss) + ' lost income)' : '') : ongoing < 0 ? 'brings in ' + rsM(-ongoing) + ' a day' : ''}` || 'no extra cost' };
      memo[key] = { hr, v }; return v;
    }
    /* the Finance officer: a proposal nobody can pay for makes money the question of the day */
    noteUnaffordable(w, d, opts) {
      const top = opts[0]; if (!w.eco || !top || !top.cost) return;
      if (top.cost.level === 'nofunds') this.needFunds = { t: w.tick, for: top.label, amount: top.cost.once };
      else if (top.cost.level === 'over' && top.cost.deptPct > 0.35) this.needDept = { t: w.tick, dept: top.cost.dept };
    }

    /* ----- the safety reviewer: checks every option before you see it ----- */
    review(w, d, tier, x) {
      const p = w.params, a = ACT[x.id], notes = []; let level = 'ok';
      const caution = (t) => { notes.push({ type: 'caution', text: t }); level = 'caution'; }, note = (t) => notes.push({ type: 'note', text: t });
      if (!a) return { level: 'caution', notes: [{ type: 'caution', text: 'Unknown action.' }] };
      if (a.sets) {
        const b0 = burdenOf(p), b1 = burdenOf(Object.assign({}, p, a.sets));
        if (b1 > 0.35) caution(`Together with what is already in force, restrictions on people would reach ${pc(b1)}/100 (now ${pc(b0)}).`);
        for (const k of Object.keys(a.sets)) { const u = this.userSet[k]; if (u && w.tick - u.t < 1440 && u.v !== a.sets[k]) caution(`You set "${k}" yourself at ${dayClock(u.t)}; this would override your choice.`); }
      }
      if (x.cost) {
        const c = x.cost;
        if (c.level === 'nofunds') caution(`No money for this now: ${c.why}. The finance officer can raise funds first.`);
        else if (c.level === 'over') caution(`Budget check: ${c.why}.`);
        else if (c.level === 'tight') caution(`Budget is tight: ${c.why}.`);
        else if (c.runway < 999 && c.perDay + c.revLoss > 0) note(`At the new daily balance the treasury would last about ${Math.round(c.runway)} days.`);
      }
      if (x.pkg) caution('A package changes several things at once. Read every part below before you approve.');
      if (a.kind === 'closure' && w.eco && (p.wageSupport || 0) === 0 && (p.cashTransfer || 0) === 0 && (w.fiscal().distress > 0.1)) note('Households are already short of money and no relief is running: a closure will push more of them into distress.');
      if (a.big) caution('Big decision for people\'s daily lives.');
      if (a.standing) note('Standing rule: after you approve, the city applies it by itself whenever the condition is met, until you lift it.');
      if (a.hard) note(`Hard to undo: ${a.hard}.`);
      if (a.kind === 'closure' || a.kind === 'distancing') note('Hits daily-wage workers, students and shopkeepers hardest; keep it as short as possible.');
      const s = this.sm(d); if (s < 0.25 && tier !== 'emergency') note(`Based partly on the trend: ${LABEL[d].toLowerCase()} pressure is ${pc(s)}% now.`);
      if (this.sensorsBad(w)) caution(`${this.sensorsBad(w)} sensor reading${this.sensorsBad(w) === 1 ? ' was' : 's were'} invalid in the last hour; the picture may be wrong.`);
      for (const id of Object.keys(this.deny)) { const b = ACT[id]; if (b && b.kind === a.kind && id !== a.id) note(`You denied a similar measure ("${b.label}") at ${dayClock(this.deny[id].t)}.`); }
      if (x.reraise) caution(`You denied this at ${dayClock(this.deny[a.id] ? this.deny[a.id].t : 0)}; it is back only because ${LABEL[d].toLowerCase()} is now an emergency.`);
      if (x.fc) { if (x.fc.dC < -0.002) caution(`Forecaster: in a copy of the city it did worse over the next ${Math.round(x.fc.h / 60)} h (net ${(x.fc.dC * 100).toFixed(1)} points${x.fc.dCash ? '; treasury ' + (x.fc.dCash >= 0 ? '+' : '') + rsM(x.fc.dCash) : ''}).`); else if (x.fc.dJ <= 0.0005) note(`Forecaster: no visible effect on harm in the next ${Math.round(x.fc.h / 60)} h (some measures act slowly).`); }
      return { level, notes };
    }
    needsConfirm(x) { return !!(x.big || x.pkg || x.standing || x.hard || (x.cost && x.cost.level !== 'fine') || (x.review && x.review.level === 'caution')); }

    deliberate(w, o, sm, trig) {
      this.lastDelib = w.tick; this.nDelib++;
      // deny list expiry
      for (const id of Object.keys(this.deny)) if (w.tick >= this.deny[id].returnAt) { this.say('ask', `Deny list: "${this.deny[id].label}" may be offered again (its ${this.deny[id].days || this.denyDays}-day pause is over).`, w.tick); this.led('deny expired', { id, label: this.deny[id].label, domain: this.deny[id].domain }); delete this.deny[id]; }
      const { U, tier } = this.urgency(w, o, sm); this.U = U; this.tier = tier;
      this.warn(w, o);
      for (const d of DOM) this.cause[d] = tier[d] === 'none' ? '' : this.explain(d, o, w);
      let made = 0;
      const live = new Set();
      const order = DOM.slice().sort((a, b) => TIERS.indexOf(tier[b]) - TIERS.indexOf(tier[a]) || U[b] - U[a]);
      for (const d of order) {
        if (tier[d] === 'none') continue;
        const opts = this.options(w, o, d, U[d], tier[d]);
        if (!opts.length) continue;
        live.add(d);
        const top = opts[0];
        const sig = d + tier[d] + opts.map((x) => x.id).join(',');
        if (this.lastTop[d] !== sig && (tier[d] !== 'low' || w.tick % 360 === 0)) { this.lastTop[d] = sig; this.say('plan', `${OFFICER_OF[d].name} on ${LABEL[d].toLowerCase()} (${tier[d]}): ${this.cause[d]} Options: ${opts.map((x, i) => `${i + 1}. ${x.label} (net value ${(x.score * 100).toFixed(1)})`).join('  ')}`, w.tick); }
        const reraise = top.reraise;
        if (this.strict || this.autonomy !== 'auto') { this.propose(w, d, tier[d], opts, this.autonomy === 'advise' ? 'advice' : reraise ? 'reraise' : 'ask'); continue; }
        // ---- simulation only (benchmark copies): the agent may act on its own
        const needAsk = reraise || (this.guard && top.big && !(tier[d] === 'emergency' && this.emergencyAuto));
        const gap = (SETTLE[d] || 120) * (tier[d] === 'emergency' ? 0.5 : 1), trending = this.slope(d) > -0.003 || U[d] >= 0.7;
        if (needAsk) this.propose(w, d, tier[d], opts, reraise ? 'reraise' : 'ask');
        else if (made < 2 && w.tick - (this.lastDomAct[d] == null ? -1e9 : this.lastDomAct[d]) >= gap && trending && (tier[d] !== 'low') && top.score >= 0.004) { this.act(w, ACT[top.id], o, top, false); this.lastDomAct[d] = w.tick; made++; }
        else this.propose(w, d, tier[d], opts, 'ask', true);
      }
      // withdraw proposals that are no longer needed
      this.pending = this.pending.filter((q) => { if (q.kind === 'lift' || live.has(q.domain)) return true; if (q.tier !== 'low') this.say('ask', `Withdrawn (no longer needed): ${q.options[0].label}.`, w.tick); return false; });
      this.escalate(w);
    }
    propose(w, d, tier, opts, mode, quiet) {
      let q = this.pending.find((x) => x.key === d);
      this.noteUnaffordable(w, d, opts);
      const raised = mode === 'reraise';
      if (opts[0].reraise) for (const x of opts) if (x.reraise) this.lastRaise[x.id] = w.tick;
      // keep forecasts already made for options that are still offered
      if (q) for (const x of opts) { const old = q.options.find((y) => y.id === x.id); if (old && old.fc) x.fc = old.fc; }
      for (const x of opts) x.review = this.review(w, d, tier, x);
      if (q) {
        const changed = q.options.map((x) => x.id).join(',') !== opts.map((x) => x.id).join(',') || q.tier !== tier;
        q.options = opts; q.tier = tier; q.mode = mode; q.why = this.cause[d]; q.updated = w.tick;
        if (changed) { for (const x of opts) if (x.creative) this.shown[x.id] = (this.shown[x.id] || 0) + 1; q.rev = ++this.revSeq; q.fcAdvice = null; this.queueForecast(w, q); if (!quiet) this.say('ask', `Updated proposal for ${LABEL[d].toLowerCase()} (${tier}): ${opts[0].label}.`, w.tick); }
        return;
      }
      for (const x of opts) if (x.creative) this.shown[x.id] = (this.shown[x.id] || 0) + 1;
      q = { key: d, kind: 'act', domain: d, officer: (opts[0].pkg ? 'Strategist with the ' + OFFICER_OF[d].name.toLowerCase() : OFFICER_OF[d].name), tier, options: opts, mode, why: this.cause[d], since: w.tick, updated: w.tick, rev: ++this.revSeq };
      this.pending.push(q); this.queueForecast(w, q);
      if (raised) { this.reraised++; this.say('ask', `RE-RAISED because it is now an emergency: ${opts[0].label}. You denied this earlier. ${this.cause[d]}`, w.tick); this.notify('emergency', `Emergency: ${opts[0].label}`); this.led('re-raised', opts[0], `${LABEL[d]} became an emergency`); }
      else if (tier !== 'low') this.say('ask', mode === 'advice' ? `Suggests for ${LABEL[d].toLowerCase()} (${tier}): ${opts[0].label}${opts.length > 1 ? ', or ' + opts.slice(1).map((x) => x.label).join('; or ') : ''}.` : `${OFFICER_OF[d].name} asks you about ${LABEL[d].toLowerCase()} (${tier}): ${opts[0].label}${opts.length > 1 ? ' (' + (opts.length - 1) + ' alternatives)' : ''}.`, w.tick);
      if (tier === 'emergency') this.notify('emergency', `${LABEL[d]} emergency: waiting for your decision`);
    }
    escalate(w) {
      for (const q of this.pending) {
        if (q.tier !== 'emergency' || q.mode === 'advice') continue;
        const wait = w.tick - q.since;
        if (wait >= 180 && !q.nagged) { q.nagged = true; this.say('alarm', `Emergency in ${LABEL[q.domain].toLowerCase()} has been waiting ${Math.round(wait / 60)} h for your decision. Nothing is done without you.`, w.tick); this.notify('emergency', 'Emergency proposal unanswered for 3 hours'); }
      }
    }
    warn(w, o) {
      const W = [], add = (x) => W.push(x);
      const bs = this.slope('bedLoad'), bl = this.sm('bedLoad'); if (bs > 0.002 && bl < 1) { const h = (1 - bl) / bs; if (h < 48) add({ text: `Hospital beds likely full in about ${h < 1 ? '<1' : Math.round(h)} h at this pace`, eta: h }); }
      const as = this.slope('aqiMax'), al = this.sm('aqiMax'); if (as > 1 && al < 300) { const h = (300 - al) / as; if (h < 24) add({ text: `Air quality may reach 300 in about ${Math.round(h)} h`, eta: h }); }
      const is = this.slope('infPct'), il = this.sm('infPct'); if (is > 0.05 && il > 0.2) { const h = il / is * 0.69; if (h < 72) add({ text: `Infections may double in about ${Math.round(h)} h`, eta: h }); }
      const ds = this.slope('demandRatio'), dl = this.sm('demandRatio'); if (ds > 0.01 && dl < 1) { const h = (1 - dl) / ds; if (h < 12) add({ text: `Power demand may reach grid capacity in about ${h < 1 ? '<1' : Math.round(h)} h`, eta: h }); }
      const ts = this.slope('tank'), tl = this.sm('tank'); if (ts < -0.01 && tl > 0.1) { const h = (tl - 0.1) / -ts; if (h < 24) add({ text: `Water tank may drop below 10% in about ${Math.round(h)} h`, eta: h }); }
      const cs = this.slope('cashDays'), cd = this.sm('cashDays'); if (w.eco && cs < -0.01 && cd > 0 && cd < 399) { const h = cd / -cs; if (h < 24 * 20) add({ text: `Treasury may run dry in about ${h < 48 ? Math.round(h) + ' h' : Math.round(h / 24) + ' days'} at this pace`, eta: h }); }
      W.sort((x, y) => x.eta - y.eta); this.warnings = W;
    }

    /* ----- the forecaster: tries each option on a copy of the city ----- */
    queueForecast(w, q) {
      if (!this.forecast || q.kind !== 'act' || q.mode === 'advice') return;
      this.fq = this.fq.filter((j) => j.key !== q.key);
      const ids = q.options.slice(0, this.forecastTop).filter((x) => !x.fc && ACT[x.id] && ACT[x.id].sets).map((x) => x.id); if (!ids.length) return;
      this.fq.push({ key: q.key, rev: q.rev, d: q.domain, ids, h: HORIZON[q.domain] || 720, t0: w.tick, runs: null, i: 0 });
      if (this.fq.length > 6) this.fq.shift();
    }
    pumpForecasts(w, budgetMs) {
      const start = Date.now(); let steps = 0;
      while (this.fq.length && Date.now() - start < budgetMs) {
        const job = this.fq[0];
        const q = this.pending.find((x) => x.key === job.key);
        if (!q || q.rev !== job.rev) { this.fq.shift(); continue; }
        if (!job.runs) {
          // one shared future for all ("same luck"), so differences come from the option, not chance
          const mk = (sets) => { const f = w.fork(); if (sets) f.setParams(Object.assign({}, sets)); return { f, memo: JSON.parse(JSON.stringify(this.memo)), J: 0, B: 0, n: 0, sets }; };
          job.rev0 = w.eco ? Math.max(1, w.fiscal().dayRev) : 1;
          job.runs = [mk(null)].concat(job.ids.map((id) => mk(ACT[id].sets)));
        }
        const chunk = 30;
        for (const r of job.runs) for (let k = 0; k < chunk && job.i + k < job.h; k++) { r.f.step(); steps++; if ((job.i + k) % 10 === 0) { const ob = observe(r.f, r.memo); r.J += costOf(ob, this.goal); r.B += burdenOf(r.f.params); r.n++; } }
        job.i += chunk;
        if (job.i >= job.h) {
          this.fq.shift();
          const base = job.runs[0], bJ = base.J / Math.max(1, base.n), bB = base.B / Math.max(1, base.n);
          job.ids.forEach((id, i) => {
            const r = job.runs[i + 1], J = r.J / Math.max(1, r.n), B = r.B / Math.max(1, r.n), dJ = bJ - J, dB = B - bB;
            const cashOf = (z) => (z.f.eco ? z.f.eco.gov.cash : 0), dCash = cashOf(r) - cashOf(base);
            const x = q.options.find((y) => y.id === id); if (x) { x.fc = { h: job.h, dJ, dB, dCash, dC: dJ - MU * dB + 0.6 * dCash / (job.rev0 * 90) }; }
          });
          // re-review with the forecast; re-rank only if the forecast clearly reverses the order
          for (const x of q.options) x.review = this.review(w, q.domain, q.tier, x);
          const withF = q.options.filter((x) => x.fc);
          const best = withF.slice().sort((a, b) => b.fc.dC - a.fc.dC)[0];
          if (best && best !== q.options[0] && q.options[0].fc && best.fc.dC - q.options[0].fc.dC > 0.01) {
            q.options = [best].concat(q.options.filter((x) => x !== best)); q.options[0].note = 'moved to the top by the forecaster'; q.rev = ++this.revSeq;
            this.say('plan', `Forecaster re-ranked ${LABEL[q.domain].toLowerCase()}: "${best.label}" did best in a copy of the city over the next ${Math.round(job.h / 60)} h.`, w.tick);
          }
          // if nothing it tried helped, the forecaster says so plainly: waiting may be the better choice
          q.fcAdvice = withF.length && withF.every((x) => x.fc.dC < -0.002) ? 'wait' : withF.some((x) => x.fc.dC > 0.002) ? 'act' : 'unclear';
          this.say('plan', `Forecaster (${LABEL[q.domain].toLowerCase()}, next ${Math.round(job.h / 60)} h, same future for all): ${withF.map((x) => `${x.label} ${x.fc.dC >= 0 ? '+' : ''}${(x.fc.dC * 100).toFixed(1)}`).join('; ')}.${q.fcAdvice === 'wait' ? ' None of them did better than doing nothing in this copy: consider waiting.' : ''}`, w.tick);
        }
      }
      return steps;
    }

    /* ----- you decide: every change goes through here ----- */
    approve(w, key, optId, rev, confirmed, exitAuto) {
      const R = (ok, msg, extra) => Object.assign({ ok, msg }, extra || {});
      const reject = (msg, x) => { this.led('rejected', x || null, msg); return R(false, msg); };
      if (!w || typeof w.step !== 'function') return R(false, 'No city.');
      if (!this.on) return reject('The agent is off, so it has no open proposals.');
      const q = this.pending.find((x) => x.key === key);
      if (!q) return reject('That proposal is no longer open (it was withdrawn or already decided).');
      if (this.strict && !this.simulation && rev == null) return reject('Missing proposal version: please click the button on the current list.');
      if (rev != null && rev !== q.rev) return reject('This proposal changed since you looked at it. Please read it again and decide.');
      if (q.mode === 'advice') return reject('Advice-only mode: the agent only suggests. Change the mode to act on it.');
      if (q.kind === 'lift') return this.approveLift(w, q, confirmed);
      const x = typeof optId === 'string' ? q.options.find((y) => y.id === optId) : null;
      if (!x) return reject('That option is not on the list any more.');
      const a = own(ACT, x.id) ? ACT[x.id] : null; if (!a) return reject('Unknown action.', x);
      if (this.never[a.id]) return reject('You put this on the "never" list.', x);
      if (this.needsConfirm(x) && confirmed !== true) return R(false, 'Please confirm: ' + (x.big ? 'this is a big decision. ' : '') + (x.standing ? 'this is a standing rule. ' : '') + (x.hard ? 'this is hard to undo. ' : '') + (x.review && x.review.level === 'caution' ? 'the safety reviewer raised a caution.' : ''), { needConfirm: true });
      if (!a.oneShot && inForce(a, w.params)) { q.options = q.options.filter((y) => y !== x); q.rev = ++this.revSeq; if (!q.options.length) this.pending = this.pending.filter((y) => y !== q); return reject('Already in force, or something stronger is: nothing to change.', x); }
      const o = this.o || observe(w, this.memo);
      // the price is checked again at the moment you decide: money may have changed since the proposal was written
      if (w.eco && !a.fund) { const fz = this.fiscalOf(w, a, o, true); if (fz && fz.level === 'nofunds') return reject(`Not enough money: ${fz.why}. Ask the finance officer to raise funds first (emergency fund, grant, loan or levy).`, x); }
      this._open = true; this._exitAuto = exitAuto === true; let done;
      try { done = this.act(w, a, o, x, true); } finally { this._open = false; this._exitAuto = false; }
      if (!done) return R(false, `"${a.label}" could not be done (your role may not allow it). The proposal stays open.`);
      this.pending = this.pending.filter((y) => y !== q);
      this.approved++; delete this.deny[a.id]; this.lastDomAct[q.domain] = w.tick;
      return R(true, `Done: ${a.label}.`);
    }
    approveLift(w, q, confirmed) {
      const m = this.measures.find((y) => y.uid === q.uid);
      if (this.needsConfirm(q.options[0]) && confirmed !== true) return Object.assign(R0(false, 'Please confirm: the safety reviewer raised a caution about lifting this.'), { needConfirm: true });
      this.pending = this.pending.filter((y) => y !== q);
      if (!m || m.lifted || !m.live) return R0(false, 'That measure is not in force any more.');
      this._open = true; let r; try { r = this.lift(w, m, q.why, true); } finally { this._open = false; }
      this.led('lift approved', m, q.why); this.approved++;
      return R0(true, r);
    }
    /* deny one option (or all of them): mode 'never' keeps it away even in an emergency */
    refuse(w, key, optId, rev, mode) {
      const q = this.pending.find((x) => x.key === key); if (!q || !w) return R0(false, 'That proposal is no longer open.');
      if (rev != null && rev !== q.rev) return R0(false, 'This proposal changed since you looked at it. Please read it again.');
      if (q.kind === 'lift') {
        const m = this.measures.find((y) => y.uid === q.uid); if (m) m.keepUntil = w.tick + (q.sunset ? 3 * 1440 : 12 * 60);
        this.pending = this.pending.filter((y) => y !== q); this.led('lift denied', m || null, 'kept in force; asks again in 12 h at the earliest'); this.say('ask', `You kept "${m ? m.label : 'the measure'}" in force.`, w.tick);
        return R0(true, 'Kept in force.');
      }
      const list = optId ? q.options.filter((x) => x.id === optId) : q.options.slice();
      if (!list.length) return R0(false, 'That option is not on the list any more.');
      const days = this.denyDays;
      for (const op of list) {
        if (mode === 'never') { this.never[op.id] = { label: op.label, domain: q.domain, t: w.tick }; delete this.deny[op.id]; this.led('never', op, 'never offered again until you allow it'); this.say('ask', `You said never: ${op.label}. It will not be offered again, not even in an emergency, until you allow it.`, w.tick); }
        else { this.deny[op.id] = { label: op.label, domain: q.domain, t: w.tick, tier: q.tier, days, returnAt: w.tick + days * 1440 }; this.led('denied', op, `for ${days} day${days === 1 ? '' : 's'}, or sooner only in an emergency`); this.say('ask', `You denied: ${op.label}. It stays on the deny list for ${days} day${days === 1 ? '' : 's'}, unless ${LABEL[q.domain].toLowerCase()} becomes an emergency.`, w.tick); }
        this.denied++;
        q.options = q.options.filter((x) => x.id !== op.id);
      }
      q.rev = ++this.revSeq;
      if (!q.options.length) this.pending = this.pending.filter((y) => y !== q);
      this.lastDelib = -1e9; // look again at once: maybe an alternative fits
      return R0(true, list.length === 1 ? `Denied: ${list[0].label}.` : `Denied ${list.length} options.`);
    }
    allow(w, id) {
      let hit = null; if (this.deny[id]) { hit = this.deny[id]; delete this.deny[id]; } if (this.never[id]) { hit = this.never[id]; delete this.never[id]; }
      if (hit) { this.say('ask', `"${hit.label}" allowed again by you.`, w ? w.tick : null); this.led('allowed', { id, label: hit.label, domain: hit.domain }); return R0(true, 'Allowed again.'); }
      return R0(false, 'Not on a list.');
    }
    /* you undo a measure yourself (from the measures table) */
    undo(w, uid) {
      const m = this.measures.find((y) => y.uid === uid); if (!m || !w) return R0(false, 'Unknown measure.');
      if (m.oneShot) return R0(false, 'A one-off action cannot be undone.');
      if (m.lifted || !m.live && !m.held) return R0(false, 'Already lifted.');
      this._open = true; let r; try { r = this.lift(w, m, 'undone by you', true); } finally { this._open = false; }
      this.pending = this.pending.filter((q) => !(q.kind === 'lift' && q.uid === uid));
      this.led('undone', m, r); return R0(true, r);
    }

    act(w, a, o, op, byUser) {
      if (!a) return false;
      if (this.strict && !this._open) { this.blocked++; this.led('blocked', a, 'tried to act without your approval: refused'); this.say('alarm', `Blocked: "${a.label}" without your approval.`, w.tick); return false; }
      const prev = {}, before = this.sm(a.domain), slope = this.slope(a.domain);
      const ctx = { w };
      let result = '', changed = !!a.oneShot;
      try {
        if (a.oneShot) result = String(a.run(ctx) || '');
        else for (const k in a.sets) { prev[k] = w.params[k]; this.apply(k, a.sets[k]); if (w.params[k] !== prev[k]) changed = true; else delete prev[k]; }
      } catch (e) { this.say('act', `Could not do "${a.label}": ${e.message}`, w.tick); return false; }
      this.lastAct[a.id] = w.tick;
      if (a.oneShot && /^no\b|no call|nothing|none/i.test(result)) { this.lastAct[a.id] = w.tick + 180; this.say('act', `${a.label}: ${result}.`, w.tick); this.led(byUser ? 'approved' : 'acted (simulation)', a, result); this.acts++; return true; }
      if (!changed) { this.say('act', `"${a.label}" was blocked (your role may not allow it) or is already in place.`, w.tick); this.led('no change', a, 'blocked by role or already in place'); return false; }
      this.acts++;
      if (this.measures.some((y) => y.id === a.id && y.lifted && w.tick - y.lifted < 1440)) this.flaps = (this.flaps || 0) + 1;
      const set = {}; for (const k in prev) set[k] = w.params[k];
      const agreed = !!(byUser && this._exitAuto && a.relax != null && !a.oneShot);
      const m = { uid: ++this.uid, id: a.id, label: a.label, domain: a.domain, t0: w.tick, before, slope, prev, set, evalAt: w.tick + this.evalH * 60, verdict: null, delta: null, now: before, live: !a.oneShot && !!a.relax, held: !a.oneShot && !a.relax, oneShot: !!a.oneShot, byUser: !!byUser, tier: this.tier[a.domain], stage: 0, autoLift: agreed, cost: op && op.cost ? { once: op.cost.once, perDay: op.cost.perDay, revLoss: op.cost.revLoss, level: op.cost.level } : null };
      const ent = this.led(byUser ? 'approved' : 'acted (simulation)', a, Object.keys(prev).map((k) => `${k}: ${prev[k]} → ${set[k]}`).join(', ') + (result ? ' ' + result : '') + (op && op.cost && op.cost.text ? ` [cost: ${op.cost.text}]` : '') + (agreed ? ' [you agreed it may ease and lift by itself when things get better]' : a.relax != null && byUser ? ' [lifting will ask you]' : ''), { exit: agreed ? 'agreed' : '' });
      m.consentN = ent.n; this.measures.push(m);
      if (this.measures.length > 500) this.measures.splice(0, this.measures.length - 500);
      this.say('act', `${byUser ? 'Approved and done: ' : 'Did: '}${a.label}${result ? ' (' + result + ')' : ''}. Expecting ${LABEL[a.domain].toLowerCase()} pressure (now ${pc(before)}%) to fall by about ${pc(op ? op.pred : 0)} points.`, w.tick);
      this.audit(`Agent (${byUser ? 'approved by you' : 'simulation'}): ${a.label}${result ? ' (' + result + ')' : ''}`);
      this.lastDelib = w.tick - this.every + 5; // look again soon to see whether it is enough
      return true;
    }
    lift(w, m, why, byUser, auto) {
      if (this.strict && !this._open) { this.blocked++; this.led('blocked', m, 'tried to lift a measure without your approval: refused'); return 'blocked'; }
      const restored = [], kept = [];
      for (const k in m.prev) {
        if (m.prev[k] === undefined) continue;
        if (m.set && own(m.set, k) && w.params[k] !== m.set[k]) { kept.push(k); continue; } // changed since: leave the newer choice alone
        if (auto && SUNK_KEYS.has(k)) { kept.push(k + ' (already built or bought)'); continue; } // a self-lift never throws away what the city paid for
        this.apply(k, m.prev[k]); restored.push(k);
      }
      m.live = false; m.held = false; m.lifted = w.tick; this.lastAct[m.id] = auto ? w.tick + 360 : w.tick; // after a self-lift the same measure waits 6 more hours, so it cannot flap on and off
      const msg = `Lifted: ${m.label}. ${why}.${kept.length ? ' Left alone because it was changed since: ' + kept.join(', ') + '.' : ''}`;
      this.say('act', msg, w.tick); this.audit(`Agent lifted${byUser ? ' (approved by you)' : ''}: ${m.label}`);
      return msg;
    }
    /* ----- v17: exit rules ----- */
    // a measure may ease or lift by itself only if YOU agreed to that when you approved it (the ledger proves it),
    // and never if it is hard to undo, a standing rule, or already built or bought
    canAuto(a, m) {
      if (!a || !m || !m.autoLift || a.hard || a.standing || (a.sunk && !a.pkg) || a.oneShot) return false;
      if (m.keepUntil && this.lastTick < m.keepUntil) return false;
      const t = this.tier[m.domain]; if (t === 'high' || t === 'emergency') return false;
      const e = this.ledger.find((y) => y.n === m.consentN);
      return !!(e && e.what === 'approved' && e.exit === 'agreed' && e.id === m.id);
    }
    easeAgreed(w, m, a, why) {
      this._open = true; try { this.easeOrLift(w, m, a, why, true); } finally { this._open = false; }
      return true;
    }
    easeOrLift(w, m, a, why, agreed) {
      const lad = a.ladder || [], st = m.stage || 0;
      if (lad.length && st < lad.length) {
        const step = lad[st], done = [];
        for (const k in step) { if (m.set && own(m.set, k) && w.params[k] !== m.set[k]) continue; this.apply(k, step[k]); if (w.params[k] === step[k]) { if (m.set) m.set[k] = step[k]; done.push(`${k}: ${step[k]}`); } }
        m.stage = st + 1; m.stepAt = w.tick;
        const msg = `Eased "${m.label}" (step ${m.stage} of ${lad.length + 1}): ${done.join(', ') || 'nothing changed'}. ${why}.`;
        this.say('act', msg, w.tick); this.led(agreed ? 'eased by itself (you agreed)' : 'eased (simulation)', m, why); this.audit('Agent eased: ' + m.label);
        return msg;
      }
      const r = this.lift(w, m, why, false, true);
      this.led(agreed ? 'lifted by itself (you agreed)' : 'lifted (simulation)', m, why);
      return r;
    }
    proposeLift(w, m, why, tier, sunset) {
      if (this.pending.some((q) => q.kind === 'lift' && q.uid === m.uid)) return;
      if (m.keepUntil && w.tick < m.keepUntil) return;
      // the safety reviewer also checks lifting: is the problem coming back?
      const notes = []; let level = 'ok'; const sl = this.slope(m.domain), t = this.tier[m.domain] || 'none';
      if (sl > 0.003) { notes.push({ type: 'caution', text: `${LABEL[m.domain]} pressure is rising again (+${(sl * 100).toFixed(1)} points per hour).` }); level = 'caution'; }
      if (t === 'high' || t === 'emergency') { notes.push({ type: 'caution', text: `${LABEL[m.domain]} is at "${t}" right now.` }); level = 'caution'; }
      if (m.verdict === 'hurt') notes.push({ type: 'note', text: 'The 12-hour check found the area got worse after this measure; that check is a rough comparison, not proof.' });
      const q = { key: 'lift:' + m.uid, kind: 'lift', sunset: !!sunset, uid: m.uid, domain: m.domain, officer: OFFICER_OF[m.domain].name, tier, why, mode: 'ask', since: w.tick, updated: w.tick, rev: ++this.revSeq,
        options: [{ id: 'lift', label: `Lift "${m.label}"`, why, note: 'restores the earlier setting', review: { level, notes } }] };
      this.pending.push(q); this.say('ask', `${q.officer} suggests lifting "${m.label}": ${why}.`, w.tick);
    }
    reflect(w, sm) {
      for (const m of this.measures) {
        const now = sm[m.domain]; m.now = now;
        if (m.live && !m.lifted) {
          const a = ACT[m.id];
          if (a && a.relax != null && now < a.relax && this.slope(m.domain) <= 0.002) {
            if (this.lowSince[m.uid] == null) this.lowSince[m.uid] = w.tick;
            if (w.tick - this.lowSince[m.uid] >= (a.hold || 720) && w.tick - (m.stepAt != null ? m.stepAt : m.t0) >= (a.hold || 720)) {
              const why = `${LABEL[m.domain]} pressure has stayed near ${pc(now)}% for ${Math.round((a.hold || 720) / 60)} h and is not rising`;
              if (this.strict) { if (this.on && !(this.canAuto(a, m) && this.easeAgreed(w, m, a, why))) this.proposeLift(w, m, why, 'low'); } else { this.easeOrLift(w, m, a, why, false); }
              this.lowSince[m.uid] = null;
            }
          } else this.lowSince[m.uid] = null;
          // sunset review: nothing stays in force for ever without somebody looking at it again
          if (a && this.strict && this.on && !m.lifted && (w.tick - (m.reviewedAt != null ? m.reviewedAt : m.t0)) / 1440 >= (a.sunset || 21)) { m.reviewedAt = w.tick; this.proposeLift(w, m, `Sunset review: in force for ${Math.round((w.tick - m.t0) / 1440)} days`, 'low', true); }
        }
        if (m.verdict || w.tick < m.evalAt) continue;
        const hours = (w.tick - m.t0) / 60, baseline = clamp(m.before + m.slope * hours * 0.6, 0, 1), delta = fin(now - baseline, 0);
        m.delta = delta; m.verdict = delta < -0.04 ? 'helped' : delta > 0.08 ? 'hurt' : 'no clear effect';
        const l = this.lessons[m.id] || (this.lessons[m.id] = { n: 0, sum: 0, good: 0, bad: 0 }); l.n++; l.sum += delta; if (m.verdict === 'helped') l.good++; if (m.verdict === 'hurt') l.bad++;
        this.say('reflect', `${m.label}: ${LABEL[m.domain].toLowerCase()} went ${pc(m.before)}% to ${pc(now)}% (trend alone would give ${pc(baseline)}%). Verdict: ${m.verdict}.`, w.tick);
        if (m.verdict === 'hurt' && (m.live || m.held) && !m.lifted) { if (this.strict) { if (this.on) this.proposeLift(w, m, 'it seems to have made things worse', 'normal'); } else this.lift(w, m, 'it seems to have made things worse', false); }
        this.say('learn', m.verdict === 'helped' ? `Will trust "${m.label}" more and suggest it earlier.` : `Will trust "${m.label}" ${m.verdict === 'hurt' ? 'much ' : ''}less and prefer an alternative next time.`, w.tick);
        if (m.verdict === 'no clear effect' && !m.oneShot) this.lastAct[m.id] = w.tick;
        this.saveLessons();
      }
    }
    saveLessons() { if (this.simulation) return; try { if (typeof localStorage !== 'undefined') localStorage.setItem(LS, JSON.stringify(this.lessons)); } catch (e) { /* storage may be unavailable */ } }
  }
  function R0(ok, msg) { return { ok, msg }; }
  function loadLessons() { try { return cleanLessons((typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem(LS) || '{}')) || {}); } catch (e) { return {}; } }

  /* ---------- your own idea: understand, check, improve ---------- */
  const num1 = (t, re) => { const m = t.match(re); return m ? parseFloat(m[1]) : null; };
  const IDEA_RULES = [
    { re: /(purifier|air\s*filter|hepa|filters?\b)/, f: (t) => (/(school|hospital|office|building)/.test(t) ? { bldgFilters: true } : { purifiers: clamp(num1(t, /(\d{2,3})\s*%/) || 30, 5, 100) }), name: 'Air purifiers and filters' },
    { re: /(artificial\s*rain|cloud\s*seed|seed(ing)?\s*(the\s*)?clouds?|make\s*(it\s*)?rain|rain\s*making)/, f: () => ({ cloudSeeding: true }), name: 'Cloud seeding (artificial rain)' },
    { re: /(mist|spray\s*gun|water\s*cannon|smog\s*gun|sprinkl)/, f: () => ({ sprayGuns: 4 }), name: 'Anti-smog spray guns' },
    { re: /(odd.?even|alternate\s*days?\s*cars?)/, f: () => ({ oddEven: true }), name: 'Odd-even car rule' },
    { re: /(free\s*(bus|transport|ride|fare)|public\s*transport|metro|bus\s*fare|cheaper\s*bus)/, f: (t) => ({ busFare: /free/.test(t) ? 0 : 20, busesPerHour: 4 }), name: 'Cheaper, more frequent public transport' },
    { re: /(cash|relief|ehsaas|handout|bonus|stipend|income support)/, f: (t) => ({ cashTransfer: clamp(num1(t, /rs\.?\s*(\d{2,4})/) || 400, 50, 1500), transferShare: 50 }), name: 'Cash relief for poor households' },
    { re: /(food|ration|atta|flour|sugar).*(subsid|cheap|discount|free|support)|subsid/, f: () => ({ foodSubsidy: 20 }), name: 'Food subsidy' },
    { re: /(wage|salary|salaries|daily.?wage|pay).*(support|pay|cover|protect|help)|(support|protect|pay).*(wage|salar)/, f: () => ({ wageSupport: 50 }), name: 'Wage support' },
    { re: /(vaccin|jab|immuni[sz])/, f: () => ({ vaxDrive: 2 }), name: 'Vaccination drive' },
    { re: /tanker/, f: () => ({ tankers: 3 }), name: 'Water tankers' },
    { re: /(birth\s*cent|maternity|midwi|delivery\s*room|labour\s*room|labor\s*room|incubator|antenatal|pregnan)/, f: (t) => (/incubator/.test(t) ? { incubators: 4 } : /midwi/.test(t) ? { midwives: 8 } : /antenatal|checkup|check-up/.test(t) ? { antenatal: 75 } : { birthRooms: 5, midwives: 8 }), name: 'Better birth centre' },
    { re: /(tax|levy)/, also: /(rais|increas|more|higher|extra|add)/, f: () => ({ taxRate: 130 }), name: 'Emergency levy' },
    { re: /(freeze|cut)\s*(the\s*)?(spending|expenses|budget)|austerity/, f: () => ({ spendingFreeze: true }), name: 'Spending freeze' },
    { re: /(school|college|univers|taleem|madrasa)/, also: /(clos|shut|band|stop|off|suspend|cancel)/, f: () => ({ schoolsOpen: false }), name: 'Close schools and university', reopen: () => ({ schoolsOpen: true }), reName: 'Reopen schools and university' },
    { re: /mask/, f: (t) => { const n = num1(t, /(\d{2,3})\s*%?/); return { masks: clamp(n || 70, 10, 100) }; }, name: 'Masks' },
    { re: /(work|study|stay)\s*(from\s*)?(at\s*)?home|\bwfh\b|home office|online class/, f: (t) => ({ distancing: clamp(num1(t, /(\d{2,3})\s*%/) || 40, 10, 100) }), name: 'Work and study from home' },
    { re: /lockdown|curfew/, f: () => ({ distancing: 60, gatheringsOpen: false, schoolsOpen: false }), name: 'Lockdown' },
    { re: /distanc/, f: (t) => ({ distancing: clamp(num1(t, /(\d{2,3})\s*%/) || 40, 10, 100) }), name: 'Social distancing' },
    { re: /(test|quarantin|isolat|tracing)/, f: () => ({ quarantine: true, detectionRate: 85 }), name: 'Test and isolate' },
    { re: /(market|bazaar|bazar|shops?|mandi)/, also: /(clos|shut|band|stop|off|ban)/, f: () => ({ marketOpen: false }), name: 'Close the market', reopen: () => ({ marketOpen: true }), reName: 'Reopen the market' },
    { re: /\bpark/, also: /(clos|shut|band|stop|off)/, f: () => ({ parksOpen: false }), name: 'Close parks', reopen: () => ({ parksOpen: true }), reName: 'Reopen parks' },
    { re: /\bgym/, also: /(clos|shut|band|stop|off)/, f: () => ({ gymOpen: false }), name: 'Close gyms', reopen: () => ({ gymOpen: true }), reName: 'Reopen gyms' },
    { re: /(wedding|gathering|friday|jumm?ah|prayer|mosque|crowd)/, also: /(stop|clos|ban|limit|cancel|no |less|reduc|band)/, f: () => ({ gatheringsOpen: false, prayerAttendance: 10 }), name: 'Stop big gatherings', reopen: () => ({ gatheringsOpen: true, prayerAttendance: 100 }), reName: 'Allow gatherings again' },
    { re: /(bed|hospital|icu|clinic)/, also: /(add|more|increas|extra|build|expand|open|bara|barha)/, f: (t, p) => ({ hospitalBeds: clamp(p.hospitalBeds + (num1(t, /(\d+)\s*(more|extra|beds?)/) || 8), 2, 60) }), name: 'More hospital beds' },
    { re: /ambulance/, f: (t, p) => ({ ambulances: clamp(p.ambulances + 2, 1, 8) }), name: 'More ambulances' },
    { re: /(kiln|bhat+[ah]|brick)/, also: /(clean|zig|zag|upgrad|technolog|modern|convert|switch)/, f: () => ({ cleanKilns: true }), name: 'Zigzag kilns' },
    { re: /(kiln|bhat+[ah]|brick)/, also: /(inspect|raid|catch|satellite|check|monitor|fine|penal)/, f: () => ({ autoDispatch: true }), name: 'Inspect kilns' },
    { re: /(construct|building site|dust|cement)/, f: () => ({ constructionAqiBan: true, dustControl: true }), name: 'Control construction dust' },
    { re: /(factor|industr|chimney)/, f: (t) => ({ factorySmoke: clamp(100 - (num1(t, /(\d{2})\s*%/) || 40), 0, 100) }), name: 'Cut factory smoke' },
    { re: /(vehicle|exhaust|emission|odd.?even|smoky|car\b|cars\b)/, also: /(cut|reduc|limit|ban|less|odd|even|check|test|restrict)/, f: () => ({ trafficSmoke: 70 }), name: 'Cut traffic smoke' },
    { re: /\bbus/, f: () => ({ busesPerHour: 4 }), name: 'More buses' },
    { re: /(burn)/, f: () => ({ wasteBurning: 0 }), name: 'Ban open burning' },
    { re: /speed/, f: (t) => ({ speedLimit: clamp(num1(t, /(\d{2})\s*(km|kph)?/) || 30, 30, 80) }), name: 'Lower speed limit' },
    { re: /police|traffic warden/, f: () => ({ trafficPolice: 8 }), name: 'More traffic police' },
    { re: /(camera|challan|ticket)/, f: () => ({ challanCameras: 8 }), name: 'Speed cameras' },
    { re: /seat\s*-?belt/, f: () => ({ seatbelts: 90 }), name: 'Seat-belt campaign' },
    { re: /(plough|plow|snow)/, f: () => ({ snowPloughs: true }), name: 'Snow ploughs' },
    { re: /(street\s*light|lamp)/, f: () => ({ streetlights: 'adaptive' }), name: 'Dim street lights' },
    { re: /(generator|capacity|new power|solar)/, f: (t, p) => ({ gridCapacity: clamp(Math.round(p.gridCapacity * 1.15), 100, 800) }), name: 'More grid capacity' },
    { re: /(power|electric|load|energy|bijli)/, f: (t) => ({ demandResponse: clamp(num1(t, /(\d{2})\s*%/) || 30, 5, 50) }), name: 'Cut power use at the peak' },
    { re: /leak/, f: () => ({ leakRate: 5 }), name: 'Fix pipe leaks' },
    { re: /(water|pani)/, f: (t) => ({ waterPerCapita: clamp(num1(t, /(\d{2,3})\s*%/) || 80, 40, 150) }), name: 'Save water' },
    { re: /(wifi|wi-fi|internet|network)/, f: () => ({ wifiAps: 10 }), name: 'More Wi-Fi' },
    { re: /(alert|warning|awareness|campaign|sms)/, f: () => ({ mediaReach: 90, alertCompliance: 85 }), name: 'Public alert campaign' },
    { re: /(flight|airport|travel)/, also: /(cut|reduc|stop|clos|ban|less|limit)/, f: () => ({ flightsPerDay: 1, importRisk: 1 }), name: 'Cut flights' },
  ];
  const DOMAIN_OF = { vaxDrive: 'health', purifiers: 'air', bldgFilters: 'air', sprayGuns: 'air', cloudSeeding: 'air', oddEven: 'air', busFare: 'air', tankers: 'water', cashTransfer: 'welfare', transferShare: 'welfare', foodSubsidy: 'welfare', wageSupport: 'welfare', birthRooms: 'maternal', midwives: 'maternal', incubators: 'maternal', antenatal: 'maternal', taxRate: 'budget', spendingFreeze: 'budget', solarKw: 'power', batteryKwh: 'power', masks: 'health', quarantine: 'health', detectionRate: 'health', distancing: 'health', schoolsOpen: 'health', gatheringsOpen: 'health', marketOpen: 'health', parksOpen: 'health', gymOpen: 'health', prayerAttendance: 'health', hospitalBeds: 'health', ambulances: 'health', cleanKilns: 'air', autoDispatch: 'air', constructionAqiBan: 'air', dustControl: 'air', factorySmoke: 'air', trafficSmoke: 'air', busesPerHour: 'air', wasteBurning: 'air', mediaReach: 'air', alertCompliance: 'air', speedLimit: 'roads', trafficPolice: 'roads', challanCameras: 'roads', seatbelts: 'roads', snowPloughs: 'roads', streetlights: 'power', gridCapacity: 'power', demandResponse: 'power', leakRate: 'water', waterPerCapita: 'water', wifiAps: 'net', flightsPerDay: 'health', importRisk: 'health' };
  const NEG = /\b(not|don'?t|dont|never|avoid|nahi|nahin|nai|mat|without)\b|\bno\s+(lockdown|curfew|closure|closing|clos|ban)/;
  const OPEN = /\b(re-?open|open|resume|allow|restart|unlock|khol\w*)\b/;
  function parseIdea(text, p) {
    // judge each part of the idea on its own ("close the market but keep schools open")
    const raw = String(text == null ? '' : text).slice(0, 600).toLowerCase().replace(/[.,;!?()]/g, ' ');
    const parts = raw.split(/\b(?:and|but|then|also|aur|lekin|phir|plus)\b|[\n/]/).map((c) => ' ' + c.replace(/\s+/g, ' ').trim() + ' ').filter((c) => c.trim());
    const items = [], used = [], negated = [];
    for (const t of parts) {
      for (const r of IDEA_RULES) {
        if (!r.re.test(t)) continue;
        const closeWord = !r.also || r.also.test(t), openWord = !!r.reopen && OPEN.test(t) && !(r.also && r.also.test(t));
        if (!closeWord && !openWord) continue;
        if (NEG.test(t)) { if (!negated.includes(r.name)) negated.push(r.name); continue; } // never do the opposite of what was written
        const patch = openWord ? r.reopen(t, p) : r.f(t, p), name = openWord ? r.reName : r.name;
        if (used.includes(name)) continue;
        items.push({ name, patch }); used.push(name);
      }
    }
    // merge: if two rules set the same key keep the stronger one
    const patch = {};
    for (const it of items) for (const k in it.patch) {
      const v = it.patch[k], d = DEF[k];
      if (!(k in patch)) patch[k] = v;
      else if (typeof v === 'number') { const down = d != null && typeof d === 'number' && patch[k] < d; patch[k] = down ? Math.min(patch[k], v) : Math.max(patch[k], v); }
      else if (patch[k] !== v) patch[k] = DEF[k]; // contradiction inside the idea: keep the default
    }
    for (const k of Object.keys(patch)) if (p && patch[k] === p[k]) delete patch[k]; // already so
    return { items, patch, recognised: used, understood: items.length > 0, negated, truncated: String(text == null ? '' : text).length > 600 };
  }
  /* an expert second opinion: relevance, side effects, gaps, extras */
  function critique(idea, mayor, w) {
    const o = mayor.o || observe(w, null), notes = [], extras = {}, extraWhy = [];
    const sm = {}; for (const k of DOM) sm[k] = mayor.sm(k) || o[k];
    const touched = new Set(Object.keys(idea.patch).map((k) => DOMAIN_OF[k]).filter(Boolean));
    const p2 = Object.assign({}, w.params, idea.patch), b0 = burdenOf(w.params), b1 = burdenOf(p2);
    notes.push({ type: 'info', text: `Burden on people: ${(b0 * 100).toFixed(0)} → ${(b1 * 100).toFixed(0)} out of 100 (${b1 > b0 ? '+' : ''}${((b1 - b0) * 100).toFixed(0)}).` });
    let cost = null;
    if (w.eco && typeof w.ecoPreview === 'function') {
      cost = w.ecoPreview(idea.patch); const f = w.fiscal(), ong = cost.perDay + cost.revLoss;
      const left = ong > 0 ? Math.max(0, f.cash - cost.once) / Math.max(1, f.dayExp - f.dayRev + ong) : 999;
      notes.push({ type: cost.once > f.cash || (ong > 0 && left < 10) ? 'warn' : 'info', text: `Price: ${cost.once > 0 ? 'one-off ' + rsM(cost.once) : 'no one-off cost'}${ong !== 0 ? ', ' + rsM(ong) + ' a day' : ''}. Treasury now ${rsM(f.cash)}${cost.once > f.cash ? ': it cannot pay this now, so raise funds first' : ong > 0 && left < 999 ? '; with this running it would last about ' + Math.round(left) + ' days at the current deficit' : ''}.` });
    }
    for (const d of touched) {
      if (sm[d] < 0.1) notes.push({ type: 'warn', text: `${LABEL[d]} is fine right now (${pc(sm[d])}%), so this part would cost people something for little gain today. It can still make sense as prevention if you expect it to get worse.` });
      else if (sm[d] >= 0.25) notes.push({ type: 'good', text: `${LABEL[d]} is a real problem now (${pc(sm[d])}%), so this targets the right area.` });
    }
    // gaps: serious problems the idea does not touch
    for (const d of DOM.slice().sort((a, b) => sm[b] - sm[a])) {
      if (sm[d] < 0.25 || touched.has(d)) continue;
      const opts = mayor.options(w, o, d, Math.max(sm[d], 0.25), sm[d] >= 0.45 ? 'high' : 'normal');
      const best = opts.find((x) => !x.big) || opts[0]; if (!best) continue;
      const a = ACT[best.id]; if (a && a.sets) { Object.assign(extras, a.sets); extraWhy.push(`${a.label} (for ${LABEL[d].toLowerCase()} ${pc(sm[d])}%)`); }
      notes.push({ type: 'gap', text: `Your idea does not touch ${LABEL[d].toLowerCase()}, which is at ${pc(sm[d])}%. ${a ? 'Adding "' + a.label + '" would cover it.' : ''}` });
    }
    // synergies and conflicts
    const P = idea.patch, add = (k, v, why) => { if (!(k in P) && !(k in extras) && p2[k] !== v) { extras[k] = v; extraWhy.push(why); notes.push({ type: 'add', text: why }); } };
    if (P.schoolsOpen === false && p2.distancing < 30) add('distancing', 30, 'Closing schools alone leaves adults mixing at work: adding 30% work from home makes it work better.');
    if (P.masks && !p2.quarantine && o.infPct > 0.5) add('quarantine', true, 'Masks work best together with test-and-isolate: adding it.');
    if (P.speedLimit && p2.trafficPolice < 8 && p2.challanCameras < 6) add('challanCameras', 8, 'A lower speed limit needs enforcement: adding speed cameras.');
    if (P.cleanKilns && !p2.autoDispatch) add('autoDispatch', true, 'Clean technology takes time to arrive: automatic kiln inspections cover the gap.');
    if (P.demandResponse && p2.streetlights === 'full') add('streetlights', 'adaptive', 'Demand response is helped by dimming empty street lights.');
    if (P.factorySmoke != null && p2.constructionAqiBan === false && sm.air > 0.3) add('constructionAqiBan', true, 'Cutting factory smoke while construction dust is uncontrolled wastes part of the gain: pausing construction on bad-air days.');
    if (P.hospitalBeds && p2.ambulances < 4 && sm.health > 0.25) add('ambulances', p2.ambulances + 1, 'More beds are of little use if patients arrive late: one more ambulance.');
    if (P.distancing >= 60 && sm.health < 0.3) notes.push({ type: 'warn', text: 'Working from home at 60% or more is a heavy cost for people. Infection pressure is only moderate, so a lighter level (20-40%) may be enough.' });
    if (P.gatheringsOpen === false && !P.schoolsOpen && sm.health < 0.2) notes.push({ type: 'warn', text: 'Stopping gatherings and closing schools together is a big step while infections are low.' });
    for (const k of Object.keys(extras)) if (extras[k] === p2[k]) delete extras[k];
    return { notes, extras, extraWhy, burden0: b0, burden1: b1, touched: Array.from(touched), sm, cost };
  }

  /* ---------- running headless experiments ---------- */
  const STATIC_PACK = { masks: 50, quarantine: true, speedLimit: 40, trafficPolice: 8, demandResponse: 15, streetlights: 'adaptive', constructionAqiBan: true, dustControl: true, waterPerCapita: 90 };
  const CONTROLLERS = {
    none: { name: 'No intervention' },
    static: { name: 'Fixed precaution pack (always on)', patch: STATIC_PACK },
    autopilot: { name: "City's built-in autopilot (smog alerts)", patch: { aiAutopilot: true } },
    mayor1: { name: 'Mayor acting alone: alarms + plans every 30 min', mayor: { every: 30, triggers: true, strict: false } },
    mayor60: { name: 'Mayor acting alone: plans hourly, no alarms', mayor: { every: 60, triggers: false, strict: false } },
    mayor360: { name: 'Mayor acting alone: plans every 6 h, no alarms', mayor: { every: 360, triggers: false, strict: false } },
    consentAsk: { name: 'Mayor with consent: you approve each lift one by one (a busy reviewer answers lifts after 24 h)', mayor: { every: 30, triggers: true, strict: true }, reviewer: { p: 1, wait: 60, every: 10, exit: 'ask', liftWait: 1440 } },
    consent: { name: 'Mayor with consent: a reviewer approves every action after 1 h', mayor: { every: 30, triggers: true, strict: true }, reviewer: { p: 1, wait: 60, every: 10 } },
    consentF: { name: 'Mayor with consent + forecaster: reviewer follows the forecast', mayor: { every: 30, triggers: true, strict: true, forecast: true, forecastSync: true }, reviewer: { p: 1, wait: 60, every: 10, useForecast: true } },
    hitl: { name: 'Mayor with consent: reviewer denies half', mayor: { every: 30, triggers: true, strict: true }, reviewer: { p: 0.5, wait: 120, every: 30 } },
  };
  class Runner {
    constructor(params, days, opt) {
      opt = opt || {}; this.goal = opt.goal || 'balanced'; this.days = days; this.total = Math.round(days * 1440); this.t = 0;
      const ctl = CONTROLLERS[opt.controller || 'none'];
      const p = Object.assign({}, params, ctl.patch || {}, opt.patch || {}); if (opt.seed != null) p.seed = opt.seed;
      this.w = new WorldClass(p); this.ctl = ctl; this.memo = {}; this.m = { n: 0, J: 0, B: 0, peakInf: 0, peakAqi: 0 };
      this.rs = (p.seed * 2654435761 + 12345) >>> 0;
      this.mayor = null;
      if (ctl.mayor) {
        const w = this.w;
        this.mayor = new Mayor(Object.assign({ simulation: true, goal: this.goal, quiet: true, guard: false, autonomy: 'auto', denyDays: 2, evalH: 12, lessons: opt.lessons || {}, apply: (k, v) => w.setParams({ [k]: v }) }, ctl.mayor, opt.mayorOpt || {})); this.mayor.on = true; this.mayor.noSave = true;
        this.mayor.saveLessons = () => {};
      }
    }
    rnd() { this.rs = (Math.imul(this.rs, 1664525) + 1013904223) >>> 0; return this.rs / 4294967296; }
    get done() { return this.t >= this.total; }
    advance(n) {
      const w = this.w, end = Math.min(this.total, this.t + n);
      for (; this.t < end; this.t++) {
        w.step();
        if (this.mayor) {
          this.mayor.step(w);
          const rv = this.ctl.reviewer;
          if (rv && w.tick % rv.every === 0) {
            for (const q of this.mayor.pending.slice()) {
              if (q.mode === 'advice' || w.tick - q.since < (q.kind === 'lift' && rv.liftWait != null ? rv.liftWait : rv.wait)) continue;
              if (rv.useForecast && q.kind === 'act') {
                // a careful reviewer: picks the option that did best in the forecaster's copy of the city, denies all if none helped
                if (this.mayor.fq.some((j) => j.key === q.key)) continue;
                const fx = q.options.filter((o) => o.fc).sort((a, b) => b.fc.dC - a.fc.dC);
                if (!fx.length) this.mayor.approve(w, q.key, q.options[0].id, q.rev, true, rv.exit !== 'ask');
                else if (fx[0].fc.dC > 0) this.mayor.approve(w, q.key, fx[0].id, q.rev, true, rv.exit !== 'ask');
                else this.mayor.refuse(w, q.key, null, q.rev);
                continue;
              }
              if (this.rnd() < rv.p) this.mayor.approve(w, q.key, q.options[0].id, q.rev, true, rv.exit !== 'ask'); else this.mayor.refuse(w, q.key, q.options[0].id, q.rev);
            }
          }
        }
        if (w.tick % 10 === 0) {
          const o = observe(w, this.memo), m = this.m;
          m.J += costOf(o, this.goal); m.B += burdenOf(w.params); m.n++; m.peakInf = Math.max(m.peakInf, o.infPct); m.peakAqi = Math.max(m.peakAqi, w.aqi);
        }
      }
      return this.t / this.total;
    }
    ecoResult() {
      const w = this.w, f = w.fiscal(), m = w.maternal(), g = w.eco.gov, N = Math.max(1, w.agents.length), c = w.counts();
      return { cash: f.cash, debt: f.debt, reserve: f.reserve, trust: f.trust, distress: f.distress, cpi: f.cpi, arrears: f.arrears, capex: g.capex || 0, births: m.births, facility: m.facility, home: m.home, turnedAway: m.turnedAway, neoDeaths: m.neoDeaths, matDeaths: m.matDeaths, natural: c.N || 0, diseaseDeaths: c.D, N };
    }
    result() {
      const w = this.w, c = w.counts(), m = this.m, N = Math.max(1, w.params.population), J = m.J / Math.max(1, m.n), B = m.B / Math.max(1, m.n);
      return { J, B, C: J + MU * B, peakInf: m.peakInf, peakAqi: m.peakAqi, deaths: c.D + c.X, deathsPer1000: (1000 * (c.D + c.X)) / N, acc: w.stats.accidents, outage: Math.round(w.en.tot.outageMin || 0), acts: this.mayor ? this.mayor.acts : 0, approved: this.mayor ? this.mayor.approved : 0, blocked: this.mayor ? this.mayor.blocked : 0, flaps: this.mayor ? (this.mayor.flaps || 0) : 0, faults: this.mayor ? this.mayor.faults : 0, denied: this.mayor ? this.mayor.denied : 0, reraised: this.mayor ? this.mayor.reraised : 0, trig: this.mayor ? this.mayor.trigCount : 0, everInfectedPct: (100 * (w.everInfected || 0)) / N, eco: w.eco ? this.ecoResult() : null };
    }
  }
  function runSync(params, days, opt) { const r = new Runner(params, days, opt); while (!r.done) r.advance(1440); return r.result(); }
  /* browser: same thing in slices so the page stays alive */
  function runAsync(params, days, opt, progress, job) {
    return new Promise((resolve) => {
      const r = new Runner(params, days, opt);
      (function slice() {
        const f = r.advance(240);
        if (progress) progress(f);
        if (job && job.cancel) return resolve(null);
        if (r.done) resolve(r.result()); else setTimeout(slice, 0);
      })();
    });
  }

  /* named stress scenarios for the benchmark (patches over the default city) */
  const SCENARIOS = {
    epi: { name: 'Epidemic', desc: 'More first cases, easier spread, fewer hospital beds', patch: { initialInfected: 8, transmissionRate: 8, hospitalBeds: 6 } },
    smog: { name: 'Winter smog', desc: 'Winter fog, 8 kilns burning all winter, heavy factory smoke', patch: { startSeason: 'winter', kilns: 8, kilnWinterStop: false, fogChance: 60, factorySmoke: 130, airHarm: 80 } },
    grid: { name: 'Heat, storm and power cuts', desc: 'Heatwave, a storm, a weak grid with frequent outages, high water use', patch: { baseTemp: 36, heatwave: true, gridOutageChance: 60, gridOutageHours: 5, electricityUsageMul: 130, gridCapacity: 360, weather: 'storm', tankCapacity: 80, waterPerCapita: 130 } },
    compound: { name: 'Compound winter crisis', desc: 'Epidemic, smog and power cuts together in winter', patch: { startSeason: 'winter', kilns: 8, kilnWinterStop: false, fogChance: 50, initialInfected: 6, transmissionRate: 7, gridOutageChance: 35, hospitalBeds: 6, rainChance: 30 } },
  };
  const api = { rsM, exitText, SUNK_KEYS, DEPT_OF, OFFICERS, HORIZON, cleanLessons, SCENARIOS, DEFAULT_PARAMS: DEF, DOM, LABEL, GOALS, MU, TIERS, ACTIONS: A, ACT, Mayor, Runner, runSync, runAsync, observe, costOf, burdenOf, parseIdea, critique, CONTROLLERS, STATIC_PACK, loadLessons, dayClock, inForce, DOMAIN_OF };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.OLCore = api;
})(typeof window !== 'undefined' ? window : globalThis);

