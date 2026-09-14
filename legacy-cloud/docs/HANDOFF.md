# 班主任工作台交接文档（历史记录）

> 当前有效的本地业务版交接以 [docs/07-current-local-handoff.md](docs/07-current-local-handoff.md) 为准。本文保留此前云端迁移和 Stage 2 设计过程，不能作为当前可运行状态或后续优先级的依据。

更新时间：2026-09-13（Stage 2 收尾与接手版）

## 1. 项目目标

为个人教师使用的班主任工作台，主要在办公室的安卓桌面设备上使用，网络稳定。最终部署到 Vercel，域名由 Cloudflare 管理，数据存入 Supabase；GitHub 仅保存代码，绝不保存学生资料、密码或 Supabase 密钥。

项目仓库：`https://github.com/Molly377/teacher-workbench`

本地工程：`/Users/molly/MollyHome/学校工作/七年级上册/teacher-workbench`

## 2. 已确认业务范围

### 任教班级

| 班级 | 角色 | 使用模块 |
| --- | --- | --- |
| 2025级8班 | 班主任、英语老师 | 全部模块 |
| 2025级7班 | 英语老师 | 姓名、英语作业、听写、测试成绩 |

### 首页看板

- 今日我的课程
- 今日 8 班课程
- 临时调课
- 待办事项
- 快捷记录

### 功能需求结论

| 模块 | 已确认的行为 |
| --- | --- |
| 8班花名册 | 只读、可搜索；字段为姓名、身份证件号、省学籍辅号、准考证号；完整展示，不脱敏 |
| 8班学生信息 | 由已有表格导入，只查看；摘要列表 + 完整档案 |
| 7班学生 | 只保留姓名，用于英语教学记录 |
| 课表 | 周一至周五；8班有早读、1-8节、午休、课辅 A/B/C；我的课表有早读、1-8节、午休、课辅；直接编辑保存 |
| 临时调课 | 按具体日期单独保存；不改常规课表；次日自然恢复常规课表 |
| 待办 | 事项内容、截止日期、完成勾选；不需要提醒或分类 |
| 违纪 | 仅 8 班；日期、学生、自由文本事项 |
| 作业反馈 | 7班、8班均需要；按日期建立；默认全体“优”，可改为“良/差”，可备注 |
| 听写 | 每个阶段单独建表；满分 100；姓名、目标分、每次听写成绩 + 自动“达成/未达成”；不排名；OCR 后续做，必须人工确认后写入 |
| 单元测试 | 每次测试独立建表；手动录入、编辑、保存；自动当前排名；可上传姓名 + 排名的对照表，计算进退步名次 |
| 分组排位 | 已重新纳入 Stage 2，拆分为独立的分组表与座次表；固定模板导入、预览确认和打印 |
| 课程规划 | 单元下按课时填写内容，完成勾选即可 |
| 资源库 | 分为常用网站、工作文件两个独立标签页；网站支持名称、URL、自定义分类、备注、置顶；文件支持常见办公文件批量上传、50MB限制、分类、搜索筛选、网页预览/下载、同名覆盖和删除确认 |
| 备课中心 | 独立网页入口；通过部署配置读取HTTPS地址；新标签页打开；未配置时置灰显示“尚未配置”；不共享数据 |

## 3. 数据来源与隐私边界

以下源文件已经读取并转换为本机私有导入数据，但绝不能提交到 GitHub：

| 数据 | 源文件 | 提取规则 |
| --- | --- | --- |
| 8班花名册 | `六年级8班_学籍号_准考证号(1).xlsx` | `Sheet1` 前四列，50人 |
| 8班学生信息 | `学生信息统计.xlsx` | `export`，50人，16个字段 |
| 7班姓名 | `7班.xlsx` | `Sheet2` 第 2 列，50人 |

源文件均位于微信临时目录，路径见之前任务上下文。不要在文档、提交记录、日志或聊天中输出真实学生姓名、身份证号、联系方式、地址或成绩。

本机私有导入文件：

- `private-data/students.json`
- `private-data/students.js`

它们已被 `.gitignore` 排除。`students.js` 仍通过 `index.html` 本地加载，但现在仅作为首次导入 Supabase 的来源，不再作为学生花名册或学生信息页面的显示来源；登录后页面只读取 Supabase。Vercel 部署时该文件不存在，数据应由 Supabase 读取。

## 4. Supabase 状态

### 项目与认证

- Supabase 项目已建立：`teacher-workbench`
- 项目引用：`cibmjzuvmkawnpooinvv`
- 项目区域：创建时选择的区域以 Dashboard 实际显示为准
- 新用户公开注册已关闭
- 已创建唯一的工作台邮箱账号；Dashboard 曾显示该账号已确认、已有登录记录
- 已发送过密码恢复邮件；若无法登录，在 Supabase Authentication > Users 中选择该用户后可再次使用 `Send password recovery`
- 已完成一次密码恢复流程；本地恢复页面支持 Supabase recovery token，并在更新密码前要求确认两次输入
- 已确认 Supabase 中 `classes` 有 2 行、`students` 有 100 行

不要记录或重置数据库密码；不要把 Project URL、Publishable/anon key、secret key、service_role key 发到聊天或提交到 GitHub。

### 已创建数据表

所有表位于 `public` schema，且都包含：

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null default auth.uid()`
- 业务字段

表清单：

| 表 | 用途 |
| --- | --- |
| `classes` | 班级及任教角色 |
| `students` | 学生花名册、档案 JSON、排序 |
| `schedule_cells` | 常规课表单元格 |
| `schedule_overrides` | 按日期的临时调课 |
| `todos` | 待办事项 |
| `quick_notes` | 快捷记录 |
| `violations` | 8班违纪记录 |
| `homework_batches` | 一次作业反馈的日期与班级 |
| `homework_feedback` | 每名学生的优/良/差与备注 |
| `dictation_sheets` | 听写阶段表 |
| `dictation_columns` | 听写项目列（日期、名称、排序） |
| `dictation_targets` | 每名学生在一个听写阶段的目标分 |
| `dictation_scores` | 实际听写成绩 |
| `test_sheets` | 单元测试表 |
| `test_scores` | 测试成绩和当前排名 |
| `test_rank_references` | 外部上传的历史排名对照 |
| `course_units` | 课程单元 |
| `course_lessons` | 单元课时及完成状态 |
| `resource_links` | 常用网址 |
| `resource_files` | 工作文件元数据；文件本体存于私有对象存储 |
| `prep_items` | 备课中心预留项 |

### 数据库关键关系

- `students.class_id -> classes.id`
- `violations.student_id -> students.id`
- `homework_feedback.batch_id -> homework_batches.id`
- `homework_feedback.student_id -> students.id`
- `dictation_columns.sheet_id -> dictation_sheets.id`
- `dictation_targets.sheet_id -> dictation_sheets.id`
- `dictation_targets.student_id -> students.id`
- `dictation_scores.target_id -> dictation_targets.id`
- `dictation_scores.column_id -> dictation_columns.id`
- `test_scores.sheet_id -> test_sheets.id`
- `test_scores.student_id -> students.id`
- `test_rank_references.sheet_id -> test_sheets.id`
- `test_rank_references.student_id -> students.id`
- `course_lessons.unit_id -> course_units.id`

### RLS 安全规则

所有上述表均已启用 Row Level Security。每张表有同一条策略：

```sql
for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id)
```

因此前端使用工作台账号的 access token 访问时，行自动归属登录用户。创建数据时不应主动传递 `owner_id`，让数据库默认值 `auth.uid()` 写入。

## 5. 当前代码状态

### 文件职责

| 文件 | 说明 |
| --- | --- |
| `index.html` | 静态入口；本机环境会加载被忽略的 `private-data/students.js` |
| `app.js` | 当前所有 UI、必要的本机课表缓存、Supabase REST 登录/会话刷新/学生导入与工作记录读写逻辑 |
| `styles.css` | 当前桌面工作台样式 |
| `.gitignore` | 已忽略私有数据、环境文件、Supabase 本地配置 |
| `supabase-config.example.js` | 空白示例；尚未加入 Git，建议加入 |
| `HANDOFF.md` | 本文档 |

### 已实现的前端能力

- 桌面工作台骨架和导航
- 常规课程表可编辑并同步到 `schedule_cells`；云端读取失败时保留本机课表作为显示兜底
- 临时调课按具体日期写入 `schedule_overrides`；只开放所选日期对应的星期列，周末禁止保存，不改常规课表
- 待办写入/读取 `todos`，快捷记录写入/读取 `quick_notes`
- 违纪记录按 8 班 `class_id` 和云端 `student_id` 写入/读取/删除 `violations`
- 作业反馈按班级和日期建立 `homework_batches`，逐名写入/读取 `homework_feedback`，默认“优”，备注空值写为空字符串以符合非空约束
- 听写已接入 Supabase：阶段表、动态听写列、目标分、实际成绩、达成/未达成；支持部分填写后保存
- 单元测试已接入 Supabase：独立测试表、成绩、当前排名、历史排名对照、进退步计算
- 登录后从 Supabase 只读显示 8 班花名册和完整学生档案；本机私有数据只用于首次导入
- “云端设置”页：本地保存 Project URL + Publishable/anon key
- “云端设置”页：邮箱密码登录 Supabase Auth
- “云端设置”页：手动点击后将本机两班学生资料写入 `classes` 与 `students`
- 已登录时从 Supabase 读取 `classes` / `students`；学生信息页动态展示云端 `profile` 字段
- Supabase access token 返回 401 时自动使用 `refresh_token` 续期并只重试一次；退出登录会清理当前云端工作区状态
- 已加入密码恢复页面，处理 recovery token 后调用 Supabase 更新密码
- 听写允许只保存已填写的目标分/成绩，不要求全班填完；空目标分不会覆盖已有目标分
- 单元测试新建表不再提交不存在的日期列；若数据库没有日期字段，日期会合并到测试名称
- 常规课表按当前标签保存；星期、时段按数字兼容 `smallint` 字段
- 课表保存按钮显示“正在保存”“已同步到云端（N 项变更）”或“保存失败”，并弹出同步结果

### 仍仅使用 localStorage 的模块

以下功能仍使用本机缓存或仅有基础 UI，尚未完成文档对应的实施：

- 课程规划
- 资源库
- 备课工作流入口

优先把这些模块逐个改为调用现有表，而不是同时大规模重写。

实施时以以下需求文档为准，覆盖本交接记录中的旧字段描述：

- `docs/04-feedback-module.md`
- `docs/05-resource-library-module.md`
- `docs/06-prep-workflow-integration.md`

备课工作流入口按配置跳转，不需要使用 `prep_items` 业务表；该旧表是否保留需在实施前单独核对。

### 云端设置页的操作流程

1. 打开本地 `index.html`，刷新页面以加载最新代码。
2. 点击左侧“云端设置”。
3. 填写 Supabase 的 `Project URL` 与 `Publishable key`；若 Dashboard 只显示 `anon key` / `Legacy anon key`，也可使用。
4. 保存后页面刷新。
5. 用工作台账号的邮箱和密码登录。
6. 点击“导入两班学生资料”。
7. 导入成功后，花名册改为从云端读取。
8. 若 `JWT expired`，刷新页面后请求会自动续期；只有 refresh token 也失效时才需重新登录。

注意：绝对不要填 `secret` 或 `service_role` key。

## 6. Git 状态

本地分支：`main`

本地初始提交：`f5b38f0 Initial teacher workbench`

远程仓库已通过浏览器创建初始内容，和本地历史曾出现分叉。后续推送前先检查：

```bash
git -C teacher-workbench fetch origin
git -C teacher-workbench log --oneline --decorate --graph --all
```

不要使用 `git reset --hard` 或覆盖远程历史。建议先用合并或 rebase 处理历史，再推送。

## 7. 阶段2验收修复（2026-09-04）

本轮仅修复“2025级8班班级管理”的分组表与座次表：

- migration 已移除 `cohort_year`、`class_number` 引用，所有8班范围校验统一为当前用户拥有且名称为 `2025级8班` 的班级；未新增或修改 `classes` 字段。
- 分组和座次保持独立表、RPC、repository、触发器、策略、预览、错误和打印逻辑；trigger/policy 创建具备可重复执行保护。
- 页面已分离 `saved*Layout` 与 `draft*Layout`。上传校验不会写正式表；取消不清空已保存布局且不调用 RPC；确认只替换当前模块草稿，成功后转为已保存布局。
- verification SQL 已补充 classes/students 实际字段、8班存在性及阶段2表的字段、RLS、策略、索引、触发器和 RPC 只读元数据查询，不输出学生业务数据。
- 已补充阶段2静态契约测试，覆盖旧字段移除、8班 owner/name 校验、模块 RPC 独立、取消保留 saved 布局和确认前不调用 replace。

本轮未执行远程 Supabase migration，未执行云端 metadata SQL，未使用真实 Excel 文件进行导入或确认保存；未进入阶段3。

### 用户页面验收步骤

1. 本地启动工作台并登录工作台账号，进入“2025级8班班级管理”；确认只有“分组表”和“座次表”两个阶段2入口，不出现7班入口。
2. 分别下载两类标准 `.xlsx` 模板，使用脱敏或虚拟姓名填写并上传；确认上传后只出现预览/错误清单，未点击“确认保存”前刷新或取消均不会改变已保存布局。
3. 在分组表和座次表之间切换，分别上传错误模板、未知姓名、重复学生、重复组长或未知版本；确认错误逐项显示且互不串扰，取消后恢复各自已保存布局。
4. 分别确认保存并刷新页面，确认只更新当前模块；打印两类布局，检查 A4 横向单页、标题分别为“2025级8班 分组表”或“2025级8班 座次表”，且不显示更新时间。

### 阶段3前置条件

- 先在目标 Supabase 项目执行并人工审阅 `supabase/verification/stage2_metadata.sql` 的只读结果，确认实际 classes/students schema、8班 owner、四张阶段2表的 RLS/策略/索引/触发器/RPC。
- 经授权后再单独应用阶段2 migration，并使用脱敏模板完成一次上传、取消、确认保存和刷新回读验收。
- 阶段2页面验收通过后，才能讨论阶段3；本轮不修改阶段3代码。

截至本交接文档创建时，以下改动尚未提交：

- `.gitignore`
- `app.js`
- `index.html`
- `styles.css`
- `supabase-config.example.js`（未跟踪）
- `HANDOFF.md`（未跟踪）

提交前必须确认：

```bash
git -C teacher-workbench status --short
git -C teacher-workbench check-ignore -v private-data/students.json private-data/students.js
```

`private-data/` 必须显示为 ignored，且绝不能执行 `git add -f private-data`。

## 7. 已知问题和限制

1. 当前 UI 主要针对普通桌面显示，`body` 有最小宽度；尚未完成手机窄屏适配。用户主要使用安卓桌面，因此优先级较低。
2. Codex 沙箱无法连接用户终端中启动的 `127.0.0.1:4173`，因此页面回归由用户在内置浏览器中完成；用户已验证学生资料、待办/快捷记录、临时调课、违纪页面和作业反馈流程。
3. 浏览器自动控制曾被本地文件 URL 和 Supabase 域名安全策略阻止，无法从浏览器读取 API key 或代替用户完成云端初始化；不要要求用户将密钥发到聊天。
4. `app.js` 使用原生 `fetch` REST，不依赖 npm。后续若项目引入构建工具，可换成 `@supabase/supabase-js`。
5. `savedCloudConfig` 只用于初始渲染的侧栏状态；保存配置后页面通过 `window.location.reload()` 刷新，行为正常。
6. 作业反馈表的 `note` 列为非空约束；空备注必须发送空字符串，不能发送 `null`。
7. `schedule_cells` 的 `scope` 有数据库 check constraint；当前代码按课表类型逐格保存并自动尝试兼容 scope。若仍失败，记录 Supabase 返回的完整错误，不要猜测或关闭约束。
8. `index.html` 的 `app.js` 带查询版本号，修改脚本后需同步更新版本号，避免 4173 页面使用旧缓存。

## 8. 验证记录

已执行并通过：

```bash
node --check teacher-workbench/app.js
git -C teacher-workbench diff --check
```

已确认：

- 本机私有学生数据文件被 `.gitignore` 排除。
- 8班导入数据 50人，7班导入数据 50人。
- 8班档案按姓名匹配 50人。
- Supabase `classes` 有 2 行，`students` 有 100 行。
- 用户验证登录后花名册和学生信息页面正常显示云端数据。
- 用户验证待办、快捷记录和临时调课同步；`JWT expired` 后自动刷新会话已验证。
- 用户验证违纪记录页面正常加载。
- 用户验证作业反馈保存流程；修复了 `homework_feedback.note` 非空约束错误。
- 用户验证听写、单元测试基础流程；期间修复了缺失 `date` 列、缺失 `name` 列和部分保存限制。
- 用户验证常规课表内容可保留；保存同步反馈已补充，但“我的课表”与 `schedule_cells_scope_check` 的最终云端兼容仍需继续验证。

尚未验证：

- 常规课表 `schedule_cells` 在真实数据库约束下的完整验证，尤其是“我的课表” scope
- 听写部分目标分/成绩保存后的刷新复核
- 单元测试创建后录入成绩、刷新和排名复核
- 跨设备读取
- Vercel 部署
- Cloudflare 域名绑定
- 课程规划、资源库和备课工作流入口的文档方案实施及云端读写

## 9. 建议的后续工作顺序

1. 完成常规课表云端验证：先测试“我的课表”保存，再测试 8 班课表和临时调课，确认刷新后云端内容保留。
2. 完成听写部分保存和单元测试成绩/排名的用户复核。
3. 迁移课程规划：`course_units` 与 `course_lessons`。
4. 按 `docs/05-resource-library-module.md` 实施资源库：独立网站与私有工作文件存储，不限于旧 `resource_links` 表。
5. 评估把登录入口从“云端设置”移到独立登录页；会话刷新和退出已实现。
6. 处理本地/远程 Git 历史分叉，提交不含私有数据的代码。
7. 实施 `docs/06-prep-workflow-integration.md` 的独立备课网页入口；部署时配置有效的 `PREP_WORKFLOW_URL`。
8. 在 Vercel 连接 GitHub 私有仓库，配置部署；Cloudflare 添加域名解析；在 Supabase Auth URL Configuration 添加正式站点 URL。

## 10. 对下一任务的硬性约束

- 不要输出、提交、上传或在示例数据中伪造真实学生隐私数据。
- 不要把任何 Supabase key 写入仓库。
- 前端只能使用 Publishable/anon key，绝不能使用 `service_role` / secret key。
- 保持 RLS 策略，不要为方便调试而关闭 RLS。
- 临时调课必须以具体日期存储，不能修改常规课表。
- 8班花名册和学生信息必须保持只读；搜索即可，不做在线编辑。
- OCR 成绩识别必须在写入前有人工确认步骤。
- 分组表与座次表已按 Stage 2 纳入；不要恢复旧的“分组排位”一体化页面，也不要在本阶段扩展网页拖拽编辑。
- 备课入口只按 `docs/06-prep-workflow-integration.md` 新标签页跳转，不嵌入网页、不共享数据或统一登录。

## 13. 阶段 2 收尾复核（2026-09-13）

本轮完成了阶段2收尾修复，仍只涉及“2025级8班班级管理”的分组表与座次表，没有修改其他业务模块或真实学生数据：

- 分组模板解析保留成员原始槽位；中间成员为空时，后续成员不会错误前移。
- 座次标准模板的空座统一生成 `EMPTY`，不再生成会被误判为未知学生的 `STUDENT:`。
- 座次前端校验和替换 RPC 均强制 8行9列、第一行 `PODIUM`、后七行第5列 `AISLE`，并拒绝固定结构格出现在错误位置。
- 分组和座次 repository 增加数据库蛇形字段到前端驼峰字段的显式映射，并只通过学生最小目录读取显示姓名；刷新回读不会把数据库字段直接当作前端模型。
- 单元契约测试补充了固定结构、模板空位、解析槽位和刷新映射的静态约束。

本地验证已通过：

```text
npm run check       通过（格式、严格类型、契约检查、11项测试、旧原型语法）
npm run build       通过
git diff --check    通过
```

浏览器验证范围：本地服务 `http://localhost:4173/` 可打开；未登录进入“8班班级管理”时，页面显示登录提示，不返回学生姓名、模板预览或7班内容。由于当前浏览器没有可用的工作台登录态，未上传或保存任何真实/私有学生数据；登录后的下载、虚拟姓名上传、错误预览、取消、确认保存、刷新回读和打印仍需用户在目标账号下验收。

远程 Supabase 状态保持未完成：本轮没有执行 `supabase/verification/stage2_metadata.sql`，没有应用 `202609030001_stage2_group_seating.sql`，也没有进行真实云端写入。下一次云端操作必须先审阅只读 metadata 结果，再按用户明确授权应用 migration；应用后使用脱敏姓名完成一次分组和一次座次的确认保存及刷新回读。

## 14. 当前功能进度与接手清单

下表按当前代码和已记录验收区分“已可用”“基础可用”“未实施”和“待云端/人工验收”，不把占位页面或 localStorage 原型当作正式完成：

| 模块 | 当前可以实现的功能 | 进度 | 接手时的主要限制/下一步 |
| --- | --- | --- | --- |
| 工程基础 | TypeScript 严格检查、构建、契约测试、旧静态原型共存 | 已完成 | 处理本地与远程 Git 历史分叉后提交 |
| 登录与会话 | Supabase 配置、邮箱密码登录、会话刷新、退出、密码恢复 | 基础可用，已有人工验证 | 统一登录入口、正式站点 Auth URL、7天限制策略仍待确认 |
| 8班花名册 | 读取8班姓名、身份证件号、省学籍辅号、准考证号；四字段搜索；只读展示 | 已完成，已人工验收 | 保持敏感字段和7班隔离，不恢复在线编辑 |
| 8班学生信息 | 按需读取完整档案；敏感字段默认隐藏，逐项临时显示 | 已完成，已人工验收 | 继续防止敏感字段进入 URL、本地存储、日志和打印 |
| 8班分组表 | 下载固定 v1 模板、精确姓名校验、空槽位、组长校验、预览/错误清单、取消/确认、独立打印 | 本地完成；云端待验收 | 先 metadata，再 migration；需用脱敏姓名验证保存和刷新回读 |
| 8班座次表 | 下载固定 v1 模板、8×9结构校验、空座/过道/讲台、重复学生阻断、预览/确认、独立打印 | 本地完成；云端待验收 | 同上；需验证 A4 横向和云端回读 |
| 课表 | 7班、8班、我的课表的基础读写；按日期临时调课；首页只读汇合 | 基础可用，部分人工验证 | 重点验证 `schedule_cells` scope、我的课表、原子保存和刷新回读 |
| 每日待办 | 基础新增、完成、读取；首页今日待办 | 基础可用 | 未来14天编辑、逾期移入待确认、拖拽/日期安排尚未按文档完整实现 |
| 首页看板 | 今日课程、8班课程、临时调课、待办、快捷记录概览 | 基础可用 | 当前仍有原型示例/汇合逻辑，需与正式课表和待办模块统一验收 |
| 快捷记录 | 基础云端新增与读取 | 基础可用 | 正式字段边界、编辑/删除和独立验收不足 |
| 当日违纪 | 8班按日期新增、读取、删除基础记录 | 基础可用，已有页面验证 | 批量编辑、失败回滚、排序和统一保存仍需按文档重做/核验 |
| 作业反馈 | 7班/8班按日期建立批次，逐名优/良/差与备注，基础保存读取 | 基础可用，已有基础验证 | 第1/2/3条作业、空条目、初始化幂等、级联删除和事务保存未完整实现 |
| 听写成绩 | 阶段、听写列、目标分、成绩、达成状态，基础云端保存 | 基础可用 | 阶段结束/重开、缺考状态、目标继承、达成率、OCR/PDF待补和验收 |
| 单元测试 | 独立测试、成绩、当前排名、历史排名对照和进退步基础逻辑 | 基础可用 | 科目隔离、满分/状态、批量导入确认、PDF和刷新排名需补验收 |
| 课程规划 | 页面入口/占位结构 | 未实施 | 依据需求文档建立独立 domain、repository、页面和 `course_units/course_lessons` 云端流程 |
| 资源库 | 旧原型常用网址 localStorage | 未实施 | 分离常用网站与私有工作文件；完成50MB、签名URL、覆盖确认、删除和RLS |
| 备课中心 | 页面入口/占位结构 | 未实施 | 按 `PREP_WORKFLOW_URL` 实现生产 HTTPS 校验和新标签页跳转，不接入 `prep_items` 业务 |
| 部署与生产 | 本地静态服务可运行 | 未完成 | Vercel、Cloudflare、Supabase Auth URL、跨设备和生产环境变量验收 |

### 接手顺序

1. 完成 Stage 2 远程只读 metadata 核验，并经确认后应用 migration。
2. 用脱敏数据完成分组、座次的上传预览、取消、确认、刷新回读和打印验收；记录真实结果后关闭 Stage 2。
3. 收尾课表云端 scope 与听写/单元测试刷新验收，优先消除已有基础模块的云端不确定性。
4. 按“课程规划 → 资源库 → 备课中心”逐模块实施；每个模块继续先更新实施文档和数据契约，再编码。
5. 最后处理生产部署、正式认证地址、跨设备验证和 Git 历史整理。

## 11. 阶段 0 工程基础与真实结构核验（2026-08-31）

本阶段已完成，范围严格限定为工程配置、共享契约、测试工具、迁移基线和文档；现有静态原型入口与业务行为未改写。

已新增：

- `package.json`、`tsconfig.json`：TypeScript 严格模式配置与检查脚本。
- `src/main.ts`：兼容基线入口标记；后续阶段再迁移运行时入口。
- `src/shared/auth/session.ts`：仅内存会话存储契约。
- `src/shared/database/client.ts`：最小 Supabase REST 客户端契约；不含业务表路径。
- `src/shared/student-directory/contracts.ts`：只读最小学生目录接口。
- `src/modules/`、`src/shared/ui/`：目标目录骨架，未创建业务页面。
- `tests/format-check.mjs`、`tests/typecheck.mjs`、`tests/unit/foundation.test.mjs`：无隐私数据检查工具。
- `supabase/migrations/202608310001_stage0_baseline.sql`：版本化、非破坏性阶段标记 migration，仅生成，未应用远程数据库。
- `docs/00-stage0-schema-diff.md`：当前调用表、目标文档结构、兼容风险、迁移前置条件与回滚策略。

验证命令与结果：

```bash
npm run check       # format、tsc、type contract、unit、app.js syntax 全部通过
git diff --check    # 通过
```

TypeScript 编译器已作为 `devDependency` 安装并由 `package-lock.json` 锁定。`npm run typecheck` 真实执行 `tsc --noEmit` 并严格使用当前 `tsconfig.json`；`npm run typecheck:contracts` 仅保留为补充契约检查，不能替代编译验收。已以本地静态服务验证兼容基线：1280px 桌面和 960x800 安卓桌面宽度均加载“今日看板”，`scrollWidth` 等于视口宽度且无浏览器控制台错误。后续任何入口迁移仍必须重做桌面与安卓桌面宽度验证。

云端状态：未连接 Supabase，未执行 migration、DDL、写入、删除或部署。真实 schema、RLS、约束、索引和函数仍需在后续阶段以只读方式确认后再设计业务 migration。

下一步仅限：依据 `docs/00-stage0-schema-diff.md` 先完成真实云端 schema 元数据核对，再为单一业务模块编写独立实施 migration；不得在此阶段继续实现业务页面。

### 阶段 0 收尾：真实 TypeScript 编译验收（2026-08-31）

- 允许范围内修改：`package.json`、`package-lock.json`、`tests/typecheck.mjs`、`HANDOFF.md`。
- 新增开发依赖：`typescript`；未引入 Vite、React 或其他运行时框架，`src/main.ts` 仍非实际入口。
- 已通过：`npm run typecheck`、`npm run check`、`git diff --check`。
- 未读取学生资料、密钥或远程 Supabase 数据；未修改原型、业务模块、migration 或业务文档。

## 12. 阶段 1：2025级8班只读花名册与学生信息（2026-08-31）

本阶段已完成工程实现，范围只含 `2025级8班` 的“花名册”和“学生信息”只读页面；未实施分组表、座次表、成绩、课表、待办、反馈、资源库或备课入口。

已改/新增文件：

- `src/modules/class-management/domain/student.ts`：花名册四字段搜索、档案分组与敏感字段默认隐藏规则。
- `src/modules/class-management/data/studentRepository.ts`：唯一的班级管理数据访问层；花名册详情查询按8班 `class_id` 限定且不请求 `student_profiles`，详情仅在选中学生后按需读取。
- `src/modules/class-management/pages/ClassManagementPage.ts`：8班双标签只读页面，不含7班入口、编辑、删除、打印或导出。
- `src/shared/student-directory/contracts.ts`：最小学生目录运行时守卫，仍只暴露 `id/classId/displayName/sortOrder/active`。
- `src/main.ts`、`tsconfig.build.json`、`package.json`、`index.html`：建立可运行的 TypeScript 编译/加载链路；旧 `app.js` 仅增加“8班班级管理”导航挂载，未迁移其他业务。
- `src/modules/class-management/imports/updatePreflight.ts`、`scripts/preflight-stage1.mjs`：仅本地更新预检，只输出新增/匹配/缺失/冲突数量；不写数据库，不打印字段值，并拒绝7班档案输入。
- `tests/unit/class-management.test.mjs`：目录最小化、四字段搜索、敏感默认隐藏、7班不可见、迁移跨班拒绝规则和预检边界测试。

Migration：

- `supabase/migrations/202608310002_stage1_student_directory.sql`：迁移前记录为“仅生成、未应用”；截至 2026-09-03 已成功应用。它以可重复执行的新增方式创建 `student_roster_details` 与 `student_profiles`，启用 RLS，建立 owner/class 索引，并用触发器拒绝 owner 或班级不一致的写入；不改 `students.id`、不删除旧列、不迁移任何真实行。
- `supabase/verification/stage1_metadata.sql`：只读云端核验 SQL，查询列、约束、索引和 RLS 策略；不查询业务行。

云端状态必须分开记录：迁移前的元数据核验、migration 应用和真实数据回填均曾为“未执行”；截至 2026-09-03，元数据核验已通过、migration 已应用、受控回填已完成。后续若重复执行更新流程，仍须先核对真实 schema，保持现有 `students.id` 不变，且7班只保留最小姓名目录。

已执行验证：

```bash
npm run check       # format、严格类型、契约、5项单元测试、app.js syntax 全部通过
npm run build       # TypeScript 编译至被忽略的 dist/，通过
git diff --check    # 通过
npm run dev         # 本地服务 http://localhost:4173
```

浏览器验证已在本地服务完成：1280px桌面与960x800安卓桌面宽度均可进入“8班班级管理”，未登录时不显示学生目录，页面无横向溢出且控制台无错误。由于未读取或传输真实数据，登录后的四字段搜索、档案按需读取、各敏感字段单独显示及切换学生后重新隐藏，必须在迁移和回填后由人工验收。

隐私修正：`index.html` 不再自动加载 `private-data/students.js`；旧原型的历史导入按钮仅在用户明确点击后才动态加载本机私有文件。该文件仍被 `.gitignore` 排除，阶段1页面从不读取它。

遗留风险与人工验收：当前 repository 兼容已确认的旧 `students.name/sort_order` 列，后续不得擅自猜测或改动 `students` 列。页面不会回退到旧 JSON 档案。迁移与回填已完成，仍需以工作台账号手工确认 RLS 下的花名册/详情请求分离、8班数据展示和敏感字段逐项隐藏；通过后方可开始分组表或座次表。

### 阶段 1 收尾修正（2026-08-31）

验收复核发现并已修复一个字段展示缺口：仓储层读取的“学生身份证号”已加入学生信息的“基础信息”分组，并继续受敏感字段默认隐藏规则保护；新增单元测试覆盖该分组契约。未修改其他模块、迁移、真实数据或旧原型。

本次修正后重新通过 `npm run check`（6项单元测试）、`npm run build` 和 `git diff --check`。截至 2026-09-03，阶段1代码、云端元数据、migration 和受控回填均已验收；仅剩登录后真实数据的页面人工验收，完成后再进入阶段2。

### 阶段 1 云端迁移与受控回填（2026-09-03）

已在 Supabase SQL Editor 完成并核验以下操作：

- `supabase/verification/stage1_metadata.sql` 的只读核验通过。既有 `classes` 与 `students` 的 UUID、owner/class 边界、RLS、主键、唯一约束及索引均与迁移前提兼容；迁移对象不存在同名冲突。
- `supabase/migrations/202608310002_stage1_student_directory.sql` 已成功应用。`student_roster_details`、`student_profiles`、各自的 owner/class 索引、RLS 策略及同 owner/同 class 触发器均已创建并复核。
- 已受控回填且复核：仅 `2025级8班` 的50名学生写入两张新表，各50条；`2025级7班` 在两张详情表中均为0条；无 student/owner/class 不一致详情行；既有 `students.id`、旧编号列和 `profile` JSON 未修改或删除。

阶段1最终人工验收已于 2026-09-03 完成：工作台账号登录成功；8班花名册50人、姓名/身份证件号/省学籍辅号/准考证号四列显示、学生信息按需加载、敏感字段默认隐藏、切换学生后重新隐藏、刷新后重新隐藏，均通过。验收过程中未记录或提交具体学生资料。阶段1正式关闭，下一阶段为阶段2（8班分组表与座次表）。

### 阶段 2：8班分组表与座次表（2026-09-03）

已完成本地实现，范围仅限“2025级8班班级管理”的两个独立子模块：固定版本 `.xlsx` 模板下载/解析、trim 后精确姓名匹配、重名阻断、重复学生/组长/结构错误校验、独立预览/确认/取消、独立 repository 和 A4 横向打印。解析只保留内存结构化预览；原始 File 不写入 localStorage、URL、日志或构建产物。

新增主要文件：`docs/01-stage2-group-seating-implementation.md`、`src/modules/class-management/domain/{group-layout,seating-layout}.ts`、`src/modules/class-management/imports/{templateContracts,groupTemplateParser,seatingTemplateParser,importValidation}.ts`、`src/modules/class-management/data/{groupLayoutRepository,seatingLayoutRepository}.ts`、`src/modules/class-management/printing/layoutPrint.ts`、`supabase/migrations/202609030001_stage2_group_seating.sql`、`supabase/verification/stage2_metadata.sql`、`tests/unit/stage2-layout.test.mjs`。页面四标签和本地 xlsx 资源接入位于 `src/modules/class-management/pages/ClassManagementPage.ts`、`src/main.ts`、`index.html`。

模板契约：分组 `v1` 为 `组别,成员1..成员4,组长`；座次 `v1` 为 8 行 x 9 列，使用 `STUDENT:姓名`、`EMPTY`、`AISLE`、`PODIUM` 标记。两套表分别调用 `replace_group_layout` 与 `replace_seating_layout`，migration 仅生成未应用。

验证结果：`npm run check`（格式、严格类型、契约、8项单元测试、语法）通过；`npm run build` 通过；`git diff --check` 通过。本地服务 `http://127.0.0.1:4173` 的 1280px 和 960x800 视口均无横向溢出、无控制台错误。未登录边界不显示学生姓名、模板预览或7班数据；未使用真实学生文件，未执行真实导入或确认保存。

远程状态：未连接或修改 Supabase；阶段2 migration 与 `stage2_metadata.sql` 均未执行。应用前必须先只读核对真实 schema、RLS、索引和 RPC 权限，不得猜测远程结构。

人工验收：登录工作台后进入“8班班级管理”，分别下载两类模板，用虚拟/脱敏数据上传，检查预览与逐项错误清单；确认前无正式写入，取消后布局不变；分别确认分组/座次并验证互不影响；检查打印为 A4 横向单页且标题不含更新时间。阶段3前置条件是完成上述只读云端核验、人工页面验收和依赖审计；阶段3不在本次范围内。
