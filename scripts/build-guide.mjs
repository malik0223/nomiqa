/**
 * يبني دليل الاستخدام المصوّر.
 *
 *   node scripts/build-guide.mjs
 *
 * المدخلات: docs/guide/content.mjs (النصّ)، docs/guide/shots-web/ (اللقطات)،
 * docs/guide/assets/fonts.css (الخطوط مضمَّنة base64).
 *
 * المخرجات: docs/guide/index.html صفحة واحدة مكتفية بذاتها — لا طلب
 * شبكة واحد بعد فتحها. هذا شرط لا رفاهية: الدليل يُنشر كصفحة تحت
 * سياسة أمان تمنع أي مورد خارجي، ويُفتح أيضاً من قرص محلي.
 * وdocs/guide/README.md نسخة نصية داخل المستودع.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { meta, parts } from '../docs/guide/content.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUIDE = path.join(ROOT, 'docs', 'guide');

const fonts = readFileSync(path.join(GUIDE, 'assets', 'fonts.css'), 'utf8');

function shotDataUri(file) {
  const source = path.join(GUIDE, 'shots-web', `${file}.jpeg`);
  if (!existsSync(source)) {
    console.warn('لقطة مفقودة:', file);
    return null;
  }
  return `data:image/jpeg;base64,${readFileSync(source).toString('base64')}`;
}

const escapeAttr = (value) => value.replace(/"/g, '&quot;');

/* ------------------------------------------------------------
   الترقيم: رقم الفصل عبر الدليل كله لا داخل جزئه.
   القارئ يقول «الفصل ١٢» لا «الفصل الثالث من الجزء الرابع».
   ------------------------------------------------------------ */
let counter = 0;
const numbered = parts.map((part) => ({
  ...part,
  chapters: part.chapters.map((chapter) => ({ ...chapter, number: ++counter })),
}));

const total = counter;

const toneLabel = { info: 'ملاحظة', warn: 'انتبه', good: 'يفيدك' };

function renderChapter(chapter) {
  const steps = chapter.steps?.length
    ? `<ol class="steps">${chapter.steps.map((step) => `<li>${step}</li>`).join('')}</ol>`
    : '';

  const notes = (chapter.notes ?? [])
    .map(
      (note) =>
        `<aside class="note note--${note.tone}"><span class="note__label">${toneLabel[note.tone] ?? 'ملاحظة'}</span><p>${note.body}</p></aside>`,
    )
    .join('');

  const shots = (chapter.shots ?? [])
    .map((shot) => {
      const uri = shotDataUri(shot.file);
      if (!uri) return '';
      return `<figure class="shot">
            <div class="shot__frame"><img src="${uri}" alt="${escapeAttr(shot.caption)}" loading="lazy" decoding="async" /></div>
            <figcaption>${shot.caption}</figcaption>
          </figure>`;
    })
    .join('');

  return `<article class="chapter" id="${chapter.id}">
        <header class="chapter__head">
          <span class="chapter__num">${chapter.number}</span>
          <h3>${chapter.title}</h3>
        </header>
        <p class="chapter__purpose">${chapter.purpose}</p>
        ${steps}
        ${notes}
        ${shots}
      </article>`;
}

const body = numbered
  .map(
    (part, index) => `<section class="part" id="part-${part.key}">
      <header class="part__head">
        <p class="part__eyebrow">الجزء ${index + 1}</p>
        <h2>${part.title}</h2>
        <p class="part__lede">${part.lede}</p>
      </header>
      ${part.chapters.map(renderChapter).join('\n')}
    </section>`,
  )
  .join('\n');

const rail = numbered
  .map(
    (part) => `<div class="rail__group">
        <p class="rail__title">${part.title}</p>
        <ul>${part.chapters
          .map(
            (chapter) =>
              `<li><a href="#${chapter.id}"><span class="rail__num">${chapter.number}</span>${chapter.title}</a></li>`,
          )
          .join('')}</ul>
      </div>`,
  )
  .join('');

const html = `<title>${meta.title}</title>
<meta name="description" content="${escapeAttr(meta.tagline)}" />

<style>
${fonts}

/* ============================================================
   الرموز — مأخوذة من نظام تصميم نمِقة نفسه.
   دليل المنتج يُكتب بلغة المنتج البصرية: حبر نيلي، وورق دافئ،
   وذهب يظهر خطّاً شعرياً وعلامةَ قصّ حول كل لقطة، لا طلاءً.
   ============================================================ */
:root {
  --canvas: #f7f6f2;
  --surface: #ffffff;
  --surface-2: #f1f0ea;
  --line: #e5e3da;
  --line-strong: #cfccc0;
  --fg: #161b2e;
  --muted: #5b6079;
  --faint: #8b8fa3;
  --ink: #2a3d6f;
  --gold: #c8a24a;
  --gold-text: #8f6f28;
  --gold-soft: #f6efd6;
  --warn: #b4791e;
  --warn-soft: #fdf6e8;
  --good: #2f7d5b;
  --good-soft: #eef7f2;

  --measure: 68ch;
  --step: clamp(1rem, 0.9rem + 0.4vw, 1.0625rem);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --canvas: #0a0e1c;
    --surface: #111829;
    --surface-2: #18203a;
    --line: #232d4b;
    --line-strong: #354062;
    --fg: #e9ecf6;
    --muted: #9aa3c0;
    --faint: #6d7794;
    --ink: #6980bd;
    --gold: #d0ad52;
    --gold-text: #d0ad52;
    --gold-soft: #241f10;
    --warn: #d8a446;
    --warn-soft: #241d0e;
    --good: #62b48c;
    --good-soft: #0f2419;
  }
}

:root[data-theme='dark'] {
  --canvas: #0a0e1c;
  --surface: #111829;
  --surface-2: #18203a;
  --line: #232d4b;
  --line-strong: #354062;
  --fg: #e9ecf6;
  --muted: #9aa3c0;
  --faint: #6d7794;
  --ink: #6980bd;
  --gold: #d0ad52;
  --gold-text: #d0ad52;
  --gold-soft: #241f10;
  --warn: #d8a446;
  --warn-soft: #241d0e;
  --good: #62b48c;
  --good-soft: #0f2419;
}

* { box-sizing: border-box; }

html { scroll-behavior: smooth; scroll-padding-block-start: 2rem; }

body {
  margin: 0;
  direction: rtl;
  background: var(--canvas);
  color: var(--fg);
  font-family: 'Nomiqa Body', system-ui, sans-serif;
  font-size: var(--step);
  line-height: 1.85;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 {
  font-family: 'Nomiqa Display', system-ui, sans-serif;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-wrap: balance;
  margin: 0;
}

p { margin: 0; }

a { color: inherit; }

:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 3px;
  border-radius: 3px;
}

/* ---------- الهيكل ---------- */
.page {
  max-width: 1180px;
  margin-inline: auto;
  padding: 0 1.25rem 6rem;
}

@media (min-width: 1080px) {
  .page {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 3.5rem;
    align-items: start;
    padding-inline: 2rem;
  }
  .cover { grid-column: 1 / -1; }
}

/* ---------- الغلاف ---------- */
.cover {
  padding: 4.5rem 0 3rem;
  border-block-end: 1px solid var(--line);
  margin-block-end: 3rem;
}

.mark { display: flex; align-items: center; gap: 0.75rem; color: var(--ink); }
.mark span {
  font-family: 'Nomiqa Display', system-ui, sans-serif;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--fg);
}

.cover h1 {
  margin-block-start: 1.75rem;
  font-size: clamp(2.25rem, 1.6rem + 3vw, 3.5rem);
  line-height: 1.15;
}

.cover__tagline {
  margin-block-start: 1rem;
  max-width: var(--measure);
  font-size: 1.125rem;
  color: var(--muted);
}

.cover__meta {
  margin-block-start: 2.25rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.75rem;
  font-size: 0.8125rem;
  color: var(--faint);
}

.cover__meta b {
  color: var(--gold-text);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.cover__note {
  margin-block-start: 1.75rem;
  max-width: var(--measure);
  padding: 0.75rem 1rem;
  border-inline-start: 2px solid var(--gold);
  background: var(--gold-soft);
  border-radius: 0 0.375rem 0.375rem 0;
  font-size: 0.875rem;
  line-height: 1.7;
  color: var(--muted);
}

/* ---------- فهرس جانبي ---------- */
.rail { display: none; }

@media (min-width: 1080px) {
  .rail {
    display: block;
    position: sticky;
    top: 2rem;
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
    padding-inline-end: 0.5rem;
    font-size: 0.8125rem;
    line-height: 1.6;
  }
}

.rail__group + .rail__group { margin-block-start: 1.5rem; }

.rail__title {
  font-family: 'Nomiqa Display', system-ui, sans-serif;
  font-size: 0.625rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--gold-text);
  margin-block-end: 0.5rem;
}

.rail ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.125rem; }

.rail a {
  display: flex;
  gap: 0.625rem;
  padding: 0.3rem 0.6rem;
  border-radius: 0.375rem;
  text-decoration: none;
  color: var(--muted);
  transition: background-color 0.15s, color 0.15s;
}

.rail a:hover { background: var(--surface-2); color: var(--fg); }

.rail a[aria-current='true'] {
  background: var(--surface-2);
  color: var(--fg);
  box-shadow: inset 2px 0 0 var(--gold);
}

.rail__num {
  min-width: 1.15rem;
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}

/* ---------- الأجزاء والفصول ---------- */
.part + .part { margin-block-start: 4.5rem; }

.part__head { max-width: var(--measure); margin-block-end: 2.5rem; }

.part__eyebrow {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-family: 'Nomiqa Display', system-ui, sans-serif;
  font-size: 0.6875rem;
  letter-spacing: 0.16em;
  color: var(--gold-text);
  margin-block-end: 0.75rem;
}

.part__eyebrow::before {
  content: '';
  width: 1.75rem;
  height: 1px;
  background: var(--gold);
}

.part__head h2 { font-size: clamp(1.5rem, 1.2rem + 1.2vw, 2rem); }

.part__lede { margin-block-start: 0.625rem; color: var(--muted); }

.chapter {
  padding: 2rem 0 2.5rem;
  border-block-start: 1px solid var(--line);
  scroll-margin-block-start: 1.5rem;
}

.chapter__head { display: flex; align-items: baseline; gap: 0.875rem; }

.chapter__num {
  font-family: 'Nomiqa Display', system-ui, sans-serif;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--gold);
  font-variant-numeric: tabular-nums;
  min-width: 1.5rem;
}

.chapter__head h3 { font-size: 1.375rem; }

.chapter__purpose {
  margin-block-start: 0.875rem;
  max-width: var(--measure);
  color: var(--muted);
}

/* ---------- الخطوات ---------- */
.steps {
  counter-reset: step;
  list-style: none;
  margin: 1.75rem 0 0;
  padding: 0;
  max-width: var(--measure);
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.steps li {
  counter-increment: step;
  position: relative;
  padding-inline-start: 2.25rem;
}

.steps li::before {
  content: counter(step);
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 0.28em;
  width: 1.5rem;
  height: 1.5rem;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  line-height: 1;
}

.steps b { font-weight: 500; color: var(--fg); }

/* ---------- الملاحظات ---------- */
.note {
  margin-block-start: 1.25rem;
  max-width: var(--measure);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.875rem;
  align-items: start;
  padding: 0.875rem 1rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: var(--surface);
  font-size: 0.9375rem;
  line-height: 1.75;
}

.note__label {
  font-family: 'Nomiqa Display', system-ui, sans-serif;
  font-size: 0.625rem;
  letter-spacing: 0.1em;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  white-space: nowrap;
  line-height: 1.5;
}

.note--info { border-color: var(--line); }
.note--info .note__label { background: var(--surface-2); color: var(--muted); }

.note--warn { border-color: color-mix(in srgb, var(--warn) 35%, transparent); background: var(--warn-soft); }
.note--warn .note__label { background: color-mix(in srgb, var(--warn) 22%, transparent); color: var(--warn); }

.note--good { border-color: color-mix(in srgb, var(--good) 32%, transparent); background: var(--good-soft); }
.note--good .note__label { background: color-mix(in srgb, var(--good) 18%, transparent); color: var(--good); }

/* ---------- اللقطات ----------
   الإطار يحمل علامات القصّ الذهبية نفسها التي تحيط بمعاينة البطاقة
   داخل التطبيق: إشارة إلى أن ما بالداخل شاشة حقيقية لا رسم توضيحي. */
.shot { margin: 2rem 0 0; }

.shot__frame {
  position: relative;
  padding: 0.875rem;
}

.shot__frame::before,
.shot__frame::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-repeat: no-repeat;
  background-image:
    linear-gradient(var(--gold), var(--gold)), linear-gradient(var(--gold), var(--gold)),
    linear-gradient(var(--gold), var(--gold)), linear-gradient(var(--gold), var(--gold));
  background-size: 1px 1.125rem, 1.125rem 1px, 1px 1.125rem, 1.125rem 1px;
  opacity: 0.75;
}

.shot__frame::before { background-position: left top, left top, right top, right top; }
.shot__frame::after { background-position: left bottom, left bottom, right bottom, right bottom; }

.shot img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: var(--surface);
}

.shot figcaption {
  margin-block-start: 1rem;
  font-size: 0.8125rem;
  color: var(--faint);
  max-width: var(--measure);
}

/* ---------- التذييل ---------- */
.foot {
  margin-block-start: 5rem;
  padding-block-start: 2rem;
  border-block-start: 1px solid var(--line);
  font-size: 0.8125rem;
  color: var(--faint);
}

@media (min-width: 1080px) { .foot { grid-column: 2; } }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  * { transition-duration: 0.01ms !important; }
}
</style>

<div class="page">
  <header class="cover">
    <div class="mark">
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M6 13a10 10 0 0 0 20 0" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
        <circle cx="16" cy="6.5" r="2.6" fill="var(--gold)" />
      </svg>
      <span>نمِقة</span>
    </div>

    <h1>${meta.title}</h1>
    <p class="cover__tagline">${meta.tagline}</p>

    <div class="cover__meta">
      <span><b>${total}</b> فصلاً</span>
      <span><b>${parts.length}</b> أجزاء</span>
      <span>${meta.version}</span>
    </div>

    <p class="cover__note">${meta.note}</p>
  </header>

  <nav class="rail" aria-label="فهرس الدليل">${rail}</nav>

  <main>
${body}
  </main>

  <footer class="foot">
    <p>دليل نمِقة · ${meta.version} · اللقطات مأخوذة من التطبيق بوضع العرض التجريبي.</p>
  </footer>
</div>

<script>
  // إبراز الفصل المقروء في الفهرس. مراقب تقاطع واحد لكل الفصول —
  // مستمع تمرير كان سيحسب مواضع ثلاثين عنصراً في كل إطار.
  const links = new Map(
    Array.from(document.querySelectorAll('.rail a')).map((a) => [a.getAttribute('href').slice(1), a]),
  );

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const link = links.get(entry.target.id);
        if (!link) continue;
        if (entry.isIntersecting) {
          for (const other of links.values()) other.removeAttribute('aria-current');
          link.setAttribute('aria-current', 'true');
        }
      }
    },
    { rootMargin: '-10% 0px -70% 0px', threshold: 0 },
  );

  for (const chapter of document.querySelectorAll('.chapter')) observer.observe(chapter);
</script>
`;

writeFileSync(path.join(GUIDE, 'index.html'), html, 'utf8');

/* ------------------------------------------------------------
   النسخة النصية داخل المستودع.
   تشير إلى ملفات PNG لا إلى بيانات مضمَّنة: من يقرأ المستودع يقرأ
   نصاً قابلاً للمراجعة في طلب دمج، لا سلسلة base64 بطول ميغابايت.
   ------------------------------------------------------------ */
const markdown = [
  `# ${meta.title}`,
  '',
  meta.tagline,
  '',
  `> ${meta.note}`,
  '',
  '## الفهرس',
  '',
  ...numbered.flatMap((part) => [
    `**${part.title}**`,
    '',
    ...part.chapters.map((chapter) => `${chapter.number}. [${chapter.title}](#${chapter.id})`),
    '',
  ]),
  ...numbered.flatMap((part) => [
    `## ${part.title}`,
    '',
    part.lede,
    '',
    ...part.chapters.flatMap((chapter) => [
      `### ${chapter.number}. ${chapter.title}`,
      '',
      strip(chapter.purpose),
      '',
      ...(chapter.steps ?? []).map((step, index) => `${index + 1}. ${strip(step)}`),
      '',
      ...(chapter.notes ?? []).map((note) => `> **${toneLabel[note.tone]}** — ${strip(note.body)}`),
      '',
      ...(chapter.shots ?? []).map(
        (shot) => `![${shot.caption}](shots/${shot.file}.png)\n\n_${shot.caption}_`,
      ),
      '',
    ]),
  ]),
].join('\n');

writeFileSync(path.join(GUIDE, 'README.md'), `${markdown}\n`, 'utf8');

/** يزيل وسوم HTML الخفيفة المستعملة داخل النصّ. */
function strip(value) {
  return value.replace(/<\/?(?:b|span)[^>]*>/g, '');
}

const bytes = Buffer.byteLength(html, 'utf8');
console.log(`docs/guide/index.html — ${(bytes / 1024 / 1024).toFixed(2)} م.ب، ${total} فصلاً`);
console.log('docs/guide/README.md');
