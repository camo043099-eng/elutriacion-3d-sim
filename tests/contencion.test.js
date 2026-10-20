/*
 * Pruebas del motor físico (Node, sin dependencias):
 *   node tests/contencion.test.js
 *
 * 1. Valores del caso de diseño (Stokes) coinciden con el README.
 * 2. Ninguna partícula atraviesa paredes de columnas, conos, reductores,
 *    tuberías, tolva, colectores ni tanque, en muchos escenarios distintos.
 * 3. Con flujo pistón y sin dispersión, la clasificación es casi perfecta.
 */
'use strict';
const assert = require('assert');
const S = require('../js/sim.js');
const L = S.LAYOUT;

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ✔ ' + name); }
  catch (e) { failures++; console.log('  ✘ ' + name + '\n    ' + e.message); }
}

// Generador pseudoaleatorio reproducible
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Verificador geométrico INDEPENDIENTE (no reutiliza las funciones de recorte)
// ---------------------------------------------------------------------------
const TOL = 0.004;
function sphereInRevolution(r, y, rad, containerFn) {
  // Peor penetración de una esfera (centro a distancia r del eje) en un
  // recipiente de revolución, muestreando 41 cortes horizontales.
  let worst = -Infinity;
  for (let k = 0; k <= 40; k++) {
    const dy = -rad + (2 * rad * k) / 40;
    const yy = y + dy;
    const R = containerFn(yy);
    if (R === null) continue;            // abertura (sin pared)
    const rho = Math.sqrt(Math.max(0, rad * rad - dy * dy));
    worst = Math.max(worst, r + rho - R);
  }
  return worst;
}

function distToPolyline(pt, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap = [pt[0] - a[0], pt[1] - a[1], pt[2] - a[2]];
    const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-12;
    const t = Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2));
    const d = Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
    best = Math.min(best, d);
  }
  return best;
}

function violation(sim, p) {
  const g = sim.geo;
  if (![p.x, p.y, p.z].every(Number.isFinite)) return Infinity;
  switch (p.stage) {
    case 'col': {
      const c = p.col;
      if (p.y < L.CONE_BOTTOM - 1e-9 || p.y > L.REDUCER_TOP + 1e-9) return 1;
      const r = Math.hypot(p.x - g.cx[c], p.z);
      return sphereInRevolution(r, p.y, p.rad, yy =>
        yy < L.CONE_BOTTOM ? L.POT_R : S.columnRadiusAt(g, c, yy));
    }
    case 'pipe': {
      const d = distToPolyline([p.x, p.y, p.z], g.paths[p.path].points);
      return d + p.rad - L.PIPE_R;
    }
    case 'hopper': {
      const r = Math.hypot(p.x - g.feedX, p.z);
      return sphereInRevolution(r, p.y, p.rad, yy =>
        yy > L.HOPPER_TOP ? null : (yy < L.HOPPER_BOTTOM ? L.PIPE_R : S.hopperRadiusAt(yy)));
    }
    case 'fall':
    case 'rest': {
      if (p.dest === 2) {
        const r = Math.hypot(p.x - L.TANK_X, p.z);
        const wall = sphereInRevolution(r, p.y, p.rad, yy =>
          yy > L.OVERFLOW_END_Y ? L.PIPE_R : L.TANK_R);
        return Math.max(wall, L.TANK_FLOOR - (p.y - p.rad));
      }
      const c = p.dest;
      const r = Math.hypot(p.x - L.COL_X[c], p.z);
      const wall = sphereInRevolution(r, p.y, p.rad, yy =>
        yy >= L.CONE_BOTTOM ? S.columnRadiusAt(g, c, yy) : L.POT_R);
      return Math.max(wall, L.POT_FLOOR - (p.y - p.rad));
    }
  }
  return Infinity;
}

function runScenario(label, state, seconds, dt, seed, midChange) {
  const sim = new S.Simulation({ rng: mulberry32(seed), state });
  let worst = -Infinity, where = '';
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    if (midChange && i === Math.floor(steps / 2)) sim.setParams(midChange);
    sim.step(dt);
    for (const p of sim.particles) {
      const v = violation(sim, p);
      if (v > worst) { worst = v; where = `${p.stage}${p.path ? ':' + p.path : ''} d=${p.d.toFixed(1)}µm t=${(i * dt).toFixed(2)}s`; }
    }
    for (const t of sim.tracers) {
      const r = Math.hypot(t.x - sim.geo.cx[t.col], t.z);
      if (r + 0.025 > sim.geo.R[t.col] || t.y < L.INLET_Y - 1e-9 || t.y > L.COL_TOP) {
        worst = Math.max(worst, 1); where = 'trazador fuera';
      }
    }
  }
  assert.ok(worst <= TOL, `${label}: penetración máxima ${worst.toFixed(4)} (${where})`);
  return sim;
}

console.log('\nModelo físico');
check('Caso base: vf1 = 8.99 mm/s, dpc1 = 100 µm, dpc2 = 50 µm, Re1 ≈ 0.90', () => {
  const m = S.computeModel(S.DEFAULT_STATE);
  assert.strictEqual((m.vf[0] * 1000).toFixed(2), '8.99');
  assert.strictEqual((m.vf[1] * 1000).toFixed(2), '2.25');
  assert.strictEqual(m.dpc_um[0].toFixed(1), '100.0');
  assert.strictEqual(m.dpc_um[1].toFixed(1), '50.0');
  assert.strictEqual(m.re[0].toFixed(2), '0.90');
});
check('Galena (7500 kg/m³): dpc1 ≈ 50.4 µm', () => {
  const m = S.computeModel(Object.assign({}, S.DEFAULT_STATE, { rho_p: 7500 }));
  assert.strictEqual(m.dpc_um[0].toFixed(1), '50.4');
});
check('Schiller–Naumann: vt ≤ vt Stokes y dpc ≥ dpc Stokes', () => {
  const st = Object.assign({}, S.DEFAULT_STATE, { Q_Lmin: 4, reCorrection: true });
  const ss = Object.assign({}, st, { reCorrection: false });
  assert.ok(S.terminalVelocity(145e-6, st) < S.terminalVelocity(145e-6, ss));
  const a = S.computeModel(st), b = S.computeModel(ss);
  assert.ok(a.dpc_um[0] > b.dpc_um[0]);
  // la v_t en el diámetro de corte corregido vuelve a igualar a v_f
  const vt = S.terminalVelocity(a.dpc_um[0] * 1e-6, st);
  assert.ok(Math.abs(vt - a.vf[0]) / a.vf[0] < 1e-6);
});
check('Fracciones teóricas suman 100 %', () => {
  const m = S.computeModel(S.DEFAULT_STATE);
  assert.ok(Math.abs(m.theory.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

console.log('\nContención geométrica (ninguna partícula sale de equipos ni tubos)');
const D = S.DEFAULT_STATE;
const scenarios = [
  ['Diseño base, 60 FPS', {}, 1 / 60],
  ['Diseño base, dt máximo (0.05 s)', {}, 0.05],
  ['Perfil parabólico', { parabolic: true }, 1 / 60],
  ['Dispersión axial + parabólico', { dispersion: true, parabolic: true }, 0.05],
  ['Arrastre 4 L/min, galena, μ 0.5, D1 4 cm, D2 18 cm', { Q_Lmin: 4, rho_p: 7500, mu_mPas: 0.5, D1_cm: 4, D2_cm: 18 }, 0.05],
  ['0.5 L/min, ρ 1500, μ 3.5, D1 9 cm, D2 8 cm', { Q_Lmin: 0.5, rho_p: 1500, mu_mPas: 3.5, D1_cm: 9, D2_cm: 8 }, 1 / 30],
  ['Corrección Schiller–Naumann a 4 L/min', { Q_Lmin: 4, reCorrection: true, dispersion: true }, 1 / 60],
  ['Biomasa 500 kg/m³ (flota)', { rho_p: 500 }, 1 / 60],
  ['Polipropileno 910 kg/m³ + parabólico + dispersión', { rho_p: 910, parabolic: true, dispersion: true }, 0.05]
];
scenarios.forEach(([label, st, dt], i) => {
  check(label, () => runScenario(label, Object.assign({}, D, st), 45, dt, 1000 + i));
});
check('Cambio de D1/D2 durante la operación (columnas más angostas)', () => {
  runScenario('cambio D', Object.assign({}, D, { D1_cm: 9, D2_cm: 18 }), 40, 1 / 30, 77,
    { D1_cm: 4, D2_cm: 8 });
});
check('Reinicio de pulso', () => {
  const sim = new S.Simulation({ rng: mulberry32(5) });
  for (let i = 0; i < 300; i++) sim.step(1 / 60);
  sim.resetPulse();
  for (let i = 0; i < 1200; i++) {
    sim.step(1 / 60);
    for (const p of sim.particles) assert.ok(violation(sim, p) <= TOL, 'tras pulso: ' + p.stage);
  }
});

console.log('\nClasificación');
check('Flujo pistón sin dispersión: ≥ 97 % de partículas en su salida correcta', () => {
  const sim = runScenario('clasificación', Object.assign({}, D), 90, 1 / 30, 42);
  const st = sim.stats();
  assert.ok(st.n > 200, 'pocas descargas: ' + st.n);
  assert.ok(st.efficiency >= 0.97, 'eficiencia ' + (st.efficiency * 100).toFixed(1) + ' %');
});
check('Perfil parabólico reduce la nitidez del corte', () => {
  const a = runScenario('pistón', Object.assign({}, D), 90, 1 / 30, 9).stats().efficiency;
  const b = runScenario('parabólico', Object.assign({}, D, { parabolic: true }), 90, 1 / 30, 9).stats().efficiency;
  assert.ok(b < a, `parabólico ${b.toFixed(3)} no es menor que pistón ${a.toFixed(3)}`);
});

check('La eficiencia NO se declara válida mientras solo han llegado los gruesos', () => {
  const sim = new S.Simulation({ rng: mulberry32(21) });
  let first = null;
  for (let i = 0; i < 150 * 60; i++) {
    sim.step(1 / 60);
    const st = sim.stats();
    if (st.n >= 60 && sim.time < 20) {
      assert.ok(!st.steady, `declarada estacionaria a los ${sim.time.toFixed(1)} s con salidas ${st.fractions.map(x => (x * 100).toFixed(0)).join('/')}`);
    }
    if (st.steady && !first) first = { t: sim.time, st };
  }
  assert.ok(first, 'nunca alcanzó el régimen estacionario');
  // Al declararse estacionaria, todas las salidas tienen descargas y se parecen a lo teórico
  first.st.fractions.forEach((f, k) => {
    assert.ok(Math.abs(f - sim.model.theory[k]) <= 0.10, `salida ${k}: ${(f * 100).toFixed(0)} % vs teórico ${(sim.model.theory[k] * 100).toFixed(0)} %`);
  });
});
check('Cambiar un parámetro reinicia la medición y el estado estacionario', () => {
  const sim = new S.Simulation({ rng: mulberry32(22) });
  for (let i = 0; i < 100 * 30; i++) sim.step(1 / 30);
  assert.ok(sim.stats().steady);
  sim.setParams({ Q_Lmin: 2.0 });
  const st = sim.stats();
  assert.ok(!st.steady && st.n === 0);
});

console.log('\nSólido escaneado (alimentación personalizada)');
// Muestra "escaneada" con tamaños fuera del rango estándar y esfericidad < 1
const scanRng = mulberry32(321);
const scanned = Array.from({ length: 60 }, () => 30 + scanRng() * 140);
const PSI = 0.81;
check('Cada partícula se mueve con la v_t de SU diámetro escaneado', () => {
  const sim = new S.Simulation({ rng: mulberry32(11) });
  sim.setCustomFeed(scanned, PSI);
  sim.resetPulse();
  const allowed = new Set(scanned.map(d => (d * Math.sqrt(PSI)).toFixed(6)));
  for (let i = 0; i < 3600; i++) {
    sim.step(1 / 60);
    if (i % 30) continue;
    for (const p of sim.particles) {
      const vt = S.terminalVelocity(p.d * 1e-6, sim.state);
      assert.ok(Math.abs(p.vt - vt) <= 1e-9 + 1e-6 * Math.abs(vt), `v_t no corresponde al diámetro (${p.d.toFixed(1)} µm)`);
      assert.ok(allowed.has(p.d.toFixed(6)), `diámetro ${p.d} no pertenece a la muestra escaneada`);
      assert.ok(violation(sim, p) <= TOL, 'partícula fuera del equipo: ' + p.stage);
    }
  }
});
check('Con sólido escaneado, lo medido coincide con lo teórico (±8 puntos)', () => {
  const sim = new S.Simulation({ rng: mulberry32(12) });
  sim.setCustomFeed(scanned, PSI);
  sim.setParams({ Q_Lmin: 1.2, D2_cm: 10 });
  sim.resetPulse();
  for (let i = 0; i < 150 * 30; i++) sim.step(1 / 30);
  const st = sim.stats(), th = sim.model.theory;
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(st.fractions[k] - th[k]) <= 0.08,
      `salida ${k}: medido ${(st.fractions[k] * 100).toFixed(0)} % vs teórico ${(th[k] * 100).toFixed(0)} %`);
  }
  assert.ok(st.efficiency >= 0.95, 'eficiencia ' + st.efficiency);
});
check('Restaurar alimentación estándar vuelve a 15–145 µm', () => {
  const sim = new S.Simulation({ rng: mulberry32(13) });
  sim.setCustomFeed([300, 310, 320], 1);
  sim.clearCustomFeed();
  for (let i = 0; i < 600; i++) sim.step(1 / 30);
  for (const p of sim.particles) {
    assert.ok(p.d >= S.D_MIN_UM && p.d <= S.D_MAX_UM, 'diámetro ' + p.d);
    assert.ok(Math.abs(p.vt - S.terminalVelocity(p.d * 1e-6, sim.state)) < 1e-12);
  }
});

console.log('\nReceta del escáner');
function recipeConsistent(r, base) {
  // Lo que muestra la receta debe ser exactamente lo que hará el simulador
  const m = S.computeModel(Object.assign({}, S.DEFAULT_STATE, base, {
    Q_Lmin: r.Q_Lmin, D1_cm: r.D1_cm, D2_cm: r.D2_cm, reCorrection: r.reCorrection, rho_p: base.rho_p }));
  for (let c = 0; c < 2; c++) {
    assert.ok(Math.abs(m.vf[c] - r.vf[c]) < 1e-12, 'v_f de la receta ≠ simulador');
    assert.ok(Math.abs(m.dpc_um[c] - r.dpc_um[c]) < 1e-9, 'd_pc de la receta ≠ simulador');
  }
  assert.ok(r.Q_Lmin >= 0.1 && r.Q_Lmin <= 10 && r.D1_cm >= 4 && r.D1_cm <= 9 && r.D2_cm >= 8 && r.D2_cm <= 18, 'fuera de rango');
}
check('Cuarzo: cortes logrados ≈ objetivo, sin avisos', () => {
  const base = Object.assign({}, S.DEFAULT_STATE, { rho_p: 2650 });
  const r = S.designRecipe({ dUpper_um: 102, dLower_um: 64, sphericity: 1, rho_p: 2650 }, base);
  recipeConsistent(r, base);
  assert.strictEqual(r.warnings.length, 0);
  assert.ok(Math.abs(r.dpc_um[0] - 102) < 1.5 && Math.abs(r.dpc_um[1] - 64) < 1.5, r.dpc_um.join(' / '));
});
check('Galena (Re_p > 1): usa Schiller–Naumann y logra los cortes', () => {
  const base = Object.assign({}, S.DEFAULT_STATE, { rho_p: 7500 });
  const r = S.designRecipe({ dUpper_um: 91, dLower_um: 50, sphericity: 1, rho_p: 7500 }, base);
  recipeConsistent(r, base);
  assert.ok(r.reCorrection, 'debería activar la corrección');
  assert.ok(Math.abs(r.dpc_um[0] - 91) < 1.5 && Math.abs(r.dpc_um[1] - 50) < 1.5, r.dpc_um.join(' / '));
});
check('Caudal fuera de rango: ajusta D1, avisa y sigue logrando el corte', () => {
  const base = Object.assign({}, S.DEFAULT_STATE, { rho_p: 7500 });
  const r = S.designRecipe({ dUpper_um: 300, dLower_um: 60, sphericity: 1, rho_p: 7500 }, base);
  recipeConsistent(r, base);
  assert.ok(r.warnings.length > 0, 'debe avisar');
  assert.ok(r.D1_cm < 5.95, 'debería reducir D1');
  assert.ok(Math.abs(r.dpc_um[0] - 300) < 2.5, r.dpc_um[0]);
});
check('Objetivo imposible: avisa y la receta sigue siendo coherente', () => {
  const base = Object.assign({}, S.DEFAULT_STATE, { rho_p: 2650 });
  const r = S.designRecipe({ dUpper_um: 15, dLower_um: 8, sphericity: 1, rho_p: 2650 }, base);
  recipeConsistent(r, base);
  assert.ok(r.warnings.length > 0);
});
check('Sólido más ligero que el agua: la receta indica flotación', () => {
  const r = S.designRecipe({ dUpper_um: 100, dLower_um: 50, rho_p: 500 }, S.DEFAULT_STATE);
  assert.ok(r.floats);
});

console.log('\nConfiguración compartida entre vista 3D y modo AR (URL)');
check('Ida y vuelta conserva parámetros, efectos y sólido escaneado', () => {
  const st = Object.assign({}, S.DEFAULT_STATE, { Q_Lmin: 2.35, rho_p: 4500, mu_mPas: 1.4, D1_cm: 6.1, D2_cm: 13.2, parabolic: true, reCorrection: true });
  const feed = { active: true, diameters_um: [40.12, 55.5, 80, 120.4, 150], sphericity: 0.83 };
  const out = S.decodeConfig('?' + S.encodeConfig(st, feed));
  for (const k of ['Q_Lmin', 'rho_p', 'mu_mPas', 'D1_cm', 'D2_cm']) assert.strictEqual(out.state[k], st[k], k);
  assert.strictEqual(out.state.parabolic, true);
  assert.strictEqual(out.state.reCorrection, true);
  assert.ok(!out.state.dispersion);
  assert.deepStrictEqual(out.feed.diameters_um, [40.1, 55.5, 80, 120.4, 150]);
  assert.strictEqual(out.feed.sphericity, 0.83);
});
check('Valores inválidos o fuera de rango se descartan o se acotan', () => {
  const out = S.decodeConfig('?Q=99&rho=abc&mu=-3&D1=1&D2=50&feed=1_2&psi=7');
  assert.strictEqual(out.state.Q_Lmin, 10);
  assert.ok(!('rho_p' in out.state));
  assert.strictEqual(out.state.mu_mPas, 0.5);
  assert.strictEqual(out.state.D1_cm, 4);
  assert.strictEqual(out.state.D2_cm, 18);
  assert.strictEqual(out.feed, null);        // menos de 3 diámetros
});
check('Muestras escaneadas grandes se limitan para que la URL no crezca sin control', () => {
  const big = { active: true, diameters_um: Array.from({ length: 2500 }, (_, i) => 20 + (i % 130)), sphericity: 1 };
  const qs = S.encodeConfig(S.DEFAULT_STATE, big);
  const out = S.decodeConfig(qs);
  assert.ok(out.feed.diameters_um.length <= 400 && out.feed.diameters_um.length >= 300);
  assert.ok(qs.length < 4000, 'URL de ' + qs.length + ' caracteres');
});

// ---------------- Materiales ----------------
check('Los materiales nuevos tienen densidad dentro del rango y ids únicos', () => {
  assert.strictEqual(S.MATERIALS.length, 14);
  const ids = new Set(S.MATERIALS.map(m => m.id));
  assert.strictEqual(ids.size, S.MATERIALS.length);
  for (const m of S.MATERIALS) {
    assert.ok(m.rho >= S.RHO_MIN && m.rho <= S.RHO_MAX, `${m.name}: ${m.rho}`);
    assert.ok(m.fluid && m.use && m.range && S.MATERIAL_GROUPS[m.group], m.name);
  }
});
check('Oro (19300 kg/m³): el rango lo admite y el corte se calcula', () => {
  const sim = new S.Simulation({ rng: mulberry32(7) });
  sim.setParams({ rho_p: 19300 });
  assert.strictEqual(sim.state.rho_p, 19300);
  assert.ok(sim.model.dpc_um[0] > 10 && sim.model.dpc_um[0] < 60, 'dpc1 = ' + sim.model.dpc_um[0]);
});
check('La densidad se acota al rango ampliado (400–19500)', () => {
  const sim = new S.Simulation({ rng: mulberry32(7) });
  sim.setParams({ rho_p: 50000 }); assert.strictEqual(sim.state.rho_p, 19500);
  sim.setParams({ rho_p: 10 }); assert.strictEqual(sim.state.rho_p, 400);
});

check('Aire: corte ≈100 µm para cuarzo, caudal y μ acotados a los límites del aire', () => {
  const sim = new S.Simulation({ rng: mulberry32(7) });
  sim.setParams(S.fluidPatch('air'));
  assert.strictEqual(sim.state.fluid, 'air');
  assert.ok(sim.model.dpc_um[0] > 80 && sim.model.dpc_um[0] < 130, 'dpc1 = ' + sim.model.dpc_um[0]);
  sim.setParams({ Q_Lmin: 5000 }); assert.strictEqual(sim.state.Q_Lmin, 400);
  sim.setParams({ mu_mPas: 1 }); assert.strictEqual(sim.state.mu_mPas, 0.025);
  sim.setParams(S.fluidPatch('water')); assert.strictEqual(sim.state.Q_Lmin, 1.5);
});
check('El fluido viaja por la URL (fl=air) y el agua no lo añade', () => {
  const air = S.decodeConfig(S.encodeConfig(Object.assign({}, S.DEFAULT_STATE, S.fluidPatch('air')), null)).state;
  assert.strictEqual(air.fluid, 'air'); assert.strictEqual(air.Q_Lmin, 100); assert.strictEqual(air.rho_f, 1.2);
  assert.ok(!/fl=/.test(S.encodeConfig(S.DEFAULT_STATE, null)));
});
check('Un material más ligero que el aire no existe; el cuarzo en aire no flota, la cal sí en agua', () => {
  const sim = new S.Simulation({ rng: mulberry32(7) });
  sim.setParams({ rho_p: 641 }); assert.ok(sim.state.rho_p < sim.state.rho_f);
  sim.setParams(S.fluidPatch('air')); assert.ok(sim.state.rho_p > sim.state.rho_f);
});

check('Agua: caudal acotado a 0.1–10 L/min', () => {
  const sim = new S.Simulation({ rng: mulberry32(7) });
  sim.setParams({ Q_Lmin: 0.01 }); assert.strictEqual(sim.state.Q_Lmin, 0.1);
  sim.setParams({ Q_Lmin: 50 }); assert.strictEqual(sim.state.Q_Lmin, 10);
  assert.ok(Number.isFinite(sim.model.dpc_um[0]) && sim.model.dpc_um[0] > 0);
});

check('Alimentación: todo empieza en la tolva, nada entra hasta soltar y luego entra de forma continua', () => {
  const sim = new S.Simulation({ rng: mulberry32(7) });
  sim.loadHopper();
  assert.ok(sim.particles.every(p => p.stage === 'hopper'));
  for (let i = 0; i < 600; i++) sim.step(0.05);              // 30 s sin soltar
  assert.ok(sim.particles.every(p => p.stage === 'hopper'), 'no debe entrar nada retenido');
  sim.release(20);
  for (let i = 0; i < 100; i++) sim.step(0.05);              // 5 s
  const dentro5 = sim.particles.filter(p => p.stage !== 'hopper').length;
  for (let i = 0; i < 300; i++) sim.step(0.05);              // 15 s más
  const dentro20 = sim.particles.filter(p => p.stage !== 'hopper').length;
  assert.ok(dentro5 > 0 && dentro20 > dentro5, `${dentro5} → ${dentro20}`);
});

check('Los eventos guardan el diámetro (para la curva de Tromp) y la matriz se degrada con efectos no ideales', () => {
  const run = opts => {
    const sim = new S.Simulation({ count: 300, rng: mulberry32(11) });
    sim.setParams(opts); sim.loadHopper(); sim.release(10);
    for (let i = 0; i < 12000; i++) sim.step(0.05);
    return sim.events;
  };
  const ideal = run({});
  assert.ok(ideal.length > 100 && ideal.every(e => Number.isFinite(e.d)));
  assert.ok(ideal.every(e => e.cls === e.outlet), 'modelo ideal: 100 % por construcción');
  const real = run({ parabolic: true });
  assert.ok(real.some(e => e.cls !== e.outlet), 'con perfil parabólico debe haber errores de clasificación');
});

check('Calculadora: coincide con el motor del simulador (cortes, v_f, Re) y las fracciones suman 100 %', () => {
  const base = Object.assign({}, S.DEFAULT_STATE, { Q_Lmin: 1.5 });
  const m = new S.Simulation({ rng: mulberry32(7) }); m.setParams(base);
  const r = S.solveProblem({ rho_f: base.rho_f, mu_mPas: base.mu_mPas, rho_p: base.rho_p, psi: 1, D1_cm: base.D1_cm, D2_cm: base.D2_cm,
    Q_Lmin: 1.5, reCorrection: false, sizes_um: [30, 60, 120], psd: [{ lo: 15, hi: 50, pct: 30 }, { lo: 50, hi: 100, pct: 40 }, { lo: 100, hi: 145, pct: 30 }], feed_kgh: 10 });
  for (let c = 0; c < 2; c++) {
    assert.ok(Math.abs(r.dpc_eq_um[c] - m.model.dpc_um[c]) < 1e-6);
    assert.ok(Math.abs(r.vf_mms[c] / 1000 - m.model.vf[c]) < 1e-12);
  }
  assert.deepStrictEqual(r.sizes.map(x => x.outlet), [2, 1, 0]);
  assert.ok(Math.abs(r.fractions.reduce((a, b) => a + b, 0) - 100) < 1e-9);
  assert.ok(Math.abs(r.mdot_kgh.reduce((a, b) => a + b, 0) - 10) < 1e-9);
});
check('Calculadora: el modo diseño devuelve Q y D2 que reproducen los cortes pedidos (con esfericidad y con aire)', () => {
  for (const [rf, mu, rp, psi] of [[998.2, 1.002, 2650, 0.8], [1.204, 0.0181, 2650, 1]]) {
    const d = S.solveProblem({ rho_f: rf, mu_mPas: mu, rho_p: rp, psi, D1_cm: 5.95, D2_cm: 11.9, mode: 'design', dpc1_um: 100, dpc2_um: 50, fix: 'D1' });
    const back = S.solveProblem({ rho_f: rf, mu_mPas: mu, rho_p: rp, psi, D1_cm: d.design.D1_req_cm, D2_cm: d.design.D2_req_cm, Q_Lmin: d.design.Q_req_Lmin, reCorrection: d.reCorrection });
    assert.ok(Math.abs(back.dpc_real_um[0] - 100) < 0.01 && Math.abs(back.dpc_real_um[1] - 50) < 0.01, JSON.stringify(back.dpc_real_um));
  }
});
check('Calculadora: propiedades del agua y del aire a temperatura', () => {
  const w = S.fluidProps('water', 20), a = S.fluidProps('air', 20);
  assert.ok(Math.abs(w.rho_f - 998.2) < 0.1 && Math.abs(w.mu_mPas - 1.002) < 0.001);
  assert.ok(Math.abs(a.rho_f - 1.204) < 0.01 && Math.abs(a.mu_mPas - 0.0181) < 0.0003);
});

check('Esfericidad ψ editable en el simulador: reescala los tamaños (d_eq = d·√ψ), se acota y viaja por la URL', () => {
  const sim = new S.Simulation({ count: 200, rng: mulberry32(5) });
  const mean = () => sim.particles.reduce((a, p) => a + p.d, 0) / sim.particles.length;
  const m1 = mean();
  sim.setParams({ psi: 0.64 });
  assert.ok(Math.abs(mean() / m1 - 0.8) < 1e-9, 'los tamaños deben escalar con √ψ');
  sim.setParams({ psi: 5 }); assert.strictEqual(sim.state.psi, 1);
  sim.setParams({ psi: 0.1 }); assert.strictEqual(sim.state.psi, 0.4);
  const q = S.encodeConfig(Object.assign({}, S.DEFAULT_STATE, { psi: 0.7 }), null);
  assert.strictEqual(S.decodeConfig(q).state.psi, 0.7);
  assert.ok(!/psi=/.test(S.encodeConfig(S.DEFAULT_STATE, null)));
  sim.setCustomFeed([50, 80, 120], 0.85); assert.strictEqual(sim.state.psi, 0.85);
  sim.setParams({ psi: 0.6 }); assert.strictEqual(sim.customFeed.sphericity, 0.6);
});

console.log(failures ? `\n${failures} prueba(s) fallaron\n` : '\nTodas las pruebas pasaron\n');
process.exit(failures ? 1 : 0);
