# legacy-cloud —— 归档：旧 Supabase 云端版（冻结）

这里保存的是本项目**上一代**的云端实现，整代归档、不再开发。

当前主线是仓库根目录的**本地版**（`app/`，零构建 + `localStorage`），见根目录 `README.md`。

> 保留原因：这些代码与文档是本地版的规则来源（座次表结构、分组模板契约、隐私边界、字段口径等），需要时可回来逐项对照，不建议删除。
> 归档约定：新功能一律不写进这里；根目录的 `npm run check` 也不再覆盖这里，需要时单独跑 `npm run check:legacy`。

## 目录

```text
index.html                 旧云端前端入口
app.js                     旧云端前端主逻辑（原生 fetch，直连 Supabase REST）
styles.css
src/                       云端 TypeScript 重写（阶段 0–2，未接入运行时）
supabase/                  库结构：migrations + 只读核验 SQL
docs/                      云端版全部需求与实施文档（含 HANDOFF.md）
scripts/                   preflight-stage1.mjs：仅本地预检，不写库、不打印字段值
tests/                     归档单元测试 + 契约检查 + 格式卫生检查
tsconfig.json              TypeScript 配置（include: src/**/*.ts）
tsconfig.build.json        构建配置（rootDir src → outDir dist）
supabase-config.example.js
dist/                      归档构建产物（.gitignore 排除，需自行构建）
```

## 构建与检查

```bash
npm run build:legacy   # tsc 编译 src/ → legacy-cloud/dist/，并把 xlsx 拷进 legacy-cloud/dist/vendor/
npm run check:legacy   # tsc --noEmit + 契约检查 + 格式卫生检查 + 归档单元测试
```

`tsconfig.json`、`tests/` 与 `scripts/` 都以**自身位置**为基准解析路径，所以这两个命令既可以在仓库根执行，也可以在 `legacy-cloud/` 内执行。

## 运行归档前端（一般不需要）

`legacy-cloud/index.html` 依赖 `legacy-cloud/dist/main.js` 和 `legacy-cloud/dist/vendor/xlsx.full.min.js`，需先执行 `npm run build:legacy`。

它同时依赖全局 `window.WORKBENCH_SUPABASE`（参照 `supabase-config.example.js` 填写）指向一个真实 Supabase 项目；没有凭据时页面无法取数。

## 隐私边界

- `supabase/migrations/*.sql` 只包含结构与策略，不含任何真实学生行。
- `scripts/preflight-stage1.mjs` 只输出新增/匹配/缺失/冲突的**计数**，不写库、不打印字段值，并拒绝 7 班档案输入。
- 前端运行时数据全部来自浏览器会话，不写入仓库。
