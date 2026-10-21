param([string]$PartsFolder = (Get-Location).Path)

$ErrorActionPreference = 'Stop'
$taskFolder = (Resolve-Path -LiteralPath $PartsFolder).ProviderPath
$taskTarget = Join-Path $taskFolder 'Passive-PN-Translator-v2_5-restored.html'
if (Test-Path -LiteralPath $taskTarget) { throw 'The restored HTML already exists. No file was changed.' }
$taskBrokenHash = '53B49EACB2228D9939BED4B6962ED37F6DE984242550F7F4165A02756F1178EC'
$taskPartHash = 'C325EFE091AB8024411BFA5DB677AA51DEE72D0480B8DDE538215FA045323D82'
$taskFullHash = '38D3F770CC495595468D1A0BD93B53070FDEE55454161E3D76A80EEAE21359DC'
$taskEncoding = New-Object Text.UTF8Encoding($true, $true)
$taskBuffer = New-Object IO.MemoryStream
$taskHasher = [Security.Cryptography.SHA256]::Create()
try {
    foreach ($taskIndex in 1..8) {
        $taskName = 'Passive-PN-Translator-v2_5-part-{0:D2}.txt' -f $taskIndex
        $taskPath = Join-Path $taskFolder $taskName
        [byte[]]$taskBytes = [IO.File]::ReadAllBytes($taskPath)
        if ($taskIndex -eq 1) {
            $taskHash = [BitConverter]::ToString($taskHasher.ComputeHash($taskBytes)).Replace('-', '')
            if ($taskHash -eq $taskBrokenHash) {
                $taskText = $taskEncoding.GetString($taskBytes)
                $taskUrl = 'https://www.murata.com/en-global/products/capacitor/ceramiccapacitor/overview/lineup'
                $taskBroken = 'source:' + $taskUrl + ',checkedAt:'
                $taskCorrect = 'source:' + [char]34 + $taskUrl + [char]34 + ',checkedAt:'
                if (-not $taskText.Contains($taskBroken) -or -not $taskText.EndsWith("`n`n")) {
                    throw 'The diagnosed changes were not found. No HTML was written.'
                }
                $taskText = $taskText.Replace($taskBroken, $taskCorrect)
                $taskText = $taskText.Substring(0, $taskText.Length - 2)
                [byte[]]$taskBytes = $taskEncoding.GetPreamble() + $taskEncoding.GetBytes($taskText)
                $taskHash = [BitConverter]::ToString($taskHasher.ComputeHash($taskBytes)).Replace('-', '')
            }
            if ($taskHash -ne $taskPartHash) {
                throw 'Part 01 does not match the diagnosed file or the original. No HTML was written.'
            }
        }
        $taskBuffer.Write($taskBytes, 0, $taskBytes.Length)
    }
    $taskMerged = $taskBuffer.ToArray()
    $taskHash = [BitConverter]::ToString($taskHasher.ComputeHash($taskMerged)).Replace('-', '')
    if ($taskHash -ne $taskFullHash) { throw 'The full HTML checksum differs. No HTML was written.' }
    $taskOutput = [IO.File]::Open($taskTarget, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try { $taskOutput.Write($taskMerged, 0, $taskMerged.Length) }
    finally { $taskOutput.Dispose() }
    Write-Output "Saved: $taskTarget"
    Write-Output "SHA256: $taskHash"
    Write-Output 'All eight original TXT files were preserved.'
} finally {
    $taskHasher.Dispose()
    $taskBuffer.Dispose()
}
