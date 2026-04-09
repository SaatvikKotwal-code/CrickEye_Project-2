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
const openSessionCompareBtn = document.getElementById('openSessionCompareBtn');
const sessionCompareModal = document.getElementById('sessionCompareModal');
const compareSessionA = document.getElementById('compareSessionA');
const compareSessionB = document.getElementById('compareSessionB');
const sessionCompareBody = document.getElementById('sessionCompareBody');
const compareThisMonthBtn = document.getElementById('compareThisMonthBtn');
const authGate         = document.getElementById('authGate');
const gateTitle        = document.getElementById('gateTitle');
const gateSubtitle     = document.getElementById('gateSubtitle');
const signupFields     = document.getElementById('signupFields');
const gateFullName     = document.getElementById('gateFullName');
const gateAge          = document.getElementById('gateAge');
const gateGender       = document.getElementById('gateGender');
const gateEmail        = document.getElementById('gateEmail');
const gatePassword     = document.getElementById('gatePassword');
const gatePrimaryBtn   = document.getElementById('gatePrimaryBtn');
const gateSwitchMode   = document.getElementById('gateSwitchMode');
const gateMessage      = document.getElementById('gateMessage');
const playerAppShell   = document.getElementById('playerAppShell');
const coachDashboard   = document.getElementById('coachDashboard');
const coachStatsRow    = document.getElementById('coachStatsRow');
const coachPlayersList = document.getElementById('coachPlayersList');
const coachLogoutBtn   = document.getElementById('coachLogoutBtn');

// ── Supabase (frontend auth + storage + db) ────────────────
// Use supabaseClient (not "supabase"): the UMD bundle already defines global `supabase` = library API.
// Populated from GET /api/public-config (reads backend/.env) or optional window.* override.
let supabaseClient = null;
const COACH_EMAIL_OVERRIDES = new Set(['coach9259@gmail.com']);

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
  currentProfile:        null,
  currentRole:           'player',
  authMode:              'login',
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
  const score  = shot.shot_score || 0;
  const sc = score>=8?'#10B981':score>=6?'#06B6D4':score>=4?'#EAB308':'#EF4444';
  const fl = FOOTWORK_LABELS[shot.footwork] || shot.footwork || '—';
  const head = Math.round(shot.head_stability || 0);
  const stab = Math.round(shot.stability_score || 0);
  const speedRaw = Number(shot.peak_swing_speed || 0);
  const speedTxt = speedRaw >= 140 ? '~140+' : speedRaw.toFixed(1);
  const metricBand = (v) => {
    if (v >= 80) return { label: 'Elite', color: '#10B981' };
    if (v >= 65) return { label: 'Good', color: '#10B981' };
    if (v >= 50) return { label: 'Workable', color: '#EAB308' };
    return { label: 'Needs Work', color: '#EF4444' };
  };
  const hb = metricBand(head);
  const sb = metricBand(stab);
  const fh = (shot.flags||[]).map(f=>`<span class="biomech-flag" data-flag="${escapeHtml(String(f).split(':')[0])}">${escapeHtml(f)}</span>`).join('');
  const card = document.createElement('div');
  card.className = 'biomech-card';
  card.id = `biomech-card-${shot.shot_num}`;
  card.style.setProperty('--shot-color', color);
  card.innerHTML = `
    <div class="biomech-card-header">
      <div class="biomech-card-title">
        <span class="biomech-shot-num">#${shot.shot_num}</span>
        <span class="biomech-shot-label">${(SHOT_LABELS[shot.label]||shot.label).toUpperCase()}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="biomech-footwork">${fl}</span>
        <span class="biomech-quality-badge" style="background:${qcolor}18;color:${qcolor}">${shot.shot_quality||'—'}</span>
      </div>
    </div>
    <div class="biomech-metrics">
      <div class="biomech-metric"><span class="biomech-metric-val">${head}</span><span class="biomech-metric-lbl">HEAD · ${hb.label}</span></div>
      <div class="biomech-metric"><span class="biomech-metric-val">${stab}</span><span class="biomech-metric-lbl">BALANCE · ${sb.label}</span></div>
      <div class="biomech-metric"><span class="biomech-metric-val">${speedTxt}</span><span class="biomech-metric-lbl">BAT SPEED (km/h)</span></div>
    </div>
    <div class="biomech-score-row">
      <span class="biomech-score-label">SHOT SCORE</span>
      <div class="biomech-score-track"><div class="biomech-score-fill" style="width:${score*10}%;background:${sc}"></div></div>
      <span class="biomech-score-num">${score}<span style="font-size:.6em;color:#94A3B8">/10</span></span>
    </div>
    ${fh?`<div class="biomech-flags">${fh}</div>`:'<div class="biomech-flags"><span class="biomech-flag biomech-flag-ok">NO FLAGS</span></div>'}`;
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
  const sm = getAnalysisSummary(analysis);
  const best  = analysis.best_shot||{};
  const worst = analysis.worst_shot||{};
  const fw    = analysis.footwork_summary||{};
  const alerts= analysis.coaching_alerts||[];
  const trend = sm.trend||{};
  const hv = sm.avgHead!=null ? Math.round(sm.avgHead) : '—';
  const sv = sm.avgStability!=null ? Math.round(sm.avgStability) : '—';
  const avgSpeed = sm.avgSpeed!=null ? Number(sm.avgSpeed).toFixed(1) : '—';
  function trendBar(key) {
    const f1 = trend[`first_half_${key}`] || 0;
    const f2 = trend[`second_half_${key}`] || 0;
    const mx=Math.max(f1,f2,1); const w1=Math.round((f1/mx)*100); const w2=Math.round((f2/mx)*100);
    const arr=f2>f1?'↑':f2<f1?'↓':'→'; const ac=f2>f1?'#10B981':f2<f1?'#EF4444':'#EAB308';
    const lbl=key==='speed'?'BAT SPEED (km/h)':key==='head_stability'?'HEAD CONTROL':'BALANCE';
    return `<div class="trend-row"><span class="trend-label">${lbl}</span><div class="trend-halves"><div class="trend-half" style="width:${w1}px;max-width:80px"></div><div class="trend-half second" style="width:${w2}px;max-width:80px"></div></div><span class="trend-arrow" style="color:${ac}">${arr}</span><span class="trend-val">${Math.round(f1||0)} → ${Math.round(f2||0)}</span></div>`;
  }
  const ah = alerts.map((a,i)=>`<div class="report-alert ${a.severity}" style="animation-delay:${i*.1}s"><div class="report-alert-header"><span class="report-alert-sev">${a.severity}</span><span class="report-alert-metric">${a.metric}</span></div><div class="report-alert-msg">${a.message}</div><div class="report-alert-action">▸ ${a.action}</div></div>`).join('');
  const bc=SHOT_COLORS[best.label]||'#10B981'; const wc=SHOT_COLORS[worst.label]||'#EF4444';
  container.innerHTML = `
    <div class="report-section-title">SESSION SCORES</div>
    <div class="report-grid">
      <div class="report-score-card" style="--accent:#06B6D4"><div class="report-score-val" style="color:#06B6D4">${hv}<span style="font-size:.6em">/100</span></div><div class="report-score-lbl">HEAD CONTROL</div></div>
      <div class="report-score-card" style="--accent:#10B981"><div class="report-score-val" style="color:#10B981">${sv}<span style="font-size:.6em">/100</span></div><div class="report-score-lbl">BALANCE</div></div>
      <div class="report-score-card" style="--accent:#F97316"><div class="report-score-val" style="color:#F97316">${avgSpeed}<span style="font-size:.45em">km/h</span></div><div class="report-score-lbl">BAT SPEED (SECONDARY)</div></div>
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
    <div class="report-section-title">SESSION TREND${sm.fatigueDetected?' &nbsp;<span class="fatigue-tag">⚡ FATIGUE DETECTED</span>':''}</div>
    ${trendBar('head_stability')}${trendBar('stability_score')}${trendBar('speed')}
    ${alerts.length?`<div class="report-section-title">COACHING ALERTS</div><div class="report-alerts">${ah}</div>`:''}`;
  container.classList.add('visible');
}

function updateStatRingsFromAnalysis(analysis) {
  if (!analysis) return;
  const sm = getAnalysisSummary(analysis);
  const cfgs = [
    {id:'ring-timing',  pct:Math.min(100,sm.avgHead||89),numVal:Math.round(sm.avgHead||89),suffix:'%',label:'HEAD CTRL'},
    {id:'ring-middling',pct:Math.min(100,sm.avgStability||88),numVal:Math.round(sm.avgStability||88),suffix:'%',label:'BALANCE'},
    {id:'ring-impact',  pct:Math.min(100,((sm.avgSpeed||0)/140)*100),numVal:Math.round(sm.avgSpeed||0),suffix:'km/h',label:'AVG SPEED'},
    {id:'ring-backlift',pct:Math.min(100,(sm.avgShotScore||0)*10),numVal:Number(sm.avgShotScore||0).toFixed(1),suffix:'/10',label:'SHOT SCORE'},
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
  const sm=getAnalysisSummary(analysis);
  const fills=[
    {icon:'🏃',title:'FOOTWORK BREAKDOWN',score:'INFO',cls:'good',body:(()=>{const fw=analysis.footwork_summary||{};const tot=(fw.front_foot_count||0)+(fw.back_foot_count||0)+(fw.neutral_count||0);if(!tot)return'No data.';const fp=Math.round((fw.front_foot_count||0)/tot*100);const bp=Math.round((fw.back_foot_count||0)/tot*100);return`Front foot ${fp}% · Back foot ${bp}% · Neutral ${100-fp-bp}%.`;})()},
    {icon:'📊',title:'SESSION AVERAGES',score:'STATS',cls:'good',body:`Bat Speed: ${(sm.avgSpeed||0).toFixed(1)} km/h · Head: ${Math.round(sm.avgHead||0)}/100 · Balance: ${Math.round(sm.avgStability||0)}/100`},
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
  if (headerAuthHint) {
    headerAuthHint.hidden = false;
    headerAuthHint.textContent = loggedIn
      ? `Role: ${isCoachRole() ? 'coach' : 'player'}`
      : 'Not logged in';
  }
  // Keep role-based app shell switching centralized and always enforced.
  setPlayerAppVisible(!(loggedIn && isCoachRole()));
  if (loggedIn && state.currentUser) {
    const em = state.currentUser.email || '';
    if (headerProfileAvatar) headerProfileAvatar.textContent = (em.trim()[0] || '?').toUpperCase();
    if (headerProfileEmail) headerProfileEmail.textContent = em;
  }
}

function setGateMessage(msg, isError = true) {
  if (!gateMessage) return;
  gateMessage.textContent = msg || '';
  gateMessage.style.color = isError ? '#fda4af' : '#86efac';
}

function setAuthMode(mode) {
  state.authMode = mode === 'signup' ? 'signup' : 'login';
  const signup = state.authMode === 'signup';
  if (signupFields) signupFields.hidden = !signup;
  if (gateTitle) gateTitle.textContent = signup ? 'Create Player Account' : 'CrickEye Login';
  if (gateSubtitle) gateSubtitle.textContent = signup
    ? 'Register to start tracking your cricket sessions.'
    : 'Login to continue your batting analytics.';
  if (gatePrimaryBtn) gatePrimaryBtn.textContent = signup ? 'Create Account' : 'Login';
  if (gateSwitchMode) gateSwitchMode.textContent = signup
    ? 'Already have an account? Login'
    : 'Need an account? Sign up';
  if (gatePassword) gatePassword.autocomplete = signup ? 'new-password' : 'current-password';
  setGateMessage('', true);
}

function setPlayerAppVisible(visible) {
  if (playerAppShell) playerAppShell.hidden = !visible;
  if (coachDashboard) coachDashboard.hidden = visible;
}

function isCoachRole() {
  return String(state.currentRole || '').trim().toLowerCase() === 'coach';
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase() === 'coach' ? 'coach' : 'player';
}

function resolveRole(profile, user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (email && COACH_EMAIL_OVERRIDES.has(email)) return 'coach';
  return normalizeRole(profile?.role);
}

function parseSessionSummary(results) {
  const analysis = getSessionAnalysis(results);
  const ss = analysis?.session_summary || {};
  return {
    avgSpeed: ss.avg_bat_speed_kmh ?? null,
    avgHead: ss.avg_head_stability ?? null,
    avgBalance: ss.avg_stability_score ?? null,
    avgScore: ss.avg_shot_score ?? null,
  };
}

function avg(nums) {
  const vals = nums.filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function fmtNum(v, digits = 1, suffix = '') {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return `${Number(v).toFixed(digits)}${suffix}`;
}

function fmtDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

function renderCoachDashboard(players, sessions) {
  if (!coachStatsRow || !coachPlayersList) return;
  const sessionsByUser = new Map();
  for (const s of sessions || []) {
    const arr = sessionsByUser.get(s.user_id) || [];
    arr.push(s);
    sessionsByUser.set(s.user_id, arr);
  }

  const totalPlayers = (players || []).length;
  const totalSessions = (sessions || []).length;
  const totalCompleted = (sessions || []).filter((s) => s.status === 'completed').length;
  const activeToday = (sessions || []).filter((s) => {
    if (!s.created_at) return false;
    const d = new Date(s.created_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }).length;

  coachStatsRow.innerHTML = `
    <div class="coach-stat"><div class="coach-stat-label">Registered Players</div><div class="coach-stat-value">${totalPlayers}</div></div>
    <div class="coach-stat"><div class="coach-stat-label">Total Sessions</div><div class="coach-stat-value">${totalSessions}</div></div>
    <div class="coach-stat"><div class="coach-stat-label">Completed Sessions</div><div class="coach-stat-value">${totalCompleted}</div></div>
    <div class="coach-stat"><div class="coach-stat-label">Sessions Today</div><div class="coach-stat-value">${activeToday}</div></div>
  `;

  if (!players || !players.length) {
    coachPlayersList.innerHTML = '<div class="session-item-empty">No player profiles found yet.</div>';
    return;
  }

  coachPlayersList.innerHTML = players.map((p) => {
    const rows = (sessionsByUser.get(p.id) || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const completedRows = rows.filter((r) => r.status === 'completed');
    const latest = rows[0];
    const metrics = completedRows.map((r) => parseSessionSummary(r.results));
    const avgSpeed = avg(metrics.map((m) => m.avgSpeed));
    const avgHead = avg(metrics.map((m) => m.avgHead));
    const avgBalance = avg(metrics.map((m) => m.avgBalance));
    const avgScore = avg(metrics.map((m) => m.avgScore));

    return `
      <article class="coach-player-card">
        <div class="coach-player-head">
          <div>
            <h3 class="coach-player-name">${escapeHtml(p.full_name || 'Unnamed Player')}</h3>
            <div class="coach-player-email">${escapeHtml(p.email || '—')}</div>
          </div>
          <span class="coach-player-chip">${escapeHtml((p.gender || '—').replaceAll('_', ' '))} · ${p.age ?? '—'}y</span>
        </div>
        <div class="coach-player-grid">
          <div class="coach-player-metric"><div class="coach-player-metric-label">Sessions</div><div class="coach-player-metric-value">${rows.length}</div></div>
          <div class="coach-player-metric"><div class="coach-player-metric-label">Completed</div><div class="coach-player-metric-value">${completedRows.length}</div></div>
          <div class="coach-player-metric"><div class="coach-player-metric-label">Avg Speed</div><div class="coach-player-metric-value">${fmtNum(avgSpeed, 1, ' km/h')}</div></div>
          <div class="coach-player-metric"><div class="coach-player-metric-label">Avg Score</div><div class="coach-player-metric-value">${fmtNum(avgScore, 1, '/10')}</div></div>
          <div class="coach-player-metric"><div class="coach-player-metric-label">Avg Head</div><div class="coach-player-metric-value">${fmtNum(avgHead, 0, '/100')}</div></div>
          <div class="coach-player-metric"><div class="coach-player-metric-label">Avg Balance</div><div class="coach-player-metric-value">${fmtNum(avgBalance, 0, '/100')}</div></div>
        </div>
        <div class="coach-player-email" style="margin-top:8px">Latest session: ${fmtDate(latest?.created_at)}</div>
      </article>
    `;
  }).join('');
}

async function fetchCoachDashboard() {
  if (!supabaseClient || !state.currentUser || !isCoachRole()) return;
  const { data: profiles, error: profilesError } = await supabaseClient
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (profilesError) {
    if (coachPlayersList) {
      coachPlayersList.innerHTML = `<div class="session-item-empty">Coach profiles read failed: ${escapeHtml(profilesError.message)}</div>`;
    }
    return;
  }

  const { data: sessions, error: sessionsError } = await supabaseClient
    .from('sessions')
    .select('id, user_id, status, created_at, results')
    .order('created_at', { ascending: false });
  if (sessionsError) {
    if (coachPlayersList) {
      coachPlayersList.innerHTML = `<div class="session-item-empty">Coach sessions read failed: ${escapeHtml(sessionsError.message)}</div>`;
    }
    return;
  }

  const profileRows = Array.isArray(profiles) ? profiles : [];
  let playerRows = profileRows.filter((p) =>
    normalizeRole(p?.role) === 'player' && String(p?.id || '') !== String(state.currentUser?.id || '')
  );

  // Fallback: if RLS/profile reads are partial, derive players from sessions.
  if (!playerRows.length) {
    const userIds = [...new Set((sessions || []).map((s) => s.user_id).filter(Boolean))]
      .filter((id) => String(id) !== String(state.currentUser?.id || ''));
    if (userIds.length) {
      const { data: profileByIds } = await supabaseClient
        .from('profiles')
        .select('*')
        .in('id', userIds);
      const byId = new Map((profileByIds || []).map((p) => [String(p.id), p]));
      playerRows = userIds.map((id) => byId.get(String(id)) || ({
        id,
        full_name: `Player ${String(id).slice(0, 8)}`,
        email: 'Profile not visible',
        gender: 'prefer_not_to_say',
        age: null,
        role: 'player',
      }));
    }
  }

  renderCoachDashboard(playerRows, sessions || []);
  // Defensive: if coach dashboard data loaded, force coach shell visible.
  setPlayerAppVisible(false);
}

async function ensureProfile(user, opts = {}) {
  if (!supabaseClient || !user) return null;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    console.error('[CrickEye] profile read error:', error.message);
    return null;
  }
  if (data) return data;

  // Legacy repair path: role/profile may exist by email on a stale id.
  // Re-link it to the currently authenticated user id.
  if (user.email) {
    const { data: byEmail, error: byEmailError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('email', user.email)
      .maybeSingle();
    if (!byEmailError && byEmail) {
      if (byEmail.id !== user.id) {
        const { data: relinked, error: relinkErr } = await supabaseClient
          .from('profiles')
          .update({ id: user.id })
          .eq('id', byEmail.id)
          .select('*')
          .maybeSingle();
        if (relinkErr) {
          console.error('[CrickEye] profile id relink error:', relinkErr.message);
          return byEmail;
        }
        return relinked || { ...byEmail, id: user.id };
      }
      return byEmail;
    }
  }

  if (!opts.allowCreateFallback) return null;

  const fallback = {
    id: user.id,
    full_name: (user.email || 'Player').split('@')[0],
    age: null,
    gender: 'prefer_not_to_say',
    email: user.email || '',
    role: 'player',
  };
  const { error: insertError } = await supabaseClient.from('profiles').insert(fallback);
  if (insertError) {
    console.error('[CrickEye] fallback profile insert error:', insertError.message);
    return null;
  }
  return fallback;
}

async function resolveProfileForUser(user, opts = {}) {
  const byId = await ensureProfile(user, opts);
  if (byId && byId.role) return byId;
  if (!supabaseClient || !user?.email) return byId;

  // Final fallback by email so coach mode cannot silently downgrade.
  const { data: byEmailRows, error: byEmailErr } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('email', user.email)
    .order('created_at', { ascending: false })
    .limit(1);
  if (byEmailErr) {
    console.error('[CrickEye] profile resolve by email error:', byEmailErr.message);
    return byId;
  }
  const byEmail = byEmailRows?.[0] || null;
  return byEmail || byId;
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

function getAnalysisSummary(analysis) {
  const ss = analysis?.session_summary || {};
  const av = analysis?.session_averages || {};
  const tr = ss.trend || analysis?.trend || {};
  const flags = ss.flags_summary || {};
  return {
    shotsConfirmed: ss.shots_confirmed ?? analysis?.shots_confirmed ?? 0,
    shotsTotalDetected: ss.shots_total_detected ?? analysis?.shots_total ?? 0,
    avgSpeed: ss.avg_bat_speed_kmh ?? av.peak_swing_speed ?? null,
    avgHead: ss.avg_head_stability ?? av.head_stability ?? null,
    avgStability: ss.avg_stability_score ?? av.stability_score ?? null,
    avgShotScore: ss.avg_shot_score ?? null,
    fatigueDetected: ss.fatigue_detected ?? analysis?.fatigue_detected ?? false,
    trend: {
      first_half_speed: tr.first_half_speed ?? tr.peak_swing_speed?.first_half ?? null,
      second_half_speed: tr.second_half_speed ?? tr.peak_swing_speed?.second_half ?? null,
      first_half_head_stability: tr.first_half_head_stability ?? tr.head_stability?.first_half ?? null,
      second_half_head_stability: tr.second_half_head_stability ?? tr.head_stability?.second_half ?? null,
      first_half_stability_score: tr.first_half_stability_score ?? tr.stability_score?.first_half ?? null,
      second_half_stability_score: tr.second_half_stability_score ?? tr.stability_score?.second_half ?? null,
    },
    flagsSummary: {
      HEAD_MOVING_count: flags.HEAD_MOVING_count ?? 0,
      UNSTABLE_count: flags.UNSTABLE_count ?? 0,
      FOOTWORK_UNCLEAR_count: flags.FOOTWORK_UNCLEAR_count ?? 0,
    },
  };
}

function getAvgShotScoreFromResults(results) {
  const replay = getSessionReplay(results);
  if (!replay || !Array.isArray(replay.shots)) return null;
  const confirmed = replay.shots.filter((s) => Number(s.conf) > 0.5 && s.shot_score != null && !Number.isNaN(Number(s.shot_score)));
  if (!confirmed.length) return null;
  const sum = confirmed.reduce((acc, s) => acc + Number(s.shot_score || 0), 0);
  return sum / confirmed.length;
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

/** Per-shot rows for compare charts (same shape as ReportModal trendShots). */
function getConfirmedTrendShotsFromResults(results) {
  const replay = getSessionReplay(results);
  if (!replay || !Array.isArray(replay.shots)) return [];
  return replay.shots
    .filter((s) => s.conf > 0.5)
    .map((s) => ({
      shot_num: s.shot_num,
      speed: parseFloat((s.peak_swing_speed || 0).toFixed(1)),
      head: Math.round(s.head_stability || 0),
      stab: Math.round(s.stability_score || 0),
      score: s.shot_score || 0,
    }));
}

let _compareChartGradSeq = 0;

/**
 * Dual area-spline chart (SVG) — same geometry/style as ReportModal.buildLineGraph.
 */
function buildDualLineCompareGraph(seriesA, seriesB, dataKey, colorA, colorB, label, maxVal, legendA, legendB) {
  const W = 520;
  const H = 130;
  const PL = 46;
  const PR = 16;
  const PT = 12;
  const PB = 28;
  const cW = W - PL - PR;
  const cH = H - PT - PB;
  const n = Math.max(seriesA.length, seriesB.length);
  if (n === 0) {
    return `<div class="compare-graph-empty">No per-shot replay data for this session.</div>`;
  }

  const allVals = [];
  seriesA.forEach((s) => allVals.push(Number(s[dataKey]) || 0));
  seriesB.forEach((s) => allVals.push(Number(s[dataKey]) || 0));
  const max = Math.max(maxVal || 0, ...allVals, 1);

  function xAt(i) {
    if (n === 1) return PL + cW / 2;
    return PL + (i / (n - 1)) * cW;
  }

  function buildPts(series) {
    return series.map((s, i) => {
      const x = xAt(i);
      const v = Number(s[dataKey]) || 0;
      const y = PT + cH - Math.max(0, Math.min(1, v / max)) * cH;
      return { x, y, v, lbl: `#${s.shot_num}` };
    });
  }

  const ptsA = buildPts(seriesA);
  const ptsB = buildPts(seriesB);

  function linePath(pts) {
    if (!pts.length) return '';
    return pts.reduce((acc, pt, i) => {
      if (i === 0) return `M${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      const prev = pts[i - 1];
      const cpx = ((prev.x + pt.x) / 2).toFixed(1);
      return `${acc} C${cpx},${prev.y.toFixed(1)} ${cpx},${pt.y.toFixed(1)} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    }, '');
  }

  function areaPath(linePathStr, pts) {
    if (!linePathStr || !pts.length) return '';
    return (
      linePathStr +
      ` L${pts[pts.length - 1].x.toFixed(1)},${(PT + cH).toFixed(1)}` +
      ` L${pts[0].x.toFixed(1)},${(PT + cH).toFixed(1)} Z`
    );
  }

  const pathA = linePath(ptsA);
  const pathB = linePath(ptsB);
  const areaA = areaPath(pathA, ptsA);
  const areaB = areaPath(pathB, ptsB);

  const ticks = [0, 0.5, 1].map((t) => ({
    y: (PT + cH - t * cH).toFixed(1),
    v: Math.round(t * max),
  }));

  const gidA = `cg_${++_compareChartGradSeq}_a`;
  const gidB = `cg_${_compareChartGradSeq}_b`;

  const xLabels = Array.from({ length: n }, (_, i) => ({
    x: xAt(i),
    lbl: `#${i + 1}`,
  }));

  function avgStr(series, digits) {
    if (!series.length) return '—';
    const sum = series.reduce((a, s) => a + (Number(s[dataKey]) || 0), 0);
    return (sum / series.length).toFixed(digits);
  }
  const unit =
    dataKey === 'speed' ? ' km/h' : dataKey === 'score' ? '/10' : '';
  const digits = 1;
  const sub = `Session avg · ${escapeHtml(legendA)}: ${avgStr(seriesA, digits)}${unit} → ${escapeHtml(legendB)}: ${avgStr(seriesB, digits)}${unit}`;

  const grid = ticks
    .map(
      (t) => `
          <line x1="${PL}" y1="${t.y}" x2="${PL + cW}" y2="${t.y}" stroke="rgba(15,23,42,0.08)" stroke-width="1"/>
          <text x="${PL - 6}" y="${t.y}" text-anchor="end" dominant-baseline="central"
            style="font-size:10px;fill:#64748B;font-family:JetBrains Mono,monospace;font-weight:500">${t.v}</text>`
    )
    .join('');

  function shotDots(pts, color) {
    return pts
      .map(
        (pt) => `<g>
      <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="2.5" fill="${color}" opacity="0.14"/>
      <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="1.75" fill="${color}" stroke="#fff" stroke-width="0.75"/>
      <title>${escapeHtml(String(pt.lbl))}: ${escapeHtml(String(pt.v))}</title>
    </g>`
      )
      .join('');
  }

  const xAxis = xLabels
    .map(
      (xl) => `
          <text x="${xl.x.toFixed(1)}" y="${(PT + cH + 16).toFixed(1)}" text-anchor="middle"
            style="font-size:10px;fill:#64748B;font-family:JetBrains Mono,monospace;font-weight:500">${escapeHtml(xl.lbl)}</text>`
    )
    .join('');

  return `
    <div class="compare-trend-card">
      <div class="compare-trend-head">
        <div>
          <div class="compare-graph-title">${escapeHtml(label)}</div>
          <div class="compare-trend-sub">${sub}</div>
        </div>
        <div class="compare-trend-legend">
          <span class="compare-leg-i"><i style="background:${colorA}"></i>${escapeHtml(legendA)}</span>
          <span class="compare-leg-i"><i style="background:${colorB}"></i>${escapeHtml(legendB)}</span>
        </div>
      </div>
      <svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(label)}">
        <defs>
          <linearGradient id="${gidA}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${colorA}" stop-opacity="0.11"/>
            <stop offset="100%" stop-color="${colorA}" stop-opacity="0.02"/>
          </linearGradient>
          <linearGradient id="${gidB}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${colorB}" stop-opacity="0.11"/>
            <stop offset="100%" stop-color="${colorB}" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        ${grid}
        ${areaB ? `<path d="${areaB}" fill="url(#${gidB})"/>` : ''}
        ${areaA ? `<path d="${areaA}" fill="url(#${gidA})"/>` : ''}
        ${pathB ? `<path d="${pathB}" fill="none" stroke="${colorB}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        ${pathA ? `<path d="${pathA}" fill="none" stroke="${colorA}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        ${shotDots(ptsB, colorB)}
        ${shotDots(ptsA, colorA)}
        ${xAxis}
      </svg>
    </div>`;
}

/**
 * Overlay N sessions on one chart. Filled areas only when at most two sessions have shot data (readability).
 * @param {Array<{ series: Array, color: string, legend: string }>} entries
 */
function buildMultiLineCompareGraph(entries, dataKey, label, maxVal) {
  const W = 520;
  const H = 130;
  const PL = 46;
  const PR = 16;
  const PT = 12;
  const PB = 28;
  const cW = W - PL - PR;
  const cH = H - PT - PB;

  const nonEmpty = entries.filter((e) => e.series && e.series.length > 0);
  const n = nonEmpty.length ? Math.max(...nonEmpty.map((e) => e.series.length)) : 0;
  if (n === 0) {
    return `<div class="compare-graph-empty">No per-shot replay data for these sessions.</div>`;
  }

  const allVals = [];
  entries.forEach((e) => {
    (e.series || []).forEach((s) => allVals.push(Number(s[dataKey]) || 0));
  });
  const max = Math.max(maxVal || 0, ...allVals, 1);

  function xAt(i) {
    if (n === 1) return PL + cW / 2;
    return PL + (i / (n - 1)) * cW;
  }

  function buildPts(series) {
    return (series || []).map((s, i) => {
      const x = xAt(i);
      const v = Number(s[dataKey]) || 0;
      const y = PT + cH - Math.max(0, Math.min(1, v / max)) * cH;
      return { x, y, v, lbl: `#${s.shot_num}` };
    });
  }

  const withPts = entries.map((e) => ({
    ...e,
    pts: buildPts(e.series),
  }));

  function linePath(pts) {
    if (!pts.length) return '';
    return pts.reduce((acc, pt, i) => {
      if (i === 0) return `M${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      const prev = pts[i - 1];
      const cpx = ((prev.x + pt.x) / 2).toFixed(1);
      return `${acc} C${cpx},${prev.y.toFixed(1)} ${cpx},${pt.y.toFixed(1)} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    }, '');
  }

  function areaPath(linePathStr, pts) {
    if (!linePathStr || !pts.length) return '';
    return (
      linePathStr +
      ` L${pts[pts.length - 1].x.toFixed(1)},${(PT + cH).toFixed(1)}` +
      ` L${pts[0].x.toFixed(1)},${(PT + cH).toFixed(1)} Z`
    );
  }

  const useAreas = nonEmpty.length <= 2;

  const ticks = [0, 0.5, 1].map((t) => ({
    y: (PT + cH - t * cH).toFixed(1),
    v: Math.round(t * max),
  }));

  const xLabels = Array.from({ length: n }, (_, i) => ({
    x: xAt(i),
    lbl: `#${i + 1}`,
  }));

  const grid = ticks
    .map(
      (t) => `
          <line x1="${PL}" y1="${t.y}" x2="${PL + cW}" y2="${t.y}" stroke="rgba(15,23,42,0.08)" stroke-width="1"/>
          <text x="${PL - 6}" y="${t.y}" text-anchor="end" dominant-baseline="central"
            style="font-size:10px;fill:#64748B;font-family:JetBrains Mono,monospace;font-weight:500">${t.v}</text>`
    )
    .join('');

  function shotDots(pts, color) {
    return pts
      .map(
        (pt) => `<g>
      <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="2.5" fill="${color}" opacity="0.14"/>
      <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="1.75" fill="${color}" stroke="#fff" stroke-width="0.75"/>
      <title>${escapeHtml(String(pt.lbl))}: ${escapeHtml(String(pt.v))}</title>
    </g>`
      )
      .join('');
  }

  const defsChunks = [];
  const areaChunks = [];
  withPts.forEach((e, idx) => {
    const pathStr = linePath(e.pts);
    if (!pathStr || !useAreas) return;
    const gid = `cg_m_${++_compareChartGradSeq}_${idx}`;
    defsChunks.push(`<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${e.color}" stop-opacity="0.11"/>
            <stop offset="100%" stop-color="${e.color}" stop-opacity="0.02"/>
          </linearGradient>`);
    const ar = areaPath(pathStr, e.pts);
    if (ar) areaChunks.push(`<path d="${ar}" fill="url(#${gid})"/>`);
  });

  const lineChunks = [];
  withPts.forEach((e) => {
    const pathStr = linePath(e.pts);
    if (pathStr) {
      lineChunks.push(
        `<path d="${pathStr}" fill="none" stroke="${e.color}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    }
  });

  const dotChunks = [];
  withPts.forEach((e) => {
    if (e.pts.length) dotChunks.push(shotDots(e.pts, e.color));
  });

  const unit = dataKey === 'speed' ? ' km/h' : dataKey === 'score' ? '/10' : '';
  const digits = 1;
  const avgParts = withPts.map((e) => {
    if (!e.series || !e.series.length) {
      return `${escapeHtml(e.legend)}: —`;
    }
    const sum = e.series.reduce((a, s) => a + (Number(s[dataKey]) || 0), 0);
    const avg = (sum / e.series.length).toFixed(digits);
    return `${escapeHtml(e.legend)}: ${avg}${unit}`;
  });
  const sub = `Session avg · ${avgParts.join(' · ')}`;

  const legendHtml = withPts
    .map(
      (e) =>
        `<span class="compare-leg-i" title="${escapeHtml(e.legend)}"><i style="background:${e.color}"></i>${escapeHtml(
          e.legend
        )}</span>`
    )
    .join('');

  const xAxis = xLabels
    .map(
      (xl) => `
          <text x="${xl.x.toFixed(1)}" y="${(PT + cH + 16).toFixed(1)}" text-anchor="middle"
            style="font-size:10px;fill:#64748B;font-family:JetBrains Mono,monospace;font-weight:500">${escapeHtml(xl.lbl)}</text>`
    )
    .join('');

  return `
    <div class="compare-trend-card">
      <div class="compare-trend-head">
        <div>
          <div class="compare-graph-title">${escapeHtml(label)}</div>
          <div class="compare-trend-sub">${sub}</div>
        </div>
        <div class="compare-trend-legend compare-trend-legend--multi">${legendHtml}</div>
      </div>
      <svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(label)}">
        <defs>${defsChunks.join('')}</defs>
        ${grid}
        ${areaChunks.join('')}
        ${lineChunks.join('')}
        ${dotChunks.join('')}
        ${xAxis}
      </svg>
    </div>`;
}

function formatSessionCardSummary(r) {
  if (!r || typeof r !== 'object' || r.error) return '';
  const parts = [];
  const sm = getAnalysisSummary(r);
  if (sm.shotsConfirmed != null) {
    if (sm.shotsTotalDetected && sm.shotsTotalDetected !== sm.shotsConfirmed) parts.push(`${sm.shotsConfirmed}/${sm.shotsTotalDetected} used`);
    else parts.push(`${sm.shotsConfirmed} confirmed shots`);
  }
  if (sm.avgSpeed != null) parts.push(`Avg ${Number(sm.avgSpeed).toFixed(1)} km/h`);
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
    const sm = getAnalysisSummary(r);
    const avgShotScoreResolved = sm.avgShotScore != null ? Number(sm.avgShotScore) : getAvgShotScoreFromResults(session.results);
    const hand = r.session_handedness || '—';
    const stance = r.stance_conf != null ? `${Math.round(Number(r.stance_conf) * 100)}%` : '—';
    metrics += `<section class="session-detail-section"><h3 class="session-detail-h3">Net Session Report</h3>
      <div class="session-metric-grid">
        <div class="session-metric"><span class="session-metric-label">Dominant hand</span><span class="session-metric-val">${escapeHtml(hand)}</span><span class="session-metric-sub">confidence ${escapeHtml(stance)}</span></div>
        <div class="session-metric"><span class="session-metric-label">Shots used</span><span class="session-metric-val">${sm.shotsConfirmed != null ? escapeHtml(String(sm.shotsConfirmed)) : '—'}</span><span class="session-metric-sub">of ${sm.shotsTotalDetected != null ? escapeHtml(String(sm.shotsTotalDetected)) : '—'} detected</span></div>
        <div class="session-metric"><span class="session-metric-label">Avg bat speed</span><span class="session-metric-val">${sm.avgSpeed != null ? escapeHtml(Number(sm.avgSpeed).toFixed(1)) : '—'}</span><span class="session-metric-sub">km/h</span></div>
        <div class="session-metric"><span class="session-metric-label">Head position</span><span class="session-metric-val">${sm.avgHead != null ? escapeHtml(Math.round(Number(sm.avgHead)).toString()) : '—'}</span><span class="session-metric-sub">avg / 100</span></div>
        <div class="session-metric"><span class="session-metric-label">Base & stability</span><span class="session-metric-val">${sm.avgStability != null ? escapeHtml(Math.round(Number(sm.avgStability)).toString()) : '—'}</span><span class="session-metric-sub">avg / 100</span></div>
        <div class="session-metric"><span class="session-metric-label">Shot execution rating</span><span class="session-metric-val">${avgShotScoreResolved != null ? escapeHtml(Number(avgShotScoreResolved).toFixed(1)) : '—'}</span><span class="session-metric-sub">/10</span></div>
      </div></section>`;

    const best = r.best_shot;
    const worst = r.worst_shot;
    if (best || worst) {
      metrics += `<section class="session-detail-section"><h3 class="session-detail-h3">Delivery highlights</h3><div class="session-highlight-row">`;
      if (best && best.label) {
        metrics += `<div class="session-highlight session-highlight--best"><span class="session-highlight-tag">Signature shot</span><strong>${escapeHtml(shotLabelPretty(best.label))}</strong><span class="session-highlight-meta">#${escapeHtml(String(best.shot_num))} · ${escapeHtml(best.timestamp || '')} · rating ${escapeHtml(String(best.shot_score != null ? best.shot_score : '—'))}</span></div>`;
      }
      if (worst && worst.label) {
        metrics += `<div class="session-highlight session-highlight--worst"><span class="session-highlight-tag">Work-on shot</span><strong>${escapeHtml(shotLabelPretty(worst.label))}</strong><span class="session-highlight-meta">#${escapeHtml(String(worst.shot_num))} · ${escapeHtml(worst.timestamp || '')}</span></div>`;
      }
      metrics += '</div></section>';
    }

    const trend = sm.trend;
    if (trend && typeof trend === 'object') {
      const rows = [
        ['Bat speed (km/h)', trend.first_half_speed, trend.second_half_speed],
        ['Head position', trend.first_half_head_stability, trend.second_half_head_stability],
        ['Base & stability', trend.first_half_stability_score, trend.second_half_stability_score],
      ].map(([label, a, b]) => {
        if (a == null && b == null) return '';
        const u1 = a != null ? Number(a).toFixed(1) : '—';
        const u2 = b != null ? Number(b).toFixed(1) : '—';
        return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(u1)}</td><td>${escapeHtml(u2)}</td></tr>`;
      }).join('');
      if (rows) {
        metrics += `<section class="session-detail-section"><h3 class="session-detail-h3">Session momentum (1st vs 2nd half)</h3>
          <table class="session-trend-table"><thead><tr><th>Metric</th><th>1st half</th><th>2nd half</th></tr></thead><tbody>${rows}</tbody></table>
          ${sm.fatigueDetected ? '<p class="session-fatigue-note">Momentum dipped in the second half (possible fatigue/focus drop).</p>' : ''}</section>`;
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
      metrics += `<section class="session-detail-section"><h3 class="session-detail-h3">Coaching focus</h3><ul class="session-alert-list">${lis}</ul></section>`;
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

function sessionLabel(s) {
  const dt = new Date(s.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return `${dt} · ${sessionVideoFilename(s.video_url)}`;
}

/** Completed sessions (for compare dropdowns + date disambiguation). */
function getCompletedSessionsForCompare() {
  return state.sessionsCache
    .filter((s) => (s.status || '').toLowerCase() === 'completed' && getSessionAnalysis(s.results))
    .sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
}

/**
 * Date-only label for compare UI (dropdowns, legends, headers). If several sessions share a calendar day, appends a short time.
 */
function sessionCompareDisplayLabel(session, peerSessions) {
  if (!session) return '—';
  const d = new Date(session.created_at);
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const peers = Array.isArray(peerSessions) ? peerSessions : [];
  const dayKey = d.toDateString();
  const sameDay = peers.filter((p) => p && new Date(p.created_at).toDateString() === dayKey);
  if (sameDay.length <= 1) return dateStr;
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${dateStr}, ${t}`;
}

/** Completed sessions with analysis whose `created_at` falls in the current calendar month (local time). */
function getCompletedSessionsThisMonth(sessions) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return (sessions || [])
    .filter((s) => {
      if ((s.status || '').toLowerCase() !== 'completed') return false;
      if (!getSessionAnalysis(s.results)) return false;
      const created = new Date(s.created_at);
      return created >= start && created <= end;
    })
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

const COMPARE_MULTI_COLORS = [
  '#06B6D4',
  '#10B981',
  '#A855F7',
  '#F97316',
  '#EAB308',
  '#EC4899',
  '#3B82F6',
  '#84CC16',
];

/** Plain-language summary for “this month · all sessions” (first vs last session + alerts + shot flags). */
function buildMonthPlayerInsightHtml(monthSessions, analyses) {
  const n = analyses.length;
  if (n < 2) return '';

  const first = analyses[0];
  const last = analyses[n - 1];

  function sav(r, k) {
    const sm = getAnalysisSummary(r);
    const map = {
      peak_swing_speed: sm.avgSpeed,
      head_stability: sm.avgHead,
      stability_score: sm.avgStability,
    };
    const v = map[k];
    return v != null && !Number.isNaN(Number(v)) ? Number(v) : null;
  }

  let improved = 0;
  let declined = 0;
  const spF = sav(first, 'peak_swing_speed');
  const spL = sav(last, 'peak_swing_speed');
  if (spF != null && spL != null) {
    if (spL - spF > 2) improved += 1;
    else if (spF - spL > 2) declined += 1;
  }
  const hF = sav(first, 'head_stability');
  const hL = sav(last, 'head_stability');
  if (hF != null && hL != null) {
    if (hL - hF > 4) improved += 1;
    else if (hF - hL > 4) declined += 1;
  }
  const stF = sav(first, 'stability_score');
  const stL = sav(last, 'stability_score');
  if (stF != null && stL != null) {
    if (stL - stF > 4) improved += 1;
    else if (stF - stL > 4) declined += 1;
  }
  // Power score removed from backend schema; momentum uses direct speed/head/stability deltas.

  let tone = 'mixed';
  let headline = 'Up and down this month — here is what stood out';
  if (improved >= 3 || (improved >= 2 && declined === 0)) {
    tone = 'up';
    headline = 'You are building momentum this month';
  } else if (declined >= 3 || (declined >= 2 && improved === 0)) {
    tone = 'down';
    headline = 'A tougher stretch — focus on these basics';
  }

  const bullets = [];

  if (spF != null && spL != null && Math.abs(spL - spF) > 1) {
    if (spL >= spF) {
      bullets.push(
        `Bat speed averaged higher in your latest session than at the start of the month (${spF.toFixed(1)} → ${spL.toFixed(1)} km/h).`
      );
    } else {
      bullets.push(
        `Bat speed averaged lower than earlier in the month (${spF.toFixed(1)} → ${spL.toFixed(1)} km/h).`
      );
    }
  } else if (hF != null && hL != null && Math.abs(hL - hF) > 3) {
    bullets.push(
      hL >= hF
        ? `Head discipline scores improved from your first to your latest session this month.`
        : `Head discipline dipped from your first to your latest session — extra ball-watching work will help.`
    );
  }

  const sevOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const allAlerts = [];
  analyses.forEach((r) => (r.coaching_alerts || []).forEach((a) => allAlerts.push(a)));
  allAlerts.sort((x, y) => (sevOrder[x.severity] ?? 9) - (sevOrder[y.severity] ?? 9));
  const seenMetric = new Set();
  let coachingAdded = 0;
  for (const a of allAlerts) {
    const m = a.metric || 'Session note';
    if (seenMetric.has(m)) continue;
    seenMetric.add(m);
    let msg = (a.message || '').replace(/\s+/g, ' ').trim();
    if (!msg) continue;
    if (msg.length > 130) msg = `${msg.slice(0, 127)}…`;
    bullets.push(`${m}: ${msg}`);
    coachingAdded += 1;
    if (coachingAdded >= 2) break;
  }

  const fatN = analyses.filter((x) => getAnalysisSummary(x).fatigueDetected).length;
  if (fatN >= 2) {
    bullets.push(
      `In ${fatN} of ${n} sessions, bat speed fell in the second half — shorter blocks or a quick break mid-session can help.`
    );
  } else if (fatN === 1) {
    bullets.push(`One session showed late-session fade — try a short pause between net blocks.`);
  }

  let headFlags = 0;
  let unstableFlags = 0;
  let totalShots = 0;
  monthSessions.forEach((s) => {
    const replay = getSessionReplay(s.results);
    if (!replay?.shots) return;
    for (const sh of replay.shots) {
      if (Number(sh.conf) <= 0.5) continue;
      totalShots += 1;
      for (const f of sh.flags || []) {
        const base = String(f).split(':')[0];
        if (base === 'HEAD_MOVING') headFlags += 1;
        if (base === 'UNSTABLE') unstableFlags += 1;
      }
    }
  });

  if (totalShots > 0) {
    const hp = Math.round((headFlags / totalShots) * 100);
    if (hp >= 30) {
      bullets.push(
        `Head movement was flagged on about ${hp}% of your shots this month — stay still through contact.`
      );
    }
    const up = Math.round((unstableFlags / totalShots) * 100);
    if (up >= 30) {
      bullets.push(
        `Balance issues showed up on about ${up}% of shots — widen your base slightly and stay tall.`
      );
    }
  }

  const deduped = [];
  const keys = new Set();
  for (const b of bullets) {
    const k = b.slice(0, 48).toLowerCase();
    if (keys.has(k)) continue;
    keys.add(k);
    deduped.push(b);
    if (deduped.length >= 5) break;
  }

  if (!deduped.length) {
    deduped.push('Keep recording sessions this month so trends and tips get sharper over time.');
  }

  const sub = `Compared your first session (${escapeHtml(
    sessionCompareDisplayLabel(monthSessions[0], monthSessions)
  )}) with your latest (${escapeHtml(sessionCompareDisplayLabel(monthSessions[n - 1], monthSessions))}).`;

  const lis = deduped.map((b) => `<li>${escapeHtml(b)}</li>`).join('');

  return `
    <section class="compare-month-insight compare-month-insight--${tone}" aria-label="Monthly summary">
      <div class="compare-month-insight-kicker">Your month at a glance</div>
      <h3 class="compare-month-insight-title">${escapeHtml(headline)}</h3>
      <p class="compare-month-insight-sub">${sub}</p>
      <ul class="compare-month-insight-list">${lis}</ul>
    </section>`;
}

function renderSessionComparison(sessionA, sessionB) {
  if (!sessionCompareBody) return;
  const completedPeers = getCompletedSessionsForCompare();
  if (!sessionA || !sessionB || sessionA.id === sessionB.id) {
    sessionCompareBody.innerHTML =
      '<p class="session-item-empty">Pick two different completed sessions to compare.</p>';
    return;
  }

  const a = getSessionAnalysis(sessionA?.results);
  const b = getSessionAnalysis(sessionB?.results);
  if (!a || !b || a.error || b.error) {
    sessionCompareBody.innerHTML =
      '<p class="session-item-empty">Selected sessions need completed analysis results.</p>';
    return;
  }

  const seriesA = getConfirmedTrendShotsFromResults(sessionA.results);
  const seriesB = getConfirmedTrendShotsFromResults(sessionB.results);

  if (!seriesA.length && !seriesB.length) {
    const bestA = a.best_shot?.label ? shotLabelPretty(a.best_shot.label) : '—';
    const bestB = b.best_shot?.label ? shotLabelPretty(b.best_shot.label) : '—';
    sessionCompareBody.innerHTML = `
    <div class="compare-header-row">
      <div><strong>Session 1:</strong> ${escapeHtml(sessionCompareDisplayLabel(sessionA, completedPeers))}</div>
      <div><strong>Session 2:</strong> ${escapeHtml(sessionCompareDisplayLabel(sessionB, completedPeers))}</div>
    </div>
    <p class="session-item-empty">No per-shot replay data in these session records, so trend charts cannot be drawn. Re-run analysis and ensure results include shot replay, or compare sessions processed with the current pipeline.</p>
    <div class="compare-meta-row">
      <div><span class="compare-meta-k">Best shot (S1):</span> ${escapeHtml(bestA)}</div>
      <div><span class="compare-meta-k">Best shot (S2):</span> ${escapeHtml(bestB)}</div>
    </div>`;
    return;
  }

  const colorA = '#06B6D4';
  const colorB = '#10B981';
  const legendA = sessionCompareDisplayLabel(sessionA, completedPeers);
  const legendB = sessionCompareDisplayLabel(sessionB, completedPeers);

  const charts = [
    buildDualLineCompareGraph(
      seriesA,
      seriesB,
      'speed',
      colorA,
      colorB,
      'Bat Speed (km/h) — calibrated bat tip speed across shots',
      140,
      legendA,
      legendB
    ),
    buildDualLineCompareGraph(
      seriesA,
      seriesB,
      'head',
      colorA,
      colorB,
      'Head Control (0–100) — stillness of head through stroke',
      100,
      legendA,
      legendB
    ),
    buildDualLineCompareGraph(
      seriesA,
      seriesB,
      'stab',
      colorA,
      colorB,
      'Stability Score (0–100) — body balance and minimal sway',
      100,
      legendA,
      legendB
    ),
    buildDualLineCompareGraph(
      seriesA,
      seriesB,
      'score',
      colorA,
      colorB,
      'Overall Shot Score (/10) — composite quality rating per shot',
      10,
      legendA,
      legendB
    ),
  ].join('');

  const bestA = a.best_shot?.label ? shotLabelPretty(a.best_shot.label) : '—';
  const bestB = b.best_shot?.label ? shotLabelPretty(b.best_shot.label) : '—';

  sessionCompareBody.innerHTML = `
    <div class="compare-header-row">
      <div><strong>Session 1:</strong> ${escapeHtml(sessionCompareDisplayLabel(sessionA, completedPeers))}</div>
      <div><strong>Session 2:</strong> ${escapeHtml(sessionCompareDisplayLabel(sessionB, completedPeers))}</div>
    </div>
    <div class="compare-trends-stack">${charts}</div>
    <div class="compare-meta-row">
      <div><span class="compare-meta-k">Best shot (S1):</span> ${escapeHtml(bestA)}</div>
      <div><span class="compare-meta-k">Best shot (S2):</span> ${escapeHtml(bestB)}</div>
    </div>
  `;
}

function updateCompareMonthButton() {
  if (!compareThisMonthBtn) return;
  const monthSessions = getCompletedSessionsThisMonth(state.sessionsCache);
  const n = monthSessions.length;
  if (n < 2) {
    compareThisMonthBtn.disabled = true;
    compareThisMonthBtn.textContent = 'This month · all sessions';
    compareThisMonthBtn.title =
      'Complete at least two sessions this calendar month with saved results to overlay trends.';
  } else {
    compareThisMonthBtn.disabled = false;
    compareThisMonthBtn.textContent = `This month · all sessions (${n})`;
    compareThisMonthBtn.title = `Overlay shot-by-shot trends for all ${n} completed sessions from this month.`;
  }
}

function renderMonthSessionsComparison() {
  if (!sessionCompareBody) return;
  const monthSessions = getCompletedSessionsThisMonth(state.sessionsCache);
  if (monthSessions.length < 2) {
    sessionCompareBody.innerHTML =
      '<p class="session-item-empty">Need at least two completed sessions from this calendar month.</p>';
    return;
  }

  const analyses = monthSessions.map((s) => getSessionAnalysis(s.results));
  if (analyses.some((a) => !a || a.error)) {
    sessionCompareBody.innerHTML =
      '<p class="session-item-empty">Some sessions are missing valid analysis results.</p>';
    return;
  }

  const bannerTitle = `${new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · ${monthSessions.length} sessions`;

  const seriesList = monthSessions.map((s) => getConfirmedTrendShotsFromResults(s.results));
  if (seriesList.every((ser) => !ser.length)) {
    const meta = monthSessions
      .map((s, i) => {
        const r = analyses[i];
        const best = r.best_shot?.label ? shotLabelPretty(r.best_shot.label) : '—';
        return `<div><span class="compare-meta-k">${escapeHtml(sessionCompareDisplayLabel(s, monthSessions))}</span><span class="compare-meta-note">Best: ${escapeHtml(best)}</span></div>`;
      })
      .join('');
    sessionCompareBody.innerHTML = `
      <div class="compare-view-banner">
        <button type="button" class="ce-btn ce-btn--ghost compare-back-pair-btn" data-compare-back>← Two-session compare</button>
        <span class="compare-view-banner-title">${escapeHtml(bannerTitle)}</span>
      </div>
      ${buildMonthPlayerInsightHtml(monthSessions, analyses)}
      <p class="session-item-empty">No per-shot replay data for any of these sessions, so charts cannot be drawn.</p>
      <div class="compare-meta-row compare-meta-row--month">${meta}</div>`;
    return;
  }

  const entries = monthSessions.map((s, i) => ({
    series: seriesList[i],
    color: COMPARE_MULTI_COLORS[i % COMPARE_MULTI_COLORS.length],
    legend: sessionCompareDisplayLabel(s, monthSessions),
  }));

  const charts = [
    buildMultiLineCompareGraph(
      entries,
      'speed',
      'Bat Speed (km/h) — calibrated bat tip speed across shots',
      140
    ),
    buildMultiLineCompareGraph(entries, 'head', 'Head Control (0–100) — stillness of head through stroke', 100),
    buildMultiLineCompareGraph(entries, 'stab', 'Stability Score (0–100) — body balance and minimal sway', 100),
    buildMultiLineCompareGraph(entries, 'score', 'Overall Shot Score (/10) — composite quality rating per shot', 10),
  ].join('');

  const bestCells = monthSessions
    .map((s, i) => {
      const r = analyses[i];
      const best = r.best_shot?.label ? shotLabelPretty(r.best_shot.label) : '—';
      return `<div><span class="compare-meta-k">Best shot</span> ${escapeHtml(best)}<span class="compare-meta-note">${escapeHtml(
        sessionCompareDisplayLabel(s, monthSessions)
      )}</span></div>`;
    })
    .join('');

  sessionCompareBody.innerHTML = `
    <div class="compare-view-banner">
      <button type="button" class="ce-btn ce-btn--ghost compare-back-pair-btn" data-compare-back>← Two-session compare</button>
      <span class="compare-view-banner-title">${escapeHtml(bannerTitle)}</span>
    </div>
    ${buildMonthPlayerInsightHtml(monthSessions, analyses)}
    <div class="compare-trends-stack">${charts}</div>
    <div class="compare-meta-row compare-meta-row--month">${bestCells}</div>
  `;
}

function refreshCompareSessionOptions() {
  if (!compareSessionA || !compareSessionB) {
    updateCompareMonthButton();
    return;
  }
  const completed = getCompletedSessionsForCompare();

  if (!completed.length) {
    compareSessionA.innerHTML = '<option value="">No completed sessions</option>';
    compareSessionB.innerHTML = '<option value="">No completed sessions</option>';
    if (sessionCompareBody) {
      sessionCompareBody.innerHTML = '<p class="session-item-empty">No completed sessions available for comparison yet.</p>';
    }
    updateCompareMonthButton();
    return;
  }

  if (completed.length < 2) {
    const opt = `<option value="${escapeHtml(completed[0].id)}">${escapeHtml(sessionCompareDisplayLabel(completed[0], completed))}</option>`;
    compareSessionA.innerHTML = opt;
    compareSessionB.innerHTML = opt;
    if (sessionCompareBody) {
      sessionCompareBody.innerHTML =
        '<p class="session-item-empty">You need at least two completed sessions to compare. Run another analysis first.</p>';
    }
    updateCompareMonthButton();
    return;
  }

  const options = completed
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(sessionCompareDisplayLabel(s, completed))}</option>`)
    .join('');
  compareSessionA.innerHTML = options;
  compareSessionB.innerHTML = options;

  compareSessionA.value = completed[Math.min(1, completed.length - 1)].id;
  compareSessionB.value = completed[0].id;

  const a = completed.find((s) => s.id === compareSessionA.value);
  const b = completed.find((s) => s.id === compareSessionB.value);
  if (a && b) renderSessionComparison(a, b);
  updateCompareMonthButton();
}

function openSessionCompareModal() {
  refreshCompareSessionOptions();
  openModal(sessionCompareModal);
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
    closeModal(sessionCompareModal);
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
  refreshCompareSessionOptions();
}

async function fetchUserSessions() {
  if (!supabaseClient || !state.currentUser) {
    renderSessions([]);
    return;
  }
  if (isCoachRole()) {
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
    setGateMessage(msg, true);
    return;
  }
  if (state.authMode !== 'signup') {
    setAuthMode('signup');
    return;
  }
  const fullName = (gateFullName?.value || '').trim();
  const ageVal = gateAge?.value ? Number(gateAge.value) : null;
  const gender = (gateGender?.value || '').trim();
  const email = (gateEmail?.value || '').trim();
  const password = (gatePassword?.value || '').trim();
  if (!fullName || !email || !password || !gender || !ageVal) {
    setGateMessage('Fill all signup fields: name, age, gender, email, password.', true);
    return;
  }
  if (!Number.isInteger(ageVal) || ageVal < 8 || ageVal > 100) {
    setGateMessage('Age must be a whole number between 8 and 100.', true);
    return;
  }
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    setGateMessage(error.message, true);
    return;
  }
  const newUser = data?.user || null;
  if (newUser) {
    const { error: profileError } = await supabaseClient.from('profiles').upsert({
      id: newUser.id,
      full_name: fullName,
      age: ageVal,
      gender,
      email,
      role: 'player',
    });
    if (profileError) {
      setGateMessage(`Signup succeeded but profile save failed: ${profileError.message}`, true);
      return;
    }
  }
  setGateMessage('Signup successful. Please login.', false);
  setAuthMode('login');
  if (gatePassword) gatePassword.value = '';
}

async function login() {
  if (!supabaseClient) {
    const msg = 'Supabase not ready. Check backend/.env and console.';
    setGateMessage(msg, true);
    return;
  }
  if (state.authMode !== 'login') {
    setAuthMode('login');
    return;
  }
  const email = (gateEmail?.value || '').trim();
  const password = (gatePassword?.value || '').trim();
  if (!email || !password) {
    setGateMessage('Enter email and password.', true);
    return;
  }
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    setGateMessage(error.message, true);
    return;
  }
  const { data } = await supabaseClient.auth.getUser();
  state.currentUser = data?.user || null;
  state.currentProfile = await resolveProfileForUser(state.currentUser, { allowCreateFallback: true });
  state.currentRole = resolveRole(state.currentProfile, state.currentUser);
  setGateMessage('', true);
  setPlayerAppVisible(!isCoachRole());
  updateAuthUi();
  if (isCoachRole()) {
    await fetchCoachDashboard();
  } else {
    await fetchUserSessions();
  }
}

async function logout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  state.currentUser = null;
  state.currentProfile = null;
  state.currentRole = 'player';
  updateAuthUi();
  setPlayerAppVisible(true);
  renderSessions([]);
  setGateMessage('Logged out.', false);
  closeModal(profileModal);
}

async function initAuth() {
  if (!supabaseClient) {
    if (headerAuthHint) headerAuthHint.hidden = false;
    if (headerProfileBtn) headerProfileBtn.hidden = true;
    if (gateMessage && !gateMessage.textContent) {
      setGateMessage('Add Supabase keys to backend/.env, restart uvicorn, then hard-refresh (Ctrl+Shift+R).', true);
    }
    return;
  }
  if (headerAuthHint) headerAuthHint.hidden = true;
  const { data } = await supabaseClient.auth.getUser();
  state.currentUser = data?.user || null;
  state.currentProfile = await resolveProfileForUser(state.currentUser, { allowCreateFallback: !!state.currentUser });
  state.currentRole = resolveRole(state.currentProfile, state.currentUser);
  setPlayerAppVisible(!isCoachRole());
  updateAuthUi();
  if (state.currentUser) {
    if (isCoachRole()) await fetchCoachDashboard();
    else await fetchUserSessions();
  }
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

    const sm = getAnalysisSummary(state.sessionAnalysis);
    let avgScore = sm.avgShotScore != null ? sm.avgShotScore : null;
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
  if (batsmanLabel) {
    if (handLabel==='LHB')      {batsmanLabel.textContent='Left-Handed';  batsmanLabel.style.color='#F97316';}
    else if (handLabel==='RHB') {batsmanLabel.textContent='Right-Handed'; batsmanLabel.style.color='#F97316';}
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
  WagonWheel.drawSpoke(
    spoke.label,
    Number(spoke.msg?.shot_score || 0),
    Number(spoke.msg?.head_stability || 0),
    Number(spoke.msg?.peak_swing_speed || 0),
    () => {
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
  gatePrimaryBtn?.addEventListener('click', () => {
    if (state.authMode === 'signup') signup();
    else login();
  });
  gateSwitchMode?.addEventListener('click', () => {
    setAuthMode(state.authMode === 'signup' ? 'login' : 'signup');
  });
  coachLogoutBtn?.addEventListener('click', () => { logout(); });
  wireModalDismissals();
  headerProfileBtn?.addEventListener('click', () => {
    fillProfileModal();
    openModal(profileModal);
  });
  profileLogoutBtn?.addEventListener('click', () => { logout(); });
  openSessionCompareBtn?.addEventListener('click', openSessionCompareModal);
  compareSessionA?.addEventListener('change', () => {
    const a = state.sessionsCache.find((s) => s.id === compareSessionA.value);
    const b = state.sessionsCache.find((s) => s.id === compareSessionB?.value);
    if (a && b) renderSessionComparison(a, b);
  });
  compareSessionB?.addEventListener('change', () => {
    const a = state.sessionsCache.find((s) => s.id === compareSessionA?.value);
    const b = state.sessionsCache.find((s) => s.id === compareSessionB.value);
    if (a && b) renderSessionComparison(a, b);
  });
  compareThisMonthBtn?.addEventListener('click', renderMonthSessionsComparison);
  sessionCompareBody?.addEventListener('click', (e) => {
    const back = e.target.closest('[data-compare-back]');
    if (!back) return;
    const a = state.sessionsCache.find((s) => s.id === compareSessionA?.value);
    const b = state.sessionsCache.find((s) => s.id === compareSessionB?.value);
    if (a && b) renderSessionComparison(a, b);
  });
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
  setAuthMode('login');
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