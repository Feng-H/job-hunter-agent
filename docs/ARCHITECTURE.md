# 🏗️ Job-Hunter OS 系统架构

> 本文档讲解 Job-Hunter OS 的技术架构，明确标注 **Workflow（确定性工作流）** 与 **Agent（智能体/认知推理）** 的分工，以及云端双模式（Demo 演示 / Admin 真实使用）的隔离设计。

---

## 🖼️ 交互式全景架构图

👉 **打开交互式架构图：[job-hunter-os.html](./architecture/job-hunter-os.html)**（本地直接用浏览器打开即可）

- 支持明暗双主题切换、节点搜索、上下游追踪与演示动画；
- 内置 4 个引导视图：**主干管道**（采集➔投递）、**Agent 认知层**、**Workflow 确定性护盾**、**零风控双通道采集**；
- 图中每个节点均带 `[Workflow]` / `[Agent]` 标签，泳道自上而下分为：交互终端 ➔ Workflow 工作流管道 ➔ Agent 智能体层 ➔ 持久化与记忆。

> 架构图由 [Archify](https://github.com/tt-a1i/archify)（MIT License）技能生成，规格文件见 [job-hunter-workflow.json](./architecture/job-hunter-workflow.json)，已通过 9 项 showcase 级组合校验与多视口浏览器实测。

---

## 🧭 一图读懂：双引擎 + 双模式

系统采用 **双引擎协同 + 双模式隔离** 设计哲学：

```text
┌──────────────────────────────────────────────────────────────────┐
│  双模式访问隔离门（每次 HTTP 请求的第一道关卡）                      │
│  ├─ 未登录访客 → Demo 演示沙箱（脱敏示例数据 · 只读 · 0 LLM 消耗）  │
│  └─ 管理员会话 / Bearer 采集令牌 → 真实工作台（私有 LLM · 真实库）  │
├──────────────────────────────────────────────────────────────────┤
│  Workflow 引擎（确定性守门）—— 规则明确、可复现、零幻觉             │
│  负责：采集安全、硬性红线过滤、指纹防重、状态流转、通知分发           │
├──────────────────────────────────────────────────────────────────┤
│  Agent 引擎（认知与推理）—— 语义理解、个性化生成、记忆沉淀          │
│  负责：JD 深度洞察、简历动态裁剪、猎头帖溯源、履历 STAR 打磨        │
└──────────────────────────────────────────────────────────────────┘
```

**分工原则**：凡是「对错分明、必须 100% 可靠」的判断（如双休红线、薪资底线、防重）交给 Workflow；凡是「需要理解语义、因人而异」的任务（如解读 JD、改写简历、推断真实企业）交给 Agent。

---

## 📦 模块清单与类型标注

### ✅ Workflow 工作流模块（确定性）

| 模块 | 源码位置 | 核心职责 |
|---|---|---|
| **双模式访问隔离门** | `src/modules/server/CollectorServer.ts` | Demo/Admin 双模式判定：访客自动进演示沙箱（示例数据、Mock AI、配置只读 403）；管理员会话（scrypt + HttpOnly Cookie）或采集 Bearer 令牌放行真实管道。私有 LLM 密钥对访客物理隔离 |
| **零风控采集接入** | `extension/`（Chrome 扩展）+ `scripts/bookmarklet.js` | 两段式采集：列表页批量快筛（卡片自带公司名，无需进详情）+ 详情页全量 JD 深抓；自动同步模式 + 客户端指纹去重（重复岗位零请求） |
| 官网直投雷达 | `src/modules/discovery/RegionalCareerRadar.ts` | 按城市检索标杆企业官方招聘门户（飞书 ATS / Moka / Workday / 官网 Careers），预置库优先、不足时 LLM 动态挖掘；公开渠道零风控 |
| **防风控熔断中枢** | `src/modules/safety/AntiRiskEngine.ts` | 验证码/403 特征毫秒级熔断、3.5~7.5s 拟人随机延时、单平台单日 20 条深析配额（超限仅入库不消耗 LLM） |
| **严格规则初筛流** | `src/modules/filter/JobFilter.ts` | 双休一票否决、岗位时效（默认 3 个月）、薪资底线、黑名单关键词/公司过滤，规则缺失时内置安全兜底 |
| **求职状态机** | `src/modules/tracker/JobTracker.ts` | MD5 指纹防重（**URL 归一化**：剔除 query/fragment，列表页与详情页同岗位同指纹）、30 天公司冷却期、全生命周期流转 |
| 飞书卡片分发 | `src/modules/feishu/FeishuClient.ts` | 审批卡片构建与 Webhook 推送，手机端一键同意/拒绝 |
| Vercel Serverless 入口 | `api/[...path].ts` + `vercel.json` | 单函数承载全部 API，`cleanUrls` 静态分发页面，`/api/*`、`/auth/*` 重写进入函数 |

### 🤖 Agent 智能体模块（认知与推理）

| Agent | 源码位置 | 核心职责 |
|---|---|---|
| **JD 深度洞察 Agent** | `src/modules/ai/LlmClient.ts` → `analyzeJobWithLlm` | 解构 JD 技术要求与业务痛点，识别隐性风险（隐晦单休、外包画饼、技术栈陈旧） |
| **简历动态裁剪 Agent** | `LlmClient.rewriteTailoredResumeWithLlm` + `src/modules/tailor/ResumeTailor.ts` | 按目标 JD 痛点动态重排经历、提炼 STAR 量化亮点、生成高转化打招呼话术（LLM 不可用降级模板） |
| **猎头帖溯源 Agent** | `src/modules/discovery/CompanyResolver.ts` | 双策略定位猎头帖真实企业：① 职位指纹（标准化职位名+薪资分档+主城区）与官方直发帖匹配 + JD 重合度验证（免费自动）；② AI 从 JD 商业线索推断（严格红线：证据不足必须返回 null，严禁捏造） |
| **Pi 履历专家 Agent** | `src/modules/ai/PiSessionCopilot.ts` | 本地以 `@earendil-works/pi-coding-agent` 原生会话树驱动（增量推进/压缩记忆）；云端自动降级为 LlmClient 轻量对话（变量模块名动态导入，兼容 Serverless 构建） |
| **Onboarding 对齐 Agent** | `src/modules/onboarding/OnboardingService.ts` | 上传简历 ➔ LLM 结构化解构 ➔ 多轮对齐档案与红线 ➔ 一键初始化（云端通过统一存储层持久化） |

### 💾 持久化状态层（Durable State）

| 存储 | 路径/键 | 说明 |
|---|---|---|
| **统一存储适配层** | `src/storage/index.ts` | 自动切换：本地读写 `data/**/*.json`；检测到 `KV_REST_API_URL`+`KV_REST_API_TOKEN` 时无缝切换 Vercel KV（Upstash REST）。键名与本地相对路径一致，零迁移成本 |
| 全量主履历库 | `data/profile/master_profile.json` | 候选人唯一事实源（Ground Truth），所有 Agent 生成严格依从 |
| 求职红线配置 | `data/preferences/rules.json` | 目标城市、通勤上限、薪资底线、黑名单等全参数动态配置 |
| 岗位管道数据库 | `data/db/jobs_pipeline.json` | 状态机全量记录（含初筛结果、定制简历快照、猎头帖溯源结果） |
| 账号与会话 | `data/auth/auth_state.json` | scrypt 密码哈希、会话令牌哈希、采集令牌 |

---

## 🔁 主干数据流（从采集到投递）

```text
Chrome 扩展（真人浏览：列表批量 / 详情深抓 / 本地指纹去重）
   │ Bearer 令牌提交
   ▼
[Workflow] 双模式访问隔离门 ──访客──► Demo 演示沙箱（脱敏数据·Mock AI·零计费）
   │ 管理员放行
   ▼
[Workflow] 防风控熔断审查（拟人延时 / 日配额，超限仅入库）
   │ 安全放行
   ▼
[Workflow] 严格规则初筛（双休/时效/薪资/黑名单）
   │ 通过初筛
   ▼
[Agent] JD 深度洞察 ──痛点解构──► [Agent] 简历动态裁剪
   │                                │ STAR 亮点 + 高转化话术
   │                                ▼
   │                    [Workflow] 求职状态机（URL 归一指纹防重/冷却）
   │                        │  ├─► [Agent] 猎头帖溯源 ➔ 溯源回写
   │                        │  └─► 全部状态 ➔ 统一存储层（本地 JSON / Vercel KV）
   │                        ▼
   │              📲 飞书交互卡片 ＋ 🖥️ 双模式 Web 看板（人机协同闭环）
   │
   └─ 旁路：[Workflow] 官网直投雷达 ──城市标杆企业门户──► 看板直达（零风控渠道）
```

---

## 🛡️ 安全设计要点

1. **零封号承诺**：采集层 100% 真人浏览 DOM 只读（扩展自动同步亦不产生异常流量）；云端绝不向招聘平台发起脚本探测；熔断器在检测到风控特征时主动休眠。
2. **双模式物理隔离**：Demo 访客与真实数据、私有 LLM 密钥彻底隔离——配置接口返回掩码、写操作 403、AI 接口走本地 Mock 沙箱（0 外部调用、0 计费）；仅管理员会话可触发真实 LLM。
3. **隐私隔离**：`.gitignore` 物理隔离真实履历、API Key、飞书密钥、系统状态与账号数据；仓库仅保留脱敏 `*.example.json` 模板。
4. **事实依从**：所有 LLM 生成均以主档案为唯一事实源，Prompt 内置最高防幻觉红线，严禁杜撰经历或企业名。
