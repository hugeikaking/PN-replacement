# v2.4.1：白屏排查与启动提示

此版保持v2.4的查询和分类功能，增加不依赖主程序的静态启动提示、语法/运行错误报告。正常启动后隐藏提示，启动失败时显示错误并隐藏不完整界面。脚本未执行或主脚本缺失时，静态提示仍显示；如果HTML本身被严重截断或改写，提示也可能无法显示。

新版文件：Passive-PN-Translator-v2_4_1.html。保留原v2.4及用户自建TXT副本，没有修改它们。仍使用v3.4整理工具和相同两个导入文件，不需重新整理数据库。

## 当前已确定和未确定的事情

个人电脑原v2.4 HTML与“Passive-PN-Translator-v2_4 - 副本.txt”完全一致：61,985字节，SHA256 D4DC28D32D7F1DB932BE970D93390782019E041A896C6A2F6D015FB515BD9FA7。本机原脚本语法正常、文件闭合完整，最长行27,660字符。改扩展名本身没有改变这份文件；邮件正文、下载后公司文件的内容尚未取得，无法确认实际白屏根因。

可能的环节：复制时漏选/截断、邮件编辑器改写引号或HTML字符、浏览器策略未执行脚本、浏览器启动错误。仅列为待排查，不把某一种原因视为已证实。

## 公司本地排查

- 在原白屏页按F12，点击Console（控制台），查看并拍下第一条红色错误。只需错误消息，不需要发公司数据库。
- `Unexpected token` / `Unexpected end of input` / `Invalid or unexpected token`：通常指文件程序内容不能正确解析，需检查公司落地文件完整性。
- `Content Security Policy` / `Refused to execute`：查看被拒绝的具体脚本与策略，由公司批准的运行方式处理，不关闭浏览器保护。
- 检查文件确实为HTML而非HTML.TXT，记事本打开末尾是否仍有闭合标签。闭合完整不是全文正确的充分证明。
- 使用公司批准的渠道传递原始HTML，不提供改后缀、编码或拆分等绕过邮箱拦截的方法。

新版本末尾包含PNREP_V2_4_1_FILE_END标记以便检查是否尾部缺失；此标记不代表全文完整性校验。公司实际错误尚待用户照片核查。本机启动诊断3项测试、类型检查、独立网页构建通过。

## 2026-10-06：公司 v2.4.1 白屏根因已复现

公司照片提取的代码为 `source:https://www.murata.com/en-global/products/capacitor/ceramiccapacitor/overview/lineup,checkedAt:`，网址两端的双引号丢失；原件应为 `source:"https://www.murata.com/en-global/products/capacitor/ceramiccapacitor/overview/lineup",checkedAt:`。本机删去这对引号，将 UTF-8 BOM 去掉、换行改为 CRLF、末尾添加一个 CRLF 后，SHA256 精确等于公司文件 F71208835D8F1184476B84F7FF23DEFA58421C36A36048DAE183038E97CD779E，并复现 `SyntaxError: Unexpected token ':'`。因此这份文件的程序内容差异已经确定；不能确认是哪个编辑或传递环节丢失引号。之前一张第65行主脚本的照片是旧版结构，后续带文件地址的照片已确认新版结构，不再把版本混淆作为本次根因。

新增 `scripts/Repair-PassiveTranslator-v2_4_1.ps1`：只接受已确认的损坏文件 SHA256；恢复该网址的引号、原件 UTF-8 BOM 和 LF 格式；在写入前要求结果 SHA256 精确等于原件 BE1893CE81D78DBFDABD1000E62921F47EB5AA435EAE676E9D460AD0785C7117。另存 `-repaired.html`，原文件保留，修复目标已存在则不覆盖。Windows PowerShell 5 实测修复输出与本机原件逐字节一致，输入文件保留；临时样本已清理。公司尚未回报实际修复后打开结果。此修复不读取或重整公司产品数据库，不改变浏览器安全策略，不提供邮箱过滤绕过方式。
