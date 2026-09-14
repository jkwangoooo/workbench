# 阶段 0 Schema 差异清单

状态：只读核验记录；`202608310001_stage0_baseline.sql` 仅为版本化、非破坏性阶段标记，未应用到远程 Supabase。

## 核验范围

依据当前 `app.js` 的 REST 路径、`HANDOFF.md` 已声明表清单，以及 `docs/01` 至 `docs/06` 的目标契约进行静态比对。未读取或记录任何行数据、学生资料、密钥或远程 schema 响应。

## 当前原型结构

当前代码通过原生 `fetch` 直接访问以下业务表：

`classes`, `students`, `schedule_cells`, `schedule_overrides`, `todos`, `quick_notes`, `violations`, `homework_batches`, `homework_feedback`, `dictation_sheets`, `dictation_columns`, `dictation_targets`, `dictation_scores`, `test_sheets`, `test_scores`, `test_rank_references`。

课程规划、资源库和备课入口仍有 localStorage 或占位逻辑；本阶段不迁移它们。

## 目标结构与差异

| 范围 | 当前原型 | 目标文档 | 兼容/迁移风险 |
| --- | --- | --- | --- |
| 学生身份 | `students` 同时含姓名、编号和 `profile` JSON | `students` 仅最小身份；新增 `student_roster_details`、`student_profiles` | 高：需稳定保留现有 `students.id`，先核对列、RLS、唯一键后再拆分；禁止猜测远程 schema |
| 班级标识 | 代码按 `name`/`teacher_role` 读取 | `cohort_year`、`class_number`、`display_name`、`active` | 中：名称字段映射和唯一约束需云端确认；不得直接改名覆盖历史引用 |
| 8班分组 | 未实现 | `class_group_layouts`、`class_group_members` 与事务替换函数 | 低（新增），但需复合 owner/class 校验和 RLS；失败必须保留旧布局 |
| 8班座次 | 未实现 | `class_seating_layouts`、`class_seating_cells` | 低（新增），需模板版本与 cell_kind 检查；失败必须保留旧布局 |
| 课表 | `schedule_cells`、`schedule_overrides`；`scope` 约束未知 | 文档要求按 owner/class/date 隔离 | 高：先读取真实约束和列，再决定兼容写法；不得关闭约束或远程试错 |
| 作业反馈 | `homework_batches` + `homework_feedback` | 按班级/日期独立，备注非空 | 中：核对 `note` 非空、学生目录外键与同班校验 |
| 听写 | 四张表，字段名由 fallback 兼容多个旧列 | 独立阶段、目标/成绩对、人工确认边界 | 高：字段 fallback 掩盖 schema 漂移；迁移前需导出结构元数据并设计显式版本 |
| 单元测试 | 三张表，成绩与排名写入 `test_scores` | 测试独立，排名规则由 domain 计算 | 中：核对日期/名称列和排名字段；不得把 dictation 记录混入 |
| 资源/备课 | localStorage/占位 | `resource_links`、私有文件元数据、外部备课 URL | 中：后续独立阶段处理；不得在本阶段创建业务页面 |

## 后续 migration 前置条件与回滚策略

1. `students` 拆分：前置为确认真实列、RLS、现有 UUID 数量和重复键；先创建新表并回填校验，再切读路径。回滚为停止切换并保留旧列/旧表，不删除原数据。
2. 分组布局：前置为确认 `classes`/`students` 的 owner 与 class 关系、事务函数权限和 RLS。回滚为事务整体失败自动回滚，保留当前有效布局。
3. 座次布局：前置为登记模板版本、确认坐标约束和 `cell_kind` 检查。回滚为事务整体失败自动回滚，保留当前有效布局。
4. 课表兼容：前置为只读获取 `schedule_cells_scope_check` 定义及列类型。回滚为继续使用当前已验证的本地显示兜底，不执行 DDL。
5. 作业/听写/测试：前置为确认实际字段、外键、非空约束和 RLS；先做只读查询与备份校验。回滚为停止新 repository 写入，保留旧 REST 路径和历史行。
6. 资源库/备课：前置为确认对象存储私有策略、签名 URL 和部署配置。回滚为不创建 bucket、不删除现有 localStorage 数据。

## 未验证项

- 未连接远程 Supabase，未执行 migration、DDL、写入、删除或部署。
- 未确认任何云端 check constraint、索引、触发器、函数或实际字段类型。
- `app.js` 的 schema fallback 仅是兼容现状的运行时策略，不代表目标 schema 已满足文档契约。
