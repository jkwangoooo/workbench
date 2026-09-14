# 班主任工作台：当前本地版交接

更新时间：2026-09-13

## 1. 接手结论

当前工作优先级是把本地业务版跑通；不处理 Supabase、RLS、部署、上线迁移或云端回归。独立入口是 `local.html`，与历史云端入口 `index.html` / `app.js` 并存且不互相调用。

本次快照的核心结论：本地版源码已覆盖主要业务页面，但 `node --check local-app.js` 在 `local-app.js:182` 报 `SyntaxError: Unexpected token ';'`。因此本地页面当前不能启动，所有功能只能标记为“源码已写入、未运行验收”，不能宣称已可用。

## 2. 仓库与提交状态

| 项目 | 当前值 |
| --- | --- |
| 本地目录 | `/Users/molly/MollyHome/学校工作/七年级上册/teacher-workbench` |
| 分支 | `main` |
| 已推送提交 | `02e830d Add local teacher workbench workflow` |
| GitHub 仓库 | `https://github.com/jkwangoooo/workbench` |
| 远程地址 | `git@github.com:jkwangoooo/workbench.git` |
| 工作区 | 本文创建前为干净；本次仅增加本交接文档及历史文档指向 |

GitHub 的 `main` 已与本地提交 `02e830d17abbc05b558bd749191effa89dbd88cb` 对齐。SSH 已验证为 GitHub 账号 `jkwangoooo`。

## 3. 本地版边界

`local.html` 只加载：

```text
private-data/students.js
dist/vendor/xlsx.full.min.js
local.css
local-app.js
```

本地版没有引入 `app.js`，没有读取 `teacher-cloud-config` 或 `teacher-cloud-session`，也没有调用云端请求函数。所有业务数据写入浏览器 `localStorage`，键名为：

```text
teacher-local-schedule
teacher-local-schedule-overrides
teacher-local-todos
teacher-local-notes
teacher-local-violations
teacher-local-homework
teacher-local-dictation
teacher-local-tests
teacher-local-planning
teacher-local-resources
teacher-local-group-layout
teacher-local-seating-layout
```

`private-data/`、`dist/` 和 `node_modules/` 被 `.gitignore` 排除，故 GitHub 仓库不含真实学生种子、XLSX 浏览器依赖或本地依赖目录。克隆后即使修复脚本语法，也需要在本机准备学生种子；XLSX 导入还需要补回浏览器端的 `xlsx.full.min.js`。缺失这些文件不会让它们自动从云端获取。

## 4. 本地功能状态

下表反映代码状态，不代表已完成浏览器验收。

| 功能 | 代码状态 | 说明 |
| --- | --- | --- |
| 首页看板、导航 | 源码已写入 | 汇总本地待办、快捷记录和课程入口；未启动验证。 |
| 7/8 班目录与 8 班信息 | 源码已写入 | 读取 `WORKBENCH_SEED`；种子缺失时花名册为空。 |
| 常规课表 | 源码已写入 | 按班级/星期/时段写入 `teacher-local-schedule`。 |
| 临时调课 | 源码已写入 | 按日期覆盖写入 `teacher-local-schedule-overrides`，不改常规课表。 |
| 待办、快捷记录 | 源码已写入 | 支持新增和本地保存。 |
| 8 班违纪 | 源码已写入 | 支持新增、删除和本地保存。 |
| 作业反馈 | 源码已写入 | 7/8 班按日期保存评级与备注。 |
| 听写 | 源码已写入 | 阶段、项目、目标分、成绩和达成判断已有页面逻辑。 |
| 单元测试 | 源码已写入 | 可录入成绩并按分数排序；当前并列分数按数组顺序给不同名次，尚不符合“并列排名”需求。 |
| 课程规划 | 源码已写入 | 单元及课时完成勾选保存在本地。 |
| 常用网址 | 源码已写入 | 支持本地新增、打开和删除。 |
| 工作文件资源库 | 未实现 | 页面明确为占位；没有文件上传、预览或管理。 |
| 备课中心 | 未实现 | 当前为占位入口，不含本地业务流程。 |
| Stage 2 分组表 | 源码已写入 | 有 CSV/XLSX 模板、校验、预览、确认保存和打印逻辑；未运行验证。 |
| Stage 2 座次表 | 源码已写入 | 有 8 x 9 模板、讲台/过道约束、预览、确认保存和打印逻辑；未运行验证。 |

## 5. Stage 2 数据契约与已知问题

分组模板：

```text
组别、成员1、成员2、成员3、成员4、组长
```

座次模板：

```text
模板版本、1
行数、8、列数、9
后续 8 行、9 列
```

座次单元格支持 `student:姓名`、`empty`、`aisle`、`podium`。当前解析器会校验模板尺寸、未知姓名、重复学生，以及第 1 行讲台和第 5 列过道等条件。

必须先修复的缺口：

1. `readRows()` 对所有文件使用 `FileReader.readAsArrayBuffer()`。CSV 分支随后将 `ArrayBuffer` 转为字符串，不能得到原始 CSV 文本；CSV 导入当前会失败。CSV 应使用 `readAsText()`，XLSX/XLS 才使用 `readAsArrayBuffer()`。
2. `local-app.js:182` 的语法错误阻止整个本地页面加载。这是第一优先级，先修复再谈页面验证。
3. 座次表校验尚未与 `src/modules/class-management/domain/seating-layout.ts` 的领域规则完成逐项对照，尤其需要确认讲台/过道的完整布局约束。
4. 分组布局和座次布局分别使用不同本地键，但“错误导入不影响旧布局、取消保留旧布局、确认后刷新恢复、打印结果”均未做浏览器实测。

## 6. 验证记录

已执行：

```text
node --check local-app.js  -> 失败：local-app.js:182，Unexpected token ';'
git check-ignore           -> 确认 private-data/、dist/、node_modules/ 未纳入仓库
SSH GitHub 认证            -> 成功，账号 jkwangoooo
git push origin main       -> 成功，main 已推送
```

未执行：

- 本地静态服务和浏览器页面打开。
- 桌面与移动端布局检查。
- 任意 `localStorage` 写入后刷新恢复。
- CSV/XLSX 实际导入、取消、确认保存和打印。
- 云端、Supabase、RLS、部署或上线验证。

## 7. 建议接手顺序

1. 修复 `local-app.js:182` 的语法问题，并重新执行 `node --check local-app.js`。
2. 修复 CSV/XLSX 的分流读取；决定本地运行时如何提供被忽略的 `dist/vendor/xlsx.full.min.js`。
3. 启动本地静态服务，例如 `python3 -m http.server 4173`，打开 `http://localhost:4173/local.html`。
4. 用脱敏模板验证 Stage 2：错误导入、取消、确认、刷新恢复、分组/座次隔离和打印。
5. 验证其他本地模块的保存、刷新和空数据状态；修正测试的并列排名规则。
6. 完成工作文件资源库和备课中心的本地业务实现。
7. 只有本地业务稳定后，再另行设计云端迁移，不要在上述步骤中修改 `index.html`、`app.js` 或 Supabase migration。

## 8. 历史材料的使用方式

`HANDOFF.md` 和 `docs/00-*` 至 `docs/06-*` 主要保留旧的云端设计、迁移与模块需求。阅读它们可以了解需求背景，但当前本地开发以本文件的范围、状态和接手顺序为准。不要据旧文档直接宣称云端迁移、RLS 验证或 Stage 2 已完成。
