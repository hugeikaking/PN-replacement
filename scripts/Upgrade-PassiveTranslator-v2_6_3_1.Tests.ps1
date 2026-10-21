$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskRelease = Join-Path $taskRoot 'deliverables\Murata-Step6-v2_6_3_1-offline'
$taskBase = Join-Path $taskRoot 'deliverables\Murata-Step6-v2_6_3-offline\Passive-PN-Translator-v2_6_3.html'
$taskExpectedHash = '3CFC3B7DAD5780CBF26287094B5C3E3F2ED5A9AF7A7A868986AD49C6108FF259'
$taskFixtureRoot = Join-Path $PSScriptRoot ('.upgrade-tests-' + [Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $taskFixtureRoot)
$taskPassed = 0

function New-TaskFixture([string]$Name) {
    $taskDir = Join-Path $taskFixtureRoot $Name
    [void](New-Item -ItemType Directory -Path $taskDir)
    Copy-Item -LiteralPath (Join-Path $taskRelease 'Upgrade-PassiveTranslator-v2_6_3_1.ps1') -Destination $taskDir
    Copy-Item -LiteralPath (Join-Path $taskRelease 'Passive-PN-Translator-v2_6_3-to-v2_6_3_1.patch.json') -Destination $taskDir
    Copy-Item -LiteralPath $taskBase -Destination (Join-Path $taskDir 'Passive-PN-Translator-v2_6_3-restored.html')
    return $taskDir
}
function Assert-Task([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "Assertion failed: $Message" }
    $script:taskPassed++
}
function Invoke-TaskFailure([string]$Folder, [string]$Expected, [string]$InputPath = '') {
    $taskFailed = $false
    try {
        if ($InputPath) { & (Join-Path $Folder 'Upgrade-PassiveTranslator-v2_6_3_1.ps1') -HtmlPath $InputPath | Out-Null }
        else { & (Join-Path $Folder 'Upgrade-PassiveTranslator-v2_6_3_1.ps1') | Out-Null }
    } catch {
        $taskFailed = $true
        Assert-Task ($_.Exception.Message.Contains($Expected)) "Expected failure: $Expected; received: $($_.Exception.Message)"
    }
    Assert-Task $taskFailed 'Must refuse this input'
}

try {
    $taskDir = New-TaskFixture ('unicode-' + [char]0x516C + [char]0x53F8 + ' path')
    $taskOriginal = Join-Path $taskDir 'Passive-PN-Translator-v2_6_3-restored.html'
    $taskOriginalHash = (Get-FileHash -LiteralPath $taskOriginal -Algorithm SHA256).Hash
    & (Join-Path $taskDir 'Upgrade-PassiveTranslator-v2_6_3_1.ps1') | Out-Null
    $taskOutput = Join-Path $taskDir 'Passive-PN-Translator-v2_6_3_1.html'
    Assert-Task ((Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256).Hash -eq $taskExpectedHash) 'Output exactly equals reviewed v2.6.3.1'
    Assert-Task ((Get-FileHash -LiteralPath $taskOriginal -Algorithm SHA256).Hash -eq $taskOriginalHash) 'Original preserved'
    Invoke-TaskFailure $taskDir 'already exists'
    Assert-Task ((Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256).Hash -eq $taskExpectedHash) 'Existing output preserved'

    $taskDir = New-TaskFixture 'explicit-path'
    $taskOriginal = Join-Path $taskDir 'Passive-PN-Translator-v2_6_3-restored.html'
    $taskRenamed = Join-Path $taskDir 'working-page.html'
    Move-Item -LiteralPath $taskOriginal -Destination $taskRenamed
    & (Join-Path $taskDir 'Upgrade-PassiveTranslator-v2_6_3_1.ps1') -HtmlPath $taskRenamed | Out-Null
    Assert-Task ((Get-FileHash -LiteralPath (Join-Path $taskDir 'Passive-PN-Translator-v2_6_3_1.html') -Algorithm SHA256).Hash -eq $taskExpectedHash) 'Explicit renamed input supported'

    $taskDir = New-TaskFixture 'damaged-base'
    $taskOriginal = Join-Path $taskDir 'Passive-PN-Translator-v2_6_3-restored.html'
    $taskBytes = [IO.File]::ReadAllBytes($taskOriginal)
    $taskBytes[400] = $taskBytes[400] -bxor 1
    [IO.File]::WriteAllBytes($taskOriginal, $taskBytes)
    Invoke-TaskFailure $taskDir 'differs from the original' $taskOriginal
    Assert-Task (-not (Test-Path -LiteralPath (Join-Path $taskDir 'Passive-PN-Translator-v2_6_3_1.html'))) 'Damaged base writes nothing'

    $taskDir = New-TaskFixture 'damaged-patch'
    $taskPatch = Join-Path $taskDir 'Passive-PN-Translator-v2_6_3-to-v2_6_3_1.patch.json'
    [IO.File]::AppendAllText($taskPatch, ' ')
    Invoke-TaskFailure $taskDir 'Patch integrity check failed'
    Assert-Task (-not (Test-Path -LiteralPath (Join-Path $taskDir 'Passive-PN-Translator-v2_6_3_1.html'))) 'Changed patch writes nothing'

    $taskDir = New-TaskFixture 'missing-patch'
    Remove-Item -LiteralPath (Join-Path $taskDir 'Passive-PN-Translator-v2_6_3-to-v2_6_3_1.patch.json')
    Invoke-TaskFailure $taskDir 'patch JSON must be in the same folder'

    $taskDir = New-TaskFixture 'ambiguous-input'
    Copy-Item -LiteralPath $taskBase -Destination (Join-Path $taskDir 'second.html')
    Invoke-TaskFailure $taskDir 'More than one v2.6.3 HTML'
    Assert-Task (-not (Test-Path -LiteralPath (Join-Path $taskDir 'Passive-PN-Translator-v2_6_3_1.html'))) 'Ambiguous input writes nothing'

    $taskDir = New-TaskFixture 'missing-input'
    Remove-Item -LiteralPath (Join-Path $taskDir 'Passive-PN-Translator-v2_6_3-restored.html')
    Invoke-TaskFailure $taskDir 'No original v2.6.3 HTML'
    Write-Output "PASS: $taskPassed upgrade checks; PowerShell $($PSVersionTable.PSVersion). No network or company product files used."
} finally {
    $taskResolvedFixture = [IO.Path]::GetFullPath($taskFixtureRoot)
    $taskAllowedParent = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
    if (-not $taskResolvedFixture.StartsWith($taskAllowedParent, [StringComparison]::OrdinalIgnoreCase) -or
        -not ([IO.Path]::GetFileName($taskResolvedFixture)).StartsWith('.upgrade-tests-')) {
        throw 'Refusing fixture cleanup outside the verified scripts directory.'
    }
    Remove-Item -LiteralPath $taskResolvedFixture -Recurse -Force
}
