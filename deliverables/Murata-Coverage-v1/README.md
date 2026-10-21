# 补充三星第一条测试的村田数据覆盖

工具：Expand-MurataQueryData.ps1，版本 v3.2-coverage。单文件，可在公司 Windows PowerShell 5.1 运行，不需要安装 Node、Python 或 API Key。

## 为什么需要运行

此前导入的 2011 条是用来验证字段和单位的样本。公司网页诊断显示：100nF 有26条，再加英制0402剩4条，再加X7R剩0条。描述已正确识别，但导入样本缺少该组合。SimSurfing 截图有6个匹配型号，尚未确认公司原始 JSON 是否收录它们。

## 公司运行

1. 通过公司批准的渠道将本目录的 Expand-MurataQueryData.ps1 放到公司桌面。旧 Murata_Data_Check 文件夹和原始 Murata_MLCC.json 保持原位置；无需传出公司数据。
2. 在公司 PowerShell 运行：

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Expand-MurataQueryData.ps1"
```

默认从桌面 Murata_Data_Check 的最近一次 run-summary.json 找到原库路径，合并所有与该原库路径、大小、修改时间一致且已完成的检查样本，再扫描整个原库的 Products 数组。扫描可能需要数分钟；每3000条显示进度，没有原先20000条的扫描上限。等到显示 Saved normalized data and local report 和 Completed=True 再使用结果。

若默认找不到检查目录，可明确指定现有路径（用公司实际路径替换示例）：

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Expand-MurataQueryData.ps1" -InputPath "D:\数据库\Murata_MLCC.json" -CheckDirectory "$env:USERPROFILE\Desktop\Murata_Data_Check"
```

原库与检查样本必须来自同一个文件快照；若报告来源不一致，程序拒绝合并，不修改文件时间或伪造检查报告。原库更新后需先用现有 Test-MurataDatabase.ps1 对新版原库生成检查结果。

## 新结果

公司桌面 Murata_Normalized 会新增 normalize-时间-编号 文件夹。旧结果和原始数据库不会覆盖。

打开新文件夹的 local-coverage-report.html，查看截图中6个型号在原库的记录数与实际完整料号示例。型号前缀用于查找；包装后缀只取原库真实字段，程序不猜补。记录数包括不同包装或重复原始记录，不要求正好等于截图的6个型号数。

在现有第四步 v2.2 网页重新导入新文件夹中的以下两个文件：

- normalization-summary.json：本次整理的完成状态、记录数、来源、扫描与选择范围。
- normalized-products.jsonl：原样本加新增原库记录的规范规格与完整料号。

然后测试：

```text
三星 MLCC 0402 X7R 100nF ±10% 16V
```

或在料号模式输入 CL05B104KO5NNNC。

两个文件必须来自同一个新文件夹。无需换网页版本。重新导入会清除两模式旧查询结果、保留输入，再点查询即可。

## 保留的边界

只补入原库中“100nF + 英制0402”的所有温度、电压、精度记录，并额外保留截图6个型号前缀命中的记录。这能核查本次三星样例，仍然不是完整产品目录，也不保证其他规格（如太阳诱电4.7uF样例）已经覆盖。

来源选择按规格文字识别100nF（包括0.1uF等同值），整理仍要求数值与文字一致；冲突、缺失及NRND继续待核查。扫描完整不等于所有产品均导入，summary 的 fullDatabaseRead 仍为 false，原库扫描结果另记 selection.rawScanCompleted。

网页仍严格匹配，不自动放宽温度或电压。若原库没有截图型号，只能说明该原始文件未收录，不能说明官网不存在。若原库有记录而仍不匹配，可在公司本地查看 normalization-audit.jsonl 的原始字段与核对状态、issues.jsonl 的问题明细。

本工具只在公司本机读写，不调用网络；公司 API 接入仍在第六步，报价 Excel 自动填写仍最后做。

## 开发维护

源码生成器 scripts/build-coverage-expander.mjs 以现有 Convert-MurataDatabase.ps1 为基础，生成工作区脚本和本目录交付副本；原转换脚本不变。修改生成器后运行 node scripts/build-coverage-expander.mjs。合成数据回归在 tests/engine/official-coverage.test.ts，验证真正 PowerShell 输出能被现有 catalog/matcher 接受。
