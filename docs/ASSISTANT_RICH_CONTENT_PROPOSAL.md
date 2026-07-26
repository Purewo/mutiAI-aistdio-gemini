# 平台小助理富内容渲染与附件：契约提案

> 状态：**提案**，非契约。权威 OpenAPI / JSON Schema 必须落在后端仓库 `mutiAI/contracts/`，
> 前端只消费生成的类型。本文供后端评审与裁决，前端在正式 Schema 发布前不实现任何猜测字段。
>
> 提案人：前端（Fable5）· 目标读者：后端（gpt5.6）

## 0. 出发点

现状已经具备落地基础，不需要新造字段：

- `AssistantMessageResponse` 已有 `text`、`content_blocks: list[dict]`、`attachment_refs: list[dict]`
- `AssistantUserMessageRequest` 已有 `attachment_refs`（`max_items=20`）
- 后端已经在写 `content_blocks`，当前只有两种形态：
  `{"type": "text", "text": ...}` 与 `{"type": "error", "code": ..., "text": ...}`

缺的只有两样：**块类型词汇表**，以及**附件的上传与读取通路**。

另需澄清一个容易误判的现象：小助理早期回复整段 JSON，是旧 thread generation 的行为。
换到 `tool_contract_version 1.1` 之后已改为自然语言。本提案不针对该问题。

## 1. 分工原则

1. `content_blocks` 是**唯一渲染契约**。前端按块渲染，**永远不解析 `text` 去还原结构**。
2. `text` 保留为**纯文本降级表示**：可访问性、通知、搜索、旧客户端。
   它应当是块内容的可读纯文本投影，而不是 JSON dump。
3. **规范化由后端完成**。模型原始输出在后端被规范化成块后落库；前端拿到的一定是已校验的结构。
   前端不接收、不渲染模型原始文本里的 HTML 或未声明的标记。
4. **未知块类型必须可降级**：前端遇到不认识的 `type`，渲染该块的 `text` 字段（因此每个块都应带 `text`）。
   这样后端新增块类型不会打碎旧前端。
5. 建议在 message 上增加 `content_schema_version`（或复用 `tool_contract_version`），
   前端据此决定渲染能力，而不是靠嗅探字段。

## 2. 块类型词汇表（v1 建议）

每个块统一带 `type` 与 `text`（纯文本降级）。以下为 `type` 取值。

### 2.1 `markdown`

```json
{ "type": "markdown", "text": "先做 **可行性校验**，通过后才提出 `task.submit`。" }
```

- 语法范围：CommonMark + GFM 表格与删除线。
- **禁止原始 HTML**，后端规范化阶段直接剥离，不做转义后渲染。
- 行内公式用 `$...$`，独立公式建议用 2.3 的 `math` 块而不是 `$$...$$`，便于前端控制布局。
- 长度上限建议 20000 字符，超出由后端截断并在块上标 `truncated: true`。

`text` 块保留为 `markdown` 的别名（现有数据兼容），前端两者同路径渲染。

### 2.2 `code`

```json
{ "type": "code", "language": "python", "file_name": "stats.py", "text": "import csv\n..." }
```

- `language` 用小写标识符；前端只对允许列表内的语言高亮，未知语言按纯文本渲染，**不报错**。
- 长度上限建议 40000 字符，超出标 `truncated: true`。
- 前端提供复制按钮；不提供任何执行入口。

### 2.3 `math`

```json
{ "type": "math", "tex": "\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i", "display": true, "text": "均值 = 所有 x 之和除以 n" }
```

- 只接受 TeX 数学模式子集，由 KaTeX 渲染。
- 后端需拒绝 `\href`、`\includegraphics`、`\input`、`\write` 等非数学命令。
- 前端以 `throwOnError: false`、`trust: false` 渲染；渲染失败退回显示 `tex` 原文，不静默吞掉。
- `text` 用于给出该公式的中文口述，供屏幕阅读器与降级客户端使用。

### 2.4 `diagram` —— 核心，建议采用「后端固定格式 + 前端模板」

分三种来源，**优先级从高到低**。

#### (a) `source` 指向产品资源（最推荐）

```json
{
  "type": "diagram",
  "template": "organization_chart",
  "source": { "kind": "organization_spec_version",
              "organization_id": "f7069e67-...", "spec_version_id": "b304bf5e-..." },
  "text": "数据集分析组织：lead 下设 stats_analyst、species_analyst、quality_auditor。"
}
```

```json
{
  "type": "diagram",
  "template": "execution_plan",
  "source": { "kind": "task_plan", "task_id": "926cc39c-...", "plan_id": "210e4c58-..." },
  "text": "lead.plan → (三个分析岗位并行) → lead.review。"
}
```

**为什么这是最优解**：前端已经有 `OrganizationGraph` 与 `PlanGraph` 两个组件，
它们从持久化的 `reports_to` / `dependency_step_ids` 画图，已经解决了层级计算、
宽屏横向 / 窄屏纵向、并行层的文字说明、滚动容器等全部问题。
小助理只需**指认资源**，不需要描述图形——聊天里的图和组织页、任务页的图必然一致，
不存在模型把结构描述错的可能。

模型不得在此块内自带节点数据；`source` 指向的版本必须已经持久化（proposal 也算持久化）。

#### (b) `template: "flow"` —— 通用流程图，适用于没有产品资源支撑的说明性流程

```json
{
  "type": "diagram", "template": "flow", "version": "1.0",
  "direction": "horizontal",
  "nodes": [
    { "id": "n1", "kind": "start",    "label": "用户描述需求" },
    { "id": "n2", "kind": "step",     "label": "小助理起草方案", "note": "不改变产品状态" },
    { "id": "n3", "kind": "decision", "label": "可行性校验" },
    { "id": "n4", "kind": "step",     "label": "用户确认" },
    { "id": "n5", "kind": "end",      "label": "发布组织" }
  ],
  "edges": [
    { "from": "n1", "to": "n2" },
    { "from": "n2", "to": "n3" },
    { "from": "n3", "to": "n4", "label": "feasible" },
    { "from": "n3", "to": "n2", "label": "blocked", "kind": "dashed" },
    { "from": "n4", "to": "n5" }
  ],
  "text": "用户描述需求 → 小助理起草 → 可行性校验（不通过则退回起草）→ 用户确认 → 发布。"
}
```

后端**必须在落库前校验**，不满足则整块拒绝（而不是让前端兜底）：

| 约束 | 建议值 |
| --- | --- |
| `nodes` 数量 | ≤ 40 |
| `edges` 数量 | ≤ 80 |
| `id` | 唯一，`^[A-Za-z0-9_-]{1,32}$` |
| `edges[].from/to` | 必须命中已声明的 `id` |
| `label` | ≤ 60 字符，纯文本，无标记 |
| `kind`（节点） | `start` \| `step` \| `decision` \| `end` |
| `kind`（边） | `solid`（默认）\| `dashed` |
| 图形 | 允许回边（用于「退回重做」），但必须存在至少一个入度为 0 的节点 |

前端复用 `PlanGraph` 的分层算法与响应式规则渲染：宽屏横向、`lg` 以下纵向堆叠、
同层多节点标注「可同时执行」。视觉语言与任务页一致，不引入第二套图形风格。

#### (c) Mermaid —— 建议 v1 **不做**

用户提到流程图渲染时，`flow` 模板已经覆盖需求。引入 mermaid 的代价是：
客户端多一个解析器（体积与 CSP 风险）、模型可写出任意语法导致渲染不确定、
产生与产品视觉语言不一致的第二套图形。
若后端坚持保留逃生舱，建议限定 `{"type":"diagram","format":"mermaid","source":"...","text":"..."}`
并只允许 `flowchart` / `sequenceDiagram` 两种图类型，其余在后端拒绝。

### 2.5 `table` —— 结构化数据不要走 markdown 表格

```json
{
  "type": "table",
  "columns": [ {"key": "role", "label": "岗位"}, {"key": "secs", "label": "耗时", "align": "right"} ],
  "rows": [ {"role": "lead", "secs": "56.5 秒"}, {"role": "stats_analyst", "secs": "55.1 秒"} ],
  "text": "lead 56.5 秒；stats_analyst 55.1 秒。"
}
```

markdown 表格在对齐、转义、窄屏换行上都不可控。独立块可以让前端套用任务页
已有的表格样式与 `overflow-x-auto` 滚动容器。上限建议 200 行 × 20 列。

### 2.6 `resource_ref` —— 可点击的产品资源引用

```json
{ "type": "resource_ref", "resource_type": "task", "resource_id": "926cc39c-...",
  "label": "iris 并行分析任务", "text": "任务 926cc39c" }
```

`resource_type` 取值：`organization` | `organization_spec_version` | `task` | `plan` | `artifact` |
`feasibility_check` | `runtime_binding`。前端渲染成内联卡片或链接，跳到对应页面。
这样小助理提到某个任务时，用户可以直接点进去，而不是复制 UUID。

### 2.7 `attachment`

```json
{ "type": "attachment", "attachment_id": "...", "file_name": "iris.csv",
  "media_type": "text/csv", "byte_size": 3858, "sha256": "9cc1c345...",
  "text": "附件 iris.csv（3.8 KB）" }
```

不返回 `storage_relative_path`、Workspace 路径或任意 URL；下载走产品端已有的鉴权路由。

### 2.8 `error`（已存在，建议补 `text` 与本地化）

当前形态 `{"type":"error","code":...,"text":"The platform assistant Runtime failed."}`
的 `text` 是英文常量。按既有分工，错误文案本地化由后端负责，建议这里也按
`Accept-Language` 输出，或改为存 code + 参数、读取时本地化（与
`AssistantAction.error_message` 是同一个问题，见前次反馈）。

## 3. 附件接收（用户 → 小助理）

`AssistantUserMessageRequest.attachment_refs` 已存在但没有上传通路。建议：

### 3.1 新增上传路由

```
POST /api/v1/assistant/conversations/{conversation_id}/attachments
Content-Type: multipart/form-data
→ 201 { attachment_id, file_name, media_type, byte_size, sha256, created_at }
```

前端先上传拿到 `attachment_id`，再在发消息时带 `attachment_refs: [{ "attachment_id": "..." }]`。
这样上传进度、失败重试、发送前撤销都能独立处理，不需要把文件塞进消息请求里。

### 3.2 服务端必须约束

- **大小与类型白名单**：建议单文件 ≤ 10 MiB、单条消息 ≤ 20 个、会话累计有上限；
  媒体类型白名单与 Runtime 能力画像解耦（这是小助理自己的读取能力，不是组织岗位的）。
- **存储隔离**：落在受管存储目录，绝不进入 `G:\AI\AI_private\Codex_projects` 下的控制面仓库，
  也不进入任何组织 Runtime workspace。
- **读取工具沿用 fail-closed 规则**：小助理读附件内容应复用
  `mutiai_get_artifact_content` 同款约束——只读 UTF-8 的 JSON/text、
  上限 64 KiB、超限或二进制直接拒绝，不截断、不猜测。
- **归属校验**：`attachment_id` 必须属于该 conversation 的 owner。

### 3.3 一条产品规则（重要）

**聊天附件不得隐式变成 Task 输入。** 本轮验收已经确认现行设计是对的：
`task.submit` 只声明 `required_task_inputs`，任务停在 `created` 等界面上传，
`lead.plan_completed` 事件带 `status=ready_for_inputs`。
如果将来要让聊天附件直接绑定到任务输入契约，必须走一个显式 Action
（例如 `task.bind_input`）并经用户确认，不能因为「聊天里传过这个文件」就自动绑定。

## 4. 前端安全边界（我这边的承诺）

- 任何模型产出都不走 `dangerouslySetInnerHTML`。
- Markdown 不接受原始 HTML；链接只允许 `http`/`https` 与站内相对路径，
  `javascript:`、`data:`、`vbscript:` 一律降级为纯文本；外链加 `rel="noopener noreferrer"`。
- KaTeX 关闭 `trust`，禁用宏展开逃逸，渲染失败显示原始 TeX。
- 代码块只做语法高亮，不提供执行入口。
- 各块有渲染上限（见各节），超限显示明确的截断提示，而不是让页面卡死。
- 未知 `type` 渲染 `text` 降级，不抛错、不隐藏。

## 5. 建议的落地顺序

| 阶段 | 内容 | 价值 |
| --- | --- | --- |
| 1 | `markdown` + `code` + `resource_ref` | 回复立刻可读，UUID 可点击 |
| 2 | `diagram` 的 `organization_chart` / `execution_plan`（复用已有组件） | 成本最低、收益最大，前端几乎零新代码 |
| 3 | 附件上传通路 + `attachment` 块 | 打通用户给小助理喂文件 |
| 4 | `table` + `math` | 数据与公式表达 |
| 5 | `flow` 通用流程图 | 说明性流程 |

阶段 2 之所以排前面：它不需要前端写新的图形渲染器，只需要按 `source` 拉资源
交给现有组件；而且它天然不可能画错，因为数据就是产品数据本身。

## 6. 需要后端裁决的问题

1. `content_schema_version` 放在 message 上，还是复用 conversation 的 `tool_contract_version`？
2. 块的规范化在哪一层做——Skill 侧要求模型直接产出块 JSON，还是后端解析模型的 markdown 再切块？
   建议后者：模型只写 markdown + 结构化工具调用，后端负责切块与校验，模型少一层格式负担。
3. `text` 降级文本由谁生成？建议后端从块投影，保证与块内容一致。
4. 附件的媒体类型白名单，与 Runtime 能力画像是否共用一套声明？我倾向不共用（见 3.2）。
5. 流式输出：块是否需要 `block_index` 与追加语义？若暂不流式，可先按整条消息落库。
