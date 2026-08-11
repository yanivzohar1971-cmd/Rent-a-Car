# Create baseline summary from Lighthouse reports
$reports = @(
    @{ Name = "Home"; Path = ".\docs\perf\lighthouse\mobile-home.report.json"; Route = "/" },
    @{ Name = "Search"; Path = ".\docs\perf\lighthouse\mobile-search.report.json"; Route = "/cars" },
    @{ Name = "Details"; Path = ".\docs\perf\lighthouse\mobile-details.report.json"; Route = "/cars/test123" }
)

$summary = @"
# Mobile Lighthouse Baseline Summary

**Date:** 2025-12-17  
**Environment:** Production build (preview server on 127.0.0.1:4173)  
**Lighthouse Version:** 13.0.1  
**Form Factor:** Mobile (Simulated throttling)

---

"@

foreach ($report in $reports) {
    $json = Get-Content $report.Path -Raw | ConvertFrom-Json
    
    $perfScore = [math]::Round($json.categories.performance.score * 100, 1)
    $lcp = [math]::Round($json.audits.'largest-contentful-paint'.numericValue, 0)
    $cls = [math]::Round($json.audits.'cumulative-layout-shift'.numericValue, 3)
    $tbt = [math]::Round($json.audits.'total-blocking-time'.numericValue, 0)
    $inp = if ($json.audits.'interaction-to-next-paint') { 
        [math]::Round($json.audits.'interaction-to-next-paint'.numericValue, 0) 
    } else { 
        "N/A (using TBT)" 
    }
    
    # Total JS bytes
    $totalJS = 0
    if ($json.audits.'total-byte-weight') {
        $totalJS = [math]::Round($json.audits.'total-byte-weight'.numericValue / 1024, 0)
    }
    
    # Unused JS
    $unusedJS = 0
    $unusedJSTime = 0
    if ($json.audits.'unused-javascript' -and $json.audits.'unused-javascript'.details) {
        $unusedJS = [math]::Round($json.audits.'unused-javascript'.details.overallSavingsBytes / 1024, 0)
        $unusedJSTime = [math]::Round($json.audits.'unused-javascript'.details.overallSavingsMs, 0)
    }
    
    # Render-blocking resources
    $renderBlocking = 0
    $renderBlockingTime = 0
    if ($json.audits.'render-blocking-resources' -and $json.audits.'render-blocking-resources'.details) {
        $renderBlockingTime = [math]::Round($json.audits.'render-blocking-resources'.details.overallSavingsMs, 0)
    }
    
    # LCP element
    $lcpElement = "N/A"
    if ($json.audits.'largest-contentful-paint-element' -and $json.audits.'largest-contentful-paint-element'.details.items.Count -gt 0) {
        $lcpElement = $json.audits.'largest-contentful-paint-element'.details.items[0].node.snippet
    }
    
    # Top 5 opportunities (by savings)
    $opportunities = @()
    foreach ($audit in $json.audits.PSObject.Properties) {
        $auditObj = $audit.Value
        if ($auditObj.details -and $auditObj.details.type -eq 'opportunity' -and $auditObj.score -lt 1 -and $auditObj.details.overallSavingsMs) {
            $opportunities += [PSCustomObject]@{
                Title = $auditObj.title
                SavingsMs = $auditObj.details.overallSavingsMs
            }
        }
    }
    $topOpportunities = $opportunities | Sort-Object SavingsMs -Descending | Select-Object -First 5
    
    # Top 5 diagnostics
    $diagnostics = @()
    foreach ($audit in $json.audits.PSObject.Properties) {
        $auditObj = $audit.Value
        if ($auditObj.details -and $auditObj.details.type -eq 'diagnostic') {
            $val = if ($auditObj.numericValue) { [math]::Round($auditObj.numericValue, 0) } else { "N/A" }
            $diagnostics += [PSCustomObject]@{
                Title = $auditObj.title
                Value = $val
            }
        }
    }
    $topDiagnostics = $diagnostics | Select-Object -First 5
    
    $summary += @"

## $($report.Name) Page ($($report.Route))

### Core Web Vitals
- **Performance Score:** $perfScore
- **LCP (Largest Contentful Paint):** ${lcp}ms
- **CLS (Cumulative Layout Shift):** $cls
- **TBT (Total Blocking Time):** ${tbt}ms
- **INP (Interaction to Next Paint):** $inp

### JavaScript Metrics
- **Total JS Bytes:** ${totalJS} KB
- **Unused JavaScript:** ${unusedJS} KB (potential savings: ${unusedJSTime}ms)
- **Render-blocking Resources:** Potential savings: ${renderBlockingTime}ms

### LCP Element
$lcpElement

### Top 5 Opportunities
"@
    
    foreach ($opp in $topOpportunities) {
        $savings = [math]::Round($opp.SavingsMs, 0)
        $summary += "- **$($opp.Title)**: Save ${savings}ms`n"
    }
    
    $summary += @"

### Top 5 Diagnostics
"@
    
    foreach ($diag in $topDiagnostics) {
        $summary += "- **$($diag.Title)**: $($diag.Value)`n"
    }
    
    $summary += "`n---`n`n"
}

# Likely Big Rocks (derived from all reports)
$summary += @"

## Likely Big Rocks (Priority Fixes)

Based on the baseline measurements across all routes:

1. **Large JavaScript Bundle (1,469 KB / 396 KB gzipped)** - Main bundle exceeds 500 KB threshold, needs code splitting
2. **Unused JavaScript (229-260 KB)** - Significant unused code across all routes
3. **Render-blocking Resources** - CSS/JS blocking initial render
4. **High TBT (127-429ms)** - Main thread blocking time needs reduction
5. **Large CSS Bundle (223 KB / 32 KB gzipped)** - Potential for CSS optimization
6. **Font Loading (30+ font files)** - Multiple font weights/variants loading, needs optimization

---

**Artifacts Location:**
- HTML Reports: `docs/perf/lighthouse/mobile-*.report.html`
- JSON Reports: `docs/perf/lighthouse/mobile-*.report.json`
- Build Log: `logs/build-baseline.log`
- Preview Log: `logs/preview.log`
"@

$summary | Out-File -FilePath ".\docs\perf\baseline-summary.md" -Encoding UTF8
Write-Host "Baseline summary created: docs/perf/baseline-summary.md"
