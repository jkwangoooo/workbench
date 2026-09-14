# 文档索引

## 当前主线（本地版）

| 文件 | 内容 |
| --- | --- |
| [`07-current-local-handoff.md`](./07-current-local-handoff.md) | 接手时的本地版现状盘点、目录说明与风险清单 |
| [`08-continuation-plan.md`](./08-continuation-plan.md) | 接手推进计划：P0–P4 问题分级、阶段 A–E 执行顺序 |
| [`09-local-roadmap.md`](./09-local-roadmap.md) | **现行计划**：本地功能实现路线（L0–L7）+ 上云前的接口约束 |

## 归档：旧云端版

旧一代 Supabase 云端版的全部设计与实施文档，已随代码一起归入 [`legacy-cloud/docs/`](../legacy-cloud/docs/)：

| 文件 | 内容 |
| --- | --- |
| `HANDOFF.md` | 云端版交接总文档（数据源、阶段进展、遗留状态） |
| `00-stage0-schema-diff.md` | 阶段 0：既有库结构与目标结构的差异 |
| `01-class-management-module.md` | 班级管理模块（花名册、学生档案、导入）需求 |
| `01-stage2-group-seating-implementation.md` | 阶段 2：分组表与座次表实现说明 |
| `02-grades-module.md` | 成绩模块需求 |
| `03-daily-work-planning-module.md` | 每日工作规划模块需求 |
| `04-feedback-module.md` | 作业/听写反馈模块需求 |
| `05-resource-library-module.md` | 工作文件资源库模块需求 |
| `06-prep-workflow-integration.md` | 备课流程整合需求 |

这些文档记录的是云端版的需求与迁移过程，可作**需求背景**阅读；文中出现的 `src/`、`supabase/` 路径现已位于 `legacy-cloud/` 下，且**不代表当前可运行状态**。当前状态以本文档"当前主线"两篇为准。
