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
const authEmail        = document.getElementById('authEmail');
const authPassword     = document.getElementById('authPassword');
const signupBtn        = document.getElementById('signupBtn');
const loginBtn         = document.getElementById('loginBtn');
const logoutBtn        = document.getElementById('logoutBtn');
const authUserLabel    = document.getElementById('authUserLabel');
const sessionsList     = document.getElementById('sessionsList');
const authGate         = document.getElementById('authGate');
const gateEmail        = document.getElementById('gateEmail');
const gatePassword     = document.getElementById('gatePassword');
const gateSignupBtn    = document.getElementById('gateSignupBtn');
const gateLoginBtn     = document.getElementById('gateLoginBtn');
const gateMessage      = document.getElementById('gateMessage');

// ── Supabase (frontend auth + storage + db) ────────────────
const SUPABASE_URL = window.SUPABASE_URL || localStorage.getItem('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || localStorage.getItem('SUPABASE_ANON_KEY') || '';
const supabase = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

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
  if (!authUserLabel || !loginBtn || !signupBtn || !logoutBtn) return;
  const loggedIn = !!state.currentUser;
  authUserLabel.textContent = loggedIn ? state.currentUser.email : 'Not logged in';
  loginBtn.style.display = loggedIn ? 'none' : 'inline-block';
  signupBtn.style.display = loggedIn ? 'none' : 'inline-block';
  logoutBtn.style.display = loggedIn ? 'inline-block' : 'none';
  if (authGate) authGate.classList.toggle('hidden', loggedIn);
}

function renderSessions(items) {
  if (!sessionsList) return;
  if (!items || !items.length) {
    sessionsList.innerHTML = '<div class="session-item-empty">No sessions yet.</div>';
    return;
  }

  sessionsList.innerHTML = items.map((s) => {
    const created = new Date(s.created_at).toLocaleString();
    const shortResult = s.results ? JSON.stringify(s.results).slice(0, 260) + '…' : '';
    return `
      <div class="session-item">
        <div class="session-item-top">
          <span>${created}</span>
          <span class="session-status">${s.status}</span>
        </div>
        <div class="session-result">${s.video_url || ''}</div>
        ${shortResult ? `<div class="session-result">${shortResult}</div>` : ''}
      </div>
    `;
  }).join('');
}

async function fetchUserSessions() {
  if (!supabase || !state.currentUser) {
    renderSessions([]);
    return;
  }
  const { data, error } = await supabase
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
  if (!supabase) return alert('Supabase is not configured in frontend.');
  const email = (gateEmail?.value || authEmail?.value || '').trim();
  const password = (gatePassword?.value || authPassword?.value || '').trim();
  if (!email || !password) return alert('Enter email and password.');
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    if (gateMessage) gateMessage.textContent = error.message;
    return alert(error.message);
  }
  if (gateMessage) gateMessage.textContent = 'Signup successful. Please login.';
  alert('Signup successful. Please login.');
}

async function login() {
  if (!supabase) return alert('Supabase is not configured in frontend.');
  const email = (gateEmail?.value || authEmail?.value || '').trim();
  const password = (gatePassword?.value || authPassword?.value || '').trim();
  if (!email || !password) return alert('Enter email and password.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (gateMessage) gateMessage.textContent = error.message;
    return alert(error.message);
  }
  const { data } = await supabase.auth.getUser();
  state.currentUser = data?.user || null;
  if (gateMessage) gateMessage.textContent = '';
  updateAuthUi();
  await fetchUserSessions();
}

async function logout() {
  if (!supabase) return;
  await supabase.auth.signOut();
  state.currentUser = null;
  updateAuthUi();
  renderSessions([]);
  if (gateMessage) gateMessage.textContent = 'Logged out.';
}

async function initAuth() {
  if (!supabase) {
    if (authUserLabel) authUserLabel.textContent = 'Set SUPABASE_URL / SUPABASE_ANON_KEY';
    return;
  }
  const { data } = await supabase.auth.getUser();
  state.currentUser = data?.user || null;
  updateAuthUi();
  if (state.currentUser) await fetchUserSessions();
}

async function createSupabaseSessionForLiveAnalysis(file) {
  if (!supabase) throw new Error('Supabase is not configured in frontend.');
  if (!state.currentUser) throw new Error('Please login first.');

  const filePath = `${state.currentUser.id}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('videos')
    .upload(filePath, file, { upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicData } = supabase.storage
    .from('videos')
    .getPublicUrl(filePath);
  const videoUrl = publicData?.publicUrl;
  if (!videoUrl) throw new Error('Could not get public URL.');

  const { data: inserted, error: insertError } = await supabase
    .from('sessions')
    .insert({
      user_id: state.currentUser.id,
      video_url: videoUrl,
      status: 'uploaded',
    })
    .select('id')
    .single();
  if (insertError) throw new Error(insertError.message);
  state.activeSessionId = inserted.id;
  await fetchUserSessions();
}

async function markSessionStatus(status) {
  if (!supabase || !state.activeSessionId || !state.currentUser) return;
  const { error } = await supabase
    .from('sessions')
    .update({ status })
    .eq('id', state.activeSessionId)
    .eq('user_id', state.currentUser.id);
  if (error) {
    console.error('[CrickEye] session status update error:', error.message);
  }
}

async function saveLiveAnalysisResult(msg) {
  if (!supabase || !state.activeSessionId || !state.currentUser) return;
  const payload = state.sessionAnalysis || msg.analysis || msg || null;
  const { error } = await supabase
    .from('sessions')
    .update({
      status: 'completed',
      results: payload,
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

function onComplete(msg) {
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

  if (!video || !msg.output_video) return;
  video.pause();
  while (video.firstChild) video.removeChild(video.firstChild);

  setTimeout(() => {
    const url = msg.output_video + '?t=' + Date.now();
    video.src = url; video.preload='auto'; video.muted=true; video.load();

    video.addEventListener('play', function onFirstPlay() {
      video.removeEventListener('play', onFirstPlay);
      flushDashboard();
    });

    const tryPlay = () => video.play().catch(() => console.warn('[CrickEye] Autoplay blocked.'));
    video.addEventListener('loadeddata', tryPlay, {once:true});
    setTimeout(tryPlay, 3000);
  }, 1500);
  document.getElementById('btnReport')?.removeAttribute('disabled');
  saveLiveAnalysisResult(msg);
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

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert('WebSocket not connected.\n\nRun: uvicorn backend.main:app --port 8000');
    return;
  }

  const fileInput = document.getElementById('videoFileInput');
  const file = fileInput?._selectedFile || fileInput?.files?.[0];

  if (!file) {
    alert('Please choose a video file first.');
    return;
  }

  const startBtn = document.getElementById('startBtn');
  if (startBtn) { startBtn.disabled = true; startBtn.textContent = '⏳  UPLOADING…'; }

  const progressWrap  = document.getElementById('uploadProgressWrap');
  const progressFill  = document.getElementById('uploadProgressFill');
  const progressLabel = document.getElementById('uploadProgressLabel');
  if (progressWrap) progressWrap.style.display = 'block';

  try {
    // Save owner + video in Supabase first, but keep the existing local WS flow.
    await createSupabaseSessionForLiveAnalysis(file);
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
    if (uploadResult.demo_key) wsMsg.demo_key = uploadResult.demo_key;

    ws.send(JSON.stringify(wsMsg));
    console.log(`[CrickEye] Pipeline started — demo=${!!uploadResult.demo_key}  path=${uploadResult.video_path}`);

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

function drawSpokeNow(spoke) {
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
  WagonWheel.drawSpoke(spoke.label, () => { shotCount.textContent=WagonWheel.getSpokeCount(); });
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
  WagonWheel.init(wagonCanvas);
  injectBiomechStyles();
  buildStartPanel();
  injectOverlayStyles();
  signupBtn?.addEventListener('click', signup);
  loginBtn?.addEventListener('click', login);
  logoutBtn?.addEventListener('click', logout);
  gateSignupBtn?.addEventListener('click', signup);
  gateLoginBtn?.addEventListener('click', login);
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
document.addEventListener('DOMContentLoaded', init);