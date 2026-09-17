# 🎯 Job-Hunter OS (基于 Pi Agent 的全自动智能求职操作系统)

> 一款以 **Pi Coding Agent (`@earendil-works/pi-coding-agent`)** 为会话核心底座、具备**零封号风险控制引擎**、**周末双休与通勤多维严苛初筛**、**按目标 JD 动态裁剪简历与打招呼话术**、并通过**飞书交互卡片与本地现代 Web 看板**驱动的下一代自主求职协作操作系统。

---

## 🌟 核心特性

### 1. 🛡️ 零封号安全盾牌（AntiRiskEngine）
* **100% 纯只读与被动模式**：彻底移除任何驱动浏览器跳转 URL、高频模拟点击等触发平台 WAF 的激进行为；
* **主动熔断保护（Circuit Breaker）**：遇到验证码或频率限制，系统毫秒级切断抓取动作并推送休眠通知，绝不与反爬硬碰硬；
* **拟人随机延时与配额控制**：每一步处理强制加入 3.5s ~ 7.5s 随机非匀速停顿，单平台单日限制处理 20 个岗位。

### 2. ⚖️ 严苛求职红线把关（JobFilter · 全参数可配置）
* **周末严格双休**：单休、大小周、排班轮休一票否决（违规词可自定义）；
* **岗位时效性审查**：仅处理近 N 个月（默认 3，可配 0=不限）内活跃发布的真实职位，拦截陈年僵尸岗位；
* **个性化通勤路线规划**：自定义常住地起点与通勤上限，自动估算公共交通耗时，超标直接否决；
* **负面场景黑名单**：驻场/驻厂/外派等关键词与企业黑名单动态排除。

### 3. 🧠 Pi Coding Agent 原生履历合伙人（Profile Copilot）
* **增量推进（No Replay）**：告别传统应用将整段历史重复重放给大模型的低效做法，利用 Pi 原生 `session.prompt()` 纯增量推进；
* **会话持久化**：历史对话直接存入 Pi 原生 `.jsonl` 树状结构，随开随续；
* **语义智能压缩（Compaction）**：长对话自动浓缩精炼关键事实，降低 Token 消耗并规避长上下文遗忘；
* **100% 严格事实依从（Strict Grounding）**：深度绑定个人主履历库，严禁大模型凭空捏造经历。

### 4. ✨ 三分钟初始化向导（Onboarding Wizard）
* 访问 `/onboarding`：配置大模型 ➔ 上传现有简历（PDF 自动解构）➔ 设定意向与红线 ➔ 与 AI 对齐确认 ➔ 一键点火启动。

### 5. 🌍 完全解耦、开箱即用（Zero Hardcoding）
* 没有任何写死的人名、经历、公司或城市，所有行为由 `master_profile.json` 与 `rules.json` 动态驱动。

---

## 🏗️ 系统架构

架构说明（Workflow 工作流 vs Agent 智能体的分工标注）已独立成篇：

👉 **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** —— 含模块级类型标注表与主干数据流

👉 **[交互式架构图](./docs/architecture/job-hunter-os.html)** —— 下载后浏览器打开，支持明暗主题/节点追踪/演示动画（由 [Archify](https://github.com/tt-a1i/archify) 生成）

---

## 🚀 快速上手指南

### 1. 克隆项目与安装依赖

```bash
git clone https://github.com/Feng-H/job-hunter-agent.git
cd job-hunter-agent

# 安装依赖
npm install
```

### 2. 初始化个人配置

从模板复制并编辑您的专属配置：

```bash
# 复制环境变量模板（配置大模型与飞书）
cp .env.example .env

# 复制个人求职偏好模板（配置城市、常住地、通勤上限与薪资）
cp data/preferences/rules.example.json data/preferences/rules.json

# 复制个人全量主档案模板（填入您真实的技能与经历）
cp data/profile/master_profile.example.json data/profile/master_profile.json
```

> 💡 也可以启动后直接打开 **[http://127.0.0.1:8765/onboarding](http://127.0.0.1:8765/onboarding)**，跟随 3 分钟向导完成全部配置（推荐）。

* **`.env`**：填入兼容 OpenAI 规范的 API Key（支持 DeepSeek / Claude / Qwen / GLM 等）与飞书 Webhook；
* **`data/profile/master_profile.json`**：填入个人真实履历（姓名、经历、项目亮点、技能栈）；
* **`data/preferences/rules.json`**：配置目标城市、常住通勤起点、薪资下限。

### 3. 一键启动服务

```bash
# 赋予脚本执行权限
chmod +x job-hunter.sh

# 启动 Job-Hunter OS
./job-hunter.sh start
```

启动完成后，打开浏览器访问：
👉 **本地 Web 工作台**: **[http://127.0.0.1:8765](http://127.0.0.1:8765)**

#### 快捷运维管理命令：
```bash
./job-hunter.sh status   # 查看服务运行状态
./job-hunter.sh logs     # 实时查看系统运行日志
./job-hunter.sh stop     # 停止后台服务
./job-hunter.sh restart  # 重启服务
```

---

## 🖥️ 核心功能模块与使用说明

### 1. 现代化求职看板（Kanban Board）
* 状态泳道清晰划分为：**待人工审批（Pending）** ➔ **同意投递（Approved）** ➔ **沟通中（Applied）** ➔ **初筛淘汰（Filtered Out）**；
* 点击卡片右侧滑出抽屉，可查看 **针对该岗位裁剪的定制 Markdown 简历**、**HR 打招呼高转化话术**、**通勤换乘明细**及**初筛得分与原因**。

### 2. 👤 全量档案库与 AI 履历打磨助手
* **左侧可视化卡片**：直观展示当前系统加载的个人全量履历，支持切换 JSON 源码直接修改；
* **右侧 AI 打磨对话框**：Markdown 优雅渲染、自适应大输入框（`Enter` 发送 / `Shift+Enter` 换行）、`🗜️ 压缩记忆` 与 `🗑️ 新会话` 一键控制。

### 3. ⚙️ 求职规则与硬性红线控制台
* 工作模式开关（远程/现场）、目标城市、常住通勤起点、薪资底线、初筛门槛分、非双休违规词、时效月数、期望职位与行业赛道、排除关键词与企业黑名单——全部网页在线配置，保存即刻生效。

### 4. 📌 一键书签采集工具（Bookmarklet）
* 打开 **[http://127.0.0.1:8765/setup](http://127.0.0.1:8765/setup)**；
* 将蓝色按钮拖拽到 Chrome 书签栏；
* 在 Boss直聘、猎聘、智联等网站浏览搜索时，点击书签，当前页面的所有岗位即可无缝送入 Agent 自动完成初筛与飞书推送！

---

## 🔒 隐私与开源安全规范

- 本项目的 `.gitignore` 已配置严格的数据隔离策略：
  * **自动忽略**：用户的真实履历（`master_profile.json`）、偏好设置（`rules.json`）、生成简历快照（`data/resumes_tailored/`）、历史聊天记忆（`data/memory/`）、本地日志（`logs/`）以及所有敏感的 `*.pdf` 文件；
  * 代码库中仅保留 `*.example.json` 作为标准演示模板，有效杜绝隐私泄露风险。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。架构图由 [Archify](https://github.com/tt-a1i/archify)（MIT License）生成。
