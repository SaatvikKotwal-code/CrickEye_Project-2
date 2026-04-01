/**
 * app.js — CrickEye Pro  (WebSocket real-time mode, v6.4)
 *
 * KEY CHANGES vs v6.3:
 *
 *  - buildStartPanel() now renders a file-upload UI instead of a text path input.
 *  - startAnalysis() uploads the chosen file to POST /upload (multipart/form-data).
 *  - Upload progress is shown inside the start panel (progress bar + % label).
 *
 * KEY CHANGES vs v6.3 (calibration):
 *  - BAT SPEED label now shows "km/h" instead of "px/s" everywhere.
 *  - renderBiomechCard: metric label updated to "BAT SPEED (km/h)".
 *  - replaceAnalysisCards: session averages line updated to "km/h".
 *  - updateStatRingsFromAnalysis: AVG SPEED ring divisor updated to 130
 *    (reasonable km/h ceiling for the ring fill at 100%).
 *  - Session report header: "Avg Speed" label now shows km/h.
 *
 *  All other logic (WS flow, video loading, wagon wheel, dashboard flush,
 *  biomech cards, session report, stat rings, distribution, timeline, stars)
 *  is unchanged from v6.3.
 */

const SHOT_LABELS = {
  cover:'Cover Drive', straight:'Straight Drive',
  pull:'Pull Shot', flick:'Flick', sweep:'Sweep',
};
const SHOT_COLORS = {
  cover:'#06B6D4', straight:'#10B981',
  pull:'#F97316', flick:'#A855F7', sweep:'#EAB308',
};
const SHOT_ZONE = {
  cover:'offside', straight:'straight',
  pull:'legside', flick:'legside', sweep:'legside',
};
const FOOTWORK_LABELS = {
  front_foot:'⬆ Front Foot', back_foot:'⬇ Back Foot', neutral:'— Neutral',
};
const QUALITY_COLORS = {
  Excellent:'#10B981', Good:'#06B6D4', Average:'#EAB308', Poor:'#EF4444',
};

// ── DOM refs ────────────────────────────────────────────────
const video            = document.getElementById('mainVideo');
const timelineTrack    = document.getElementById('timelineTrack');
const timelineProgress = document.getElementById('timelineProgress');
const shotIndex        = document.getElementById('shotIndex');
const shotName         = document.getElementById('shotName');
const shotTime         = document.getElementById('shotTime');
const shotColorBar     = document.getElementById('shotColorBar');
const hudTime          = document.getElementById('hudTime');
const hudShot          = document.getElementById('hudShot');
const hudFrame         = document.getElementById('hudFrame');
const sessionTime      = document.getElementById('sessionTime');
const shotCount        = document.getElementById('shotCount');
const overTableBody    = document.getElementById('overTableBody');
const btnClearWheel    = document.getElementById('btnClearWheel');
const btnSpeed         = document.getElementById('btnSpeed');
const btnLoop          = document.getElementById('btnLoop');
const wagonCanvas      = document.getElementById('wagonWheelCanvas');
const batsmanLabel     = document.getElementById('batsmanLabel');
const distOffBar       = document.getElementById('dist-off-bar');
const distLegBar       = document.getElementById('dist-leg-bar');
const distStrBar       = document.getElementById('dist-str-bar');
const distOffPct       = document.getElementById('dist-off-pct');
const distLegPct       = document.getElementById('dist-leg-pct');
const distStrPct       = document.getElementById('dist-str-pct');
const distOffCnt       = document.getElementById('dist-off-cnt');
const distLegCnt       = document.getElementById('dist-leg-cnt');
const distStrCnt       = document.getElementById('dist-str-cnt');
const btnReport        = document.getElementById('btnReport');
const sessionsList     = document.getElementById('sessionsList');
const headerProfileBtn = document.getElementById('headerProfileBtn');
const headerProfileAvatar = document.getElementById('headerProfileAvatar');
const headerProfileEmail = document.getElementById('headerProfileEmail');
const headerAuthHint   = document.getElementById('headerAuthHint');
const profileModal     = document.getElementById('profileModal');
const profileModalEmail = document.getElementById('profileModalEmail');
const profileModalUserId = document.getElementById('profileModalUserId');
const profileModalCreated = document.getElementById('profileModalCreated');
const profileLogoutBtn = document.getElementById('profileLogoutBtn');
const sessionDetailModal = document.getElementById('sessionDetailModal');
const sessionDetailBody = document.getElementById('sessionDetailBody');
const authGate         = document.getElementById('authGate');
const gateEmail        = document.getElementById('gateEmail');
const gatePassword     = document.getElementById('gatePassword');
const gateSignupBtn    = document.getElementById('gateSignupBtn');
const gateLoginBtn     = document.getElementById('gateLoginBtn');
const gateMessage      = document.getElementById('gateMessage');

// ── Supabase (frontend auth + storage + db) ────────────────
// Use supabaseClient (not "supabase"): the UMD bundle already defines global `supabase` = library API.
// Populated from GET /api/public-config (reads backend/.env) or optional window.* override.
let supabaseClient = null;

function getSupabaseUmd() {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const lib = g.supabase;
  if (lib && typeof lib.createClient === 'function') return lib;
  return null;
}

async function bootstrapSupabase() {
  const lib = getSupabaseUmd();
  if (!lib) {
    console.error('[CrickEye] Supabase JS not loaded. Use dist/umd/supabase.js in index.html.');
    return;
  }
  try {
    const res = await fetch('/api/public-config');
    if (res.ok) {
      const cfg = await res.json();
      const url = (cfg.supabaseUrl || '').trim();
      const key = (cfg.supabaseAnonKey || '').trim();
      if (url && key) {
        supabaseClient = lib.createClient(url, key);
        return;
      }
    }
  } catch (e) {
    console.warn('[CrickEye] /api/public-config failed:', e);
  }
  const url = (window.SUPABASE_URL || '').trim();
  const key = (window.SUPABASE_ANON_KEY || '').trim();
  if (url && key) {
    supabaseClient = lib.createClient(url, key);
  }
}

// ── State ───────────────────────────────────────────────────
let state = {
  shotLog:      [],
  shotStats:    {},
  zoneCounts:   { offside:0, straight:0, legside:0 },

  displayedShotStats:  {},
  displayedZoneCounts: { offside:0, straight:0, legside:0 },

  currentHand:  'left',
  speedIdx:     0,
  looping:      false,
  sessionStart: Date.now(),
  pendingSpokes:  [],
  drawnSpokes:    new Set(),
  originalVideoDuration: null,
  sessionAnalysis:       null,
  completePayload:       null,
  videoFlushed:          false,
  currentUser:           null,
  activeSessionId:       null,
  sessionsCache:         [],
  /** SHA-256 hex for current run; used on save so cache can find this session later. */
  pendingAnalysisFileHash: null,
};
const SPEEDS = [1, 1.5, 0.5, 0.25];

// ── Processing overlay ──────────────────────────────────────
function createProcessingOverlay() {
  if (document.getElementById('processingOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'processingOverlay';
  overlay.innerHTML = `
    <div class="proc-inner">
      <div class="proc-logo">
        <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="14" stroke="#06B6D4" stroke-width="1.5"/>
          <path d="M8 16 Q16 6 24 16 Q16 26 8 16Z" fill="#06B6D4" opacity="0.2" stroke="#06B6D4" stroke-width="1"/>
          <circle cx="16" cy="16" r="2.5" fill="#06B6D4"/>
        </svg>
      </div>
      <div class="proc-title">CrickEye AI Processing</div>
      <div class="proc-stage" id="procStage">Initialising…</div>
      <div class="proc-bar-wrap">
        <div class="proc-bar-track">
          <div class="proc-bar-fill" id="procBarFill"></div>
          <div class="proc-bar-glow" id="procBarGlow"></div>
        </div>
        <span class="proc-pct" id="procPct">0%</span>
      </div>
      <div class="proc-stats">
        <div class="proc-stat"><span class="proc-stat-val" id="procFrame">—</span><span class="proc-stat-lbl">FRAMES</span></div>
        <div class="proc-stat"><span class="proc-stat-val" id="procEta">—</span><span class="proc-stat-lbl">ETA</span></div>
        <div class="proc-stat"><span class="proc-stat-val" id="procShots">0</span><span class="proc-stat-lbl">SHOTS FOUND</span></div>
      </div>
    </div>`;
  document.querySelector('.video-wrapper').appendChild(overlay);
  injectOverlayStyles();
}

function injectOverlayStyles() {
  // Styles live permanently in style.css — no runtime injection needed.
}

// ── Biomech + report styles ─────────────────────────────────
function injectBiomechStyles() {
  // Styles live permanently in style.css — no runtime injection needed.
}

// ── Render biomech card ─────────────────────────────────────
function renderBiomechCard(shot) {
  const feed = document.getElementById('biomech-feed');
  if (!feed) return;
  const color  = SHOT_COLORS[shot.label]  || '#888';
  const qcolor = QUALITY_COLORS[shot.shot_quality] || '#888';
  const conf   = Math.round(shot.conf * 100);
  const score  = shot.shot_score || 0;
  const sc = score>=8?'#10B981':score>=6?'#06B6D4':score>=4?'#EAB308':'#EF4444';
  const fl = FOOTWORK_LABELS[shot.footwork] || shot.footwork || '—';
  const fh = (shot.flags||[]).map(f=>`<span class="biomech-flag">${f}</span>`).join('');
  const card = document.createElement('div');
  card.className = 'biomech-card';
  card.id = `biomech-card-${shot.shot_num}`;
  card.style.setProperty('--shot-color', color);
  card.innerHTML = `
    <div class="biomech-card-header">
      <div class="biomech-card-title">
        <span class="biomech-shot-num">#${shot.shot_num}</span>
        <span class="biomech-shot-label">${(SHOT_LABELS[shot.label]||shot.label).toUpperCase()}</span>
        <span class="biomech-conf-badge" style="color:${color};border-color:${color}40;background:${color}18">${conf}%</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="biomech-footwork">${fl}</span>
        <span class="biomech-quality-badge" style="background:${qcolor}18;color:${qcolor}">${shot.shot_quality||'—'}</span>
      </div>
    </div>
    <div class="biomech-metrics">
      <div class="biomech-metric"><span class="biomech-metric-val">${(shot.peak_swing_speed||0).toFixed(1)}</span><span class="biomech-metric-lbl">BAT SPEED (km/h)</span></div>
      <div class="biomech-metric"><span class="biomech-metric-val">${Math.round(shot.head_stability||0)}</span><span class="biomech-metric-lbl">HEAD STAB</span></div>
      <div class="biomech-metric"><span class="biomech-metric-val">${Math.round(shot.stability_score||0)}</span><span class="biomech-metric-lbl">STABILITY</span></div>
      <div class="biomech-metric"><span class="biomech-metric-val">${shot.timestamp||'—'}</span><span class="biomech-metric-lbl">TIME</span></div>
    </div>
    <div class="biomech-score-row">
      <span class="biomech-score-label">SHOT SCORE</span>
      <div class="biomech-score-track"><div class="biomech-score-fill" style="width:${score*10}%;background:${sc}"></div></div>
      <span class="biomech-score-num">${score}<span style="font-size:.6em;color:#94A3B8">/10</span></span>
    </div>
    ${fh?`<div class="biomech-flags">${fh}</div>`:''}`;
  feed.appendChild(card);
  feed.scrollTop = feed.scrollHeight;
}

// ── Dynamic star rating ─────────────────────────────────────
function updateSessionRating(avgScore) {
  const starsEl = document.getElementById('sessionStars');
  const labelEl = document.getElementById('ratingLabel');
  if (!starsEl) return;
  const stars = starsEl.querySelectorAll('.star');
  if (avgScore === undefined || avgScore === null) {
    stars.forEach(s => s.classList.remove('active'));
    if (labelEl) labelEl.textContent = '';
    return;
  }
  const TIERS = [
    { min: 8.0, count: 5, label: 'EXCELLENT',  color: '#10B981' },
    { min: 6.0, count: 4, label: 'GOOD',        color: '#06B6D4' },
    { min: 4.0, count: 3, label: 'AVERAGE',     color: '#EAB308' },
    { min: 2.0, count: 2, label: 'NEEDS WORK',  color: '#F97316' },
    { min: 0,   count: 1, label: 'POOR',        color: '#EF4444' },
  ];
  const tier = TIERS.find(t => avgScore >= t.min) || TIERS[TIERS.length - 1];
  stars.forEach((s, i) => {
    if (i < tier.count) { s.classList.add('active'); s.style.color = tier.color; }
    else                { s.classList.remove('active'); s.style.color = ''; }
  });
  if (labelEl) { labelEl.textContent = `${tier.label}  ·  avg ${avgScore.toFixed(1)}/10`; labelEl.style.color = tier.color; }
}

// ── Render session report ───────────────────────────────────
function renderSessionReport(analysis) {
  const container = document.getElementById('session-report');
  if (!container || !analysis || analysis.error) return;
  const sc = analysis.session_scores||{};
  const best  = analysis.best_shot||{};
  const worst = analysis.worst_shot||{};
  const fw    = analysis.footwork_summary||{};
  const alerts= analysis.coaching_alerts||[];
  const trend = analysis.trend||{};
  const pv = sc.power!=null ? Math.round(sc.power) : '—';
  const hv = sc.head_discipline!=null ? Math.round(sc.head_discipline) : '—';
  const sv = sc.stability!=null ? Math.round(sc.stability) : '—';
  function trendBar(key) {
    const t=trend[key]||{}; const f1=t.first_half||0; const f2=t.second_half||0;
    const mx=Math.max(f1,f2,1); const w1=Math.round((f1/mx)*100); const w2=Math.round((f2/mx)*100);
    const arr=f2>f1?'↑':f2<f1?'↓':'→'; const ac=f2>f1?'#10B981':f2<f1?'#EF4444':'#EAB308';
    // CALIBRATION: swing speed trend label now shows km/h unit
    const lbl=key==='peak_swing_speed'?'BAT SPEED (km/h)':key==='head_stability'?'HEAD STAB':'STABILITY';
    return `<div class="trend-row"><span class="trend-label">${lbl}</span><div class="trend-halves"><div class="trend-half" style="width:${w1}px;max-width:80px"></div><div class="trend-half second" style="width:${w2}px;max-width:80px"></div></div><span class="trend-arrow" style="color:${ac}">${arr}</span><span class="trend-val">${Math.round(f1||0)} → ${Math.round(f2||0)}</span></div>`;
  }
  const ah = alerts.map((a,i)=>`<div class="report-alert ${a.severity}" style="animation-delay:${i*.1}s"><div class="report-alert-header"><span class="report-alert-sev">${a.severity}</span><span class="report-alert-metric">${a.metric}</span></div><div class="report-alert-msg">${a.message}</div><div class="report-alert-action">▸ ${a.action}</div></div>`).join('');
  const bc=SHOT_COLORS[best.label]||'#10B981'; const wc=SHOT_COLORS[worst.label]||'#EF4444';
  container.innerHTML = `
    <div class="report-section-title">SESSION SCORES</div>
    <div class="report-grid">
      <div class="report-score-card" style="--accent:#F97316"><div class="report-score-val" style="color:#F97316">${pv}<span style="font-size:.6em">/100</span></div><div class="report-score-lbl">POWER</div></div>
      <div class="report-score-card" style="--accent:#06B6D4"><div class="report-score-val" style="color:#06B6D4">${hv}<span style="font-size:.6em">/100</span></div><div class="report-score-lbl">HEAD DISCIPLINE</div></div>
      <div class="report-score-card" style="--accent:#10B981"><div class="report-score-val" style="color:#10B981">${sv}<span style="font-size:.6em">/100</span></div><div class="report-score-lbl">STABILITY</div></div>
    </div>
    <div class="report-section-title">HIGHLIGHTS</div>
    <div class="report-highlight-row">
      <div class="report-highlight"><div class="report-highlight-icon">🔥</div><div><div class="report-highlight-title">BEST SHOT</div><div class="report-highlight-val" style="color:${bc}">#${best.shot_num} ${(SHOT_LABELS[best.label]||best.label||'—').toUpperCase()}</div><div class="report-highlight-sub">Score: ${best.shot_score}/10 · ${best.shot_quality} · ${best.timestamp}</div></div></div>
      <div class="report-highlight"><div class="report-highlight-icon">⚠️</div><div><div class="report-highlight-title">WORST SHOT</div><div class="report-highlight-val" style="color:${wc}">#${worst.shot_num} ${(SHOT_LABELS[worst.label]||worst.label||'—').toUpperCase()}</div><div class="report-highlight-sub">Score: ${worst.shot_score}/10 · ${worst.shot_quality} · ${worst.timestamp}</div></div></div>
    </div>
    <div class="report-section-title">FOOTWORK SUMMARY</div>
    <div class="report-footwork-row">
      <div class="report-fw-cell"><div class="report-fw-count" style="color:#10B981">${fw.front_foot_count||0}</div><div class="report-fw-lbl">FRONT FOOT</div></div>
      <div class="report-fw-cell"><div class="report-fw-count" style="color:#F97316">${fw.back_foot_count||0}</div><div class="report-fw-lbl">BACK FOOT</div></div>
      <div class="report-fw-cell"><div class="report-fw-count" style="color:#EAB308">${fw.neutral_count||0}</div><div class="report-fw-lbl">NEUTRAL</div></div>
    </div>
    <div class="report-section-title">SESSION TREND${analysis.fatigue_detected?' &nbsp;<span class="fatigue-tag">⚡ FATIGUE DETECTED</span>':''}</div>
    ${trendBar('peak_swing_speed')}${trendBar('head_stability')}${trendBar('stability_score')}
    ${alerts.length?`<div class="report-section-title">COACHING ALERTS</div><div class="report-alerts">${ah}</div>`:''}`;
  container.classList.add('visible');
}

function updateStatRingsFromAnalysis(analysis) {
  if (!analysis) return;
  const sc = analysis.session_scores||{}; const av = analysis.session_averages||{};
  const cfgs = [
    {id:'ring-timing',  pct:Math.min(100,sc.head_discipline||89),numVal:Math.round(sc.head_discipline||89),suffix:'%',label:'HEAD DISC.'},
    {id:'ring-middling',pct:Math.min(100,sc.stability||88),      numVal:Math.round(sc.stability||88),      suffix:'%',label:'STABILITY'},
    {id:'ring-impact',  pct:Math.min(100,sc.power||78),          numVal:Math.round(sc.power||78),          suffix:'', label:'POWER'},
    // CALIBRATION: AVG SPEED ring — value is now km/h, ceiling 130 km/h = full ring
    {id:'ring-backlift',pct:Math.min(100,((av.peak_swing_speed||0)/130)*100),numVal:Math.round(av.peak_swing_speed||0),suffix:'km/h',label:'AVG SPEED'},
  ];
  const circ = 2*Math.PI*32;
  cfgs.forEach((c,i)=>{
    const el=document.getElementById(c.id); if(!el) return;
    el.style.strokeDasharray=circ; el.style.strokeDashoffset=circ;
    setTimeout(()=>{el.style.transition='stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)';el.style.strokeDashoffset=circ-(c.pct/100)*circ;},i*120+200);
    const card=el.closest('.stat-card');
    if(card){const n=card.querySelector('.stat-num');if(n)n.innerHTML=`${c.numVal}<span class="stat-pct">${c.suffix}</span>`;const l=card.querySelector('.stat-label');if(l)l.textContent=c.label;}
  });
}

function replaceAnalysisCards(analysis) {
  const row=document.querySelector('.analysis-row'); if(!row||!analysis) return;
  const alerts=analysis.coaching_alerts||[]; if(!alerts.length) return;
  const cards=row.querySelectorAll('.analysis-card');
  const ICONS={HIGH:'⚠',MEDIUM:'⚡',LOW:'ℹ'};
  const LBLS={HIGH:'NEEDS WORK',MEDIUM:'MONITOR',LOW:'INFO'};
  const CLS={HIGH:'warn',MEDIUM:'warn',LOW:'good'};
  alerts.slice(0,cards.length).forEach((a,i)=>{
    const c=cards[i];if(!c)return;
    c.querySelector('.analysis-icon').textContent=ICONS[a.severity]||'·';
    c.querySelector('.analysis-title').textContent=a.metric.toUpperCase();
    c.querySelector('.analysis-body').textContent=a.message+' '+a.action;
    const se=c.querySelector('.analysis-score');se.textContent=LBLS[a.severity]||a.severity;se.className=`analysis-score ${CLS[a.severity]||''}`;
  });
  const av=analysis.session_averages||{};
  const fills=[
    {icon:'🏃',title:'FOOTWORK BREAKDOWN',score:'INFO',cls:'good',body:(()=>{const fw=analysis.footwork_summary||{};const tot=(fw.front_foot_count||0)+(fw.back_foot_count||0)+(fw.neutral_count||0);if(!tot)return'No data.';const fp=Math.round((fw.front_foot_count||0)/tot*100);const bp=Math.round((fw.back_foot_count||0)/tot*100);return`Front foot ${fp}% · Back foot ${bp}% · Neutral ${100-fp-bp}%.`;})()},
    // CALIBRATION: session averages card now shows km/h for bat speed
    {icon:'📊',title:'SESSION AVERAGES',score:'STATS',cls:'good',body:`Bat Speed: ${(av.peak_swing_speed||0).toFixed(1)} km/h · Head: ${Math.round(av.head_stability||0)}/100 · Stab: ${Math.round(av.stability_score||0)}/100`},
  ];
  fills.forEach((fc,j)=>{
    const c=cards[alerts.length+j];
    if(!c) return;
    c.querySelector('.analysis-icon').textContent=fc.icon;
    c.querySelector('.analysis-title').textContent=fc.title;
    c.querySelector('.analysis-body').textContent=fc.body;
    const se=c.querySelector('.analysis-score');se.textContent=fc.score;se.className=`analysis-score ${fc.cls}`;
  });
}

function updateAuthUi() {
  const loggedIn = !!state.currentUser;
  if (authGate) authGate.classList.toggle('hidden', loggedIn);
  if (headerProfileBtn) headerProfileBtn.hidden = !loggedIn;
  if (headerAuthHint) headerAuthHint.hidden = true;
  if (loggedIn && state.currentUser) {
    const em = state.currentUser.email || '';
    if (headerProfileAvatar) headerProfileAvatar.textContent = (em.trim()[0] || '?').toUpperCase();
    if (headerProfileEmail) headerProfileEmail.textContent = em;
  }
}

function openModal(el) {
  if (!el) return;
  el.hidden = false;
  document.body.classList.add('ce-modal-open');
}

function closeModal(el) {
  if (!el) return;
  el.hidden = true;
  const anyOpen = [...document.querySelectorAll('.ce-modal')].some((m) => !m.hidden);
  if (!anyOpen) document.body.classList.remove('ce-modal-open');
}

function fillProfileModal() {
  const u = state.currentUser;
  if (!u) return;
  if (profileModalEmail) profileModalEmail.textContent = u.email || '—';
  if (profileModalUserId) profileModalUserId.textContent = u.id || '—';
  let created = '—';
  if (u.created_at) {
    try {
      created = new Date(u.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch { /* ignore */ }
  }
  if (profileModalCreated) profileModalCreated.textContent = created;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shotLabelPretty(label) {
  return SHOT_LABELS[label] || (label ? String(label).replace(/_/g, ' ') : '—');
}

function sessionVideoFilename(url) {
  if (!url) return '—';
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean);
    return seg.length ? decodeURIComponent(seg[seg.length - 1]) : url;
  } catch {
    return url;
  }
}

function statusBadgeClass(status) {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return 'session-pill session-pill--ok';
  if (s === 'failed') return 'session-pill session-pill--bad';
  if (s === 'processing') return 'session-pill session-pill--run';
  if (s === 'uploaded') return 'session-pill session-pill--neutral';
  return 'session-pill session-pill--neutral';
}

/** Unwrap results saved as { analysis, replay } or legacy flat analysis JSON. */
function getSessionAnalysis(results) {
  if (!results || typeof results !== 'object') return null;
  if (results.replay && results.analysis && typeof results.analysis === 'object') return results.analysis;
  return results;
}

/**
 * Find latest completed session for this user that matches file hash and has replay data.
 * Uses DB column file_hash first, then scans recent rows for results.file_fingerprint (backfill).
 * Avoids .maybeSingle() — it errors when more than one row matches the same hash.
 */
async function findReplayableCompletedSession(fileHash) {
  if (!supabaseClient || !state.currentUser || !fileHash) return null;

  const { data: byHash, error: err1 } = await supabaseClient
    .from('sessions')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .eq('file_hash', fileHash)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1);

  if (err1) {
    console.warn('[CrickEye] Cache lookup (file_hash):', err1.message);
  } else {
    const row = byHash?.[0];
    if (row && getSessionReplay(row.results)) return row;
  }

  const { data: recent, error: err2 } = await supabaseClient
    .from('sessions')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(60);

  if (err2) {
    console.warn('[CrickEye] Cache scan (recent completed):', err2.message);
    return null;
  }

  const hit = (recent || []).find((s) => {
    if (!getSessionReplay(s.results)) return false;
    if (s.file_hash === fileHash) return true;
    const fp = s.results && typeof s.results === 'object' ? s.results.file_fingerprint : null;
    return fp === fileHash;
  });
  return hit || null;
}

function getSessionReplay(results) {
  if (!results || typeof results !== 'object' || !results.replay) return null;
  return results.replay;
}

function formatSessionCardSummary(r) {
  if (!r || typeof r !== 'object' || r.error) return '';
  const parts = [];
  if (r.shots_confirmed != null) parts.push(`${r.shots_confirmed} confirmed shots`);
  const av = r.session_averages || {};
  if (av.peak_swing_speed != null) parts.push(`Avg ${Number(av.peak_swing_speed).toFixed(1)} km/h`);
  const best = r.best_shot;
  if (best && best.label) parts.push(`Best: ${shotLabelPretty(best.label)}`);
  return parts.join(' · ');
}

function buildSessionDetailHtml(session) {
  const r = getSessionAnalysis(session.results);
  const status = String(session.status || '—');
  const dateStr = new Date(session.created_at).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
  const fname = sessionVideoFilename(session.video_url);
  const vidUrl = escapeHtml(session.video_url || '');
  const sid = escapeHtml(session.id || '');

  let metrics = '';
  if (r && typeof r === 'object' && !r.error) {
    const av = r.session_averages || {};
    const sc = r.session_scores || {};
    const hand = r.session_handedness || '—';
    const stance = r.stance_conf != null ? `${Math.round(Number(r.stance_conf) * 100)}%` : '—';
    metrics += `<section class="session-detail-section"><h3 class="session-detail-h3">Performance summary</h3>
      <div class="session-metric-grid">
        <div class="session-metric"><span class="session-metric-label">Stance</span><span class="session-metric-val">${escapeHtml(hand)}</span><span class="session-metric-sub">confidence ${escapeHtml(stance)}</span></div>
        <div class="session-metric"><span class="session-metric-label">Confirmed shots</span><span class="session-metric-val">${r.shots_confirmed != null ? escapeHtml(String(r.shots_confirmed)) : '—'}</span><span class="session-metric-sub">of ${r.shots_total != null ? escapeHtml(String(r.shots_total)) : '—'} detected</span></div>
        <div class="session-metric"><span class="session-metric-label">Avg bat speed</span><span class="session-metric-val">${av.peak_swing_speed != null ? escapeHtml(Number(av.peak_swing_speed).toFixed(1)) : '—'}</span><span class="session-metric-sub">km/h</span></div>
        <div class="session-metric"><span class="session-metric-label">Head stability</span><span class="session-metric-val">${av.head_stability != null ? escapeHtml(Math.round(Number(av.head_stability)).toString()) : '—'}</span><span class="session-metric-sub">avg / 100</span></div>
        <div class="session-metric"><span class="session-metric-label">Stability score</span><span class="session-metric-val">${av.stability_score != null ? escapeHtml(Math.round(Number(av.stability_score)).toString()) : '—'}</span><span class="session-metric-sub">avg / 100</span></div>
        <div class="session-metric"><span class="session-metric-label">Power / discipline</span><span class="session-metric-val">${sc.power != null ? escapeHtml(String(sc.power)) : '—'} / ${sc.head_discipline != null ? escapeHtml(String(sc.head_discipline)) : '—'}</span><span class="session-metric-sub">session scores</span></div>
      </div></section>`;

    const best = r.best_shot;
    const worst = r.worst_shot;
    if (best || worst) {
      metrics += `<section class="session-detail-section"><h3 class="session-detail-h3">Shot highlights</h3><div class="session-highlight-row">`;
      if (best && best.label) {
        metrics += `<div class="session-highlight session-highlight--best"><span class="session-highlight-tag">Best shot</span><strong>${escapeHtml(shotLabelPretty(best.label))}</strong><span class="session-highlight-meta">#${escapeHtml(String(best.shot_num))} · ${escapeHtml(best.timestamp || '')} · score ${escapeHtml(String(best.shot_score != null ? best.shot_score : '—'))}</span></div>`;
      }
      if (worst && worst.label) {
        metrics += `<div class="session-highlight session-highlight--worst"><span class="session-highlight-tag">Needs work</span><strong>${escapeHtml(shotLabelPretty(worst.label))}</strong><span class="session-highlight-meta">#${escapeHtml(String(worst.shot_num))} · ${escapeHtml(worst.timestamp || '')}</span></div>`;
      }
      metrics += '</div></section>';
    }

    const trend = r.trend;
    if (trend && typeof trend === 'object') {
      const rows = ['peak_swing_speed', 'head_stability', 'stability_score'].map((key) => {
        const o = trend[key];
        if (!o || (o.first_half == null && o.second_half == null)) return '';
        const label = key === 'peak_swing_speed' ? 'Bat speed (km/h)' : key === 'head_stability' ? 'Head stability' : 'Stability score';
        const u1 = o.first_half != null ? Number(o.first_half).toFixed(1) : '—';
        const u2 = o.second_half != null ? Number(o.second_half).toFixed(1) : '—';
        return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(u1)}</td><td>${escapeHtml(u2)}</td></tr>`;
      }).join('');
      if (rows) {
        metrics += `<section class="session-detail-section"><h3 class="session-detail-h3">First half vs second half</h3>
          <table class="session-trend-table"><thead><tr><th>Metric</th><th>1st half</th><th>2nd half</th></tr></thead><tbody>${rows}</tbody></table>
          ${r.fatigue_detected ? '<p class="session-fatigue-note">Fatigue pattern suggested (speed dropped in second half).</p>' : ''}</section>`;
      }
    }

    const fw = r.footwork_summary;
    if (fw && typeof fw === 'object') {
      const t = (fw.front_foot_count || 0) + (fw.back_foot_count || 0) + (fw.neutral_count || 0);
      if (t > 0) {
        metrics += `<section class="session-detail-section"><h3 class="session-detail-h3">Footwork</h3><p class="session-footwork-line">Front foot <strong>${fw.front_foot_count || 0}</strong> · Back foot <strong>${fw.back_foot_count || 0}</strong> · Neutral <strong>${fw.neutral_count || 0}</strong></p></section>`;
      }
    }

    const alerts = r.coaching_alerts;
    if (Array.isArray(alerts) && alerts.length) {
      const lis = alerts.slice(0, 6).map((a) =>
        `<li class="session-alert session-alert--${escapeHtml((a.severity || 'low').toLowerCase())}"><span class="session-alert-sev">${escapeHtml(a.severity || '')}</span> <strong>${escapeHtml(a.metric || '')}</strong> — ${escapeHtml(a.message || '')} <em>${escapeHtml(a.action || '')}</em></li>`
      ).join('');
      metrics += `<section class="session-detail-section"><h3 class="session-detail-h3">Coaching notes</h3><ul class="session-alert-list">${lis}</ul></section>`;
    }
  } else if (r && r.error) {
    metrics += `<section class="session-detail-section"><p class="session-no-results">${escapeHtml(String(r.error))}</p></section>`;
  } else if (status === 'failed') {
    metrics += `<section class="session-detail-section"><p class="session-no-results">This run did not finish successfully. No analytics were saved.</p></section>`;
  } else {
    metrics += `<section class="session-detail-section"><p class="session-no-results">No analytics stored yet for this session.</p></section>`;
  }

  return `
    <div class="session-detail-header">
      <div>
        <p class="session-detail-date">${escapeHtml(dateStr)}</p>
        <span class="${statusBadgeClass(status)}">${escapeHtml(status.toUpperCase())}</span>
      </div>
      <p class="session-detail-id">Session <code>${sid}</code></p>
    </div>
    <section class="session-detail-section">
      <h3 class="session-detail-h3">Original video</h3>
      <p class="session-video-name">${escapeHtml(fname)}</p>
      <div class="session-video-preview">
        ${vidUrl ? `<video class="session-detail-video" src="${vidUrl}" controls playsinline preload="metadata"></video>` : ''}
      </div>
      ${vidUrl ? `<p class="session-video-link"><a href="${vidUrl}" target="_blank" rel="noopener noreferrer">Open video in new tab</a></p>` : ''}
    </section>
    ${metrics}
  `;
}

function openSessionDetailModal(sessionId) {
  const session = state.sessionsCache.find((x) => x.id === sessionId);
  if (!session || !sessionDetailModal || !sessionDetailBody) return;
  const titleEl = document.getElementById('sessionDetailTitle');
  if (titleEl) {
    const d = new Date(session.created_at);
    titleEl.textContent = `Session · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  sessionDetailBody.innerHTML = buildSessionDetailHtml(session);
  openModal(sessionDetailModal);
}

function wireModalDismissals() {
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close-modal');
      const mod = document.getElementById(id);
      closeModal(mod);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeModal(profileModal);
    closeModal(sessionDetailModal);
  });
}

function renderSessions(items) {
  if (!sessionsList) return;
  state.sessionsCache = Array.isArray(items) ? items : [];
  if (!state.sessionsCache.length) {
    sessionsList.innerHTML = '<div class="session-item-empty">No sessions yet. Run an analysis after upload.</div>';
    return;
  }

  sessionsList.innerHTML = state.sessionsCache.map((s) => {
    const created = new Date(s.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const sum = formatSessionCardSummary(getSessionAnalysis(s.results));
    const stat = (s.status || '').toUpperCase();
    const sid = escapeHtml(s.id || '');
    return `
      <button type="button" class="session-card" data-session-id="${sid}">
        <div class="session-card-top">
          <span class="session-card-date">${escapeHtml(created)}</span>
          <span class="${statusBadgeClass(s.status)}">${escapeHtml(stat)}</span>
        </div>
        <div class="session-card-file" title="${escapeHtml(sessionVideoFilename(s.video_url))}">${escapeHtml(sessionVideoFilename(s.video_url))}</div>
        ${sum ? `<div class="session-card-summary">${escapeHtml(sum)}</div>` : '<div class="session-card-summary session-card-summary--muted">Open for session details</div>'}
        <span class="session-card-hint">View full session report</span>
      </button>
    `;
  }).join('');
}

async function fetchUserSessions() {
  if (!supabaseClient || !state.currentUser) {
    renderSessions([]);
    return;
  }
  const { data, error } = await supabaseClient
    .from('sessions')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[CrickEye] sessions fetch error:', error.message);
    return;
  }
  renderSessions(data || []);
}

async function signup() {
  if (!supabaseClient) {
    const msg = 'Supabase not ready. Check: 1) backend/.env SUPABASE_URL + SUPABASE_ANON_KEY 2) hard refresh. See browser console.';
    if (gateMessage) gateMessage.textContent = msg;
    alert(msg);
    return;
  }
  const email = (gateEmail?.value || '').trim();
  const password = (gatePassword?.value || '').trim();
  if (!email || !password) return alert('Enter email and password.');
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    if (gateMessage) gateMessage.textContent = error.message;
    return alert(error.message);
  }
  if (gateMessage) gateMessage.textContent = 'Signup successful. Please login.';
  alert('Signup successful. Please login.');
}

async function login() {
  if (!supabaseClient) {
    const msg = 'Supabase not ready. Check backend/.env and console.';
    if (gateMessage) gateMessage.textContent = msg;
    alert(msg);
    return;
  }
  const email = (gateEmail?.value || '').trim();
  const password = (gatePassword?.value || '').trim();
  if (!email || !password) return alert('Enter email and password.');
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    if (gateMessage) gateMessage.textContent = error.message;
    return alert(error.message);
  }
  const { data } = await supabaseClient.auth.getUser();
  state.currentUser = data?.user || null;
  if (gateMessage) gateMessage.textContent = '';
  updateAuthUi();
  await fetchUserSessions();
}

async function logout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  state.currentUser = null;
  updateAuthUi();
  renderSessions([]);
  if (gateMessage) gateMessage.textContent = 'Logged out.';
  closeModal(profileModal);
}

async function initAuth() {
  if (!supabaseClient) {
    if (headerAuthHint) headerAuthHint.hidden = false;
    if (headerProfileBtn) headerProfileBtn.hidden = true;
    if (gateMessage && !gateMessage.textContent) {
      gateMessage.textContent = 'Add Supabase keys to backend/.env, restart uvicorn, then hard-refresh (Ctrl+Shift+R).';
    }
    return;
  }
  if (headerAuthHint) headerAuthHint.hidden = true;
  const { data } = await supabaseClient.auth.getUser();
  state.currentUser = data?.user || null;
  updateAuthUi();
  if (state.currentUser) await fetchUserSessions();
}

async function sha256HexFromFile(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function rebuildDerivedShotStateFromShots(shots) {
  state.shotLog = Array.isArray(shots) ? shots.map((s) => ({ ...s })) : [];
  state.shotStats = {};
  state.zoneCounts = { offside: 0, straight: 0, legside: 0 };
  state.pendingSpokes = [];
  for (const msg of state.shotLog) {
    if (!state.shotStats[msg.label]) state.shotStats[msg.label] = { count: 0 };
    state.shotStats[msg.label].count++;
    const zone = SHOT_ZONE[msg.label];
    if (zone) state.zoneCounts[zone]++;
    const ts = msg.timestamp || '00:00.00';
    const parts = ts.split(':');
    state.pendingSpokes.push({
      timestamp_sec: parseFloat(parts[0]) * 60 + parseFloat(parts[1] || 0),
      label: msg.label,
      shot_num: msg.shot_num,
      msg,
    });
  }
  state.pendingSpokes.sort((a, b) => a.timestamp_sec - b.timestamp_sec);
}

/** Restore dashboard from a completed session row (same file hash). */
function applyCachedSession(cached) {
  const analysis = getSessionAnalysis(cached.results);
  const replay = getSessionReplay(cached.results);
  if (!replay || !replay.complete || !Array.isArray(replay.shots)) return false;

  state.activeSessionId = cached.id;
  rebuildDerivedShotStateFromShots(replay.shots);
  state.sessionAnalysis = analysis;
  state.videoFlushed = false;
  state.drawnSpokes.clear();
  const msg = { ...replay.complete, analysis: analysis || replay.complete.analysis };
  if (!msg.output_video) msg.output_video = '/assets/analysed_out.mp4';
  onComplete(msg, { skipPersist: true, videoDelayMs: 250 });
  console.log('[CrickEye] Reused completed session (same video file). Pipeline skipped.');
  return true;
}

async function createSupabaseSessionForLiveAnalysis(file, fileHash = null) {
  if (!supabaseClient) throw new Error('Supabase is not configured in frontend.');
  if (!state.currentUser) throw new Error('Please login first.');

  const filePath = `${state.currentUser.id}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabaseClient.storage
    .from('videos')
    .upload(filePath, file, { upsert: false });
  if (uploadError) {
    let msg = uploadError.message || 'Storage upload failed';
    if (/bucket not found/i.test(msg)) {
      msg = 'Supabase Storage bucket "videos" does not exist. In the Supabase dashboard: Storage → New bucket → name it exactly videos → create. Turn on "Public bucket" if you rely on public video URLs.';
    }
    throw new Error(msg);
  }

  const { data: publicData } = supabaseClient.storage
    .from('videos')
    .getPublicUrl(filePath);
  const videoUrl = publicData?.publicUrl;
  if (!videoUrl) throw new Error('Could not get public URL.');

  const { data: inserted, error: insertError } = await supabaseClient
    .from('sessions')
    .insert({
      user_id: state.currentUser.id,
      video_url: videoUrl,
      status: 'uploaded',
      file_hash: fileHash || null,
    })
    .select('id')
    .single();
  if (insertError) throw new Error(insertError.message);
  state.activeSessionId = inserted.id;
  await fetchUserSessions();
}

async function markSessionStatus(status) {
  if (!supabaseClient || !state.activeSessionId || !state.currentUser) return;
  const { error } = await supabaseClient
    .from('sessions')
    .update({ status })
    .eq('id', state.activeSessionId)
    .eq('user_id', state.currentUser.id);
  if (error) {
    console.error('[CrickEye] session status update error:', error.message);
  }
}

async function saveLiveAnalysisResult(msg) {
  if (!supabaseClient || !state.activeSessionId || !state.currentUser) return;
  const analysis = state.sessionAnalysis || msg.analysis || null;
  const replay = {
    complete: {
      type: 'complete',
      total_shots: msg.total_shots,
      confirmed: msg.confirmed,
      unclear: msg.unclear,
      output_video: msg.output_video,
      handedness: msg.handedness,
      stance_conf: msg.stance_conf,
      shot_counts: msg.shot_counts,
      avg_conf: msg.avg_conf,
      total_frames: msg.total_frames,
      fps: msg.fps,
      speed_unit: msg.speed_unit,
    },
    shots: JSON.parse(JSON.stringify(state.shotLog)),
  };
  const fp = state.pendingAnalysisFileHash || null;
  const payload = { analysis, replay, file_fingerprint: fp };
  const { error } = await supabaseClient
    .from('sessions')
    .update({
      status: 'completed',
      results: payload,
      file_hash: fp,
    })
    .eq('id', state.activeSessionId)
    .eq('user_id', state.currentUser.id);
  if (error) {
    console.error('[CrickEye] session result save error:', error.message);
    return;
  }
  await fetchUserSessions();
}

// ── WebSocket ───────────────────────────────────────────────
let ws = null;
function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  updateWsStatus('connecting');
  ws = new WebSocket('ws://localhost:8000/ws');
  ws.onopen    = () => { updateWsStatus('connected'); document.getElementById('startBtn')?.removeAttribute('disabled'); };
  ws.onmessage = (e) => { let m; try{m=JSON.parse(e.data);}catch{return;} handleMessage(m); };
  ws.onclose   = () => { updateWsStatus('disconnected'); document.getElementById('startBtn')?.setAttribute('disabled',''); setTimeout(connectWebSocket,3000); };
  ws.onerror   = (e) => console.error('[CrickEye] WS error:',e);
}
function updateWsStatus(s) {
  const dot=document.getElementById('wsDot'); const text=document.getElementById('wsText');
  if(!dot||!text) return;
  dot.className=`ws-dot ${s}`;
  text.textContent=s==='connected'?'CONNECTED':s==='connecting'?'CONNECTING…':'DISCONNECTED — retrying';
}

// ── Message handler ─────────────────────────────────────────
function handleMessage(msg) {
  switch(msg.type) {
    case 'stage':        onStage(msg);    break;
    case 'progress':     onProgress(msg); break;
    case 'onsets_found': updateProcStat('procShots',`0 / ${msg.count}`); break;
    case 'shot':     onShotReceived(msg);       break;
    case 'session':  /* stored via complete payload */ break;
    case 'analysis': state.sessionAnalysis = msg.analysis; break;
    case 'complete': onComplete(msg); break;
    case 'warning':  updateStageText(`⚠ ${msg.message}`); break;
    case 'error':    onError(msg); break;
  }
}

const STAGE_LABELS = {
  loading:'Loading AI models…', keypoints:'Pass 1 — Extracting pose keypoints…',
  detection:'Detecting swing windows…', classifying:'Classifying shots…',
  rendering:'Pass 2 — Rendering annotated video…', encoding:'Re-encoding for browser playback…',
};
function onStage(msg) {
  updateStageText(msg.message || STAGE_LABELS[msg.stage] || msg.stage);
  if (msg.stage==='keypoints' && msg.total_frames) updateProcStat('procFrame',`0 / ${msg.total_frames}`);
  if (msg.stage==='rendering') updateProcStat('procFrame',`0 / ${msg.total_frames||'—'}`);
}
function onProgress(msg) {
  setProgressBar(msg.pct);
  if (msg.frame&&msg.total) updateProcStat('procFrame',`${msg.frame} / ${msg.total}`);
  if (msg.eta!==undefined)  updateProcStat('procEta',  msg.eta>0?`${msg.eta}s`:'—');
}

function onShotReceived(msg) {
  state.shotLog.push(msg);
  if (!state.shotStats[msg.label]) state.shotStats[msg.label] = {count:0};
  state.shotStats[msg.label].count++;
  const zone = SHOT_ZONE[msg.label];
  if (zone) state.zoneCounts[zone]++;
  const ts=msg.timestamp||'00:00.00'; const parts=ts.split(':');
  state.pendingSpokes.push({timestamp_sec:parseFloat(parts[0])*60+parseFloat(parts[1]||0),label:msg.label,shot_num:msg.shot_num,msg});
  updateProcStat('procShots',`${state.shotLog.length} confirmed`);
}

function onComplete(msg, opts = {}) {
  const skipPersist = opts.skipPersist === true;
  const videoDelayMs = opts.videoDelayMs != null ? opts.videoDelayMs : 1500;

  state.completePayload = msg;
  if (msg.total_frames && msg.fps) state.originalVideoDuration = msg.total_frames / msg.fps;
  if (msg.analysis && !state.sessionAnalysis) state.sessionAnalysis = msg.analysis;

  state.pendingSpokes.sort((a,b) => a.timestamp_sec - b.timestamp_sec);

  const handLower = msg.handedness==='LHB'?'left':'right';
  WagonWheel.clearAll();
  forceHand(handLower, msg.handedness||'RHB', msg.stance_conf||1.0);
  state.drawnSpokes.clear();

  const overlay = document.getElementById('processingOverlay');
  if (overlay) { overlay.style.transition='opacity 0.8s ease'; overlay.style.opacity='0'; setTimeout(()=>overlay.remove(),800); }

  if (!video || !msg.output_video) {
    if (!skipPersist) saveLiveAnalysisResult(msg);
    return;
  }
  video.pause();
  while (video.firstChild) video.removeChild(video.firstChild);

  setTimeout(() => {
    const base = msg.output_video.startsWith('/')
      ? `${window.location.origin}${msg.output_video}`
      : msg.output_video;
    const url = `${base}?t=${Date.now()}`;
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.load();

    const tryPlay = () => video.play().catch(() => console.warn('[CrickEye] Autoplay blocked — click the video to play.'));

    const onReadyUi = () => {
      flushDashboard();
    };
    video.addEventListener('canplay', onReadyUi, { once: true });
    video.addEventListener('play', onReadyUi, { once: true });

    video.addEventListener('loadeddata', tryPlay, { once: true });
    setTimeout(tryPlay, 3000);

    video.addEventListener('error', () => {
      const ve = video.error;
      const detail = ve ? `code ${ve.code} (${ve.message || 'decode/network'})` : 'unknown';
      console.error('[CrickEye] Output video failed to load/decode:', detail, url);
      updateStageText(`Video playback failed (${detail}). Re-run analysis after: pip install imageio-ffmpeg`);
      flushDashboard();
      drawAllSpokesWithoutPlayback();
    }, { once: true });
  }, videoDelayMs);
  document.getElementById('btnReport')?.removeAttribute('disabled');
  if (!skipPersist) saveLiveAnalysisResult(msg);
}

function flushDashboard() {
  if (state.videoFlushed) return;
  state.videoFlushed = true;
  const msg = state.completePayload;
  if (!msg) return;
  console.log('[CrickEye] Flushing dashboard on video play');

  const vt = document.querySelector('.verdict-text');
  if (vt) {
    const top = Object.entries(msg.shot_counts||{}).sort((a,b)=>b[1]-a[1])[0];
    if (top && top[1]>0) vt.textContent = `Most played: ${SHOT_LABELS[top[0]]||top[0]}  ·  ${msg.confirmed} confirmed shots`;
  }

  showCompleteOverlay(msg);

  if (state.sessionAnalysis) {
    renderSessionReport(state.sessionAnalysis);
    updateStatRingsFromAnalysis(state.sessionAnalysis);
    replaceAnalysisCards(state.sessionAnalysis);

    const av = state.sessionAnalysis.session_averages || {};
    let avgScore = av.shot_score != null ? av.shot_score : null;
    if (avgScore === null && state.shotLog.length > 0) {
      const confirmed = state.shotLog.filter(s => s.conf > 0.5);
      if (confirmed.length > 0) {
        avgScore = confirmed.reduce((sum, s) => sum + (s.shot_score || 0), 0) / confirmed.length;
      }
    }
    updateSessionRating(avgScore);
  }

  timelineTrack.innerHTML = '';
  state.shotLog.forEach(shot => {
    const el = document.createElement('div');
    el.className = `shot-circle ${shot.label||''}`;
    el.id = `shot-circle-${shot.shot_num}`;
    el.setAttribute('title',`${SHOT_LABELS[shot.label]||shot.label} @ ${shot.timestamp}`);
    const sp = document.createElement('span'); sp.textContent = shot.shot_num;
    el.appendChild(sp); timelineTrack.appendChild(el);
  });
  timelineProgress.style.width = state.shotLog.length > 0 ? '100%' : '0%';

  const feed = document.getElementById('biomech-feed');
  if (feed) feed.innerHTML = '';

  overTableBody.innerHTML = '<tr><td>—</td><td>—</td></tr>';

  state.displayedShotStats  = {};
  state.displayedZoneCounts = { offside:0, straight:0, legside:0 };
  updateDistributionLive();
}

function showCompleteOverlay(msg) {
  if (document.getElementById('completeOverlay')) return;
  const div = document.createElement('div'); div.id='completeOverlay';
  div.innerHTML=`<div class="complete-badge">✓ Analysis Complete &nbsp;·&nbsp; ${msg.confirmed} Confirmed &nbsp;·&nbsp; ${msg.unclear} Unclear &nbsp;·&nbsp; ${msg.handedness}</div>`;
  document.querySelector('.video-wrapper').appendChild(div);
}

function onError(msg) {
  updateStageText(`ERROR: ${msg.message}`);
  document.getElementById('procStage')?.classList.add('error-text');
  console.error('[CrickEye Error]',msg.message);
  markSessionStatus('failed');
}

function updateStageText(text) {
  const el=document.getElementById('procStage'); if(!el) return;
  el.style.opacity='0'; setTimeout(()=>{el.textContent=text;el.style.opacity='1';},180);
}
function setProgressBar(pct) {
  const f=document.getElementById('procBarFill'); const g=document.getElementById('procBarGlow'); const p=document.getElementById('procPct');
  if(f) f.style.width=pct+'%'; if(g) g.style.right=(100-pct)+'%'; if(p) p.textContent=Math.round(pct)+'%';
}
function updateProcStat(id,val) { const el=document.getElementById(id); if(el) el.textContent=val; }

function forceHand(handLower, handLabel, conf) {
  const pct = Math.round((conf||0)*100);
  if (batsmanLabel) {
    if (handLabel==='LHB')      {batsmanLabel.textContent=`Left-Handed · ${pct}%`; batsmanLabel.style.color='#F97316';}
    else if (handLabel==='RHB') {batsmanLabel.textContent=`Right-Handed · ${pct}%`;batsmanLabel.style.color='#F97316';}
    else                        {batsmanLabel.textContent='Stance Uncertain';        batsmanLabel.style.color='#EAB308';}
  }
  if (state.currentHand !== handLower) { state.currentHand=handLower; WagonWheel.setHand(handLower); }
}

function updateOverTableLive() {
  const rows = Object.entries(state.displayedShotStats)
    .filter(([,d]) => d.count > 0)
    .map(([t,d]) => `<tr><td style="color:${SHOT_COLORS[t]};font-weight:600">${SHOT_LABELS[t]||t}</td><td>${d.count}</td></tr>`);
  overTableBody.innerHTML = rows.length ? rows.join('') : '<tr><td>—</td><td>—</td></tr>';
}

function updateDistributionLive() {
  const {offside, straight, legside} = state.displayedZoneCounts;
  const total = offside + straight + legside;
  const op = total ? Math.round((offside  / total) * 100) : 0;
  const lp = total ? Math.round((legside  / total) * 100) : 0;
  const sp = total ? Math.round((straight / total) * 100) : 0;
  if (distOffPct) distOffPct.textContent = op + '%';
  if (distLegPct) distLegPct.textContent = lp + '%';
  if (distStrPct) distStrPct.textContent = sp + '%';
  if (distOffCnt) distOffCnt.textContent = offside;
  if (distLegCnt) distLegCnt.textContent = legside;
  if (distStrCnt) distStrCnt.textContent = straight;
  if (distOffBar) distOffBar.style.width = op + '%';
  if (distLegBar) distLegBar.style.width = lp + '%';
  if (distStrBar) distStrBar.style.width = sp + '%';
}

function updateDistribution() {
  const {offside, straight, legside} = state.zoneCounts;
  const total = offside + straight + legside;
  const op = total ? Math.round((offside  / total) * 100) : 0;
  const lp = total ? Math.round((legside  / total) * 100) : 0;
  const sp = total ? Math.round((straight / total) * 100) : 0;
  if (distOffPct) distOffPct.textContent = op + '%';
  if (distLegPct) distLegPct.textContent = lp + '%';
  if (distStrPct) distStrPct.textContent = sp + '%';
  if (distOffCnt) distOffCnt.textContent = offside;
  if (distLegCnt) distLegCnt.textContent = legside;
  if (distStrCnt) distStrCnt.textContent = straight;
  if (distOffBar) distOffBar.style.width = op + '%';
  if (distLegBar) distLegBar.style.width = lp + '%';
  if (distStrBar) distStrBar.style.width = sp + '%';
}

function clearWheelAndReset() {
  WagonWheel.clearAll();
  state.shotLog=[]; state.shotStats={}; state.zoneCounts={offside:0,straight:0,legside:0};
  state.displayedShotStats  = {};
  state.displayedZoneCounts = { offside:0, straight:0, legside:0 };
  state.currentHand='left'; state.pendingSpokes=[]; state.drawnSpokes.clear();
  state.originalVideoDuration=null; state.sessionAnalysis=null;
  state.completePayload=null; state.videoFlushed=false;
  shotCount.textContent=0; shotIndex.textContent='—'; shotName.textContent='AWAITING';
  shotTime.textContent='—'; shotColorBar.style.background='var(--border)'; shotColorBar.style.boxShadow='none';
  hudShot.textContent='—'; overTableBody.innerHTML='<tr><td>—</td><td>—</td></tr>';
  timelineTrack.innerHTML=''; timelineProgress.style.width='0%';
  document.getElementById('completeOverlay')?.remove();
  const feed=document.getElementById('biomech-feed'); if(feed) feed.innerHTML='<div class="biomech-empty">AWAITING FIRST SHOT…</div>';
  const report=document.getElementById('session-report'); if(report){report.classList.remove('visible');report.innerHTML='';}
  updateSessionRating(null);
  updateDistribution(); WagonWheel.setHand('left');
  if(batsmanLabel){batsmanLabel.textContent='AWAITING ANALYSIS';batsmanLabel.style.color='#F97316';}
  console.log('[CrickEye] State cleared.');
}

// ── Start Panel (v6.4 — file upload) ───────────────────────
function buildStartPanel() {
  const panel = document.createElement('div');
  panel.id = 'startPanel';
  panel.innerHTML = `
    <svg width="52" height="52" viewBox="0 0 32 32" fill="none" style="filter:drop-shadow(0 0 12px #06B6D4)">
      <circle cx="16" cy="16" r="14" stroke="#06B6D4" stroke-width="1.5"/>
      <path d="M8 16 Q16 6 24 16 Q16 26 8 16Z" fill="#06B6D4" opacity="0.2" stroke="#06B6D4" stroke-width="1"/>
      <circle cx="16" cy="16" r="2.5" fill="#06B6D4"/>
    </svg>
    <div class="start-title">Start Analysis</div>
    <div class="start-form">
      <input type="file" id="videoFileInput" accept="video/*" style="display:none"/>
      <div class="upload-zone" id="uploadZone">
        <div class="upload-zone-icon">📁</div>
        <div class="upload-zone-label" id="uploadZoneLabel">Choose a video file</div>
        <div class="upload-zone-sub">MP4, AVI, MOV · any resolution</div>
      </div>
      <div class="upload-progress-wrap" id="uploadProgressWrap" style="display:none">
        <div class="upload-progress-track">
          <div class="upload-progress-fill" id="uploadProgressFill"></div>
        </div>
        <span class="upload-progress-label" id="uploadProgressLabel">Uploading… 0%</span>
      </div>
      <button class="start-btn" id="startBtn" disabled>▶  RUN CRICKEYE PIPELINE</button>
    </div>
    <div class="ws-status">
      <div class="ws-dot connecting" id="wsDot"></div>
      <span id="wsText">CONNECTING…</span>
    </div>`;

  document.querySelector('.video-wrapper').appendChild(panel);

  const zone      = document.getElementById('uploadZone');
  const fileInput = document.getElementById('videoFileInput');
  const label     = document.getElementById('uploadZoneLabel');
  const startBtn  = document.getElementById('startBtn');

  zone.addEventListener('click', () => fileInput.click());

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) setSelectedFile(file);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) setSelectedFile(file);
  });

  startBtn.addEventListener('click', startAnalysis);

  function setSelectedFile(file) {
    fileInput._selectedFile = file;
    label.textContent = file.name;
    zone.classList.add('has-file');
    if (ws && ws.readyState === WebSocket.OPEN) startBtn.removeAttribute('disabled');
  }
}

// ── Start Analysis (v6.4 — upload then run) ────────────────
async function startAnalysis() {
  if (!state.currentUser) {
    alert('Please login before uploading a video.');
    return;
  }

  const fileInput = document.getElementById('videoFileInput');
  const file = fileInput?._selectedFile || fileInput?.files?.[0];

  if (!file) {
    alert('Please choose a video file first.');
    return;
  }

  const startBtn = document.getElementById('startBtn');
  if (startBtn) { startBtn.disabled = true; startBtn.textContent = '⏳  Preparing…'; }

  const progressWrap  = document.getElementById('uploadProgressWrap');
  const progressFill  = document.getElementById('uploadProgressFill');
  const progressLabel = document.getElementById('uploadProgressLabel');
  if (progressWrap) progressWrap.style.display = 'block';
  if (progressFill) progressFill.style.width = '0%';

  let fileHash = null;
  try {
    if (progressLabel) progressLabel.textContent = 'Fingerprinting video…';
    fileHash = await sha256HexFromFile(file);
  } catch (e) {
    console.warn('[CrickEye] Could not fingerprint file; full pipeline will run:', e);
  }

  state.pendingAnalysisFileHash = fileHash;

  if (fileHash && supabaseClient) {
    if (progressLabel) progressLabel.textContent = 'Checking for a previous run…';
    const cached = await findReplayableCompletedSession(fileHash);

    if (cached) {
      const replay = getSessionReplay(cached.results);
      if (replay && replay.complete && Array.isArray(replay.shots)) {
        if (progressWrap) progressWrap.style.display = 'none';
        if (startBtn) { startBtn.disabled = false; startBtn.textContent = '▶  RUN CRICKEYE PIPELINE'; }
        const panel = document.getElementById('startPanel');
        if (panel) { panel.style.opacity = '0'; setTimeout(() => panel.remove(), 300); }
        createProcessingOverlay();
        updateStageText('Same video — loading saved analysis (no re-run).');
        setProgressBar(100);
        updateProcStat('procFrame', '—');
        updateProcStat('procEta', '—');
        updateProcStat('procShots', String(replay.shots.length));
        clearWheelAndReset();
        const ok = applyCachedSession(cached);
        if (!ok) {
          alert('Saved session could not be restored. Run a new full analysis once, then retry.');
        }
        return;
      }
      console.warn(
        '[CrickEye] A completed session exists for this file but has no replay payload (saved before replay was added). Run one full analysis with the current app, then re-uploads of the same file will skip the pipeline.'
      );
    }
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert('WebSocket not connected.\n\nRun: uvicorn backend.main:app --port 8000');
    if (progressWrap) progressWrap.style.display = 'none';
    if (startBtn) { startBtn.disabled = false; startBtn.textContent = '▶  RUN CRICKEYE PIPELINE'; }
    return;
  }

  if (startBtn) startBtn.textContent = '⏳  UPLOADING…';

  try {
    // Save owner + video in Supabase first, but keep the existing local WS flow.
    await createSupabaseSessionForLiveAnalysis(file, fileHash);
    await markSessionStatus('processing');

    const formData = new FormData();
    formData.append('file', file);

    const uploadResult = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'http://localhost:8000/upload');

      xhr.upload.addEventListener('progress', e => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        if (progressFill)  progressFill.style.width  = pct + '%';
        if (progressLabel) progressLabel.textContent  = `Uploading… ${pct}%`;
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error('Invalid server response')); }
        } else {
          reject(new Error(`Upload failed: HTTP ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
      xhr.send(formData);
    });

    if (progressWrap) progressWrap.style.display = 'none';

    const panel = document.getElementById('startPanel');
    if (panel) { panel.style.opacity = '0'; setTimeout(() => panel.remove(), 300); }

    createProcessingOverlay();
    clearWheelAndReset();

    const wsMsg = { action: 'start', video_path: uploadResult.video_path };

    ws.send(JSON.stringify(wsMsg));
    console.log(`[CrickEye] Pipeline started — path=${uploadResult.video_path}`);

  } catch (err) {
    console.error('[CrickEye] Upload error:', err);
    await markSessionStatus('failed');
    if (progressLabel) progressLabel.textContent = `✗ ${err.message}`;
    if (progressFill)  progressFill.style.background = '#EF4444';
    if (startBtn) { startBtn.disabled = false; startBtn.textContent = '▶  RUN CRICKEYE PIPELINE'; }
  }
}

// ── Playback controls ───────────────────────────────────────
function cycleSpeed() { state.speedIdx=(state.speedIdx+1)%SPEEDS.length; const sp=SPEEDS[state.speedIdx]; video.playbackRate=sp; btnSpeed.textContent=sp+'×'; }
function toggleLoop()  { state.looping=!state.looping; video.loop=state.looping; btnLoop.style.color=state.looping?'var(--green)':''; btnLoop.style.borderColor=state.looping?'var(--green)':''; }

function onVideoTimeUpdate() {
  if (!video.duration) return;
  const t = video.currentTime;
  hudTime.textContent  = formatTime(t);
  hudFrame.textContent = 'FRAME ' + Math.floor(t * 30);
  const origDur = state.originalVideoDuration || video.duration;
  const scale   = video.duration / origDur;
  const AHEAD   = 0.4;
  state.pendingSpokes.forEach(spoke => {
    if (state.drawnSpokes.has(spoke.shot_num)) return;
    if (t >= spoke.timestamp_sec * scale - AHEAD) {
      state.drawnSpokes.add(spoke.shot_num);
      drawSpokeNow(spoke);
    }
  });
}

function drawSpokeNow(spoke, onSpokeDrawn) {
  const circle = document.getElementById(`shot-circle-${spoke.shot_num}`);
  if (circle) {
    document.querySelectorAll('.shot-circle').forEach(el=>el.classList.remove('active'));
    circle.classList.add('played','active');
    setTimeout(()=>circle.classList.remove('active'),1200);
  }
  hudShot.textContent   = SHOT_LABELS[spoke.label] || spoke.label;
  shotIndex.textContent = spoke.shot_num;
  shotName.textContent  = (SHOT_LABELS[spoke.label]||spoke.label).toUpperCase();
  shotTime.textContent  = spoke.msg.timestamp;
  const col = SHOT_COLORS[spoke.label]||'#fff';
  shotColorBar.style.background=col; shotColorBar.style.boxShadow=`0 0 10px ${col}`;
  renderBiomechCard(spoke.msg);
  if (!state.displayedShotStats[spoke.label]) state.displayedShotStats[spoke.label] = { count: 0 };
  state.displayedShotStats[spoke.label].count++;
  const zone = SHOT_ZONE[spoke.label];
  if (zone) state.displayedZoneCounts[zone]++;
  updateOverTableLive();
  updateDistributionLive();
  WagonWheel.drawSpoke(spoke.label, () => {
    shotCount.textContent = WagonWheel.getSpokeCount();
    if (onSpokeDrawn) onSpokeDrawn();
  });
}

/** When the output MP4 cannot play in-browser, still paint wagon-wheel spokes in order. */
function drawAllSpokesWithoutPlayback() {
  const spokes = [...state.pendingSpokes].sort((a, b) => a.timestamp_sec - b.timestamp_sec);
  let i = 0;
  function next() {
    if (i >= spokes.length) return;
    drawSpokeNow(spokes[i++], () => setTimeout(next, 90));
  }
  next();
}

function animateStatRings() {
  const circ=2*Math.PI*32;
  [{id:'ring-timing',pct:89},{id:'ring-middling',pct:88},{id:'ring-impact',pct:78},{id:'ring-backlift',pct:39}]
    .forEach((c,i)=>{ const el=document.getElementById(c.id); if(!el) return; el.style.strokeDasharray=circ; el.style.strokeDashoffset=circ; setTimeout(()=>{el.style.transition='stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)';el.style.strokeDashoffset=circ-(c.pct/100)*circ;},i*120); });
}

function updateSessionTimer() {
  const e=Math.floor((Date.now()-state.sessionStart)/1000);
  const m=String(Math.floor(e/60)).padStart(2,'0'); const s=String(e%60).padStart(2,'0');
  if(sessionTime) sessionTime.textContent=`${m}:${s}`;
}
function formatTime(sec) { const m=String(Math.floor(sec/60)).padStart(2,'0'); const s=String(Math.floor(sec%60)).padStart(2,'0'); return`${m}:${s}`; }

// ── Init ────────────────────────────────────────────────────
function init() {
  gateSignupBtn?.addEventListener('click', signup);
  gateLoginBtn?.addEventListener('click', login);
  wireModalDismissals();
  headerProfileBtn?.addEventListener('click', () => {
    fillProfileModal();
    openModal(profileModal);
  });
  profileLogoutBtn?.addEventListener('click', () => { logout(); });
  sessionsList?.addEventListener('click', (e) => {
    const card = e.target.closest('.session-card');
    if (!card) return;
    const id = card.getAttribute('data-session-id');
    if (id) openSessionDetailModal(id);
  });
  WagonWheel.init(wagonCanvas);
  injectBiomechStyles();
  buildStartPanel();
  injectOverlayStyles();
  video.addEventListener('timeupdate', onVideoTimeUpdate);
  video.addEventListener('click', ()=>{ if(video.paused) video.play(); else video.pause(); });
  btnClearWheel?.addEventListener('click', clearWheelAndReset);
  btnSpeed?.addEventListener('click', cycleSpeed);
  btnLoop?.addEventListener('click', toggleLoop);
  btnReport?.addEventListener('click', () => ReportModal.open(state, state.sessionAnalysis));
  connectWebSocket();
  setInterval(updateSessionTimer, 1000);
  setTimeout(animateStatRings, 600);
  updateDistribution();
  updateSessionRating(null);
  initAuth();
  console.log('[CrickEye Pro v6.4 — Calibrated km/h] Initialised.');
}
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await bootstrapSupabase();
  } catch (e) {
    console.error('[CrickEye] bootstrapSupabase:', e);
    if (gateMessage) gateMessage.textContent = 'Config load failed — check console and backend/.env';
  }
  try {
    init();
  } catch (e) {
    console.error('[CrickEye] init failed:', e);
    if (gateMessage) gateMessage.textContent = 'App init failed — see console (F12).';
  }
});