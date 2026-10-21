Murata 第二步：规格整理工具 v1

通过公司允许的方式把 Convert-MurataDatabase.ps1 传到公司桌面。
如使用标为 .ps1.txt 的源码审阅副本，仅在公司允许传入和执行脚本后保存为对应 .ps1 文件；保留 UTF-8 BOM 编码，确保扩展名不是 .ps1.txt。
只有这一份脚本，不需要压缩包、Node、Python 或 API Key。

先运行样本整理：
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Convert-MurataDatabase.ps1"

默认收集已有 Murata_Data_Check 各次检查中相同源快照的 selected-products.jsonl，包含此前预览和系列样本。
会去掉相同产品的重复记录。不要删除或修改原数据库、旧检查目录。

结果在桌面 Murata_Normalized 的新 normalize-* 文件夹。
打开 local-normalization-report.html 查看统计，review-products.jsonl 和 issues.jsonl 是待核查明细。
原值和核对过程单独保存在 normalization-audit.jsonl，查询用数据在 normalized-products.jsonl。
normalized-preview.csv 可用于查看，导入封装列应设为文本，避免软件丢失前导零。

数字和文字对不上、字段缺失、格式暂时不能识别时，会保持待核查，不猜值。
consistent 仅表示所校验字段一致，不代表公司、规格书和生命周期已全面验收。
运行报错/Completed=false 时不要把该目录作为正式索引。

本版先在个人电脑上用合成数据测试，公司实际数据需要本地运行核对。
先做默认样本整理；样本问题确认后，才考虑 -Mode Full 全库处理。
遵守公司 IT 的传入与执行流程；本工具不联网，也不上传公司数据。
