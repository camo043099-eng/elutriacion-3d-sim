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
  ['Corrección Schiller–Naumann a 4 L/min', { Q_Lmin: 4, reCorrection: true, dispersion: true }, 1 / 60]
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

console.log(failures ? `\n${failures} prueba(s) fallaron\n` : '\nTodas las pruebas pasaron\n');
process.exit(failures ? 1 : 0);
