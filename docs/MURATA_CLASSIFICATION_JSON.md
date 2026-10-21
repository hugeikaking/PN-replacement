# 原 JSON 分类字段接入：第四步 v2.4

## 已取得的公司证据

用户于2026-10-05提供七张 Inspect-MurataClassification.ps1 本地报告照片，覆盖原库前20,000条。这里只记录可见字段格式，不声称持有原库或完整目录已验收。

- Application：System.String，20,000条均有字段、非null。四种组合计19,194 / 613 / 157 / 36，分别为汽车I+汽车P+医疗eI、医疗I、民用+工业+汽车I+医疗eI、前三应用+医疗eI。原值用逗号分隔，类别与描述用×连接。医疗标签包含GHTF A/B/C或GHTF D。
- Specs.Characteristics：System.Object[]，元素是文字，如125℃、150℃、回流焊接、波峰焊接、减少焊接裂纹、导电性粘合剂、弯曲裂纹对策、啸叫对策/低失真、满足RoHS/REACH、安全规格认证品、符合日本国内电气用品安全法。本次可见样本未出现High Q，不能外推全库没有。
- 顶层 Standard：193条有字段、19,807条缺少，非null；安全规格认证品175条，符合日本国内电气用品安全法18条。这是用户要展示的安全规格字段。
- MediaFileUrls.SafetyCertificates：字符串，19,825条为空，另175条有链接；直接保留链接，不从文件名解读认证。报告可见七个不同非空链接，计50+34+22+22+22+14+11=175。
- ComplianceInfo.AecQ200Support：布尔，true19,843 / false157；不等于应用字段，也不当作安全认证。
- Specs.TemperatureCharacteristicsCompliedStandard：EIA13,087 / MURATA5,756 / JIS1,157；仅温度特性采用标准，与顶层Standard分开。
- RoHS/REACH/LeadFree/HalogenFree等为环境合规字段，其证书URL不是安全规格证书；当前本次功能未扩展这些展示。

## 实现

src/engine/official/classification.ts新增已确认中文×标签与逗号拆分；只把明确文字映射成三类应用，已确认医疗标签在三类之外，未知新标签仍待核查。原记录优先于系列参考，多个已确认类别OR；空特征数组保留“未记录”，不靠系列默认补成High Q。Standard原文优先，其次特征中精确匹配的两种安全标签，再其次明确注明系列来源的资料。AEC仍独立展示，EIA/JIS/MURATA不进安全栏。

NormalizedMurataProduct.classification新增可选standardRaw与safetyCertificatesRaw，schema1旧文件兼容。新增v3.4独立转换器保留Application / Specs.Characteristics / Standard / MediaFileUrls.SafetyCertificates原值与审计，不改变数字/文字校验、NRND和冲突隔离。默认CheckedSamples只重读既有完整原产品样本，未启动全库扫描。旧转换文件缺少字段，更新网页不会自动恢复它们，需新转换后导入同一次汇总与JSONL。

网页v2.4沿用两模式状态保留、默认general、多选OR、诊断、复制与严格匹配；安全栏标明原记录Standard和证书未核验，添加原链接。仅允许http/https，不自动访问、解析或下载链接。旧v2.3交付保留。

## 验证与交付

117项Vitest测试通过，含三项新测试：四种应用组合/医学排除/未知标签、Standard优先与空特征及链接协议、真实PowerShell5 v3.4输出和审计往返。vue-tsc通过；H5及独立网页构建通过。实际浏览器导入三条合成数据（使用照片转录字段，料号为SYNTHETIC_开头），默认general仅显示一条、安全标准与特征各标原字段、证书链接显示；截图JSON-fields-synthetic-test.png保存在交付目录。不是公司真实型号或完整目录的匹配验收。

交付目录deliverables/Murata-Step4-v2_4-offline包含网页、v3.4脚本、说明和合成界面截图。生成器build-classification-converter.mjs现在生成v3.4而不是v3.3，后者文件保留；build-official-preview.mjs生成v2.4，旧网页不覆盖。原始公司JSON仍在公司电脑。完整产品目录测试按用户安排后做，公司API第六步，报价申请Excel自动填最后。工作区文件保存，不声明Git提交或云端备份。
