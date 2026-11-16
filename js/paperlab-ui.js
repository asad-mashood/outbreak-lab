/* =====================================================================
   OUTBREAK LAB v17: PAPER LAB (experiment runner + paper builder UI)
   ===================================================================== */
(function () {
  'use strict';
  const C = window.OLCore, P = window.OLPaper;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fx = (v, d) => (v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(d == null ? 0 : d));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const copyText = (text, app) => {
    const done = () => app && app.toast && app.toast('Copied to the clipboard.');
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { app && app.toast && app.toast('Could not copy.'); } document.body.removeChild(ta); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); return; } } catch (e) { /* fall through */ }
    fallback();
  };
  function boot() {
    const app = window.outbreakLab; if (!app || !$('#tab-paper') || !C || !P) return;
    const job = { cancel: false, busy: false }, state = { res: null, md: '', rows: [] };
    const SC = Object.assign({ mine: { name: 'Your current city', desc: 'The settings currently on screen', patch: {} } }, C.SCENARIOS);
    $('#plScen').innerHTML = Object.keys(SC).map((k) => `<label class="switch-row"><span>${esc(SC[k].name)} <small class="stat-line">${esc(SC[k].desc)}</small></span><input type="checkbox" data-scen="${k}" ${k === 'mine' ? '' : 'checked'}></label>`).join('');
    const SLOW = { consentF: ' (slow: about 20 times longer per run)' }, OFF = { consentF: 1, mayor60: 1, consentAsk: 1 };
    $('#plCtl').innerHTML = Object.keys(C.CONTROLLERS).map((k) => `<label class="switch-row"><span>${esc(C.CONTROLLERS[k].name)}${SLOW[k] ? '<small class="stat-line">' + SLOW[k] + '</small>' : ''}</span><input type="checkbox" data-ctl="${k}" ${OFF[k] ? '' : 'checked'}></label>`).join('');
    const picked = (attr) => Array.from(document.querySelectorAll(`[data-${attr}]`)).filter((x) => x.checked).map((x) => x.dataset[attr]);
    const plan = () => { const s = picked('scen'), c = picked('ctl'), K = parseInt($('#plSeeds').value, 10), d = parseInt($('#plDays').value, 10); return { s, c, K, d, n: s.length * c.length * K }; };
    const NEED = 'Select at least "No intervention" and "Mayor with consent: a reviewer approves every action after 1 h".';
    const eta = () => { const p = plan(), w = p.c.reduce((s, c) => s + (c === 'consentF' ? 20 : 1), 0) / Math.max(1, p.c.length), n = p.n * w; $('#plEta').textContent = p.c.includes('none') && p.c.includes('consent') ? `${p.n} runs of ${p.d} days. Roughly ${Math.max(1, Math.round((n * p.d * 1.4) / 60))} to ${Math.max(2, Math.round((n * p.d * 3) / 60))} minutes in this browser.` : NEED; };
    document.querySelectorAll('[data-scen],[data-ctl],#plSeeds,#plDays').forEach((e) => e.addEventListener('change', eta)); eta();

    function summary(rows, ctls) {
      $('#plSummary').innerHTML = ctls.map((c) => { const r = rows.filter((x) => x.controller === c); if (!r.length) return ''; const m = (k) => mean(r.map((x) => x[k])); return `<tr><td>${esc(C.CONTROLLERS[c].name)} <small class="mono">n=${r.length}</small></td><td class="n">${fx(m('C') * 100, 1)}</td><td class="n">${fx(m('J') * 100, 1)}</td><td class="n">${fx(m('B') * 100, 1)}</td><td class="n">${fx(m('peakInf'), 1)}%</td><td class="n">${fx(m('deaths'), 2)}</td></tr>`; }).join('') || '<tr><td colspan="6">Run the experiment to see results.</td></tr>';
    }
    summary([], []);
    $('#plCancel').addEventListener('click', () => { job.cancel = true; });
    $('#plRun').addEventListener('click', async () => {
      if (job.busy) return; const p = plan();
      if (!p.c.includes('none') || !p.c.includes('consent')) { $('#plMsg').textContent = NEED; return; }
      if (!p.s.length) { $('#plMsg').textContent = 'Select at least one scenario.'; return; }
      const S0 = parseInt($('#plSeed0').value, 10) || 201, seeds = Array.from({ length: p.K }, (_, i) => S0 + i);
      const jobs = []; for (const seed of seeds) for (const sc of p.s) for (const c of p.c) jobs.push({ seed, sc, c });
      job.busy = true; job.cancel = false; $('#plRun').disabled = true; $('#plCancel').hidden = false; $('#plBuild').disabled = true; $('#plChip').textContent = 'running';
      const rows = [], t0 = Date.now(), D = C.DEFAULT_PARAMS;
      try {
        for (let i = 0; i < jobs.length; i++) {
          const j = jobs[i]; $('#plMsg').textContent = `Run ${i + 1} of ${jobs.length}: ${SC[j.sc].name}, ${C.CONTROLLERS[j.c].name}, seed ${j.seed}`;
          const base = j.sc === 'mine' ? Object.assign({}, app.params) : Object.assign({}, D, SC[j.sc].patch);
          const r = await C.runAsync(base, p.d, { controller: j.c, seed: j.seed, goal: 'balanced' }, (f) => { $('#plProgWrap').hidden = false; $('#plProg').style.width = Math.round(((i + f) / jobs.length) * 100) + '%'; }, job);
          if (!r) throw new Error('cancelled'); rows.push(Object.assign({ scenario: j.sc, controller: j.c, seed: j.seed, days: p.d }, r)); summary(rows, p.c);
          const el = (Date.now() - t0) / 1000, left = (el / (i + 1)) * (jobs.length - i - 1); $('#plChip').textContent = `${i + 1}/${jobs.length} · ~${Math.max(1, Math.round(left / 60))} min left`;
        }
        const scenarios = {}; for (const k of p.s) scenarios[k] = SC[k]; const controllers = {}; for (const k of p.c) controllers[k] = C.CONTROLLERS[k].name;
        state.res = { meta: { tool: 'Outbreak Lab', version: 'v17', date: new Date().toISOString(), seeds: p.K, seedList: seeds, days: p.d, goal: 'balanced', MU: C.MU, node: 'a web browser (' + (navigator.userAgent.match(/(Chrome|Firefox|Safari|Edg)\/[\d.]+/) || ['unknown browser'])[0] + ')', files: { 'model.js': 'see repository', 'mayor.js': 'see repository' }, scenarios, controllers, population: D.population, wallSeconds: Math.round((Date.now() - t0) / 1000) }, rows };
        $('#plChip').textContent = 'done'; $('#plMsg').textContent = `Finished ${rows.length} runs in ${Math.round((Date.now() - t0) / 1000)} s.`;
        const A = P.analyse(state.res), t = A.cmp('consent', 'none', 'C');
        $('#plRead').textContent = `Agent team with consent against no intervention, total cost: mean paired difference ${fx(t.pooled.mean * 100, 1)} points (95% CI ${fx(t.pooled.lo * 100, 1)} to ${fx(t.pooled.hi * 100, 1)}), better in ${t.pooled.wins} of ${t.pooled.n} paired runs. Positive = agents better. ${p.K < 10 ? 'With fewer than 10 seeds the intervals are wide.' : ''}`;
      } catch (e) { $('#plMsg').textContent = e.message === 'cancelled' ? 'Cancelled.' : 'Experiment failed: ' + e.message; $('#plChip').textContent = state.res ? 'done' : 'no results'; }
      job.busy = false; $('#plRun').disabled = false; $('#plCancel').hidden = true; $('#plBuild').disabled = false; $('#plProgWrap').hidden = true;
    });
    $('#plCopyJson').addEventListener('click', () => { if (!state.res) { app.toast('Run the experiment first.'); return; } copyText(JSON.stringify(state.res), app); });
    $('#plCopyCsv').addEventListener('click', () => {
      if (!state.res) { app.toast('Run the experiment first.'); return; }
      const keys = ['scenario', 'controller', 'seed', 'days', 'J', 'B', 'C', 'peakInf', 'peakAqi', 'deaths', 'acc', 'outage', 'acts', 'denied', 'reraised', 'trig'];
      copyText([keys.join(',')].concat(state.res.rows.map((r) => keys.map((k) => (typeof r[k] === 'number' ? +r[k].toFixed(5) : r[k])).join(','))).join('\n'), app);
    });
    $('#plBuild').addEventListener('click', () => {
      if (!state.res) { $('#plPaperMsg').textContent = 'Run the experiment first (step 1). The paper is built from its results.'; return; }
      try {
        state.md = P.buildPaper(state.res, { title: $('#plTitle').value.trim() || undefined, author: $('#plAuthor').value.trim() || undefined, affiliation: $('#plAff').value.trim() || undefined, email: $('#plMail').value.trim() || undefined, actions: C.ACTIONS });
        $('#plPreview').innerHTML = P.mdToHtml(state.md); $('#plCopyMd').disabled = false; $('#plPrint').disabled = false; $('#plPaperChip').textContent = state.md.split(/\s+/).length + ' words';
        $('#plPaperMsg').textContent = 'Draft built from your results. Read every sentence, check every number and reference, and add your own related work before sharing it.';
      } catch (e) { $('#plPaperMsg').textContent = 'Could not build the paper: ' + e.message; }
    });
    $('#plCopyMd').addEventListener('click', () => copyText(state.md, app));
    $('#plPrint').addEventListener('click', () => {
      let el = document.getElementById('paperPrint'); if (!el) { el = document.createElement('div'); el.id = 'paperPrint'; document.body.appendChild(el); }
      el.innerHTML = P.mdToHtml(state.md); document.body.classList.add('print-paper');
      const done = () => { document.body.classList.remove('print-paper'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done); try { window.print(); } catch (e) { done(); app.toast('Printing is not available here. Copy the Markdown instead.'); }
    });
    window.outbreakPaperLab = { state };
  }
  if (typeof document !== 'undefined') { const go = () => setTimeout(boot, 0); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go(); }
})();

