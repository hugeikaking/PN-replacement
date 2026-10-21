# 第二步：统一规格字段（离线工具 v1）

2026-10-05。基于第一步 GRM/GCM/KRM/DK1 的用户自愿提供照片，候选数值单位为容值 F、尺寸 m、电压 V。每个字段仍须数值/Text 一致才归一化；工具不会把这些样本推断升级为全库保证。公司数据库及结果留在公司。

## 公司运行：先使用已有样本

只需一个独立脚本 scripts/Convert-MurataDatabase.ps1。它已内嵌流读取器，无需 Node、Python、第一步脚本或 API Key。通过公司允许的方式传入；若源码附件受到限制，请使用 IT 批准流程。明确标注为源码的文本副本在 deliverables/Murata-Step2-v1-source-text/，不能据此假定公司允许该格式。

保存到公司桌面后：

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Convert-MurataDatabase.ps1"
```

默认 Mode=CheckedSamples，从桌面 Murata_Data_Check 的最新报告读取 Source，再查找所有 Completed=true、Source 路径/文件大小/修改时间匹配的第一步报告，逐行读取其 selected-products.jsonl。会覆盖此前选中的预览及 GRM/GCM/KRM/DK1 代表样本，绝不只取数据库最前 1000 条。源码使用的仍是原始产品对象，而非照片或 Excel 显示值。

每次生成桌面 Murata_Normalized/normalize-* 新目录，保留原文件和前次结果。

若检查目录、数据库不在桌面可指定：

```powershell
powershell.exe -NoProfile -File "D:\Tools\Convert-MurataDatabase.ps1" -InputPath "D:\Data\Murata_MLCC.json" -CheckDirectory "D:\Data\Murata_Data_Check" -OutputDirectory "D:\Data\Murata_Normalized"
```

## 产出

- normalized-products.jsonl：查询用规格记录，统一值、原生命周期、独立电压、合规标志、链接、异常、来源和核对明细引用。
- normalization-audit.jsonl：同序号保存所使用字段的官方原值及数值/Text 校验明细。auditReference.line 从 1 起；源完整 JSON 始终保留，未使用字段不丢失于原源文件。
- review-products.jsonl：有错误或警告的记录，需结合 auditReference 查看原值。
- issues.jsonl：逐项异常，包含料号、来源、字段、异常代码、原数字和文字。
- normalized-preview.csv：最多 1000 条供查看。CSV 软件可能自动去掉封装前导零；导入该列时设为文本。JSONL 中封装严格为字符串，不补零、不依赖 Excel 再读回。
- normalization-summary.json：输入快照、处理数量、按系列/问题统计、重复记录及冲突料号、是否完成、是否读到全库末尾、验收标志。
- local-normalization-report.html：本机静态汇总报告，不联网、不执行外部脚本、不自动打开链接。

结构契约见 src/engine/official/types.ts。这一步不会改变现有网页翻译逻辑，也不会生成或拼接料号。

provenance.sourceIndex 在 CheckedSamples 模式下是 sourcePath 对应 JSONL 的行号，在 Preview/Full 模式下是原 Products 的产品序号，均从 1 开始，不能将两种索引混用。auditReference.line 独立指向同目录核对明细的行号。

## 规则与边界

1. capacitancePf = 官方数字 F × 10^12；尺寸 mm = 官方数字 m × 1000；电压数字保持 V。与对应文字换算后的值比较：允许误差 max(10^-9 个目标单位, |文字值| × 10^-6)。这是处理浮点序列化的小误差，不是电容容差或工程替代规则。
2. 数字缺失、非 JSON 数字、<=0、文字不识别、单位/值冲突、溢出时，统一值为 null，原值和错误保留。文字可识别也不擅自补缺失的官方数字。
3. 识别 pF/nF/uF/µF/μF/F、合法千位逗号；尺寸仅 mm 且可带 ±/+/−（程序支持 +/-）公差、非对称 +数字mm/-数字mm、Max./Typ. 注记。非对称公差允许零，负偏差不得大于标称尺寸；核对的是标称值，公差原文保留在核对明细 textNote，不把公差上下限当标称尺寸，也不以公差放宽数字/Text 一致性校验。电压接受 V/Vdc/Vac 及 AC rms 注记。超出已识别语法的文本列为待核查，不猜测。
4. DC/AC 与 X1/X2/Y1/Y2 safetyClass 单独存储，共 10 种原字段。DK1 普通 DC 缺失属于可接受空值，不复制 AC 或安规 DC 代替；所有电压均无可校验值时记错误。
5. 封装代码与实际尺寸独立，KRM 0805 不覆盖实际 2.2mm 长度；Thickness 和 ThicknessMax 分开。最大厚度小于标称厚度时，两者不进入统一值。
6. 精度区分百分比与绝对 pF。不能识别的复合/非对称精度保留原文、记警告。
7. AEC-Q200 只接受真实 JSON boolean；false 与 null 严格分开。字符串 'False' 不自动视作 boolean。RoHS/REACH、NewProduct、温度范围等未确认字段保留原值，不强行映射。
8. 已见的“目前生产”映射为 active；公司详情照片确认的原文 NRND（大小写严格匹配）映射为 nrnd，保留 lifecycle-nrnd 选型警告及 review 状态。村田官方定义为不推荐用于新设计，来源 https://www.murata.com/en-us/products/inductor/variable 的 Product Status。其他原文仍保留、category=unknown、记警告；不会把 NRND 或未知状态当正常生产。未来 Matcher 必须检查生命周期，不能仅凭数字和文字一致推荐新设计。
9. 规格书为 http/https 字符串或字符串数组时提取链接；其他结构/协议记警告并保留原值。链接存在不代表可打开或内容已核对，verified 一直 false。
10. 按产品对象紧凑 JSON 指纹去掉完全相同的重复；对象属性顺序变化可被谨慎视为不同快照。相同料号出现不同内容时，全体出现均标为 review（含发现冲突前写出的记录），summary 同时列出 conflictingPartNumbers，不能自动挑选其一。
11. consistent 只表示当前已校验字段没有问题，不等于厂家认证、工程可替代或公司验收。companyAccepted、datasheetReviewed、datasheetsVerified 一直 false；正式 Matcher 必须检查 Completed 和 review/冲突状态。
12. default CheckedSamples 不声明全库完整。Preview 只读头部指定数量；Full 才逐产品读到数组末尾。fullDatabaseRead=true 也不等于单位/厂家规则全部验收。异常中止时 completed=false，产物不能作为正式索引。
13. 内存不加载整个数据库，保留单产品、重复料号指纹字典及统计。全库模式内存会随唯一料号数增长；核对明细单独落盘，源 JSON 与新输出需要保留磁盘空间。采用文件大小/时间检查源是否变化，不是源内容哈希校验；文件和样本期间应保持不变。

## 后续全库转换（样本验收后）

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Convert-MurataDatabase.ps1" -Mode Full
```

不要先运行 Full；先看默认样本报告及 issues.jsonl，核对单位、缺失/无法解析的文字、AEC 类型、规格书形状和生命周期。全库过程中每 1000 条打印进度，没有可靠时间估计。必要时 Preview 可只测试数据开头：

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Convert-MurataDatabase.ps1" -Mode Preview -PreviewCount 1000
```

## 本机测试与实际状态

```powershell
powershell.exe -NoProfile -File .\scripts\Convert-MurataDatabase.Tests.ps1
```

测试为合成对象：F/m 换算、KRM 尺寸不套封装标称、逗号/微符号、缺失和错误单位、AC/DC 语义冲突、DK1 安规分列、false/未知布尔、绝对精度、最大厚度、保留原值、按产品流读、旧报告发现、快照不匹配、重复冲突全部隔离。未读取公司真实文件；公司运行情况见下面的照片记录，验收尚待完成。第三步官方 Matcher 与第六步公司 API 部署尚未实施；报价申请 Excel 自动填写仍最后做。

## 公司样本运行与待核查详情（2026-10-05）

用户提供的公司报告照片显示 CheckedSamples 正常结束：2011 条产品，922 条字段一致、1089 条待核查、0 个冲突料号。问题次数为 lifecycle-unmapped 884、missing-verified-voltage 54、unrecognized-or-missing-text 205；问题可重叠，不能把次数相加作为产品数量。个人电脑没有读取公司产物，不能凭汇总确定实际状态或文字格式，也不能宣称公司验收完成。

新增独立诊断工具 scripts/Review-MurataNormalization.ps1，只读取该次结果的 normalization-summary.json、issues.jsonl、normalization-audit.jsonl，另存静态 HTML，不重新处理原数据库、不修改规格或验收标志。

源码文本交付：deliverables/Murata-Step2-v1-source-text/Review-MurataNormalization.ps1.txt；说明：同目录 DETAILS_README.txt。在公司桌面保存为 Review-MurataNormalization.ps1 后运行：

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Review-MurataNormalization.ps1"
```

默认读取最新 normalize-* 目录，在同目录生成 local-normalization-details-*.html。报告列出生命周期原状态、按问题代码/字段分组的不同原数字及文字组合（默认每组最多 3 个），以及没有可核对电压的独立 DC/AC/安规字段。可指定 -RunDirectory 和 -ExamplesPerGroup（1 到 10）。先核对这些原文，再决定如何扩充解析和生命周期映射；无需先运行 Full。

诊断工具合成测试 scripts/Review-MurataNormalization.Tests.ps1 已通过 PowerShell 5：状态大小写分别统计、样例去重/数量限制、独立电压字段、HTML 转义、输入文件哈希不变，以及未完成/计数不一致报告。源码文本副本哈希与源文件一致；尚待公司实际运行。

后续公司详情照片确认：884 次 lifecycle-unmapped 的原文全为 NRND（System.String，示例 GCB155R91C104KE01D）。已扩充转换脚本与 TS 契约，映射 nrnd 并改为 lifecycle-nrnd 警告，仍需选型确认，不作为正常生产。转换测试增加原值保留、NRND 分类、警告保留及未知/EOL/小写不猜映射；全部合成测试通过。新源码文本在 deliverables/Murata-Step2-v2-source-text/Convert-MurataDatabase.ps1.txt。公司旧结果不会自动改变，目前先查看旧详情报告下面的文字/电压样例，再决定其余解析修正，一次重新整理即可；不要求为这一项单独重复运行。

最新文字/电压详情照片：205 次 unrecognized-or-missing-text 均归于 Specs.Thickness；展示的三个不同样例是 0.0015 对应 1.5mm +0mm/-0.3mm、0.002 对应 2mm +0mm/-0.3mm、0.001 对应 1mm +0mm/-0.3mm。已补非对称公差语法；三个样例、非零正偏差、零负偏差、错误单位/缺失单位/错误符号/多余文字/非法千位/不合理负偏差/标称冲突均有回归测试。照片不是全部 205 条格式，修复效果要看公司再次运行统计。

电压照片中 GCB155R91C104KE01D 的十类已检查数字和文字均为缺失/null，校验状态 absent。缺少可核对电压不是解析器能补出的值，不从料号或 NRND 推定；54 条问题继续保留待核查，其他源字段/规格书如有电压需在公司核对后另行接入。新增缺失全部电压测试，确保记录仍 review、统一电压列表为空。

合并修正版交付为 deliverables/Murata-Step2-v3-source-text/Convert-MurataDatabase.ps1.txt（包含 NRND 与非对称公差），README.txt 说明运行步骤。全部转换合成测试通过，交付副本与源码哈希一致。公司可覆盖桌面转换脚本，运行默认 CheckedSamples，打开新目录汇总报告；不重扫、不先 Full、不覆盖旧结果。

公司随后照片的 normalize-20261005-141006-4adec9 仍是 lifecycle-unmapped=884、missing-verified-voltage=54、unrecognized-or-missing-text=205（总2011、一致922、待核查1089）。与旧行为一致，疑似未执行修正版；没有公司脚本原文/哈希，不能断言实际文件原因。个人交付 v3 和源码哈希一致，NRND 与非对称公差测试通过。为辨认实际执行版本，新增工具标识 v3.1，summary 的 toolVersion 更新为 3，增加 toolBuild=v3.1、scriptPath；产品 schemaVersion 仍为 1，规格规则不变。控制台及 HTML 顶部显示版本与执行路径，测试验证这两处记录。

最新单文件交付：deliverables/Murata-Step2-v3_1-source-text/Convert-MurataDatabase-v3_1.ps1.txt。在公司桌面去掉最后 .txt 后，用新文件名运行，避免旧命令仍调用旧文件：

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Convert-MurataDatabase-v3_1.ps1"
```

先确认控制台 v3.1 与 Script 路径，再打开该次输出目录的汇总 HTML（顶部有 v3.1）；不要用旧标签页判断新版效果。仍使用样本，不加 Full。

## v3.1 公司样本复跑结果

用户提供照片确认公司已成功运行桌面 Convert-MurataDatabase-v3_1.ps1，工具版本 v3.1，范围已有检查样本，正常结束。报告目录为 normalize-20261005-143251-410ad0。产品2011条、字段一致1127条、待核查884条、冲突料号0；问题表仅剩 lifecycle-nrnd=884 和 missing-verified-voltage=54。此前205次厚度文字格式问题已不再出现，一致数量相应增加205。按报告总数与问题计数推断，54条缺失电压包含在884条NRND记录中，不能相加为938条待核查。

这是样本整理及解析修正的公司运行验证，不是全库验收、规格书验收、供货确认或官方API接入完成。NRND 保留为选型提醒，不自动作为新设计推荐；缺失电压不能猜补。个人电脑仍未读取公司原始数据库或 JSONL 产物。无需继续为厚度问题重复采样/整理。

后续可建设第三步正式记录匹配：使用已整理的官方记录返回真实料号，对生命周期、缺失字段、冲突与未完成输出执行筛选；先验证样本查询，再安排全库整理与公司部署。第三步实现仍待进行，不把规则拼接候选当成已存在的正式产品。公司API接入仍在第六步，报价申请Excel自动填写仍最后做。
