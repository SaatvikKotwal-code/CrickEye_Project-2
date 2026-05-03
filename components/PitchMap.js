const { useEffect, useRef, useCallback } = React;

// ─────────────────────────────────────────────
// CrickEye — PitchMap.js
// Drop into: components/PitchMap.js
//
// Props:
//   deliveries: Array<{
//     id:      number,   // ball number shown as label
//     fx:      number,   // 0–1 horizontal (0=leg, 0.5=centre, 1=off)
//     fy:      number,   // 0–1 vertical   (0=yorker/stumps, 1=halfway)
//     zone:    string,   // 'yorker'|'full'|'good'|'back'|'short'
//     outcome: string,   // 'dot'|'1'|'2'|'4'|'6'|'W'
//   }>
//   width:        number   (default 680)
//   height:       number   (default 600)
//   animated:     boolean  (default true)
//   onBallClick:  (delivery) => void
// ─────────────────────────────────────────────

const ZONES = [
  { id: 'yorker', label: 'YORKER',         col: '#f5a623', yF: [0.00, 0.13] },
  { id: 'full',   label: 'FULL',           col: '#2ecc71', yF: [0.13, 0.33] },
  { id: 'good',   label: 'GOOD LENGTH',    col: '#27ae60', yF: [0.33, 0.55] },
  { id: 'back',   label: 'BACK OF LENGTH', col: '#e8601a', yF: [0.55, 0.70] },
  { id: 'short',  label: 'SHORT',          col: '#8a9a7a', yF: [0.70, 1.00] },
];

const DIST_MARKERS = [
  [0.13, '2M'],
  [0.33, '4M'],
  [0.55, '6M'],
  [0.70, '8M'],
  [0.87, 'HALF WAY'],
];

function ballColor(outcome) {
  if (outcome === 'W')                    return '#ff2ea6';
  if (outcome === '4' || outcome === '6') return '#00e5ff';
  if (outcome === '2')                    return '#ffd84d';
  if (outcome === '1')                    return '#8bff3f';
  return '#ff6b2d';
}

function lightenHex(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((n >> 16) & 255) + Math.round(255 * amt));
  const g = Math.min(255, ((n >>  8) & 255) + Math.round(255 * amt));
  const b = Math.min(255, ((n      ) & 255) + Math.round(255 * amt));
  return `rgb(${r},${g},${b})`;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function zoneBand(zone) {
  if (zone === 'yorker') return [0.03, 0.11];
  if (zone === 'full') return [0.17, 0.29];
  if (zone === 'good') return [0.39, 0.50];
  if (zone === 'back') return [0.59, 0.66];
  return [0.76, 0.84];
}

function lateralBandForFy(fy) {
  if (fy <= 0.14) return [0.40, 0.60];
  if (fy <= 0.28) return [0.36, 0.64];
  if (fy <= 0.42) return [0.33, 0.67];
  if (fy <= 0.58) return [0.31, 0.69];
  return [0.29, 0.71];
}

function computeBallLayout(deliveries, pX, pY) {
  const items = (deliveries || []).map((b) => {
    const [zMin, zMax] = zoneBand(b.zone);
    const zonePad = Math.min(0.02, (zMax - zMin) * 0.2);
    const fy = clamp(b.fy, zMin + zonePad, zMax - zonePad);
    const [xMin, xMax] = lateralBandForFy(fy);
    const fx = clamp(b.fx, xMin, xMax);
    return {
      ...b,
      zMin,
      zMax,
      zonePad,
      fyAdj: fy,
      fxAdj: fx,
      sx: pX(fx, fy),
      sy: pY(fy),
    };
  });
  const minDist = 48;
  for (let pass = 0; pass < 55; pass += 1) {
    let moved = false;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        let dx = a.sx - b.sx;
        let dy = a.sy - b.sy;
        let d = Math.hypot(dx, dy);
        if (d < 0.001) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        if (d < minDist) {
          const push = (minDist - d) * 0.52;
          const ux = dx / d;
          const uy = dy / d;
          a.sx += ux * push;
          a.sy += uy * push;
          b.sx -= ux * push;
          b.sy -= uy * push;
          moved = true;
        }
      }
    }
    items.forEach((it) => {
      const [xMin, xMax] = lateralBandForFy(it.fyAdj);
      const left = pX(xMin, it.fyAdj);
      const right = pX(xMax, it.fyAdj);
      const top = pY(it.zMin + it.zonePad);
      const bottom = pY(it.zMax - it.zonePad);
      const nx = clamp(it.sx, left, right);
      const ny = clamp(it.sy, top, bottom);
      if (Math.abs(nx - it.sx) > 0.01 || Math.abs(ny - it.sy) > 0.01) moved = true;
      it.sx = nx;
      it.sy = ny;
    });
    if (!moved) break;
  }
  return items;
}

function PitchMap({
  deliveries = [],
  width      = 680,
  height     = 600,
  animated   = true,
  onBallClick,
}) {
  const canvasRef  = useRef(null);
  const tooltipRef = useRef(null);
  const frameRef   = useRef(0);
  const rafRef     = useRef(null);
  const animRef    = useRef(animated);
  animRef.current  = animated;

  const W = width;
  const H = height;

  // Trapezoid geometry: narrow at top (striker), wide at bottom (bowler)
  // Matching pic 3 proportions exactly
  const PT = { lx: W / 2 - W * 0.095,  rx: W / 2 + W * 0.095,  y: H * 0.035 };
  const PB = { lx: W / 2 - W * 0.39, rx: W / 2 + W * 0.39, y: H * 0.955 };

  const pX = useCallback((fx, fy) => {
    const lx = PT.lx + (PB.lx - PT.lx) * fy;
    const rx = PT.rx + (PB.rx - PT.rx) * fy;
    return lx + fx * (rx - lx);
  }, [W, H]);

  const pY = useCallback((fy) => PT.y + (PB.y - PT.y) * fy, [W, H]);

  // ── main render loop ───────────────────────────────────────────────────
  useEffect(() => {
    const cv  = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');

    const render = () => {
      ctx.clearRect(0, 0, W, H);

      // 1. dark green grass background
      ctx.fillStyle = '#061508';
      ctx.fillRect(0, 0, W, H);

      // grass texture stripes — full canvas
      ctx.save();
      ctx.globalAlpha = 0.04;
      const sw = W / 24;
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#4cff70' : '#000';
        ctx.fillRect(i * sw, 0, sw, H);
      }
      ctx.restore();

      // left grass wedge
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(PT.lx, PT.y);
      ctx.lineTo(PB.lx, PB.y); ctx.lineTo(0, H); ctx.closePath();
      const gl = ctx.createLinearGradient(0, H / 2, PT.lx, H / 2);
      gl.addColorStop(0, '#040d04'); gl.addColorStop(1, '#0c3510');
      ctx.fillStyle = gl; ctx.fill();
      ctx.restore();

      // right grass wedge
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(W, 0); ctx.lineTo(PT.rx, PT.y);
      ctx.lineTo(PB.rx, PB.y); ctx.lineTo(W, H); ctx.closePath();
      const gr = ctx.createLinearGradient(W, H / 2, PT.rx, H / 2);
      gr.addColorStop(0, '#040d04'); gr.addColorStop(1, '#0c3510');
      ctx.fillStyle = gr; ctx.fill();
      ctx.restore();

      // 2. pitch surface (sandy/brown trapezoid)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(PT.lx, PT.y); ctx.lineTo(PT.rx, PT.y);
      ctx.lineTo(PB.rx, PB.y); ctx.lineTo(PB.lx, PB.y); ctx.closePath();
      const pg = ctx.createLinearGradient(W / 2, PT.y, W / 2, PB.y);
      pg.addColorStop(0,    '#b09830');
      pg.addColorStop(0.3,  '#c8b040');
      pg.addColorStop(0.65, '#bea838');
      pg.addColorStop(1,    '#a89030');
      ctx.fillStyle = pg; ctx.fill();
      // subtle wear lines
      ctx.globalAlpha = 0.06; ctx.strokeStyle = '#000';
      for (let i = 1; i < 16; i++) {
        const fy = i / 16;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(pX(0, fy), pY(fy)); ctx.lineTo(pX(1, fy), pY(fy));
        ctx.stroke();
      }
      ctx.restore();

      // 3. zone color overlays
      ctx.save();
      ZONES.forEach(z => {
        ctx.beginPath();
        ctx.moveTo(pX(0, z.yF[0]), pY(z.yF[0]));
        ctx.lineTo(pX(1, z.yF[0]), pY(z.yF[0]));
        ctx.lineTo(pX(1, z.yF[1]), pY(z.yF[1]));
        ctx.lineTo(pX(0, z.yF[1]), pY(z.yF[1]));
        ctx.closePath();
        ctx.fillStyle   = z.col;
        ctx.globalAlpha = 0.58;
        ctx.fill();
        // separator line between zones
        if (z.yF[0] > 0) {
          ctx.globalAlpha   = 0.45;
          ctx.strokeStyle   = 'rgba(255,255,255,0.4)';
          ctx.lineWidth     = 0.9;
          ctx.beginPath();
          ctx.moveTo(pX(0, z.yF[0]), pY(z.yF[0]));
          ctx.lineTo(pX(1, z.yF[0]), pY(z.yF[0]));
          ctx.stroke();
        }
      });
      ctx.restore();

      // 4. creases
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineCap = 'round';

      // popping crease — striker end (top)
      const tfy = 0.073;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(pX(-0.44, tfy), pY(tfy));
      ctx.lineTo(pX(1.44,  tfy), pY(tfy)); ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(pX(0, 0), pY(0)); ctx.lineTo(pX(0, tfy + 0.02), pY(tfy + 0.02)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pX(1, 0), pY(0)); ctx.lineTo(pX(1, tfy + 0.02), pY(tfy + 0.02)); ctx.stroke();

      // bowling crease — bowler end (bottom)
      const bfy = 0.865;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(pX(-0.25, bfy), pY(bfy));
      ctx.lineTo(pX(1.25,  bfy), pY(bfy)); ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(pX(0, 1), pY(1)); ctx.lineTo(pX(0, bfy), pY(bfy)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pX(1, 1), pY(1)); ctx.lineTo(pX(1, bfy), pY(bfy)); ctx.stroke();

      // centre dashed line
      ctx.setLineDash([7, 6]);
      ctx.globalAlpha = 0.18; ctx.lineWidth = 0.9;
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(pX(0.5, 0), pY(0)); ctx.lineTo(pX(0.5, 1), pY(1)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // 5. pitch border outline
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(PT.lx, PT.y); ctx.lineTo(PT.rx, PT.y);
      ctx.lineTo(PB.rx, PB.y); ctx.lineTo(PB.lx, PB.y); ctx.closePath();
      ctx.strokeStyle = 'rgba(210,190,60,0.18)';
      ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();

      // 6. zone text labels + distance markers
      ctx.save();
      ctx.textBaseline = 'middle';
      ZONES.forEach(z => {
        const mfy = (z.yF[0] + z.yF[1]) / 2;
        const zH  = (z.yF[1] - z.yF[0]) * (PB.y - PT.y);
        if (zH < 18) return;
        const sc = 0.9 + mfy * 0.6;
        ctx.font        = `900 ${Math.round(16 * sc)}px 'Trebuchet MS', sans-serif`;
        ctx.fillStyle   = 'rgba(255,255,255,0.98)';
        ctx.strokeStyle = 'rgba(0,0,0,0.82)';
        ctx.lineWidth   = Math.max(2, 2.3 * sc);
        ctx.shadowColor = 'rgba(0,0,0,0.78)';
        ctx.shadowBlur  = 7;
        ctx.strokeText(z.label, pX(0, mfy) + 10, pY(mfy));
        ctx.fillText(z.label, pX(0, mfy) + 10, pY(mfy));
        ctx.shadowBlur = 0;
      });
      // right side distance labels
      DIST_MARKERS.forEach(([fy, lbl]) => {
        ctx.font      = `900 17px 'Trebuchet MS', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 2;
        const yLabel = fy > 0.84 ? pY(fy) - 14 : pY(fy);
        ctx.strokeText(lbl, pX(1, fy) + 10, yLabel);
        ctx.fillText(lbl, pX(1, fy) + 10, yLabel);
      });
      // STUMPS label
      ctx.font      = `900 18px 'Trebuchet MS', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 2;
      ctx.strokeText('STUMPS', pX(1, 0.073) + 10, pY(0.073) - 10);
      ctx.fillText('STUMPS', pX(1, 0.073) + 10, pY(0.073) - 10);
      ctx.restore();

      // 7. stumps — striker end only (no stumps in short / bowler crease band)
      drawStumps(ctx, 0.052, pX, pY);

      // 8. ball markers (dynamic layer only — static pitch already drawn above)
      if (animRef.current && deliveries.length > 0) frameRef.current++;
      const laidOut = computeBallLayout(deliveries, pX, pY);
      drawBalls(ctx, frameRef.current, laidOut);

      if (animRef.current && deliveries.length > 0) {
        rafRef.current = requestAnimationFrame(render);
      }
    };

    render();
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [deliveries, W, H, pX, pY]);

  // ── mouse handlers ─────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    const cv = canvasRef.current;
    const tt = tooltipRef.current;
    if (!cv || !tt) return;
    const rect = cv.getBoundingClientRect();
    const scX  = W / rect.width;
    const scY  = H / rect.height;
    const mx   = (e.clientX - rect.left) * scX;
    const my   = (e.clientY - rect.top)  * scY;

    const laidOut = computeBallLayout(deliveries, pX, pY);
    const hit = laidOut.find(b => {
      const sx = b.sx;
      const sy = b.sy;
      const sc = 0.52 + b.fyAdj * 0.64;
      return Math.hypot(sx - mx, sy - my) < 14 * sc;
    });

    if (hit) {
      const sx  = hit.sx, sy = hit.sy;
      const zl  = ZONES.find(z => z.id === hit.zone)?.label || hit.zone;
      const ol  = hit.outcome === 'dot' ? 'Dot ball'
                : hit.outcome === 'W'   ? 'Wicket'
                : hit.outcome + ' run' + (hit.outcome === '1' ? '' : 's');
      tt.style.left    = (sx / scX + 14) + 'px';
      tt.style.top     = (sy / scY - 36) + 'px';
      tt.textContent   = `Ball #${hit.id}  ·  ${zl}  ·  ${ol}`;
      tt.style.opacity = '1';
      cv.style.cursor  = onBallClick ? 'pointer' : 'default';
    } else {
      tt.style.opacity = '0';
      cv.style.cursor  = 'crosshair';
    }
  }, [deliveries, W, H, pX, pY, onBallClick]);

  const handleClick = useCallback((e) => {
    if (!onBallClick) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const scX  = W / rect.width;
    const scY  = H / rect.height;
    const mx   = (e.clientX - rect.left) * scX;
    const my   = (e.clientY - rect.top)  * scY;
    const laidOut = computeBallLayout(deliveries, pX, pY);
    const hit  = laidOut.find(b => {
      const sx = b.sx;
      const sy = b.sy;
      const sc = 0.52 + b.fyAdj * 0.64;
      return Math.hypot(sx - mx, sy - my) < 14 * sc;
    });
    if (hit) onBallClick(hit);
  }, [deliveries, W, H, pX, pY, onBallClick]);

  // ── JSX ────────────────────────────────────────────────────────────────
  return (
    React.createElement('div', {
      style: {
        position:     'relative',
        display:      'inline-block',
        background:   '#061508',
        borderRadius: 14,
        overflow:     'hidden',
      }
    },
      React.createElement('canvas', {
        ref:         canvasRef,
        width:       W,
        height:      H,
        style:       { display: 'block', width: '100%' },
        onMouseMove: handleMouseMove,
        onMouseLeave: () => { if (tooltipRef.current) tooltipRef.current.style.opacity = '0'; },
        onClick:     handleClick,
      }),
      React.createElement('div', {
        ref:   tooltipRef,
        style: {
          position:      'absolute',
          background:    'rgba(0,0,0,0.92)',
          border:        '1px solid rgba(255,255,255,0.18)',
          borderRadius:  8,
          padding:       '5px 12px',
          fontSize:      13,
          fontFamily:    "'Trebuchet MS', sans-serif",
          fontWeight:    700,
          letterSpacing: '.04em',
          color:         '#fff',
          pointerEvents: 'none',
          opacity:       0,
          transition:    'opacity .15s',
          whiteSpace:    'nowrap',
          zIndex:        30,
          top:           0,
          left:          0,
        }
      }),
      deliveries.length === 0
        ? React.createElement(
            'div',
            {
              style: {
                position: 'absolute',
                left: '50%',
                top: '54%',
                transform: 'translate(-50%, -50%)',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.26)',
                pointerEvents: 'none',
                fontFamily: "'Trebuchet MS', sans-serif",
                zIndex: 4,
              },
            },
            'No shots yet',
          )
        : null,
    )
  );
}

window.PitchMap = PitchMap;

// ── standalone draw functions (no JSX dependency) ────────────────────────

function drawStumps(ctx, fy, pX, pY) {
  const sc  = 0.46 + fy * 0.66;
  const mx  = pX(0.5, fy);
  const my  = pY(fy);
  const stH = 54 * sc;

  ctx.save();
  // ground shadow
  ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(mx + 6 * sc, my + 2, 18 * sc, 4.5 * sc, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 3 stump bodies
  [-7.5, 0, 7.5].forEach(ox => {
    ctx.fillStyle = '#e8e0c0';
    ctx.fillRect(mx + ox * sc - 2.4 * sc, my - stH, 4.8 * sc, stH);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(mx + ox * sc - 2.4 * sc, my - stH, 1.4 * sc, stH);
  });

  // bails
  ctx.fillStyle = '#f0d060';
  ctx.fillRect(mx - 11 * sc, my - stH - 1.5, 22 * sc, 4.5 * sc);
  ctx.beginPath(); ctx.arc(mx - 11 * sc, my - stH + 1, 2.2 * sc, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + 11 * sc, my - stH + 1, 2.2 * sc, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBalls(ctx, t, deliveries) {
  deliveries.forEach(b => {
    const pulse = Math.sin(t * 0.055 + b.id * 1.9) * 0.5 + 0.5;
    const sx    = b.sx;
    const sy    = b.sy;
    const sc    = 0.62 + b.fyAdj * 0.68;
    const core  = ballColor(b.outcome);
    const bR    = 13 * sc;
    const rR    = (18 + pulse * 12) * sc;

    ctx.save();
    // outer ripple
    ctx.globalAlpha = 0.2 + pulse * 0.22;
    ctx.fillStyle   = core;
    ctx.beginPath(); ctx.arc(sx, sy, rR, 0, Math.PI * 2); ctx.fill();
    // mid glow
    ctx.globalAlpha = 0.52 + pulse * 0.14;
    ctx.beginPath(); ctx.arc(sx, sy, (bR + 4) * sc, 0, Math.PI * 2); ctx.fill();
    // core ball
    ctx.globalAlpha = 1;
    const rg = ctx.createRadialGradient(sx - bR * 0.3, sy - bR * 0.35, bR * 0.08, sx, sy, bR);
    rg.addColorStop(0, lightenHex(core, 0.55));
    rg.addColorStop(1, core);
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(sx, sy, bR, 0, Math.PI * 2); ctx.fill();
    // ring
    ctx.strokeStyle = 'rgba(255,255,255,0.96)';
    ctx.lineWidth   = 2.5 * sc;
    ctx.beginPath(); ctx.arc(sx, sy, bR, 0, Math.PI * 2); ctx.stroke();
    // id number
    ctx.strokeStyle  = 'rgba(255,255,255,0.9)';
    ctx.lineWidth    = Math.max(1.3, 1.7 * sc);
    ctx.fillStyle    = '#111';
    ctx.font         = `900 ${Math.round(12 * sc)}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(b.id, sx, sy + 0.5);
    ctx.fillText(b.id, sx, sy + 0.5);
    ctx.restore();
  });
}
