# 班主任工作台 · 继续推进计划

> 编制时间：2026-09-14
> 编制依据：`HANDOFF.md`、`docs/00`–`docs/07`、以及对当前工作副本的**实测**（语法检查、依赖盘点、Git 探测、契约比对）
> 本文定位：接手后的执行计划，覆盖"跑通本地版 → 修复契约 → 补齐需求 → 实现未完成模块 → 工程收口"

---

## 一、接手核实结论

我把交接文档的声明逐条与工作副本实测做了比对。**三处关键事实与文档不一致**，都会直接影响推进节奏。

| # | 项目 | 交接文档声明 | 本次实测结果 | 影响 |
| --- | --- | --- | --- | --- |
| 1 | 本地版可运行性 | `local-app.js:182` 有语法错误，页面无法启动 | **确认复现**。第 182 行 `resourcesPage()` 的三元表达式外层分组括号未闭合，`node --check` 报 `Unexpected token ';'` | 阻塞全部本地功能 |
| 2 | 版本控制 | 已推送 `02e830d` 到 `github.com/jkwangoooo/workbench`，分支 `main` | **本副本没有 `.git` 目录**（`Test-Path .git` = False），`git status` 报 `not a git repository` | 无历史、无回滚、无远程校验能力 |
| 3 | 运行依赖 | 通过 `npm run build` 生成 `dist/`，`private-data/` 存放学生种子 | **`node_modules/`、`dist/`、`private-data/` 三个目录全部不存在** | 即便修好语法，页面仍无学生数据、无法导入 XLSX |
| 4 | 座次表结构契约 | 文档 §5 自述"尚未与领域规则完成逐项对照" | **确认存在真实冲突**：服务端 RPC 与 TS 领域规则要求"整行第 1 行为 PODIUM + 第 2–8 行第 5 列为 AISLE"；而 `local-app.js` 的模板生成与解析器认为"仅 (0,0) 为讲台、第 5 列全列为过道" | 本地座次布局将来无法通过云端校验 |

### 关于第 4 点的权威依据

服务端 `supabase/migrations/202609030001_stage2_group_seating.sql` 的 `replace_seating_layout` RPC 明确写死：

```
if v_row = 0 and v_kind <> 'podium' then raise exception 'podium row required';
if v_row > 0 and v_column = 4 and v_kind <> 'aisle' then raise exception 'aisle column required';
if (v_row > 0 and v_column <> 4) and v_kind in ('podium','aisle') then raise exception 'invalid seating structure position';
```

`src/modules/class-management/domain/seating-layout.ts:13` 与之完全一致。**两侧一致，且都指向"整行讲台 + 后七行第 5 列过道"**。

而 `local-app.js`：
- `downloadTemplate('seating')`（第 239 行）生成 `row0col0=PODIUM`、`row0col4=AISLE`、其余 `EMPTY` —— 违反上述规则；
- `parseSeating()`（第 216 行）反过来强制"第 1 行第 5 列为过道""第 1 行之外的 0 列不得为讲台" —— 接受了自己生成的违规模板。

结论：**本地版的座次契约是错的，需以服务端/TS 规则为唯一准绳重写**。

---

## 二、问题清单与分级

### P0 — 不解决就无法验证任何功能

| 编号 | 问题 | 位置 | 处置 |
| --- | --- | --- | --- |
| P0-1 | 语法错误导致整页不加载 | `local-app.js:182` | 补一个 `)`，随后 `node --check` 必须通过 |
| P0-2 | 无 `node_modules`，`npm run check/build` 全部无法执行 | 工程根目录 | `npm install`（需联网，注意 `xlsx` 体积） |
| P0-3 | 无 `dist/vendor/xlsx.full.min.js` | `dist/` | `npm run build` 触发 `scripts/copy-browser-deps.mjs` 拷贝 |
| P0-4 | 无 `private-data/students.js`，`WORKBENCH_SEED` 为空 → **两班花名册全空**，所有涉及学生的模块都是空白 | `private-data/` | 需重新生成种子（见"风险 R1"） |
| P0-5 | 无 `.git`，无版本安全网 | 根目录 | 优先 `git init` 并首次提交，再动代码 |

### P1 — 契约/逻辑错误，会导致数据不可信或将来返工

| 编号 | 问题 | 位置 | 处置 |
| --- | --- | --- | --- |
| P1-1 | CSV 导入必然失败：`readRows()` 统一用 `readAsArrayBuffer`，CSV 分支拿到的 ArrayBuffer 转字符串得到 `[object ArrayBuffer]` | `local-app.js:218` | 按扩展名分流：CSV 用 `readAsText`，XLSX 用 `readAsArrayBuffer` |
| P1-2 | 座次契约与权威规则冲突（见上节） | `local-app.js:216,239` | 模板生成 + 解析器双改，对齐服务端 |
| P1-3 | 单元测试排名不处理并列：`rankFor()` 直接返回数组下标 +1，同分学生拿到不同名次 | `local-app.js:177` | 改为同分同名次、后一名按位次跳跃（标准竞赛排名） |
| P1-4 | 常用网址无 `http/https` 校验，可保存 `javascript:` 等危险值 | `local-app.js:203,182` | 加 URL 校验纯函数（对齐 `docs/05` §3.1） |
| P1-5 | `npm run check` 只检查 `app.js`，**不检查 `local-app.js`** | `package.json:14` | 把 `node --check local-app.js` 纳入 `syntax`/`check`，防止同类错误再次漏过 |

### P2 — 与需求文档的差距（功能不完整，但不阻塞启动）

| 编号 | 模块 | 现状 vs 需求（文档） |
| --- | --- | --- |
| P2-1 | 当日违纪 | 现为"日期+学生+文本"记录列表；`docs/04` 要求"8 班全体名单一屏、按学生一行、输入即置顶、统一批量保存、清空即删除、失败整批回滚" |
| P2-2 | 作业反馈 | 现为"班级+日期+优/良/差"单层；`docs/04` 要求"每班每天固定第 1/2/3 条作业、状态四档含`不交`、备注恒在、逐条独立保存、清空已反馈作业需二次确认并级联删除" |
| P2-3 | 每周学生面谈 | **完全未实现**；`docs/04` §5 要求工作周（周一为键）、未面谈优先排序、进度统计 |
| P2-4 | 每日待办 | 现仅"新增+勾选"；`docs/03` 要求"今天起未来 14 天窗口 + 待确认区 + 打开页面幂等逾期整理 + 拖拽/选日期安排" |
| P2-5 | 课表 | 现为单层三标签；`docs/03` 要求"每标签内再分 `固定课表` / `临时调课` 两个子模式，且切换前未保存提示"；现"我的课表"只有 11 时段而 8 班有 13 时段，需确认 slots 是否按 scope 区分 |
| P2-6 | 听写 | 现状基本可用；待补"阶段结束/重开、缺考状态、目标分继承" |
| P2-7 | 阶段 2 分组/座次 | 本地逻辑已写但**从未浏览器验收**；`docs/07` 要求的"取消保留旧布局、错误不影响旧布局、打印 A4 横向"均未实测 |

### P3 — 未实现模块与工程收口

| 编号 | 问题 |
| --- | --- |
| P3-1 | **工作文件资源库**未实现（`docs/05` §4：50MB 限制、批量上传清单、逐文件进度、同名覆盖确认、签名 URL 预览/下载、删除确认）|
| P3-2 | **备课中心**仅占位（`docs/06`：`PREP_WORKFLOW_URL` 配置、`https://` 校验、新标签页打开、未配置置灰）|
| P3-3 | 无窄屏/安卓桌面适配验证（`body` 有最小宽度）|
| P3-4 | 交接文档未记录"本副本已脱离 Git"，文档与实物一致性需修复 |

---

## 三、推进计划

### 阶段 A：让本地版真正跑起来（P0，最小闭环）

**目标**：`http://localhost:PORT/local.html` 能打开、能登录态外正常渲染、两个班花名册有数据。

1. 修 `local-app.js:182` 括号，跑 `node --check local-app.js` 直到通过。
2. `npm install`（安装 `typescript` + `xlsx`）。
3. `npm run build`，确认 `dist/vendor/xlsx.full.min.js` 生成。
4. **重建 `private-data/students.js`**：从原始 Excel 重新提取 7/8 班名单（见风险 R1），确认 `WORKBENCH_SEED` 形状与 `local-app.js:53` 的 `normalizeStudents` 入参一致。
5. `git init` + 首次提交（含 `.gitignore`，确认 `private-data/`、`dist/`、`node_modules/` 被忽略）。
6. 起本地静态服务，肉眼确认首页看板、7/8 班花名册、学生信息渲染非空。

**验收**：`node --check` 通过；页面无控制台报错；花名册 50+50 人；`git status` 干净且私有数据未被跟踪。

### 阶段 B：修复契约与逻辑错误（P1）

**目标**：消除"能跑但数据不可信"的隐患。

1. P1-1 CSV/XLSX 分流读取。
2. P1-2 座次契约对齐服务端：重写模板生成（整行 PODIUM + 后七行第 5 列 AISLE）与 `parseSeating` 校验。
3. P1-3 并列排名算法。
4. P1-4 网址校验。
5. P1-5 把 `local-app.js` 纳入 `npm run check`。
6. 为 2/3/4 补静态契约测试（放进 `tests/unit/`），保持与现有测试风格一致。

**验收**：`npm run check` 全绿；座次模板能被服务端 RPC 规则校验通过（可写纯函数断言，不必连云端）。

### 阶段 C：Stage 2 浏览器验收 + 补齐反馈/待办/课表差距（P2）

**目标**：把"源码已写入"变成"人工已验收"。

1. 用脱敏模板实测 Stage 2：错误导入、取消保留旧布局、确认保存、刷新回读、分组/座次互不串扰、A4 横向打印。
2. P2-1 违纪页按 `docs/04` §3 重构（名单一屏 + 置顶排序 + 批量保存 + 清空即删）。
3. P2-2 作业反馈按 `docs/04` §4 重构（第 1/2/3 条 + 四档状态 + 级联删除二次确认）。
4. P2-3 新增每周学生面谈子模块。
5. P2-4 待办补 14 天窗口、待确认区、幂等逾期整理。
6. P2-5 课表补"固定/临时"二级标签与未保存提示；确认 slots 按 scope 区分。

**验收**：每个子模块记录"实测步骤 + 实测结果"，不留"应该没问题"。

### 阶段 D：实现未完成模块（P3-1、P3-2）

1. 工作文件资源库（本地版可先用 IndexedDB/File API 落地，留出将来换私有对象存储的接口边界）。
2. 备课中心入口（配置读取 + URL 校验 + 新标签页 + 置灰态）。

**验收**：按 `docs/05` §9、`docs/06` §8 的验收标准逐条打勾。

### 阶段 E：工程与文档收口（P3-3、P3-4）

1. 窄屏/安卓桌面宽度适配与溢出检查。
2. 修复 `docs/07` 中"已推送 Git"的失实描述，补一份当前真实基线说明。
3. 建立"每次改动必跑 `npm run check`"的习惯，并把结果记入交接文档。

---

## 四、建议的第一步

**先做阶段 A 的 1–5 项，一次性做完再验证。** 理由：

- 语法错误 + 缺依赖 + 缺种子三者叠加，任何单独修复都无法看到页面，分开做等于反复失败；
- 没有 `git init` 就改代码，等于在没有安全网的情况下动一个来源不清的副本。

建议执行顺序：`修语法 → git init 并首提交 → npm install → npm run build → 重建学生种子 → 起服务肉眼验证`。

---

## 五、风险与约束

| 编号 | 风险 | 说明与对策 |
| --- | --- | --- |
| R1 | **学生种子数据可能无法还原** | `docs/07` 记载源 Excel 位于"微信临时目录"，该路径大概率已失效。需确认原始表是否还能拿到；若拿不到，只能用脱敏假数据先把功能跑通，真实数据由你本机另行导入。这是阶段 A 的最大不确定项。 |
| R2 | 本副本脱离 Git，历史真实性无法校验 | 不要假设本地提交 `02e830d` 的内容，一切以实测为准。必要时从远程仓库重新克隆。 |
| R3 | 隐私红线 | 继续遵守：不输出/提交/伪造真实学生姓名、身份证号、成绩；`private-data/` 保持 ignored；不 `git add -f private-data`。 |
| R4 | 不碰云端 | 本计划全部在本地版范围内。`index.html`/`app.js`/Supabase migration 不动；服务端规则只用作文档依据，不连库、不执行 migration。 |
| R5 | 需求文档与本地实现的口径差异 | `docs/02`–`docs/06` 是云端时期的实施依据，字段名（如 `daily_violations`、`daily_homework`）与本地 localStorage 模型不同。**以需求语义为准、以本地模型为实现载体**，不要照搬表名。 |

---

## 六、一页速览

```
P0 跑起来   语法修复 → git init → npm install → npm run build → 重建种子 → 起服务
P1 修契约   CSV读取 · 座次结构 · 并列排名 · 网址校验 · check 纳入 local-app
P2 补差距   违纪/作业/面谈/待办/课表 对齐需求文档 + Stage2 浏览器验收
P3 做新模块  工作文件资源库 · 备课中心入口
P4 收口     窄屏适配 · 文档纠偏 · 检查习惯
```

**最大不确定性：R1 学生种子数据能否找回。建议先确认这一点，它决定阶段 A 能否真正"看到内容"。**
