Murata 规格整理工具 v3.1

本版包含 NRND 与厚度非对称公差修正，并在控制台和 HTML 上显示工具版本、实际运行脚本路径。

为避免仍运行旧文件，使用新的文件名：
将 Convert-MurataDatabase-v3_1.ps1.txt 保存到公司桌面，改名为 Convert-MurataDatabase-v3_1.ps1（只去掉最后的 .txt）。

运行这条新命令：
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Convert-MurataDatabase-v3_1.ps1"

开始时应该显示：
Murata normalization v3.1 (NRND + asymmetric mm tolerance)
Script: 后面应是桌面的 Convert-MurataDatabase-v3_1.ps1

正常结束后打开控制台 Saved normalized data and local report 后面目录中的 local-normalization-report.html。
顶部应显示“工具版本：v3.1（NRND 与非对称公差修正版）”。不要查看之前已打开的旧报告标签页。

默认使用已有检查样本；不重新扫描、不加 -Mode Full，不更改旧结果。
NRND 警告改为 lifecycle-nrnd，仍需选型确认。电压缺失继续待核查。
此前205次厚度格式问题是否全部消除，以公司新报告为准。

工具不联网，不上传公司数据；个人电脑合成测试已通过。