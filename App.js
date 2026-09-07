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
const QUALITY_COLORS = {
  'Top class': '#10B981',
  Good: '#06B6D4',
  Average: '#EAB308',
  Poor: '#EF4444',
  // legacy
  OK: '#EAB308',
  'Needs work': '#EF4444',
  Excellent: '#10B981',
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
const headerVerdictPills = Array.from(document.querySelectorAll('.verdict-pill'));
const headerStatusBadge = document.querySelector('.status-badge');
const headerSessionInfo = document.querySelector('.session-info');
const shotCount        = document.getElementById('shotCount');
const overTableBody    = document.getElementById('overTableBody');
const btnClearWheel    = document.getElementById('btnClearWheel');
const btnNewCapture    = document.getElementById('btnNewCapture');
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
const clearAllSessionsBtn = document.getElementById('clearAllSessionsBtn');
const resetEverythingBtn = document.getElementById('resetEverythingBtn');
const resetEverythingModal = document.getElementById('resetEverythingModal');
const resetEverythingLead = document.getElementById('resetEverythingLead');
const resetEverythingOrigin = document.getElementById('resetEverythingOrigin');
const resetEverythingLogoutBtn = document.getElementById('resetEverythingLogoutBtn');
const sessionCompareModal = document.getElementById('sessionCompareModal');
const playCardDetailModal = document.getElementById('playCardDetailModal');
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
const coachStatsRow         = document.getElementById('coachStatsRow');
const coachDashboardToolbar = document.getElementById('coachDashboardToolbar');
const coachPlayersList      = document.getElementById('coachPlayersList');
const coachLogoutBtn        = document.getElementById('coachLogoutBtn');

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
      const av = cfg.analysisCacheVersion;
      if (typeof av === 'number' && !Number.isNaN(av)) {
        state.analysisCacheVersion = av;
      }
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
  /** From analysis / WebSocket `complete` — drives overlay frame index. */
  videoFps:              30,
  /** SHA-256 hex for current run; used on save so cache can find this session later. */
  pendingAnalysisFileHash: null,
  /** Coach dashboard: include players with hidden_from_coach_dashboard. */
  showHiddenCoachPlayers: false,
  coachPlayersRaw: null,
  coachSessionsRaw: null,
  /** When set, Session Comparison modal uses this list instead of sessionsCache (coach per-player). */
  coachCompareSessions: null,
  coachComparePlayerLabel: null,
  compareSessionLabelOverrides: null,
  coachDashboardView: 'players',
  /** Dedupe BallAnalytics.setPlaybackVisibility calls during video timeupdate (vs last computed shot cap). */
  ballPlaybackCap: -1,
  /**
   * From GET /api/public-config → analysisCacheVersion (pipeline_cache_version.py).
   * Replay cache only hits when this matches saved results.analysis_cache_version.
   */
  analysisCacheVersion: null,
};

const SPEEDS = [1, 1.5, 0.5, 0.25];

/** Loads current pipeline cache version from the FastAPI backend (no manual JS bump). */
async function refreshAnalysisCacheVersion() {
  try {
    const res = await fetch('/api/public-config');
    if (!res.ok) return;
    const cfg = await res.json();
    const v = cfg.analysisCacheVersion;
    if (typeof v === 'number' && !Number.isNaN(v)) {
      state.analysisCacheVersion = v;
    }
  } catch (e) {
    console.warn('[CrickEye] Could not load analysisCacheVersion:', e);
  }
}

function getResultsAnalysisCacheVersion(results) {
  if (!results || typeof results !== 'object') return null;
  const v = results.analysis_cache_version;
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}

/**
 * Saved rows must match the server's current pipeline_cache_version.py value.
 * If the server version is unknown (fetch failed), do not replay.
 */
function isReplayCacheFresh(results) {
  if (state.analysisCacheVersion == null) return false;
  return getResultsAnalysisCacheVersion(results) === state.analysisCacheVersion;
}

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
      <div class="proc-live-shots" id="procLiveShots"></div>
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
  const headQ = shot.head_quality_score != null ? Math.round(Number(shot.head_quality_score)) : 40;
  const headApprox = shot.head_confidence && shot.head_confidence !== 'measured';
  const sym = shot.symmetry_score != null ? Math.round(Number(shot.symmetry_score)) : null;
  const swingI = shot.swing_path_score != null ? Math.round(Number(shot.swing_path_score)) : null;
  const fwScore = shot.footwork_score != null ? Math.round(Number(shot.footwork_score)) : null;

  const headLabel = shot.head_quality_label || '';
  const symLabel = shot.symmetry_label || (sym != null ? '' : 'No data');
  const swingLabel = shot.swing_path_label || (swingI != null ? '' : 'No data');
  const fwLabel = shot.footwork_label || (fwScore != null ? '' : 'No data');

  const metricColor = (v) => v >= 70 ? '#10B981' : v >= 45 ? '#EAB308' : '#EF4444';
  const headCol = headQ != null ? metricColor(headQ) : '#64748B';
  const symCol = sym != null ? metricColor(sym) : '#64748B';
  const swingCol = swingI != null ? metricColor(swingI) : '#64748B';
  const fwCol = fwScore != null ? metricColor(fwScore) : '#64748B';

  const feetBadge = shot.feet_active
    ? '<span class="biomech-feet-inline biomech-feet-inline--ok">&#10003; Feet moving</span>'
    : '<span class="biomech-feet-inline biomech-feet-inline--quiet">&#10007; Quiet feet</span>';
  const plantTxt = shot.plant_timing != null
    ? (Math.abs(shot.plant_timing) <= 4 ? 'On time' : shot.plant_timing > 0 ? 'Foot late' : 'Early')
    : '—';

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
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span class="biomech-quality-badge" style="background:${qcolor}18;color:${qcolor}">${shot.shot_quality||'—'}</span>
      </div>
    </div>
    <div class="biomech-metrics">
      <div class="biomech-metric">
        <span class="biomech-metric-val" style="color:${headCol}${headApprox?';opacity:0.65':''}">${headApprox?'~':''}${headQ}</span>
        <span class="biomech-metric-title">Head position</span>
        <span class="biomech-metric-desc">${escapeHtml(headLabel)}</span>
      </div>
      <div class="biomech-metric">
        <span class="biomech-metric-val" style="color:${fwCol}">${fwScore ?? '—'}</span>
        <span class="biomech-metric-title">Foot movement</span>
        <span class="biomech-metric-desc">${escapeHtml(fwLabel)}</span>
      </div>
      <div class="biomech-metric-sub">${feetBadge}<span class="biomech-metric-sub-sep">·</span>${plantTxt}</div>
      <div class="biomech-metric">
        <span class="biomech-metric-val" style="color:${symCol}">${sym ?? '—'}</span>
        <span class="biomech-metric-title">Batting stance</span>
        <span class="biomech-metric-desc">${escapeHtml(symLabel)}</span>
      </div>
      <div class="biomech-metric">
        <span class="biomech-metric-val" style="color:${swingCol}">${swingI ?? '—'}</span>
        <span class="biomech-metric-title">Swing arc</span>
        <span class="biomech-metric-desc">${escapeHtml(swingLabel)}</span>
      </div>
    </div>
    <div class="biomech-posture-row">
      Bat control: <strong>${{consistent:'Smooth',cramped:'Cramped',reaching:'Over-hit',marginal:'Tight',unknown:'Needs work'}[shot.elbow_collapse] || 'Needs work'}</strong>
    </div>
    <div class="biomech-score-row">
      <span class="biomech-score-label">Shot score</span>
      <div class="biomech-score-track"><div class="biomech-score-fill" style="width:${score*10}%;background:${sc}"></div></div>
      <span class="biomech-score-num">${score}<span class="biomech-score-denom">/10</span></span>
    </div>`;
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
    { min: 8.0, count: 5, label: 'TOP CLASS', color: '#10B981' },
    { min: 6.0, count: 4, label: 'GOOD',      color: '#06B6D4' },
    { min: 4.0, count: 3, label: 'AVERAGE',   color: '#EAB308' },
    { min: 2.0, count: 2, label: 'BELOW PAR', color: '#F97316' },
    { min: 0,   count: 1, label: 'POOR',      color: '#EF4444' },
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
  const alerts= analysis.coaching_alerts||[];
  const trend = sm.trend||{};
  const hv = sm.avgHead!=null ? Math.round(sm.avgHead) : '—';
  const sv = sm.avgStability!=null ? Math.round(sm.avgStability) : '—';
  const fv = sm.avgFootwork!=null ? Math.round(sm.avgFootwork) : '—';
  const siv = sm.avgSwingIntensity!=null ? Math.round(sm.avgSwingIntensity) : '—';
  const spv = sm.avgSwingPath!=null ? Math.round(sm.avgSwingPath) : '—';
  const exv = sm.avgExecution!=null ? Math.round(sm.avgExecution) : '—';
  function trendBar(key) {
    const f1 = trend[`first_half_${key}`] || 0;
    const f2 = trend[`second_half_${key}`] || 0;
    const mx=Math.max(f1,f2,1); const w1=Math.round((f1/mx)*100); const w2=Math.round((f2/mx)*100);
    const arr=f2>f1?'↑':f2<f1?'↓':'→'; const ac=f2>f1?'#10B981':f2<f1?'#EF4444':'#EAB308';
    const LBL = {
      head_quality_score: 'HEAD POSITION',
      symmetry_score: 'BATTING STANCE',
      footwork_score: 'FOOT MOVEMENT',
      swing_path_score: 'SWING ARC',
      execution_score: 'SHOT EXECUTION',
      swing_intensity: 'SWING INTENSITY',
    };
    const lbl = LBL[key] || key;
    return `<div class="trend-row"><span class="trend-label">${lbl}</span><div class="trend-halves"><div class="trend-half" style="width:${w1}px;max-width:80px"></div><div class="trend-half second" style="width:${w2}px;max-width:80px"></div></div><span class="trend-arrow" style="color:${ac}">${arr}</span><span class="trend-val">${Math.round(f1||0)} → ${Math.round(f2||0)}</span></div>`;
  }
  const ah = alerts.map((a,i)=>`<div class="report-alert ${a.severity}" style="animation-delay:${i*.1}s"><div class="report-alert-header"><span class="report-alert-sev">${escapeHtml(a.severity)}</span><span class="report-alert-metric">${escapeHtml(a.metric)}</span></div><div class="report-alert-msg">${escapeHtml(a.message)}</div>${a.player_cue ? `<div class="report-alert-cue">${escapeHtml(a.player_cue)}</div>` : ''}${a.drill ? `<div class="report-alert-drill">▸ ${escapeHtml(a.drill)}</div>` : (a.action ? `<div class="report-alert-action">▸ ${escapeHtml(a.action)}</div>` : '')}</div>`).join('');
  const bc=SHOT_COLORS[best.label]||'#10B981'; const wc=SHOT_COLORS[worst.label]||'#EF4444';
  container.innerHTML = `
    <div class="report-section-title">SESSION SCORES</div>
    <div class="report-grid">
      <div class="report-score-card" style="--accent:#06B6D4"><div class="report-score-val" style="color:#06B6D4">${hv}<span style="font-size:.6em">/100</span></div><div class="report-score-lbl">Head position</div></div>
      <div class="report-score-card" style="--accent:#0891B2"><div class="report-score-val" style="color:#0891B2">${fv}<span style="font-size:.6em">/100</span></div><div class="report-score-lbl">Foot movement</div></div>
      <div class="report-score-card" style="--accent:#10B981"><div class="report-score-val" style="color:#10B981">${sv}<span style="font-size:.6em">/100</span></div><div class="report-score-lbl">Batting stance</div></div>
      <div class="report-score-card" style="--accent:#8B5CF6"><div class="report-score-val" style="color:#8B5CF6">${spv}<span style="font-size:.6em">/100</span></div><div class="report-score-lbl">Swing arc</div></div>
      <div class="report-score-card" style="--accent:#F97316"><div class="report-score-val" style="color:#F97316">${exv}<span style="font-size:.6em">/100</span></div><div class="report-score-lbl">Shot execution</div></div>
    </div>
    <p class="report-diag-hint" style="font-size:0.78rem;color:#94A3B8;margin:0 0 8px;line-height:1.4">Swing intensity cue: ${escapeHtml(String(best.swing_intensity_label || 'Measured swing'))}</p>
    <div class="report-section-title">HIGHLIGHTS</div>
    <div class="report-highlight-row">
      <div class="report-highlight"><div class="report-highlight-icon">🔥</div><div><div class="report-highlight-title">BEST SHOT</div><div class="report-highlight-val" style="color:${bc}">#${best.shot_num} ${(SHOT_LABELS[best.label]||best.label||'—').toUpperCase()}</div><div class="report-highlight-sub">Score: ${best.shot_score}/10 · ${best.shot_quality} · ${best.timestamp}</div></div></div>
      <div class="report-highlight"><div class="report-highlight-icon">⚠️</div><div><div class="report-highlight-title">WORST SHOT</div><div class="report-highlight-val" style="color:${wc}">#${worst.shot_num} ${(SHOT_LABELS[worst.label]||worst.label||'—').toUpperCase()}</div><div class="report-highlight-sub">Score: ${worst.shot_score}/10 · ${worst.shot_quality} · ${worst.timestamp}</div></div></div>
    </div>
    <div class="report-section-title">SESSION TREND${sm.fatigueDetected?' &nbsp;<span class="fatigue-tag">⚡ FATIGUE DETECTED</span>':''}</div>
    ${trendBar('head_quality_score')}${trendBar('symmetry_score')}${trendBar('footwork_score')}${trendBar('swing_path_score')}${trendBar('execution_score')}
    <p class="report-per-shot-hint" style="font-size:0.78rem;color:#64748B;margin:10px 0 0;line-height:1.45">Per-delivery cues and flags are in <strong>Net Session Report → All Deliveries</strong>.</p>
    ${alerts.length?`<div class="report-section-title">COACHING ALERTS</div><div class="report-alerts">${ah}</div>`:''}`;
  container.classList.add('visible');
}

function updateStatRingsFromAnalysis(analysis) {
  if (!analysis) return;
  const sm = getAnalysisSummary(analysis);
  const cfgs = [
    {id:'ring-timing',  pct: sm.avgHead != null ? Math.min(100, Number(sm.avgHead)) : 0, numVal: sm.avgHead != null ? Math.round(sm.avgHead) : '—', suffix:'/100', label:'HEAD POSITION'},
    {id:'ring-middling', pct: sm.avgStability != null ? Math.min(100, Number(sm.avgStability)) : 0, numVal: sm.avgStability != null ? Math.round(sm.avgStability) : '—', suffix:'/100', label:'BATTING STANCE'},
    {id:'ring-impact', pct: sm.avgFootwork != null ? Math.min(100, Number(sm.avgFootwork)) : 0, numVal: sm.avgFootwork != null ? Math.round(sm.avgFootwork) : '—', suffix:'/100', label:'FOOT MOVEMENT'},
    {id:'ring-backlift', pct: sm.avgSwingPath != null ? Math.min(100, Number(sm.avgSwingPath)) : 0, numVal: sm.avgSwingPath != null ? Math.round(sm.avgSwingPath) : '—', suffix:'/100', label:'SWING PATH'},
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
    c.querySelector('.analysis-body').textContent=[a.message, a.player_cue, a.drill || a.action].filter(Boolean).join(' ');
    const se=c.querySelector('.analysis-score');se.textContent=LBLS[a.severity]||a.severity;se.className=`analysis-score ${CLS[a.severity]||''}`;
  });
  const sm=getAnalysisSummary(analysis);
  const fills=[
    {icon:'📊',title:'SESSION AVERAGES',score:'STATS',cls:'good',body:`Head ${sm.avgHead!=null?Math.round(sm.avgHead):'—'}/100 · Feet ${sm.avgFootwork!=null?Math.round(sm.avgFootwork):'—'}/100 · Stance ${sm.avgStability!=null?Math.round(sm.avgStability):'—'}/100 · Swing ${sm.avgSwingIntensity!=null?Math.round(sm.avgSwingIntensity):'—'}/100 · Bat ${(sm.avgSpeed||0).toFixed(1)} km/h · Execution ${sm.avgShotScore!=null?Number(sm.avgShotScore).toFixed(1):'—'}/10`},
    {icon:'🎯',title:'FLAGS SUMMARY',score:'INFO',cls:'good',body:(()=>{const f=sm.flagsSummary||{};return`Head drift: ${f.HEAD_LATERAL_DRIFT_count||0} · Stance: ${f.STANCE_ASYMMETRIC_count||0} · Elbow: ${f.ELBOW_COLLAPSE_count||0} · Flat feet: ${f.FLAT_FOOTED_count||0} · Late plant: ${f.LATE_PLANT_count||0} · Bat spd check: ${f.BAT_SPEED_SESSION_LOCK_count||0} · Narrow base: ${f.NARROW_BASE_count||0} · Wide base: ${f.WIDE_BASE_count||0} · Low WT: ${f.LOW_WEIGHT_TRANSFER_count||0} · Over-commit: ${f.OVER_COMMITTED_count||0} · Spine: ${f.SPINE_COLLAPSE_count||0} · Stiff legs: ${f.STIFF_LEGGED_count||0}`;})()},
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
  if (clearAllSessionsBtn) {
    clearAllSessionsBtn.hidden = !loggedIn || isCoachRole();
  }
  if (resetEverythingBtn) {
    resetEverythingBtn.hidden = !loggedIn || isCoachRole();
  }
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
  document.body.classList.toggle('criceye-role-coach', !visible);
  document.body.classList.toggle('criceye-role-player', visible);
  const coachVisible = !visible;
  headerVerdictPills.forEach((el) => {
    el.hidden = coachVisible;
    el.style.display = coachVisible ? 'none' : '';
  });
  if (headerStatusBadge) {
    headerStatusBadge.hidden = coachVisible;
    headerStatusBadge.style.display = coachVisible ? 'none' : '';
  }
  if (headerSessionInfo) {
    headerSessionInfo.hidden = coachVisible;
    headerSessionInfo.style.display = coachVisible ? 'none' : '';
  }
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
  const fromSummary = analysis ? getAnalysisSummary(analysis) : null;
  let avgSpeed = fromSummary?.avgSpeed != null ? Number(fromSummary.avgSpeed) : null;
  let avgHead = fromSummary?.avgHead != null ? Number(fromSummary.avgHead) : null;
  let avgBalance = fromSummary?.avgStability != null ? Number(fromSummary.avgStability) : null;
  let avgScore = fromSummary?.avgShotScore != null ? Number(fromSummary.avgShotScore) : null;
  let avgWt = fromSummary?.avgWeightTransfer != null ? Number(fromSummary.avgWeightTransfer) : null;
  let avgBw = fromSummary?.avgBaseWidth != null ? Number(fromSummary.avgBaseWidth) : null;
  let avgKf = fromSummary?.avgKneeFlex != null ? Number(fromSummary.avgKneeFlex) : null;
  if (avgSpeed != null && !Number.isFinite(avgSpeed)) avgSpeed = null;
  if (avgHead != null && !Number.isFinite(avgHead)) avgHead = null;
  if (avgBalance != null && !Number.isFinite(avgBalance)) avgBalance = null;
  if (avgScore != null && !Number.isFinite(avgScore)) avgScore = null;
  if (avgWt != null && !Number.isFinite(avgWt)) avgWt = null;
  if (avgBw != null && !Number.isFinite(avgBw)) avgBw = null;
  if (avgKf != null && !Number.isFinite(avgKf)) avgKf = null;

  const replay = getSessionReplay(results);
  const shots = replay && Array.isArray(replay.shots) ? replay.shots : null;
  const confirmed = shots ? shots.filter((s) => Number(s.conf ?? s.confidence) >= 0.3) : [];
  if (confirmed.length) {
    const mean = (field) => {
      const vals = confirmed.map((s) => Number(s[field])).filter((n) => Number.isFinite(n));
      if (!vals.length) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    if (avgSpeed == null) avgSpeed = mean('peak_swing_speed');
    if (avgHead == null) avgHead = mean('head_quality_score');
    if (avgBalance == null) avgBalance = mean('symmetry_score');
    if (avgScore == null) avgScore = mean('shot_score');
    if (avgWt == null) avgWt = mean('weight_transfer');
    if (avgBw == null) avgBw = mean('base_width_ratio');
    if (avgKf == null) avgKf = mean('knee_flex');
  }

  return {
    avgSpeed: Number.isFinite(avgSpeed) ? avgSpeed : null,
    avgHead: Number.isFinite(avgHead) ? avgHead : null,
    avgBalance: Number.isFinite(avgBalance) ? avgBalance : null,
    avgScore: Number.isFinite(avgScore) ? avgScore : null,
    avgWeightTransfer: Number.isFinite(avgWt) ? avgWt : null,
    avgBaseWidth: Number.isFinite(avgBw) ? avgBw : null,
    avgKneeFlex: Number.isFinite(avgKf) ? avgKf : null,
  };
}

function formatCoachGenderLabel(gender) {
  const raw = String(gender || '').trim();
  if (!raw) return '—';
  const spaced = raw.replaceAll('_', ' ');
  if (spaced.toLowerCase() === 'prefer not to say') return 'Not specified';
  return spaced
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
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

function isCoachPlayerRowSynthetic(p) {
  return Boolean(p && String(p.email || '') === 'Profile not visible');
}

function isPlayerHiddenFromCoachDashboard(p) {
  return Boolean(p && p.hidden_from_coach_dashboard);
}

/** Per-session row on coach dashboard (mirrors player “My sessions” cards, light theme). */
function coachSessionRowHtml(s) {
  const created = new Date(s.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const analysis = getSessionAnalysis(s.results);
  const sum = formatSessionCardSummary(analysis);
  const stat = (s.status || '').toUpperCase();
  const sid = escapeHtml(s.id || '');
  const hasReport = Boolean(analysis) && !analysis.error;
  const disabledAttr = hasReport ? '' : ' disabled';
  return `
    <div class="coach-session-item-row">
      <button type="button" class="coach-session-card"${disabledAttr} data-coach-session-report="${sid}" title="${hasReport ? 'Open Net Session Report' : 'No analysis stored for this session yet'}">
        <div class="coach-session-card-top">
          <span class="coach-session-card-date">${escapeHtml(created)}</span>
          <span class="${statusBadgeClass(s.status)}">${escapeHtml(stat)}</span>
        </div>
        <div class="coach-session-card-file" title="${escapeHtml(sessionVideoFilename(s.video_url))}">${escapeHtml(sessionVideoFilename(s.video_url))}</div>
        ${sum ? `<div class="coach-session-card-summary">${escapeHtml(sum)}</div>` : '<div class="coach-session-card-summary coach-session-card-summary--muted">No summary yet</div>'}
        <span class="coach-session-card-hint">${hasReport ? 'View full session report' : 'Report not available'}</span>
      </button>
    </div>`;
}

function coachPlayerSessionsBlockHtml(p, sessionsByUser) {
  const playerId = p.id;
  const rows = (sessionsByUser.get(playerId) || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const completedForCompare = rows.filter(
    (s) => (s.status || '').toLowerCase() === 'completed' && getSessionAnalysis(s.results)
  );
  const canCompare = completedForCompare.length >= 2;
  const compareBtn = canCompare
    ? `<button type="button" class="compare-sessions-btn coach-compare-sessions-btn" data-coach-open-compare="${escapeHtml(String(playerId))}">Compare sessions</button>`
    : `<button type="button" class="compare-sessions-btn coach-compare-sessions-btn" disabled title="Need at least two completed sessions with saved analysis">Compare sessions</button>`;
  const headRow = `<div class="coach-sessions-head-row">
    <div class="coach-sessions-title">Sessions</div>
    <div class="coach-sessions-head-actions">${compareBtn}</div>
  </div>`;
  if (!rows.length) {
    return `<div class="coach-sessions-block">${headRow}<p class="coach-sessions-empty">No sessions yet.</p></div>`;
  }
  return `<div class="coach-sessions-block">
    ${headRow}
    <div class="coach-session-list">${rows.map((s) => coachSessionRowHtml(s)).join('')}</div>
  </div>`;
}

function getPlayerCompletedSessionsForCompare(sessionsByUser, playerId) {
  return (sessionsByUser.get(playerId) || [])
    .filter((s) => (s.status || '').toLowerCase() === 'completed' && getSessionAnalysis(s.results))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function buildCoachCompareFlowPanelHtml(players, sessionsByUser) {
  const compareReady = (players || [])
    .map((p) => ({
      id: String(p.id || ''),
      name: p.full_name || p.email || 'Player',
      completed: getPlayerCompletedSessionsForCompare(sessionsByUser, p.id),
    }))
    .filter((x) => x.id && x.completed.length > 0);

  if (compareReady.length < 2) {
    return `
      <section class="coach-flow-panel">
        <div class="coach-flow-panel-head">
          <h3 class="coach-flow-title">Coach flow</h3>
          <p class="coach-flow-sub">Review players first, then compare once more completed sessions are available.</p>
        </div>
        <div class="coach-flow-grid">
          <div class="coach-flow-card coach-flow-card--muted">
            <div class="coach-flow-kicker">Cross-player compare</div>
            <p>Need at least two players with completed analyses to compare across players.</p>
          </div>
        </div>
      </section>`;
  }

  const opts = compareReady
    .map(
      (p) =>
        `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${p.completed.length} completed)</option>`
    )
    .join('');

  return `
    <section class="coach-flow-panel">
      <div class="coach-flow-panel-head">
        <h3 class="coach-flow-title">Coach flow</h3>
        <p class="coach-flow-sub">Use player cards for within-player progress and this lane for cross-player benchmarking.</p>
      </div>
      <div class="coach-flow-grid">
        <div class="coach-flow-card">
          <div class="coach-flow-kicker">Cross-player compare</div>
          <div class="coach-cross-grid">
            <label class="coach-cross-field">
              <span>Player A</span>
              <select id="coachCrossPlayerA">${opts}</select>
            </label>
            <label class="coach-cross-field">
              <span>Player B</span>
              <select id="coachCrossPlayerB">${opts}</select>
            </label>
          </div>
          <button type="button" class="compare-sessions-btn coach-cross-compare-btn" data-coach-cross-compare>
            Compare latest completed sessions
          </button>
          <p class="coach-cross-note">Opens Session Comparison with one recent completed session from each player.</p>
        </div>
      </div>
    </section>`;
}

function coachPlayerCardHtml(p, sessionsByUser) {
  const rows = (sessionsByUser.get(p.id) || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const completedRows = rows.filter((r) => r.status === 'completed');
  const metrics = completedRows.map((r) => parseSessionSummary(r.results));
  const avgScore = avg(metrics.map((m) => m.avgScore));
  const latestSession = rows[0] || null;
  const lastRecordedLabel = latestSession?.created_at
    ? new Date(latestSession.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'No sessions yet';

  const hidden = isPlayerHiddenFromCoachDashboard(p);
  const canToggleHide = !isCoachPlayerRowSynthetic(p);
  const pid = escapeHtml(String(p.id || ''));
  const hideRow =
    canToggleHide && pid
      ? `<div class="coach-player-actions">
          <button type="button" class="ce-btn ce-btn--ghost coach-player-hide-btn"
            data-coach-player-hidden-toggle="${pid}" data-next-hidden="${hidden ? '0' : '1'}">
            ${hidden ? 'Show on dashboard' : 'Hide from dashboard'}
          </button>
        </div>`
      : '';

  return `
    <article class="coach-player-card${hidden ? ' coach-player-card--hidden' : ''}">
      <div class="coach-player-head">
        <div>
          <h3 class="coach-player-name">${escapeHtml(p.full_name || 'Unnamed Player')}</h3>
          <div class="coach-player-email">${escapeHtml(p.email || '—')}</div>
        </div>
        <span class="coach-player-chip">${escapeHtml(formatCoachGenderLabel(p.gender))} · ${p.age != null && p.age !== '' ? `${p.age}y` : '—'}</span>
      </div>
      <div class="coach-player-grid">
        <div class="coach-player-metric"><div class="coach-player-metric-label">Sessions</div><div class="coach-player-metric-value">${rows.length}</div></div>
        <div class="coach-player-metric"><div class="coach-player-metric-label">Completed</div><div class="coach-player-metric-value">${completedRows.length}</div></div>
        <div class="coach-player-metric"><div class="coach-player-metric-label">Avg Score</div><div class="coach-player-metric-value">${fmtNum(avgScore, 1, '/10')}</div></div>
      </div>
      <div class="coach-player-last-recorded">
        <span class="coach-player-last-recorded-label">Last recorded session</span>
        <span class="coach-player-last-recorded-value">${escapeHtml(lastRecordedLabel)}</span>
      </div>
      ${coachPlayerSessionsBlockHtml(p, sessionsByUser)}
      ${hideRow}
    </article>
  `;
}

function renderCoachDashboard(players, sessions) {
  if (!coachStatsRow || !coachPlayersList) return;
  const sessionsByUser = new Map();
  for (const s of sessions || []) {
    const arr = sessionsByUser.get(s.user_id) || [];
    arr.push(s);
    sessionsByUser.set(s.user_id, arr);
  }

  const list = players || [];
  const visiblePlayers = list.filter((p) => !isPlayerHiddenFromCoachDashboard(p));
  const hiddenPlayers = list.filter((p) => isPlayerHiddenFromCoachDashboard(p));
  const visibleIds = new Set(visiblePlayers.map((p) => p.id).filter(Boolean));
  const sessionsForStats = (sessions || []).filter((s) => visibleIds.has(s.user_id));

  const totalPlayers = visiblePlayers.length;
  const totalSessions = sessionsForStats.length;
  const totalCompleted = sessionsForStats.filter((s) => s.status === 'completed').length;
  const activeToday = sessionsForStats.filter((s) => {
    if (!s.created_at) return false;
    const d = new Date(s.created_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }).length;

  const hiddenCount = hiddenPlayers.length;
  coachStatsRow.innerHTML = `
    <div class="coach-stat"><div class="coach-stat-label">Players on dashboard</div><div class="coach-stat-value">${totalPlayers}</div></div>
    <div class="coach-stat"><div class="coach-stat-label">Total Sessions</div><div class="coach-stat-value">${totalSessions}</div><div class="coach-stat-hint">Visible players only</div></div>
    <div class="coach-stat"><div class="coach-stat-label">Completed Sessions</div><div class="coach-stat-value">${totalCompleted}</div></div>
    <div class="coach-stat"><div class="coach-stat-label">Sessions Today</div><div class="coach-stat-value">${activeToday}</div></div>
  `;

  if (coachDashboardToolbar) {
    coachDashboardToolbar.innerHTML = '';
    coachDashboardToolbar.hidden = true;
  }
  if (hiddenCount === 0) {
    state.showHiddenCoachPlayers = false;
  }
  const bottomHiddenToggleHtml =
    hiddenCount > 0
      ? `<div class="coach-bottom-toggle-wrap">
          <label class="coach-show-hidden-label">
            <input type="checkbox" id="coachShowHiddenCheckbox" ${state.showHiddenCoachPlayers ? 'checked' : ''} />
            Show hidden players
            <span class="coach-toolbar-muted">(${hiddenCount} demo / archived)</span>
          </label>
        </div>`
      : '';

  if (!list.length) {
    coachPlayersList.innerHTML = `<div class="session-item-empty">No player profiles found yet.</div>${bottomHiddenToggleHtml}`;
    return;
  }

  const visibleHtml = visiblePlayers.map((p) => coachPlayerCardHtml(p, sessionsByUser)).join('');
  const flowPanelHtml = buildCoachCompareFlowPanelHtml(visiblePlayers, sessionsByUser);
  const hiddenHtml =
    state.showHiddenCoachPlayers && hiddenPlayers.length
      ? `<div class="coach-hidden-block">
          <h3 class="coach-hidden-section-title">Hidden from dashboard</h3>
          <div class="coach-players-list coach-players-list--hidden">${hiddenPlayers.map((p) => coachPlayerCardHtml(p, sessionsByUser)).join('')}</div>
        </div>`
      : '';

  if (!visibleHtml && hiddenPlayers.length) {
    coachPlayersList.innerHTML = `
      <div class="coach-players-stack">
        <div class="session-item-empty">
          Every player is currently hidden from the dashboard.
          ${hiddenCount ? 'Enable <strong>Show hidden players</strong> below to see or restore them.' : ''}
        </div>
        ${hiddenHtml}
        ${bottomHiddenToggleHtml}
      </div>`;
    return;
  }

  const activeView = state.coachDashboardView === 'compare' ? 'compare' : 'players';
  const playersPane = `
    <section class="coach-pane ${activeView === 'players' ? 'is-active' : ''}" data-coach-pane="players" ${activeView === 'players' ? '' : 'hidden'}>
      <div class="coach-pane-head">
        <h3>All players</h3>
        <p>Open any player to review sessions and launch same-player comparisons.</p>
      </div>
      <div class="coach-players-list">${visibleHtml}</div>
      ${hiddenHtml}
    </section>`;
  const comparePane = `
    <section class="coach-pane ${activeView === 'compare' ? 'is-active' : ''}" data-coach-pane="compare" ${activeView === 'compare' ? '' : 'hidden'}>
      <div class="coach-pane-head">
        <h3>Player comparison</h3>
        <p>Run cross-player compare from recent sessions, then open deep session comparison.</p>
      </div>
      ${flowPanelHtml}
      <div class="coach-compare-help">
        <div class="coach-compare-help-title">How to use this lane</div>
        <ul>
          <li>Choose Player A and Player B from the dropdowns.</li>
          <li>Click compare to open side-by-side strengths, weaknesses, and shot trends.</li>
          <li>Use each player card’s Compare Sessions for within-player progress tracking.</li>
        </ul>
      </div>
    </section>`;

  coachPlayersList.innerHTML = `
    <div class="coach-players-stack">
      <div class="coach-nav-strip" role="tablist" aria-label="Coach dashboard sections">
        <button type="button" class="coach-nav-btn ${activeView === 'players' ? 'is-active' : ''}" data-coach-nav-view="players" role="tab" aria-selected="${activeView === 'players' ? 'true' : 'false'}">View Players</button>
        <button type="button" class="coach-nav-btn ${activeView === 'compare' ? 'is-active' : ''}" data-coach-nav-view="compare" role="tab" aria-selected="${activeView === 'compare' ? 'true' : 'false'}">Player Comparison</button>
      </div>
      ${playersPane}
      ${comparePane}
      ${bottomHiddenToggleHtml}
    </div>`;
}

async function setPlayerHiddenFromCoachDashboard(playerId, hidden) {
  if (!supabaseClient || !state.currentUser || !playerId || !isCoachRole()) return;
  const { error } = await supabaseClient
    .from('profiles')
    .update({ hidden_from_coach_dashboard: hidden })
    .eq('id', playerId)
    .eq('role', 'player');
  if (error) {
    console.error('[CrickEye] coach hide player error:', error.message);
    alert(
      `Could not update player: ${error.message}\n\n` +
        'If this mentions RLS or policy, run backend/sql/profiles_coach_hide_dashboard.sql in the Supabase SQL editor.'
    );
    return;
  }
  await fetchCoachDashboard();
}

async function fetchCoachDashboard() {
  if (!supabaseClient || !state.currentUser || !isCoachRole()) return;
  const { data: profiles, error: profilesError } = await supabaseClient
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (profilesError) {
    if (coachDashboardToolbar) {
      coachDashboardToolbar.innerHTML = '';
      coachDashboardToolbar.hidden = true;
    }
    if (coachPlayersList) {
      coachPlayersList.innerHTML = `<div class="session-item-empty">Coach profiles read failed: ${escapeHtml(profilesError.message)}</div>`;
    }
    return;
  }

  const { data: sessions, error: sessionsError } = await supabaseClient
    .from('sessions')
    .select('id, user_id, status, created_at, results, video_url')
    .order('created_at', { ascending: false });
  if (sessionsError) {
    if (coachDashboardToolbar) {
      coachDashboardToolbar.innerHTML = '';
      coachDashboardToolbar.hidden = true;
    }
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

  state.coachPlayersRaw = playerRows;
  state.coachSessionsRaw = sessions || [];
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
  if (el.id === 'sessionCompareModal' && state.coachCompareSessions) {
    state.coachCompareSessions = null;
    state.coachComparePlayerLabel = null;
    state.compareSessionLabelOverrides = null;
    updateSessionCompareModalContext();
  }
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

const VIDEOS_STORAGE_BUCKET = 'videos';

/** Supabase public/signed URL → object path inside bucket `videos`. */
function storagePathFromVideoUrl(videoUrl) {
  if (!videoUrl) return null;
  try {
    const u = new URL(videoUrl);
    const path = u.pathname;
    const markers = [
      '/storage/v1/object/public/videos/',
      '/storage/v1/object/sign/videos/',
      '/storage/v1/object/authenticated/videos/',
    ];
    for (const marker of markers) {
      const idx = path.indexOf(marker);
      if (idx >= 0) return decodeURIComponent(path.slice(idx + marker.length));
    }
    const loose = path.match(/\/videos\/(.+)$/);
    return loose ? decodeURIComponent(loose[1]) : null;
  } catch {
    return null;
  }
}

function buildVideoStoragePath(userId, file, fileHash) {
  const extMatch = (file?.name || '').match(/(\.[^.]+)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : '.mp4';
  if (fileHash) return `${userId}/${fileHash}${ext}`;
  const safeName = (file?.name || 'video.mp4').replace(/[/\\]/g, '_');
  return `${userId}/${Date.now()}-${safeName}`;
}

async function deleteVideosFromStorageByPaths(paths) {
  if (!supabaseClient || !paths?.length) return;
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return;
  const { error } = await supabaseClient.storage.from(VIDEOS_STORAGE_BUCKET).remove(unique);
  if (error) {
    console.warn('[CrickEye] storage delete:', error.message);
  }
}

async function deleteVideoFromStorage(videoUrl) {
  const path = storagePathFromVideoUrl(videoUrl);
  if (!path) return;
  await deleteVideosFromStorageByPaths([path]);
}

/** Remove every object under `{userId}/` in the videos bucket (frees quota). */
async function deleteAllUserVideosFromStorage(userId) {
  if (!supabaseClient || !userId) return;
  const paths = [];
  let offset = 0;
  const pageSize = 100;
  for (;;) {
    const { data, error } = await supabaseClient.storage
      .from(VIDEOS_STORAGE_BUCKET)
      .list(userId, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) {
      console.warn('[CrickEye] storage list:', error.message);
      break;
    }
    const page = data || [];
    page.forEach((obj) => {
      if (obj?.name) paths.push(`${userId}/${obj.name}`);
    });
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  await deleteVideosFromStorageByPaths(paths);
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
    fatigueDetected: ss.fatigue_detected ?? analysis?.fatigue_detected ?? false,
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
  };
}

function getAvgShotScoreFromResults(results) {
  const replay = getSessionReplay(results);
  if (!replay || !Array.isArray(replay.shots)) return null;
  const confirmed = replay.shots.filter((s) => Number(s.conf ?? s.confidence) >= 0.3 && s.shot_score != null && !Number.isNaN(Number(s.shot_score)));
  if (!confirmed.length) return null;
  const sum = confirmed.reduce((acc, s) => acc + Number(s.shot_score || 0), 0);
  return sum / confirmed.length;
}

/**
 * Find latest completed session for this user that matches file hash and has replay data.
 * Uses DB column file_hash first, then scans recent rows for results.file_fingerprint (backfill).
 * Avoids .maybeSingle() — it errors when more than one row matches the same hash.
 * Requires results.analysis_cache_version === ANALYSIS_CACHE_VERSION so pipeline changes
 * are not masked by an old completed row for the same video bytes.
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
    if (row && getSessionReplay(row.results) && isReplayCacheFresh(row.results)) return row;
    if (row && getSessionReplay(row.results) && !isReplayCacheFresh(row.results)) {
      console.info(
        '[CrickEye] Same file was analysed before, but saved results are from an older pipeline version — running a fresh analysis.'
      );
    }
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
    if (!getSessionReplay(s.results) || !isReplayCacheFresh(s.results)) return false;
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

function getSessionLlmInsights(results) {
  if (!results || typeof results !== 'object') return null;
  const li = results.llm_insights;
  return li && typeof li === 'object' ? li : null;
}

/** Ball tracking + length data for compare / session detail / report (persisted on save). */
function getBallAnalyticsFromResults(results) {
  if (!results || typeof results !== 'object') return null;
  if (results.ball_analytics != null) return results.ball_analytics;
  const nested = results.replay && results.replay.complete && results.replay.complete.ball_analytics;
  return nested != null ? nested : null;
}

/** Per-shot rows for compare charts (same shape as ReportModal trendShots). */
function getConfirmedTrendShotsFromResults(results) {
  const replay = getSessionReplay(results);
  if (!replay || !Array.isArray(replay.shots)) return [];
  return replay.shots
    .filter((s) => Number(s.conf ?? s.confidence) >= 0.3)
    .map((s) => ({
      shot_num: s.shot_num,
      speed: parseFloat((s.peak_swing_speed || 0).toFixed(1)),
      head_quality_score: s.head_quality_score != null ? Math.round(s.head_quality_score) : null,
      symmetry_score: s.symmetry_score != null ? Math.round(s.symmetry_score) : null,
      footwork_score: s.footwork_score != null ? Math.round(s.footwork_score) : null,
      swing_path_score: s.swing_path_score != null ? Math.round(s.swing_path_score) : null,
      execution_score: s.execution_score != null ? Math.round(s.execution_score) : null,
      swing_intensity: s.swing_intensity != null ? Math.round(s.swing_intensity) : null,
      score: s.shot_score || 0,
      weight_transfer: s.weight_transfer != null ? Number(s.weight_transfer) : null,
      base_width_ratio: s.base_width_ratio != null ? Number(s.base_width_ratio) : null,
      knee_flex: s.knee_flex != null ? Number(s.knee_flex) : null,
      spine_ratio: s.spine_ratio != null ? Number(s.spine_ratio) : null,
    }));
}

/** Confirmed replay shots for ball-length ↔ biomech join (same filter as trend charts). */
function getConfirmedReplayShotsForLength(results) {
  const replay = getSessionReplay(results);
  if (!replay || !Array.isArray(replay.shots)) return [];
  return replay.shots.filter((s) => Number(s.conf ?? s.confidence) >= 0.3);
}

function buildCompareLengthPairHtml(sessionA, sessionB) {
  if (typeof CrickEyeLengthInsights === 'undefined' || !sessionA || !sessionB) return '';
  const baA = getBallAnalyticsFromResults(sessionA.results);
  const baB = getBallAnalyticsFromResults(sessionB.results);
  const nA = baA ? CrickEyeLengthInsights.confirmedBallDeliveries(baA).length : 0;
  const nB = baB ? CrickEyeLengthInsights.confirmedBallDeliveries(baB).length : 0;
  if (!nA && !nB) {
    return `
      <section class="compare-length-stack" aria-label="Ball length mix">
        <header class="compare-blength-head">
          <h3 class="compare-blength-title">Ball length mix</h3>
          <p class="compare-blength-hint">No ball-tracking length data in these sessions yet. Re-run analysis with ball analytics enabled to compare yorker / full / good / short mix.</p>
        </header>
      </section>`;
  }
  const completedPeers = getCompletedSessionsForCompare();
  const la = sessionCompareDisplayLabel(sessionA, completedPeers);
  const lb = sessionCompareDisplayLabel(sessionB, completedPeers);
  const htmlA = CrickEyeLengthInsights.buildLengthSectionHtml({
    ballAnalytics: baA,
    confirmedShots: getConfirmedReplayShotsForLength(sessionA.results),
    heading: la,
    compact: false,
    hideStandout: true,
  });
  const htmlB = CrickEyeLengthInsights.buildLengthSectionHtml({
    ballAnalytics: baB,
    confirmedShots: getConfirmedReplayShotsForLength(sessionB.results),
    heading: lb,
    compact: false,
    hideStandout: true,
  });
  return `
    <section class="compare-length-stack" aria-label="Ball length mix comparison">
      <header class="compare-blength-head">
        <h3 class="compare-blength-title">Ball length mix</h3>
        <p class="compare-blength-hint">Pitch length each session (tracked balls) and where your scores dipped or held up by zone.</p>
      </header>
      <div class="compare-blength-grid">
        <div class="compare-blength-col">${htmlA}</div>
        <div class="compare-blength-col">${htmlB}</div>
      </div>
    </section>`;
}

function buildCompareLengthMonthHtml(monthSessions) {
  if (typeof CrickEyeLengthInsights === 'undefined' || !monthSessions?.length) return '';
  const any = monthSessions.some((s) => {
    const ba = getBallAnalyticsFromResults(s.results);
    return ba && CrickEyeLengthInsights.confirmedBallDeliveries(ba).length > 0;
  });
  if (!any) return '';
  const cards = monthSessions
    .map((s) => {
      const inner = CrickEyeLengthInsights.buildLengthSectionHtml({
        ballAnalytics: getBallAnalyticsFromResults(s.results),
        confirmedShots: getConfirmedReplayShotsForLength(s.results),
        heading: sessionCompareDisplayLabel(s, monthSessions),
        compact: true,
      });
      return `<div class="compare-blength-month-card">${inner}</div>`;
    })
    .join('');
  return `
    <section class="compare-length-stack compare-length-stack--month" aria-label="Length mix by session">
      <header class="compare-blength-head">
        <h3 class="compare-blength-title">Length mix by session</h3>
        <p class="compare-blength-hint">Each card is one net: how balls broke by length and coaching tie-ins for that day.</p>
      </header>
      <div class="compare-blength-month-grid">${cards}</div>
    </section>`;
}

let _compareChartGradSeq = 0;

/**
 * Dual area-spline chart (SVG) — same geometry/style as ReportModal.buildLineGraph.
 * When shot counts differ, both series are trimmed to the same length (min) so the x-axis matches.
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
  const rawA = seriesA.length;
  const rawB = seriesB.length;
  const pairCap = Math.min(rawA, rawB);
  const sA = pairCap > 0 ? seriesA.slice(0, pairCap) : [];
  const sB = pairCap > 0 ? seriesB.slice(0, pairCap) : [];
  const n = pairCap;
  if (n === 0) {
    return `<div class="compare-graph-empty">No per-shot replay data for this session.</div>`;
  }

  const allVals = [];
  sA.forEach((s) => allVals.push(Number(s[dataKey]) || 0));
  sB.forEach((s) => allVals.push(Number(s[dataKey]) || 0));
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

  const ptsA = buildPts(sA);
  const ptsB = buildPts(sB);

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
    dataKey === 'speed' ? ' km/h' : dataKey === 'score' ? '/10' : '/100';
  const digits = 1;
  const avgIntro =
    rawA !== rawB
      ? `Avg over comparable window (${n} shots each)`
      : 'Session avg';
  const sub = `${avgIntro} · ${escapeHtml(legendA)}: ${avgStr(sA, digits)}${unit} → ${escapeHtml(legendB)}: ${avgStr(sB, digits)}${unit}`;

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
  const lens = nonEmpty.map((e) => e.series.length);
  const minLen = lens.length ? Math.min(...lens) : 0;
  const maxLen = lens.length ? Math.max(...lens) : 0;
  const trimmed = nonEmpty.map((e) => ({
    ...e,
    series: (e.series || []).slice(0, minLen),
  }));
  const n = minLen;
  if (n === 0) {
    return `<div class="compare-graph-empty">No per-shot replay data for these sessions.</div>`;
  }

  const allVals = [];
  trimmed.forEach((e) => {
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

  const withPts = trimmed.map((e) => ({
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

  const unit =
    dataKey === 'speed' ? ' km/h' : dataKey === 'score' ? '/10' : '/100';
  const digits = 1;
  const avgParts = withPts.map((e) => {
    if (!e.series || !e.series.length) {
      return `${escapeHtml(e.legend)}: —`;
    }
    const sum = e.series.reduce((a, s) => a + (Number(s[dataKey]) || 0), 0);
    const avg = (sum / e.series.length).toFixed(digits);
    return `${escapeHtml(e.legend)}: ${avg}${unit}`;
  });
  const multiIntro =
    minLen !== maxLen ? `Compared over ${minLen} shots each · ` : 'Session avg · ';
  const sub = `${multiIntro}${avgParts.join(' · ')}`;

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
  if (best && best.label) parts.push(`Signature: ${shotLabelPretty(best.label)}`);
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
        <div class="session-metric"><span class="session-metric-label">Head position</span><span class="session-metric-val">${sm.avgHead != null ? escapeHtml(Math.round(Number(sm.avgHead)).toString()) : '—'}</span><span class="session-metric-sub">avg / 100</span></div>
        <div class="session-metric"><span class="session-metric-label">Foot movement</span><span class="session-metric-val">${sm.avgFootwork != null ? escapeHtml(Math.round(Number(sm.avgFootwork)).toString()) : '—'}</span><span class="session-metric-sub">avg / 100</span></div>
        <div class="session-metric"><span class="session-metric-label">Batting stance</span><span class="session-metric-val">${sm.avgStability != null ? escapeHtml(Math.round(Number(sm.avgStability)).toString()) : '—'}</span><span class="session-metric-sub">avg / 100</span></div>
        <div class="session-metric"><span class="session-metric-label">Swing arc</span><span class="session-metric-val">${sm.avgSwingPath != null ? escapeHtml(Math.round(Number(sm.avgSwingPath)).toString()) : '—'}</span><span class="session-metric-sub">avg / 100</span></div>
        <div class="session-metric"><span class="session-metric-label">Shot execution</span><span class="session-metric-val">${sm.avgExecution != null ? escapeHtml(Math.round(Number(sm.avgExecution)).toString()) : '—'}</span><span class="session-metric-sub">avg / 100</span></div>
        <div class="session-metric"><span class="session-metric-label">Overall score</span><span class="session-metric-val">${avgShotScoreResolved != null ? escapeHtml(Number(avgShotScoreResolved).toFixed(1)) : '—'}</span><span class="session-metric-sub">/10</span></div>
      </div></section>`;

    if (typeof CrickEyeLengthInsights !== 'undefined') {
      metrics += `<section class="session-detail-section session-detail-length">${CrickEyeLengthInsights.buildLengthSectionHtml({
        ballAnalytics: getBallAnalyticsFromResults(session.results),
        confirmedShots: getConfirmedReplayShotsForLength(session.results),
        heading: 'Ball length vs performance',
        compact: false,
      })}</section>`;
    }

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
        ['Head position', trend.first_half_head_quality_score, trend.second_half_head_quality_score],
        ['Batting stance', trend.first_half_symmetry_score, trend.second_half_symmetry_score],
        ['Foot movement', trend.first_half_footwork_score, trend.second_half_footwork_score],
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

    const alerts = r.coaching_alerts;
    if (Array.isArray(alerts) && alerts.length) {
      const lis = alerts.slice(0, 6).map((a) => {
        const cue = a.player_cue ? `<div class="session-alert-cue">${escapeHtml(a.player_cue)}</div>` : '';
        const drill = a.drill ? `<div class="session-alert-drill">▸ ${escapeHtml(a.drill)}</div>` : (a.action ? `<em>${escapeHtml(a.action)}</em>` : '');
        return `<li class="session-alert session-alert--${escapeHtml((a.severity || 'low').toLowerCase())}"><span class="session-alert-sev">${escapeHtml(a.severity || '')}</span> <strong>${escapeHtml(a.metric || '')}</strong> — ${escapeHtml(a.message || '')}${cue}${drill}</li>`;
      }).join('');
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

/**
 * Open the same Net Session Report modal as players get, using DB replay + analysis.
 * Used from the coach dashboard; does not depend on state.sessionsCache.
 */
function openCoachSessionNetReport(sessionId) {
  const sid = String(sessionId || '');
  const pools = [
    Array.isArray(state.coachSessionsRaw) ? state.coachSessionsRaw : [],
    Array.isArray(state.coachCompareSessions) ? state.coachCompareSessions : [],
    Array.isArray(state.sessionsCache) ? state.sessionsCache : [],
  ];
  let session = null;
  for (const pool of pools) {
    session = pool.find((x) => String(x?.id || '') === sid) || null;
    if (session) break;
  }
  if (!session) {
    alert('Could not open this session report. Please refresh dashboard and try again.');
    return;
  }
  const analysis = getSessionAnalysis(session.results);
  if (!analysis || analysis.error) {
    alert('No session analysis available yet for this row.');
    return;
  }
  const replay = getSessionReplay(session.results);
  const shots = replay?.shots && Array.isArray(replay.shots) ? replay.shots : [];
  const handed = analysis.session_handedness || 'RHB';
  ReportModal.open(
    {
      shotLog: shots,
      completePayload: {
        handedness: handed,
        ball_analytics: getBallAnalyticsFromResults(session.results),
        llm_insights: session.results?.llm_insights || null,
      },
      originalVideoUrl: session.video_url || '',
      originalVideoName: sessionVideoFilename(session.video_url),
      sessionDateLabel: new Date(session.created_at).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }),
      sessionStatus: String(session.status || '').toUpperCase(),
    },
    analysis
  );
}

function openSessionDetailModal(sessionId) {
  const sid = String(sessionId || '');
  const session = state.sessionsCache.find((x) => String(x?.id || '') === sid);
  if (!session) return;
  const analysis = getSessionAnalysis(session.results);
  if (analysis && !analysis.error) {
    const replay = getSessionReplay(session.results);
    const shots = replay?.shots && Array.isArray(replay.shots) ? replay.shots : [];
    const handed = analysis.session_handedness || 'RHB';
    ReportModal.open(
      {
        shotLog: shots,
        completePayload: {
          handedness: handed,
          ball_analytics: getBallAnalyticsFromResults(session.results),
        llm_insights: session.results?.llm_insights || null,
        },
        originalVideoUrl: session.video_url || '',
        originalVideoName: sessionVideoFilename(session.video_url),
        sessionDateLabel: new Date(session.created_at).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }),
        sessionStatus: String(session.status || '').toUpperCase(),
      },
      analysis
    );
    return;
  }
  if (!sessionDetailModal || !sessionDetailBody) return;
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

/** Session rows used by the comparison modal: player’s list or coach’s selected player. */
function getCompareSessionsSource() {
  if (isCoachRole() && Array.isArray(state.coachCompareSessions)) {
    return state.coachCompareSessions;
  }
  return state.sessionsCache;
}

function findSessionInCompareSource(sessionId) {
  if (!sessionId) return null;
  return getCompareSessionsSource().find((s) => s.id === sessionId) || null;
}

/** Completed sessions (for compare dropdowns + date disambiguation). */
function getCompletedSessionsForCompare() {
  return getCompareSessionsSource()
    .filter((s) => (s.status || '').toLowerCase() === 'completed' && getSessionAnalysis(s.results))
    .sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
}

/**
 * Date-only label for compare UI (dropdowns, legends, headers). If several sessions share a calendar day, appends a short time.
 */
function sessionCompareDisplayLabel(session, peerSessions) {
  if (!session) return '—';
  const override = state.compareSessionLabelOverrides?.[String(session.id || '')];
  if (override) return override;
  const d = new Date(session.created_at);
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const peers = Array.isArray(peerSessions) ? peerSessions : [];
  const dayKey = d.toDateString();
  const sameDay = peers.filter((p) => p && new Date(p.created_at).toDateString() === dayKey);
  if (sameDay.length <= 1) return dateStr;
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${dateStr}, ${t}`;
}

function isCrossPlayerCompareActive() {
  if (!isCoachRole()) return false;
  const lbl = String(state.coachComparePlayerLabel || '').toLowerCase();
  return Boolean(state.compareSessionLabelOverrides) && lbl.includes(' vs ');
}

function trimSeriesForCrossPlayer(seriesA, seriesB) {
  if (!isCrossPlayerCompareActive()) {
    return { a: seriesA, b: seriesB, minShots: Math.max(seriesA.length, seriesB.length) };
  }
  const minShots = Math.max(0, Math.min(seriesA.length, seriesB.length));
  if (minShots <= 0) return { a: [], b: [], minShots: 0 };
  return {
    a: seriesA.slice(0, minShots),
    b: seriesB.slice(0, minShots),
    minShots,
  };
}

function crossPlayerNameFromSession(session, peers) {
  const full = sessionCompareDisplayLabel(session, peers);
  const parts = String(full).split(' · ');
  return (parts[0] || full || 'Player').trim();
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
      head_quality_score: sm.avgHead,
      symmetry_score: sm.avgStability,
    };
    const v = map[k];
    return v != null && !Number.isNaN(Number(v)) ? Number(v) : null;
  }

  let improved = 0;
  let declined = 0;
  const hF = sav(first, 'head_quality_score');
  const hL = sav(last, 'head_quality_score');
  if (hF != null && hL != null) {
    if (hL - hF > 4) improved += 1;
    else if (hF - hL > 4) declined += 1;
  }
  const stF = sav(first, 'symmetry_score');
  const stL = sav(last, 'symmetry_score');
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

  if (hF != null && hL != null && Math.abs(hL - hF) > 3) {
    bullets.push(
      hL >= hF
        ? `Head position scores improved from your first to your latest session this month.`
        : `Head position dipped from your first to your latest session — extra ball-watching work will help.`
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
      `In ${fatN} of ${n} sessions, swing intensity dropped sharply in the second half — shorter blocks or a quick break mid-session can help.`
    );
  } else if (fatN === 1) {
    bullets.push(`One session showed late-session fade in swing intensity — try a short pause between net blocks.`);
  }

  let lateralHeadFlags = 0;
  let stanceFlags = 0;
  let totalShots = 0;
  monthSessions.forEach((s) => {
    const replay = getSessionReplay(s.results);
    if (!replay?.shots) return;
    for (const sh of replay.shots) {
      if (Number(sh.conf ?? sh.confidence) < 0.3) continue;
      totalShots += 1;
      for (const f of sh.flags || []) {
        const base = String(f).split(':')[0];
        if (base === 'HEAD_LATERAL_DRIFT') lateralHeadFlags += 1;
        if (base === 'STANCE_ASYMMETRIC') stanceFlags += 1;
      }
    }
  });

  if (totalShots > 0) {
    const hp = Math.round((lateralHeadFlags / totalShots) * 100);
    if (hp >= 30) {
      bullets.push(
        `Head drifting sideways showed up on about ${hp}% of your shots this month — eyes track, head stays on axis.`
      );
    }
    const up = Math.round((stanceFlags / totalShots) * 100);
    if (up >= 30) {
      bullets.push(
        `Asymmetric stance on about ${up}% of shots — level shoulders before the bowler runs in.`
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

/** Session-level aggregates for compare table (summary first, then replay means). */
function resolveSessionAggregateMetrics(session, analysis) {
  const sm = getAnalysisSummary(analysis);
  let head = sm.avgHead != null && Number.isFinite(Number(sm.avgHead)) ? Number(sm.avgHead) : null;
  let balance = sm.avgStability != null && Number.isFinite(Number(sm.avgStability)) ? Number(sm.avgStability) : null;
  let footwork = sm.avgFootwork != null && Number.isFinite(Number(sm.avgFootwork)) ? Number(sm.avgFootwork) : null;
  let swingArc = sm.avgSwingPath != null && Number.isFinite(Number(sm.avgSwingPath)) ? Number(sm.avgSwingPath) : null;
  let shotExecution = sm.avgExecution != null && Number.isFinite(Number(sm.avgExecution)) ? Number(sm.avgExecution) : null;
  let swingI = sm.avgSwingIntensity != null && Number.isFinite(Number(sm.avgSwingIntensity)) ? Number(sm.avgSwingIntensity) : null;
  let speed = sm.avgSpeed != null && Number.isFinite(Number(sm.avgSpeed)) ? Number(sm.avgSpeed) : null;
  let execution = sm.avgShotScore != null && Number.isFinite(Number(sm.avgShotScore)) ? Number(sm.avgShotScore) : null;
  if (execution == null) {
    const fromReplay = getAvgShotScoreFromResults(session.results);
    if (fromReplay != null && Number.isFinite(fromReplay)) execution = fromReplay;
  }
  const trend = getConfirmedTrendShotsFromResults(session.results);
  if (trend.length) {
    if (head == null) head = avg(trend.map((s) => s.head_quality_score));
    if (balance == null) balance = avg(trend.map((s) => s.symmetry_score));
    if (footwork == null) footwork = avg(trend.map((s) => s.footwork_score));
    if (swingArc == null) swingArc = avg(trend.map((s) => s.swing_path_score));
    if (shotExecution == null) shotExecution = avg(trend.map((s) => s.execution_score));
    if (swingI == null) swingI = avg(trend.map((s) => s.swing_intensity));
    if (speed == null) speed = avg(trend.map((s) => s.speed));
    if (execution == null) execution = avg(trend.map((s) => s.score));
  }
  return { head, balance, footwork, swingArc, shotExecution, swingI, speed, execution };
}

function compareQualityFromPct100(pct) {
  const p = Math.round(Number(pct) || 0);
  if (p >= 70) return { label: 'Good', color: '#10B981' };
  if (p >= 45) return { label: 'Average', color: '#EAB308' };
  return { label: 'Poor', color: '#EF4444' };
}

/** Compact donut SVG for horizontal placard (aggregate /100 only). */
function buildComparePlacardDonutSvg(pctRing, color, centerDisplay) {
  const pct = Math.min(100, Math.max(0, Number(pctRing) || 0));
  const R = 44;
  const cx = 56;
  const cy = 56;
  const circ = 2 * Math.PI * R;
  const offset = circ * (1 - pct / 100);
  const num = centerDisplay != null ? centerDisplay : Math.round(pct);
  return `<svg class="compare-placard-svg" width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(15,23,42,0.08)" stroke-width="9"/>
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none"
        stroke="${color}" stroke-width="9" stroke-linecap="round"
        stroke-dasharray="${circ}" stroke-dashoffset="${circ}"
        transform="rotate(-90 ${cx} ${cy})"
        class="compare-pie-arc" data-offset="${offset}"/>
      <text x="${cx}" y="${cy - 5}" text-anchor="middle"
        style="font-family:Manrope,sans-serif;font-size:17px;font-weight:800;fill:${color}">${escapeHtml(String(num))}</text>
      <text x="${cx}" y="${cy + 11}" text-anchor="middle"
        style="font-family:Inter,sans-serif;font-size:8.5px;fill:#64748B">/ 100</text>
    </svg>`;
}

function buildComparePlacardEmptyChart() {
  return `<div class="compare-placard-empty-chart" aria-hidden="true"><span>—</span></div>`;
}

/** One horizontal metric card: chart left, copy right (matches report “Core metrics” hierarchy). */
function buildCompareMetricPlacard(chartHtml, label, qualityLabel, qualityColor, desc, metaHtml, isEmpty) {
  return `
    <div class="compare-placard${isEmpty ? ' compare-placard--empty' : ''}">
      <div class="compare-placard-chart">${chartHtml}</div>
      <div class="compare-placard-body">
        <div class="compare-placard-label">${escapeHtml(label)}</div>
        <div class="compare-placard-quality" style="color:${qualityColor}">${escapeHtml(qualityLabel)}</div>
        <p class="compare-placard-desc">${escapeHtml(desc)}</p>
        <p class="compare-placard-meta">${metaHtml}</p>
      </div>
    </div>`;
}

function compareMetricNote(used, total, noun) {
  if (!total) return 'No sessions in this comparison.';
  if (!used) return `No saved ${noun} data for the selected sessions.`;
  if (used < total) return escapeHtml(`Based on ${used} of ${total} sessions with ${noun} data.`);
  return escapeHtml(`Average across ${used} session${used === 1 ? '' : 's'}.`);
}

/**
 * Aggregate core metrics across compared sessions — donut layout like Generate Report “Core metrics”.
 */
function buildCompareAggregateCoreMetricsHtml(sessions, analyses) {
  if (!sessions.length) return '';
  const total = sessions.length;
  const rows = sessions.map((s, i) => resolveSessionAggregateMetrics(s, analyses[i]));
  const heads = rows.map((r) => r.head).filter((v) => v != null && Number.isFinite(v));
  const bals = rows.map((r) => r.balance).filter((v) => v != null && Number.isFinite(v));
  const fws = rows.map((r) => r.footwork).filter((v) => v != null && Number.isFinite(v));
  const arcs = rows.map((r) => r.swingArc).filter((v) => v != null && Number.isFinite(v));
  const shotExecs = rows.map((r) => r.shotExecution).filter((v) => v != null && Number.isFinite(v));
  const execs = rows.map((r) => r.execution).filter((v) => v != null && Number.isFinite(v));

  const avgHead = heads.length ? avg(heads) : null;
  const avgBal = bals.length ? avg(bals) : null;
  const avgFw = fws.length ? avg(fws) : null;
  const avgArc = arcs.length ? avg(arcs) : null;
  const avgShotExec = shotExecs.length ? avg(shotExecs) : null;
  const avgExec = execs.length ? avg(execs) : null;

  const headPct = avgHead != null ? Math.min(100, Math.max(0, avgHead)) : 0;
  const balPct = avgBal != null ? Math.min(100, Math.max(0, avgBal)) : 0;
  const fwPct = avgFw != null ? Math.min(100, Math.max(0, avgFw)) : 0;
  const arcPct = avgArc != null ? Math.min(100, Math.max(0, avgArc)) : 0;
  const shotExecPct = avgShotExec != null ? Math.min(100, Math.max(0, avgShotExec)) : 0;
  const execRingPct = avgExec != null ? Math.min(100, Math.max(0, avgExec * 10)) : 0;

  const qh = compareQualityFromPct100(headPct);
  const qb = compareQualityFromPct100(balPct);
  const qf = compareQualityFromPct100(fwPct);
  const qar = compareQualityFromPct100(arcPct);
  const qse = compareQualityFromPct100(shotExecPct);
  const qe = compareQualityFromPct100(execRingPct);

  const headDesc = 'Axis-aware head quality (shot-type conditioned).';
  const balDesc = 'Shoulder and hip tilt symmetry in the pre-shot window.';
  const fwDesc = 'Pre-shot foot activity and front-foot plant timing vs contact.';
  const arcDesc = 'Bat path smoothness from backlift to contact.';
  const shotExecDesc = 'In simple words: did your stroke match the ball length?';
  const execDesc =
    execs.length > 0
      ? `${avgExec.toFixed(1)}/10 on the execution scale (same as your net session report).`
      : 'Composite from head, feet, stance, elbow shape, and swing intensity.';

  const headBlock = buildCompareMetricPlacard(
    heads.length > 0 ? buildComparePlacardDonutSvg(headPct, '#06B6D4', Math.round(headPct)) : buildComparePlacardEmptyChart(),
    'Head position',
    heads.length > 0 ? qh.label : 'No data',
    heads.length > 0 ? qh.color : '#94A3B8',
    headDesc,
    compareMetricNote(heads.length, total, 'head position'),
    heads.length === 0
  );
  const balBlock = buildCompareMetricPlacard(
    bals.length > 0 ? buildComparePlacardDonutSvg(balPct, '#10B981', Math.round(balPct)) : buildComparePlacardEmptyChart(),
    'Batting stance',
    bals.length > 0 ? qb.label : 'No data',
    bals.length > 0 ? qb.color : '#94A3B8',
    balDesc,
    compareMetricNote(bals.length, total, 'stance scores'),
    bals.length === 0
  );
  const fwBlock = buildCompareMetricPlacard(
    fws.length > 0 ? buildComparePlacardDonutSvg(fwPct, '#0891B2', Math.round(fwPct)) : buildComparePlacardEmptyChart(),
    'Foot movement',
    fws.length > 0 ? qf.label : 'No data',
    fws.length > 0 ? qf.color : '#94A3B8',
    fwDesc,
    compareMetricNote(fws.length, total, 'foot movement'),
    fws.length === 0
  );
  const arcBlock = buildCompareMetricPlacard(
    arcs.length > 0 ? buildComparePlacardDonutSvg(arcPct, '#8B5CF6', Math.round(arcPct)) : buildComparePlacardEmptyChart(),
    'Swing arc',
    arcs.length > 0 ? qar.label : 'No data',
    arcs.length > 0 ? qar.color : '#94A3B8',
    arcDesc,
    compareMetricNote(arcs.length, total, 'swing arc'),
    arcs.length === 0
  );
  const shotExecBlock = buildCompareMetricPlacard(
    shotExecs.length > 0 ? buildComparePlacardDonutSvg(shotExecPct, '#F97316', Math.round(shotExecPct)) : buildComparePlacardEmptyChart(),
    'Shot execution',
    shotExecs.length > 0 ? qse.label : 'No data',
    shotExecs.length > 0 ? qse.color : '#94A3B8',
    shotExecDesc,
    compareMetricNote(shotExecs.length, total, 'shot execution'),
    shotExecs.length === 0
  );
  const execBlock = buildCompareMetricPlacard(
    execs.length > 0 ? buildComparePlacardDonutSvg(execRingPct, '#FAAD14', Math.round(execRingPct)) : buildComparePlacardEmptyChart(),
    'Overall score',
    execs.length > 0 ? qe.label : 'No data',
    execs.length > 0 ? qe.color : '#94A3B8',
    execDesc,
    compareMetricNote(execs.length, total, 'shot execution'),
    execs.length === 0
  );

  return `
    <section class="compare-core-metrics" aria-label="Average metrics across compared sessions">
      <header class="compare-core-metrics-head">
        <h3 class="compare-core-metrics-title">Core metrics</h3>
        <p class="compare-core-metrics-hint">Pooled session averages for this comparison — same core scores as your net session report.</p>
      </header>
      <div class="compare-pies-row">
        ${headBlock}
        ${balBlock}
        ${fwBlock}
        ${arcBlock}
        ${shotExecBlock}
        ${execBlock}
      </div>
    </section>`;
}

function animateComparePies() {
  if (!sessionCompareBody) return;
  sessionCompareBody.querySelectorAll('.compare-pie-arc').forEach((arc) => {
    const target = parseFloat(arc.getAttribute('data-offset'));
    requestAnimationFrame(() => {
      arc.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)';
      arc.style.strokeDashoffset = Number.isFinite(target) ? String(target) : '0';
    });
  });
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

  const rawSeriesA = getConfirmedTrendShotsFromResults(sessionA.results);
  const rawSeriesB = getConfirmedTrendShotsFromResults(sessionB.results);
  const trimmed = trimSeriesForCrossPlayer(rawSeriesA, rawSeriesB);
  const seriesA = trimmed.a;
  const seriesB = trimmed.b;
  const pairInsight = buildPairSessionInsightHtml(sessionA, sessionB, a, b, seriesA, seriesB);
  const showAggregateBlock = !isCrossPlayerCompareActive();
  const aggregateBlock = showAggregateBlock
    ? buildCompareAggregateCoreMetricsHtml([sessionA, sessionB], [a, b])
    : '';

  if (!seriesA.length && !seriesB.length) {
    const bestA = a.best_shot?.label ? shotLabelPretty(a.best_shot.label) : '—';
    const bestB = b.best_shot?.label ? shotLabelPretty(b.best_shot.label) : '—';
    const crossMode = isCrossPlayerCompareActive();
    const metaA = crossMode ? 'Player A Signature Shot' : 'Signature Shot (S1)';
    const metaB = crossMode ? 'Player B Signature Shot' : 'Signature Shot (S2)';
    sessionCompareBody.innerHTML = `
    <div class="compare-header-row">
      <div><strong>Session 1:</strong> ${escapeHtml(sessionCompareDisplayLabel(sessionA, completedPeers))}</div>
      <div><strong>Session 2:</strong> ${escapeHtml(sessionCompareDisplayLabel(sessionB, completedPeers))}</div>
    </div>
    ${aggregateBlock}
    ${pairInsight}
    ${buildCompareLengthPairHtml(sessionA, sessionB)}
    <p class="session-item-empty">No per-shot replay data in these session records, so trend charts cannot be drawn. Re-run analysis and ensure results include shot replay, or compare sessions processed with the current pipeline.</p>
    <div class="compare-meta-row">
      <div><span class="compare-meta-k">${escapeHtml(metaA)}:</span> ${escapeHtml(bestA)}</div>
      <div><span class="compare-meta-k">${escapeHtml(metaB)}:</span> ${escapeHtml(bestB)}</div>
    </div>`;
    requestAnimationFrame(() => animateComparePies());
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
      'head_quality_score',
      colorA,
      colorB,
      'Head position (0–100)',
      100,
      legendA,
      legendB
    ),
    buildDualLineCompareGraph(
      seriesA,
      seriesB,
      'symmetry_score',
      colorA,
      colorB,
      'Batting stance (0–100)',
      100,
      legendA,
      legendB
    ),
    buildDualLineCompareGraph(
      seriesA,
      seriesB,
      'footwork_score',
      colorA,
      colorB,
      'Foot movement (0–100)',
      100,
      legendA,
      legendB
    ),
    buildDualLineCompareGraph(
      seriesA,
      seriesB,
      'swing_path_score',
      colorA,
      colorB,
      'Swing arc (0–100)',
      100,
      legendA,
      legendB
    ),
    buildDualLineCompareGraph(
      seriesA,
      seriesB,
      'execution_score',
      colorA,
      colorB,
      'Shot execution (0–100)',
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
      'Overall score (/10)',
      10,
      legendA,
      legendB
    ),
  ].join('');

  const bestA = a.best_shot?.label ? shotLabelPretty(a.best_shot.label) : '—';
  const bestB = b.best_shot?.label ? shotLabelPretty(b.best_shot.label) : '—';
  const crossMode = isCrossPlayerCompareActive();
  const metaA = crossMode ? 'Player A Signature Shot' : 'Signature Shot (S1)';
  const metaB = crossMode ? 'Player B Signature Shot' : 'Signature Shot (S2)';

  sessionCompareBody.innerHTML = `
    <div class="compare-header-row">
      <div><strong>Session 1:</strong> ${escapeHtml(sessionCompareDisplayLabel(sessionA, completedPeers))}</div>
      <div><strong>Session 2:</strong> ${escapeHtml(sessionCompareDisplayLabel(sessionB, completedPeers))}</div>
    </div>
    ${aggregateBlock}
    ${pairInsight}
    ${buildCompareLengthPairHtml(sessionA, sessionB)}
    <div class="compare-trends-stack">${charts}</div>
    <div class="compare-meta-row">
      <div><span class="compare-meta-k">${escapeHtml(metaA)}:</span> ${escapeHtml(bestA)}</div>
      <div><span class="compare-meta-k">${escapeHtml(metaB)}:</span> ${escapeHtml(bestB)}</div>
    </div>
  `;
  requestAnimationFrame(() => animateComparePies());
}

function buildPairSessionInsightHtml(sessionA, sessionB, analysisA, analysisB, seriesA = [], seriesB = []) {
  if (isCrossPlayerCompareActive()) {
    return buildCrossPlayerInsightHtml(sessionA, sessionB, analysisA, analysisB, seriesA, seriesB);
  }
  const mA = resolveSessionAggregateMetrics(sessionA, analysisA);
  const mB = resolveSessionAggregateMetrics(sessionB, analysisB);
  const deltas = [];
  const metrics = [
    { key: 'head', label: 'Head position', thr: 3, unit: '/100' },
    { key: 'balance', label: 'Batting stance', thr: 3, unit: '/100' },
    { key: 'footwork', label: 'Foot movement', thr: 3, unit: '/100' },
    { key: 'swingI', label: 'Swing intensity', thr: 3, unit: '/100' },
    { key: 'execution', label: 'Shot execution', thr: 0.25, unit: '/10' },
  ];
  for (const mt of metrics) {
    const a = Number(mA[mt.key]);
    const b = Number(mB[mt.key]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const d = b - a;
    if (Math.abs(d) < mt.thr) continue;
    deltas.push({ label: mt.label, delta: d, unit: mt.unit });
  }

  const sA = getAnalysisSummary(analysisA);
  const sB = getAnalysisSummary(analysisB);
  const flagTotalA = Object.values(sA.flagsSummary || {}).reduce((acc, v) => acc + (Number(v) || 0), 0);
  const flagTotalB = Object.values(sB.flagsSummary || {}).reduce((acc, v) => acc + (Number(v) || 0), 0);
  const flagDelta = flagTotalA - flagTotalB; // positive => improved

  const improve = deltas
    .filter((x) => x.delta > 0)
    .sort((x, y) => y.delta - x.delta)
    .slice(0, 3);
  const focus = deltas
    .filter((x) => x.delta < 0)
    .sort((x, y) => x.delta - y.delta)
    .slice(0, 3);

  if (flagDelta >= 4) {
    improve.push({ label: 'Shot flags', delta: flagDelta, unit: ' fewer flags' });
  } else if (flagDelta <= -4) {
    focus.push({ label: 'Shot flags', delta: flagDelta, unit: ' more flags' });
  }

  if (sA.fatigueDetected && !sB.fatigueDetected) {
    improve.push({ label: 'Second-half fade', delta: 1, unit: ' improved' });
  } else if (!sA.fatigueDetected && sB.fatigueDetected) {
    focus.push({ label: 'Second-half fade', delta: -1, unit: ' now detected' });
  }

  const llmB = getSessionLlmInsights(sessionB?.results);
  const llmA = getSessionLlmInsights(sessionA?.results);
  const llmPrimary = llmB || llmA || null;
  const normalizeAiLine = (x) => String(x || '').trim().replace(/\s+/g, ' ');
  const uniqAiLines = (arr) => {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(arr) ? arr : []) {
      const line = normalizeAiLine(raw);
      if (!line) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
    return out;
  };
  const strengthsA = uniqAiLines(llmA?.strengths || []);
  const strengthsB = uniqAiLines(llmB?.strengths || []);
  const focusA = uniqAiLines(llmA?.improvements || []);
  const focusB = uniqAiLines(llmB?.improvements || []);
  const newlyImproved = strengthsB.filter((x) => !strengthsA.some((y) => y.toLowerCase() === x.toLowerCase()));
  const newlyFocus = focusB.filter((x) => !focusA.some((y) => y.toLowerCase() === x.toLowerCase()));
  const llmStrengthsResolved = uniqAiLines([...newlyImproved, ...strengthsB, ...strengthsA]).slice(0, 4);
  const llmFocusResolved = uniqAiLines([...newlyFocus, ...focusB, ...focusA]).slice(0, 4);
  const improveLis = llmStrengthsResolved.length
    ? llmStrengthsResolved.map((x) => `<li>${escapeHtml(String(x))}</li>`).join('')
    : improve.length
      ? improve
          .slice(0, 4)
          .map((x) => {
            if (x.label === 'Shot flags') return `<li>${escapeHtml(x.label)} dropped (${Math.abs(x.delta)}${escapeHtml(x.unit)}).</li>`;
            if (x.label === 'Second-half fade') return `<li>${escapeHtml(x.label)}: no clear late-session drop in the recent session.</li>`;
            return `<li>${escapeHtml(x.label)} improved by ${escapeHtml(x.delta.toFixed(1))}${escapeHtml(x.unit)}.</li>`;
          })
          .join('')
      : '<li>No clear major jumps yet — progress is steady.</li>';

  const focusLis = llmFocusResolved.length
    ? llmFocusResolved.map((x) => `<li>${escapeHtml(String(x))}</li>`).join('')
    : focus.length
      ? focus
          .slice(0, 4)
          .map((x) => {
            if (x.label === 'Shot flags') return `<li>${escapeHtml(x.label)} rose (${Math.abs(x.delta)}${escapeHtml(x.unit)}).</li>`;
            if (x.label === 'Second-half fade') return '<li>Second-half swing fade appears in the recent session.</li>';
            return `<li>${escapeHtml(x.label)} dipped by ${escapeHtml(Math.abs(x.delta).toFixed(1))}${escapeHtml(x.unit)}.</li>`;
          })
          .join('')
      : '<li>No major declines detected from baseline.</li>';
  const aiLabel = llmStrengthsResolved.length || llmFocusResolved.length
    ? `<p class="compare-pair-insight-sub">AI coach lens (${escapeHtml(llmPrimary?.fallback_used ? 'Fallback' : String(llmPrimary?.provider || 'LLM').toUpperCase())}) compares Session 2 vs Session 1.</p>`
    : '';

  return `
    <section class="compare-pair-insight" aria-label="Recent improvements and focus areas">
      <header class="compare-pair-insight-head">
        <h3 class="compare-pair-insight-title">Recent session review</h3>
        <p class="compare-pair-insight-sub">What improved in Session 2 vs Session 1, and what to focus on next net.</p>
        ${aiLabel}
      </header>
      <div class="compare-pair-insight-grid">
        <article class="compare-pair-card compare-pair-card--up">
          <div class="compare-pair-card-kicker">Improvements</div>
          <ul>${improveLis}</ul>
        </article>
        <article class="compare-pair-card compare-pair-card--down">
          <div class="compare-pair-card-kicker">Needs focus</div>
          <ul>${focusLis}</ul>
        </article>
      </div>
    </section>`;
}

function buildCrossPlayerInsightHtml(sessionA, sessionB, analysisA, analysisB, seriesA, seriesB) {
  const peers = getCompletedSessionsForCompare();
  const p1 = crossPlayerNameFromSession(sessionA, peers);
  const p2 = crossPlayerNameFromSession(sessionB, peers);
  const aRows = Array.isArray(seriesA) && seriesA.length ? seriesA : getConfirmedTrendShotsFromResults(sessionA.results);
  const bRows = Array.isArray(seriesB) && seriesB.length ? seriesB : getConfirmedTrendShotsFromResults(sessionB.results);

  function prettyLengthLabel(lbl) {
    const map = {
      yorker: 'Yorker',
      full: 'Full',
      good_length: 'Good length',
      short: 'Short',
      full_toss: 'Full toss',
    };
    return map[String(lbl || '').toLowerCase()] || (lbl ? String(lbl).replace(/_/g, ' ') : '—');
  }

  function summarizePlayer(session, rows) {
    const replay = getSessionReplay(session.results);
    const confirmed = (replay?.shots || []).filter((s) => Number(s.conf ?? s.confidence) >= 0.3);
    const shotBuckets = new Map();
    for (const sh of confirmed) {
      const key = shotLabelPretty(sh.shot_type || sh.label || 'Unknown');
      const score = Number(sh.shot_score);
      if (!Number.isFinite(score)) continue;
      const rec = shotBuckets.get(key) || { sum: 0, n: 0 };
      rec.sum += score;
      rec.n += 1;
      shotBuckets.set(key, rec);
    }
    const shotAverages = [...shotBuckets.entries()]
      .map(([label, v]) => ({ label, avg: v.sum / Math.max(1, v.n), n: v.n }))
      .sort((x, y) => y.avg - x.avg);
    const bestShots = shotAverages.slice(0, 2);
    const weakShots = shotAverages.slice(-2).reverse();

    const deliveries = getBallAnalyticsFromResults(session.results)?.deliveries || [];
    const scoreByShotNum = new Map();
    for (const sh of confirmed) {
      const sn = Number(sh.shot_num);
      const sc = Number(sh.shot_score);
      if (Number.isFinite(sn) && Number.isFinite(sc)) scoreByShotNum.set(sn, sc);
    }
    const lengthBuckets = new Map();
    for (const d of deliveries) {
      const z = d?.length?.label;
      if (!z) continue;
      const sn = Number(d.shot_num ?? d.matched_confirmed_shot_num);
      const sc = scoreByShotNum.get(sn);
      const rec = lengthBuckets.get(z) || { sum: 0, n: 0 };
      if (Number.isFinite(sc)) {
        rec.sum += sc;
        rec.n += 1;
      }
      lengthBuckets.set(z, rec);
    }
    const lengthAverages = [...lengthBuckets.entries()]
      .map(([label, v]) => ({ label, avg: v.n > 0 ? v.sum / v.n : null, n: v.n }))
      .filter((x) => x.avg != null)
      .sort((x, y) => Number(y.avg) - Number(x.avg));
    const bestRange = lengthAverages[0] || null;
    const weakRange = lengthAverages.length > 1 ? lengthAverages[lengthAverages.length - 1] : null;

    const avgExec = avg(rows.map((r) => Number(r.score)).filter((x) => Number.isFinite(x)));
    const metrics = resolveSessionAggregateMetrics(session, getSessionAnalysis(session.results));
    const llm = getSessionLlmInsights(session.results);
    return { bestShots, weakShots, bestRange, weakRange, avgExec, metrics, llm };
  }

  const s1 = summarizePlayer(sessionA, aRows);
  const s2 = summarizePlayer(sessionB, bRows);

  function shotLine(it) {
    if (!it) return 'No strong shot pattern yet.';
    return `${it.label} (${it.avg.toFixed(1)}/10 avg, ${it.n} shot${it.n === 1 ? '' : 's'})`;
  }
  function rangeLine(it, emptyMsg) {
    if (!it) return emptyMsg;
    return `${prettyLengthLabel(it.label)} (${Number(it.avg).toFixed(1)}/10 avg)`;
  }

  function profileHtml(name, info) {
    const m = info.metrics || {};
    const metricRows = [
      { k: 'Head', v: m.head, u: '/100' },
      { k: 'Stance', v: m.balance, u: '/100' },
      { k: 'Feet', v: m.footwork, u: '/100' },
      { k: 'Swing', v: m.swingI, u: '/100' },
      { k: 'Execution', v: m.execution, u: '/10' },
    ].map((x) => ({
      ...x,
      score:
        x.v == null || Number.isNaN(Number(x.v))
          ? null
          : x.u === '/10'
            ? Number(x.v) * 10
            : Number(x.v),
    }));
    const metricBest = metricRows
      .filter((x) => x.score != null)
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, 2)
      .map((x) => x.k);
    const metricWeak = metricRows
      .filter((x) => x.score != null)
      .sort((a, b) => Number(a.score) - Number(b.score))
      .slice(0, 2)
      .map((x) => x.k);

    function strengthComment(metricKey) {
      switch (metricKey) {
        case 'Head': return 'Head position looks stable and controlled.';
        case 'Stance': return 'Stance shape is balanced before contact.';
        case 'Feet': return 'Foot movement is active and supports timing.';
        case 'Swing': return 'Swing intent stays strong through the session.';
        case 'Execution': return 'Shot execution quality is consistently solid.';
        default: return 'Overall rhythm looks good.';
      }
    }
    function weaknessComment(metricKey) {
      switch (metricKey) {
        case 'Head': return 'Head stability can improve for cleaner contact.';
        case 'Stance': return 'Stance balance needs tighter alignment.';
        case 'Feet': return 'Footwork timing needs more consistency.';
        case 'Swing': return 'Swing effort drops at times under pressure.';
        case 'Execution': return 'Execution consistency is the main growth area.';
        default: return 'This area needs focused reps.';
      }
    }

    const llmStrengths = Array.isArray(info?.llm?.strengths) ? info.llm.strengths.filter(Boolean).slice(0, 3) : [];
    const llmWeaknesses = Array.isArray(info?.llm?.improvements) ? info.llm.improvements.filter(Boolean).slice(0, 3) : [];
    const llmImprovementsLis = llmStrengths.length
      ? llmStrengths.map((x) => `<li>${escapeHtml(String(x))}</li>`).join('')
      : metricBest.length
        ? metricBest.map((k) => `<li>${escapeHtml(strengthComment(k))}</li>`).slice(0, 3).join('')
        : '<li>Strength profile will improve as more sessions are recorded.</li>';
    const llmFocusLis = llmWeaknesses.length
      ? llmWeaknesses.map((x) => `<li>${escapeHtml(String(x))}</li>`).join('')
      : metricWeak.length
        ? metricWeak.map((k) => `<li>${escapeHtml(weaknessComment(k))}</li>`).slice(0, 3).join('')
        : '<li>No clear weakness detected yet.</li>';
  const strengthNotes = llmStrengths.length
      ? llmStrengths.map((x) => String(x)).join(' ')
      : metricBest.length
        ? metricBest.map((k) => strengthComment(k)).slice(0, 2).join(' ')
        : 'Strength profile will improve as more sessions are recorded.';
    const weaknessNotes = llmWeaknesses.length
      ? llmWeaknesses.map((x) => String(x)).join(' ')
      : metricWeak.length
        ? metricWeak.map((k) => weaknessComment(k)).slice(0, 2).join(' ')
        : 'No clear weakness detected yet.';
    const aiSource = info?.llm
      ? (info.llm.fallback_used || info.llm.provider === 'fallback_rules' ? 'Fallback' : (String(info.llm.provider || 'LLM').toUpperCase()))
      : null;
    return `
      <article class="compare-pair-card compare-pair-card--up">
        <div class="compare-pair-card-kicker">${escapeHtml(name)}${aiSource ? ` <span class="compare-meta-note">· AI ${escapeHtml(aiSource)}</span>` : ''}</div>
        <div class="compare-player-summary-row">
          <div class="compare-player-summary compare-player-summary--good">
            <span class="compare-player-summary-k">Improvements (AI)</span>
            <ul class="compare-player-summary-list">${llmImprovementsLis}</ul>
            <span class="compare-player-summary-metric">${escapeHtml(strengthNotes)}</span>
          </div>
          <div class="compare-player-summary compare-player-summary--warn">
            <span class="compare-player-summary-k">Needs focus (AI)</span>
            <ul class="compare-player-summary-list">${llmFocusLis}</ul>
            <span class="compare-player-summary-metric">${escapeHtml(weaknessNotes)}</span>
          </div>
        </div>
        <div class="compare-player-intel-grid">
          <div class="compare-player-intel-box compare-player-intel-box--good">
            <div class="compare-player-intel-title">Best shots</div>
            <p>${escapeHtml(shotLine(info.bestShots[0]))}</p>
            <p>${escapeHtml(shotLine(info.bestShots[1]))}</p>
          </div>
          <div class="compare-player-intel-box compare-player-intel-box--warn">
            <div class="compare-player-intel-title">Weak shots</div>
            <p>${escapeHtml(shotLine(info.weakShots[0]))}</p>
            <p>${escapeHtml(shotLine(info.weakShots[1]))}</p>
          </div>
          <div class="compare-player-intel-box compare-player-intel-box--good">
            <div class="compare-player-intel-title">Best ball range</div>
            <p>${escapeHtml(rangeLine(info.bestRange, 'Not enough tracked-ball data yet.'))}</p>
          </div>
          <div class="compare-player-intel-box compare-player-intel-box--warn">
            <div class="compare-player-intel-title">Weak ball range</div>
            <p>${escapeHtml(rangeLine(info.weakRange, 'Need more tracked deliveries to rank ranges.'))}</p>
          </div>
        </div>
      </article>`;
  }

  return `
    <section class="compare-pair-insight compare-pair-insight--cross" aria-label="Cross-player strengths and weaknesses">
      <header class="compare-pair-insight-head">
        <h3 class="compare-pair-insight-title">Cross-player review</h3>
        <p class="compare-pair-insight-sub">Player-wise breakdown with shot strengths/weaknesses and ball-range comfort zones.</p>
      </header>
      <div class="compare-pair-insight-grid">
        ${profileHtml(p1, s1)}
        ${profileHtml(p2, s2)}
      </div>
    </section>`;
}

function updateSessionCompareModalContext() {
  const lead = document.getElementById('sessionCompareLead');
  const titleEl = document.getElementById('sessionCompareTitle');
  if (titleEl) {
    if (isCoachRole() && state.coachCompareSessions && state.coachComparePlayerLabel) {
      titleEl.textContent = `Session comparison · ${state.coachComparePlayerLabel}`;
    } else {
      titleEl.textContent = 'Session Comparison';
    }
  }
  if (!lead) return;
  if (isCoachRole() && state.coachCompareSessions && state.coachComparePlayerLabel) {
    lead.textContent = `Sessions for ${state.coachComparePlayerLabel}. Pick two completed sessions to compare, or overlay every completed session from this calendar month on the same charts.`;
  } else {
    lead.textContent =
      'Pick two completed sessions to compare, or overlay every completed session from this calendar month on the same charts.';
  }
}

function updateCompareMonthButton() {
  if (!compareThisMonthBtn) return;
  if (isCrossPlayerCompareActive()) {
    compareThisMonthBtn.disabled = true;
    compareThisMonthBtn.hidden = true;
    return;
  }
  compareThisMonthBtn.hidden = false;
  const monthSessions = getCompletedSessionsThisMonth(getCompareSessionsSource());
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
  if (isCrossPlayerCompareActive()) {
    sessionCompareBody.innerHTML =
      '<p class="session-item-empty">This month overlay is disabled for cross-player comparison. Select two sessions instead.</p>';
    return;
  }
  const monthSessions = getCompletedSessionsThisMonth(getCompareSessionsSource());
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
        return `<div><span class="compare-meta-k">${escapeHtml(sessionCompareDisplayLabel(s, monthSessions))}</span><span class="compare-meta-note">Signature: ${escapeHtml(best)}</span></div>`;
      })
      .join('');
    sessionCompareBody.innerHTML = `
      <div class="compare-view-banner">
        <button type="button" class="ce-btn ce-btn--ghost compare-back-pair-btn" data-compare-back>← Two-session compare</button>
        <span class="compare-view-banner-title">${escapeHtml(bannerTitle)}</span>
      </div>
      ${buildMonthPlayerInsightHtml(monthSessions, analyses)}
      ${buildCompareAggregateCoreMetricsHtml(monthSessions, analyses)}
      ${buildCompareLengthMonthHtml(monthSessions)}
      <p class="session-item-empty">No per-shot replay data for any of these sessions, so charts cannot be drawn.</p>
      <div class="compare-meta-row compare-meta-row--month">${meta}</div>`;
    requestAnimationFrame(() => animateComparePies());
    return;
  }

  const entries = monthSessions.map((s, i) => ({
    series: seriesList[i],
    color: COMPARE_MULTI_COLORS[i % COMPARE_MULTI_COLORS.length],
    legend: sessionCompareDisplayLabel(s, monthSessions),
  }));

  const charts = [
    buildMultiLineCompareGraph(entries, 'head_quality_score', 'Head position (0–100)', 100),
    buildMultiLineCompareGraph(entries, 'symmetry_score', 'Batting stance (0–100)', 100),
    buildMultiLineCompareGraph(entries, 'footwork_score', 'Foot movement (0–100)', 100),
    buildMultiLineCompareGraph(entries, 'swing_path_score', 'Swing arc (0–100)', 100),
    buildMultiLineCompareGraph(entries, 'execution_score', 'Shot execution (0–100)', 100),
    buildMultiLineCompareGraph(entries, 'score', 'Overall score (/10)', 10),
  ].join('');

  const bestCells = monthSessions
    .map((s, i) => {
      const r = analyses[i];
      const best = r.best_shot?.label ? shotLabelPretty(r.best_shot.label) : '—';
      return `<div><span class="compare-meta-k">Signature shot</span> ${escapeHtml(best)}<span class="compare-meta-note">${escapeHtml(
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
    ${buildCompareAggregateCoreMetricsHtml(monthSessions, analyses)}
    ${buildCompareLengthMonthHtml(monthSessions)}
    <div class="compare-trends-stack">${charts}</div>
    <div class="compare-meta-row compare-meta-row--month">${bestCells}</div>
  `;
  requestAnimationFrame(() => animateComparePies());
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
  state.coachCompareSessions = null;
  state.coachComparePlayerLabel = null;
  state.compareSessionLabelOverrides = null;
  updateSessionCompareModalContext();
  refreshCompareSessionOptions();
  openModal(sessionCompareModal);
}

function openCoachSessionCompareForPlayer(playerId) {
  if (!playerId || !isCoachRole()) return;
  const all = state.coachSessionsRaw || [];
  state.coachCompareSessions = all.filter((s) => String(s.user_id) === String(playerId));
  const prof = (state.coachPlayersRaw || []).find((x) => String(x.id) === String(playerId));
  state.coachComparePlayerLabel = prof?.full_name || prof?.email || 'Player';
  updateSessionCompareModalContext();
  refreshCompareSessionOptions();
  openModal(sessionCompareModal);
}

function openCoachCrossPlayerCompare(playerAId, playerBId) {
  if (!isCoachRole()) return;
  const pA = (state.coachPlayersRaw || []).find((p) => String(p.id) === String(playerAId));
  const pB = (state.coachPlayersRaw || []).find((p) => String(p.id) === String(playerBId));
  if (!pA || !pB) return;
  if (String(playerAId) === String(playerBId)) {
    alert('Pick two different players for cross-player compare.');
    return;
  }
  const completedA = getPlayerCompletedSessionsForCompare(
    new Map([[pA.id, (state.coachSessionsRaw || []).filter((s) => String(s.user_id) === String(pA.id))]]),
    pA.id
  );
  const completedB = getPlayerCompletedSessionsForCompare(
    new Map([[pB.id, (state.coachSessionsRaw || []).filter((s) => String(s.user_id) === String(pB.id))]]),
    pB.id
  );
  const sA = completedA[0];
  const sB = completedB[0];
  if (!sA || !sB) {
    alert('Both players need at least one completed analyzed session.');
    return;
  }
  const labelA = pA.full_name || pA.email || 'Player A';
  const labelB = pB.full_name || pB.email || 'Player B';
  state.coachCompareSessions = [sA, sB];
  state.coachComparePlayerLabel = `${labelA} vs ${labelB}`;
  state.compareSessionLabelOverrides = {
    [String(sA.id)]: `${labelA} · ${sessionCompareDisplayLabel({ ...sA, id: '' }, [])}`,
    [String(sB.id)]: `${labelB} · ${sessionCompareDisplayLabel({ ...sB, id: '' }, [])}`,
  };
  updateSessionCompareModalContext();
  refreshCompareSessionOptions();
  if (compareSessionA) compareSessionA.value = sA.id;
  if (compareSessionB) compareSessionB.value = sB.id;
  renderSessionComparison(sA, sB);
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
    closeModal(playCardDetailModal);
    closeModal(sessionCompareModal);
    closeModal(resetEverythingModal);
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
      <div class="session-item-row">
        <button type="button" class="session-card" data-session-id="${sid}">
          <div class="session-card-top">
            <span class="session-card-date">${escapeHtml(created)}</span>
            <span class="${statusBadgeClass(s.status)}">${escapeHtml(stat)}</span>
          </div>
          <div class="session-card-file" title="${escapeHtml(sessionVideoFilename(s.video_url))}">${escapeHtml(sessionVideoFilename(s.video_url))}</div>
          ${sum ? `<div class="session-card-summary">${escapeHtml(sum)}</div>` : '<div class="session-card-summary session-card-summary--muted">Open for session details</div>'}
          <span class="session-card-hint">View full session report</span>
        </button>
        <button type="button" class="session-card-delete" data-session-delete="${sid}" title="Remove this session">×</button>
      </div>
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
  try {
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
  } catch (err) {
    console.warn('[CrickEye] fetchUserSessions failed:', err?.message || err);
    renderSessions([]);
  }
}

/**
 * Remove one session row. File-hash cache is per row — deleting lets the same video be re-analysed.
 * Requires Supabase policy `sessions_delete_own` (see backend/sql/sessions_delete_policy.sql).
 */
async function deleteSessionById(sessionId) {
  if (!supabaseClient || !state.currentUser || !sessionId) return;
  const uid = state.currentUser.id;
  const row = state.sessionsCache.find((s) => String(s?.id) === String(sessionId));
  if (row?.video_url) await deleteVideoFromStorage(row.video_url);
  const { error } = await supabaseClient
    .from('sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', uid);
  if (error) {
    console.error('[CrickEye] session delete error:', error.message);
    alert(
      `Could not remove session: ${error.message}\n\n` +
        'If this mentions RLS or policy, run backend/sql/sessions_delete_policy.sql in the Supabase SQL editor once.'
    );
    return;
  }
  if (state.activeSessionId === sessionId) state.activeSessionId = null;
  await fetchUserSessions();
}

async function deleteAllSessionsForCurrentUser() {
  if (!supabaseClient || !state.currentUser) return;
  const n = state.sessionsCache.length;
  if (!n) return;
  const ok = window.confirm(
    `Remove all ${n} saved session(s)?\n\n` +
      'Same videos can be uploaded again; analysis will run fresh (no cached results for deleted rows).'
  );
  if (!ok) return;
  const uid = state.currentUser.id;
  await deleteAllUserVideosFromStorage(uid);
  const { error } = await supabaseClient.from('sessions').delete().eq('user_id', uid);
  if (error) {
    console.error('[CrickEye] delete all sessions error:', error.message);
    alert(
      `Could not clear sessions: ${error.message}\n\n` +
        'If this mentions RLS or policy, run backend/sql/sessions_delete_policy.sql in the Supabase SQL editor once.'
    );
    return;
  }
  state.activeSessionId = null;
  await fetchUserSessions();
}

function fillResetEverythingModal({ hadSessions }) {
  if (resetEverythingLead) {
    resetEverythingLead.textContent =
      hadSessions > 0
        ? `Removed ${hadSessions} saved session row(s) and uploaded videos from cloud storage. Replay cache is cleared for your account.`
        : 'No session rows were stored for this account. Cloud videos under your account folder were still removed if any were found.';
  }
  if (resetEverythingOrigin) {
    resetEverythingOrigin.textContent =
      typeof location !== 'undefined' ? location.origin : '';
  }
}

/**
 * Delete all Supabase session rows for this user, then show browser + disk cleanup tips.
 */
async function resetEverythingForCurrentUser() {
  if (!supabaseClient || !state.currentUser) {
    alert('Login is required to reset cloud sessions.');
    return;
  }
  const ok = window.confirm(
    'Reset everything?\n\n' +
      '• Deletes ALL saved sessions in the cloud (replay cache for this account).\n' +
      '• Then you will see optional steps to clear this site in your browser.\n\n' +
      'Continue?'
  );
  if (!ok) return;
  const uid = state.currentUser.id;
  const hadSessions = state.sessionsCache.length;
  await deleteAllUserVideosFromStorage(uid);
  const { error } = await supabaseClient.from('sessions').delete().eq('user_id', uid);
  if (error) {
    console.error('[CrickEye] reset everything (delete sessions) error:', error.message);
    alert(
      `Could not delete sessions: ${error.message}\n\n` +
        'If this mentions RLS or policy, run backend/sql/sessions_delete_policy.sql in the Supabase SQL editor once.'
    );
    return;
  }
  state.activeSessionId = null;
  await fetchUserSessions();
  fillResetEverythingModal({ hadSessions });
  openModal(resetEverythingModal);
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
  try {
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
  } catch (err) {
    const msg = err?.message === 'Failed to fetch'
      ? 'Unable to connect to Supabase auth host. Check your network connection or SUPABASE_URL in backend/.env.'
      : (err?.message || 'Signup failed');
    setGateMessage(msg, true);
  }
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
  try {
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
  } catch (err) {
    const msg = err?.message === 'Failed to fetch'
      ? 'Unable to connect to Supabase auth host. Check your network connection or SUPABASE_URL in backend/.env.'
      : (err?.message || 'Login failed');
    setGateMessage(msg, true);
  }
}

async function logout() {
  if (!supabaseClient) return;
  try { await supabaseClient.auth.signOut(); } catch { /* ignore */ }
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
  try {
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
  } catch (err) {
    console.warn('[CrickEye] initAuth network error:', err?.message || err);
    setPlayerAppVisible(true);
    updateAuthUi();
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
  const llmInsights = getSessionLlmInsights(cached.results);
  if (!replay || !replay.complete || !Array.isArray(replay.shots)) return false;

  state.activeSessionId = cached.id;
  rebuildDerivedShotStateFromShots(replay.shots);
  state.sessionAnalysis = analysis;
  state.latestLlmInsights = llmInsights || buildLocalFallbackLlmInsights(analysis, 'cached_llm_missing');
  state.videoFlushed = false;
  state.drawnSpokes.clear();
  const msg = {
    ...replay.complete,
    analysis: analysis || replay.complete.analysis,
    llm_insights: state.latestLlmInsights,
  };
  if (!msg.output_video) msg.output_video = '/assets/analysed_out.mp4';
  onComplete(msg, { skipPersist: true, videoDelayMs: 250 });
  console.log('[CrickEye] Reused completed session (same video file). Pipeline skipped.');
  return true;
}

async function createSupabaseSessionForLiveAnalysis(file, fileHash = null) {
  if (!supabaseClient) throw new Error('Supabase is not configured in frontend.');
  if (!state.currentUser) throw new Error('Please login first.');

  const filePath = buildVideoStoragePath(state.currentUser.id, file, fileHash);
  const { error: uploadError } = await supabaseClient.storage
    .from('videos')
    .upload(filePath, file, { upsert: true, contentType: file.type || undefined });
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

async function fetchLlmInsightsForResults(resultsPayload) {
  if (!resultsPayload || typeof resultsPayload !== 'object') return null;
  const baseUrl = (window.CRICKEYE_CONFIG && window.CRICKEYE_CONFIG.backendApiBaseUrl)
    ? String(window.CRICKEYE_CONFIG.backendApiBaseUrl).replace(/\/+$/, '')
    : '';
  // DGX can take ~40-50s for strict JSON output; keep browser timeout above backend processing window.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeoutMs = attempt === 1 ? 95000 : 120000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/llm-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: resultsPayload }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`LLM API ${res.status}`);
      const data = await res.json();
      if (!data || typeof data !== 'object') return null;
      return data.llm_insights && typeof data.llm_insights === 'object' ? data.llm_insights : null;
    } catch (err) {
      const isTimeout = err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('aborted');
      const reason = isTimeout ? `timeout>${timeoutMs}ms` : (err?.message || err);
      console.warn(`[CrickEye] llm-insights request failed (attempt ${attempt}):`, reason);
      if (attempt >= 2) return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildLlmRequestPayload(resultsPayload) {
  if (!resultsPayload || typeof resultsPayload !== 'object') return null;
  const analysis = resultsPayload.analysis && typeof resultsPayload.analysis === 'object'
    ? resultsPayload.analysis
    : {};
  const replayShots = Array.isArray(resultsPayload?.replay?.shots)
    ? resultsPayload.replay.shots
    : [];
  // Send only LLM-relevant fields to avoid large payload timeouts.
  return {
    analysis,
    replay: { shots: replayShots },
  };
}

function buildLocalFallbackLlmInsights(analysis, reason = 'llm_unavailable') {
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
    .map((a) => String(a.player_cue || a.message || '').trim())
    .filter(Boolean);
  if (!improvements.length) improvements.push('Record more sessions to surface clearer priorities.');
  return {
    provider: 'fallback_rules',
    model: 'rule_based_local',
    generated_at: new Date().toISOString(),
    version: 'cricket_coach_v1',
    fallback_used: true,
    error: reason,
    summary: 'AI coach was unavailable for this save. Showing clear cricket cues from your tracked metrics.',
    strengths,
    improvements,
    shot_type_notes: {},
    metric_notes: {},
  };
}

async function saveLiveAnalysisResult(msg) {
  if (!supabaseClient || !state.activeSessionId || !state.currentUser) return;
  if (state.analysisCacheVersion == null) await refreshAnalysisCacheVersion();
  const analysis = state.sessionAnalysis || msg.analysis || null;
  const ballAnalyticsSaved = msg.ball_analytics || null;
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
      ball_analytics: ballAnalyticsSaved,
    },
    shots: JSON.parse(JSON.stringify(state.shotLog)),
  };
  const fp = state.pendingAnalysisFileHash || null;
  const payload = {
    analysis,
    replay,
    file_fingerprint: fp,
    // Top-level: Compare Sessions + My Sessions detail read this for length vs performance.
    ball_analytics: ballAnalyticsSaved,
  };
  if (typeof state.analysisCacheVersion === 'number' && !Number.isNaN(state.analysisCacheVersion)) {
    payload.analysis_cache_version = state.analysisCacheVersion;
  }
  const llmFromServer = msg?.llm_insights && typeof msg.llm_insights === 'object' ? msg.llm_insights : null;
  const llmRequestPayload = buildLlmRequestPayload(payload);
  const llmFetched = llmRequestPayload ? await fetchLlmInsightsForResults(llmRequestPayload) : null;
  const llmInsights = llmFromServer || llmFetched;
  payload.llm_insights = llmInsights || buildLocalFallbackLlmInsights(analysis, 'llm_request_failed');
  state.latestLlmInsights = payload.llm_insights;
  if (state.completePayload && typeof state.completePayload === 'object') {
    state.completePayload.llm_insights = payload.llm_insights;
  }
  // If report is open while LLM arrives, refresh it so badge/content switches from placeholder/fallback to latest.
  try {
    const mainVideo = document.getElementById('mainVideo');
    const videoFinished = mainVideo && mainVideo.ended;
    if (typeof PlayCard !== 'undefined' && PlayCard.isActive && PlayCard.isActive()) {
      PlayCard.refresh(state);
    } else if (videoFinished && state.sessionAnalysis && typeof PlayCard !== 'undefined' && PlayCard.revealAfterDelay) {
      if (PlayCard.isCompiling && PlayCard.isCompiling()) {
        PlayCard.refresh(state);
      } else if (!PlayCard.isActive || !PlayCard.isActive()) {
        PlayCard.revealAfterDelay(state);
      } else {
        PlayCard.refresh(state);
      }
    } else if (document.getElementById('rpOverlay') && state.sessionAnalysis && typeof ReportModal !== 'undefined') {
      ReportModal.close();
      ReportModal.open(state, state.sessionAnalysis);
    }
  } catch (e) {
    console.warn('[CrickEye] report refresh after LLM update failed:', e?.message || e);
  }
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
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:8000';
  ws = new WebSocket(`${protocol}//${host}/ws`);
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
  ball_tracking:'Ball tracking & speed (YOLO)…',
};
function onStage(msg) {
  updateStageText(msg.message || STAGE_LABELS[msg.stage] || msg.stage);
  const tf = Number(msg.total_frames);
  if (msg.stage==='keypoints' && tf > 0) updateProcStat('procFrame',`0 / ${tf}`);
  if (msg.stage==='ball_tracking' && tf > 0) updateProcStat('procFrame',`0 / ${tf}`);
  if (msg.stage==='rendering') updateProcStat('procFrame',`0 / ${(tf > 0 ? tf : '—')}`);
}
function onProgress(msg) {
  setProgressBar(Math.max(0, Math.min(100, msg.pct || 0)));
  const f = Number(msg.frame);
  const t = Number(msg.total);
  if (f >= 0 && t > 0) updateProcStat('procFrame',`${f} / ${t}`);
  if (msg.eta!==undefined)  updateProcStat('procEta',  msg.eta>0?`${msg.eta}s`:'—');
}

function onShotReceived(msg) {
  const existingIdx = state.shotLog.findIndex(s => s.shot_num === msg.shot_num);
  if (existingIdx >= 0) {
    state.shotLog[existingIdx] = msg;
    const spokeIdx = state.pendingSpokes.findIndex(s => s.shot_num === msg.shot_num);
    if (spokeIdx >= 0) {
      state.pendingSpokes[spokeIdx].msg = msg;
      state.pendingSpokes[spokeIdx].label = msg.label;
    }
  } else {
    state.shotLog.push(msg);
    if (!state.shotStats[msg.label]) state.shotStats[msg.label] = {count:0};
    state.shotStats[msg.label].count++;
    const zone = SHOT_ZONE[msg.label];
    if (zone) state.zoneCounts[zone]++;
    const ts = msg.timestamp || '00:00.00';
    const parts = ts.split(':');
    state.pendingSpokes.push({
      timestamp_sec: parseFloat(parts[0]) * 60 + parseFloat(parts[1] || 0),
      label: msg.label,
      shot_num: msg.shot_num,
      msg
    });
  }

  const confirmedCount = state.shotLog.filter(s => s.confirmed !== false).length;
  updateProcStat('procShots', `${confirmedCount} confirmed`);
  renderLiveProcShotCard(msg);
}

function renderLiveProcShotCard(shot) {
  const container = document.getElementById('procLiveShots');
  if (!container) return;

  let card = document.getElementById(`procShotCard-${shot.shot_num}`);
  const shotLabel = (SHOT_LABELS[shot.label] || shot.label || 'Shot').toUpperCase();
  const color = SHOT_COLORS[shot.label] || '#06B6D4';
  const confPct = Math.round((shot.conf || 0) * 100);
  const scoreVal = shot.shot_score != null ? Number(shot.shot_score).toFixed(1) : '—';
  const speedVal = shot.peak_swing_speed != null ? `${Math.round(shot.peak_swing_speed)} km/h` : '';
  const stanceVal = shot.handedness || '';

  const html = `
    <div class="proc-shot-header">
      <span class="proc-shot-pill" style="border-color:${color}; color:${color};">⚡ SHOT #${shot.shot_num} ANALYSED</span>
      <span class="proc-shot-conf">${confPct}% CONF</span>
    </div>
    <div class="proc-shot-main">
      <span class="proc-shot-name" style="color:${color};">${shotLabel}</span>
      <div class="proc-shot-tags">
        ${speedVal ? `<span class="proc-tag-speed">⚡ ${speedVal}</span>` : ''}
        ${stanceVal ? `<span class="proc-tag-stance">${stanceVal}</span>` : ''}
        <span class="proc-tag-score">SCORE: ${scoreVal}/10</span>
      </div>
    </div>
  `;

  if (card) {
    card.innerHTML = html;
  } else {
    card = document.createElement('div');
    card.id = `procShotCard-${shot.shot_num}`;
    card.className = 'proc-shot-card';
    card.innerHTML = html;
    container.appendChild(card);
  }
}

function onComplete(msg, opts = {}) {
  const skipPersist = opts.skipPersist === true;
  const videoDelayMs = opts.videoDelayMs != null ? opts.videoDelayMs : 150;

  state.completePayload = msg;
  if (msg.llm_insights && typeof msg.llm_insights === 'object') {
    state.latestLlmInsights = msg.llm_insights;
  } else {
    // Do not inject a premature fallback here; saveLiveAnalysisResult will fetch DGX then set final value.
    state.latestLlmInsights = null;
  }
  if (msg.total_frames && msg.fps) state.originalVideoDuration = msg.total_frames / msg.fps;
  if (msg.analysis && !state.sessionAnalysis) state.sessionAnalysis = msg.analysis;
  if (msg.fps) state.videoFps = msg.fps;

  state.ballPlaybackCap = -1;
  if (typeof BallAnalytics !== 'undefined') {
    BallAnalytics.setData(msg.ball_analytics || null, state.videoFps);
  }

  state.pendingSpokes.sort((a,b) => a.timestamp_sec - b.timestamp_sec);

  const handLower = msg.handedness==='LHB'?'left':'right';
  WagonWheel.clearAll();
  forceHand(handLower, msg.handedness||'RHB', msg.stance_conf||1.0);
  state.drawnSpokes.clear();

  // Pre-render the first shot right away into HUD and Biomech Card so the user sees results immediately
  if (state.pendingSpokes.length > 0) {
    const firstSpoke = state.pendingSpokes[0];
    if (!state.drawnSpokes.has(firstSpoke.shot_num)) {
      state.drawnSpokes.add(firstSpoke.shot_num);
      drawSpokeNow(firstSpoke);
    }
  }
  flushDashboard();

  const overlay = document.getElementById('processingOverlay');
  if (overlay) { overlay.style.transition='opacity 0.6s ease'; overlay.style.opacity='0'; setTimeout(()=>overlay.remove(),600); }

  if (!video || !msg.output_video) {
    if (!skipPersist) saveLiveAnalysisResult(msg);
    state.ballPlaybackCap = -1;
    if (typeof BallAnalytics !== 'undefined') BallAnalytics.setPlaybackVisibility(null);
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
    setTimeout(tryPlay, 2000);

    video.addEventListener('error', () => {
      const ve = video.error;
      const detail = ve ? `code ${ve.code} (${ve.message || 'decode/network'})` : 'unknown';
      console.error('[CrickEye] Output video failed to load/decode:', detail, url);
      updateStageText(`Video playback failed (${detail}). Re-run analysis after: pip install imageio-ffmpeg`);
      flushDashboard();
      drawAllSpokesWithoutPlayback();
    }, { once: true });
  }, videoDelayMs);
  // Session score panel auto-reveals on video 'ended' (see init()).
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
      const confirmed = state.shotLog.filter(s => Number(s.conf ?? s.confidence) >= 0.3);
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

  state.ballPlaybackCap = -1;

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
  state.latestLlmInsights = null;
  state.videoFps = 30;
  state.ballPlaybackCap = -1;
  if (typeof BallAnalytics !== 'undefined') BallAnalytics.clear();
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

// ── Webcam & Audio State ─────────────────────────────────────
let currentWebcamStream = null;
let currentMediaRecorder = null;
let recordedWebcamChunks = [];
let webcamCountdownTimer = null;
let webcamRecTimerInterval = null;
let selectedWebcamDuration = 5;
let isWebcamRecording = false;

function stopWebcamStream() {
  if (currentWebcamStream) {
    try {
      currentWebcamStream.getTracks().forEach(track => track.stop());
    } catch (e) {}
    currentWebcamStream = null;
  }
  if (webcamCountdownTimer) {
    clearInterval(webcamCountdownTimer);
    webcamCountdownTimer = null;
  }
  if (webcamRecTimerInterval) {
    clearInterval(webcamRecTimerInterval);
    webcamRecTimerInterval = null;
  }
  isWebcamRecording = false;
}

function playBeep(freq = 440, duration = 0.12, type = 'sine') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function getSupportedMimeType() {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=h264',
    'video/mp4'
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return '';
}

// ── Start Panel (v6.5 — file upload + Live Webcam) ───────────
function buildStartPanel(options = {}) {
  const existing = document.getElementById('startPanel');
  if (existing) existing.remove();

  stopWebcamStream();

  const defaultTab = options.defaultTab || 'upload';

  const panel = document.createElement('div');
  panel.id = 'startPanel';
  panel.innerHTML = `
    <div class="start-header">
      <div class="start-title-row">
        <svg width="34" height="34" viewBox="0 0 32 32" fill="none" style="filter:drop-shadow(0 0 10px #06B6D4)">
          <circle cx="16" cy="16" r="14" stroke="#06B6D4" stroke-width="1.5"/>
          <path d="M8 16 Q16 6 24 16 Q16 26 8 16Z" fill="#06B6D4" opacity="0.2" stroke="#06B6D4" stroke-width="1"/>
          <circle cx="16" cy="16" r="2.5" fill="#06B6D4"/>
        </svg>
        <div class="start-title">Start Delivery Analysis</div>
      </div>
      <div class="start-tabs">
        <button type="button" class="start-tab ${defaultTab === 'upload' ? 'active' : ''}" id="tabUpload">📁 Upload File</button>
        <button type="button" class="start-tab ${defaultTab === 'webcam' ? 'active' : ''}" id="tabWebcam">📹 Live Web Cam</button>
      </div>
    </div>

    <!-- TAB 1: FILE UPLOAD -->
    <div class="start-tab-content" id="uploadTabContent" style="${defaultTab === 'upload' ? 'display:flex' : 'display:none'}">
      <div class="start-form">
        <input type="file" id="videoFileInput" accept="video/*" style="display:none"/>
        <div class="upload-zone" id="uploadZone">
          <div class="upload-zone-icon">📁</div>
          <div class="upload-zone-label" id="uploadZoneLabel">Choose a video file</div>
          <div class="upload-zone-sub">MP4, AVI, MOV, WebM · any resolution</div>
        </div>
        <div class="upload-progress-wrap" id="uploadProgressWrap" style="display:none">
          <div class="upload-progress-track">
            <div class="upload-progress-fill" id="uploadProgressFill"></div>
          </div>
          <span class="upload-progress-label" id="uploadProgressLabel">Uploading… 0%</span>
        </div>
        <button class="start-btn" id="startBtn" disabled>▶  RUN CRICKEYE PIPELINE</button>
      </div>
    </div>

    <!-- TAB 2: LIVE WEBCAM -->
    <div class="start-tab-content" id="webcamTabContent" style="${defaultTab === 'webcam' ? 'display:flex' : 'display:none'}">
      <div class="webcam-viewport-wrap">
        <video id="webcamLivePreview" autoplay playsinline muted></video>
        <div class="webcam-alignment-guide" id="webcamGuide">
          <div class="guide-box guide-head">HEAD ZONE</div>
          <div class="guide-center-axis"></div>
          <div class="guide-box guide-crease">BATSMAN CREASE &amp; STUMP LINE</div>
        </div>
        <div class="webcam-rec-badge" id="webcamRecBadge" style="display:none">
          <span class="rec-dot-pulse"></span>
          <span id="webcamRecTimer">REC 00:00</span>
        </div>
        <div class="webcam-countdown-overlay" id="webcamCountdownOverlay" style="display:none">
          <div class="webcam-countdown-num" id="webcamCountdownNum">3</div>
          <div class="webcam-countdown-sub" id="webcamCountdownSub">GET IN STANCE!</div>
        </div>
      </div>

      <div class="webcam-toolbar">
        <div class="webcam-device-wrap">
          <select id="webcamDeviceSelect" class="webcam-select" title="Choose Camera"></select>
          <button type="button" id="webcamToggleGuideBtn" class="webcam-tool-btn" title="Toggle Stance Guide">🎯 Guide</button>
        </div>
        <div class="webcam-durations">
          <span class="webcam-dur-label">Duration:</span>
          <button type="button" class="webcam-dur-btn" data-sec="3">3s</button>
          <button type="button" class="webcam-dur-btn active" data-sec="5">5s (1 ball)</button>
          <button type="button" class="webcam-dur-btn" data-sec="8">8s</button>
        </div>
      </div>

      <div class="webcam-actions" id="webcamLiveActions">
        <button type="button" class="start-btn start-btn--record" id="webcamAutoRecordBtn">
          ⚡ RECORD DELIVERY (3s COUNTDOWN)
        </button>
        <div class="webcam-secondary-actions">
          <button type="button" class="webcam-manual-btn" id="webcamManualRecordBtn">⏺ Manual Record</button>
          <button type="button" class="webcam-cancel-btn" id="webcamStopRecordBtn" style="display:none">⏹ Stop &amp; Analyze</button>
        </div>
        <div class="webcam-info-badge" id="webcamInfoBadge">Initializing camera…</div>
      </div>
    </div>

    <div class="ws-status">
      <div class="ws-dot ${ws && ws.readyState === WebSocket.OPEN ? 'connected' : 'connecting'}" id="wsDot"></div>
      <span id="wsText">${ws && ws.readyState === WebSocket.OPEN ? 'CONNECTED (READY)' : 'CONNECTING…'}</span>
    </div>
  `;

  document.querySelector('.video-wrapper').appendChild(panel);

  const tabUpload          = document.getElementById('tabUpload');
  const tabWebcam          = document.getElementById('tabWebcam');
  const uploadContent      = document.getElementById('uploadTabContent');
  const webcamContent      = document.getElementById('webcamTabContent');

  const zone               = document.getElementById('uploadZone');
  const fileInput          = document.getElementById('videoFileInput');
  const label              = document.getElementById('uploadZoneLabel');
  const startBtn           = document.getElementById('startBtn');

  const liveVideo          = document.getElementById('webcamLivePreview');
  const guideEl            = document.getElementById('webcamGuide');
  const toggleGuideBtn     = document.getElementById('webcamToggleGuideBtn');
  const deviceSelect       = document.getElementById('webcamDeviceSelect');
  const infoBadge          = document.getElementById('webcamInfoBadge');
  const autoRecordBtn      = document.getElementById('webcamAutoRecordBtn');
  const manualRecordBtn    = document.getElementById('webcamManualRecordBtn');
  const stopRecordBtn      = document.getElementById('webcamStopRecordBtn');
  const countdownOverlay   = document.getElementById('webcamCountdownOverlay');
  const countdownNum       = document.getElementById('webcamCountdownNum');
  const countdownSub       = document.getElementById('webcamCountdownSub');
  const recBadge           = document.getElementById('webcamRecBadge');
  const recTimer           = document.getElementById('webcamRecTimer');
  const durationBtns       = Array.from(panel.querySelectorAll('.webcam-dur-btn'));

  tabUpload?.addEventListener('click', () => {
    tabUpload.classList.add('active');
    tabWebcam.classList.remove('active');
    if (uploadContent) uploadContent.style.display = 'flex';
    if (webcamContent) webcamContent.style.display = 'none';
    stopWebcamStream();
  });

  tabWebcam?.addEventListener('click', () => {
    tabWebcam.classList.add('active');
    tabUpload.classList.remove('active');
    if (uploadContent) uploadContent.style.display = 'none';
    if (webcamContent) webcamContent.style.display = 'flex';
    initWebcam();
  });

  zone?.addEventListener('click', () => fileInput.click());
  zone?.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone?.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone?.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) setSelectedFile(file);
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) setSelectedFile(file);
  });

  startBtn?.addEventListener('click', () => startAnalysis());

  function setSelectedFile(file) {
    fileInput._selectedFile = file;
    if (label) label.textContent = file.name;
    zone?.classList.add('has-file');
    if (ws && ws.readyState === WebSocket.OPEN && startBtn) startBtn.removeAttribute('disabled');
  }

  async function getStreamWithFallback(selectedDevId) {
    const constraintList = [];

    if (selectedDevId && typeof selectedDevId === 'string' && selectedDevId.trim()) {
      constraintList.push({
        video: {
          deviceId: { exact: selectedDevId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      constraintList.push({
        video: {
          deviceId: { ideal: selectedDevId }
        },
        audio: false
      });
    }

    constraintList.push({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    constraintList.push({
      video: true,
      audio: false
    });

    let lastErr = null;
    for (const c of constraintList) {
      try {
        const stream = await Promise.race([
          navigator.mediaDevices.getUserMedia(c),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout starting video source (hardware took too long to initialize or is locked by another application)')), 15000))
        ]);
        if (stream) return stream;
      } catch (err) {
        lastErr = err;
        console.warn('[CrickEye Webcam] Constraint attempt failed:', c, err?.message || err);
        // If permission was explicitly denied, don't keep looping through fallbacks
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw err;
        }
      }
    }
    throw lastErr || new Error('Could not access camera device');
  }

  async function initWebcam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (infoBadge) infoBadge.textContent = 'Webcam not supported in this browser.';
      alert('Camera access is not supported by your current browser.');
      return;
    }

    try {
      if (infoBadge) infoBadge.textContent = 'Connecting camera…';
      stopWebcamStream();
      // Brief pause for OS camera handle release
      await new Promise(r => setTimeout(r, 80));

      const selectedDevId = (deviceSelect && deviceSelect.value) ? deviceSelect.value : undefined;
      const stream = await getStreamWithFallback(selectedDevId);
      currentWebcamStream = stream;

      if (liveVideo) {
        liveVideo.srcObject = stream;
        await liveVideo.play().catch(() => {});
      }

      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      
      if (deviceSelect) {
        const currentSelected = deviceSelect.value;
        deviceSelect.innerHTML = '';
        videoDevices.forEach((d, idx) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || `Camera ${idx + 1}`;
          if (d.deviceId === currentSelected) opt.selected = true;
          deviceSelect.appendChild(opt);
        });
        if (videoDevices.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'Default Camera';
          deviceSelect.appendChild(opt);
        }
      }

      const track = stream.getVideoTracks()[0];
      if (track && infoBadge) {
        const settings = track.getSettings ? track.getSettings() : {};
        const w = settings.width || liveVideo.videoWidth || 1280;
        const h = settings.height || liveVideo.videoHeight || 720;
        const fps = settings.frameRate ? Math.round(settings.frameRate) : 30;
        infoBadge.textContent = `🟢 Ready: ${w}×${h} @ ${fps} FPS`;
      }
    } catch (err) {
      console.error('[CrickEye Webcam] Camera access error:', err);
      let msg = err.message || 'Permission denied';
      if (msg.includes('Timeout') || err.name === 'NotReadableError') {
        msg = 'Camera is in use by another app (Zoom, Teams, Camera app, or another browser tab) or took too long to respond.\n\nPlease close any app using your camera and click "Live Web Cam" again.';
      }
      if (infoBadge) infoBadge.textContent = 'Camera unavailable';
      alert(`Could not access camera:\n\n${msg}`);
    }
  }

  deviceSelect?.addEventListener('change', () => {
    initWebcam();
  });

  toggleGuideBtn?.addEventListener('click', () => {
    if (guideEl) {
      guideEl.style.display = guideEl.style.display === 'none' ? 'flex' : 'none';
    }
  });

  durationBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      durationBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedWebcamDuration = Number(btn.getAttribute('data-sec')) || 5;
    });
  });

  function recordWebcamStream(durationSec, onFinish) {
    if (!currentWebcamStream) {
      alert('Camera stream is not active.');
      return;
    }

    recordedWebcamChunks = [];
    const mimeType = getSupportedMimeType();
    const options = mimeType ? { mimeType } : {};

    try {
      currentMediaRecorder = new MediaRecorder(currentWebcamStream, options);
    } catch (e) {
      currentMediaRecorder = new MediaRecorder(currentWebcamStream);
    }

    currentMediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedWebcamChunks.push(e.data);
      }
    };

    currentMediaRecorder.onstop = () => {
      isWebcamRecording = false;
      const finalMime = currentMediaRecorder.mimeType || mimeType || 'video/webm';
      const isMp4 = finalMime.includes('mp4');
      const blob = new Blob(recordedWebcamChunks, { type: finalMime });
      if (!blob || blob.size === 0) {
        console.error('[CrickEye] Webcam recording produced an empty file (0 bytes).');
        alert('Recording failed — no video data was captured.\n\nPlease ensure camera permissions are granted and try again.');
        const autoBtn = document.getElementById('autoRecordBtn');
        const manBtn = document.getElementById('manualRecordBtn');
        if (autoBtn) { autoBtn.disabled = false; autoBtn.textContent = '⚡ RECORD DELIVERY (3s COUNTDOWN)'; }
        if (manBtn) { manBtn.disabled = false; manBtn.style.display = 'inline-flex'; }
        return;
      }
      const ext = isMp4 ? 'mp4' : 'webm';
      const file = new File([blob], `webcam_delivery_${Date.now()}.${ext}`, { type: finalMime });
      if (onFinish) onFinish(file, blob);
    };

    isWebcamRecording = true;
    currentMediaRecorder.start(100);
  }

  autoRecordBtn?.addEventListener('click', async () => {
    if (isWebcamRecording) return;

    if (!currentWebcamStream) {
      if (infoBadge) infoBadge.textContent = 'Requesting camera access…';
      autoRecordBtn.disabled = true;
      autoRecordBtn.textContent = '⏳ STARTING CAMERA…';
      await initWebcam();
      autoRecordBtn.disabled = false;
      autoRecordBtn.textContent = '⚡ RECORD DELIVERY (3s COUNTDOWN)';
    }

    if (!currentWebcamStream) {
      alert('Camera stream could not be started. Please check browser camera permissions.');
      return;
    }

    autoRecordBtn.disabled = true;
    if (manualRecordBtn) manualRecordBtn.disabled = true;

    let countdown = 3;
    if (countdownOverlay) {
      countdownOverlay.style.display = 'flex';
      countdownOverlay.style.zIndex = '99';
    }
    if (countdownNum) countdownNum.textContent = String(countdown);
    if (countdownSub) countdownSub.textContent = 'GET IN BATTING STANCE';
    playBeep(440, 0.12);

    if (webcamCountdownTimer) {
      clearInterval(webcamCountdownTimer);
      webcamCountdownTimer = null;
    }

    webcamCountdownTimer = setInterval(() => {
      countdown -= 1;
      if (countdown > 0) {
        if (countdownNum) countdownNum.textContent = String(countdown);
        playBeep(440, 0.12);
      } else if (countdown === 0) {
        clearInterval(webcamCountdownTimer);
        webcamCountdownTimer = null;
        if (countdownNum) countdownNum.textContent = 'GO!';
        if (countdownSub) countdownSub.textContent = 'BOWLING & EXECUTE SHOT';
        playBeep(880, 0.25);

        setTimeout(() => {
          if (countdownOverlay) countdownOverlay.style.display = 'none';
        }, 500);

        if (recBadge) recBadge.style.display = 'flex';
        let elapsed = 0;
        const durSec = selectedWebcamDuration;
        if (recTimer) recTimer.textContent = `REC 00:00 / 00:0${durSec}`;

        recordWebcamStream(durSec, (file) => {
          if (recBadge) recBadge.style.display = 'none';
          playBeep(660, 0.2);
          stopWebcamStream();
          startAnalysis(file);
        });

        if (webcamRecTimerInterval) clearInterval(webcamRecTimerInterval);
        webcamRecTimerInterval = setInterval(() => {
          elapsed += 1;
          const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
          const ss = String(elapsed % 60).padStart(2, '0');
          const durSS = String(durSec).padStart(2, '0');
          if (recTimer) recTimer.textContent = `REC ${mm}:${ss} / 00:${durSS}`;
          if (elapsed >= durSec) {
            clearInterval(webcamRecTimerInterval);
            webcamRecTimerInterval = null;
            if (currentMediaRecorder && currentMediaRecorder.state === 'recording') {
              currentMediaRecorder.stop();
            }
          }
        }, 1000);
      }
    }, 1000);
  });

  manualRecordBtn?.addEventListener('click', async () => {
    if (isWebcamRecording) return;

    if (!currentWebcamStream) {
      if (infoBadge) infoBadge.textContent = 'Requesting camera access…';
      await initWebcam();
    }

    if (!currentWebcamStream) {
      alert('Camera stream could not be started. Please check camera permissions.');
      return;
    }

    if (autoRecordBtn) autoRecordBtn.style.display = 'none';
    if (manualRecordBtn) manualRecordBtn.style.display = 'none';
    if (stopRecordBtn) stopRecordBtn.style.display = 'inline-flex';
    if (recBadge) recBadge.style.display = 'flex';
    playBeep(880, 0.2);

    let elapsed = 0;
    if (recTimer) recTimer.textContent = 'REC 00:00';

    recordWebcamStream(0, (file) => {
      if (recBadge) recBadge.style.display = 'none';
      stopWebcamStream();
      startAnalysis(file);
    });

    if (webcamRecTimerInterval) clearInterval(webcamRecTimerInterval);
    webcamRecTimerInterval = setInterval(() => {
      elapsed += 1;
      const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const ss = String(elapsed % 60).padStart(2, '0');
      if (recTimer) recTimer.textContent = `REC ${mm}:${ss}`;
    }, 1000);
  });

  stopRecordBtn?.addEventListener('click', () => {
    if (currentMediaRecorder && currentMediaRecorder.state === 'recording') {
      if (webcamRecTimerInterval) {
        clearInterval(webcamRecTimerInterval);
        webcamRecTimerInterval = null;
      }
      playBeep(660, 0.2);
      currentMediaRecorder.stop();
    }
  });

  if (defaultTab === 'webcam') {
    initWebcam();
  }
}

// ── Start Analysis (v6.5 — file upload or Live Webcam) ────────
async function startAnalysis(overrideFile = null) {
  if (!state.currentUser) {
    alert('Please login before uploading or recording a video.');
    return;
  }

  const fileInput = document.getElementById('videoFileInput');
  const file = overrideFile || fileInput?._selectedFile || fileInput?.files?.[0];

  if (!file) {
    alert('Please choose a video file or record a delivery first.');
    return;
  }

  if (file.size === 0) {
    alert('The selected video file is empty (0 bytes).\n\nIf using the webcam, please ensure the recording completes before submitting.');
    return;
  }

  stopWebcamStream();

  const startBtn = document.getElementById('startBtn');
  if (startBtn) { startBtn.disabled = true; startBtn.textContent = '⏳  Preparing…'; }

  const progressWrap  = document.getElementById('uploadProgressWrap');
  const progressFill  = document.getElementById('uploadProgressFill');
  const progressLabel = document.getElementById('uploadProgressLabel');
  if (progressWrap) progressWrap.style.display = 'block';
  if (progressFill) progressFill.style.width = '0%';

  if (progressLabel) progressLabel.textContent = 'Syncing with server…';
  await refreshAnalysisCacheVersion();

  let fileHash = null;
  try {
    if (progressLabel) progressLabel.textContent = 'Fingerprinting video…';
    fileHash = await sha256HexFromFile(file);
  } catch (e) {
    console.warn('[CrickEye] Could not fingerprint file; full pipeline will run:', e);
  }

  state.pendingAnalysisFileHash = fileHash;

  const forceFullAnalysis =
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('forceAnalysis') === '1';
  if (forceFullAnalysis) {
    console.info('[CrickEye] ?forceAnalysis=1 — skipping replay cache; full pipeline will run.');
  }

  if (fileHash && supabaseClient && !forceFullAnalysis) {
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
        updateStageText('Replay — same file: loading saved results (pipeline skipped).');
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
    try {
      if (supabaseClient && state.currentUser) {
        await createSupabaseSessionForLiveAnalysis(file, fileHash);
        await markSessionStatus('processing');
      }
    } catch (supaErr) {
      console.warn('[CrickEye] Supabase session tracking skipped or failed:', supaErr?.message || supaErr);
    }

    const formData = new FormData();
    formData.append('file', file);

    const uploadResult = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/upload');

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
          let errMsg = `Upload failed: HTTP ${xhr.status}`;
          try {
            const body = JSON.parse(xhr.responseText);
            if (body.error) errMsg = body.error;
          } catch {}
          reject(new Error(errMsg));
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
    updateStageText('Full analysis — Delivery is being processed by AI pipeline.');
    console.info(
      `[CrickEye] Full pipeline — analyse_session will run on ${uploadResult.video_path} (not Supabase replay).`
    );

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

/** Max shot # whose replay timestamp has been reached — drives progressive ball analytics (pitch / bars / table). */
function computeBallPlaybackShotCap(t) {
  if (!video || !video.duration || !state.pendingSpokes.length) return 0;
  const origDur = state.originalVideoDuration || video.duration;
  const scale = video.duration / origDur;
  const AHEAD = 0.4;
  let maxN = 0;
  state.pendingSpokes.forEach((spoke) => {
    if (t >= spoke.timestamp_sec * scale - AHEAD) {
      maxN = Math.max(maxN, spoke.shot_num);
    }
  });
  return maxN;
}

function onVideoTimeUpdate() {
  if (!video.duration) return;
  const t = video.currentTime;
  const vfps = Number(state.videoFps) || Number(state.completePayload?.fps) || 30;
  hudTime.textContent  = formatTime(t);
  hudFrame.textContent = 'FRAME ' + Math.floor(t * vfps);
  if (typeof BallAnalytics !== 'undefined') BallAnalytics.drawOverlayAtTime(t);
  const cap = computeBallPlaybackShotCap(t);
  if (cap !== state.ballPlaybackCap) {
    state.ballPlaybackCap = cap;
    if (typeof BallAnalytics !== 'undefined') BallAnalytics.setPlaybackVisibility(cap);
  }
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
    Number(spoke.msg?.head_quality_score || 0),
    Number(spoke.msg?.swing_intensity || 0),
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
    if (i >= spokes.length) {
      state.ballPlaybackCap = -1;
      if (typeof BallAnalytics !== 'undefined') BallAnalytics.setPlaybackVisibility(null);
      return;
    }
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
  coachDashboard?.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.id === 'coachShowHiddenCheckbox') {
      state.showHiddenCoachPlayers = Boolean(t.checked);
      renderCoachDashboard(state.coachPlayersRaw, state.coachSessionsRaw);
    }
  });
  coachDashboard?.addEventListener('click', (e) => {
    if (!isCoachRole()) return;
    const navBtn = e.target.closest('[data-coach-nav-view]');
    if (navBtn) {
      const next = navBtn.getAttribute('data-coach-nav-view');
      if (next === 'players' || next === 'compare') {
        state.coachDashboardView = next;
        renderCoachDashboard(state.coachPlayersRaw, state.coachSessionsRaw);
      }
      return;
    }
    const cmpBtn = e.target.closest('[data-coach-open-compare]');
    if (cmpBtn && !cmpBtn.disabled) {
      e.preventDefault();
      const pid = cmpBtn.getAttribute('data-coach-open-compare');
      if (pid) openCoachSessionCompareForPlayer(pid);
      return;
    }
    const repBtn = e.target.closest('[data-coach-session-report]');
    if (repBtn && !repBtn.disabled) {
      e.preventDefault();
      const sid = repBtn.getAttribute('data-coach-session-report');
      if (sid) openCoachSessionNetReport(sid);
      return;
    }
    const repHint = e.target.closest('.coach-session-card-hint');
    if (repHint) {
      e.preventDefault();
      const host = repHint.closest('[data-coach-session-report]');
      const sid = host?.getAttribute('data-coach-session-report');
      if (sid && !(host && host.disabled)) openCoachSessionNetReport(sid);
      return;
    }
    const btn = e.target.closest('[data-coach-player-hidden-toggle]');
    if (!btn) return;
    const id = btn.getAttribute('data-coach-player-hidden-toggle');
    const nextHidden = btn.getAttribute('data-next-hidden') === '1';
    if (!id) return;
    const ok = window.confirm(
      nextHidden
        ? 'Hide this player from your dashboard? Their account and sessions stay in the database (good for old demos).'
        : 'Show this player on the dashboard again?'
    );
    if (!ok) return;
    setPlayerHiddenFromCoachDashboard(id, nextHidden);
    return;
  });
  coachDashboard?.addEventListener('click', (e) => {
    if (!isCoachRole()) return;
    const xcmp = e.target.closest('[data-coach-cross-compare]');
    if (!xcmp) return;
    const aSel = document.getElementById('coachCrossPlayerA');
    const bSel = document.getElementById('coachCrossPlayerB');
    if (!aSel || !bSel) return;
    openCoachCrossPlayerCompare(aSel.value, bSel.value);
  });
  wireModalDismissals();
  headerProfileBtn?.addEventListener('click', () => {
    fillProfileModal();
    openModal(profileModal);
  });
  profileLogoutBtn?.addEventListener('click', () => { logout(); });
  openSessionCompareBtn?.addEventListener('click', openSessionCompareModal);
  compareSessionA?.addEventListener('change', () => {
    const a = findSessionInCompareSource(compareSessionA.value);
    const b = findSessionInCompareSource(compareSessionB?.value);
    if (a && b) renderSessionComparison(a, b);
  });
  compareSessionB?.addEventListener('change', () => {
    const a = findSessionInCompareSource(compareSessionA?.value);
    const b = findSessionInCompareSource(compareSessionB.value);
    if (a && b) renderSessionComparison(a, b);
  });
  compareThisMonthBtn?.addEventListener('click', renderMonthSessionsComparison);
  sessionCompareBody?.addEventListener('click', (e) => {
    const back = e.target.closest('[data-compare-back]');
    if (!back) return;
    const a = findSessionInCompareSource(compareSessionA?.value);
    const b = findSessionInCompareSource(compareSessionB?.value);
    if (a && b) renderSessionComparison(a, b);
  });
  sessionsList?.addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-session-delete]');
    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = delBtn.getAttribute('data-session-delete');
      if (
        id &&
        window.confirm(
          'Remove this session from your list? You can upload the same video again to run a fresh analysis with the latest metrics.'
        )
      ) {
        deleteSessionById(id);
      }
      return;
    }
    const card = e.target.closest('.session-card');
    if (card) {
      const id = card.getAttribute('data-session-id');
      if (id) openSessionDetailModal(id);
      return;
    }
    const hint = e.target.closest('.session-card-hint');
    if (!hint) return;
    const host = hint.closest('.session-card');
    const sid = host?.getAttribute('data-session-id');
    if (sid) openSessionDetailModal(sid);
  });
  clearAllSessionsBtn?.addEventListener('click', () => deleteAllSessionsForCurrentUser());
  resetEverythingBtn?.addEventListener('click', () => resetEverythingForCurrentUser());
  resetEverythingLogoutBtn?.addEventListener('click', async () => {
    closeModal(resetEverythingModal);
    await logout();
  });
  WagonWheel.init(wagonCanvas);
  if (typeof BallAnalytics !== 'undefined') {
    BallAnalytics.init(
      document.getElementById('pitchMapCanvas'),
      video,
      document.getElementById('ballOverlayCanvas'),
    );
  }
  window.addEventListener('resize', () => {
    if (typeof BallAnalytics !== 'undefined') BallAnalytics.resizeOverlay();
  });
  injectBiomechStyles();
  buildStartPanel();
  injectOverlayStyles();
  video.addEventListener('timeupdate', onVideoTimeUpdate);
  video.addEventListener('click', ()=>{ if(video.paused) video.play(); else video.pause(); });
  // Reveal session results after a short compile delay when the analysed video finishes.
  video.addEventListener('ended', () => {
    if (typeof PlayCard !== 'undefined' && PlayCard.revealAfterDelay) {
      PlayCard.revealAfterDelay(state);
    }
  });
  btnClearWheel?.addEventListener('click', clearWheelAndReset);
  btnNewCapture?.addEventListener('click', () => {
    if (!state.currentUser) {
      alert('Please log in first.');
      return;
    }
    if (video) video.pause();
    buildStartPanel({ defaultTab: 'webcam' });
  });
  btnSpeed?.addEventListener('click', cycleSpeed);
  btnLoop?.addEventListener('click', toggleLoop);
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