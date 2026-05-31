/**
 * Live dashboard PlayCard — session summary beside the video.
 * Auto-reveals when the analysed video finishes (after a short compile delay).
 * Section buttons open detail in a ce-modal (AI / length / deliveries / zones).
 */
const PlayCard = (() => {
  const COMPILE_DELAY_MS = 2500;

  let active = false;
  let cachedReportData = null;
  let compileTimer = null;
  let pendingState = null;

  function mountEl() {
    return document.getElementById('playCardMount');
  }

  function innerEl() {
    return document.getElementById('playCardInner');
  }

  function placeholderEl() {
    return document.getElementById('playCardPlaceholder');
  }

  function compileBarEl() {
    return document.getElementById('playCardCompileBar');
  }

  function compileBarFillEl() {
    return document.getElementById('playCardCompileBarFill');
  }

  function cancelCompileTimer() {
    if (compileTimer != null) {
      clearTimeout(compileTimer);
      compileTimer = null;
    }
  }

  function animatePiesIn(container) {
    if (!container) return;
    container.querySelectorAll('.rp-pie-arc:not(.pc-metric-detail-arc)').forEach((arc) => {
      const target = parseFloat(arc.getAttribute('data-offset'));
      if (Number.isFinite(target)) requestAnimationFrame(() => { arc.style.strokeDashoffset = target; });
    });
  }

  function openPlayCardDetailModal(title, html) {
    const modal = document.getElementById('playCardDetailModal');
    const titleEl = document.getElementById('playCardDetailTitle');
    const body = document.getElementById('playCardDetailBody');
    if (titleEl) titleEl.textContent = title || 'Details';
    if (body) body.innerHTML = html || '';
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('ce-modal-open');
    setTimeout(() => animatePiesIn(body), 100);
  }

  function runRevealAnimation(inner) {
    if (!inner) return;
    inner.classList.remove('playcard-reveal');
    void inner.offsetWidth;
    requestAnimationFrame(() => {
      inner.classList.add('playcard-reveal');
    });
  }

  function showCompileBar(durationMs) {
    const bar = compileBarEl();
    const fill = compileBarFillEl();
    if (bar) {
      bar.removeAttribute('hidden');
      bar.setAttribute('aria-hidden', 'false');
    }
    if (fill) {
      fill.style.transition = 'none';
      fill.style.width = '0%';
      requestAnimationFrame(() => {
        fill.style.transition = `width ${durationMs}ms linear`;
        fill.style.width = '100%';
      });
    }
  }

  function hideCompileBar() {
    const bar = compileBarEl();
    const fill = compileBarFillEl();
    if (bar) {
      bar.setAttribute('hidden', '');
      bar.setAttribute('aria-hidden', 'true');
    }
    if (fill) {
      fill.style.transition = 'none';
      fill.style.width = '0%';
    }
  }

  function mountContent(state, opts = {}) {
    if (typeof ReportModal === 'undefined') {
      console.warn('[PlayCard] ReportModal not loaded');
      return false;
    }
    if (!state.sessionAnalysis) {
      return false;
    }

    ReportModal.ensureStyles();

    const shell = mountEl();
    const inner = innerEl();
    const ph = placeholderEl();
    if (!shell || !inner) return false;

    const base = ReportModal.prepareReportData(state, state.sessionAnalysis);
    const zoneCounts = state.displayedZoneCounts || { offside: 0, straight: 0, legside: 0 };
    const data = { ...base, zoneCounts };
    cachedReportData = data;

    inner.innerHTML = ReportModal.buildLivePlayCardHtml(data);
    inner.removeAttribute('hidden');
    if (ph) ph.setAttribute('hidden', '');

    shell.classList.remove('playcard--inactive');
    shell.classList.add('playcard--active');

    if (opts.pending) {
      inner.classList.add('playcard-inner--pending');
      shell.classList.add('playcard--compiling');
    } else {
      inner.classList.remove('playcard-inner--pending');
      shell.classList.remove('playcard--compiling');
    }

    ReportModal.bindPlayCardInteractions(inner, () => cachedReportData, openPlayCardDetailModal);
    active = true;
    return true;
  }

  function finishPendingReveal() {
    const shell = mountEl();
    const inner = innerEl();
    hideCompileBar();
    if (inner) inner.classList.remove('playcard-inner--pending');
    if (shell) shell.classList.remove('playcard--compiling');
    if (inner) runRevealAnimation(inner);
    setTimeout(() => animatePiesIn(inner), 120);
  }

  function activate(state, opts = {}) {
    if (!state.sessionAnalysis) return false;

    const wasActive = active;
    cancelCompileTimer();
    hideCompileBar();

    if (!mountContent(state, { pending: false })) return false;

    pendingState = null;
    if (!wasActive || opts.reveal) {
      runRevealAnimation(innerEl());
    }
    setTimeout(() => animatePiesIn(innerEl()), 120);
    return true;
  }

  function revealAfterDelay(state, opts = {}) {
    const inner = innerEl();
    if (active && inner && !inner.classList.contains('playcard-inner--pending')) {
      return activate(state, { reveal: false });
    }
    if (!state.sessionAnalysis) return false;

    cancelCompileTimer();
    pendingState = state;
    const delayMs = opts.delayMs ?? COMPILE_DELAY_MS;

    if (!mountContent(state, { pending: true })) return false;

    showCompileBar(delayMs);

    compileTimer = setTimeout(() => {
      compileTimer = null;
      const s = pendingState;
      pendingState = null;
      if (s && s !== state && s.sessionAnalysis) mountContent(s, { pending: true });
      finishPendingReveal();
    }, delayMs);

    return true;
  }

  function refresh(state) {
    if (compileTimer != null) {
      pendingState = state;
      mountContent(state, { pending: true });
      return true;
    }
    if (!active) return revealAfterDelay(state);
    return activate(state, { reveal: false });
  }

  function isActive() {
    return active;
  }

  function isCompiling() {
    return compileTimer != null;
  }

  return { activate, revealAfterDelay, refresh, isActive, isCompiling };
})();
