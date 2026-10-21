# 第四步 v2.3：应用筛选、标准与特征

网页：Passive-PN-Translator-v2_3.html。个人电脑的H5与公司离线网页使用同一套逻辑。本目录网页未包含任何产品记录，Applications-synthetic-test.png 仅是合成记录的界面截图，不是真实型号或公司数据。

## 使用

打开新版网页，照常导入同一次整理生成的 normalization-summary.json 和 normalized-products.jsonl。旧v3.1及覆盖补充工具的文件继续兼容，本次无需先重新整理或扫描公司数据库。完整产品目录的统一覆盖测试按用户安排留到完整目录接入之后。

输入框下方增加应用范围，可多选：

- 汽车[信息娱乐 / 舒适设备]
- 民用设备 / 工业设备
- 汽车[动力总成 / 安全设备]

全部不勾选时按民用设备 / 工业设备筛选。多选取并集：适用任一所选应用的料号可以显示。每条结果注明本次应用范围。两种翻译模式各自保留输入、结果与勾选状态。修改勾选后需点击查询，旧结果保留并提示“上次查询结果”；旧结果的显示更多也使用当时的筛选条件。清除当前输入和结果不重置应用选择。

应用未知的记录只放在默认折叠的核查组，不自动归为民用料，不包含在“正常生产料号”复制中。明确不符合所选应用的记录排除。

每个候选新增三个格子：应用、标准（安全规格）、特征。手机竖排，电脑三列。标准可显示原记录中的AEC-Q200、已核对的安全规格系列以及原记录中已核对的X/Y安规额定类别；特征显示High Q等已有资料信息。EIA/JIS温度特性标准不会当成安全认证；C0G也不会自动当成High Q。

## 信息依据

官方系列参考：https://www.murata.com/en-global/products/capacitor/ceramiccapacitor/overview/lineup ，本次核对日期2026-10-05。

本步核对并内置了GRM、GRT、GCM、GGM、GCH、KRM、DK1、GJM、GQM、GCQ、GA2、GA3、KCA、EVA的系列应用与部分标准/特征。没有校准的系列保持待确认，不按料号前缀猜归属。

有新记录Application原值时优先使用明确识别的原记录应用；未知编码/对象保持待确认，不用系列资料覆盖其原意。旧文件没保留Application时使用已核对的官方系列资料，卡片标明“村田官方系列资料”并提供出处链接。AEC-Q200不等于动力总成/安全应用，例如GRT不进入动力/安全结果；部分系列适用多个应用，重复勾选不会重复输出料号。

High Q等特征优先原记录Specs.Characteristics文字，其次已核对的系列资料；未校准的对象、代码、布尔值显示原值待解释，不猜为High Q。安全规格系列标签是系列信息，不代表具体型号认证、等级或公司验收完成，仍应核对实际规格书。

## 后续数据整理工具

同目录 Convert-MurataDatabase-v3_3.ps1 为独立单文件整理工具，新增保留 Application 和 Specs.Characteristics 原值，仍沿用v3.1的数字/文字核对、NRND和冲突隔离，产品schemaVersion仍1；旧v3.1转换器保留。默认仅整理现有检查样本，不自动扩大范围。

当前不必在公司重跑。以后整理新数据时，可把此脚本通过公司批准渠道放桌面并运行：

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Convert-MurataDatabase-v3_3.ps1"
```

原库、旧结果不覆盖；公司数据不外传。不改文件后缀绕过公司邮箱策略。完整目录接入与API仍按后续阶段实施，报价申请Excel自动填写最后做。

## 验证

112项单元与集成测试、类型检查及H5/离线构建通过。实际浏览器合成数据验证默认应用、单选、多选并集、两模式结果与选择保留、标准和High Q展示。实际PowerShell5输出验证新增原字段及审计文件、既有匹配兼容。没有使用公司完整产品目录测试，不宣称真实型号适用性或安全认证已验收。

开发：node scripts/build-classification-converter.mjs 生成v3.3整理工具，npm run build:official-preview 生成新版离线网页；分类资料位于 src/rules/murata/lineup-reference.json，解析与展示逻辑见 src/engine/official/classification.ts。新增文件保存工作区，未声明Git提交或云端备份。
