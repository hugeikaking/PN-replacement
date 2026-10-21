# v2.5 原始网页文本分片

共 8 个 TXT，编号 01–08。每份约 64KB，内容为原网页的连续片段，没有添加标题、编号、额外换行或编码包装。分片各自是有效 UTF-8 文本，但不是独立网页；必须按顺序合并全部文件才可运行。原 HTML 保留。

请通过公司允许的渠道传入这些文件。分片本身不能保证邮箱接受；若仍拒绝，请由 IT 审核并指定传输方式。复制邮件正文或重新保存文本可能改变引号、换行及 BOM，下面的校验会拒绝有差异的文件。

## 合并

把 8 个 TXT 放入同一个文件夹。在这个文件夹的地址栏输入 `powershell` 并回车，然后粘贴运行以下命令。命令只读取当前文件夹的 8 个分片，校验成功后生成新的 `Passive-PN-Translator-v2_5.html`，不覆盖已有网页，不联网。

```powershell
$taskPartsFolder = (Get-Location).Path
$taskTarget = Join-Path $taskPartsFolder 'Passive-PN-Translator-v2_5.html'
$taskExpectedHash = '38D3F770CC495595468D1A0BD93B53070FDEE55454161E3D76A80EEAE21359DC'
$taskBuffer = New-Object IO.MemoryStream
$taskHasher = [Security.Cryptography.SHA256]::Create()
try {
    foreach ($taskIndex in 1..8) {
        $taskName = 'Passive-PN-Translator-v2_5-part-{0:D2}.txt' -f $taskIndex
        $taskPartPath = Join-Path $taskPartsFolder $taskName
        if (-not (Test-Path -LiteralPath $taskPartPath -PathType Leaf)) {
            throw "Missing file: $taskName"
        }
        $taskBytes = [IO.File]::ReadAllBytes($taskPartPath)
        $taskBuffer.Write($taskBytes, 0, $taskBytes.Length)
    }
    $taskMergedBytes = $taskBuffer.ToArray()
    $taskHash = [BitConverter]::ToString($taskHasher.ComputeHash($taskMergedBytes)).Replace('-', '')
    if ($taskHash -ne $taskExpectedHash) {
        throw 'Integrity check failed. No HTML was written. Check all eight original TXT files.'
    }
    $taskOutput = [IO.File]::Open($taskTarget, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try { $taskOutput.Write($taskMergedBytes, 0, $taskMergedBytes.Length) }
    finally { $taskOutput.Dispose() }
    Write-Output "Saved: $taskTarget"
    Write-Output "SHA256: $taskHash"
} finally {
    $taskHasher.Dispose()
    $taskBuffer.Dispose()
}
```

成功后双击 HTML，沿用公司已有的 normalization-summary.json 和 normalized-products.jsonl。本地已按编号重新读取并合并验证：509010 字节，SHA256 与原件完全一致。文件内容没有包含公司数据库或 API 密钥；不是完整产品目录更新，也不改变浏览器或邮件安全设置。
