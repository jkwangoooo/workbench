# 真实学生名单导入（L7 前置）

把教务系统导出的名单（CSV 或 XLSX）一键转成本地版用的 `private-data/students.js`，
不用手工改 50 行 JSON。

## 用法

```bash
# 最简：自动识别列名 + 自动按「班级」列拆分
node scripts/import-roster.mjs 名单.csv

# 只读不写，先看识别结果和校验报告
node scripts/import-roster.mjs 名单.csv --dry-run

# 指定班级名（没有「班级」列，或想固定班级名时）
node scripts/import-roster.mjs 名单.xlsx --class "2025级8班,2025级7班"

# 指定 XLSX 工作表、输出路径
node scripts/import-roster.mjs 名单.xlsx --sheet "Sheet1" --out private-data/students.js
```

## 自动识别的列名（大小写、空格、常见别名都不影响）

| 规范字段 | 认得的表头 |
| --- | --- |
| 姓名 | 姓名 / 学生姓名 / 学生 / 名字 / name |
| 班级 | 班级 / 班别 / 所属班级 / 行政班 / class |
| 省学籍辅号 | 省学籍辅号 / 学籍辅号 / 学籍号 / 省学籍号 |
| 准考证号 | 准考证号 / 准考证 / 考号 / 考生号 |
| 证件号 | 证件号 / 身份证号 / 身份证 / 证件号码 |
| 性别 | 性别 / sex / gender |
| 出生日期 | 出生日期 / 出生年月 / 生日 / 出生 |
| 联系电话 | 联系电话 / 电话 / 手机 / 手机号 / 家长电话 |
| 家庭住址 | 家庭住址 / 住址 / 地址 / 家庭地址 |
| 备注 | 备注 / 说明 / note |

## 稳定键（决定学生 ID 是否跟人走）

学生 ID 由稳定键做 FNV-1a 哈希派生，与名单顺序无关。优先级：

**省学籍辅号 > 准考证号 > 证件号 > 姓名**

- 前三项只要有任意一个，ID 就稳定（换顺序、插学生都不错位）。
- 三者全缺时退回姓名哈希——**重名会错位**，工具会在导入报告里打印警告（`⚠ N 人缺稳定键` 和 `⚠ 重名：xxx`）。

## 导入后要做什么

1. 打开 `private-data/students.js` 确认姓名、班级、字段无误（这个文件被 `.gitignore` 排除，**绝不提交**）。
2. 本地起服务 `npm run serve`，进「姓名目录」核对两个班的学生都在、字段齐全。
3. 走一遍真实流程：发成绩 → 记违纪 → 做分组座次 → 打印（L7-2 验收）。

## 注意

- 脚本只读你指定的文件、只写 `--out` 指定的文件（缺省 `private-data/students.js`），不上传任何数据。
- 导出的种子结构始终是 `window.WORKBENCH_SEED = { classes: [{ name, students: [...] }] }`，与现有演示种子一致，可直接替换。
- 重新导入会**覆盖** `private-data/students.js`；导入前如已有真实数据，先确认要不要保留旧的（建议先 `cp` 一份）。
