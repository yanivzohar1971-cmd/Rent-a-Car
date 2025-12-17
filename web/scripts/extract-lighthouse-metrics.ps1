# Extract Lighthouse metrics from JSON reports
$reports = @(
    @{ Name = "Home"; Path = ".\docs\perf\lighthouse\mobile-home.report.json"; Route = "/" },
    @{ Name = "Search"; Path = ".\docs\perf\lighthouse\mobile-search.report.json"; Route = "/cars" },
    @{ Name = "Details"; Path = ".\docs\perf\lighthouse\mobile-details.report.json"; Route = "/cars/test123" }
)

$results = @()

foreach ($report in $reports) {
    $json = Get-Content $report.Path -Raw | ConvertFrom-Json
    
    $perfScore = [math]::Round($json.categories.performance.score * 100, 1)
    $lcp = [math]::Round($json.audits.'largest-contentful-paint'.numericValue, 0)
    $cls = [math]::Round($json.audits.'cumulative-layout-shift'.numericValue, 3)
    $tbt = [math]::Round($json.audits.'total-blocking-time'.numericValue, 0)
    $inp = if ($json.audits.'interaction-to-next-paint') { [math]::Round($json.audits.'interaction-to-next-paint'.numericValue, 0) } else { "N/A" }
    
    # Total JS bytes
    $totalJS = 0
    $unusedJS = 0
    if ($json.audits.'total-byte-weight') {
        $totalJS = [math]::Round($json.audits.'total-byte-weight'.numericValue / 1024, 0)
    }
    if ($json.audits.'unused-javascript') {
        $unusedJS = [math]::Round($json.audits.'unused-javascript'.details.overallSavingsBytes / 1024, 0)
    }
    
    # LCP element
    $lcpElement = if ($json.audits.'largest-contentful-paint-element') { 
        $json.audits.'largest-contentful-paint-element'.details.items[0].node.snippet 
    } else { "N/A" }
    
    # Top opportunities
    $opportunities = $json.audits | Where-Object { $_.details -and $_.details.type -eq 'opportunity' -and $_.score -lt 1 } | 
        Sort-Object { $_.details.overallSavingsMs } -Descending | 
        Select-Object -First 5 | 
        ForEach-Object { "$($_.title) (save $([math]::Round($_.details.overallSavingsMs, 0))ms)" }
    
    # Top diagnostics
    $diagnostics = $json.audits | Where-Object { $_.details -and $_.details.type -eq 'diagnostic' } | 
        Sort-Object { if ($_.numericValue) { $_.numericValue } else { 0 } } -Descending | 
        Select-Object -First 5 | 
        ForEach-Object { 
            $val = if ($_.numericValue) { [math]::Round($_.numericValue, 0) } else { "N/A" }
            "$($_.title): $val"
        }
    
    $results += [PSCustomObject]@{
        Route = $report.Route
        Name = $report.Name
        PerformanceScore = $perfScore
        LCP = $lcp
        CLS = $cls
        TBT = $tbt
        INP = $inp
        TotalJSKB = $totalJS
        UnusedJSKB = $unusedJS
        LCPElement = $lcpElement
        Opportunities = $opportunities -join "`n"
        Diagnostics = $diagnostics -join "`n"
    }
}

# Output results
$results | Format-List | Out-String
