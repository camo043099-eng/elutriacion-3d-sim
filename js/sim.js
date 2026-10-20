/* =============================================================================
 * Motor físico del elutriador hidráulico en serie (sin dependencias)
 * -----------------------------------------------------------------------------
 * Este archivo NO usa Three.js: contiene la física (Stokes / Schiller–Naumann),
 * el régimen de flotación para sólidos ligeros (ρ_p ≤ ρ_f, desde 500 kg/m³),
 * la integración con granulometría óptica escaneada por cámara (DIA 2D),
 * la geometría del equipo y el movimiento de las partículas. index.html solo
 * dibuja lo que aquí se calcula. Así la física se puede probar en Node
 * (ver tests/contencion.test.js) y se garantiza que ninguna partícula atraviesa
 * las paredes de columnas, conos, tubos, tolva, colectores o tanque.
 * ========================================================================== */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. DISPOSICIÓN DEL EQUIPO (unidades de la escena 3D)
  // ---------------------------------------------------------------------------
  const LAYOUT = {
    COL_X: [-5.0, 3.2],        // eje de la columna 1 y de la columna 2
    TANK_X: 10.2,              // eje del tanque de finos
    CM_TO_UNITS: 0.40,         // radio visual = (D/2 en cm) · 0.40
    COL_TOP: 6.0,              // fin de la zona cilíndrica (arriba)
    COL_BOTTOM: -3.0,          // fin de la zona cilíndrica (abajo)
    REDUCER_TOP: 6.7,          // reductor cónico superior → tubo de rebose
    CONE_BOTTOM: -5.2,         // salida del cono inferior (spigot)
    CONE_OUTLET_R: [0.35, 0.40],
    POT_TOP: -5.2,             // colector de descarga bajo cada cono
    POT_BOTTOM: -6.5,
    POT_FLOOR: -6.38,          // cara superior de la base metálica
    POT_R: 0.65,
    TANK_R: 1.6,
    TANK_TOP: 1.75,
    TANK_BOTTOM: -2.75,
    TANK_FLOOR: -2.62,
    PIPE_R: 0.26,              // radio interno de todas las tuberías
    PIPE_Y: 7.4,               // cota de los tramos horizontales superiores
    INLET_Y: -2.5,             // cota de entrada de agua a cada columna
    DEAD_ZONE_Y: -2.75,        // por debajo de la entrada el agua está quieta
    FEED_Y: 1.0,               // cota de la alimentación de pulpa (columna 1)
    HOPPER_BOTTOM: 2.2,        // tolva de alimentación
    HOPPER_TOP: 3.1,
    HOPPER_R: 0.75,
    OVERFLOW_END_Y: 1.4,       // descarga del rebose dentro del tanque
    CORNER_R: 0.3,             // radio de curvatura de los codos
    WALL_GAP: 0.03             // holgura mínima partícula–pared
  };

  const VEL_SCALE = 260;        // m/s reales → unidades 3D/s (escala visual)
  const MAX_VISUAL_SPEED = 12;  // límite visual para evitar saltos enormes
  const PIPE_SPEED = 5.0;       // velocidad de arrastre dentro de tuberías
  const D_MIN_UM = 15, D_MAX_UM = 145;
  const RHO_MIN = 400, RHO_MAX = 19500;

  /**
   * Materiales adicionales para elutriación. `rho` es el valor representativo que se aplica al
   * seleccionarlo (punto medio cuando la fuente da un rango). `fluid` es la fase típica.
   */
  const MATERIAL_GROUPS = {
    ind: 'Industriales y minerales',
    grain: 'Granos y derivados (solo harinas, fibras y salvado)',
    other: 'Otros materiales documentados'
  };
  const MATERIALS = [
    { id: 'cuarzo-vidrio', group: 'ind', name: 'Cuarzo / Vidrio', rho: 2675, range: '2500–2850', fluid: 'Agua / Aire', use: 'Separar micropartículas de tierras raras del polvo de cuarzo' },
    { id: 'arena', group: 'ind', name: 'Arena', rho: 1630, range: '1560–1707 (aparente)', fluid: 'Agua / Aire', use: 'Clasificación por tamaño de partícula' },
    { id: 'pet', group: 'ind', name: 'PET (escamas)', rho: 1360, range: '1360 (real)', fluid: 'Agua', use: 'Separación por densidad de plásticos triturados' },
    { id: 'nylon66', group: 'ind', name: 'Nylon 6/6 (polvo)', rho: 1220, range: '1140–1300', fluid: 'Agua / Aire', use: 'Clasificación de polvos finos' },
    { id: 'cemento', group: 'ind', name: 'Cemento (polvo)', rho: 1320, range: '1200–1440 (aparente)', fluid: 'Aire', use: 'Clasificación de fracciones finas' },
    { id: 'cal', group: 'ind', name: 'Cal hidratada', rho: 641, range: '641 (aparente)', fluid: 'Aire', use: 'Separación de partículas finas' },
    { id: 'yeso', group: 'ind', name: 'Yeso', rho: 1275, range: '1250–1301 (aparente)', fluid: 'Aire', use: 'Clasificación por tamaño' },
    { id: 'maiz-ddgs', group: 'grain', name: 'Maíz (DDGS, fibra)', rho: 450, range: '~400–500 (aparente, estimado)', fluid: 'Aire', use: 'Separar fibra de fracciones más pesadas' },
    { id: 'harinas', group: 'grain', name: 'Harinas de trigo/arroz', rho: 600, range: '~500–700 (aparente)', fluid: 'Aire', use: 'Clasificación de partículas finas' },
    { id: 'mijo', group: 'grain', name: 'Mijo (harina)', rho: 640, range: '~640 (aparente)', fluid: 'Aire', use: 'Clasificación por tamaño' },
    { id: 'oro', group: 'other', name: 'Oro', rho: 19300, range: '19300', fluid: 'Agua', use: 'Separar partículas densas de ganga' },
    { id: 'diamante', group: 'other', name: 'Diamante', rho: 3510, range: '3510', fluid: 'Agua', use: 'Concentración gravimétrica' },
    { id: 'bentonita', group: 'other', name: 'Bentonita (arcilla)', rho: 850, range: '600–1100 (aparente)', fluid: 'Agua', use: 'Purificación de fracción fina' },
    { id: 'monacita', group: 'other', name: 'Monacita / Xenotima', rho: 5400, range: '4900–5900', fluid: 'Agua', use: 'Separación de tierras raras' }
  ];


  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /**
   * Radio visual de la esfera que representa una partícula de d µm.
   * Se acota al rango visual seguro para garantizar que incluso partículas
   * extremas provenientes de la cámara entren siempre por las tuberías.
   */
  function particleRadius(d_um) {
    const dSafe = clamp(d_um, D_MIN_UM, D_MAX_UM);
    return 0.045 + (dSafe / 150) * 0.115;
  }

  // ---------------------------------------------------------------------------
  // 2. TRAYECTORIAS DE TUBERÍA (polilínea densa con codos redondeados)
  //    La MISMA curva se usa para dibujar el tubo y para mover las partículas,
  //    por eso una partícula en un tubo nunca puede quedar fuera de él.
  // ---------------------------------------------------------------------------
  function makePath(points, cornerR) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const len = a => Math.hypot(a[0], a[1], a[2]);
    const pts = [];
    const push = p => {
      const last = pts[pts.length - 1];
      if (!last || len(sub(p, last)) > 1e-6) pts.push(p);
    };

    push(points[0]);
    for (let i = 1; i < points.length - 1; i++) {
      const A = points[i - 1], P = points[i], B = points[i + 1];
      const vin = sub(P, A), vout = sub(B, P);
      const lin = len(vin), lout = len(vout);
      const rc = Math.min(cornerR, 0.45 * lin, 0.45 * lout);
      const a = [P[0] - vin[0] / lin * rc, P[1] - vin[1] / lin * rc, P[2] - vin[2] / lin * rc];
      const b = [P[0] + vout[0] / lout * rc, P[1] + vout[1] / lout * rc, P[2] + vout[2] / lout * rc];
      push(a);
      for (let k = 1; k <= 12; k++) {          // Bézier cuadrática a → P → b
        const t = k / 12, u = 1 - t;
        push([
          u * u * a[0] + 2 * u * t * P[0] + t * t * b[0],
          u * u * a[1] + 2 * u * t * P[1] + t * t * b[1],
          u * u * a[2] + 2 * u * t * P[2] + t * t * b[2]
        ]);
      }
    }
    push(points[points.length - 1]);

    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
    const length = cum[cum.length - 1];

    function segmentAt(s) {
      s = clamp(s, 0, length);
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= s) lo = mid; else hi = mid;
      }
      return { i: lo, t: (s - cum[lo]) / Math.max(1e-9, cum[lo + 1] - cum[lo]) };
    }

    return {
      points: pts,
      length,
      /** Punto del eje del tubo a la distancia s desde su inicio. */
      pointAt(s) {
        const { i, t } = segmentAt(s);
        const a = pts[i], b = pts[i + 1];
        return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      },
      /** Tangente unitaria del eje del tubo en s. */
      tangentAt(s) {
        const { i } = segmentAt(s);
        const d = sub(pts[i + 1], pts[i]);
        const l = len(d) || 1;
        return [d[0] / l, d[1] / l, d[2] / l];
      }
    };
  }

  /** Posición de una partícula desplazada (oa, ob) del eje del tubo. */
  function pipePosition(path, s, oa, ob) {
    const c = path.pointAt(s);
    const t = path.tangentAt(s);
    // Los tubos están en el plano z = 0 → normal en el plano y binormal = +z
    let nx = -t[1], ny = t[0];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    return [c[0] + nx * oa, c[1] + ny * oa, c[2] + ob];
  }

  // ---------------------------------------------------------------------------
  // 3. GEOMETRÍA DEPENDIENTE DE D1 y D2
  // ---------------------------------------------------------------------------
  function buildGeometry(state) {
    const L = LAYOUT;
    const R = [state.D1_cm / 2 * L.CM_TO_UNITS, state.D2_cm / 2 * L.CM_TO_UNITS];
    const cx = L.COL_X;
    const dcX = cx[1] - R[1] - 0.7;           // bajante exterior hacia la columna 2
    const feedX = cx[0] - R[0] - 1.4;          // tolva de alimentación

    const feed = makePath([
      [feedX, L.HOPPER_BOTTOM, 0],
      [feedX, L.FEED_Y, 0],
      [cx[0] - 0.35 * R[0], L.FEED_Y, 0]
    ], L.CORNER_R);

    const link = makePath([
      [cx[0], L.REDUCER_TOP, 0],
      [cx[0], L.PIPE_Y, 0],
      [dcX, L.PIPE_Y, 0],
      [dcX, L.INLET_Y, 0],
      [cx[1] - 0.4 * R[1], L.INLET_Y, 0]
    ], L.CORNER_R);

    const overflow = makePath([
      [cx[1], L.REDUCER_TOP, 0],
      [cx[1], L.PIPE_Y, 0],
      [L.TANK_X, L.PIPE_Y, 0],
      [L.TANK_X, L.OVERFLOW_END_Y, 0]
    ], L.CORNER_R);

    return { R, cx, dcX, feedX, paths: { feed, link, overflow } };
  }

  /** Radio interno de la columna c a la altura y (reductor, cilindro o cono). */
  function columnRadiusAt(geo, c, y) {
    const L = LAYOUT, R = geo.R[c];
    if (y > L.REDUCER_TOP) return L.PIPE_R;
    if (y >= L.COL_TOP) return lerp(R, L.PIPE_R, (y - L.COL_TOP) / (L.REDUCER_TOP - L.COL_TOP));
    if (y >= L.COL_BOTTOM) return R;
    if (y >= L.CONE_BOTTOM) {
      return lerp(L.CONE_OUTLET_R[c], R, (y - L.CONE_BOTTOM) / (L.COL_BOTTOM - L.CONE_BOTTOM));
    }
    return L.CONE_OUTLET_R[c];
  }

  /** Radio interno de la tolva a la altura y. */
  function hopperRadiusAt(y) {
    const L = LAYOUT;
    return lerp(L.PIPE_R, L.HOPPER_R, clamp((y - L.HOPPER_BOTTOM) / (L.HOPPER_TOP - L.HOPPER_BOTTOM), 0, 1));
  }

  /**
   * Máxima distancia al eje a la que puede estar el CENTRO de una esfera de
   * radio rad (a la altura y) sin que ninguna parte de ella toque la pared de
   * un recipiente de revolución cuyo radio interno es radiusFn(y').
   */
  function maxRadialOffset(radiusFn, y, rad, gap) {
    const rr = rad + gap;
    const SAMPLES = 16;
    let best = Infinity;
    for (let k = 0; k <= SAMPLES; k++) {
      const dy = -rr + (2 * rr * k) / SAMPLES;
      const rho = Math.sqrt(Math.max(0, rr * rr - dy * dy));
      best = Math.min(best, radiusFn(y + dy) - rho);
    }
    return Math.max(0, best);
  }

  function columnMaxOffset(geo, c, y, rad) {
    return maxRadialOffset(yy => columnRadiusAt(geo, c, yy), y, rad, LAYOUT.WALL_GAP);
  }

  function hopperMaxOffset(y, rad) {
    return maxRadialOffset(hopperRadiusAt, y, rad, LAYOUT.WALL_GAP);
  }

  // ---------------------------------------------------------------------------
  // 4. MODELO HIDRODINÁMICO (Soporta ρ_p desde 500 kg/m³ hasta 7500 kg/m³)
  // ---------------------------------------------------------------------------
  /**
   * Velocidad terminal vertical de la partícula respecto al fluido (m/s).
   * - Positiva (v_t > 0): la partícula es más densa que el fluido y sedimenta hacia abajo.
   * - Cero o negativa (v_t ≤ 0): la partícula es menos densa que el fluido (ej. 500–1000 kg/m³)
   *   y experimenta empuje de flotación ascendente.
   */
  function terminalVelocity(d_m, s) {
    const mu = s.mu_mPas * 1e-3;
    const rawDRho = s.rho_p - s.rho_f;
    if (Math.abs(rawDRho) < 1e-6) return 0;

    const sign = rawDRho > 0 ? 1 : -1;
    const absDRho = Math.max(10, Math.abs(rawDRho));
    const psiFactor = (s.sphericity !== undefined && s.sphericity > 0) ? s.sphericity : 1.0;

    const vStokes = ((s.g * d_m * d_m * absDRho) / (18 * mu)) * psiFactor;
    if (!s.reCorrection) return sign * vStokes;

    // Correlación de Schiller–Naumann: C_D = (24/Re)·(1 + 0.15·Re^0.687)
    let v = vStokes;
    for (let i = 0; i < 80; i++) {
      const Re = (s.rho_f * v * d_m) / mu;
      const vNew = vStokes / (1 + 0.15 * Math.pow(Math.max(1e-12, Re), 0.687));
      if (Math.abs(vNew - v) < 1e-12) { v = vNew; break; }
      v = 0.5 * (v + vNew);
    }
    return sign * v;
  }

  /**
   * Diámetro de corte (m): tamaño cuya magnitud de velocidad terminal iguala a v_f.
   * Si ρ_p ≤ ρ_f, utiliza |Δρ| para ofrecer el diámetro equivalente de referencia en la UI.
   */
  function cutDiameter(vf, s) {
    const mu = s.mu_mPas * 1e-3;
    const absDRho = Math.max(10, Math.abs(s.rho_p - s.rho_f));
    const psiFactor = (s.sphericity !== undefined && s.sphericity > 0) ? s.sphericity : 1.0;

    if (!s.reCorrection) {
      return Math.sqrt((18 * mu * vf) / (s.g * absDRho * psiFactor));
    }
    let lo = 1e-7, hi = 5e-3;
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi);
      if (Math.abs(terminalVelocity(mid, s)) < vf) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  function computeModel(s, customFeed) {
    const Q = s.Q_Lmin / 1000 / 60;            // m³/s
    const mu = s.mu_mPas * 1e-3;
    const D = [s.D1_cm / 100, s.D2_cm / 100];
    const A = D.map(d => Math.PI * d * d / 4);
    const vf = A.map(a => Q / a);
    const dpc_m = vf.map(v => cutDiameter(v, s));
    const re = vf.map((v, i) => (s.rho_f * v * dpc_m[i]) / mu);
    const dpc_um = dpc_m.map(d => d * 1e6);

    // Si el sólido flota (ρ_p ≤ ρ_f), el 100% asciende al tanque de rebose
    if (s.rho_p <= s.rho_f) {
      return { Q, mu, D, A, vf, dpc_um, re, theory: [0, 0, 1] };
    }

    // Si hay una distribución empírica escaneada por cámara, calcular fracciones reales
    if (customFeed && customFeed.active && customFeed.diameters_um && customFeed.diameters_um.length > 0) {
      const arr = customFeed.diameters_um;
      const sqrtPsi = Math.sqrt(customFeed.sphericity || 1.0);
      let c0 = 0, c1 = 0, c2 = 0;
      for (let i = 0; i < arr.length; i++) {
        const dEff = arr[i] * sqrtPsi;
        if (dEff >= dpc_um[0]) c0++;
        else if (dEff >= dpc_um[1]) c1++;
        else c2++;
      }
      const tot = arr.length;
      return { Q, mu, D, A, vf, dpc_um, re, theory: [c0 / tot, c1 / tot, c2 / tot] };
    }

    // Fracciones teóricas estándar (distribución uniforme de tamaños 15–145 µm)
    const above = d => clamp((D_MAX_UM - d) / (D_MAX_UM - D_MIN_UM), 0, 1);
    const fCoarse = above(dpc_um[0]);
    const fMedium = Math.max(0, above(dpc_um[1]) - fCoarse);
    const fFine = Math.max(0, 1 - fCoarse - fMedium);

    return { Q, mu, D, A, vf, dpc_um, re, theory: [fCoarse, fMedium, fFine] };
  }

  // ---------------------------------------------------------------------------
  // 5. SIMULACIÓN DE PARTÍCULAS
  // ---------------------------------------------------------------------------
  const DEFAULT_STATE = {
    Q_Lmin: 1.50, rho_p: 2650, rho_f: 1000, mu_mPas: 1.00,
    D1_cm: 5.95, D2_cm: 11.90, g: 9.81,
    parabolic: false, reCorrection: false, dispersion: false,
    sphericity: 1.0
  };

  const OUTLET_NAMES = ['Colector 1', 'Colector 2', 'Tanque de rebose'];

  /** Criterio de régimen estacionario para la medición de eficiencia. */
  const STEADY = {
    MIN_EVENTS: 300,     // descargas mínimas en la ventana
    MIN_PER_CLASS: 15,   // descargas mínimas de cada clase esperada
    MAX_DRIFT: 0.08      // diferencia máx. de fracciones entre mitades de la ventana
  };

  function Simulation(options) {
    options = options || {};
    this.rng = options.rng || Math.random;
    this.N = options.count || 480;
    this.state = Object.assign({}, DEFAULT_STATE, options.state || {});
    this.customFeed = {
      active: false,
      diameters_um: [],
      sphericity: 1.0
    };
    this.events = [];
    this.time = 0;            // tiempo simulado (s)
    this.measureStart = 0;    // inicio de la medición actual
    this.steady = false;      // ¿se alcanzó el régimen estacionario?
    this.EVENT_WINDOW = options.eventWindow || 600;
    this.particles = [];
    this.tracers = [];
    this._refresh(true);
    this._initParticles();
    this._initTracers(options.tracers || 90);
  }

  Simulation.prototype._gauss = function () {
    const u = Math.max(1e-12, this.rng()), v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  /** Obtiene un diámetro de alimentación (de la muestra escaneada o uniforme). */
  Simulation.prototype._sampleDiameterUm = function () {
    if (this.customFeed && this.customFeed.active && this.customFeed.diameters_um.length > 0) {
      const arr = this.customFeed.diameters_um;
      const idx = Math.floor(this.rng() * arr.length) % arr.length;
      const sqrtPsi = Math.sqrt(this.customFeed.sphericity || 1.0);
      return arr[idx] * sqrtPsi;
    }
    return D_MIN_UM + this.rng() * (D_MAX_UM - D_MIN_UM);
  };

  Simulation.prototype._refresh = function (geometryChanged) {
    this.model = computeModel(this.state, this.customFeed);
    if (geometryChanged || !this.geo) this.geo = buildGeometry(this.state);
    for (const p of this.particles) {
      p.rad = particleRadius(p.d);
      p.vt = terminalVelocity(p.d * 1e-6, this.state);
      p.cls = this.classOf(p.d);
    }
  };

  /** Cambia parámetros de operación; devuelve true si cambió la geometría. */
  Simulation.prototype.setParams = function (partial) {
    if ('rho_p' in partial) {
      partial.rho_p = clamp(partial.rho_p, RHO_MIN, RHO_MAX);
    }
    const geomChanged = ('D1_cm' in partial && partial.D1_cm !== this.state.D1_cm) ||
                        ('D2_cm' in partial && partial.D2_cm !== this.state.D2_cm);
    Object.assign(this.state, partial);
    this._refresh(geomChanged);
    this._resetMeasurement();
    return geomChanged;
  };

  /**
   * Conecta directamente los datos escaneados con la cámara del móvil al motor físico.
   * @param {number[]} diameters_um Lista de diámetros equivalentes medidos (µm)
   * @param {number} [sphericity=1.0] Esfericidad media de Wadell (0.45 a 1.0)
   */
  Simulation.prototype.setCustomFeed = function (diameters_um, sphericity) {
    if (!Array.isArray(diameters_um) || diameters_um.length === 0) return;
    const psi = clamp(sphericity || 1.0, 0.4, 1.0);
    this.customFeed.active = true;
    this.customFeed.diameters_um = diameters_um.slice();
    this.customFeed.sphericity = psi;

    const sqrtPsi = Math.sqrt(psi);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const dEff = diameters_um[i % diameters_um.length] * sqrtPsi;
      p.d = dEff;
      p.rad = particleRadius(p.d);
    }
    this._refresh(false);
    this._resetMeasurement();
  };

  /** Desactiva la alimentación escaneada y restaura la distribución uniforme estándar. */
  Simulation.prototype.clearCustomFeed = function () {
    this.customFeed.active = false;
    this.customFeed.diameters_um = [];
    this.customFeed.sphericity = 1.0;
    for (const p of this.particles) {
      this._redraw(p);
    }
    this._refresh(false);
    this._resetMeasurement();
  };

  /** 0 = grueso (≥ d_pc1), 1 = medio (≥ d_pc2), 2 = fino (o sólido flotante si ρ_p ≤ ρ_f). */
  Simulation.prototype.classOf = function (d_um) {
    if (this.state.rho_p <= this.state.rho_f) return 2;
    if (d_um >= this.model.dpc_um[0]) return 0;
    if (d_um >= this.model.dpc_um[1]) return 1;
    return 2;
  };

  Simulation.prototype._newParticle = function () {
    const d = this._sampleDiameterUm();
    const p = {
      d, rad: particleRadius(d),
      vt: terminalVelocity(d * 1e-6, this.state),
      cls: this.classOf(d),
      stage: 'hopper', col: 0,
      x: 0, y: 0, z: 0,
      r: 0, ang: 0, rTFrac: 0,
      path: null, s: 0, oa: 0, ob: 0,
      hx: 0, hz: 0, delay: 0,
      tx: 0, ty: 0, tz: 0, wx: 0, wy: 0, wz: 0, phase: 1, dest: 0, hold: 0
    };
    return p;
  };

  Simulation.prototype._redraw = function (p) {
    p.d = this._sampleDiameterUm();
    p.rad = particleRadius(p.d);
    p.vt = terminalVelocity(p.d * 1e-6, this.state);
    p.cls = this.classOf(p.d);
  };

  Simulation.prototype._placeInColumn = function (p, c, yMin, yMax) {
    const R = this.geo.R[c];
    p.stage = 'col';
    p.col = c;
    p.y = lerp(yMin, yMax, this.rng());
    p.ang = this.rng() * Math.PI * 2;
    p.rTFrac = Math.sqrt(this.rng()) * 0.85;
    p.r = Math.min(p.rTFrac * R, columnMaxOffset(this.geo, c, p.y, p.rad));
    this._syncColumnXZ(p);
  };

  Simulation.prototype._syncColumnXZ = function (p) {
    p.x = this.geo.cx[p.col] + Math.cos(p.ang) * p.r;
    p.z = Math.sin(p.ang) * p.r;
  };

  Simulation.prototype._toHopper = function (p, maxDelay) {
    const L = LAYOUT;
    p.stage = 'hopper';
    p.y = L.HOPPER_BOTTOM + 0.3 + this.rng() * 0.5;
    const rMax = hopperMaxOffset(p.y, p.rad);
    const r = Math.sqrt(this.rng()) * rMax, a = this.rng() * Math.PI * 2;
    p.hx = Math.cos(a) * r;
    p.hz = Math.sin(a) * r;
    p.x = this.geo.feedX + p.hx;
    p.z = p.hz;
    p.delay = this.rng() * maxDelay;
  };

  Simulation.prototype._initParticles = function () {
    this.particles.length = 0;
    for (let i = 0; i < this.N; i++) {
      const p = this._newParticle();
      if (i < this.N * 0.6) this._placeInColumn(p, 0, -2.0, 5.5);
      else this._toHopper(p, 6);
      this.particles.push(p);
    }
  };

  /** Pulso: todas las partículas se inyectan juntas en la zona de alimentación. */
  Simulation.prototype.resetPulse = function () {
    for (const p of this.particles) {
      this._redraw(p);
      this._placeInColumn(p, 0, LAYOUT.FEED_Y - 0.6, LAYOUT.FEED_Y + 0.6);
    }
    this._resetMeasurement();
  };

  Simulation.prototype._initTracers = function (n) {
    this.tracers.length = 0;
    for (let i = 0; i < n; i++) {
      this.tracers.push({
        col: i < n / 2 ? 0 : 1,
        ang: this.rng() * Math.PI * 2,
        rFrac: Math.sqrt(this.rng()) * 0.85,
        y: lerp(LAYOUT.INLET_Y, LAYOUT.COL_TOP - 0.3, this.rng()),
        x: 0, z: 0
      });
    }
  };

  /** Velocidad ascendente local del agua (m/s) en la columna c, altura y, radio r. */
  Simulation.prototype.fluidVelocity = function (c, y, r) {
    const L = LAYOUT;
    if (y <= L.DEAD_ZONE_Y) return 0;            // bajo la entrada: agua en reposo
    const rl = columnRadiusAt(this.geo, c, y);
    const R = this.geo.R[c];
    let v = this.model.vf[c];
    if (y > L.COL_TOP) v *= (R * R) / (rl * rl); // reductor: continuidad Q = v·A
    if (this.state.parabolic) {                  // Poiseuille: v = 2·v̄·(1 − (r/R)²)
      const q = rl > 0 ? r / rl : 0;
      v *= 2 * (1 - Math.min(1, q * q));
    }
    return v;
  };

  Simulation.prototype._enterPipe = function (p, path, oa, ob) {
    const lim = Math.max(0, LAYOUT.PIPE_R - p.rad - 0.02);
    const m = Math.hypot(oa, ob);
    if (m > lim) { oa *= lim / m; ob *= lim / m; }
    p.stage = 'pipe';
    p.path = path;
    p.s = 0;
    p.oa = oa;
    p.ob = ob;
    const pos = pipePosition(this.geo.paths[path], 0, oa, ob);
    p.x = pos[0]; p.y = pos[1]; p.z = pos[2];
  };

  Simulation.prototype._startFall = function (p, dest) {
    const L = LAYOUT;
    p.stage = 'fall';
    p.dest = dest;
    // Fase 1: bajar en vertical hasta salir completamente de la boca del cono
    // (o del extremo del tubo de rebose). Fase 2: ir al punto de reposo.
    const exitY = dest === 2 ? L.OVERFLOW_END_Y : L.POT_TOP;
    p.wx = p.x;
    p.wz = p.z;
    p.wy = Math.min(p.y, exitY - p.rad - 0.05);
    p.phase = 1;
    const a = this.rng() * Math.PI * 2;
    if (dest === 2) {                            // tanque de finos
      const r = Math.sqrt(this.rng()) * (L.TANK_R - p.rad - 0.1);
      p.tx = L.TANK_X + Math.cos(a) * r;
      p.tz = Math.sin(a) * r;
      p.ty = L.TANK_FLOOR + p.rad + this.rng() * 0.35;
    } else {                                     // colector bajo el cono
      const r = Math.sqrt(this.rng()) * (L.POT_R - p.rad - 0.05);
      p.tx = L.COL_X[dest] + Math.cos(a) * r;
      p.tz = Math.sin(a) * r;
      p.ty = L.POT_FLOOR + p.rad + this.rng() * 0.25;
    }
  };

  Simulation.prototype._record = function (p) {
    this.events.push({ outlet: p.dest, cls: this.classOf(p.d), t: this.time });
    if (this.events.length > this.EVENT_WINDOW) this.events.shift();
  };

  /** Reinicia la medición (al cambiar parámetros, alimentación o pulso). */
  Simulation.prototype._resetMeasurement = function () {
    this.events.length = 0;
    this.measureStart = this.time || 0;
    this.steady = false;
  };

  /** Estadística de las últimas descargas: % por salida y % bien clasificado. */
  /**
   * Estadística de las últimas descargas.
   *
   * La eficiencia solo es representativa en RÉGIMEN ESTACIONARIO: al inicio
   * llegan primero los gruesos (sedimentan en segundos) y los finos tardan
   * mucho más en subir por las dos columnas. Por eso se informa el estado:
   *  - 'esperando':    aún no hay suficientes descargas;
   *  - 'transitorio':  faltan clases por llegar o las descargas siguen cambiando;
   *  - 'estacionario': llegaron todas las clases esperadas y las fracciones de
   *                    la primera y la segunda mitad de la ventana coinciden.
   * Una vez estacionario se mantiene hasta que se reinicie la medición.
   */
  Simulation.prototype.stats = function () {
    const ev = this.events, n = ev.length;
    const byOutlet = [0, 0, 0];
    const perClass = [0, 1, 2].map(() => ({ n: 0, correct: 0 }));
    let correct = 0;
    for (const e of ev) {
      byOutlet[e.outlet]++;
      perClass[e.cls].n++;
      if (e.outlet === e.cls) { correct++; perClass[e.cls].correct++; }
    }
    const fractions = byOutlet.map(c => (n ? c / n : 0));

    // Clases que deberían llegar según la alimentación (≥ 3 % teórico)
    const theory = this.model.theory;
    const expected = [0, 1, 2].filter(k => theory[k] >= 0.03);
    const missing = expected.filter(k => perClass[k].n < STEADY.MIN_PER_CLASS);

    let drift = Infinity;
    if (n >= STEADY.MIN_EVENTS) {
      const half = Math.floor(n / 2);
      const a = [0, 0, 0], b = [0, 0, 0];
      for (let i = 0; i < n; i++) (i < half ? a : b)[ev[i].outlet]++;
      drift = Math.max(...[0, 1, 2].map(k => Math.abs(a[k] / half - b[k] / (n - half))));
    }
    if (!this.steady && n >= STEADY.MIN_EVENTS && missing.length === 0 && drift <= STEADY.MAX_DRIFT) {
      this.steady = true;
    }

    const phase = this.steady ? 'estacionario' : (n < 60 ? 'esperando' : 'transitorio');
    return {
      n,
      fractions,
      efficiency: n ? correct / n : 0,
      recovery: perClass.map(c => (c.n ? c.correct / c.n : null)),
      perClass,
      phase,
      steady: this.steady,
      missing,                         // clases esperadas que aún no llegan
      drift: Number.isFinite(drift) ? drift : null,
      elapsed: this.time - this.measureStart
    };
  };

  Simulation.prototype.step = function (dt) {
    this.time += dt;
    const L = LAYOUT, s = this.state, geo = this.geo;

    for (const p of this.particles) {

      switch (p.stage) {
        // --------------------------------------------- Tolva de alimentación
        case 'hopper': {
          if (p.delay > 0) {
            p.delay -= dt;
          } else {
            // Desciende en línea recta hacia la boca de la tolva (sobre su eje)
            const dx = -p.hx, dy = L.HOPPER_BOTTOM - p.y, dz = -p.hz;
            const dist = Math.hypot(dx, dy, dz);
            const stepLen = 1.6 * dt;
            if (dist <= stepLen) {
              this._enterPipe(p, 'feed', 0, 0);
              break;
            }
            p.hx += dx / dist * stepLen;
            p.y += dy / dist * stepLen;
            p.hz += dz / dist * stepLen;
          }
          const hMax = hopperMaxOffset(p.y, p.rad);
          const hr = Math.hypot(p.hx, p.hz);
          if (hr > hMax && hr > 0) {
            p.hx *= hMax / hr;
            p.hz *= hMax / hr;
          }
          p.x = geo.feedX + p.hx;
          p.z = p.hz;
          break;
        }

        // --------------------------------------------- Dentro de una tubería
        case 'pipe': {
          const path = geo.paths[p.path];
          const lim = Math.max(0, L.PIPE_R - p.rad - 0.02);
          const m = Math.hypot(p.oa, p.ob);
          if (m > lim && m > 0) { p.oa *= lim / m; p.ob *= lim / m; }

          p.s += PIPE_SPEED * dt;
          if (p.s >= path.length) {
            const end = pipePosition(path, path.length, p.oa, p.ob);
            if (p.path === 'overflow') {
              p.x = end[0]; p.y = end[1]; p.z = end[2];
              this._startFall(p, 2);
            } else {
              // feed → columna 1, link → columna 2 (sale del tubo dentro de la columna)
              const c = p.path === 'feed' ? 0 : 1;
              p.stage = 'col';
              p.col = c;
              p.y = end[1];
              const dx = end[0] - geo.cx[c], dz = end[2];
              p.r = Math.min(Math.hypot(dx, dz), columnMaxOffset(geo, c, p.y, p.rad));
              p.ang = Math.atan2(dz, dx);
              p.rTFrac = Math.sqrt(this.rng()) * 0.85;
              this._syncColumnXZ(p);
            }
            break;
          }
          const pos = pipePosition(path, p.s, p.oa, p.ob);
          p.x = pos[0]; p.y = pos[1]; p.z = pos[2];
          break;
        }

        // --------------------------------------------- Dentro de una columna
        case 'col': {
          const c = p.col;
          const vf = this.fluidVelocity(c, p.y, p.r);
          // Si p.vt < 0 (flotación natural cuando ρ_p < ρ_f), (vf - p.vt) es positivo incluso en zona muerta
          let vy = clamp((vf - p.vt) * VEL_SCALE, -MAX_VISUAL_SPEED, MAX_VISUAL_SPEED);
          p.y += vy * dt;
          if (s.dispersion && p.y > L.DEAD_ZONE_Y) p.y += 0.35 * this._gauss() * Math.sqrt(dt);

          // Deriva radial suave hacia su trayectoria y leve giro
          p.ang += 0.15 * dt;
          p.r += (p.rTFrac * geo.R[c] - p.r) * Math.min(1, 1.5 * dt);

          if (p.y >= L.REDUCER_TOP) {
            // Sale por el reductor superior hacia el tubo de rebose
            p.y = L.REDUCER_TOP;
            p.r = Math.min(p.r, columnMaxOffset(geo, c, L.REDUCER_TOP, p.rad));
            const dx = Math.cos(p.ang) * p.r, dz = Math.sin(p.ang) * p.r;
            // Tangente inicial +y ⇒ normal (−1,0,0): oa = −dx, ob = dz
            this._enterPipe(p, c === 0 ? 'link' : 'overflow', -dx, dz);
            break;
          }
          if (p.y <= L.CONE_BOTTOM) {
            // Atraviesa la boca del cono y cae al colector
            p.y = L.CONE_BOTTOM;
            p.r = Math.min(p.r, columnMaxOffset(geo, c, L.CONE_BOTTOM, p.rad));
            this._syncColumnXZ(p);
            this._startFall(p, c);
            break;
          }
          // Pared: el radio permitido depende de la altura (cono, cilindro, reductor)
          const allowed = columnMaxOffset(geo, c, p.y, p.rad);
          if (p.r > allowed) p.r = allowed;
          this._syncColumnXZ(p);
          break;
        }

        // --------------------------------------------- Caída al colector/tanque
        case 'fall': {
          const gx = p.phase === 1 ? p.wx : p.tx;
          const gy = p.phase === 1 ? p.wy : p.ty;
          const gz = p.phase === 1 ? p.wz : p.tz;
          const dx = gx - p.x, dy = gy - p.y, dz = gz - p.z;
          const dist = Math.hypot(dx, dy, dz);
          const speed = clamp(Math.abs(p.vt) * VEL_SCALE, 1.4, 8);
          const stepLen = speed * dt;
          if (dist <= stepLen) {
            p.x = gx; p.y = gy; p.z = gz;
            if (p.phase === 1) {
              p.phase = 2;
            } else {
              p.stage = 'rest';
              p.hold = 3 + this.rng() * 2.5;
              this._record(p);
            }
          } else {
            p.x += dx / dist * stepLen;
            p.y += dy / dist * stepLen;
            p.z += dz / dist * stepLen;
          }
          break;
        }

        // --------------------------------------------- Reposo en el fondo
        case 'rest': {
          p.hold -= dt;
          if (p.hold <= 0) {
            // Alimentación fresca: muestrea de la distribución escaneada o uniforme
            this._redraw(p);
            this._toHopper(p, 2.5);
          }
          break;
        }
      }
    }

    // Trazadores del flujo ascendente (sólo en la zona activa de cada columna)
    for (const t of this.tracers) {
      const R = geo.R[t.col];
      const r = t.rFrac * R;
      t.y += this.fluidVelocity(t.col, t.y, r) * VEL_SCALE * dt;
      if (t.y > L.COL_TOP - 0.3) t.y = L.INLET_Y;
      t.x = geo.cx[t.col] + Math.cos(t.ang) * r;
      t.z = Math.sin(t.ang) * r;
    }
  };

  // ---------------------------------------------------------------------------
  // 6. RECETA DE ELUTRIACIÓN PARA UN SÓLIDO ESCANEADO
  // ---------------------------------------------------------------------------
  /** Rangos de operación permitidos por los controles del simulador. */
  const LIMITS = {
    Q_Lmin: [0.50, 4.00, 0.05],   // [mín, máx, paso]
    D1_cm: [4.00, 9.00, 0.05],
    D2_cm: [8.00, 18.00, 0.10],
    D1_DEFAULT: 5.95
  };

  const snap = (v, [lo, hi, step]) => Number(clamp(Math.round(v / step) * step, lo, hi).toFixed(2));
  const areaFromD = D_cm => Math.PI * Math.pow(D_cm / 100, 2) / 4;      // m²
  const dFromArea = A => Math.sqrt(4 * A / Math.PI) * 100;               // cm

  /**
   * Calcula Q, D1 y D2 para que los cortes de las columnas coincidan con los
   * diámetros objetivo (p. ej. P67 y P33 de la muestra escaneada), usando EXACTAMENTE
   * las mismas ecuaciones que el simulador (Stokes o Schiller–Naumann si Re_p > 1).
   * Si algún valor queda fuera del rango de los controles, se ajusta y se avisa.
   *
   * @param {{dUpper_um:number, dLower_um:number, sphericity?:number, rho_p:number}} sample
   * @param {object} base estado actual (μ, ρ_f, g)
   */
  function designRecipe(sample, base) {
    const psi = clamp(sample.sphericity || 1, 0.4, 1);
    const sq = Math.sqrt(psi);
    const st = Object.assign({}, DEFAULT_STATE, base, {
      rho_p: clamp(sample.rho_p, RHO_MIN, RHO_MAX), sphericity: 1, reCorrection: false
    });
    const target = [Math.max(1, sample.dUpper_um) * sq, Math.max(1, sample.dLower_um) * sq]; // d_eq (µm)
    const warnings = [];

    if (st.rho_p <= st.rho_f) {
      return { floats: true, target_um: target, warnings,
               Q_Lmin: base.Q_Lmin, D1_cm: base.D1_cm, D2_cm: base.D2_cm, reCorrection: false };
    }

    const mu = st.mu_mPas * 1e-3;
    // 1) Velocidades ascendentes que igualan v_t de los diámetros objetivo
    let vf = target.map(d => Math.abs(terminalVelocity(d * 1e-6, st)));
    const reStokes = (st.rho_f * vf[0] * target[0] * 1e-6) / mu;
    const reCorrection = reStokes > 1;
    if (reCorrection) {
      st.reCorrection = true;
      vf = target.map(d => Math.abs(terminalVelocity(d * 1e-6, st)));
    }

    // 2) Columna 1: se mantiene D1 de diseño; si Q queda fuera de rango, se ajusta D1
    let D1 = LIMITS.D1_DEFAULT;
    let Q = vf[0] * areaFromD(D1) * 60000;             // L/min
    if (Q > LIMITS.Q_Lmin[1] || Q < LIMITS.Q_Lmin[0]) {
      Q = clamp(Q, LIMITS.Q_Lmin[0], LIMITS.Q_Lmin[1]);
      D1 = dFromArea((Q / 60000) / vf[0]);
      if (D1 < LIMITS.D1_cm[0] || D1 > LIMITS.D1_cm[1]) {
        warnings.push(`El corte de la columna 1 pide un caudal fuera del rango del equipo (${LIMITS.Q_Lmin[0]}–${LIMITS.Q_Lmin[1]} L/min) incluso ajustando D₁; se usa el valor más cercano posible.`);
      } else {
        warnings.push(`Para lograr el corte con un caudal dentro de ${LIMITS.Q_Lmin[0]}–${LIMITS.Q_Lmin[1]} L/min se ajustó el diámetro de la columna 1.`);
      }
    }
    Q = snap(Q, LIMITS.Q_Lmin);
    D1 = snap(dFromArea((Q / 60000) / vf[0]), LIMITS.D1_cm);

    // 3) Columna 2: diámetro que da la velocidad del segundo corte con ese mismo Q
    const D2ideal = dFromArea((Q / 60000) / vf[1]);
    const D2 = snap(D2ideal, LIMITS.D2_cm);
    if (D2ideal < LIMITS.D2_cm[0] || D2ideal > LIMITS.D2_cm[1]) {
      warnings.push(`El segundo corte pide D₂ = ${D2ideal.toFixed(1)} cm, fuera del rango del equipo (${LIMITS.D2_cm[0]}–${LIMITS.D2_cm[1]} cm); se usa ${D2.toFixed(1)} cm.`);
    }

    // 4) Resultado real con el modelo del simulador
    const finalState = Object.assign({}, st, { Q_Lmin: Q, D1_cm: D1, D2_cm: D2, reCorrection });
    const m = computeModel(finalState);
    return {
      floats: false, Q_Lmin: Q, D1_cm: D1, D2_cm: D2, reCorrection,
      vf: m.vf, dpc_um: m.dpc_um, re: m.re, target_um: target, warnings
    };
  }

  // ---------------------------------------------------------------------------
  // 7. COMPARTIR CONFIGURACIÓN ENTRE PÁGINAS (index.html ⇄ ar.html) POR LA URL
  // ---------------------------------------------------------------------------
  const CONFIG_KEYS = [
    // [parámetro URL, clave del estado, mín, máx]
    ['Q', 'Q_Lmin', LIMITS.Q_Lmin[0], LIMITS.Q_Lmin[1]],
    ['rho', 'rho_p', RHO_MIN, RHO_MAX],
    ['mu', 'mu_mPas', 0.5, 3.5],
    ['D1', 'D1_cm', LIMITS.D1_cm[0], LIMITS.D1_cm[1]],
    ['D2', 'D2_cm', LIMITS.D2_cm[0], LIMITS.D2_cm[1]]
  ];
  const CONFIG_FLAGS = [['par', 'parabolic'], ['disp', 'dispersion'], ['re', 'reCorrection']];
  const MAX_FEED = 400;   // máx. diámetros escaneados transmitidos

  /** Convierte el estado (y el sólido escaneado, si hay) en una cadena de consulta URL. */
  function encodeConfig(state, customFeed) {
    const q = new URLSearchParams();
    for (const [k, key] of CONFIG_KEYS) q.set(k, String(Number(state[key].toFixed(2))));
    for (const [k, key] of CONFIG_FLAGS) if (state[key]) q.set(k, '1');
    if (customFeed && customFeed.active && customFeed.diameters_um.length) {
      const arr = customFeed.diameters_um;
      const step = Math.max(1, Math.ceil(arr.length / MAX_FEED));
      const pick = [];
      for (let i = 0; i < arr.length; i += step) pick.push(Number(arr[i].toFixed(1)));
      q.set('feed', pick.join('_'));
      q.set('psi', String(Number((customFeed.sphericity || 1).toFixed(3))));
    }
    return q.toString();
  }

  /**
   * Lee una cadena de consulta URL. Devuelve { state, feed } con valores
   * validados y acotados a los rangos del simulador (ignora lo que no sirve).
   */
  function decodeConfig(search) {
    const q = new URLSearchParams(search || '');
    const state = {};
    for (const [k, key, lo, hi] of CONFIG_KEYS) {
      if (!q.has(k)) continue;
      const v = parseFloat(q.get(k));
      if (Number.isFinite(v)) state[key] = clamp(v, lo, hi);
    }
    for (const [k, key] of CONFIG_FLAGS) if (q.has(k)) state[key] = q.get(k) === '1';
    let feed = null;
    if (q.has('feed')) {
      const diameters = q.get('feed').split('_').map(parseFloat)
        .filter(d => Number.isFinite(d) && d > 0 && d < 5000).slice(0, MAX_FEED);
      const psi = parseFloat(q.get('psi'));
      if (diameters.length >= 3) feed = { diameters_um: diameters, sphericity: Number.isFinite(psi) ? clamp(psi, 0.4, 1) : 1 };
    }
    return { state, feed };
  }

  const api = {
    encodeConfig, decodeConfig,
    LAYOUT, VEL_SCALE, PIPE_SPEED, D_MIN_UM, D_MAX_UM, RHO_MIN, RHO_MAX, MATERIALS, MATERIAL_GROUPS, OUTLET_NAMES, DEFAULT_STATE, LIMITS, STEADY,
    particleRadius, makePath, pipePosition, buildGeometry,
    columnRadiusAt, hopperRadiusAt, columnMaxOffset, hopperMaxOffset, terminalVelocity, cutDiameter, computeModel,
    designRecipe, Simulation
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ElutriationSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
