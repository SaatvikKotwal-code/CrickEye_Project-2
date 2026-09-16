/**
 * Ball length distribution + length-vs-performance for session report & compare UI.
 * Depends on session replay shots + results.ball_analytics (same shapes as ballAnalytics.js).
 */
const CrickEyeLengthInsights = (() => {
  const LENGTH_ZONE_ORDER = ['yorker', 'full', 'good_length', 'short', 'full_toss'];

  /** Solid anchor colors (legend / fallbacks). */
  const ZONE_COLORS = {
    yorker: '#D97706',
    full: '#059669',
    good_length: '#EA580C',
    short: '#475569',
    full_toss: '#F97316',
  };

  /** [highlight, deep] for pie wedge gradients (center → outer arc). */
  const ZONE_GRADIENTS = {
    yorker: ['#FEF3C7', '#B45309'],
    full: ['#A7F3D0', '#047857'],
    good_length: ['#FED7AA', '#C2410C'],
    short: ['#E2E8F0', '#334155'],
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

  /** Execution delta vs session mean: pill for summary + detail tables. */
  function vsSessionPillHtml(execD) {
    if (execD == null || !Number.isFinite(execD)) return '—';
    if (Math.abs(execD) <= 0.1) {
      return '<span class="rp-length-vs-pill rp-length-vs-pill--grey">→ On par</span>';
    }
    const num = formatDelta(execD);
    const suffix = ` · ${num}`;
    if (execD > 0.1) {
      return `<span class="rp-length-vs-pill rp-length-vs-pill--green"><span class="rp-vs-full">▲ Better than avg${suffix}</span><span class="rp-vs-mobile">▲ Better ${num}</span></span>`;
    }
    return `<span class="rp-length-vs-pill rp-length-vs-pill--red"><span class="rp-vs-full">▼ Needs work${suffix}</span><span class="rp-vs-mobile">▼ Work ${num}</span></span>`;
  }

  /** Annular sector (donut wedge): outer R, inner r (both px). */
  function donutSegmentPath(cx, cy, R, rInner, a0, a1) {
    const sweep = a1 - a0;
    const large = Math.abs(sweep) > Math.PI ? 1 : 0;
    const x0o = cx + R * Math.cos(a0);
    const y0o = cy + R * Math.sin(a0);
    const x1o = cx + R * Math.cos(a1);
    const y1o = cy + R * Math.sin(a1);
    const x0i = cx + rInner * Math.cos(a0);
    const y0i = cy + rInner * Math.sin(a0);
    const x1i = cx + rInner * Math.cos(a1);
    const y1i = cy + rInner * Math.sin(a1);
    return `M ${x0o.toFixed(2)} ${y0o.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1o.toFixed(2)} ${y1o.toFixed(2)} L ${x1i.toFixed(2)} ${y1i.toFixed(2)} A ${rInner} ${rInner} 0 ${large} 0 ${x0i.toFixed(2)} ${y0i.toFixed(2)} Z`;
  }

  /**
   * Donut chart: solid zone colours, 2px white strokes, 40% inner radius.
   */
  function buildDonutSvg(segments, total, cx, cy, R) {
    if (!total || !segments.length) return '';
    const rInner = R * 0.4;
    const paths = [];
    let a0 = -Math.PI / 2;
    segments.forEach((seg) => {
      const sweep = (seg.count / total) * 2 * Math.PI;
      if (sweep < 1e-4) return;
      const a1 = a0 + sweep;
      const fill = ZONE_COLORS[seg.key] || seg.color || '#64748B';
      paths.push(
        `<path d="${donutSegmentPath(cx, cy, R, rInner, a0, a1)}" fill="${escapeHtml(fill)}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>`,
      );
      a0 = a1;
    });
    return paths.join('');
  }

  function mostBowledSegment(segments) {
    if (!segments || !segments.length) return null;
    return segments.reduce((best, s) => (s.count > best.count ? s : best), segments[0]);
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

  /** 0–100 metric: green / amber / red dot for table + card tint hints. */
  function hundredDotTier(v) {
    if (v == null || !Number.isFinite(v)) return 'mid';
    if (v > 60) return 'hi';
    if (v >= 35) return 'mid';
    return 'lo';
  }

  /** Shot score /10 bar colour. */
  function execBarTier(v) {
    if (v == null || !Number.isFinite(v)) return 'mid';
    if (v >= 7) return 'hi';
    if (v >= 4) return 'mid';
    return 'lo';
  }

  function zonePill(seg) {
    const col = ZONE_COLORS[seg.key] || seg.color || '#64748B';
    return `<span class="rp-length-pill" style="--zp:${escapeHtml(col)}">${escapeHtml(seg.label)}</span>`;
  }

  /** Zone summary (replaces pie legend): balls, your score, vs session. */
  function buildZoneSummaryTableHtml(segments, total, byKey, session, bestKey) {
    if (!total) return '';
    const rows = segments
      .map((seg) => {
        const st = byKey[seg.key];
        const execD =
          st && st.exec != null && session.exec != null ? st.exec - session.exec : null;
        const vsHtml = vsSessionPillHtml(execD);
        const sc =
          st && st.exec != null ? `${st.exec.toFixed(1)}<span class="rp-length-slash">/10</span>` : '—';
        let scoreCls = 'rp-length-sum-score';
        if (st && st.exec != null && session.exec != null) {
          if (st.exec > session.exec) scoreCls += ' rp-length-sum-score--up';
          else if (st.exec < session.exec) scoreCls += ' rp-length-sum-score--down';
        }
        const rowCls =
          bestKey && seg.key === bestKey ? 'rp-length-sum-tr rp-length-sum-tr--best' : 'rp-length-sum-tr';
        return `<tr class="${rowCls}">
          <td>${zonePill(seg)}</td>
          <td class="rp-length-sum-n">${seg.count}</td>
          <td class="${scoreCls}">${sc}</td>
          <td class="rp-length-sum-vs">${vsHtml}</td>
        </tr>`;
      })
      .join('');
    return `
      <div class="rp-length-sum-wrap">
        <table class="rp-length-sum-table" aria-label="Length zone summary">
          <thead>
            <tr>
              <th class="rp-th-zone">Zone</th>
              <th class="rp-th-balls">Balls</th>
              <th class="rp-th-score"><span class="rp-th-full">Your score</span><span class="rp-th-mobile">Score</span></th>
              <th class="rp-th-vs"><span class="rp-th-full">BETTER OR WORSE THAN USUAL?</span><span class="rp-th-mobile">VS USUAL</span></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  const STANDOUT_CARDS = [
    { zoneKey: 'good_length', metric: 'shotVsLength', zlab: 'GOOD LENGTH', mlab: 'SHOT VS LENGTH', kind: '100',
      cue: 'Pick the right shape for good length — defend straight or work the gap' },
    { zoneKey: 'short', metric: 'head', zlab: 'SHORT', mlab: 'HEAD QUALITY', kind: '100',
      cue: 'Eyes off early on the short ball — watch it longer' },
    { zoneKey: 'short', metric: 'swingPath', zlab: 'SHORT', mlab: 'SWING PATH', kind: '100',
      cue: 'Pull/hook: stay tall with a smooth path through contact' },
    { zoneKey: 'full', metric: 'shotVsLength', zlab: 'FULL', mlab: 'SHOT VS LENGTH', kind: '100',
      cue: 'Drive when it is full — weight forward and full face' },
    { zoneKey: 'full', metric: 'swingPath', zlab: 'FULL', mlab: 'SWING PATH', kind: '100',
      cue: 'Tempo drops on the fuller ball — stay through it' },
    { zoneKey: 'short', metric: 'exec', zlab: 'SHORT', mlab: 'SESSION SCORE', kind: '10',
      cue: 'Short ball is your weakest zone this session' },
  ];

  function zoneMetric(st, metric) {
    if (!st) return null;
    if (metric === 'head') return st.head;
    if (metric === 'footwork') return st.footwork;
    if (metric === 'swing') return st.swing;
    if (metric === 'swingPath') return st.swingPath;
    if (metric === 'shotVsLength') return st.shotVsLength;
    if (metric === 'exec') return st.exec;
    return null;
  }

  function sessionMetric(session, metric) {
    if (metric === 'head') return session.head;
    if (metric === 'footwork') return session.footwork;
    if (metric === 'swing') return session.swing;
    if (metric === 'swingPath') return session.swingPath;
    if (metric === 'shotVsLength') return session.shotVsLength;
    if (metric === 'exec') return session.exec;
    return null;
  }

  function buildStandoutCardsHtml(byKey, session) {
    const cards = STANDOUT_CARDS.map((def) => {
      const st = byKey[def.zoneKey];
      const col = ZONE_COLORS[def.zoneKey] || '#64748B';
      const v = st ? zoneMetric(st, def.metric) : null;
      const sv = sessionMetric(session, def.metric);
      let main = '—';
      let sub = '';
      let tint = 'rp-length-card--muted';
      let up = null;

      if (st && st.n >= 1 && v != null && Number.isFinite(v)) {
        if (def.kind === 'kmh') {
          main = `${Number(v).toFixed(1)} <span class="rp-length-card-unit">km/h</span>`;
          sub =
            sv != null && Number.isFinite(sv)
              ? `vs ${Number(sv).toFixed(1)} km/h session avg`
              : '';
          up = sv != null ? v > sv : null;
        } else if (def.kind === '100') {
          main = `${Math.round(v)}<span class="rp-length-card-denom">/100</span>`;
          sub =
            sv != null && Number.isFinite(sv)
              ? `vs ${Math.round(sv)} session avg`
              : '';
          up = sv != null ? v > sv : null;
        } else if (def.kind === '10') {
          main = `${Number(v).toFixed(1)}<span class="rp-length-card-denom">/10</span>`;
          sub =
            sv != null && Number.isFinite(sv)
              ? `vs ${Number(sv).toFixed(1)} session avg`
              : '';
          up = sv != null ? v > sv : null;
        }
        if (up === true) tint = 'rp-length-card--up';
        else if (up === false) tint = 'rp-length-card--down';
        else tint = 'rp-length-card--flat';
      } else {
        main = '<span class="rp-length-card-na">Not enough balls here</span>';
        sub = '';
      }

      return `<div class="rp-length-card ${tint}" style="--zc:${escapeHtml(col)}">
        <div class="rp-length-card-k">${escapeHtml(def.zlab)} <span class="rp-length-card-dot">•</span> ${escapeHtml(def.mlab)}</div>
        <div class="rp-length-card-main" style="color:${escapeHtml(col)}">${main}</div>
        ${sub ? `<div class="rp-length-card-sub">${escapeHtml(sub)}</div>` : ''}
        <div class="rp-length-card-cue">${escapeHtml(def.cue)}</div>
      </div>`;
    }).join('');
    return `
      <div class="rp-length-standout">
        <div class="rp-length-standout-head">Where you stood out</div>
        <div class="rp-length-card-grid">${cards}</div>
      </div>`;
  }

  function metricCellHtml(v) {
    if (v == null || !Number.isFinite(v)) {
      return '<span class="rp-length-metric-na">—</span>';
    }
    const n = Math.round(v);
    const tier = hundredDotTier(v);
    return `<span class="rp-length-metric-wrap"><span class="rp-length-metric-num">${n}</span><span class="rp-length-tier-dot rp-length-tier-dot--${tier}" aria-hidden="true"></span></span>`;
  }

  function scoreCellHtml(exec, session) {
    if (exec == null || !Number.isFinite(exec)) {
      return '<span class="rp-length-metric-na">—</span>';
    }
    const tier = execBarTier(exec);
    const pct = Math.min(100, Math.max(0, (exec / 10) * 100));
    let numCls = 'rp-length-yourscore-num';
    if (session.exec != null) {
      if (exec > session.exec) numCls += ' rp-length-yourscore-num--up';
      else if (exec < session.exec) numCls += ' rp-length-yourscore-num--down';
    }
    return `<div class="rp-length-yourscore">
      <span class="${numCls}">${exec.toFixed(1)}<span class="rp-length-slash">/10</span></span>
      <div class="rp-length-minibar" aria-hidden="true"><span class="rp-length-minibar-fill rp-length-minibar-fill--${tier}" style="width:${pct.toFixed(0)}%"></span></div>
    </div>`;
  }

  function vsSessionCellHtml(execD) {
    return vsSessionPillHtml(execD);
  }

  /** Detail table + zone summary + standout cards. */
  function buildInsightBlocks(joined, segments, total) {
    const byKeyPre = {};
    const stats = joined.length ? zoneStatsFromJoined(joined) : [];
    stats.forEach((s) => {
      byKeyPre[s.key] = s;
    });
    const session = joined.length ? sessionMeansFromJoined(joined) : {
      exec: null, head: null, footwork: null, swing: null,
      swingPath: null, shotVsLength: null,
    };

    let bestKey = null;
    let bestExec = -Infinity;
    stats.forEach((s) => {
      if (s.exec != null && s.n >= 1 && s.exec > bestExec) {
        bestExec = s.exec;
        bestKey = s.key;
      }
    });

    const zoneSummaryHtml = buildZoneSummaryTableHtml(segments, total, byKeyPre, session, bestKey);
    const standoutHtml = buildStandoutCardsHtml(byKeyPre, session);

    const tableRows = segments
      .map((seg) => {
        const st = byKeyPre[seg.key];
        const execD =
          st && st.exec != null && session.exec != null ? st.exec - session.exec : null;
        const zc = ZONE_COLORS[seg.key] || '#64748B';
        return `<tr class="rp-length-zone-tr" style="--zrow:${escapeHtml(zc)}">
          <td>${zonePill(seg)}</td>
          <td>${seg.count}</td>
          <td>${st ? st.n : '—'}</td>
          <td>${scoreCellHtml(st ? st.exec : null, session)}</td>
          <td class="rp-length-td-vs">${vsSessionCellHtml(execD)}</td>
          <td>${metricCellHtml(st ? st.head : null)}</td>
          <td>${metricCellHtml(st ? st.footwork : null)}</td>
          <td>${metricCellHtml(st ? st.swingPath : null)}</td>
          <td>${metricCellHtml(st ? st.shotVsLength : null)}</td>
          <td>${metricCellHtml(st ? st.swing : null)}</td>
        </tr>`;
      })
      .join('');

    const tableHtml = `
      <div class="rp-length-table-wrap rp-length-table-wrap--v2">
        <table class="rp-length-zone-table rp-length-zone-table--v2">
          <thead>
            <tr>
              <th>Zone</th>
              <th>Balls bowled</th>
              <th>Balls analysed</th>
              <th>Your score</th>
              <th>BETTER OR WORSE THAN USUAL?</th>
              <th>Eyes on ball</th>
              <th>Footwork</th>
              <th>Swing arc</th>
              <th>Shot execution</th>
              <th>Swing intensity</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p class="rp-length-table-footer">Simple view: shot execution tells if your stroke matched the ball length.</p>
      </div>`;

    return { zoneSummaryHtml, standoutHtml, tableHtml };
  }

  /**
   * @param {object} opts
   * @param {object|null} opts.ballAnalytics
   * @param {Array} opts.confirmedShots
   * @param {string|null} [opts.heading] — null/empty hides title block (e.g. report tab wrapper supplies title).
   * @param {boolean} [opts.compact]
   */
  function buildLengthSectionHtml(opts) {
    const ballAnalytics = opts.ballAnalytics;
    const confirmedShots = opts.confirmedShots || [];
    const heading = opts.heading;
    const compact = Boolean(opts.compact);
  const hideStandout = Boolean(opts.hideStandout);
    const showHeading = heading != null && String(heading).trim() !== '';

    const ds = confirmedBallDeliveries(ballAnalytics);
    const { total, segments } = lengthCountsFromDeliveries(ds);
    const joined = joinConfirmedShotsWithLength(confirmedShots, ballAnalytics);

    const donutPx = compact ? 140 : 160;
    const cx = donutPx / 2;
    const cy = donutPx / 2;
    const R = compact ? 52 : 58;

    if (!total) {
      return `
        <div class="rp-length-section rp-length-section--empty${compact ? ' rp-length-section--compact' : ''}">
          ${showHeading ? `<div class="rp-length-head"><h3 class="rp-length-title">${escapeHtml(heading)}</h3></div>` : ''}
          <p class="rp-length-empty">No ball-tracking length data for this session yet.</p>
        </div>`;
    }

    const topSeg = mostBowledSegment(segments);
    const centerLines = topSeg
      ? String(topSeg.label)
          .toUpperCase()
          .split(/\s+/)
          .slice(0, 3)
      : ['—'];

    const pieInner = buildDonutSvg(segments, total, cx, cy, R);
    const shadowId = `rpLenSh_${Math.random().toString(36).slice(2, 9)}`;

    const donutSvg = `
      <div class="rp-length-donut-wrap">
        <svg class="rp-length-donut-svg" width="${donutPx}" height="${donutPx}" viewBox="0 0 ${donutPx} ${donutPx}" role="img" aria-label="Share of balls by length zone">
          <defs>
            <filter id="${shadowId}" x="-35%" y="-35%" width="170%" height="170%">
              <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.13"/>
            </filter>
          </defs>
          <g filter="url(#${shadowId})">${pieInner}</g>
          ${centerLines
            .map(
              (line, i) =>
                `<text class="rp-length-donut-center" x="${cx}" y="${cy + (i - (centerLines.length - 1) / 2) * 12}" text-anchor="middle" style="font-size:${centerLines.length > 1 ? 9 : 10}px">${escapeHtml(line)}</text>`,
            )
            .join('')}
        </svg>
      </div>`;

    const { zoneSummaryHtml, standoutHtml, tableHtml } = buildInsightBlocks(joined, segments, total);

    const sub = joined.length
      ? 'Each length zone shows how many balls you got there, and how your batting stacked up.'
      : 'Length mix uses every tracked ball. When your shot numbers line up with the ball track, the breakdown below fills in.';

    const headBlock = showHeading
      ? `<div class="rp-length-head"><h3 class="rp-length-title">${escapeHtml(heading)}</h3><p class="rp-length-sub">${escapeHtml(sub)}</p></div>`
      : `<p class="rp-length-sub rp-length-sub--tab">${escapeHtml(sub)}</p>`;

    const tableBlock = compact ? '' : tableHtml;
  const cardsBlock = compact || hideStandout ? '' : standoutHtml;

    return `
      <div class="rp-length-section rp-length-section--v2${compact ? ' rp-length-section--compact' : ''}">
        ${headBlock}
        <div class="rp-length-body rp-length-body--v2">
          ${donutSvg}
          <div class="rp-length-beside-donut">
            ${zoneSummaryHtml}
          </div>
        </div>
        ${cardsBlock}
        ${tableBlock}
      </div>`;
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
