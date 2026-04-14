/**
 * wagonWheel.js — CrickEye Pro
 *
 * Changes in this version:
 *  - Added flick + sweep to SHOT_CONFIG_LEFT and SHOT_CONFIG_RIGHT
 *  - flick = mid-wicket (mid leg side), sweep = square leg (low leg side)
 *  - pull stays high/backward leg side — angles unchanged
 *  - zoneHits, clearAll, setHand all updated to include flick + sweep
 *  - drawHeatZones extended to cover all 5 shot types
 *  - forceHand() in app.js guarantees wheel is correct BEFORE drawSpoke fires
 *
 *  UI v6: Field colors updated to lighter, more vivid palette (matches light theme).
 */

const WagonWheel = (() => {

  let canvas, ctx;
  let cx, cy, radius;
  let pitchW, pitchH;
  let impactX, impactY;

  // ── Angle reference (canvas degrees, 0 = top/straight, clockwise) ──────────
  const SHOT_CONFIG_LEFT = {
    straight: { min: 170, max: 190, color: '#06B6D4', glowColor: 'rgba(6,182,212,0.5)'   },
    pull:     { min: 295, max: 330, color: '#F97316', glowColor: 'rgba(249,115,22,0.5)'  },
    cover:    { min: 115, max: 150, color: '#10B981', glowColor: 'rgba(16,185,129,0.5)'  },
    flick:    { min: 275, max: 305, color: '#A855F7', glowColor: 'rgba(168,85,247,0.5)'  },
    sweep:    { min: 250, max: 285, color: '#EAB308', glowColor: 'rgba(234,179,8,0.5)'   },
  };

  const SHOT_CONFIG_RIGHT = {
    straight: { min: 170, max: 190, color: '#06B6D4', glowColor: 'rgba(6,182,212,0.5)'   },
    cover:    { min: 210, max: 245, color: '#10B981', glowColor: 'rgba(16,185,129,0.5)'  },
    pull:     { min: 30,  max: 65,  color: '#F97316', glowColor: 'rgba(249,115,22,0.5)'  },
    flick:    { min: 55,  max: 85,  color: '#A855F7', glowColor: 'rgba(168,85,247,0.5)'  },
    sweep:    { min: 75,  max: 110, color: '#EAB308', glowColor: 'rgba(234,179,8,0.5)'   },
  };

  let currentHand = 'left';
  let SHOT_CONFIG  = SHOT_CONFIG_LEFT;

  const spokes   = [];
  const zoneHits = { cover: 0, straight: 0, pull: 0, flick: 0, sweep: 0 };
  let hoveredSpoke = null;

  function toCanvasAngle(deg) { return (deg - 90) * (Math.PI / 180); }
  function randomAngle(min, max) { return Math.random() * (max - min) + min; }
  function randomDistance()      { return 0.70 + Math.random() * 0.30; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || hex.length !== 7) {
      return `rgba(255,255,255,${alpha})`;
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ── Field ──────────────────────────────────────────────────────────────────
  function drawField() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Lighter, more vivid green field — matches image 2 style
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0,    '#2d7a45');
    grad.addColorStop(0.40, '#256838');
    grad.addColorStop(0.70, '#1e5a30');
    grad.addColorStop(1,    '#174825');
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Mowing stripes (lighter contrast)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
    ctx.clip();
    const sw = radius * 0.13;
    const ns = Math.ceil((radius * 2) / sw) + 2;
    for (let i = 0; i < ns; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(cx - radius - sw + i * sw, cy - radius, sw, radius * 2);
      }
    }
    ctx.restore();

    // Boundary
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 30-yard circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.54, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Outer ring (75%)
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.77, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 9]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pitch area halo
    const pitchHalo = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.23);
    pitchHalo.addColorStop(0, 'rgba(210,180,100,0.15)');
    pitchHalo.addColorStop(1, 'rgba(210,180,100,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.23, 0, Math.PI * 2);
    ctx.fillStyle = pitchHalo;
    ctx.fill();

    // Off/Leg split line
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 7]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Side labels — same soft mint color both sides, matching pic 5
    const lf = Math.max(11, radius * 0.088);
    ctx.save();
    ctx.font = `600 ${lf}px 'Manrope', 'Arial', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const leftLabel  = currentHand === 'left' ? 'LEG' : 'OFF';
    const rightLabel = currentHand === 'left' ? 'OFF' : 'LEG';
    // Soft mint-green matching pic 5 — readable but not distracting
    const labelColor = 'rgba(134,200,180,0.88)';

    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur  = 3;

    ctx.fillStyle = labelColor;
    ctx.fillText(leftLabel,  cx - radius * 0.60, cy - lf * 0.55);
    ctx.fillText('SIDE',     cx - radius * 0.60, cy + lf * 0.75);

    ctx.fillStyle = labelColor;
    ctx.fillText(rightLabel, cx + radius * 0.60, cy - lf * 0.55);
    ctx.fillText('SIDE',     cx + radius * 0.60, cy + lf * 0.75);

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Heat Zones — all 5 shot types ─────────────────────────────────────────
  function drawHeatZones() {
    const ZONE_DEFS = {
      left: {
        cover:    { midAngle: 132.5, rgb: '6,182,212'   },
        straight: { midAngle: 180,   rgb: '16,185,129'  },
        pull:     { midAngle: 312.5, rgb: '249,115,22'  },
        flick:    { midAngle: 290,   rgb: '168,85,247'  },
        sweep:    { midAngle: 267.5, rgb: '234,179,8'   },
      },
      right: {
        cover:    { midAngle: 227.5, rgb: '6,182,212'   },
        straight: { midAngle: 180,   rgb: '16,185,129'  },
        pull:     { midAngle: 47.5,  rgb: '249,115,22'  },
        flick:    { midAngle: 70,    rgb: '168,85,247'  },
        sweep:    { midAngle: 92.5,  rgb: '234,179,8'   },
      },
    };

    const zones = ZONE_DEFS[currentHand];

    Object.entries(zones).forEach(([type, def]) => {
      const hits = zoneHits[type] || 0;
      if (hits === 0) return;

      const intensity = Math.min(hits / 3, 1);
      const midRad    = toCanvasAngle(def.midAngle);
      const spread    = (Math.PI / 180) * 38;
      const outerR    = radius * 0.91;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(impactX, impactY);
      ctx.arc(cx, cy, outerR, midRad - spread / 2, midRad + spread / 2);
      ctx.closePath();

      const zg = ctx.createRadialGradient(
        impactX, impactY, radius * 0.05,
        impactX, impactY, outerR
      );
      zg.addColorStop(0,   `rgba(${def.rgb},0)`);
      zg.addColorStop(0.3, `rgba(${def.rgb},${0.08 * intensity})`);
      zg.addColorStop(0.7, `rgba(${def.rgb},${0.18 * intensity})`);
      zg.addColorStop(1,   `rgba(${def.rgb},0)`);
      ctx.fillStyle = zg;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, outerR * 0.87, midRad - spread / 2, midRad + spread / 2);
      ctx.strokeStyle = `rgba(${def.rgb},${0.45 * intensity})`;
      ctx.lineWidth   = 2.5 + hits * 1.5;
      ctx.shadowColor = `rgba(${def.rgb},0.8)`;
      ctx.shadowBlur  = 10 + 6 * intensity;
      ctx.stroke();
      ctx.shadowBlur  = 0;
      ctx.restore();
    });
  }

  // ── Pitch ──────────────────────────────────────────────────────────────────
  function drawPitch() {
    const x = cx - pitchW / 2;
    const y = cy - pitchH / 2;

    const pg = ctx.createLinearGradient(x, y, x + pitchW, y + pitchH);
    pg.addColorStop(0,    '#d4b478');
    pg.addColorStop(0.25, '#eaccaa');
    pg.addColorStop(0.5,  '#f0d48e');
    pg.addColorStop(0.75, '#e2be82');
    pg.addColorStop(1,    '#d4b478');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, pitchW, pitchH, 3);
    ctx.fillStyle = pg;
    ctx.fill();

    // Wear cracks
    ctx.strokeStyle = 'rgba(130,90,40,0.22)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 8; i++) {
      const ly = y + pitchH * (i / 9);
      ctx.beginPath();
      ctx.moveTo(x + 2, ly);
      ctx.bezierCurveTo(
        x + pitchW * 0.3, ly + (i % 2 === 0 ? 1 : -1),
        x + pitchW * 0.7, ly + (i % 3 === 0 ? -1 : 0.5),
        x + pitchW - 2,   ly + (i % 2 === 0 ? -0.5 : 0.5)
      );
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.roundRect(x, y, pitchW, pitchH, 3);
    ctx.strokeStyle = 'rgba(200,160,80,0.65)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    const creaseN = pitchH * 0.16;
    const creaseS = pitchH * 0.84;
    const ext = 5;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - ext, y + creaseN);
    ctx.lineTo(x + pitchW + ext, y + creaseN);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - ext, y + creaseS);
    ctx.lineTo(x + pitchW + ext, y + creaseS);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + pitchH * 0.23);
    ctx.lineTo(x + pitchW - 1, y + pitchH * 0.23);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 1, y + pitchH * 0.77);
    ctx.lineTo(x + pitchW - 1, y + pitchH * 0.77);
    ctx.stroke();
    ctx.restore();

    drawStumps(cx, y + creaseN, true);
    drawStumps(cx, y + creaseS, false);
  }

  function drawStumps(x, y, isBatsman) {
    const sp  = pitchW * 0.22;
    const sh  = pitchH * 0.09;
    const dir = isBatsman ? -1 : 1;

    ctx.save();
    ctx.strokeStyle = isBatsman ? 'rgba(255,215,80,0.9)' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth   = 1.4;
    ctx.shadowColor = isBatsman ? 'rgba(255,200,50,0.7)' : 'rgba(255,255,255,0.3)';
    ctx.shadowBlur  = isBatsman ? 7 : 3;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * sp, y);
      ctx.lineTo(x + i * sp, y + dir * sh);
      ctx.stroke();
    }
    ctx.strokeStyle = isBatsman ? 'rgba(255,200,80,0.9)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - sp, y + dir * sh * 0.82);
    ctx.lineTo(x + sp, y + dir * sh * 0.82);
    ctx.stroke();
    ctx.restore();
  }

  // ── Impact point ──────────────────────────────────────────────────────────
  function drawImpactPoint() {
    ctx.save();
    const og = ctx.createRadialGradient(impactX, impactY, 2, impactX, impactY, 10);
    og.addColorStop(0, 'rgba(255,59,59,0.45)');
    og.addColorStop(1, 'rgba(255,59,59,0)');
    ctx.beginPath();
    ctx.arc(impactX, impactY, 10, 0, Math.PI * 2);
    ctx.fillStyle = og;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(impactX, impactY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle   = '#ff3b3b';
    ctx.shadowColor = 'rgba(255,59,59,0.8)';
    ctx.shadowBlur  = 12;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(impactX, impactY, 1.5, 0, Math.PI * 2);
    ctx.fillStyle  = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 0;
    ctx.fill();
    ctx.restore();
  }

  // ── Spoke animation ───────────────────────────────────────────────────────
  function animateSpoke(shotType, shotScore, headStability, batSpeed, angleDeg, color, glow, distanceFactor, onDone) {
    const angleRad = toCanvasAngle(angleDeg);
    const spokeEnd = radius * 0.92 * distanceFactor;
    const endX     = cx + Math.cos(angleRad) * spokeEnd;
    const endY     = cy + Math.sin(angleRad) * spokeEnd;
    const startX   = impactX;
    const startY   = impactY;
    const FRAMES   = 9;
    let frame      = 0;
    const safeScore = clamp(Number(shotScore) || 0, 0, 10);
    const safeHead = clamp(Number(headStability) || 0, 0, 100);
    const safeSpeed = Number(batSpeed) || 0;
    const lineW = 1.5 + (safeScore / 10) * 3.5;
    const alpha = Math.max(0.25, safeHead / 100);
    const strokeColor = hexToRgba(color, alpha);

    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    function step() {
      frame++;
      const progress = easeOut(frame / FRAMES);
      const curX = startX + (endX - startX) * progress;
      const curY = startY + (endY - startY) * progress;

      redrawAll();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(curX, curY);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth   = lineW;
      ctx.shadowColor = glow;
      ctx.shadowBlur  = 14;
      ctx.lineCap     = 'round';
      ctx.stroke();

      const tipR = 3.5 + (1 - frame / FRAMES) * 3.5;
      ctx.beginPath();
      ctx.arc(curX, curY, tipR, 0, Math.PI * 2);
      ctx.fillStyle   = strokeColor;
      ctx.shadowColor = glow;
      ctx.shadowBlur  = 22;
      ctx.fill();
      ctx.restore();

      if (frame < FRAMES) {
        requestAnimationFrame(step);
      } else {
        spokes.push({
          angleDeg, color, glow, distanceFactor, endX, endY,
          shotType, shotScore: safeScore, headStability: safeHead, batSpeed: safeSpeed,
          lineW, alpha,
        });
        redrawAll();
        if (onDone) onDone();
      }
    }
    requestAnimationFrame(step);
  }

  function drawAllSpokes() {
    spokes.forEach(sp => {
      const strokeColor = hexToRgba(sp.color, sp.alpha != null ? sp.alpha : 0.75);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(impactX, impactY);
      ctx.lineTo(sp.endX, sp.endY);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth   = sp.lineW || 2.5;
      ctx.shadowColor = sp.glow;
      ctx.shadowBlur  = 10;
      ctx.lineCap     = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sp.endX, sp.endY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle   = strokeColor;
      ctx.shadowColor = sp.glow;
      ctx.shadowBlur  = 16;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sp.endX, sp.endY, 1.5, 0, Math.PI * 2);
      ctx.fillStyle  = 'rgba(255,255,255,0.85)';
      ctx.shadowBlur = 0;
      ctx.fill();
      ctx.restore();
    });
  }

  function drawTooltip(sp) {
    if (!sp) return;
    const type = String(sp.shotType || '').toUpperCase() || 'SHOT';
    const score = Number(sp.shotScore || 0).toFixed(1);
    const head = Math.round(Number(sp.headStability || 0));
    const swing = Math.round(Number(sp.batSpeed || 0));
    const line1 = `${type}  ·  ${score}/10`;
    const line2 = `Head ${head}  ·  Swing ${swing}`;

    ctx.save();
    ctx.font = "600 11px 'Manrope', Arial, sans-serif";
    const w = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width) + 24;
    const h = 46;
    let x = sp.endX + 12;
    let y = sp.endY - h - 10;
    if (x + w > canvas.width / (window.devicePixelRatio || 1) - 8) x = sp.endX - w - 12;
    if (y < 8) y = sp.endY + 10;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    const dotColor = sp.shotScore >= 8 ? '#10B981' : sp.shotScore >= 6 ? '#06B6D4' : sp.shotScore >= 4 ? '#EAB308' : '#EF4444';
    ctx.beginPath();
    ctx.arc(x + 10, y + 14, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();

    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(line1, x + 18, y + 18);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(line2, x + 10, y + 35);
    ctx.restore();
  }

  function redrawAll() {
    drawField();
    drawHeatZones();
    drawAllSpokes();
    drawPitch();
    drawImpactPoint();
    drawTooltip(hoveredSpoke);
  }

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize() {
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width - 32, 420);
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);
    cx = size / 2;
    cy = size / 2;

    radius = Math.min(canvas.width / dpr, canvas.height / dpr) * 0.48;
    pitchW = size * 0.085;
    pitchH = size * 0.38;

    const pitchTop     = cy - pitchH / 2;
    const creaseOffset = pitchH * 0.16;
    impactX = cx;
    impactY = pitchTop + creaseOffset + 8;

    spokes.forEach(sp => {
      const ar = toCanvasAngle(sp.angleDeg);
      const se = radius * 0.92 * sp.distanceFactor;
      sp.endX = cx + Math.cos(ar) * se;
      sp.endY = cy + Math.sin(ar) * se;
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    resize();
    redrawAll();
    canvas.addEventListener('mousemove', (evt) => {
      const rect = canvas.getBoundingClientRect();
      const mx = evt.clientX - rect.left;
      const my = evt.clientY - rect.top;
      hoveredSpoke = null;
      for (let i = spokes.length - 1; i >= 0; i--) {
        const sp = spokes[i];
        const dx = mx - sp.endX;
        const dy = my - sp.endY;
        if (Math.hypot(dx, dy) <= 10) {
          hoveredSpoke = sp;
          break;
        }
      }
      redrawAll();
    });
    canvas.addEventListener('mouseleave', () => {
      hoveredSpoke = null;
      redrawAll();
    });
    window.addEventListener('resize', () => { resize(); redrawAll(); });
  }

  function setHand(hand) {
    if (hand === currentHand) return;
    currentHand = hand;
    SHOT_CONFIG  = hand === 'right' ? SHOT_CONFIG_RIGHT : SHOT_CONFIG_LEFT;
    // Clear previous session marks
    hoveredSpoke = null;
    spokes.length = 0;
    zoneHits.cover = zoneHits.straight = zoneHits.pull =
    zoneHits.flick = zoneHits.sweep    = 0;
    redrawAll();
  }

  function drawSpoke(shotType, shotScore, headStability, batSpeed, onDone) {
    const cfg = SHOT_CONFIG[shotType];
    if (!cfg) {
      console.warn(`[WagonWheel] Unknown shot type: "${shotType}" for hand: ${currentHand}`);
      if (onDone) onDone();
      return;
    }
    if (zoneHits[shotType] !== undefined) zoneHits[shotType]++;
    const angle = randomAngle(cfg.min, cfg.max);
    const dist  = randomDistance();
    animateSpoke(shotType, shotScore, headStability, batSpeed, angle, cfg.color, cfg.glowColor, dist, onDone);
  }

  function clearAll() {
    hoveredSpoke = null;
    spokes.length = 0;
    zoneHits.cover = zoneHits.straight = zoneHits.pull =
    zoneHits.flick = zoneHits.sweep    = 0;
    redrawAll();
  }

  function getSpokeCount() { return spokes.length; }
  function getCurrentHand() { return currentHand; }

  return { init, drawSpoke, clearAll, getSpokeCount, setHand, getCurrentHand };

})();