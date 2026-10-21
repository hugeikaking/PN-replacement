# 2026-10-05：三星第一条无村田候选的覆盖核查

公司用户提供 SimSurfing 与第四步 v2.2 的截图。网页成功解析“三星 MLCC 0402 X7R 100nF ±10% 16V”，导入2011条、可查询2011条（包括NRND/review，排除缺失/冲突料号）。100nF单独26条，加入英制0402累计4条，加入X7R累计0条；后续精度与电压累计均0。说明当前样本没有同时满足已识别条件的记录，不是本次厂商前缀或参数顺序解析错误。

SimSurfing 截图显示6个目前生产的型号，规格100nF / 0402 / X7R / ±10% / DC16V。截图型号不含包装后缀：GRT155R71C104KE01、GGM155R71C104KA55、GCH155R71C104KE01、GCM155R71C104KA55、GRM155R71C104KA88、GCM155R71C104KA40。个人电脑未读取公司原库，尚不能断言原始JSON收录它们，也未确认其完整包装料号。

新增 scripts/Expand-MurataQueryData.ps1，交付 deliverables/Murata-Coverage-v1/ 同名脚本与README。生成器 scripts/build-coverage-expander.mjs 从现有v3.1转换器生成独立单文件工具，原转换器不变。默认保留相同原库快照的已完成检查样本，并流式扫描整个原库Products数组，补入原始文字100nF（含0.1uF等）且英制0402的所有记录，以及上述6个型号前缀的记录。选择时不限制温度、电压和精度；规范化与网页正式匹配仍严格核对全部条件。

新版工具 v3.2-coverage 输出新 normalize-时间-编号 目录，原库和旧结果保留。仍是子集：mode=CheckedSamples、fullDatabaseRead=false；另记 selection.rawRecordsScanned/rawScanCompleted/selectedSourceRows/referenceCounts/referenceExamples。扫描至结尾不等于全部产品导入。新 local-coverage-report.html 显示原库6个前缀的记录数和实际完整料号示例。无网络调用、无猜补包装码、保留原字段审计、NRND/未知与冲突隔离。若原库快照不匹配、扫描未完成、输出超128MB/100000条，不能作为已完成文件导入。

公司在原库和Murata_Data_Check目录保持原位置的情况下，将单文件脚本通过批准渠道放桌面，运行：

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Expand-MurataQueryData.ps1"
```

然后在现有v2.2网页导入本次新目录的 normalization-summary.json 与 normalized-products.jsonl，并重新查询三星描述或CL05B104KO5NNNC。此扩展只针对本次100nF/0402与6个型号核查，不保证太阳诱电4.7uF等其他规格已覆盖，也不替代后续全产品目录部署和API更新。

本机实际执行PowerShell5合成测试：保留旧样本、扫描后续记录、6种前缀及等值容值文字、重复去除、错误数值不猜补、NRND和冲突隔离、严格电压匹配、原库字节未改变、快照不一致拒绝、原库尾部非法数据未完成拒绝。全部106项Vitest测试与vue-tsc通过；交付脚本与源码SHA256一致。未再次构建网页（本次未改网页源码），公司新工具尚未执行，不能宣称公司真实数据问题全部解决。API仍第六步，报价Excel仍最后；文件仅保存工作区，未声明Git提交或云端备份。
