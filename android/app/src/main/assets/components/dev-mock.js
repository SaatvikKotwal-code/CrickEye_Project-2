/* ─────────────────────────────────────────────────────────────
   DEV ONLY — dashboard mock data.

   Loads only when the URL carries ?mock=1. Replays a real session
   report (data/session_report.json) through the app's own message
   handler, so every panel fills via the normal code path instead of
   having values poked into the DOM.

   Nothing is persisted: onComplete runs with skipPersist so no mock
   session is written to Supabase.

   To remove: delete this file and the guarded <script> tag in index.html.
   ───────────────────────────────────────────────────────────── */
(function () {
  if (!/[?&]mock=1\b/.test(window.location.search)) return;

  const SHOT_LABELS_ORDER = ['cover', 'straight', 'pull', 'flick', 'sweep'];
  const LENGTH_ZONES = ['yorker', 'full', 'good', 'short'];
  const QUALITY = (score) =>
    score >= 7.5 ? 'Top class' : score >= 6.5 ? 'Good' : score >= 5.5 ? 'Average' : 'Needs work';

  const stamp = (sec) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = (sec % 60).toFixed(2).padStart(5, '0');
    return `${m}:${s}`;
  };

  /* Clone the real shots into a fuller session so list, table, wheel and
     feed layouts are actually exercised — the real report only has two. */
  function expandShots(template, fps, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const shot = JSON.parse(JSON.stringify(template[i % template.length]));
      const t = 0.8 + i * 2.4;
      const score = +(5.1 + ((i * 7) % 10) * 0.42).toFixed(1);
      Object.assign(shot, {
        shot_num: i + 1,
        display_num: i + 1,
        label: SHOT_LABELS_ORDER[i % SHOT_LABELS_ORDER.length],
        confirmed: true,
        confidence: +(0.44 + ((i * 3) % 5) * 0.1).toFixed(3),
        timestamp: stamp(t),
        peak_frame: Math.round(t * fps),
        shot_score: score,
        shot_quality: QUALITY(score),
        shot_quality_label: QUALITY(score),
        peak_swing_speed: +(13 + ((i * 5) % 12)).toFixed(1),
        head_quality_score: 58 + ((i * 13) % 40),
        footwork_score: 38 + ((i * 17) % 56),
        swing_intensity: 54 + ((i * 11) % 43),
        swing_path_score: 60 + ((i * 9) % 38),
        symmetry_score: 22 + ((i * 19) % 68),
        execution_score: 44 + ((i * 23) % 51),
        length_zone: LENGTH_ZONES[i % LENGTH_ZONES.length],
      });
      out.push(shot);
    }
    return out;
  }

  async function run(count) {
    const report = await (await fetch('data/session_report.json')).json();
    const fps = report.fps || 30;
    const shots = expandShots(report.shots, fps, count || 14);

    const shot_counts = {};
    shots.forEach((s) => { shot_counts[s.label] = (shot_counts[s.label] || 0) + 1; });

    handleMessage({ type: 'stage', stage: 'analysing', message: 'Mock session' });
    handleMessage({ type: 'onsets_found', count: shots.length });
    shots.forEach((s) => handleMessage(Object.assign({ type: 'shot' }, s)));
    handleMessage({ type: 'analysis', analysis: report.analysis });

    const complete = {
      type: 'complete',
      shot_counts,
      confirmed: shots.length,
      total_frames: Math.round((shots[shots.length - 1].peak_frame || 0) + fps * 2),
      fps,
      handedness: report.session_handedness || 'RHB',
      stance_conf: report.stance_conf != null ? report.stance_conf : 1,
      analysis: report.analysis,
      ball_analytics: report.ball_analytics || null,
      speed_unit: report.speed_unit || 'km/h',
    };

    // Direct call, not handleMessage: skipPersist keeps mock data out of Supabase.
    onComplete(complete, { skipPersist: true, videoDelayMs: 0 });

    /* The live app defers these to <video> events, so with no video only
       shot 1 ever renders. Drive them directly for the mock. */
    setTimeout(() => {
      if (typeof drawAllSpokesWithoutPlayback === 'function') drawAllSpokesWithoutPlayback();
      const settle = shots.length * 90 + 400;
      setTimeout(() => {
        if (typeof PlayCard !== 'undefined' && PlayCard.revealAfterDelay) {
          PlayCard.revealAfterDelay(state);
        }
      }, settle);
    }, 300);

    console.log(`[mock] ${shots.length} shots replayed — handedness ${complete.handedness}`);
    return complete;
  }

  window.ceMock = run;

  // Auto-run once the app has booted.
  window.addEventListener('load', () => {
    setTimeout(() => {
      run().catch((e) => console.error('[mock] failed:', e));
    }, 600);
  });
})();
