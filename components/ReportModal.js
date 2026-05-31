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
    'Top class': '#10B981',
    Good: '#06B6D4',
    Average: '#EAB308',
    Poor: '#EF4444',
    OK: '#EAB308',
    'Needs work': '#EF4444',
    Excellent: '#10B981',
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
  function buildPieChart(value, color, label, sublabel) {
    const pct = Math.min(100, Math.max(0, value));
    const R = 52, cx = 64, cy = 64;
    const circ = 2 * Math.PI * R;
    const offset = circ * (1 - pct / 100);
    const quality = pct >= 70 ? 'Good' : pct >= 45 ? 'Average' : 'Needs Attention';
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
            <span class="rp-shot-quality" style="color:${qc};background:${qc}18">${shot.shot_quality || '—'}</span>
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
        what: 'Axis-aware head quality (0–100): lateral drift is always penalised; vertical movement uses a shot-type free zone so pull/sweep tracking is not misread as a fault.',
        how: 'Nose/ear-midpoint spread vs shoulder width, with HEAD_RULES weights per classifier label.',
        tip: 'On drives, minimise lateral head movement; on pull/sweep, trust vertical tracking but keep the head on the rotational axis.',
      },
      {
        icon: '👟', color: '#0891B2', title: 'Foot movement',
        what: 'Pre-shot foot activity and front-foot plant timing relative to contact (0–100).',
        how: 'Ankle movement before the swing, normalized by shoulder width, plus plant frame vs contact.',
        tip: 'Trigger a small press or lift early; get the front foot down on time on front-foot shots.',
      },
      {
        icon: '⚖️', color: '#10B981', title: 'Batting stance',
        what: 'Pre-shot shoulder and hip line tilt vs horizontal (0–100).',
        how: 'Mean tilt in the stationary window before onset; flags need enough clean frames.',
        tip: 'Level shoulders before the bowler runs in — avoid showing a preset bias too early.',
      },
      {
        icon: '〰️', color: '#8B5CF6', title: 'Swing arc',
        what: 'How smooth your swing shape is into the ball (0–100), from your hands on video — the path between both wrists.',
        how: 'Steadier, smoother motion into contact scores higher; we scale for camera distance so nets compare fairly.',
        tip: 'Hands together — smooth arc through the ball, not just harder.',
      },
      {
        icon: '📏', color: '#F97316', title: 'Shot execution',
        what: 'In simple words: did you play the right shot for that ball length (0–100).',
        how: 'Coach matrix per length zone × shot type; down-weighted when bounce or track is uncertain.',
        tip: 'Match stroke to length — drives when full, pull/hook when short, defence when good length.',
      },
      {
        icon: '💫', color: '#EAB308', title: 'Swing intensity',
        what: 'How much intent and bat acceleration showed in your swing (0–100), session-normalized.',
        how: 'P90 rolling bilateral wrist velocity vs session ceiling.',
        tip: 'Use as context; good technique beats empty effort.',
      },
      {
        icon: '🏏', color: '#EF4444', title: 'Overall score (/10)',
        what: 'Composite: head 28%, footwork 20%, stance 12%, elbow 12%, shot execution 22%, swing arc 6%.',
        how: 'Ball merge updates length × shot; footwork can blend with line of ball when the ball is tracked.',
        tip: 'Fix head and feet first — then shot choice vs length and swing arc.',
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

  function qualityBand(v, emptyLabel = 'No data') {
    if (v == null || !Number.isFinite(Number(v))) return { label: emptyLabel, color: '#94A3B8' };
    const n = Number(v);
    if (n >= 80) return { label: 'Elite', color: '#10B981' };
    if (n >= 65) return { label: 'Good', color: '#10B981' };
    if (n >= 50) return { label: 'Workable', color: '#EAB308' };
    return { label: 'Needs Attention', color: '#EF4444' };
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

  function buildOverviewAiInsightsHtml(rawInsights, alertsList, confirmedShots, ballAnalytics) {
    const li = normalizeLlmInsights(rawInsights);
    const alerts = Array.isArray(alertsList) ? alertsList : [];
    const dgxDrills = Array.isArray(li?.recommendedDrills) ? li.recommendedDrills : [];
    const alertDrills = alerts.map((a) => String(a?.drill || a?.action || '').trim()).filter(Boolean);
    const drills = [...new Set([...dgxDrills, ...alertDrills])].slice(0, 4);
    const metricNotes = li?.metricNotes || {};
    const postureCues = [
      clarifyCoachCue('head', metricNotes.head),
      clarifyCoachCue('stance', metricNotes.stance),
      clarifyCoachCue('footwork', metricNotes.footwork),
    ]
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 3);
    const alertPostureCues = alerts
      .map((a) => String(a?.player_cue || '').trim())
      .filter(Boolean)
      .slice(0, 3);
    const postureMerged = [...new Set([...postureCues, ...alertPostureCues])].slice(0, 3);
    if (!postureMerged.length) {
      postureMerged.push('Keep head still over the ball through contact.');
      postureMerged.push('Land front foot early, then swing through the line.');
      postureMerged.push('Stay balanced at setup with soft knees and relaxed shoulders.');
    }
    const drillsHtml = drills.length
      ? `<div class="rp-ai-placard-list">${drills.map((d) => `<div class="rp-ai-placard rp-ai-placard--drill">🏏 ${escapeHtml(d)}</div>`).join('')}</div>`
      : '<div class="rp-ai-empty">No drill suggestions available.</div>';
    const postureHtml = `<div class="rp-ai-placard-list">${postureMerged.map((d) => `<div class="rp-ai-placard rp-ai-placard--posture">🧍 ${escapeHtml(d)}</div>`).join('')}</div>`;
    return `
      ${buildAiCoachPanelHtml(rawInsights, confirmedShots)}
      <div class="rp-ai-card">
        <div class="rp-ai-section">
          <div class="rp-ai-section-title">Recommended drills</div>
          ${drillsHtml}
        </div>
        <div class="rp-ai-section">
          <div class="rp-ai-section-title">Posture and setup cues</div>
          ${postureHtml}
        </div>
        <div class="rp-ai-section">
          <div class="rp-ai-section-title">Pace and range game plan</div>
          ${buildBallContextInsightHtml(confirmedShots, ballAnalytics)}
        </div>
      </div>`;
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
  width: 100%; max-width: 1080px;
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
  font-family: Manrope,sans-serif; font-size: 0.76rem; font-weight: 700;
  color: #64748B; letter-spacing: 0.14em; text-transform: uppercase;
  padding-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.07);
  margin: 0 0 16px;
}
.rp-section-title:not(:first-child) { margin-top: 28px; }
.rp-panel-lead {
  font-family: Inter, sans-serif;
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.55;
  margin: -6px 0 16px;
  max-width: 60ch;
}
[data-panel="length"] .rp-length-section { margin-top: 0; }

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
.rp-hl-tag  { font-family: JetBrains Mono,monospace; font-size: 0.65rem; font-weight: 700; color: #475569; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 4px; }
.rp-hl-val  { font-family: Manrope,sans-serif; font-size: 1.12rem; font-weight: 800; letter-spacing: 0.02em; line-height: 1.2; }
.rp-hl-sub  { font-family: JetBrains Mono,monospace; font-size: 0.7rem; font-weight: 500; color: #64748B; margin-top: 4px; line-height: 1.35; }

.rp-per-shot-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 8px; }
.rp-per-shot-row {
  background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 12px;
  padding: 10px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.rp-per-shot-meta {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-bottom: 6px; font-family: Manrope,sans-serif; font-size: 0.78rem; font-weight: 700; color: #334155;
}
.rp-per-shot-num { font-family: JetBrains Mono,monospace; font-size: 0.68rem; color: #94A3B8; }
.rp-per-shot-name { color: #0F172A; }
.rp-per-shot-sc { margin-left: auto; font-family: JetBrains Mono,monospace; font-size: 0.65rem; color: #64748B; }
.rp-per-shot-cues { display: flex; flex-wrap: wrap; gap: 6px; }
.rp-per-shot-flag {
  font-family: Inter,sans-serif; font-size: 0.68rem; font-weight: 600;
  padding: 4px 10px; border-radius: 999px;
  background: rgba(148,163,184,0.16); color: #475569;
  border: 1px solid rgba(100,116,139,0.22);
}
.rp-per-shot-none { font-size: 0.72rem; color: #94A3B8; }

/* ── Pie charts grid ── */
.rp-pies { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 16px; margin-bottom: 8px; }
.rp-subtitle-metrics { margin-top: 6px; font-size: 0.78rem; color: #64748B; line-height: 1.45; max-width: 52rem; }
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
.rp-fw-label { font-family: JetBrains Mono,monospace; font-size: 0.62rem; font-weight: 600; color: #475569; letter-spacing: 0.1em; margin-top: 6px; text-transform: uppercase; line-height: 1.3; }

/* ── Line graphs ── */
.rp-graph-wrap { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; padding: 16px 18px 12px; margin-bottom: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.rp-graph-title { font-family: Manrope,sans-serif; font-size: 0.82rem; font-weight: 700; color: #334155; margin-bottom: 10px; }
.rp-graph-empty { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; padding: 32px; text-align: center; font-family: JetBrains Mono,monospace; font-size: 0.7rem; color: #94A3B8; letter-spacing: 0.1em; margin-bottom: 14px; }

/* ── Shots grid ── */
.rp-shots-grid { display: flex; flex-direction: column; gap: 14px; }
.rp-shot-card {
  background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px;
  padding: 18px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}
.rp-shot-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.rp-shot-left  { display: flex; align-items: center; gap: 8px; }
.rp-shot-right { display: flex; align-items: center; gap: 10px; }
.rp-shot-num   { font-family: JetBrains Mono,monospace; font-size: 0.76rem; color: #64748B; }
.rp-shot-name  { font-family: Manrope,sans-serif; font-size: 1.02rem; font-weight: 800; letter-spacing: 0.02em; }
.rp-shot-conf  { font-family: Manrope,sans-serif; font-size: 0.78rem; font-weight: 700; padding: 2px 10px; border-radius: 100px; }
.rp-shot-time  { font-family: JetBrains Mono,monospace; font-size: 0.74rem; color: #64748B; }
.rp-shot-quality { font-family: Inter,sans-serif; font-size: 0.82rem; font-weight: 700; padding: 4px 11px; border-radius: 8px; }
.rp-shot-score { font-family: Manrope,sans-serif; font-size: 1.22rem; font-weight: 800; }
.rp-shot-denom { font-size: 0.72em; font-weight: 700; color: #64748B; margin-left: 1px; }
.rp-shot-score-inline { font-family: Manrope,sans-serif; font-size: 1.05rem; font-weight: 800; min-width: 2.5rem; text-align: right; }
.rp-bar-unit { font-size: 0.72em; font-weight: 600; color: #64748B; margin-left: 2px; }
.rp-shot-flags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.rp-flag { font-family: Inter,sans-serif; font-size: 0.76rem; font-weight: 600; padding: 5px 11px; border-radius: 8px; cursor: help; letter-spacing: 0.02em; }
.rp-shot-bars { display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; }
.rp-bar-row { display: flex; flex-direction: column; gap: 6px; }
.rp-shot-advanced-hint {
  font-family: JetBrains Mono, monospace;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94A3B8;
  margin-top: 10px;
  margin-bottom: 2px;
}
.rp-bar-row--advanced .rp-bar-label { opacity: 0.88; }
.rp-bar-meta { display: flex; align-items: center; justify-content: space-between; }
.rp-bar-label { font-family: Inter,sans-serif; font-size: 0.8rem; font-weight: 600; color: #334155; cursor: help; }
.rp-bar-val   { font-family: Manrope,sans-serif; font-size: 0.96rem; font-weight: 800; }
.rp-bar-track { width: 100%; height: 8px; background: rgba(0,0,0,0.08); border-radius: 4px; overflow: hidden; }
.rp-bar-fill  { height: 100%; border-radius: 4px; transition: width 1s cubic-bezier(0.4,0,0.2,1); }
.rp-shot-submetrics { font-family: JetBrains Mono,monospace; font-size: 0.65rem; color: #64748B; line-height: 1.45; margin-top: 4px; }
.rp-shot-submetrics--posture { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.06); }
.rp-posture-note {
  margin-top: 16px;
  padding: 14px 16px;
  background: #F1F5F9;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.06);
}
.rp-shot-pad-badge { font-family: JetBrains Mono,monospace; font-size: 0.55rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; background: rgba(239,68,68,0.12); color: #B91C1C; border: 1px solid rgba(239,68,68,0.28); }
.rp-shot-score-row { display: flex; align-items: center; border-top: 1px solid rgba(0,0,0,0.07); padding-top: 12px; gap: 4px; }
.rp-shot-score-row .rp-bar-label { font-size: 0.74rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #64748B; }
.rp-shot-flags-detail { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.rp-flag-detail { font-family: Inter,sans-serif; font-size: 0.84rem; color: #334155; padding: 9px 14px; background: rgba(0,0,0,0.03); border-radius: 8px; line-height: 1.5; }
.rp-coach-card {
  border-left: 4px solid #06B6D4;
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}
.rp-coach-card--primary { border-left-color: #EF4444; }
.rp-coach-card--secondary { border-left-color: #06B6D4; }
.rp-coach-card--clean { border-left-color: #10B981; }
.rp-coach-title {
  font-family: JetBrains Mono,monospace;
  font-size: 0.6rem;
  color: #64748B;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.rp-coach-text { margin: 0 0 6px; font-size: 0.84rem; color: #334155; line-height: 1.5; }
.rp-coach-drill { font-size: 0.78rem; color: #475569; }

.rp-speed-note {
  border-left: 4px solid #F97316;
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  margin-top: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}
.rp-speed-note-title { font-family: Manrope,sans-serif; font-weight: 700; color: #334155; margin-bottom: 6px; }
.rp-speed-note-range { font-size: 0.84rem; color: #475569; line-height: 1.55; }
.rp-speed-note-sub { font-size: 0.8rem; color: #64748B; margin-top: 5px; line-height: 1.45; }

.rp-shots-table-wrap {
  background: #fff;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 12px;
  overflow: auto;
  max-height: 62vh;
  max-width: 100%;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  -webkit-overflow-scrolling: touch;
}
.rp-shots-table { width: 100%; min-width: 920px; border-collapse: separate; border-spacing: 0; font-family: Inter,sans-serif; }
.rp-shots-table thead tr { background: linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%); text-align: left; }
.rp-shots-table thead th {
  position: sticky; top: 0; z-index: 1;
  background: #F1F5F9;
  padding: 12px 10px;
  font-size: 0.68rem;
  color: #64748B;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-bottom: 1px solid rgba(15,23,42,0.08);
  box-shadow: inset 0 -1px 0 rgba(15,23,42,0.08);
  white-space: nowrap;
}
.rp-shots-table tbody tr:nth-child(even) { background: rgba(248,250,252,0.65); }
.rp-shots-table tbody tr:hover { background: rgba(6,182,212,0.06); }
.rp-shots-table td { padding: 12px 10px; font-size: 0.82rem; color: #334155; border-top: 1px solid rgba(0,0,0,0.05); vertical-align: top; }
.rp-shots-table td.rp-col-num { font-family: JetBrains Mono,monospace; font-weight: 700; color: #0F172A; width: 2.5rem; }
.rp-shots-table td.rp-col-shot { font-weight: 700; letter-spacing: 0.04em; color: #0F172A; min-width: 8.5rem; }
.rp-th-hint { font-weight: 500; color: #94A3B8; font-size: 0.62rem; text-transform: none; letter-spacing: 0; }
.rp-col-ball-contact { font-size: 0.82rem; white-space: nowrap; min-width: 9.5rem; }
.rp-col-ball-est { font-weight: 700; font-family: Manrope, sans-serif; letter-spacing: 0.02em; }
.rp-col-ball-spd { font-family: JetBrains Mono, monospace; font-weight: 600; font-size: 0.8rem; color: #475569; }
.rp-col-ball-context { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 13rem; }
.rp-col-ball-divider { color: #94A3B8; font-weight: 700; }
.rp-col-swing-label { font-family: Inter,sans-serif; font-size: 0.82rem; font-weight: 700; color: #475569; }
.rp-shots-table td.rp-col-exec { font-weight: 800; font-family: Manrope,sans-serif; color: #06B6D4; white-space: nowrap; }
.rp-del-metric { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; min-width: 5.5rem; max-width: 11rem; }
.rp-del-metric--empty { color: #94A3B8; }
.rp-del-metric-dash { font-family: JetBrains Mono,monospace; font-size: 0.9rem; }
.rp-del-metric-num { font-family: Manrope,sans-serif; font-size: 1rem; font-weight: 800; line-height: 1.1; }
.rp-del-metric-band { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.rp-del-metric-cue { font-size: 0.72rem; color: #64748B; line-height: 1.35; margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rp-col-flags { min-width: 12rem; max-width: 20rem; }
.rp-flag-stack { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
.rp-shots-chip--soft { font-weight: 600; opacity: 0.95; }
.rp-shots-chip {
  display: inline-block;
  margin-right: 6px;
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.rp-shots-detail {
  margin-top: 6px;
}
.rp-shots-detail summary {
  cursor: pointer;
  color: #475569;
  font-size: 12px;
}
.rp-shots-detail-text {
  font-size: 12px;
  color: #64748B;
  margin-top: 4px;
}

.rp-trend-summary {
  border-left: 4px solid #06B6D4;
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  margin-top: 14px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}
.rp-trend-summary-title {
  font-family: JetBrains Mono,monospace;
  font-size: 0.6rem;
  color: #64748B;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.rp-trend-summary-body { font-size: 0.84rem; color: #334155; line-height: 1.6; }
.rp-trend-summary-note { margin-top: 8px; color: #B45309; font-size: 0.8rem; }

/* ── Metric cards ── */
.rp-metrics-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 16px; }
.rp-metric-card { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; padding: 18px 18px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.rp-metric-icon  { font-size: 1.5rem; margin-bottom: 8px; }
.rp-metric-title { font-family: Manrope,sans-serif; font-size: 1rem; font-weight: 800; margin-bottom: 10px; }
.rp-metric-section { margin-bottom: 9px; }
.rp-metric-tag { display: inline-block; font-family: JetBrains Mono,monospace; font-size: 0.55rem; font-weight: 600; color: #94A3B8; background: rgba(0,0,0,0.05); border-radius: 4px; padding: 2px 7px; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; }
.rp-metric-section p { font-family: Inter,sans-serif; font-size: 0.82rem; color: #475569; line-height: 1.55; margin: 0; }
.rp-ai-card { background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:14px; padding:16px; box-shadow:0 1px 4px rgba(0,0,0,0.05); margin-bottom:16px; }
.rp-ai-card--muted { opacity:0.92; }
.rp-ai-title-row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px; }
.rp-ai-title { font-family:Manrope,sans-serif; font-size:1rem; font-weight:800; color:#0F172A; }
.rp-ai-right { display:flex; align-items:center; gap:8px; }
.rp-ai-model { font-family:JetBrains Mono, ui-monospace, monospace; font-size:0.72rem; color:#64748B; }
.rp-ai-badge { border-radius:999px; padding:2px 9px; font-size:0.7rem; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; border:1px solid transparent; }
.rp-ai-badge--ok { color:#047857; background:rgba(16,185,129,0.14); border-color:rgba(16,185,129,0.3); }
.rp-ai-badge--warn { color:#B45309; background:rgba(245,158,11,0.15); border-color:rgba(245,158,11,0.3); }
.rp-ai-badge--muted { color:#475569; background:rgba(148,163,184,0.14); border-color:rgba(148,163,184,0.3); }
.rp-ai-summary { margin:0 0 10px; font-size:0.86rem; color:#334155; line-height:1.5; }
.rp-ai-error { margin-bottom:10px; font-size:0.78rem; color:#B45309; }
.rp-ai-section { margin-top:10px; }
.rp-ai-section-title { font-size:0.73rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#64748B; margin-bottom:6px; }
.rp-ai-list { margin:0; padding-left:18px; color:#334155; font-size:0.84rem; line-height:1.45; }
.rp-ai-empty { font-size:0.8rem; color:#94A3B8; }
.rp-ai-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; }
.rp-ai-note { border:1px solid rgba(0,0,0,0.07); border-radius:10px; background:#F8FAFC; padding:8px 10px; }
.rp-ai-note-k { font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; color:#64748B; margin-bottom:4px; font-weight:700; }
.rp-ai-note-v { font-size:0.82rem; color:#334155; line-height:1.4; }
.rp-ai-section--tile { border-top:1px dashed rgba(15,23,42,0.12); padding-top:10px; }
.rp-ai-placard-list { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; }
.rp-ai-placard { border-radius:10px; padding:8px 10px; font-size:0.82rem; line-height:1.35; border:1px solid rgba(15,23,42,0.1); border-left-width:4px; background:#F8FAFC; color:#334155; }
.rp-ai-placard--good { background:rgba(16,185,129,0.10); border-color:rgba(16,185,129,0.28); }
.rp-ai-placard--focus { background:rgba(245,158,11,0.10); border-color:rgba(245,158,11,0.28); }
.rp-ai-placard--drill { background:rgba(59,130,246,0.09); border-color:rgba(59,130,246,0.25); }
.rp-ai-placard--posture { background:rgba(14,165,233,0.09); border-color:rgba(14,165,233,0.25); }

/* ── Optional original video block (player session reports) ── */
.rp-video-block {
  margin: 2px 2px 12px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
  padding: 12px;
}
.rp-video-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.rp-video-label {
  font-family: JetBrains Mono, monospace;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}
.rp-video-meta {
  margin-top: 3px;
  font-family: Inter, sans-serif;
  font-size: 0.78rem;
  color: #475569;
}
.rp-video-name {
  font-family: Inter, sans-serif;
  font-size: 0.8rem;
  font-weight: 700;
  color: #334155;
  text-align: right;
  word-break: break-word;
}
.rp-video-shell {
  border-radius: 12px;
  overflow: hidden;
  background: #020617;
  border: 1px solid #e2e8f0;
}
.rp-video-el {
  display: block;
  width: 100%;
  max-height: 270px;
  background: #000;
}
.rp-video-link {
  display: inline-block;
  margin-top: 8px;
  font-family: Inter, sans-serif;
  font-size: 0.8rem;
  color: #0891b2;
  text-decoration: underline;
}

/* ── Responsive ── */
@media (max-width: 700px) {
  .rp-pies { grid-template-columns: 1fr; }
  .rp-highlights { grid-template-columns: 1fr; }
  .rp-footwork { grid-template-columns: repeat(3,1fr); }
  .rp-metrics-grid { grid-template-columns: 1fr; }
  .rp-ai-grid { grid-template-columns: 1fr; }
  .rp-ai-placard-list { grid-template-columns: 1fr; }
  .rp-tabs { gap: 0; overflow-x: auto; }
  .rp-tab { white-space: nowrap; }
}`;
    document.head.appendChild(style);
  }

  // ── Build full modal HTML ────────────────────────────────
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

    const confirmedShots = shots.filter(s => Number(s.conf ?? s.confidence) >= 0.3);
    const totalShots = confirmedShots.length;
    const confirmedCount = summary.shotsConfirmed || totalShots;
    const avgScore = summary.avgShotScore != null
      ? Number(summary.avgShotScore).toFixed(1)
      : (totalShots ? (confirmedShots.reduce((a,s) => a + (s.shot_score||0), 0) / totalShots).toFixed(1) : '—');
    // Usage compares confirmed-only pool (N of N), not raw detections vs confirmed.
    const usage =
      summary.shotsTotalDetected > summary.shotsConfirmed && confirmedCount > 0
        ? `${confirmedCount} of ${confirmedCount} shots used`
        : '';
    const bcol = SHOT_COLORS[best.label] || '#10B981';
    const wcol = SHOT_COLORS[worst.label] || '#EF4444';

    const avHead = summary.avgHead != null ? Math.round(summary.avgHead) : null;
    const avStab = summary.avgStability != null ? Math.round(summary.avgStability) : null;
    const avFw = summary.avgFootwork != null ? Math.round(summary.avgFootwork) : null;
    const avPath = summary.avgSwingPath != null ? Math.round(summary.avgSwingPath) : null;
    const avEx = summary.avgExecution != null ? Math.round(summary.avgExecution) : null;
    const metricBits = [];
    if (avHead != null) metricBits.push(`Head ${avHead}`);
    if (avStab != null) metricBits.push(`Stance ${avStab}`);
    if (avFw != null) metricBits.push(`Feet ${avFw}`);
    if (avPath != null) metricBits.push(`Swing arc ${avPath}`);
    if (avEx != null) metricBits.push(`Shot execution ${avEx}`);
    const metricSubtitle = metricBits.length
      ? `<div class="rp-subtitle rp-subtitle-metrics">Session averages (0–100): ${metricBits.join(' · ')}</div>`
      : '';

    // Trend data for graphs (same keys as analyse_session replay + bat speed)
    const trendShots = confirmedShots.map(s => ({
      shot_num: s.shot_num,
      speed:    parseFloat((s.peak_swing_speed || 0).toFixed(1)),
      head_quality_score: s.head_quality_score != null ? Math.round(s.head_quality_score) : 0,
      symmetry_score: s.symmetry_score != null ? Math.round(s.symmetry_score) : 0,
      footwork_score: s.footwork_score != null ? Math.round(s.footwork_score) : 0,
      swing_intensity: s.swing_intensity != null ? Math.round(s.swing_intensity) : 0,
      swing_path_score: s.swing_path_score != null ? Math.round(s.swing_path_score) : 0,
      execution_score: s.execution_score != null ? Math.round(s.execution_score) : 0,
      score:    s.shot_score || 0,
    }));

    const lengthTabHtml =
      typeof CrickEyeLengthInsights !== 'undefined'
        ? CrickEyeLengthInsights.buildLengthSectionHtml({
            ballAnalytics,
            confirmedShots,
            heading: '',
            compact: false,
          })
        : '<p class="rp-length-empty">Length insights require <code>lengthInsights.js</code> to load.</p>';
    const aiOverviewHtml = buildOverviewAiInsightsHtml(llmInsights, alerts, confirmedShots, ballAnalytics);

    const videoPanel = originalVideoUrl
      ? `
        <section class="rp-video-block">
          <div class="rp-video-head">
            <div class="rp-video-title-wrap">
              <div class="rp-video-label">Original video</div>
              ${sessionDateLabel ? `<div class="rp-video-meta">${escapeHtml(sessionDateLabel)}${sessionStatus ? ` · ${escapeHtml(sessionStatus)}` : ''}</div>` : ''}
            </div>
            ${originalVideoName ? `<div class="rp-video-name">${escapeHtml(originalVideoName)}</div>` : ''}
          </div>
          <div class="rp-video-shell">
            <video class="rp-video-el" src="${escapeHtml(originalVideoUrl)}" controls playsinline preload="metadata"></video>
          </div>
          <a class="rp-video-link" href="${escapeHtml(originalVideoUrl)}" target="_blank" rel="noopener noreferrer">Open video in new tab</a>
        </section>`
      : '';

    return `
    <div class="rp-overlay" id="rpOverlay">
      <div class="rp-modal" id="rpModal">

        <!-- Header -->
        <div class="rp-header">
          <div class="rp-header-left">
            <div class="rp-badge">${stance}</div>
            <div>
              <div class="rp-title">Net Session Report</div>
              <div class="rp-subtitle">${summary.shotsConfirmed || totalShots} confirmed shots &nbsp;·&nbsp; Avg Score: ${avgScore}/10 ${usage ? `&nbsp;·&nbsp; ${usage}` : ''}</div>
              ${metricSubtitle}
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
          <button class="rp-tab" data-tab="shots">All Deliveries</button>
          <button class="rp-tab" data-tab="length">Ball length</button>
          <button class="rp-tab" data-tab="trends">Scoring Zones</button>
          <button class="rp-tab" data-tab="metrics">What metrics mean</button>
          ${originalVideoUrl ? '<button class="rp-tab" data-tab="video">Recorded Video</button>' : ''}
        </div>

        <!-- Body -->
        <div class="rp-body" id="rpBody">

          ${originalVideoUrl ? `<div data-panel="video" style="display:none">${videoPanel}</div>` : ''}

          <!-- ═══ OVERVIEW ═══ -->
          <div data-panel="overview">

            <div class="rp-section-title">Shot Highlights</div>
            <div class="rp-highlights">
              <div class="rp-highlight-card best">
                <div class="rp-hl-icon">🔥</div>
                <div>
                  <div class="rp-hl-tag">Signature Shot</div>
                  <div class="rp-hl-val" style="color:${bcol}">#${best.shot_num} ${(SHOT_LABELS[best.label]||best.label||'—').toUpperCase()}</div>
                  <div class="rp-hl-sub">Score: ${best.shot_score}/10 &nbsp;·&nbsp; ${best.shot_quality} &nbsp;·&nbsp; ${best.timestamp}</div>
                </div>
              </div>
              <div class="rp-highlight-card worst">
                <div class="rp-hl-icon">⚠️</div>
                <div>
                  <div class="rp-hl-tag">Work-On Shot</div>
                  <div class="rp-hl-val" style="color:${wcol}">#${worst.shot_num} ${(SHOT_LABELS[worst.label]||worst.label||'—').toUpperCase()}</div>
                  <div class="rp-hl-sub">Score: ${worst.shot_score}/10 &nbsp;·&nbsp; ${worst.shot_quality} &nbsp;·&nbsp; ${worst.timestamp}</div>
                </div>
              </div>
            </div>

            <div class="rp-section-title">Core Metrics</div>
            <div class="rp-pies">
              <div class="rp-pie-card">
                ${buildPieChart(Math.round(summary.avgHead || 0), '#06B6D4', 'Head position', 'Axis-aware head quality for your shot mix')}
              </div>
              <div class="rp-pie-card">
                ${buildPieChart(Math.round(summary.avgStability || 0), '#10B981', 'Batting stance', 'Pre-shot shoulder and hip symmetry')}
              </div>
              <div class="rp-pie-card">
                ${buildPieChart(Math.round(summary.avgFootwork || 0), '#0891B2', 'Foot movement', 'Pre-shot feet and plant timing vs contact')}
              </div>
              <div class="rp-pie-card">
                ${buildPieChart(Math.round(summary.avgSwingPath || 0), '#8B5CF6', 'Swing arc', 'Average hand path quality into contact')}
              </div>
              <div class="rp-pie-card">
                ${buildPieChart(Math.round(summary.avgExecution || 0), '#F97316', 'Shot execution', 'Did your stroke match the ball length? (0–100)')}
              </div>
              <div class="rp-pie-card">
                ${buildPieChart(Math.round((Number(avgScore) || 0) * 10), '#FAAD14', 'Overall score', `${avgScore}/10 across confirmed deliveries`)}
              </div>
            </div>
            <div class="rp-section-title">AI Coach Insights</div>
            ${aiOverviewHtml}
          </div>

          <!-- ═══ BALL LENGTH ═══ -->
          <div data-panel="length" style="display:none">
            <div class="rp-section-title">Ball length &amp; performance</div>
            <p class="rp-panel-lead">See where balls landed (full, good length, short), how you scored in each zone, and quick cues you can take to your next net.</p>
            ${lengthTabHtml}
          </div>

          <!-- ═══ SHOTS ═══ -->
          <div data-panel="shots" style="display:none">
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
                    <th>Swing intensity</th>
                    <th>Coaching flags &amp; cues</th>
                  </tr>
                </thead>
                <tbody>
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
                      const fi = FLAG_INFO[base] || { label: base.replace(/_/g, ' '), color: '#64748B', desc: '' };
                      pushFlag({ label: fi.label, color: fi.color, desc: fi.desc || '' });
                    }
                    if (s.footwork_flag) {
                      const ff = String(s.footwork_flag);
                      const fi = FLAG_INFO[ff] || { label: ff.replace(/_/g, ' '), color: '#64748B', desc: '' };
                      pushFlag({ label: fi.label, color: fi.color, desc: fi.desc || '', soft: true });
                    }
                    const chips = flagRows.length
                      ? flagRows.map((r) => `<span class="rp-shots-chip${r.soft ? ' rp-shots-chip--soft' : ''}" style="background:${r.color}18;color:${r.color}">${escapeHtml(r.label)}</span>`).join('')
                      : '<span class="rp-shots-chip" style="background:rgba(16,185,129,0.12);color:#059669;font-weight:700">Clean delivery</span>';
                    const flagDetails = flagRows.length
                      ? flagRows.map((r) => `<div class="rp-shots-detail-text"><strong style="color:${r.color}">${escapeHtml(r.label)}:</strong> ${escapeHtml(r.desc || 'Technical note from the analyser.')}</div>`).join('')
                      : '<div class="rp-shots-detail-text">No coaching flags on this delivery.</div>';
                    const llmShotNote = resolveShotTypeNoteForDelivery(llmInsights, s.shot_type || s.label || '');
                    const deliveryShotKey = resolveLlmShotKey(s.shot_type || s.label || '');
                    const llmStrengthRaw0 = llmShotNote && typeof llmShotNote === 'object' ? String(llmShotNote.strength || '').trim() : '';
                    const llmFocusRaw0 = llmShotNote && typeof llmShotNote === 'object' ? String(llmShotNote.focus || '').trim() : '';
                    const llmStrengthRaw = textMentionsOtherShot(llmStrengthRaw0, deliveryShotKey) ? '' : llmStrengthRaw0;
                    const llmFocusRaw = textMentionsOtherShot(llmFocusRaw0, deliveryShotKey) ? '' : llmFocusRaw0;
                    const metricNotes = llmInsights?.metric_notes && typeof llmInsights.metric_notes === 'object'
                      ? llmInsights.metric_notes
                      : null;
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
                    const execCol = exec >= 7 ? '#10B981' : exec >= 5 ? '#06B6D4' : exec >= 3 ? '#EAB308' : '#EF4444';
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
                      <td>${formatSwingIntensityLabelCell(s.swing_intensity_label)}</td>
                      <td class="rp-col-flags">
                        <div class="rp-flag-stack">${chips}</div>
                        <details class="rp-shots-detail"><summary>▶ AI coach detail</summary>
                          ${combinedDetails}
                        </details>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- ═══ TRENDS ═══ -->
          <div data-panel="trends" style="display:none">
            <div class="rp-section-title">Scoring Arc Trends</div>
            <p style="font-family:Inter,sans-serif;font-size:0.82rem;color:#64748B;margin-bottom:20px;line-height:1.55">
              These graphs show how each metric changed shot-by-shot through your session. Look for patterns — are you getting tired later? Do scores drop after a certain shot?
            </p>
            ${buildLineGraph(trendShots, 'head_quality_score',  '#6C63FF', 'Head position (0–100)', 100)}
            ${buildLineGraph(trendShots, 'symmetry_score',  '#10B981', 'Batting stance (0–100)', 100)}
            ${buildLineGraph(trendShots, 'footwork_score', '#0891B2', 'Foot movement (0–100)', 100)}
            ${buildLineGraph(trendShots, 'swing_path_score', '#8B5CF6', 'Swing arc (0–100)', 100)}
            ${buildLineGraph(trendShots, 'execution_score', '#F97316', 'Shot execution (0–100)', 100)}
            ${buildLineGraph(trendShots, 'score', '#FAAD14', 'Overall score (/10)', 10)}
            ${summary.shotsConfirmed >= 6 ? `
              <div class="rp-trend-summary">
                <div class="rp-trend-summary-title">Session Momentum (1st vs 2nd Half)</div>
                <div class="rp-trend-summary-body">
                  Head position: ${Math.round(summary.trend.first_half_head_quality_score || 0)} → ${Math.round(summary.trend.second_half_head_quality_score || 0)}<br/>
                  Batting stance: ${Math.round(summary.trend.first_half_symmetry_score || 0)} → ${Math.round(summary.trend.second_half_symmetry_score || 0)}<br/>
                  Foot movement: ${Math.round(summary.trend.first_half_footwork_score || 0)} → ${Math.round(summary.trend.second_half_footwork_score || 0)}<br/>
                  Swing arc: ${Math.round(summary.trend.first_half_swing_path_score || 0)} → ${Math.round(summary.trend.second_half_swing_path_score || 0)}<br/>
                  Shot execution: ${Math.round(summary.trend.first_half_execution_score || 0)} → ${Math.round(summary.trend.second_half_execution_score || 0)}
                </div>
                ${summary.fatigue ? '<div class="rp-trend-summary-note">Swing intensity or bat speed dipped in the second half — check fatigue. Also watch swing arc trend.</div>' : ''}
              </div>` : ''}
          </div>

          <!-- ═══ METRICS ═══ -->
          <div data-panel="metrics" style="display:none">
            <div class="rp-section-title">What metrics mean</div>
            <p style="font-family:Inter,sans-serif;font-size:0.82rem;color:#64748B;margin-bottom:20px;line-height:1.55">
              Cricket-first interpretation: read dominant hand, head position, base stability, and scoring arc together before setting work-on drills.
            </p>
            <p style="font-family:Inter,sans-serif;font-size:0.78rem;color:#94A3B8;margin:-8px 0 16px;line-height:1.5">
              ${confirmedCount > 0
                ? `${confirmedCount} of ${confirmedCount} shots confirmed (confidence filter at 30%).`
                : 'No shots met the confirmation threshold (30%).'}
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
    { key: 'head', label: 'Head Position', color: '#14B8A6', title: 'Head position', sublabel: 'Axis-aware head quality for your shot mix', tip: 'Axis-aware head quality (0–100): lateral drift is penalised; vertical movement uses shot-type rules so pull/sweep are not misread.' },
    { key: 'stance', label: 'Batting Stance', color: '#9333EA', title: 'Batting stance', sublabel: 'Pre-shot shoulder and hip symmetry', tip: 'Pre-shot shoulder and hip line tilt vs horizontal (0–100). Level shoulders before release.' },
    { key: 'foot', label: 'Foot Movement', color: '#22C55E', title: 'Foot movement', sublabel: 'Pre-shot feet and plant timing vs contact', tip: 'Pre-shot foot activity and front-foot plant timing relative to contact (0–100).' },
    { key: 'swing', label: 'Swing Arc', color: '#F97316', title: 'Swing arc', sublabel: 'Average hand path quality into contact', tip: 'Smooth hand path into the ball (0–100), from both wrists on your video.' },
    { key: 'exec', label: 'Shot Execution', color: '#EF4444', title: 'Shot execution', sublabel: 'Did your stroke match the ball length? (0–100)', tip: 'Did you play the right shot for that ball length (0–100)? Coach matrix per length × shot type.' },
  ];

  function metricQualityLabel(pct) {
    const v = Math.min(100, Math.max(0, Number(pct) || 0));
    if (v >= 70) return { text: 'Good', color: '#10B981' };
    if (v >= 45) return { text: 'Average', color: '#EAB308' };
    return { text: 'Needs Attention', color: '#EF4444' };
  }

  function buildPlayCardMetricDetailHtml(value, color, label, sublabel) {
    const pct = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
    const R = 44;
    const cx = 56;
    const cy = 56;
    const circ = 2 * Math.PI * R;
    const offset = circ * (1 - pct / 100);
    const { text: quality, color: qc } = metricQualityLabel(pct);
    return `
      <div class="pc-metric-detail-card">
        <div class="pc-metric-detail-ring">
          <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
            <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="9"/>
            <circle cx="${cx}" cy="${cy}" r="${R}" fill="none"
              stroke="${color}" stroke-width="9" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${circ}"
              transform="rotate(-90 ${cx} ${cy})"
              class="rp-pie-arc pc-metric-detail-arc" data-offset="${offset}"/>
            <text x="${cx}" y="${cy - 6}" text-anchor="middle"
              style="font-family:Manrope,sans-serif;font-size:20px;font-weight:800;fill:${color}">${pct}</text>
            <text x="${cx}" y="${cy + 10}" text-anchor="middle"
              style="font-family:Inter,sans-serif;font-size:9px;fill:#94A3B8">out of 100</text>
          </svg>
        </div>
        <div class="pc-metric-detail-label">${escapeHtml(label)}</div>
        <div class="pc-metric-detail-quality" style="color:${qc}">${escapeHtml(quality)}</div>
        <div class="pc-metric-detail-sublabel">${escapeHtml(sublabel)}</div>
      </div>`;
  }

  function scoreColor100(n) {
    if (n == null || !Number.isFinite(Number(n))) return '#94A3B8';
    const v = Number(n);
    if (v >= 80) return '#10B981';
    if (v >= 50) return '#F97316';
    return '#EF4444';
  }

  function scoreColor10(n) {
    if (n == null || !Number.isFinite(Number(n))) return '#94A3B8';
    const v = Number(n);
    if (v >= 8) return '#10B981';
    if (v >= 5) return '#F97316';
    return '#EF4444';
  }

  function buildPlayCardDonutSvg(summary, avgScore10) {
    const head = Math.max(0, Math.min(100, Math.round(summary.avgHead || 0)));
    const stance = Math.max(0, Math.min(100, Math.round(summary.avgStability || 0)));
    const foot = Math.max(0, Math.min(100, Math.round(summary.avgFootwork || 0)));
    const swing = Math.max(0, Math.min(100, Math.round(summary.avgSwingPath || 0)));
    const exec = Math.max(0, Math.min(100, Math.round(summary.avgExecution || 0)));
    const scores = [
      { v: head, c: '#14B8A6', label: 'Head Position' },
      { v: stance, c: '#9333EA', label: 'Batting Stance' },
      { v: foot, c: '#22C55E', label: 'Foot Movement' },
      { v: swing, c: '#F97316', label: 'Swing Arc' },
      { v: exec, c: '#EF4444', label: 'Shot Execution' },
    ];
    const sumW = scores.reduce((a, s) => a + Math.max(1, s.v), 0);
    const cx = 72;
    const cy = 72;
    const R = 52;
    const rIn = 34;
    const gapRad = 0.06;
    let a0 = -Math.PI / 2;
    const paths = [];
    scores.forEach((s) => {
      const sweep = (Math.max(1, s.v) / sumW) * (2 * Math.PI - gapRad * scores.length);
      const a1 = a0 + sweep;
      const large = sweep > Math.PI ? 1 : 0;
      const x0o = cx + R * Math.cos(a0);
      const y0o = cy + R * Math.sin(a0);
      const x1o = cx + R * Math.cos(a1);
      const y1o = cy + R * Math.sin(a1);
      const x0i = cx + rIn * Math.cos(a0);
      const y0i = cy + rIn * Math.sin(a0);
      const x1i = cx + rIn * Math.cos(a1);
      const y1i = cy + rIn * Math.sin(a1);
      const d = `M ${x0o.toFixed(2)} ${y0o.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1o.toFixed(2)} ${y1o.toFixed(2)} L ${x1i.toFixed(2)} ${y1i.toFixed(2)} A ${rIn} ${rIn} 0 ${large} 0 ${x0i.toFixed(2)} ${y0i.toFixed(2)} Z`;
      paths.push(
        `<path class="pc-donut-seg" d="${d}" fill="${s.c}" stroke="#fff" stroke-width="2" data-pc-metric="${escapeHtml(s.label)}" data-pc-score="${s.v}" style="cursor:pointer"/>`,
      );
      a0 = a1 + gapRad;
    });
    const overall = Math.round((Number(avgScore10) || 0) * 10);
    return `
      <div class="pc-donut-wrap">
        <svg width="144" height="144" viewBox="0 0 144 144" class="pc-donut-svg" aria-hidden="true">
          ${paths.join('')}
        </svg>
        <div class="pc-donut-center">
          <span class="pc-donut-overall">${overall}</span>
          <span class="pc-donut-sub">/ 100</span>
        </div>
        <div id="pcDonutTooltip" class="pc-donut-tooltip" hidden></div>
      </div>
      <div class="pc-metric-legend">
        ${METRIC_INFO_PLAYCARD.map((m) => {
          const score = { head, stance, foot, swing, exec }[m.key] ?? 0;
          return `
          <div class="pc-metric-legend-item" data-pc-metric-key="${m.key}">
            <div class="pc-metric-legend-row">
              <span class="pc-metric-dot" style="background:${m.color}"></span>
              <span class="pc-metric-name">${escapeHtml(m.label)}</span>
              <button type="button" class="pc-metric-info"
                data-pc-metric-key="${m.key}"
                aria-expanded="false"
                aria-controls="pc-metric-detail-${m.key}"
                title="${escapeHtml(m.tip)}"
                aria-label="Show ${escapeHtml(m.title)} score">ℹ️</button>
            </div>
            <div class="pc-metric-detail" id="pc-metric-detail-${m.key}" role="region" aria-hidden="true">
              <div class="pc-metric-detail-inner">
                ${buildPlayCardMetricDetailHtml(score, m.color, m.title, m.sublabel)}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
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
    const confirmedShots = shots.filter((s) => Number(s.conf ?? s.confidence) >= 0.3);
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

    const trendsBlock = `
      <div class="pc-zones-trends">
        <div class="pc-subhead">Scoring arc trends</div>
        <p class="pc-muted">How each metric moved shot-by-shot through your session.</p>
        ${buildLineGraph(trendShots, 'head_quality_score', '#14B8A6', 'Head position (0–100)', 100)}
        ${buildLineGraph(trendShots, 'symmetry_score', '#9333EA', 'Batting stance (0–100)', 100)}
        ${buildLineGraph(trendShots, 'footwork_score', '#22C55E', 'Foot movement (0–100)', 100)}
        ${buildLineGraph(trendShots, 'swing_path_score', '#F97316', 'Swing arc (0–100)', 100)}
        ${buildLineGraph(trendShots, 'execution_score', '#EF4444', 'Shot execution (0–100)', 100)}
        ${buildLineGraph(trendShots, 'score', '#06B6D4', 'Overall score (/10)', 10)}
        ${summary.shotsConfirmed >= 6 ? `
          <div class="rp-trend-summary">
            <div class="rp-trend-summary-title">Session momentum (1st vs 2nd half)</div>
            <div class="rp-trend-summary-body">
              Head: ${Math.round(summary.trend.first_half_head_quality_score || 0)} → ${Math.round(summary.trend.second_half_head_quality_score || 0)}<br/>
              Stance: ${Math.round(summary.trend.first_half_symmetry_score || 0)} → ${Math.round(summary.trend.second_half_symmetry_score || 0)}<br/>
              Feet: ${Math.round(summary.trend.first_half_footwork_score || 0)} → ${Math.round(summary.trend.second_half_footwork_score || 0)}<br/>
              Swing arc: ${Math.round(summary.trend.first_half_swing_path_score || 0)} → ${Math.round(summary.trend.second_half_swing_path_score || 0)}<br/>
              Execution: ${Math.round(summary.trend.first_half_execution_score || 0)} → ${Math.round(summary.trend.second_half_execution_score || 0)}
            </div>
            ${summary.fatigue ? '<div class="rp-trend-summary-note">Swing intensity or bat speed dipped in the second half — check fatigue.</div>' : ''}
          </div>` : ''}
      </div>`;

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
    const confirmedShots = shots.filter((s) => Number(s.conf ?? s.confidence) >= 0.3);
    const alerts = analysis.coaching_alerts || [];

    const m = derivePlayCardModel(data);

    if (section === 'ai') {
      // Full Net Session Report AI Coach section
      return `
        <div class="rp-section-title">AI Coach Insights</div>
        ${m.aiHtml}`;
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
          const fi = FLAG_INFO[base] || { label: base.replace(/_/g, ' '), color: '#64748B', desc: '' };
          pushFlag({ label: fi.label, color: fi.color, desc: fi.desc || '' });
        }
        if (s.footwork_flag) {
          const ff = String(s.footwork_flag);
          const fi = FLAG_INFO[ff] || { label: ff.replace(/_/g, ' '), color: '#64748B', desc: '' };
          pushFlag({ label: fi.label, color: fi.color, desc: fi.desc || '', soft: true });
        }
        const chips = flagRows.length
          ? flagRows.map((r) => `<span class="rp-shots-chip${r.soft ? ' rp-shots-chip--soft' : ''}" style="background:${r.color}18;color:${r.color}">${escapeHtml(r.label)}</span>`).join('')
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
        const execCol = exec >= 7 ? '#10B981' : exec >= 5 ? '#06B6D4' : exec >= 3 ? '#EAB308' : '#EF4444';

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
      return `
        <div class="pc-modal-section">
          ${m.trendsBlock}
        </div>`;
    }
    return '<p class="pc-empty">Unknown section.</p>';
  }

  function buildLivePlayCardHtml(data) {
    const m = derivePlayCardModel(data);
    const { summary, best, worst, totalShots, avgScore } = m;
    const bestLabel = escapeHtml((SHOT_LABELS[best.label] || best.label || '—').toUpperCase());
    const worstLabel = escapeHtml((SHOT_LABELS[worst.label] || worst.label || '—').toUpperCase());
    const bestMeta = `Score: ${best.shot_score != null ? best.shot_score : '—'}/10 · ${escapeHtml(best.shot_quality || '—')} · ${escapeHtml(best.timestamp || '—')}`;
    const worstMeta = `Score: ${worst.shot_score != null ? worst.shot_score : '—'}/10 · ${escapeHtml(worst.shot_quality || '—')} · ${escapeHtml(worst.timestamp || '—')}`;

    return `
      <div class="pc-inner">
        <div class="pc-score-surface">
          <div class="pc-head-row">
            <span class="pc-badge">${escapeHtml(data.stance || 'RHB')}</span>
            <span class="pc-head-meta">${summary.shotsConfirmed || totalShots} shots · Avg ${avgScore}/10</span>
          </div>
          <div class="pc-donut-row">
            ${buildPlayCardDonutSvg(summary, avgScore)}
          </div>
          <div class="pc-hl-section">
            <div class="pc-hl-section-title">Shot Highlights</div>
            <div class="pc-highlights-grid">
              <div class="pc-hl-card pc-hl-card--best">
                <span class="pc-hl-ico" aria-hidden="true">🔥</span>
                <div class="pc-hl-card-body">
                  <div class="pc-hl-tag">Signature Shot</div>
                  <div class="pc-hl-title pc-hl-title--best">#${best.shot_num || '—'} ${bestLabel}</div>
                  <div class="pc-hl-sub">${bestMeta}</div>
                </div>
              </div>
              <div class="pc-hl-card pc-hl-card--work">
                <span class="pc-hl-ico" aria-hidden="true">⚠️</span>
                <div class="pc-hl-card-body">
                  <div class="pc-hl-tag">Work-On Shot</div>
                  <div class="pc-hl-title pc-hl-title--work">#${worst.shot_num || '—'} ${worstLabel}</div>
                  <div class="pc-hl-sub">${worstMeta}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="pc-scroll-extra">
        <div class="pc-acc">
          <button type="button" class="pc-acc-btn" data-pc-open="ai">
            <span class="pc-acc-ico" aria-hidden="true">🧠</span><span class="pc-acc-label">AI Insights</span>
          </button>
          <button type="button" class="pc-acc-btn" data-pc-open="length">
            <span class="pc-acc-ico" aria-hidden="true">📏</span><span class="pc-acc-label">Ball length analysis</span>
          </button>
          <button type="button" class="pc-acc-btn" data-pc-open="deliveries">
            <span class="pc-acc-ico" aria-hidden="true">📋</span><span class="pc-acc-label">Deliveries</span>
          </button>
          <button type="button" class="pc-acc-btn" data-pc-open="zones">
            <span class="pc-acc-ico" aria-hidden="true">🎯</span><span class="pc-acc-label">Scoring zones</span>
          </button>
        </div>
        </div>
      </div>`;
  }

  function bindPlayCardInteractions(root, getReportData, openSectionModal) {
    const tip = root.querySelector('#pcDonutTooltip');
    root.querySelectorAll('.pc-donut-seg').forEach((path) => {
      path.addEventListener('click', (e) => {
        e.stopPropagation();
        const label = path.getAttribute('data-pc-metric') || '';
        const score = path.getAttribute('data-pc-score') || '';
        if (!tip) return;
        tip.textContent = `${label}: ${score}/100`;
        tip.hidden = false;
        const wrap = root.querySelector('.pc-donut-wrap');
        const r = wrap?.getBoundingClientRect();
        if (r && wrap) {
          const cx = e.clientX - r.left;
          const cy = e.clientY - r.top;
          tip.style.left = `${Math.min(Math.max(8, cx - 40), (wrap.clientWidth || 144) - 100)}px`;
          tip.style.top = `${Math.min(Math.max(8, cy - 36), (wrap.clientHeight || 144) - 8)}px`;
        }
      });
    });
    root.addEventListener('click', (e) => {
      if (tip && !e.target.closest('.pc-donut-seg')) tip.hidden = true;
    });

    function closeAllMetricDetails() {
      root.querySelectorAll('.pc-metric-detail.is-open').forEach((panel) => {
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
      });
      root.querySelectorAll('.pc-metric-info').forEach((b) => {
        b.setAttribute('aria-expanded', 'false');
        b.classList.remove('is-active');
      });
    }

    function animateMetricDetailArc(panel) {
      const arc = panel?.querySelector('.pc-metric-detail-arc');
      if (!arc) return;
      const target = parseFloat(arc.getAttribute('data-offset'));
      if (!Number.isFinite(target)) return;
      arc.style.strokeDashoffset = String(2 * Math.PI * 44);
      requestAnimationFrame(() => {
        arc.style.strokeDashoffset = String(target);
      });
    }

    root.querySelectorAll('.pc-metric-info').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.getAttribute('data-pc-metric-key');
        const item = btn.closest('.pc-metric-legend-item');
        const panel = item?.querySelector('.pc-metric-detail');
        if (!key || !panel) return;

        const wasOpen = panel.classList.contains('is-open');
        closeAllMetricDetails();
        if (!wasOpen) {
          panel.setAttribute('aria-hidden', 'false');
          requestAnimationFrame(() => {
            panel.classList.add('is-open');
            btn.setAttribute('aria-expanded', 'true');
            btn.classList.add('is-active');
            animateMetricDetailArc(panel);
          });
        }
      });
    });

    root.querySelectorAll('.pc-acc-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-pc-open');
        if (!key || typeof openSectionModal !== 'function' || typeof getReportData !== 'function') return;
        const titles = {
          ai: 'AI Insights',
          length: 'Ball length analysis',
          deliveries: 'Deliveries',
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
      alert('No session analysis available yet. Run the pipeline first.');
      return;
    }

    injectStyles();

    const data = prepareReportData(appState, analysis);

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