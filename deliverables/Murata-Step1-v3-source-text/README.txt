Murata 第一步工具 v3 — PowerShell 脚本源码文本

这些文件明确包含 PowerShell 源码，供审阅和通过公司批准的渠道传入。
文本形式不意味着公司邮箱必然允许接收，也不替代公司对脚本使用的审批。
若公司限制脚本源码，请由 IT 确认允许的文件交换和执行方式。

本机核对：三个文本文件与 v3 原始 .ps1 源码完全一致，没有加密、混淆或内容隐藏。
原脚本已在本机 Windows PowerShell 5 上用合成数据测试。

在公司允许传入并运行这些脚本的前提下：
1. 把三个文件放在公司桌面 Murata-Step1-v3 文件夹。
2. 用记事本分别另存为对应的 .ps1 名称，编码选择 UTF-8；文件类型选择“所有文件”。
   Test-MurataDatabase.ps1.txt -> Test-MurataDatabase.ps1
   Review-MurataDataCheck.ps1.txt -> Review-MurataDataCheck.ps1
   Continue-MurataDataCheck.ps1.txt -> Continue-MurataDataCheck.ps1
   Windows PowerShell 5 的中文脚本需要 UTF-8 BOM；若保存工具不能保留，请使用 IT 批准的原始脚本文件。
3. 三个 .ps1 文件必须放在同一个目录。
4. 运行：
   powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Murata-Step1-v3\Continue-MurataDataCheck.ps1"

按公司批准方式执行；不要修改全局执行策略。
自动读取公司本机之前的报告，从上次结束处续查 GRM/KRM，再生成本机 HTML 报告。
不需要 API Key，不联网，不上传数据库，旧报告保留。