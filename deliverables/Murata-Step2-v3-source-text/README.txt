Murata 第二步：规格整理工具 v3

本版合并两项修正：
1. 识别 NRND，保留不推荐用于新设计的选型警告。
2. 识别尺寸非对称公差，如 1.5mm +0mm/-0.3mm。核对标称尺寸，公差原文保留在核对明细。

缺失电压继续待核查，不从料号猜值。所有修正已通过个人电脑合成数据测试，公司效果以新报告为准。

把 Convert-MurataDatabase.ps1.txt 保存为公司桌面 Convert-MurataDatabase.ps1，替换旧版本，保留 UTF-8 BOM 编码。
运行：
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Convert-MurataDatabase.ps1"

使用之前采集的样本，不需要重新扫描原数据库，不加 -Mode Full。
打开桌面 Murata_Normalized 最新 normalize-* 文件夹里的 local-normalization-report.html。
旧目录保留。NRND 选型提醒仍会计入待核查，所以待核查数量不一定为零。
如果仍有文字格式问题，可再次运行桌面的 Review-MurataNormalization.ps1 查看最新详情。

本工具不联网、不上传公司数据，不修改原数据库。报价 Excel 功能仍在融合全部完成后最后做。