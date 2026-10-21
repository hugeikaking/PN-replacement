Murata 第二步：规格整理工具 v2

本版新增识别公司照片确认的 NRND 状态，分类为 nrnd，保留“不推荐用于新设计，需选型确认”的警告。不会改为正常生产。
已通过个人电脑合成数据测试；公司实际数据尚待运行新版。

先查看现有详情报告下方的规格文字和电压样例，合并剩余修正后再重新运行样本整理。不需要仅为 NRND 单独重跑，不要先运行 Full。

需要运行时：将 Convert-MurataDatabase.ps1.txt 保存到公司桌面为 Convert-MurataDatabase.ps1，保留 UTF-8 BOM 编码。
命令：
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Convert-MurataDatabase.ps1"

默认读取之前检查的样本，另存桌面 Murata_Normalized 的新 normalize-* 目录，不改变旧结果。
本工具不联网、不上传公司数据。详细说明见 docs/MURATA_STEP2.md。