Murata 待核查详情工具

已有规格整理结果后使用，不需要重新扫描或整理数据库。

把 Review-MurataNormalization.ps1.txt 保存到公司桌面，文件名为 Review-MurataNormalization.ps1，保留 UTF-8 BOM 编码。

运行：
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Review-MurataNormalization.ps1"

默认读取桌面 Murata_Normalized 中最新的 normalize-* 结果目录。
在同一结果目录生成 local-normalization-details-时间-编号.html，双击打开。

重点看：
1. 生命周期状态原文：列出实际状态和次数，未映射不等于产品错误。
2. 按字段分组的异常样例：列出无法识别的原数字和规格文字，每组最多三个不同组合。
3. 没有可核对电压：分别展示 DC、AC、X1/X2/Y1/Y2 字段，不能互相替代。

如需指定结果目录：
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Review-MurataNormalization.ps1" -RunDirectory "C:\实际路径\Murata_Normalized\normalize-实际目录"

只读取 normalization-summary.json、issues.jsonl、normalization-audit.jsonl，另存 HTML；不改变原文件、统一规格或验收标志。不联网，不上传公司数据。

同一产品可能有多个问题，问题次数不能相加当作产品数量。确认原文之前不要直接把所有状态映射为正常生产，也不要先运行全库整理。