/* Calculadora de problemas de elutriación (tabla de casos). Usa SIM.solveProblem / SIM.fluidProps. */
(function () {
  'use strict';

  const Q_UNITS = { 'L/min': 1, 'L/s': 60, 'm³/h': 1000 / 60, 'cm³/s': 0.06, 'm³/s': 60000 };
  const D_UNITS = { cm: 1, mm: 0.1, in: 2.54, m: 100 };
  const FLUID_NAMES = { water: 'Agua', air: 'Aire', custom: 'Personalizado' };
  const STORE_KEY = 'elutriacion-calc-casos';

  const newCase = (n, over) => Object.assign({
    name: 'Caso ' + n, rho_p: '2650', psi: '1', sizes: '', psd: '', feed: '',
    fluid: 'water', T: '20', rho_f: '', mu: '',
    D1: '5.95', D2: '11.9', dU: 'cm', Q: '1.5', qU: 'L/min',
    mode: 'direct', dpc1: '100', dpc2: '50', fix: 'D1', corr: 'auto'
  }, over || {});

  const esc = v => String(v === undefined || v === null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const CASE_KEYS = Object.keys(newCase(1));
  const clean = c => { const o = newCase(1); for (const k of CASE_KEYS) if (c && typeof c[k] === 'string') o[k] = c[k]; return o; };
  const num = v => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : NaN; };
  const fmt = (x, n = 4) => {
    if (x === undefined || x === null || !Number.isFinite(x)) return '—';
    if (x === 0) return '0';
    const a = Math.abs(x);
    if (a >= 1e5 || a < 1e-3) return x.toExponential(n - 1).replace(/\.?0+e/, 'e');
    return String(Number(x.toPrecision(n)));
  };

  window.initCalculator = function (ctx) {
    const { SIM, $, tex, onSend } = ctx;
    const modal = $('calc-modal'), body = $('calc-body');
    let cases, stepsFor = 0;
    try { cases = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { cases = null; }
    cases = Array.isArray(cases) && cases.length ? cases.map(clean) : [newCase(1)];
    const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(cases.map(clean))); } catch (e) { /* sin efecto */ } };

    // ---------------------------------------------------------------- cálculo
    function fluidOf(c) {
      if (c.fluid === 'custom') return { rho_f: num(c.rho_f), mu_mPas: num(c.mu) };
      return SIM.fluidProps(c.fluid, Number.isFinite(num(c.T)) ? num(c.T) : 20);
    }
    function parseSizes(t) { return String(t || '').split(/[;,\s]+/).map(num).filter(x => x > 0); }
    function parsePsd(t) {
      return String(t || '').split('\n').map(l => (l.match(/\d+(?:[.,]\d+)?/g) || []).map(num))
        .filter(a => a.length >= 3).map(a => ({ lo: a[0], hi: a[1], pct: a[2] }));
    }
    function toInput(c) {
      const f = fluidOf(c);
      return {
        rho_f: f.rho_f, mu_mPas: f.mu_mPas, rho_p: num(c.rho_p), psi: num(c.psi),
        D1_cm: num(c.D1) * D_UNITS[c.dU], D2_cm: num(c.D2) * D_UNITS[c.dU],
        Q_Lmin: num(c.Q) * Q_UNITS[c.qU], g: 9.81,
        reCorrection: c.corr === 'auto' ? 'auto' : c.corr === 'yes',
        mode: c.mode, dpc1_um: num(c.dpc1), dpc2_um: num(c.dpc2), fix: c.fix,
        sizes_um: parseSizes(c.sizes), psd: parsePsd(c.psd), feed_kgh: num(c.feed)
      };
    }
    const solve = c => {
      const inp = toInput(c);
      if (c.mode === 'design') inp.Q_Lmin = 1;               // no se usa: se calcula
      if (!(inp.rho_p > 0)) return { error: 'Completa la densidad del sólido ρp.', warnings: [] };
      if (c.mode === 'design') {
        const fixed = c.fix === 'D2' ? inp.D2_cm : inp.D1_cm;
        if (!(fixed > 0)) return { error: `Indica ${c.fix === 'D2' ? 'D₂' : 'D₁'} (el diámetro que se fija).`, warnings: [] };
        if (c.fix === 'D2') inp.D1_cm = 1; else inp.D2_cm = 1;   // el otro se calcula
      } else if (![inp.D1_cm, inp.D2_cm].every(x => x > 0)) return { error: 'Completa D₁ y D₂.', warnings: [] };
      if (c.mode !== 'design' && !(inp.Q_Lmin > 0)) return { error: 'Indica el caudal Q.', warnings: [] };
      return SIM.solveProblem(inp);
    };

    // ---------------------------------------------------------------- filas
    const OUT = [
      ['Resultados', null],
      ['Área columna 1 A₁ (m²)', r => fmt(r.A_m2 && r.A_m2[0])],
      ['Área columna 2 A₂ (m²)', r => fmt(r.A_m2 && r.A_m2[1])],
      ['Caudal Q (L/min)', r => fmt(r.Q_Lmin)],
      ['Velocidad superficial v_f1 (mm/s)', r => fmt(r.vf_mms && r.vf_mms[0])],
      ['Velocidad superficial v_f2 (mm/s)', r => fmt(r.vf_mms && r.vf_mms[1])],
      ['Diferencia de densidad Δρ (kg/m³)', r => fmt(r.dRho)],
      ['Corte equivalente d_pc1 (µm)', r => fmt(r.dpc_eq_um && r.dpc_eq_um[0])],
      ['Corte equivalente d_pc2 (µm)', r => fmt(r.dpc_eq_um && r.dpc_eq_um[1])],
      ['Corte real d_pc1,real = d_pc1/√ψ (µm)', r => fmt(r.dpc_real_um && r.dpc_real_um[0])],
      ['Corte real d_pc2,real (µm)', r => fmt(r.dpc_real_um && r.dpc_real_um[1])],
      ['Relación d_pc1/d_pc2', r => fmt(r.ratio_cuts)],
      ['Relación D₂/D₁', r => fmt(r.ratio_D)],
      ['Re_p columna 1', r => fmt(r.Re_p && r.Re_p[0])],
      ['Re_p columna 2', r => fmt(r.Re_p && r.Re_p[1])],
      ['Régimen (col. 1 / col. 2)', r => r.regime ? r.regime.join(' / ') : '—'],
      ['Re de columna Re_c1 / Re_c2', r => r.Re_c ? `${fmt(r.Re_c[0], 3)} / ${fmt(r.Re_c[1], 3)}` : '—'],
      ['Corrección Schiller–Naumann aplicada', r => r.error ? '—' : (r.reCorrection ? 'Sí' : 'No')],
      ['Factor de forma f_ψ = 1/√ψ', r => fmt(r.fpsi)],
      ['Diseño (cuando se fijan los cortes)', null],
      ['Caudal requerido Q_req (L/min)', r => r.design ? fmt(r.design.Q_req_Lmin) : '—'],
      ['D₁ requerido (cm)', r => r.design ? fmt(r.design.D1_req_cm) : '—'],
      ['D₂ requerido (cm)', r => r.design ? fmt(r.design.D2_req_cm) : '—'],
      ['v_f1 requerida (mm/s)', r => r.design ? fmt(r.design.vf_req_mms[0]) : '—'],
      ['v_f2 requerida (mm/s)', r => r.design ? fmt(r.design.vf_req_mms[1]) : '—'],
      ['Fracciones y flujos másicos (necesita granulometría)', null],
      ['Gruesos → Colector 1 (%)', r => r.fractions ? fmt(r.fractions[0]) : '—'],
      ['Medios → Colector 2 (%)', r => r.fractions ? fmt(r.fractions[1]) : '—'],
      ['Finos → Rebose (%)', r => r.fractions ? fmt(r.fractions[2]) : '—'],
      ['Flujo másico gruesos (kg/h)', r => r.mdot_kgh ? fmt(r.mdot_kgh[0]) : '—'],
      ['Flujo másico medios (kg/h)', r => r.mdot_kgh ? fmt(r.mdot_kgh[1]) : '—'],
      ['Flujo másico finos (kg/h)', r => r.mdot_kgh ? fmt(r.mdot_kgh[2]) : '—'],
      ['Tamaños de interés', null],
      ['Destino de cada tamaño', r => (r.sizes && r.sizes.length) ? r.sizes.map(s =>
        `${fmt(s.d, 4)} µm: v_t ${fmt(s.vt_mms, 3)} mm/s → ${['Colector 1', 'Colector 2', 'Rebose'][s.outlet]}`).join('\n') : '—'],
      ['Velocidad neta col. 1 / col. 2 (mm/s; >0 sube)', r => (r.sizes && r.sizes.length) ? r.sizes.map(s =>
        `${fmt(s.d, 4)} µm: ${fmt(s.vnet1_mms, 3)} / ${fmt(s.vnet2_mms, 3)}`).join('\n') : '—'],
      ['Avisos', r => r.error ? '⚠ ' + r.error : ((r.warnings || []).join('\n') || 'Sin avisos')]
    ];

    const MATERIAL_OPTS = [['500', 'Biomasa (500)'], ['2650', 'Cuarzo (2650)'], ['4500', 'Barita (4500)'], ['7500', 'Galena (7500)']]
      .concat((SIM.MATERIALS || []).map(m => [String(m.rho), `${m.name} (${m.rho})`]));
    const inp = (i, key, ph, extra) => `<input type="text" inputmode="decimal" data-case="${i}" data-key="${key}" value="${esc(cases[i][key])}" placeholder="${ph || ''}" ${extra || ''}>`;
    const sel = (i, key, opts) => `<select data-case="${i}" data-key="${key}" data-struct="1">${opts.map(([v, t]) => `<option value="${v}" ${cases[i][key] === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;

    function inputRows() {
      const R = [];
      const row = (label, fn) => R.push([label, fn]);
      R.push(['Datos de entrada', null]);
      row('Nombre del caso', i => `<input type="text" data-case="${i}" data-key="name" value="${esc(cases[i].name)}">`);
      row('Modo de cálculo', i => sel(i, 'mode', [['direct', 'Directo (doy Q)'], ['design', 'Diseño (doy los cortes)']]));
      R.push(['Sólido', null]);
      row('Material (llena ρp)', i => {
        const rho = num(cases[i].rho_p);
        const opts = MATERIAL_OPTS.map(([v, t]) => `<option value="${v}" ${Number(v) === rho ? 'selected' : ''}>${t}</option>`).join('');
        const known = MATERIAL_OPTS.some(([v]) => Number(v) === rho);
        return `<select data-case="${i}" data-key="__mat" data-struct="1"><option value="" ${known ? '' : 'selected'}>Personalizado</option>${opts}</select>`;
      });
      row('Densidad del sólido ρp (kg/m³)', i => inp(i, 'rho_p'));
      row('Esfericidad ψ (0.40–1.00)', i => inp(i, 'psi'));
      row('Alimentación (kg/h, opcional)', i => inp(i, 'feed', 'kg/h'));
      row('Granulometría en masa: una clase por línea «d inferior, d superior, % masa» (µm)', i =>
        `<textarea rows="4" data-case="${i}" data-key="psd" placeholder="15-50 30&#10;50-100 40&#10;100-145 30">${esc(cases[i].psd)}</textarea>`);
      row('Tamaños de interés (µm, separados por coma)', i => inp(i, 'sizes', '30, 60, 120'));
      R.push(['Fluido', null]);
      row('Fluido', i => sel(i, 'fluid', Object.entries(FLUID_NAMES)));
      row('Temperatura T (°C)', i => cases[i].fluid === 'custom' ? '<span class="calc-dim">—</span>' : inp(i, 'T'));
      row('Densidad del fluido ρf (kg/m³)', i => cases[i].fluid === 'custom' ? inp(i, 'rho_f') : `<span class="calc-auto" data-auto="rho_f" data-case="${i}"></span>`);
      row('Viscosidad dinámica μ (mPa·s)', i => cases[i].fluid === 'custom' ? inp(i, 'mu') : `<span class="calc-auto" data-auto="mu" data-case="${i}"></span>`);
      R.push(['Equipo y operación', null]);
      row('Unidad de diámetros', i => sel(i, 'dU', Object.keys(D_UNITS).map(k => [k, k])));
      row('Diámetro columna 1 D₁', i => inp(i, 'D1', '', cases[i].mode === 'design' && cases[i].fix === 'D2' ? 'disabled' : ''));
      row('Diámetro columna 2 D₂', i => inp(i, 'D2', '', cases[i].mode === 'design' && cases[i].fix === 'D1' ? 'disabled' : ''));
      row('Unidad de caudal', i => sel(i, 'qU', Object.keys(Q_UNITS).map(k => [k, k])));
      row('Caudal Q', i => cases[i].mode === 'design' ? '<span class="calc-dim">se calcula</span>' : inp(i, 'Q'));
      row('Corrección de Schiller–Naumann', i => sel(i, 'corr', [['auto', 'Automática (si Re_p > 1)'], ['yes', 'Siempre'], ['no', 'Nunca (Stokes)']]));
      row('Cortes objetivo (modo diseño)', i => cases[i].mode === 'design'
        ? `<div class="calc-pair">${inp(i, 'dpc1', 'd_pc1 µm')}${inp(i, 'dpc2', 'd_pc2 µm')}</div>` : '<span class="calc-dim">solo en modo diseño</span>');
      row('Diámetro que se fija (modo diseño)', i => cases[i].mode === 'design' ? sel(i, 'fix', [['D1', 'Fijo D₁ → calcula D₂'], ['D2', 'Fijo D₂ → calcula D₁']]) : '<span class="calc-dim">—</span>');
      return R;
    }

    function render() {
      const act = document.activeElement;
      const focus = act && act.dataset && act.dataset.key ? { c: act.dataset.case, k: act.dataset.key } : null;
      const head = cases.map((c, i) => `<th>
        <div class="calc-colhead"><b>${esc(c.name || 'Caso ' + (i + 1))}</b>
        <span class="calc-actions">
          <button class="btn" data-act="steps" data-case="${i}" title="Ver el procedimiento con ecuaciones">📐</button>
          <button class="btn" data-act="send" data-case="${i}" title="Enviar este caso al simulador 3D">➡ Simular</button>
          <button class="btn" data-act="dup" data-case="${i}" title="Duplicar">📋</button>
          ${cases.length > 1 ? `<button class="btn" data-act="del" data-case="${i}" title="Eliminar">🗑</button>` : ''}
        </span></div></th>`).join('');
      let html = `<div class="calc-scroll"><table class="calc-table"><thead><tr><th class="calc-var">Variable</th>${head}</tr></thead><tbody>`;
      for (const [label, fn] of inputRows()) {
        html += fn === null ? `<tr class="calc-sec"><td colspan="${cases.length + 1}">${label}</td></tr>`
          : `<tr><td class="calc-var">${label}</td>${cases.map((_, i) => `<td>${fn(i)}</td>`).join('')}</tr>`;
      }
      OUT.forEach(([label, fn], k) => {
        html += fn === null ? `<tr class="calc-sec out"><td colspan="${cases.length + 1}">${label}</td></tr>`
          : `<tr><td class="calc-var">${label}</td>${cases.map((_, i) => `<td class="calc-out" data-out="${k}" data-case="${i}"></td>`).join('')}</tr>`;
      });
      html += '</tbody></table></div><div id="calc-steps" class="calc-steps"></div><div id="calc-msg" class="calc-msg"></div>';
      body.innerHTML = html;
      recalc();
      if (focus) {
        const el = body.querySelector(`[data-case="${focus.c}"][data-key="${focus.k}"]`);
        if (el && el.focus) el.focus();
      }
    }

    function recalc() {
      cases.forEach((c, i) => {
        const r = solve(c);
        c._r = r;
        const f = fluidOf(c);
        body.querySelectorAll(`.calc-auto[data-case="${i}"]`).forEach(el => { el.textContent = fmt(el.dataset.auto === 'rho_f' ? f.rho_f : f.mu_mPas, 5); });
        OUT.forEach(([, fn], k) => {
          if (!fn) return;
          const cell = body.querySelector(`.calc-out[data-out="${k}"][data-case="${i}"]`);
          if (cell) cell.textContent = fn(r);
        });
      });
      renderSteps();
      save();
    }

    // ---------------------------------------------------------------- pasos con ecuaciones
    function renderSteps() {
      const box = $('calc-steps'); if (!box) return;
      const c = cases[stepsFor] || cases[0], r = c && c._r;
      if (!r || r.error || r.floats) {
        box.innerHTML = r && r.floats ? '<b>📐 Procedimiento:</b> ρp ≤ ρf, el sólido flota; no hay corte.' : '';
        return;
      }
      const f = fluidOf(c), n = (x, d) => fmt(x, d || 4);
      const L = [];
      const si = x => String(Number(x.toPrecision(4))).replace(/e\+?(-?\d+)/, '\\times 10^{$1}');
      if (r.mode === 'design') {
        L.push(String.raw`\text{Diseño: se parte de los cortes pedidos } d_{pc1,real}=${n(parseFloat(c.dpc1))}\,\mu m,\; d_{pc2,real}=${n(parseFloat(c.dpc2))}\,\mu m`);
        L.push(String.raw`d_{eq}=d\sqrt{\psi}\;\Rightarrow\; d_{eq1}=${n(r.dpc_eq_um[0])}\,\mu m,\; d_{eq2}=${n(r.dpc_eq_um[1])}\,\mu m`);
        L.push(String.raw`v_{f,req}=v_t(d_{eq})\;\Rightarrow\; v_{f1}=${n(r.design.vf_req_mms[0])}\ \mathrm{mm/s},\; v_{f2}=${n(r.design.vf_req_mms[1])}\ \mathrm{mm/s}`);
        L.push(r.design.fix === 'D1'
          ? String.raw`Q=v_{f1}A_1=${n(r.design.Q_req_Lmin)}\ \mathrm{L/min},\qquad D_2=\sqrt{\dfrac{4Q}{\pi v_{f2}}}=${n(r.design.D2_req_cm)}\ \mathrm{cm}`
          : String.raw`Q=v_{f2}A_2=${n(r.design.Q_req_Lmin)}\ \mathrm{L/min},\qquad D_1=\sqrt{\dfrac{4Q}{\pi v_{f1}}}=${n(r.design.D1_req_cm)}\ \mathrm{cm}`);
      }
      L.push(String.raw`A_i=\dfrac{\pi D_i^2}{4}\;\Rightarrow\; A_1=${si(r.A_m2[0])}\ \mathrm{m^2},\; A_2=${si(r.A_m2[1])}\ \mathrm{m^2}`);
      L.push(String.raw`v_{f,i}=\dfrac{Q}{A_i}\;\Rightarrow\; v_{f1}=${n(r.vf_mms[0])}\ \mathrm{mm/s},\; v_{f2}=${n(r.vf_mms[1])}\ \mathrm{mm/s}\quad(Q=${si(r.Q_m3s)}\ \mathrm{m^3/s})`);
      L.push(String.raw`\Delta\rho=\rho_p-\rho_f=${n(r.rho_p)}-${n(f.rho_f)}=${n(r.dRho)}\ \mathrm{kg/m^3}`);
      L.push(r.reCorrection
        ? String.raw`v_t(d)=\dfrac{g\,d^2\,\Delta\rho}{18\mu}\cdot\dfrac{1}{1+0.15\,Re_p^{0.687}}=v_{f,i}\;\Rightarrow\; d_{eq1}=${n(r.dpc_eq_um[0])}\,\mu m,\; d_{eq2}=${n(r.dpc_eq_um[1])}\,\mu m\ \text{(bisección)}`
        : String.raw`d_{pc}=\sqrt{\dfrac{18\,\mu\,v_f}{g\,\Delta\rho}}\;\Rightarrow\; d_{pc1}=${n(r.dpc_eq_um[0])}\,\mu m,\; d_{pc2}=${n(r.dpc_eq_um[1])}\,\mu m`);
      L.push(String.raw`d_{pc,real}=\dfrac{d_{pc}}{\sqrt{\psi}}\;\Rightarrow\; ${n(r.dpc_real_um[0])}\,\mu m \text{ y } ${n(r.dpc_real_um[1])}\,\mu m\quad(\psi=${n(r.psi)})`);
      L.push(String.raw`Re_p=\dfrac{\rho_f\,v_f\,d_{pc}}{\mu}\;\Rightarrow\; Re_{p1}=${n(r.Re_p[0])},\; Re_{p2}=${n(r.Re_p[1])}\quad(\rho_f=${n(f.rho_f)},\ \mu=${n(f.mu_mPas)}\ \mathrm{mPa\cdot s})`);
      L.push(String.raw`\dfrac{d_{pc1}}{d_{pc2}}=${n(r.ratio_cuts)}\ \text{ frente a }\ \dfrac{D_2}{D_1}=${n(r.ratio_D)}\ \ (\text{iguales solo en régimen de Stokes})`);
      if (r.fractions) L.push(String.raw`f_g=${n(r.fractions[0])}\%,\; f_m=${n(r.fractions[1])}\%,\; f_f=${n(r.fractions[2])}\%\ \text{(integrando la granulometría en masa, reparto uniforme en cada clase)}`);
      box.innerHTML = `<b>📐 Procedimiento — ${esc(c.name)}</b>` + L.map((_, k) => `<div class="calc-step" id="calc-step-${k}"></div>`).join('');
      L.forEach((s, k) => tex($(`calc-step-${k}`), s, false));
    }

    // ---------------------------------------------------------------- eventos
    body.addEventListener('input', e => {
      const t = e.target; if (!t.dataset || !t.dataset.key || t.dataset.struct) return;
      cases[+t.dataset.case][t.dataset.key] = t.value;
      recalc();
    });
    body.addEventListener('change', e => {
      const t = e.target; if (!t.dataset || !t.dataset.key || !t.dataset.struct || !t.isConnected) return;   // los campos de texto ya se guardan con «input»
      const c = cases[+t.dataset.case], k = t.dataset.key;
      if (k === '__mat') { if (t.value) c.rho_p = t.value; }
      else if (k === 'dU' || k === 'qU') {
        // se convierte el valor escrito para que siga representando la misma magnitud
        const table = k === 'dU' ? D_UNITS : Q_UNITS, from = table[c[k]], to = table[t.value];
        (k === 'dU' ? ['D1', 'D2'] : ['Q']).forEach(f => { const v = num(c[f]); if (Number.isFinite(v)) c[f] = String(Number((v * from / to).toPrecision(6))); });
        c[k] = t.value;
      } else c[k] = t.value;
      render();
    });
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const i = +b.dataset.case, a = b.dataset.act;
      if (a === 'del') { cases.splice(i, 1); stepsFor = 0; render(); }
      else if (a === 'dup') { cases.splice(i + 1, 0, Object.assign({}, cases[i], { name: cases[i].name + ' (copia)' })); render(); }
      else if (a === 'steps') { stepsFor = i; renderSteps(); $('calc-steps').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      else if (a === 'send') send(i);
    });

    function send(i) {
      const c = cases[i], r = c._r;
      const msg = $('calc-msg');
      if (!r || r.error) { msg.textContent = '⚠ Este caso tiene datos incompletos: ' + (r && r.error || ''); return; }
      const notes = onSend(c, r, fluidOf(c), toInput(c));
      msg.innerHTML = notes && notes.length ? '⚠ ' + notes.join('<br>⚠ ') : '';
      if (!notes || !notes.length) modal.classList.remove('open');
    }

    $('btn-calc-pull').addEventListener('click', () => {
      cases.push(Object.assign(newCase(cases.length + 1), ctx.getSimCase()));
      stepsFor = cases.length - 1; render();
      body.querySelector('.calc-scroll').scrollLeft = 99999;
    });
    $('btn-calc-add').addEventListener('click', () => { cases.push(newCase(cases.length + 1)); render(); body.scrollLeft = body.scrollWidth; });
    $('btn-calc-example').addEventListener('click', () => {
      cases = [
        newCase(1, { name: 'Ejemplo (agua)', psd: '15-50 30\n50-100 40\n100-145 30', feed: '10', sizes: '30, 60, 120' }),
        newCase(2, { name: 'Diseño ψ = 0.8', mode: 'design', psi: '0.8', dpc1: '100', dpc2: '50', sizes: '40, 80' }),
        newCase(3, { name: 'Aire', fluid: 'air', Q: '100', sizes: '30, 80, 150' })
      ];
      stepsFor = 0; render();
    });
    $('btn-calc-csv').addEventListener('click', () => {
      const q = s => `"${String(s).replace(/"/g, '""')}"`;
      const rows = [['Variable'].concat(cases.map(c => c.name))];
      [['Modo', 'mode'], ['ρp (kg/m³)', 'rho_p'], ['ψ', 'psi'], ['Alimentación (kg/h)', 'feed'], ['Granulometría en masa', 'psd'], ['Tamaños de interés (µm)', 'sizes'],
        ['Fluido', 'fluid'], ['T (°C)', 'T'], ['Unidad de diámetros', 'dU'], ['D₁', 'D1'], ['D₂', 'D2'], ['Unidad de caudal', 'qU'], ['Q', 'Q'],
        ['Corrección Re', 'corr'], ['d_pc1 objetivo (µm)', 'dpc1'], ['d_pc2 objetivo (µm)', 'dpc2'], ['Diámetro fijo', 'fix']].forEach(([label, key]) =>
        rows.push([label].concat(cases.map(c => String(c[key]).replace(/\n/g, ' | ')))));
      OUT.forEach(([label, fn]) => { if (fn) rows.push([label].concat(cases.map(c => fn(c._r || {}).replace(/\n/g, ' | ')))); });
      const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'calculadora-elutriacion.csv'; a.click();
    });
    $('btn-open-calc').addEventListener('click', () => { modal.classList.add('open'); render(); });
    $('btn-close-calc').addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    window.addEventListener('keydown', e => { if (e.key === 'Escape') modal.classList.remove('open'); });
    window.elutriadorCalc = { get cases() { return cases; }, solve, render, toInput };
  };
})();
