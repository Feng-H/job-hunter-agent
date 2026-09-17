# 🚢 部署指南：为什么不能直接导入 Vercel，以及云端化路线图

> 收到 Vercel「Import & Deploy」邀请邮件很正常（GitHub 公开仓库都会触发）。但请先读完本文：**当前版本是"本地优先"的个人 Agent 系统，直接部署到 Vercel 既不安全，也跑不起来。**

---

## 一、现状架构 vs 云端部署的核心差距

| 维度 | 当前实现（本地优先） | Vercel Serverless 环境 | 差距结论 |
|---|---|---|---|
| **认证与账号** | ✅ 已实现（本次更新）：登录/管理员初始化/改密/会话/采集令牌 | 需要持久化会话存储 | 会话存 JSON 文件，重启/多实例会丢，需迁 KV/DB |
| **数据持久化** | 本地 JSON 文件（`data/**/*.json`） | 函数文件系统**只读且临时**，每次调用可能重置 | ❌ 必须迁移到 Vercel Postgres / Upstash Redis / Turso |
| **PDF 简历解析** | 调用系统二进制 `pdftotext` | 无系统二进制 | ❌ 改为前端解析（pdf.js）或直接让 LLM 处理文本粘贴 |
| **Chrome 被动扫描 / JXA** | 依赖本机 Chrome 与 AppleScript | 云端无浏览器宿主 | ❌ 该能力仅限本地；云端只保留书签采集入口 |
| **Pi Agent 会话** | `SessionManager` 落盘 `.jsonl` | 同上不可写 | ❌ 需自实现 DB-backed SessionManager 或降级为无状态 LLM 调用 |
| **长耗时 LLM 调用** | 无超时限制（简历裁剪可达 30s+） | Hobby 默认 10s，最大可配 60~300s | ⚠️ 需 `maxDuration` 配置 + 流式/异步任务队列 |
| **书签采集入口** | `http://127.0.0.1:8765` | 可改为公网域名 | ✅ 本质可行（书签已支持自动识别部署域名 + Bearer 令牌） |
| **飞书 Webhook 推送** | 出站 HTTPS | 出站 HTTPS | ✅ 无障碍 |
| **安全边界** | localhost 天然隔离 + 已加登录 | 公网暴露，攻击面扩大 | ⚠️ 必须强制 HTTPS、限流、密钥走环境变量 |

## 二、本次已完成的"上云前置优化"（Phase 1 ✅）

即使暂时只跑在本地，这些也是公网部署的**硬性前置条件**，现已全部落地：

1. **🔐 登录与会话**
   - 首次访问 `/login` 引导创建管理员账号（仅一次）；
   - 密码 `scrypt` 加盐哈希存储，绝不存明文；
   - 会话令牌（随机 256bit）以 `HttpOnly + SameSite=Lax` Cookie 下发，有效期 7 天，服务端只存 SHA-256 哈希；
   - 连续 5 次失败登录按「用户名+IP」锁定 15 分钟。
2. **👤 账号管理**
   - 看板设置页新增「账号与安全管理」：在线修改密码（改密自动吊销其他会话）、安全退出登录；
   - 全部 `/api/*` 与页面统一过认证门：未登录 API 返回 401、页面 302 跳登录页。
3. **🔖 书签采集令牌（Bearer Token）**
   - 每账号一个专属采集令牌，书签 URL 自动携带，跨域提交走 `Authorization: Bearer`（不依赖 Cookie）；
   - 令牌可随时在看板/书签页一键重置，旧令牌立即失效；
   - 书签脚本自动识别部署域名——**未来部署到云端后，同一书签无需改动即可指向云端**。

## 三、云端化路线图（按需推进）

- **Phase 2 · 数据层抽象**：把 `data/*.json` 的读写抽成 `StorageAdapter` 接口（LocalFS / Postgres / Redis 双实现），Pi 会话与管道库全部迁入 DB。
- **Phase 3 · Serverless 适配**：把 `CollectorServer` 拆为 Vercel Functions（`api/*.ts`），`vercel.json` 配置 `maxDuration`，LLM 长任务改队列异步 + 飞书回执。
- **Phase 4 · 多租户 SaaS**：注册开放、每用户数据隔离、订阅计费——这是另一个产品形态，建议先验证个人云部署需求再做。

## 四、推荐做法

| 场景 | 建议 |
|---|---|
| **个人使用（推荐）** | 继续本地运行 `./job-hunter.sh start`，局域网/公网访问时已有登录保护；如需手机访问，用 Tailscale/Cloudflare Tunnel 打洞，**不要裸露公网** |
| **想体验"云端控制台"** | 完成 Phase 2/3 后部署 Vercel：手机任意设备点书签 → 云端初筛裁剪 → 飞书推送 |
| **收到 Vercel 邀请邮件** | 直接忽略即可，或先 Import 但设为 Private/Preview 防止误公开 |

> ⚠️ 千万不要把含真实履历与 API Key 的本地 `data/` 目录提交到任何仓库——`.gitignore` 已做物理隔离，请保持。
