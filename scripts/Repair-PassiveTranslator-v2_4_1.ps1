param(
    [Parameter(Mandatory = $true)]
    [string]$HtmlPath
)

$ErrorActionPreference = 'Stop'
$originalPath = (Resolve-Path -LiteralPath $HtmlPath).ProviderPath
$expectedBrokenHash = 'F71208835D8F1184476B84F7FF23DEFA58421C36A36048DAE183038E97CD779E'
$expectedOriginalHash = 'BE1893CE81D78DBFDABD1000E62921F47EB5AA435EAE676E9D460AD0785C7117'
$inputHash = (Get-FileHash -LiteralPath $originalPath -Algorithm SHA256).Hash
if ($inputHash -ne $expectedBrokenHash) {
    throw 'This repair only supports the exact damaged v2.4.1 file already diagnosed. No file was changed.'
}

$pageText = [IO.File]::ReadAllText($originalPath)
$urlText = 'https://www.murata.com/en-global/products/capacitor/ceramiccapacitor/overview/lineup'
$brokenText = 'source:' + $urlText + ',checkedAt:'
$correctText = 'source:' + [char]34 + $urlText + [char]34 + ',checkedAt:'
if (-not $pageText.Contains($brokenText)) {
    throw 'The diagnosed missing quotes were not found. No file was changed.'
}
$fixedText = $pageText.Replace($brokenText, $correctText).Replace("`r`n", "`n").TrimEnd([char[]]"`r`n")
$encoding = New-Object System.Text.UTF8Encoding($true)
[byte[]]$fixedBytes = $encoding.GetPreamble() + $encoding.GetBytes($fixedText)
$sha = [Security.Cryptography.SHA256]::Create()
try {
    $fixedHash = [BitConverter]::ToString($sha.ComputeHash($fixedBytes)).Replace('-', '')
} finally {
    $sha.Dispose()
}
if ($fixedHash -ne $expectedOriginalHash) {
    throw 'The repaired content does not match the original release. No file was changed.'
}

$fixedPath = Join-Path ([IO.Path]::GetDirectoryName($originalPath)) ([IO.Path]::GetFileNameWithoutExtension($originalPath) + '-repaired.html')
$stream = [IO.File]::Open($fixedPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try {
    $stream.Write($fixedBytes, 0, $fixedBytes.Length)
} finally {
    $stream.Dispose()
}
[pscustomobject]@{ RepairedFile = $fixedPath; SHA256 = $fixedHash; OriginalPreserved = $true }
