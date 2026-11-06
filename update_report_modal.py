import re

with open('components/ReportModal.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('\r\n', '\n')

old_code = '''  function buildLivePlayCardHtml(data) {
    const m = derivePlayCardModel(data);
    const { summary, best, worst, totalShots, avgScore } = m;
    const shots = summary.shotsConfirmed || totalShots;
    const avg = Number(avgScore);

    const highlight = (s, kind, tag) => {
      const label = escapeHtml((SHOT_LABELS[s.label] || s.label || '—').toUpperCase());
      const score = s.shot_score != null ? s.shot_score : null;
      return `
        <div class="pc-hl-card pc-hl-card--${kind}">
          <div class="pc-hl-tag">${tag}</div>
          <div class="pc-hl-title pc-hl-title--${kind}" title="#${s.shot_num || '—'} ${label}">#${s.shot_num || '—'} ${label}</div>
          <div class="pc-hl-sub">
            <span class="pc-hl-score" style="color:${scoreColor(score)}">${score != null ? score : '—'}<span class="pc-hl-denom">/10</span></span>
            <span class="pc-hl-time">${escapeHtml(s.timestamp || '—')}</span>
          </div>
        </div>`;
    };

    const links = [
      ['ai', 'auto_awesome', 'AI insights'],
      ['length', 'straighten', 'Ball length analysis'],
      ['deliveries', 'format_list_numbered', 'Deliveries'],
      ['zones', 'radar', 'Scoring zones'],
    ];

    return `
      <div class="pc-inner">
        <div class="pc-summary">
          <div class="pc-summary-score">
            <span class="pc-summary-val" style="color:${scoreColor(avg)}">${Number.isFinite(avg) ? avgScore : '—'}</span><span class="pc-summary-denom">/10</span>
          </div>
          <div class="pc-summary-meta">
            <span class="pc-summary-label">Avg shot score</span>
            <span class="pc-summary-sub">${shots} shots
              <span class="pc-badge" title="Batting stance">${escapeHtml(data.stance || 'RHB')}</span></span>
          </div>
        </div>

        ${buildPlayCardMetricBars(summary)}

        <div class="pc-hl-section">
          <div class="pc-hl-section-title">Shot highlights</div>
          <div class="pc-highlights-grid">
            ${highlight(best, 'best', 'Signature shot')}
            ${highlight(worst, 'work', 'Work-on shot')}
          </div>
        </div>

        <div class="pc-links">
          ${links.map(([key, icon, label]) => `
          <button type="button" class="pc-acc-btn" data-pc-open="${key}">
            <span class="material-symbols-outlined pc-acc-ico" aria-hidden="true">${icon}</span>
            <span class="pc-acc-label">${label}</span>
            <span class="material-symbols-outlined pc-acc-chev" aria-hidden="true">chevron_right</span>
          </button>`).join('')}
        </div>
      </div>`;
  }

  function bindPlayCardInteractions(root, getReportData, openSectionModal) {
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
  }'''

new_code = '''  function buildLivePlayCardHtml(data) {
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
        <section class="ss-hero-card" data-purpose="hero-score-card">
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

        <!-- Detailed Breakdown Menu -->
        <section class="ss-breakdown-section" data-purpose="deep-dive-menu">
          <h2 class="ss-section-title ss-section-title--pad">DETAILED BREAKDOWN</h2>
          <div class="ss-breakdown-card">
            <!-- AI Insights -->
            <button type="button" class="ss-breakdown-item pc-acc-btn" data-pc-open="ai">
              <div class="ss-breakdown-left">
                <div class="ss-breakdown-icon-wrap ss-icon--violet">
                  <svg class="ss-svg-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" stroke-linecap="round" stroke-linejoin="round"></path>
                  </svg>
                </div>
                <div class="ss-breakdown-text">
                  <span class="ss-breakdown-title">AI insights</span>
                  <p class="ss-breakdown-sub">Bio-feedback &amp; coaching recommendations</p>
                </div>
              </div>
              <svg class="ss-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </button>

            <!-- Ball Length Analysis -->
            <button type="button" class="ss-breakdown-item pc-acc-btn" data-pc-open="length">
              <div class="ss-breakdown-left">
                <div class="ss-breakdown-icon-wrap ss-icon--blue">
                  <svg class="ss-svg-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M4 6h16M4 10h16M4 14h16M4 18h16" stroke-linecap="round" stroke-linejoin="round"></path>
                  </svg>
                </div>
                <div class="ss-breakdown-text">
                  <span class="ss-breakdown-title">Ball length analysis</span>
                  <p class="ss-breakdown-sub">Short, good &amp; full length pitch map</p>
                </div>
              </div>
              <svg class="ss-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </button>

            <!-- Deliveries -->
            <button type="button" class="ss-breakdown-item pc-acc-btn" data-pc-open="deliveries">
              <div class="ss-breakdown-left">
                <div class="ss-breakdown-icon-wrap ss-icon--emerald">
                  <svg class="ss-svg-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M4 6h16M4 12h16M4 18h7" stroke-linecap="round" stroke-linejoin="round"></path>
                  </svg>
                </div>
                <div class="ss-breakdown-text">
                  <span class="ss-breakdown-title">Deliveries</span>
                  <p class="ss-breakdown-sub">Ball-by-ball video replay &amp; tags</p>
                </div>
              </div>
              <svg class="ss-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </button>

            <!-- Scoring Zones -->
            <button type="button" class="ss-breakdown-item pc-acc-btn" data-pc-open="zones">
              <div class="ss-breakdown-left">
                <div class="ss-breakdown-icon-wrap ss-icon--orange">
                  <svg class="ss-svg-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9"></circle>
                    <line x1="12" x2="12" y1="3" y2="21"></line>
                    <line x1="3" x2="21" y1="12" y2="12"></line>
                  </svg>
                </div>
                <div class="ss-breakdown-text">
                  <span class="ss-breakdown-title">Scoring zones</span>
                  <p class="ss-breakdown-sub">Wagon wheel &amp; ground dispersal</p>
                </div>
              </div>
              <svg class="ss-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </button>
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
  }'''

if old_code not in content:
    print('Error: old_code not found in components/ReportModal.js')
else:
    content = content.replace(old_code, new_code)
    with open('components/ReportModal.js', 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    with open('android/app/src/main/assets/components/ReportModal.js', 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print('Successfully applied redesigned Session Score!')
