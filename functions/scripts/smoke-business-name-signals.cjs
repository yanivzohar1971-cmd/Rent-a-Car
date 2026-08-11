/**
 * Quick regression checks for homepage business-name heuristics.
 * Run: node scripts/smoke-business-name-signals.cjs
 */
const {
  computeHomepageBusinessNameSignals,
  extractHeroBannerImageCandidates,
} = require("../lib/services/siteResearchExtractor.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const conflictHtml = `<!doctype html><html><head><title>שרק רכב</title></head><body>
<div class="header"><div class="logo"><a href="/"><img src="/logo.png" alt="אס.אר.קיי רכב" /></a></div></div>
</body></html>`;

const r1 = computeHomepageBusinessNameSignals(conflictHtml, "https://srk-car.com/", [], "", conflictHtml);
assert(r1.resolvedBusinessName === "אס.אר.קיי רכב", `expected logo alt brand, got ${r1.resolvedBusinessName}`);
assert(r1.businessNameSource === "logoAlt", `expected logoAlt source, got ${r1.businessNameSource}`);
assert(r1.domainFallbackUsed === false, "domain fallback should not be used");
assert(r1.businessNameChosenDebug?.domainFallbackUsed === false, "debug domainFallbackUsed");

const hagarish = `<!doctype html><html><head><title>השכרת רכב בראשון | הגר השכרת רכב</title></head><body>
<div class="header"><span class="site-title">הגר רנט</span></div>
</body></html>`;
const r2 = computeHomepageBusinessNameSignals(hagarish, "http://www.hagar-rent.co.il/", [], "", hagarish);
assert(r2.resolvedBusinessName === "הגר רנט", `expected site-title span, got ${r2.resolvedBusinessName}`);
assert(r2.businessNameSource === "header", `expected header source, got ${r2.businessNameSource}`);

const srkTitleOnly = `<!doctype html><html><head><title>שרק רכב</title></head><body><div class="header"><div class="logo"><a href="/"><img src="/logo.png" alt="" /></a></div></div></body></html>`;
const r3 = computeHomepageBusinessNameSignals(srkTitleOnly, "https://srk-car.com/", [], "", srkTitleOnly);
assert(r3.resolvedBusinessName === "אס.אר.קיי רכב", `expected initials refinement, got ${r3.resolvedBusinessName}`);
assert(r3.refinementApplied === true, "refinement should apply for title+transliteration");
assert(r3.refinementReason === "initials_fix", `expected initials_fix, got ${r3.refinementReason}`);

const motors = `<!doctype html><html><head><title>מוטורס השכרת רכב</title></head><body></body></html>`;
const r4 = computeHomepageBusinessNameSignals(motors, "https://example.com/", [], "", motors);
assert(r4.resolvedBusinessName === "מוטורס", `expected motors brand without rental tail, got ${r4.resolvedBusinessName}`);

/** Mirrors hagar-rent.co.il: empty logo alt, title pipes, repeated "הגר רכב" in body (no site-title span). */
const hagarRealish = `<!DOCTYPE html><html><head><title>השכרת רכב בראשון לציון | הגר השכרת רכב | הגר השכרת רכב</title>
<meta name="description" content="חברת הגר השכרת רכב מציעה מגוון רכבים להשכרה" /></head><body>
<div class="header"><div class="logo"><a href="/"><img src="/logo.png" alt="" /></a></div></div>
<p>הצוות המקצועי של הגר רכב דואג להתחדש. אצלנו בהגר רכב תהנו משירות.</p>
</body></html>`;
const r5 = computeHomepageBusinessNameSignals(hagarRealish, "https://www.hagar-rent.co.il/", [], "", hagarRealish);
assert(r5.resolvedBusinessName === "הגר השכרת רכב", `expected repeated full title segment, got ${r5.resolvedBusinessName}`);
assert(r5.businessNameSource === "title", `expected title wins over shorter header, got ${r5.businessNameSource}`);
assert(r5.titlePipeSegmentMatchCount === 2, `expected pipe repeat count 2, got ${r5.titlePipeSegmentMatchCount}`);
assert(r5.headerVsTitleConflictResolved === "title", `expected title conflict resolution`);

const hagarCross = computeHomepageBusinessNameSignals(hagarRealish, "https://www.hagar-rent.co.il/", [], "", hagarRealish, {
  allPageTitles: [
    "השכרת רכב בראשון לציון | הגר השכרת רכב | הגר השכרת רכב",
    "אודות | הגר השכרת רכב",
    "צור קשר | הגר השכרת רכב",
  ],
});
assert(hagarCross.titleRepeatedAcrossPages === true, "cross-page titles should mark repeat");
assert(hagarCross.resolvedBusinessName === "הגר השכרת רכב", `cross-page: expected full title brand, got ${hagarCross.resolvedBusinessName}`);

const heroOwl = `<!DOCTYPE html><html><body><div class="main_slider"><div class="owl-carousel">
<div class="item"><img src="https://www.hagar-rent.co.il/uploadimages/big2/1.png" alt=""></div>
<div class="item"><img src="https://www.hagar-rent.co.il/uploadimages/big3/2.png" alt=""></div>
</div></div></body></html>`;
const heroUrls = extractHeroBannerImageCandidates(heroOwl, "https://www.hagar-rent.co.il/");
assert(heroUrls.length >= 2, `expected 2+ owl hero URLs, got ${heroUrls.length}`);

console.log("smoke-business-name-signals: ok", {
  r1: r1.resolvedBusinessName,
  r2: r2.resolvedBusinessName,
  r3: r3.resolvedBusinessName,
  r4: r4.resolvedBusinessName,
  r5: r5.resolvedBusinessName,
  hagarCross: hagarCross.resolvedBusinessName,
  heroUrls: heroUrls.length,
});
