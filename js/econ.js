/* =====================================================================
   OUTBREAK LAB v17: THE CITY ECONOMY, THE GOVERNMENT AND THE BIRTH CENTRE
   ---------------------------------------------------------------------
   Adds to World (model.js) a money layer and a people layer:
     prices     food, fuel, power, water, medicine, bus fare: inflation, shocks,
                shortages when the bazaar is shut, dear medicine when shelves empty
     households income from jobs (lost when workplaces close or people are sick),
                spending, savings, distress; cash relief and wage support
     government revenue (taxes, fares, fines, utility sales, a federal grant),
                spending by department, payroll, a treasury, an emergency fund,
                debt with interest, arrears, public trust (which sets compliance)
     people     sex and age, pregnancies, a birth centre (delivery rooms, midwives,
                incubators, power), newborn agents, natural deaths
   Every number below is an ILLUSTRATIVE ASSUMPTION (see NOTES), not a statistic
   of any real city. Change them with the sliders or a CSV.
   One simulated person stands for `moneyScale` real people in all money figures.
   ===================================================================== */
(function (root) {
  'use strict';
  function install(M) {
    const { World, Agent, AGE_GROUPS, TICKS_PER_DAY, Random, DEFAULT_PARAMS } = M;
    if (World.prototype.ecoInit) return;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const fin = (v, d) => (Number.isFinite(v) ? v : d);
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const rs = (x) => 'Rs ' + Math.round(x).toLocaleString('en-US');

    /* ---------- assumptions (all in this table) ---------- */
    const NOTES = 'Illustrative assumptions in the range of a mid-sized Pakistani city around 2024-25. They are not official statistics and are not calibrated to any real budget. Replace them with your own.';
    const WAGE = { office: 3000, factory: 1600, university: 3500, student: 0, market: 2200, mart: 1400, mandi: 1800, school: 2200, hospital: 3200, police: 2000, fire: 1900, fuel: 1300, airport: 2600, govt: 2300, gym: 1500, wedding: 1200, none: 600, retired: 700, pupil: 0, infant: 0 }; // Rs per day per person
    const PUBLIC = { school: 0.35, university: 0.25, hospital: 0.45, police: 0.5, fire: 1, govt: 0.6 };   // share of that job paid by the city government
    const PAYDEPT = { school: 'education', university: 'education', hospital: 'health', police: 'safety', fire: 'safety', govt: 'admin' };
    const WFH = { office: 0.85, university: 0.8, school: 0.7, govt: 0.8, airport: 0.1, none: 0.3 };         // share of pay kept when working from home
    const DAILY = { market: 1, mart: 1, mandi: 1, factory: 1, fuel: 1, gym: 1, wedding: 1, none: 1 };      // paid by the day: lost at once when work stops
    // running costs: Rs per slice-unit per day (multiplied by moneyScale)
    const RC = { bed: 220, bedExtra: 340, amb: 380, test: 0.012, mask: 0.9, med: 0.35, room: 160, midwife: 210, incubator: 120, antenatal: 0.02, pupil: 0.9, police: 130, camera: 95, fireTruck: 260, inspector: 140, busTrip: 22, roads: 600, plough: 180, waste: 340, crew: 260, dust: 420, media: 6, purifier: 0.011, bldgFilter: 520, spray: 300, gridRent: 14, solarOM: 0.6, battOM: 0.15, vaxDose: 1200, tanker: 150 };
    const SORTIE = 2200000;                 // Rs per cloud-seeding flight (city level)
    // capital spending when a setting is raised: Rs per unit, city level (not multiplied by moneyScale)
    const CAPEX = { hospitalBeds: 1400000, ambulances: 12000000, birthRooms: 6000000, incubators: 2200000, solarKw: 95000, batteryKwh: 45000, wasteFleet: 9000000, fireTrucks: 22000000, challanCameras: 1200000, sprayGuns: 4500000, wifiAps: 600000, maintenanceCrews: 800000 };
    const POLICY_KEYS = ['purifiers', 'bldgFilters', 'sprayGuns', 'cloudSeeding', 'cashTransfer', 'transferShare', 'foodSubsidy', 'wageSupport', 'vaxDrive', 'tankers', 'spendingFreeze'];
    const HOME_PURIFIER = 11000, BLDG_FILTERS = 18000000, KILN_UPGRADE = 6000000;
    const GRID_COST = 33, DIESEL_COST = 120, WATER_COST = 18, COLLECT = { power: 0.82, water: 0.7 };
    const KWH_PERSON = 1.6, M3_PERSON = 0.11;       // city-level use per person per day: the model's own volumes are scaled to this
    const GESTATION = 280, PRETERM_BASE = 0.13, CDR = 7, CBR = 28;
    const FINE_COLLECT = 0.1;                        // share of issued fines that is actually paid
    const BASE_ATTEND = 0.96;                       // normal attendance: the baseline for "lost wages"
    const DEPTS = ['health', 'education', 'safety', 'transport', 'environment', 'utilities', 'welfare', 'admin'];
    const dept0 = () => { const o = {}; for (const k of DEPTS) o[k] = 0; return o; };
    const sumOf = (o) => { let s = 0; for (const k in o) s += o[k]; return s; };

    World.prototype.ecoNotes = () => NOTES;
    World.prototype.ecoTables = () => ({ WAGE, PUBLIC, RC, CAPEX, HOME_PURIFIER, BLDG_FILTERS, KILN_UPGRADE, GRID_COST, DIESEL_COST, WATER_COST, COLLECT, CBR, CDR, PRETERM_BASE, SORTIE, DEPTS });

    /* ========================= setup ========================= */
    World.prototype.ecoInit = function () {
      const p = this.params;
      this.eco = null;
      if (!p.economy) return;
      const rng = (this.econRng = new Random((p.seed * 2654435761 + 977) >>> 0));
      const S = Math.max(1, p.moneyScale), mul = Math.max(1, p.demoMul);
      // sex and age for everybody (drawn from the economy's own random stream: the city itself is unchanged)
      for (const a of this.agents) {
        a.female = rng.next() < 0.5;
        const k = a.age.key;
        a.ageYears = k === 'child' ? rng.range(0, 17.99) : k === 'adult' ? 18 + 46 * Math.pow(rng.next(), 1.25) : rng.range(65, 86);
        a.infant = false; a.labour = null; a.preg = null; a.postpartum = 0; a.workH = 0; a.schoolH = 0; a.attend = BASE_ATTEND; a.uFac = rng.next();
      }
      let pregN = 0;
      for (const a of this.agents) if (a.female && a.age.key === 'adult' && a.ageYears < 45 && rng.next() < 0.075) { a.preg = { due: Math.round(rng.range(0.5, GESTATION) * TICKS_PER_DAY / mul) + 60, start: 0 }; pregN++; }
      for (const h of this.households) {
        const m = h.members;
        h.priority = (m.some((x) => x.age.key === 'elder') ? 3 : 0) + (m.some((x) => x.asthmatic) ? 2 : 0) + (m.some((x) => x.age.key === 'child') ? 1 : 0) + rng.next() * 0.5;
        h.pur = false; h.cash = 0; h.debt = 0; h.distress = false; h.povRank = 1; h.income = 0; h.need0 = 0; h.uHard = rng.next();
      }
      this.households.slice().sort((a, b) => b.priority - a.priority).forEach((h, i) => { h.rank = i; });
      this.eco = {
        S, day: 0, hist: { t: [], cash: [], rev: [], exp: [], distress: [], cpi: [], trust: [], births: [], deaths: [] },
        px: { food: 1, fuel: 1, medicine: 1, other: 1, foodShock: 0, fuelShock: 0, scarcity: 0, medStress: 0, wage: 1 },
        base: { fuel: p.fuelPrice },
        hh: { n: this.households.length, distress: 0, hunger: 0, income: 0, spend: 0, lost: 0, lostToday: 0, lostFrac: 0, poor: 0, learnLost: 0, transfers: 0, supportPaid: 0, attendAvg: BASE_ATTEND, foodSpend: 0, povertyLine: 0, cpi: 1 },
        gov: {
          cash: 0, reserve: 0, debt: 0, arrears: 0, trust: 0.65, comp: 1, grantDay: 0, calibrated: false, credit: 0, rate: 0.14,
          rev: { tax: 0, business: 0, utility: 0, fares: 0, fines: 0, grant: 0, aid: 0, loan: 0 }, exp: dept0(), interest: 0,
          revY: { tax: 0, business: 0, utility: 0, fares: 0, fines: 0, grant: 0, aid: 0, loan: 0 }, expY: dept0(), revDay: 0, expDay: 0, revLast: 0, expLast: 0, e0: 0,
          plan: dept0(), planShare: dept0(), requests: [], loans: [], lastRides: 0, lastFines: 0, lastEn: null, lastWa: null, rideDay: 0,
          capex: 0, capexList: [], seedFlights: 0, seedRain: 0, levy: 0,
        },
        mat: { incub: [], rooms: [], births: 0, home: 0, facility: 0, turnedAway: 0, preterm: 0, complic: 0, neoDeaths: 0, matDeaths: 0, expNeo: 0, expMat: 0, labourNow: 0, pregnant: pregN, conceived: 0, log: [], bornToday: 0, deathsNat: 0 },
        news: [], vax: 0, cdrScale: 0, spendScale: 1,
      };
      const g = this.eco.gov;
      const E0 = sumOf(this.ecoRun(p)) + 1.35 * this.ecoPayroll();   // a first guess; the first midnight replaces it with measured values
      g.grantDay = 0.78 * E0; g.cash = 25 * E0; g.reserve = 12 * E0; g.credit = 40 * E0; g.e0 = E0;
      this.ecoPlan();
      this.ecoHouseholdsInit();
      this.ecoPurifiers();
      this.ecoComply();
    };
    /* the budget plan: what each department is expected to spend per day; the Government tab can move money between them */
    World.prototype.ecoPlan = function () {
      const g = this.eco.gov, run = this.ecoRun(this.params), pay = this.ecoPayrollBy();
      for (const k of DEPTS) g.plan[k] = Math.max(1, (run[k] || 0) + (pay[k] || 0));
      g.plan.utilities += 0.25 * g.e0;
      const sum = sumOf(g.plan); for (const k of DEPTS) g.planShare[k] = g.plan[k] / sum;
    };

    /* ========================= money helpers ========================= */
    World.prototype.ecoPayrollBy = function () {
      const o = dept0(), S = this.eco.S;
      for (const a of this.agents) {
        if (!a.alive || a.age.key === 'child') continue;
        const j = a.job, sh = PUBLIC[j];
        if (sh && PAYDEPT[j]) o[PAYDEPT[j]] += WAGE[j] * sh * S;
      }
      return o;
    };
    World.prototype.ecoPayroll = function () { return sumOf(this.ecoPayrollBy()); };
    /* running cost of the current settings, Rs per day for the whole city (payroll, power and water come from the model separately) */
    World.prototype.ecoRun = function (p) {
      const e = this.eco, S = e ? e.S : Math.max(1, p.moneyScale), N = this.agents.length, o = dept0();
      let pupils = 0; for (const a of this.agents) if (a.alive && a.age.key === 'child' && !a.infant) pupils++;
      const med = e ? e.px.medicine : 1;
      o.health = S * (p.hospitalBeds * RC.bed + Math.max(0, p.hospitalBeds - 8) * RC.bedExtra + p.ambulances * RC.amb + (p.quarantine ? N * RC.test * p.detectionRate : 0) + N * RC.mask * Math.max(0, p.masks - 20) / 100 + p.medicineRestock * RC.med * med
        + p.birthRooms * RC.room + p.midwives * RC.midwife + p.incubators * RC.incubator + N * RC.antenatal * Math.max(0, p.antenatal - 40) + (p.vaxDrive * N / 100) * RC.vaxDose);
      o.education = S * pupils * RC.pupil * (p.schoolsOpen ? 1 : 0.4);
      o.safety = S * (p.trafficPolice * RC.police + p.challanCameras * RC.camera + p.fireTrucks * RC.fireTruck + p.inspectCapacity * RC.inspector);
      o.transport = S * (p.busesPerHour * 4 * 16 * RC.busTrip + RC.roads + (p.snowPloughs ? RC.plough : 0));
      o.environment = S * (p.wasteFleet * RC.waste + (p.dustControl ? RC.dust : 0) + Math.max(0, p.mediaReach - 60) * RC.media + N * p.purifiers / 100 * RC.purifier + (p.bldgFilters ? RC.bldgFilter : 0) + p.sprayGuns * RC.spray);
      o.utilities = S * (p.maintenanceCrews * RC.crew + Math.max(0, p.gridCapacity - 420) * RC.gridRent + p.solarKw * RC.solarOM + p.batteryKwh * RC.battOM + (p.tankers || 0) * RC.tanker);
      if (p.spendingFreeze) for (const k of DEPTS) o[k] *= 0.96;
      return o;
    };
    World.prototype.ecoWageBill = function () { let s = 0; for (const a of this.agents) if (a.alive && a.age.key !== 'child') s += WAGE[a.job] || 0; return s; };
    World.prototype.ecoBusinessTax = function () { return this.ecoWageBill() * this.eco.S * 0.012; };
    World.prototype.ecoNote = function (text) { const e = this.eco; e.news.unshift({ t: this.tick, text }); if (e.news.length > 60) e.news.length = 60; this.log('city', text); };
    // power and water volumes of the slice are scaled to a realistic use per person for the money figures
    World.prototype.ecoUtilScale = function () { const e = this.eco; if (e.utilK) return e.utilK; return { kwh: 1, m3: 1 }; };

    /* ========================= capital spending on any change ========================= */
    World.prototype.ecoBefore = function (changes) { const b = {}; for (const k in changes) b[k] = this.params[k]; return b; };
    function capexOf(w, p0, changes) {
      let cost = 0; const parts = [];
      const add = (label, x) => { if (x > 0) { cost += x; parts.push(`${label} ${rs(x)}`); } };
      for (const k in changes) {
        const was = p0[k], now = changes[k];
        if (typeof now === 'number' && typeof was === 'number' && now > was && has(CAPEX, k)) add(`${k} +${Math.round((now - was) * 100) / 100}`, (now - was) * CAPEX[k]);
        if (k === 'purifiers' && typeof now === 'number' && now > was) add('home purifiers', (now - was) / 100 * w.eco.hh.n * w.eco.S * HOME_PURIFIER);
        if (k === 'bldgFilters' && now === true && was !== true) add('building filters', BLDG_FILTERS);
        if (k === 'cleanKilns' && now === true && was !== true) add('zigzag kiln support', p0.kilns * KILN_UPGRADE);
      }
      return { cost, parts };
    }
    World.prototype.ecoCharge = function (before, changes) {
      if (!this.eco) return 0;
      const g = this.eco.gov, c = capexOf(this, before, changes);
      if (has(changes, 'purifiers')) this.ecoPurifiers();
      if (c.cost > 0) { g.cash -= c.cost; g.capex += c.cost; g.capexList.unshift({ t: this.tick, cost: c.cost, text: c.parts.join('; ') }); if (g.capexList.length > 40) g.capexList.length = 40; this.ecoNote(`Capital spending ${rs(c.cost)}: ${c.parts.join('; ')}`); }
      return c.cost;
    };
    /* what would these changes cost? (the agents ask before they propose anything) */
    /* running cost per day of settings p1 compared with settings p0 (wages, relief, subsidies, cloud flights and the departments' running costs) */
    World.prototype.ecoSettingsCost = function (p0, p1) {
      const e = this.eco, S = e.S, nH = e.hh.n * S;
      let perDay = sumOf(this.ecoRun(p1)) - sumOf(this.ecoRun(p0));
      const tr = (q) => (q.cashTransfer || 0) * (q.transferShare / 100) * nH;
      perDay += tr(p1) - tr(p0);
      const lossBase = Math.max(e.hh.lostToday, this.ecoWageBill() * S * 0.12);
      perDay += ((p1.wageSupport - p0.wageSupport) / 100) * lossBase;
      perDay += ((p1.cloudSeeding ? 1 : 0) - (p0.cloudSeeding ? 1 : 0)) * SORTIE * 0.3; // a flight on about 3 days in 10
      perDay += ((p1.foodSubsidy - p0.foodSubsidy) / 100) * Math.max(e.hh.foodSpend, nH * 3.5 * 330);
      return perDay;
    };
    World.prototype.ecoPreview = function (sets) {
      const e = this.eco; if (!e) return { once: 0, perDay: 0, revLoss: 0 };
      const p0 = this.params, p1 = Object.assign({}, p0, sets), S = e.S, nH = e.hh.n * S;
      const once = capexOf(this, p0, sets).cost;
      const perDay = this.ecoSettingsCost(p0, p1);
      let revLoss = 0;
      const rides = Math.max(e.gov.rideDay, 30) * S;
      if (sets.busFare != null) revLoss += (p0.busFare - p1.busFare) * rides;
      if (sets.taxRate != null) revLoss -= ((p1.taxRate - p0.taxRate) / 100) * nH * 38; // a higher tax brings money in: a negative loss
      const bt = this.ecoBusinessTax();
      if (sets.marketOpen === false) revLoss += bt * 0.28; if (sets.schoolsOpen === false) revLoss += bt * 0.05; if (sets.gatheringsOpen === false) revLoss += bt * 0.04;
      if (sets.distancing != null) revLoss += bt * 0.4 * Math.max(0, sets.distancing - p0.distancing) / 100;
      return { once, perDay, revLoss };
    };

    /* ========================= households ========================= */
    World.prototype.ecoHouseholdIncome = function (h, nominal) {
      let s = 0;
      for (const m of h.members) {
        if (!m.alive || m.age.key === 'child') continue;
        const w = WAGE[m.job] || 0;
        s += (nominal ? w * BASE_ATTEND : w * clamp(fin(m.attend, BASE_ATTEND), 0, 1.2)) * this.eco.px.wage;
      }
      return s;
    };
    World.prototype.ecoHouseholdsInit = function () {
      const rng = this.econRng, e = this.eco; let inc = 0, needRaw = 0;
      for (const h of this.households) { h.income = this.ecoHouseholdIncome(h, true); inc += h.income; h.needRaw = this.ecoNeedRaw(h); needRaw += h.needRaw; }
      // a household cannot normally spend more than it earns: its spending is its usual needs, capped at 97% of its income.
      // The scale is found so that the whole city spends 88% of what it earns; distress then comes from LOST income or dearer prices.
      const spendAt = (k) => { let t = 0; for (const h of this.households) t += Math.min(h.needRaw * k, 0.97 * h.income); return t; };
      let lo = 0, hi = 5; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (spendAt(mid) < 0.88 * inc) lo = mid; else hi = mid; }
      e.spendScale = (lo + hi) / 2;
      for (const h of this.households) {
        h.need0 = Math.max(1, Math.min(h.needRaw * e.spendScale, 0.97 * h.income)); h.foodShare = clamp((h.members.length * 330 * e.spendScale) / h.need0, 0.2, 0.75);
        h.cash = h.income * (3 + 22 * Math.pow(rng.next(), 1.3));   // savings: 3 to 25 days of income
      }
      this.ecoClassify();
    };
    World.prototype.ecoNeedRaw = function (h) { const alive = h.members.filter((m) => m.alive).length || 1; return alive * 330 + 520 + 240 + 40 + (h.car ? 120 : 0); };
    World.prototype.ecoClassify = function () {
      const e = this.eco, list = this.households.slice().sort((a, b) => a.income / Math.max(1, a.members.length) - b.income / Math.max(1, b.members.length));
      list.forEach((h, i) => { h.povRank = i / list.length; });
      e.hh.poor = list.filter((h) => h.povRank < 0.3).length;
    };
    World.prototype.ecoPurifiers = function () { const e = this.eco; if (!e) return; const n = Math.round((this.params.purifiers / 100) * this.households.length); for (const h of this.households) h.pur = h.rank < n; };
    /* people follow the rules less when they have lost trust or cannot afford to stay at home */
    World.prototype.ecoComply = function () {
      const e = this.eco; if (!e) return; const p = this.params, comp = e.gov.comp;
      for (const a of this.agents) {
        if (!a.alive) continue;
        const h = a.household, hard = h.distress && h.uHard < 0.55 && !(p.cashTransfer > 0 && h.povRank < p.transferShare / 100);
        a.mask = a.uMask < (p.masks / 100) * comp;
        a.distancing = !hard && a.uDistance < (p.distancing / 100) * comp;
      }
    };
    World.prototype.indoorFactor = function (a) {
      if (!(a.mode === 'inside' || a.mode === 'bed')) return 1;
      let f = 0.65;
      if (a.place && a.place.type === 'home') { if (a.household.pur) f *= 0.45; } else if (this.params.bldgFilters) f *= 0.6;
      return f;
    };

    /* ========================= every hour ========================= */
    World.prototype.ecoHourly = function () {
      const e = this.eco; if (!e) return;
      const p = this.params, g = e.gov, S = e.S;
      for (const a of this.agents) {
        if (!a.alive) continue;
        if (a.work && a.place === a.work && a.mode === 'inside') a.workH++;
        if (a.age.key === 'child' && a.school && a.place === a.school && a.mode === 'inside') a.schoolH++;
      }
      const addExp = (k, x) => { g.exp[k] += x; g.expY[k] += x; g.expDay += x; g.cash -= x; };
      const earn = (k, x) => { g.rev[k] += x; g.revY[k] += x; g.revDay += x; g.cash += x; };
      const run = this.ecoRun(p), pay = this.ecoPayrollBy();
      for (const k of DEPTS) addExp(k, ((run[k] || 0) + (pay[k] || 0)) / 24);
      // power and water: the model's volumes are scaled to a realistic use per person
      const E = this.en.tot, W = this.wa.tot, L = g.lastEn || { grid: E.grid, diesel: E.diesel, consumed: E.consumed }, LW = g.lastWa || { inflow: W.inflow, delivered: W.delivered };
      const dGrid = E.grid - L.grid, dDiesel = E.diesel - L.diesel, dCons = E.consumed - L.consumed, dIn = W.inflow - LW.inflow, dDel = W.delivered - LW.delivered;
      g.lastEn = { grid: E.grid, diesel: E.diesel, consumed: E.consumed }; g.lastWa = { inflow: W.inflow, delivered: W.delivered };
      if (!e.utilK && this.tick > 300) { const days = this.tick / TICKS_PER_DAY; e.utilK = { kwh: (KWH_PERSON * this.agents.length) / Math.max(1, E.consumed / days), m3: (M3_PERSON * this.agents.length) / Math.max(1, W.delivered / days) }; }
      const U = this.ecoUtilScale(), kw = S * U.kwh, m3 = S * U.m3;
      const pPow = p.electricityPrice * e.px.other, pWat = p.waterPrice * e.px.other;
      addExp('utilities', (dGrid * GRID_COST + dDiesel * DIESEL_COST) * kw + dIn * WATER_COST * m3);
      earn('utility', dCons * pPow * COLLECT.power * kw + dDel * pWat * COLLECT.water * m3);
      const rides = this.stats.busRides - g.lastRides; g.lastRides = this.stats.busRides; g.rideDay += rides;
      earn('fares', rides * S * p.busFare);
      const fines = this.chal.fines - g.lastFines; g.lastFines = this.chal.fines; earn('fines', fines * S * FINE_COLLECT);
      earn('grant', g.grantDay / 24);
      earn('tax', (e.hh.n * S * 38 * (p.taxRate / 100 + g.levy)) / 24);
      earn('business', (this.ecoBusinessTax() * clamp(fin(e.hh.attendAvg, BASE_ATTEND) / BASE_ATTEND, 0.2, 1.1)) / 24);
      const tr = (p.cashTransfer || 0) * (p.transferShare / 100) * e.hh.n * S / 24; if (tr > 0) { addExp('welfare', tr); e.hh.transfers += tr; }
      if (p.foodSubsidy > 0) addExp('welfare', (p.foodSubsidy / 100) * (e.hh.foodSpend || e.hh.n * S * 3.5 * 330) / 24);
      if (p.wageSupport > 0) { const x = (p.wageSupport / 100) * e.hh.lostToday / 24; addExp('welfare', x); e.hh.supportPaid += x; }
      if (p.sickStayHome > 50) { let sick = 0; for (const a of this.agents) if (a.alive && a.state === 'I' && a.symptomatic && a.age.key === 'adult') sick += WAGE[a.job] || 0; addExp('health', sick * 0.5 * S * (p.sickStayHome - 50) / 50 / 24); }
      if (p.sprayGuns > 0 && this.minuteNow >= 600 && this.minuteNow < 1080) this.wa.tank = Math.max(0, this.wa.tank - 0.18 * p.sprayGuns);
      if (g.debt > 0) { const i = g.debt * g.rate / 365 / 24; g.interest += i; addExp('admin', i); }
      g.arrears = g.cash < 0 ? -g.cash : 0;
      this.ecoMaternityHourly();
    };

    /* ========================= every midnight ========================= */
    World.prototype.ecoDaily = function () {
      const e = this.eco; if (!e) return;
      const p = this.params, g = e.gov, S = e.S, rng = this.econRng, d = this.dayIndex;
      e.day = d;
      // first midnight: set the federal grant so the budget starts about 1.5% in surplus, and open the books
      if (!g.calibrated && d === 1) { /* the books open at the second midnight, after one full day of measurements */ g.revDay = 0; g.expDay = 0; for (const q in g.rev) { g.rev[q] = 0; g.revY[q] = 0; } for (const q of DEPTS) { g.exp[q] = 0; g.expY[q] = 0; } g.interest = 0; }
      else if (!g.calibrated && d >= 2) {
        const k = 1, spent = g.expDay * k, own = (g.revDay - g.rev.grant) * k;
        // the grant is set for the city as it is WITHOUT the v17 relief and subsidy settings, so a policy that is already switched on at the start is paid for from the treasury like any other
        const p0 = Object.assign({}, p); for (const key of POLICY_KEYS) p0[key] = DEFAULT_PARAMS[key];
        const delta = Math.max(0, this.ecoSettingsCost(p0, p)), base = Math.max(1, spent - delta);
        const ownBase = own + (DEFAULT_PARAMS.busFare - p.busFare) * g.rideDay * S + g.rev.tax * (100 / Math.max(1, p.taxRate) - 1); // fares and tax as they would be at the normal fare and tax rate
        g.grantDay = Math.max(0, (base - ownBase) * 0.985); g.calibrated = true; g.e0 = base;
        g.cash = 25 * base; g.reserve = 12 * base; g.credit = 40 * base;
        const run = this.ecoRun(p), pay = this.ecoPayrollBy(); let rest = spent;
        for (const q of DEPTS) { g.plan[q] = Math.max(1, (run[q] || 0) + (pay[q] || 0)); rest -= g.plan[q]; }
        g.plan.utilities += Math.max(0, rest);
        const sum = sumOf(g.plan); for (const q of DEPTS) g.planShare[q] = g.plan[q] / sum;
        g.revDay = 0; g.expDay = 0; for (const q in g.rev) { g.rev[q] = 0; g.revY[q] = 0; } for (const q of DEPTS) { g.exp[q] = 0; g.expY[q] = 0; } g.interest = 0;
        g.revLast = own + g.grantDay; g.expLast = spent;
      } else { g.revLast = g.revDay; g.expLast = g.expDay; }
      e.hist.t.push(d); e.hist.cash.push(Math.round(g.cash)); e.hist.rev.push(Math.round(g.revLast)); e.hist.exp.push(Math.round(g.expLast));
      g.revDay = 0; g.expDay = 0; g.rideLast = g.rideDay; g.rideDay = 0;
      for (const r of g.requests.slice()) if (r.arrive <= this.tick) {
        g.requests = g.requests.filter((x) => x !== r);
        if (r.granted > 0) { g.cash += r.granted; g.rev.aid += r.granted; g.revY.aid += r.granted; g.revDay += r.granted; this.ecoNote(`The province approved ${rs(r.granted)} of the ${rs(r.asked)} you asked for.`); }
        else this.ecoNote(`The province refused the request for ${rs(r.asked)}.`);
      }
      this.ecoHouseholdsDaily();
      const hh = e.hh, N = Math.max(1, this.agents.length), c = this.counts(), deathRate = ((c.D + c.X) / N) * 1000, burden = this.ecoRestriction();
      const target = clamp(0.7 - 0.55 * (hh.distress / Math.max(1, hh.n)) - 0.35 * burden - (g.arrears > 0 ? 0.25 : 0) - 0.012 * deathRate - 0.5 * clamp((e.px.food - 1) * 0.5 + (e.px.fuel - 1) * 0.15, 0, 0.3) + (p.cashTransfer > 0 ? 0.06 : 0), 0.05, 0.95);
      g.trust += (target - g.trust) * 0.06;
      g.comp = Math.min(1, 1 + 0.6 * (g.trust - 0.65));
      this.ecoComply();
      this.ecoPrices();
      e.hist.distress.push(Math.round(100 * hh.distress / Math.max(1, hh.n))); e.hist.cpi.push(Math.round(this.ecoCpi() * 1000) / 10); e.hist.trust.push(Math.round(g.trust * 100));
      this.ecoDemography(rng);
      e.hist.births.push(e.mat.births); e.hist.deaths.push(e.mat.deathsNat);
      this.ecoSeeding(rng);
      this.ecoVaccinate();
      for (const a of this.agents) { a.workH = 0; a.schoolH = 0; }
      e.mat.bornToday = 0;
    };
    World.prototype.ecoRestriction = function () {
      const p = this.params; let b = 0;
      if (!p.schoolsOpen) b += 0.25; if (!p.gatheringsOpen) b += 0.1; if (!p.marketOpen) b += 0.25; b += 0.3 * p.distancing / 100 + (p.oddEven ? 0.05 : 0);
      return clamp(b, 0, 1);
    };
    World.prototype.ecoCpi = function () { const x = this.eco.px, p = this.params; return 0.45 * x.food * (1 - p.foodSubsidy / 100) + 0.15 * x.fuel + 0.12 * (p.electricityPrice / 45) + 0.03 * (p.waterPrice / 30) + 0.05 * x.medicine + 0.2 * x.other; };

    /* households: yesterday's pay, today's spending, savings */
    World.prototype.ecoHouseholdsDaily = function () {
      const e = this.eco, p = this.params, hh = e.hh, S = e.S, wd = (this.dayIndex - 1) % 7, weekday = wd >= 0 && wd < 5, x = e.px;
      let att = 0, attN = 0;
      for (const a of this.agents) {
        if (!a.alive || a.age.key === 'child') continue;
        const j = a.job;
        if (weekday && (a.work || j === 'none')) {
          let f;
          if (a.hospitalized || a.isolated || a.injured || a.away) f = DAILY[j] ? 0 : 0.6;
          else if (a.workH >= 4) f = 1;
          else if (a.distancing && WFH[j]) f = WFH[j];
          else if (a.work && !this.isOpen(a.work)) f = PUBLIC[j] ? 1 : DAILY[j] ? 0 : 0.5;
          else if (a.state === 'I' && a.symptomatic) f = DAILY[j] ? 0 : 0.8;
          else f = j === 'none' ? 0.96 : 0.9;
          a.attend += (DAILY[j] ? 1 : 0.2) * (f * BASE_ATTEND - a.attend);
        }
        att += a.attend; attN++;
      }
      hh.attendAvg = attN ? att / attN : BASE_ATTEND;
      const othIdx = 0.3 * x.other + 0.35 * (p.electricityPrice / 45) + 0.05 * (p.waterPrice / 30) + 0.1 * x.fuel + 0.2, foodIdx = x.food * (1 - p.foodSubsidy / 100);
      let distress = 0, hunger = 0, inc = 0, spend = 0, lost = 0, nomW = 0, food = 0;
      for (const h of this.households) {
        const earn = this.ecoHouseholdIncome(h, false), nom = this.ecoHouseholdIncome(h, true), lostHere = Math.max(0, nom - earn);
        let income = earn;
        if (p.cashTransfer > 0 && h.povRank < p.transferShare / 100) income += p.cashTransfer;
        if (p.wageSupport > 0) income += lostHere * (p.wageSupport / 100);
        const alive = h.members.filter((m) => m.alive).length;
        const need = h.need0 * (h.foodShare * foodIdx + (1 - h.foodShare) * othIdx) * (alive ? 1 : 0);
        food += h.need0 * h.foodShare * foodIdx;
        h.cash += income - need;
        if (h.cash < 0) { h.debt = -h.cash; h.cash = Math.max(h.cash, -12 * Math.max(1, h.need0)); } else h.debt = 0;
        h.distress = h.cash < 0; if (h.distress) distress++; if (h.cash < -6 * h.need0) hunger++;
        inc += income; spend += need; lost += lostHere; nomW += nom;
      }
      hh.distress = distress; hh.hunger = hunger; hh.income = inc * S; hh.spend = spend * S; hh.foodSpend = food * S; hh.lostToday = lost * S; hh.lost += lost * S; hh.lostFrac = nomW > 0 ? lost / nomW : 0;
      if (!p.schoolsOpen) { let ch = 0; for (const a of this.agents) if (a.alive && a.age.key === 'child' && !a.infant) ch++; hh.learnLost += ch * S * 0.65; }
      hh.cpi = this.ecoCpi();
    };

    /* ========================= prices ========================= */
    World.prototype.ecoPrices = function () {
      const e = this.eco, p = this.params, x = e.px, rng = this.econRng;
      x.other *= 1 + 0.12 / 365;                         // about 12% a year for everything that is not shocked
      x.wage += (x.other - x.wage) / 90;                 // wages follow general prices with a lag of about three months
      x.scarcity = clamp(x.scarcity + (p.marketOpen ? -0.08 : 0.06) - (p.groceryDelivery > 30 ? 0.01 : 0), 0, 0.45);
      x.foodShock *= 0.94;
      if (rng.next() < 0.012) { x.foodShock += rng.range(0.1, 0.25); this.ecoNote(`Food prices jump after a supply shock (+${Math.round(x.foodShock * 100)}%).`); }
      x.food += ((p.foodPrice / 330) * x.other * (1 + x.scarcity + x.foodShock + 0.2 * (x.fuel - 1)) - x.food) * 0.5;
      x.fuelShock *= 0.97;
      if (rng.next() < 0.01) { x.fuelShock += rng.range(-0.1, 0.18); this.ecoNote(`Petrol price ${x.fuelShock >= 0 ? 'rises' : 'falls'} ${Math.abs(Math.round(x.fuelShock * 100))}%.`); }
      x.fuel = (p.fuelPrice / e.base.fuel) * (1 + x.fuelShock);
      const stock = this.pharmacy.stock / Math.max(1, p.medicineStock), c = this.counts(), sick = (c.I + c.E) / Math.max(1, this.agents.length);
      x.medStress = clamp(0.8 * Math.max(0, 0.35 - stock) + 1.2 * sick, 0, 0.8);
      x.medicine += ((p.medicinePrice / 150) * x.other * (1 + x.medStress) - x.medicine) * 0.4;
    };
    World.prototype.ecoPriceTable = function () {
      const e = this.eco, p = this.params, x = e.px;
      return [
        { item: 'Food basket (per person per day)', now: p.foodPrice * x.food / (x.other || 1) * x.other, unit: 'Rs', base: 330, why: x.scarcity > 0.02 ? 'scarcity from the shut bazaar' : x.foodShock > 0.02 ? 'supply shock' : 'general inflation' },
        { item: 'Petrol (per litre)', now: p.fuelPrice * (1 + x.fuelShock), unit: 'Rs', base: e.base.fuel, why: Math.abs(x.fuelShock) > 0.01 ? 'market shock' : 'steady' },
        { item: 'Electricity (per kWh)', now: p.electricityPrice, unit: 'Rs', base: 45, why: 'tariff set by the city' },
        { item: 'Water (per m³)', now: p.waterPrice, unit: 'Rs', base: 30, why: 'tariff set by the city' },
        { item: 'Medicine (per course)', now: p.medicinePrice * x.medicine, unit: 'Rs', base: 150, why: x.medStress > 0.05 ? 'shelves low or many sick' : 'general inflation' },
        { item: 'Bus fare (per ride)', now: p.busFare, unit: 'Rs', base: 60, why: 'set by the city' },
        { item: 'Cost-of-living index', now: this.ecoCpi() * 100, unit: '', base: 100, why: 'food 45%, fuel 15%, power 12%, water 3%, medicine 5%, other 20%' },
      ];
    };

    /* ========================= the government's tools (called only after you approve) ========================= */
    World.prototype.ecoRequestGrant = function (amount) {
      const g = this.eco.gov, rng = this.econRng, granted = rng.next() < 0.7 ? amount * rng.range(0.5, 1) : 0;
      g.requests.push({ asked: amount, granted, arrive: this.tick + TICKS_PER_DAY * Math.round(rng.range(3, 6)), t: this.tick });
      return `Request for ${rs(amount)} sent to the province. The answer comes in 3 to 6 days and may be a part payment or a no.`;
    };
    World.prototype.ecoBorrow = function (amount) {
      const g = this.eco.gov; amount = Math.min(amount, Math.max(0, g.credit - g.debt));
      if (!(amount > 0)) return 'No credit left.';
      g.debt += amount; g.cash += amount; g.rev.loan += amount; g.revY.loan += amount; g.loans.push({ t: this.tick, amount });
      return `Borrowed ${rs(amount)} at ${Math.round(g.rate * 100)}% a year.`;
    };
    World.prototype.ecoRepay = function (amount) { const g = this.eco.gov; amount = Math.min(amount, g.debt, Math.max(0, g.cash)); if (!(amount > 0)) return 'Nothing to repay.'; g.debt -= amount; g.cash -= amount; return `Repaid ${rs(amount)}.`; };
    World.prototype.ecoUseReserve = function (amount) { const g = this.eco.gov; amount = Math.min(amount, g.reserve); if (!(amount > 0)) return 'The emergency fund is empty.'; g.reserve -= amount; g.cash += amount; return `Moved ${rs(amount)} from the emergency fund to the treasury.`; };
    World.prototype.ecoRefillReserve = function (amount) { const g = this.eco.gov; amount = Math.min(amount, Math.max(0, g.cash)); if (!(amount > 0)) return 'No spare cash.'; g.reserve += amount; g.cash -= amount; return `Put ${rs(amount)} into the emergency fund.`; };
    World.prototype.ecoMove = function (from, to, share) {
      const g = this.eco.gov; if (!DEPTS.includes(from) || !DEPTS.includes(to) || from === to) return 'Unknown department.';
      share = clamp(fin(share, 0), 0, 0.5); const x = g.plan[from] * share; g.plan[from] -= x; g.plan[to] += x; const sum = sumOf(g.plan); for (const k of DEPTS) g.planShare[k] = g.plan[k] / sum;
      return `Moved ${Math.round(share * 100)}% of the ${from} budget (${rs(x)} a day) to ${to}.`;
    };
    World.prototype.ecoSetLevy = function (v) { this.eco.gov.levy = clamp(fin(v, 0), 0, 0.5); return `Emergency levy set to +${Math.round(this.eco.gov.levy * 100)}% on the property tax.`; };
    World.prototype.fiscal = function () {
      const e = this.eco; if (!e) return null; const g = e.gov;
      const dayExp = g.expLast || g.e0 || 1, dayRev = g.revLast || g.grantDay, burn = Math.max(1, dayExp - dayRev), credit = Math.max(0, g.credit - g.debt);
      return { cash: g.cash, reserve: g.reserve, debt: g.debt, credit, arrears: g.arrears, trust: g.trust, comp: g.comp, dayExp, dayRev, net: dayRev - dayExp,
        runway: dayRev >= dayExp ? 999 : Math.max(0, g.cash) / burn, runwayAll: dayRev >= dayExp ? 999 : Math.max(0, g.cash + g.reserve + credit) / burn,
        distress: e.hh.distress / Math.max(1, e.hh.n), cpi: this.ecoCpi(), lostToday: e.hh.lostToday, pending: g.requests.reduce((s, r) => s + r.granted, 0) };
    };

    /* ========================= clouds ========================= */
    World.prototype.ecoSeeding = function (rng) {
      const p = this.params, g = this.eco.gov; if (!p.cloudSeeding) return;
      const d0 = this.dayStart(this.dayIndex), cloudy = { spring: 0.25, summer: 0.35, autumn: 0.12, winter: 0.25 }[this.season.key] || 0.15;
      const natural = this.spells.find((s) => s.kind === 'rain' && s.a >= d0 - 60 && s.a < d0 + 1200);
      const u = rng.next(), v = rng.next(), len = rng.range(90, 180), at = rng.range(420, 900), ext = Math.round(rng.range(40, 100));
      if (natural) { natural.b += ext; natural.max = Math.min(1, natural.max * 1.2); this.ecoFlight('Cloud seeding flight: rain was already coming; the spell was made longer and a little heavier.'); }
      else if (u < cloudy) { this.ecoFlight(v < 0.4 ? 'Cloud seeding flight: suitable clouds. A light rain spell started.' : 'Cloud seeding flight: suitable clouds, but no rain came.'); if (v < 0.4) { this.spells.push({ kind: 'rain', a: d0 + Math.round(at), b: d0 + Math.round(at + len), max: 0.45 }); g.seedRain++; } }
      else this.ecoNote('Cloud seeding: the sky was clear and dry, so no flight was made and nothing was spent.');
    };
    World.prototype.ecoFlight = function (text) { const g = this.eco.gov; g.cash -= SORTIE; g.exp.environment += SORTIE; g.expY.environment += SORTIE; g.expDay += SORTIE; g.seedFlights++; this.ecoNote(`${text} Cost ${rs(SORTIE)}.`); };
    World.prototype.ecoVaccinate = function () {
      const p = this.params; if (!(p.vaxDrive > 0)) return;
      const n = Math.round((p.vaxDrive / 100) * this.agents.length), pool = this.agents.filter((a) => a.alive && !a.vaccinated && a.state === 'S');
      pool.sort((a, b) => b.age.severe - a.age.severe || a.uVaccine - b.uVaccine);
      for (const a of pool.slice(0, n)) { a.vaccinated = true; this.eco.vax++; }
    };

    /* ========================= people: ageing, deaths, pregnancies, births ========================= */
    const hazard = (a, pm) => {
      let q = a.ageYears < 10 ? 0.0006 : 0.00003 * Math.exp(0.1 * a.ageYears);
      if (a.diabetic) q *= 1.5; if (a.hypertensive) q *= 1.3; if (a.asthmatic) q *= 1.1; if (a.smoker) q *= 1.6;
      return q * (1 + clamp((pm - 25) * 0.002, 0, 0.25));
    };
    World.prototype.ecoDemography = function (rng) {
      const e = this.eco, p = this.params, m = e.mat, mul = Math.max(1, p.demoMul);
      if (!e.cdrScale) { let s = 0, n = 0; for (const a of this.agents) { s += hazard(a, 25); n++; } e.cdrScale = n ? (CDR / 1000) / (s / n) : 1; }
      for (const a of this.agents) if (a.alive) a.ageYears += 1 / 365;
      for (const a of this.agents) if (a.infant && a.ageYears >= 4) { a.infant = false; a.school = this.schools ? this.schools[0] : null; a.job = 'pupil'; }
      for (const a of this.agents) {
        if (!a.alive || a.busy || a.infant || a.mode !== 'inside' || !a.place || a.place.type !== 'home') continue;
        if (rng.next() < hazard(a, this.pm) * e.cdrScale * mul / 365) this.ecoNaturalDeath(a);
      }
      const fertile = this.agents.filter((a) => a.alive && a.female && a.age.key === 'adult' && a.ageYears < 45).length;
      const lam = (CBR / 1000) * this.agents.length / Math.max(1, fertile) / 365;
      for (const a of this.agents) {
        if (!a.alive || !a.female || a.age.key !== 'adult' || a.ageYears >= 45 || a.preg || a.labour || a.postpartum > this.tick) continue;
        const f = a.ageYears < 20 ? 0.6 : a.ageYears < 35 ? 1.25 : 0.55;
        if (rng.next() < lam * f * mul) { a.preg = { due: this.tick + Math.round((GESTATION + rng.range(-12, 10)) * TICKS_PER_DAY / mul), start: this.tick }; m.conceived++; }
      }
      m.pregnant = this.agents.filter((a) => a.alive && a.preg).length;
    };
    World.prototype.ecoNaturalDeath = function (a) {
      a.state = 'D'; a.deathCause = 'natural'; a.diedAtTick = this.tick; a.diedWhere = 'home'; a.activity = 'Died at home'; a.plan = []; a.mode = 'dead';
      this.scheduleFuneral(a); this.eco.mat.deathsNat++;
      for (const q of a.household.members) if (q !== a && q.alive) q.stress = Math.min(1, q.stress + 0.2);
      this.log('death', `Person #${a.id} (age ${Math.floor(a.ageYears)}) died at home of natural causes`);
    };
    World.prototype.ecoMaternityHourly = function () {
      const e = this.eco, m = e.mat, p = this.params;
      for (const a of this.agents) if (a.alive && a.preg && !a.labour && this.tick >= a.preg.due) this.ecoLabour(a);
      for (const a of this.agents) if (a.alive && a.labour && this.tick >= a.labour.deliverAt) this.ecoDeliver(a);
      m.labourNow = 0; for (const a of this.agents) if (a.labour) m.labourNow++;
      m.rooms = m.rooms.filter((r) => r.until > this.tick); m.incub = m.incub.filter((u) => u > this.tick);
      m.roomsFree = Math.max(0, p.birthRooms - m.rooms.length);
    };
    World.prototype.ecoLabour = function (a) {
      const e = this.eco, m = e.mat, p = this.params, rng = this.econRng;
      if (a.mode !== 'inside' && a.mode !== 'bed') return;
      m.rooms = m.rooms.filter((r) => r.until > this.tick);
      const willing = a.uFac < clamp(0.45 + 0.35 * p.antenatal / 100, 0, 0.95), power = this.en.hospPw >= 0.5, room = m.rooms.length < p.birthRooms, staff = m.rooms.length < p.midwives * 2, flooded = this.flood > 0.6;
      const hours = rng.range(6, 14);
      let facility = false, why = '';
      if (willing) { if (!power) why = 'the hospital had no power'; else if (!room) why = 'all delivery rooms were full'; else if (!staff) why = 'no midwife was free'; else if (flooded) why = 'the roads were flooded'; else facility = true; } else why = 'she chose to give birth at home';
      a.labour = { start: this.tick, deliverAt: this.tick + Math.round(hours * 60), facility, why };
      if (facility) {
        m.rooms.push({ id: a.id, until: a.labour.deliverAt + 120 });
        a.plan = []; a.planIdx = 0;
        if (a.place && a.place !== this.hospital) a.travelTo(this.hospital, this, 'In labour at the birth centre', { taxi: true, stay: Math.round(hours * 60) + 30 });
        else a.activity = 'In labour at the birth centre';
      } else {
        if (willing) { m.turnedAway++; this.ecoNote(`A woman in labour could not use the birth centre because ${why}. She gave birth at home.`); }
        a.activity = 'In labour at home';
      }
    };
    World.prototype.ecoDeliver = function (a) {
      const e = this.eco, m = e.mat, p = this.params, rng = this.econRng, L = a.labour, mul = Math.max(1, p.demoMul);
      a.labour = null; a.preg = null;
      const fac = L.facility, power = this.en.hospPw >= 0.5;
      const pre = rng.next() < PRETERM_BASE * (1 + clamp((a.exposure - 0.2) * 0.8, 0, 0.8));
      const pCompl = 0.15 * (1 - 0.35 * p.antenatal / 100) * (pre ? 1.3 : 1), compl = rng.next() < pCompl;
      m.incub = m.incub.filter((u) => u > this.tick);
      const hasInc = fac && power && m.incub.length < p.incubators;
      if (pre && hasInc) m.incub.push(this.tick + Math.round(14 * TICKS_PER_DAY / mul));
      const pMat = pCompl * (fac && power ? 0.004 : fac ? 0.015 : 0.025), pNeo = pre ? (hasInc ? 0.08 : fac ? 0.25 : 0.3) : (fac ? 0.012 : 0.03);
      m.expMat += pMat; m.expNeo += pNeo;
      if (fac) m.facility++; else m.home++;
      m.births++; m.bornToday++; if (pre) m.preterm++; if (compl) m.complic++;
      const id = this.agents.length, saved = this.rng; this.rng = this.econRng;
      let baby; try { baby = new Agent(id, AGE_GROUPS[0], a.household, this); } finally { this.rng = saved; }
      Object.assign(baby, { female: rng.next() < 0.487, ageYears: 0, infant: true, labour: null, preg: null, postpartum: 0, workH: 0, schoolH: 0, attend: BASE_ATTEND, uFac: rng.next(), school: null, job: 'infant', born: this.tick, lowWeight: pre });
      baby.applyBehaviour(p); baby.vaccinated = false; baby.exposure = a.exposure;
      this.agents.push(baby); a.household.members.push(baby);
      if (rng.next() < pNeo) { baby.state = 'D'; baby.deathCause = 'natural'; baby.diedAtTick = this.tick; baby.diedWhere = fac ? 'hospital' : 'home'; baby.mode = 'dead'; baby.activity = 'Died soon after birth'; m.neoDeaths++; m.deathsNat++; this.scheduleFuneral(baby); this.log('death', `A newborn died soon after birth (${fac ? 'at the birth centre' : 'at home'}${pre ? ', born early' : ''})`); }
      if (rng.next() < pMat) { a.state = 'D'; a.deathCause = 'natural'; a.diedAtTick = this.tick; a.diedWhere = fac ? 'hospital' : 'home'; a.activity = 'Died after childbirth'; a.plan = []; a.mode = 'dead'; m.matDeaths++; m.deathsNat++; this.scheduleFuneral(a); this.log('death', `Person #${a.id} died after childbirth (${fac ? 'at the birth centre' : 'at home'})`); }
      else { a.postpartum = this.tick + Math.round(365 * 0.9 * TICKS_PER_DAY / mul); if (fac && a.mode === 'inside' && a.place === this.hospital) a.travelTo(a.home, this, 'At home with the baby'); }
      this.log('birth', `Baby born ${fac ? 'at the birth centre' : 'at home'}${pre ? ' (early)' : ''}${compl ? ', with a complication' : ''} to Person #${a.id}`);
      m.log.push({ t: this.tick, fac, pre, compl }); if (m.log.length > 200) m.log.shift();
    };
    World.prototype.maternal = function () {
      const e = this.eco; if (!e) return null; const m = e.mat, p = this.params;
      let dueSoon = 0; for (const a of this.agents) if (a.alive && a.preg && a.preg.due - this.tick < 3 * TICKS_PER_DAY / Math.max(1, p.demoMul) + 60) dueSoon++;
      return { pregnant: m.pregnant, dueSoon, labourNow: m.labourNow, rooms: p.birthRooms, roomsFree: Math.max(0, p.birthRooms - m.rooms.length), midwives: p.midwives, incubators: p.incubators, incubFree: Math.max(0, p.incubators - m.incub.length), births: m.births, facility: m.facility, home: m.home, turnedAway: m.turnedAway, preterm: m.preterm, complic: m.complic, neoDeaths: m.neoDeaths, matDeaths: m.matDeaths, expNeo: m.expNeo, expMat: m.expMat, power: this.en.hospPw >= 0.5, antenatal: p.antenatal };
    };
    World.prototype.populationNow = function () { let alive = 0, ch = 0, ad = 0, el = 0, inf = 0; for (const a of this.agents) if (a.alive) { alive++; if (a.age.key === 'child') ch++; else if (a.age.key === 'adult') ad++; else el++; if (a.infant) inf++; } return { alive, children: ch, adults: ad, elders: el, infants: inf, total: this.agents.length }; };
    World.prototype.ecoDepts = () => DEPTS;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = install;
  else if (typeof World !== 'undefined') install({ World, Agent, AGE_GROUPS, TICKS_PER_DAY, Random, DEFAULT_PARAMS });
  root.OLInstallEcon = install;
})(typeof window !== 'undefined' ? window : globalThis);

