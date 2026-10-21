# 被动件料号翻译 / PN replacement

物料描述与料号互译工具，当前以村田 MLCC 官方目录查询和离线网页为主要使用方式，另有 Vue H5 界面与多厂商 MLCC 料号解析。

## 当前可用版本

公司环境已测试的离线版本为 **v2.6.6**，文件位于 `deliverables/Murata-Step6-v2_6_6-offline/`。该目录保留完整 HTML、从 v2.6.5 升级的补丁、升级脚本和 SHA256 校验清单。历次交付保留用于回退和增量升级，不应覆盖或重新格式化旧 HTML。

主要功能：

- 描述查询村田目录、料号解析规格、批量输入与已选结果导出。
- 应用范围及 AEC-Q200 筛选、最大允许高度匹配。
- 高容产品在没有正常匹配时，按目录相邻档位列出替代候选，并明确差异。
- 超过高度限制的记录另列参考，不混入正常匹配或普通批量导出。
- 选中物料后确认打开规格书链接，每次点击打开一份。

详细使用与升级说明见 [v2.6.6 说明](docs/MURATA_HEIGHT_REFERENCES_V2_6_6.md)。

## 开发与检查

需要 Node.js 与 npm；PowerShell 工具的使用和校验另见对应交付说明。

```sh
npm ci
npm run dev:h5
npm test
npx vue-tsc --noEmit
npm run build:h5
```

开发网页默认地址为 `http://localhost:3000`。生成当前独立预览网页可运行 `npm run build:official-preview`；生成前查看脚本中的输出路径，保留既有发布文件。

当前 `npm run lint` 尚缺 ESLint 依赖及配置，不能视为已可用的发布检查。已识别的问题和优化顺序见 [项目审查记录](docs/PROJECT_REVIEW_2026_10_18.md)。

## 目录

- `src/engine/`：规格解析、料号解析、官方目录匹配和替代规则。
- `src/official-preview/`：H5 与离线 HTML 共享的查询界面。
- `src/rules/`：各厂商规则和公共参数表。
- `src/pages/`、`src/stores/`：Vue 页面及状态管理。
- `tests/`：引擎及相关功能测试。
- `scripts/`：目录整理、离线构建、增量升级和校验工具。
- `docs/`：功能说明、迁移说明与审查记录。
- `deliverables/`：历次离线网页及配套交付文件。

## 数据与备份范围

仓库保存程序、规则、测试、文档及交付文件。**API Key、公司原始产品目录、整理后的实际产品数据及本地配置不提交。** `node_modules/` 与 `dist/` 也不提交，可从锁定的依赖文件重新安装和构建。

离线网页需在本机导入同一次整理生成的 `normalization-summary.json` 和 `normalized-products.jsonl`。这些数据文件独立留在公司允许的存储位置；GitHub 代码备份不包含它们，也不会自动部署或公开网页。

搜索结果来自导入的数据快照；读完整个来源文件不等于覆盖官网当前全部产品。参数匹配、替代和参考记录均不能代替实际规格书及选型确认。
