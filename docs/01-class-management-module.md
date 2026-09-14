# 8班班级管理模块实施文档

> 状态：需求已确认，等待实施  
> 适用班级：2025级8班  
> 文档范围：花名册、学生信息、分组表、座次表  
> 明确不包含：7班展示、作业、听写、测试、违纪、课表、待办、资源库

## 1. 文档目的

本文件是“8班班级管理”模块的唯一实施依据。实施前先以本文件校验数据库、目录和接口边界；本文件没有确认的功能不得顺手加入。

当前原型中的以下旧结论由本文件替代：

1. 8班敏感信息由“完整展示”改为“默认隐藏、主动临时显示”。
2. 分组与座次功能重新纳入范围，并拆成两个相互独立的子模块。
3. 班级管理页面只展示2025级8班；2025级7班仅作为后续教学模块的最小姓名目录。

## 2. 已确认需求

### 2.1 页面结构

一级模块名称为“8班班级管理”，包含四个标签页：

1. 花名册
2. 学生信息
3. 分组表
4. 座次表

进入模块时默认打开“花名册”。四个标签页共享班级身份，但不得共享可变业务数据。

### 2.2 花名册

- 数据来源：`六年级8班_学籍号_准考证号.xlsx` 的 `Sheet1`。
- 仅取前四列，共50条学生记录：
  - 姓名
  - 身份证件号
  - 省学籍辅号
  - 准考证号
- 系统内统一显示为“2025级8班”，不显示源文件中的“六年级”名称。
- 只读，不提供新增、删除、逐项编辑、打印或导出。
- 支持按姓名、身份证件号、省学籍辅号和准考证号搜索。
- 点击姓名可进入对应学生的只读信息详情。
- 页面不出现7班切换入口。

### 2.3 学生信息

- 数据来源：`学生信息统计.xlsx` 的 `export` 工作表，共50条学生记录、16个源字段。
- 保留全部源字段：
  - 姓名
  - 请选择性别
  - 身体健康情况
  - 民族
  - 出生年月
  - 学生身份证号
  - 家庭住址
  - 常用联系电话
  - 父亲姓名
  - 父亲联系电话
  - 父亲工作单位
  - 母亲姓名
  - 母亲联系电话
  - 母亲工作单位
  - 特长爱好
  - 孩子优点
- 页面只读，不提供重新上传或在线编辑入口。
- 后续资料变化由受控的文件更新流程处理。
- 页面按“基础信息、健康与个人情况、联系方式、家庭信息、特长与优点”分组展示，不照搬 Excel 的横向布局。

### 2.4 敏感信息展示

以下字段默认显示为“已隐藏”：

- 身份证件号、学生身份证号
- 出生年月、身体健康情况、民族
- 家庭住址、常用联系电话
- 父母姓名、联系电话和工作单位

每个敏感字段提供独立的显示按钮。完整值只在用户主动操作后出现在当前页面；切换学生、切换标签、刷新页面、退出登录或会话失效后必须重新隐藏。

不得把完整敏感字段写入 URL、浏览器本地存储、埋点、错误日志、打印内容或静态 HTML。

### 2.5 分组表

- 仅用于2025级8班。
- 视觉结构参考已提供图片：每行一个小组，成员横向排列。
- 第一版通过固定 Excel 模板维护，不提供网页内拖拽或逐格编辑。
- 模板数据结构建议为：`组别 + 成员1..N + 组长`。
- “组长”列必须填写该组成员的姓名；网页中用纯色背景和粗体姓名显示组长。
- 示例图片中的黄色没有业务含义，导入时不得读取任意填充色作为数据。
- 允许空成员位置，允许尚未指定组长；同一小组最多一名组长。
- 同一名学生不能在一张分组表中重复出现。

### 2.6 座次表

- 仅用于2025级8班。
- 视觉结构参考已提供图片：保留左右座位区、过道、空位和讲台方位。
- 第一版通过固定 Excel 模板维护，不提供网页内拖拽或逐格编辑。
- 模板中的可编辑座位格与固定结构格必须区分；固定结构格使用约定标记，不依赖颜色或合并单元格推断含义。
- 允许空座；同一名学生不能在一张座次表中重复出现。
- 具体行列数在制作模板时确定并写入 `template_version`，解析器只接受已登记版本。

### 2.7 上传、预览与覆盖

分组表和座次表各有独立上传入口，流程固定为：

1. 下载对应标准模板。
2. 在 Excel 中填写。
3. 上传 `.xlsx` 文件。
4. 系统校验模板版本、姓名、重复项、组长和结构。
5. 展示网页预览与错误清单。
6. 用户确认后才写入数据库。

上传文件只用于解析，确认或取消后均不保留原始 Excel 文件。分组表确认更新时只能替换分组数据；座次表确认更新时只能替换座次数据。

姓名匹配只允许去除首尾空格后的精确匹配，不做模糊匹配。未知姓名直接报错；如果8班花名册中出现重名，姓名模板无法安全定位学生，必须先为模板增加不公开展示的内部识别列，禁止猜测匹配。

不提供历史版本和恢复功能。为避免半写入状态，每次替换必须在一个数据库事务中完成；任何一条记录失败时，当前有效表保持不变。

### 2.8 打印与 PDF

- 分组表和座次表支持浏览器打印及 PDF 导出。
- 默认 A4 横向、单页适配。
- 标题只显示“2025级8班”和“分组表”或“座次表”。
- 页面和导出文件均不显示更新时间。
- 花名册与学生信息不提供打印入口。

## 3. 数据归属与隔离原则

### 3.1 核心规则

“隔离”不等于每个模块复制一份学生姓名。学生身份必须只有一个稳定来源，否则改名、重名或排序变化会造成作业和成绩错配。

- `students.id` 是全系统稳定且不可变的学生 UUID。
- 班级管理模块拥有学生身份、8班花名册详情和8班学生档案。
- 后续作业、听写、测试和违纪模块只能保存 `student_id` 外键，不得复制学籍号、联系方式或完整档案。
- 其他模块只能通过“学生目录只读服务”获得 `id + class_id + display_name + active`，不得直接查询学生敏感信息表。
- 其他模块不得更新或删除学生身份。
- 学生离班或名单更新时标记为非活跃，不直接删除，以保护历史业务记录。

### 3.2 7班边界

- 7班数据不出现在“8班班级管理”页面和接口响应中。
- 7班只保存教学记录所需的内部 UUID、班级 UUID、姓名、排序和是否在用。
- 7班不创建花名册详情或学生档案记录。
- 7班文件只按已确认的 `Sheet2` 姓名列建立最小名单；其他工作表不得自动作为学生资料导入。
- 7班姓名仅由后续作业、听写和测试模块通过只读学生目录使用。

## 4. 建议数据库结构

沿用 Supabase/PostgreSQL、`auth.uid()` 所有权和 RLS。每张业务表都必须有 `owner_id`，并保持已有的按用户隔离策略。

数据库隔离不能只依赖前端传参：

- 父表应增加 `(id, owner_id)` 唯一约束，子表使用包含 `owner_id` 的复合外键，防止子记录引用其他所有者的数据。
- 分组和座次的写入事务必须同时校验 `layout.class_id = student.class_id`，防止8班布局引用7班学生。
- 分组和座次替换使用两个独立的 PostgreSQL 事务函数，函数采用调用者权限并继续受 RLS 约束；不得由浏览器先删除旧行、再逐条插入新行。
- 数据库拒绝跨所有者、跨班级和不完整替换，即使请求绕过了页面校验也不能写入。

### 4.1 共享引用表

#### `classes`

- `id uuid primary key`
- `owner_id uuid not null`
- `cohort_year smallint not null`，固定为 `2025`
- `class_number smallint not null`，当前为 `7` 或 `8`
- `display_name text not null`
- `active boolean not null default true`
- 唯一约束：`(owner_id, cohort_year, class_number)`

#### `students`

- `id uuid primary key`
- `owner_id uuid not null`
- `class_id uuid not null references classes(id) on delete restrict`
- `display_name text not null`
- `sort_order integer not null`
- `active boolean not null default true`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

此表只保存最小身份信息，不保存身份证号、电话、地址或成绩。

### 4.2 8班只读资料表

#### `student_roster_details`

- `student_id uuid primary key references students(id) on delete restrict`
- `owner_id uuid not null`
- `identity_document_no text`
- `provincial_student_no text`
- `exam_no text`
- `source_schema_version integer not null`
- `updated_at timestamptz not null`

#### `student_profiles`

- `student_id uuid primary key references students(id) on delete restrict`
- `owner_id uuid not null`
- 对应源文件其余15个字段的明确列
- `source_schema_version integer not null`
- `updated_at timestamptz not null`

不继续把完整档案长期堆在 `students.profile` JSON 中。迁移后，`students` 负责身份，`student_profiles` 负责档案；两者生命周期和访问权限分开。

### 4.3 分组表

#### `class_group_layouts`

- `id uuid primary key`
- `owner_id uuid not null`
- `class_id uuid not null references classes(id) on delete restrict`
- `template_version integer not null`
- `updated_at timestamptz not null`
- 唯一约束：每个班级只有一张当前分组表

#### `class_group_members`

- `id uuid primary key`
- `owner_id uuid not null`
- `layout_id uuid not null references class_group_layouts(id) on delete cascade`
- `student_id uuid not null references students(id) on delete restrict`
- `group_index integer not null`
- `slot_index integer not null`
- `is_leader boolean not null default false`
- 唯一约束：`(layout_id, student_id)`、`(layout_id, group_index, slot_index)`

数据库使用条件唯一索引保证同组最多一名组长；事务校验还必须保证组长属于该组，并且每个 `student_id` 与布局属于同一班级、同一所有者。

### 4.4 座次表

#### `class_seating_layouts`

- `id uuid primary key`
- `owner_id uuid not null`
- `class_id uuid not null references classes(id) on delete restrict`
- `template_version integer not null`
- `row_count integer not null`
- `column_count integer not null`
- `updated_at timestamptz not null`
- 唯一约束：每个班级只有一张当前座次表

#### `class_seating_cells`

- `id uuid primary key`
- `owner_id uuid not null`
- `layout_id uuid not null references class_seating_layouts(id) on delete cascade`
- `row_index integer not null`
- `column_index integer not null`
- `cell_kind text not null`，仅允许 `student / empty / aisle / podium`
- `student_id uuid references students(id) on delete restrict`
- `row_span integer not null default 1`
- `column_span integer not null default 1`
- 唯一约束：`(layout_id, row_index, column_index)`
- 同一 `layout_id` 下，非空 `student_id` 必须唯一

数据库检查约束必须保证：`cell_kind = student` 时 `student_id` 非空，其他格子类型的 `student_id` 必须为空。事务还要保证学生与布局属于同一班级、同一所有者。

## 5. 访问权限和隐私

### 5.1 登录

- 单用户账号，不开放注册。
- 使用 Supabase Auth 邮箱与密码登录。
- 可信设备登录状态最多保留7天；到期后必须重新登录。
- 未登录时不得返回学生姓名、人数、模板预览或任何敏感数据。

### 5.2 数据库权限

- 所有表启用 RLS。
- 查询、插入、更新和删除均要求 `auth.uid() = owner_id`。
- 不为调试关闭 RLS。
- 浏览器端只能使用 Supabase publishable/anon key；任何高权限密钥只能存在于受控服务端环境变量中，且本模块原则上不需要前端接触高权限密钥。

### 5.3 数据最小化

- 花名册列表接口不返回完整学生档案。
- 学生详情按所选学生单独读取，不预加载全班敏感字段。
- 分组和座次接口只返回显示所需的学生 UUID 与姓名，不返回花名册编号或档案。
- 原始 Excel、解析后的完整行、错误堆栈和接口响应不得写入客户端日志。
- Git 仓库、Vercel 静态产物和 Cloudflare 公共资源中不得包含学生真实数据。
- 本模块上传的两个模板不进入 R2；后续资源库如使用 R2，必须使用独立私有前缀和签名访问。

## 6. 模块目录和代码边界

当前 `app.js` 已承担过多职责。实施本模块时不得继续把页面、数据访问、Excel 解析和打印逻辑追加到单一文件中。目标目录至少按下列职责拆分：

```text
src/
  modules/
    class-management/
      pages/
        ClassManagementPage
      components/
        RosterTable
        StudentProfile
        GroupLayout
        SeatingLayout
        ImportPreview
      domain/
        student
        group-layout
        seating-layout
      data/
        studentRepository
        groupLayoutRepository
        seatingLayoutRepository
      imports/
        groupTemplateParser
        seatingTemplateParser
        importValidation
      printing/
        groupPrint
        seatingPrint
      tests/
  shared/
    auth/
    database/
    student-directory/
    ui/
supabase/
  migrations/
docs/
```

规则：

- 页面组件不得直接拼接 Supabase REST URL。
- 数据库调用只存在于对应 repository 或 server/API 层。
- Excel 解析器不得写数据库，只输出经过类型校验的预览对象。
- 保存逻辑不得解析 Excel，只接收已验证的结构化对象并再次校验。
- 打印模块只消费展示模型，不读取数据库。
- `shared/student-directory` 只暴露最小学生目录，不暴露档案 repository。
- 其他业务模块禁止从 `class-management` 的内部目录导入实现文件。
- 具体前端框架在总工程脚手架文档中确认，但必须使用 TypeScript 和上述模块边界。

## 7. 对外接口契约

本模块仅向其他模块提供只读学生目录：

```ts
type StudentDirectoryItem = {
  id: string;
  classId: string;
  displayName: string;
  sortOrder: number;
  active: boolean;
};

interface StudentDirectoryReader {
  listActiveByClass(classId: string): Promise<StudentDirectoryItem[]>;
  getById(studentId: string): Promise<StudentDirectoryItem | null>;
}
```

不得对外提供 `updateStudent`、`deleteStudent`、`getProfile` 或敏感字段搜索接口。

## 8. 文件更新流程

花名册和学生档案没有网页上传入口。后续源文件变化时使用受控更新脚本：

1. 只读解析源文件并验证工作表、表头和行数。
2. 生成更新预检报告，只显示新增、匹配、缺失和冲突数量，不输出完整隐私值。
3. 8班优先按省学籍辅号匹配，其次按身份证件号匹配；不得仅凭行号匹配。
4. 姓名冲突、编号冲突或无法唯一匹配时停止，要求人工确认。
5. 已存在学生必须保留原 `students.id`，不得因为重新导入而生成新 UUID。
6. 源文件中暂时缺失的学生标记为非活跃，不删除历史引用。
7. 花名册详情与档案在一个事务中更新。
8. 更新脚本、预检报告和临时文件不得提交 Git；执行完成后删除含隐私的临时产物。

7班更新另走最小名单流程，不得附带导入其他工作表中的身份证号、性别或成绩。

## 9. 错误处理

- 上传格式错误：指出模板类型和版本错误，不回显整行数据。
- 未匹配姓名：只在当前登录会话的预览中列出姓名，取消后清除。
- 重复学生：阻止确认，定位到组别/座位坐标。
- 分组表保存失败：保留原分组表，座次表不受影响。
- 座次表保存失败：保留原座次表，分组表不受影响。
- 档案读取失败：花名册仍可用，但不得用空数据覆盖数据库。
- 会话过期：清空内存中的敏感详情并跳转登录页。

## 10. 实施顺序

1. 建立模块目录、类型和 repository 边界，不改变现有业务行为。
2. 新增数据库迁移，将最小学生身份、花名册详情和学生档案分表。
3. 迁移现有8班数据，核对50名学生 UUID 不发生变化。
4. 实现8班四标签页面框架。
5. 实现花名册只读列表、搜索与学生详情跳转。
6. 实现档案分类展示、按需读取和敏感字段临时显示。
7. 制作不含真实学生数据的分组表与座次表标准模板。
8. 实现两个独立解析器、预览和校验流程。
9. 实现两个独立事务替换函数。
10. 实现 A4 横向打印与 PDF 样式。
11. 完成安全检查、跨设备验证和验收测试。

任何一步不得顺带迁移作业、听写、测试或其他模块。

## 11. 验收标准

### 11.1 花名册与档案

- 登录后只能看到2025级8班，共50名学生。
- 花名册只显示确认的四列，搜索四类字段均有效。
- 页面没有编辑、删除、打印、导出和7班入口。
- 学生详情保留源文件全部16个字段并正确分类。
- 所有敏感字段默认隐藏；切换学生或刷新后恢复隐藏。
- 花名册请求不包含完整档案数据。

### 11.2 分组表

- 只接受登记版本的分组模板。
- 空位置可预览；重复学生、未知姓名和多组长会阻止确认。
- 组长显示为纯色背景加粗体。
- 确认更新后只改变分组相关表。
- A4 横向单页输出，不显示更新时间。

### 11.3 座次表

- 只接受登记版本的座次模板。
- 空座、过道和讲台显示正确。
- 重复学生、未知姓名和非法坐标会阻止确认。
- 确认更新后只改变座次相关表。
- A4 横向单页输出，不显示更新时间。

### 11.4 隔离与安全

- 修改分组表不会改变座次、学生档案或任何教学记录。
- 修改座次表不会改变分组、学生档案或任何教学记录。
- 7班不会出现在本模块页面或网络响应中。
- 未登录、会话过期和非所有者请求均无法读取数据。
- 7天后登录状态失效。
- Git 变更、构建产物、浏览器存储和日志中不存在真实学生隐私数据。
- 数据库迁移和失败回滚不会改变学生 UUID 或破坏外键历史。

## 12. 暂不实施

- 网页内拖拽换座或调组
- 分组表、座次表历史版本与恢复
- 花名册或档案网页编辑
- 花名册打印、PDF 或 Excel 导出
- 任意格式 Excel 自动识别
- 7班班级管理页面
- 家长或其他教师账号
- 公开分享链接

以上功能如以后需要，必须另写需求和实施文档，不在本模块中预埋未经确认的业务逻辑。
