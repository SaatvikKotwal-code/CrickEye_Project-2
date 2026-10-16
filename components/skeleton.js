/* ─────────────────────────────────────────────────────────────
   Section state machine: loading (skeleton) / ready / empty.

   Each section in index.html carries data-section="<name>" and holds
   up to three children marked data-skeleton / data-content / data-empty.
   Skeleton markup is generated here from a shape name so the HTML stays
   readable.

   States are switched with the `hidden` attribute, not a class: the
   bridge layer's [hidden]{display:none!important} outranks any Tailwind
   display utility sitting on the same element.
   ───────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const line = (w) => `<div class="sk-line"${w ? ` style="width:${w}"` : ''}></div>`;
  const block = (h) => `<div class="sk-block" style="height:${h}"></div>`;

  const SHAPES = {
    video: () => `
      <div class="flex flex-col gap-3 p-4">
        ${block('clamp(180px, 34vh, 340px)')}
        <div class="flex gap-2">${[70, 52, 60, 46, 64].map((w) => `<div class="sk-chip" style="width:${w}px"></div>`).join('')}</div>
        ${block('44px')}
      </div>`,

    /* The Session Score card's own markup and classes with placeholder
       text made transparent (.sk-text). Fonts, line-heights, padding and
       the container-query breakpoint all come from the real card, so the
       skeleton has its exact geometry and nothing shifts on reveal. */
    score: () => {
      const t = (cls, text) => `<span class="${cls} sk-text">${text}</span>`;
      const metric = (name) => `
        <li class="pc-metric">
          <div class="pc-metric-top">
            <span class="pc-metric-label">
              ${t('material-symbols-outlined pc-metric-ico sk-round', 'circle')}
              ${t('pc-metric-name', name)}
            </span>
            ${t('pc-metric-val', '0.0')}
          </div>
          <div class="pc-metric-track sk-text"></div>
        </li>`;
      const card = (tag, title) => `
        <div class="pc-hl-card">
          <div class="pc-hl-tag"><span class="sk-text">${tag}</span></div>
          <div class="pc-hl-title"><span class="sk-text">${title}</span></div>
          <div class="pc-hl-sub">
            ${t('pc-hl-score', '0.0<span class="pc-hl-denom">/10</span>')}
            ${t('pc-hl-time', '00:00.00')}
          </div>
        </div>`;
      const link = (label) => `
        <div class="pc-acc-btn">
          ${t('material-symbols-outlined pc-acc-ico sk-round', 'circle')}
          <span class="pc-acc-label"><span class="sk-text">${label}</span></span>
        </div>`;
      return `
      <div class="pc-inner" style="pointer-events:none">
        <div class="pc-summary">
          <div class="pc-summary-score">${t('pc-summary-val', '0.0')}${t('pc-summary-denom', '/10')}</div>
          <div class="pc-summary-meta">
            ${t('pc-summary-label', 'Avg shot score')}
            <span class="pc-summary-sub">${t('', '00 shots')}${t('pc-badge', 'RHB')}</span>
          </div>
        </div>
        <ul class="pc-metrics">${['Head position', 'Batting stance', 'Foot movement', 'Swing arc', 'Shot execution'].map(metric).join('')}</ul>
        <div class="pc-hl-section">
          <div class="pc-hl-section-title"><span class="sk-text">Shot highlights</span></div>
          <div class="pc-highlights-grid">${card('Signature shot', '#0 SWEEP')}${card('Work-on shot', '#0 STRAIGHT DRIVE')}</div>
        </div>
        <div class="pc-links">${['AI insights', 'Ball length analysis', 'Deliveries', 'Scoring zones'].map(link).join('')}</div>
      </div>`;
    },

    pitch: () => `<div class="p-4">${block('clamp(260px, 42vh, 420px)')}</div>`,

    wagon: () => `
      <div class="flex flex-col items-center gap-4 p-4">
        <div class="sk-circle" style="width:min(300px,80%);aspect-ratio:1/1"></div>
        <div class="flex flex-wrap justify-center gap-2">${[84, 96, 72, 56, 64].map((w) => `<div class="sk-chip" style="width:${w}px"></div>`).join('')}</div>
        <div class="grid w-full gap-4 sm:grid-cols-2">${block('130px')}${block('130px')}</div>
      </div>`,

    cards: (n = 4) => `
      <div class="grid gap-4 p-4 @2xl:grid-cols-2">${Array.from({ length: n }, () => block('104px')).join('')}</div>`,

    feed: (n = 5) => `
      <div class="sk-group p-4">${Array.from({ length: n }, () => block('52px')).join('')}</div>`,

    rows: (n = 4) => `
      <div class="sk-group p-4">${Array.from({ length: n }, () => block('58px')).join('')}</div>`,
  };

  const parts = (root) => ({
    skeleton: root.querySelector('[data-skeleton]'),
    content: root.querySelector('[data-content]'),
    empty: root.querySelector('[data-empty]'),
  });

  const Skeleton = {
    /** Fill every [data-skeleton] placeholder with its generated markup. */
    mount() {
      document.querySelectorAll('[data-skeleton]').forEach((el) => {
        if (el.dataset.mounted) return;
        const [name, arg] = (el.dataset.skeleton || '').split(':');
        const shape = SHAPES[name];
        if (!shape) return;
        el.innerHTML = shape(arg ? Number(arg) : undefined);
        el.dataset.mounted = '1';
      });
    },

    /**
     * @param {string} section  value of data-section
     * @param {'loading'|'ready'|'empty'} state
     */
    set(section, state) {
      const root = document.querySelector(`[data-section="${section}"]`);
      if (!root) return;
      const p = parts(root);
      /* Some sections (score, biomech, sessions) already render their own
         empty message inside the content block, so they declare no
         [data-empty]. For those, "empty" simply means "show content". */
      const effective = state === 'empty' && !p.empty ? 'ready' : state;
      if (p.skeleton) p.skeleton.hidden = effective !== 'loading';
      if (p.content) p.content.hidden = effective !== 'ready';
      if (p.empty) p.empty.hidden = effective !== 'empty';
      root.dataset.state = state;
    },

    /** Convenience: same state for several sections. */
    setAll(sections, state) {
      sections.forEach((s) => Skeleton.set(s, state));
    },

    /** Sections that represent a single analysis run. */
    ANALYSIS: ['score', 'pitch', 'wagon', 'ball', 'biomech'],
  };

  global.Skeleton = Skeleton;
  document.addEventListener('DOMContentLoaded', () => Skeleton.mount());
})(window);
