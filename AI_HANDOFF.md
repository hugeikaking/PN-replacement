# 被动件料号翻译：AI 接手完整交接文档

整理日期：2026-09-06。项目目录：E:\WaPJTS\PNrep。
最新更新：2026-10-05 第四步。历史章节保留开发记录，当前状态以 docs/MURATA_STEP4.md 和下方第四步段落为准。
本文综合开发对话与当前代码核对结果；不是完整源码的替代品。接手时请同时读取项目源码。本文只做交接，不表示以下待办已经实施。

## 1. 给接手 AI 的首要说明

最新交付更新为 v2.6.6：docs/MURATA_HEIGHT_REFERENCES_V2_6_6.md。2026-10-18 用户反馈第一/四/五条客户描述无较大封装，并给出GRT21BC81A226ME13。公开村田目录/参考书索引列0805/22uF/10V/X6S/±20%，厚度1.25±0.2mm→max1.45；多个官网直接资源本次工具无法取回，不能声称实时完整核对。已解释旧v2.6.5明确仅允许小一档且H为硬条件。用户随后明确选择“允许大一档；超高料另列参考”，取代原尺寸仅小一档规则。

新规则同尺寸→目录紧邻小档→目录紧邻大档，不跳过已有中间封装。H仍必须满足才可列 alternatives；已知最大厚度>H时，只有其余硬条件/允许单档变化都合格才列 heightReferences/totalHeightReferences，kind='height-reference'，differences含maxHeightMm要求≤...→实际...。同尺寸只有高度不符也能列参考；未知max、不完整条件、<1uF、有原条件正常候选则不生成。参考只active+consistent且应用符合，AEC/系列/精度/实际长宽不放宽，RO仍未知；保留默认描述模式的回退范围。规则JSONversion2。UI独立红色“高度不符合，仅供参考”组，非正常/非替代。两组都需明确勾选才能已选复制/Excel/规格书，普通操作排除；Excel附加参考总数/显示数，候选分组、kind和差异显式保留；弹窗沿用全已选上下文去重，逐次打开链接。

交付 deliverables/Murata-Step6-v2_6_6-offline：HTML547473bytes SHA256=376F4DD1CB98B2EDC8D49669B937A0E6F77BFD7F8982E26A1B0DCC8D1F2CD1BC；patch90651bytes SHA256=5BA11049B49846C1E77FC10A5D102FAD067AE3AAEA3FEEA5906561521E3D6601；updater5618bytes。build-height-reference-deliverables.mjs以固定v2.6.5 SHA894AC5D9622A3E1D6174DBA87B5BB01FF10FD4EE87B87120CF2103F076E229B3为base，原发布包保留。公司只需本次updater+patch，继续原两个目录数据文件，不重整库。默认HTML构建已指向v2.6.6，不能重建覆盖旧base。

验证205tests/15files（substitutes38项）、vue-tsc/H5、两脚本syntax、delta逐字节还原、PS5.1 updater19项全通过。浏览器独立HTML启动正常；42synthetic fixture第一条样式+AEC/infotainment开启显示1符合高度替代+36超高参考；选择SYNTHETIC_03与_02复制和modal一致，modal明确≤1mm→1.45mm及0603→0805差异。Show-more20→36保留两选；第四条样式H.39两个height refs，五条样式无H有3alternatives无refs。无console errors/无合成URL请求。只作功能示例，不保证公司实际目录同样有这些组合；没读取公司API/数据。height-reference-preview-synthetic.png为modal合成截图。build-height-reference-fixture.mjs可重复生成，生成目录清理、临时tab关闭及3003服务停止。网页实测无需新依赖或后台服务。无Git提交/推送。

此前交付 v2.6.5（高容替代候选）的历史记录如下；尺寸仅小一档的限制已被上方v2.6.6用户新要求取代。详见 docs/MURATA_SUBSTITUTES_V2_6_5.md；前版 v2.6.4 是其升级 base，不能重新生成覆盖。该版用户允许多个参数同时各变一档，容值/电压按本次导入目录紧邻值，尺寸仅小一档。只在 Mode A、≥1uF、核心参数齐全且没有原条件正常候选时触发；RO 未知依旧保留，不为 RO 单独寻找更改规格的候选。

2026-10-18 用户确认 AEC-Q200 产品同样遵循替代规则。核对原 v2.6.5 已实现，无运行代码或发布包变更，不需公司再次升级。新增3项回归验证：AEC产品允许四参数各一档但保留原始特点标记/合规冲突排除/应用硬条件；非AEC精确记录不阻止AEC替代；已有AEC精确正常候选则不触发替代。substitutes.test.ts 27项全通过；本次只新增测试和说明，不将Grade2作为筛选，原HTML/patch及SHA保持不变。

src/engine/official/conditions.ts 抽出原硬条件；substitutes.ts 使用每目录 WeakMap 档位缓存和最多两组容值桶筛选，不改变 normalized 数据格式。类型新增 alternative kind、differences、独立 alternatives/totalAlternatives/alternativeNote；matches/reviewMatches 保持原严格语义。目录档位含非冲突 review 记录以防跳过中间档，候选仅 active+consistent 且应用已符合。容值/电压升一档、封装同尺寸优先或紧邻小档，可多参数同时变化；容差/H/实际长宽/系列/应用/AEC 不放宽。温度依据 Murata EIA 定义，src/rules/shared/substitution.json；仅扩大温度上限且下限/温漂不变差，取目录中兼容特性的最近上限。X5R不自动降为更宽温漂X6S；其他未知定义不更换温度。规则不保证电路/焊盘直接替换。

页面浅黄替代组，料号旁始终展示所有差异。普通导出、正常批量复制、普通规格书计划不含替代；明确勾选可复制、导出、打开规格书。Excel新增替代计数及差异列，保留原列位置。datasheetMatches helper保留每个已选查询上下文，重复PN的替代警示不能被另一个精确/未选查询覆盖；URL照旧去重、每次点击打开一个，CSP connect-src none保持。

交付 deliverables/Murata-Step6-v2_6_5-offline；HTML543757bytes SHA256=894AC5D9622A3E1D6174DBA87B5BB01FF10FD4EE87B87120CF2103F076E229B3；patch292121bytes SHA256=379F831FE7EE2C493F430138D97395E3EC28933A63E2CF085CA69F899E5B4BF5；updater5618bytes。build-substitutes-deliverables.mjs严格以v2.6.4的84659816C5B503E530C9DA10169B35C334C51AF254817C949DD565BC5FF17DE8为base，19项PS5.1升级检查通过。若公司仍v2.6.3.1先完成前次v2.6.4升级。原两个目录JSON复用，不用重新整理；无公司数据访问或上传。

最终191tests/15files、vue-tsc、H5、HTML脚本检查均通过（已有Sass/chunk警告）。新substitutes.test.ts24用例包括多参数/单档/低容禁止/阻止跨电压安规类别/温漂保护/精度高度AEC应用硬条件/NRND冲突排除/RO/导出隔离/重复PN上下文。浏览器实际v2.6.5启动正常；共享代码合成42条验证替代39条显示20→39保留选择、复制SYNTHETIC_02/06、真实XLSX读取核实两行differences、规格书弹窗同样两PN且完整四项差异、低容不触发、有正常匹配不触发、重复PN选择上下文隔离，无console errors，无合成URL请求。截图substitutes-preview-synthetic.png仅界面预览，不是实际产品。下载事件工具意外耗时约168秒，不是页面搜索耗时。合成fixture生成脚本build-substitutes-fixture.mjs保留，可重复生成，临时生成目录清理。测试tab2/3关闭。3001端口启动被系统拒绝，改用3002独立本地临时服务，结束后停止。公司115098条目录和新版本Chrome/Edge需用户复测。无Git提交/推送。

这是面向硬件行业资源开发、采购、研发人员的被动元件料号工具。用户需要简洁、干净、符合微信风格的界面，最终支持 H5 和微信小程序。
务必区分产品目标与目前实际能力。此前助手曾把原型、内置规则测试通过，误称为完整可用或全厂商可靠；这些说法不应继续沿用。
最重要的原则：厂家编码不能猜；用官方命名规则及真实型号规格逐字段核验。测试通过只证明程序符合测试断言，不证明断言或厂家映射正确。
用户目前尚未决定太阳诱电旧料号下一步方案，不要把这项决定当成已经完成。可以先阅读、核查资料；实施范围以用户下一次指令为准。

## 2. 用户原始需求与后续追加

- 应用名：被动件料号翻译。
- Mode A：物料描述 → 村田料号，优先开发。
- Mode B：料号 → 规格描述。用户明确要求从“竞品料号→规格描述”改成当前名称。
- 单条输入，也要支持多条物料；用户提出换行或者空格分隔。
- 批量 Excel/CSV 上传及导出。
- 多条结果保留逐条复制，增加一键复制全部，复制内容按换行排列。
- 知识库支持文字、PDF、常见图片格式上传；用户要求上传一次以后所有人都可以用。
- 选择 uni-app 跨端方案；村田 SimSurfing API 当时正在申请，尚未提供接口凭据或完成接入。
- 用户希望工作保存好、次日可继续；曾多次要求确认保存。

## 3. 实际技术栈与启动

当前实际是 Vue 3 + TypeScript + Pinia + Vite 的 H5 项目，而非完整 uni-app 项目。
package.json 使用 @vitejs/plugin-vue；未安装 uni-app 构建插件，未发现 pages.json/manifest.json；路由和存储直接使用浏览器 API。
仅有 @dcloudio/types 不等于实现小程序。dev:mp-weixin / build:mp-weixin 只是 Vite mode 参数，不应声称能产出可用微信小程序。

在 E:\WaPJTS\PNrep 下运行：

```powershell
npm install                 # 仅缺依赖时
npm run dev:h5
npm run test
npm run build:h5
```

- Vite 配置端口 3000，监听 0.0.0.0；构建输出 dist/h5。
- 本机优先 http://127.0.0.1:3000/ 。历史上 localhost 打不开但 127.0.0.1 可用。
- 历史局域网地址是 http://192.168.50.47:3000/ ，重启/网络改变后必须重新核对 IP。
- 后台开发服务器可能随会话结束被停止。收到停止通知不等于源码丢失，也不能据旧日志认定端口当前可用。
- 浏览器打不开时先查端口和 HTTP，再区分连接错误、页面编译错误、白屏。此前“肯定代理劫持”没有足够证据，不要重复当成定论。
- package 中 lint/format 脚本存在，但未见 ESLint/Prettier 依赖；test:rules 指向当前不存在的 tests/rules，不应报告这些检查已完成。

## 4. 代码导航（相对项目根目录）

| 文件/目录 | 职责 |
| --- | --- |
| src/App.vue | 按 URL hash 条件渲染首页、翻译、批量、知识库 |
| src/main.ts | Vue/Pinia 启动 |
| src/utils/router.ts | 简单浏览器路由跳转 |
| src/utils/clipboard.ts | 剪贴板辅助 |
| src/pages/index/index.vue | 首页功能卡片、快捷入口、最近记录 |
| src/pages/translate-single/translate-single.vue | A/B 输入、结果列表、展开详情、单条/全部复制 |
| src/pages/translate-batch/translate-batch.vue | 批量文件功能占位页 |
| src/pages/knowledge/knowledge.vue | 文字/PDF/图片录入、附件查看、删除 |
| src/components/ | ModeCard、InputPanel、ResultPanel、ParamDetail |
| src/stores/translation.ts | 当前输入、结果数组、历史、执行翻译 |
| src/stores/knowledge.ts | 本地知识库及附件持久化 |
| src/engine/parser.ts | 描述提取、单位归一化 |
| src/engine/matcher.ts | 参数查编码、容值编码 |
| src/engine/builder.ts | 拼接村田料号与基础长度检查 |
| src/engine/index.ts | Mode A 入口 translateDescription |
| src/engine/decoder.ts | Mode B 厂家识别、内置规则、文字启发式兜底 |
| src/engine/types.ts | RuleSet、ModeBRuleSet、结果类型 |
| src/rules/murata/mlcc.json | Mode A 村田 MLCC 规则 |
| src/rules/{samsung,tdk,taiyo-yuden,yageo,walsin}/mlcc.json | Mode B 内置规则 |
| src/rules/shared/ | 尺寸、电压、温度特性、容值、精度表 |
| tests/engine/ | parser、matcher、mode-a、decoder 四个测试文件 |

AGENTS.md、CLAUDE.md 描述偏早期；其中“Mode B 尚未实现”等状态已经过时。应遵守有效协作约定，但不要把过时功能状态当成代码事实。

## 5. 已完成和未完成

已存在：H5 界面；Mode A 基础规则流水线；Mode B 五家 JSON 规则注册；换行多条输入；结果展开；单条和全部复制；最近记录；知识库文字/PDF/图片录入与预览。

尚未完成：真正的 uni-app 小程序；批量文件上传导出（即使已装 xlsx）；SimSurfing API；服务端共享知识库；PDF/图片自动提取并生效；太阳诱电旧料号；所有厂家/系列官方校准；采购级准确性保证。

实际 splitInputs 仅按换行拆分，未实现“空格分隔多条描述”。不能直接按所有空格拆，因为一条物料描述本身就包含空格。多对多选型候选关系也没有实现，目前是逐行一个结果。

## 6. Mode A 当前逻辑及风险

流程：parseDescription → matchParams → buildPartNumber → validatePartNumber。
容值归一化为 pF，按 JSON 模板与默认值拼接字段；缺失参数可能用默认值填充。
当前 translate() 不论选择的元件类型，Mode A 都使用村田 MLCC 规则，因此 UI 中电阻、电感、磁珠等宣传不代表真实支持。
validatePartNumber 主要看长度误差，不查询厂家目录，不验证真实产品存在。不能把拼出的料号直接称为可采购的官方型号。之前包含 xx 等占位性质后缀的示例尤其不能作为权威样本。
matcher 的通用厂家键参数实际上没有完整用于查表，当前 getRefTable 走村田表；不要直接拿 shared 中其他厂家映射当已校准依据。
建议后续：官方目录/API 返回真实候选料号；缺参数明确提示；区分“解析成功”“编码推导”“官方型号已验证”。

## 7. Mode B 当前逻辑及风险

- detectManufacturer 用前缀正则识别厂家。
- findBuiltinModeBRule 只按厂家取 manufacturer/mlcc，没有完整系列/元件类型判别。
- 有内置规则时立即逐字段切片返回，上传知识库不会覆盖它。
- 未命中内置时，文字规则仅通过 XX=YY 等启发式字符串匹配，不是完整规则语言。
- PDF 和图片被兜底逻辑直接跳过。
- 内置分支 success=true，没有严格长度/全字段/未知代码验证；过短字段会跳过、未知编码原样返回。
- 仅前缀符合就可能把不支持系列甚至别的元件套用 MLCC 规则。例如国巨 RC、华新科 WR 等前缀纳入识别后也走 MLCC，必须优先核查，不能把历史样例当可靠电容规则。
- 大小写识别不敏感，但后续映射未统一大写，存在小写输入漏映射风险。
- buildModeBSummary 只收集 size/tc/capacitance/tolerance/voltage，且过滤 value===code，可能漏掉本来合法的直读字段（例如尺寸或温度特性）。摘要固定写 MLCC。
- TranslationResult.partNumber 在 Mode B 被复用为物料描述文本，UI 和复制使用该字段。

## 8. 厂家支持边界

| 厂家 | 当前状态 |
| --- | --- |
| 三星 | CL 基础结构化规则与样例测试；历史助手说过高置信度，但无充分官方逐字段审计证据，不应宣称全覆盖 |
| TDK | C 系列样例及厚度码解码；CGA/CEU 也被识别，不能据此认为结构相同 |
| 太阳诱电 | MSAS 真实问题样例已修正并获用户反馈“对了”；其他 MS 前缀与特殊封装仍需单独验证 |
| 国巨 | CC 基础规则、精度补充；电压/系列仍需官方校准 |
| 华新科 | 当前规则最需复核；历史 WR 电容样例不能作为事实依据，先确认元件类别 |
| 村田 Mode B | 可识别前缀，但没有注册内置 Mode B 村田规则 |

## 9. 太阳诱电关键故障与最终正确样例

用户提供官方 PDF：E:\WaPJTS\PNrep\c_mlcc_S_e.pdf。
历史工具有 pdftotext，但没有 pdftoppm/pdftocairo；换环境后重新检查，不要假设工具仍不存在。

错误经过：
1. 曾凭未校准信息写 TMK/JMK 旧规则，后替换成新 MSAS 规则。
2. 从 PDF 的 -layout 文本误读表格行关系，导致 P 被写成 4V，而实际为 2.5V；其他电压也错一档。
3. 漏掉独立厚度字段，导致下游温度/容值/精度全部错位。
4. 用户实测 MSASP063EB5475MFNA01 输出“0201 540uF 4V”。
5. 用 -raw 提取及真实型号核对，补厚度、修电压，用户确认结果正确。

注意：-raw 不是普遍保证正确，-layout 也不是必然错误。应结合渲染后的表格、标题、行列和具体型号交叉验证，必要时视觉读取 PDF。

正确拆解（0 起始索引）：

| 字段 | 位置 | 长度 | 本例 |
| --- | --- | --- | --- |
| series | 0 | 4 | MSAS |
| voltage | 4 | 1 | P = 2.5V |
| size | 5 | 2 | 06 = 0201 |
| thickness | 7 | 1 | 3 = 0.3mm（标称厚度，不是最大含公差厚度） |
| dimTolerance | 8 | 1 | E，目前原码展示 |
| tc | 9 | 2 | B5 = X5R |
| capacitance | 11 | 3 | 475 = 4.7uF |
| tolerance | 14 | 1 | M = ±20% |
| packaging | 15 | 1 | F |
| internal | 16 | 4 | NA01 |

完整料号是 20 字符：MSAS + P + 06 + 3 + E + B5 + 475 + M + F + NA01。
期望摘要：太阳诱电 MLCC 0201 X5R 4.7uF ±20% 2.5V。

当前电压映射：P=2.5V、A=4V、J=6.3V、L=10V、E=16V、T=25V、G=35V、U=50V、H=100V、Q=250V、S=630V、X=2000V。
当前温度码含 B5/X5R、B7/X7R、C6/X6S、D6/X6T、C7/X7S、D7/X7T、CG/C0G 等。
特殊尺寸 1L、1B 以及 LW reversal 等当前映射未完整覆盖。包装等非核心字段尚需视觉核对，不能由一个通过样例推广为全表验证。

历史示例 MSASU31BB5106KTNA01 是漏厚度的错误示例，100V 的历史解释也错。不要恢复该用例或再推荐给用户。

## 10. 太阳诱电旧料号待决事项

用户问市场是否仍使用旧料号，因为 JMK/TMK 等无法识别。
当前没有旧料号识别和规则。历史提到 TMK105BJ104KV-F、JMK107ABJ106MA-T 等，仅用于讨论，不构成已核准全系列映射。
此前“旧料号比新料号更常见”缺少市场份额证据，不应作为事实复述。可确认旧 BOM/库存/分销页面存在旧料号，但具体生命周期、对照关系需官方资料。
用户说先睡、明天想好再告知。待决方向：提供旧命名官方 PDF 后校准，或先做严格受限且来源明确的支持。
建议可靠方案：新旧规则并存，按系列和结构选择；BJ 等存在歧义时不猜 X5R/X7R，返回待确认；保留官方新旧对照来源。

## 11. 知识库真实行为（交接重点）

上传实现是 FileReader.readAsDataURL，保存附件；没有 OCR、PDF 表格解析、AI 提取、结构化规则审核发布链路。
所以“上传 PDF 为什么仍解错”的原因是内置代码错，PDF 根本没参与自动解码。不能再称“上传即生效”。

KnowledgeRule：id/manufacturer/manufacturerLabel/componentType/componentLabel/description/fileType/dataUrl/fileName/createdAt/updatedAt。
fileType 为 text、pdf、image；支持 JPG/PNG/GIF/WebP/BMP/SVG 等图片选取及预览（浏览器格式支持不等于内容识别）。

localStorage 键：
- pn-kb-text：文字规则
- pn-kb-meta：附件元数据
- pn-kb-data-{id}：附件 base64
- 历史兼容 pn-kb-pdf-meta 和 pn-kb-pdf-{id}
- pn-translator-history：翻译历史，最多 50 条

重大缺口：localStorage 按浏览器、设备和 origin 隔离，不会所有人共享。localhost、127.0.0.1、局域网 IP 甚至不同端口都有各自存储，换网址可能看不到上传记录。过去“所有人共用”说明错误，代码注释和页面 banner 仍可能保留误导文案。
附件容量异常多为 console.warn；界面可能看似保存成功但刷新后附件缺失。拆成不同 key 不会绕过同一 origin 总配额，base64 还会增加体积。旧字段 pdfFileName 到 fileName 的迁移也需复查。
Git 不保存浏览器上传数据。若用户迁移电脑，需要另外导出知识库/附件；原始 PDF 被忽略也需要单独备份。

最终共享方案尚未实现：需服务端数据库+附件存储，再有提取、结构化、校准、版本发布链路。不能用纯本地存储冒充共享服务。

## 12. 已修复历史 UI 问题

- 批量页返回无反应：原来 emit(back) 没父级监听，改用路由跳转。
- Vue placeholder 编译错误：绑定 JS 字符串里 HTML &#10; 变成实际换行，改为反斜杠 n 转义。
- 多行翻译：currentResult 改为 currentResults 数组，历史也改 results。
- 一键复制全部：结果换行拼接，保留逐条复制。
- 图片上传：统一附件字段，加入图片预览及旧 PDF 存储兼容。

仍需核查：旧历史 result→results 未完整迁移；首页先 setInput 再 setMode 可能清掉输入；复制在普通 HTTP 手机端的实际回退表现；页面旧支持范围宣传。

## 13. 测试与版本记录

历史最新成功验证：44/44 测试，H5 build 成功（修复 576e6ff 时）。四文件分别 parser 12、matcher 8、mode-a 9、decoder 15。
本次编写交接只读核对代码和 Git，没有重新跑测试，不要把历史通过说成本次通过。
构建历史有 Sass legacy-js-api 弃用警告、村田 JSON 同时静态/动态导入提示。

Git 分支 master；本次核对 HEAD：576e6ff。
主要提交：
- 6979396：初版
- dff7165：Mode B placeholder 修复
- 02889b1：图片上传
- 0cfffcb：三星结构化解码
- 9393492：TDK/太阳诱电/国巨/华新科基础规则
- 4ac86a0：国巨精度补充
- acc57eb：MSAS 初版（含后续发现的错误，勿作为正确版本）
- 576e6ff：MSAS 厚度及电压修正

本次开始 git status 有未跟踪 AGENTS.md，未见已跟踪源码修改；不要再笼统说整个工作区干净。本文新建后也会成为新的未提交文件。没有核实远端备份，不能称已上传云端。
.gitignore 忽略 node_modules、dist、.claude、*.pdf、*_extracted.txt 等。c_mlcc_S_e.pdf 即使在本地，也不会自动随 Git 交付。

## 14. 推荐接手顺序

1. 阅读本文、AGENTS.md、源码，核对 Git 状态；保留用户现有改动。
2. 确认用户本次想继续哪一项，不把未决旧料号方案当成授权发布。
3. 先修“错误也显示成功”的解码校验：按厂家+系列+元件类别选规则，校验长度/固定码/必需字段，未知项明确展示。
4. 按官方文档校准华新科/国巨及其他系列，避免将电阻套用 MLCC；逐字段带来源测试。
5. 保留 MSASP063EB5475MFNA01 回归用例，并补错误长度、未知码、小写、错误系列等负例。
6. 纠正知识库说明，再按用户选择建设真正共享与规则发布链路。
7. 补批量 Excel/CSV、空格多描述处理；最后落实真正小程序迁移。
8. 每次变更跑适当测试和构建，报告实际验证范围、未解决事项；不要因测试通过宣称全量型号准确。

## 15. 移交给下一个 AI 的使用方式

2026-10-05 第二步更新：用户授权开始统一规格字段。独立离线工具 scripts/Convert-MurataDatabase.ps1 默认 CheckedSamples，收集相同原库快照的各次已完成检查记录并整理四系列样本；另有 Preview/Full，初次只跑默认模式。结构见 src/engine/official/types.ts，细则和公司执行方式见 docs/MURATA_STEP2.md。查询规格与核对原值分开存于 normalized-products.jsonl / normalization-audit.jsonl，数字与文字不一致时统一值为空；独立 AC/DC 与安全类别，严格 false/null，保留实际 KRM 尺寸、两种厚度和未知生命周期。同 PN 不同内容会把所有出现标为 review。公司尚未执行第二步；本机只用合成输入通过 PowerShell 5 测试。交付为单个源码文本与说明，不依赖 zip，不需要 API Key/Node。暂未连接网页、官方 Matcher 或 API 更新；报价 Excel 最后做。所有新增文件保存于工作区，未声明 Git 提交或远端备份。

2026-10-05 更新：当前工作优先级已变为公司环境融合的第一步。请先阅读 docs/MURATA_STEP1.md 的最新 v3 章节和 scripts/ 中实际源码，而非把上面的旧推荐顺序当本次任务指令。用户确认公司数据只能留在公司，个人电脑无 Murata API Key；只把离线工具传入公司。公司已运行 20000 条扫描，1000 条预览，GCM/DK1 有样本、GRM/KRM 未覆盖；用户提供的照片支持容值 F、尺寸 m 的样本级推断，千位逗号识别错误已修复。v3 提供按实际容值范围采样、继续扫描及自动报告，打包为 deliverables/Murata-Step1-v3.zip。本机 PowerShell 合成测试通过不等于公司数据/单位已完整验收。第一步仍未全部完成；没有接入 API 或官方数据库 Matcher。公司报价申请 Excel 自动填写必须在全部融合完成后最后做，见 docs/FINAL_STAGE_QUOTATION_EXCEL.md。新增文件保存于工作区，尚未声明 Git 提交或远端备份。

2026-10-05 最新公司照片：第二步 CheckedSamples 已正常结束，2011 条产品、922 consistent、1089 review、0 冲突。问题次数 lifecycle-unmapped=884、missing-verified-voltage=54、unrecognized-or-missing-text=205，计数可重叠，实际原状态/文字尚不明确。新增 scripts/Review-MurataNormalization.ps1 与合成测试，静态报告展示原状态、按字段分组的问题样例和独立电压字段；只读取既有结果，另存 HTML，不改规格或验收标志。文本交付在 deliverables/Murata-Step2-v1-source-text/Review-MurataNormalization.ps1.txt，说明 DETAILS_README.txt。个人电脑测试通过、交付副本哈希一致，公司尚待运行诊断。下一步应核对原文后再改解析；不要凭汇总猜生命周期映射，也不要先全库转换。第三步 Matcher 仍未实现，报价 Excel 仍最后做。新增文件仅保存到工作区，未声明 Git 提交或云端备份。

2026-10-05 后续详情照片：884 个未映射状态原文全部为 NRND（System.String，示例 GCB155R91C104KE01D）。已按村田官方 Product Status 定义补充 category=nrnd，保留原文和 lifecycle-nrnd 选型警告，因此仍 review，不改为 active/consistent。转换测试全部通过，TS 契约同步。交付更新为 deliverables/Murata-Step2-v2-source-text/Convert-MurataDatabase.ps1.txt；旧公司结果不会自动改变。当前待看旧详情报告下方 unrecognized-or-missing-text 与电压原字段，不猜205次文字问题和54次电压问题原因；建议合并剩余修正后再跑一次样本，暂不需要单独为 NRND 重跑。

2026-10-05 最新两张详情照片：205 次 unrecognized-or-missing-text 全归在 Specs.Thickness，三个样例 1.5mm/2mm/1mm +0mm/-0.3mm（对应原值 .0015/.002/.001 m）。已补非对称 mm 公差语法，核对标称厚度并保留公差 textNote；不按公差容忍标称冲突。全部转换合成测试通过，含合法/恶意或非法格式、缺失电压不猜补。GCB155R91C104KE01D 的十类已检查电压均 null/absent，54 条电压问题保留待核查，不能说已修复或从料号推定电压。合并修正版 deliverables/Murata-Step2-v3-source-text/Convert-MurataDatabase.ps1.txt 与源码哈希一致，包含 NRND 识别。下一步公司替换桌面转换脚本，运行默认样本整理看新汇总；预计厚度问题减少但未读取全部原文，不承诺全部消除。旧结果保留，不重扫或先 Full。

2026-10-05 后续公司报告 normalize-20261005-141006-4adec9 仍有旧问题代码和相同计数，疑似仍运行旧脚本；未见公司实际脚本，不能断言传输原因。个人 v3 交付与源文件哈希一致，逻辑测试通过。已补 v3.1 控制台/HTML 版本与实际脚本路径、summary toolVersion=3/toolBuild/scriptPath，产品 schemaVersion 仍1。新增交付 deliverables/Murata-Step2-v3_1-source-text/Convert-MurataDatabase-v3_1.ps1.txt，公司保存桌面为新文件名并用新命令调用，以避开原文件未替换问题。全部转换合成测试含版本/路径检查通过。下一步查看公司新版 v3.1 报告；NRND 仍review、缺失电压仍不猜补，不能仅看待核查总数确认修正。

2026-10-05 当前公司验证结果（覆盖前文“尚待复跑”状态）：照片确认 v3.1、脚本桌面 Convert-MurataDatabase-v3_1.ps1、正常结束、已有检查样本。normalize-20261005-143251-410ad0：2011条、1127consistent、884review、0冲突；仅剩 lifecycle-nrnd=884、missing-verified-voltage=54，205次厚度格式问题全部消除。按表和总数推断54条包含于884条中，不可相加。样本解析修正已验证，公司原始数据仍留公司，未验证全库/规格书/供货/API。接下来可以建设第三步真实官方记录Matcher，先样本验证；NRND不默认推荐新设计、缺失电压不猜补、完成/冲突/其他review检查不可省略。第三步当前还没实现，不需要继续让用户重跑厚度诊断。第六步接公司API，报价Excel最后做。代码与文档仅保存工作区，未声明Git提交/云端备份。

2026-10-05 用户授权第三步。已新增纯TS官方query/catalog/matcher与独立离线查询网页（src/official-preview/），公司不需Node/APIKey/服务器。交付 deliverables/Murata-Step3-v1-offline/Murata-Official-Matcher-v1.html 及同字节html.txt，读取第二步同目录summary+normalized-products.jsonl。严格单位、必要条件missingFields/partial、不做高压/小封装/温度替换；温度排序X5R/X6S/X7R、未指定AEC并列显示、NRND等review默认折叠、缺失电压不猜补、冲突PN排除。支持多行查询、单一/已选/跨描述一键复制，当前显示主结果复制不包含review，换行输出。原H5 A/B还没接此引擎（下一步），不能称旧UI已升级官方查询。新增23规则测试和1真正PowerShell转换输出兼容测试（合成数据），共68测试、原H5构建及新增源码严格TS检查通过；全项目tsc有两个原类型问题未改。浏览器工具拒绝file://，未绕过/未完成离线页视觉与真实浏览器上传查询验证，公司实际导入待用户测试。详情 docs/MURATA_STEP3.md。试用仅128MB/100000记录，不适合原始368MBJSON或正式全库后端。API仍第六步，Excel最后做，未声明Git/云端保存。

2026-10-05 最新公司第三步照片：用户说“运行了”，查询008004 10pF 16V C0G ±2%正常返回GRM0115C1C100GE01L（精确参数匹配、目前生产、AEC否），原尺寸0.25x0.125mm、厚0.125mm、最大厚0.138mm，记录与第二步照片相符。离线网页已实际在公司运行，单条查询已验证，覆盖前文“公司实际导入待测试”的笼统状态；截图没有导入数量，不能宣称2011条全部导入/查询通过。多行/复制/NRND折叠/规格书打开尚未见操作验证；无需反复重扫或重新整理。第四步A/B正式接入尚未开始。邮箱拦截问题无需继续追问传入方式，不能推定如何传入或建议绕过策略。

第三步后续用户文字反馈：两条描述测试中008004 10pF 16V C0G ±2%返回1个，100nF返回22个，数量符合完整条件与宽条件查询差异。22仅为容值候选，不表示22个均精确/可替代；不知是主组还是合计，未见partial标识、复制、NRND折叠或链接反馈。保留已验证范围，不能声称全部公司功能验收。

2026-10-05 第四步已实现：用户“好的继续吧”授权入口整合。新增 engine/official/translate.ts，描述与料号解析都走同一官方 Matcher；原 H5 /translate 与新公司离线 HTML 复用 official-preview/translator.ts（Vue 挂载、离线 IIFE）。交付 deliverables/Murata-Step4-v2-offline/Passive-PN-Translator-v2.html，旧 v1 文件不覆盖；build:official-preview 现在构建 v2，仅生成 HTML，不再生成额外后缀副本。未导入数据 A 禁止猜号，B 可仅拆解描述。B 限三星 CL、TDK C、太阳诱电 MS 完整结构及已识别核心参数，未知/截短/错位/旧体系不匹配；国巨/华新科未经校准草稿不接正式 Matcher。村田完整 PN 从导入记录直接取规格，重复冲突禁用，缺电压不猜，多额定值不任意选取。参考拆解不证明原型号真实存在或在产，候选仅基础参数匹配，片厚/包装等完整工程要求仍需确认。保持正常生产优先、NRND 折叠、逐条及换行一键复制，多描述官方 PN 去重。旧知识库仍本浏览器存档，不 OCR/提取、不执行模糊文字规则，修正“所有人共用”文案。官方库及查询历史仅内存，不读取旧拼接历史；未删除浏览器旧资料。此前两个 TS 类型问题与 404 缺路由导入本步修复。代码测试95个、Vue/TS完整类型检查和两种构建通过；使用合成 Murata 记录，不能声称公司新版已验收或所有厂家规则都已官方验证。新版公司真实界面/复制仍待用户操作反馈。docs/MURATA_STEP4.md 包含最小测试，无需重扫。公司 API 第六步，报价 Excel 最后。保存工作区未提交 Git/云端备份。

把本文和整个项目源码一起交付。若需继续厂家校准，附上本地官方 PDF；若需保留网页上传资料，另行导出浏览器数据。只有本文不能替代源码和附件。

可对下一个 AI 说：
“请先阅读 AI_HANDOFF.md、docs/MURATA_STEP4.md 和实际工作区源码。项目是被动件料号翻译，已整合官方数据查询与受限料号解析；新版公司实际验证待反馈。太阳诱电旧料号未支持，PDF 仅存档、知识库不共享、小程序尚未落地。API 第六步，报价 Excel 最后。请区分已完成与待办，不猜厂家映射，不覆盖现有改动，再按我接下来的要求继续。”

2026-10-05 第四步 v2.1：用户要求两个模式切换保留输入与结果并手动清除。shared translator 改为独立 A/B 面板和输入草稿，切换保留结果 DOM、勾选和展开状态；上方清除按钮仅清当前模式，保留另一模式和规格库。每模式 revision 隔离异步查询，清除/新导入/卸载使旧任务失效；切换不取消查询，onComplete 带 mode，不覆盖另一模式 store。Pinia setMode 不再自动清空，有独立内存草稿。只保证页面运行期间切模式保留，未实现刷新恢复/关闭持久化或返回首页恢复完整结果 DOM。重新导入会清除两模式旧结果，保留输入。发现回贴格式中三星/太阳诱电/TDK来源厂商标签原先导致描述解析错误；query.ts 只剥离 MLCC 前已知标签，其他未知条件仍报错，温度/容值/精度/电压顺序本来无关。B 模式直接候选查询本来用结构化字段，不受厂商文字影响，所以其空候选原因仍需具体村田料号和数据覆盖证据，不能宣称已解决全部空候选。100个测试、完整类型检查通过，H5和离线构建成功。实际本机浏览器用两条合成记录验证模式输入/结果/勾选保留、两边分别清除互不影响、换行复制、带厂商描述匹配，与公司产品存在性无关。新版交付 deliverables/Murata-Step4-v2_1-offline/Passive-PN-Translator-v2_1.html，旧v2保留，不打包合成记录。公司API第六步，报价Excel最后。源码和文档仅保存工作区。


2026-10-05 v2.2：用户说按钮和保留功能正常，但有描述仍无法得到村田料号。已异步询问失败描述、页面提示和对应村田完整 PN，不要求公司数据外传；尚未收到，根因未定。不能继续笼统断定是样本不足或放宽条件宣称修好。新增 matcher diagnostics 与 shared UI 无结果原因表：每条件单独/累计匹配数，恰好只差一项条件的计数，排除缺失冲突 PN，含 NRND/review，严格电压类型/安规/一致状态等复用原谓词；不把放宽后的记录列为候选。103项测试、vue-tsc、H5/离线构建通过，本机 H5 使用故意 4V 不符 2.5V 的合成记录验证显示具体原因，未读取公司库。新版 deliverables/Murata-Step4-v2_2-offline/Passive-PN-Translator-v2_2.html，README解释如何在公司看诊断。合成临时文件已删除，网页不打包数据。注意本次构建切换版号之前曾将诊断更新构建到旧 v2_1 文件，但最终交付正确版号为 v2.2，不声称 v2_1 字节未改。公司 API 第六步，报价 Excel 最后。保存工作区，不声明提交或云端备份。


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


## 2026-10-05 第四步 v2.3 应用、标准、特征

用户要求把完整产品目录的统一测试推迟到接入完成后，本次只增加应用筛选和结果分类展示。已完成三类应用复选框，无勾选默认general，多选OR；A/B分别保留选择和原输入结果。已核对村田官方lineup页面，14系列参考存于src/rules/murata/lineup-reference.json，日期2026-10-05。classification.ts优先明确原Application，缺失时使用系列资料，不按PN前缀、AEC-Q200、C0G推定应用/High Q。未知应用仅折叠核查，正常复制排除；汽车动力适用性与AEC分别处理。候选新增应用、标准（安全规格）、特征三格，安全认证仅系列信息或原额定类别，不作为单型号已认证事实，EIA/JIS不混入安全标准。新版可读旧schema1，不要求用户现在重扫或运行覆盖工具。新增v3.3独立转换器仅保留Application/Specs.Characteristics原值及审计，其生成器不修改原v3.1；字段结构未校准对象仅原值待解释。112测试、vue-tsc和两种构建通过，浏览器合成3记录验证默认general2条、powertrain1条、多选3条、B默认2条与A切回输入结果勾选保留，截图无公司数据。交付deliverables/Murata-Step4-v2_3-offline/Passive-PN-Translator-v2_3.html、v3.3脚本及README；完整目录尚未接入，API第六步，报价Excel最后。仅保存工作区，不声明Git/云端。详细说明见新版交付README。

## 2026-10-05 第四步 v2.4：按公司照片接入 JSON 分类字段

用户提供七张原库前20000条的字段报告照片，已确认 Application 是逗号分隔的“民用×民用设备 / 工业×工业设备 / 汽车I×汽车信息娱乐/舒适设备 / 汽车P×汽车动力总成/安全设备 / 医疗I或医疗eI×...”文字；Specs.Characteristics是文字数组；顶层Standard明确含安全规格认证品(175)和符合日本国内电气用品安全法(18)；MediaFileUrls.SafetyCertificates是字符串(175非空)。没有获取公司JSON文件，不能据样本宣称全库穷尽，照片未见High Q。

最新交付是deliverables/Murata-Step4-v2_4-offline/：网页v2.4、单文件Convert-MurataDatabase-v3_4.ps1、README、JSON-fields-synthetic-test.png。原字段优先，医疗已确认用途排除于三个过滤之外，未知保留待核查；Standard与EIA/JIS/MURATA温度标准分开，AEC资格独立显示，原证书链接仅http/https且未核验。新转换器保留四项分类原值和审计，默认重新整理既有CheckedSamples，不扩大目录。用户需在公司跑v3.4并在v2.4导入新目录的汇总+产品JSONL，旧文件未保存的字段不能自动补回。保留v3.1/v3.3脚本和v2.3网页。生成器现生成最新版本。

117项测试、vue-tsc、H5/独立网页构建通过，实际浏览器三条合成数据验证默认民用仅一条、Standard/特征原值和证书链接正确展示。清除本次临时合成数据，截图明确非公司产品。详细证据与行为见docs/MURATA_CLASSIFICATION_JSON.md和交付README。完整目录统一测试仍后续，API第六步，报价Excel最后。文件保存在工作区，不声明Git/云端。

## 2026-10-05 v2.4.1 启动诊断（公司白屏尚未定因）

用户通过复制邮件正文并将下载文本改成HTML后公司白屏。本机v2.4原HTML与用户副本TXT的SHA256完全一致，61985字节、最长行27660字符，脚本语法正常、闭合完整；不能把邮件截断或公司策略视为已确定原因，需用户F12 Console首条红色报错照片。未获取公司下载后的实际文件，不协助改后缀/编码/拆分以绕过公司邮件拦截。

新增scripts/offline-page.mjs，静态提示置于主界面外，独立bootstrap捕捉主脚本语法/运行错误，成功生成主界面才隐藏提示；脚本缺失或未执行仍有静态文字，严重HTML损坏仍可能白屏。保留CSP和无网络访问；失败信息textContent输出。生成器最新输出deliverables/Murata-Step4-v2_4-offline/Passive-PN-Translator-v2_4_1.html，保留旧v2.4与用户副本，不需重新整理数据库，v3.4数据兼容。UI仅版本文字改v2.4.1。3项启动诊断测试及vue-tsc、独立构建通过；实际浏览器正常页与模拟运行失败验证，Startup-error-synthetic-test.png为合成故障，不能当成公司错误证据；临时页和测试脚本清除。README_v2_4_1.md包含公司排查与已知证据。仍需用户提供实际公司错误照片，文件仅保存在工作区。

## 2026-10-06：公司 v2.4.1 白屏根因已复现

公司照片提取的代码为 `source:https://www.murata.com/en-global/products/capacitor/ceramiccapacitor/overview/lineup,checkedAt:`，网址两端的双引号丢失；原件应为 `source:"https://www.murata.com/en-global/products/capacitor/ceramiccapacitor/overview/lineup",checkedAt:`。本机删去这对引号，将 UTF-8 BOM 去掉、换行改为 CRLF、末尾添加一个 CRLF 后，SHA256 精确等于公司文件 F71208835D8F1184476B84F7FF23DEFA58421C36A36048DAE183038E97CD779E，并复现 `SyntaxError: Unexpected token ':'`。因此这份文件的程序内容差异已经确定；不能确认是哪个编辑或传递环节丢失引号。之前一张第65行主脚本的照片是旧版结构，后续带文件地址的照片已确认新版结构，不再把版本混淆作为本次根因。

新增 `scripts/Repair-PassiveTranslator-v2_4_1.ps1`：只接受已确认的损坏文件 SHA256；恢复该网址的引号、原件 UTF-8 BOM 和 LF 格式；在写入前要求结果 SHA256 精确等于原件 BE1893CE81D78DBFDABD1000E62921F47EB5AA435EAE676E9D460AD0785C7117。另存 `-repaired.html`，原文件保留，修复目标已存在则不覆盖。Windows PowerShell 5 实测修复输出与本机原件逐字节一致，输入文件保留；临时样本已清理。公司尚未回报实际修复后打开结果。此修复不读取或重整公司产品数据库，不改变浏览器安全策略，不提供邮箱过滤绕过方式。

## 2026-10-06：第五步 v2.5 批量导入与导出

用户确认应用范围已出现，完整目录仍未导入，授权继续下一步。新增 src/utils/batch-files.ts：读取 .xlsx/.xls/CSV UTF-8，选工作表/输入列/标题、预览后导入，每格完整输入，5MB、100条、1001表格行/100列/50表限制；保留原表行号与Excel格式前导零，所选公式缓存/布尔/错误/内部换行拒绝，不截取超限记录。shared translator 两模式分别保存文件映射/输入/结果，清除当前模式取消旧文件任务；编辑输入解除来源行映射，新官方目录清旧结果保留输入。H5批量路由复用同界面，旧空壳替换。

查询结束可导出当前显示正常候选Excel/CSV或已选Excel。Excel查询汇总+候选明细，CSV展开关联；失败/无候选保留，普通导出不含NRND/review，明确勾选可导出核查料且有分组标记；分别保留总数/显示数、单位/DC/AC/安规类别、生命周期、应用/标准/特征/依据、未核验链接。不会自动挑一个PN，不填报价申请表。XLSX格为文本，CSV转义且中和公式前缀；模板两模式CSV。使用现有xlsx依赖，无新增依赖。

新版 deliverables/Murata-Step5-v2_5-offline/Passive-PN-Translator-v2_5.html，SHA256 38D3F770CC495595468D1A0BD93B53070FDEE55454161E3D76A80EEAE21359DC；build:official-preview现在只生成v2.5，旧v2.4.1字节保持原SHA BE1893CE81D78DBFDABD1000E62921F47EB5AA435EAE676E9D460AD0785C7117。offline-page版本参数默认旧版供启动诊断兼容，实际构建显式v2.5，末尾标记PNREP_V2_5_FILE_END。两段脚本语法检查通过。

新增20项文件/导出测试，全套140项通过，vue-tsc、H5/离线构建通过。本机浏览器真实CSV选列预览及逐行查询验证行2/4/5、错误行保留、跨模式文件映射/输入/结果保留，无控制台错误；Batch-browser-test.jpg为合成输入，无公司数据。导出按钮显示文件生成，但工具下载事件超时，未声称浏览器下载/Excel应用打开验收；XLSX文件自动测试写出重读通过。IAB访问独立HTML路径遇ERR_BLOCKED_BY_CLIENT，未降低CSP或绕策略，独立HTML公司浏览器仍待测试。临时CSV已清理。

公司沿用v3.4生成的两个文件；分类字段及应用规则不变。完整目录统一测试仍后续公司阶段，API第六步，报价申请Excel自动填写最后。公司原始库/API密钥未读取或外传，公司邮件限制不绕过。使用及限制见docs/MURATA_STEP5.md与新交付README。代码/文档保存工作区，未Git提交或云备份。

补充上一节修复状态：用户随后报告修复校验值，并确认应用范围已经出现，因此旧公司v2.4.1白屏已经恢复；不能再把旧故障写成等待打开验证。

## 2026-10-06：用户要求 v2.5 分为多个 TXT

用户报告1–138行可发、139行以后被邮箱拒收，随后明确要求拆成TXT。已将个人项目原始v2.5 HTML原字节按UTF-8边界拆为8份，每份约64KB，保存deliverables/Murata-Step5-v2_5-text-parts/；未发送邮件、未接触公司数据、未改HTML/应用/CSP/邮箱策略，未加编码包装或混淆。README.md提供按01–08顺序合并并先校验完整性的PowerShell命令，CreateNew不覆盖原文件。已实际在Windows PowerShell5运行README原命令，生成509010字节HTML，SHA256与原件一致38D3F770CC495595468D1A0BD93B53070FDEE55454161E3D76A80EEAE21359DC。临时验证文件逐个清理。README明确通过公司允许渠道传入，分片不保证过滤接受，复制邮件正文可能改变字节导致校验失败；不得把本机拆分成功当成公司投递/部署完成。旧交付保持完整。仅保存当前工作区，无Git提交或云备份。

## 2026-10-06：公司 AI 的 v2.5 实施文档

用户要求让公司 AI 在公司环境补入 v2.5，已按本地实际实现编写 deliverables/Murata-Company-AI-v2_5/公司AI实施任务_v2_5.md 及内容相同的 UTF-8 TXT。文档可整体作为提示词，要求附公司当前可运行 v2.4.1 HTML/已有源码；规定最小改动、批量读表与限制、A/B 状态和异步任务、来源快照、默认/已选导出及完整列、模板、离线 Excel 库依赖和逐项验收。应用/标准/特征沿用现有功能，不编造候选，不扩大目录，不接 API、不填报价申请表。无 Excel 库时只允许明确标注 CSV 部分完成，不假冒完整 v2.5。已检查 UTF-8 和两版本逐字节一致，只有文档变更，没有重跑代码构建或声称公司 AI 已实施/公司已验收；没有发送邮件或外传公司数据。

## 2026-10-07：公司八份 v2.5 分片合并失败已定因

用户已传入全部八份，正常合并整份 SHA256 失败，未生成 HTML。照片显示 part02–08 原始校验值全部一致；part01 为63624字节、SHA256 53B49EACB2228D9939BED4B6962ED37F6DE984242550F7F4165A02756F1178EC。进一步照片确认无BOM、LF120、CR0、双引号2297；原片63627字节、LF118、引号2299。仅去BOM并不匹配；最终精确复现：去BOM、删 source 中同一 Murata lineup URL 两端双引号、末尾加两个LF。复现SHA256与照片一致，可确认这三个内容差异，不能确认发生环节。不要再建议只补BOM或按文件大小猜测。

新增 deliverables/Murata-Step5-v2_5-text-parts/Repair-Merge-PassiveTranslator-v2_5.ps1 及恢复说明.md：只接受已知损坏或原始part01，内存恢复后校验单片 C325EFE091AB8024411BFA5DB677AA51DEE72D0480B8DDE538215FA045323D82，再合并全部，整份校验必须仍为38D3F770CC495595468D1A0BD93B53070FDEE55454161E3D76A80EEAE21359DC，CreateNew另存restored.html，八份TXT不变。不读公司目录、不联网、不改变邮箱/浏览器策略。本机Windows PowerShell5精确损坏夹具测试成功且输入未改，已有输出拒绝覆盖、另一分片损坏拒绝写出，临时测试已清理。公司执行和v2.5功能验收仍待回报；完整目录/API/报价阶段安排不变。

## 2026-10-08：公司 v2.5 已打开，开始功能验证

用户报告已经成功打开修复后的网页，要求测试数据；启动恢复已由用户确认，尚非批量功能或完整目录验收通过。本机直接打包现有官方翻译模块到内存核对8条描述、6条料号，不生成新测试/数据库文件。描述包含008004小容值、100nF/0.1uF等值、太阳诱电对应参数、10uF、部分条件以及16V/25V冲突（应报多电压）；B包含三星CL10B104KO8NNNC、TDKC1608X7R1H104K080AA、太阳诱电MSASP063EB5475MFNA01、INVALID_PN（应报错）、三星重复和小写输入（规格与原三星行一致）。建议用户自带模板/Excel录入测试批量预览、空行行号、两模式保留、全部输入汇总和默认/已选导出；当前候选数依赖实际导入样本，不固定承诺。尚未进入第六步。

## 2026-10-08：用户要求先归档其他 API 产品类别

题外的明确行动请求：公司申请的官方 API 似乎不限 MLCC，先下载所有开放类别原始 JSON，以后再整合网页。官方 https://www.murata.com/en-global/support/api 确认 v3 于2026-03-25发布，类别从3扩至73；支持获取批量规格JSON下载链接。完整类别 ID 手册链接 https://pim.murata.com/asset/pim4/__common/products-v3-en 在此环境403，搜索未取得清单，已异步询问用户仅提供 category 表原文、不要密钥。不能根据名称编造73个ID，也不能承诺当前账号全部授权。

已新增 deliverables/Murata-All-Catalogs-v1/Download-MurataProductCatalogs.ps1、下载说明.md、categories-mlcc-smoke-test.txt。仅已确认 category=ceramicCapacitorSMD 来自前期公司v3 endpoint；默认73类严格计数，首次明确 ExpectedCategoryCount=1 测单类。响应字段默认 ProductDataDownloadUrl 来自旧官方文档，v3详细响应表尚缺，README明确需公司首次确认或按手册指定UrlField；不猜测嵌套地址。实际请求协议/各类权限仍未验证。

工具PS5.1、自包含、公司隐藏输入密钥，不写密钥或签名链接；API只固定v3域名路径带x-api-key且不跟随重定向，文件请求不带密钥、最多5次HTTPS跳转。每次独立新目录，每类单独保存原始字节，流式UTF-8 JSON语法检查（含BOM、截断容器、尾随内容），SHA256/大小/时间/阶段记录manifest+summary；失败保留partial不作正式JSON，API401/403停止其余类别，临时错误最多三次。语法验证不等于产品schema/数量/完整目录/翻译就绪，summary标明false。未访问公司数据或真实API，未发送邮件，不改公司运行/浏览器策略；工具已准备但全73类列表和实际公司运行仍待完成。现有v2.5页面SHA仍38D3F770CC495595468D1A0BD93B53070FDEE55454161E3D76A80EEAE21359DC，无改动。

scripts/Download-MurataProductCatalogs.Tests.ps1 在Windows PowerShell5执行39项离线验证通过（mock transport，无联网/真实密钥）：计数/重复/路径、URL结构、key域名限制、JSON语法/严格UTF-8/BOM/3MB多记录、原字节不改、前次归档不覆盖、manifest无密钥URL、失败保留partial、auth停机和有界重试。合成fixture已逐文件清理。本次只归档工具，未接其他产品翻译，也未完成第六步完整MLCC接入；原v2.5公司功能测试和报价最后安排不变。只保存工作区。

## 2026-10-08：上传的中文 OpenAPI 文档补齐73类别清单

用户问“你读的是这个吗”，附件 C:/Users/tyson/Downloads/murata-products-info-openapi-zh (1).json，935255字节。如实说明之前仅官网介绍页、现在已读取附件。title为产品信息API版本3.0，openapi=3.0.0是规范版本、info.version=1.0是文件标识，业务路径确实/v3。文档确认GET /v3/products/getproductdatadownloadurl、返回顶层ProductDataDownloadUrl（并含Category、Language）、x-api-key请求头、语言ja/zh/en、URL生成后7天有效。不请求文档中的示例签名链接。

components.schemas.products-v3.properties 恰有73个键，逐一验证其$ref为#/components/schemas/products-v3-{相同键}且对应schema存在，按原大小写提取 deliverables/Murata-All-Catalogs-v1/categories-v3.txt，名称和原文件SHA及提取路径存categories-v3-index.json。不按中文名称猜；category参数无enum，清单依据此文档类别结构键，实际ID权限仍需公司API执行确认。发现真实类别1UFrontEnd数字开头，修正列表验证允许首字母或数字且继续拒绝路径符号。更新下载说明，撤销“缺类别表/返回字段未确认”等旧状态。Windows PowerShell5新共40项离线检查通过；原文档响应例仅本地解析HTTPS字段验证，不访问网址。附件是API说明+结构定义+少量示例，不是73类产品实际全量目录。公司运行下载未开始，其他类别翻译未接入。

## 2026-10-10：客户 CAP/CH/H/RO 描述支持，v2.5.1 公司迁移

用户要求支持七条客户描述并能迁移公司电脑。异步确认：H 是标称高度；RO 含义未知。已在真实项目官方查询路径实现，不改旧规则拼号引擎/竞争对手解码：CAP完整词作为标签，CH+4/6位数字英制封装，H正数mm写入query.nominalHeightMm并严格对比spec.thicknessMm（浮点close沿用），不使用最大厚度、不接受更薄替代、不加H则不限制。+/-20%原来已支持，本次增加原始七行回归验证。RO完整词进入query.unverifiedRequirements，只作为待确认：允许已识别参数候选，officialMissingFields从query重算RO待确认，全部kind为partial、查询和候选提示未核对RO，不猜RoHS；其他未知词/冲突/非法高度仍报错。匹配诊断新增标称高度，导出末尾追加标称高度(mm)、最大高度(mm)，旧列次序保留。RO候选如在产字段一致仍在正常生产分组可复制导出，但页面/导出明确部分参数匹配，不能宣称RO已满足。
源码：src/engine/official/query.ts、matcher.ts，src/official-preview/translator.ts帮助和版本，src/utils/batch-files.ts，首页版本，scripts/build-official-preview.mjs新输出路径；新增测试在tests/engine/official.test.ts。150 tests、vue-tsc、H5 build、standalone build通过。Node vm.Script核对独立页两个脚本语法、离线CSP及末尾标记。无新增浏览器交互验收/公司产品数据验证。
交付deliverables/Murata-Step5-v2_5_1-offline/Passive-PN-Translator-v2_5_1.html，511208字节，SHA256 E8A6E1096C501423F1ED583F8236FC1420B5FD33EAB61E3D0A14799B5EF51D22；同目录公司迁移说明.md、公司AI更新任务.md、客户描述测试.txt、SHA256SUMS.txt。公司另存新HTML重新导入原summary+products JSONL即可，无需仅因语法升级重跑转换；实际字段缺失和样本覆盖仍如实限制，七行含RO均只部分匹配。旧v2.5 HTML SHA仍38D3F770CC495595468D1A0BD93B53070FDEE55454161E3D76A80EEAE21359DC。未自动发送邮件/绕过过滤/访问密钥/公司数据，未接全部产品目录，第六步和报价最后安排不变。
默认命令环境初始化报setup refresh errors，沙箱外执行读写工作区和验证成功；apply_patch因工作区reparse point失败，随后使用精确上下文替换写入授权工作区，无未知文件覆盖。只工作区保存，无Git提交/云备份。

## 2026-10-10：公司原 v2.5 增量升级，不再依赖公司 AI

用户明确不要公司 AI，要求将新增功能传入公司并更新原八片合并的 v2.5。新增 scripts/build-offline-upgrade.mjs、Upgrade-PassiveTranslator-v2_5_1.template.ps1 和 Upgrade-PassiveTranslator-v2_5_1.Tests.ps1；交付 deliverables/Murata-Step5-v2_5_1-upgrade/ 下 Upgrade-PassiveTranslator-v2_5_1.ps1（5606字节）、Passive-PN-Translator-v2_5-to-v2_5_1.patch.json（121193字节）、升级说明.txt、SHA256SUMS.txt。补丁是普通 JSON 复制范围/新增明文文本，非编码包装/混淆或可执行指令；没有拆分或发送邮件，不提供邮箱限制绕过。通过公司允许的渠道传入，受执行策略限制请 IT 提供批准方式，不建议 Bypass。

工具在本地读取现有完整 HTML；严格要求原 v2.5 SHA 38D3F770CC495595468D1A0BD93B53070FDEE55454161E3D76A80EEAE21359DC（509010字节），补丁 SHA 2BA0782F398151C229BBC8495267BA72ADAD9E85E5E122A3529D0E26EF12CA66 固定于工具；所有操作在内存，输出严格要求 v2.5.1 SHA E8A6E1096C501423F1ED583F8236FC1420B5FD33EAB61E3D0A14799B5EF51D22（511208字节）后才 CreateNew 保存到旧网页旁 Passive-PN-Translator-v2_5_1.html。原件、八片、产品数据均不改。不联网、不读取公司产品库、不安装依赖；JSON 仅供升级工具读取，不能用产品目录导入按钮。新增网页需重新导入原summary+normalized-products JSONL，客户 H/RO 语义和目录范围限制沿上一节。

支持同目录自动查找唯一精确原件及 -HtmlPath 指定/重命名原件；多份、缺失、修改/损坏版本、补丁损坏、已有输出都拒绝。Windows PowerShell 5.1 实跑19项检查通过，中文/空格路径、自动和指定输入、逐字节还原、保留原件及拒绝错误路径均通过；合成夹具在核实工作区路径后清理。只是交付新增升级器，之前150项功能验证继续适用，未重跑未改引擎、不声称公司升级已运行。公司 AI 文档作为旧交付保留，后续默认使用增量升级，不再建议公司 AI 修代码。工作区原 v2.5/v2.5.1 字节不变，无提交或云备份。

## 2026-10-10：用户确认公司增量升级成功，进入第六步完整来源接入

用户报告“好了，成功运行了，继续做吧”，确认前次升级工具公司已成功运行（不等于客户7行/完整目录验收全部通过）。异步问原始目录是否仍在，用户明确“保留了原始 Murata_MLCC.json”。因此本轮不索要数据库/密钥、不重新下载、不请求真实API，走公司本地 Full 转换现存来源；最新官网下载核对仍后续。

发现浏览器 JSONL 原上限128MB/100000条可能拦截全量，改 src/engine/official/catalog.ts 为有界流式512MB/250000条，导出常量 OFFICIAL_CATALOG_LIMITS；原16MB单行、严格UTF8、超限拒绝及最终目录结构/来源/计数校验不变，不截取样本。解析对象仍需内存，不声称512MB真实公司目录性能已测。matcher新增Full来源范围提示：读完选定来源不等于官网完整/最新，没有结果不能证明官网不存在；UI版本v2.6、范围文字同义并显示读取上限。首页版本及独立构建输出到新目录。原v2.5和v2.5.1 HTML SHA未变。

新增 scripts/Prepare-MurataFullCatalog.template.ps1 和交付脚本：默认弹框选原始JSON，可 -InputPath/-OutputRoot/-ConverterPath 指定；校验原版v3.4转换器SHA，调用未改的v3.4 -Mode Full；原始文件只读，前后SHA/大小/时间复核；完成且modeFull/fullDatabaseRead/数量符合才生成 full-catalog-preparation.json/html，记录处理原始数（产品+完全相同重复数）、产品/一致/核查/冲突数、系列分布、输出大小及SHA、符合v2.6限制的布尔，官网覆盖/公司验收/规格书核验均false。默认桌面Murata_Full_Catalog/normalize-*，旧样本/旧结果不覆盖。输出用于网页的仍是同次 normalization-summary.json + normalized-products.jsonl；报告/原库不直接导入。超过大小/记录上限只报实际范围，不截取。实际WindowsPS5验证发现参数默认表达式PSScriptRoot可能空，已移到函数体后赋默认；Get-FileHash在Node子进程环境不能自动加载，工具改用.NET流式SHA，自包含，不改公司运行策略。

交付 deliverables/Murata-Step6-v2_6-offline：
- Passive-PN-Translator-v2_6.html 511891字节，SHA CF2D7A2617B4004D40DBFA934FFF277F8BFA8323ABFED1A8DEEC1C13BDA6D8F4
- Upgrade-PassiveTranslator-v2_6.ps1 5612字节
- Passive-PN-Translator-v2_5_1-to-v2_6.patch.json 61850字节，SHA F4F46C7B4B1FD85416C81C54243BABD06BF565796FA45E32BA8F4544026358ED
- Prepare-MurataFullCatalog.ps1 8240字节
- Convert-MurataDatabase-v3_4.ps1 33001字节（原件副本，未改）
- 第六步操作说明.txt、SHA256SUMS.txt。
只需传四个工具/补丁原文件约109KB，无需整份网页/原8片。放公司原v2.5.1网页旁，先 & ".\Upgrade-PassiveTranslator-v2_6.ps1"，再 & ".\Prepare-MurataFullCatalog.ps1" 选原始Murata_MLCC.json；查看新报告，再新网页选同次两个文件。若需要完整HTML备选仍有原件。升级器严格只接受原v2.5.1 SHA E8A6E1096C501423F1ED583F8236FC1420B5FD33EAB61E3D0A14799B5EF51D22，补丁/最终输出全部校验，CreateNew保留旧版。无编码包装/混淆/发送邮件/绕过滤或策略。

scripts/offline-delta.mjs 提取本轮复用文本增量算法，新 scripts/build-step6-deliverables.mjs 校验固定已审查原件、独立脚本语法/CSP/末尾标记、逐字节重构，生成升级器与原版转换器/整理脚本/清单。旧 build-offline-upgrade.mjs 未改，旧交付未覆写。新 Upgrade-PassiveTranslator-v2_6.Tests.ps1 实际WindowsPS5跑19检查（成功精确还原、中文路径、自动/指定、原件保留、损坏拒绝、缺失/歧义/已有输出拒绝）。

新增 tests/engine/full-catalog.test.ts 5项：模拟声明129MB跨旧上限（不是129MB性能测量）、100001真实简短记录跨旧记录上限及250001拒绝、不良UTF8/原JSON包装拒绝、实际PS Full转换含完全相同重复/NRND/分类/H/RO并用引擎读取匹配、截断源不发布准备成功报告；更新旧128MB拒绝断言为512MB。全套155测试/13文件通过，vue-tsc/H5/独立构建通过，现存Sass/包大小提示；无新浏览器真实全量/公司产品数据性能验证。
docs/MURATA_STEP6.md与公司TXT操作内容一致，包括统一测试、7条RO仍partial、应用范围/单位等价/模式切换与批量导出、先回报本地报告照片及导入总数，不传公司原始数据/API密钥。第六步工具已交付，实际公司Full执行/导入/统一核验待用户。报价表自动填写仍最后。公司原文件如过旧或缺官网PN，必须后续公司API更新来源，不能承诺官网全部已收录。无Git提交或云备份。

## 2026-10-11：完整导入确认与高度/布局更新交付

公司截图确认Full导入115098条，consistent70505、review44593、冲突0、182.32MB。目录 C:/Users/MCS11096/Desktop/Murata_Full_Catalog/normalize-20261010-183208-bb4631；来源为公司保留的Murata_MLCC.json，不代表官网最新全部覆盖。本机未读取公司原库/API密钥。
用户最新确认H是最大允许高度（覆盖此前标称高度），第一条22uF/X6S/10V/0603无匹配正确。query.maxHeightMm按spec.thicknessMaxMm<=H核对；缺最大值拒绝、不用标称猜。RO仍partial。用户明确新增筛选为全部AEC-Q200，只读原Specs.Characteristics标签，不称G2、不推Grade。缺失/否定/对象/未经校准合并标签不自动认定；特点AEC与合规false冲突放review，非AEC输入与checkbox冲突拒绝。筛选提示保留导出。
共享UI默认checkbox+可点击/键盘展开PN+小字描述状态+复制，完整详情hidden到点击。未匹配原因在输入右侧小字，诊断折叠；A/B保留各自输入/结果/选择/应用/AEC筛选。normalGroup由引擎分组传入防review被普通复制。未新增批量PDF，建议另步做选PN->下载清单->公司本地工具。
交付 deliverables/Murata-Step6-v2_6_1-offline：高度HTML512179bytes SHA A0299EA42168DC659F906324C8A9DE3C3CE151C867FEC014929B7A5E606E2061；patch1649bytes、updater5606bytes；基于原v2.6 CF2D7A2617B4004D40DBFA934FFF277F8BFA8323ABFED1A8DEEC1C13BDA6D8F4。
交付 deliverables/Murata-Step6-v2_6_2-offline：布局/AEC HTML517502bytes SHA C139C0ACEEA39CB8933B9CAD2C84B1E116386413609951667834510854A841B2；patch238521bytes SHA 52A6424A699EDF5B4BED1D03106A21CD3A8481DB8C0DF53F5F43B43A2DB81B59；updater5618bytes；基于上述v2.6.1。scripts/build-height-deliverables.mjs、build-compact-deliverables.mjs生成/验证两段脚本、CSP、尾标记、逐字节还原。
公司总说明 docs/MURATA_COMPACT_RESULTS_V2_6_2.md；高度说明 docs/MURATA_MAX_HEIGHT_V2_6_1.md；各交付目录升级说明.txt/SHA256SUMS.txt。通过批准渠道传四个原文件，先高度再布局，原网页保留、CreateNew拒覆盖、严格hash、不联网不读数据库；新网页重新导入同次summary+JSONL，不重跑整理。旧v2.6及v2.6.1字节保留。源码默认构建为v2.6.2，不覆盖旧高度交付。
最终159单测/13文件、vue-tsc、H5/离线构建通过；两个更新器WindowsPS5.1各19checks通过。Cua浏览器合成3行：AEC仅特点、冲突review、默认折叠/点击及键盘展开收起、复制正常数量1不混review、未匹配摘要和折叠诊断、模式切换输入/结果/选择/筛选恢复、console无warn/error。clipboard读为空，不宣称逐字验证。compact-preview-synthetic.png为合成截图。公司真实115098条目录高度/AEC验收仍待复测。最后新增导出筛选说明仅文字无UI结构变化。无提交/推送/云备份，批量PDF和报价自动填仍另步。

## 2026-10-11：v2.6.3 批量/已选物料规格书下载

用户问页面能否批量下载规格书和选中物料下载，本轮已实现共享H5/离线UI两个入口。公司单文件页面维持connect-src none，不自动fetch官网/CORS或改变公司策略：按钮生成任务面板，保存JSON清单和自包含WindowsPS5.1工具；用户本地运行工具后实际保存PDF。必须如实说明不是点击网页直接自动保存全部PDF。

下载当前结果：全部查询“当前显示的正常生产候选”，不取整个产品库/未显示更多页/未明确选择review。下载已选：只取勾选候选，可含明确勾选review；无选择提示，任务快照调整选择需重新点击。新search/catalog/reset清面板，A/B各自保留。src/utils/datasheet-download.ts纯计划生成：PN和URL去重、共享URL保留PN关联、缺失和拒绝链接独立清单、1000PN/1000URL上限、报错结果不进入计划，绝不猜URL。

只接来源已有HTTPS URL，exact hosts pim.murata.com、search.murata.co.jp、www.murata.com，凭据/异域/非443/控制字符拒绝。src/utils/datasheet-downloader.ts导出可下载的PS原文（JSON字符串）；deliverables/Murata-Step6-v2_6_3-offline/Download-MurataDatasheets.ps1为相同可读原文件，测试逐字相等。工具本地读清单弹框或-ManifestPath/-OutputRoot，GET顺序下载，无API密钥/登录凭据，最多5次官方HTTPS重定向、30s请求/读取超时、50MB/文件，首字节PDF头/接收大小核对。每次新桌面Murata_Datasheets/download-*，序号+安全代表PN文件名，CreateNew partial/成功Move不覆盖。失败清理仅本次partial并继续，report JSON逐项保存所有共享PN、URL、成功/失败、bytes、原因、missing/rejected。HTTP异常Response及时Close；不记录响应内容/跳转URL；pdfContentVerified=false不把下载当规格核验。旧文件不变。

交付 v2.6.3（533920bytes）SHA 9A9AD64129371E0523EFFF351D8674C33F4F8F223A9DE93940ED7CF31718C139；patch245543bytes SHA B8B7CD51BC588EA70D65ABFBF097F64E62611D150E57945757FB92D61E20D5B4；updater5618bytes。严格base v2.6.2 C139C0ACEEA39CB8933B9CAD2C84B1E116386413609951667834510854A841B2。scripts/build-datasheet-deliverables.mjs检查固定base、2脚本语法、CSP/尾标记、逐字节还原，生成工具/patch/说明/含下载器的SHA清单。docs/MURATA_DATASHEETS_V2_6_3.md含迁移和使用说明。公司先完成前次v2.6.1、v2.6.2，然后只传本次updater+patch原件，通过批准渠道，保留旧版；新网页重新导入原两个产品JSON，无需重整库。下载工具可在新网页另存或从交付目录直接取。

全套165tests/14文件通过，最后HTTP异常资源释放修改后6个下载计划用例再跑通过；vue-tsc/H5最终构建/离线脚本检查通过。WindowsPS5.1下载器46项离线mock检查（真实文件、限制、坏重定向不发请求、循环上限、HTML/截断/大小/HTTP失败、已存在PDF与partial不覆盖、批次失败继续及report）；更新器19项完整性/保护检查通过。另实际PS5.1下载公开GRT155R60J106ME13-01A官方PDF成功1/1，无API或公司数据，地址 https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRT155R60J106ME13-01A.pdf 。公司网络权限/所有来源链接有效性仍需公司实测。

Cua浏览器4行synthetic：两个下载按钮可见，无选择提示；普通范围3PN/1URL/1missing，不混review；已选A+review是2PN/1URL/0missing；JSON实际下载到用户Downloads/Murata-Datasheets-displayed-1791719544830.json，读取校验scope/PN/关联/缺失正确。save manifest download事件工具意外耗时828s，其间非主动sleep；其余UI操作正常，console无warn/error。datasheet-download-preview-synthetic.png为合成截图（关联公开PDF只用于功能验证）。不把合成PN当真实数据库料号交付。浏览器没有检查公司115098条目录的下载全覆盖，不能宣称全部成功。

旧v2.6.2及之前交付保留，无Git提交/推送/云备份。批量PDF现在已有可用本地流程；报价表自动填仍未实现。默认构建已转v2.6.3，不能覆盖旧v2.6.2 HTML（它是升级base）。


## 2026-10-11 v2.6.3 revised: two-step datasheet link dialog
User approved replacing PDF download tasks with selected PNs → modal checkboxes + PN + small description → confirm open links. No need to wait for company upgrades; install existing v2.6→v2.6.1→v2.6.2 first, then this new v2.6.3 patch. Previous downloadable v2.6.3 release archived at deliverables/archive/Murata-Step6-v2_6_3-download. Active release folder no longer carries downloader PS1/old screenshot; source utility remains only for archived-release tests. Same version filename, NEW hash; never mix old/new patch and updater.
Shared translator now uses native dialog, max 5 synchronous noopener,noreferrer window.open attempts per explicit confirmation, URL dedup, dynamic second selection, missing-links disabled, row link fallback always available, Esc/cancel restore original results selections. Current displayed normal and explicitly selected normal/review scopes remain. No browser network before confirmation, no full catalog rescan, CSP connect-src none unchanged. Dialog closes with view reset/mode change/dispose.
Active HTML bytes=524885 SHA256=C8C5DE4D17E3A39A5A404FCAD225A4EB7692B928C25D43CDAAF98F3708CA3B50; patch bytes=248071 SHA256=FA91F86862574904C38A1D6752610313A5377973472DCC7B778D1DDA30C7860E. Upgrader updated and PS5.1 19 checks PASS; 166 unit tests, vue-tsc and H5 build PASS (existing Sass/large chunk warnings). Builder verifies two scripts syntax/exact reconstruction/pinned v2.6.2 base. v2.6.1/v2.6.2 artifacts preserved.
Browser synthetic UI verified initial selected scope, missing-link disabled, secondary deselection disables confirm, cancel/Esc preserve results checks, normal scope excludes review, explicitly checked NRND retains warning, two PNs share one URL, 6 URLs attempted in batches 5 then1 without duplicates. Test fixture intercepts window.open; no synthetic URL requested. Initial fixture error due missing review issue was corrected; no subsequent UI error. Public URL/network/company catalog not tested in this turn. Preview: deliverables/Murata-Step6-v2_6_3-offline/datasheet-dialog-preview-synthetic.png. Docs: docs/MURATA_DATASHEETS_V2_6_3.md (includes upgrade order and old same-name output handling).


## 2026-10-11 v2.6.3.1 popup regression fix
User company verified first two upgrades OK and v2.6.3 modal + secondary checkboxes work, but confirming four links opens only first tab. MDN Window.open documents separate gesture per popup; previous max-five-loop is unreliable. Fixed source to request exactly one link synchronously per click; remaining queue intact, dynamic next-associated-PN and remaining count, per-PN requested status (never says loaded), direct row links remain for retry; noopener/noreferrer unchanged, no popup-setting changes or timed automation. New helper nextDatasheetLink covered four-step queue/dedup/deselection regression.
New current release deliverables/Murata-Step6-v2_6_3_1-offline; installed v2.6.3 exact C8C5DE4D17E3A39A5A404FCAD225A4EB7692B928C25D43CDAAF98F3708CA3B50 is upgrade base, old artifacts preserved. New HTML bytes525815 SHA256=3CFC3B7DAD5780CBF26287094B5C3E3F2ED5A9AF7A7A868986AD49C6108FF259. New patch bytes133758 SHA256=BC3ADD3360B9CEB3F5EEB97831E6FEC41A5B625F7681B82BD8FFB741748EF174. Script scripts/build-datasheet-single-deliverables.mjs pinnedbase/syntax/CSP/reconstruction. Default preview builder now v2.6.3.1. Docs MURATA_DATASHEETS_V2_6_3_1.md.
167 tests, typecheck, H5 build passed (existing Sass/chunk warnings). Browser fixture used actual window.open mapped to four local stub pages (not mocked return); four independent user clicks actually created four tabs /spec/1..4 with remaining3,2,1,0 and no errors. Screenshot datasheet-single-preview-synthetic.png. Initial new updater test expected old-version diagnostic; corrected test assertion string, updater itself works. Company network/real PDFs not tested here.

Final v2.6.3.1 updater PS5.1 19 checks PASS after correcting both stale diagnostic strings in new test. Temporary tabs 7..11 and test server/fixtures cleaned up; user tab1 preserved.

## 2026-10-13 v2.6.4 responsive workbench

User approved desktop left input/filter and right results, including initial empty page; selected Excel export stays outside More. Company previously confirmed v2.6.3.1 works in Chrome and Edge. Shared src/official-preview/translator.ts and style.css now render this layout for both Vue H5 and standalone HTML. Compact catalog bar collapses metadata after import; batch/examples/help nested by default. Main result toolbar always shows selected unique count, copy selected, open selected datasheets, export selected Excel (disabled without selection); secondary actions in More. Candidate summaries stay small and details expand on PN. A/B results, inputs, filters and selections independent. Show-more now retains per-query selected Set instead of recreating it. No matching/schema/data-source changes; H remains maximum, RO unknown, AEC filter from raw characteristics, NRND review preserved, one datasheet window per user click preserved.

At >980px use two columns; sidebar sticky only if measured full height +32 fits viewport. ResizeObserver and window resize keep this accurate and are removed on unmount. Short windows/expanded help use normal page scroll; textarea max height 300; <=980px stack. Current builder default v2.6.4; old artifacts must remain byte-identical.

Release deliverables/Murata-Step6-v2_6_4-offline. HTML bytes533786 SHA256=84659816C5B503E530C9DA10169B35C334C51AF254817C949DD565BC5FF17DE8. Delta v2.6.3.1→v2.6.4 bytes209975 SHA256=0C2772BAE1C22119C3897A3464B8B53F7260E66D3533B3F915FCC541D6402371; updater5630bytes. Base pinned v2.6.3.1 SHA256=3CFC3B7DAD5780CBF26287094B5C3E3F2ED5A9AF7A7A868986AD49C6108FF259. scripts/build-workbench-deliverables.mjs checks fixed base, both scripts syntax, CSP connect-src none, exact delta reconstruction; updater refuses altered inputs/patch, ambiguity and existing output. Company needs only updater+patch via allowed channels, run beside original page, import same summary+jsonl; no renormalization or company upload. docs/MURATA_WORKBENCH_V2_6_4.md copied as release upgrade instructions.

167 unit tests passed; final vue-tsc/H5 build passed after selection fix (existing Sass/chunk warnings only). New scripts/Upgrade-PassiveTranslator-v2_6_4.Tests.ps1 passed19 in WindowsPS5.1. Browser actual standalone imported synthetic42 pair and exported real XLSX; opened downloaded XLSX with xlsx and confirmed exactly SYNTHETIC_01/02 candidate rows, matching clipboard and modal. Shared-source fixture then checked show-more selection preservation, A/B and clear independence, empty state disabled, AEC filter20normal+1review, PN expandable classification. Responsive:1440x1000 fits/pins(left top16 at scroll1158),1440x650 unpins, expanded full help1128px unpins,375x812 stack/document width360 without overflow. No browser console errors. Saved workbench-preview-synthetic.png from normal1280x720 viewport, fake PNs deliberately labeled SYNTHETIC. Local synthetic builder scripts/build-workbench-fixture.mjs kept for reproducibility; generated deliverables/.workbench-check removed after validation. Browser tab2 closed, viewport reset, temporary server stopped. No company catalog/API data accessed; no actual remote synthetic links opened. Company full catalog115098 and new release Chrome/Edge still require user acceptance. No Git commit/push/cloud backup.
