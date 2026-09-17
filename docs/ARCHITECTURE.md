# 🏗️ Job-Hunter OS 系统架构

> 本文档独立讲解 Job-Hunter OS 的技术架构，明确标注系统中 **哪些环节是 Workflow（确定性工作流）**、**哪些环节是 Agent（智能体/认知推理）**，以及两者如何协同编排。

---

## 🖼️ 交互式全景架构图

👉 **打开交互式架构图：[job-hunter-os.html](./architecture/job-hunter-os.html)**（本地直接用浏览器打开即可）

- 支持明暗双主题切换、节点搜索、上下游追踪与演示动画；
- 内置 3 个引导视图：**主干管道**（线索➔投递）、**Agent 认知层**、**Workflow 确定性护盾**；
- 图中每个节点均带 `[Workflow]` / `[Agent]` 标签，泳道自上而下分为：交互终端 ➔ Workflow 工作流管道 ➔ Agent 智能体层 ➔ 持久化与记忆。

> 架构图由 [Archify](https://github.com/tt-a1i/archify)（MIT License）技能生成，规格文件见 [job-hunter-workflow.json](./architecture/job-hunter-workflow.json)，已通过 9 项 showcase 级组合校验与多视口浏览器实测。

---

## 🧭 一图读懂：Workflow vs Agent

系统采用 **双引擎协同** 设计哲学：

```text
┌────────────────────────────────────────────────────────────┐
│  Workflow 引擎（确定性守门）—— 规则明确、可复现、零幻觉     │
│  负责：采集安全、硬性红线过滤、状态流转、通知分发            │
├────────────────────────────────────────────────────────────┤
│  Agent 引擎（认知与推理）—— 语义理解、个性化生成、记忆沉淀  │
│  负责：JD 深度洞察、简历动态裁剪、履历 STAR 打磨、意图对齐  │
└────────────────────────────────────────────────────────────┘
```

**分工原则**：凡是「对错分明、必须 100% 可靠」的判断（如双休红线、薪资底线、防重）交给 Workflow；凡是「需要理解语义、因人而异」的任务（如解读 JD、改写简历）交给 Agent。

---

## 📦 模块清单与类型标注

### ✅ Workflow 工作流模块（确定性）

| 模块 | 源码位置 | 核心职责 |
|---|---|---|
| 被动线索接入流 | `src/modules/discovery/` | Chrome 书签一键采集、纯只读 DOM 提取、公开 ATS 门户巡检（零登录风控） |
| **防风控熔断中枢** | `src/modules/safety/AntiRiskEngine.ts` | 验证码/403 特征毫秒级熔断、3.5~7.5s 拟人随机延时、单平台单日 20 条配额 |
| **严格规则初筛流** | `src/modules/filter/JobFilter.ts` | 双休一票否决、岗位时效（默认 3 个月）、薪资底线、黑名单关键词/公司过滤 |
| 通勤拓扑测算 | `src/modules/filter/CommutePlanner.ts` | 以用户常住地为起点，按城市地铁/公交网络估算单程通勤时长并否决超标岗位 |
| 工作制排查 | `src/modules/filter/ScheduleChecker.ts` | JD 文本工作制关键词扫描 + 企业口碑库风险提示 |
| **求职状态机** | `src/modules/tracker/JobTracker.ts` | MD5 指纹防重、30 天公司冷却期、`DISCOVERED ➔ APPLIED ➔ OFFER` 全生命周期流转 |
| 飞书卡片分发 | `src/modules/feishu/FeishuClient.ts` | 审批卡片构建与 Webhook 推送，手机端一键同意/拒绝/微调 |
| Web 看板服务 | `src/modules/server/CollectorServer.ts` | 本地 HTTP 服务、看板数据 API、偏好与安全状态接口 |

### 🤖 Agent 智能体模块（认知与推理）

| Agent | 源码位置 | 核心职责 |
|---|---|---|
| **Pi 履历专家 Agent** | `src/modules/ai/PiSessionCopilot.ts` | 以 `@earendil-works/pi-coding-agent` 为原生底座：增量会话推进（无历史重放）、`.jsonl` 会话树持久化、原生 Compaction 语义压缩记忆；严格事实依从（Strict Grounding）杜绝履历幻觉 |
| **JD 深度洞察 Agent** | `src/modules/ai/LlmClient.ts` → `analyzeJobWithLlm` | 基于 LLM 解构 JD 技术要求与业务痛点，识别隐性风险（隐晦单休、外包画饼、技术栈陈旧） |
| **简历动态裁剪 Agent** | `src/modules/ai/LlmClient.ts` → `rewriteTailoredResumeWithLlm` + `src/modules/tailor/ResumeTailor.ts` | 按目标 JD 痛点动态重排经历权重、提炼 STAR 量化亮点、生成高转化 HR 打招呼话术（LLM 不可用时降级为模板引擎） |
| **Onboarding 对齐 Agent** | `src/modules/onboarding/OnboardingService.ts` | 新用户上传简历 ➔ LLM 结构化解构 ➔ 与用户多轮对齐档案与求职红线 ➔ 一键初始化点火 |

### 💾 持久化状态层（Durable State）

| 存储 | 路径 | 说明 |
|---|---|---|
| 全量主履历库 | `data/profile/master_profile.json` | 候选人唯一事实源（Ground Truth），所有 Agent 生成严格依从 |
| 求职红线配置 | `data/preferences/rules.json` | 目标城市、常住地、通勤上限、薪资底线、黑名单等全参数动态配置 |
| 岗位管道数据库 | `data/db/jobs_pipeline.json` | 状态机全量记录（含初筛结果、定制简历快照） |
| Pi 会话记忆 | `data/memory/copilot_sessions/*.jsonl` | 履历打磨对话的原生会话树，支持跨会话续接与压缩 |
| 反馈记忆 | `data/memory/feedback.json` | 用户历史拒绝记录，沉淀为负向偏好持续学习 |

---

## 🔁 主干数据流（从线索到投递）

```text
用户浏览招聘网站
   │ 点击 📌 一键书签
   ▼
[Workflow] 被动线索接入 ──只读提取──► [Workflow] 防风控熔断审查
   │ 安全放行
   ▼
[Workflow] 严格规则初筛（双休/时效/通勤/薪资/黑名单）
   │ 通过初筛
   ▼
[Agent] JD 深度洞察 ──痛点解构──► [Agent] 简历动态裁剪
   ▲ 经历对齐                    │ STAR 亮点 + 高转化话术
   │                             ▼
[Agent] Pi 履历专家 ──沉淀──► Master Profile + 会话记忆
                                  │ 生成就绪
                                  ▼
                     [Workflow] 求职状态机（防重/冷却/流转）
                                  │ 推送决策
                                  ▼
                     📲 飞书交互卡片 ＋ 🖥️ Web 看板（人机协同闭环）
```

---

## 🛡️ 安全设计要点

1. **零封号承诺**：采集层 100% 纯只读，绝不操控前台浏览器跳转；熔断器在检测到风控特征时主动休眠并告警。
2. **隐私隔离**：`.gitignore` 物理隔离真实履历、API Key、生成简历与对话记忆；仓库仅保留脱敏 `*.example.json` 模板。
3. **事实依从**：所有 LLM 生成均以 `master_profile.json` 为唯一事实源，Prompt 内置最高防幻觉红线，严禁杜撰未载明的经历。
