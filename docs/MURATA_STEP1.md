# 第一步：公司 Murata 数据验证

这是离线验证工具，不调用 API，不需要个人电脑的 API Key。保留官方文件原样，不把数据库整体载入内存，也不导入全量 Excel。

## 公司电脑运行

把 scripts/Test-MurataDatabase.ps1 复制到公司允许的工作目录。将官方 Murata_MLCC.json 放到桌面，打开 Windows PowerShell，执行（替换脚本路径）：

```powershell
powershell.exe -NoProfile -File "C:\你的工作目录\Test-MurataDatabase.ps1"
```

若数据库不在桌面：

```powershell
powershell.exe -NoProfile -File "C:\你的工作目录\Test-MurataDatabase.ps1" -InputPath "D:\Murata\Murata_MLCC.json" -OutputDirectory "D:\Murata\Validation"
```

默认预览 1000 条，最多扫描 20000 条，并采集 GRM/GCM/KRM 各 5 条及 DK1 最多 5 条。满足预览和三个主要系列采样条件可提前结束。每次创建独立结果目录，不覆盖前次结果。
如果公司执行策略拦截脚本，请按 IT 批准的方法执行，不修改全局策略。

## 产出

- preview.csv：前 1000 条产品原始字段值，Excel 可查看。
- series-samples.csv：GRM/GCM/KRM/DK1 代表样本。
- selected-products.jsonl：所选产品的完整字段，保留结构；每行一个对象。
- field-profile.csv：本次扫描各字段非空数量、实际类型和最多三个示例。
- run-summary.json：扫描数量、来源大小、系列样本数、停止原因、是否正常完成。

这里 Completed=true 仅表示本次采样正常结束，不表示数据库完整性、单位、全系列 Schema 已验证。预览不足 1000 条会提示，缺失系列表示扫描范围未找到，不表示厂家没有该系列。可增加 -MaxScan 100000 再采样，不要直接宣布全量验证成功。
类型复杂的字段以紧凑 JSON 保存在 CSV 单元格。false AEC 标记与缺失值分开保留。DC/AC/X1/X2/Y1/Y2 电压独立列出，不互相替代。原始数值不预设单位、不换算。

## 人工核对清单（真正完成第一步的条件）

1. run-summary 的 PreviewRows 达到 1000；核实源文件和扫描范围。
2. series-samples 中查看 GRM/GCM/KRM，分别对照产品详情及规格书。
3. 核对 Capacitance 数值单位与 CapacitanceText，电压数字与 Text，SizeCodeInInch/SizecodeMm 与 Length/Width 的单位和编码类型。
4. 区分 Thickness 标称值、ThicknessMax 最大值和公差。
5. 核对 TemperatureCharacteristics、标准字段、AEC-Q200 的实际类型（布尔、字符串或其他）、Status 的原始枚举值。
6. 确认 SpecificationsSheet 是字符串、数组还是对象，检查链接有效性。
7. DK1 等安规产品应核对 AC 和 X/Y 字段，普通 DC 为空不等于数据错误。
8. 只在上述样本核对后确认统一 Schema；没有证据的单位或字段记录为未知。

本机未读取公司真实 JSON；已根据用户主动提供的运行和报告截图记录样本级证据，见本文后续日期记录。完整字段、单位与全系列覆盖仍待公司验收。本机仅用明确标记的合成数据验证脚本行为。不要把测试型号当官方产品。

## 本机自测

```powershell
powershell.exe -NoProfile -File .\scripts\Test-MurataDatabase.Tests.ps1
```

测试涵盖字符串引号/反斜杠/花括号、嵌套值、非 Products 元数据、false 与缺值、电压分列、系列采集、扫描上限、EOF、损坏 JSON；输出到临时目录。

## 已知边界

工具针对顶层 Products 对象数组。字段名沿用公司交接记录，正式核验前不视为最终 Schema。按料号前缀筛 GRM/GCM/KRM/DK1，与 Series 字段一起供人工比较。采样主动停止后不会检查源文件后半部分，完整性验证是另一项工作。
当前步骤不改变网页翻译结果，不做全量数据库转换或 Matcher，不接入 API。下一步需要公司生成的报告与允许使用的代表样本，不需要 API Key。

数据库和生成数据请保存在公司允许的位置。不要把完整产品库或 API Key 放进前端或 Git；允许分享的字段报告/样本再用于后续接入。

## 数据不能传出公司时：本地检查报告

用户已确认公司文件不能传出；后续报告、原始样本和单位核对均留在公司。
2026-10-04 用户实际运行截图：预览 1000 条，扫描 20000 条达到上限，GCM=5、DK1=5、GRM=0、KRM=0；之后确认报告文件已全部生成。这里只记录用户反馈，没有本机读取公司数据，也未确认真实字段单位。

将 scripts/Review-MurataDataCheck.ps1 复制到公司桌面，执行：

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Review-MurataDataCheck.ps1"
```

默认检查桌面 Murata_Data_Check 下名称最新的 check-* 目录；窗口会打印具体目录，请核对是本次采样目录。也可显式指定：

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Review-MurataDataCheck.ps1" -RunDirectory "C:\你的用户名\Desktop\Murata_Data_Check\check-实际目录名"
```

输出 local-review-*.html，双击后浏览器显示中文报告。不联网，不自动打开链接，不上传数据，不需要 Node 或 API Key。只读已有 CSV/JSON 汇总文件，另写一个报告，不重新扫描完整数据库。

- PASS：对应数量或状态检查通过，不等于 Schema 已确认。
- ERROR：提取未正常完成或文件统计不一致，先排查这类项目。
- TODO：缺样本、字段缺失或语义/单位待确认，需本地对照产品页。
- INFO：正常扫描上限和安规电压等说明。

报告列出系列样本原始值、字段类型统计、本地验收清单。没有预设单位，没有把 false 当空值，没有合并 AC/DC，也不自动声称规格书链接有效。
无需将报告发出。仅反馈公司允许反馈的操作状态；真实型号和数据仍留在公司。下一步 Schema 确认须本地完成，不能仅凭脚本无 ERROR 推断全面通过。

工具自测：powershell.exe -NoProfile -File .\scripts\Review-MurataDataCheck.Tests.ps1 。使用合成数据验证缺文件、失败状态、统计不一致、false/AC 和 HTML 内容转义。

## 2026-10-05：用户提供报告截图的样本级核对

证据：用户主动提供公司本地检查报告截图；未接收原始 CSV/JSON，也未访问公司产品页。只记录截图能辨认的字段关系，不据此声称全系列 Schema 或规格书已验收。

- 可见 GCM 样本：CapacitanceText=10pF，数字字段为 0.00000000001；按该样本对应关系推断 Capacitance 使用 F（法拉）。DK1 的 10pF/22pF 行与这一换算关系一致。
- GCM：Length=0.0006 与 LengthText=0.6mm 对应，Width=0.0003 与 WidthText=0.3mm 对应，Thickness=0.0003 与 0.3mm 对应，ThicknessMax=0.00033 与 0.33mm 对应。DK1 Length=0.0114 与 11.4mm、Width=0.006 与 6mm 对应。据这些样本推断尺寸数值使用 m（米）。
- GCM：RatedVoltageDC=25 与 RatedVoltageDCText=25Vdc 对应；DK1 普通 AC=250/300 与 Vac(r.m.s.) 文本对应，X1 AC=440、X1 DC=1500、Y1 AC=250/300、Y1 DC=1500 分开保存。电压数值按可见样本使用 V，AC/DC/安规类别不能合并。
- GCM：SizeCodeInInch=0201，SizecodeMm=0603M。必须保留尺寸代码为字符串，避免丢掉前导 0，不把公制 0603 与英制 0603 混用。
- 可见 GCM AEC-Q200=True、DK1=False；报告文字不能单独证明原始 JSON 类型，应结合 field-profile 的 ObservedTypes。空值仍为未知。
- GCM 温度特性截图显示 C0G、标准 EIA；DK1 为 SL、JIS。精度分别 ±1%/±10%；需区分百分比及可能出现的绝对 pF 精度，不将任意精度文本直接视作百分比。
- 可见 Status 为“目前生产”；不能由这一值推断所有生命周期枚举，也不证明当前下载数据实时有效。
- 规格书和详情链接列有值；截图不能证明链接可打开或其内容已核对。

后续统一值建议：capacitancePf = 原始 F × 10^12；lengthMm/widthMm/thicknessMm/thicknessMaxMm = 原始 m × 1000；voltageValue 保持 V，同时保留电压类型和安全类别。此建议仅基于上述样本关系，实施时需本地批量数值/Text 一致性验证，遇不一致暂停自动归一化并保留原值。

尚未完成：更宽容值范围的 GCM 样本验证，GRM/KRM 覆盖，官方产品页/规格书独立确认、复杂字段类型及生命周期枚举。第一步仍是部分核验完成，不能整体标记通过。

## 2026-10-05：改善容值范围采样

用户最新截图中的五条 GCM 均为 10pF，主要是包装后缀及精度变化。原先默认策略取每个系列最先出现的五条，不能保证容值范围有代表性。这是采样覆盖不足，不是五条产品本身数据错误。

新版 Test-MurataDatabase.ps1 增加可选 -DiverseSamples：按 CapacitanceText 中明确写出的 pF/nF/uF/F（含 µF、μF）分组，每个系列每组最多一条；不能识别的文字单独记为 unknown。不凭原始数值猜单位。SamplesPerSeries 在此模式下至少为 5，默认值即可。样本可能少于五条，是正常的；不会用重复包装产品补足。

把新版采样和检查脚本复制到公司桌面后运行：

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Test-MurataDatabase.ps1" -DiverseSamples
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Review-MurataDataCheck.ps1"
```

两条命令依次执行，采样显示 Saved validation files 后再执行检查。仍默认扫描最多 20000 条、预览 1000 条；输出新目录，保留已有结果。只有预览数量达标且 GRM/GCM/KRM 各采到 pF/nF/uF 时才提前停止，否则到上限或数组结束。缺少系列或单位仍待核查，不说明全库不存在。若官方文字始终使用单一单位，也可能不能覆盖三个文字单位，此时需依据公司本地数据再调整范围策略。

run-summary 增加 SamplingMode 和 CapacitanceBuckets；CSV 增加 CapacitanceTextBucket。新版检查报告兼容旧结果，并提示普通 MLCC 系列缺少的容值文字单位。统计仍覆盖全部扫描产品，但只对被选中的产品生成完整 CSV 行，减少重复处理。

合成测试新增：包装重复跳过、pF/nF/µF/μF 识别、未知单位不猜测、原始 JSONL 与选中样本对应，以及三个目标系列齐备时的提前停止。真实公司数据尚未运行新版，范围与单位验证继续待公司验收。

## 2026-10-05：多单位采样已在公司运行，千位逗号识别修正

用户截图反馈：本次目录 check-20261005-003623-cfc12e，预览 1000，扫描 20000 达 max-scan；GRM=0、GCM=3、KRM=0、DK1=2。检查 ERROR=0、TODO=5，UnitsVerified/SchemaVerified 仍 false。仅依据用户自愿提供的照片，没有读取公司原始文件。

报告截图中 unknown 的文字原因明确：DK1 为 1,000pF，GCM 为 10,000pF，旧正则不支持千位逗号。前者为 1nF，后者为 10nF。GCM 的 0.1µF 为 100nF。这是脚本文字识别缺陷，不是官方产品容值错误。可辨认数值分别与 10^-9 F、10^-8 F、10^-7 F 对应，进一步支持容值原始数值使用 F 的样本级判断。

两个脚本的正则现已支持正确千位分组及小数，例如 1,000pF、10,000pF、1,000.5pF；错误分组 1,00pF 和歧义小数逗号 1,5uF 保留 unknown，不直接删所有逗号。CSV 和 JSONL 始终保留原文、原数值。回归测试包含这些输入和检查报告中的带逗号单位识别。

采样桶仍按文字单位分组，不按数值量级分组：10000pF 和 0.1µF 都属于 nF 数值量级，不能因没有 nf 文字桶就认定缺少 nF 产品。之前“缺 nF”应限定为缺少直接以 nF 写出的文字样本。本次无需为纠正该标签重新扫描。仍未验证 >=1µF 的产品、GRM/KRM、全库字段及独立规格书；第一步保持部分核验状态。

## 当前版本 v3：实际容值范围与续查入口

用户授权继续第一步。交付包：deliverables/Murata-Step1-v3.zip，内含三个配套脚本及使用说明。解压到公司桌面 Murata-Step1-v3 目录后，只运行：

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Murata-Step1-v3\Continue-MurataDataCheck.ps1"
```

Continue 自动读取桌面 Murata_Data_Check 中创建时间最新的 check-* 报告；读取原报告的 Source 路径。先确认前次 Completed=true、未到数组末尾、源文件大小与修改时间没有变化。此检查不是内容哈希；续查期间必须保留同一源文件不变。旧版 v1/v2 报告的 Scanned 作为已扫描位置，新版使用 LastProductIndex。

从已检查产品之后继续，默认最多检查新增 100000 条，目标 GRM/KRM。旧产品仍需顺序读过，但跳过阶段不做产品 JSON 转换或字段统计；不是字节位置断点恢复。新范围内逐项解析及统计，保留绝对 ScanIndex，输出新目录。取得 1000 条预览且 GRM/KRM 各至少一条后可提前停止；这只表示找到系列，不能宣称该系列的容值范围或规格全面验证。未找到时到批次上限/数组结束，再自动调用配套 Review 生成 HTML。不自动循环下一批，无 API、网络或上传。

Test 新增 StartIndex、TargetSeries、FindMissingSeries；Scanned 只计本次检查数，Skipped 计顺序跳过数，LastProductIndex 是二者之和。field-profile 只覆盖本次新增扫描，不把跳过产品计入统计。运行中发现源文件大小或修改时间变化时记 Completed=false 并停止。跳过阶段只做流读取，不代表旧产品字段被重新验证。

- DiverseSamples 现按 CapacitanceText 换算得到的实际 pF 值分类：pf 为 >0 且 <1000pF；nf 为 >=1000pF 且 <1000000pF；uf 为 >=1µF 且 <1F；f 为 >=1F；零、未识别或溢出归 unknown。每系列每范围最多一条。这覆盖宽数量级，不等于全面代表所有容值。
- CSV 继续保留原文字单位 CapacitanceTextBucket，新增 CapacitanceRange 和 CapacitancePfFromText。千位逗号仅在合法分组后转换，原始 Specs 数值和文本不改。此换算仅来自明确文字单位，不预设原数字字段单位。
- Review 也按文字换算检查实际范围，可读取旧 CSV 并生成派生列，不改旧 CSV/JSONL。自然 EOF 导致预览不足时为 TODO 而非 ERROR；计数不一致仍为 ERROR。
- 本次非目标系列缺样本在报告中提示 INFO，需结合此前报告。例如续查目标 GRM/KRM 时 GCM=0 不抹去此前 GCM 证据。所有报告的 UnitsVerified/SchemaVerified 仍保持 false。

Windows PowerShell 5 本机测试覆盖：等价容值归同组、逗号/错误分组/零值、范围边界、偏移和绝对索引、指定系列及提前停止、超出 EOF、旧版报告续查、源文件变化/失败记录/EOF 拒绝续查、原报告保留和报告自动生成。公司真实续查结果尚未取得，不能据本机测试宣布第一步完成。

用户反馈公司邮箱拦截了 zip。另提供 deliverables/Murata-Step1-v3-source-text/ 下三个明确标为 .ps1.txt 的源码审阅副本及 README；本机逐一核对 SHA256，与原脚本完全相同。源码文本的传入与脚本执行仍须使用公司允许的流程，不能据 zip 被拦截就假定源码附件获准。公司源数据继续留在公司，本次未修改工具逻辑。

## 2026-10-05：公司续查已找到 GRM/KRM

用户主动提供的新报告照片显示：采样结束 PASS，预览 1000 条 PASS，GRM 找到 3 条且报告按文字换算的实际 pF/nF/uF 范围齐备；KRM 找到 1 条。GCM 为 INFO（非本次目标），DK1 本次未采到。结合前次 GCM/DK1 样本，这些系列现均有采到的记录，不能因单次报告为 0 就否定此前样本。

照片中可见 GRM 10pF、0.1µF（100nF）、1µF 三个文字容值；后者行在照片底部不完整。首两行容值数字与此前 F 单位推断相符。可见 GRM 长度 0.00025 与 0.25mm、宽/厚 0.000125 与 0.125mm、最大厚度 0.000138 与 0.138mm 对应；支持尺寸数字为 m 的样本级判断。可见 DC 数值 16/2.5 与 16Vdc/2.5Vdc 对应。AEC 显示 False；原始类型仍需结合 field-profile 确认。

KRM 具体数据行在照片中未露出，尚不能核对其容值、电压、尺寸、厚度或 AEC 值。报告提示其 pF/nF 范围未覆盖，只能解释为本次缺这些范围的样本，不能推断系列必须提供这些范围或全库缺失。无需为凑齐所有数量级反复扫描；后续应先核对已找到的 KRM 样本。单位确认、官方规格书及生命周期验收仍未完成，第一步不能整体标记通过。

## 2026-10-05：KRM 数据行已核对（样本级）

用户随后主动提供报告下方照片，KRM 行显示：CapacitanceText=10µF，CapacitancePfFromText=10000000，原始 Capacitance=0.00001；ToleranceCapacitance=±10%；RatedVoltageDC=16、RatedVoltageDCText=16Vdc；SizeCodeInInch=0805、SizecodeMm=2012M；TemperatureCharacteristics=X5R、标准 EIA；AecQ200Support=False；Status=目前生产。照片不能替代原始字段类型和规格书内容验证。

KRM 尺寸对应：Length=0.0022 / LengthText=2.2mm ±0.3mm，Width=0.00125 / WidthText=1.25mm ±0.3mm，Thickness=0.0018 / ThicknessText=1.8mm ±0.1mm，ThicknessMax=0.0019 / ThicknessMaxText=1.9mm。分别支持原始容值为 F、电压为 V、尺寸为 m 的样本级判断；厚度标称值和最大值必须分开保存。该系列英制 0805 代码不能拿来覆盖官方实际 2.2mm 长度；封装代码和实际尺寸是独立字段。

GRM 1µF 行在这张照片中也更完整：Capacitance=0.000001、文字 1µF、DC=2.5/2.5Vdc；Length=0.0004/0.4mm、Width=0.0002/0.2mm、Thickness=0.0002/0.2mm、ThicknessMax=0.00025/0.25mm。与前述 F/m/V 样本关系一致。字段统计可见 Partno 非空/扫描=94585/94585，只代表本次扫描范围，不代表全库验证。

现 GRM/GCM/KRM/DK1 都有照片层面的字段证据，不必为单纯凑齐 KRM pF/nF 或本次 DK1 重复采样。足以确定后续归一化的候选映射和独立字段原则。仍需在公司本地以数值/Text 一致性校验逐项验收，无法识别/不一致应隔离并保留原值；规格书和生命周期验证仍未完成，UnitsVerified/SchemaVerified 不自动改为 true。第一步的系列覆盖与样本字段核对部分已有证据，完整验收仍未完成。
