# 🚢 部署指南：Vercel 一键上云

> 本项目已完成 Serverless 化改造，**可直接部署到 Vercel**。部署后自动获得双模式形态：访客看到 Demo 演示页，管理员登录后进入真实工作台。

---

## 一、部署架构总览

```text
浏览器访客 ──► Vercel Edge
                ├─ 静态页面（public/ · cleanUrls CDN 分发）
                │    /  /demo        → index.html（双模式看板）
                │    /login          → 登录/初始化
                │    /setup /onboarding
                └─ Serverless 函数（api/[...path].js · 预构建 CJS 产物）
                     /api/*  /auth/*  /healthz → CollectorServer.handle()
                     ├─ 认证门：Demo 沙箱 ⇆ Admin 真实管道
                     ├─ 存储：Vercel KV (Upstash REST)
                     └─ 出站：私有 LLM / 飞书 Webhook
```

**云端能力矩阵**：

| 能力 | 云端状态 | 说明 |
|---|---|---|
| Demo 演示页 / Admin 看板 | ✅ 完整 | 双模式隔离，密钥零泄露 |
| Chrome 扩展采集 | ✅ 完整 | 扩展配置 Vercel 域名即可，自动同步 + 指纹去重 |
| 官网直投雷达 | ✅ 完整 | 预置库免费；动态城市检索消耗管理员 LLM |
| 猎头帖溯源 | ✅ 完整 | 指纹匹配免费自动；AI 深度解析按需手动触发 |
| Onboarding 向导 / 档案 / 规则 | ✅ 完整 | 经统一存储层持久化到 KV |
| 飞书推送 | ✅ 完整 | 出站 HTTPS 无障碍 |
| PDF 简历解构 | ✅ 完整 | 本地走 `pdftotext`；云端自动切换 unpdf 纯 JS 提取（pdf.js 内核，支持中文），仅扫描版图片 PDF 需手动粘贴文本 |
| Mac 本地 JXA / CDP 扫描 | ❌ 仅本地 | 依赖本机 Chrome/AppleScript；云端由扩展采集替代 |
| Pi 原生会话树 | ⚠️ 降级 | 云端自动切换 LlmClient 轻量对话，功能等价 |

---

## 二、部署步骤（约 5 分钟）

### 1. 推送代码

```bash
git add -A
git commit -m "feat: Vercel-ready"
git push origin main
```

> `.gitignore` 已物理隔离所有敏感数据（真实履历、API Key、飞书密钥、账号库），推送前可 `git status` 复核。

### 2. Vercel 导入项目

1. 打开 [vercel.com](https://vercel.com/) → **Add New… → Project** → 选择本仓库；
2. Framework Preset 保持 **Other**（`vercel.json` 已配置好路由、构建命令与静态分发，无需任何改动）；
3. 点击 Deploy。

### 3. 创建 KV 数据库（必做）

> ⚠️ **这不是可选项**：Vercel 函数磁盘只读，没有 KV 则管理员账号与投递数据无法持久化（登录即失效）。

1. 项目页 → **Storage** → **Create Database** → **KV (Upstash)**；
2. 创建后连接到本项目，Vercel 自动注入 `KV_REST_API_URL` 与 `KV_REST_API_TOKEN` 环境变量；
3. 存储适配层（`src/storage/index.ts`）检测到这两个变量即自动启用云端读写，无需改代码。

> 💡 Upstash 经 Vercel Market 注入的变量可能**带前缀**（如 `a_KV_REST_API_URL` / `a_KV_REST_API_TOKEN`），属正常现象——存储层会自动扫描任意前缀的 `KV_REST_API_*` / `UPSTASH_REDIS_REST_*` 变量对，无需手动改名。

### 4. 配置环境变量

**Settings → Environment Variables** 添加：

| 变量 | 必要性 | 说明 |
|---|---|---|
| `LLM_API_KEY` | 必填 | 私有大模型密钥（仅管理员模式可触发） |
| `LLM_BASE_URL` | 必填 | 如 `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 必填 | 如 `deepseek-chat` |
| `FEISHU_WEBHOOK_URL` | 可选 | 飞书审批卡片推送 |

> 📌 **LLM 配置优先级**：环境变量是启动默认值；之后在 `/onboarding` 中保存的 LLM 配置（存于 KV）优先生效，若其中 API Key 留空则自动回填环境变量。两处任选其一即可，均已实测可用。

### 5. 部署后自检清单

- [ ] 打开 `https://<域名>.vercel.app` → 应看到 **Demo 演示模式**（琥珀色横幅 + 示例数据 + 管理员登录按钮）；
- [ ] 打开 `/login` → 首次进入创建管理员账号（scrypt 加盐，仅允许创建一次）；
- [ ] 登录后进入真实工作台，完成 `/onboarding` 初始化（LLM 配置、简历粘贴、红线设定）；
- [ ] Chrome 扩展 popup 填入 Vercel 域名 + `/setup` 页复制的采集令牌 → 「测试连通性」应返回健康（扩展可直接在 `/setup` 页下载 `extension.zip` 解压载入，无需克隆仓库）；
- [ ] 逛 Boss直聘/猎聘，扩展应自动同步新岗位并在看板出现。

---

## 三、数据初始化说明

云端 KV 从空库起步，**不迁移本地 `data/` 历史数据**（简历 PDF、本地投递记录不上云）。首次使用流程：

1. `/login` 创建管理员账号；
2. `/onboarding` 粘贴简历文本（云端不支持 PDF 解析）+ 配置 LLM + 对齐红线；
3. 之后所有采集、状态、配置均持久化在 KV。

如确需迁移本地历史投递记录，可编写一次性脚本将 `data/db/jobs_pipeline.json` 通过 Upstash REST API 推入同名键 `data/db/jobs_pipeline.json`。

---

## 四、本地开发模式

```bash
npm install
cp .env.example .env        # 填入 LLM/飞书配置
./job-hunter.sh start        # 或 npm run dev
```

本地模式使用文件存储（`data/**/*.json`），支持完整功能（含 Pi 原生会话与 Mac JXA 扫描）。本地与云端通过统一的存储键名保持数据结构一致。

---

## 五、常见问题

| 问题 | 排查 |
|---|---|
| 登录后刷新又变回 Demo | KV 未连接：函数磁盘只读，会话写不进去。完成步骤 3 后 Redeploy |
| 扩展提示无法连接 | popup 中服务地址需完整域名（`https://xxx.vercel.app`，不带末尾斜杠）；检查 `/healthz` |
| LLM 功能无响应 | 检查环境变量三个 `LLM_*` 是否都已配置并 Redeploy；确认配额未触发每日上限 |
| 静态页 404 | 确认 `vercel.json` 未被改动（依赖 `cleanUrls` 与 `/api` 重写） |
| FUNCTION_INVOCATION_FAILED / Invalid export | 确认 `package.json` **没有** `start` 脚本；确认 `api/[...path].js` 已提交且为最新构建（改过服务端代码必须重跑 `npm run build` 再 push） |
| KV 环境变量带前缀（如 `a_KV_REST_API_URL`）| 正常现象，存储层自动扫描任意前缀的变量对；也可登录后访问 `/api/diag/storage` 验证 KV 读写探测 |
| 重新部署后要求重新注册账号 | 几乎一定是**连接了多个 KV 数据库**（多组 `*_KV_REST_API_*` 变量并存）——不同部署可能选中不同的库，表现为"账号消失"。系统现已固定选择字母序第一的变量对；建议在 Vercel → Storage 中只保留一个库并 Redeploy。注册接口已带回读校验，写入失败会明确报错而非假成功 |

---

## 六、Serverless 构建产物说明（改服务端代码必读）

- API 函数**不是运行时编译**：`src/api-entry.ts` 由 `scripts/build-api.mjs`（esbuild）预构建为 CommonJS 产物 **`api/[...path].js` 并随仓库提交**，Vercel 直接使用该产物；
- 因此任何涉及 `src/api-entry.ts` 或 `src/modules/server/` 的改动，**推送前必须执行 `npm run build`** 重新生成 bundle（该命令内含 tsc 类型校验）；
- `package.json` 有意**不设置 `start` 脚本、`main` 与 `type` 字段**：Vercel 一旦将项目识别为 Node 应用，会劫持全部 `/api/*` 路由并导致 `FUNCTION_INVOCATION_FAILED`（Invalid export），请勿补回；
- playwright / Pi Agent 等重依赖通过变量动态导入排除在 bundle 之外，云端按需降级（JXA 扫描→扩展采集、Pi 会话树→LlmClient），Vercel 无需安装任何二进制。

**诊断端点**：管理员登录后访问 `/api/diag/storage`，可查看存储类型、KV 读写探测结果、检测到的（带前缀）KV 环境变量与 LLM 生效配置概览；未登录访客仅见布尔概览，不含任何密钥值。
