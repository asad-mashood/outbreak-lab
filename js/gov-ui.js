/* =====================================================================
   OUTBREAK LAB v17: GOVERNMENT TAB (read-only view of the books)
   ===================================================================== */
(function () {
  'use strict';
  let app = null;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pc = (v) => Math.round(v * 100);
  const rs = (v) => { const a = Math.abs(v); return (v < 0 ? '−' : '') + 'Rs ' + (a >= 1e9 ? (a / 1e9).toFixed(2) + ' bn' : a >= 1e6 ? (a / 1e6).toFixed(1) + ' M' : a >= 1e3 ? Math.round(a / 1e3) + ' k' : Math.round(a)); };
  const sig = {};
  const put = (id, html) => { if (sig[id] !== html) { sig[id] = html; $(id).innerHTML = html; } };
  const row = (a, b, hint) => `<div class="sc-row"><span>${a}</span><b${hint ? ` title="${esc(hint)}"` : ''}>${b}</b></div>`;
  const bar = (label, frac, text, col) => `<div class="sc-row"><span>${label}</span><div class="sc-bar"><i style="width:${Math.max(0, Math.min(100, Math.round(frac * 100)))}%;background:var(--${col || 'accent'})"></i></div><b>${text}</b></div>`;
  function chart(w) {
    const cv = $('#gvChart'); if (!cv) return; const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, H = cv.clientHeight || 130;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const h = w.eco ? w.eco.hist : null; ctx.font = '10px monospace'; ctx.fillStyle = '#7c8896';
    if (!h || h.cash.length < 2) { ctx.fillText('The books open after two simulated days', 6, 14); return; }
    const line = (data, color, lo, hi) => { ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath(); data.forEach((v, i) => { const x = 4 + (W - 8) * i / Math.max(1, data.length - 1), y = H - 12 - (H - 24) * (v - lo) / Math.max(1e-9, hi - lo); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); };
    const cash = h.cash.map((v) => v / 1e6), lo = Math.min(0, ...cash), hi = Math.max(...cash, 1);
    line(cash, '#46c6e6', lo, hi); line(h.trust, '#ffb83d', 0, 100);
    ctx.fillStyle = '#7c8896'; ctx.fillText(hi.toFixed(0) + ' M', 4, 10); ctx.fillText('day ' + h.t[0] + ' → ' + h.t[h.t.length - 1], 4, H - 2);
  }
  function render() {
    const w = app.world; $('#gvOff').hidden = !!w.eco; if (!w.eco) { for (const id of ['#gvTreasury', '#gvIncome', '#gvDepts', '#gvPrices', '#gvHouse', '#gvBirth', '#gvPeople', '#gvNews']) put(id, '<p class="stat-line">Economy off.</p>'); return; }
    const e = w.eco, g = e.gov, f = w.fiscal(), p = w.params, mt = w.maternal(), pop = w.populationNow();
    $('#gvScale').textContent = p.moneyScale; $('#gvCity').textContent = (pop.alive * p.moneyScale).toLocaleString(); $('#gvLapse').textContent = '×' + p.demoMul;
    $('#gvRunway').textContent = f.net >= 0 ? 'income covers spending' : 'cash lasts ' + (f.runway >= 999 ? '999+' : Math.round(f.runway)) + ' days at this deficit';
    put('#gvTreasury', row('Cash in the treasury', rs(f.cash)) + row('Emergency fund', rs(f.reserve)) + row('Debt', rs(f.debt), 'borrowed at ' + Math.round(g.rate * 100) + '% a year') + row('Credit still available', rs(f.credit)) + row('Unpaid bills', rs(f.arrears), 'bills the city could not pay on time') + row('Income per day', rs(f.dayRev)) + row('Spending per day', rs(f.dayExp)) + row('Daily balance', `<span style="color:var(--${f.net >= 0 ? 'ok' : 'danger'})">${rs(f.net)}</span>`) + bar('Public trust', f.trust, pc(f.trust) + '%', f.trust > 0.5 ? 'ok' : 'warn') + row('Rules followed', pc(f.comp) + '% of normal', 'trust sets how willingly people follow rules') + (g.requests.length ? row('Grant requests waiting', g.requests.map((r) => rs(r.asked)).join(', ')) : ''));
    const inc = g.rev, tot = Math.max(1, Object.values(inc).reduce((a, b) => a + b, 0));
    put('#gvIncome', Object.keys(inc).map((k) => bar({ tax: 'Property tax', business: 'Business tax', utility: 'Power and water bills', fares: 'Bus fares', fines: 'Fines', grant: 'Province grant', aid: 'Aid', loan: 'Loans' }[k] || k, inc[k] / tot, rs(inc[k]))).join('') + '<p class="stat-line">Totals so far today.</p>');
    const D = w.ecoDepts();
    put('#gvDepts', D.map((k) => { const plan = g.plan[k] || 1, spent = g.exp[k] || 0; return bar(k[0].toUpperCase() + k.slice(1), Math.min(1.2, spent / Math.max(1, plan * Math.max(0.05, (w.minuteNow || 1) / 1440))) / 1.2, rs(plan), spent > plan * 1.1 ? 'danger' : 'accent'); }).join('') + '<p class="stat-line">Figures: planned spending per day. Bar: spent so far today against the planned share of the day. Changes to the plan go through the finance officer.</p>');
    put('#gvPrices', w.ecoPriceTable().map((r) => `<tr><td>${esc(r.item)}</td><td class="n">${r.unit ? r.unit + ' ' : ''}${Math.round(r.now * 10) / 10}</td><td class="n">${r.unit ? r.unit + ' ' : ''}${Math.round(r.base * 10) / 10}</td><td>${esc(r.why)}</td></tr>`).join(''));
    const hh = e.hh; put('#gvHouse', row('Households', hh.n) + bar('In distress (out of savings)', f.distress, pc(f.distress) + '%', f.distress > 0.15 ? 'danger' : 'ok') + row('Wages lost today', rs(hh.lostToday)) + row('Cost-of-living index', (f.cpi * 100).toFixed(1)) + row('Relief paid out so far', rs(hh.transfers + hh.supportPaid)) + '<p class="stat-line">A household is in distress when its savings are below zero. Closing workplaces cuts wages; cash relief and wage support ease it.</p>');
    $('#gvBirthChip').textContent = `${mt.pregnant} pregnant · ${mt.labourNow} in labour`;
    put('#gvBirth', bar('Delivery rooms free', mt.roomsFree / Math.max(1, mt.rooms), `${mt.roomsFree} of ${mt.rooms}`, mt.roomsFree ? 'ok' : 'danger') + row('Midwives', mt.midwives) + row('Incubators free', `${mt.incubFree} of ${mt.incubators}`) + row('Backup power for the birth centre', mt.power ? 'on' : '<span style="color:var(--danger)">no power</span>') + row('Antenatal care', mt.antenatal + '% of mothers') + row('Due in the next 3 days', mt.dueSoon) + row('Births so far', `${mt.births} (${mt.facility} at the birth centre, ${mt.home} at home)`) + row('Turned away (no room, midwife or power)', mt.turnedAway) + row('Early births / complications', `${mt.preterm} / ${mt.complic}`) + row('Newborn deaths / mothers lost', `${mt.neoDeaths} / ${mt.matDeaths}`) + `<p class="stat-line">Expected by the model's own risk figures, for comparison: ${mt.expNeo.toFixed(1)} newborn and ${mt.expMat.toFixed(2)} maternal deaths so far. Early birth is more likely when the mother has breathed bad air.</p>`);
    const c = w.counts();
    put('#gvPeople', row('Alive', pop.alive) + row('Children / adults / elders', `${pop.children} / ${pop.adults} / ${pop.elders}`) + row('Babies born in this run (under 4)', pop.infants) + row('Natural deaths', c.N || 0) + row('Disease deaths', c.D) + row('Road and fire deaths', c.X) + '<p class="stat-line">Born and natural deaths are counted separately from deaths caused by the outbreak, smog or accidents.</p>');
    put('#gvNews', '<div class="two-col"><div><h3 class="eyebrow">News</h3>' + (e.news.slice(0, 14).map((n) => `<div class="ag-line"><small class="mono">${esc(String(Math.floor(n.t / 1440)))}d ${String(Math.floor(((n.t + 360) % 1440) / 60)).padStart(2, '0')}h</small> ${esc(n.text)}</div>`).join('') || '<p class="stat-line">Nothing yet.</p>') + '</div><div><h3 class="eyebrow">Capital spending</h3>' + (g.capexList.slice(0, 10).map((n) => `<div class="ag-line"><b>${rs(n.cost)}</b> ${esc(n.text)}</div>`).join('') || '<p class="stat-line">No capital spending yet.</p>') + '</div></div>');
    chart(w);
  }
  function boot() {
    app = window.outbreakLab; if (!app) return false;
    setInterval(() => { try { if (app.tab === 'gov') render(); } catch (e) { /* keep the page alive */ } }, 1000);
    const tb = document.querySelector('[data-tab="gov"]'); if (tb) tb.addEventListener('click', () => setTimeout(() => { try { render(); } catch (e) { /* ignore */ } }, 50));
    return true;
  }
  if (!boot()) { const t = setInterval(() => { if (boot()) clearInterval(t); }, 200); }
})();

