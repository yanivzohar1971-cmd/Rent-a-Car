/**
 * Quick regression checks for homepage business-name heuristics.
 * Run: node scripts/smoke-business-name-signals.cjs
 */
const { computeHomepageBusinessNameSignals } = require("../lib/services/siteResearchExtractor.js");

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

console.log("smoke-business-name-signals: ok", { r1: r1.resolvedBusinessName, r2: r2.resolvedBusinessName, r3: r3.resolvedBusinessName, r4: r4.resolvedBusinessName });
