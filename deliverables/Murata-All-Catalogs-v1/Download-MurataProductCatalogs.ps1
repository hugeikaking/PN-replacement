#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$CategoriesFile = '',
    [ValidateRange(1,1000)][int]$ExpectedCategoryCount = 73,
    [ValidateSet('zh','en','ja')][string]$Language = 'zh',
    [string]$OutputRoot = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Murata_Product_Archives'),
    [ValidatePattern('^[A-Za-z][A-Za-z0-9]*$')][string]$UrlField = 'ProductDataDownloadUrl',
    [ValidateRange(2,60)][int]$IntervalSeconds = 2,
    [switch]$LibraryOnly
)
$ErrorActionPreference = 'Stop'

function Read-MurataCategories([string]$Path, [int]$ExpectedCount) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'Category list file not found.' }
    if ((Get-Item -LiteralPath $Path).Length -gt 1048576) { throw 'Category list exceeds 1 MB.' }
    $utf8 = New-Object Text.UTF8Encoding($false, $true)
    try { $content = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path).Path, $utf8) }
    catch { throw 'Cannot read category list as UTF-8.' }
    $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $items = New-Object 'Collections.Generic.List[string]'
    foreach ($line in ($content -split '\r?\n')) {
        $id = $line.Trim()
        if ($id.Length -eq 0 -or $id.StartsWith('#')) { continue }
        if ($id -notmatch '^[A-Za-z0-9][A-Za-z0-9]{0,119}$') { throw 'Invalid category ID. Use one official ID per line, without labels.' }
        if (-not $seen.Add($id)) { throw "Duplicate category ID: $id" }
        $items.Add($id)
    }
    if ($items.Count -ne $ExpectedCount) {
        throw "Expected $ExpectedCount category IDs; found $($items.Count). No request was sent."
    }
    return $items.ToArray()
}

function Get-MurataDownloadUri($Response, [string]$Field) {
    $property = $Response.PSObject.Properties[$Field]
    if ($null -eq $property -or $property.Value -isnot [string]) {
        throw "API response is missing the string field $Field. Confirm the v3 manual; do not guess a URL."
    }
    return (Assert-MurataHttpsUri $property.Value)
}

function Assert-MurataHttpsUri([string]$Value) {
    $uri = $null
    if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -ne 'https' -or $uri.UserInfo.Length -gt 0) {
        throw 'Download URL must be an absolute HTTPS URL without embedded credentials.'
    }
    return $uri
}

function New-MurataRequest([Uri]$Uri, [string]$Key = '') {
    $request = [Net.HttpWebRequest]::Create($Uri)
    $request.Method = 'GET'
    $request.AllowAutoRedirect = $false
    $request.Timeout = 60000
    $request.ReadWriteTimeout = 120000
    $request.UserAgent = 'Murata-Catalog-Archiver/1.0'
    $request.AutomaticDecompression = [Net.DecompressionMethods]::GZip -bor [Net.DecompressionMethods]::Deflate
    if ($Key.Length -gt 0) {
        if ($Uri.Scheme -ne 'https' -or $Uri.Host -ne 'api.murata.com' -or
            $Uri.AbsolutePath -ne '/v3/products/getproductdatadownloadurl') {
            throw 'API key may only be sent to the configured Murata v3 endpoint.'
        }
        $request.Headers.Add('x-api-key', $Key)
    }
    return $request
}

function Throw-MurataHttpError($Exception) {
    while ($null -ne $Exception.InnerException) { $Exception = $Exception.InnerException }
    $code = 0; $delay = 0
    if ($Exception -is [Net.WebException] -and $null -ne $Exception.Response) {
        try {
            $code = [int]$Exception.Response.StatusCode
            $retry = $Exception.Response.Headers['Retry-After']
            $seconds = 0
            if ([int]::TryParse($retry, [ref]$seconds)) { $delay = [Math]::Min(60, [Math]::Max(0, $seconds)) }
        } finally { $Exception.Response.Close() }
    }
    # Never include raw exception messages: signed URLs can appear in them.
    $safe = New-Object InvalidOperationException('HTTP request failed. See the numeric status in the manifest.')
    $safe.Data['HttpStatus'] = $code
    $safe.Data['RetrySeconds'] = $delay
    throw $safe
}

function Invoke-MurataRetry([scriptblock]$Action) {
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try { return (& $Action) }
        catch {
            $status = $_.Exception.Data['HttpStatus']
            $transient = $null -ne $status -and ($status -eq 0 -or $status -eq 429 -or $status -ge 500)
            if (-not $transient -or $attempt -eq 3) { throw }
            $delay = [Math]::Max(2 * $attempt, [int]$_.Exception.Data['RetrySeconds'])
            Write-Host "Temporary request failure; retry $($attempt + 1)/3 in $delay seconds."
            Start-Sleep -Seconds $delay
        }
    }
}

function Request-MurataCatalogUri([string]$Category, [string]$Lang, [string]$Key, [string]$Field) {
    $address = 'https://api.murata.com/v3/products/getproductdatadownloadurl?category=' +
        [Uri]::EscapeDataString($Category) + '&lang=' + [Uri]::EscapeDataString($Lang)
    $request = New-MurataRequest ([Uri]$address) $Key
    $response = $null; $stream = $null; $buffer = $null
    try {
        try { $response = $request.GetResponse() } catch { Throw-MurataHttpError $_.Exception }
        if ([int]$response.StatusCode -ne 200) { throw 'API endpoint did not return HTTP 200; API redirects are not followed.' }
        $stream = $response.GetResponseStream()
        $buffer = New-Object IO.MemoryStream
        $chunk = New-Object byte[] 8192
        while (($count = $stream.Read($chunk, 0, $chunk.Length)) -gt 0) {
            if ($buffer.Length + $count -gt 1048576) { throw 'API response exceeds the 1 MB metadata limit.' }
            $buffer.Write($chunk, 0, $count)
        }
        $utf8 = New-Object Text.UTF8Encoding($false, $true)
        try { $data = $utf8.GetString($buffer.ToArray()).TrimStart([char]0xfeff) | ConvertFrom-Json }
        catch { throw 'API metadata was not valid UTF-8 JSON.' }
        return (Get-MurataDownloadUri $data $Field)
    } finally {
        if ($null -ne $stream) { $stream.Dispose() }
        if ($null -ne $buffer) { $buffer.Dispose() }
        if ($null -ne $response) { $response.Close() }
        $request.Headers.Remove('x-api-key')
        $Key = $null
    }
}

function Save-MurataRawDownload([Uri]$Uri, [string]$PartialPath) {
    $current = $Uri
    for ($redirect = 0; $redirect -le 5; $redirect++) {
        # The file host receives no API key, even if it redirects.
        $request = New-MurataRequest $current
        $response = $null; $inputStream = $null; $outputStream = $null
        try {
            try { $response = $request.GetResponse() } catch { Throw-MurataHttpError $_.Exception }
            $status = [int]$response.StatusCode
            if ($status -in @(301,302,303,307,308)) {
                if ($redirect -eq 5) { throw 'Download exceeded five HTTPS redirects.' }
                $next = New-Object Uri($current, $response.Headers['Location'])
                $current = Assert-MurataHttpsUri $next.AbsoluteUri
                continue
            }
            if ($status -ne 200) { throw 'Download did not return HTTP 200.' }
            $inputStream = $response.GetResponseStream()
            $outputStream = [IO.File]::Open($PartialPath, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
            $chunk = New-Object byte[] 1048576
            $lastUpdate = [DateTime]::UtcNow
            while (($count = $inputStream.Read($chunk, 0, $chunk.Length)) -gt 0) {
                $outputStream.Write($chunk, 0, $count)
                if (([DateTime]::UtcNow - $lastUpdate).TotalSeconds -ge 30) {
                    Write-Host ('Downloaded {0:N1} MB...' -f ($outputStream.Length / 1MB))
                    $lastUpdate = [DateTime]::UtcNow
                }
            }
            return
        } catch {
            if ($_.Exception -is [Net.WebException]) { Throw-MurataHttpError $_.Exception }
            throw
        } finally {
            if ($null -ne $inputStream) { $inputStream.Dispose() }
            if ($null -ne $outputStream) { $outputStream.Dispose() }
            if ($null -ne $response) { $response.Close() }
        }
    }
}

function Test-MurataRawJson([string]$Path) {
    # A bounded streaming parser, including required closing delimiters and EOF.
    # Some .NET JSON readers tolerate truncated containers, so do not use them here.
    if (-not ('MurataArchiveV1.JsonSyntax' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
namespace MurataArchiveV1 {
    public sealed class JsonSyntax {
        private readonly TextReader r;
        private int c;
        private JsonSyntax(TextReader reader) { r = reader; c = r.Read(); }
        private void Next() { c = r.Read(); }
        private void Bad() { throw new FormatException("Invalid JSON syntax."); }
        private void Ws() { while (c == 32 || c == 9 || c == 10 || c == 13) Next(); }
        private bool Digit() { return c >= 48 && c <= 57; }
        private void Need(int expected) { if (c != expected) Bad(); Next(); }
        private void Literal(string s) { foreach (char ch in s) Need(ch); }
        private void StringToken() {
            Need(34);
            while (c != 34) {
                if (c < 32) Bad();
                if (c == 92) {
                    Next();
                    if (c == 117) {
                        for (int i = 0; i < 4; i++) {
                            Next();
                            if (!(Digit() || (c >= 65 && c <= 70) || (c >= 97 && c <= 102))) Bad();
                        }
                    } else if (!(c == 34 || c == 92 || c == 47 || c == 98 || c == 102 || c == 110 || c == 114 || c == 116)) Bad();
                }
                Next();
            }
            Next();
        }
        private void Number() {
            if (c == 45) Next();
            if (c == 48) Next();
            else {
                if (!(c >= 49 && c <= 57)) Bad();
                do { Next(); } while (Digit());
            }
            if (c == 46) { Next(); if (!Digit()) Bad(); do { Next(); } while (Digit()); }
            if (c == 101 || c == 69) {
                Next(); if (c == 43 || c == 45) Next();
                if (!Digit()) Bad(); do { Next(); } while (Digit());
            }
        }
        private void Value(int depth) {
            if (depth > 256) Bad();
            Ws();
            if (c == 123) {
                Next(); Ws();
                if (c == 125) { Next(); return; }
                while (true) {
                    StringToken(); Ws(); Need(58); Value(depth + 1); Ws();
                    if (c == 125) { Next(); return; }
                    Need(44); Ws();
                }
            }
            if (c == 91) {
                Next(); Ws();
                if (c == 93) { Next(); return; }
                while (true) {
                    Value(depth + 1); Ws();
                    if (c == 93) { Next(); return; }
                    Need(44); Ws();
                }
            }
            if (c == 34) { StringToken(); return; }
            if (c == 116) { Literal("true"); return; }
            if (c == 102) { Literal("false"); return; }
            if (c == 110) { Literal("null"); return; }
            if (c == 45 || Digit()) { Number(); return; }
            Bad();
        }
        public static void Validate(string path) {
            using (FileStream stream = File.OpenRead(path)) {
                byte[] prefix = new byte[3];
                int count = stream.Read(prefix, 0, 3);
                stream.Position = count == 3 && prefix[0] == 239 && prefix[1] == 187 && prefix[2] == 191 ? 3 : 0;
                using (StreamReader reader = new StreamReader(stream, new UTF8Encoding(false, true), false, 65536)) {
                    JsonSyntax p = new JsonSyntax(reader);
                    p.Ws();
                    if (p.c != 123 && p.c != 91) p.Bad();
                    p.Value(0); p.Ws();
                    if (p.c != -1) p.Bad();
                }
            }
        }
    }
}
'@
    }
    try { [MurataArchiveV1.JsonSyntax]::Validate($Path) }
    catch { throw 'Downloaded file failed streaming UTF-8 JSON validation; it remains a .partial file.' }
}

function Write-MurataJson([string]$Path, $Value, [switch]$Append) {
    $utf8 = New-Object Text.UTF8Encoding($false)
    $text = ($Value | ConvertTo-Json -Depth 8 -Compress) + [Environment]::NewLine
    if ($Append) { [IO.File]::AppendAllText($Path, $text, $utf8) }
    else { [IO.File]::WriteAllText($Path, $text, $utf8) }
}

function Start-MurataCatalogArchive {
    if ([string]::IsNullOrWhiteSpace($CategoriesFile)) { throw 'Supply -CategoriesFile with official v3 category IDs. No request was sent.' }
    $categories = @(Read-MurataCategories $CategoriesFile $ExpectedCategoryCount)
    $root = [IO.Path]::GetFullPath($OutputRoot)
    $runPath = Join-Path $root ('download-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
    if (Test-Path -LiteralPath $runPath) { throw 'Output run directory already exists.' }
    [void][IO.Directory]::CreateDirectory($runPath)
    $manifestPath = Join-Path $runPath 'download-manifest.jsonl'
    $metadataPath = Join-Path $runPath 'run-summary.json'
    $summary = [ordered]@{
        toolVersion = '1.0'; apiVersion = 'v3'; language = $Language
        requestedCategories = $categories; expectedCategoryCount = $ExpectedCategoryCount
        urlField = $UrlField; startedAtUtc = [DateTime]::UtcNow.ToString('o')
        endedAtUtc = $null; successful = 0; failed = 0; notAttempted = $categories.Count
        state = 'in-progress'; allRequestedFilesDownloaded = $false
        productSchemaVerified = $false; translationReady = $false
    }
    Write-MurataJson $metadataPath $summary
    $secure = $null; $key = $null
    try {
        $secure = Read-Host 'Enter API key on this company PC (hidden; never saved)' -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        if ([string]::IsNullOrWhiteSpace($key)) { throw 'API key is empty.' }
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        for ($index = 0; $index -lt $categories.Count; $index++) {
            if ($index -gt 0) { Start-Sleep -Seconds $IntervalSeconds }
            $category = $categories[$index]
            $name = $category + '-' + $Language + '.json'
            $destination = Join-Path $runPath $name
            $partial = $destination + '.partial'
            $record = [ordered]@{
                category = $category; language = $Language; filename = $name
                startedAtUtc = [DateTime]::UtcNow.ToString('o'); endedAtUtc = $null
                state = 'failed'; stage = 'request-url'; httpStatus = $null
                bytes = $null; sha256 = $null; jsonSyntaxChecked = $false
            }
            $stopForAuth = $false; $downloadUri = $null
            Write-Host "[$($index + 1)/$($categories.Count)] $category"
            try {
                $downloadUri = Invoke-MurataRetry { Request-MurataCatalogUri $category $Language $key $UrlField }
                $record.stage = 'download'
                Invoke-MurataRetry { Save-MurataRawDownload $downloadUri $partial }
                $record.stage = 'validate-json'
                Test-MurataRawJson $partial
                $record.jsonSyntaxChecked = $true
                $record.bytes = (Get-Item -LiteralPath $partial).Length
                $record.sha256 = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash
                $record.stage = 'publish-file'
                # File.Move refuses to overwrite. Raw file bytes are never reserialized.
                [IO.File]::Move($partial, $destination)
                $record.state = 'downloaded'
                $summary.successful++
                Write-Host "Saved $name ($($record.bytes) bytes)."
            } catch {
                $record.httpStatus = $_.Exception.Data['HttpStatus']
                $stopForAuth = $record.stage -eq 'request-url' -and $record.httpStatus -in @(401,403)
                $summary.failed++
                Write-Host "Failed: $category; stage=$($record.stage); HTTP=$($record.httpStatus)."
                if ($record.stage -eq 'request-url' -and $null -eq $record.httpStatus) {
                    Write-Host "Confirm the response field '$UrlField' against your v3 manual and check the network."
                }
            } finally {
                $downloadUri = $null
                $record.endedAtUtc = [DateTime]::UtcNow.ToString('o')
                Write-MurataJson $manifestPath $record -Append
                $summary.notAttempted = $categories.Count - $summary.successful - $summary.failed
                Write-MurataJson $metadataPath $summary
            }
            if ($stopForAuth) { Write-Host 'Stopped after API HTTP 401/403. Check key/access on this company PC.'; break }
        }
        $summary.allRequestedFilesDownloaded = $summary.successful -eq $categories.Count
        $summary.state = 'partial'
        if ($summary.allRequestedFilesDownloaded) { $summary.state = 'all-requested-files-downloaded' }
    } finally {
        $key = $null
        if ($null -ne $secure) { $secure.Dispose() }
        $summary.endedAtUtc = [DateTime]::UtcNow.ToString('o')
        if ($summary.state -eq 'in-progress') { $summary.state = 'interrupted' }
        Write-MurataJson $metadataPath $summary
        Write-Host "Archive: $runPath"
        Write-Host "Downloaded=$($summary.successful); failed=$($summary.failed); not attempted=$($summary.notAttempted)."
        Write-Host 'Archive only: product schema and translator integration have not been verified.'
    }
    return [pscustomobject]@{ RunDirectory = $runPath; Summary = [pscustomobject]$summary }
}

if (-not $LibraryOnly) { Start-MurataCatalogArchive }
