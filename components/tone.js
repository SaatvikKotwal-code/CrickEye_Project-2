/* ─────────────────────────────────────────────────────────────
   Shared range scale.

   One three-band scale (plus a neutral for "no reading") used by every
   metric in the UI, so a number means the same thing wherever it shows.
   Card chrome stays uniform — colour encodes range, never category.

   These are CSS variables, not hex, so a theme switch re-colours every
   already-rendered value without re-running the render. Call sites that
   need a translucent fill use color-mix() rather than an alpha suffix.

   Loaded before every other component script: ReportModal builds its
   colour tables at load time, so this must already exist.
   ───────────────────────────────────────────────────────────── */
const TONE = {
  strong:   'var(--tone-strong)',
  moderate: 'var(--tone-moderate)',
  weak:     'var(--tone-weak)',
  neutral:  'var(--tone-neutral)',
};

function toneFor(value, strongAt, moderateAt) {
  const v = Number(value);
  if (value == null || Number.isNaN(v)) return TONE.neutral;
  if (v >= strongAt) return TONE.strong;
  if (v >= moderateAt) return TONE.moderate;
  return TONE.weak;
}

/** 0–100 metrics (head position, footwork, symmetry, swing path). */
const metricColor = (v) => toneFor(v, 70, 45);

/** 0–10 scores. Same proportions as metricColor (70% / 45%) so a value
 *  colours the same whether it is shown out of 10 or out of 100. */
const scoreColor = (v) => toneFor(v, 7, 4.5);
