# 班主任工作台

个人教师使用的班主任工作台。当前主线是**本地版**：零构建、纯浏览器运行，数据存在当前浏览器的 `localStorage`，不连接云端、不上传任何资料。

## 本地运行

```bash
npm install                       # 安装依赖（含 prettier / typescript / xlsx）
npm run build                     # 编译 src/ 的 TypeScript 并把 xlsx 拷进 dist/vendor/
node scripts/make-demo-seed.mjs   # 生成脱敏演示种子（仅首次，真实数据请替换该文件）
npm run serve                     # 起本地静态服务
```

打开 `http://localhost:4173/`。

> 本地版使用 ES 模块加载，**必须通过 HTTP 访问**，直接双击 `index.html`（`file://`）无法运行。
> 默认端口 4173；若被占用，用 `node scripts/serve.mjs . 4180` 换端口。

## 目录结构

```text
index.html              本地版入口（默认打开这个）
app/                    本地版源码（零构建，浏览器直接运行）
  main.js               入口：事件绑定、路由分发、保存动作
  core/                 基础设施：常量、日期、存储、UI 原语、学生目录、全局状态
  domain/               纯逻辑：排名、分组模板解析、座次模板解析
  io/                   文件读取（CSV / XLSX 分流）
  ui/                   外壳与弹窗
  pages/                每个业务页面一个文件（见下）
  styles/local.css      样式
legacy-cloud/           归档：旧的 Supabase 云端版（index.html + app.js + styles.css）
src/                    云端 TypeScript 基础（阶段 0–2 产出，暂保留）
supabase/               migrations 与只读核验 SQL
docs/                   需求与实施文档
scripts/                构建、静态服务、检查、种子生成
tests/                  node:test 单元与渲染测试
private-data/           私有学生种子（.gitignore 排除，不进仓库）
dist/                   构建产物（.gitignore 排除）
```

### `app/pages/` 一览

按页面拆分，改哪个页面就只动哪个文件：

| 文件 | 对应页面 |
| --- | --- |
| `dashboard.js` | 今日看板 |
| `class-management.js` | 8班班级管理（花名册、学生信息） |
| `layouts.js` | 分组表、座次表（模板下载/导入/打印） |
| `roster.js` | 姓名目录 |
| `schedule.js` | 课程表、临时调课 |
| `violations.js` | 违纪记录 |
| `homework.js` | 作业反馈 |
| `dictation.js` | 听写成绩 |
| `tests.js` | 单元测试 |
| `planning.js` | 课程规划 |
| `resources.js` | 资源库（常用网站） |
| `prep.js` | 备课中心 |

模块之间只允许**从上层依赖下层**：`core` → `domain`/`io` → `pages` → `ui` → `main`。`npm run check` 会校验语法、导入路径与依赖方向。

## 私有数据

学生姓名、身份证件号、学籍辅号、准考证号、成绩等一律不入仓库。

- 种子文件：`private-data/students.js`（设置 `window.WORKBENCH_SEED`），已被 `.gitignore` 排除。
- 仓库里只有 `scripts/make-demo-seed.mjs` 生成的**脱敏演示数据**（姓名形如「八班示例01」），用于跑通功能。
- 替换为真实数据时保持同一结构，直接覆盖 `private-data/students.js` 即可。
- 绝不要执行 `git add -f private-data`。

## 检查

```bash
npm run check     # 格式检查 + TypeScript 类型检查 + 契约检查 + 单元测试 + 模块检查
npm test          # 只跑测试
npm run format    # 用 prettier 规范化 app/
```

`tests/unit/local-app-render.test.mjs` 会在 DOM 桩上把每个页面真实渲染一遍；若 `private-data/students.js` 不存在则自动跳过。

## 历史文档

`HANDOFF.md` 与 `docs/00`–`docs/06` 记录旧的云端设计、迁移与模块需求，可作需求背景阅读，但不代表当前可运行状态。当前状态以 `docs/07-current-local-handoff.md` 和 `docs/08-continuation-plan.md` 为准。
