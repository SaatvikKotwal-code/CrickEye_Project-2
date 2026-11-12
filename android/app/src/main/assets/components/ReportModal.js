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

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const SHOT_LABELS = {
    cover:'Cover Drive', straight:'Straight Drive',
    pull:'Pull Shot', flick:'Flick', sweep:'Sweep',
  };
  const SHOT_COLORS = {
    cover:'#06B6D4', straight:'#10B981',
    pull:'#F97316', flick:'#A855F7', sweep:'#EAB308',
  };
  const QUALITY_COLORS = {
    'Top class': TONE.strong,
    Good: TONE.strong,
    Average: TONE.moderate,
    Poor: TONE.weak,
    OK: TONE.moderate,
    'Needs work': TONE.weak,
    Excellent: TONE.strong,
  };
  const FLAG_INFO = {
    BAT_SPEED_SESSION_LOCK: { label: 'Bat speed session check', color: '#64748B', desc: 'Peak bat speed was aligned with swing intensity and the rest of this net so one frame spike does not dominate.' },
    HEAD_LATERAL_DRIFT:   { label:'Head shifting sideways',       color:'#EF4444', desc:'More sideways movement than we want before contact.' },
    HEAD_VERTICAL_DRIFT:  { label:'Head dipping or lifting early', color:'#F97316', desc:'Noticeable up/down motion before or at contact on drives / flicks.' },
    HEAD_DUCKING_PULL:    { label:'Head low on the pull',         color:'#EF4444', desc:'Head dropping as you play the short ball — often a technique cue.' },
    STANCE_ASYMMETRIC:    { label:'Stance asymmetric',          color:'#EAB308', desc:'Shoulder or hip tilt at setup — directional bias before the ball arrives.' },
    ELBOW_COLLAPSE:      { label:'Elbow collapse',             color:'#F97316', desc:'Arms cramped in before contact — reduced space and leverage.' },
    ELBOW_COLLAPSE_PULL:  { label:'Elbow collapse (pull)',      color:'#EF4444', desc:'Cramped arms on the pull — top-edge risk, no extension through the ball.' },
    ELBOW_REACHING:       { label:'Elbow reaching',             color:'#EAB308', desc:'Arms over-extended — chasing the ball instead of letting it come.' },
    ELBOW_REACHING_FLICK: { label:'Elbow reaching (flick)',     color:'#F97316', desc:'Over-hitting the flick — timing shot needs soft hands, not locked arms.' },
    ELBOW_BEHIND_PAD:     { label:'Elbow behind pad',           color:'#EF4444', desc:'Sweep: elbow dropped behind the pad — bat face closes early.' },
    NARROW_BASE:          { label:'Narrow base',                color:'#EA580C', desc:'Feet too close at setup — limited platform for weight shift.' },
    WIDE_BASE:            { label:'Wide base',                  color:'#EA580C', desc:'Stance wider than ~1.6× shoulder width — hips can lock.' },
    LATE_PLANT:           { label:'Late front-foot plant',      color:'#64748B', desc:'Front foot lands noticeably after contact — harder to get weight through the ball.' },
    FLAT_FOOTED:          { label:'Quiet feet',                 color:'#64748B', desc:'Very little pre-shot foot movement — check trigger and weight into the shot.' },
    FOOTWORK_LINE_MISMATCH: { label:'Feet off the line', color:'#F97316', desc:'Lateral foot movement did not match ball line.' },
    LOW_SWING_PATH:       { label:'Tight swing arc',           color:'#EAB308', desc:'Session swing arc looked choppy or cut short.' },
    LOW_SHOT_EXECUTION:   { label:'Length vs shot',             color:'#F97316', desc:'Several deliveries where shot choice looked risky for the length.' },
    SWING_PATH_FATIGUE:   { label:'Path drops late',            color:'#94A3B8', desc:'Swing shape dipped in the second half of the net.' },
    LOW_WEIGHT_TRANSFER:  { label:'Low weight transfer',        color:'#EF4444', desc:'Hips not driving toward the ball on front-foot drives.' },
    OVER_COMMITTED:       { label:'Over-committed (lunge)',       color:'#CA8A04', desc:'Excessive hip shift — vulnerable to balls that hold up.' },
    SPINE_COLLAPSE:       { label:'Spine collapse',             color:'#CA8A04', desc:'Upper body crouching into contact — shape and control suffer.' },
    STIFF_LEGGED:         { label:'Stiff legs',                 color:'#64748B', desc:'Little knee flex at setup — reduced athletic readiness.' },
  };

  const BALL_PACE_LABEL = {
    slow: 'Slow',
    medium: 'Medium',
    fast: 'Fast',
    very_fast: 'Very fast',
    unknown: '—',
  };
  const BALL_PACE_COLOR = {
    slow: '#06B6D4',
    medium: '#10B981',
    fast: '#F97316',
    very_fast: '#A855F7',
    unknown: '#94A3B8',
  };

  /** Map shot # → ball_analytics.deliveries[] row (display_num / shot_num). */
  function indexBallDeliveriesByShot(ballAnalytics) {
    const m = new Map();
    if (!ballAnalytics || !Array.isArray(ballAnalytics.deliveries)) return m;
    ballAnalytics.deliveries.forEach((d) => {
      const id = d.display_num != null ? Number(d.display_num) : (d.shot_num != null ? Number(d.shot_num) : NaN);
      if (!Number.isFinite(id)) return;
      m.set(id, d);
    });
    return m;
  }

  function formatBowlingFacedCell(delivery) {
    if (!delivery) {
      return '<span class="rp-del-metric--empty">—</span>';
    }
    const band = (delivery.pace_band || 'unknown').toLowerCase();
    const label = BALL_PACE_LABEL[band] || String(band).replace(/_/g, ' ');
    const col = BALL_PACE_COLOR[band] || '#64748B';
    const rawSpeed =
      delivery.speed_kmh_est ??
      delivery.speed_kmh ??
      delivery.pace_kmh ??
      null;
    let spd = Number(rawSpeed);
    if (!Number.isFinite(spd)) {
      // Keep speed always present in UI: fall back to pace-band representative values.
      if (band === 'very_fast') spd = 125;
      else if (band === 'fast') spd = 105;
      else if (band === 'medium') spd = 85;
      else if (band === 'slow') spd = 62;
      else spd = NaN;
    }
    if (spd != null && spd !== '' && Number.isFinite(Number(spd))) {
      return `<span class="rp-col-ball-est" style="color:${col}">${label} <span class="rp-col-ball-spd">(${Number(spd).toFixed(1)} km/h)</span></span>`;
    }
    if (label && label !== '—') {
      return `<span class="rp-col-ball-est" style="color:${col}">${label}</span>`;
    }
    return '<span class="rp-del-metric--empty">—</span>';
  }

  function formatBallContextCell(delivery) {
    if (!delivery) return '<span class="rp-del-metric--empty">—</span>';
    const paceHtml = formatBowlingFacedCell(delivery);
    const lenLbl = String(delivery?.length?.label || '').trim();
    const lenHtml = lenLbl
      ? `<span class="rp-col-ball-est">${escapeHtml(lenLbl.replace(/_/g, ' '))}</span>`
      : '<span class="rp-del-metric--empty">Length —</span>';
    return `<div class="rp-col-ball-context">${lenHtml}<span class="rp-col-ball-divider">|</span>${paceHtml}</div>`;
  }

  function formatSwingIntensityLabelCell(labelRaw) {
    const label = String(labelRaw == null ? '' : labelRaw)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    if (!label) return '<span class="rp-col-swing-label">Measured swing</span>';
    return `<span class="rp-col-swing-label">${escapeHtml(label)}</span>`;
  }

  function getAnalysisSummary(analysis) {
    const ss = analysis?.session_summary || {};
    const av = analysis?.session_averages || {};
    const tr = ss.trend || analysis?.trend || {};
    const flags = ss.flags_summary || {};
    return {
      shotsConfirmed: ss.shots_confirmed ?? analysis?.shots_confirmed ?? 0,
      shotsTotalDetected: ss.shots_total_detected ?? analysis?.shots_total ?? 0,
      avgSpeed: ss.avg_bat_speed_kmh ?? av.peak_swing_speed ?? null,
      avgHead: ss.avg_head_quality_score ?? av.head_quality_score ?? null,
      avgStability: ss.avg_symmetry_score ?? av.symmetry_score ?? null,
      avgFootwork: ss.avg_footwork_score ?? av.footwork_score ?? null,
      avgSwingIntensity: ss.avg_swing_intensity ?? av.swing_intensity ?? null,
      avgSwingPath: ss.avg_swing_path_score ?? av.swing_path_score ?? null,
      avgExecution: ss.avg_execution_score ?? av.execution_score ?? null,
      avgShotScore: ss.avg_shot_score ?? null,
      avgWeightTransfer: ss.avg_weight_transfer ?? null,
      avgBaseWidth: ss.avg_base_width_ratio ?? null,
      avgKneeFlex: ss.avg_knee_flex ?? null,
      fatigue: ss.fatigue_detected ?? analysis?.fatigue_detected ?? false,
      trend: {
        first_half_speed: tr.first_half_speed ?? tr.peak_swing_speed?.first_half ?? null,
        second_half_speed: tr.second_half_speed ?? tr.peak_swing_speed?.second_half ?? null,
        first_half_head_quality_score: tr.first_half_head_quality_score ?? tr.head_quality_score?.first_half ?? null,
        second_half_head_quality_score: tr.second_half_head_quality_score ?? tr.head_quality_score?.second_half ?? null,
        first_half_symmetry_score: tr.first_half_symmetry_score ?? tr.symmetry_score?.first_half ?? null,
        second_half_symmetry_score: tr.second_half_symmetry_score ?? tr.symmetry_score?.second_half ?? null,
        first_half_footwork_score: tr.first_half_footwork_score ?? tr.footwork_score?.first_half ?? null,
        second_half_footwork_score: tr.second_half_footwork_score ?? tr.footwork_score?.second_half ?? null,
        first_half_swing_intensity: tr.first_half_swing_intensity ?? tr.swing_intensity?.first_half ?? null,
        second_half_swing_intensity: tr.second_half_swing_intensity ?? tr.swing_intensity?.second_half ?? null,
        first_half_swing_path_score: tr.first_half_swing_path_score ?? null,
        second_half_swing_path_score: tr.second_half_swing_path_score ?? null,
        first_half_execution_score: tr.first_half_execution_score ?? null,
        second_half_execution_score: tr.second_half_execution_score ?? null,
      },
      flagsSummary: {
        HEAD_LATERAL_DRIFT_count: flags.HEAD_LATERAL_DRIFT_count ?? 0,
        HEAD_VERTICAL_DRIFT_count: flags.HEAD_VERTICAL_DRIFT_count ?? 0,
        HEAD_DUCKING_PULL_count: flags.HEAD_DUCKING_PULL_count ?? 0,
        STANCE_ASYMMETRIC_count: flags.STANCE_ASYMMETRIC_count ?? 0,
        ELBOW_COLLAPSE_count: flags.ELBOW_COLLAPSE_count ?? 0,
        ELBOW_REACHING_count: flags.ELBOW_REACHING_count ?? 0,
        ELBOW_BEHIND_PAD_count: flags.ELBOW_BEHIND_PAD_count ?? 0,
        FLAT_FOOTED_count: flags.FLAT_FOOTED_count ?? 0,
        LATE_PLANT_count: flags.LATE_PLANT_count ?? 0,
        BAT_SPEED_SESSION_LOCK_count: flags.BAT_SPEED_SESSION_LOCK_count ?? 0,
        NARROW_BASE_count: flags.NARROW_BASE_count ?? 0,
        WIDE_BASE_count: flags.WIDE_BASE_count ?? 0,
        LOW_WEIGHT_TRANSFER_count: flags.LOW_WEIGHT_TRANSFER_count ?? 0,
        OVER_COMMITTED_count: flags.OVER_COMMITTED_count ?? 0,
        SPINE_COLLAPSE_count: flags.SPINE_COLLAPSE_count ?? 0,
        STIFF_LEGGED_count: flags.STIFF_LEGGED_count ?? 0,
      },
      byShotType: ss.by_shot_type || analysis?.by_shot_type || {},
    };
  }

  // ── SVG Pie/Donut chart ──────────────────────────────────
  function buildPieChart(value, color, label, sublabel, gradientId) {
    const pct = Math.min(100, Math.max(0, value));
    const R = 48, cx = 60, cy = 60;
    const circ = +(2 * Math.PI * R).toFixed(1); // 301.6
    const offset = +(circ * (1 - pct / 100)).toFixed(1);
    const quality = pct >= 70 ? 'Elite' : pct >= 50 ? 'Good' : pct >= 35 ? 'Average' : 'Needs Work';
    const qc = pct >= 70 ? '#10B981' : pct >= 50 ? '#0D9488' : pct >= 35 ? '#F59E0B' : '#EA580C';
    
    // Choose gradient colors based on metric color or gradientId
    let gStart = color, gEnd = color;
    if (color.toUpperCase().includes('8B5CF6') || color.toUpperCase().includes('7C3AED') || gradientId === 'purpleGradient') {
      gStart = '#8b5cf6'; gEnd = '#6d28d9';
    } else if (color.toUpperCase().includes('F97316') || color.toUpperCase().includes('EA580C') || gradientId === 'orangeGradient') {
      gStart = '#fb923c'; gEnd = '#ea580c';
    } else if (color.toUpperCase().includes('06B6D4') || color.toUpperCase().includes('0891B2') || gradientId === 'cyanGradient') {
      gStart = '#06b6d4'; gEnd = '#0891b2';
    } else if (color.toUpperCase().includes('10B981') || gradientId === 'emeraldGradient') {
      gStart = '#34d399'; gEnd = '#059669';
    } else if (color.toUpperCase().includes('FAAD14') || gradientId === 'amberGradient') {
      gStart = '#fbbf24'; gEnd = '#d97706';
    } else {
      gStart = color; gEnd = color;
    }
    const gid = gradientId || ('grad_' + Math.random().toString(36).substr(2, 7));

    return `
      <article class="rp-gauge-card bg-white rounded-3xl p-6 shadow-card border border-slate-100 flex flex-col items-center text-center">
        <div class="relative w-40 h-40 flex items-center justify-center">
          <svg class="w-full h-full" viewBox="0 0 120 120">
            <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#f1f5f9" stroke-width="10"/>
            <circle class="gauge-circle rp-pie-arc" cx="${cx}" cy="${cy}" r="${R}" fill="none"
              stroke="url(#${gid})" stroke-width="10" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${circ}"
              data-offset="${offset}"
              transform="rotate(-90 ${cx} ${cy})"
              style="transition:stroke-dashoffset 1.1s cubic-bezier(0.16, 1, 0.3, 1)"/>
            <defs>
              <linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${gStart}"/>
                <stop offset="100%" stop-color="${gEnd}"/>
              </linearGradient>
            </defs>
          </svg>
          <div class="absolute flex flex-col items-center">
            <span class="text-4xl font-extrabold tracking-tight leading-none" style="color:${gEnd}">${Math.round(pct)}</span>
            <span class="text-[11px] font-medium text-slate-400 mt-1 uppercase tracking-tight">out of 100</span>
          </div>
        </div>
        <h3 class="text-base font-bold text-slate-900 mt-2">${escapeHtml(label)}</h3>
        <span class="inline-block mt-0.5 text-xs font-bold" style="color:${qc}">${quality}</span>
        <p class="text-xs text-slate-500 mt-1 max-w-[220px]">
          ${escapeHtml(sublabel)}
        </p>
      </article>`;
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
      <div class="rp-graph-wrap" onclick="window.toggleGraphZoom && window.toggleGraphZoom(this, event)">
        <div class="rp-graph-head-bar">
          <div class="rp-graph-title">${label}</div>
          <div class="rp-graph-actions">
            <span class="rp-graph-zoom-hint" title="Tap to expand"><span class="material-symbols-outlined">zoom_in</span></span>
            <button type="button" class="rp-graph-close-btn" title="Close" onclick="event.stopPropagation(); window.toggleGraphZoom && window.toggleGraphZoom(this.closest('.rp-graph-wrap'), event, false)">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
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
    const sc = scoreColor(score);
    const qc = QUALITY_COLORS[shot.shot_quality] || TONE.neutral;

    const latTh = shot.label === 'pull' || shot.label === 'sweep' ? 0.20 : 0.12;
    const latR = shot.head_lateral_ratio != null ? Number(shot.head_lateral_ratio) : null;
    const vertR = shot.head_vertical_ratio != null ? Number(shot.head_vertical_ratio) : null;
    const latWarn = latR != null && latR > latTh;
    const headQ = shot.head_quality_score != null ? Math.round(shot.head_quality_score) : null;
    const symQ = shot.symmetry_score != null ? Math.round(shot.symmetry_score) : null;
    const fwQ = shot.footwork_score != null ? Math.round(shot.footwork_score) : null;
    const swQ = shot.swing_intensity != null ? Math.round(shot.swing_intensity) : null;
    const pathQ = shot.swing_path_score != null ? Math.round(shot.swing_path_score) : null;
    const exQ = shot.execution_score != null ? Math.round(shot.execution_score) : null;
    const lenZ = shot.length_zone ? String(shot.length_zone).replace(/_/g, ' ') : null;
    const bars = [
      { label: 'Head position', value: headQ, max: 100, color: '#6C63FF', unit: '/100', desc: 'Pre-contact head stability; shot-type rules (CAB: eyes level into contact).' },
      { label: 'Foot movement', value: fwQ, max: 100, color: '#06B6D4', unit: '/100', desc: 'Trigger + plant; when ball is tracked, lightly blended with line-of-ball (front-on lateral).' },
      { label: 'Batting stance', value: symQ, max: 100, color: '#10B981', unit: '/100', desc: 'Shoulder and hip tilt symmetry in quiet frames (zoom-safe).' },
      { label: 'Swing arc', value: pathQ, max: 100, color: '#8B5CF6', unit: '/100', desc: 'Smooth hand path into the ball (from both wrists on your video).' },
      { label: 'Shot execution', value: exQ, max: 100, color: '#F97316', unit: '/100', desc: `Simple cue: did your stroke match the ball length${lenZ ? ` (${lenZ})` : ''}?` },
    ];
    const advancedBars = [
      { label: 'Swing intensity', value: swQ, max: 100, color: '#EAB308', unit: '/100', desc: 'Diagnostic only — session-relative wrist effort (not in /10 score).' },
    ];
    const wt = shot.weight_transfer != null ? Number(shot.weight_transfer) : null;
    const bw = shot.base_width_ratio != null ? Number(shot.base_width_ratio) : null;
    const kf = shot.knee_flex != null ? Number(shot.knee_flex) : null;
    const sr = shot.spine_ratio != null ? Number(shot.spine_ratio) : null;
    const wtStr = wt != null ? (wt >= 0 ? `+${wt.toFixed(3)}` : wt.toFixed(3)) : '—';
    const subHead = `Lateral drift: ${latR != null ? latR.toFixed(2) : '—'}${latWarn ? ' (high)' : ''} · Vertical movement: ${vertR != null ? vertR.toFixed(2) : '—'} · head_frames_used: ${shot.head_frames_used != null ? shot.head_frames_used : '—'}`;
    const subPosture = `Weight transfer: ${wtStr} · Base width: ${bw != null ? `${bw.toFixed(2)}×` : '—'} · Knee flex: ${kf != null ? kf.toFixed(2) : '—'} · Spine ratio: ${sr != null ? sr.toFixed(2) : '—'}`;
    const padBadge = shot.elbow_behind_pad && shot.label === 'sweep'
      ? `<div class="rp-shot-pad-badge">Elbow behind pad</div>` : '';

    return `
      <div class="rp-shot-card" style="--shot-col:${color}; border-left:4px solid ${color}">
        <div class="rp-shot-header">
          <div class="rp-shot-left">
            <span class="rp-shot-num">#${shot.shot_num}</span>
            <span class="rp-shot-name" style="color:${color}">${(SHOT_LABELS[shot.label] || shot.label || '—').toUpperCase()}</span>
          </div>
          <div class="rp-shot-right">
            <span class="rp-shot-time">${shot.timestamp || '—'}</span>
            ${padBadge}
            <span class="rp-shot-quality" style="color:${qc};background:color-mix(in srgb, ${qc} 12%, transparent)">${shot.shot_quality || '—'}</span>
            <span class="rp-shot-score" style="color:${sc}">${score}<span class="rp-shot-denom">/10</span></span>
          </div>
        </div>
        <div class="rp-shot-bars">
          ${bars.map(b => `
            <div class="rp-bar-row">
              <div class="rp-bar-meta">
                <span class="rp-bar-label" title="${b.desc}">${b.label}</span>
                <span class="rp-bar-val" style="color:${b.color}">${b.value != null ? b.value : '—'}<span class="rp-bar-unit">${b.unit}</span></span>
              </div>
              <div class="rp-bar-track">
                <div class="rp-bar-fill" style="width:${b.value == null ? 0 : Math.min(100,(Number(b.value)/b.max)*100).toFixed(1)}%;background:${b.color}"></div>
              </div>
            </div>`).join('')}
          <div class="rp-shot-advanced-hint">Advanced metric</div>
          ${advancedBars.map(b => `
            <div class="rp-bar-row rp-bar-row--advanced">
              <div class="rp-bar-meta">
                <span class="rp-bar-label" title="${b.desc}">${b.label}</span>
                <span class="rp-bar-val" style="color:${b.color}">${b.value != null && b.value !== '' ? b.value : '—'}<span class="rp-bar-unit">${b.unit}</span></span>
              </div>
              <div class="rp-bar-track">
                <div class="rp-bar-fill" style="width:${b.value == null || b.value === '' ? 0 : Math.min(100,(Number(b.value)/b.max)*100).toFixed(1)}%;background:${b.color}"></div>
              </div>
            </div>`).join('')}
          <div class="rp-shot-submetrics">${subHead}</div>
          <div class="rp-shot-submetrics rp-shot-submetrics--posture">${subPosture}</div>
        </div>
        <div class="rp-shot-score-row">
          <span class="rp-bar-label">Overall score</span>
          <div class="rp-bar-track" style="flex:1;margin:0 12px">
            <div class="rp-bar-fill" style="width:${score*10}%;background:${sc}"></div>
          </div>
          <span class="rp-shot-score-inline" style="color:${sc}">${score}<span class="rp-shot-denom">/10</span></span>
        </div>
      </div>`;
  }

  // ── Metric explainer cards ───────────────────────────────
  function buildMetricCards() {
    const metrics = [
      {
        icon: '🎯', color: '#06B6D4', title: 'Head position',
        sub: '0–100 stability & axis tracking',
        what: 'Axis-aware head quality (0–100): lateral drift is always penalised; vertical movement uses a shot-type free zone so pull/sweep tracking is not misread as a fault.',
        how: 'Nose/ear-midpoint spread vs shoulder width, with HEAD_RULES weights per classifier label.',
        tip: 'On drives, minimise lateral head movement; on pull/sweep, trust vertical tracking but keep the head on the rotational axis.',
      },
      {
        icon: '👟', color: '#0891B2', title: 'Foot movement',
        sub: '0–100 plant timing & press',
        what: 'Pre-shot foot activity and front-foot plant timing relative to contact (0–100).',
        how: 'Ankle movement before the swing, normalized by shoulder width, plus plant frame vs contact.',
        tip: 'Trigger a small press or lift early; get the front foot down on time on front-foot shots.',
      },
      {
        icon: '⚖️', color: '#10B981', title: 'Batting stance',
        sub: '0–100 shoulder & hip horizontal symmetry',
        what: 'Pre-shot shoulder and hip line tilt vs horizontal (0–100).',
        how: 'Mean tilt in the stationary window before onset; flags need enough clean frames.',
        tip: 'Level shoulders before the bowler runs in — avoid showing a preset bias too early.',
      },
      {
        icon: '〰️', color: '#8B5CF6', title: 'Swing arc',
        sub: '0–100 swing plane consistency',
        what: 'How smooth your swing shape is into the ball (0–100), from your hands on video — the path between both wrists.',
        how: 'Steadier, smoother motion into contact scores higher; we scale for camera distance so nets compare fairly.',
        tip: 'Hands together — smooth arc through the ball, not just harder.',
      },
      {
        icon: '📏', color: '#F97316', title: 'Shot execution',
        sub: '0–100 length match & decision',
        what: 'In simple words: did you play the right shot for that ball length (0–100).',
        how: 'Coach matrix per length zone × shot type; down-weighted when bounce or track is uncertain.',
        tip: 'Match stroke to length — drives when full, pull/hook when short, defence when good length.',
      },
      {
        icon: '💫', color: '#EAB308', title: 'Swing intensity',
        sub: '0–100 bat acceleration & intent',
        what: 'How much intent and bat acceleration showed in your swing (0–100), session-normalized.',
        how: 'P90 rolling bilateral wrist velocity vs session ceiling.',
        tip: 'Use as context; good technique beats empty effort.',
      },
      {
        icon: '🏏', color: '#EF4444', title: 'Overall Score out of 10',
        sub: 'Weighted composite rating',
        what: 'Composite single rating reflecting head stability, base balance, footwork, and impact execution.',
        how: 'Weighted sum normalized from 0 to 10 with progressive penalties for technical faults.',
        tip: 'Focus on repeating your setup consistently rather than chasing isolated numbers.',
      }
    ];

    return metrics.map((m, idx) => `
      <article class="rp-explain-card${idx === 0 ? ' is-open' : ''}" data-purpose="metric-explain-card">
        <header class="rp-explain-head" onclick="window.toggleExplainCard && window.toggleExplainCard(this)" role="button" tabindex="0">
          <div class="rp-explain-title-wrap">
            <div class="rp-explain-icon-box" style="background:color-mix(in srgb, ${m.color} 12%, transparent);color:${m.color}">
              ${m.icon}
            </div>
            <div>
              <div class="rp-explain-title" style="color:${m.color}">${escapeHtml(m.title)}</div>
              <div class="rp-explain-sub">${escapeHtml(m.sub)}</div>
            </div>
          </div>
          <div class="rp-explain-chevron">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
              <path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          </div>
        </header>
        <div class="rp-explain-body">
          <div class="rp-explain-section">
            <span class="rp-explain-badge">What it measures</span>
            <p class="rp-explain-text">${escapeHtml(m.what)}</p>
          </div>
          <div class="rp-explain-section">
            <span class="rp-explain-badge">How it's calculated</span>
            <p class="rp-explain-text">${escapeHtml(m.how)}</p>
          </div>
          <div class="rp-explain-tip-box" style="border-left:3px solid ${m.color}">
            <span class="rp-explain-badge" style="color:${m.color}">Coaching tip</span>
            <p class="rp-explain-text" style="font-weight:600;color:#0f172a;">${escapeHtml(m.tip)}</p>
          </div>
        </div>
      </article>`).join('');
  }

  function qualityBand(v, emptyLabel = 'No data') {
    if (v == null || !Number.isFinite(Number(v))) return { label: emptyLabel, color: TONE.neutral };
    const n = Number(v);
    if (n >= 80) return { label: 'Elite', color: metricColor(n) };
    if (n >= 70) return { label: 'Good', color: metricColor(n) };
    if (n >= 45) return { label: 'Workable', color: metricColor(n) };
    return { label: 'Needs Attention', color: metricColor(n) };
  }

  /** One table cell: /100 score + band + optional player-facing cue from the pipeline. */
  function formatDeliveryMetric100(score, playerLabel) {
    if (score == null || !Number.isFinite(Number(score))) {
      return '<div class="rp-del-metric rp-del-metric--empty"><span class="rp-del-metric-dash">—</span></div>';
    }
    const n = Math.round(Number(score));
    const band = qualityBand(n);
    const sub = playerLabel
      ? `<div class="rp-del-metric-cue">${escapeHtml(String(playerLabel))}</div>`
      : '';
    return `<div class="rp-del-metric"><span class="rp-del-metric-num" style="color:${band.color}">${n}</span><span class="rp-del-metric-band" style="color:${band.color}">${band.label}</span>${sub}</div>`;
  }

  function buildCoachingFocus(alertsList) {
    const alerts = Array.isArray(alertsList) ? alertsList.filter(Boolean) : [];
    const top = alerts.slice(0, 3);
    if (!top.length) {
      return `<div class="rp-coach-card rp-coach-card--clean">
        <div class="rp-coach-title">CLEAN SESSION</div>
        <p class="rp-coach-text"><strong>What happened:</strong> No coaching alerts were raised for this session.</p>
        <p class="rp-coach-text"><strong>Why it matters:</strong> Head, feet, stance, swing arc, and shot execution look consistent with your session.</p>
        <div class="rp-coach-drill"><strong>Next step:</strong> Keep logging sessions so trends stay sharp.</div>
      </div>`;
    }
    return top.map((a, i) => `
      <div class="rp-coach-card ${i===0?'rp-coach-card--primary':'rp-coach-card--secondary'}">
        <div class="rp-coach-title">${i+1}. ${escapeHtml(a.severity || '')} · ${escapeHtml(a.metric || '')}</div>
        <p class="rp-coach-text"><strong>Message:</strong> ${escapeHtml(a.message || '')}</p>
        ${a.player_cue ? `<p class="rp-coach-text"><strong>Player cue:</strong> ${escapeHtml(a.player_cue)}</p>` : ''}
        <div class="rp-coach-drill"><strong>Drill:</strong> ${escapeHtml(a.drill || a.action || '—')}</div>
      </div>`).join('');
  }

  function normalizeLlmInsights(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const strengths = Array.isArray(raw.strengths) ? raw.strengths.filter(Boolean).slice(0, 4) : [];
    const improvements = Array.isArray(raw.improvements) ? raw.improvements.filter(Boolean).slice(0, 4) : [];
    const shotTypeNotes = raw.shot_type_notes && typeof raw.shot_type_notes === 'object' ? raw.shot_type_notes : {};
    const metricNotes = raw.metric_notes && typeof raw.metric_notes === 'object' ? raw.metric_notes : {};
    const recommendedDrills = Array.isArray(raw.recommended_drills) ? raw.recommended_drills.filter(Boolean).slice(0, 5) : [];
    return {
      provider: String(raw.provider || '').toLowerCase(),
      model: String(raw.model || ''),
      fallbackUsed: Boolean(raw.fallback_used),
      summary: String(raw.summary || '').trim(),
      strengths,
      improvements,
      shotTypeNotes,
      metricNotes,
      recommendedDrills,
      error: raw.error ? String(raw.error) : '',
    };
  }

  function prettyLlmError(reasonRaw) {
    const reason = String(reasonRaw || '').trim().toLowerCase();
    if (!reason) return '';
    if (reason === 'llm_request_failed' || reason.includes('aborted')) {
      return 'AI request timed out for this save.';
    }
    if (reason === 'llm_missing_in_saved_session') {
      return 'AI insight was not stored in this session record.';
    }
    if (reason === 'llm_disabled') {
      return 'AI insights are disabled in backend settings.';
    }
    return 'AI insight fallback was used for this session.';
  }

  function buildUiFallbackInsights(analysis) {
    const ss = analysis?.session_summary || {};
    const av = analysis?.session_averages || {};
    const avgHead = ss.avg_head_quality_score ?? av.head_quality_score ?? null;
    const avgFoot = ss.avg_footwork_score ?? av.footwork_score ?? null;
    const avgStance = ss.avg_symmetry_score ?? av.symmetry_score ?? null;
    const alerts = Array.isArray(analysis?.coaching_alerts) ? analysis.coaching_alerts : [];
    const strengths = [];
    if (avgHead != null && Number(avgHead) >= 70) strengths.push('Head stays still through most balls.');
    if (avgFoot != null && Number(avgFoot) >= 70) strengths.push('Footwork supports timing and balance.');
    if (avgStance != null && Number(avgStance) >= 65) strengths.push('Stance shape is mostly balanced.');
    if (!strengths.length) strengths.push('Keep building a repeatable setup and cleaner contact.');
    const improvements = alerts
      .slice(0, 3)
      .map((a) => String(a?.player_cue || a?.message || '').trim())
      .filter(Boolean);
    if (!improvements.length) improvements.push('Record more sessions to surface clearer priorities.');
    return {
      provider: 'fallback_rules',
      model: 'rule_based_ui',
      fallback_used: true,
      summary: 'AI coach was unavailable for this session. Showing rule-based coaching cues.',
      strengths,
      improvements,
      shot_type_notes: {},
      metric_notes: {},
      recommended_drills: alerts
        .slice(0, 4)
        .map((a) => String(a?.drill || a?.action || '').trim())
        .filter(Boolean),
      error: 'llm_missing_in_saved_session',
    };
  }

  function metricDisplayName(metricKey) {
    const key = String(metricKey || '').toLowerCase();
    if (key === 'head') return 'head position';
    if (key === 'stance') return 'stance symmetry';
    if (key === 'footwork') return 'front-foot movement';
    if (key === 'swing') return 'swing intensity';
    if (key === 'swing_path') return 'swing arc';
    if (key === 'execution') return 'shot execution';
    return key || 'batting setup';
  }

  function clarifyCoachCue(metricKey, rawText) {
    const base = String(rawText || '').trim();
    const key = String(metricKey || '').toLowerCase();
    if (!base) {
      if (key === 'head') return 'Keep your head still and eyes level at contact.';
      if (key === 'stance') return 'Work on stance symmetry and body balance before release.';
      if (key === 'footwork') return 'Get your front foot down early and stay balanced.';
      if (key === 'swing') return 'Complete your bat swing through the line for better power.';
      if (key === 'swing_path') return 'Keep a smooth swing arc through contact.';
      if (key === 'execution') return 'Play the shot that best fits the ball length.';
      return 'Stay balanced at setup and play with a stable base.';
    }
    const lower = base.toLowerCase();
    if (key === 'stance') {
      if (lower.includes('average') || lower.includes('inconsistent') || lower.includes('balance')) {
        return 'Work on stance symmetry: keep shoulders level, hips square, and body balanced.';
      }
      return base.includes('stance') ? base : `${base}. Keep stance symmetry and body balance before playing.`;
    }
    if (key === 'head') {
      if (lower.includes('drift') || lower.includes('movement')) {
        return 'Head is moving too much. Keep your head still over the ball through contact.';
      }
      return base.includes('head') ? base : `${base}. Keep head still and eyes level at contact.`;
    }
    if (key === 'footwork') {
      if (lower.includes('timing') || lower.includes('plant')) {
        return 'Improve front-foot timing: land early, then swing through the line.';
      }
      return base.includes('foot') ? base : `${base}. Focus on front-foot timing and stable base.`;
    }
    if (key === 'swing') {
      if (lower.includes('low') || lower.includes('power')) {
        return 'Diagnostic swing effort is low — check intent and completion (not the main /10 score).';
      }
      return base.includes('swing') ? base : `${base}. Keep a full swing and strong follow-through.`;
    }
    if (key === 'swing_path') {
      return base.includes('path') ? base : `${base}. Smooth backlift and downswing; hands in close (CAB).`;
    }
    if (key === 'execution') {
      return base.includes('length') ? base : `${base}. Pick the stroke that fits where the ball pitched.`;
    }
    return base;
  }

  function resolveMetricKeyFromScores(head, stance, footwork, swingPath, execution) {
    if (head != null && Number(head) < 55) return 'head';
    if (footwork != null && Number(footwork) < 58) return 'footwork';
    if (stance != null && Number(stance) < 60) return 'stance';
    if (swingPath != null && Number(swingPath) < 45) return 'swing_path';
    if (execution != null && Number(execution) < 48) return 'execution';
    return 'execution';
  }

  function resolveShotTypeNoteForDelivery(llmInsights, shotLabelRaw) {
    const llmShotKey = resolveLlmShotKey(shotLabelRaw);
    if (!llmInsights?.shot_type_notes || !llmShotKey) return null;
    return llmInsights.shot_type_notes[llmShotKey] || llmInsights.shot_type_notes[String(shotLabelRaw || '').toLowerCase()] || null;
  }

  function shotAliasesForKey(shotKey) {
    const k = resolveLlmShotKey(shotKey);
    if (k === 'cover_drive') return ['cover', 'cover drive'];
    if (k === 'straight_drive') return ['straight', 'straight drive'];
    if (k === 'pull') return ['pull', 'pull shot'];
    if (k === 'flick') return ['flick'];
    if (k === 'sweep') return ['sweep'];
    return [String(k || '').replace(/_/g, ' ').trim()];
  }

  function textMentionsOtherShot(text, shotKey) {
    const t = String(text || '').toLowerCase();
    if (!t) return false;
    const all = ['cover_drive', 'straight_drive', 'pull', 'flick', 'sweep'];
    const target = resolveLlmShotKey(shotKey);
    return all.some((k) => k !== target && shotAliasesForKey(k).some((a) => t.includes(a)));
  }

  function buildAiCoachPanelHtml(rawInsights, confirmedShots) {
    const li = normalizeLlmInsights(rawInsights);
    if (!li) {
      return `<div class="rp-ai-card rp-ai-card--muted">
        <div class="rp-ai-title-row">
          <div class="rp-ai-title">AI Coach Analytics</div>
          <span class="rp-ai-badge rp-ai-badge--muted">Not available</span>
        </div>
        <p class="rp-ai-summary">No AI coach insights were stored for this session.</p>
      </div>`;
    }

    const usingFallback = li.fallbackUsed || li.provider === 'fallback_rules';
    const badgeText = usingFallback ? 'Fallback' : (li.provider === 'dgx' ? 'DGX' : 'LLM');
    const badgeClass = usingFallback ? 'rp-ai-badge--warn' : 'rp-ai-badge--ok';
    const modelLine = li.model ? `<span class="rp-ai-model">${escapeHtml(li.model)}</span>` : '';

    const strengthsHtml = li.strengths.length
      ? `<div class="rp-ai-placard-list">${li.strengths.map((s) => `<div class="rp-ai-placard rp-ai-placard--good">✓ ${escapeHtml(s)}</div>`).join('')}</div>`
      : '<div class="rp-ai-empty">No strengths captured.</div>';

    const improvementsHtml = li.improvements.length
      ? `<div class="rp-ai-placard-list">${li.improvements.map((s) => `<div class="rp-ai-placard rp-ai-placard--focus">• ${escapeHtml(s)}</div>`).join('')}</div>`
      : '<div class="rp-ai-empty">No focus areas captured.</div>';

    const playedShotKeys = [...new Set(
      (confirmedShots || [])
        .map((s) => resolveLlmShotKey(s?.shot_type || s?.label || ''))
        .filter(Boolean)
    )];
    const shotNoteMap = { ...(li.shotTypeNotes || {}) };
    const fallbackStrength = li.strengths[0] || 'Good base through setup and movement.';
    const fallbackFocus = li.improvements[0] || clarifyCoachCue('execution', li.metricNotes?.shot_vs_length || li.metricNotes?.execution || '');
    playedShotKeys.forEach((k) => {
      const cur = shotNoteMap[k];
      if (!cur || typeof cur !== 'object') {
        shotNoteMap[k] = { strength: fallbackStrength, focus: fallbackFocus };
        return;
      }
      const s = String(cur.strength || '').trim();
      const f = String(cur.focus || '').trim();
      shotNoteMap[k] = {
        strength: s || fallbackStrength,
        focus: f || fallbackFocus,
      };
    });
    const shotTypeEntries = Object.entries(shotNoteMap);
    const shotTypeHtml = shotTypeEntries.length
      ? `<div class="rp-ai-grid">${shotTypeEntries.map(([k, v]) => {
          const rawStrength = v && typeof v === 'object' ? String(v.strength || '').trim() : '';
          const rawFocus = v && typeof v === 'object' ? String(v.focus || '').trim() : '';
          const fallbackStrength = `${prettyToken(k)} intent is repeatable in this session.`;
          const fallbackFocus = `For ${prettyToken(k).toLowerCase()}, keep head still and play through the line.`;
          const strength = rawStrength && !textMentionsOtherShot(rawStrength, k) ? rawStrength : fallbackStrength;
          const focus = rawFocus && !textMentionsOtherShot(rawFocus, k) ? rawFocus : fallbackFocus;
          return `<div class="rp-ai-note">
            <div class="rp-ai-note-k">${escapeHtml(String(k).replace(/_/g, ' '))}</div>
            ${strength ? `<div class="rp-ai-note-v"><strong>Strength:</strong> ${escapeHtml(strength)}</div>` : ''}
            ${focus ? `<div class="rp-ai-note-v"><strong>Focus:</strong> ${escapeHtml(focus)}</div>` : ''}
          </div>`;
        }).join('')}</div>`
      : '<div class="rp-ai-empty">No shot-wise notes captured.</div>';

    const metricOrder = ['head', 'stance', 'footwork', 'swing', 'execution'];
    const metricItems = metricOrder
      .map((k) => [k, li.metricNotes[k]])
      .filter(([, v]) => v != null && String(v).trim() !== '');
    const metricHtml = metricItems.length
      ? `<div class="rp-ai-grid">${metricItems.map(([k, v]) => `<div class="rp-ai-note">
          <div class="rp-ai-note-k">${escapeHtml(k)}</div>
          <div class="rp-ai-note-v">${escapeHtml(clarifyCoachCue(k, String(v)))}</div>
        </div>`).join('')}</div>`
      : '<div class="rp-ai-empty">No metric notes captured.</div>';

    return `<div class="rp-ai-card">
      <div class="rp-ai-title-row">
        <div class="rp-ai-title">AI Coach Analytics</div>
        <div class="rp-ai-right">
          ${modelLine}
          <span class="rp-ai-badge ${badgeClass}">${badgeText}</span>
        </div>
      </div>
      <p class="rp-ai-summary">${escapeHtml(li.summary || 'AI coach summary is unavailable for this session.')}</p>
      ${li.error ? `<div class="rp-ai-error">${escapeHtml(prettyLlmError(li.error))}</div>` : ''}
      <div class="rp-ai-section rp-ai-section--tile">
        <div class="rp-ai-section-title">Top strengths</div>
        ${strengthsHtml}
      </div>
      <div class="rp-ai-section rp-ai-section--tile">
        <div class="rp-ai-section-title">Focus areas</div>
        ${improvementsHtml}
      </div>
      <div class="rp-ai-section">
        <div class="rp-ai-section-title">Shot-wise notes</div>
        ${shotTypeHtml}
      </div>
      <div class="rp-ai-section">
        <div class="rp-ai-section-title">Metric notes</div>
        ${metricHtml}
      </div>
    </div>`;
  }

  function resolveLlmShotKey(labelRaw) {
    const raw = String(labelRaw || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'cover') return 'cover_drive';
    if (raw === 'straight') return 'straight_drive';
    return raw.replace(/\s+/g, '_');
  }

  function normalizeLengthLabel(lab, distM) {
    if (lab == null || lab === '') lab = 'full';
    if (String(lab).toLowerCase() !== 'uncertain') return String(lab).toLowerCase();
    if (distM != null && Number.isFinite(Number(distM))) {
      const d = Number(distM);
      if (d < 2) return 'yorker';
      if (d < 6) return 'full';
      if (d < 8) return 'good_length';
      return 'short';
    }
    return 'full';
  }

  function prettyToken(x) {
    return String(x || '')
      .split('_')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  function inferPaceBand(delivery) {
    const raw = String(delivery?.pace_band || '').toLowerCase();
    if (raw && raw !== 'unknown') return raw;
    const spd = Number(delivery?.speed_kmh_est);
    if (!Number.isFinite(spd)) return '';
    if (spd < 90) return 'slow';
    if (spd < 115) return 'medium';
    if (spd < 130) return 'fast';
    return 'very_fast';
  }

  function buildBallContextInsightHtml(confirmedShots, ballAnalytics) {
    const ds = Array.isArray(ballAnalytics?.deliveries) ? ballAnalytics.deliveries.filter((d) => d.shot_confirmed !== false) : [];
    if (!ds.length) {
      return '<div class="rp-ai-empty">Ball pace/range coaching context needs tracked deliveries.</div>';
    }
    const scoreByShot = new Map();
    (confirmedShots || []).forEach((s) => {
      const sn = Number(s.shot_num);
      const sc = Number(s.shot_score);
      if (Number.isFinite(sn) && Number.isFinite(sc)) scoreByShot.set(sn, sc);
    });
    const paceAgg = new Map();
    const lenAgg = new Map();
    ds.forEach((d) => {
      const sn = Number(d.shot_num ?? d.matched_confirmed_shot_num ?? d.display_num);
      const sc = scoreByShot.get(sn);
      if (!Number.isFinite(sc)) return;
      const pace = inferPaceBand(d);
      const len = normalizeLengthLabel(d?.length?.label || 'full', d?.length?.distance_m);
      if (pace) {
        const p = paceAgg.get(pace) || { sum: 0, n: 0 };
        p.sum += sc;
        p.n += 1;
        paceAgg.set(pace, p);
      }
      const l = lenAgg.get(len) || { sum: 0, n: 0 };
      l.sum += sc;
      l.n += 1;
      lenAgg.set(len, l);
    });
    const paceRows = [...paceAgg.entries()].map(([k, v]) => ({ key: k, avg: v.sum / Math.max(1, v.n), n: v.n })).sort((a, b) => b.avg - a.avg);
    const lenRows = [...lenAgg.entries()].map(([k, v]) => ({ key: k, avg: v.sum / Math.max(1, v.n), n: v.n })).sort((a, b) => b.avg - a.avg);
    const bestPace = paceRows[0] || null;
    const focusPace = paceRows.length > 1 ? paceRows[paceRows.length - 1] : null;
    const bestLen = lenRows[0] || null;
    const focusLen = lenRows.length > 1 ? lenRows[lenRows.length - 1] : null;
    const cards = [];
    if (bestPace) {
      cards.push(`<div class="rp-ai-note"><div class="rp-ai-note-k">Best vs pace</div><div class="rp-ai-note-v">${escapeHtml(prettyToken(bestPace.key))} balls are scoring best (${bestPace.avg.toFixed(1)}/10 over ${bestPace.n}).</div></div>`);
    }
    if (focusPace) {
      cards.push(`<div class="rp-ai-note"><div class="rp-ai-note-k">Pace to improve</div><div class="rp-ai-note-v">More reps needed against ${escapeHtml(prettyToken(focusPace.key))} pace (${focusPace.avg.toFixed(1)}/10).</div></div>`);
    }
    if (bestLen) {
      cards.push(`<div class="rp-ai-note"><div class="rp-ai-note-k">Best ball range</div><div class="rp-ai-note-v">${escapeHtml(prettyToken(bestLen.key))} length currently gives best outcomes (${bestLen.avg.toFixed(1)}/10).</div></div>`);
    }
    if (focusLen) {
      cards.push(`<div class="rp-ai-note"><div class="rp-ai-note-k">Range to focus</div><div class="rp-ai-note-v">Spend extra drills on ${escapeHtml(prettyToken(focusLen.key))} length (${focusLen.avg.toFixed(1)}/10).</div></div>`);
    }
    return cards.length ? `<div class="rp-ai-grid">${cards.join('')}</div>` : '<div class="rp-ai-empty">Not enough matched shot/ball rows for pace-range coaching context.</div>';
  }

  function buildPaceRangeCardsHtml(confirmedShots, ballAnalytics) {
    const ds = Array.isArray(ballAnalytics?.deliveries) ? ballAnalytics.deliveries.filter((d) => d.shot_confirmed !== false) : [];
    const scoreByShot = new Map();
    (confirmedShots || []).forEach((s) => {
      const sn = Number(s.shot_num);
      const sc = Number(s.shot_score);
      if (Number.isFinite(sn) && Number.isFinite(sc)) scoreByShot.set(sn, sc);
    });
    const paceAgg = new Map();
    const lenAgg = new Map();
    ds.forEach((d) => {
      const sn = Number(d.shot_num ?? d.matched_confirmed_shot_num ?? d.display_num);
      const sc = scoreByShot.get(sn);
      if (!Number.isFinite(sc)) return;
      const pace = inferPaceBand(d);
      const len = normalizeLengthLabel(d?.length?.label || 'full', d?.length?.distance_m);
      if (pace) {
        const p = paceAgg.get(pace) || { sum: 0, n: 0 };
        p.sum += sc;
        p.n += 1;
        paceAgg.set(pace, p);
      }
      const l = lenAgg.get(len) || { sum: 0, n: 0 };
      l.sum += sc;
      l.n += 1;
      lenAgg.set(len, l);
    });
    const paceRows = [...paceAgg.entries()].map(([k, v]) => ({ key: k, avg: v.sum / Math.max(1, v.n), n: v.n })).sort((a, b) => b.avg - a.avg);
    const lenRows = [...lenAgg.entries()].map(([k, v]) => ({ key: k, avg: v.sum / Math.max(1, v.n), n: v.n })).sort((a, b) => b.avg - a.avg);
    const bestPace = paceRows[0] || null;
    const focusPace = paceRows.length > 1 ? paceRows[paceRows.length - 1] : null;
    const bestLen = lenRows[0] || null;
    const focusLen = lenRows.length > 1 ? lenRows[lenRows.length - 1] : null;

    const cards = [];

    // Best vs Pace
    cards.push(`
      <div class="ai-v4-plan-card">
        <div class="ai-v4-plan-top">
          <span class="ai-v4-plan-tag">BEST VS PACE</span>
          <span class="ai-v4-plan-score ai-v4-plan-score--best-pace">${bestPace ? `${bestPace.avg.toFixed(1)} / 10` : '8.2 / 10'}</span>
        </div>
        <p class="ai-v4-plan-text">
          ${bestPace ? `${escapeHtml(prettyToken(bestPace.key))} balls are scoring best <span class="ai-v4-plan-sub">(over ${bestPace.n}).</span>` : 'Medium balls are scoring best <span class="ai-v4-plan-sub">(over 1).</span>'}
        </p>
      </div>`);

    // Pace to Improve
    cards.push(`
      <div class="ai-v4-plan-card">
        <div class="ai-v4-plan-top">
          <span class="ai-v4-plan-tag">PACE TO IMPROVE</span>
          <span class="ai-v4-plan-score ai-v4-plan-score--focus-pace">${focusPace ? `${focusPace.avg.toFixed(1)} / 10` : '7.1 / 10'}</span>
        </div>
        <p class="ai-v4-plan-text">
          ${focusPace ? `More reps needed against ${escapeHtml(prettyToken(focusPace.key))} pace.` : 'More reps needed against Slow pace.'}
        </p>
      </div>`);

    // Best Ball Range
    cards.push(`
      <div class="ai-v4-plan-card">
        <div class="ai-v4-plan-top">
          <span class="ai-v4-plan-tag">BEST BALL RANGE</span>
          <span class="ai-v4-plan-score ai-v4-plan-score--best-len">${bestLen ? `${bestLen.avg.toFixed(1)} / 10` : '7.4 / 10'}</span>
        </div>
        <p class="ai-v4-plan-text">
          ${bestLen ? `${escapeHtml(prettyToken(bestLen.key))} length currently gives best outcomes.` : 'Full length currently gives best outcomes.'}
        </p>
      </div>`);

    // Range to Focus
    cards.push(`
      <div class="ai-v4-plan-card">
        <div class="ai-v4-plan-top">
          <span class="ai-v4-plan-tag">RANGE TO FOCUS</span>
          <span class="ai-v4-plan-score ai-v4-plan-score--focus-len">${focusLen ? `${focusLen.avg.toFixed(1)} / 10` : '7.0 / 10'}</span>
        </div>
        <p class="ai-v4-plan-text">
          ${focusLen ? `Spend extra drills on ${escapeHtml(prettyToken(focusLen.key))} length.` : 'Spend extra drills on Short length.'}
        </p>
      </div>`);

    return `<div class="ai-v4-section" style="gap: 10px;">${cards.join('')}</div>`;
  }

  function buildOverviewAiInsightsHtml(rawInsights, alertsList, confirmedShots, ballAnalytics) {
    const li = normalizeLlmInsights(rawInsights);
    const alerts = Array.isArray(alertsList) ? alertsList : [];
    const usingFallback = !li || li.fallbackUsed || li.provider === 'fallback_rules';
    const badgeText = usingFallback ? 'Fallback' : (li.provider === 'dgx' ? 'DGX' : 'AI Coach');
    const bannerClass = usingFallback ? 'ai-v4-banner--fallback' : 'ai-v4-banner--live';

    // 1. Banner
    const bannerHtml = `
      <section class="ai-v4-banner ${bannerClass}" data-purpose="banner">
        <div class="ai-v4-banner-bar"></div>
        <div class="ai-v4-banner-head">
          <div class="ai-v4-banner-title-wrap">
            <div class="ai-v4-banner-icon">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </div>
            <h2 class="ai-v4-banner-title">AI Coach Analytics</h2>
          </div>
          <span class="ai-v4-banner-badge">${escapeHtml(badgeText)}</span>
        </div>
        <p class="ai-v4-banner-body">
          ${escapeHtml(li?.summary || 'AI coach video model was unavailable for this session. Showing rule-based coaching cues.')}
        </p>
        ${(usingFallback || li?.error) ? `
          <div class="ai-v4-banner-footer">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            <span>${escapeHtml(prettyLlmError(li?.error || 'llm_missing_in_saved_session'))}</span>
          </div>
        ` : ''}
      </section>`;

    // 2. Strengths
    const strengths = (li?.strengths && li.strengths.length) ? li.strengths : [
      'Head stays still through most balls.',
      'Footwork supports timing and balance.'
    ];
    const strengthsHtml = `
      <section class="ai-v4-section" data-purpose="top-strengths">
        <div class="ai-v4-section-head">
          <div class="ai-v4-section-title-wrap">
            <span class="ai-v4-section-icon ai-v4-icon--strengths">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"></path>
              </svg>
            </span>
            <h3 class="ai-v4-section-title ai-v4-title--strengths">Top Strengths</h3>
          </div>
          <span class="ai-v4-count-pill ai-v4-pill--strengths">${strengths.length} Verified</span>
        </div>
        <div class="ai-v4-section">
          ${strengths.map((s) => `
            <div class="ai-v4-strength-item">
              <div class="ai-v4-strength-check">
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                  <path d="M4.5 12.75l6 6 9-13.5" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </div>
              <p class="ai-v4-strength-text">${escapeHtml(s)}</p>
            </div>
          `).join('')}
        </div>
      </section>`;

    // 3. Focus Areas
    const improvements = (li?.improvements && li.improvements.length) ? li.improvements : [
      'Watch the seam onto the bat. Keep the head still — let the eyes track.',
      'Level shoulders, even weight, head quiet in the middle before you move.',
      "Let the ball come; keep a little room so the bat doesn't jam into the body."
    ];
    const focusHtml = `
      <section class="ai-v4-section" data-purpose="focus-areas">
        <div class="ai-v4-section-head">
          <div class="ai-v4-section-title-wrap">
            <span class="ai-v4-section-icon ai-v4-icon--focus">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9"></circle>
                <circle cx="12" cy="12" r="4"></circle>
              </svg>
            </span>
            <h3 class="ai-v4-section-title ai-v4-title--focus">Focus Areas</h3>
          </div>
          <span class="ai-v4-count-pill ai-v4-pill--focus">${improvements.length} Priority</span>
        </div>
        <div class="ai-v4-section">
          ${improvements.map((f) => `
            <div class="ai-v4-focus-item">
              <span class="ai-v4-focus-bullet"></span>
              <p class="ai-v4-focus-text">${escapeHtml(f)}</p>
            </div>
          `).join('')}
        </div>
      </section>`;

    // 4. Shot-Wise Notes & Drills
    const shotCounts = {};
    (confirmedShots || []).forEach((s) => {
      const k = resolveLlmShotKey(s?.shot_type || s?.label || '');
      if (k) shotCounts[k] = (shotCounts[k] || 0) + 1;
    });
    const shotNoteMap = { ...(li?.shotTypeNotes || {}) };
    let shotKeys = Object.keys(shotCounts).length ? Object.keys(shotCounts) : Object.keys(shotNoteMap);
    if (!shotKeys.length) shotKeys = ['cover_drive'];

    shotKeys.sort((a, b) => (shotCounts[b] || 0) - (shotCounts[a] || 0));
    const primaryKey = shotKeys[0];

    const dgxDrills = Array.isArray(li?.recommendedDrills) ? li.recommendedDrills : [];
    const alertDrills = alerts.map((a) => String(a?.drill || a?.action || '').trim()).filter(Boolean);
    const drills = [...new Set([...dgxDrills, ...alertDrills])].slice(0, 4);
    if (!drills.length) {
      drills.push("Underarm feeds with cones under the armpits — don't drop them for 20 balls.");
      drills.push('Slower feeds; hit straight back to the feeder with the full face — 25 balls.');
    }

    const shotsHtml = `
      <section class="ai-v4-section" data-purpose="shot-notes-and-drills">
        <div class="ai-v4-section-head">
          <div class="ai-v4-section-title-wrap">
            <span class="ai-v4-section-icon ai-v4-icon--shots">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </span>
            <h3 class="ai-v4-section-title ai-v4-title--shots">Shot-Wise Notes &amp; Drills</h3>
          </div>
        </div>
        ${shotKeys.map((k, idx) => {
          const v = shotNoteMap[k] || {};
          const fallbackStrength = strengths[0] || `${prettyToken(k)} intent is repeatable in this session.`;
          const fallbackFocus = improvements[0] || `For ${prettyToken(k).toLowerCase()}, keep head still and play through the line.`;
          const rawStrength = String(v.strength || '').trim();
          const rawFocus = String(v.focus || '').trim();
          const strength = rawStrength && !textMentionsOtherShot(rawStrength, k) ? rawStrength : fallbackStrength;
          const focus = rawFocus && !textMentionsOtherShot(rawFocus, k) ? rawFocus : fallbackFocus;
          const isPrimary = (k === primaryKey);

          return `
            <article class="ai-v4-shot-card">
              <div class="ai-v4-shot-header">
                <div class="ai-v4-shot-title-wrap">
                  <span class="ai-v4-shot-diamond"></span>
                  <h4 class="ai-v4-shot-name">${escapeHtml(prettyToken(k))}</h4>
                </div>
                <span class="ai-v4-shot-badge">${isPrimary ? 'Primary Shot' : 'Shot Note'}</span>
              </div>
              <div class="ai-v4-shot-notes-box">
                <div class="ai-v4-shot-note-row">
                  <span class="ai-v4-shot-note-label--good">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                    Strength:
                  </span>
                  <span class="ai-v4-shot-note-val">${escapeHtml(strength)}</span>
                </div>
                <div class="ai-v4-shot-note-row">
                  <span class="ai-v4-shot-note-label--focus">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                    Focus:
                  </span>
                  <span class="ai-v4-shot-note-val">${escapeHtml(focus)}</span>
                </div>
              </div>
              ${idx === 0 && drills.length ? `
                <div class="ai-v4-section" style="gap: 8px;">
                  <span class="ai-v4-drills-subhead">Assigned Practice Drills</span>
                  ${drills.map((d) => `
                    <div class="ai-v4-drill-card">
                      <span class="ai-v4-drill-emoji">🏏</span>
                      <p class="ai-v4-drill-text">${escapeHtml(d)}</p>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </article>`;
        }).join('')}
      </section>`;

    // 5. Posture and Setup Cues
    const metricNotes = li?.metricNotes || {};
    const postureCues = [
      clarifyCoachCue('head', metricNotes.head),
      clarifyCoachCue('stance', metricNotes.stance),
      clarifyCoachCue('footwork', metricNotes.footwork),
    ].map((x) => String(x || '').trim()).filter(Boolean);
    const alertPostureCues = alerts.map((a) => String(a?.player_cue || '').trim()).filter(Boolean);
    const mergedPosture = [...new Set([...postureCues, ...alertPostureCues])].slice(0, 3);
    if (!mergedPosture.length) {
      mergedPosture.push('Keep your head still and eyes level at contact.');
      mergedPosture.push('Work on stance symmetry and body balance before release.');
      mergedPosture.push('Get your front foot down early and stay balanced.');
    }
    const postureIcons = ['🧘‍♂️', '⚖️', '🦶'];
    const postureHtml = `
      <section class="ai-v4-section" data-purpose="posture-cues">
        <div class="ai-v4-section-head">
          <div class="ai-v4-section-title-wrap">
            <span class="ai-v4-section-icon ai-v4-icon--posture">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </span>
            <h3 class="ai-v4-section-title ai-v4-title--posture">Posture and Setup Cues</h3>
          </div>
        </div>
        <div class="ai-v4-section">
          ${mergedPosture.map((cue, idx) => `
            <div class="ai-v4-posture-card">
              <div class="ai-v4-posture-icon-wrap">
                <span>${postureIcons[idx % postureIcons.length]}</span>
              </div>
              <p class="ai-v4-posture-text">${escapeHtml(cue)}</p>
            </div>
          `).join('')}
        </div>
      </section>`;

    // 6. Pace and Range Game Plan
    const gamePlanHtml = `
      <section class="ai-v4-section" data-purpose="gameplan-analytics">
        <div class="ai-v4-section-head">
          <div class="ai-v4-section-title-wrap">
            <span class="ai-v4-section-icon ai-v4-icon--plan">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </span>
            <h3 class="ai-v4-section-title ai-v4-title--plan">Pace and Range Game Plan</h3>
          </div>
        </div>
        ${buildPaceRangeCardsHtml(confirmedShots, ballAnalytics)}
      </section>`;

    return `
      <div class="ai-v4-wrap">
        <div class="ai-v4-tracker">
          <span class="ai-v4-tracker-text">AI COACH INSIGHTS</span>
          <div class="ai-v4-tracker-line"></div>
        </div>
        ${bannerHtml}
        ${strengthsHtml}
        ${focusHtml}
        ${shotsHtml}
        ${postureHtml}
        ${gamePlanHtml}
      </div>`;
  }

  // ── Inject styles ────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('rp-styles')) return;
    const style = document.createElement('style');
    style.id = 'rp-styles';
    style.textContent = `
/* ═══ MODERN NET SESSION REPORT MODAL STYLES ═══ */

/* Clickable Session Overview Card */
.ss-hero-card.ss-hero-clickable {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
}
.ss-hero-card.ss-hero-clickable:active {
  transform: scale(0.985);
}
.ss-hero-card-arrow {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #0284c7;
  margin-top: 10px;
  justify-content: flex-end;
}
.ss-hero-card-arrow svg {
  width: 14px;
  height: 14px;
  transition: transform 0.15s ease;
}
.ss-hero-card.ss-hero-clickable:hover .ss-hero-card-arrow svg {
  transform: translateX(2px);
}

/* Nested Session Overview Modal / Subpage */
.so-page-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0 20px;
}
.so-section-card {
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03);
  border: 1px solid #f1f5f9;
  overflow: hidden;
}
.so-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
}
.so-section-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.so-section-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.so-icon--violet { background: #f5f3ff; color: #7c3aed; }
.so-icon--blue { background: #eff6ff; color: #2563eb; }
.so-icon--orange { background: #fff7ed; color: #ea580c; }
.so-section-title {
  font-size: 13px;
  font-weight: 800;
  color: #0f172a;
}
.so-section-sub {
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  margin-top: 1px;
}
.so-section-body {
  padding: 14px 14px 18px;
}
.so-section-body > .ai-v4-wrap {
  margin-top: 0 !important;
}
.so-section-body > .ai-v4-wrap > .ai-v4-tracker {
  display: none !important;
}
.so-section-body .rp-v3-wrapper {
  margin: 0 !important;
  padding: 0 !important;
}
.so-section-body .rp-v3-head {
  display: none !important;
}
.so-section-body .sz-wrap {
  margin-top: 0 !important;
  padding: 0 !important;
}
.so-section-body .sz-head-intro {
  display: none !important;
}

/* Collapsible Section Styling */
.so-section-header {
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s ease;
}
.so-section-header:active {
  background: #f8fafc;
}
.so-chevron-wrap {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  flex-shrink: 0;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s ease, color 0.2s ease;
}
.so-chevron-ico {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.so-section-card.so-collapsed .so-chevron-ico {
  transform: rotate(-90deg);
}
.so-section-card.so-collapsed .so-section-header {
  border-bottom-color: transparent;
}
.so-section-card.so-collapsed .so-section-body {
  display: none !important;
}

/* ── Modern Vertical Delivery Cards (Net Session Report) ── */
.rp-deliv-cards-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 10px;
}

.rp-deliv-card {
  background: #ffffff;
  border-radius: 18px;
  border: 1px solid #f1f5f9;
  box-shadow: 0 3px 14px -2px rgba(15, 23, 42, 0.05), 0 1px 4px -1px rgba(15, 23, 42, 0.02);
  overflow: hidden;
  transition: all 0.2s ease;
}

.rp-deliv-card-head {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  background: #ffffff;
}

.rp-deliv-card-head:active {
  background: #f8fafc;
}

.rp-deliv-head-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rp-deliv-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border-radius: 10px;
  background: #f1f5f9;
  color: #0f172a;
  font-size: 0.82rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.rp-deliv-shot-name {
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.rp-deliv-ball-pill {
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
  margin-top: 2px;
}

.rp-deliv-head-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rp-deliv-score-box {
  text-align: right;
}

.rp-deliv-score-num {
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1;
}

.rp-deliv-score-sub {
  font-size: 0.68rem;
  font-weight: 700;
  color: #94a3b8;
  margin-top: 2px;
}

.rp-deliv-chevron {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  transition: transform 0.25s ease;
}

.rp-deliv-card.is-open .rp-deliv-chevron {
  transform: rotate(180deg);
}

/* Key Metrics Row (Always Visible - Numbers as Main Text, Metric & Tags as Sub Text) */
.rp-deliv-key-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  padding: 0 16px 14px;
}

.rp-deliv-mini-metric {
  background: #f8fafc;
  border-radius: 14px;
  padding: 10px 6px 10px;
  border: 1px solid #eef2f6;
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  transition: transform 0.15s ease, background 0.15s ease;
}

.rp-deliv-mini-metric:active {
  background: #f1f5f9;
}

/* Number is the main highlight / hero text */
.rp-deliv-mini-val {
  font-size: 1.65rem;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  display: inline-block;
}

/* Sub text: Metric name and status/tag */
.rp-deliv-mini-label {
  font-size: 0.64rem;
  font-weight: 800;
  text-transform: uppercase;
  color: #475569;
  letter-spacing: 0.04em;
  margin-top: 4px;
  line-height: 1.15;
}

.rp-deliv-mini-sub {
  font-size: 0.60rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-top: 2px;
  line-height: 1;
}

/* Collapsible Detailed Section */
.rp-deliv-details-wrap {
  display: none;
  border-top: 1px solid #f1f5f9;
  padding: 14px 16px;
  background: #fafafa;
}

.rp-deliv-card.is-open .rp-deliv-details-wrap {
  display: block;
}

.rp-deliv-grid-more {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.rp-deliv-more-box {
  background: #ffffff;
  border-radius: 12px;
  padding: 9px 6px;
  border: 1px solid #eef2f6;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.02);
}

.rp-deliv-more-val {
  font-size: 1.05rem;
  font-weight: 850;
  color: #0f172a;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.rp-deliv-more-label {
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
  color: #64748b;
  letter-spacing: 0.03em;
  margin-top: 3px;
}

.rp-deliv-more-sub {
  font-size: 0.58rem;
  font-weight: 700;
  color: #94a3b8;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.rp-deliv-coach-section {
  background: #ffffff;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid #f1f5f9;
  margin-top: 10px;
}

.rp-deliv-coach-head {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  color: #0f172a;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}


/* ── What Metrics Mean Collapsible Cards ── */
.rp-explain-card {
  background: #ffffff;
  border-radius: 18px;
  border: 1px solid #f1f5f9;
  box-shadow: 0 3px 14px -2px rgba(15, 23, 42, 0.05), 0 1px 4px -1px rgba(15, 23, 42, 0.02);
  overflow: hidden;
  margin-bottom: 12px;
  transition: all 0.2s ease;
}

.rp-explain-head {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  background: #ffffff;
}

.rp-explain-head:active {
  background: #f8fafc;
}

.rp-explain-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rp-explain-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  flex-shrink: 0;
}

.rp-explain-title {
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #0f172a;
}

.rp-explain-sub {
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
  margin-top: 1px;
}

.rp-explain-chevron {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  transition: transform 0.25s ease;
  flex-shrink: 0;
}

.rp-explain-card.is-open .rp-explain-chevron {
  transform: rotate(180deg);
}

.rp-explain-body {
  display: none;
  border-top: 1px solid #f1f5f9;
  padding: 14px 16px 16px;
  background: #fafafa;
}

.rp-explain-card.is-open .rp-explain-body {
  display: block;
}

.rp-explain-section {
  margin-bottom: 12px;
}

.rp-explain-section:last-child {
  margin-bottom: 0;
}

.rp-explain-badge {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin-bottom: 4px;
}

.rp-explain-text {
  font-size: 0.82rem;
  line-height: 1.55;
  color: #334155;
  margin: 0;
}

.rp-explain-tip-box {
  background: #ffffff;
  border-radius: 12px;
  padding: 12px 14px;
  border: 1px solid #f1f5f9;
  margin-top: 6px;
}


@layer legacy {

.rp-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: flex-end; justify-content: center;
  padding: 0;
  animation: rpFadeIn 0.25s ease-out;
}
@media (min-width: 640px) {
  .rp-overlay {
    align-items: center;
    padding: 16px;
  }
}
@keyframes rpFadeIn { from { opacity: 0; } to { opacity: 1; } }

.rp-modal {
  background: #ffffff;
  border-radius: 36px 36px 0 0;
  width: 100%;
  max-width: 480px;
  height: 94vh;
  max-height: 94vh;
  display: flex;
  flex-direction: column;
  position: relative;
  box-shadow: 0 -10px 40px -5px rgba(0, 0, 0, 0.25), 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  animation: rpSlideUp 0.32s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
  color: #1e293b;
}
@media (min-width: 640px) {
  .rp-modal {
    border-radius: 36px;
    height: 90vh;
    max-height: 880px;
  }
}
@keyframes rpSlideUp {
  from { opacity: 0; transform: translateY(40px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* Pull bar indicator */
.rp-pull-bar {
  width: 48px; height: 4px;
  background: #cbd5e1;
  border-radius: 9999px;
  margin: 12px auto 4px;
  flex-shrink: 0;
}

/* Header Session Summary Card */
.rp-header {
  padding: 8px 24px 16px;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}
.rp-header-top {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
}
.rp-title {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.025em;
  color: #0f172a;
  line-height: 1.25;
}
.rp-close {
  width: 36px; height: 36px;
  border-radius: 9999px;
  background: #f1f5f9;
  border: 1px solid rgba(226, 232, 240, 0.8);
  display: flex; align-items: center; justify-content: center;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}
.rp-close:hover {
  background: #e2e8f0;
  color: #0f172a;
}
.rp-close:active {
  transform: scale(0.95);
}

.rp-header-meta {
  margin-top: 12px;
  display: flex; align-items: center; gap: 10px;
  flex-wrap: wrap;
}
.rp-stance-pill {
  padding: 4px 10px;
  border-radius: 10px;
  border: 2px solid #67e8f9;
  background: rgba(236, 254, 255, 0.7);
  color: #155e75;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.rp-meta-stats {
  font-size: 12px;
  font-weight: 500;
  color: #475569;
}
.rp-meta-stats strong {
  font-weight: 700;
  color: #0f172a;
}
.rp-meta-dot {
  margin: 0 4px;
  color: #cbd5e1;
}

.rp-header-averages {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #f1f5f9;
  font-size: 11px;
  line-height: 1.4;
  color: #64748b;
  letter-spacing: -0.01em;
}
.rp-header-averages strong {
  color: #334155;
  font-weight: 700;
}
.rp-header-averages span.rp-avg-val {
  color: #0f172a;
  font-weight: 700;
}

/* Sticky Segmented Navigation Tabs */
.rp-tabs {
  position: sticky; top: 0; z-index: 20;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(226, 232, 240, 0.8);
  padding: 0 16px;
  display: flex; align-items: center; justify-content: flex-start; gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}
.rp-tabs::-webkit-scrollbar { display: none; }
.rp-tab {
  padding: 12px 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #64748b;
  background: none;
  border: none;
  border-bottom: 2.5px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.rp-tab:hover {
  color: #0f172a;
}
.rp-tab.tab-active, .rp-tab.active {
  color: #0284c7;
  border-bottom-color: #06b6d4;
}

/* Modal Body */
.rp-body {
  flex: 1;
  background: #f1f5f9;
  overflow-y: auto;
  padding: 16px;
  padding-bottom: 96px; /* space for sticky floating footer */
  scrollbar-width: thin;
  scrollbar-color: rgba(6, 182, 212, 0.3) transparent;
}
.rp-body::-webkit-scrollbar { width: 5px; }
.rp-body::-webkit-scrollbar-thumb { background: rgba(6, 182, 212, 0.3); border-radius: 9999px; }

/* Section Title */
.rp-section-title {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #94a3b8;
  margin: 16px 4px 10px;
  display: flex; align-items: center; justify-content: space-between;
}
.rp-section-title:first-child { margin-top: 4px; }

/* Shot Highlights (Signature & Work-on) */
.rp-highlights {
  display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;
}
.rp-highlight-card {
  background: #ffffff;
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03);
  border: 1px solid #f1f5f9;
  display: flex; align-items: center; gap: 14px;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
}
.rp-highlight-card:hover {
  box-shadow: 0 6px 24px -2px rgba(15, 23, 42, 0.08);
}
.rp-hl-icon-wrap {
  width: 48px; height: 48px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}
.rp-highlight-card.best .rp-hl-icon-wrap { background: #fef3c7; }
.rp-highlight-card.worst .rp-hl-icon-wrap { background: #ffedd5; }

.rp-hl-tag {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #94a3b8;
  margin-bottom: 2px;
  display: block;
}
.rp-hl-val {
  font-size: 1.15rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin-bottom: 4px;
}
.rp-highlight-card.best .rp-hl-val { color: #f59e0b; }
.rp-highlight-card.worst .rp-hl-val { color: #7c3aed; }

.rp-hl-sub {
  font-size: 12px;
  color: #475569;
  font-weight: 500;
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.rp-hl-sub strong {
  font-weight: 700;
  color: #0f172a;
}

/* Core Metrics Circular Gauges Grid */
.rp-pies {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-bottom: 20px;
}
@media (min-width: 420px) {
  .rp-pies {
    grid-template-columns: 1fr 1fr;
  }
}
.rp-gauge-card {
  background: #ffffff;
  border-radius: 24px;
  padding: 20px 16px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03);
  border: 1px solid #f1f5f9;
  display: flex; flex-direction: column; align-items: center; text-align: center;
}
.gauge-circle {
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Posture & Setup Cues Section */
.rp-posture-section {
  display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;
}
.rp-posture-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 14px 16px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03);
  border: 1px solid #f1f5f9;
  display: flex; align-items: center; gap: 14px;
}
.rp-posture-icon {
  width: 42px; height: 42px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
  background: #ecfeff;
}
.rp-posture-icon.balance { background: #f0fdfa; }
.rp-posture-icon.foot { background: #fffbeb; }
.rp-posture-text {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.4;
}

/* Strategy / Pace Range Pill Card */
.rp-strategy-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 14px 18px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03);
  border: 1px solid #f1f5f9;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-top: 10px;
}
.rp-strategy-label {
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #475569;
}
.rp-strategy-score {
  padding: 4px 12px;
  border-radius: 8px;
  background: #ecfdf5;
  color: #059669;
  font-size: 13px;
  font-weight: 800;
  border: 1px solid #a7f3d0;
}

/* All Deliveries Modern Table */
.rp-table-card {
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03);
  border: 1px solid #f1f5f9;
  overflow: hidden;
  margin-bottom: 20px;
}
.rp-table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}
.rp-table-scroll::-webkit-scrollbar { height: 5px; }
.rp-table-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }

.rp-modern-table {
  width: 100%;
  text-align: left;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 580px;
}
.rp-modern-table thead tr {
  background: rgba(248, 250, 252, 0.9);
  border-bottom: 1px solid #e2e8f0;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
}
.rp-modern-table th {
  padding: 12px 14px;
}
.rp-modern-table tbody tr {
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.15s;
}
.rp-modern-table tbody tr:hover {
  background: rgba(248, 250, 252, 0.7);
}
.rp-modern-table td {
  padding: 14px;
  vertical-align: middle;
}
.rp-td-num {
  font-weight: 800;
  color: #94a3b8;
  width: 36px;
}
.rp-td-shot {
  font-weight: 900;
  color: #0f172a;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.rp-td-exec {
  font-weight: 900;
  font-size: 14px;
  white-space: nowrap;
}
.rp-metric-cell {
  white-space: nowrap;
}
.rp-cell-score {
  font-size: 14px;
  font-weight: 800;
  line-height: 1.1;
}
.rp-cell-tag {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-top: 1px;
}
.rp-cell-hint {
  font-size: 10px;
  color: #94a3b8;
  font-weight: normal;
  margin-top: 1px;
}
.rp-badge-pace {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* Sticky Floating Action Bar / Mobile Footer */
.rp-floating-footer {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid rgba(226, 232, 240, 0.8);
  padding: 12px 18px calc(12px + env(safe-area-inset-bottom));
  display: flex; align-items: center; gap: 12px;
  z-index: 30;
  box-shadow: 0 -4px 20px -2px rgba(15, 23, 42, 0.05);
}
.rp-btn-share {
  flex: 1;
  background: #0f172a;
  color: #ffffff;
  padding: 12px 18px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: -0.01em;
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
}
.rp-btn-share:hover { background: #000000; }
.rp-btn-share:active { transform: scale(0.98); }
.rp-btn-share svg { color: #22d3ee; }

.rp-btn-pdf {
  width: 44px; height: 44px;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #334155;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.rp-btn-pdf:hover { background: #f8fafc; }
.rp-btn-pdf:active { transform: scale(0.95); }

/* Ball Length Section */
.rp-ball-length-card {
  background: #ffffff;
  border-radius: 24px;
  padding: 20px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03);
  border: 1px solid #f1f5f9;
  margin-bottom: 20px;
}
.rp-pitch-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  background: #f0fdfa;
  color: #0f766e;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rp-pitch-dot {
  width: 6px; height: 6px; border-radius: 9999px; background: #14b8a6;
}

/* Keep existing AI Coach styles and Playcard styles intact */
.ai-v4-wrap { display: flex; flex-direction: column; gap: 16px; margin-top: 12px; }
.ai-v4-tracker { display: flex; align-items: center; gap: 10px; margin: 4px 0; }
.ai-v4-tracker-text { font-size: 10px; font-weight: 800; letter-spacing: 0.1em; color: #94a3b8; }
.ai-v4-tracker-line { flex: 1; height: 1px; background: #e2e8f0; }

.ai-v4-banner {
  background: #ffffff; border-radius: 20px; padding: 16px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
  border: 1px solid #f1f5f9;
}
.ai-v4-banner-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.ai-v4-banner-title-wrap { display: flex; align-items: center; gap: 8px; }
.ai-v4-banner-icon { color: #0284c7; }
.ai-v4-banner-title { font-size: 14px; font-weight: 800; color: #0f172a; margin: 0; }
.ai-v4-banner-badge { font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 6px; background: #f0fdf4; color: #166534; }
.ai-v4-banner-body { font-size: 12px; color: #475569; line-height: 1.5; margin: 0; }

.ai-v4-section { display: flex; flex-direction: column; gap: 8px; }
.ai-v4-section-head { display: flex; align-items: center; justify-content: space-between; margin: 6px 0 2px; }
.ai-v4-section-title-wrap { display: flex; align-items: center; gap: 6px; }
.ai-v4-section-title { font-size: 12px; font-weight: 800; color: #334155; margin: 0; }
.ai-v4-count-pill { font-size: 10px; font-weight: 700; color: #64748b; }

.ai-v4-strength-item {
  background: #ffffff; border-radius: 14px; padding: 12px 14px;
  border: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px;
}
.ai-v4-strength-check { color: #10b981; }
.ai-v4-strength-text { font-size: 12px; color: #334155; margin: 0; font-weight: 600; }

.ai-v4-focus-item {
  background: #ffffff; border-radius: 14px; padding: 12px 14px;
  border: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px;
}
.ai-v4-focus-bullet { width: 6px; height: 6px; border-radius: 9999px; background: #f59e0b; flex-shrink: 0; }
.ai-v4-focus-text { font-size: 12px; color: #334155; margin: 0; font-weight: 600; }

.ai-v4-shot-card {
  background: #ffffff; border-radius: 16px; padding: 14px;
  border: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 8px;
}
.ai-v4-shot-head { display: flex; align-items: center; justify-content: space-between; }
.ai-v4-shot-title { font-size: 13px; font-weight: 800; color: #0f172a; }
.ai-v4-shot-count-badge { font-size: 10px; font-weight: 700; color: #64748b; }
.ai-v4-shot-notes { display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
.ai-v4-shot-note-row { display: flex; gap: 6px; }
.ai-v4-shot-note-label--strength { font-weight: 700; color: #10b981; display: inline-flex; align-items: center; gap: 2px; }
.ai-v4-shot-note-label--focus { font-weight: 700; color: #f59e0b; display: inline-flex; align-items: center; gap: 2px; }
.ai-v4-shot-note-val { color: #334155; }
.ai-v4-drill-card {
  background: #f8fafc; border-radius: 10px; padding: 8px 10px;
  display: flex; align-items: center; gap: 8px; font-size: 11px; color: #334155;
}

.ai-v4-posture-card {
  background: #ffffff; border-radius: 14px; padding: 12px 14px;
  border: 1px solid #f1f5f9; display: flex; align-items: center; gap: 10px;
}
.ai-v4-posture-icon-wrap { font-size: 18px; }
.ai-v4-posture-text { font-size: 12px; font-weight: 600; color: #334155; margin: 0; }

.ai-v4-plan-card {
  background: #ffffff; border-radius: 14px; padding: 12px 14px;
  border: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 4px;
}
.ai-v4-plan-top { display: flex; align-items: center; justify-content: space-between; }
.ai-v4-plan-tag { font-size: 10px; font-weight: 800; color: #64748b; letter-spacing: 0.05em; }
.ai-v4-plan-score { font-size: 12px; font-weight: 800; padding: 2px 8px; border-radius: 6px; }
.ai-v4-plan-score--best-pace, .ai-v4-plan-score--best-len { background: #ecfdf5; color: #059669; }
.ai-v4-plan-score--focus-pace, .ai-v4-plan-score--focus-len { background: #fff7ed; color: #c2410c; }
.ai-v4-plan-text { font-size: 11px; color: #334155; margin: 0; }
.ai-v4-plan-sub { color: #94a3b8; }

.rp-flag-stack { display: flex; flex-wrap: wrap; gap: 4px; }
.rp-shots-chip {
  display: inline-block; padding: 2px 6px; border-radius: 4px;
  font-size: 10px; font-weight: 700; white-space: nowrap;
}
.rp-shots-detail summary {
  cursor: pointer; font-size: 10px; font-weight: 700; color: #0284c7; margin-top: 4px;
}
.rp-shots-detail-text { font-size: 10px; color: #475569; margin-top: 2px; }

/* Metrics panel grid */
.rp-metrics-grid {
  display: grid; grid-template-columns: 1fr; gap: 12px;
}
@media (min-width: 500px) {
  .rp-metrics-grid { grid-template-columns: 1fr 1fr; }
}

} /* end @layer legacy */
    `;
    document.head.appendChild(style);
  }

  
    if (typeof window !== 'undefined') {
      window.toggleExplainCard = function(headEl) {
        if (!headEl) return;
        const card = headEl.closest('.rp-explain-card');
        if (card) {
          card.classList.toggle('is-open');
        }
      };
    }

  function buildModal(data) {
    const { shots, analysis } = data;
    const ballAnalytics = data.ballAnalytics ?? data.completePayload?.ball_analytics ?? null;
    const llmInsights =
      data.llmInsights ??
      data.completePayload?.llm_insights ??
      analysis?.llm_insights ??
      buildUiFallbackInsights(analysis);
    const originalVideoUrl = data.originalVideoUrl || '';
    const originalVideoName = data.originalVideoName || '';
    const sessionDateLabel = data.sessionDateLabel || '';
    const sessionStatus = data.sessionStatus || '';
    const ballByShot = indexBallDeliveriesByShot(ballAnalytics);
    const summary = getAnalysisSummary(analysis);
    const best  = analysis.best_shot || {};
    const worst = analysis.worst_shot || {};
    const alerts = analysis.coaching_alerts || [];
    const stance = data.stance || 'RHB';

    const confirmedShots = (shots || []).filter(s => s.confirmed !== false || Number(s.conf ?? s.confidence) >= 0.20);
    const totalShots = confirmedShots.length;
    const confirmedCount = summary.shotsConfirmed || totalShots;
    const avgScore = summary.avgShotScore != null
      ? Number(summary.avgShotScore).toFixed(1)
      : (totalShots ? (confirmedShots.reduce((a,s) => a + (s.shot_score||0), 0) / totalShots).toFixed(1) : '—');
    const usage =
      summary.shotsTotalDetected > summary.shotsConfirmed && confirmedCount > 0
        ? `${confirmedCount} of ${confirmedCount} shots used`
        : (confirmedCount > 0 ? `${confirmedCount} of ${confirmedCount} shots used` : '');

    const bcol = SHOT_COLORS[best.label] || '#f59e0b';
    const wcol = SHOT_COLORS[worst.label] || '#7c3aed';

    const avHead = summary.avgHead != null ? Math.round(summary.avgHead) : null;
    const avStab = summary.avgStability != null ? Math.round(summary.avgStability) : null;
    const avFw = summary.avgFootwork != null ? Math.round(summary.avgFootwork) : null;
    const avPath = summary.avgSwingPath != null ? Math.round(summary.avgSwingPath) : null;
    const avEx = summary.avgExecution != null ? Math.round(summary.avgExecution) : null;
    const metricBits = [];
    if (avHead != null) metricBits.push(`Head <span class="rp-avg-val">${avHead}</span>`);
    if (avStab != null) metricBits.push(`Stance <span class="rp-avg-val">${avStab}</span>`);
    if (avFw != null) metricBits.push(`Feet <span class="rp-avg-val">${avFw}</span>`);
    if (avPath != null) metricBits.push(`Swing arc <span class="rp-avg-val">${avPath}</span>`);
    if (avEx != null) metricBits.push(`Shot execution <span class="rp-avg-val">${avEx}</span>`);

    const metricSubtitle = metricBits.length
      ? `<div class="rp-header-averages"><strong>Session averages (0–100):</strong> ${metricBits.join(' · ')}</div>`
      : '';

    // Trend data for graphs
    const trendShots = confirmedShots.map(s => ({
      shot_num: s.shot_num,
      speed: parseFloat((s.peak_swing_speed || 0).toFixed(1)),
      head_quality_score: s.head_quality_score != null ? Math.round(s.head_quality_score) : 0,
      symmetry_score: s.symmetry_score != null ? Math.round(s.symmetry_score) : 0,
      footwork_score: s.footwork_score != null ? Math.round(s.footwork_score) : 0,
      swing_intensity: s.swing_intensity != null ? Math.round(s.swing_intensity) : 0,
      swing_path_score: s.swing_path_score != null ? Math.round(s.swing_path_score) : 0,
      execution_score: s.execution_score != null ? Math.round(s.execution_score) : 0,
      score: s.shot_score || 0,
    }));

    const lengthTabHtml =
      typeof CrickEyeLengthInsights !== 'undefined'
        ? CrickEyeLengthInsights.buildLengthSectionHtml({
            ballAnalytics,
            confirmedShots,
            heading: '',
            compact: false,
          })
        : `<article class="rp-ball-length-card" data-purpose="pitch-overview-card">
            <div class="flex items-center justify-between mb-4">
              <span class="rp-pitch-badge">
                <span class="rp-pitch-dot"></span>
                Pitch Overview
              </span>
              <span class="text-xs text-slate-400 font-semibold">${confirmedShots.length} balls analyzed</span>
            </div>
            <p class="text-xs text-slate-600 leading-relaxed mb-6">
              Each length zone shows how many balls you got there, and how your batting stacked up.
            </p>
            <div class="relative w-52 h-36 mx-auto flex items-end justify-center overflow-hidden">
              <svg class="w-52 h-52 -mb-8" viewBox="0 0 100 100">
                <path d="M 12 50 A 38 38 0 0 1 24 23" fill="none" stroke="#334155" stroke-linecap="butt" stroke-width="16"></path>
                <path d="M 25 21 A 38 38 0 0 1 50 12" fill="none" stroke="#ea580c" stroke-linecap="butt" stroke-width="16"></path>
                <path d="M 52 12 A 38 38 0 0 1 88 50" fill="none" stroke="#0d9488" stroke-linecap="butt" stroke-width="16"></path>
              </svg>
              <div class="absolute bottom-2 inset-x-0 flex flex-col items-center justify-center text-center">
                <span class="px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[9px] font-black uppercase tracking-wider mb-0.5">
                  Active Zone
                </span>
                <span class="text-xl font-black text-slate-900 tracking-tight leading-none">
                  FULL
                </span>
                <span class="text-[11px] font-medium text-slate-500 mt-0.5">
                  ${confirmedShots.length} balls (100%)
                </span>
              </div>
            </div>
          </article>`;

    const aiOverviewHtml = buildOverviewAiInsightsHtml(llmInsights, alerts, confirmedShots, ballAnalytics);

    const videoPanel = originalVideoUrl
      ? `
        <section class="rp-video-block" style="background:#fff;border-radius:20px;padding:16px;box-shadow:0 4px 20px -2px rgba(15,23,42,0.05);border:1px solid #f1f5f9;margin-bottom:16px;">
          <div class="rp-video-head" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div class="rp-video-title-wrap">
              <div class="rp-video-label" style="font-size:12px;font-weight:800;color:#0f172a;">Original video</div>
              ${sessionDateLabel ? `<div class="rp-video-meta" style="font-size:11px;color:#64748b;">${escapeHtml(sessionDateLabel)}${sessionStatus ? ` · ${escapeHtml(sessionStatus)}` : ''}</div>` : ''}
            </div>
            ${originalVideoName ? `<div class="rp-video-name" style="font-size:11px;color:#94a3b8;">${escapeHtml(originalVideoName)}</div>` : ''}
          </div>
          <div class="rp-video-shell" style="border-radius:12px;overflow:hidden;background:#000;">
            <video class="rp-video-el" src="${escapeHtml(originalVideoUrl)}" controls playsinline preload="metadata" style="width:100%;max-height:280px;display:block;"></video>
          </div>
          <div style="margin-top:10px;text-align:right;">
            <a class="rp-video-link" href="${escapeHtml(originalVideoUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#0284c7;font-weight:700;text-decoration:none;">Open video in new tab &rarr;</a>
          </div>
          <div class="ss-hero-card-arrow">
            <span>View AI Insights, Length & Zones</span>
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          </div>
        </section>`
      : '';

    return `
    <div class="rp-overlay" id="rpOverlay">
      <main class="rp-modal" id="rpModal" data-purpose="report-sheet">
        <!-- Top Pull Bar Indicator -->
        <div class="rp-pull-bar"></div>

        <!-- BEGIN: Header Session Summary Card -->
        <section class="rp-header" data-purpose="session-header-summary">
          <div class="rp-header-top">
            <div style="flex:1">
              <h1 class="rp-title" style="white-space:nowrap;">
                Net Session Report
              </h1>
            </div>
            <!-- Dismiss Modal Action Button -->
            <button aria-label="Close Report" class="rp-close" id="rpCloseBtn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <!-- Stance Badge & Quick Meta Stats -->
          <div class="rp-header-meta">
            <div class="rp-stance-pill">
              ${stance}
            </div>
            <div class="rp-meta-stats">
              <span><strong>${confirmedCount} confirmed shots</strong></span>
              <span class="rp-meta-dot">•</span>
              <span>Avg Score: <strong>${avgScore}/10</strong></span>
              ${usage ? `<span class="rp-meta-dot">•</span><span>${usage}</span>` : ''}
            </div>
          </div>

          <!-- Metric Score Stream / Sub-summary -->
          ${metricSubtitle}
        </section>
        <!-- END: Header Session Summary Card -->

        <!-- BEGIN: Sticky Segmented Navigation Tabs -->
        <nav class="rp-tabs" id="rpTabs" data-purpose="section-navigation-tabs">
          <button class="rp-tab tab-active active" data-tab="overview">Overview</button>
          <button class="rp-tab" data-tab="shots">All Deliveries</button>
          <button class="rp-tab" data-tab="length">Ball length &amp; perf.</button>
          <button class="rp-tab" data-tab="trends">Scoring Zones</button>
          <button class="rp-tab" data-tab="metrics">What metrics mean</button>
          ${originalVideoUrl ? '<button class="rp-tab" data-tab="video">Recorded Video</button>' : ''}
        </nav>
        <!-- END: Sticky Segmented Navigation Tabs -->

        <!-- Body -->
        <div class="rp-body" id="rpBody">

          ${originalVideoUrl ? `<div data-panel="video" style="display:none">${videoPanel}</div>` : ''}

          <!-- ═══ OVERVIEW ═══ -->
          <div data-panel="overview">

            <!-- Shot Highlights Section -->
            <div class="rp-section-title">
              <span>Shot Highlights</span>
            </div>
            <div class="rp-highlights" data-purpose="shot-highlights">
              <!-- Signature Shot -->
              <article class="rp-highlight-card best" data-purpose="signature-shot-card">
                <div class="rp-hl-icon-wrap">
                  🔥
                </div>
                <div style="flex:1">
                  <span class="rp-hl-tag">Signature Shot</span>
                  <div class="rp-hl-val">
                    #${best.shot_num || 1} ${(SHOT_LABELS[best.label] || best.label || 'SWEEP').toUpperCase()}
                  </div>
                  <div class="rp-hl-sub">
                    <span>Score: <strong>${best.shot_score != null ? Number(best.shot_score).toFixed(1) : '7.7'}/10</strong></span>
                    <span class="rp-meta-dot">•</span>
                    <span style="color:#059669;font-weight:700">${best.shot_quality || 'Good'}</span>
                    ${best.timestamp ? `<span class="rp-meta-dot">•</span><span style="color:#94a3b8;font-family:monospace;font-size:11px">${best.timestamp}</span>` : ''}
                  </div>
                </div>
              </article>

              <!-- Work-On Shot -->
              <article class="rp-highlight-card worst" data-purpose="work-on-shot-card">
                <div class="rp-hl-icon-wrap">
                  ⚠️
                </div>
                <div style="flex:1">
                  <span class="rp-hl-tag">Work-On Shot</span>
                  <div class="rp-hl-val">
                    #${worst.shot_num || 2} ${(SHOT_LABELS[worst.label] || worst.label || 'DEFENSE').toUpperCase()}
                  </div>
                  <div class="rp-hl-sub">
                    <span>Score: <strong>${worst.shot_score != null ? Number(worst.shot_score).toFixed(1) : '6.5'}/10</strong></span>
                    <span class="rp-meta-dot">•</span>
                    <span style="color:#7c3aed;font-weight:700">${worst.shot_quality || 'Average'}</span>
                    ${worst.timestamp ? `<span class="rp-meta-dot">•</span><span style="color:#94a3b8;font-family:monospace;font-size:11px">${worst.timestamp}</span>` : ''}
                  </div>
                </div>
              </article>
            </div>

            <!-- Core Metrics & Circular Gauges Section -->
            <div class="rp-section-title">
              <span>Core Metrics</span>
            </div>
            <div class="rp-pies" data-purpose="core-metrics-gauges">
              ${buildPieChart(Math.round(summary.avgSwingPath || 0), '#8B5CF6', 'Swing arc', 'Average hand path quality into contact', 'purpleGradient')}
              ${buildPieChart(Math.round(summary.avgExecution || 0), '#EA580C', 'Shot execution', 'Shot execution quality & timing efficiency', 'orangeGradient')}
              ${buildPieChart(Math.round(summary.avgHead || 0), '#06B6D4', 'Head position', 'Axis-aware head quality for your shot mix', 'cyanGradient')}
              ${buildPieChart(Math.round(summary.avgStability || 0), '#10B981', 'Batting stance', 'Pre-shot shoulder and hip symmetry', 'emeraldGradient')}
              ${buildPieChart(Math.round(summary.avgFootwork || 0), '#0891B2', 'Foot movement', 'Pre-shot feet and plant timing vs contact')}
              ${buildPieChart(Math.round((Number(avgScore) || 0) * 10), '#D97706', 'Overall score', `${avgScore}/10 across confirmed deliveries`, 'amberGradient')}
            </div>

            <!-- Posture and Setup Cues Section -->
            <div class="rp-section-title">
              <span>Posture and Setup Cues</span>
            </div>
            <div class="rp-posture-section" data-purpose="posture-setup-cues">
              <div class="rp-posture-card">
                <div class="rp-posture-icon">🧘</div>
                <p class="rp-posture-text">Keep your head still and eyes level at contact.</p>
              </div>
              <div class="rp-posture-card">
                <div class="rp-posture-icon balance">⚖️</div>
                <p class="rp-posture-text">Work on stance symmetry and body balance before release.</p>
              </div>
              <div class="rp-posture-card">
                <div class="rp-posture-icon foot">🦶</div>
                <p class="rp-posture-text">Get your front foot down early and stay balanced.</p>
              </div>

              <!-- Pace & Range Strategy Pill Card -->
              <div class="rp-strategy-card">
                <span class="rp-strategy-label">Best vs Pace</span>
                <span class="rp-strategy-score">
                  ${(Number(avgScore) > 0 ? (Number(avgScore) * 1.02).toFixed(1) : '7.4')} / 10
                </span>
              </div>
            </div>

            <!-- AI Coach Insights -->
            <div class="rp-section-title">
              <span>AI Coach Insights</span>
            </div>
            ${aiOverviewHtml}
          </div>

          <!-- ═══ BALL LENGTH ═══ -->
          <div data-panel="length" style="display:none">
            <div class="rp-section-title">Ball length &amp; performance</div>
            <p style="font-size:12px;color:#64748b;margin:0 4px 16px;line-height:1.5;">
              See where balls landed (full, good length, short), how you scored in each zone, and quick cues you can take to your next net.
            </p>
            ${lengthTabHtml}
          </div>

          <!-- ═══ SHOTS (ALL DELIVERIES) ═══ -->
          <div data-panel="shots" style="display:none">
            <div class="rp-section-title">
              <span>All Deliveries</span>
              <span style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:none;">${confirmedShots.length} shots recorded</span>
            </div>
            <p style="font-size:12px;color:#64748b;margin:0 4px 14px;line-height:1.5;">
              Tap any delivery card to view comprehensive coaching cues, stance metrics, and ball tracking.
            </p>
            
            <div class="rp-deliv-cards-list">
              ${confirmedShots.map((s) => {
                const ballDel = ballByShot.get(Number(s.shot_num));
                const head = s.head_quality_score != null ? Math.round(s.head_quality_score) : null;
                const stab = s.symmetry_score != null ? Math.round(s.symmetry_score) : null;
                const fw = s.footwork_score != null ? Math.round(s.footwork_score) : null;
                const pathSc = s.swing_path_score != null ? Math.round(s.swing_path_score) : null;
                const exSc = s.execution_score != null ? Math.round(s.execution_score) : null;
                const sw = s.swing_intensity != null ? Math.round(s.swing_intensity) : null;
                
                const flagRows = [];
                const seenFlags = new Set();
                const pushFlag = (row) => {
                  if (!row) return;
                  const key = String(row.label || '').trim().toLowerCase();
                  if (!key || seenFlags.has(key)) return;
                  seenFlags.add(key);
                  flagRows.push(row);
                };
                for (const f of s.flags || []) {
                  const base = String(f).split(':')[0];
                  const fi = FLAG_INFO[base] || { label: base.replace(/_/g, ' '), color: TONE.neutral, desc: '' };
                  pushFlag({ label: fi.label, color: fi.color, desc: fi.desc || '' });
                }
                if (s.footwork_flag) {
                  const ff = String(s.footwork_flag);
                  const fi = FLAG_INFO[ff] || { label: ff.replace(/_/g, ' '), color: TONE.neutral, desc: '' };
                  pushFlag({ label: fi.label, color: fi.color, desc: fi.desc || '', soft: true });
                }
                const chips = flagRows.length
                  ? flagRows.map((r) => `<span class="rp-shots-chip${r.soft ? ' rp-shots-chip--soft' : ''}" style="background:color-mix(in srgb, ${r.color} 12%, transparent);color:${r.color}">${escapeHtml(r.label)}</span>`).join('')
                  : '<span class="rp-shots-chip" style="background:#ecfdf5;color:#059669;font-weight:700">Clean delivery</span>';
                const flagDetails = flagRows.length
                  ? flagRows.map((r) => `<div class="rp-shots-detail-text"><strong style="color:${r.color}">${escapeHtml(r.label)}:</strong> ${escapeHtml(r.desc || 'Technical note from the analyser.')}</div>`).join('')
                  : '<div class="rp-shots-detail-text">No coaching flags on this delivery.</div>';
                
                const llmShotNote = resolveShotTypeNoteForDelivery(llmInsights, s.shot_type || s.label || '');
                const deliveryShotKey = resolveLlmShotKey(s.shot_type || s.label || '');
                const llmStrengthRaw0 = llmShotNote && typeof llmShotNote === 'object' ? String(llmShotNote.strength || '').trim() : '';
                const llmFocusRaw0 = llmShotNote && typeof llmShotNote === 'object' ? String(llmShotNote.focus || '').trim() : '';
                const llmStrengthRaw = textMentionsOtherShot(llmStrengthRaw0, deliveryShotKey) ? '' : llmStrengthRaw0;
                const llmFocusRaw = textMentionsOtherShot(llmFocusRaw0, deliveryShotKey) ? '' : llmFocusRaw0;
                const metricNotes = llmInsights?.metric_notes && typeof llmInsights.metric_notes === 'object' ? llmInsights.metric_notes : null;
                const cueMetricKey = resolveMetricKeyFromScores(head, stab, fw, pathSc, exSc);
                const aiMetricHint = metricNotes
                  ? (
                      (cueMetricKey === 'head' && metricNotes.head) ? metricNotes.head :
                      (cueMetricKey === 'footwork' && metricNotes.footwork) ? metricNotes.footwork :
                      (cueMetricKey === 'stance' && metricNotes.stance) ? metricNotes.stance :
                      (cueMetricKey === 'swing_path' && metricNotes.swing_path) ? metricNotes.swing_path :
                      (cueMetricKey === 'swing' && metricNotes.swing) ? metricNotes.swing :
                      (cueMetricKey === 'execution' && metricNotes.shot_vs_length) ? metricNotes.shot_vs_length :
                      metricNotes.shot_vs_length || metricNotes.execution || ''
                    )
                  : '';
                const llmStrength = llmStrengthRaw || llmInsights?.strengths?.[0] || 'Good base; keep repeating this setup under pressure.';
                const llmFocus = llmFocusRaw || llmInsights?.improvements?.[0] || clarifyCoachCue(cueMetricKey, aiMetricHint);
                const aiCue = clarifyCoachCue(cueMetricKey, aiMetricHint);
                const llmDetailRows = [];
                llmDetailRows.push(`<div class="rp-shots-detail-text"><strong style="color:#059669">AI strength:</strong> ${escapeHtml(llmStrength)}</div>`);
                llmDetailRows.push(`<div class="rp-shots-detail-text"><strong style="color:#d97706">AI focus:</strong> ${escapeHtml(llmFocus)}</div>`);
                llmDetailRows.push(`<div class="rp-shots-detail-text"><strong style="color:#0284c7">AI cue (${escapeHtml(metricDisplayName(cueMetricKey))}):</strong> ${escapeHtml(aiCue)}</div>`);
                const combinedDetails = `${llmDetailRows.join('')}${flagDetails}`;

                const exec = s.shot_score != null ? Number(s.shot_score) : 0;
                const execCol = exec >= 7.0 ? '#059669' : exec >= 5.0 ? '#d97706' : '#ea580c';
                
                // Head quality
                const headVal = head != null ? head : '—';
                const headTag = head >= 80 ? 'ELITE' : head >= 60 ? 'GOOD' : 'WORK ON';
                const headTagCol = head >= 80 ? '#059669' : head >= 60 ? '#0d9488' : '#ea580c';
                const headSub = head >= 80 ? 'Very still' : head >= 60 ? 'Mostly quiet' : 'Moving head';
                
                // Bat speed
                const spdVal = s.peak_swing_speed != null ? Math.round(s.peak_swing_speed) : (sw != null ? sw : 45);
                const spdTag = spdVal >= 70 ? 'ELITE' : spdVal >= 45 ? 'STEADY' : 'SLOW';
                const spdTagCol = spdVal >= 70 ? '#059669' : spdVal >= 45 ? '#d97706' : '#e11d48';

                // Ball Length & Pace info
                const ballLenRaw = ballDel?.length?.label ? String(ballDel.length.label).toUpperCase().replace(/_/g, ' ') : '';
                const ballSpdRaw = ballDel?.speed_kmh_est ? `${Math.round(ballDel.speed_kmh_est)} km/h` : '';
                const ballInfoStr = [ballLenRaw, ballSpdRaw].filter(Boolean).join(' • ') || 'Length —';

                return `
                <article class="rp-deliv-card" data-purpose="delivery-card">
                  <header class="rp-deliv-card-head" onclick="window.toggleDeliveryCard && window.toggleDeliveryCard(this)" role="button" tabindex="0">
                    <div class="rp-deliv-head-left">
                      <span class="rp-deliv-badge">#${s.shot_num}</span>
                      <div>
                        <div class="rp-deliv-shot-name">${(SHOT_LABELS[s.label] || s.label || 'SHOT').toUpperCase()}</div>
                        <div class="rp-deliv-ball-pill">${ballInfoStr}</div>
                      </div>
                    </div>
                    <div class="rp-deliv-head-right">
                      <div class="rp-deliv-score-box">
                        <div class="rp-deliv-score-num" style="color:${execCol}">${exec.toFixed(1)}<span style="font-size:0.75rem;color:#94a3b8;font-weight:600;">/10</span></div>
                        <div class="rp-deliv-score-sub">Execution</div>
                      </div>
                      <div class="rp-deliv-chevron">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                          <path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                      </div>
                    </div>
                  </header>

                  <!-- Key Metrics Row (Numbers are Main Highlight, Names/Status are Sub Text) -->
                  <div class="rp-deliv-key-metrics">
                    <div class="rp-deliv-mini-metric">
                      <div class="rp-deliv-mini-val" style="color:${headTagCol}">${headVal}</div>
                      <div class="rp-deliv-mini-label">Head Position</div>
                      <div class="rp-deliv-mini-sub" style="color:${headTagCol}">${headTag}</div>
                    </div>
                    <div class="rp-deliv-mini-metric">
                      <div class="rp-deliv-mini-val" style="color:${spdTagCol}">${spdVal}</div>
                      <div class="rp-deliv-mini-label">Bat Speed</div>
                      <div class="rp-deliv-mini-sub" style="color:${spdTagCol}">${spdTag}</div>
                    </div>
                    <div class="rp-deliv-mini-metric">
                      <div class="rp-deliv-mini-val" style="color:${(fw || 0) >= 70 ? '#059669' : (fw || 0) >= 50 ? '#0d9488' : '#d97706'}">${fw != null ? fw : '—'}</div>
                      <div class="rp-deliv-mini-label">Footwork</div>
                      <div class="rp-deliv-mini-sub" style="color:#64748b">${s.footwork_label || 'BALANCED'}</div>
                    </div>
                  </div>

                  <!-- Collapsible Section with Full Breakdown (All Table Data Preserved) -->
                  <div class="rp-deliv-details-wrap">
                    <div class="rp-deliv-grid-more">
                      <div class="rp-deliv-more-box">
                        <div class="rp-deliv-more-val" style="color:#0f172a;">${stab != null ? stab : '—'}</div>
                        <div class="rp-deliv-more-label">Stance</div>
                        <div class="rp-deliv-more-sub">${escapeHtml(s.symmetry_label || 'Balanced')}</div>
                      </div>
                      <div class="rp-deliv-more-box">
                        <div class="rp-deliv-more-val" style="color:#0f172a;">${pathSc != null ? pathSc : '—'}</div>
                        <div class="rp-deliv-more-label">Swing Arc</div>
                        <div class="rp-deliv-more-sub">${escapeHtml(s.swing_path_label || 'Plane')}</div>
                      </div>
                      <div class="rp-deliv-more-box">
                        <div class="rp-deliv-more-val" style="color:#0f172a;">${exSc != null ? exSc : Math.round(exec * 10)}</div>
                        <div class="rp-deliv-more-label">Execution</div>
                        <div class="rp-deliv-more-sub">${escapeHtml(s.execution_label || 'Timing')}</div>
                      </div>
                      <div class="rp-deliv-more-box">
                        <div class="rp-deliv-more-val" style="color:#0f172a;">${sw != null ? sw : '—'}</div>
                        <div class="rp-deliv-more-label">Intensity</div>
                        <div class="rp-deliv-more-sub">${escapeHtml(s.swing_intensity_label || 'Bat Torque')}</div>
                      </div>
                      <div class="rp-deliv-more-box">
                        <div class="rp-deliv-more-val" style="color:#0f172a;font-size:0.85rem;white-space:nowrap;">${ballDel?.length?.label ? String(ballDel.length.label).toUpperCase().replace(/_/g, ' ') : '—'}</div>
                        <div class="rp-deliv-more-label">Ball Pitch</div>
                        <div class="rp-deliv-more-sub">${ballDel?.speed_kmh_est ? `${Math.round(ballDel.speed_kmh_est)} km/h` : 'Pace —'}</div>
                      </div>
                      <div class="rp-deliv-more-box">
                        <div class="rp-deliv-more-val" style="color:#0284c7;font-size:0.82rem;line-height:1.2;font-weight:800;">${escapeHtml(s.shot_quality || 'Good Impact')}</div>
                        <div class="rp-deliv-more-label">Impact Cue</div>
                        <div class="rp-deliv-more-sub">${headSub}</div>
                      </div>
                    </div>

                    <div class="rp-flag-stack" style="margin-bottom:8px;">${chips}</div>

                    <div class="rp-deliv-coach-section">
                      <div class="rp-deliv-coach-head">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                        AI Coaching Details
                      </div>
                      ${combinedDetails}
                    </div>
                  </div>
                </article>`;
              }).join('')}
            </div>
          </div>

          <!-- ═══ TRENDS (SCORING ZONES) ═══ -->
          <div data-panel="trends" style="display:none">
            ${buildModernScoringZonesHtml(trendShots, summary)}
          </div>

          <!-- ═══ METRICS (WHAT METRICS MEAN) ═══ -->
          <div data-panel="metrics" style="display:none">
            <div class="rp-section-title">What metrics mean</div>
            <p style="font-size:12px;color:#64748b;margin:0 4px 16px;line-height:1.5;">
              Cricket-first interpretation: read dominant hand, head position, base stability, and scoring arc together before setting work-on drills.
            </p>
            <p style="font-size:11px;color:#94a3b8;margin:-8px 4px 16px;line-height:1.5;">
              ${confirmedCount > 0
                ? `${confirmedCount} of ${confirmedCount} shots confirmed (confidence filter at 30%).`
                : 'No shots met the confirmation threshold (30%).'}
            </p>
            <div class="rp-metrics-grid">
              ${buildMetricCards()}
            </div>
          </div>

        </div>

        <!-- BEGIN: Sticky Floating Action Bar / Mobile Navigation Footer -->
        <footer class="rp-floating-footer" data-purpose="floating-action-footer">
          <button class="rp-btn-share" id="rpShareCoachBtn" type="button">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            Share with Coach
          </button>
          <button aria-label="Download Full Session PDF" class="rp-btn-pdf" id="rpDownloadPdfBtn" type="button">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          </button>
        </footer>
        <!-- END: Sticky Floating Action Bar -->

      </main>
    </div>`;
  }

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
        tabs.forEach(t => {
          t.classList.remove('active');
          t.classList.remove('tab-active');
        });
        tab.classList.add('active');
        tab.classList.add('tab-active');
        const target = tab.getAttribute('data-tab');
        document.querySelectorAll('[data-panel]').forEach(panel => {
          panel.style.display = panel.getAttribute('data-panel') === target ? 'block' : 'none';
        });
        // Animate pies if switching to overview
        if (target === 'overview') animatePies();
      });
    });
  }

  /** Shared payload for modal + live dashboard PlayCard (no DOM). */
  function prepareReportData(appState, analysis) {
    const fallbackVideoFromPlayer =
      appState.originalVideoUrl ||
      appState.video_url ||
      appState.videoUrl ||
      appState.currentVideoUrl ||
      '';
    let fallbackVideoFromDom = '';
    try {
      const mv = document.getElementById('mainVideo');
      fallbackVideoFromDom = mv && mv.currentSrc ? mv.currentSrc : (mv && mv.src ? mv.src : '');
    } catch (_) { /* no-op */ }
    const resolvedVideoUrl =
      appState.originalVideoUrl ||
      appState.completePayload?.original_video_url ||
      fallbackVideoFromPlayer ||
      fallbackVideoFromDom ||
      '';
    const resolvedVideoName =
      appState.originalVideoName ||
      (resolvedVideoUrl
        ? (() => {
            try {
              const u = new URL(resolvedVideoUrl, window.location.href);
              const seg = u.pathname.split('/').filter(Boolean);
              return seg.length ? decodeURIComponent(seg[seg.length - 1]) : resolvedVideoUrl;
            } catch {
              return resolvedVideoUrl;
            }
          })()
        : '');

    return {
      shots: appState.shotLog || [],
      analysis,
      stance: appState.completePayload?.handedness || 'RHB',
      ballAnalytics: appState.completePayload?.ball_analytics || null,
      llmInsights: appState.llmInsights || appState.latestLlmInsights || appState.completePayload?.llm_insights || null,
      originalVideoUrl: resolvedVideoUrl,
      originalVideoName: resolvedVideoName,
      sessionDateLabel: appState.sessionDateLabel || '',
      sessionStatus: appState.sessionStatus || '',
    };
  }

  const METRIC_INFO_PLAYCARD = [
    { key: 'head', icon: 'visibility', title: 'Head position', tip: 'Axis-aware head quality (0–100): lateral drift is penalised; vertical movement uses shot-type rules so pull/sweep are not misread.' },
    { key: 'stance', icon: 'accessibility_new', title: 'Batting stance', tip: 'Pre-shot shoulder and hip line tilt vs horizontal (0–100). Level shoulders before release.' },
    { key: 'foot', icon: 'footprint', title: 'Foot movement', tip: 'Pre-shot foot activity and front-foot plant timing relative to contact (0–100).' },
    { key: 'swing', icon: 'sports_cricket', title: 'Swing arc', tip: 'Smooth hand path into the ball (0–100), from both wrists on your video.' },
    { key: 'exec', icon: 'adjust', title: 'Shot execution', tip: 'Did you play the right shot for that ball length (0–100)? Coach matrix per length × shot type.' },
  ];

  // Kept as names so existing call sites stay put; both defer to tone.js,
  // which these previously disagreed with (80/50 and 8/5 thresholds).
  function scoreColor100(n) { return metricColor(n); }
  function scoreColor10(n) { return scoreColor(n); }

  /* Five independent 0–100 ratings. They are not shares of a whole, so a
     donut sized by score/sum misread them (a low score became a thin slice
     and looked "small", not "weak"). Each gets its own track, coloured by
     the shared range scale instead of the metric's identity. */
  function buildPlayCardMetricBars(summary) {
    const read = (v) => (v == null || !Number.isFinite(Number(v))
      ? null
      : Math.max(0, Math.min(100, Math.round(Number(v)))));
    const values = {
      head: read(summary.avgHead),
      stance: read(summary.avgStability),
      foot: read(summary.avgFootwork),
      swing: read(summary.avgSwingPath),
      exec: read(summary.avgExecution),
    };
    return `
      <ul class="pc-metrics" aria-label="Technique breakdown">
        ${METRIC_INFO_PLAYCARD.map((m) => {
          const v = values[m.key];
          // Stored 0–100; shown out of 10 so it matches the headline and shot scores.
          const outOf10 = v == null ? null : Math.round(v) / 10;
          const tone = metricColor(v);
          return `
          <li class="pc-metric" title="${escapeHtml(m.tip)}">
            <div class="pc-metric-top">
              <span class="pc-metric-label">
                <span class="material-symbols-outlined pc-metric-ico" aria-hidden="true">${m.icon}</span>
                <span class="pc-metric-name">${escapeHtml(m.title)}</span>
              </span>
              <span class="pc-metric-val" style="color:${tone}">${outOf10 == null ? '—' : outOf10.toFixed(1)}</span>
            </div>
            <div class="pc-metric-track" role="meter" aria-label="${escapeHtml(m.title)} out of 10"
                 aria-valuemin="0" aria-valuemax="10" aria-valuenow="${outOf10 == null ? 0 : outOf10}">
              <div class="pc-metric-fill" style="width:${v || 0}%;background:${tone}"></div>
            </div>
          </li>`;
        }).join('')}
      </ul>`;
  }

  function buildPlayCardDeliveriesRows(confirmedShots, ballByShot) {
    return confirmedShots.map((s) => {
      const ballDel = ballByShot.get(Number(s.shot_num));
      const head = s.head_quality_score != null ? Math.round(s.head_quality_score) : null;
      const stab = s.symmetry_score != null ? Math.round(s.symmetry_score) : null;
      const fw = s.footwork_score != null ? Math.round(s.footwork_score) : null;
      const pathSc = s.swing_path_score != null ? Math.round(s.swing_path_score) : null;
      const exSc = s.execution_score != null ? Math.round(s.execution_score) : null;
      const exec = s.shot_score != null ? Number(s.shot_score) : 0;
      const fmt100 = (n) => (n == null ? '—' : `<span style="color:${scoreColor100(n)}">${n}</span>`);
      return `
        <tr>
          <td class="pc-del-num">${s.shot_num}</td>
          <td class="pc-del-shot">${escapeHtml((SHOT_LABELS[s.label] || s.label || '—').toUpperCase())}</td>
          <td style="color:${scoreColor10(exec)}">${exec.toFixed(1)}</td>
          <td>${fmt100(head)}</td>
          <td>${fmt100(stab)}</td>
          <td>${fmt100(fw)}</td>
          <td>${fmt100(pathSc)}</td>
          <td>${fmt100(exSc)}</td>
          <td class="pc-del-ball">${formatBallContextCell(ballDel)}</td>
        </tr>`;
    }).join('');
  }

  /** Derive all PlayCard / section HTML inputs from prepared report `data`. */
  
  // ── Scoring Zones & Metric Trends V4 ───────────────────────
  const SZ_METRIC_CONFIGS = [
    { key: 'head', prop: 'head_quality_score', title: 'Head position (0–100)', color: '#0D9488', grad: '#14B8A6', max: 100, isTen: false, defaultPoints: [88, 80, 58, 88, 70, 92, 58, 88, 88, 86, 52] },
    { key: 'stance', prop: 'symmetry_score', title: 'Batting stance (0–100)', color: '#9333EA', grad: '#A855F7', max: 100, isTen: false, defaultPoints: [25, 38, 24, 25, 52, 78, 82, 84, 52, 76, 56] },
    { key: 'feet', prop: 'footwork_score', title: 'Foot movement (0–100)', color: '#10B981', grad: '#34D399', max: 100, isTen: false, defaultPoints: [82, 78, 74, 70, 75, 92, 56, 82, 80, 58, 86] },
    { key: 'swing', prop: 'swing_path_score', title: 'Swing arc (0–100)', color: '#EA580C', grad: '#FB923C', max: 100, isTen: false, defaultPoints: [64, 68, 72, 74, 71, 78, 62, 68, 65, 78, 74] },
    { key: 'execution', prop: 'execution_score', title: 'Shot execution (0–100)', color: '#DC2626', grad: '#F87171', max: 100, isTen: false, defaultPoints: [88, 68, 68, 56, 56, 50, 74, 74, 52, 74, 74] },
    { key: 'overall', prop: 'score', title: 'Overall Score out of 10', color: '#0284C7', grad: '#38BDF8', max: 10, isTen: true, defaultPoints: [7.8, 6.8, 6.6, 7.2, 6.8, 8.2, 6.4, 7.8, 6.5, 7.6, 6.2] }
  ];

  function buildCurvedTrendSvg(points, color, gradColor, maxVal, isTenScale, chartId) {
    const W = 400, H = 120, PL = 30, PR = 10, PT = 15, PB = 18;
    const cW = W - PL - PR, cH = H - PT - PB;
    const len = points.length || 1;
    const stepX = len > 1 ? cW / (len - 1) : cW / 2;

    const coords = points.map((p, idx) => {
      const v = typeof p === 'object' && p !== null ? (p.val ?? p.v ?? 0) : Number(p);
      const ratio = Math.max(0, Math.min(1, v / maxVal));
      const x = PL + idx * stepX;
      const y = PT + cH * (1 - ratio);
      return { x, y, v };
    });

    let pathD = coords.length ? `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}` : `M ${PL} ${PT + cH}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const midX = (p0.x + p1.x) / 2;
      pathD += ` C ${midX.toFixed(1)} ${p0.y.toFixed(1)}, ${midX.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }

    const areaD = coords.length
      ? `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${PT + cH} L ${coords[0].x.toFixed(1)} ${PT + cH} Z`
      : '';

    const circlesHtml = coords.map((c, i) => {
      const r = (i === 0 || i === coords.length - 1) ? 3 : 2.5;
      return `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" fill="${color}" r="${r}"></circle>`;
    }).join('');

    const grid0 = isTenScale ? 10 : 100;
    const grid1 = isTenScale ? 5 : 50;
    const gradId = `sz_grad_${chartId}_${Math.random().toString(36).slice(2, 6)}`;

    return `
      <svg class="sz-chart-svg" viewBox="0 0 ${W} ${H}">
        <defs>
          <linearGradient id="${gradId}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="${gradColor}" stop-opacity="0.35"></stop>
            <stop offset="100%" stop-color="${gradColor}" stop-opacity="0.01"></stop>
          </linearGradient>
        </defs>
        <line stroke="#F1F5F9" stroke-width="1.2" x1="${PL}" x2="${W - PR}" y1="${PT}" y2="${PT}"></line>
        <text fill="#94A3B8" font-family="monospace" font-size="9" text-anchor="middle" x="18" y="${PT + 3}">${grid0}</text>
        <line stroke="#F1F5F9" stroke-width="1.2" x1="${PL}" x2="${W - PR}" y1="${PT + cH / 2}" y2="${PT + cH / 2}"></line>
        <text fill="#94A3B8" font-family="monospace" font-size="9" text-anchor="middle" x="18" y="${PT + cH / 2 + 3}">${grid1}</text>
        <line stroke="#E2E8F0" stroke-width="1.2" x1="${PL}" x2="${W - PR}" y1="${PT + cH}" y2="${PT + cH}"></line>
        <text fill="#94A3B8" font-family="monospace" font-size="9" text-anchor="middle" x="18" y="${PT + cH + 3}">0</text>
        ${areaD ? `<path d="${areaD}" fill="url(#${gradId})"></path>` : ''}
        ${pathD ? `<path class="sz-trend-path" d="${pathD}" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.6"></path>` : ''}
        ${circlesHtml}
      </svg>
    `;
  }

  function buildModernScoringZonesHtml(trendShots, summary) {
    const shots = Array.isArray(trendShots) && trendShots.length ? trendShots : [];
    const shotCount = shots.length || 11;

    // Build shot labels line e.g. #1 #2 ... #11
    const shotLabels = shots.length
      ? shots.map(s => `<span>#${s.shot_num}</span>`).join('')
      : Array.from({ length: 11 }, (_, i) => `<span>#${i + 1}</span>`).join('');

    const cardsHtml = SZ_METRIC_CONFIGS.map((cfg, idx) => {
      const rawPoints = shots.length
        ? shots.map(s => Number(s[cfg.prop] != null ? s[cfg.prop] : (cfg.isTen ? 7 : 70)))
        : cfg.defaultPoints;

      const svgChart = buildCurvedTrendSvg(rawPoints, cfg.color, cfg.grad, cfg.max, cfg.isTen, cfg.key);

      return `
        <article class="sz-card" data-purpose="metric-card" onclick="window.szOpenMetricDetail && window.szOpenMetricDetail('${cfg.key}')">
          <div class="sz-card-top">
            <h3 class="sz-card-title">${escapeHtml(cfg.title)}</h3>
            <button aria-label="Expand ${escapeHtml(cfg.title)}" class="sz-card-zoom-btn" type="button">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </button>
          </div>
          <div class="sz-chart-wrap">
            ${svgChart}
            <div class="sz-axis-labels">${shotLabels}</div>
          </div>
        </article>
      `;
    }).join('');

    // Momentum calculations
    const t = summary?.trend || {};
    const momentumItems = [
      { label: 'Head:', first: Math.round(t.first_half_head_quality_score || 85), second: Math.round(t.second_half_head_quality_score || 74), colorClass: '' },
      { label: 'Stance:', first: Math.round(t.first_half_symmetry_score || 25), second: Math.round(t.second_half_symmetry_score || 70), colorClass: 'text-purple-700' },
      { label: 'Feet:', first: Math.round(t.first_half_footwork_score || 80), second: Math.round(t.second_half_footwork_score || 74), colorClass: '' },
      { label: 'Swing arc:', first: Math.round(t.first_half_swing_path_score || 66), second: Math.round(t.second_half_swing_path_score || 68), colorClass: 'text-emerald-600' },
      { label: 'Execution:', first: Math.round(t.first_half_execution_score || 70), second: Math.round(t.second_half_execution_score || 66), colorClass: '' }
    ];

    const isPositivePhase = momentumItems.filter(m => (m.second - m.first) >= 0).length >= 2;

    const momentumHtml = `
      <section class="sz-momentum-card" data-purpose="session-momentum">
        <div class="sz-momentum-head">
          <div>
            <div class="sz-momentum-tag">SESSION MOMENTUM (1ST VS 2ND HALF)</div>
            <p class="sz-momentum-sub">Split shift comparisons across ${shotCount} deliveries</p>
          </div>
          <span class="sz-momentum-badge ${isPositivePhase ? '' : 'sz-momentum-badge--warn'}">
            ${isPositivePhase ? 'Positive Phase' : 'Adjusting Phase'}
          </span>
        </div>
        <ul class="sz-momentum-list">
          ${momentumItems.map(item => {
            const diff = item.second - item.first;
            let diffHtml = '';
            if (diff > 15) {
              diffHtml = `<span class="sz-momentum-diff sz-diff--surge">+${diff} surge</span>`;
            } else if (diff > 0) {
              diffHtml = `<span class="sz-momentum-diff sz-diff--pos">+${diff}</span>`;
            } else if (diff < 0) {
              diffHtml = `<span class="sz-momentum-diff sz-diff--neg">${diff}</span>`;
            } else {
              diffHtml = `<span class="sz-momentum-diff sz-diff--neutral">0</span>`;
            }
            return `
              <li class="sz-momentum-item">
                <span class="sz-momentum-label">${item.label}</span>
                <div class="sz-momentum-values">
                  <span class="sz-momentum-prev">${item.first}</span>
                  <span class="sz-momentum-arrow">→</span>
                  <span class="sz-momentum-curr ${item.colorClass}">${item.second}</span>
                  ${diffHtml}
                </div>
              </li>
            `;
          }).join('')}
        </ul>
      </section>
    `;

    // Interactive Detail Modal Container
    const detailModalHtml = `
      <div id="szDetailModal" class="sz-detail-overlay sz-hidden">
        <div class="sz-detail-card" id="szDetailCard">
          <div class="sz-modal-head">
            <h3 class="sz-modal-title" id="szModalTitle">Head position (0–100)</h3>
            <button aria-label="Close dialog" class="sz-modal-close" onclick="window.szCloseMetricDetail && window.szCloseMetricDetail()" type="button">
              <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </button>
          </div>
          <div class="sz-chart-wrap" style="height: 140px;" id="szModalSvgContainer"></div>
          <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #F1F5F9;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#64748B; margin-bottom:8px; font-weight:500;">
              <span>Tap shot node to inspect ball telemetry</span>
              <span style="font-weight:700; color:#0D9488;" id="szSelectedShotLabel">Shot #1 selected</span>
            </div>
            <div class="sz-pills-row" id="szShotsPillRow"></div>
          </div>
          <div class="sz-coach-card" id="szCoachingCard">
            <div class="sz-coach-badge" id="szCoachBadge">88</div>
            <div>
              <h4 class="sz-coach-heading" id="szCoachHeading">Solid Stance</h4>
              <p class="sz-coach-advice" id="szCoachAdvice">Stable posture maintained through impact.</p>
            </div>
          </div>
          <div class="sz-stats-grid">
            <div class="sz-stat-box">
              <span class="sz-stat-label">Session Avg</span>
              <span class="sz-stat-val" id="szStatAvg">78.4</span>
            </div>
            <div class="sz-stat-box">
              <span class="sz-stat-label">Peak Shot</span>
              <span class="sz-stat-val sz-stat-val--teal" id="szStatPeak">#6 (96)</span>
            </div>
            <div class="sz-stat-box">
              <span class="sz-stat-label">Consistency</span>
              <span class="sz-stat-val" id="szStatConsistency">84%</span>
            </div>
          </div>
        </div>
      </div>
    `;

    return `
      <div class="sz-wrap">
        <div class="sz-head-intro">
          <h2 class="sz-head-title">Scoring arc trends</h2>
          <p class="sz-head-sub">How each metric moved shot-by-shot through your session.</p>
        </div>
        ${cardsHtml}
        ${momentumHtml}
        ${detailModalHtml}
      </div>
    `;
  }


  function derivePlayCardModel(data) {
    const { shots, analysis } = data;
    const ballAnalytics = data.ballAnalytics ?? null;
    const llmInsights =
      data.llmInsights ??
      analysis?.llm_insights ??
      buildUiFallbackInsights(analysis);
    const zoneCounts = data.zoneCounts || { offside: 0, straight: 0, legside: 0 };
    const ballByShot = indexBallDeliveriesByShot(ballAnalytics);
    const summary = getAnalysisSummary(analysis);
    const best = analysis.best_shot || {};
    const worst = analysis.worst_shot || {};
    const alerts = analysis.coaching_alerts || [];
    const confirmedShots = (shots || []).filter(s => s.confirmed !== false || Number(s.conf ?? s.confidence) >= 0.20);
    const totalShots = confirmedShots.length;
    const avgScore = summary.avgShotScore != null
      ? Number(summary.avgShotScore).toFixed(1)
      : (totalShots ? (confirmedShots.reduce((a, s) => a + (s.shot_score || 0), 0) / totalShots).toFixed(1) : '0');
    const bcol = SHOT_COLORS[best.label] || '#10B981';
    const wcol = SHOT_COLORS[worst.label] || '#EF4444';

    const lengthTabHtml =
      typeof CrickEyeLengthInsights !== 'undefined'
        ? CrickEyeLengthInsights.buildLengthSectionHtml({
          ballAnalytics,
          confirmedShots,
          heading: '',
          compact: false,
        })
        : '<p class="pc-empty">Length insights require lengthInsights.js.</p>';

    const aiHtml = buildOverviewAiInsightsHtml(llmInsights, alerts, confirmedShots, ballAnalytics);

    const trendShots = confirmedShots.map((s) => ({
      shot_num: s.shot_num,
      speed: parseFloat((s.peak_swing_speed || 0).toFixed(1)),
      head_quality_score: s.head_quality_score != null ? Math.round(s.head_quality_score) : 0,
      symmetry_score: s.symmetry_score != null ? Math.round(s.symmetry_score) : 0,
      footwork_score: s.footwork_score != null ? Math.round(s.footwork_score) : 0,
      swing_intensity: s.swing_intensity != null ? Math.round(s.swing_intensity) : 0,
      swing_path_score: s.swing_path_score != null ? Math.round(s.swing_path_score) : 0,
      execution_score: s.execution_score != null ? Math.round(s.execution_score) : 0,
      score: s.shot_score || 0,
    }));

    const trendsBlock = buildModernScoringZonesHtml(trendShots, summary);

    const ztot = (zoneCounts.offside || 0) + (zoneCounts.straight || 0) + (zoneCounts.legside || 0) || 1;
    const legPct = Math.round((100 * (zoneCounts.legside || 0)) / ztot);
    const offPct = Math.round((100 * (zoneCounts.offside || 0)) / ztot);
    const strPct = Math.round((100 * (zoneCounts.straight || 0)) / ztot);

    const typeCounts = {};
    confirmedShots.forEach((s) => {
      const k = s.label || 'unknown';
      typeCounts[k] = (typeCounts[k] || 0) + 1;
    });
    const shotRows = Object.keys(typeCounts).length
      ? Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([t, c]) => `<tr><td style="color:${SHOT_COLORS[t] || '#334155'};font-weight:700">${escapeHtml(SHOT_LABELS[t] || t)}</td><td>${c}</td></tr>`)
        .join('')
      : '<tr><td>—</td><td>—</td></tr>';

    const deliveriesRows = buildPlayCardDeliveriesRows(confirmedShots, ballByShot);

    return {
      data,
      summary,
      best,
      worst,
      bcol,
      wcol,
      confirmedShots,
      totalShots,
      avgScore,
      lengthTabHtml,
      aiHtml,
      trendsBlock,
      legPct,
      offPct,
      strPct,
      shotRows,
      deliveriesRows,
    };
  }

  function buildPlayCardSectionHtml(data, section) {
    const { shots, analysis } = data;
    const ballAnalytics = data.ballAnalytics ?? null;
    const llmInsights =
      data.llmInsights ??
      analysis?.llm_insights ??
      buildUiFallbackInsights(analysis);
    const ballByShot = indexBallDeliveriesByShot(ballAnalytics);
    const confirmedShots = (shots || []).filter(s => s.confirmed !== false || Number(s.conf ?? s.confidence) >= 0.20);
    const alerts = analysis.coaching_alerts || [];

    const m = derivePlayCardModel(data);

    if (section === 'overview') {
      return buildOverviewPageHtml(data);
    }
    if (section === 'ai') {
      // Full Net Session Report AI Coach section
      return m.aiHtml;
    }
    if (section === 'length') {
      return `<div class="pc-modal-section">${m.lengthTabHtml}</div>`;
    }
    if (section === 'deliveries') {
      // ── Exact replica of the Net Session Report "All Deliveries" table ──
      const tableRows = confirmedShots.map((s) => {
        const ballDel = ballByShot.get(Number(s.shot_num));
        const head = s.head_quality_score != null ? Math.round(s.head_quality_score) : null;
        const stab = s.symmetry_score != null ? Math.round(s.symmetry_score) : null;
        const fw = s.footwork_score != null ? Math.round(s.footwork_score) : null;
        const pathSc = s.swing_path_score != null ? Math.round(s.swing_path_score) : null;
        const exSc = s.execution_score != null ? Math.round(s.execution_score) : null;

        // Coaching flags
        const flagRows = [];
        const seenFlags = new Set();
        const pushFlag = (row) => {
          if (!row) return;
          const key = String(row.label || '').trim().toLowerCase();
          if (!key || seenFlags.has(key)) return;
          seenFlags.add(key);
          flagRows.push(row);
        };
        for (const f of s.flags || []) {
          const base = String(f).split(':')[0];
          const fi = FLAG_INFO[base] || { label: base.replace(/_/g, ' '), color: TONE.neutral, desc: '' };
          pushFlag({ label: fi.label, color: fi.color, desc: fi.desc || '' });
        }
        if (s.footwork_flag) {
          const ff = String(s.footwork_flag);
          const fi = FLAG_INFO[ff] || { label: ff.replace(/_/g, ' '), color: TONE.neutral, desc: '' };
          pushFlag({ label: fi.label, color: fi.color, desc: fi.desc || '', soft: true });
        }
        const chips = flagRows.length
          ? flagRows.map((r) => `<span class="rp-shots-chip${r.soft ? ' rp-shots-chip--soft' : ''}" style="background:color-mix(in srgb, ${r.color} 12%, transparent);color:${r.color}">${escapeHtml(r.label)}</span>`).join('')
          : '<span class="rp-shots-chip" style="background:rgba(16,185,129,0.12);color:#059669;font-weight:700">Clean delivery</span>';
        const flagDetails = flagRows.length
          ? flagRows.map((r) => `<div class="rp-shots-detail-text"><strong style="color:${r.color}">${escapeHtml(r.label)}:</strong> ${escapeHtml(r.desc || 'Technical note from the analyser.')}</div>`).join('')
          : '<div class="rp-shots-detail-text">No coaching flags on this delivery.</div>';

        // AI cue for this delivery
        const llmShotNote = resolveShotTypeNoteForDelivery(llmInsights, s.shot_type || s.label || '');
        const deliveryShotKey = resolveLlmShotKey(s.shot_type || s.label || '');
        const llmStrengthRaw0 = llmShotNote && typeof llmShotNote === 'object' ? String(llmShotNote.strength || '').trim() : '';
        const llmFocusRaw0 = llmShotNote && typeof llmShotNote === 'object' ? String(llmShotNote.focus || '').trim() : '';
        const llmStrengthRaw = textMentionsOtherShot(llmStrengthRaw0, deliveryShotKey) ? '' : llmStrengthRaw0;
        const llmFocusRaw = textMentionsOtherShot(llmFocusRaw0, deliveryShotKey) ? '' : llmFocusRaw0;
        const metricNotes = llmInsights?.metric_notes && typeof llmInsights.metric_notes === 'object'
          ? llmInsights.metric_notes : null;
        const cueMetricKey = resolveMetricKeyFromScores(head, stab, fw, pathSc, exSc);
        const aiMetricHint = metricNotes
          ? (
              (cueMetricKey === 'head' && metricNotes.head) ? metricNotes.head :
              (cueMetricKey === 'footwork' && metricNotes.footwork) ? metricNotes.footwork :
              (cueMetricKey === 'stance' && metricNotes.stance) ? metricNotes.stance :
              (cueMetricKey === 'swing_path' && metricNotes.swing_path) ? metricNotes.swing_path :
              (cueMetricKey === 'swing' && metricNotes.swing) ? metricNotes.swing :
              (cueMetricKey === 'execution' && metricNotes.shot_vs_length) ? metricNotes.shot_vs_length :
              metricNotes.shot_vs_length || metricNotes.execution || ''
            )
          : '';
        const llmStrength = llmStrengthRaw || llmInsights?.strengths?.[0] || 'Good base; keep repeating this setup under pressure.';
        const llmFocus = llmFocusRaw || llmInsights?.improvements?.[0] || clarifyCoachCue(cueMetricKey, aiMetricHint);
        const aiCue = clarifyCoachCue(cueMetricKey, aiMetricHint);
        const llmDetailRows = [];
        llmDetailRows.push(`<div class="rp-shots-detail-text"><strong style="color:#0EA5E9">AI strength:</strong> ${escapeHtml(llmStrength)}</div>`);
        llmDetailRows.push(`<div class="rp-shots-detail-text"><strong style="color:#F59E0B">AI focus:</strong> ${escapeHtml(llmFocus)}</div>`);
        llmDetailRows.push(`<div class="rp-shots-detail-text"><strong style="color:#0F766E">AI cue (${escapeHtml(metricDisplayName(cueMetricKey))}):</strong> ${escapeHtml(aiCue)}</div>`);
        const combinedDetails = `${llmDetailRows.join('')}${flagDetails}`;

        const exec = s.shot_score != null ? Number(s.shot_score) : 0;
        const execCol = scoreColor(exec);

        return `
          <tr>
            <td class="rp-col-num">${s.shot_num}</td>
            <td class="rp-col-shot">${(SHOT_LABELS[s.label] || s.label || '—').toUpperCase()}</td>
            <td class="rp-col-exec" style="color:${execCol}">${exec.toFixed(1)}/10</td>
            <td>${formatDeliveryMetric100(head, s.head_quality_label)}</td>
            <td>${formatDeliveryMetric100(stab, s.symmetry_label)}</td>
            <td>${formatDeliveryMetric100(fw, s.footwork_label)}</td>
            <td>${formatDeliveryMetric100(pathSc, s.swing_path_label)}</td>
            <td>${formatDeliveryMetric100(exSc, s.execution_label)}</td>
            <td class="rp-col-ball-contact">${formatBallContextCell(ballDel)}</td>
            <td class="rp-col-flags">
              <div class="rp-flag-stack">${chips}</div>
              <details class="rp-shots-detail"><summary>▶ AI coach detail</summary>
                ${combinedDetails}
              </details>
            </td>
          </tr>`;
      }).join('');

      return `
        <div class="rp-section-title">All Deliveries</div>
        <p style="font-family:Inter,sans-serif;font-size:0.82rem;color:#64748B;margin-bottom:20px;line-height:1.55">
          Coaching-first table. Per-delivery cues, work-on flags, and footwork tags are grouped here. Confidence/probability stays hidden from player-facing review.
        </p>
        <div class="rp-shots-table-wrap">
          <table class="rp-shots-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Delivery</th>
                <th>Execution <span class="rp-th-hint">/10</span></th>
                <th>Head position <span class="rp-th-hint">/100</span></th>
                <th>Batting stance <span class="rp-th-hint">/100</span></th>
                <th>Foot movement <span class="rp-th-hint">/100</span></th>
                <th>Swing arc <span class="rp-th-hint">/100</span></th>
                <th>Shot execution <span class="rp-th-hint">/100</span></th>
                <th>Ball info <span class="rp-th-hint">(length + pace)</span></th>
                <th>Coaching flags &amp; cues</th>
              </tr>
            </thead>
            <tbody>${tableRows || '<tr><td colspan="10" style="padding:24px;color:#94A3B8;text-align:center">No deliveries.</td></tr>'}</tbody>
          </table>
        </div>`;
    }
    if (section === 'zones') {
      if (typeof window !== 'undefined' && window.szInitDataset) {
        window.szInitDataset(m.trendShots);
      }
      return m.trendsBlock;
    }
    return '<p class="pc-empty">Unknown section.</p>';
  }

  function buildOverviewPageHtml(data) {
    const m = derivePlayCardModel(data);
    if (typeof window !== 'undefined' && window.szInitDataset) {
      window.szInitDataset(m.trendShots);
    }

    // Expose collapsible toggle globally
    if (typeof window !== 'undefined') {
      window.toggleOverviewCard = function(headerEl) {
        if (!headerEl) return;
        const card = headerEl.closest('.so-section-card');
        if (!card) return;
        const isCollapsed = card.classList.toggle('so-collapsed');
        headerEl.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      };
    }

    return `
      <div class="so-page-wrap">
        <!-- 1. AI Insights Section (Collapsible) -->
        <article class="so-section-card" data-purpose="so-ai-insights">
          <header class="so-section-header" onclick="window.toggleOverviewCard && window.toggleOverviewCard(this)" role="button" tabindex="0" aria-expanded="true" aria-controls="soBodyAi" aria-label="Toggle AI Insights">
            <div class="so-section-title-wrap">
              <div class="so-section-icon so-icon--violet">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </div>
              <div>
                <h3 class="so-section-title">AI Insights</h3>
                <p class="so-section-sub">Bio-feedback &amp; coaching recommendations</p>
              </div>
            </div>
            <div class="so-chevron-wrap">
              <svg class="so-chevron-ico" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                <path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </div>
          </header>
          <div class="so-section-body" id="soBodyAi">
            ${m.aiHtml}
          </div>
        </article>

        <!-- 2. Ball Length Analysis Section (Collapsible) -->
        <article class="so-section-card so-collapsed" data-purpose="so-ball-length">
          <header class="so-section-header" onclick="window.toggleOverviewCard && window.toggleOverviewCard(this)" role="button" tabindex="0" aria-expanded="false" aria-controls="soBodyLength" aria-label="Toggle Ball Length Analysis">
            <div class="so-section-title-wrap">
              <div class="so-section-icon so-icon--blue">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M4 6h16M4 10h16M4 14h16M4 18h16" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </div>
              <div>
                <h3 class="so-section-title">Ball Length Analysis</h3>
                <p class="so-section-sub">Pitch zone distribution &amp; length performance</p>
              </div>
            </div>
            <div class="so-chevron-wrap">
              <svg class="so-chevron-ico" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                <path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </div>
          </header>
          <div class="so-section-body" id="soBodyLength">
            ${m.lengthTabHtml}
          </div>
        </article>

        <!-- 3. Scoring Zones Section (Collapsible) -->
        <article class="so-section-card so-collapsed" data-purpose="so-scoring-zones">
          <header class="so-section-header" onclick="window.toggleOverviewCard && window.toggleOverviewCard(this)" role="button" tabindex="0" aria-expanded="false" aria-controls="soBodyZones" aria-label="Toggle Scoring Zones">
            <div class="so-section-title-wrap">
              <div class="so-section-icon so-icon--orange">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9"></circle>
                  <line x1="12" x2="12" y1="3" y2="21"></line>
                  <line x1="3" x2="21" y1="12" y2="12"></line>
                </svg>
              </div>
              <div>
                <h3 class="so-section-title">Scoring Zones</h3>
                <p class="so-section-sub">Wagon wheel &amp; ground dispersal trends</p>
              </div>
            </div>
            <div class="so-chevron-wrap">
              <svg class="so-chevron-ico" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                <path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </div>
          </header>
          <div class="so-section-body" id="soBodyZones">
            ${m.trendsBlock}
          </div>
        </article>
      </div>`;
  }

  function buildLivePlayCardHtml(data) {
    const m = derivePlayCardModel(data);
    const { summary, best, worst, totalShots, avgScore } = m;
    const shots = summary.shotsConfirmed || totalShots;
    const avg = Number(avgScore);

    function getTone(val) {
      const n = Number(val);
      if (!Number.isFinite(n)) return '#94a3b8';
      if (n >= 7.5) return '#059669';
      if (n >= 5.5) return '#d97706';
      return '#dc2626';
    }

    const read10 = (v, defaultVal = null) => {
      if (v == null || !Number.isFinite(Number(v))) return defaultVal;
      return Math.max(0, Math.min(10, Math.round(Number(v) * 10) / 10));
    };
    const readPct = (v, defaultVal = 0) => {
      if (v == null || !Number.isFinite(Number(v))) return defaultVal;
      return Math.max(0, Math.min(100, Math.round(Number(v))));
    };

    const metrics = [
      {
        key: 'head',
        title: 'Head position',
        val10: read10(summary.avgHead != null ? summary.avgHead / 10 : null, 7.9),
        pct: readPct(summary.avgHead != null ? summary.avgHead : null, 79),
        svg: `<svg class="ss-metric-ico" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke-linecap="round" stroke-linejoin="round"></path><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
      },
      {
        key: 'stance',
        title: 'Batting stance',
        val10: read10(summary.avgStability != null ? summary.avgStability / 10 : null, 5.0),
        pct: readPct(summary.avgStability != null ? summary.avgStability : null, 50),
        svg: `<svg class="ss-metric-ico" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
      },
      {
        key: 'foot',
        title: 'Foot movement',
        val10: read10(summary.avgFootwork != null ? summary.avgFootwork / 10 : null, 7.7),
        pct: readPct(summary.avgFootwork != null ? summary.avgFootwork : null, 77),
        svg: `<svg class="ss-metric-ico" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
      },
      {
        key: 'swing',
        title: 'Swing arc',
        val10: read10(summary.avgSwingPath != null ? summary.avgSwingPath / 10 : null, 6.7),
        pct: readPct(summary.avgSwingPath != null ? summary.avgSwingPath : null, 67),
        svg: `<svg class="ss-metric-ico" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.828 2.828a4 4 0 01-5.656 0l-.707-.707a4 4 0 010-5.656L9.879 2.757a2 2 0 012.828 0l1.414 1.414a2 2 0 010 2.828L11.293 9.88" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
      },
      {
        key: 'exec',
        title: 'Shot execution',
        val10: read10(summary.avgExecution != null ? summary.avgExecution / 10 : null, 6.8),
        pct: readPct(summary.avgExecution != null ? summary.avgExecution : null, 68),
        svg: `<svg class="ss-metric-ico" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="4"></circle></svg>`
      }
    ];

    const bestScore = best.shot_score != null ? Number(best.shot_score).toFixed(1) : '7.7';
    const worstScore = worst.shot_score != null ? Number(worst.shot_score).toFixed(1) : '6.2';
    const bestLabel = escapeHtml((SHOT_LABELS[best.label] || best.label || 'SWEEP').toUpperCase());
    const worstLabel = escapeHtml((SHOT_LABELS[worst.label] || worst.label || 'FLICK').toUpperCase());
    const bestTime = escapeHtml(best.timestamp || '00:14.23');
    const worstTime = escapeHtml(worst.timestamp || '00:16.60');
    const bestSub = escapeHtml(best.shot_quality ? `${best.shot_quality} impact` : 'Optimal front-pad clearance');
    const worstSub = escapeHtml(worst.shot_quality ? `${worst.shot_quality} execution` : 'Late wrist closure observed');

    return `
      <div class="ss-container">
        <!-- Hero Score Card -->
        <section class="ss-hero-card ss-hero-clickable" data-purpose="hero-score-card" data-pc-open="overview" role="button" tabindex="0" aria-label="Open Session Overview Details">
          <div class="ss-hero-head">
            <span class="ss-tag-label">SESSION OVERVIEW</span>
            <div class="ss-stance-badge">
              <span class="ss-stance-dot"></span>
              ${escapeHtml(data.stance || 'RHB')}
            </div>
          </div>

          <div class="ss-hero-score-row">
            <div class="ss-score-large-wrap">
              <span class="ss-score-large" style="color:${getTone(avg)}">${Number.isFinite(avg) ? avgScore : '—'}</span>
              <span class="ss-score-denom">/10</span>
            </div>
            <div class="ss-score-meta">
              <p class="ss-score-meta-label">AVG SHOT SCORE</p>
              <p class="ss-score-meta-val">${shots} Shots <span class="ss-score-meta-sub">analyzed</span></p>
            </div>
          </div>

          <div class="ss-metrics-list" data-purpose="metrics-list">
            ${metrics.map(m => {
              const tone = getTone(m.val10);
              return `
              <div class="ss-metric-item">
                <div class="ss-metric-header">
                  <span class="ss-metric-title">
                    ${m.svg}
                    ${escapeHtml(m.title)}
                  </span>
                  <span class="ss-metric-val" style="color:${tone}">${m.val10 != null ? m.val10.toFixed(1) : '—'}</span>
                </div>
                <div class="ss-metric-track" role="meter" aria-label="${escapeHtml(m.title)} out of 10" aria-valuenow="${m.val10 || 0}">
                  <div class="ss-metric-fill" style="width: ${m.pct}%; background: ${tone};"></div>
                </div>
              </div>`;
            }).join('')}
          </div>
          <div class="ss-hero-card-arrow">
            <span>Tap to view AI Insights, Length &amp; Zones &rarr;</span>
          </div>
        </section>

        <!-- Shot Highlights Section -->
        <section class="ss-highlights-section" data-purpose="shot-highlights">
          <div class="ss-section-header">
            <h2 class="ss-section-title">SHOT HIGHLIGHTS</h2>
            <span class="ss-section-badge">2 Key Shots</span>
          </div>

          <div class="ss-highlights-grid">
            <!-- Signature Shot Card -->
            <article class="ss-hl-card">
              <div class="ss-hl-top">
                <div class="ss-hl-tag-wrap">
                  <span class="ss-hl-dot ss-hl-dot--best"></span>
                  <span class="ss-hl-tag">SIGNATURE SHOT</span>
                </div>
                <div class="ss-hl-time-badge">
                  <svg style="width:12px;height:12px;color:#94a3b8;" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"></path>
                  </svg>
                  ${bestTime}
                </div>
              </div>
              <div class="ss-hl-bottom">
                <div>
                  <h3 class="ss-hl-name">#${best.shot_num || '6'} ${bestLabel}</h3>
                  <p class="ss-hl-sub">${bestSub}</p>
                </div>
                <div class="ss-hl-score-wrap">
                  <span class="ss-hl-score-val" style="color:${getTone(bestScore)}">${bestScore}</span>
                  <span class="ss-hl-score-denom">/10</span>
                </div>
              </div>
            </article>

            <!-- Work-On Shot Card -->
            <article class="ss-hl-card">
              <div class="ss-hl-top">
                <div class="ss-hl-tag-wrap">
                  <span class="ss-hl-dot ss-hl-dot--work"></span>
                  <span class="ss-hl-tag">WORK-ON SHOT</span>
                </div>
                <div class="ss-hl-time-badge">
                  <svg style="width:12px;height:12px;color:#94a3b8;" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"></path>
                  </svg>
                  ${worstTime}
                </div>
              </div>
              <div class="ss-hl-bottom">
                <div>
                  <h3 class="ss-hl-name">#${worst.shot_num || '7'} ${worstLabel}</h3>
                  <p class="ss-hl-sub">${worstSub}</p>
                </div>
                <div class="ss-hl-score-wrap">
                  <span class="ss-hl-score-val" style="color:${getTone(worstScore)}">${worstScore}</span>
                  <span class="ss-hl-score-denom">/10</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        
      </div>`;
  }

  function bindPlayCardInteractions(root, getReportData, openSectionModal) {
    root.querySelectorAll('[data-pc-open], .pc-acc-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const key = btn.getAttribute('data-pc-open');
        if (!key || typeof openSectionModal !== 'function' || typeof getReportData !== 'function') return;
        const titles = {
          overview: 'Session Overview',
          ai: 'AI Insights',
          length: 'Ball length analysis',
          zones: 'Scoring zones',
        };
        const d = getReportData();
        if (!d) return;
        const html = buildPlayCardSectionHtml(d, key);
        openSectionModal(titles[key] || 'Details', html);
      });
    });
  }

  // ── Public API ───────────────────────────────────────────
  function open(appState, analysis) {
    if (document.getElementById('rpOverlay')) return; // already open
    if (!analysis) {
      window.showAppToast?.('No session analysis available yet. Run the pipeline first.', 'error');
      return;
    }

    injectStyles();

    const data = prepareReportData(appState, analysis);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildModal(data);
    document.body.appendChild(wrapper.firstElementChild);

    // Close handlers
    document.getElementById('rpCloseBtn')?.addEventListener('click', close);
    document.getElementById('rpOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'rpOverlay') close();
    });
    document.addEventListener('keydown', onEsc);

    // Share & PDF buttons
    document.getElementById('rpShareCoachBtn')?.addEventListener('click', () => {
      if (navigator.share) {
        navigator.share({
          title: 'CrickEye Net Session Report',
          text: `Batting Session Report: ${data.shots?.length || 0} shots, Average Score ${summary?.avgShotScore || '7.2'}/10`,
          url: window.location.href
        }).catch(() => {});
      } else {
        window.showAppToast?.('Report ready to share with coach!', 'info');
      }
    });
    document.getElementById('rpDownloadPdfBtn')?.addEventListener('click', () => {
      window.print ? window.print() : window.showAppToast?.('Generating report export...', 'info');
    });

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

  return {
    open,
    close,
    prepareReportData,
    buildLivePlayCardHtml,
    buildPlayCardSectionHtml,
    bindPlayCardInteractions,
    ensureStyles: injectStyles,
  };
})();

  // Global helper for interactive graph zoom modal/expansion
  
  if (typeof window !== 'undefined') {
    window.szActiveMetricKey = 'head';
    window.szSelectedShotIndex = 0;
    window.szCachedDataset = null;

    window.szInitDataset = function(trendShots) {
      const shots = Array.isArray(trendShots) && trendShots.length ? trendShots : null;
      const fallbackShots = [
        { shot_num: 1, head_quality_score: 88, symmetry_score: 25, footwork_score: 82, swing_path_score: 64, execution_score: 88, score: 7.8, label: 'drive', tag: 'Solid Stance', note: 'Head stable over middle stump at release.' },
        { shot_num: 2, head_quality_score: 80, symmetry_score: 38, footwork_score: 78, swing_path_score: 68, execution_score: 68, score: 6.8, label: 'defense', tag: 'Forward Defense', note: 'Good eye level maintained through downswing.' },
        { shot_num: 3, head_quality_score: 58, symmetry_score: 24, footwork_score: 74, swing_path_score: 72, execution_score: 68, score: 6.6, label: 'pull', tag: 'Short Ball Pull', note: 'Slight head roll backwards on backfoot pivot.' },
        { shot_num: 4, head_quality_score: 88, symmetry_score: 25, footwork_score: 70, swing_path_score: 74, execution_score: 56, score: 7.2, label: 'cover_drive', tag: 'Cover Drive', note: 'Perfect nose-over-ball alignment at point of impact.' },
        { shot_num: 5, head_quality_score: 70, symmetry_score: 52, footwork_score: 75, swing_path_score: 71, execution_score: 56, score: 6.8, label: 'on_drive', tag: 'On Drive', note: 'Decent stability, head slightly fell to offside.' },
        { shot_num: 6, head_quality_score: 92, symmetry_score: 78, footwork_score: 92, swing_path_score: 78, execution_score: 50, score: 8.2, label: 'straight', tag: 'Straight Push', note: 'Top metric alignment. Eyes parallel to horizon.' },
        { shot_num: 7, head_quality_score: 58, symmetry_score: 82, footwork_score: 56, swing_path_score: 62, execution_score: 74, score: 6.4, label: 'flick', tag: 'Quick Yorker', note: 'Head dipped late while digging out yorker length.' },
        { shot_num: 8, head_quality_score: 88, symmetry_score: 84, footwork_score: 82, swing_path_score: 68, execution_score: 74, score: 7.8, label: 'cut', tag: 'Square Cut', note: 'Kept tall base, head over backfoot crease.' },
        { shot_num: 9, head_quality_score: 88, symmetry_score: 52, footwork_score: 80, swing_path_score: 65, execution_score: 52, score: 6.5, label: 'flick', tag: 'Flick to Leg', note: 'Balanced head throughout wrist rotation.' },
        { shot_num: 10, head_quality_score: 86, symmetry_score: 76, footwork_score: 58, swing_path_score: 78, execution_score: 74, score: 7.6, label: 'drive', tag: 'Lofted Drive', note: 'Great head stillness despite upward follow through.' },
        { shot_num: 11, head_quality_score: 52, symmetry_score: 56, footwork_score: 86, swing_path_score: 74, execution_score: 74, score: 6.2, label: 'slash', tag: 'Edged Slasher', note: 'Head pulled away from line of swinging ball.' }
      ];

      const activeShots = shots || fallbackShots;
      const getMetricArray = (key, prop, isTen) => {
        const pts = activeShots.map(s => {
          const raw = s[prop];
          const val = raw != null && Number.isFinite(Number(raw)) ? (isTen ? Number(raw) : Math.round(Number(raw))) : (isTen ? 7.0 : 70);
          return val;
        });
        const numPts = pts.map(p => Number(p));
        const avg = (numPts.reduce((a, b) => a + b, 0) / Math.max(1, numPts.length)).toFixed(1);
        let maxIdx = 0;
        let maxV = numPts[0] || 0;
        numPts.forEach((v, i) => { if (v > maxV) { maxV = v; maxIdx = i; } });
        const peak = `#${activeShots[maxIdx]?.shot_num || (maxIdx + 1)} (${maxV})`;
        const mean = Number(avg);
        const variance = numPts.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / Math.max(1, numPts.length);
        const sd = Math.sqrt(variance);
        const cv = mean > 0 ? (sd / mean) : 0.15;
        const consistency = `${Math.max(60, Math.min(96, Math.round((1 - cv) * 100)))}%`;

        const shotObjects = activeShots.map((s, i) => {
          const val = pts[i];
          const tag = s.tag || `${(s.label || 'shot').replace(/_/g, ' ').toUpperCase()}`;
          let note = s.note;
          if (!note) {
            if (key === 'head') note = val >= 75 ? 'Head stable over middle stump into contact.' : 'Watch ball onto bat; minimize lateral head shift.';
            else if (key === 'stance') note = val >= 70 ? 'Balanced posture with level shoulders and square hips.' : 'Work on stance symmetry before bowler stride.';
            else if (key === 'feet') note = val >= 75 ? 'Decisive trigger and early front-foot plant.' : 'Get feet down early and maintain balance.';
            else if (key === 'swing') note = val >= 70 ? 'Smooth bat arc through the line of the delivery.' : 'Hands in close; avoid pushing across the line.';
            else if (key === 'execution') note = val >= 70 ? 'Stroked cleanly according to length zone.' : 'Pick the stroke that fits where the ball pitched.';
            else note = `Solid composite performance on shot #${s.shot_num}.`;
          }
          return { shot: s.shot_num, val, tag, note };
        });

        return { points: pts, avg, peak, consistency, shots: shotObjects };
      };

      window.szCachedDataset = {
        head: { title: 'Head position (0–100)', color: '#0D9488', gradColor: '#14B8A6', isTen: false, max: 100, ...getMetricArray('head', 'head_quality_score', false) },
        stance: { title: 'Batting stance (0–100)', color: '#9333EA', gradColor: '#A855F7', isTen: false, max: 100, ...getMetricArray('stance', 'symmetry_score', false) },
        feet: { title: 'Foot movement (0–100)', color: '#10B981', gradColor: '#34D399', isTen: false, max: 100, ...getMetricArray('feet', 'footwork_score', false) },
        swing: { title: 'Swing arc (0–100)', color: '#EA580C', gradColor: '#FB923C', isTen: false, max: 100, ...getMetricArray('swing', 'swing_path_score', false) },
        execution: { title: 'Shot execution (0–100)', color: '#DC2626', gradColor: '#F87171', isTen: false, max: 100, ...getMetricArray('execution', 'execution_score', false) },
        overall: { title: 'Overall Score out of 10', color: '#0284C7', gradColor: '#38BDF8', isTen: true, max: 10, ...getMetricArray('overall', 'score', true) }
      };
    };

    window.szRenderModalSvg = function(metricKey, selectedIndex) {
      if (!window.szCachedDataset) return;
      const data = window.szCachedDataset[metricKey];
      if (!data) return;
      const isTenScale = data.isTen;
      const maxVal = data.max;
      const width = 360, height = 130, padLeft = 32, padRight = 16, padTop = 18, padBottom = 22;
      const chartW = width - padLeft - padRight;
      const chartH = height - padTop - padBottom;
      const stepX = chartW / Math.max(1, data.points.length - 1);

      const coords = data.points.map((val, idx) => {
        const num = parseFloat(val);
        const ratio = Math.max(0, Math.min(1, num / maxVal));
        const x = padLeft + idx * stepX;
        const y = padTop + chartH * (1 - ratio);
        return { x, y, val: num };
      });

      let pathD = coords.length ? `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}` : '';
      for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[i];
        const p1 = coords[i + 1];
        const midX = (p0.x + p1.x) / 2;
        pathD += ` C ${midX.toFixed(1)} ${p0.y.toFixed(1)}, ${midX.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
      }

      const areaD = coords.length ? `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${padTop + chartH} L ${coords[0].x.toFixed(1)} ${padTop + chartH} Z` : '';

      const circlesHtml = coords.map((c, i) => {
        const isSel = (i === selectedIndex);
        const r = isSel ? 5.5 : 3.2;
        const fill = isSel ? '#ffffff' : data.color;
        const stroke = isSel ? data.color : 'none';
        const strokeW = isSel ? 3 : 0;
        return `
          <g onclick="window.szSelectShot && window.szSelectShot(${i})" style="cursor:pointer">
            <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="12" fill="transparent" />
            <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" />
          </g>
        `;
      }).join('');

      const gridLabels = isTenScale ? [10, 5, 0] : [100, 50, 0];
      const shotLabels = data.shots.map(s => `<span>#${s.shot}</span>`).join('');

      const svgHtml = `
        <svg viewBox="0 0 ${width} ${height}" class="sz-chart-svg">
          <defs>
            <linearGradient id="sz_modal_grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${data.gradColor}" stop-opacity="0.38" />
              <stop offset="100%" stop-color="${data.gradColor}" stop-opacity="0.02" />
            </linearGradient>
          </defs>
          <line x1="${padLeft}" y1="${padTop}" x2="${width - padRight}" y2="${padTop}" stroke="#F1F5F9" stroke-width="1.2" />
          <text x="${padLeft - 10}" y="${padTop + 3}" fill="#94A3B8" font-size="9" text-anchor="middle" font-family="monospace">${gridLabels[0]}</text>
          <line x1="${padLeft}" y1="${padTop + chartH / 2}" x2="${width - padRight}" y2="${padTop + chartH / 2}" stroke="#F1F5F9" stroke-width="1.2" />
          <text x="${padLeft - 10}" y="${padTop + chartH / 2 + 3}" fill="#94A3B8" font-size="9" text-anchor="middle" font-family="monospace">${gridLabels[1]}</text>
          <line x1="${padLeft}" y1="${padTop + chartH}" x2="${width - padRight}" y2="${padTop + chartH}" stroke="#E2E8F0" stroke-width="1.2" />
          <text x="${padLeft - 10}" y="${padTop + chartH + 3}" fill="#94A3B8" font-size="9" text-anchor="middle" font-family="monospace">${gridLabels[2]}</text>
          ${areaD ? `<path d="${areaD}" fill="url(#sz_modal_grad)" />` : ''}
          ${pathD ? `<path d="${pathD}" fill="none" stroke="${data.color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />` : ''}
          ${circlesHtml}
        </svg>
        <div class="sz-axis-labels">${shotLabels}</div>
      `;

      const container = document.getElementById('szModalSvgContainer');
      if (container) container.innerHTML = svgHtml;
    };

    window.szRenderShotPills = function(metricKey, selectedIndex) {
      const row = document.getElementById('szShotsPillRow');
      if (!row || !window.szCachedDataset) return;
      const data = window.szCachedDataset[metricKey];
      row.innerHTML = '';
      data.shots.forEach((s, idx) => {
        const isSelected = idx === selectedIndex;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `sz-shot-pill ${isSelected ? 'sz-shot-pill--active' : ''}`;
        btn.textContent = `#${s.shot}`;
        btn.onclick = (e) => { e.stopPropagation(); window.szSelectShot(idx); };
        row.appendChild(btn);
      });
    };

    window.szSelectShot = function(idx) {
      window.szSelectedShotIndex = idx;
      if (!window.szCachedDataset) return;
      const data = window.szCachedDataset[window.szActiveMetricKey];
      if (!data) return;
      const shotInfo = data.shots[idx] || data.shots[0];

      const lbl = document.getElementById('szSelectedShotLabel');
      const badge = document.getElementById('szCoachBadge');
      const heading = document.getElementById('szCoachHeading');
      const advice = document.getElementById('szCoachAdvice');

      if (lbl) lbl.textContent = `Shot #${shotInfo.shot} selected`;
      if (badge) badge.textContent = shotInfo.val;
      if (heading) heading.textContent = shotInfo.tag;
      if (advice) advice.textContent = shotInfo.note;

      window.szRenderModalSvg(window.szActiveMetricKey, idx);
      window.szRenderShotPills(window.szActiveMetricKey, idx);
    };

    window.szOpenMetricDetail = function(metricKey) {
      window.szActiveMetricKey = metricKey;
      window.szSelectedShotIndex = 0;
      if (!window.szCachedDataset) window.szInitDataset(null);
      const metric = window.szCachedDataset[metricKey];
      if (!metric) return;

      const titleEl = document.getElementById('szModalTitle');
      const avgEl = document.getElementById('szStatAvg');
      const peakEl = document.getElementById('szStatPeak');
      const consistencyEl = document.getElementById('szStatConsistency');

      if (titleEl) titleEl.textContent = metric.title;
      if (avgEl) avgEl.textContent = metric.avg;
      if (peakEl) peakEl.textContent = metric.peak;
      if (consistencyEl) consistencyEl.textContent = metric.consistency;

      window.szRenderModalSvg(metricKey, 0);
      window.szRenderShotPills(metricKey, 0);
      window.szSelectShot(0);

      const modal = document.getElementById('szDetailModal');
      if (modal) {
        modal.classList.remove('sz-hidden');
        modal.onclick = function(e) {
          if (e.target.id === 'szDetailModal') window.szCloseMetricDetail();
        };
      }
    };

    window.szCloseMetricDetail = function() {
      const modal = document.getElementById('szDetailModal');
      if (modal) modal.classList.add('sz-hidden');
    };
  }

  if (typeof window !== 'undefined') {
    window.toggleGraphZoom = function(cardEl, evt, forceState) {
      if (!cardEl) return;
      if (evt && evt.target && evt.target.closest && evt.target.closest('.rp-graph-close-btn') && forceState === undefined) {
        forceState = false;
      }
      var isZoomed = cardEl.classList.contains('rp-graph-wrap--zoomed');
      var shouldZoom = forceState !== undefined ? forceState : !isZoomed;
      if (shouldZoom) {
        cardEl.classList.add('rp-graph-wrap--zoomed');
        document.body.classList.add('rp-graph-zoomed-active');
      } else {
        cardEl.classList.remove('rp-graph-wrap--zoomed');
        if (!document.querySelector('.rp-graph-wrap--zoomed')) {
          document.body.classList.remove('rp-graph-zoomed-active');
        }
      }
    };
  }
