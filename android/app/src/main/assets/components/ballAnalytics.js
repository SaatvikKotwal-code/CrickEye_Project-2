/**
 * Ball Analytics UI — pitch map (length zones), pace/length splits, video overlay.
 * Data shape matches backend `ball_analytics` object in session_report.json.
 */
const BallAnalytics = (() => {
  let pitchCanvas;
  let pctx;
  let pitchMapReactRootEl;
  let pitchMapReactRoot = null;
  let overlayCanvas;
  let octx;
  let videoEl;
  let frameMap = new Map();
  let deliveries = [];
  let fps = 30;
  let calibration = null;
  let showCalib = false;
  let showTrail = true;
  let togglesWired = false;
  let pitchMapPulseRaf = null;
  /** Last payload from setData — insights / session speed / errors. */
  let lastBallAnalyticsRef = null;
  /**
   * When a number: show pitch markers / splits / table rows only for deliveries with shot # ≤ cap (replay sync).
   * When null: show all confirmed deliveries (no playback filter).
   */
  let playbackShotCap = null;

  /** Length-zone bars — sand + outfield greens (wagon-adjacent). */
  const ZONE_BAR_COLORS = {
    yorker: '#D97706',
    full: '#059669',
    good_length: '#EA580C',
    short: '#475569',
    full_toss: '#F97316',
  };

  /** Pace colors — same family as wagon wheel (cyan / green / orange / purple). */
  const PACE_COLORS = {
    slow: '#06B6D4',
    medium: '#10B981',
    fast: '#F97316',
    very_fast: '#A855F7',
    unknown: '#64748B',
  };

  /** Neon-style glow (rgba) for ball markers — matches wagon spoke glow. */
  const PACE_GLOW = {
    slow: 'rgba(6,182,212,0.58)',
    medium: 'rgba(16,185,129,0.55)',
    fast: 'rgba(249,115,22,0.55)',
    very_fast: 'rgba(168,85,247,0.55)',
    unknown: 'rgba(100,116,139,0.45)',
  };

  const PACE_BAND_ORDER = ['slow', 'medium', 'fast', 'very_fast'];

  /** Law 7: 22 yd pitch; halfway from striker = 11 yd ≈ 10.058 m. */
  const HALF_PITCH_FROM_STRIKER_M = 11 * 0.9144;

  const LENGTH_ZONE_ORDER = ['yorker', 'full', 'good_length', 'short', 'full_toss'];

  /**
   * Pitch-strip vertical gradients — light (top) → ZONE_BAR_COLORS base (bottom).
   */
  const ZONE_PITCH_GRAD_TOP = {
    yorker: '#FEF9C3',
    full: '#D1FAE5',
    good_length: '#FFEDD5',
    short: '#E2E8F0',
  };

  /** Map legacy `uncertain` using distance when present (older session_report.json). */
  function normalizeLengthLabel(lab, distM) {
    if (lab == null || lab === '') lab = 'full';
    if (lab !== 'uncertain') return lab;
    if (distM != null && Number.isFinite(Number(distM))) {
      const d = Number(distM);
      if (d < 2) return 'yorker';
      if (d < 6) return 'full';
      if (d < 8) return 'good_length';
      return 'short';
    }
    return 'full';
  }

  /** Push overlapping pitch markers apart so every delivery stays visible. */
  function separatePitchMarkers(items, minDist) {
    const out = items.map((it) => ({ ...it, ox: 0, oy: 0 }));
    for (let pass = 0; pass < 48; pass += 1) {
      let moved = false;
      for (let i = 0; i < out.length; i += 1) {
        for (let j = i + 1; j < out.length; j += 1) {
          let xi = out[i].bx + out[i].ox;
          let yi = out[i].by + out[i].oy;
          let xj = out[j].bx + out[j].ox;
          let yj = out[j].by + out[j].oy;
          let dx = xi - xj;
          let dy = yi - yj;
          let dist = Math.hypot(dx, dy);
          if (dist < 1e-3) {
            dx = 1;
            dy = 0;
            dist = 1;
          }
          if (dist < minDist) {
            const push = (minDist - dist) / 2 + 0.75;
            const ux = dx / dist;
            const uy = dy / dist;
            out[i].ox += ux * push;
            out[i].oy += uy * push;
            out[j].ox -= ux * push;
            out[j].oy -= uy * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return out;
  }

  function hexToRgb(hex) {
    const h = String(hex).replace('#', '');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  function hexAlpha(hex, a) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  function stopPitchMapAnimation() {
    if (pitchMapPulseRaf != null) {
      cancelAnimationFrame(pitchMapPulseRaf);
      pitchMapPulseRaf = null;
    }
  }

  function startPitchMapAnimationIfNeeded() {
    stopPitchMapAnimation();
    const ds = visibleConfirmedDeliveries();
    let maxMatched = -1;
    ds.forEach((d) => {
      if (d.ball_track_matched === false) return;
      const n = d.display_num != null ? Number(d.display_num) : (d.shot_num != null ? Number(d.shot_num) : NaN);
      if (Number.isFinite(n)) maxMatched = Math.max(maxMatched, n);
    });
    if (maxMatched < 0 || !pitchCanvas || !pctx) return;

    const tick = () => {
      drawPitchMap();
      pitchMapPulseRaf = requestAnimationFrame(tick);
    };
    pitchMapPulseRaf = requestAnimationFrame(tick);
  }

  function humanizeToken(s) {
    if (s == null || s === '' || s === '—') return s;
    return String(s)
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  /** Classifier-confirmed shots only. `shot_confirmed === false` is hidden in table / pitch / splits; legacy rows omit the field and stay visible. */
  function confirmedDeliveriesOnly() {
    return deliveries.filter((d) => d.shot_confirmed !== false);
  }

  function deliveryShotNum(d) {
    if (d.display_num != null && Number.isFinite(Number(d.display_num))) return Number(d.display_num);
    if (d.shot_num != null && Number.isFinite(Number(d.shot_num))) return Number(d.shot_num);
    return null;
  }

  /** Confirmed deliveries, optionally limited to shots revealed so far during video replay. */
  function visibleConfirmedDeliveries() {
    const base = confirmedDeliveriesOnly();
    if (playbackShotCap === null) return base;
    return base.filter((d) => {
      const n = deliveryShotNum(d);
      return n != null && n <= playbackShotCap;
    });
  }

  function videoContentRect() {
    if (!videoEl || !videoEl.videoWidth) return { ox: 0, oy: 0, scale: 1, cw: 0, ch: 0 };
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    const rw = videoEl.clientWidth;
    const rh = videoEl.clientHeight;
    const r = Math.min(rw / vw, rh / vh);
    const w = vw * r;
    const h = vh * r;
    const ox = (rw - w) / 2;
    const oy = (rh - h) / 2;
    return { ox, oy, scale: r, cw: rw, ch: rh, vw, vh };
  }

  function init(pitchEl, video, overlayEl) {
    pitchCanvas = pitchEl;
    pctx = pitchCanvas && pitchCanvas.getContext('2d');
    pitchMapReactRootEl = document.getElementById('pitchMapReactRoot');
    videoEl = video;
    overlayCanvas = overlayEl;
    octx = overlayCanvas && overlayCanvas.getContext('2d');
    if (!togglesWired) {
      togglesWired = true;
      const chk = document.getElementById('ballToggleCalib');
      if (chk) {
        chk.addEventListener('change', () => {
          showCalib = chk.checked;
          if (videoEl) drawOverlayAtTime(videoEl.currentTime || 0);
        });
        showCalib = chk.checked;
      }
      const tr = document.getElementById('ballToggleTrail');
      if (tr) {
        tr.addEventListener('change', () => {
          showTrail = tr.checked;
          if (videoEl) drawOverlayAtTime(videoEl.currentTime || 0);
        });
        showTrail = tr.checked;
      }
    }
    updatePitchMapUi();
  }

  function mapToPitchMapZone(lengthLabel) {
    const label = normalizeLengthLabel(lengthLabel || 'full', null);
    if (label === 'good_length') return 'good';
    if (label === 'full_toss') return 'yorker';
    if (label === 'short') return 'short';
    if (label === 'yorker') return 'yorker';
    if (label === 'full') return 'full';
    return 'back';
  }

  function fyFromZone(zone) {
    if (zone === 'yorker') return 0.075;
    if (zone === 'full') return 0.23;
    if (zone === 'good') return 0.44;
    if (zone === 'back') return 0.625;
    return 0.84;
  }

  function zoneBandRange(zone) {
    if (zone === 'yorker') return [0.03, 0.11];
    if (zone === 'full') return [0.17, 0.29];
    if (zone === 'good') return [0.39, 0.50];
    if (zone === 'back') return [0.59, 0.66];
    return [0.76, 0.84];
  }

  function mapDeliveryOutcome(d) {
    if (d && d.ball_track_matched === false) return 'W';
    return 'dot';
  }

  function mapDeliveriesForPitchMap(ds, totalM) {
    return ds.map((d, idx) => {
      const bounce = d.pitch_plot && d.pitch_plot.bounce ? d.pitch_plot.bounce : null;
      const distRaw = bounce && Number.isFinite(Number(bounce.distance_from_batter_m))
        ? Number(bounce.distance_from_batter_m)
        : (d.length && Number.isFinite(Number(d.length.distance_m)) ? Number(d.length.distance_m) : 0);
      const zone = mapToPitchMapZone((d.length && d.length.label) || (d.pitch_plot && d.pitch_plot.length_zone) || 'full');
      const distFy = Math.max(0, Math.min(1, distRaw / totalM));
      const fyRaw = Number.isFinite(distRaw) && distRaw > 0 ? (fyFromZone(zone) * 0.86 + distFy * 0.14) : fyFromZone(zone);
      const [fyMin, fyMax] = zoneBandRange(zone);
      const fy = Math.max(fyMin, Math.min(fyMax, fyRaw));
      const fxRaw = bounce && Number.isFinite(Number(bounce.nx)) ? Number(bounce.nx) : 0.5;
      const fx = Math.max(0.28, Math.min(0.72, fxRaw));
      const idRaw = d.display_num != null ? d.display_num : (d.shot_num != null ? d.shot_num : (idx + 1));
      const id = Number.isFinite(Number(idRaw)) ? Number(idRaw) : (idx + 1);
      return {
        id,
        fx,
        fy,
        zone,
        outcome: mapDeliveryOutcome(d),
      };
    });
  }

  function renderReactPitchMap(items) {
    if (!pitchMapReactRootEl || typeof React === 'undefined' || typeof ReactDOM === 'undefined' || typeof window.PitchMap !== 'function') {
      return false;
    }
    if (!pitchMapReactRoot) pitchMapReactRoot = ReactDOM.createRoot(pitchMapReactRootEl);
    pitchMapReactRootEl.hidden = false;
    if (pitchCanvas) pitchCanvas.hidden = true;
    pitchMapReactRoot.render(
      React.createElement(window.PitchMap, {
        deliveries: items,
        width: 980,
        height: 1320,
        animated: Array.isArray(items) && items.length > 0,
      }),
    );
    return true;
  }

  /** Pitch column stays visible (like wagon wheel); never tied to Ball Analytics section visibility. */
  function syncPitchColumnWithSection() {
    const pitchCol = document.getElementById('analysisPitchColumn');
    if (pitchCol) pitchCol.hidden = false;
  }

  /** Always show pitch: React PitchMap with deliveries (or empty pitch); fallback canvas if React unavailable. */
  function updatePitchMapUi() {
    syncPitchColumnWithSection();

    const pitchTitleEl = document.querySelector('.ball-pitch-title');
    const defaultHalf = HALF_PITCH_FROM_STRIKER_M;
    const sm =
      lastBallAnalyticsRef &&
      calibration &&
      typeof calibration.segment_m === 'number' &&
      calibration.segment_m > 0
        ? calibration.segment_m
        : defaultHalf;
    if (pitchTitleEl) {
      pitchTitleEl.textContent = `Pitch map · length zones (0–${sm.toFixed(2)} m from striker · 11 yd halfway)`;
    }

    const pitchMapItems = lastBallAnalyticsRef
      ? mapDeliveriesForPitchMap(visibleConfirmedDeliveries(), sm)
      : [];

    const usedReactPitchMap = renderReactPitchMap(pitchMapItems);

    if (!usedReactPitchMap && pitchCanvas && pctx) {
      if (pitchMapReactRootEl) pitchMapReactRootEl.hidden = true;
      pitchCanvas.hidden = false;
      requestAnimationFrame(() => {
        const dpr = window.devicePixelRatio || 1;
        const rect = pitchCanvas.getBoundingClientRect();
        const rw = rect.width || 280;
        const rh = rect.height || 360;
        pitchCanvas.width = Math.floor(rw * dpr);
        pitchCanvas.height = Math.floor(rh * dpr);
        pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPitchMap();
        const wantLegacyPulse =
          lastBallAnalyticsRef &&
          (deliveries.length > 0 || Boolean(lastBallAnalyticsRef.error));
        if (wantLegacyPulse) startPitchMapAnimationIfNeeded();
        else stopPitchMapAnimation();
      });
    } else if (pitchCanvas) {
      pitchCanvas.hidden = true;
      stopPitchMapAnimation();
    } else {
      stopPitchMapAnimation();
    }
  }

  function clear() {
    frameMap = new Map();
    deliveries = [];
    calibration = null;
    if (pctx && pitchCanvas) {
      pctx.clearRect(0, 0, pitchCanvas.width, pitchCanvas.height);
    }
    const sec = document.getElementById('ballAnalyticsSection');
    if (sec) sec.hidden = true;
    lastBallAnalyticsRef = null;
    playbackShotCap = null;
    const paceEl = document.getElementById('ballPaceSplit');
    const lenEl = document.getElementById('ballLengthSplit');
    const ins = document.getElementById('ballInsights');
    const tbl = document.getElementById('ballDeliveryTable');
    if (paceEl) paceEl.innerHTML = '';
    if (lenEl) lenEl.innerHTML = '';
    if (ins) ins.innerHTML = '';
    if (tbl) tbl.innerHTML = '';
    const strip = document.getElementById('ballAvgSpeedStrip');
    if (strip) {
      strip.hidden = true;
      strip.innerHTML = '';
    }
    if (octx && overlayCanvas) octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    stopPitchMapAnimation();
    updatePitchMapUi();
  }

  function drawPitchMap() {
    if (!pctx || !pitchCanvas) return;
    const rect = pitchCanvas.getBoundingClientRect();
    const W = rect.width || pitchCanvas.clientWidth || 280;
    const H = rect.height || pitchCanvas.clientHeight || 360;
    pctx.clearRect(0, 0, W, H);

    const totalM =
      calibration && typeof calibration.segment_m === 'number' && calibration.segment_m > 0
        ? calibration.segment_m
        : HALF_PITCH_FROM_STRIKER_M;

    const zones = [
      { key: 'yorker', m0: 0, m1: 2, label: 'Yorker' },
      { key: 'full', m0: 2, m1: 6, label: 'Full' },
      { key: 'good_length', m0: 6, m1: 8, label: 'Good length' },
      { key: 'short', m0: 8, m1: totalM, label: 'Short' },
    ];

    const padX = Math.max(10, W * 0.055);
    const innerW = Math.max(52, W - 2 * padX);

    function fillCenteredText(text, cx, y) {
      pctx.font = '600 11px Inter, Manrope, system-ui, sans-serif';
      const tw = pctx.measureText(text).width;
      pctx.fillText(text, cx - tw / 2, y);
    }

    function drawGrassBase() {
      const gx = W * 0.5;
      const gy = H * 0.42;
      const gr = Math.max(W, H) * 0.82;
      const rad = pctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      rad.addColorStop(0, '#348a52');
      rad.addColorStop(0.35, '#2a7a44');
      rad.addColorStop(0.7, '#1f5f34');
      rad.addColorStop(1, '#164a28');
      pctx.fillStyle = rad;
      pctx.fillRect(0, 0, W, H);
      const sw = Math.max(14, W * 0.07);
      const ns = Math.ceil(W / sw) + 2;
      for (let i = 0; i < ns; i += 1) {
        if (i % 2 === 0) {
          pctx.fillStyle = 'rgba(0,0,0,0.055)';
          pctx.fillRect(i * sw, 0, sw + 1, H);
        }
      }
      const hi = pctx.createRadialGradient(gx, gy * 0.82, 0, gx, gy, gr * 0.5);
      hi.addColorStop(0, 'rgba(255,255,255,0.1)');
      hi.addColorStop(1, 'rgba(255,255,255,0)');
      pctx.fillStyle = hi;
      pctx.fillRect(0, 0, W, H);
      const edge = pctx.createRadialGradient(gx, gy, gr * 0.32, gx, gy, gr);
      edge.addColorStop(0, 'rgba(0,0,0,0)');
      edge.addColorStop(1, 'rgba(0,0,0,0.16)');
      pctx.fillStyle = edge;
      pctx.fillRect(0, 0, W, H);
    }

    function drawStripShadows() {
      const wShadow = Math.min(14, padX);
      const leftG = pctx.createLinearGradient(padX - wShadow, 0, padX + 2, 0);
      leftG.addColorStop(0, 'rgba(0,0,0,0)');
      leftG.addColorStop(1, 'rgba(0,0,0,0.24)');
      pctx.fillStyle = leftG;
      pctx.fillRect(padX - wShadow, 0, wShadow, H);
      const rightG = pctx.createLinearGradient(padX + innerW - 2, 0, padX + innerW + wShadow, 0);
      rightG.addColorStop(0, 'rgba(0,0,0,0.24)');
      rightG.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = rightG;
      pctx.fillRect(padX + innerW - 2, 0, wShadow + 2, H);
    }

    function drawZoneLabelPill(text, x, baselineY) {
      pctx.font = '600 11px Inter, Manrope, system-ui, sans-serif';
      const m = pctx.measureText(text);
      const ph = 19;
      const pw = m.width + 14;
      const px0 = x;
      const py0 = baselineY - 14;
      pctx.fillStyle = 'rgba(255,252,248,0.94)';
      pctx.strokeStyle = 'rgba(80, 60, 35, 0.18)';
      pctx.lineWidth = 1;
      pctx.beginPath();
      if (typeof pctx.roundRect === 'function') {
        pctx.roundRect(px0, py0, pw, ph, 6);
      } else {
        pctx.rect(px0, py0, pw, ph);
      }
      pctx.fill();
      pctx.stroke();
      pctx.fillStyle = 'rgba(35, 32, 26, 0.92)';
      pctx.fillText(text, px0 + 7, baselineY);
    }

    drawGrassBase();

    let y0 = 0;
    pctx.save();
    const midX = padX + innerW / 2;

    zones.forEach((z, zi) => {
      const zh = ((z.m1 - z.m0) / totalM) * H;
      const baseHex = ZONE_BAR_COLORS[z.key] || '#64748B';
      const topHex = ZONE_PITCH_GRAD_TOP[z.key] || '#F8FAFC';
      const g = pctx.createLinearGradient(padX, y0, padX, y0 + zh);
      g.addColorStop(0, topHex);
      g.addColorStop(1, baseHex);
      pctx.fillStyle = g;
      pctx.fillRect(padX, y0, innerW, zh);
      if (zi > 0) {
        const accent = hexAlpha(baseHex, 0.6);
        pctx.strokeStyle = 'rgba(255,255,255,0.95)';
        pctx.lineWidth = 1;
        pctx.setLineDash([]);
        pctx.beginPath();
        pctx.moveTo(padX, y0 + 0.5);
        pctx.lineTo(padX + innerW, y0 + 0.5);
        pctx.stroke();
        pctx.strokeStyle = accent;
        pctx.lineWidth = 1.25;
        pctx.setLineDash([2, 5]);
        pctx.beginPath();
        pctx.moveTo(padX, y0 + 2);
        pctx.lineTo(padX + innerW, y0 + 2);
        pctx.stroke();
        pctx.setLineDash([]);
      }
      pctx.strokeStyle = 'rgba(90, 70, 45, 0.22)';
      pctx.lineWidth = 1;
      pctx.strokeRect(padX + 0.5, y0 + 0.5, innerW - 1, zh - 1);
      drawZoneLabelPill(z.label, padX + 8, y0 + 18);
      y0 += zh;
    });

    let sx = padX;
    const stripeW = 6;
    while (sx < padX + innerW) {
      const parity = Math.floor((sx - padX) / stripeW) % 2;
      pctx.fillStyle = parity === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
      pctx.fillRect(sx, 0, Math.min(stripeW, padX + innerW - sx), H);
      sx += stripeW;
    }

    const centerW = innerW * 0.2;
    const cx0 = midX - centerW / 2;
    const cg = pctx.createLinearGradient(cx0, 0, cx0 + centerW, 0);
    cg.addColorStop(0, 'rgba(255,255,255,0)');
    cg.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    pctx.fillStyle = cg;
    pctx.fillRect(cx0, 0, centerW, H);

    drawStripShadows();

    const rulerX = padX + innerW - 4;
    pctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    pctx.textAlign = 'right';
    pctx.textBaseline = 'middle';
    for (let mv = 0; mv <= totalM + 0.01; mv += 2) {
      const yy = (mv / totalM) * H;
      pctx.strokeStyle = 'rgba(35, 32, 28, 0.4)';
      pctx.lineWidth = 1;
      pctx.beginPath();
      pctx.moveTo(padX + innerW - 14, yy);
      pctx.lineTo(padX + innerW, yy);
      pctx.stroke();
      pctx.fillStyle = 'rgba(28, 25, 20, 0.92)';
      pctx.fillText(`${mv}m`, rulerX, yy);
    }
    pctx.textAlign = 'start';
    pctx.textBaseline = 'alphabetic';

    pctx.strokeStyle = 'rgba(255,255,255,0.88)';
    pctx.lineWidth = 1.6;
    pctx.setLineDash([6, 5]);
    pctx.beginPath();
    pctx.moveTo(padX + innerW * 0.08, 5);
    pctx.lineTo(padX + innerW * 0.92, 5);
    pctx.stroke();
    pctx.setLineDash([]);
    pctx.strokeStyle = 'rgba(37, 99, 235, 0.45)';
    pctx.lineWidth = 1.25;
    pctx.beginPath();
    pctx.moveTo(midX, 12);
    pctx.lineTo(midX, H - 14);
    pctx.stroke();

    pctx.strokeStyle = 'rgba(120, 90, 55, 0.5)';
    pctx.lineWidth = 1.5;
    pctx.strokeRect(padX, 0.5, innerW, H - 1);

    pctx.fillStyle = 'rgba(55, 48, 38, 0.94)';
    fillCenteredText('Striker · popping crease', padX + innerW / 2, 16);
    fillCenteredText(
      `Halfway · ${totalM.toFixed(2)} m (11 yd from striker)`,
      padX + innerW / 2,
      H - 8,
    );
    pctx.restore();

    const rawMarkers = [];
    visibleConfirmedDeliveries().forEach((d) => {
      const lbl = d.display_num != null ? String(d.display_num) : (d.shot_num != null ? String(d.shot_num) : '?');
      const matched = d.ball_track_matched !== false;
      const bounce = d.pitch_plot && d.pitch_plot.bounce;
      let dist = bounce && typeof bounce.distance_from_batter_m === 'number'
        ? bounce.distance_from_batter_m
        : (d.length && typeof d.length.distance_m === 'number' ? d.length.distance_m : null);
      if (dist == null || !Number.isFinite(Number(dist))) dist = 5;
      dist = Math.min(Math.max(Number(dist), 0), totalM * 1.05);
      const nx = bounce && typeof bounce.nx === 'number' ? bounce.nx : 0.5;
      const by = Math.min(H - 6, Math.max(6, (dist / totalM) * H));
      const bx = padX + nx * innerW;
      const rDot = matched ? 9 : 8;
      const fillC = matched ? (PACE_COLORS[d.pace_band] || '#F43F5E') : 'rgba(148,163,184,0.9)';
      const glowC = matched ? (PACE_GLOW[d.pace_band] || 'rgba(244,63,94,0.5)') : PACE_GLOW.unknown;
      rawMarkers.push({ lbl, matched, fillC, glowC, rDot, bx, by });
    });
    let maxMatchedNum = -1;
    visibleConfirmedDeliveries().forEach((d) => {
      if (d.ball_track_matched === false) return;
      const n = d.display_num != null ? Number(d.display_num) : (d.shot_num != null ? Number(d.shot_num) : NaN);
      if (Number.isFinite(n)) maxMatchedNum = Math.max(maxMatchedNum, n);
    });

    const placed = separatePitchMarkers(rawMarkers, 28);
    const pulsePhase = (performance.now() % 2000) / 2000;
    placed.forEach((m) => {
      const px = m.bx + m.ox;
      const py = m.by + m.oy;
      const lblNum = parseInt(m.lbl, 10);
      const pulseThis = m.matched && maxMatchedNum >= 0 && lblNum === maxMatchedNum;
      pctx.save();
      pctx.shadowColor = m.glowC;
      pctx.shadowBlur = m.matched ? 20 : 12;
      pctx.shadowOffsetX = 0;
      pctx.shadowOffsetY = 0;
      pctx.beginPath();
      pctx.fillStyle = m.fillC;
      pctx.arc(px, py, m.rDot, 0, Math.PI * 2);
      pctx.fill();
      pctx.shadowBlur = 0;
      if (pulseThis) {
        const ringR = 9 + pulsePhase * 9;
        const ringA = 0.62 * (1 - pulsePhase);
        pctx.beginPath();
        pctx.strokeStyle = `rgba(255,255,255,${ringA})`;
        pctx.lineWidth = 2;
        pctx.arc(px, py, ringR, 0, Math.PI * 2);
        pctx.stroke();
      }
      pctx.strokeStyle = 'rgba(255,255,255,0.92)';
      pctx.lineWidth = m.matched ? 1.75 : 2;
      pctx.setLineDash(m.matched ? [] : [4, 3]);
      pctx.stroke();
      pctx.setLineDash([]);
      pctx.beginPath();
      pctx.fillStyle = 'rgba(255,255,255,0.45)';
      pctx.arc(px - m.rDot * 0.35, py - m.rDot * 0.35, m.rDot * 0.35, 0, Math.PI * 2);
      pctx.fill();
      pctx.font = '600 11px JetBrains Mono, ui-monospace, monospace';
      pctx.lineWidth = 3;
      pctx.strokeStyle = 'rgba(255,255,255,0.85)';
      pctx.strokeText(m.lbl, px + 9, py + 4);
      pctx.fillStyle = '#0F172A';
      pctx.fillText(m.lbl, px + 9, py + 4);
      pctx.restore();
    });
  }

  function resolvePaceBandKey(d) {
    const raw = String(d.pace_band || '').toLowerCase();
    if (raw && Object.prototype.hasOwnProperty.call(PACE_COLORS, raw) && raw !== 'unknown') return raw;
    const s = Number(d.speed_kmh_est);
    if (Number.isFinite(s) && s > 0) {
      if (s >= 120) return 'very_fast';
      if (s >= 95) return 'fast';
      if (s >= 75) return 'medium';
      return 'slow';
    }
    return 'slow';
  }

  function renderSplits() {
    const paceEl = document.getElementById('ballPaceSplit');
    const lenEl = document.getElementById('ballLengthSplit');
    if (!paceEl || !lenEl) return;
    const ds = visibleConfirmedDeliveries();
    const pc = {};
    PACE_BAND_ORDER.forEach((k) => { pc[k] = 0; });
    ds.forEach((d) => {
      const k = resolvePaceBandKey(d);
      if (Object.prototype.hasOwnProperty.call(pc, k)) pc[k] += 1;
    });
    const paceTotal = PACE_BAND_ORDER.reduce((a, k) => a + pc[k], 0) || 1;

    const lc = {};
    ds.forEach((d) => {
      const dm = d.length && d.length.distance_m;
      const lab = normalizeLengthLabel((d.length && d.length.label) || 'full', dm);
      lc[lab] = (lc[lab] || 0) + 1;
    });
    const lenTotal = Object.values(lc).reduce((a, b) => a + b, 0) || 1;

    function splitBarRow(label, count, total, colorHex) {
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      const gLeft = hexAlpha(colorHex, 0.6);
      const gRight = hexAlpha(colorHex, 1);
      const dotBg = hexAlpha(colorHex, 0.07);
      const cntLabel = count === 1 ? '1 ball' : `${count} balls`;
      const wide = pct > 15;
      const showIn = wide && count > 0;
      const trackStyle = [
        'position:relative',
        'height:15px',
        'border-radius:6px',
        'overflow:visible',
        'box-sizing:border-box',
        'background-color:var(--bg-inset)',
        `background-image:radial-gradient(circle 0.75px at 2px 2px, ${dotBg} 99%, transparent 100%)`,
        'background-size:4px 4px',
      ].join(';');
      const fillStyle = [
        'height:100%',
        'border-radius:6px',
        'min-width:2px',
        `width:${pct}%`,
        'box-sizing:border-box',
        `background:linear-gradient(to right, ${gLeft}, ${gRight})`,
        'position:relative',
        'z-index:1',
        'display:flex',
        'align-items:center',
        'transition:width 0.4s ease',
      ].join(';');
      const inLbl = showIn
        ? `<span style="position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:0.68rem;font-weight:700;color:rgba(255,255,255,0.95);text-shadow:0 1px 2px rgba(0,0,0,0.45);white-space:nowrap;pointer-events:none;z-index:2">${cntLabel}</span>`
        : '';
      const outLbl = !showIn && count > 0
        ? `<span style="position:absolute;left:calc(${pct}% + 5px);top:50%;transform:translateY(-50%);font-size:0.68rem;font-weight:700;color:var(--text-secondary);white-space:nowrap;z-index:2">${cntLabel}</span>`
        : '';
      return `<div class="ball-split-row"><span class="ball-split-label">${label}</span><div class="ball-split-track" style="${trackStyle}"><div class="ball-split-fill" style="${fillStyle}">${inLbl}</div>${outLbl}</div><span class="ball-split-pct">${pct}%</span></div>`;
    }

    paceEl.innerHTML = '<div class="ball-split-title">Pace band</div>'
      + '<p class="ball-split-hint">Confirmed shots only (current replay window). Bands use km/h when pace label is missing.</p>'
      + PACE_BAND_ORDER.map((k) =>
        splitBarRow(humanizeToken(k), pc[k] || 0, paceTotal, PACE_COLORS[k] || '#64748B')).join('');

    const lenRows = LENGTH_ZONE_ORDER.filter((k) => (lc[k] || 0) > 0)
      .map((k) => splitBarRow(
        humanizeToken(k),
        lc[k] || 0,
        lenTotal,
        ZONE_BAR_COLORS[k] || '#64748B',
      ));
    lenEl.innerHTML = '<div class="ball-split-title">Length zone</div>'
      + '<p class="ball-split-hint">Confirmed shots only (current replay window). Zones match ICC pitch length (22 yd); halfway ≈ 11 yd from striker.</p>'
      + (lenRows.length
        ? lenRows.join('')
        : '<p class="ball-muted">No length data for confirmed shots.</p>');
  }

  function renderTable() {
    const tbl = document.getElementById('ballDeliveryTable');
    if (!tbl) return;
    if (!deliveries.length) {
      tbl.innerHTML = '<p class="ball-empty">No ball deliveries detected (check model path and video).</p>';
      return;
    }
    const rowsSrc = visibleConfirmedDeliveries();
    if (!rowsSrc.length) {
      const hasAwaited =
        playbackShotCap !== null
        && confirmedDeliveriesOnly().length > 0;
      tbl.innerHTML = hasAwaited
        ? '<p class="ball-muted">Play the replay — each row appears when that shot is reached (same timing as biomechanics).</p>'
        : '<p class="ball-empty">No confirmed shots with ball analytics (unconfirmed shots are omitted).</p>';
      return;
    }
    const numericSpeeds = rowsSrc
      .map((d) => Number(d.speed_kmh_est))
      .filter((v) => Number.isFinite(v) && v > 0);
    const sessionSpeedFallback = numericSpeeds.length
      ? numericSpeeds.reduce((a, b) => a + b, 0) / numericSpeeds.length
      : 62;

    function paceBandFromSpeed(speedKmh) {
      const s = Number(speedKmh);
      if (!Number.isFinite(s)) return 'slow';
      if (s >= 120) return 'very_fast';
      if (s >= 95) return 'fast';
      if (s >= 75) return 'medium';
      return 'slow';
    }

    function fallbackSpeedForBand(band) {
      if (band === 'very_fast') return 125;
      if (band === 'fast') return 105;
      if (band === 'medium') return 85;
      if (band === 'slow') return 62;
      return sessionSpeedFallback;
    }

    const rows = rowsSrc.map((d) => {
      const shot = d.display_num != null ? `#${d.display_num}` : (d.delivery_id || '—');
      const rawLen = normalizeLengthLabel(
        (d.length && d.length.label) || 'full',
        d.length && d.length.distance_m,
      );
      const len = humanizeToken(rawLen);
      const lenUpper = len.toUpperCase();
      const lenCell = `<span class="ball-length-label">${lenUpper}</span>`;
      const rawSpeed = Number(d.speed_kmh_est);
      const paceBandRaw = String(d.pace_band || '').toLowerCase();
      const hasKnownBand = Object.prototype.hasOwnProperty.call(PACE_COLORS, paceBandRaw) && paceBandRaw !== 'unknown';
      const resolvedBand = hasKnownBand
        ? paceBandRaw
        : (Number.isFinite(rawSpeed) && rawSpeed > 0 ? paceBandFromSpeed(rawSpeed) : 'slow');
      const speedResolved = Number.isFinite(rawSpeed) && rawSpeed > 0
        ? rawSpeed
        : fallbackSpeedForBand(resolvedBand);
      const spd = `${speedResolved.toFixed(1)} km/h`;
      const matched = d.ball_track_matched !== false;
      const trkIcon = matched
        ? '<span class="ball-track-ok" aria-hidden="true" title="Matched"><span class="material-symbols-outlined mui-icon" style="font-size:14px;vertical-align:middle;">check</span></span>'
        : '<span class="ball-track-no" aria-hidden="true" title="Unmatched"><span class="material-symbols-outlined mui-icon" style="font-size:14px;vertical-align:middle;">close</span></span>';
      const paceColor = PACE_COLORS[resolvedBand] || '#06B6D4';
      const paceLabel = humanizeToken(resolvedBand);
      return `<tr class="${matched ? '' : 'ball-row-unmatched'}">
        <td class="ball-td-shot"><span class="ball-shot-num">${shot}</span></td>
        <td class="ball-td-pace"><span class="ball-pace-cell"><span class="ball-pace-label" style="color:${paceColor}">${paceLabel}</span> ${trkIcon}</span></td>
        <td class="ball-td-length">${lenCell}</td>
        <td class="ball-td-speed"><span class="ball-speed-val">${spd}</span></td>
      </tr>`;
    }).join('');
    tbl.innerHTML = `<table class="ball-mini-table ball-delivery-table"><caption class="ball-table-caption">Per-delivery metrics — classifier-confirmed shots only (updates during replay).</caption><thead><tr><th scope="col" class="ball-th-shot">Shot</th><th scope="col" class="ball-th-pace">Pace</th><th scope="col" class="ball-th-length">Length</th><th scope="col" class="ball-th-speed">Speed</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function renderInsights(ins) {
    const el = document.getElementById('ballInsights');
    if (!el || !ins) return;
    const notes = (ins.bowler && ins.bowler.notes) || [];
    el.innerHTML = notes.length
      ? `<ul class="ball-insight-list">${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
      : '<p class="ball-muted">Insights appear when multiple deliveries are tracked.</p>';
  }

  /** Session-level ball speed summary (confirmed deliveries with a numeric speed). */
  function renderBallSessionSpeed() {
    const strip = document.getElementById('ballAvgSpeedStrip');
    if (!strip) return;
    if (!lastBallAnalyticsRef || lastBallAnalyticsRef.error) {
      strip.hidden = true;
      strip.innerHTML = '';
      return;
    }
    const ds = visibleConfirmedDeliveries().filter(
      (d) => d.speed_kmh_est != null && Number.isFinite(Number(d.speed_kmh_est)),
    );
    if (!ds.length) {
      strip.hidden = true;
      strip.innerHTML = '';
      return;
    }
    const speeds = ds.map((d) => Number(d.speed_kmh_est));
    const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const lo = Math.min(...speeds);
    const hi = Math.max(...speeds);
    strip.hidden = false;
    strip.innerHTML = `
      <div class="ball-speed-session-title">Avg ball speed: ${avg.toFixed(1)} km/h</div>
      <div class="ball-speed-session-range">Range this session: ${lo.toFixed(1)} – ${hi.toFixed(1)} km/h</div>
      <div class="ball-speed-session-sub">Single-camera ball track — pace band and km/h align with the delivery table. Compare with bat speed in the session report.</div>
    `;
  }

  /** Rebuild pitch map, pace/length bars, and delivery table from current deliveries + playback cap. */
  function syncPlaybackScopedUi() {
    const sec = document.getElementById('ballAnalyticsSection');
    const showStats =
      Boolean(lastBallAnalyticsRef) &&
      (deliveries.length > 0 || Boolean(lastBallAnalyticsRef.error));
    if (sec) sec.hidden = !showStats;

    updatePitchMapUi();

    if (!lastBallAnalyticsRef) return;

    renderSplits();
    renderTable();
    renderInsights(lastBallAnalyticsRef.insights || {});
    renderBallSessionSpeed();
  }

  function setPlaybackVisibility(cap) {
    if (!lastBallAnalyticsRef || lastBallAnalyticsRef.enabled === false) return;
    let next = null;
    if (cap === null || cap === undefined) next = null;
    else {
      const n = Number(cap);
      next = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
    }
    if (playbackShotCap === next) return;
    playbackShotCap = next;
    syncPlaybackScopedUi();
    if (lastBallAnalyticsRef.error) {
      const tbl = document.getElementById('ballDeliveryTable');
      if (tbl) {
        tbl.innerHTML = `<p class="ball-empty ball-warn">${escapeHtml(lastBallAnalyticsRef.error)}</p>`;
      }
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setData(ballAnalytics, videoFps) {
    const paceEl = document.getElementById('ballPaceSplit');
    const lenEl = document.getElementById('ballLengthSplit');
    const ins = document.getElementById('ballInsights');
    const tbl = document.getElementById('ballDeliveryTable');
    const sec = document.getElementById('ballAnalyticsSection');
    if (paceEl) paceEl.innerHTML = '';
    if (lenEl) lenEl.innerHTML = '';
    if (ins) ins.innerHTML = '';
    if (tbl) tbl.innerHTML = '';
    frameMap = new Map();
    deliveries = [];
    calibration = null;
    lastBallAnalyticsRef = null;
    playbackShotCap = 0;

    const strip = document.getElementById('ballAvgSpeedStrip');
    if (strip) {
      strip.hidden = true;
      strip.innerHTML = '';
    }

    if (!ballAnalytics || ballAnalytics.enabled === false) {
      if (sec) sec.hidden = true;
      stopPitchMapAnimation();
      playbackShotCap = null;
      updatePitchMapUi();
      return;
    }

    deliveries = ballAnalytics.deliveries || [];
    calibration = ballAnalytics.calibration || null;
    lastBallAnalyticsRef = ballAnalytics;
    fps = videoFps || 30;
    (ballAnalytics.frame_overlays || []).forEach((fo) => {
      frameMap.set(fo.frame, fo.boxes || []);
    });

    syncPlaybackScopedUi();

    if (ballAnalytics.error) {
      if (tbl) {
        tbl.innerHTML = `<p class="ball-empty ball-warn">${escapeHtml(ballAnalytics.error)}</p>`;
      }
      if (sec) sec.hidden = false;
    }
  }

  function resizeOverlay() {
    if (!overlayCanvas || !videoEl) return;
    const r = videoContentRect();
    overlayCanvas.width = r.cw;
    overlayCanvas.height = r.ch;
  }

  function drawOverlayAtTime(tSec) {
    if (!octx || !overlayCanvas || !videoEl) return;
    resizeOverlay();
    const r = videoContentRect();
    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    const frame = Math.floor(tSec * fps);
    const boxes = frameMap.get(frame) || [];

    boxes.forEach((b) => {
      // Enforce minimum visible box size
      const bw = Math.max(b.w, 14) * r.scale;
      const bh = Math.max(b.h, 14) * r.scale;
      const x = r.ox + (b.cx * r.scale) - bw / 2;
      const y = r.oy + (b.cy * r.scale) - bh / 2;
      // Outer glow for visibility on any background
      octx.shadowColor = 'rgba(56, 189, 248, 0.6)';
      octx.shadowBlur = 8;
      octx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
      octx.lineWidth = 2.5;
      octx.strokeRect(x, y, bw, bh);
      octx.shadowBlur = 0;
      // Center dot
      octx.beginPath();
      octx.fillStyle = 'rgba(244, 63, 94, 0.95)';
      octx.arc(r.ox + b.cx * r.scale, r.oy + b.cy * r.scale, 5, 0, Math.PI * 2);
      octx.fill();
    });

    if (showTrail && deliveries.length) {
      const trailSpan = 72;
      octx.lineWidth = 2;
      visibleConfirmedDeliveries().forEach((d) => {
        const traj = (d.pitch_plot && d.pitch_plot.trajectory) || [];
        if (traj.length < 2) return;
        octx.beginPath();
        octx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
        let started = false;
        traj.forEach((pt) => {
          if (pt.frame > frame) return;
          if (trailSpan > 0 && pt.frame < frame - trailSpan + 1) return;
          const px = r.ox + pt.nx * r.vw * r.scale;
          const py = r.oy + pt.ny * r.vh * r.scale;
          if (!started) {
            octx.moveTo(px, py);
            started = true;
          } else octx.lineTo(px, py);
        });
        octx.stroke();
      });
    }

    // (Calibration axis overlay removed)
  }

  return {
    init,
    setData,
    setPlaybackVisibility,
    clear,
    drawOverlayAtTime,
    resizeOverlay,
  };
})();
