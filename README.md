# 🎯 Job-Hunter OS (云端双模式智能求职操作系统)

> 一款以 **Pi Coding Agent** 为会话底座、具备**零封号风险控制引擎**、**周末双休与通勤多维严苛初筛**、**按目标 JD 动态裁剪简历与话术**、**猎头帖真实企业溯源**与**官网直投雷达**的求职协作操作系统。支持 **Vercel 一键部署**：访客看 Demo 演示页，管理员用真实工作台，私有 LLM 密钥物理隔离。

---

## 🌟 核心特性

### 1. 🧩 Chrome 扩展自动采集（零封号 · 两段式）
* **自动同步**：正常浏览 Boss直聘/猎聘/智联时自动采集——列表页批量快筛（卡片自带公司名，无需进详情页），详情页自动深抓全量 JD 送 AI 分析；
* **三层防重复**：客户端 URL 归一指纹去重（重复岗位零请求）+ 服务端 MD5 指纹兜底（同一岗位从列表/详情/多次刷到均不重复入库）；
* **猎头帖识别**：自动标记猎头代发帖（含"某知名企业"类代称），入库即做免费官方帖指纹匹配；
* 安装指引见 `extension/README.md` 或部署后的 `/setup` 页——云端用户可直接在 `/setup` 下载 `extension.zip` 解压载入，**无需克隆仓库**。

### 2. 🕵️ 猎头帖真实企业溯源（CompanyResolver）
* **策略一（免费自动）**：职位指纹（标准化职位名 + 薪资分档 + 主城区）与看板内企业官方直发帖碰撞匹配，JD 要求重合度二次验证；
* **策略二（AI 按需）**：从 JD 泄露的商业线索（行业/规模/业务/园区）推断实际企业，严格红线——证据不足必须返回 null，严禁捏造。

### 3. 🛰️ 官网直投雷达（零风控渠道）
* 输入目标城市，优先呈现该区域**标杆企业官方招聘门户**（飞书招聘 ATS / Moka / Workday / SmartRecruiters / 企业官网），公开渠道无需招聘平台登录态；
* 预置精选库覆盖不足时，调用管理员私有大模型动态挖掘城市名企清单。

### 4. 🛡️ 零封号安全盾牌（AntiRiskEngine）
* **100% 真人浏览 DOM 只读**：云端绝不向招聘平台发起脚本探测；
* **熔断保护**：检测到验证码/风控特征毫秒级熔断并告警；
* **日配额硬保护**：单平台每日 20 条深析上限，超限岗位照样入库去重但跳过 LLM 与推送，钱包零风险。

### 5. ⚖️ 严苛求职红线把关（JobFilter · 全参数可配置）
* **周末严格双休**：单休、大小周一票否决；**时效审查**：拦截 3 个月以上僵尸岗位；
* **通勤规划**：常住地起点估算公共交通耗时；**黑名单**：驻场/外包关键词与企业动态排除。

### 6. 🧠 Pi Agent 履历合伙人 + 简历动态裁剪
* 本地以 Pi 原生会话树驱动（增量推进/压缩记忆/严格事实依从），云端自动降级为轻量 LLM 对话，功能等价；
* 按目标 JD 痛点动态重排经历、提炼 STAR 亮点、生成高转化 HR 话术（LLM 不可用时模板兜底）。

### 7. 👥 云端双模式隔离（Demo / Admin）
* **访客**：未登录自动进入 Demo 演示沙箱——脱敏示例数据、只读操作、AI 走本地 Mock（0 外部调用 0 计费）；
* **管理员**：`/login` 创建账号后进入真实工作台，私有 LLM 配置返回掩码、Demo 写操作一律 403；
* **统一存储**：本地 JSON ⇆ Vercel KV（Upstash）自动切换，键名一致零迁移。

### 8. ✨ 三分钟初始化向导
* 访问 `/onboarding`：配置大模型 ➔ 上传/粘贴简历 ➔ 设定意向与红线 ➔ AI 对齐确认 ➔ 一键点火。

---

## 🏗️ 系统架构

架构说明（Workflow 工作流 vs Agent 智能体的分工标注）已独立成篇：

👉 **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** —— 含模块级类型标注表与主干数据流

👉 **[交互式架构图](./docs/architecture/job-hunter-os.html)** —— 下载后浏览器打开，支持明暗主题/节点追踪/演示动画（由 [Archify](https://github.com/tt-a1i/archify) 生成）

---

## ☁️ Vercel 一键部署（推荐）

```bash
git push origin main   # 然后在 vercel.com 导入仓库即可
```

1. **导入项目**：Vercel → Add New Project，框架选 Other（`vercel.json` 已配好一切）；
2. **创建 KV（必做）**：项目 → Storage → Create Database → KV (Upstash) 并连接（无 KV 数据无法持久化）；
3. **环境变量**：`LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`（可选 `FEISHU_WEBHOOK_URL`）；也可登录后在 `/onboarding` 中配置——两处任选其一，`/onboarding` 配置优先，API Key 留空时自动回退环境变量；
4. **完成**：访客打开域名看 Demo，你访问 `/login` 创建管理员进入真实工作台。

完整指南（含能力矩阵、自检清单、常见问题）：👉 **[docs/DEPLOY.md](./docs/DEPLOY.md)**

---

## 💻 本地开发

```bash
git clone https://github.com/Feng-H/job-hunter-agent.git && cd job-hunter-agent
npm install
cp .env.example .env    # 填入 LLM 与飞书配置
./job-hunter.sh start
```

👉 **本地 Web 工作台**: [http://127.0.0.1:8765](http://127.0.0.1:8765)

```bash
./job-hunter.sh status   # 查看运行状态
./job-hunter.sh logs     # 实时日志
./job-hunter.sh stop     # 停止服务
```

本地模式额外支持：PDF 简历自动解构（pdftotext）、Pi 原生会话树、Mac JXA 本地扫描。

---

## 🔒 隐私与安全

- **🔐 内置账号体系**：scrypt 加盐哈希 + HttpOnly Cookie 会话 + Bearer 采集令牌（可随时重置）+ 失败锁定；
- **🧱 Demo/Admin 物理隔离**：私有 LLM 密钥与真实投递库对访客不可见，Demo 模式绝不发起真实 LLM 计费；
- **📁 数据不上库**：`.gitignore` 物理隔离真实履历、偏好、密钥、账号与所有敏感 PDF，仓库仅保留 `*.example.json` 模板。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。架构图由 [Archify](https://github.com/tt-a1i/archify)（MIT License）生成。
