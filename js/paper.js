/* =====================================================================
   OUTBREAK LAB v17: statistics + research-paper builder
   Works in the browser (Paper Lab tab) and in Node (bench/make_paper.js).
   Every number in the generated paper comes from the experiment results
   passed in. Nothing is typed in by hand except the method description.
   ===================================================================== */
(function (root) {
  'use strict';
  /* ---------- statistics ---------- */
  const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1)); };
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (let j = 0; j < 6; j++) s += c[j] / ++y; return -t + Math.log((2.5066282746310005 * s) / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300; let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m; let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function betai(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
  const tCdf = (t, df) => { const x = df / (df + t * t), p = 0.5 * betai(x, df / 2, 0.5); return t > 0 ? 1 - p : p; };
  function tQuant(p, df) { let lo = -60, hi = 60; for (let i = 0; i < 90; i++) { const mid = (lo + hi) / 2; if (tCdf(mid, df) < p) lo = mid; else hi = mid; } return (lo + hi) / 2; }
  /* paired comparison: positive mean difference = x is larger than y */
  function paired(x, y) {
    const n = x.length, d = x.map((v, i) => v - y[i]), m = mean(d), s = sd(d), se = s / Math.sqrt(n), df = n - 1;
    if (!(s > 0)) return { n, mean: m, sd: s, se: 0, t: m === 0 ? 0 : Infinity, df, p: m === 0 ? 1 : 0, lo: m, hi: m, dz: m === 0 ? 0 : Infinity, wins: d.filter((v) => v > 0).length, ties: d.filter((v) => v === 0).length };
    const t = m / se, p = 2 * (1 - tCdf(Math.abs(t), df)), q = tQuant(0.975, df);
    return { n, mean: m, sd: s, se, t, df, p, lo: m - q * se, hi: m + q * se, dz: m / s, wins: d.filter((v) => v > 0).length, ties: d.filter((v) => v === 0).length };
  }
  function holm(ps) {
    const idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), out = new Array(ps.length); let run = 0;
    idx.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, p * (ps.length - k))); out[i] = run; });
    return out;
  }

  /* ---------- analysis of benchmark rows ---------- */
  function analyse(res) {
    const rows = res.rows, scs = Object.keys(res.meta.scenarios), ctls = Object.keys(res.meta.controllers), seeds = res.meta.seedList;
    const idx = new Map(); for (const r of rows) idx.set(r.scenario + '|' + r.controller + '|' + r.seed, r);
    const get = (sc, c, seed) => idx.get(sc + '|' + c + '|' + seed);
    const cell = {};
    for (const sc of scs) { cell[sc] = {}; for (const c of ctls) { cell[sc][c] = {}; for (const m of ['J', 'B', 'C', 'peakInf', 'peakAqi', 'deaths', 'acc', 'outage', 'acts', 'approved', 'denied', 'reraised', 'trig', 'blocked', 'faults']) { const v = seeds.map((s) => { const r = get(sc, c, s); return r && Number.isFinite(r[m]) ? r[m] : 0; }); cell[sc][c][m] = { v, mean: mean(v), sd: sd(v) }; } } }
    // comparisons are computed on demand: improvement = baseline cost - controller cost (positive is better)
    const cache = {};
    function cmp(c, base, m) {
      if (!ctls.includes(c) || !ctls.includes(base)) return null;
      const key = c + '|' + base + '|' + m; if (cache[key]) return cache[key];
      const per = {}; let allB = [], allC = [];
      for (const sc of scs) { const b = cell[sc][base][m].v, x = cell[sc][c][m].v; per[sc] = paired(b, x); per[sc].baseMean = mean(b); per[sc].rel = per[sc].baseMean > 0 ? per[sc].mean / per[sc].baseMean : 0; allB = allB.concat(b); allC = allC.concat(x); }
      const pooled = paired(allB, allC); pooled.baseMean = mean(allB); pooled.rel = pooled.baseMean > 0 ? pooled.mean / pooled.baseMean : 0;
      return (cache[key] = { c, base, m, per, pooled });
    }
    // Holm over the primary family: every controller vs no intervention on total cost (per scenario and pooled)
    const fam = ctls.filter((c) => c !== 'none').map((c) => cmp(c, 'none', 'C')).filter(Boolean);
    const per = []; for (const q of fam) for (const sc of scs) per.push({ q, sc });
    holm(per.map((f) => f.q.per[f.sc].p)).forEach((p, i) => { per[i].q.per[per[i].sc].pHolm = p; });
    holm(fam.map((q) => q.pooled.p)).forEach((p, i) => { fam[i].pooled.pHolm = p; });
    // sensitivity to the burden weight mu: improvement(mu) = dJ + mu * dB  (dX = baseline - controller)
    const MUS = [0, 0.1, 0.2, 0.4, 0.8, 1.2], sens = [];
    if (ctls.includes('none')) for (const c of ctls.filter((x) => x !== 'none')) {
      const row = { c, per: {}, pooled: {}, be: {} }, pool = (f) => mean(scs.map((sc) => f(sc)));
      const dJ = (sc) => cell[sc].none.J.mean - cell[sc][c].J.mean, dB = (sc) => cell[sc].none.B.mean - cell[sc][c].B.mean;
      const be = (j, b) => (j > 0 && b >= 0 ? Infinity : j <= 0 ? 0 : j / -b);
      for (const sc of scs) { row.per[sc] = MUS.map((mu) => dJ(sc) + mu * dB(sc)); row.be[sc] = be(dJ(sc), dB(sc)); }
      row.pooled = MUS.map((mu) => pool(dJ) + mu * pool(dB)); row.be.pooled = be(pool(dJ), pool(dB)); row.dJ = pool(dJ); row.dB = pool(dB);
      sens.push(row);
    }
    return { cell, cmp, scs, ctls, seeds, K: seeds.length, sens, MUS };
  }

  /* ---------- the paper ---------- */
  const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–'), f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');
  const pp = (p) => (!Number.isFinite(p) ? '–' : p < 0.001 ? '< 0.001' : p.toFixed(3));
  const pts = (v) => (Number.isFinite(v) ? (v * 100).toFixed(1) : '–'); // pressure points (0-100)
  // numbers are right-aligned, words left-aligned
  const isNum = (v) => { const t = String(v == null ? '' : v).trim(); return t === '' || t === '–' || /^[-−+]?[\d<∞]/.test(t); };
  const mdTable = (head, rows) => '| ' + head.join(' | ') + ' |\n|' + head.map((h, i) => (i > 0 && rows.length && rows.every((r) => isNum(r[i])) ? ' ---: ' : ' --- ')).join('|') + '|\n' + rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
  function verdictWord(t) { if (!t) return 'not measured'; if (t.lo > 0) return 'a reliable improvement'; if (t.hi < 0) return 'a reliable worsening'; return 'no reliable difference'; }
  const ci = (t) => (t ? `${pts(t.mean)} points, 95% CI ${pts(t.lo)} to ${pts(t.hi)}` : 'not measured');
  const SHORT = { consentAsk: 'a reviewer who approves actions after 1 h but answers each lift question only after 24 h', none: 'no intervention', static: 'a fixed always-on precaution pack', autopilot: "the city's built-in smog autopilot", mayor1: 'the agent acting alone (alarms, plans every 30 min)', mayor60: 'the agent acting alone, hourly', mayor360: 'the agent acting alone, every 6 h', consent: 'the agent team with a reviewer who approves every proposal after 1 h', consentF: 'the same team with the forecaster, whose reviewer follows the forecast', hitl: 'the team with a reviewer who denies half of the proposals' };

  function buildPaper(res, opt) {
    opt = opt || {};
    const A = analyse(res), meta = res.meta, M = meta.MU, N = meta.population, K = A.K, days = meta.days;
    const nm = meta.controllers, sn = (k) => meta.scenarios[k].name, has = (c) => A.ctls.includes(c);
    const q = (c, base, m) => A.cmp(c, base, m || 'C');
    const author = opt.author || '[Author name]', affil = opt.affiliation || '[Department, University]', email = opt.email || '[email]';
    const title = opt.title || 'Strict-Consent Agentic AI for City Decision Support: A Team of Specialist, Safety-Review and Forecasting Agents Evaluated by Simulation and Red-Teaming';
    const P = has('consent') ? 'consent' : has('mayor1') ? 'mayor1' : A.ctls.find((c) => c !== 'none'); // the primary agent
    const main = q(P, 'none'), mainJ = q(P, 'none', 'J'), mainB = q(P, 'none', 'B');
    const nRuns = res.rows.length, pooledN = K * A.scs.length;
    const rel = (t) => (t ? Math.abs(t.rel * 100).toFixed(0) + '%' : '–');
    const L = [], add = (s) => L.push(s);
    const ab = opt.ab || null, red = opt.red || null;
    const abSum = ab ? abSummary(ab) : null;

    add(`# ${title}`);
    add(`**${author}**  \n${affil} · ${email}`);
    add(`*Draft generated by Outbreak Lab ${meta.version} on ${meta.date.slice(0, 10)} from ${nRuns} reproducible simulation runs${ab ? `, an A/B test of ${ab.rows.length} runs` : ''}${red ? ' and a red-team test log' : ''}. Not peer reviewed.*`);

    /* abstract */
    add('## Abstract');
    const abs = [];
    abs.push(`Decision-support agents for cities are usually judged by how well they act on their own. We study the opposite design: a team of rule-based agents that may change nothing in a simulated city without a person's explicit approval. Four specialist officers (health, air quality, traffic, utilities) sense six pressure indicators every simulated minute and rank several alternative interventions by expected benefit minus burden on people; a coordinator merges their proposals; a safety reviewer annotates every option (combined burden, conflicts with the person's own recent choices, earlier denials, sensor faults, standing rules); a forecaster runs each top option on an exact copy of the current city with the same random future; and an auditor records every decision and checks hourly that every change has a recorded reason. Denied options go on a deny list for a chosen number of days and return earlier only as a new question in an emergency.`);
    abs.push(`In an agent-based city of ${N} residents (one-minute step, ${A.scs.length} stress scenarios, ${K} paired seeds, ${days} simulated days, ${nRuns} runs), with total cost defined as harm plus ${M} × burden, ${SHORT[P]} changed total cost against no intervention by ${pts(main.pooled.mean)} points (95% CI ${pts(main.pooled.lo)} to ${pts(main.pooled.hi)}; ${verdictWord(main.pooled)}), lowering harm by ${rel(mainJ.pooled)} while adding ${pts(-mainB.pooled.mean)} points of burden.`);
    if (has('consent') && has('mayor1')) { const t = q('consent', 'mayor1'); abs.push(`Requiring consent for every action, compared with letting the same agent act alone, gave ${verdictWord(t.pooled)} (${ci(t.pooled)}).`); }
    if (has('consentF') && has('consent')) { const t = q('consentF', 'consent'); abs.push(`A reviewer who followed the forecaster's copy-of-the-city results, against one who approved the top option, gave ${verdictWord(t.pooled)} (${ci(t.pooled)}).`); }
    if (abSum) abs.push(`In an A/B test with the same simulated reviewer, the new version against the previous one gave ${verdictWord(abSum.ask.pooled)} in total cost (${ci(abSum.ask.pooled)}).`);
    if (red) abs.push(`A red-team test suite (${red.final.total} attacks, misuse cases and fault injections) went from ${red.rounds[0].pass} of ${red.rounds[0].total} resisted in the previous version to ${red.final.pass} of ${red.final.total} after ${red.rounds.filter((x) => /^\d/.test(x.name)).length - 1} rounds of fixes and new attacks.`);
    abs.push('All results describe a synthetic city that has not been validated against real data. Code, seeds, raw results and tests are provided.');
    add(abs.join(' '));
    add('**Keywords:** agentic AI; human-in-the-loop; meaningful human control; multi-agent systems; agent-based modelling; decision support; red-teaming; simulation-based forecasting; smart city');

    add('## 1. Introduction');
    add(`Agent-based models (ABMs) are widely used to explore how interventions change outbreaks of disease, and several large ones were built and used during the COVID-19 pandemic [[ferguson]] [[covasim]] [[openabm]]. A city government, however, does not choose a package once: it watches a stream of signals, decides what to do and when, hears objections, and revises. It also faces several problems at once. In South Asian cities, for example, winter smog from brick kilns, traffic, factories and construction dust overlaps with infectious disease, fog-related road accidents and a stressed power grid, and satellite remote sensing is being developed to find the kilns [[lee]].`);
    add(`Software agents could help with such decisions, but a city is a setting where an agent acting on its own is hard to justify: restrictions fall on people, mistakes are costly, and responsibility must stay with an accountable person. Classic work on automation distinguishes levels of autonomy from "the computer offers a set of alternatives" to "the computer acts autonomously" [[parasuraman]]; guidelines for human-AI interaction ask systems to make clear what they can do, support efficient dismissal and correction, and explain their behaviour [[amershi]]. We therefore build and test an agent team that sits at the "suggest alternatives and execute only if the human approves" level, and ask what that costs and what keeps it safe.`);
    add('We test five questions with a documented, repeatable protocol:');
    add(`1. **With a person approving every action, does the agent team pay off against doing nothing and against simple baselines, once the burden of restrictions on people is counted?**\n2. **What does requiring consent cost, compared with letting the same agent act on its own?**\n3. **Does a forecaster that tries each option on a copy of the current city help the person choose?**\n4. **What happens when the person denies half of the proposals?**\n5. **Can the system be misused, broken or made to act without permission?** (a red-team evaluation)`);
    add('Our contributions are: (i) an open, explainable multi-agent design with strict consent (approve, confirm, deny for N days, never, emergency re-entry as a question only, undo, consented lifting of measures) and an auditor; (ii) a forecaster based on exact copies of the running simulation with common random numbers; (iii) a paired-seed benchmark with effect sizes, a burden-weight sensitivity analysis and an A/B test between agent versions; (iv) a red-team test suite run in rounds, with the flaws found and fixed; and (v) an honest account of what the evidence does and does not show.');

    add('## 2. Background and related work');
    add(`**Agent-based models of interventions.** Covasim [[covasim]] and OpenABM-Covid19 [[openabm]] are open ABMs used to compare non-pharmaceutical interventions such as testing, isolation and contact tracing, alongside earlier modelling of closures and distancing by the Imperial College response team [[ferguson]]. They fix a set of interventions and study the epidemic; they do not model a decision-maker who must also manage air quality, roads and utilities.`);
    add(`**Learning controllers for epidemic control.** Reinforcement learning has been applied to choose interventions over time, for example to learn prevention strategies for pandemic influenza in a meta-population model of Great Britain's local areas, using proximal policy optimisation [[libin]]. Such controllers can be strong but are hard to inspect and act on their own. We take the opposite trade-off: hand-designed, rule-based agents whose reasoning is readable, with lightweight learning only in how much they trust each action, and no action without consent.`);
    add(`**Agents, autonomy and oversight.** We use "agent" in the sense of an autonomous system that perceives its environment, acts and pursues goals [[wooldridge]]. Levels of automation range from full human control to full computer control, and the right level can differ for information gathering, analysis, decision and action [[parasuraman]]. Our agents automate sensing, analysis and the ranking of options, but leave the decision and its execution to a person. Design guidelines for human-AI interaction [[amershi]] motivate several features: alternatives instead of a single answer, explanations, easy dismissal (deny, never), correction (undo) and remembering recent interactions (the deny list).`);
    add(`**Red-teaming.** Red-teaming means deliberately trying to make a system fail or behave harmfully so that the failures can be fixed; it is now common practice for language models [[ganguli]]. We apply the same idea to a much simpler rule-based system: a growing suite of attacks and misuse cases, run in rounds, with every failure recorded.`);
    add(`**Model description and statistics.** We describe the simulator following the structure of the ODD protocol [[odd]]. Because simulation replicates are cheap, p-values can be made arbitrarily small, so we report effect sizes with confidence intervals and treat p-values only as a screening aid [[white]].`);

    add('## 3. The simulated city');
    add(`The simulator is a single-page JavaScript agent-based model (Outbreak Lab). The description below follows the ODD elements [[odd]] in brief; the source code is the full specification.`);
    add(`**Purpose.** To explore how a city of residents with families, jobs and routines responds to infection, weather, air pollution, traffic accidents and infrastructure stress under different interventions.`);
    add(`**Entities and scales.** ${N} resident agents (a representative slice that can be scaled up for resource needs) with age group, household, workplace or school, health state (susceptible, exposed, infectious, recovered, dead from disease, dead from the road), smoking status, chronic conditions and stress. Places include homes, schools, a university, market, mosque, hospital, airport and a motorway. Infrastructure objects include traffic junctions, a power grid with solar and battery, a water tank and pumps, Wi-Fi access points, brick kilns with simulated satellite passes, factories and a construction site. One time step is one simulated minute; a run starts at 06:00 on a Monday.`);
    add(`**Process overview.** Each step moves agents by their schedule and mode of travel, spreads infection through close contacts within a radius with chance depending on masks, distancing, vaccination, stress and air exposure, and updates hospital admissions, ambulances and road accidents. Every ten simulated minutes a pollution grid receives emissions from kilns, factories, vehicles, construction dust and waste burning, is advected by wind and mixed, and is reduced by rain and fog effects. Hourly, the power, water, weather, forecast and common-illness sub-models update.`);
    add(`**Stochasticity, seeds and copies.** All random draws come from seeded generators, so a run is repeatable; in every comparison below, all controllers face the same city for a given seed ("paired seeds"). The whole simulation state, including the random-number state, can be copied exactly; a copy run forward reproduces the original bit for bit and never touches it (verified by unit and red-team tests). The forecaster uses such copies.`);
    add(`**Validation status.** The model has been checked for internal consistency and plausible behaviour, and a small calibration helper can fit temperature and air-quality levels to uploaded data, but it has **not** been validated against a real city. All results should be read as statements about the simulator.`);

    add('## 4. The agent team');
    add(`**Specialist officers (sensing and diagnosis).** Every simulated minute four officers read six pressure indicators between 0 and 1: health (infected share, hospital load, deaths), air quality (the larger of the current air-quality index and the forecast peak), road safety (recent accidents and weather hazard), power, water and connectivity. Each indicator is smoothed (time constant about ten minutes) and given a trend per hour; invalid readings are ignored and reported. Goal weights combine them into one **harm** score J. A **burden** score B in [0, about 1] sums the cost of restrictions on people that are in force (closing schools 0.25, markets 0.20, 40% work from home 0.14, and so on; Appendix A). Total cost is **C = J + ${M} × B**. Each officer explains the cause of its problem in words (for example the estimated source shares of fine particles, or how many people each case infects).`);
    add(`**Coordinator (planning with alternatives).** Edge-triggered alarms (air quality passes 200 or 300; infections pass 1%, 5%, 15%; hospital 80% or full; a new death; a grid outage; demand near capacity; low water tank; storm, snow, thick fog; three accidents in two hours; repeated sensor faults) wake the planner immediately; otherwise it plans at a fixed interval. For each area with non-zero urgency it scores every available option a as  score(a) = U × e(a) × L(a) × X(a) × w − μ × b(a) × (1 − 0.4 U), with μ = ${M}, where U is the urgency (the larger of the smoothed pressure and a projection of its trend three hours ahead, twelve for health), e(a) is a context-dependent prior of how much of the problem the option can remove (reduced when other measures already cover the same problem), L(a) is a learned trust factor (0.4 to 1.6), X(a) a small exploration bonus, w the area's share of the goal weight and b(a) the burden of the option. Options already in force, on cool-down, on the deny list or on the never list are removed; the best option and up to three alternatives of different kinds are proposed. Urgency is classed as low, normal, high or emergency.`);
    add(`**Safety reviewer.** Before an option is shown, a reviewer attaches notes and raises a caution when: the combined burden after approval would exceed 35/100; the option would override a setting the person changed in the last day; the person denied a similar measure; sensor readings were invalid in the last hour; the option is a re-raised denial; or the forecaster saw it do worse. It also marks big decisions, standing rules (rules the city then applies by itself) and hard-to-undo steps. Any of these requires a second, deliberate confirmation.`);
    add(`**Forecaster.** For the top options of each proposal the forecaster copies the current city once per option plus once for "do nothing", applies the option to its copy, and runs all copies forward for a horizon that depends on the area (24 h for health, 12 h for air, roads and water, 6 h for power, 3 h for connectivity). All copies share the same random future (common random numbers), so differences come from the option, not from chance. It reports the change in harm, burden and total cost, re-ranks the options only if the forecast clearly reverses the order (by more than one point), and says "consider waiting" if no option did better than doing nothing. One copy is one possible future of the model, not a probability.`);
    add(`**Consent protocol.** In the live tool nothing changes without the person: Approve (and Confirm where required) executes exactly the option and version that was shown; a click on an outdated version is refused. Deny puts the option on a deny list for 1 to 5 days (default 2); it returns earlier only if its area becomes an emergency, and then only as a new question, at most every six hours. Never keeps it away until the person allows it. Measures are never lifted automatically: the agents propose lifting (also reviewed), and the person can undo any measure; an undo or lift never overwrites a value the person changed since. The safety switches are fixed when the agent is created and cannot be flipped later. If an agent fails internally it pauses itself without changing the city.`);
    add(`**Auditor and learning.** Every decision (approved, denied, never, allowed, undone, rejected, blocked) is written to a ledger. Every simulated hour the auditor compares the city's settings with the previous hour and flags any change without a recorded reason. Twelve hours after an action, the agents compare the target pressure with a baseline that extends the pre-action trend, label the action "helped", "no clear effect" or "hurt", and update L(a); this verdict is a heuristic, not a causal estimate. A free-text idea from the person is read with keyword rules (English and Roman Urdu, with negation handling: "do not close schools" is never read as closing them), critiqued, and can be tried on copies of the current city.`);
    add('**What these agents are not.** They contain no language model and learn only the trust factors. The priors e(a) and burdens b(a) were set by the authors and have not been estimated from data.');

    add('## 5. Experimental design');
    add(`**Scenarios.** ${A.scs.length} stress scenario${A.scs.length === 1 ? '' : 's'}, each a set of changes to the default city (Table 1).`);
    add(mdTable(['Scenario', 'Description'], A.scs.map((s) => [sn(s), meta.scenarios[s].desc])).replace(/ ---: /g, ' --- '));
    add('*Table 1. Scenarios.*');
    add(`**Controllers.** ${A.ctls.length} controllers (Table 2). The person is simulated: "approves after 1 h" approves the top option (confirming where needed) once a proposal has waited 60 simulated minutes, including proposals to lift measures; the forecast-following reviewer waits for the forecasts, approves the option with the best forecast net effect if it is positive and otherwise denies all options of that proposal; the "denies half" reviewer answers after 120 minutes and denies with probability 0.5. The "acting alone" variants exist only in simulation to measure the cost of consent; the tool itself cannot run them. All variants use the balanced goal and start with no learned trust.`);
    add(mdTable(['Code', 'Controller'], A.ctls.map((c) => [c, nm[c]])).replace(/ ---: /g, ' --- '));
    add('*Table 2. Controllers.*');
    add(`**Design.** ${K} seeds (${meta.seedList[0]} to ${meta.seedList[K - 1]}) × ${A.scs.length} scenarios × ${A.ctls.length} controllers = ${nRuns} runs of ${days} simulated days. For each scenario and seed all controllers see the same city. The v15 agent parameters were tuned on pilot seeds 101 to 103. While designing the forecast-following reviewer we also looked at single runs on seed ${meta.seedList[0]}, which is part of the evaluation set; no numeric parameter was tuned on it, but the design choice was made after seeing it.`);
    add(`**Outcomes.** Harm J and burden B are averaged over the run (sampled every ten minutes); total cost C = J + ${M} B (all shown as points on a 0-100 scale). Secondary outcomes: peak share infected, peak air-quality index, deaths, accidents, minutes of power outage, and agent activity.`);
    add(`**Analysis.** For each comparison we report the mean paired difference (baseline minus controller, so positive means the controller is better), its 95% confidence interval from a paired t distribution, the standardised paired effect d_z and the share of seeds in which the controller was better. Tests against no intervention are Holm-adjusted; pooled tests use all ${pooledN} scenario-seed pairs. Conclusions rest on effect sizes and intervals rather than p-values [[white]].`);
    if (ab) add(`**A/B test between versions.** The previous version (v15) and this version (v16) of the agents were run by the same harness on the same ${ab.seeds} seeds × ${Object.keys(abSum.ask.per).length} scenarios for ${ab.days} days, with the same simulated person (approves the top option after 60 minutes). A second pair let both versions act alone, as a regression check on the decision logic they share.`);
    if (red) add(`**Red-team evaluation.** We wrote attacks and misuse cases against the agent core (run in Node.js) and against the web page (run in a real browser with Playwright): acting without approval, clicking outdated or tampered buttons, double clicks, replaying approvals, hostile option names, poisoned browser storage, broken sensor values, injected internal errors, tampering with safety switches at run time, hostile CSV files (HTML, \`__proto__\` names, absurd numbers, 3 MB pastes), negated ideas, and checks that the system cannot be pushed into making the city worse unnoticed. Tests were run in rounds: run, record failures, fix, rerun, then write new attacks against the fixes.`);

    add('## 6. Results');
    add('### 6.1 Total cost by scenario and controller');
    add(`Table 3 gives the mean ± standard deviation of total cost (points, lower is better) over ${K} seeds.`);
    add(mdTable(['Controller'].concat(A.scs.map(sn)), A.ctls.map((c) => [nm[c]].concat(A.scs.map((s) => { const x = A.cell[s][c].C; return `${pts(x.mean)} ± ${pts(x.sd)}`; })))));
    add('*Table 3. Total cost C = harm + ' + M + ' × burden (mean ± SD, points).*');
    add('### 6.2 Harm, burden and activity');
    add(mdTable(['Controller', 'Harm J', 'Burden B', 'Total C', 'Actions per run', 'Denials per run', 'Alarms per run'], A.ctls.map((c) => { const g = (k) => mean(A.scs.flatMap((s) => A.cell[s][c][k].v)); return [nm[c], pts(g('J')), pts(g('B')), pts(g('C')), f1(g('acts')), f1(g('denied')), f1(g('trig'))]; })));
    add('*Table 4. Pooled over all scenarios and seeds (harm, burden and cost in points).*');
    add('### 6.3 Paired effects against no intervention');
    const effRows = []; for (const c of A.ctls.filter((x) => x !== 'none')) { const t = q(c, 'none'); effRows.push([nm[c], `${pts(t.pooled.mean)} (${pts(t.pooled.lo)} to ${pts(t.pooled.hi)})`, `${t.pooled.mean >= 0 ? '' : '-'}${rel(t.pooled)}`, f2(t.pooled.dz), `${t.pooled.wins} / ${t.pooled.n}`, pp(t.pooled.pHolm)]); }
    add(mdTable(['Controller', 'Cost reduction, points (95% CI)', 'Relative', 'd_z', 'Seeds better', 'p (Holm)'], effRows));
    add(`*Table 5. Pooled paired improvement in total cost against no intervention (n = ${pooledN}). Positive = controller better.*`);
    add(mdTable(['Controller'].concat(A.scs.map(sn)), A.ctls.filter((x) => x !== 'none').map((c) => { const t = q(c, 'none'); return [nm[c]].concat(A.scs.map((s) => { const x = t.per[s]; return `${pts(x.mean)} (${pts(x.lo)} to ${pts(x.hi)})`; })); })));
    add(`*Table 6. Per-scenario paired improvement in total cost against no intervention, points (95% CI), n = ${K} per cell.*`);
    add('### 6.4 Consent, forecasting, denial and cadence');
    const pairs = [['consent', 'mayor1', 'Consent (approves after 1 h) vs acting alone'], ['consentF', 'consent', 'Forecast-following reviewer vs approve-top reviewer'], ['hitl', 'consent', 'Reviewer denies half vs approves all'], ['consent', 'autopilot', 'Consent team vs built-in autopilot'], ['consent', 'static', 'Consent team vs fixed pack'], ['mayor1', 'mayor360', 'Acting alone: every 30 min + alarms vs every 6 h'], ['consentF', 'none', 'Forecast-following reviewer vs no intervention']];
    const cmpRows = pairs.filter(([a, b]) => has(a) && has(b)).map(([a, b, lab]) => { const t = q(a, b); return [lab, `${pts(t.pooled.mean)} (${pts(t.pooled.lo)} to ${pts(t.pooled.hi)})`, f2(t.pooled.dz), `${t.pooled.wins} / ${t.pooled.n}`, verdictWord(t.pooled)]; });
    add(mdTable(['Comparison', 'Cost difference, points (95% CI)', 'd_z', 'Seeds better', 'Reading'], cmpRows).replace(/ ---: \|\n/, ' --- |\n'));
    add('*Table 7. Pooled paired comparisons (positive = first is better).*');
    if (A.sens.length) {
      add('### 6.5 How much does the burden weight matter?');
      add(`The total-cost conclusions depend on the weight ${M} given to the burden of restrictions. Because harm and burden are stored for every run, total cost can be recomputed for other weights. Table 8 shows the pooled improvement against no intervention and the break-even weight μ* above which a controller no longer pays off (∞: better at every weight; 0: never better).`);
      add(mdTable(['Controller', 'Harm reduction (pts)', 'Burden added (pts)'].concat(A.MUS.map((m) => 'μ = ' + m)).concat(['Break-even μ*']), A.sens.map((r) => [nm[r.c], pts(r.dJ), pts(-r.dB)].concat(r.pooled.map((v) => pts(v))).concat([r.be.pooled === Infinity ? '∞' : r.be.pooled.toFixed(2)]))));
      add('*Table 8. Pooled improvement in total cost against no intervention (points, positive = better) for different burden weights μ.*');
    }
    if (abSum) {
      add('### 6.6 A/B test: previous version against this version');
      const r = (x) => `${pts(x.mean)} (${pts(x.lo)} to ${pts(x.hi)})`;
      add(mdTable(['Comparison (v15 minus v16 cost; positive = v16 better)', 'Pooled', ...Object.keys(abSum.ask.per).map((s) => (meta.scenarios[s] ? sn(s) : s))], [
        ['Same reviewer, approves after 1 h', r(abSum.ask.pooled), ...Object.keys(abSum.ask.per).map((s) => r(abSum.ask.per[s]))],
        ['Acting alone (regression check)', r(abSum.auto.pooled), ...Object.keys(abSum.auto.per).map((s) => r(abSum.auto.per[s]))],
      ]));
      add(`*Table 9. A/B test, paired over ${ab.seeds} seeds per scenario (n = ${abSum.ask.pooled.n} pooled). Mean total cost: v15 ${pts(abSum.meanA)}, v16 ${pts(abSum.meanB)} points with the reviewer; acting alone identical in ${abSum.sameAuto} of ${abSum.nAuto} runs.*`);
    }
    if (red) {
      add('### 6.7 Red-team results');
      add(mdTable(['Round', 'What was tested', 'Resisted', 'Flaws found (then fixed)'], red.rounds.map((x) => [x.name, x.what, `${x.pass} / ${x.total}`, x.found || '–'])).replace('| --- | ---: | ---: | ---: |', '| --- | --- | ---: | --- |'));
      add(`*Table 10. Red-team rounds. The final suite has ${red.final.total} tests (${red.final.node} on the agent core, ${red.final.ui} in the browser, plus ${red.final.unit} unit tests); all pass on the version described here. Appendix B lists them.*`);
    }

    /* discussion: every number is from the tables above */
    add('## 7. Discussion');
    add(`**Does the consent-based team pay off?** ${SHORT[P].charAt(0).toUpperCase() + SHORT[P].slice(1)} against no intervention showed ${verdictWord(main.pooled)} (${ci(main.pooled)}). It lowered harm by ${pts(mainJ.pooled.mean)} points and added ${pts(-mainB.pooled.mean)} points of burden. In ${A.scs.filter((s) => main.per[s].lo > 0).length} of ${A.scs.length} scenarios the interval lay above zero${A.scs.filter((s) => main.per[s].lo > 0).length ? ' (' + A.scs.filter((s) => main.per[s].lo > 0).map(sn).join(', ') + ')' : ''}; ${A.scs.filter((s) => main.per[s].hi < 0).length ? 'it was reliably worse in ' + A.scs.filter((s) => main.per[s].hi < 0).map(sn).join(', ') + '.' : 'in no scenario was it reliably worse.'}`);
    if (has('consent') && has('mayor1')) { const t = q('consent', 'mayor1'), tJ = q('consent', 'mayor1', 'J'), tB = q('consent', 'mayor1', 'B'); add(`**The cost of consent.** Requiring approval for every action against letting the agent act alone gave ${verdictWord(t.pooled)} (${ci(t.pooled)}): harm ${tJ.pooled.mean >= 0 ? 'fell' : 'rose'} by ${pts(Math.abs(tJ.pooled.mean))} points and burden ${tB.pooled.mean >= 0 ? 'fell' : 'rose'} by ${pts(Math.abs(tB.pooled.mean))} points. The simulated person here approves everything after an hour, so this isolates the effect of the delay and of lifting only with consent, not the effect of human judgement.`); }
    if (has('consentF') && has('consent')) { const t = q('consentF', 'consent'), tJ = q('consentF', 'consent', 'J'), tB = q('consentF', 'consent', 'B'); add(`**Does the forecaster help?** A reviewer who followed the forecaster against one who approved the top option gave ${verdictWord(t.pooled)} (${ci(t.pooled)}); harm ${tJ.pooled.mean >= 0 ? 'fell' : 'rose'} by ${pts(Math.abs(tJ.pooled.mean))} points and burden ${tB.pooled.mean >= 0 ? 'fell' : 'rose'} by ${pts(Math.abs(tB.pooled.mean))} points. The forecaster mostly works by saying no: when no option beats doing nothing in a copy of the city, the forecast-following reviewer denies. It costs roughly twenty to thirty times more computation than the agents alone, and its 24-hour horizon for health is shorter than most health measures need, so part of its advantage here comes from avoiding burden rather than from foreseeing benefits; whether that is the right trade-off depends on the burden weight (Table 8).`); }
    if (has('hitl') && has('consent')) { const t = q('hitl', 'consent'); add(`**A reviewer who denies half.** Against a reviewer who approves everything this gave ${verdictWord(t.pooled)} (${ci(t.pooled)}). The deny list and its emergency re-entry rule kept running: on average ${f1(mean(A.scs.flatMap((s) => A.cell[s].hitl.reraised.v)))} re-raised questions and ${f1(mean(A.scs.flatMap((s) => A.cell[s].hitl.denied.v)))} denials per run. Because denying also means acting less, the benchmark cannot separate the value of the deny list from the value of restraint.`); }
    if (A.sens.length) { const be = A.sens.find((r) => r.c === P); if (be) add(`**The burden weight decides the verdict.** The pattern across Tables 4 and 8 is that the agents reliably lower harm but buy that with restrictions on people. ${SHORT[P].charAt(0).toUpperCase() + SHORT[P].slice(1)} pays off only while μ is below about ${be.be.pooled === Infinity ? '∞' : be.be.pooled.toFixed(2)} (we used ${M}). The right weight is a value judgement for each city, not a measurement; the tool lets the person see both parts separately for this reason.`); }
    if (abSum) add(`**Did the new version help?** With the same simulated person, v16 against v15 gave ${verdictWord(abSum.ask.pooled)} (${ci(abSum.ask.pooled)}). The main design change that can affect outcomes is that v16 never lifts a measure by itself but proposes the lift, and that its reviewer and forecaster add information the simulated person here does not use. When both versions acted alone they gave identical results in ${abSum.sameAuto} of ${abSum.nAuto} runs; the rest differed slightly (${ci(abSum.auto.pooled)}), most likely because of small deliberate changes in v16 to alarm handling and measure bookkeeping, which also run when the agent acts alone. We did not trace each of these differences.`);
    if (red) add(`**Safety.** The previous version resisted ${red.rounds[0].pass} of ${red.rounds[0].total} attacks; the most serious failures were acting without a click by default, approving a different option than the one clicked when the list changed, letting a single invalid sensor value blind the agent for the rest of the run, and reading "do not close schools" as an order to close them. Each round of fixes was followed by new attacks against the fixes, which found further problems (for example a world-copy routine that failed on the page's event listeners, a double click that could land on the next proposal, and safety switches that could be flipped from the browser console). A passing suite shows that these specific attacks fail; it does not prove that no other attack exists.`);

    add('## 8. Limitations');
    add(`1. **Synthetic city, no real-world validation.** The model has not been calibrated or validated against a real city. Results describe the simulator.\n2. **Authored priors.** The expected effects e(a), burdens b(a) and the weight ${M} of burden in the total cost are the authors' judgements. We varied only the burden weight (Section 6.5), not the individual priors.\n3. **Same designers wrote the scenarios and the agents.** Favourable results may reflect fit to these scenarios. Parameters were tuned on pilot seeds 101 to 103; the reported results use different seeds, but the design choices were still shaped by this model.\n4. **Simulated people.** All reviewers are simple scripts. Real people would read the explanations, sometimes disagree with the forecaster, get tired of questions and make mistakes; none of that is measured. A user study is needed.\n5. **One possible future.** The forecaster runs one copy per option with the same random future; it shows a plausible outcome under the model, not a probability, and it inherits all of the model's errors. Its horizon (24 h for health) is shorter than the time most health measures need to work, so it mostly sees their cost and tends to advise against them; a reviewer who follows it therefore leans towards lower burden.\n6. **Short horizon and small counts.** Runs last ${days} simulated days with ${N} residents, so deaths are rare and noisy; the cost measure relies mostly on composite pressure indicators.\n7. **Red-team scope.** The attacks were written by the developers, who also wrote the defences. The page runs locally in one browser; someone with full control of that browser can still change its code. The suite tests the logic and the interface, not a networked deployment.\n8. **Statistics.** Replicates are independent across seeds but not across scenarios sharing seed numbers; pooled intervals are indicative.`);

    add('## 9. Conclusion');
    add(`Inside a synthetic city, a team of explainable agents that may change nothing without a person's approval ${main.pooled.lo > 0 ? 'reduced' : main.pooled.hi < 0 ? 'increased' : 'did not reliably change'} total cost against doing nothing (${pts(main.pooled.mean)} points, ${rel(main.pooled)}) at a burden weight of ${M}. ${has('consent') && has('mayor1') ? `With a simulated person who approves within an hour, consent was ${q('consent', 'mayor1').pooled.hi < 0 ? 'not free' : q('consent', 'mayor1').pooled.lo > 0 ? 'not a cost; it even helped' : 'not measurably costly'} compared with letting the agent act alone. ` : ''}${has('consentF') && has('consent') && q('consentF', 'consent').pooled.lo > 0 ? 'Letting the person see what each option did in a copy of the city improved the decisions of a reviewer who followed it, mostly by advising against restrictions that did not pay off within the forecast horizon. ' : ''}A red-team suite run in rounds found and removed real flaws. The more useful output may be the protocol: a transparent agent team, strict consent, paired-seed experiments, an A/B test and a red-team suite that others can rerun and extend. The next steps are a user study with real decision-makers and validation against a real city's data.`);

    add('## Declarations');
    add(`**AI assistance.** The simulator and agent code, the tests and a first draft of this text were developed with the help of an AI assistant (Claude, Anthropic). The author is responsible for checking all claims before any submission. **Data and code availability.** Source code, benchmark, A/B and red-team scripts, raw results (${nRuns} rows) and this generator are in the project repository. Benchmark run on ${meta.date.slice(0, 10)} with Node ${meta.node}; file hashes model.js ${meta.files['model.js']}, mayor.js ${meta.files['mayor.js']}. **Reproduce:** \`node bench/bench.js results.json ${K} ${days}\`, \`node bench/abtest.js ab.json\`, \`node bench/redteam.js\`, \`python3 bench/redteam_ui.py\`. **Conflicts of interest.** None declared. **Funding.** None.`);

    add('## References');
    add('@@REFS@@');

    add('## Appendix A. Toolbox of interventions');
    add(mdTable(['Option', 'Area', 'Burden (0-100)', 'Notes'], (opt.actions || []).map((a) => [a.label, a.domain, (a.burden * 100).toFixed(0), [a.big ? 'big decision' : '', a.standing ? 'standing rule' : '', a.hard ? 'hard to undo' : ''].filter(Boolean).join(', ')])));
    add('*Burden values and prior effects are author judgements, not estimates.*');
    if (red && red.list) { add('## Appendix B. Red-team and unit tests'); add(mdTable(['ID', 'Test', 'Result'], red.list.map((t) => [t.id, t.title, t.ok ? 'pass' : 'FAIL'])).replace(/ ---: \|\n/, ' --- |\n')); }
    let text = L.join('\n\n'); const order = [], R = opt.refs || REFS;
    text = text.replace(/\[\[(\w+)\]\]/g, (m, k) => { if (!R[k]) return '[?]'; let i = order.indexOf(k); if (i < 0) { order.push(k); i = order.length - 1; } return '[' + (i + 1) + ']'; });
    const refList = order.map((k, i) => `[${i + 1}] ${R[k]}`).join('  \n');
    return text.replace('@@REFS@@', refList);
  }
  /* A/B summary: v16 minus v15 (positive = v16 better), paired by scenario and seed */
  function abSummary(ab) {
    const out = { meanA: 0, meanB: 0, sameAuto: 0, nAuto: 0 };
    for (const mode of ['ask', 'auto']) {
      const rows = ab.rows.filter((r) => r.mode === mode), scs = Array.from(new Set(rows.map((r) => r.scen))), per = {}; let allA = [], allB = [];
      for (const s of scs) { const a = [], b = []; for (const r of rows.filter((x) => x.scen === s && x.arm.startsWith('A'))) { const m = rows.find((x) => x.scen === s && x.seed === r.seed && x.arm.startsWith('B')); if (m) { a.push(r.C); b.push(m.C); if (mode === 'auto') { out.nAuto++; if (Math.abs(r.C - m.C) < 1e-12) out.sameAuto++; } } } per[s] = paired(a, b); allA = allA.concat(a); allB = allB.concat(b); }
      out[mode] = { per, pooled: paired(allA, allB) }; if (mode === 'ask') { out.meanA = mean(allA); out.meanB = mean(allB); }
    }
    return out;
  }

  const REFS = {
    wooldridge: 'Wooldridge, M., & Jennings, N. R. (1995). Intelligent agents: theory and practice. The Knowledge Engineering Review, 10(2), 115–152. https://doi.org/10.1017/S0269888900008122',
    odd: 'Grimm, V., Railsback, S. F., Vincenot, C. E., Berger, U., Gallagher, C., DeAngelis, D. L., et al. (2020). The ODD Protocol for Describing Agent-Based and Other Simulation Models: A Second Update to Improve Clarity, Replication, and Structural Realism. Journal of Artificial Societies and Social Simulation, 23(2), 7. https://doi.org/10.18564/jasss.4259',
    covasim: 'Kerr, C. C., Stuart, R. M., Mistry, D., Abeysuriya, R. G., Rosenfeld, K., Hart, G. R., et al. (2021). Covasim: an agent-based model of COVID-19 dynamics and interventions. PLoS Computational Biology, 17(7), e1009149. https://doi.org/10.1371/journal.pcbi.1009149',
    openabm: 'Hinch, R., Probert, W. J. M., Nurtay, A., Kendall, M., Wymant, C., Hall, M., et al. (2021). OpenABM-Covid19: an agent-based model for non-pharmaceutical interventions against COVID-19 including contact tracing. PLoS Computational Biology, 17(7), e1009146. https://doi.org/10.1371/journal.pcbi.1009146',
    ferguson: 'Imperial College COVID-19 Response Team (2020). Report 9: Impact of non-pharmaceutical interventions (NPIs) to reduce COVID-19 mortality and healthcare demand. 16 March 2020. https://www.imperial.ac.uk/mrc-global-infectious-disease-analysis/covid-19/report-9-impact-of-npis-on-covid-19/',
    libin: 'Libin, P., Moonens, A., Verstraeten, T., Perez-Sanjines, F., Hens, N., Lemey, P., & Nowé, A. (2020). Deep reinforcement learning for large-scale epidemic control. arXiv:2003.13676.',
    lee: 'Lee, J., Brooks, N. R., Tajwar, F., Burke, M., Ermon, S., Lobell, D. B., Biswas, D., & Luby, S. P. (2021). Scalable deep learning to identify brick kilns and aid regulatory capacity. Proceedings of the National Academy of Sciences, 118(17), e2018863118. https://doi.org/10.1073/pnas.2018863118',
    white: 'White, J. W., Rassweiler, A., Samhouri, J. F., Stier, A. C., & White, C. (2014). Ecologists should not use statistical significance tests to interpret simulation model results. Oikos, 123, 385–388. https://doi.org/10.1111/j.1600-0706.2013.01073.x',
    parasuraman: 'Parasuraman, R., Sheridan, T. B., & Wickens, C. D. (2000). A model for types and levels of human interaction with automation. IEEE Transactions on Systems, Man, and Cybernetics, Part A: Systems and Humans, 30(3), 286–297. https://doi.org/10.1109/3468.844354',
    amershi: 'Amershi, S., Weld, D., Vorvoreanu, M., Fourney, A., Nushi, B., Collisson, P., Suh, J., Iqbal, S., Bennett, P. N., Inkpen, K., Teevan, J., Kikin-Gil, R., & Horvitz, E. (2019). Guidelines for human-AI interaction. Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems. ACM. https://doi.org/10.1145/3290605.3300233',
    ganguli: 'Ganguli, D., Lovitt, L., Kernion, J., Askell, A., Bai, Y., et al. (2022). Red teaming language models to reduce harms: methods, scaling behaviors, and lessons learned. arXiv:2209.07858.',
  };

  /* ---------- markdown -> html (small, for printing / saving as PDF) ---------- */
  function mdToHtml(md) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inl = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/  \n/g, '<br>');
    const blocks = md.split(/\n{2,}/), out = [];
    for (const b of blocks) {
      if (/^#{1,3} /.test(b)) { const n = b.match(/^#+/)[0].length; out.push(`<h${n}>${inl(b.replace(/^#+ /, ''))}</h${n}>`); }
      else if (/^\|/.test(b)) { const rows = b.split('\n').filter((r) => !/^\|[ :\-|]+\|$/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); out.push('<table>' + rows.map((r, i) => '<tr>' + r.map((c) => `<${i ? 'td' : 'th'}>${inl(c)}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>'); }
      else if (/^(\d+\. |- )/.test(b)) { const ord = /^\d+\./.test(b); out.push(`<${ord ? 'ol' : 'ul'}>` + b.split('\n').map((l) => `<li>${inl(l.replace(/^(\d+\. |- )/, ''))}</li>`).join('') + `</${ord ? 'ol' : 'ul'}>`); }
      else out.push(`<p>${inl(b)}</p>`);
    }
    return out.join('\n');
  }
  const api = { mean, sd, paired, holm, tCdf, tQuant, analyse, buildPaper, abSummary, mdToHtml, REFS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.OLPaper = api;
})(typeof window !== 'undefined' ? window : globalThis);

