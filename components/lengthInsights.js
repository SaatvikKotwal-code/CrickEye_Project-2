/**
 * Ball length distribution + length-vs-performance for session report & compare UI.
 * Modern design scheme matching Net Session / Ball Length Analysis specs:
 *  - Hero Donut Overview Card (pitch overview badge, svg donut with active center, 3-col quick cards, weakest zone alert)
 *  - Where You Stood Out Card (high-contrast standout metric, session benchmark, coach tip takeaway)
 *  - Zone Breakdown Section (segmented tab pills, active zone card with score, counts, biomechanics & execution progress bars)
 * Fully responsive and bound to real session data.
 */
const CrickEyeLengthInsights = (() => {
  const LENGTH_ZONE_ORDER = ['full', 'good_length', 'short', 'yorker', 'full_toss'];

  /** Solid anchor colors matching the new mock design scheme. */
  const ZONE_COLORS = {
    full: '#00897B',
    good_length: '#37474F',
    short: '#F4511E',
    yorker: '#D97706',
    full_toss: '#EA580C',
  };

  /** Light tints for backgrounds / pills */
  const ZONE_LIGHT_BG = {
    full: 'rgba(0, 137, 123, 0.08)',
    good_length: 'rgba(55, 71, 79, 0.08)',
    short: 'rgba(244, 81, 30, 0.08)',
    yorker: 'rgba(217, 119, 6, 0.08)',
    full_toss: 'rgba(234, 88, 12, 0.08)',
  };

  const ZONE_BORDER = {
    full: 'rgba(0, 137, 123, 0.25)',
    good_length: 'rgba(55, 71, 79, 0.22)',
    short: 'rgba(244, 81, 30, 0.25)',
    yorker: 'rgba(217, 119, 6, 0.25)',
    full_toss: 'rgba(234, 88, 12, 0.25)',
  };

  /** [highlight, deep] for pie wedge gradients (center -> outer arc). */
  const ZONE_GRADIENTS = {
    full: ['#99F6E4', '#00897B'],
    good_length: ['#94A3B8', '#37474F'],
    short: ['#FFAB91', '#F4511E'],
    yorker: ['#FEF3C7', '#B45309'],
    full_toss: ['#FDBA74', '#C2410C'],
  };

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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

  function humanizeLength(key) {
    if (key == null || key === '') return '—';
    return String(key)
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  function confirmedBallDeliveries(ballAnalytics) {
    if (!ballAnalytics || !Array.isArray(ballAnalytics.deliveries)) return [];
    return ballAnalytics.deliveries.filter((d) => d.shot_confirmed !== false);
  }

  function lengthCountsFromDeliveries(ds) {
    const lc = {};
    ds.forEach((d) => {
      const dm = d.length && d.length.distance_m;
      const lab = normalizeLengthLabel((d.length && d.length.label) || 'full', dm);
      lc[lab] = (lc[lab] || 0) + 1;
    });
    const total = Object.values(lc).reduce((a, b) => a + b, 0);
    const segments = LENGTH_ZONE_ORDER.filter((k) => (lc[k] || 0) > 0).map((k) => ({
      key: k,
      label: humanizeLength(k),
      count: lc[k],
      color: ZONE_COLORS[k] || '#64748B',
      gradient: ZONE_GRADIENTS[k] || ['#CBD5E1', '#475569'],
    }));
    return { lc, total, segments };
  }

  function indexBallDeliveriesByShot(ballAnalytics) {
    const m = new Map();
    confirmedBallDeliveries(ballAnalytics).forEach((d) => {
      const id = d.display_num != null ? Number(d.display_num) : (d.shot_num != null ? Number(d.shot_num) : NaN);
      if (!Number.isFinite(id)) return;
      m.set(id, d);
    });
    return m;
  }

  function joinConfirmedShotsWithLength(confirmedShots, ballAnalytics) {
    const m = indexBallDeliveriesByShot(ballAnalytics);
    const out = [];
    (confirmedShots || []).forEach((s) => {
      const del = m.get(Number(s.shot_num));
      if (!del) return;
      const dm = del.length && del.length.distance_m;
      const lengthKey = normalizeLengthLabel((del.length && del.length.label) || 'full', dm);
      out.push({
        lengthKey,
        shot_num: s.shot_num,
        score: Number(s.shot_score) || 0,
        head: s.head_quality_score != null ? Number(s.head_quality_score) : null,
        symmetry: s.symmetry_score != null ? Number(s.symmetry_score) : null,
        footwork: s.footwork_score != null ? Number(s.footwork_score) : null,
        swing: s.swing_intensity != null ? Number(s.swing_intensity) : null,
        swingPath: s.swing_path_score != null ? Number(s.swing_path_score) : null,
        shotVsLength: s.execution_score != null ? Number(s.execution_score) : null,
      });
    });
    return out;
  }

  function meanFinite(arr) {
    const v = arr.filter((x) => x != null && Number.isFinite(x));
    if (!v.length) return null;
    return v.reduce((a, b) => a + b, 0) / v.length;
  }

  function formatDelta(val, digits = 1) {
    if (val == null || !Number.isFinite(val)) return '—';
    if (val > 0) return `+${val.toFixed(digits)}`;
    return val.toFixed(digits);
  }

  function zoneStatsFromJoined(joined) {
    const byKey = {};
    joined.forEach((j) => {
      if (!byKey[j.lengthKey]) byKey[j.lengthKey] = [];
      byKey[j.lengthKey].push(j);
    });
    const stats = [];
    LENGTH_ZONE_ORDER.forEach((key) => {
      const rows = byKey[key];
      if (!rows?.length) return;
      stats.push({
        key,
        label: humanizeLength(key),
        n: rows.length,
        exec: meanFinite(rows.map((r) => r.score)),
        head: meanFinite(rows.map((r) => r.head)),
        footwork: meanFinite(rows.map((r) => r.footwork)),
        swing: meanFinite(rows.map((r) => r.swing)),
        swingPath: meanFinite(rows.map((r) => r.swingPath)),
        shotVsLength: meanFinite(rows.map((r) => r.shotVsLength)),
      });
    });
    return stats;
  }

  function sessionMeansFromJoined(joined) {
    return {
      exec: meanFinite(joined.map((j) => j.score)),
      head: meanFinite(joined.map((j) => j.head)),
      footwork: meanFinite(joined.map((j) => j.footwork)),
      swing: meanFinite(joined.map((j) => j.swing)),
      swingPath: meanFinite(joined.map((j) => j.swingPath)),
      shotVsLength: meanFinite(joined.map((j) => j.shotVsLength)),
    };
  }

  function statusPillHtml(exec, sessionExec) {
    if (exec == null || !Number.isFinite(exec) || sessionExec == null || !Number.isFinite(sessionExec)) {
      return '<span class="rp-v3-pill rp-v3-pill--neutral">Bowled &amp; Ana.</span>';
    }
    const diff = exec - sessionExec;
    if (Math.abs(diff) <= 0.15) {
      return '<span class="rp-v3-pill rp-v3-pill--teal">On par</span>';
    }
    if (diff > 0.15) {
      return `<span class="rp-v3-pill rp-v3-pill--green">+${diff.toFixed(1)} vs avg</span>`;
    }
    return `<span class="rp-v3-pill rp-v3-pill--orange">vs ${sessionExec.toFixed(1)} avg</span>`;
  }

  /** Standout candidates for 'Where You Stood Out' card */
  const CANDIDATES = [
    { zoneKey: 'good_length', metric: 'shotVsLength', zlab: 'Good Length', mlab: 'Shot vs Length', kind: '100',
      cue: 'Pick the right shape for good length — defend straight or work the gap.' },
    { zoneKey: 'full', metric: 'shotVsLength', zlab: 'Full', mlab: 'Shot vs Length', kind: '100',
      cue: 'Drive when it is full — weight forward, clean bat swing through contact.' },
    { zoneKey: 'short', metric: 'footwork', zlab: 'Short', mlab: 'Footwork & Base', kind: '100',
      cue: 'Quick transfer onto the back foot gives time for pull and cut strokes.' },
    { zoneKey: 'short', metric: 'swingPath', zlab: 'Short', mlab: 'Swing Arc', kind: '100',
      cue: 'Pull/hook: stay tall with a smooth path through contact.' },
    { zoneKey: 'full', metric: 'head', zlab: 'Full', mlab: 'Head Quality', kind: '100',
      cue: 'Head aligned with line of the ball produces maximum control.' },
    { zoneKey: 'good_length', metric: 'footwork', zlab: 'Good Length', mlab: 'Foot Movement', kind: '100',
      cue: 'Decisive footwork sets the defensive foundation on good length.' },
    { zoneKey: 'full', metric: 'exec', zlab: 'Full', mlab: 'Session Score', kind: '10',
      cue: 'Dominant driving on full deliveries.' },
    { zoneKey: 'good_length', metric: 'exec', zlab: 'Good Length', mlab: 'Session Score', kind: '10',
      cue: 'Controlled defense and scoring off good length.' },
  ];

  function getMetricValue(st, metric) {
    if (!st) return null;
    return st[metric] != null ? st[metric] : null;
  }

  function buildStandoutSectionHtml(byKey, session) {
    let bestPick = null;
    let maxDelta = -999;

    CANDIDATES.forEach((cand) => {
      const st = byKey[cand.zoneKey];
      if (!st || st.n < 1) return;
      const v = getMetricValue(st, cand.metric);
      const sv = getMetricValue(session, cand.metric);
      if (v == null || sv == null) return;
      const delta = v - sv;
      if (delta > maxDelta) {
        maxDelta = delta;
        bestPick = { cand, v, sv, delta, st };
      }
    });

    // Fallback if no positive standout found: pick the highest scored metric
    if (!bestPick) {
      for (const cand of CANDIDATES) {
        const st = byKey[cand.zoneKey];
        if (st && st.n >= 1) {
          const v = getMetricValue(st, cand.metric);
          const sv = getMetricValue(session, cand.metric) || v;
          bestPick = { cand, v: v ?? 70, sv: sv ?? 70, delta: (v ?? 70) - (sv ?? 70), st };
          break;
        }
      }
    }

    if (!bestPick) {
      return '';
    }

    const { cand, v, sv, delta } = bestPick;
    const isTen = cand.kind === '10';
    const mainScore = isTen ? Number(v).toFixed(1) : Math.round(v);
    const denom = isTen ? '/ 10' : '/ 100';
    const avgScore = isTen ? Number(sv).toFixed(1) : Math.round(sv);
    const deltaStr = delta >= 0 ? `+${isTen ? delta.toFixed(1) : Math.round(delta)}` : `${isTen ? delta.toFixed(1) : Math.round(delta)}`;

    return `
      <!-- Where You Stood Out Section -->
      <section class="rp-v3-card rp-v3-standout">
        <div class="rp-v3-card-header">
          <div class="rp-v3-card-title-group">
            <div class="rp-v3-icon-badge rp-v3-icon-badge--orange">
              <svg class="rp-v3-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2"></path>
              </svg>
            </div>
            <h3 class="rp-v3-card-heading">Where You Stood Out</h3>
          </div>
          <span class="rp-v3-badge rp-v3-badge--green">
            ${escapeHtml(deltaStr)} vs Avg
          </span>
        </div>

        <div class="rp-v3-standout-body">
          <div class="rp-v3-standout-metric-col">
            <span class="rp-v3-pill-meta">${escapeHtml(cand.zlab)} • ${escapeHtml(cand.mlab)}</span>
            <div class="rp-v3-big-score-row">
              <span class="rp-v3-big-score">${escapeHtml(mainScore)}</span>
              <span class="rp-v3-big-score-denom">${denom}</span>
            </div>
          </div>
          <div class="rp-v3-standout-benchmark-col">
            <span class="rp-v3-benchmark-label">Session Benchmark</span>
            <span class="rp-v3-benchmark-val">${escapeHtml(avgScore)} <span class="rp-v3-benchmark-unit">avg</span></span>
          </div>
        </div>

        <div class="rp-v3-coach-tip">
          <div class="rp-v3-tip-icon">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path clip-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill-rule="evenodd"></path>
            </svg>
          </div>
          <p class="rp-v3-tip-text">
            <strong>Tip:</strong> ${escapeHtml(cand.cue)}
          </p>
        </div>
      </section>`;
  }

  /** Renders the Zone Breakdown Section with tabs and detailed progress bars */
  function buildZoneBreakdownSectionHtml(segments, byKey, session) {
    if (!segments.length) return '';

    // Active zone tabs: show full, good_length, short, and any others present
    const tabs = segments.map((seg, idx) => {
      const activeCls = idx === 0 ? ' rp-v3-tab--active' : '';
      return `
        <button type="button" class="rp-v3-tab${activeCls}" data-zone="${escapeHtml(seg.key)}" onclick="window.switchLengthZoneTab && window.switchLengthZoneTab(this, '${escapeHtml(seg.key)}')">
          ${escapeHtml(seg.label)}
        </button>`;
    }).join('');

    const cards = segments.map((seg, idx) => {
      const st = byKey[seg.key];
      const zc = ZONE_COLORS[seg.key] || '#00897B';
      const exec = st && st.exec != null ? st.exec : null;
      const scoreStr = exec != null ? exec.toFixed(1) : '—';
      const sessionExec = session.exec;
      const statusPill = statusPillHtml(exec, sessionExec);
      const isHidden = idx === 0 ? '' : ' style="display:none;"';

      const metricsList = [
        { label: 'Footwork', val: st ? st.footwork : null, col: '#00897B' },
        { label: 'Eyes on ball', val: st ? st.head : null, col: '#37474F' },
        { label: 'Swing arc', val: st ? st.swingPath : null, col: '#37474F' },
        { label: 'Intensity', val: st ? st.swing : null, col: '#37474F' },
        { label: 'Execution', val: st ? st.shotVsLength : null, col: '#F4511E' },
      ];

      const metricsHtml = metricsList.map((m) => {
        const val = m.val != null && Number.isFinite(m.val) ? Math.round(m.val) : null;
        const pct = val != null ? Math.min(100, Math.max(0, val)) : 0;
        const displayVal = val != null ? `${val} <span class="rp-v3-denom">/ 100</span>` : '<span class="rp-v3-denom">—</span>';
        return `
          <div class="rp-v3-metric-row">
            <div class="rp-v3-metric-head">
              <span class="rp-v3-metric-name">
                <span class="rp-v3-dot" style="background:${m.col}"></span>
                ${escapeHtml(m.label)}
              </span>
              <span class="rp-v3-metric-score">${displayVal}</span>
            </div>
            <div class="rp-v3-progress-track">
              <div class="rp-v3-progress-fill" style="width:${pct}%;background:${m.col}"></div>
            </div>
          </div>`;
      }).join('');

      return `
        <article class="rp-v3-card rp-v3-zone-detail-card" data-zone-panel="${escapeHtml(seg.key)}"${isHidden}>
          <div class="rp-v3-zone-card-top">
            <div>
              <div class="rp-v3-zone-title-row">
                <span class="rp-v3-badge" style="background:${ZONE_LIGHT_BG[seg.key] || '#F1F5F9'};color:${zc};border-color:${ZONE_BORDER[seg.key] || '#E2E8F0'}">
                  ${escapeHtml(seg.label)}
                </span>
                <span class="rp-v3-zone-counts-meta">Bowled: ${seg.count} • Analysed: ${st ? st.n : 0}</span>
              </div>
              <div class="rp-v3-zone-score-wrap">
                <span class="rp-v3-zone-score-num" style="color:${zc}">${scoreStr}</span>
                <span class="rp-v3-zone-score-denom">/10</span>
                <div class="rp-v3-zone-status">${statusPill}</div>
              </div>
            </div>
            <div class="rp-v3-zone-analysed-box">
              <span class="rp-v3-analysed-lbl">Analysed</span>
              <span class="rp-v3-analysed-val">${st ? st.n : 0} of ${seg.count}</span>
            </div>
          </div>

          <div class="rp-v3-zone-metrics-block">
            <h4 class="rp-v3-metrics-subhead">Biomechanics &amp; Execution</h4>
            <div class="rp-v3-metrics-list">
              ${metricsHtml}
            </div>
          </div>

          <div class="rp-v3-zone-footer-note">
            <svg class="rp-v3-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
            </svg>
            <p class="rp-v3-note-text">
              Simple view: shot execution tells if your stroke matched the ball length.
            </p>
          </div>
        </article>`;
    }).join('');

    return `
      <!-- Zone Breakdown Section -->
      <section class="rp-v3-breakdown-section">
        <div class="rp-v3-section-head">
          <h3 class="rp-v3-section-title">Zone Breakdown</h3>
          <p class="rp-v3-section-subtitle">Technical biomechanics &amp; shot metrics</p>
        </div>

        <div class="rp-v3-tab-bar" role="tablist">
          ${tabs}
        </div>

        <div class="rp-v3-panels-container">
          ${cards}
        </div>
      </section>`;
  }

  /** Main entry function to build complete Ball Length Section HTML */
  function buildLengthSectionHtml(opts) {
    const ballAnalytics = opts.ballAnalytics;
    const confirmedShots = opts.confirmedShots || [];
    const heading = opts.heading;
    const compact = Boolean(opts.compact);
    const showHeading = heading != null && String(heading).trim() !== '';

    const ds = confirmedBallDeliveries(ballAnalytics);
    const { total, segments } = lengthCountsFromDeliveries(ds);
    const joined = joinConfirmedShotsWithLength(confirmedShots, ballAnalytics);

    if (!total) {
      return `
        <div class="rp-v3-wrapper rp-v3-wrapper--empty">
          ${showHeading ? `<div class="rp-v3-head"><h3 class="rp-v3-title">${escapeHtml(heading)}</h3></div>` : ''}
          <div class="rp-v3-card" style="padding:28px 20px;text-align:center;">
            <p class="rp-v3-empty-text">No ball-tracking length data for this session yet.</p>
          </div>
        </div>`;
    }

    const byKeyPre = {};
    const stats = joined.length ? zoneStatsFromJoined(joined) : [];
    stats.forEach((s) => {
      byKeyPre[s.key] = s;
    });

    const session = joined.length ? sessionMeansFromJoined(joined) : {
      exec: null, head: null, footwork: null, swing: null,
      swingPath: null, shotVsLength: null,
    };

    // Calculate weakest zone
    let weakestSeg = null;
    let minExec = Infinity;
    segments.forEach((seg) => {
      const st = byKeyPre[seg.key];
      if (st && st.exec != null && st.n >= 1 && st.exec < minExec) {
        minExec = st.exec;
        weakestSeg = seg;
      }
    });

    // Active zone for center of donut
    const topSeg = segments.reduce((best, s) => (s.count > best.count ? s : best), segments[0]);
    const topPct = Math.round((topSeg.count / total) * 100);

    // SVG Donut Calculations (circ = 2 * PI * 38 ≈ 238.76)
    const circ = 238.76;
    let runningOffset = 0;
    const donutCircles = segments.map((seg) => {
      const segLen = (seg.count / total) * circ;
      const strokeDash = `${segLen.toFixed(2)} ${(circ - segLen).toFixed(2)}`;
      const strokeOffset = (-runningOffset).toFixed(2);
      runningOffset += segLen;
      const col = ZONE_COLORS[seg.key] || '#37474F';
      return `<circle class="rp-v3-donut-segment" cx="50" cy="50" fill="none" r="38" stroke="${col}" stroke-width="12" stroke-dasharray="${strokeDash}" stroke-dashoffset="${strokeOffset}"></circle>`;
    }).join('');

    // Quick zone summary cards (Grid of 3 columns, or horizontally wrapping for 4+)
    const quickCards = segments.map((seg) => {
      const st = byKeyPre[seg.key];
      const zc = ZONE_COLORS[seg.key] || '#37474F';
      const exec = st && st.exec != null ? st.exec : null;
      const sc = exec != null ? `${exec.toFixed(1)}<span class="rp-v3-quick-slash">/10</span>` : '—';
      const statusPill = statusPillHtml(exec, session.exec);
      const isTop = seg.key === topSeg.key;

      return `
        <div class="rp-v3-quick-card${isTop ? ' rp-v3-quick-card--top' : ''}" style="--zc:${zc};background:${ZONE_LIGHT_BG[seg.key] || '#F8FAFC'};border-color:${ZONE_BORDER[seg.key] || '#E2E8F0'}">
          <div class="rp-v3-quick-top">
            <span class="rp-v3-quick-dot" style="background:${zc}"></span>
            <span class="rp-v3-quick-label">${escapeHtml(seg.label)}</span>
          </div>
          <div class="rp-v3-quick-balls">${seg.count} ball${seg.count === 1 ? '' : 's'}</div>
          <div class="rp-v3-quick-score" style="color:${zc}">${sc}</div>
          <div class="rp-v3-quick-pill-wrap">
            ${statusPill}
          </div>
        </div>`;
    }).join('');

    // Weakest zone banner
    let alertBannerHtml = '';
    if (weakestSeg && minExec < (session.exec || 7.0)) {
      alertBannerHtml = `
        <div class="rp-v3-alert-banner">
          <svg class="rp-v3-alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2"></path>
          </svg>
          <span class="rp-v3-alert-text">
            ${escapeHtml(weakestSeg.label)} is your weakest zone this session (${minExec.toFixed(1)} vs ${session.exec ? session.exec.toFixed(1) : '7.0'} session avg).
          </span>
        </div>`;
    }

    const standoutHtml = buildStandoutSectionHtml(byKeyPre, session);
    const breakdownHtml = buildZoneBreakdownSectionHtml(segments, byKeyPre, session);

    return `
      <div class="rp-v3-container${compact ? ' rp-v3-container--compact' : ''}">
        ${showHeading ? `
          <div class="rp-v3-header-bar">
            <h2 class="rp-v3-main-title">${escapeHtml(heading)}</h2>
          </div>` : ''}

        <!-- Hero Donut Section -->
        <section class="rp-v3-card rp-v3-hero-donut">
          <div class="rp-v3-hero-head">
            <div class="rp-v3-hero-badge-row">
              <span class="rp-v3-badge rp-v3-badge--teal">
                <span class="rp-v3-badge-pulse"></span>
                Pitch Overview
              </span>
              <span class="rp-v3-balls-count">${total} ball${total === 1 ? '' : 's'} analyzed</span>
            </div>
            <p class="rp-v3-hero-desc">
              Each length zone shows how many balls you got there, and how your batting stacked up.
            </p>
          </div>

          <!-- Donut SVG Visualization -->
          <div class="rp-v3-donut-wrapper">
            <div class="rp-v3-donut-box">
              <svg class="rp-v3-donut-svg" viewBox="0 0 100 100">
                <!-- Background track circle -->
                <circle cx="50" cy="50" fill="none" r="38" stroke="#F1F5F9" stroke-width="12"></circle>
                <!-- Dynamic Segments -->
                ${donutCircles}
              </svg>
              <!-- Donut Center Badge -->
              <div class="rp-v3-donut-center">
                <span class="rp-v3-center-pill">Active Zone</span>
                <span class="rp-v3-center-title">${escapeHtml(topSeg.label.toUpperCase())}</span>
                <span class="rp-v3-center-sub">${topSeg.count} balls (${topPct}%)</span>
              </div>
            </div>
          </div>

          <!-- Quick Zone Summary Cards -->
          <div class="rp-v3-quick-grid">
            ${quickCards}
          </div>

          <!-- Weakest Zone Callout Banner -->
          ${alertBannerHtml}
        </section>

        <!-- Where You Stood Out Section -->
        ${standoutHtml}

        <!-- Zone Breakdown Section -->
        ${breakdownHtml}
      </div>`;
  }

  // Global helper for zone tab switching in Zone Breakdown section
  if (typeof window !== 'undefined') {
    window.switchLengthZoneTab = function(btn, zoneKey) {
      if (!btn) return;
      const section = btn.closest('.rp-v3-breakdown-section');
      if (!section) return;

      // Update tab active states
      section.querySelectorAll('.rp-v3-tab').forEach((t) => {
        t.classList.remove('rp-v3-tab--active');
      });
      btn.classList.add('rp-v3-tab--active');

      // Update card visibility
      section.querySelectorAll('.rp-v3-zone-detail-card').forEach((card) => {
        if (card.getAttribute('data-zone-panel') === zoneKey) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    };
  }

  return {
    LENGTH_ZONE_ORDER,
    ZONE_COLORS,
    ZONE_GRADIENTS,
    normalizeLengthLabel,
    humanizeLength,
    confirmedBallDeliveries,
    lengthCountsFromDeliveries,
    joinConfirmedShotsWithLength,
    buildLengthSectionHtml,
  };
})();
