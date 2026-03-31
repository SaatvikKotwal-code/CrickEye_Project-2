/**
 * ReportModal.js — CrickEye Pro
 * Self-contained report modal. No external dependencies beyond what app.js already has.
 * Call: ReportModal.open(state, sessionAnalysis)
 * Close: ReportModal.close()
 *
 * CHANGES vs previous version:
 *   - bars[0] Bat Speed: unit 'px/s' → 'km/h', max 400 → 140
 *   - buildModal subtitle: 'px/s' → 'km/h'
 *   - buildLineGraph speed call: label + maxVal 400 → 140
 *   - buildMetricCards Bat Speed: what/how updated to km/h calibration copy
 */

const ReportModal = (() => {

  const SHOT_LABELS = {
    cover:'Cover Drive', straight:'Straight Drive',
    pull:'Pull Shot', flick:'Flick', sweep:'Sweep',
  };
  const SHOT_COLORS = {
    cover:'#06B6D4', straight:'#10B981',
    pull:'#F97316', flick:'#A855F7', sweep:'#EAB308',
  };
  const QUALITY_COLORS = {
    Excellent:'#10B981', Good:'#06B6D4', Average:'#EAB308', Poor:'#EF4444',
  };
  const FOOTWORK_LABELS = {
    front_foot:'Front Foot', back_foot:'Back Foot', neutral:'Neutral',
  };
  const FLAG_INFO = {
    HEAD_MOVING:      { label:'Head Moving',     color:'#EF4444', desc:'Your head moved significantly during this shot, reducing timing accuracy and consistency.' },
    UNSTABLE:         { label:'Unstable',         color:'#EF4444', desc:'High body sway was detected — balance was poor through the stroke execution.' },
    FOOTWORK_UNCLEAR: { label:'Footwork Unclear', color:'#EAB308', desc:'Foot position was ambiguous — could not determine front/back foot clearly from pose data.' },
  };

  // ── SVG Pie/Donut chart ──────────────────────────────────
  function buildPieChart(value, color, label, sublabel) {
    const pct = Math.min(100, Math.max(0, value));
    const R = 52, cx = 64, cy = 64;
    const circ = 2 * Math.PI * R;
    const offset = circ * (1 - pct / 100);
    const quality = pct >= 70 ? 'Good' : pct >= 45 ? 'Average' : 'Needs Work';
    const qc = pct >= 70 ? '#10B981' : pct >= 45 ? '#EAB308' : '#EF4444';
    return `
      <div class="rp-pie-wrap">
        <svg width="128" height="128" viewBox="0 0 128 128">
          <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="10"/>
          <circle cx="${cx}" cy="${cy}" r="${R}" fill="none"
            stroke="${color}" stroke-width="10" stroke-linecap="round"
            stroke-dasharray="${circ}" stroke-dashoffset="${circ}"
            transform="rotate(-90 ${cx} ${cy})"
            class="rp-pie-arc" data-offset="${offset}" style="transition:stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)"/>
          <text x="${cx}" y="${cy - 8}" text-anchor="middle"
            style="font-family:Manrope,sans-serif;font-size:22px;font-weight:800;fill:${color}">${Math.round(pct)}</text>
          <text x="${cx}" y="${cy + 12}" text-anchor="middle"
            style="font-family:Inter,sans-serif;font-size:10px;fill:#94A3B8">out of 100</text>
        </svg>
        <div class="rp-pie-label">${label}</div>
        <div class="rp-pie-quality" style="color:${qc}">${quality}</div>
        <div class="rp-pie-sublabel">${sublabel}</div>
      </div>`;
  }

  // ── SVG Line graph ───────────────────────────────────────
  function buildLineGraph(shots, dataKey, color, label, maxVal) {
    if (!shots || shots.length === 0) return `<div class="rp-graph-empty">No data</div>`;
    const W = 520, H = 130, PL = 40, PR = 16, PT = 12, PB = 28;
    const cW = W - PL - PR, cH = H - PT - PB;
    const max = maxVal || Math.max(...shots.map(s => s[dataKey] || 0), 1);
    const pts = shots.map((s, i) => {
      const x = PL + (shots.length === 1 ? cW / 2 : (i / (shots.length - 1)) * cW);
      const y = PT + cH - Math.max(0, Math.min(1, (s[dataKey] || 0) / max)) * cH;
      return { x, y, v: s[dataKey] || 0, lbl: `#${s.shot_num}` };
    });

    const linePath = pts.reduce((acc, pt, i) => {
      if (i === 0) return `M${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      const prev = pts[i - 1];
      const cpx = ((prev.x + pt.x) / 2).toFixed(1);
      return `${acc} C${cpx},${prev.y.toFixed(1)} ${cpx},${pt.y.toFixed(1)} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    }, '');

    const areaPath = linePath +
      ` L${pts[pts.length - 1].x.toFixed(1)},${(PT + cH).toFixed(1)}` +
      ` L${pts[0].x.toFixed(1)},${(PT + cH).toFixed(1)} Z`;

    const ticks = [0, 0.5, 1].map(t => ({
      y: (PT + cH - t * cH).toFixed(1),
      v: Math.round(t * max)
    }));

    const gradId = `grad_${dataKey}_${Math.random().toString(36).slice(2,6)}`;

    return `
      <div class="rp-graph-wrap">
        <div class="rp-graph-title">${label}</div>
        <svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.2"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0.01"/>
            </linearGradient>
          </defs>
          ${ticks.map(t => `
            <line x1="${PL}" y1="${t.y}" x2="${PL + cW}" y2="${t.y}" stroke="rgba(0,0,0,0.07)" stroke-width="1"/>
            <text x="${PL - 5}" y="${t.y}" text-anchor="end" dominant-baseline="central"
              style="font-size:9px;fill:#94A3B8;font-family:JetBrains Mono,monospace">${t.v}</text>
          `).join('')}
          <path d="${areaPath}" fill="url(#${gradId})"/>
          <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          ${pts.map(pt => `
            <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4" fill="${color}" opacity="0.25"/>
            <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="2.5" fill="${color}"/>
            <text x="${pt.x.toFixed(1)}" y="${(PT + cH + 16).toFixed(1)}" text-anchor="middle"
              style="font-size:9px;fill:#94A3B8;font-family:JetBrains Mono,monospace">${pt.lbl}</text>
            <title>${pt.lbl}: ${pt.v}</title>
          `).join('')}
        </svg>
      </div>`;
  }

  // ── Shot card (full detail) ──────────────────────────────
  function buildShotCard(shot) {
    const color = SHOT_COLORS[shot.label] || '#888';
    const score = shot.shot_score || 0;
    const sc = score >= 7 ? '#10B981' : score >= 5 ? '#06B6D4' : score >= 3 ? '#EAB308' : '#EF4444';
    const qc = QUALITY_COLORS[shot.shot_quality] || '#888';
    const conf = Math.round((shot.conf || 0) * 100);
    const flags = shot.flags || [];

    const bars = [
      // CHANGED: unit px/s → km/h, max 400 → 140, value uses toFixed(1), desc updated
      { label: 'Bat Speed', value: (shot.peak_swing_speed || 0).toFixed(1), max: 140, color: '#17B890', unit: 'km/h', desc: 'Bat tip speed in km/h — calibrated using shoulder-width pixel ruler at 30fps.' },
      { label: 'Head Discipline', value: Math.round(shot.head_stability || 0), max: 100, color: '#6C63FF', unit: '/100', desc: 'How still your head stayed — critical for timing and eye on ball' },
      { label: 'Stability', value: Math.round(shot.stability_score || 0), max: 100, color: '#FF6B35', unit: '/100', desc: 'Body balance through the stroke — prevents mistimed shots' },
    ];

    return `
      <div class="rp-shot-card" style="--shot-col:${color}; border-left:4px solid ${color}">
        <div class="rp-shot-header">
          <div class="rp-shot-left">
            <span class="rp-shot-num">#${shot.shot_num}</span>
            <span class="rp-shot-name" style="color:${color}">${(SHOT_LABELS[shot.label] || shot.label || '—').toUpperCase()}</span>
            <span class="rp-shot-conf" style="color:${color};background:${color}18;border:1px solid ${color}40">${conf}%</span>
          </div>
          <div class="rp-shot-right">
            <span class="rp-shot-time">${shot.timestamp || '—'}</span>
            <span class="rp-shot-quality" style="color:${qc};background:${qc}18">${shot.shot_quality || '—'}</span>
            <span class="rp-shot-score" style="color:${sc}">${score}<span style="font-size:11px;opacity:0.6">/10</span></span>
          </div>
        </div>
        ${flags.length ? `
          <div class="rp-shot-flags">
            ${flags.map(f => {
              const fi = FLAG_INFO[f] || { label: f, color: '#888', desc: '' };
              return `<span class="rp-flag" style="color:${fi.color};background:${fi.color}18" title="${fi.desc}">${fi.label}</span>`;
            }).join('')}
          </div>` : ''}
        <div class="rp-shot-bars">
          ${bars.map(b => `
            <div class="rp-bar-row">
              <div class="rp-bar-meta">
                <span class="rp-bar-label" title="${b.desc}">${b.label}</span>
                <span class="rp-bar-val" style="color:${b.color}">${b.value}<span style="font-size:10px;opacity:0.7">${b.unit}</span></span>
              </div>
              <div class="rp-bar-track">
                <div class="rp-bar-fill" style="width:${Math.min(100,(b.value/b.max)*100).toFixed(1)}%;background:${b.color}"></div>
              </div>
            </div>`).join('')}
        </div>
        <div class="rp-shot-score-row">
          <span class="rp-bar-label">Overall Shot Score</span>
          <div class="rp-bar-track" style="flex:1;margin:0 12px">
            <div class="rp-bar-fill" style="width:${score*10}%;background:${sc}"></div>
          </div>
          <span style="font-family:Manrope,sans-serif;font-size:1rem;font-weight:800;color:${sc}">${score}<span style="font-size:11px;opacity:0.6">/10</span></span>
        </div>
        ${flags.length ? `
          <div class="rp-shot-flags-detail">
            ${flags.map(f => {
              const fi = FLAG_INFO[f] || { label: f, color: '#888', desc: 'No description available.' };
              return `<div class="rp-flag-detail" style="border-left:3px solid ${fi.color}"><strong style="color:${fi.color}">${fi.label}:</strong> ${fi.desc}</div>`;
            }).join('')}
          </div>` : ''}
      </div>`;
  }

  // ── Metric explainer cards ───────────────────────────────
  function buildMetricCards() {
    const metrics = [
      {
        icon: '🏏', color: '#F97316', title: 'Power Score',
        what: 'Measures bat speed across all shots in the session, normalised to a 0–100 score.',
        how: 'Based on calibrated bat tip speed in km/h. 100/100 = 140 km/h (elite T20 power hitting). Typical club level sits around 60–75/100.',
        tip: 'Work on hip rotation and weight transfer through the shot to increase bat speed.',
      },
      {
        icon: '👁️', color: '#06B6D4', title: 'Head Discipline',
        what: 'Tracks how still your head and eyes remain from ball-watch to impact.',
        how: 'Uses nose and ear keypoints to measure lateral and vertical head movement. Score of 80+ is excellent.',
        tip: 'Consciously watch the ball all the way onto the bat. Use a fixed eye-level drill in practice.',
      },
      {
        icon: '⚖️', color: '#10B981', title: 'Stability Score',
        what: 'Measures body balance and minimal sway through the full stroke cycle.',
        how: 'Tracks shoulder and hip centre-of-mass deviation. High sway = low score. 70+ is solid.',
        tip: 'A strong base stance with bent knees and balanced weight helps significantly.',
      },
      {
        icon: '⚡', color: '#A855F7', title: 'Bat Speed',
        // CHANGED: what and how updated to km/h calibration copy
        what: 'Peak bat tip speed in km/h at moment of impact.',
        how: 'Calibrated using shoulder-width as a pixel ruler (0.45m average). Wrist velocity × fps × metres-per-pixel × 0.95 tip multiplier. Capped at 130 km/h. Elite T20 players average 100–120 km/h.',
        tip: 'Strength training for forearms and wrists combined with a loose grip generates more speed.',
      },
      {
        icon: '🦶', color: '#EAB308', title: 'Footwork',
        what: 'Classifies which foot you lead with — front foot, back foot, or neutral stance.',
        how: 'Analysed from ankle and knee keypoint positions relative to the crease at shot onset.',
        tip: 'Reading the length early and committing decisively to either front or back foot is key.',
      },
      {
        icon: '🎯', color: '#EF4444', title: 'Shot Score (/10)',
        what: 'A composite rating combining all metrics into a single quality score per shot.',
        how: 'Weighted: 40% bat speed, 25% head discipline, 35% stability. 8+ = Excellent, 6–7.9 = Good, 4–5.9 = Average, <4 = Poor.',
        tip: 'Focus on the metric with the lowest contribution to your score first for maximum improvement.',
      },
    ];
    return metrics.map(m => `
      <div class="rp-metric-card" style="border-top:3px solid ${m.color}">
        <div class="rp-metric-icon">${m.icon}</div>
        <div class="rp-metric-title" style="color:${m.color}">${m.title}</div>
        <div class="rp-metric-section"><span class="rp-metric-tag">What it measures</span><p>${m.what}</p></div>
        <div class="rp-metric-section"><span class="rp-metric-tag">How it's calculated</span><p>${m.how}</p></div>
        <div class="rp-metric-section"><span class="rp-metric-tag" style="background:${m.color}18;color:${m.color}">Coaching tip</span><p>${m.tip}</p></div>
      </div>`).join('');
  }

  // ── Inject styles ────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('rp-styles')) return;
    const style = document.createElement('style');
    style.id = 'rp-styles';
    style.textContent = `
/* ═══ REPORT MODAL OVERLAY ═══ */
.rp-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(8,12,20,0.75);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
  animation: rpFadeIn 0.3s ease;
}
@keyframes rpFadeIn { from{opacity:0} to{opacity:1} }

.rp-modal {
  background: #F0F4F8;
  border-radius: 20px;
  width: 100%; max-width: 960px;
  max-height: 92vh;
  display: flex; flex-direction: column;
  box-shadow: 0 32px 80px rgba(0,0,0,0.35);
  animation: rpSlideUp 0.35s cubic-bezier(0.22,1,0.36,1);
  overflow: hidden;
}
@keyframes rpSlideUp { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:translateY(0)} }

/* ── Header ── */
.rp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 24px 16px;
  background: #fff;
  border-bottom: 1px solid rgba(0,0,0,0.08);
  flex-shrink: 0;
}
.rp-header-left { display: flex; align-items: center; gap: 14px; }
.rp-badge {
  background: rgba(6,182,212,0.1); border: 1.5px solid rgba(6,182,212,0.35);
  border-radius: 8px; padding: 5px 14px;
  font-family: Manrope,sans-serif; font-size: 0.85rem; font-weight: 800;
  color: #06B6D4; letter-spacing: 0.06em;
}
.rp-title { font-family: Manrope,sans-serif; font-size: 1.3rem; font-weight: 800; color: #0F172A; }
.rp-subtitle { font-family: Inter,sans-serif; font-size: 0.8rem; color: #64748B; margin-top: 2px; }
.rp-close {
  width: 36px; height: 36px; border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.04);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: #64748B; transition: all 0.2s;
}
.rp-close:hover { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.3); color: #EF4444; }

/* ── Tabs ── */
.rp-tabs {
  display: flex; gap: 4px; padding: 12px 24px 0;
  background: #fff;
  border-bottom: 1px solid rgba(0,0,0,0.07);
  flex-shrink: 0;
}
.rp-tab {
  font-family: Inter,sans-serif; font-size: 0.82rem; font-weight: 600;
  color: #64748B; background: none; border: none;
  padding: 8px 18px 12px; cursor: pointer; letter-spacing: 0.02em;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: color 0.2s, border-color 0.2s;
}
.rp-tab:hover { color: #0F172A; }
.rp-tab.active { color: #06B6D4; border-bottom-color: #06B6D4; }

/* ── Body ── */
.rp-body {
  overflow-y: auto; flex: 1;
  padding: 24px;
  scrollbar-width: thin;
  scrollbar-color: rgba(6,182,212,0.25) transparent;
}
.rp-body::-webkit-scrollbar { width: 5px; }
.rp-body::-webkit-scrollbar-thumb { background: rgba(6,182,212,0.25); border-radius: 3px; }

/* ── Section headings ── */
.rp-section-title {
  font-family: Manrope,sans-serif; font-size: 0.72rem; font-weight: 700;
  color: #94A3B8; letter-spacing: 0.14em; text-transform: uppercase;
  padding-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.07);
  margin: 0 0 16px;
}
.rp-section-title:not(:first-child) { margin-top: 28px; }

/* ── Highlights row ── */
.rp-highlights {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px;
}
.rp-highlight-card {
  background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px;
  padding: 14px 16px; display: flex; align-items: center; gap: 14px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}
.rp-highlight-card.best  { border-top: 3px solid #10B981; }
.rp-highlight-card.worst { border-top: 3px solid #EF4444; }
.rp-hl-icon { font-size: 1.6rem; }
.rp-hl-tag  { font-family: JetBrains Mono,monospace; font-size: 0.5rem; font-weight: 600; color: #94A3B8; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 3px; }
.rp-hl-val  { font-family: Manrope,sans-serif; font-size: 1rem; font-weight: 800; letter-spacing: 0.02em; }
.rp-hl-sub  { font-family: JetBrains Mono,monospace; font-size: 0.55rem; color: #94A3B8; margin-top: 3px; }

/* ── Pie charts grid ── */
.rp-pies { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 8px; }
.rp-pie-card {
  background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px;
  padding: 20px 16px; display: flex; flex-direction: column; align-items: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}
.rp-pie-wrap { display:flex; flex-direction:column; align-items:center; }
.rp-pie-label { font-family: Manrope,sans-serif; font-size: 0.92rem; font-weight: 800; color: #0F172A; margin-top: 8px; }
.rp-pie-quality { font-family: Inter,sans-serif; font-size: 0.78rem; font-weight: 600; margin-top: 2px; }
.rp-pie-sublabel { font-family: Inter,sans-serif; font-size: 0.68rem; color: #94A3B8; text-align: center; margin-top: 6px; line-height: 1.4; }

/* ── Footwork cards ── */
.rp-footwork { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
.rp-fw-card {
  background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px;
  padding: 18px 12px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}
.rp-fw-num { font-family: Manrope,sans-serif; font-size: 2rem; font-weight: 800; line-height: 1; }
.rp-fw-label { font-family: JetBrains Mono,monospace; font-size: 0.5rem; color: #94A3B8; letter-spacing: 0.12em; margin-top: 5px; text-transform: uppercase; }

/* ── Line graphs ── */
.rp-graph-wrap { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; padding: 16px 18px 12px; margin-bottom: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.rp-graph-title { font-family: Manrope,sans-serif; font-size: 0.82rem; font-weight: 700; color: #334155; margin-bottom: 10px; }
.rp-graph-empty { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; padding: 32px; text-align: center; font-family: JetBrains Mono,monospace; font-size: 0.7rem; color: #94A3B8; letter-spacing: 0.1em; margin-bottom: 14px; }

/* ── Shots grid ── */
.rp-shots-grid { display: flex; flex-direction: column; gap: 14px; }
.rp-shot-card {
  background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px;
  padding: 16px 18px; box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}
.rp-shot-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.rp-shot-left  { display: flex; align-items: center; gap: 8px; }
.rp-shot-right { display: flex; align-items: center; gap: 10px; }
.rp-shot-num   { font-family: JetBrains Mono,monospace; font-size: 0.7rem; color: #94A3B8; }
.rp-shot-name  { font-family: Manrope,sans-serif; font-size: 1rem; font-weight: 800; letter-spacing: 0.02em; }
.rp-shot-conf  { font-family: Manrope,sans-serif; font-size: 0.72rem; font-weight: 700; padding: 2px 10px; border-radius: 100px; }
.rp-shot-time  { font-family: JetBrains Mono,monospace; font-size: 0.7rem; color: #94A3B8; }
.rp-shot-quality { font-family: Inter,sans-serif; font-size: 0.75rem; font-weight: 700; padding: 3px 10px; border-radius: 8px; }
.rp-shot-score { font-family: Manrope,sans-serif; font-size: 1.2rem; font-weight: 800; }
.rp-shot-flags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.rp-flag { font-family: Inter,sans-serif; font-size: 0.7rem; font-weight: 600; padding: 3px 10px; border-radius: 6px; cursor: help; }
.rp-shot-bars { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.rp-bar-row { display: flex; flex-direction: column; gap: 5px; }
.rp-bar-meta { display: flex; align-items: center; justify-content: space-between; }
.rp-bar-label { font-family: Inter,sans-serif; font-size: 0.72rem; font-weight: 600; color: #475569; cursor: help; }
.rp-bar-val   { font-family: Manrope,sans-serif; font-size: 0.88rem; font-weight: 800; }
.rp-bar-track { width: 100%; height: 7px; background: rgba(0,0,0,0.07); border-radius: 4px; overflow: hidden; }
.rp-bar-fill  { height: 100%; border-radius: 4px; transition: width 1s cubic-bezier(0.4,0,0.2,1); }
.rp-shot-score-row { display: flex; align-items: center; border-top: 1px solid rgba(0,0,0,0.06); padding-top: 10px; }
.rp-shot-flags-detail { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.rp-flag-detail { font-family: Inter,sans-serif; font-size: 0.78rem; color: #475569; padding: 7px 12px; background: rgba(0,0,0,0.025); border-radius: 6px; line-height: 1.5; }

/* ── Metric cards ── */
.rp-metrics-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 16px; }
.rp-metric-card { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; padding: 18px 18px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.rp-metric-icon  { font-size: 1.5rem; margin-bottom: 8px; }
.rp-metric-title { font-family: Manrope,sans-serif; font-size: 1rem; font-weight: 800; margin-bottom: 10px; }
.rp-metric-section { margin-bottom: 9px; }
.rp-metric-tag { display: inline-block; font-family: JetBrains Mono,monospace; font-size: 0.55rem; font-weight: 600; color: #94A3B8; background: rgba(0,0,0,0.05); border-radius: 4px; padding: 2px 7px; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; }
.rp-metric-section p { font-family: Inter,sans-serif; font-size: 0.82rem; color: #475569; line-height: 1.55; margin: 0; }

/* ── Responsive ── */
@media (max-width: 700px) {
  .rp-pies { grid-template-columns: 1fr; }
  .rp-highlights { grid-template-columns: 1fr; }
  .rp-footwork { grid-template-columns: repeat(3,1fr); }
  .rp-metrics-grid { grid-template-columns: 1fr; }
  .rp-tabs { gap: 0; overflow-x: auto; }
  .rp-tab { white-space: nowrap; }
}`;
    document.head.appendChild(style);
  }

  // ── Build full modal HTML ────────────────────────────────
  function buildModal(data) {
    const { shots, analysis } = data;
    const sc = analysis.session_scores || {};
    const best  = analysis.best_shot || {};
    const worst = analysis.worst_shot || {};
    const fw    = analysis.footwork_summary || {};
    const av    = analysis.session_averages || {};
    const alerts = analysis.coaching_alerts || [];
    const stance = data.stance || 'RHB';

    const confirmedShots = shots.filter(s => s.conf > 0.5);
    const totalShots = confirmedShots.length;
    // CHANGED: avgSpeed label px/s → km/h, value uses toFixed(1)
    const avgSpeed = totalShots
      ? (confirmedShots.reduce((a,s) => a + (s.peak_swing_speed||0), 0) / totalShots).toFixed(1)
      : '0.0';
    const avgScore = totalShots ? (confirmedShots.reduce((a,s) => a + (s.shot_score||0), 0) / totalShots).toFixed(1) : '—';

    const bcol = SHOT_COLORS[best.label] || '#10B981';
    const wcol = SHOT_COLORS[worst.label] || '#EF4444';

    // Trend data for graphs
    const trendShots = confirmedShots.map(s => ({
      shot_num: s.shot_num,
      speed:    parseFloat((s.peak_swing_speed || 0).toFixed(1)),
      head:     Math.round(s.head_stability || 0),
      stab:     Math.round(s.stability_score || 0),
      score:    s.shot_score || 0,
    }));

    return `
    <div class="rp-overlay" id="rpOverlay">
      <div class="rp-modal" id="rpModal">

        <!-- Header -->
        <div class="rp-header">
          <div class="rp-header-left">
            <div class="rp-badge">${stance}</div>
            <div>
              <div class="rp-title">Session Analysis Report</div>
              <div class="rp-subtitle">${totalShots} confirmed shots &nbsp;·&nbsp; Avg Speed: ${avgSpeed} km/h &nbsp;·&nbsp; Avg Score: ${avgScore}/10</div>
            </div>
          </div>
          <button class="rp-close" id="rpCloseBtn" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M14 4L4 14M4 4l10 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <!-- Tabs -->
        <div class="rp-tabs" id="rpTabs">
          <button class="rp-tab active" data-tab="overview">Overview</button>
          <button class="rp-tab" data-tab="shots">All Shots</button>
          <button class="rp-tab" data-tab="trends">Trends</button>
          <button class="rp-tab" data-tab="metrics">What Metrics Mean</button>
        </div>

        <!-- Body -->
        <div class="rp-body" id="rpBody">

          <!-- ═══ OVERVIEW ═══ -->
          <div data-panel="overview">

            <div class="rp-section-title">Highlights</div>
            <div class="rp-highlights">
              <div class="rp-highlight-card best">
                <div class="rp-hl-icon">🔥</div>
                <div>
                  <div class="rp-hl-tag">Best Shot</div>
                  <div class="rp-hl-val" style="color:${bcol}">#${best.shot_num} ${(SHOT_LABELS[best.label]||best.label||'—').toUpperCase()}</div>
                  <div class="rp-hl-sub">Score: ${best.shot_score}/10 &nbsp;·&nbsp; ${best.shot_quality} &nbsp;·&nbsp; ${best.timestamp}</div>
                </div>
              </div>
              <div class="rp-highlight-card worst">
                <div class="rp-hl-icon">⚠️</div>
                <div>
                  <div class="rp-hl-tag">Worst Shot</div>
                  <div class="rp-hl-val" style="color:${wcol}">#${worst.shot_num} ${(SHOT_LABELS[worst.label]||worst.label||'—').toUpperCase()}</div>
                  <div class="rp-hl-sub">Score: ${worst.shot_score}/10 &nbsp;·&nbsp; ${worst.shot_quality} &nbsp;·&nbsp; ${worst.timestamp}</div>
                </div>
              </div>
            </div>

            <div class="rp-section-title">Session Scores</div>
            <div class="rp-pies">
              <div class="rp-pie-card">
                ${buildPieChart(Math.round(sc.power||0), '#F97316', 'Power', 'How hard and fast you are hitting — bat speed normalised across shots')}
              </div>
              <div class="rp-pie-card">
                ${buildPieChart(Math.round(sc.head_discipline||0), '#06B6D4', 'Head Discipline', 'How still your head stays — critical for watching the ball and timing')}
              </div>
              <div class="rp-pie-card">
                ${buildPieChart(Math.round(sc.stability||0), '#10B981', 'Stability', 'Body balance throughout each stroke — reduces mistimed and mis-hit shots')}
              </div>
            </div>

            <div class="rp-section-title">Footwork Summary</div>
            <div class="rp-footwork">
              <div class="rp-fw-card">
                <div class="rp-fw-num" style="color:#10B981">${fw.front_foot_count||0}</div>
                <div class="rp-fw-label">Front Foot</div>
              </div>
              <div class="rp-fw-card">
                <div class="rp-fw-num" style="color:#F97316">${fw.back_foot_count||0}</div>
                <div class="rp-fw-label">Back Foot</div>
              </div>
              <div class="rp-fw-card">
                <div class="rp-fw-num" style="color:#EAB308">${fw.neutral_count||0}</div>
                <div class="rp-fw-label">Neutral</div>
              </div>
            </div>

            ${alerts.length ? `
            <div class="rp-section-title">Coaching Alerts</div>
            <div class="rp-shots-grid">
              ${alerts.map((a,i) => {
                const ac = a.severity==='HIGH'?'#EF4444':a.severity==='MEDIUM'?'#EAB308':'#06B6D4';
                return `<div class="rp-flag-detail" style="border-left:4px solid ${ac};background:#fff;border-radius:12px;padding:14px 16px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                    <span style="font-family:JetBrains Mono,monospace;font-size:0.5rem;font-weight:700;color:${ac};background:${ac}18;padding:2px 8px;border-radius:4px;letter-spacing:0.1em;text-transform:uppercase">${a.severity}</span>
                    <span style="font-family:Manrope,sans-serif;font-size:0.9rem;font-weight:700;color:#334155">${a.metric}</span>
                  </div>
                  <p style="font-family:Inter,sans-serif;font-size:0.82rem;color:#475569;line-height:1.55;margin:0 0 8px">${a.message}</p>
                  <div style="font-family:JetBrains Mono,monospace;font-size:0.62rem;color:#94A3B8;border-top:1px solid rgba(0,0,0,0.06);padding-top:7px">▸ ${a.action}</div>
                </div>`;
              }).join('')}
            </div>` : ''}
          </div>

          <!-- ═══ SHOTS ═══ -->
          <div data-panel="shots" style="display:none">
            <div class="rp-section-title">All Shots — Detailed Breakdown</div>
            <p style="font-family:Inter,sans-serif;font-size:0.82rem;color:#64748B;margin-bottom:20px;line-height:1.55">
              Each card shows shot type, AI confidence, bat speed (km/h), head discipline score, stability score, flags for issues detected, and overall shot score out of 10.
            </p>
            <div class="rp-shots-grid">
              ${shots.map(s => buildShotCard(s)).join('')}
            </div>
          </div>

          <!-- ═══ TRENDS ═══ -->
          <div data-panel="trends" style="display:none">
            <div class="rp-section-title">Performance Trends Across Shots</div>
            <p style="font-family:Inter,sans-serif;font-size:0.82rem;color:#64748B;margin-bottom:20px;line-height:1.55">
              These graphs show how each metric changed shot-by-shot through your session. Look for patterns — are you getting tired later? Do scores drop after a certain shot?
            </p>
            ${buildLineGraph(trendShots, 'speed', '#17B890', 'Bat Speed (km/h) — calibrated bat tip speed across shots', 140)}
            ${buildLineGraph(trendShots, 'head',  '#6C63FF', 'Head Discipline (0–100) — stillness of head through stroke', 100)}
            ${buildLineGraph(trendShots, 'stab',  '#F97316', 'Stability Score (0–100) — body balance and minimal sway', 100)}
            ${buildLineGraph(trendShots, 'score', '#FAAD14', 'Overall Shot Score (/10) — composite quality rating per shot', 10)}
          </div>

          <!-- ═══ METRICS ═══ -->
          <div data-panel="metrics" style="display:none">
            <div class="rp-section-title">Understanding Your Metrics</div>
            <p style="font-family:Inter,sans-serif;font-size:0.82rem;color:#64748B;margin-bottom:20px;line-height:1.55">
              CrickEye uses YOLOv8 pose estimation to track 17 body keypoints at 30fps. Here's exactly what each metric measures and how to improve it.
            </p>
            <div class="rp-metrics-grid">
              ${buildMetricCards()}
            </div>
          </div>

        </div>
      </div>
    </div>`;
  }

  // ── Animate pie arcs after render ───────────────────────
  function animatePies() {
    document.querySelectorAll('.rp-pie-arc').forEach(arc => {
      const target = parseFloat(arc.getAttribute('data-offset'));
      requestAnimationFrame(() => { arc.style.strokeDashoffset = target; });
    });
  }

  // ── Tab switching ────────────────────────────────────────
  function setupTabs() {
    const tabs = document.querySelectorAll('.rp-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.getAttribute('data-tab');
        document.querySelectorAll('[data-panel]').forEach(panel => {
          panel.style.display = panel.getAttribute('data-panel') === target ? 'block' : 'none';
        });
        // Animate pies if switching to overview
        if (target === 'overview') animatePies();
      });
    });
  }

  // ── Public API ───────────────────────────────────────────
  function open(appState, analysis) {
    if (document.getElementById('rpOverlay')) return; // already open
    if (!analysis) {
      alert('No session analysis available yet. Run the pipeline first.');
      return;
    }

    injectStyles();

    const data = {
      shots:    appState.shotLog || [],
      analysis: analysis,
      stance:   appState.completePayload?.handedness || 'RHB',
    };

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildModal(data);
    document.body.appendChild(wrapper.firstElementChild);

    // Close handlers
    document.getElementById('rpCloseBtn').addEventListener('click', close);
    document.getElementById('rpOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'rpOverlay') close();
    });
    document.addEventListener('keydown', onEsc);

    setupTabs();
    setTimeout(animatePies, 100);
  }

  function close() {
    const overlay = document.getElementById('rpOverlay');
    if (!overlay) return;
    overlay.style.transition = 'opacity 0.25s ease';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 260);
    document.removeEventListener('keydown', onEsc);
  }

  function onEsc(e) { if (e.key === 'Escape') close(); }

  return { open, close };
})();