# 应用、标准、特征的原 JSON 字段检查

本机没有公司原始 Murata_MLCC.json，因此不能声称已经读取或确认其分类取值。此工具在公司电脑直接读取该文件，生成本地报告，不上传数据、不修改原库或已有转换结果。

把 Inspect-MurataClassification.ps1 放到公司允许的目录。如果 JSON 仍在公司电脑桌面，运行：

```powershell
powershell.exe -NoProfile -File "$env:USERPROFILE\Desktop\Inspect-MurataClassification.ps1"
```

文件在别处时加 `-InputPath "D:\你的目录\Murata_MLCC.json"`。输出在桌面 Murata_Classification_Check 的新文件夹内，打开 classification-fields.html。

默认检查前 20,000 条，这是字段结构检查，不是完整目录匹配测试。样例没发现字段/取值不能证明全库没有。每字段保留最多 50 个不同原值样例及类型，超过上限的观测单独计数；长原值显示明确标注截短。原库保持不变。

优先看 Application 和 Specs.Characteristics，再看报告自动发现的 safety、standard、certification 等候选字段。对象内属性也显示原路径；不把代码值、false 或未校准对象自动解释成应用或 High Q。TemperatureCharacteristicsCompliedStandard 是温度特性标准，不是安全认证。

需要核对时，可提供这几栏的照片，不需要发送公司 JSON 或生成文件。依据原值确定映射后，转换器/网页优先使用 JSON 分类；缺少字段时才使用明确标注的系列参考。当前 v3.3 转换器已保留 Application 和 Specs.Characteristics；未确认的安全字段尚未接入。
