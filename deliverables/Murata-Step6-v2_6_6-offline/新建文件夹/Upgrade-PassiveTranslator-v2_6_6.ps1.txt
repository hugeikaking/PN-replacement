param([string]$HtmlPath)

$ErrorActionPreference = 'Stop'
$taskBaseHash = '894AC5D9622A3E1D6174DBA87B5BB01FF10FD4EE87B87120CF2103F076E229B3'
$taskTargetHash = '376F4DD1CB98B2EDC8D49669B937A0E6F77BFD7F8982E26A1B0DCC8D1F2CD1BC'
$taskPatchHash = '5BA11049B49846C1E77FC10A5D102FAD067AE3AAEA3FEEA5906561521E3D6601'
$taskPatchPath = Join-Path $PSScriptRoot 'Passive-PN-Translator-v2_6_5-to-v2_6_6.patch.json'
$taskEncoding = New-Object Text.UTF8Encoding($false, $true)
$taskHasher = [Security.Cryptography.SHA256]::Create()

function Get-TaskHash([byte[]]$Bytes) {
    return [BitConverter]::ToString($taskHasher.ComputeHash($Bytes)).Replace('-', '')
}

try {
    if (-not (Test-Path -LiteralPath $taskPatchPath -PathType Leaf)) {
        throw 'The patch JSON must be in the same folder as this updater. No file was changed.'
    }
    if ((Get-Item -LiteralPath $taskPatchPath).Length -gt 1048576) {
        throw 'The patch is larger than expected. No file was changed.'
    }
    $taskPatchBytes = [IO.File]::ReadAllBytes($taskPatchPath)
    if ((Get-TaskHash $taskPatchBytes) -ne $taskPatchHash) {
        throw 'Patch integrity check failed. Obtain the original patch file. No file was changed.'
    }
    $taskPatch = $taskEncoding.GetString($taskPatchBytes) | ConvertFrom-Json
    if ($taskPatch.format -ne 'pnrep-text-delta-v1' -or
        $taskPatch.baseSha256 -ne $taskBaseHash -or
        $taskPatch.targetSha256 -ne $taskTargetHash -or
        $taskPatch.baseByteLength -ne 543757 -or
        $taskPatch.targetByteLength -ne 547473 -or
        $taskPatch.operations.Count -lt 1 -or $taskPatch.operations.Count -gt 20000) {
        throw 'Unexpected patch format or version. No file was changed.'
    }

    if ([string]::IsNullOrWhiteSpace($HtmlPath)) {
        $taskCandidates = @(Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter '*.html' |
            Where-Object { $_.Length -eq 543757 } |
            Where-Object { (Get-TaskHash ([IO.File]::ReadAllBytes($_.FullName))) -eq $taskBaseHash })
        if ($taskCandidates.Count -eq 0) {
            throw 'No original v2.6.5 HTML was found beside the updater. Use -HtmlPath to select your working v2.6.5 file. No file was changed.'
        }
        if ($taskCandidates.Count -gt 1) {
            throw 'More than one v2.6.5 HTML was found. Use -HtmlPath to select one. No file was changed.'
        }
        $HtmlPath = $taskCandidates[0].FullName
    }
    $taskSourcePath = (Resolve-Path -LiteralPath $HtmlPath).ProviderPath
    if (-not (Test-Path -LiteralPath $taskSourcePath -PathType Leaf) -or
        (Get-Item -LiteralPath $taskSourcePath).Length -ne 543757) {
        throw 'The selected file is not the original v2.6.5 HTML. No file was changed.'
    }
    $taskSourceBytes = [IO.File]::ReadAllBytes($taskSourcePath)
    if ((Get-TaskHash $taskSourceBytes) -ne $taskBaseHash) {
        throw 'The selected HTML differs from the original v2.6.5. Modified, damaged or other versions cannot be upgraded by this patch. No file was changed.'
    }
    $taskTargetPath = Join-Path ([IO.Path]::GetDirectoryName($taskSourcePath)) 'Passive-PN-Translator-v2_6_6.html'
    if (Test-Path -LiteralPath $taskTargetPath) {
        throw 'Passive-PN-Translator-v2_6_6.html already exists. Keep it or move it yourself before retrying. No file was changed.'
    }

    # Copy offsets are UTF-16 string positions, not byte positions.
    # GetString preserves the original leading U+FEFF; output encoding adds no extra BOM.
    $taskSourceText = $taskEncoding.GetString($taskSourceBytes)
    $taskResult = New-Object Text.StringBuilder
    foreach ($taskOperation in $taskPatch.operations) {
        $taskProperties = @($taskOperation.PSObject.Properties.Name)
        if ($taskProperties.Count -ne 1) { throw 'Invalid operation. No HTML was written.' }
        if ($taskProperties[0] -eq 'copy') {
            $taskRange = @($taskOperation.copy)
            if ($taskRange.Count -ne 2) { throw 'Invalid copy range. No HTML was written.' }
            $taskOffset = [int]$taskRange[0]
            $taskLength = [int]$taskRange[1]
            if ($taskOffset -lt 0 -or $taskLength -le 0 -or
                $taskOffset -gt $taskSourceText.Length -or
                $taskLength -gt ($taskSourceText.Length - $taskOffset)) {
                throw 'Copy range is outside the original HTML. No HTML was written.'
            }
            [void]$taskResult.Append($taskSourceText, $taskOffset, $taskLength)
        } elseif ($taskProperties[0] -eq 'insert' -and $taskOperation.insert -is [string]) {
            [void]$taskResult.Append($taskOperation.insert)
        } else {
            throw 'Unknown patch operation. No HTML was written.'
        }
        if ($taskResult.Length -gt 1048576) { throw 'Unexpected output size. No HTML was written.' }
    }
    $taskResultBytes = $taskEncoding.GetBytes($taskResult.ToString())
    if ($taskResultBytes.Length -ne 547473 -or (Get-TaskHash $taskResultBytes) -ne $taskTargetHash) {
        throw 'Final HTML integrity check failed. No HTML was written.'
    }

    $taskOutput = [IO.File]::Open($taskTargetPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try { $taskOutput.Write($taskResultBytes, 0, $taskResultBytes.Length) }
    finally { $taskOutput.Dispose() }
    Write-Output "Saved: $taskTargetPath"
    Write-Output "SHA256: $taskTargetHash"
    Write-Output 'Upgrade complete. The original HTML and your product data were preserved.'
    Write-Output 'Open the new HTML and import your existing normalization-summary.json and normalized-products.jsonl.'
} finally {
    $taskHasher.Dispose()
}
