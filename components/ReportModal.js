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
    HEAD_LATERAL_DRIFT:   { label:'Head drifting sideways',     color:'#EF4444', desc:'Lateral head movement off the rotational axis during the swing.' },
    HEAD_VERTICAL_DRIFT:  { label:'Head lifting/dropping',      color:'#F97316', desc:'Sharp vertical head movement at contact on a drive-type shot.' },
    HEAD_DUCKING_PULL:    { label:'Ducking the pull',           color:'#EF4444', desc:'Head dropping through the pull instead of staying level to the ball.' },
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
    LOW_WEIGHT_TRANSFER:  { label:'Low weight transfer',        color:'#EF4444', desc:'Hips not driving toward the ball on front-foot drives.' },
    OVER_COMMITTED:       { label:'Over-committed (lunge)',       color:'#CA8A04', desc:'Excessive hip shift — vulnerable to balls that hold up.' },
    SPINE_COLLAPSE:       { label:'Spine collapse',             color:'#CA8A04', desc:'Upper body crouching into contact — shape and control suffer.' },
    STIFF_LEGGED:         { label:'Stiff legs',                 color:'#64748B', desc:'Little knee flex at setup — reduced athletic readiness.' },
  };

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
      },
      flagsSummary: {
        HEAD_LATERAL_DRIFT_count: flags.HEAD_LATERAL_DRIFT_count ?? 0,
        HEAD_VERTICAL_DRIFT_count: flags.HEAD_VERTICAL_DRIFT_count ?? 0,
        HEAD_DUCKING_PULL_count: flags.HEAD_DUCKING_PULL_count ?? 0,
        STANCE_ASYMMETRIC_count: flags.STANCE_ASYMMETRIC_count ?? 0,
        ELBOW_COLLAPSE_count: flags.ELBOW_COLLAPSE_count ?? 0,
        ELBOW_REACHING_count: flags.ELBOW_REACHING_count ?? 0,
        ELBOW_BEHIND_PAD_count: flags.ELBOW_BEHIND_PAD_count ?? 0,
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
    const bars = [
      { label: 'Head position', value: headQ, max: 100, color: '#6C63FF', unit: '/100', desc: 'Shot-type-conditioned head quality (lateral vs vertical axes).' },
      { label: 'Foot movement', value: fwQ, max: 100, color: '#06B6D4', unit: '/100', desc: 'Pre-shot foot activity and front-foot plant timing vs contact.' },
      { label: 'Batting stance', value: symQ, max: 100, color: '#10B981', unit: '/100', desc: 'Shoulder and hip tilt symmetry in the pre-shot window.' },
      { label: 'Swing intensity', value: swQ, max: 100, color: '#EAB308', unit: '/100', desc: 'Session-normalized bat-path effort (rolling peak velocity).' },
      { label: 'Bat Speed', value: (shot.peak_swing_speed || 0).toFixed(1), max: 140, color: '#17B890', unit: 'km/h', desc: 'Bat tip speed in km/h — calibrated using shoulder-width pixel ruler at 30fps.' },
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
          <div class="rp-shot-submetrics">${subHead}</div>
          <div class="rp-shot-submetrics rp-shot-submetrics--posture">${subPosture}</div>
        </div>
        <div class="rp-shot-score-row">
          <span class="rp-bar-label">Shot Execution Rating</span>
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
        icon: '💫', color: '#EAB308', title: 'Swing intensity',
        what: 'How hard you swing through the ball (0–100), normalized within this session so effort is comparable shot to shot.',
        how: 'P90 of a short rolling mean of bilateral wrist velocity in the swing window, scaled to the session max.',
        tip: 'If intensity drops late in the net, check fatigue or rushing the trigger movement.',
      },
      {
        icon: '💥', color: '#F97316', title: 'Bat speed (km/h)',
        what: 'Estimated bat-tip speed in km/h for session performance tracking.',
        how: 'Converted from pose-derived wrist motion using shoulder-width calibration and a bat-tip multiplier.',
        tip: 'Use bat speed alongside swing intensity and timing — speed without head position rarely holds up in the middle.',
      },
      {
        icon: '🏏', color: '#EF4444', title: 'Shot execution rating (/10)',
        what: 'Composite from head (35%), footwork (25%), stance symmetry (15%), elbow shape (~25% band), swing intensity (10%).',
        how: 'Elbow collapse/reaching and sweep elbow-behind-pad feed into the elbow band; scaled to /10.',
        tip: 'Fix the lowest-contributing band first — often head axis, feet, or stance symmetry.',
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
        <p class="rp-coach-text"><strong>Why it matters:</strong> Head position, feet, stance, and swing intensity look consistent with your shot mix.</p>
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
  max-width: 100%;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  -webkit-overflow-scrolling: touch;
}
.rp-shots-table { width: 100%; min-width: 920px; border-collapse: separate; border-spacing: 0; font-family: Inter,sans-serif; }
.rp-shots-table thead tr { background: linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%); text-align: left; }
.rp-shots-table thead th {
  position: sticky; top: 0; z-index: 1;
  padding: 12px 10px;
  font-size: 0.68rem;
  color: #64748B;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-bottom: 1px solid rgba(15,23,42,0.08);
  white-space: nowrap;
}
.rp-shots-table tbody tr:nth-child(even) { background: rgba(248,250,252,0.65); }
.rp-shots-table tbody tr:hover { background: rgba(6,182,212,0.06); }
.rp-shots-table td { padding: 12px 10px; font-size: 0.82rem; color: #334155; border-top: 1px solid rgba(0,0,0,0.05); vertical-align: top; }
.rp-shots-table td.rp-col-num { font-family: JetBrains Mono,monospace; font-weight: 700; color: #0F172A; width: 2.5rem; }
.rp-shots-table td.rp-col-shot { font-weight: 700; letter-spacing: 0.04em; color: #0F172A; min-width: 8.5rem; }
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
    const summary = getAnalysisSummary(analysis);
    const best  = analysis.best_shot || {};
    const worst = analysis.worst_shot || {};
    const alerts = analysis.coaching_alerts || [];
    const stance = data.stance || 'RHB';

    const confirmedShots = shots.filter(s => Number(s.conf ?? s.confidence) > 0.5);
    const totalShots = confirmedShots.length;
    const confirmedCount = summary.shotsConfirmed || totalShots;
    const avgSpeed = summary.avgSpeed != null ? Number(summary.avgSpeed).toFixed(1) : '—';
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
    const avSi = summary.avgSwingIntensity != null ? Math.round(summary.avgSwingIntensity) : null;
    const metricBits = [];
    if (avHead != null) metricBits.push(`Head ${avHead}`);
    if (avStab != null) metricBits.push(`Stance ${avStab}`);
    if (avFw != null) metricBits.push(`Feet ${avFw}`);
    if (avSi != null) metricBits.push(`Swing ${avSi}`);
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
              <div class="rp-title">Net Session Report</div>
              <div class="rp-subtitle">${summary.shotsConfirmed || totalShots} confirmed shots &nbsp;·&nbsp; Avg Speed: ${avgSpeed} km/h &nbsp;·&nbsp; Avg Score: ${avgScore}/10 ${usage ? `&nbsp;·&nbsp; ${usage}` : ''}</div>
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
          <button class="rp-tab" data-tab="trends">Scoring Zones</button>
          <button class="rp-tab" data-tab="metrics">Coaching Focus</button>
        </div>

        <!-- Body -->
        <div class="rp-body" id="rpBody">

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
                ${buildPieChart(Math.round(summary.avgSwingIntensity || 0), '#EAB308', 'Swing intensity', 'Session-normalized swing effort (0–100)')}
              </div>
              <div class="rp-pie-card">
                ${buildPieChart(Math.round((Number(avgScore) || 0) * 10), '#FAAD14', 'Shot execution', `${avgScore}/10 across confirmed deliveries`)}
              </div>
            </div>
            <div class="rp-speed-note">
              <div class="rp-speed-note-title">Avg Bat Speed: ${avgSpeed} km/h</div>
              <div class="rp-speed-note-range">Range this session: ${confirmedShots.length ? Math.min(...confirmedShots.map(s => Number(s.peak_swing_speed || 0))).toFixed(1) : '—'} – ${confirmedShots.length ? Math.max(...confirmedShots.map(s => Number(s.peak_swing_speed || 0))).toFixed(1) : '—'} km/h</div>
              <div class="rp-speed-note-sub">Bat speed is shown alongside the five core scores; coaching flags and plain-language cues sit in <strong>All Deliveries</strong>.</div>
            </div>

            <div class="rp-section-title">Today's Coaching Focus</div>
            <div class="rp-shots-grid">${buildCoachingFocus(alerts)}</div>
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
                    <th>Execution</th>
                    <th>Head position</th>
                    <th>Batting stance</th>
                    <th>Foot movement</th>
                    <th>Swing intensity</th>
                    <th>Bat speed</th>
                    <th>Coaching flags &amp; cues</th>
                  </tr>
                </thead>
                <tbody>
                  ${confirmedShots.map((s) => {
                    const head = s.head_quality_score != null ? Math.round(s.head_quality_score) : null;
                    const stab = s.symmetry_score != null ? Math.round(s.symmetry_score) : null;
                    const fw = s.footwork_score != null ? Math.round(s.footwork_score) : null;
                    const sw = s.swing_intensity != null ? Math.round(s.swing_intensity) : null;
                    const flagRows = [];
                    for (const f of s.flags || []) {
                      const base = String(f).split(':')[0];
                      const fi = FLAG_INFO[base] || { label: base.replace(/_/g, ' '), color: '#64748B', desc: '' };
                      flagRows.push({ label: fi.label, color: fi.color, desc: fi.desc || '' });
                    }
                    if (s.footwork_flag) {
                      const ff = String(s.footwork_flag);
                      const fi = FLAG_INFO[ff] || { label: ff.replace(/_/g, ' '), color: '#64748B', desc: '' };
                      flagRows.push({ label: fi.label, color: fi.color, desc: fi.desc || '', soft: true });
                    }
                    const chips = flagRows.length
                      ? flagRows.map((r) => `<span class="rp-shots-chip${r.soft ? ' rp-shots-chip--soft' : ''}" style="background:${r.color}18;color:${r.color}">${escapeHtml(r.label)}</span>`).join('')
                      : '<span class="rp-shots-chip" style="background:rgba(16,185,129,0.12);color:#059669;font-weight:700">Clean delivery</span>';
                    const flagDetails = flagRows.length
                      ? flagRows.map((r) => `<div class="rp-shots-detail-text"><strong style="color:${r.color}">${escapeHtml(r.label)}:</strong> ${escapeHtml(r.desc || 'Technical note from the analyser.')}</div>`).join('')
                      : '<div class="rp-shots-detail-text">No coaching flags on this delivery.</div>';
                    const speed = Number(s.peak_swing_speed || 0);
                    const speedText = speed >= 140 ? '~140+' : speed.toFixed(1);
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
                      <td>${formatDeliveryMetric100(sw, s.swing_intensity_label)}</td>
                      <td style="font-family:JetBrains Mono,monospace;font-size:0.84rem;font-weight:600;white-space:nowrap">${speedText} km/h</td>
                      <td class="rp-col-flags">
                        <div class="rp-flag-stack">${chips}</div>
                        <details class="rp-shots-detail"><summary>▶ Coaching detail</summary>
                          ${flagDetails}
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
            ${buildLineGraph(trendShots, 'swing_intensity', '#EAB308', 'Swing intensity (0–100)', 100)}
            ${buildLineGraph(trendShots, 'speed', '#17B890', 'Bat speed (km/h)', 140)}
            ${buildLineGraph(trendShots, 'score', '#FAAD14', 'Shot execution rating (/10)', 10)}
            ${summary.shotsConfirmed >= 6 ? `
              <div class="rp-trend-summary">
                <div class="rp-trend-summary-title">Session Momentum (1st vs 2nd Half)</div>
                <div class="rp-trend-summary-body">
                  Head position: ${Math.round(summary.trend.first_half_head_quality_score || 0)} → ${Math.round(summary.trend.second_half_head_quality_score || 0)}<br/>
                  Batting stance: ${Math.round(summary.trend.first_half_symmetry_score || 0)} → ${Math.round(summary.trend.second_half_symmetry_score || 0)}<br/>
                  Foot movement: ${Math.round(summary.trend.first_half_footwork_score || 0)} → ${Math.round(summary.trend.second_half_footwork_score || 0)}<br/>
                  Swing intensity: ${Math.round(summary.trend.first_half_swing_intensity || 0)} → ${Math.round(summary.trend.second_half_swing_intensity || 0)}<br/>
                  Bat speed: ${Math.round(summary.trend.first_half_speed || 0)} → ${Math.round(summary.trend.second_half_speed || 0)} km/h
                </div>
                ${summary.fatigue ? '<div class="rp-trend-summary-note">Swing intensity or bat speed dipped in the second half — check fatigue or rushing the trigger.</div>' : ''}
              </div>` : ''}
          </div>

          <!-- ═══ METRICS ═══ -->
          <div data-panel="metrics" style="display:none">
            <div class="rp-section-title">Coaching Focus Playbook</div>
            <p style="font-family:Inter,sans-serif;font-size:0.82rem;color:#64748B;margin-bottom:20px;line-height:1.55">
              Cricket-first interpretation: read dominant hand, head position, base stability, and scoring arc together before setting work-on drills.
            </p>
            <p style="font-family:Inter,sans-serif;font-size:0.78rem;color:#94A3B8;margin:-8px 0 16px;line-height:1.5">
              ${confirmedCount > 0
                ? `${confirmedCount} of ${confirmedCount} shots confirmed (confidence filter at 60%).`
                : 'No shots met the confirmation threshold (60%).'}
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