#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot '..\deliverables\Murata-All-Catalogs-v1\Download-MurataProductCatalogs.ps1'
. $scriptPath -LibraryOnly
$testRoot = Join-Path (Split-Path $PSScriptRoot -Parent) ('.catalog-download-test-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($testRoot)
$utf8 = New-Object Text.UTF8Encoding($false)
$script:checks = 0
function Check([bool]$Condition, [string]$Label) {
    if (-not $Condition) { throw "FAILED: $Label" }
    $script:checks++
}
function Reject([scriptblock]$Action, [string]$Label) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    Check $rejected $Label
}
try {
    $list = Join-Path $testRoot 'categories.txt'
    [IO.File]::WriteAllText($list, "# fixture only`nceramicCapacitorSMD`n", $utf8)
    $ids = @(Read-MurataCategories $list 1)
    Check ($ids.Count -eq 1 -and $ids[0] -ceq 'ceramicCapacitorSMD') 'exact official ID retained'
    [IO.File]::WriteAllText($list, '1UFrontEnd', $utf8)
    Check ((Read-MurataCategories $list 1) -ceq '1UFrontEnd') 'official category beginning with digit retained'
    [IO.File]::WriteAllText($list, "# fixture only`nceramicCapacitorSMD`n", $utf8)
    Reject { Read-MurataCategories $list 73 } 'partial list not advertised as all 73'
    [IO.File]::WriteAllText($list, "ceramicCapacitorSMD`nCERAMICCAPACITORSMD", $utf8)
    Reject { Read-MurataCategories $list 2 } 'duplicate IDs rejected'
    [IO.File]::WriteAllText($list, '../outside', $utf8)
    Reject { Read-MurataCategories $list 1 } 'path traversal ID rejected'
    $uri = Get-MurataDownloadUri ([pscustomobject]@{ProductDataDownloadUrl='https://example.com/catalog?token=FIXTURE_ONLY'}) 'ProductDataDownloadUrl'
    Check ($uri.Scheme -eq 'https') 'explicit response field parsed'
    Reject { Get-MurataDownloadUri ([pscustomobject]@{differentUrl='https://example.com/'}) 'ProductDataDownloadUrl' } 'unknown shape rejected'
    Reject { Assert-MurataHttpsUri 'http://example.com/catalog' } 'insecure URL rejected'
    Reject { Assert-MurataHttpsUri 'https://user:password@example.com/catalog' } 'embedded credentials rejected'
    $request = New-MurataRequest ([Uri]'https://api.murata.com/v3/products/getproductdatadownloadurl?category=ceramicCapacitorSMD&lang=zh') 'FAKE_TEST_KEY'
    Check ($request.Headers['x-api-key'] -eq 'FAKE_TEST_KEY' -and -not $request.AllowAutoRedirect) 'key restricted request with redirects off'
    $fileRequest = New-MurataRequest $uri
    Check ([string]::IsNullOrEmpty($fileRequest.Headers['x-api-key'])) 'no API key on file request'
    Reject { New-MurataRequest ([Uri]'https://example.com/') 'FAKE_TEST_KEY' } 'key not sent to other host'
    $json = Join-Path $testRoot 'fixture.json'
    [IO.File]::WriteAllText($json, '[{"Partno":"SYNTHETIC_ONLY","value":1e-11}]', $utf8)
    $before = (Get-FileHash -LiteralPath $json -Algorithm SHA256).Hash
    Test-MurataRawJson $json
    Check ((Get-FileHash -LiteralPath $json -Algorithm SHA256).Hash -eq $before) 'validation preserves bytes'
    [IO.File]::WriteAllText($json, '{"rows":[]}', (New-Object Text.UTF8Encoding($true)))
    Test-MurataRawJson $json
    Check $true 'UTF-8 BOM accepted'
    [IO.File]::WriteAllText($json, '{"str":"a\"b\\c\u4E2D\n","values":[null,true,false,-0,1.2e-9,1E+2],"nested":[{},[]]}', $utf8)
    Test-MurataRawJson $json
    Check $true 'escaped strings, Unicode escapes, literals, numbers and nesting'
    $writer = New-Object IO.StreamWriter($json, $false, $utf8)
    try {
        $writer.Write('[')
        for ($i = 0; $i -lt 100000; $i++) {
            if ($i -gt 0) { $writer.Write(',') }
            $writer.Write('{"Partno":"SYNTHETIC_ONLY","value":1e-11}')
        }
        $writer.Write(']')
    } finally { $writer.Dispose() }
    Test-MurataRawJson $json
    Check ((Get-Item -LiteralPath $json).Length -gt 3MB) 'streaming fixture exceeds metadata memory limit'
    foreach ($bad in @('', 'not json', '[{"missing":}]', '{"rows":[]', '{"rows":[]} {"extra":true}', 'true', '[01]', '[1.]', '[1e]', '[1,]', '{"k":1,}', '["\q"]', '["\u12"]')) {
        [IO.File]::WriteAllText($json, $bad, $utf8)
        Reject { Test-MurataRawJson $json } ('malformed/truncated/trailing/non-container rejected: ' + $bad)
    }
    [IO.File]::WriteAllBytes($json, [byte[]]@(91,34,255,34,93))
    Reject { Test-MurataRawJson $json } 'invalid UTF-8 rejected'
    # Exercise orchestration with synthetic data and mocked transport, no network.
    function Read-Host { param($Prompt, [switch]$AsSecureString) return (ConvertTo-SecureString 'FAKE_TEST_KEY' -AsPlainText -Force) }
    function Start-Sleep { param($Seconds) }
    function Request-MurataCatalogUri { param($Category,$Lang,$Key,$Field) return [Uri]'https://example.com/?token=FAKE_SIGNED_TOKEN' }
    function Save-MurataRawDownload { param($Uri,$PartialPath) [IO.File]::WriteAllText($PartialPath, '[{"Partno":"SYNTHETIC_ONLY"}]', $utf8) }
    $CategoriesFile = $list; $ExpectedCategoryCount = 2; $OutputRoot = $testRoot
    [IO.File]::WriteAllText($list, "fixtureOne`nfixtureTwo", $utf8)
    $firstRun = Start-MurataCatalogArchive
    Check ($firstRun.Summary.successful -eq 2 -and $firstRun.Summary.allRequestedFilesDownloaded) 'all requested successful'
    $originalFile = Join-Path $firstRun.RunDirectory 'fixtureOne-zh.json'
    $originalHash = (Get-FileHash -LiteralPath $originalFile -Algorithm SHA256).Hash
    $secondRun = Start-MurataCatalogArchive
    Check ($secondRun.RunDirectory -ne $firstRun.RunDirectory -and
        (Get-FileHash -LiteralPath $originalFile -Algorithm SHA256).Hash -eq $originalHash) 'new run does not overwrite previous archive'
    $records = @(Get-Content -LiteralPath (Join-Path $firstRun.RunDirectory 'download-manifest.jsonl') | ForEach-Object { $_ | ConvertFrom-Json })
    Check ($records.Count -eq 2 -and $records[0].sha256 -eq $originalHash -and $records[0].jsonSyntaxChecked) 'manifest records bytes and hash'
    $logs = [IO.File]::ReadAllText((Join-Path $firstRun.RunDirectory 'run-summary.json')) + [IO.File]::ReadAllText((Join-Path $firstRun.RunDirectory 'download-manifest.jsonl'))
    Check ($logs -notmatch 'FAKE_TEST_KEY|FAKE_SIGNED_TOKEN|example.com') 'logs omit key and signed URL'
    function Save-MurataRawDownload { param($Uri,$PartialPath) [IO.File]::WriteAllText($PartialPath, '[{', $utf8) }
    $failedRun = Start-MurataCatalogArchive
    Check ($failedRun.Summary.failed -eq 2 -and -not $failedRun.Summary.allRequestedFilesDownloaded) 'invalid JSON run marked failed'
    Check (-not (Test-Path -LiteralPath (Join-Path $failedRun.RunDirectory 'fixtureOne-zh.json')) -and
        (Test-Path -LiteralPath (Join-Path $failedRun.RunDirectory 'fixtureOne-zh.json.partial'))) 'invalid JSON stays partial'
    function Request-MurataCatalogUri {
        param($Category,$Lang,$Key,$Field)
        $e = New-Object InvalidOperationException('synthetic auth failure')
        $e.Data['HttpStatus'] = 403
        throw $e
    }
    $authRun = Start-MurataCatalogArchive
    Check ($authRun.Summary.failed -eq 1 -and $authRun.Summary.notAttempted -eq 1) 'API auth failure stops remaining categories'
    $script:attempts = 0
    Invoke-MurataRetry {
        $script:attempts++
        if ($script:attempts -lt 3) {
            $e = New-Object InvalidOperationException('synthetic transient')
            $e.Data['HttpStatus'] = 429
            throw $e
        }
    }
    Check ($script:attempts -eq 3) 'transient retry bounded at three'
    $script:attempts = 0
    Reject {
        Invoke-MurataRetry {
            $script:attempts++
            $e = New-Object InvalidOperationException('synthetic auth')
            $e.Data['HttpStatus'] = 401
            throw $e
        }
    } 'authentication failure not retried'
    Check ($script:attempts -eq 1) 'no auth retry'
    Write-Output "PASS: $script:checks offline checks; no network or real key used."
} finally {
    # Only remove explicitly enumerated fixture files inside this checked test root.
    $workspace = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent)).TrimEnd('\') + '\'
    $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
    if (-not $resolvedTestRoot.StartsWith($workspace, [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path $resolvedTestRoot -Leaf) -notlike '.catalog-download-test-*') { throw 'Unsafe test cleanup path.' }
    Get-ChildItem -LiteralPath $testRoot -Recurse -File | ForEach-Object { Remove-Item -LiteralPath $_.FullName }
    Get-ChildItem -LiteralPath $testRoot -Directory | ForEach-Object { Remove-Item -LiteralPath $_.FullName }
    Remove-Item -LiteralPath $testRoot
}
