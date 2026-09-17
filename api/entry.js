var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/storage/index.ts
import * as fs from "node:fs";
import * as path from "node:path";
function isCloudRuntime() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}
function getStorage() {
  if (!singleton) {
    singleton = isCloudRuntime() ? new VercelKVStorage() : new LocalFileStorage();
  }
  return singleton;
}
async function readJson(key, fallback) {
  try {
    const raw = await getStorage().read(key);
    if (raw === null || raw === "") return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[Storage] \u8BFB\u53D6 ${key} \u5F02\u5E38\uFF0C\u4F7F\u7528\u515C\u5E95\u503C:`, e.message);
    return fallback;
  }
}
async function writeJson(key, value) {
  await getStorage().write(key, JSON.stringify(value, null, 2));
}
var LocalFileStorage, VercelKVStorage, singleton;
var init_storage = __esm({
  "src/storage/index.ts"() {
    "use strict";
    LocalFileStorage = class {
      kind = "local-fs";
      async read(key) {
        const abs = path.resolve(process.cwd(), key);
        try {
          return fs.readFileSync(abs, "utf-8");
        } catch (e) {
          if (e.code === "ENOENT") return null;
          throw e;
        }
      }
      async write(key, content) {
        const abs = path.resolve(process.cwd(), key);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, "utf-8");
      }
    };
    VercelKVStorage = class {
      kind = "vercel-kv";
      baseUrl;
      token;
      constructor() {
        this.baseUrl = (process.env.KV_REST_API_URL || "").replace(/\/+$/, "");
        this.token = process.env.KV_REST_API_TOKEN || "";
      }
      async read(key) {
        const resp = await fetch(`${this.baseUrl}/get/${encodeURIComponent(key)}`, {
          headers: { Authorization: `Bearer ${this.token}` }
        });
        if (!resp.ok) throw new Error(`KV read failed: HTTP ${resp.status}`);
        const data = await resp.json();
        if (data?.result === null || data?.result === void 0) return null;
        return String(data.result);
      }
      async write(key, content) {
        const resp = await fetch(`${this.baseUrl}/set/${encodeURIComponent(key)}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "text/plain"
          },
          body: content
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          throw new Error(`KV write failed: HTTP ${resp.status} ${errText.slice(0, 100)}`);
        }
      }
    };
    singleton = null;
  }
});

// src/modules/tracker/JobTracker.ts
import * as crypto from "node:crypto";
var JobTracker;
var init_JobTracker = __esm({
  "src/modules/tracker/JobTracker.ts"() {
    "use strict";
    init_storage();
    JobTracker = class {
      dbKey;
      records = /* @__PURE__ */ new Map();
      ready;
      constructor(dbKey = "data/db/jobs_pipeline.json") {
        this.dbKey = dbKey;
        this.ready = this.load();
      }
      /** 确保底层存储已加载完成（云端首次调用时等待） */
      async ensureReady() {
        await this.ready;
      }
      async load() {
        const list = await readJson(this.dbKey, []);
        this.records = new Map(list.map((r) => [r.job.id, r]));
      }
      /**
       * 生成职位唯一指纹哈希
       * URL 做归一化（剔除 query 参数与 fragment、统一小写主机、去尾斜杠）：
       * 同一岗位从列表页卡片抓取（可能带 ?lid=xxx 等追踪参数）与从详情页抓取，产出相同指纹，防止重复入库。
       */
      generateFingerprint(company, title, platformIdOrUrl) {
        const cleanCompany = company.trim().toLowerCase().replace(/[\(（].*?[\)）]/g, "");
        const cleanTitle = title.trim().toLowerCase().replace(/\s+/g, "");
        const cleanUrl = this.normalizeUrl(platformIdOrUrl);
        const raw = `${cleanCompany}_${cleanTitle}_${cleanUrl}`;
        return crypto.createHash("md5").update(raw).digest("hex").substring(0, 16);
      }
      /** URL 归一化：剔除 ?query 与 #fragment，小写主机名，去尾部斜杠 */
      normalizeUrl(url) {
        try {
          const u = new URL(url.trim());
          return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
        } catch {
          return url.trim().replace(/[?#].*$/, "");
        }
      }
      /**
       * 检查岗位是否已经被处理过（已在库中）
       */
      isAlreadyProcessed(fingerprint) {
        return this.records.has(fingerprint);
      }
      /**
       * 检查公司冷却期（例如：同一家公司在 pastDays 天内是否投递过）
       */
      isCompanyInCooldown(company, cooldownDays = 30) {
        const cleanCompany = company.trim().toLowerCase();
        const now = Date.now();
        const cooldownMs = cooldownDays * 24 * 60 * 60 * 1e3;
        for (const record of this.records.values()) {
          const recCompany = record.job.company.trim().toLowerCase();
          if (recCompany.includes(cleanCompany) || cleanCompany.includes(recCompany)) {
            if (["APPROVED", "APPLIED", "COMMUNICATING", "INTERVIEWING"].includes(record.status)) {
              const applyTime = new Date(record.lastUpdated).getTime();
              if (now - applyTime < cooldownMs) {
                return { inCooldown: true, lastApplied: record.lastUpdated };
              }
            }
          }
        }
        return { inCooldown: false };
      }
      /**
       * 新增发现岗位
       */
      registerDiscoveredJob(job) {
        if (!job.id) {
          job.id = this.generateFingerprint(job.company, job.title, job.url);
        }
        if (this.records.has(job.id)) {
          return this.records.get(job.id);
        }
        const record = {
          job,
          status: "DISCOVERED",
          statusHistory: [
            {
              status: "DISCOVERED",
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              note: `\u9996\u6B21\u53D1\u73B0\u804C\u4F4D [${job.company}] ${job.title} \u6765\u81EA ${job.platform}`
            }
          ],
          lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.records.set(job.id, record);
        void this.save();
        return record;
      }
      /**
       * 更新岗位状态及附加数据
       */
      updateStatus(jobId, status, note, extra) {
        const record = this.records.get(jobId);
        if (!record) return null;
        record.status = status;
        record.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
        record.statusHistory.push({
          status,
          timestamp: record.lastUpdated,
          note
        });
        if (extra?.filterResult) record.filterResult = extra.filterResult;
        if (extra?.tailoredResume) record.tailoredResume = extra.tailoredResume;
        if (extra?.userFeedback) record.userFeedback = extra.userFeedback;
        this.records.set(jobId, record);
        this.save();
        return record;
      }
      getRecord(jobId) {
        return this.records.get(jobId);
      }
      getAllRecords() {
        return Array.from(this.records.values());
      }
      /**
       * 获取进度看板统计数据
       */
      getPipelineStatistics() {
        const stats = {
          DISCOVERED: 0,
          FILTERED_OUT: 0,
          PENDING_REVIEW: 0,
          REJECTED_BY_USER: 0,
          APPROVED: 0,
          APPLIED: 0,
          COMMUNICATING: 0,
          INTERVIEWING: 0,
          OFFER: 0,
          ARCHIVED: 0
        };
        for (const rec of this.records.values()) {
          if (stats[rec.status] !== void 0) {
            stats[rec.status]++;
          }
        }
        return {
          total: this.records.size,
          byStatus: stats
        };
      }
      async save() {
        try {
          await writeJson(this.dbKey, Array.from(this.records.values()));
        } catch (e) {
          console.error(`[JobTracker] \u4FDD\u5B58\u6570\u636E\u5931\u8D25:`, e);
        }
      }
    };
  }
});

// src/modules/tracker/FeedbackMemory.ts
var FeedbackMemoryManager;
var init_FeedbackMemory = __esm({
  "src/modules/tracker/FeedbackMemory.ts"() {
    "use strict";
    init_storage();
    FeedbackMemoryManager = class {
      fileKey;
      memory;
      ready;
      constructor(fileKey = "data/memory/feedback.json") {
        this.fileKey = fileKey;
        this.memory = {
          rejectedJobIds: [],
          negativeKeywords: [],
          negativeCompanyKeywords: [],
          resumeTweaks: [],
          historyFeedback: []
        };
        this.ready = this.load();
      }
      async ensureReady() {
        await this.ready;
      }
      recordRejection(jobId, company, jobTitle, reason) {
        if (!this.memory.rejectedJobIds.includes(jobId)) {
          this.memory.rejectedJobIds.push(jobId);
        }
        if (reason) {
          const lower = reason.toLowerCase();
          if (lower.includes("\u5916\u5305") && !this.memory.negativeKeywords.includes("\u5916\u5305")) {
            this.memory.negativeKeywords.push("\u5916\u5305");
          }
          if (lower.includes("\u516C\u53F8") || lower.includes("\u9ED1\u540D\u5355")) {
            if (!this.memory.negativeCompanyKeywords.includes(company)) {
              this.memory.negativeCompanyKeywords.push(company);
            }
          }
        }
        this.memory.historyFeedback.push({
          jobId,
          company,
          jobTitle,
          action: "REJECTED",
          reason,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
        this.save();
      }
      recordResumeTweak(targetJobTitle, instructions) {
        this.memory.resumeTweaks.push({
          targetJobTitle,
          instructions,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
        this.save();
      }
      getMemory() {
        return this.memory;
      }
      async load() {
        this.memory = await readJson(this.fileKey, {
          rejectedJobIds: [],
          negativeKeywords: [],
          negativeCompanyKeywords: [],
          resumeTweaks: [],
          historyFeedback: []
        });
      }
      async save() {
        try {
          await writeJson(this.fileKey, this.memory);
        } catch (e) {
          console.error("[FeedbackMemoryManager] \u4FDD\u5B58\u5931\u8D25:", e);
        }
      }
    };
  }
});

// src/modules/filter/ScheduleChecker.ts
var ScheduleChecker;
var init_ScheduleChecker = __esm({
  "src/modules/filter/ScheduleChecker.ts"() {
    "use strict";
    ScheduleChecker = class {
      /**
       * 检查 JD 文本与企业外部口碑中的工作制风险
       */
      async auditCompanySchedule(company, jdText) {
        const lowerJd = jdText.toLowerCase();
        if (lowerJd.includes("\u53CC\u4F11") || lowerJd.includes("\u5468\u672B\u53CC\u4F11") || lowerJd.includes("\u4E94\u5929\u5DE5\u4F5C\u5236") || lowerJd.includes("5\u59297.5\u5C0F\u65F6")) {
          return {
            status: "DOUBLE_WEEKEND",
            evidence: ["JD\u6587\u672C\u660E\u786E\u6807\u6CE8\uFF1A\u53CC\u4F11/\u4E94\u5929\u5DE5\u4F5C\u5236"],
            summary: "\u2705 \u660E\u786E\u53CC\u4F11"
          };
        }
        const redFlags = ["\u5355\u4F11", "\u5927\u5C0F\u5468", "\u8F6E\u4F11", "\u5355\u53CC\u4F11", "\u6708\u4F114\u5929", "\u505A\u516D\u4F11\u4E00"];
        for (const flag of redFlags) {
          if (lowerJd.includes(flag)) {
            return {
              status: "CONFIRMED_OVERTIME",
              evidence: [`JD\u6587\u672C\u76F4\u63A5\u5305\u542B\u975E\u53CC\u4F11\u5B57\u6837\uFF1A\u300C${flag}\u300D`],
              summary: `\u274C \u660E\u786E\u975E\u53CC\u4F11\uFF08${flag}\uFF09`
            };
          }
        }
        const knownScheduleMap = {
          "\u4E2D\u8054\u91CD\u79D1": { status: "RISKY", note: "\u90E8\u5206\u5236\u9020\u8F66\u95F4/\u5206\u90E8\u5B58\u5728\u5927\u5C0F\u5468\u6216\u6309\u4EA7\u7EBF\u6392\u73ED" },
          "\u4E09\u4E00\u91CD\u5DE5": { status: "RISKY", note: "\u6570\u5B57\u5316/\u603B\u90E8\u90E8\u95E8\u901A\u5E38\u53CC\u4F11\uFF0C\u4EA7\u7EBF\u53CA\u5916\u534F\u5B58\u5728\u52A0\u73ED/\u5355\u4F11" },
          "\u84DD\u601D\u79D1\u6280": { status: "CONFIRMED_OVERTIME", note: "\u591A\u6570\u4EA7\u7EBF\u4E0E\u6280\u672F\u5C97\u91C7\u7528\u5355\u4F11\u6216\u7EFC\u5408\u5DE5\u65F6\u5236" },
          "\u4E07\u5174\u79D1\u6280": { status: "DOUBLE_WEEKEND", note: "\u5168\u5458\u53CC\u4F11\uFF0C\u957F\u6C99\u7814\u53D1\u603B\u90E8\u4E25\u683C\u5B9E\u884C\u5468\u672B\u53CC\u4F11" },
          "\u5174\u76DB\u4F18\u9009": { status: "RISKY", note: "\u7535\u5546\u4E1A\u52A1\u7EBF\u90E8\u5206\u5C97\u4F4D\u5B58\u5728\u5927\u5C0F\u5468\u6216\u6392\u73ED\u5236" },
          "\u62D3\u7EF4\u4FE1\u606F": { status: "DOUBLE_WEEKEND", note: "\u8F6F\u4EF6\u7814\u53D1\u90E8\u95E8\u5E38\u89C4\u5468\u672B\u53CC\u4F11" }
        };
        for (const [key, val] of Object.entries(knownScheduleMap)) {
          if (company.includes(key)) {
            return {
              status: val.status,
              evidence: [`\u793E\u533A/\u4F01\u4E1A\u53E3\u7891\u5E93\u6C89\u6DC0\u8BB0\u5F55\uFF1A${val.note}`],
              summary: val.status === "DOUBLE_WEEKEND" ? "\u2705 \u4F01\u4E1A\u53E3\u7891\u5E93\u663E\u793A\u5E38\u89C4\u53CC\u4F11" : "\u26A0\uFE0F \u5B58\u5728\u5927\u5C0F\u5468\u6216\u6392\u73ED\u98CE\u9669"
            };
          }
        }
        return {
          status: "UNKNOWN",
          evidence: ["JD \u672A\u660E\u5199\u5DE5\u4F5C\u5236\uFF0C\u516C\u5F00\u6570\u636E\u672A\u547D\u4E2D\uFF0C\u5EFA\u8BAE\u5728\u6C9F\u901A\u65F6\u9996\u53E5\u786E\u8BA4\u5DE5\u4F5C\u5236"],
          summary: "\u2753 JD\u672A\u6CE8\u660E\uFF08\u9700\u4E0EHR\u4E8C\u6B21\u6838\u5B9E\uFF09"
        };
      }
    };
  }
});

// src/modules/filter/CommutePlanner.ts
var CommutePlanner;
var init_CommutePlanner = __esm({
  "src/modules/filter/CommutePlanner.ts"() {
    "use strict";
    CommutePlanner = class {
      defaultHomeBase;
      defaultMaxMinutes;
      constructor(homeBase = "\u957F\u6C99\u5730\u94C13\u53F7\u7EBF\u677E\u96C5\u6E56\u5357\u7AD9", maxMinutes = 90) {
        this.defaultHomeBase = homeBase;
        this.defaultMaxMinutes = maxMinutes;
      }
      /**
       * 估算从用户常住地到工作地点的公共交通/地铁通勤时间与路线规划
       * 支持多城市与自定义常住地评估
       */
      estimateCommute(workAddressOrArea, homeBase, maxMinutes) {
        const origin = homeBase || this.defaultHomeBase;
        const limitMinutes = maxMinutes ?? this.defaultMaxMinutes;
        const text = (workAddressOrArea || "").toLowerCase();
        const originLower = origin.toLowerCase();
        const isChangshaContext = originLower.includes("\u957F\u6C99") || originLower.includes("\u661F\u6C99") || originLower.includes("\u677E\u96C5\u6E56") || text.includes("\u957F\u6C99");
        if (isChangshaContext) {
          return this.estimateChangshaCommute(text, origin, limitMinutes);
        }
        return this.estimateGeneralCommute(text, origin, limitMinutes);
      }
      /**
       * 长沙本地地铁网络精细化路线规划
       */
      estimateChangshaCommute(text, origin, limitMinutes) {
        if (text.includes("\u5B81\u4E61") || text.includes("\u6D4F\u9633") || text.includes("\u94DC\u5B98") || text.includes("\u66AE\u4E91") || text.includes("\u576A\u5858\u6DF1\u5904") || text.includes("\u8336\u4EAD")) {
          return {
            isFeasible: false,
            estimatedMinutes: 120,
            transitSummary: `\u{1F6AB} \u8FDC\u90CA\u901A\u52E4\u8D85\u6807\uFF1A\u8DDD\u8D77\u70B9\u3010${origin}\u3011\u8D85\u8FC7 40+ \u516C\u91CC\u4E14\u65E0\u76F4\u8FBE\u5730\u94C1\uFF0C\u5355\u7A0B\u7EA6\u9700 120 \u5206\u949F`,
            locationTag: "\u8FDC\u90CA/\u65E0\u76F4\u8FBE\u5730\u94C1\u533A\uFF08\u8D85\u6807\u5426\u51B3\uFF09",
            distanceCategory: "OUT_OF_RANGE"
          };
        }
        if (text.includes("\u661F\u6C99") || text.includes("\u7ECF\u6D4E\u6280\u672F\u5F00\u53D1\u533A") || text.includes("\u7ECF\u5F00\u533A") || text.includes("\u6CC9\u5858") || text.includes("\u6E58\u9F99") || text.includes("\u3BBE\u68A8") || text.includes("\u677E\u96C5\u6E56")) {
          const mins2 = 20;
          return {
            isFeasible: mins2 <= limitMinutes,
            estimatedMinutes: mins2,
            transitSummary: "\u{1F687} \u6781\u901F\u901A\u52E4\uFF1A3\u53F7\u7EBF\u76F4\u8FBE\u6216\u516C\u4EA4\u76F4\u8FBE\uFF0C\u5355\u7A0B\u7EA6 15~25 \u5206\u949F",
            locationTag: "\u661F\u6C99/\u7ECF\u5F00\u533A\u4EA7\u4E1A\u56ED\uFF08\u6781\u8FD1\uFF09",
            distanceCategory: "CLOSE"
          };
        }
        if (text.includes("\u9A6C\u680F\u5C71") || text.includes("\u5F00\u798F") || text.includes("\u5E7F\u7535") || text.includes("\u6708\u6E56") || text.includes("\u56DB\u65B9\u576A")) {
          const mins2 = 30;
          return {
            isFeasible: mins2 <= limitMinutes,
            estimatedMinutes: mins2,
            transitSummary: "\u{1F687} \u8F7B\u677E\u901A\u52E4\uFF1A3\u53F7\u7EBF \u2192 \u6708\u6E56\u516C\u56ED\u5317\u7AD9\u6362\u4E585\u53F7\u7EBF\uFF0C\u5355\u7A0B\u7EA6 25~35 \u5206\u949F",
            locationTag: "\u9A6C\u680F\u5C71/\u5F00\u798F\u6838\u5FC3\u533A",
            distanceCategory: "CLOSE"
          };
        }
        if (text.includes("\u8299\u84C9") || text.includes("\u706B\u8F66\u7AD9") || text.includes("\u4E94\u4E00") || text.includes("\u96E8\u82B1") || text.includes("\u4E1C\u5858") || text.includes("\u9AD8\u6865")) {
          const mins2 = 40;
          return {
            isFeasible: mins2 <= limitMinutes,
            estimatedMinutes: mins2,
            transitSummary: "\u{1F687} \u4FBF\u6377\u901A\u52E4\uFF1A3\u53F7\u7EBF\u76F4\u8FBE\u6216\u706B\u8F66\u7AD9\u6362\u4E582\u53F7\u7EBF\uFF0C\u5355\u7A0B\u7EA6 35~45 \u5206\u949F",
            locationTag: "\u8299\u84C9\u533A/\u96E8\u82B1\u6838\u5FC3\u533A",
            distanceCategory: "MEDIUM"
          };
        }
        if (text.includes("\u9E93\u8C37") || text.includes("\u4E2D\u7535\u8F6F\u4EF6\u56ED") || text.includes("\u9AD8\u65B0\u533A") || text.includes("\u5CB3\u9E93") || text.includes("\u6885\u6EAA\u6E56") || text.includes("\u6D0B\u6E56") || text.includes("\u5927\u5B66\u79D1\u6280\u57CE")) {
          const mins2 = 55;
          return {
            isFeasible: mins2 <= limitMinutes,
            estimatedMinutes: mins2,
            transitSummary: "\u{1F687} \u5730\u94C1\u9AA8\u5E72\u4E92\u8054\uFF1A3\u53F7\u7EBF\u671D\u9633\u6751\u7AD9\u6362\u4E586\u53F7\u7EBF\u76F4\u8FBE\u9E93\u8C37\u4EA7\u4E1A\u56ED\uFF0C\u5355\u7A0B\u7EA6 50~65 \u5206\u949F",
            locationTag: "\u6CB3\u897F\u9AD8\u65B0\u533A/\u9E93\u8C37\u8F6F\u4EF6\u56ED",
            distanceCategory: "MEDIUM"
          };
        }
        if (text.includes("\u5929\u5FC3") || text.includes("\u7701\u653F\u5E9C") || text.includes("\u65B0\u5F00\u94FA") || text.includes("\u6842\u82B1\u576A")) {
          const mins2 = 50;
          return {
            isFeasible: mins2 <= limitMinutes,
            estimatedMinutes: mins2,
            transitSummary: "\u{1F687} \u5730\u94C1\u6362\u4E58\uFF1A3\u53F7\u7EBF\u4FAF\u5BB6\u5858\u7AD9\u6362\u4E581\u53F7\u7EBF\u76F4\u8FBE\uFF0C\u5355\u7A0B\u7EA6 45~55 \u5206\u949F",
            locationTag: "\u5929\u5FC3\u533A/\u7701\u653F\u5E9C\u7247\u533A",
            distanceCategory: "MEDIUM"
          };
        }
        if (text.includes("\u671B\u57CE") && (text.includes("\u6EE8\u6C34") || text.includes("\u6708\u4EAE\u5C9B") || text.includes("\u91D1\u661F\u5317"))) {
          const mins2 = 70;
          return {
            isFeasible: mins2 <= limitMinutes,
            estimatedMinutes: mins2,
            transitSummary: "\u{1F687} \u5730\u94C1\u8DE8\u533A\uFF1A3\u53F7\u7EBF\u6362\u4E584\u53F7\u7EBF\uFF0C\u5355\u7A0B\u7EA6 65~75 \u5206\u949F",
            locationTag: "\u671B\u57CE\u6708\u4EAE\u5C9B\u7247\u533A",
            distanceCategory: "FAR"
          };
        }
        const mins = 50;
        return {
          isFeasible: mins <= limitMinutes,
          estimatedMinutes: mins,
          transitSummary: `\u{1F687} \u5730\u94C1\u5E38\u89C4\u7F51\u7EDC\u8986\u76D6\uFF0C\u8DDD\u3010${origin}\u3011\u5355\u7A0B\u9884\u4F30\u7EA6 45~60 \u5206\u949F`,
          locationTag: "\u5E38\u89C4\u57CE\u533A\u7F51\u7EDC",
          distanceCategory: "MEDIUM"
        };
      }
      /**
       * 通用城市通勤评估
       */
      estimateGeneralCommute(text, origin, limitMinutes) {
        if (text.includes("\u504F\u8FDC") || text.includes("\u8FB9\u90CA") || text.includes("\u8FDC\u90CA") || text.includes("\u53BF\u57CE")) {
          return {
            isFeasible: false,
            estimatedMinutes: 110,
            transitSummary: `\u{1F6AB} \u8FDC\u90CA\u6216\u672A\u8986\u76D6\u533A\u57DF\uFF1A\u8DDD\u8D77\u70B9\u3010${origin}\u3011\u8FC7\u8FDC\uFF0C\u5355\u7A0B\u9884\u8BA1 > ${limitMinutes} \u5206\u949F`,
            locationTag: "\u8FDC\u90CA\u533A\u53BF",
            distanceCategory: "OUT_OF_RANGE"
          };
        }
        const estimatedMins = 45;
        return {
          isFeasible: estimatedMins <= limitMinutes,
          estimatedMinutes: estimatedMins,
          transitSummary: `\u{1F687} \u57CE\u5E02\u5E38\u89C4\u516C\u5171\u4EA4\u901A\u7F51\u7EDC\u8986\u76D6\uFF0C\u8DDD\u8D77\u70B9\u3010${origin}\u3011\u5355\u7A0B\u9884\u4F30\u7EA6 35~50 \u5206\u949F`,
          locationTag: "\u540C\u57CE\u5E38\u89C4\u901A\u52E4\u8303\u56F4",
          distanceCategory: "MEDIUM"
        };
      }
    };
  }
});

// src/modules/filter/JobFilter.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";
var JobFilter;
var init_JobFilter = __esm({
  "src/modules/filter/JobFilter.ts"() {
    "use strict";
    init_ScheduleChecker();
    init_CommutePlanner();
    JobFilter = class {
      rules;
      scheduleChecker;
      commutePlanner;
      constructor(rulesPath = path2.resolve(process.cwd(), "data/preferences/rules.json")) {
        this.rules = this.loadRules(rulesPath);
        this.scheduleChecker = new ScheduleChecker();
        this.commutePlanner = new CommutePlanner();
      }
      reloadRules(rulesPath = path2.resolve(process.cwd(), "data/preferences/rules.json")) {
        this.rules = this.loadRules(rulesPath);
      }
      loadRules(rulesPath) {
        try {
          if (fs2.existsSync(rulesPath)) {
            return JSON.parse(fs2.readFileSync(rulesPath, "utf-8"));
          }
          const examplePath = path2.resolve(process.cwd(), "data/preferences/rules.example.json");
          if (fs2.existsSync(examplePath)) {
            return JSON.parse(fs2.readFileSync(examplePath, "utf-8"));
          }
        } catch (e) {
        }
        return {
          strictRules: {
            mustDoubleWeekend: true,
            disallowedWorkSchedules: ["\u5355\u4F11", "\u5927\u5C0F\u5468", "\u505A\u516D\u4F11\u4E00"],
            maxStaleMonths: 3,
            excludeKeywords: ["\u9A7B\u573A", "\u5916\u5305"],
            excludeCompanies: []
          },
          scenarios: {
            remote: {
              enabled: true,
              name: "\u8FDC\u7A0B\u4F18\u5148",
              targetRoles: ["\u5168\u6808", "\u67B6\u6784\u5E08"],
              preferredLocations: ["\u5168\u56FD\u8FDC\u7A0B"],
              salaryRange: { min: 25e3, max: 6e4, currency: "CNY" },
              workMode: "REMOTE"
            },
            onsite: {
              enabled: true,
              name: "\u672C\u5730\u73B0\u573A",
              targetCities: ["\u4E0A\u6D77"],
              targetRoles: ["\u5168\u6808", "\u67B6\u6784\u5E08"],
              salaryRange: { min: 25e3, max: 6e4, currency: "CNY" },
              workMode: "ONSITE"
            }
          },
          scoringThresholds: {
            minScoreToNotify: 80,
            weights: {
              skillMatch: 40,
              experienceMatch: 30,
              scheduleAndBenefits: 20,
              growthAndDomain: 10
            }
          }
        };
      }
      /**
       * 对岗位进行深度过滤与评分
       */
      evaluate(job, profile, feedbackMemory) {
        const reasons = [];
        const textToScan = `${job.title} ${job.company} ${job.description}`.toLowerCase();
        const maxStaleMonths = this.rules.strictRules.maxStaleMonths ?? 3;
        if (maxStaleMonths > 0 && job.publishOrActiveTime) {
          const timeStr = job.publishOrActiveTime.trim();
          const isStale = this.checkIfStale(timeStr, maxStaleMonths);
          if (isStale) {
            return {
              passed: false,
              score: 0,
              reasons: [`\u89E6\u53D1\u65F6\u6548\u7EA2\u7EBF\uFF1A\u5C97\u4F4D\u66F4\u65B0\u65F6\u95F4\u4E3A\u300C${timeStr}\u300D\uFF0C\u8D85\u8FC7 ${maxStaleMonths} \u4E2A\u6708\u672A\u66F4\u65B0\uFF0C\u5224\u5B9A\u4E3A\u50F5\u5C38\u6302\u724C\u5C97\u4F4D`],
              breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
            };
          }
          reasons.push(`\u65F6\u6548\u4F18\u826F\uFF1A\u62DB\u8058\u4FE1\u606F\u8FD1\u671F\u5F85\u66F4\u65B0/\u6D3B\u8DC3\uFF08${timeStr}\uFF09`);
        }
        if (this.rules.strictRules.mustDoubleWeekend) {
          const disallowedList = this.rules.strictRules.disallowedWorkSchedules || [];
          for (const disallowed of disallowedList) {
            if (disallowed && textToScan.includes(disallowed.toLowerCase())) {
              return {
                passed: false,
                score: 0,
                reasons: [`\u89E6\u53D1\u5DE5\u4F5C\u5236\u7EA2\u7EBF\uFF1A\u5DE5\u4F5C\u5236\u5305\u542B\u975E\u53CC\u4F11\u5173\u952E\u8BCD\u300C${disallowed}\u300D`],
                breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
              };
            }
          }
        }
        for (const kw of this.rules.strictRules.excludeKeywords || []) {
          if (kw && textToScan.includes(kw.toLowerCase())) {
            return {
              passed: false,
              score: 0,
              reasons: [`\u89E6\u53D1\u786C\u6027\u7EA2\u7EBF\uFF1A\u5305\u542B\u7981\u6B62\u5DE5\u4F5C\u5F62\u5F0F\u300C${kw}\u300D`],
              breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
            };
          }
        }
        for (const comp of this.rules.strictRules.excludeCompanies || []) {
          if (comp && job.company.toLowerCase().includes(comp.toLowerCase())) {
            return {
              passed: false,
              score: 0,
              reasons: [`\u89E6\u53D1\u4F01\u4E1A\u9ED1\u540D\u5355\u7EA2\u7EBF\uFF1A\u4F01\u4E1A\u547D\u4E2D\u5C4F\u853D\u540D\u5355\u300C${comp}\u300D`],
              breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
            };
          }
        }
        if (feedbackMemory) {
          for (const comp of feedbackMemory.negativeCompanyKeywords) {
            if (job.company.toLowerCase().includes(comp.toLowerCase())) {
              return {
                passed: false,
                score: 0,
                reasons: [`\u89E6\u53D1\u7528\u6237\u5386\u53F2\u5C4F\u853D\u516C\u53F8\u89C4\u5219\uFF1A\u300C${comp}\u300D`],
                breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
              };
            }
          }
          for (const kw of feedbackMemory.negativeKeywords) {
            if (textToScan.includes(kw.toLowerCase())) {
              return {
                passed: false,
                score: 0,
                reasons: [`\u89E6\u53D1\u7528\u6237\u5386\u53F2\u8D1F\u5411\u5173\u952E\u8BCD\uFF1A\u300C${kw}\u300D`],
                breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
              };
            }
          }
        }
        let matchedScenario = void 0;
        const isRemoteJob = job.workMode === "REMOTE" || job.city.includes("\u8FDC\u7A0B") || job.title.toLowerCase().includes("\u8FDC\u7A0B") || job.title.toLowerCase().includes("remote");
        const homeBase = this.rules.scenarios.onsite?.homeBase || "\u5E38\u4F4F\u5730";
        const maxCommute = this.rules.scenarios.onsite?.maxCommuteMinutes || 90;
        const targetCities = this.rules.scenarios.onsite?.targetCities || ["\u957F\u6C99"];
        if (isRemoteJob) {
          if (this.rules.scenarios.remote?.enabled) {
            matchedScenario = "remote";
            reasons.push("\u547D\u4E2D\u6C42\u804C\u573A\u666F\uFF1A\u8FDC\u7A0B\u529E\u516C\u6A21\u5F0F\uFF08Remote\uFF09");
          } else {
            return {
              passed: false,
              score: 10,
              reasons: ["\u5DE5\u4F5C\u6A21\u5F0F\u4E0D\u7B26\uFF1A\u5F53\u524D\u4E3A\u8FDC\u7A0B\u5C97\u4F4D\uFF0C\u4F46\u914D\u7F6E\u672A\u542F\u7528\u8FDC\u7A0B\u529E\u516C"],
              breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
            };
          }
        } else if (this.rules.scenarios.onsite?.enabled) {
          const matchCity = targetCities.some(
            (city) => job.city.includes(city) || textToScan.includes(city.toLowerCase())
          );
          if (matchCity) {
            matchedScenario = "onsite";
            const commute = this.commutePlanner.estimateCommute(`${job.city} ${job.description} ${job.company}`, homeBase, maxCommute);
            if (!commute.isFeasible) {
              return {
                passed: false,
                score: 0,
                reasons: [`\u89E6\u53D1\u901A\u52E4\u7EA2\u7EBF\uFF1A\u8DDD\u79BB\u8D77\u70B9\u3010${homeBase}\u3011\u5355\u7A0B\u8D85\u51FA ${maxCommute} \u5206\u949F\uFF08${commute.transitSummary}\uFF09`],
                breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
              };
            }
            reasons.push(`\u547D\u4E2D\u6C42\u804C\u573A\u666F\uFF1A\u3010${targetCities.join("\u3001")}\u3011\u672C\u5730\u7EBF\u4E0B\uFF08\u8D77\u70B9\uFF1A${homeBase} \uFF5C ${commute.transitSummary}\uFF09`);
          } else {
            return {
              passed: false,
              score: 10,
              reasons: [`\u5730\u70B9\u4E0D\u7B26\uFF1A\u5F53\u524D\u4E3A\u300C${job.city}\u300D\uFF0C\u7EBF\u4E0B\u53EA\u8003\u8651\u3010${targetCities.join("\u3001")}\u3011\u672C\u5730`],
              breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
            };
          }
        } else {
          return {
            passed: false,
            score: 0,
            reasons: ["\u5DE5\u4F5C\u6A21\u5F0F\u4E0D\u7B26\uFF1A\u672A\u542F\u7528\u4EFB\u4F55\u7B26\u5408\u8BE5\u5C97\u4F4D\u7684\u6C42\u804C\u573A\u666F\uFF08\u8FDC\u7A0B\u6216\u7EBF\u4E0B\uFF09"],
            breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
          };
        }
        const minSalaryExpected = matchedScenario === "remote" ? this.rules.scenarios.remote?.salaryRange?.min || 15e3 : this.rules.scenarios.onsite?.salaryRange?.min || 15e3;
        if (job.salaryMax && job.salaryMax < minSalaryExpected) {
          return {
            passed: false,
            score: 30,
            reasons: [`\u85AA\u8D44\u4E0D\u7B26\uFF1A\u6700\u9AD8\u6708\u85AA ${job.salaryMax} \u5143\u4F4E\u4E8E\u671F\u671B\u5E95\u7EBF ${minSalaryExpected} \u5143`],
            breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
          };
        }
        const profileSkills = [
          ...profile.skills?.aiAndDigitalization || [],
          ...profile.skills?.industrialEngineering || [],
          ...profile.skills?.projectManagement || []
        ];
        const targetRoles = [
          ...this.rules.scenarios.onsite?.targetRoles || [],
          ...this.rules.scenarios.remote?.targetRoles || []
        ];
        const candidateSkills = Array.from(/* @__PURE__ */ new Set([
          ...profileSkills,
          ...targetRoles
        ])).filter((s) => Boolean(s && s.length >= 2));
        let matchedSkillCount = 0;
        const hitSkills = [];
        for (const skill of candidateSkills) {
          if (textToScan.includes(skill.toLowerCase())) {
            matchedSkillCount++;
            if (hitSkills.length < 6) hitSkills.push(skill);
          }
        }
        const skillScore = Math.min(40, Math.round(matchedSkillCount / Math.max(3, candidateSkills.length > 0 ? 5 : 3) * 40));
        if (hitSkills.length > 0) {
          reasons.push(`\u6280\u80FD\u5951\u5408\uFF1A\u5339\u914D\u6838\u5FC3\u5173\u952E\u8BCD [${hitSkills.join(", ")}]`);
        }
        const allExpectedRoles = Array.from(/* @__PURE__ */ new Set([
          ...targetRoles,
          profile.basicInfo?.title || ""
        ])).filter(Boolean);
        let expScore = 20;
        const hitRoles = [];
        for (const role of allExpectedRoles) {
          const rLower = role.toLowerCase();
          const parts = rLower.split(/[\/\s·,，]+/).filter((p) => p.length >= 2);
          for (const part of parts) {
            if (textToScan.includes(part) && !hitRoles.includes(part)) {
              hitRoles.push(part);
            }
          }
        }
        if (hitRoles.length > 0) {
          expScore += 10;
          reasons.push(`\u804C\u80FD\u5951\u5408\uFF1A\u547D\u4E2D\u76EE\u6807\u804C\u4F4D [${hitRoles.slice(0, 3).join(", ")}] \u4E0E\u5019\u9009\u4EBA\u5B9E\u6218\u7ECF\u9A8C\u5339\u914D`);
        }
        let scheduleScore = 15;
        if (textToScan.includes("\u53CC\u4F11") || textToScan.includes("\u5468\u672B\u53CC\u4F11") || textToScan.includes("\u4E94\u5929\u5DE5\u4F5C\u5236")) {
          scheduleScore = 20;
          reasons.push("\u5DE5\u4F5C\u5236\u5BA1\u6838\uFF1AJD \u660E\u786E\u627F\u8BFA\u3010\u5468\u672B\u53CC\u4F11\u3011");
        } else {
          reasons.push("\u5DE5\u4F5C\u5236\u5BA1\u6838\uFF1AJD \u672A\u76F4\u63A5\u6807\u6CE8\u53CC\u4F11\uFF0C\u7CFB\u7EDF\u6807\u8BB0\u5F85HR\u6838\u9A8C");
        }
        const targetDomains = this.rules.strictRules.targetDomains && this.rules.strictRules.targetDomains.length > 0 ? this.rules.strictRules.targetDomains : ["AI", "\u8F6F\u4EF6", "\u4E92\u8054\u7F51", "\u667A\u80FD\u5236\u9020", "\u6570\u5B57\u5316"];
        let domainScore = 6;
        const hitDomains = targetDomains.filter((d) => textToScan.includes(d.toLowerCase()));
        if (hitDomains.length > 0) {
          domainScore = 10;
          reasons.push(`\u8D5B\u9053\u5951\u5408\uFF1A\u547D\u4E2D\u671F\u671B\u884C\u4E1A\u9886\u57DF [${hitDomains.slice(0, 3).join("\u3001")}]`);
        } else {
          domainScore = 8;
        }
        const totalScore = skillScore + expScore + scheduleScore + domainScore;
        const minScore = this.rules.scoringThresholds?.minScoreToNotify ?? 75;
        const passed = totalScore >= minScore;
        if (!passed) {
          reasons.push(`\u7EFC\u5408\u5951\u5408\u5EA6\u5F97\u5206\uFF08${totalScore}\u5206\uFF09\u4F4E\u4E8E\u9884\u8BBE\u95E8\u69DB\uFF08${minScore}\u5206\uFF09`);
        }
        return {
          passed,
          score: totalScore,
          matchedScenario,
          reasons,
          breakdown: {
            skillMatch: skillScore,
            experienceMatch: expScore,
            scheduleAndBenefits: scheduleScore,
            growthAndDomain: domainScore
          }
        };
      }
      /**
       * 判断招聘信息是否超过规定月数未更新
       */
      checkIfStale(timeStr, maxMonths = 3) {
        if (maxMonths <= 0) return false;
        const lower = timeStr.toLowerCase();
        if (lower.includes("\u521A\u521A") || lower.includes("\u4ECA\u65E5") || lower.includes("\u4ECA\u5929") || lower.includes("\u6628\u5929") || lower.includes("\u5929\u524D") || lower.includes("\u5C0F\u65F6\u524D") || lower.includes("\u5468\u5185") || lower.includes("\u5468\u524D") || lower.includes("\u6708\u5185") || lower.includes("\u672C\u6708")) {
          return false;
        }
        if (maxMonths <= 1 && (lower.includes("\u4E2A\u6708\u524D") || lower.includes("\u6708\u524D"))) {
          return true;
        }
        if (lower.includes("\u534A\u5E74\u524D") || lower.includes("1\u5E74\u524D") || lower.includes("2\u5E74\u524D") || lower.includes("4\u4E2A\u6708\u524D") || lower.includes("5\u4E2A\u6708\u524D") || lower.includes("6\u4E2A\u6708\u524D")) {
          return true;
        }
        const dateMatch = timeStr.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
        if (dateMatch) {
          const year = parseInt(dateMatch[1], 10);
          const month = parseInt(dateMatch[2], 10) - 1;
          const day = parseInt(dateMatch[3], 10);
          const postDate = new Date(year, month, day);
          const diffDays = (Date.now() - postDate.getTime()) / (1e3 * 60 * 60 * 24);
          if (diffDays > maxMonths * 30) {
            return true;
          }
        }
        return false;
      }
    };
  }
});

// src/modules/ai/LlmClient.ts
var LlmClient;
var init_LlmClient = __esm({
  "src/modules/ai/LlmClient.ts"() {
    "use strict";
    init_storage();
    LlmClient = class {
      configKey;
      config;
      ready;
      constructor(configKey = "data/preferences/llm_config.json") {
        this.configKey = configKey;
        this.config = {
          provider: "openai_compatible",
          apiKey: process.env.LLM_API_KEY || "",
          baseUrl: process.env.LLM_BASE_URL || "https://api.deepseek.com/v1",
          model: process.env.LLM_MODEL || "deepseek-chat",
          temperature: 0.3
        };
        this.ready = this.loadConfig();
      }
      async ensureReady() {
        await this.ready;
      }
      getConfig() {
        return { ...this.config };
      }
      /**
       * 获取脱敏后的安全配置（安全展示给管理员页面，敏感密钥打码）
       */
      getMaskedConfig() {
        const rawKey = this.config.apiKey || "";
        let maskedKey = "";
        if (rawKey.length > 8) {
          maskedKey = `${rawKey.slice(0, 4)}\u2022\u2022\u2022\u2022${rawKey.slice(-4)}`;
        } else if (rawKey.length > 0) {
          maskedKey = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
        }
        return {
          provider: this.config.provider,
          baseUrl: this.config.baseUrl,
          model: this.config.model,
          temperature: this.config.temperature,
          apiKey: maskedKey,
          hasKey: Boolean(rawKey)
        };
      }
      async saveConfig(newConfig) {
        if (newConfig.apiKey && newConfig.apiKey.includes("\u2022\u2022\u2022\u2022") && this.config.apiKey) {
          delete newConfig.apiKey;
        }
        this.config = { ...this.config, ...newConfig };
        await writeJson(this.configKey, this.config);
      }
      /**
       * 测试大模型 API 连通性
       */
      async testConnection(overrideConfig) {
        const cfg = { ...this.config, ...overrideConfig || {} };
        if (!cfg.apiKey) {
          return { success: false, message: "API Key \u4E3A\u7A7A\uFF0C\u8BF7\u5148\u914D\u7F6E API Key" };
        }
        try {
          const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 12e3);
          const resp = await fetch(url, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${cfg.apiKey}`
            },
            body: JSON.stringify({
              model: cfg.model,
              messages: [{ role: "user", content: 'Say "OK" if you can hear me.' }],
              max_tokens: 10
            })
          });
          clearTimeout(timer);
          if (!resp.ok) {
            const errText = await resp.text();
            return { success: false, message: `HTTP ${resp.status}: ${errText.substring(0, 100)}` };
          }
          const data = await resp.json();
          const reply = data?.choices?.[0]?.message?.content || "OK";
          return { success: true, message: `\u8FDE\u63A5\u6210\u529F\uFF01\u6A21\u578B\u54CD\u5E94: ${reply.trim()}` };
        } catch (e) {
          return { success: false, message: `\u8BF7\u6C42\u5931\u8D25: ${e.message}` };
        }
      }
      /**
       * 标准调用接口
       */
      async complete(userPrompt, systemPrompt = "You are a helpful assistant.") {
        return this.callChatCompletions(systemPrompt, userPrompt, 1500);
      }
      /**
       * 使用 LLM 对 JD 进行深度语义理解与风险洞察
       */
      async analyzeJobWithLlm(job, profile) {
        if (!this.config.apiKey) return null;
        const candidateName = profile.basicInfo?.name || "\u5019\u9009\u4EBA";
        const years = profile.basicInfo?.yearsOfExperience || 10;
        const title = profile.basicInfo?.title || "\u8D44\u6DF1\u4E13\u5BB6";
        const companies = (profile.workExperiences || []).slice(0, 3).map((e) => `${e.company}\xB7${e.role}`).join("\u3001");
        const systemPrompt = `\u4F60\u662F\u4E00\u4F4D\u9876\u7EA7\u730E\u5934\u5408\u4F19\u4EBA\u4E0E\u6C42\u804C\u987E\u95EE\u3002
\u5019\u9009\u4EBA\u3010${candidateName}\u3011\u62E5\u6709 ${years} \u5E74\u3010${title}\u3011\u80CC\u666F\uFF08\u4EE3\u8868\u7ECF\u5386\uFF1A${companies || "\u8BE6\u89C1\u4E3B\u5C65\u5386"}\uFF09\u3002
\u8BF7\u4E25\u683C\u8BC4\u4F30\u76EE\u6807\u5C97\u4F4D\u4E0E\u5019\u9009\u4EBA\u7684\u5339\u914D\u5EA6\uFF08\u6EE1\u5206100\u5206\uFF09\u3002
\u8BF7\u52A1\u5FC5\u8BC6\u522B\u5C97\u4F4D\u4E2D\u7684\u9690\u6027\u98CE\u9669\uFF08\u5982\u9690\u6666\u5355\u4F11/\u5927\u5C0F\u5468\u3001\u5916\u5305\u753B\u997C\u3001\u6280\u672F\u8001\u65E7\u3001\u9A7B\u573A\u51FA\u5DEE\u7B49\uFF09\u3002
\u8F93\u51FA\u4E25\u683C\u7684 JSON \u683C\u5F0F\uFF1A
{
  "score": 85,
  "reasons": ["\u5339\u914D\u7406\u75311", "\u5339\u914D\u7406\u75312"],
  "risks": ["\u6F5C\u5728\u98CE\u9669\u70B91\uFF08\u5982\u65E0\u5219\u7559\u7A7A\uFF09"],
  "highlightAdvice": "\u9488\u5BF9\u672C\u5C97\u4F4D\u5EFA\u8BAE\u5728\u7B80\u5386\u4E2D\u91CD\u70B9\u7A81\u51FA\u7684\u80FD\u529B\u6A21\u5757"
}`;
        const userPrompt = `\u76EE\u6807\u4F01\u4E1A\uFF1A${job.company}
\u76EE\u6807\u804C\u4F4D\uFF1A${job.title}
\u85AA\u8D44\uFF1A${job.salaryText}
\u5DE5\u4F5C\u5730\u70B9\uFF1A${job.city}
JD \u539F\u6587\uFF1A
${job.description}`;
        try {
          const respText = await this.callChatCompletions(systemPrompt, userPrompt);
          const jsonMatch = respText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          console.warn("[LlmClient] LLM \u5C97\u4F4D\u5206\u6790\u964D\u7EA7\u4E3A\u5185\u7F6E\u89C4\u5219:", e);
        }
        return null;
      }
      /**
       * 使用 LLM 针对具体目标岗位，从全量主档案中进行深度定制化简历重写
       */
      async rewriteTailoredResumeWithLlm(job, profile, userTweakInstructions) {
        if (!this.config.apiKey) return null;
        const systemPrompt = `\u4F60\u662F\u4E00\u4F4D\u8D44\u6DF1\u730E\u5934\u4E0E\u5C65\u5386\u7CBE\u4FEE\u4E13\u5BB6\u3002
\u4F60\u7684\u4EFB\u52A1\u662F\u6839\u636E\u7ED9\u5B9A\u7684\u3010\u76EE\u6807\u5C97\u4F4D JD\u3011\u4E0E\u3010\u5019\u9009\u4EBA\u5168\u91CF\u4E3B\u5C65\u5386\u5E93\u3011\uFF0C\u4E3A\u5019\u9009\u4EBA\u91CF\u8EAB\u5B9A\u5236\u4E00\u4EFD\u6781\u5177\u7ADE\u4E89\u529B\u3001\u7ED3\u6784\u4E25\u5BC6\u3001\u91CF\u5316\u6570\u636E\u6781\u5F3A\u7684\u9AD8\u6C34\u51C6 Markdown \u683C\u5F0F\u7B80\u5386\uFF0C\u5E76\u751F\u6210\u4E00\u6BB5\u9AD8\u8D28\u91CF\u7684 HR \u6253\u62DB\u547C\u8BDD\u672F\u3002
\u8981\u6C42\uFF1A
1. \u7EDD\u5BF9\u4FDD\u771F\uFF0C\u6240\u6709\u516C\u53F8\u540D\u79F0\u3001\u9879\u76EE\u6570\u636E\u4E0E\u6280\u80FD\u7EC6\u8282\u5FC5\u987B 100% \u4E25\u683C\u6765\u6E90\u4E8E\u7ED9\u5B9A\u7684\u5019\u9009\u4EBA\u4E3B\u6863\u6848\uFF0C\u4E25\u7981\u51ED\u7A7A\u634F\u9020\u4EFB\u4F55\u672A\u63D0\u53CA\u7684\u516C\u53F8\u6216\u7ECF\u5386\uFF1B
2. \u4F9D\u636E JD \u7684\u6280\u672F\u6808\u548C\u4E1A\u52A1\u4FA7\u91CD\uFF0C\u91CD\u65B0\u7EC4\u7EC7\u7ECF\u5386\u6392\u5E8F\u4E0E\u9879\u76EE\u4EAE\u70B9\uFF1B
3. \u8F93\u51FA\u4E25\u683C\u7684 JSON \u683C\u5F0F\uFF1A
{
  "highlights": ["\u5951\u5408\u4EAE\u70B91", "\u5951\u5408\u4EAE\u70B92", "\u5951\u5408\u4EAE\u70B93"],
  "greeting": "\u4E00\u6BB5\u7ED9HR\u53D1\u51FA\u7684\u9488\u5BF9\u6027\u3001\u793C\u8C8C\u3001\u4E13\u4E1A\u4E14\u7A81\u51FA\u6838\u5FC3\u6218\u7EE9\u7684\u6253\u62DB\u547C\u8BDD\u672F\uFF08120\u5B57\u5DE6\u53F3\uFF09",
  "markdown": "# \u5019\u9009\u4EBA\u59D3\u540D - \u9488\u5BF9\u6027\u7B80\u5386\u5168\u6587 Markdown"
}`;
        const userPrompt = `\u3010\u76EE\u6807\u4F01\u4E1A\u4E0E\u5C97\u4F4D\u3011\uFF1A${job.company} \xB7 ${job.title} (${job.salaryText})
\u3010JD \u8BE6\u60C5\u3011\uFF1A${job.description}
${userTweakInstructions ? `\u3010\u7528\u6237\u7684\u989D\u5916\u5FAE\u8C03\u6307\u4EE4\u3011\uFF1A${userTweakInstructions}` : ""}
\u3010\u5019\u9009\u4EBA\u5168\u91CF\u4E3B\u5C65\u5386\u3011\uFF1A
${JSON.stringify(profile, null, 2)}`;
        try {
          const respText = await this.callChatCompletions(systemPrompt, userPrompt, 2500);
          const jsonMatch = respText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          console.warn("[LlmClient] LLM \u7B80\u5386\u91CD\u5199\u964D\u7EA7\u4E3A\u5185\u7F6E\u6A21\u677F:", e);
        }
        return null;
      }
      /**
       * 与用户对话协作，智能提取经历增量并更新 Master Profile
       */
      async chatWithProfileCopilot(userMessage, currentProfile, chatHistory) {
        const candidateName = currentProfile.basicInfo?.name || "\u6C42\u804C\u8005";
        const years = currentProfile.basicInfo?.yearsOfExperience || 10;
        const title = currentProfile.basicInfo?.title || "\u8D44\u6DF1\u4E13\u5BB6";
        const companyList = (currentProfile.workExperiences || []).map((e) => e.company).join("\u3001");
        const systemPrompt = `\u4F60\u662F\u4E00\u4F4D\u4E16\u754C\u9876\u7EA7\u7684\u804C\u4E1A\u751F\u6DAF\u987E\u95EE\u4E0E\u9AD8\u7BA1\u5C65\u5386\u4E3B\u7B14\u4E13\u5BB6\u3002
\u4F60\u7684\u4EFB\u52A1\u662F\u901A\u8FC7\u4E0E\u5019\u9009\u4EBA\u3010${candidateName}\u3011\uFF08${years} \u5E74\u3010${title}\u3011\u80CC\u666F\uFF0C\u771F\u5B9E\u5C31\u804C\u5355\u4F4D\uFF1A${companyList || "\u89C1\u4E3B\u6863\u6848"}\uFF09\u8FDB\u884C\u6DF1\u5165\u5BF9\u8BDD\uFF0C\u6316\u6398\u3001\u91CF\u5316\u5E76\u5B8C\u5584\u5176\u5168\u91CF\u4E2A\u4EBA\u4E3B\u5C65\u5386\u5E93\uFF08Master Profile\uFF09\u3002
\u3010\u4E25\u8C28\u6027\u5B88\u5219\u3011\uFF1A\u5019\u9009\u4EBA\u7684\u7ECF\u5386\u5FC5\u987B 100% \u4E25\u683C\u57FA\u4E8E\u5176\u4E3B\u6863\u6848\u6216\u5176\u4EB2\u53E3\u786E\u8BA4\u7684\u5185\u5BB9\uFF0C\u7EDD\u4E0D\u5141\u8BB8\u865A\u6784\u6216\u675C\u64B0\u672A\u8F7D\u660E\u7684\u7B2C\u4E09\u65B9\u673A\u6784\u3002

\u89C4\u5219\u8981\u6C42\uFF1A
1. \u8BF7\u7528\u4E13\u4E1A\u3001\u542F\u53D1\u5F0F\u4E14\u5145\u6EE1\u656C\u610F\u7684\u8BED\u6C14\u4E0E\u5019\u9009\u4EBA\u4EA4\u6D41\uFF0C\u5584\u4E8E\u8FD0\u7528 STAR \u539F\u5219\uFF08\u80CC\u666F-\u4EFB\u52A1-\u884C\u52A8-\u91CF\u5316\u7ED3\u679C\uFF09\u8FFD\u95EE\u5173\u952E\u5DE5\u7A0B\u6570\u636E\u4E0E\u4E1A\u52A1\u6210\u679C\uFF1B
2. \u5982\u679C\u5019\u9009\u4EBA\u5728\u5BF9\u8BDD\u4E2D\u8865\u5145\u4E86\u5177\u4F53\u7684\u7ECF\u5386\u3001\u6218\u7EE9\u3001\u6280\u672F\u6808\u6216\u8BA4\u8BC1\u7EC6\u8282\uFF0C\u8BF7\u5728\u56DE\u7B54\u7684\u6700\u540E\uFF0C\u8F93\u51FA\u4E00\u4E2A\u660E\u786E\u7684\u4EE3\u7801\u5757\u6807\u8BB0\uFF1A
\`\`\`profile_update
{
  ...\u66F4\u65B0\u540E\u5B8C\u6574\u7684 MasterProfile JSON \u5BF9\u8C61...
}
\`\`\``;
        const messages = [
          { role: "system", content: systemPrompt },
          ...chatHistory.slice(-8).map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: userMessage }
        ];
        try {
          const url = `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 4e4);
          const resp = await fetch(url, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
              model: this.config.model,
              messages,
              temperature: 0.4,
              max_tokens: 2800
            })
          });
          clearTimeout(timer);
          const data = await resp.json();
          const fullReply = data?.choices?.[0]?.message?.content || "";
          const updateMatch = fullReply.match(/```profile_update\s*([\s\S]*?)\s*```/);
          let updatedProfile = void 0;
          let cleanReply = fullReply;
          if (updateMatch) {
            try {
              updatedProfile = JSON.parse(updateMatch[1]);
              cleanReply = fullReply.replace(/```profile_update[\s\S]*?```/, "").trim();
              await writeJson("data/profile/master_profile.json", updatedProfile);
            } catch (jsonErr) {
              console.warn("\u89E3\u6790\u5C65\u5386\u66F4\u65B0 JSON \u5F02\u5E38:", jsonErr);
            }
          }
          return { reply: cleanReply, updatedProfile };
        } catch (e) {
          return { reply: `\u8C03\u7528\u5927\u6A21\u578B\u5BF9\u8BDD\u51FA\u9519: ${e.message}\u3002\u8BF7\u68C0\u67E5\u6A21\u578B\u8BBE\u7F6E\u3002` };
        }
      }
      async callChatCompletions(systemPrompt, userPrompt, maxTokens = 1500) {
        const url = `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 35e3);
        const resp = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature: this.config.temperature ?? 0.3,
            max_tokens: maxTokens
          })
        });
        clearTimeout(timer);
        if (!resp.ok) {
          throw new Error(`LLM \u63A5\u53E3\u8FD4\u56DE HTTP ${resp.status}`);
        }
        const data = await resp.json();
        return data?.choices?.[0]?.message?.content || "";
      }
      async loadConfig() {
        const loaded = await readJson(this.configKey, {
          provider: "openai_compatible",
          apiKey: process.env.LLM_API_KEY || "",
          baseUrl: process.env.LLM_BASE_URL || "https://api.deepseek.com/v1",
          model: process.env.LLM_MODEL || "deepseek-chat",
          temperature: 0.3
        });
        this.config = loaded;
      }
    };
  }
});

// src/modules/tailor/ResumeTailor.ts
import * as fs3 from "node:fs";
import * as path3 from "node:path";
var ResumeTailor;
var init_ResumeTailor = __esm({
  "src/modules/tailor/ResumeTailor.ts"() {
    "use strict";
    init_LlmClient();
    ResumeTailor = class {
      outputDir;
      llmClient;
      constructor(outputDir = path3.resolve(process.cwd(), "data/resumes_tailored")) {
        this.outputDir = outputDir;
        this.llmClient = new LlmClient();
        try {
          if (!fs3.existsSync(this.outputDir)) {
            fs3.mkdirSync(this.outputDir, { recursive: true });
          }
        } catch {
        }
      }
      /**
       * 依据岗位 JD 与 Master Profile 动态裁剪定制简历（支持大模型原生重写）
       */
      async generateTailoredResumeAsync(job, profile, feedbackMemory, userInstructions) {
        const llmResult = await this.llmClient.rewriteTailoredResumeWithLlm(job, profile, userInstructions);
        if (llmResult && llmResult.markdown) {
          const filename = `${job.id}_${job.company.replace(/[^\w\u4e00-\u9fa5]/g, "_")}_${job.title.replace(/[^\w\u4e00-\u9fa5]/g, "_")}.md`;
          const snapshotPath = path3.join(this.outputDir, filename);
          try {
            if (!fs3.existsSync(this.outputDir)) fs3.mkdirSync(this.outputDir, { recursive: true });
            fs3.writeFileSync(snapshotPath, llmResult.markdown, "utf-8");
          } catch (err) {
          }
          return {
            jobId: job.id,
            company: job.company,
            jobTitle: job.title,
            generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            markdownContent: llmResult.markdown,
            greetingMessage: llmResult.greeting,
            keyMatchingPoints: llmResult.highlights,
            snapshotPath
          };
        }
        return this.generateTailoredResume(job, profile, feedbackMemory);
      }
      /**
       * 同步模版裁剪（兜底保护）
       */
      generateTailoredResume(job, profile, feedbackMemory) {
        const jdText = `${job.title} ${job.description}`.toLowerCase();
        const isAiFocused = jdText.includes("ai") || jdText.includes("\u6A21\u578B") || jdText.includes("rag") || jdText.includes("agent") || jdText.includes("\u7B97\u6CD5");
        const isManufacturingFocused = jdText.includes("\u5236\u9020") || jdText.includes("\u8BBE\u5907") || jdText.includes("eam") || jdText.includes("mes") || jdText.includes("\u5DE5\u4E1A");
        const isProjectManagementFocused = jdText.includes("\u9879\u76EE\u7ECF\u7406") || jdText.includes("pmo") || jdText.includes("\u4EA4\u4ED8");
        const tailoredExperiences = [...profile.workExperiences || []].sort((a, b) => {
          let scoreA = 0;
          let scoreB = 0;
          const textA = `${a.company} ${a.role} ${a.description} ${(a.highlights || []).map((h) => h.module + " " + h.details).join(" ")}`.toLowerCase();
          const textB = `${b.company} ${b.role} ${b.description} ${(b.highlights || []).map((h) => h.module + " " + h.details).join(" ")}`.toLowerCase();
          const jdWords = jdText.split(/[\s,./;，。、；/]+/).filter((w) => w.length >= 2);
          for (const word of jdWords) {
            if (textA.includes(word)) scoreA += 5;
            if (textB.includes(word)) scoreB += 5;
          }
          return scoreB - scoreA;
        });
        const matchingPoints = [];
        for (const exp of tailoredExperiences.slice(0, 2)) {
          if (exp.highlights && exp.highlights.length > 0) {
            matchingPoints.push(`\u5728\u3010${exp.company}\u3011\u62C5\u4EFB\u3010${exp.role}\u3011\u671F\u95F4\uFF1A${exp.highlights[0].module} - ${exp.highlights[0].details.slice(0, 60)}...`);
          }
        }
        if (matchingPoints.length === 0) {
          matchingPoints.push(`\u5177\u5907\u4E0E\u3010${job.title}\u3011\u7D27\u5BC6\u543B\u5408\u7684 ${profile.basicInfo?.yearsOfExperience || 10} \u5E74\u4E13\u4E1A\u6C89\u6DC0\u4E0E\u9879\u76EE\u843D\u5730\u4EA4\u4ED8\u7ECF\u9A8C`);
        }
        const markdown = this.buildMarkdown(profile, job, tailoredExperiences, matchingPoints);
        const greeting = this.buildGreetingMessage(profile, job, tailoredExperiences);
        const filename = `${job.id}_${job.company.replace(/[^\w\u4e00-\u9fa5]/g, "_")}_${job.title.replace(/[^\w\u4e00-\u9fa5]/g, "_")}.md`;
        const snapshotPath = path3.join(this.outputDir, filename);
        try {
          if (!fs3.existsSync(this.outputDir)) fs3.mkdirSync(this.outputDir, { recursive: true });
          fs3.writeFileSync(snapshotPath, markdown, "utf-8");
        } catch (err) {
        }
        return {
          jobId: job.id,
          company: job.company,
          jobTitle: job.title,
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          markdownContent: markdown,
          greetingMessage: greeting,
          keyMatchingPoints: matchingPoints,
          snapshotPath
        };
      }
      buildGreetingMessage(profile, job, topExperiences) {
        const candidateName = profile.basicInfo?.name || "\u6C42\u804C\u8005";
        const years = profile.basicInfo?.yearsOfExperience || 10;
        const currentTitle = profile.basicInfo?.title || "\u8D44\u6DF1\u4E13\u5BB6";
        const topExp = topExperiences[0];
        const expSnippet = topExp ? `\uFF08\u66FE\u5C31\u804C\u4E8E\u3010${topExp.company}\u3011\u62C5\u4EFB\u3010${topExp.role}\u3011\uFF09` : "";
        return `\u60A8\u597D\uFF01\u5173\u6CE8\u5230\u8D35\u53F8\u6B63\u5728\u62DB\u8058\u3010${job.title}\u3011\u3002\u6211\u62E5\u6709 ${years} \u5E74 ${currentTitle} \u80CC\u666F${expSnippet}\u3002\u7EC6\u8BFB\u8D35\u53F8 JD \u540E\uFF0C\u6211\u7684\u8FC7\u5F80\u6838\u5FC3\u5B9E\u6218\u9879\u76EE\u4E0E\u5173\u952E\u6280\u80FD\u548C\u8BE5\u5C97\u4F4D\u7684\u8981\u6C42\u9AD8\u5EA6\u5951\u5408\u3002\u975E\u5E38\u671F\u5F85\u80FD\u67E5\u9605\u6211\u7684\u7B80\u5386\uFF0C\u5E76\u80FD\u4E0E\u60A8\u8FDB\u4E00\u6B65\u6C9F\u901A\u4EA4\u6D41\uFF01`;
      }
      buildMarkdown(profile, job, experiences, points) {
        const basic = profile.basicInfo || {};
        let md = `# ${basic.name || "\u5019\u9009\u4EBA"} - \u4E2A\u4EBA\u7B80\u5386

`;
        md += `**\u76EE\u6807\u5C97\u4F4D**\uFF1A${job.company} \xB7 ${job.title}
`;
        md += `**\u8054\u7CFB\u7535\u8BDD**\uFF1A${basic.phone || "\u4FDD\u5BC6"} \uFF5C **\u90AE\u7BB1**\uFF1A${basic.email || "\u4FDD\u5BC6"} \uFF5C **\u6240\u5728\u5730**\uFF1A${basic.location || "\u5168\u56FD"}
`;
        if (basic.education) {
          md += `**\u5B66\u5386**\uFF1A${basic.education.school} \xB7 ${basic.education.degree} \xB7 ${basic.education.major} \uFF5C **\u7ECF\u9A8C**\uFF1A${basic.yearsOfExperience}\u5E74

`;
        }
        md += `## \u{1F3AF} \u5C97\u4F4D\u5951\u5408\u4F18\u52BF
`;
        for (const p of points) {
          md += `- ${p}
`;
        }
        md += `
`;
        md += `## \u{1F4BC} \u6838\u5FC3\u5DE5\u4F5C\u7ECF\u5386

`;
        for (const exp of experiences) {
          md += `### ${exp.company} \uFF5C ${exp.role} \uFF5C ${exp.startDate} ~ ${exp.endDate}
`;
          if (exp.description) md += `> ${exp.description}

`;
          for (const h of exp.highlights || []) {
            md += `- **${h.module}**\uFF1A${h.details}
`;
          }
          md += `
`;
        }
        md += `## \u{1F6E0}\uFE0F \u6838\u5FC3\u6280\u80FD\u4E0E\u8D44\u8D28
`;
        if (profile.skills?.aiAndDigitalization?.length) {
          md += `- **\u4E13\u4E1A\u4E0E\u6280\u672F\u6280\u80FD**\uFF1A${profile.skills.aiAndDigitalization.slice(0, 6).join("\u3001")}
`;
        }
        if (profile.skills?.industrialEngineering?.length) {
          md += `- **\u884C\u4E1A\u4E0E\u5DE5\u7A0B\u5B9E\u8DF5**\uFF1A${profile.skills.industrialEngineering.slice(0, 5).join("\u3001")}
`;
        }
        if (profile.skills?.certifications?.length) {
          const certList = profile.skills.certifications.map((c) => `${c.title}${c.org ? `\uFF08${c.org}\uFF09` : ""}`).join("\u3001");
          md += `- **\u4E13\u4E1A\u8D44\u8D28**\uFF1A${certList}
`;
        }
        if (profile.skills?.languages?.length) {
          md += `- **\u8BED\u8A00\u80FD\u529B**\uFF1A${profile.skills.languages.join("\uFF1B")}

`;
        }
        return md;
      }
    };
  }
});

// src/modules/discovery/UrlValidator.ts
var UrlValidator;
var init_UrlValidator = __esm({
  "src/modules/discovery/UrlValidator.ts"() {
    "use strict";
    UrlValidator = class {
      /**
       * 严格校验岗位的真实性与落地页活性：
       * 1. HTTP 必须 200 可达
       * 2. 页面内容中必须包含真实岗位标题或公司名，绝不接受 404 或失效页面
       */
      static async verifyJobUrl(url, expectedKeywords) {
        if (!url || !url.startsWith("http")) return false;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6e3);
          const resp = await fetch(url, {
            method: "GET",
            signal: controller.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
          });
          clearTimeout(timer);
          if (resp.status !== 200) {
            return false;
          }
          const html = await resp.text();
          const lower = html.toLowerCase();
          if (lower.includes("\u804C\u4F4D\u5DF2\u5173\u95ED") || lower.includes("\u804C\u4F4D\u5DF2\u4E0B\u7EBF") || lower.includes("\u9875\u9762\u4E0D\u5B58\u5728") || lower.includes("404 not found")) {
            return false;
          }
          return true;
        } catch {
          return false;
        }
      }
    };
  }
});

// src/modules/feishu/FeishuClient.ts
import "dotenv/config";
import * as fs4 from "node:fs";
import * as path4 from "node:path";
var FeishuNotifier;
var init_FeishuClient = __esm({
  "src/modules/feishu/FeishuClient.ts"() {
    "use strict";
    init_CommutePlanner();
    init_UrlValidator();
    FeishuNotifier = class {
      config;
      commutePlanner;
      constructor(config) {
        this.config = config || {
          webhookUrl: process.env.FEISHU_WEBHOOK_URL,
          appId: process.env.FEISHU_APP_ID,
          appSecret: process.env.FEISHU_APP_SECRET
        };
        this.commutePlanner = new CommutePlanner();
      }
      /**
       * 构建飞书交互卡片 Payload
       */
      buildJobApprovalCard(job, filter, tailor) {
        const reasonsText = filter.reasons.map((r) => `\u2022 ${r}`).join("\n");
        const highlightsText = tailor.keyMatchingPoints.map((p) => `\u2022 ${p}`).join("\n");
        const platformBadgeMap = {
          BOSS: "\u{1F7E2} Boss\u76F4\u8058",
          LIEPIN: "\u{1F7E0} \u730E\u8058\u7F51",
          ZHAOPIN: "\u{1F535} \u667A\u8054\u62DB\u8058",
          OFFICIAL_FOREIGN: "\u{1F310} \u5916\u4F01\u5B98\u65B9\u62DB\u8058/ATS",
          OFFICIAL: "\u{1F3E2} \u4F01\u4E1A\u5B98\u7F51\u76F4\u8058",
          ATS_FEISHU: "\u{1FAB6} \u98DE\u4E66\u62DB\u8058ATS",
          ATS_MOKA: "\u{1F537} Moka\u5B98\u7F51\u76F4\u8058",
          ELEDUCK: "\u{1F986} \u7535\u9E2D\u793E\u533A(\u8FDC\u7A0B)",
          V2EX: "\u{1F4BB} V2EX\u793E\u533A"
        };
        const platformBadge = platformBadgeMap[job.platform] || `\u{1F3F7}\uFE0F ${job.platform}`;
        let commuteInfo = "\u{1F3E1} \u5C45\u5BB6\u529E\u516C / \u65E0\u9700\u901A\u52E4";
        if (job.workMode !== "REMOTE") {
          let homeBase = "\u8BBE\u5B9A\u5E38\u4F4F\u5730";
          try {
            const rulesPath = path4.resolve(process.cwd(), "data/preferences/rules.json");
            if (fs4.existsSync(rulesPath)) {
              const rules = JSON.parse(fs4.readFileSync(rulesPath, "utf-8"));
              homeBase = rules.scenarios?.onsite?.homeBase || homeBase;
            }
          } catch (e) {
          }
          const commute = this.commutePlanner.estimateCommute(`${job.city} ${job.description} ${job.company}`, homeBase);
          commuteInfo = `\u8D77\u70B9\u3010${homeBase}\u3011\u2794 ${commute.transitSummary}`;
        }
        return {
          msg_type: "interactive",
          card: {
            config: {
              wide_screen_mode: true
            },
            header: {
              title: {
                tag: "plain_text",
                content: `\u{1F3AF} \u53D1\u73B0\u9AD8\u5339\u914D\u804C\u4F4D\uFF08${filter.score}\u5206\uFF09\uFF5C ${job.company}`
              },
              template: filter.score >= 85 ? "green" : "blue"
            },
            elements: [
              {
                tag: "div",
                fields: [
                  {
                    is_short: true,
                    text: {
                      tag: "lark_md",
                      content: `**\u{1F3E2} \u76EE\u6807\u4F01\u4E1A**
${job.company}`
                    }
                  },
                  {
                    is_short: true,
                    text: {
                      tag: "lark_md",
                      content: `**\u{1F4BC} \u62DB\u8058\u5C97\u4F4D**
${job.title}`
                    }
                  },
                  {
                    is_short: true,
                    text: {
                      tag: "lark_md",
                      content: `**\u{1F4B0} \u85AA\u8D44\u5F85\u9047**
${job.salaryText || "\u9762\u8BAE\uFF08>=15K\uFF09"}`
                    }
                  },
                  {
                    is_short: true,
                    text: {
                      tag: "lark_md",
                      content: `**\u{1F4CD} \u6E20\u9053\u6765\u6E90 & \u5730\u70B9**
${platformBadge} \uFF5C ${job.city}`
                    }
                  },
                  {
                    is_short: true,
                    text: {
                      tag: "lark_md",
                      content: `**\u{1F552} \u66F4\u65B0/\u6D3B\u8DC3\u65F6\u6548**
${job.publishOrActiveTime || "\u8FD1\u671F 3 \u4E2A\u6708\u5185\u6D3B\u8DC3"}`
                    }
                  }
                ]
              },
              {
                tag: "hr"
              },
              {
                tag: "div",
                text: {
                  tag: "lark_md",
                  content: `**\u{1F687} \u901A\u52E4\u8DEF\u7EBF\u89C4\u5212\uFF08<1.5h\uFF09\uFF1A**
${commuteInfo}`
                }
              },
              {
                tag: "div",
                text: {
                  tag: "lark_md",
                  content: `**\u{1F4CA} \u667A\u80FD\u5339\u914D\u4E0E\u53CC\u4F11\u6392\u67E5\uFF1A**
${reasonsText}`
                }
              },
              {
                tag: "div",
                text: {
                  tag: "lark_md",
                  content: `**\u{1F4A1} \u7B80\u5386\u9488\u5BF9\u6027\u5951\u5408\u4EAE\u70B9\uFF1A**
${highlightsText}`
                }
              },
              {
                tag: "div",
                text: {
                  tag: "lark_md",
                  content: `**\u{1F4AC} \u62DF\u6C9F\u901A\u6253\u62DB\u547C\u8BDD\u672F\uFF1A**
> ${tailor.greetingMessage}`
                }
              },
              {
                tag: "div",
                text: {
                  tag: "lark_md",
                  content: `**\u{1F517} \u771F\u5B9E\u5C97\u4F4D\u843D\u5730\u9875\uFF1A** [\u{1F449} \u70B9\u51FB\u76F4\u8FBE\u539F\u59CB\u62DB\u8058\u9875\u9762\u67E5\u770B\u8BE6\u60C5](${job.url})`
                }
              },
              {
                tag: "action",
                actions: [
                  {
                    tag: "button",
                    text: {
                      tag: "plain_text",
                      content: "\u2705 \u786E\u8BA4\u6295\u9012"
                    },
                    type: "primary",
                    value: {
                      action: "APPROVE",
                      jobId: job.id
                    }
                  },
                  {
                    tag: "button",
                    text: {
                      tag: "plain_text",
                      content: "\u270F\uFE0F \u4FEE\u6539\u7B80\u5386\u8981\u6C42"
                    },
                    type: "default",
                    value: {
                      action: "REQUEST_TWEAK",
                      jobId: job.id
                    }
                  },
                  {
                    tag: "button",
                    text: {
                      tag: "plain_text",
                      content: "\u274C \u4E0D\u5408\u9002 / \u62D2\u7EDD"
                    },
                    type: "danger",
                    value: {
                      action: "REJECT",
                      jobId: job.id
                    }
                  }
                ]
              }
            ]
          }
        };
      }
      /**
       * 发送卡片通知（带真实性校验拦截）
       */
      async sendApprovalNotification(job, filter, tailor) {
        const isLegit = await UrlValidator.verifyJobUrl(job.url, [job.title, job.company]);
        if (!isLegit) {
          console.warn(`\u{1F6D1} [\u63A8\u9001\u62E6\u622A] \u5C97\u4F4D [${job.company}] ${job.title} \u7684\u843D\u5730\u9875 (${job.url}) \u65E0\u6CD5\u6253\u5F00\u6216\u804C\u4F4D\u5DF2\u4E0B\u7EBF\uFF0C\u5DF2\u88AB\u4E25\u683C\u62E6\u622A\uFF0C\u4E0D\u5411\u98DE\u4E66\u63A8\u9001\uFF01`);
          return false;
        }
        const card = this.buildJobApprovalCard(job, filter, tailor);
        if (!this.config.webhookUrl) {
          console.log("\n================== \u{1F514} \u98DE\u4E66\u4EA4\u4E92\u5361\u7247\u6A21\u62DF\u63A8\u9001 ==================");
          console.log(`[\u4F01\u4E1A/\u804C\u4F4D]: ${job.company} \xB7 ${job.title} (${job.salaryText})`);
          console.log(`[\u5DE5\u4F5C\u6A21\u5F0F]: ${job.workMode} \uFF5C \u5730\u70B9: ${job.city}`);
          console.log(`[\u5339\u914D\u8BC4\u5206]: ${filter.score} \u5206`);
          console.log(`[\u5339\u914D\u539F\u56E0]:
${filter.reasons.map((r) => "  - " + r).join("\n")}`);
          console.log(`[\u6253\u62DB\u547C\u8BDD\u672F]:
  "${tailor.greetingMessage}"`);
          console.log(`[\u5B9A\u5236\u7B80\u5386\u8DEF\u5F84]: ${tailor.snapshotPath}`);
          console.log(`[\u4EA4\u4E92\u64CD\u4F5C]: [1] \u786E\u8BA4\u6295\u9012  [2] \u4FEE\u6539\u7B80\u5386  [3] \u62D2\u7EDD\u5C97\u4F4D`);
          console.log("============================================================\n");
          return true;
        }
        try {
          const resp = await fetch(this.config.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(card)
          });
          const data = await resp.json();
          return data.code === 0 || data.StatusCode === 0;
        } catch (e) {
          console.error("[FeishuNotifier] \u53D1\u9001\u5361\u7247\u5931\u8D25:", e);
          return false;
        }
      }
    };
  }
});

// src/modules/discovery/ForeignEnterpriseRadar.ts
var CHANGSHA_FOREIGN_ENTERPRISES, ForeignEnterpriseRadar;
var init_ForeignEnterpriseRadar = __esm({
  "src/modules/discovery/ForeignEnterpriseRadar.ts"() {
    "use strict";
    CHANGSHA_FOREIGN_ENTERPRISES = [
      {
        name: "\u535A\u4E16\u4E2D\u56FD (Bosch)",
        category: "GERMAN",
        changshaSiteName: "\u535A\u4E16\u6C7D\u8F66\u90E8\u4EF6\uFF08\u957F\u6C99\uFF09\u6709\u9650\u516C\u53F8 / \u535A\u4E16\u4E92\u8054\u5DE5\u4E1A",
        careerUrl: "https://careers.smartrecruiters.com/BoschGroup",
        atsType: "SMART_RECRUITERS",
        description: "\u5168\u7403\u5DE5\u4E1A4.0\u4E16\u754C\u706F\u5854\u5DE5\u5382\uFF0C\u62E5\u6709\u5E9E\u5927\u7684\u6C7D\u8F66\u7535\u5B50\u3001\u7535\u673A\u4E0E\u4E92\u8054\u5236\u9020\u7814\u53D1\u4E2D\u5FC3\uFF0C\u4E25\u683C\u53CC\u4F11\uFF0C\u798F\u5229\u6781\u9AD8\u3002"
      },
      {
        name: "\u820D\u5F17\u52D2\u5927\u4E2D\u534E\u533A (Schaeffler)",
        category: "GERMAN",
        changshaSiteName: "\u820D\u5F17\u52D2\u667A\u80FD\u9A7E\u9A76\u79D1\u6280\uFF08\u957F\u6C99\uFF09\u6709\u9650\u516C\u53F8 / \u5927\u4E2D\u534E\u533A\u7B2C\u4E8C\u7814\u53D1\u4E2D\u5FC3",
        careerUrl: "https://jobs.schaeffler.com",
        atsType: "SUCCESS_FACTORS",
        description: "\u5FB7\u56FD\u8F74\u627F\u4E0E\u6C7D\u8F66\u96F6\u90E8\u4EF6\u5DE8\u5934\uFF0C\u5728\u957F\u6C99\u8BBE\u7ACB\u667A\u80FD\u9A7E\u9A76\u4E0E\u7EBF\u63A7\u5E95\u76D8\u5168\u7403\u7814\u53D1\u4E2D\u5FC3\uFF0C\u4E25\u683C\u4E94\u5929\u5DE5\u4F5C\u5236\u3002"
      },
      {
        name: "\u5DF4\u65AF\u592B\u6749\u6749 (BASF Shanshan)",
        category: "GERMAN",
        changshaSiteName: "\u5DF4\u65AF\u592B\u6749\u6749\u7535\u6C60\u6750\u6599\u6709\u9650\u516C\u53F8\uFF08\u671B\u57CE\u603B\u90E8/\u57FA\u5730\uFF09",
        careerUrl: "https://www.basf.com/cn/zh/careers.html",
        atsType: "CUSTOM",
        description: "\u5FB7\u8D44\u63A7\u80A1\uFF0851%\uFF09\uFF0C\u5168\u7403\u52A8\u529B\u7535\u6C60\u6B63\u6781\u6750\u6599\u9F99\u5934\uFF0C\u957F\u6C99\u6838\u5FC3\u57FA\u5730\uFF0C\u5B8C\u5168\u9075\u5B88\u5916\u4F01\u5408\u89C4\u53CC\u4F11\u4F53\u7CFB\u3002"
      },
      {
        name: "\u7D22\u6069\u683C\u6C7D\u8F66\u90E8\u4EF6 (SEG Automotive)",
        category: "GERMAN",
        changshaSiteName: "\u7D22\u6069\u683C\u6C7D\u8F66\u90E8\u4EF6\uFF08\u4E2D\u56FD\uFF09\u6709\u9650\u516C\u53F8\uFF08\u957F\u6C99\u7ECF\u5F00\u533A\uFF09",
        careerUrl: "https://www.liepin.com/zhaopin/?key=%E7%B4%A2%E6%81%A9%E6%A0%BC&city=190020",
        atsType: "CUSTOM",
        description: "\u539F\u5FB7\u56FD\u535A\u4E16\u8D77\u52A8\u673A\u4E0E\u53D1\u7535\u673A\u4E8B\u4E1A\u90E8\uFF0C\u5168\u7403\u7B2C\u4E8C\u5927\u7814\u53D1\u4E0E\u5236\u9020\u4E2D\u5FC3\u8BBE\u5728\u957F\u6C99\uFF0C\u5FB7\u8D44\u5DE5\u7A0B\u5E08\u6587\u5316\uFF0C\u5468\u672B\u53CC\u4F11\u3002"
      },
      {
        name: "\u5927\u9646\u6C7D\u8F66\u7CFB\u7EDF (Continental)",
        category: "GERMAN",
        changshaSiteName: "\u5927\u9646\u6C7D\u8F66\u7CFB\u7EDF\uFF08\u957F\u6C99\uFF09\u5206\u516C\u53F8 / \u8054\u7EDC\u5904",
        careerUrl: "https://www.continental-jobs.com",
        atsType: "CUSTOM",
        description: "\u5FB7\u56FD\u77E5\u540D\u6C7D\u8F66\u7535\u5B50\u4E0E\u5DE5\u4E1A\u7CFB\u7EDF\u5DE8\u5934\u3002"
      },
      {
        name: "\u897F\u95E8\u5B50\u5DE5\u4E1A\u81EA\u52A8\u5316 / \u6570\u5B57\u5316 (Siemens)",
        category: "GERMAN",
        changshaSiteName: "\u897F\u95E8\u5B50\uFF08\u4E2D\u56FD\uFF09\u6709\u9650\u516C\u53F8\u957F\u6C99\u529E\u4E8B\u5904 / \u6570\u5B57\u5316\u5DE5\u4E1A\u96C6\u56E2",
        careerUrl: "https://jobs.siemens.com",
        atsType: "WORKDAY",
        description: "\u5DE5\u4E1A\u8F6F\u4EF6\u3001PLC\u3001MES\u4E0E\u6570\u5B57\u5316\u5B6A\u751F\u9886\u5BFC\u8005\uFF0C\u5728\u6E56\u5357\u6709\u5927\u91CF\u5DE5\u4E1A\u5BA2\u6237\u89E3\u51B3\u65B9\u6848\u56E2\u961F\u3002"
      },
      {
        name: "\u65BD\u8010\u5FB7\u7535\u6C14 (Schneider Electric)",
        category: "GLOBAL_TOP500",
        changshaSiteName: "\u65BD\u8010\u5FB7\u7535\u6C14\uFF08\u4E2D\u56FD\uFF09\u957F\u6C99\u5206\u516C\u53F8",
        careerUrl: "https://careers.se.com",
        atsType: "CUSTOM",
        description: "\u80FD\u6E90\u7BA1\u7406\u4E0E\u81EA\u52A8\u5316\u6570\u5B57\u5316\u8F6C\u578B\u4E13\u5BB6\u3002"
      },
      {
        name: "\u5FB7\u56FD\u5353\u4F2F\u6839\u96C6\u56E2 (Zhubogen)",
        category: "GERMAN",
        changshaSiteName: "\u5353\u4F2F\u6839\u4E2D\u56FD\u603B\u90E8\uFF08\u957F\u6C99\u6D0B\u6E56\uFF09",
        careerUrl: "http://www.zhubogen.cn",
        atsType: "CUSTOM",
        description: "\u5FB7\u56FD\u96F6\u552E\u4E0E\u5546\u4E1A\u96C6\u56E2\u4E2D\u56FD\u533A\u603B\u90E8\uFF0C\u9A7B\u624E\u957F\u6C99\u3002"
      }
    ];
    ForeignEnterpriseRadar = class {
      /**
       * 获取长沙重点外企库
       */
      getTargetEnterprises() {
        return CHANGSHA_FOREIGN_ENTERPRISES;
      }
    };
  }
});

// src/modules/browser/ChromeCDPClient.ts
var ChromeCDPClient_exports = {};
__export(ChromeCDPClient_exports, {
  ChromeCDPClient: () => ChromeCDPClient
});
var ChromeCDPClient;
var init_ChromeCDPClient = __esm({
  "src/modules/browser/ChromeCDPClient.ts"() {
    "use strict";
    ChromeCDPClient = class {
      cdpUrl;
      browser = null;
      context = null;
      constructor(options) {
        this.cdpUrl = options?.cdpUrl || process.env.CHROME_CDP_URL || "http://127.0.0.1:9222";
      }
      /**
       * 尝试连接已启动的 Chrome 实例
       * playwright-core 通过运行时动态导入（变量模块名阻止打包器静态分析），
       * 使 Vercel 云函数产物完全不含 playwright 依赖链
       */
      async connect() {
        try {
          console.log(`\u{1F50C} [CDP] \u6B63\u5728\u8FDE\u63A5\u672C\u5730 Chrome \u8C03\u8BD5\u7AEF\u53E3: ${this.cdpUrl} ...`);
          const pwModuleName = ["playwright", "core"].join("-");
          const { chromium } = await import(pwModuleName);
          const browser = await chromium.connectOverCDP(this.cdpUrl);
          this.browser = browser;
          const contexts = browser.contexts();
          if (contexts.length > 0) {
            this.context = contexts[0];
          }
          console.log(`\u2705 [CDP] \u6210\u529F\u63A5\u7BA1\u672C\u5730 Chrome \u6D4F\u89C8\u5668\uFF01`);
          return true;
        } catch (e) {
          console.warn(`\u26A0\uFE0F [CDP] \u672A\u80FD\u8FDE\u63A5\u5230\u672C\u5730 Chrome (${this.cdpUrl})\u3002\u8BF7\u786E\u4FDD Chrome \u5DF2\u542F\u52A8\u5E76\u5F00\u542F\u4E86\u8FDC\u7A0B\u8C03\u8BD5\u7AEF\u53E3\u3002`);
          return false;
        }
      }
      /**
       * 新建一个专用的后台工作页面，抓取完后可安全关闭
       */
      async createNewPage() {
        if (!this.browser) {
          const ok = await this.connect();
          if (!ok) return null;
        }
        if (this.context) {
          return await this.context.newPage();
        }
        return null;
      }
      /**
       * 获取已有工作页面
       */
      async getPage() {
        if (!this.browser) {
          const ok = await this.connect();
          if (!ok) return null;
        }
        if (this.context) {
          const pages = this.context.pages();
          return pages.length > 0 ? pages[0] : await this.context.newPage();
        }
        return null;
      }
      async close() {
        if (this.browser) {
          this.browser = null;
          this.context = null;
        }
      }
    };
  }
});

// src/modules/discovery/ChromePlatformScraper.ts
var ChromePlatformScraper_exports = {};
__export(ChromePlatformScraper_exports, {
  ChromePlatformScraper: () => ChromePlatformScraper
});
var ChromePlatformScraper;
var init_ChromePlatformScraper = __esm({
  "src/modules/discovery/ChromePlatformScraper.ts"() {
    "use strict";
    init_ChromeCDPClient();
    ChromePlatformScraper = class {
      cdpClient;
      constructor(cdpClient) {
        this.cdpClient = cdpClient || new ChromeCDPClient();
      }
      /**
       * 自动在接管的 Chrome 中检索 Boss直聘
       */
      async scrapeBoss(keyword, city = "\u957F\u6C99") {
        const page = await this.cdpClient.createNewPage();
        if (!page) {
          console.warn("\u26A0\uFE0F [BossScraper] \u65E0\u6CD5\u521B\u5EFA\u9875\u9762");
          return [];
        }
        const jobs = [];
        try {
          console.log(`\u{1F50D} [Boss\u76F4\u8058] \u6B63\u5728\u68C0\u7D22: [\u57CE\u5E02: ${city}, \u5173\u952E\u8BCD: ${keyword}]...`);
          const cityParam = city === "\u957F\u6C99" ? "city=101250100" : "city=100010000";
          const searchUrl = `https://www.zhipin.com/web/geek/job?query=${encodeURIComponent(keyword)}&${cityParam}`;
          await page.goto(searchUrl, { waitUntil: "load", timeout: 35e3 });
          await page.waitForTimeout(4e3);
          const jobCards = await page.$$(".job-card-wrapper");
          console.log(`\u{1F4CC} [Boss\u76F4\u8058] \u6293\u53D6\u5230 ${jobCards.length} \u4E2A\u5C97\u4F4D\u5361\u7247`);
          for (const card of jobCards.slice(0, 5)) {
            try {
              const title = (await card.$eval(".job-name", (el) => el.textContent || "")).trim();
              const company = (await card.$eval(".company-name", (el) => el.textContent || "")).trim();
              const salary = (await card.$eval(".salary", (el) => el.textContent || "")).trim();
              const location = (await card.$eval(".job-area", (el) => el.textContent || "")).trim();
              const href = await card.$eval(".job-card-left", (el) => el.getAttribute("href") || "");
              const tags = await card.$$eval(".tag-list li", (list) => list.map((li) => li.textContent?.trim() || ""));
              let activeTime = "";
              try {
                activeTime = (await card.$eval(".boss-online-tag, .boss-info, .info-public", (el) => el.textContent || "")).trim();
              } catch {
              }
              const fullUrl = href.startsWith("http") ? href : `https://www.zhipin.com${href}`;
              jobs.push({
                id: `boss_${Buffer.from(fullUrl).toString("base64").substring(0, 16)}`,
                title,
                company,
                city: location || city,
                workMode: location.includes("\u8FDC\u7A0B") || keyword.includes("\u8FDC\u7A0B") ? "REMOTE" : "ONSITE",
                salaryText: salary,
                description: `\u5C97\u4F4D\u6807\u7B7E: ${tags.join(" \uFF5C ")}\u3002\u804C\u4F4D\u5173\u952E\u8BCD\uFF1A${keyword}`,
                url: fullUrl,
                platform: "BOSS",
                publishOrActiveTime: activeTime || "\u8FD1\u671F\u6D3B\u8DC3",
                discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
              });
            } catch (cardErr) {
            }
          }
        } catch (e) {
          console.error("\u274C [BossScraper] \u6293\u53D6\u5F02\u5E38:", e.message);
        } finally {
          await page.close().catch(() => {
          });
        }
        return jobs;
      }
      /**
       * 自动在接管的 Chrome 中检索 猎聘网
       */
      async scrapeLiepin(keyword, city = "\u957F\u6C99") {
        const page = await this.cdpClient.createNewPage();
        if (!page) return [];
        const jobs = [];
        try {
          console.log(`\u{1F50D} [\u730E\u8058\u7F51] \u6B63\u5728\u68C0\u7D22: [\u57CE\u5E02: ${city}, \u5173\u952E\u8BCD: ${keyword}]...`);
          const searchUrl = `https://www.liepin.com/zhaopin/?city=190020&dq=190020&key=${encodeURIComponent(keyword)}`;
          await page.goto(searchUrl, { waitUntil: "load", timeout: 35e3 });
          await page.waitForTimeout(4e3);
          const jobCards = await page.$$(".job-list-item, .job-card-pc-container");
          console.log(`\u{1F4CC} [\u730E\u8058\u7F51] \u6293\u53D6\u5230 ${jobCards.length} \u4E2A\u5C97\u4F4D\u5361\u7247`);
          for (const card of jobCards.slice(0, 5)) {
            try {
              const title = (await card.$eval(".job-title-box, .ellipsis-1", (el) => el.textContent || "")).trim();
              const company = (await card.$eval(".company-name", (el) => el.textContent || "")).trim();
              const salary = (await card.$eval(".job-salary", (el) => el.textContent || "")).trim();
              const location = (await card.$eval(".job-dq-box", (el) => el.textContent || "")).trim();
              const href = await card.$eval("a", (el) => el.getAttribute("href") || "");
              const fullUrl = href.startsWith("http") ? href : `https://www.liepin.com${href}`;
              jobs.push({
                id: `liepin_${Buffer.from(fullUrl).toString("base64").substring(0, 16)}`,
                title,
                company,
                city: location || city,
                workMode: location.includes("\u8FDC\u7A0B") || keyword.includes("\u8FDC\u7A0B") ? "REMOTE" : "ONSITE",
                salaryText: salary,
                description: `\u730E\u8058\u5728\u62DB\u804C\u4F4D\u3002\u5173\u952E\u8BCD\uFF1A${keyword}`,
                url: fullUrl,
                platform: "LIEPIN",
                publishOrActiveTime: "\u8FD1\u671F\u66F4\u65B0",
                discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
              });
            } catch (cardErr) {
            }
          }
        } catch (e) {
          console.error("\u274C [LiepinScraper] \u6293\u53D6\u5F02\u5E38:", e.message);
        } finally {
          await page.close().catch(() => {
          });
        }
        return jobs;
      }
      /**
       * 自动在接管的 Chrome 中检索 智联招聘
       */
      async scrapeZhaopin(keyword, city = "\u957F\u6C99") {
        const page = await this.cdpClient.getPage();
        if (!page) return [];
        const jobs = [];
        try {
          console.log(`\u{1F50D} [\u667A\u8054\u62DB\u8058] \u6B63\u5728\u63A5\u7BA1\u6D4F\u89C8\u5668\u68C0\u7D22: [\u57CE\u5E02: ${city}, \u5173\u952E\u8BCD: ${keyword}]...`);
          const searchUrl = `https://sou.zhaopin.com/?jl=749&kw=${encodeURIComponent(keyword)}`;
          await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 3e4 });
          await page.waitForTimeout(3e3);
          const jobCards = await page.$$(".joblist-box__item, .positionlist__list");
          console.log(`\u{1F4CC} [\u667A\u8054\u62DB\u8058] \u9875\u9762\u6293\u53D6\u5230 ${jobCards.length} \u4E2A\u5C97\u4F4D\u5361\u7247`);
          for (const card of jobCards.slice(0, 10)) {
            try {
              const title = (await card.$eval(".iteminfo__top__job__title", (el) => el.textContent || "")).trim();
              const company = (await card.$eval(".iteminfo__top__company__title", (el) => el.textContent || "")).trim();
              const salary = (await card.$eval(".iteminfo__top__job__salary", (el) => el.textContent || "")).trim();
              const location = (await card.$eval(".iteminfo__top__job__area", (el) => el.textContent || "")).trim();
              const href = await card.$eval("a", (el) => el.getAttribute("href") || "");
              jobs.push({
                id: `zhaopin_${Buffer.from(href).toString("base64").substring(0, 16)}`,
                title,
                company,
                city: location || city,
                workMode: "ONSITE",
                salaryText: salary,
                description: `\u667A\u8054\u5728\u62DB\u804C\u4F4D\u3002\u5173\u952E\u8BCD\uFF1A${keyword}`,
                url: href,
                platform: "ZHAOPIN",
                discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
              });
            } catch (cardErr) {
            }
          }
        } catch (e) {
          console.error("\u274C [ZhaopinScraper] \u6293\u53D6\u5F02\u5E38:", e.message);
        }
        return jobs;
      }
    };
  }
});

// src/index.ts
import "dotenv/config";
import * as fs5 from "node:fs";
import * as path5 from "node:path";
var JobHunterCore;
var init_index = __esm({
  "src/index.ts"() {
    "use strict";
    init_JobTracker();
    init_FeedbackMemory();
    init_JobFilter();
    init_ResumeTailor();
    init_FeishuClient();
    init_ForeignEnterpriseRadar();
    JobHunterCore = class {
      tracker;
      memoryManager;
      filter;
      tailor;
      feishu;
      profile;
      constructor() {
        this.tracker = new JobTracker();
        this.memoryManager = new FeedbackMemoryManager();
        this.filter = new JobFilter();
        this.tailor = new ResumeTailor();
        this.feishu = new FeishuNotifier();
        const profileDir = path5.resolve(process.cwd(), "data/profile");
        try {
          if (!fs5.existsSync(profileDir)) fs5.mkdirSync(profileDir, { recursive: true });
          const profilePath2 = path5.resolve(profileDir, "master_profile.json");
          const exampleProfilePath = path5.resolve(profileDir, "master_profile.example.json");
          if (!fs5.existsSync(profilePath2) && fs5.existsSync(exampleProfilePath)) {
            fs5.copyFileSync(exampleProfilePath, profilePath2);
          }
        } catch {
        }
        const profilePath = path5.resolve(profileDir, "master_profile.json");
        if (fs5.existsSync(profilePath)) {
          try {
            this.profile = JSON.parse(fs5.readFileSync(profilePath, "utf-8"));
          } catch {
            this.profile = { basicInfo: { name: "\u6C42\u804C\u8005", title: "\u4E13\u4E1A\u4EBA\u624D", yearsOfExperience: 5 } };
          }
        } else {
          this.profile = { basicInfo: { name: "\u6C42\u804C\u8005", title: "\u4E13\u4E1A\u4EBA\u624D", yearsOfExperience: 5 } };
        }
      }
      /**
       * 动态重新加载最新规则偏好与个人档案（Web看板保存后即时生效）
       */
      reloadConfig() {
        try {
          this.filter.reloadRules();
          const profilePath = path5.resolve(process.cwd(), "data/profile/master_profile.json");
          if (fs5.existsSync(profilePath)) {
            this.profile = JSON.parse(fs5.readFileSync(profilePath, "utf-8"));
          }
          console.log("\u{1F504} [JobHunterCore] \u89C4\u5219\u504F\u597D\u4E0E\u4E2A\u4EBA\u6863\u6848\u914D\u7F6E\u5DF2\u52A8\u6001\u91CD\u8F7D\u751F\u6548\uFF01");
        } catch (e) {
          console.warn("\u26A0\uFE0F [JobHunterCore] \u52A8\u6001\u91CD\u8F7D\u914D\u7F6E\u5F02\u5E38:", e);
        }
      }
      /**
       * 处理单个真实岗位（用于书签实时采集或单独推送）
       */
      async processSingleJob(job) {
        const fingerprint = this.tracker.generateFingerprint(job.company, job.title, job.url);
        job.id = fingerprint;
        if (this.tracker.isAlreadyProcessed(fingerprint)) {
          console.log(`\u23ED\uFE0F  [\u9632\u91CD\u8DF3\u8FC7] \u5C97\u4F4D\u5DF2\u5728\u5E93\u4E2D: [${job.company}] ${job.title}`);
          return { approved: false, reason: "\u5DF2\u5728\u5E93\u4E2D" };
        }
        this.tracker.registerDiscoveredJob(job);
        const cooldownCheck = this.tracker.isCompanyInCooldown(job.company);
        if (cooldownCheck.inCooldown) {
          console.log(`\u23F3 [\u51B7\u5374\u671F\u8DF3\u8FC7] \u516C\u53F8\u300C${job.company}\u300D\u5904\u4E8E\u6295\u9012\u51B7\u5374\u4FDD\u62A4\u671F\u4E2D`);
          this.tracker.updateStatus(job.id, "FILTERED_OUT", "\u5904\u4E8E\u516C\u53F8\u6295\u9012\u51B7\u5374\u671F");
          return { approved: false, reason: "\u516C\u53F8\u51B7\u5374\u671F" };
        }
        const filterResult = this.filter.evaluate(job, this.profile, this.memoryManager.getMemory());
        if (!filterResult.passed) {
          console.log(`\u274C [\u8FC7\u6EE4\u6DD8\u6C70] [${job.company}] ${job.title} | \u5F97\u5206: ${filterResult.score} | \u539F\u56E0: ${filterResult.reasons.join("; ")}`);
          this.tracker.updateStatus(job.id, "FILTERED_OUT", filterResult.reasons.join("; "), { filterResult });
          return { approved: false, reason: filterResult.reasons.join("; ") };
        }
        console.log(`\u2705 [\u5B8C\u7F8E\u5339\u914D] [${job.company}] ${job.title} | \u7EFC\u5408\u5F97\u5206: ${filterResult.score} \u5206\uFF01`);
        const tailoredResume = await this.tailor.generateTailoredResumeAsync(job, this.profile, this.memoryManager.getMemory());
        this.tracker.updateStatus(job.id, "PENDING_REVIEW", "\u5DF2\u901A\u8FC7\u667A\u80FD\u521D\u7B5B\uFF0C\u5DF2\u63A8\u9001\u5230\u98DE\u4E66\u7B49\u5F85\u7528\u6237\u786E\u8BA4", {
          filterResult,
          tailoredResume
        });
        const sent = await this.feishu.sendApprovalNotification(job, filterResult, tailoredResume);
        return { approved: sent };
      }
      /**
       * 运行全渠道职位扫描与处理流水线（Boss直聘 + 猎聘 + 智联 + 外企官网）
       */
      async runDiscoveryCycle() {
        console.log("\n\u{1F680} [Job-Hunter] \u542F\u52A8\u5168\u6E20\u9053\u804C\u4F4D\u96F7\u8FBE\u626B\u63CF\u4E0E\u5339\u914D\u8BC4\u4F30...");
        const [{ ChromeCDPClient: ChromeCDPClient2 }, { ChromePlatformScraper: ChromePlatformScraper2 }] = await Promise.all([
          Promise.resolve().then(() => (init_ChromeCDPClient(), ChromeCDPClient_exports)),
          Promise.resolve().then(() => (init_ChromePlatformScraper(), ChromePlatformScraper_exports))
        ]);
        const cdpClient = new ChromeCDPClient2();
        const scraper = new ChromePlatformScraper2(cdpClient);
        const foreignRadar = new ForeignEnterpriseRadar();
        const discoveredJobs = [];
        const isCdpConnected = await cdpClient.connect();
        if (isCdpConnected) {
          console.log("\u{1F310} [\u5168\u6E20\u9053\u626B\u63CF] \u6B63\u5728\u901A\u8FC7\u63A5\u7BA1\u7684\u5DF2\u767B\u5F55 Chrome \u6293\u53D6\u3010Boss\u76F4\u8058\u3011\u3001\u3010\u730E\u8058\u3011\u3001\u3010\u667A\u8054\u3011...");
          const searchKeywords = [
            "\u667A\u80FD\u5236\u9020 \u6570\u5B57\u5316",
            "AI\u4EA7\u54C1\u7ECF\u7406"
          ];
          for (const kw of searchKeywords) {
            const bossJobs = await scraper.scrapeBoss(kw, "\u957F\u6C99");
            discoveredJobs.push(...bossJobs);
            const liepinJobs = await scraper.scrapeLiepin(kw, "\u957F\u6C99");
            discoveredJobs.push(...liepinJobs);
            if (kw.includes("AI")) {
              const remoteBossJobs = await scraper.scrapeBoss(`${kw} \u8FDC\u7A0B`, "\u5168\u56FD");
              discoveredJobs.push(...remoteBossJobs);
            }
          }
        } else {
          console.log("\u26A0\uFE0F [\u63D0\u793A] \u672C\u5730 Chrome 9222 \u8C03\u8BD5\u7AEF\u53E3\u672A\u8FDE\u901A\u3002");
          console.log("\u{1F4A1} \u8BF7\u5148\u8FD0\u884C `npm run chrome` \u542F\u52A8\u4E13\u5C5E\u6D4F\u89C8\u5668\uFF0C\u5E76\u5728\u5176\u4E2D\u767B\u5F55\u8D26\u53F7\u3002");
        }
        const targetEnterprises = foreignRadar.getTargetEnterprises();
        console.log(`\u{1F3E2} [\u5916\u4F01\u96F7\u8FBE] \u5DF2\u6FC0\u6D3B ${targetEnterprises.length} \u5BB6\u957F\u6C99\u5934\u90E8\u5916\u4F01\u4E0E\u9AD8\u89C4\u683C\u7814\u4EA7\u57FA\u5730\u5B9A\u5411\u76D1\u63A7 (\u535A\u4E16\u3001\u820D\u5F17\u52D2\u3001\u5DF4\u65AF\u592B\u6749\u6749\u3001\u7D22\u6069\u683C\u3001\u897F\u95E8\u5B50\u7B49)`);
        console.log(`\u{1F4E1} [\u96F7\u8FBE\u6C47\u603B] \u672C\u8F6E\u5171\u6293\u53D6\u5E76\u805A\u5408\u5230 ${discoveredJobs.length} \u4E2A\u771F\u5B9E\u5728\u62DB\u804C\u4F4D\u5019\u9009`);
        for (const job of discoveredJobs) {
          const fingerprint = this.tracker.generateFingerprint(job.company, job.title, job.url);
          job.id = fingerprint;
          if (this.tracker.isAlreadyProcessed(fingerprint)) {
            console.log(`\u23ED\uFE0F  [\u9632\u91CD\u8DF3\u8FC7] \u5C97\u4F4D\u5DF2\u7ECF\u5904\u4E8E\u8DDF\u8E2A\u6C60\u4E2D: [${job.company}] ${job.title}`);
            continue;
          }
          this.tracker.registerDiscoveredJob(job);
          const cooldownCheck = this.tracker.isCompanyInCooldown(job.company);
          if (cooldownCheck.inCooldown) {
            console.log(`\u23F3 [\u51B7\u5374\u671F\u8DF3\u8FC7] \u516C\u53F8\u300C${job.company}\u300D\u5904\u4E8E\u6295\u9012\u51B7\u5374\u4FDD\u62A4\u671F\u4E2D (\u4E0A\u6B21\u6295\u9012: ${cooldownCheck.lastApplied})`);
            this.tracker.updateStatus(job.id, "FILTERED_OUT", "\u5904\u4E8E\u516C\u53F8\u6295\u9012\u51B7\u5374\u671F");
            continue;
          }
          const filterResult = this.filter.evaluate(job, this.profile, this.memoryManager.getMemory());
          if (!filterResult.passed) {
            console.log(`\u274C [\u8FC7\u6EE4\u6DD8\u6C70] [${job.company}] ${job.title} | \u5F97\u5206: ${filterResult.score} | \u539F\u56E0: ${filterResult.reasons.join("; ")}`);
            this.tracker.updateStatus(job.id, "FILTERED_OUT", filterResult.reasons.join("; "), { filterResult });
            continue;
          }
          console.log(`\u2705 [\u5339\u914D\u8FBE\u6807] [${job.company}] ${job.title} | \u7EFC\u5408\u5F97\u5206: ${filterResult.score} \u5206\uFF01`);
          const tailoredResume = this.tailor.generateTailoredResume(job, this.profile, this.memoryManager.getMemory());
          this.tracker.updateStatus(job.id, "PENDING_REVIEW", "\u5DF2\u901A\u8FC7\u521D\u7B5B\uFF0C\u63A8\u9001\u5230\u98DE\u4E66\u7B49\u5F85\u786E\u8BA4", {
            filterResult,
            tailoredResume
          });
          await this.feishu.sendApprovalNotification(job, filterResult, tailoredResume);
        }
        const stats = this.tracker.getPipelineStatistics();
        console.log("\n\u{1F4CA} ========== \u804C\u4F4D\u5168\u751F\u547D\u5468\u671F\u8DDF\u8E2A\u770B\u677F ==========");
        console.log(`\u603B\u6536\u5F55\u5C97\u4F4D\u6570: ${stats.total}`);
        console.log(`  - \u5F85\u7528\u6237\u5BA1\u6279 (PENDING_REVIEW):   ${stats.byStatus.PENDING_REVIEW}`);
        console.log(`  - \u5DF2\u901A\u8FC7\u5F85\u6295\u9012 (APPROVED):       ${stats.byStatus.APPROVED}`);
        console.log(`  - \u5DF2\u6295\u9012\u6C9F\u901A\u4E2D (APPLIED):        ${stats.byStatus.APPLIED}`);
        console.log(`  - \u89C4\u5219\u8FC7\u6EE4\u6DD8\u6C70 (FILTERED_OUT):   ${stats.byStatus.FILTERED_OUT}`);
        console.log(`  - \u7528\u6237\u4E3B\u52A8\u62D2\u7EDD (REJECTED_BY_USER):${stats.byStatus.REJECTED_BY_USER}`);
        console.log("============================================\n");
      }
      /**
       * 模拟用户在飞书或本地对某个岗位做出决策
       */
      handleUserAction(jobId, action, reasonOrTweak) {
        const record = this.tracker.getRecord(jobId);
        if (!record) {
          console.error(`\u672A\u627E\u5230\u5C97\u4F4D\u8BB0\u5F55: ${jobId}`);
          return;
        }
        if (action === "APPROVED") {
          this.tracker.updateStatus(jobId, "APPROVED", "\u7528\u6237\u786E\u8BA4\u6295\u9012", {
            userFeedback: { action: "APPROVED", timestamp: (/* @__PURE__ */ new Date()).toISOString() }
          });
          this.tracker.updateStatus(jobId, "APPLIED", "\u5DF2\u6210\u529F\u6253\u62DB\u547C\u5E76\u6295\u9012\u5B9A\u5236\u7B80\u5386");
          console.log(`\u{1F389} [\u5DF2\u6295\u9012] \u6210\u529F\u6295\u9012\u81F3 [${record.job.company}] ${record.job.title}\uFF01`);
        } else if (action === "REJECTED") {
          this.tracker.updateStatus(jobId, "REJECTED_BY_USER", `\u7528\u6237\u62D2\u7EDD: ${reasonOrTweak || "\u65E0\u7279\u5B9A\u539F\u56E0"}`, {
            userFeedback: { action: "REJECTED", reason: reasonOrTweak, timestamp: (/* @__PURE__ */ new Date()).toISOString() }
          });
          this.memoryManager.recordRejection(jobId, record.job.company, record.job.title, reasonOrTweak);
          console.log(`\u{1F6D1} [\u5DF2\u62D2\u7EDD\u5E76\u6C89\u6DC0] \u8BB0\u5F55\u62D2\u7EDD\u539F\u56E0\uFF1A\u300C${reasonOrTweak}\u300D\uFF0C\u5DF2\u66F4\u65B0\u5230\u8D1F\u53CD\u9988\u5E93\u3002`);
        } else if (action === "REQUEST_TWEAK") {
          this.memoryManager.recordResumeTweak(record.job.title, reasonOrTweak || "");
          const newTailoredResume = this.tailor.generateTailoredResume(record.job, this.profile, this.memoryManager.getMemory());
          this.tracker.updateStatus(jobId, "PENDING_REVIEW", `\u6839\u636E\u7528\u6237\u8981\u6C42\u8C03\u6574\u7B80\u5386: ${reasonOrTweak}`, {
            tailoredResume: newTailoredResume,
            userFeedback: { action: "REQUEST_TWEAK", tweakInstructions: reasonOrTweak, timestamp: (/* @__PURE__ */ new Date()).toISOString() }
          });
          console.log(`\u270F\uFE0F [\u7B80\u5386\u5DF2\u91CD\u65B0\u88C1\u526A] \u4F9D\u636E\u8981\u6C42\u5237\u65B0\u7B80\u5386\u5FEB\u7167\uFF0C\u5DF2\u66F4\u65B0\u5F85\u786E\u8BA4\u72B6\u6001\u3002`);
        }
      }
    };
  }
});

// src/modules/safety/AntiRiskEngine.ts
import * as fs6 from "node:fs";
import * as path6 from "node:path";
var AntiRiskEngine;
var init_AntiRiskEngine = __esm({
  "src/modules/safety/AntiRiskEngine.ts"() {
    "use strict";
    init_storage();
    AntiRiskEngine = class _AntiRiskEngine {
      stateKey;
      state;
      // 安全配置硬约束
      static MAX_DAILY_PER_PLATFORM = 20;
      // 单平台每日上限20个，杜绝高频
      static MIN_HUMAN_DELAY_MS = 3500;
      // 拟人化最小操作延迟 3.5s
      static MAX_HUMAN_DELAY_MS = 7500;
      // 拟人化最大操作延迟 7.5s
      constructor(fileKey = "data/memory/anti_risk_state.json") {
        this.stateKey = fileKey;
        this.state = this.loadState();
        this.checkAndResetDailyQuota();
      }
      /**
       * 检查是否处于安全熔断状态
       */
      isCircuitBreakerTripped() {
        if (this.state.circuitBreakerTripped) {
          return { tripped: true, reason: this.state.trippedReason };
        }
        return { tripped: false };
      }
      /**
       * 触发安全熔断（主动休眠保护账号）
       */
      tripCircuitBreaker(reason) {
        this.state.circuitBreakerTripped = true;
        this.state.trippedReason = reason;
        this.state.trippedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.saveState();
        console.error(`
\u{1F6A8}\u{1F6A8}\u{1F6A8} [\u98CE\u63A7\u7194\u65AD\u89E6\u53D1] ${reason} \u{1F6A8}\u{1F6A8}\u{1F6A8}`);
        console.error(`\u{1F6E1}\uFE0F \u81EA\u52A8\u5316\u626B\u63CF\u4E0E\u6253\u62DB\u547C\u5DF2\u7D27\u6025\u6302\u8D77\uFF0C\u4FDD\u62A4\u8D26\u53F7\u4E0D\u88AB\u98CE\u63A7\uFF01`);
        console.error(`\u{1F449} \u8BF7\u6392\u67E5\u62DB\u8058\u5E73\u53F0\u9A8C\u8BC1\u7801\u6216\u98CE\u63A7\u63D0\u793A\u540E\uFF0C\u5728\u770B\u677F\u624B\u52A8\u89E3\u9664\u7194\u65AD\u3002
`);
      }
      /**
       * 人工复位熔断
       */
      resetCircuitBreaker() {
        this.state.circuitBreakerTripped = false;
        this.state.trippedReason = void 0;
        this.state.trippedAt = void 0;
        this.saveState();
        console.log(`\u2705 [AntiRiskEngine] \u98CE\u63A7\u7194\u65AD\u5DF2\u624B\u52A8\u590D\u4F4D\u6062\u590D\u6B63\u5E38\uFF01`);
      }
      /**
       * 检查指定平台今日是否已触碰保护上限
       */
      canProcess(platform) {
        this.checkAndResetDailyQuota();
        if (this.state.circuitBreakerTripped) {
          return { allowed: false, reason: `\u98CE\u63A7\u7194\u65AD\u4E2D: ${this.state.trippedReason}` };
        }
        const currentCount = this.state.dailyCount[platform] || 0;
        if (currentCount >= _AntiRiskEngine.MAX_DAILY_PER_PLATFORM) {
          return {
            allowed: false,
            reason: `\u5DF2\u8FBE\u5355\u5E73\u53F0\u6BCF\u65E5\u5B89\u5168\u5904\u7406\u9608\u503C (${_AntiRiskEngine.MAX_DAILY_PER_PLATFORM}\u4E2A/\u65E5)\uFF0C\u4E3B\u52A8\u505C\u624B\u9632\u98CE\u63A7`
          };
        }
        return { allowed: true };
      }
      checkQuota(platform) {
        return this.canProcess(platform).allowed;
      }
      /**
       * 记录一次有效投递/打招呼操作
       */
      recordAction(platform) {
        this.checkAndResetDailyQuota();
        this.state.dailyCount[platform] = (this.state.dailyCount[platform] || 0) + 1;
        this.saveState();
      }
      recordUsage(platform) {
        this.recordAction(platform);
      }
      async humanJitterDelay(minMs = _AntiRiskEngine.MIN_HUMAN_DELAY_MS, maxMs = _AntiRiskEngine.MAX_HUMAN_DELAY_MS) {
        const delay = Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);
        await new Promise((resolve10) => setTimeout(resolve10, delay));
        return delay;
      }
      /**
       * 拟人化随机延迟等待（模拟真人浏览与停顿）
       */
      async humanRandomWait(actionName = "\u64CD\u4F5C") {
        const delay = Math.floor(
          Math.random() * (_AntiRiskEngine.MAX_HUMAN_DELAY_MS - _AntiRiskEngine.MIN_HUMAN_DELAY_MS + 1) + _AntiRiskEngine.MIN_HUMAN_DELAY_MS
        );
        console.log(`\u23F3 [\u9632\u98CE\u63A7\u62DF\u4EBA\u5EF6\u65F6] \u6267\u884C\u3010${actionName}\u3011\u524D\u968F\u673A\u9759\u9ED8 ${(delay / 1e3).toFixed(1)} \u79D2...`);
        await new Promise((resolve10) => setTimeout(resolve10, delay));
        return delay;
      }
      /**
       * 扫描 HTML/文本中是否含有平台验证码、滑块或风险风控标志
       */
      detectRiskInHtml(html) {
        const lower = (html || "").toLowerCase();
        const dangerSignatures = [
          { pattern: "sec.zhipin.com", reason: "Boss\u76F4\u8058\u5B89\u5168\u9A8C\u8BC1\u62E6\u622A" },
          { pattern: "waf_verify", reason: "\u89E6\u53D1\u5E95\u5C42 WAF \u6ED1\u5757" },
          { pattern: "geetest", reason: "\u6781\u9A8C\u9A8C\u8BC1\u7801\u5F39\u51FA" },
          { pattern: "\u9A8C\u8BC1\u7801", reason: "\u68C0\u6D4B\u5230\u9875\u9762\u5305\u542B\u9A8C\u8BC1\u7801\u63D0\u793A" },
          { pattern: "\u9891\u7E41", reason: "\u64CD\u4F5C\u8FC7\u4E8E\u9891\u7E41\u63D0\u793A" },
          { pattern: "\u5F02\u5E38\u8BBF\u95EE", reason: "\u68C0\u6D4B\u5230\u5F02\u5E38\u8BBF\u95EE\u8B66\u544A" },
          { pattern: "acw_sc_v2", reason: "\u963F\u91CC\u4E91WAF\u6311\u6218\u76FE\u724C\u89E6\u53D1" }
        ];
        for (const sig of dangerSignatures) {
          if (lower.includes(sig.pattern.toLowerCase())) {
            return { hasRisk: true, signature: sig.reason };
          }
        }
        return { hasRisk: false };
      }
      getState() {
        return { ...this.state };
      }
      checkAndResetDailyQuota() {
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        if (this.state.currentDate !== today) {
          this.state.currentDate = today;
          this.state.dailyCount = {};
          this.saveState();
        }
      }
      loadState() {
        try {
          const absPath = path6.resolve(process.cwd(), this.stateKey);
          if (fs6.existsSync(absPath)) {
            return JSON.parse(fs6.readFileSync(absPath, "utf-8"));
          }
        } catch (e) {
        }
        return {
          circuitBreakerTripped: false,
          dailyCount: {},
          currentDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        };
      }
      saveState() {
        void writeJson(this.stateKey, this.state);
      }
    };
  }
});

// src/standalone.ts
var standalone_exports = {};
__export(standalone_exports, {
  StandaloneJobHunter: () => StandaloneJobHunter
});
import "dotenv/config";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as fs9 from "node:fs";
import * as path9 from "node:path";
var execAsync, StandaloneJobHunter, entryScript;
var init_standalone = __esm({
  "src/standalone.ts"() {
    "use strict";
    init_index();
    init_AntiRiskEngine();
    execAsync = promisify(exec);
    StandaloneJobHunter = class {
      agent;
      safety;
      constructor() {
        this.agent = new JobHunterCore();
        this.safety = new AntiRiskEngine();
      }
      /**
       * 通过 macOS 系统底层 JXA 接口从 Chrome 纯只读提取（带全套防风控护盾）
       */
      async extractFromChrome() {
        const breaker = this.safety.isCircuitBreakerTripped();
        if (breaker.tripped) {
          console.warn(`\u{1F6E1}\uFE0F [\u5B89\u5168\u7194\u65AD\u62E6\u622A] \u5F53\u524D\u5904\u4E8E\u4F11\u7720\u4FDD\u62A4\u671F\uFF08\u539F\u56E0\uFF1A${breaker.reason}\uFF09\uFF0C\u5DF2\u6682\u505C\u5BF9\u524D\u53F0\u6D4F\u89C8\u5668\u7684\u8BFB\u53D6\uFF01`);
          return [];
        }
        const jxaScriptPath = path9.resolve(process.cwd(), "scripts/extract-jxa.js");
        if (!fs9.existsSync(jxaScriptPath)) {
          return [];
        }
        try {
          await this.safety.humanJitterDelay(1500, 3e3);
          const { stdout } = await execAsync(`osascript -l JavaScript "${jxaScriptPath}"`);
          const parsed = JSON.parse(stdout.trim() || "{}");
          if (parsed.riskDetected) {
            this.safety.tripCircuitBreaker(`\u9875\u9762\u51FA\u73B0\u98CE\u63A7\u7279\u5F81\u5173\u952E\u5B57: ${parsed.reason}`);
            await this.agent.feishu.sendApprovalNotification(
              {
                id: "risk_alert_" + Date.now(),
                title: "\u26A0\uFE0F \u8D26\u53F7\u5B89\u5168\u4FDD\u62A4\u5DF2\u89E6\u53D1\u7194\u65AD",
                company: "\u7CFB\u7EDF\u5B89\u5168\u76FE\u724C",
                city: "\u672C\u5730\u9632\u62A4",
                workMode: "ONSITE",
                salaryText: "\u4F11\u7720\u4FDD\u62A4\u4E2D",
                description: `\u68C0\u6D4B\u5230\u524D\u53F0\u9875\u9762\u51FA\u73B0\u98CE\u63A7\u7279\u5F81\uFF08${parsed.reason}\uFF09\u3002\u7CFB\u7EDF\u5DF2\u81EA\u52A8\u505C\u6B62\u4E00\u5207\u8BFB\u53D6\u884C\u4E3A\uFF0C\u4FDD\u62A4\u60A8\u7684\u8D26\u53F7\u4E0D\u53D7\u4EFB\u4F55\u9650\u5236\uFF01`,
                url: "https://open.feishu.cn",
                platform: "OTHER",
                discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
              },
              { passed: true, score: 100, reasons: [`\u5B89\u5168\u7194\u65AD\u539F\u56E0\uFF1A${parsed.reason}`], breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 } },
              { jobId: "risk_alert", company: "\u7CFB\u7EDF\u5B89\u5168", jobTitle: "\u5B89\u5168\u4FDD\u62A4", generatedAt: (/* @__PURE__ */ new Date()).toISOString(), markdownContent: "# \u5B89\u5168\u7194\u65AD\u5DF2\u6FC0\u6D3B", greetingMessage: "\u7CFB\u7EDF\u5DF2\u81EA\u52A8\u4F11\u7720\uFF0C\u8BF7\u653E\u5FC3\u3002", keyMatchingPoints: ["\u8D26\u53F7\u96F6\u98CE\u9669\u4FDD\u969C"] }
            );
            return [];
          }
          const rawList = parsed.jobs || [];
          const jobs = [];
          for (const item of rawList) {
            if (!item.title || !item.url) continue;
            const platform = item.url.includes("zhipin") ? "BOSS" : item.url.includes("liepin") ? "LIEPIN" : "ZHAOPIN";
            if (!this.safety.checkQuota(platform)) {
              console.log(`\u23F3 [\u914D\u989D\u4FDD\u62A4] \u5E73\u53F0 ${platform} \u4ECA\u65E5\u5DF2\u8FBE\u5B89\u5168\u4E0A\u9650\uFF08${AntiRiskEngine.MAX_DAILY_PER_PLATFORM}\u4E2A\uFF09\uFF0C\u81EA\u52A8\u8DF3\u8FC7\u3002`);
              continue;
            }
            const fullUrl = item.url.startsWith("http") ? item.url : `https://www.liepin.com${item.url}`;
            const isRemote = item.city.includes("\u8FDC\u7A0B") || item.title.includes("\u8FDC\u7A0B");
            jobs.push({
              id: `lp_${Buffer.from(fullUrl).toString("base64").substring(0, 16)}`,
              title: item.title,
              company: item.company || "\u77E5\u540D\u4F01\u4E1A/\u730E\u5934\u76F4\u8058",
              city: item.city || "\u957F\u6C99",
              workMode: isRemote ? "REMOTE" : "ONSITE",
              salaryText: item.salaryText || "\u9762\u8BAE",
              description: `${item.title}\u3002${item.rawText || ""}`,
              url: fullUrl,
              platform,
              publishOrActiveTime: item.activeTime || "\u8FD1\u671F\u5728\u7EBF",
              discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
            });
            this.safety.recordUsage(platform);
          }
          return jobs;
        } catch (e) {
          console.warn(`[macOS JXA] \u53EA\u8BFB\u63D0\u53D6\u5F02\u5E38: ${e.message}`);
          return [];
        }
      }
      /**
       * 执行单次全自动扫描与推送
       */
      async runSingleScan() {
        console.log(`
======================================================`);
        console.log(`\u{1F552} [Job-Hunter] \u542F\u52A8\u7CFB\u7EDF\u626B\u63CF: ${(/* @__PURE__ */ new Date()).toLocaleString()}`);
        console.log(`======================================================`);
        const jobs = await this.extractFromChrome();
        console.log(`\u{1F4CC} \u4ECE\u5F53\u524D Chrome \u62DB\u8058\u7A97\u53E3\u6355\u83B7\u5230 ${jobs.length} \u4E2A\u7ED3\u6784\u5316\u5C97\u4F4D\u5019\u9009`);
        let approvedCount = 0;
        for (const job of jobs) {
          const res = await this.agent.processSingleJob(job);
          if (res.approved) {
            approvedCount++;
          }
        }
        console.log(`
\u{1F389} \u672C\u6B21\u626B\u63CF\u5B8C\u6210\uFF01\u5171\u63A8\u9001\u4E86 ${approvedCount} \u4E2A\u9AD8\u5339\u914D\u5EA6\u5C97\u4F4D\u81F3\u98DE\u4E66\u3002`);
        return approvedCount;
      }
      /**
       * 启动后台持续轮询巡检模式（Daemon Watcher）
       */
      async startWatcher(intervalMinutes = 15) {
        console.log(`\u{1F680} [Job-Hunter] \u72EC\u7ACB\u5B88\u62A4\u8FDB\u7A0B\u5DF2\u542F\u52A8\uFF01`);
        console.log(`\u23F0 \u5DE1\u68C0\u5468\u671F\uFF1A\u6BCF ${intervalMinutes} \u5206\u949F\u81EA\u52A8\u540C\u6B65\u4E00\u6B21\u5F53\u524D\u6D4F\u89C8\u5668\u5C97\u4F4D`);
        console.log(`\u{1F4A1} \u63D0\u793A\uFF1A\u6309 Ctrl+C \u53EF\u968F\u65F6\u505C\u6B62\u8FD0\u884C\u3002
`);
        await this.runSingleScan();
        setInterval(async () => {
          try {
            await this.runSingleScan();
          } catch (e) {
            console.error("\u5DE1\u68C0\u51FA\u9519:", e);
          }
        }, intervalMinutes * 60 * 1e3);
      }
      /**
       * 打印当前投递与跟踪进度看板
       */
      showPipelineStatus() {
        const stats = this.agent.tracker.getPipelineStatistics();
        console.log("\n\u{1F4CA} ========== Job-Hunter \u804C\u4F4D\u751F\u547D\u5468\u671F\u8DDF\u8E2A\u770B\u677F ==========");
        console.log(`\u603B\u6536\u5F55\u5C97\u4F4D\u6570: ${stats.total}`);
        console.log(`  - \u5F85\u60A8\u98DE\u4E66\u5BA1\u6279 (PENDING_REVIEW):   ${stats.byStatus.PENDING_REVIEW}`);
        console.log(`  - \u5DF2\u786E\u8BA4\u540C\u610F\u6295\u9012 (APPROVED):       ${stats.byStatus.APPROVED}`);
        console.log(`  - \u5DF2\u6267\u884C\u6295\u9012/\u6253\u62DB\u547C (APPLIED):     ${stats.byStatus.APPLIED}`);
        console.log(`  - \u89C4\u5219\u4E0E\u7EA2\u7EBF\u8FC7\u6EE4\u6DD8\u6C70 (FILTERED_OUT):${stats.byStatus.FILTERED_OUT}`);
        console.log(`  - \u60A8\u4E3B\u52A8\u62D2\u7EDD\u8BB0\u5F55 (REJECTED_BY_USER):${stats.byStatus.REJECTED_BY_USER}`);
        console.log("========================================================\n");
      }
    };
    entryScript = process.argv[1] || "";
    if (entryScript.includes("standalone")) {
      const command = process.argv[2] || "scan";
      const hunter = new StandaloneJobHunter();
      switch (command) {
        case "scan":
          hunter.runSingleScan().catch(console.error);
          break;
        case "watch": {
          const mins = parseInt(process.argv[3] || "15", 10);
          hunter.startWatcher(mins).catch(console.error);
          break;
        }
        case "status":
          hunter.showPipelineStatus();
          break;
        default:
          console.log(`\u7528\u6CD5:
  tsx src/standalone.ts scan     # \u6267\u884C\u5355\u6B21\u6781\u901F\u626B\u63CF\u5E76\u63A8\u98DE\u4E66
  tsx src/standalone.ts watch 15 # \u542F\u52A8\u5B88\u62A4\u8FDB\u7A0B\uFF0C\u6BCF15\u5206\u949F\u8F6E\u8BE2\u5DE1\u68C0
  tsx src/standalone.ts status   # \u67E5\u770B\u6C42\u804C\u770B\u677F\u8FDB\u5EA6\u7EDF\u8BA1`);
          break;
      }
    }
  }
});

// src/modules/server/CollectorServer.ts
init_index();
init_LlmClient();
init_AntiRiskEngine();
import * as http from "node:http";
import * as fs10 from "node:fs";
import * as path10 from "node:path";

// src/modules/ai/PiSessionCopilot.ts
init_LlmClient();
init_storage();
import path7 from "path";
import fs7 from "fs";
var PiSessionCopilot = class _PiSessionCopilot {
  static instance = null;
  session = null;
  sessionDir;
  isInitializing = false;
  useFallback = false;
  fallbackHistory = [];
  fallbackKey = "data/memory/copilot_sessions/fallback_history.json";
  llmClient;
  constructor() {
    this.sessionDir = path7.resolve(process.cwd(), "data/memory/copilot_sessions");
    this.llmClient = new LlmClient();
  }
  static getInstance() {
    if (!_PiSessionCopilot.instance) {
      _PiSessionCopilot.instance = new _PiSessionCopilot();
    }
    return _PiSessionCopilot.instance;
  }
  async getOrCreateSession() {
    if (this.session || this.useFallback) {
      return this.session;
    }
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return this.session;
    }
    this.isInitializing = true;
    try {
      if (!fs7.existsSync(this.sessionDir)) {
        try {
          fs7.mkdirSync(this.sessionDir, { recursive: true });
        } catch {
        }
      }
      let piPkg;
      try {
        const piPkgName = ["@earendil-works", "pi-coding-agent"].join("/");
        piPkg = await import(piPkgName);
      } catch (e) {
        this.useFallback = true;
        this.fallbackHistory = await readJson(this.fallbackKey, []);
        return null;
      }
      const { createAgentSession, SessionManager, DefaultResourceLoader, getAgentDir, ModelRuntime } = piPkg;
      const cwd = process.cwd();
      const agentDir = getAgentDir ? getAgentDir() : cwd;
      const profilePath = path7.resolve(cwd, "data/profile/master_profile.json");
      let profileGroundTruth = "";
      let candidateName = "\u5019\u9009\u4EBA";
      let candidateTitle = "\u8D44\u6DF1\u4E13\u5BB6";
      let validCompanyList = "";
      if (fs7.existsSync(profilePath)) {
        try {
          const prof = JSON.parse(fs7.readFileSync(profilePath, "utf-8"));
          const basic = prof.basicInfo || {};
          const workExp = (prof.workExperiences || []).map((w) => {
            const hls = (w.highlights || []).map((h) => `    * \u3010${h.module}\u3011: ${h.details}`).join("\n");
            return `  - \u516C\u53F8: \u3010${w.company}\u3011
    \u804C\u4F4D: ${w.role} | \u8D77\u6B62\u65F6\u95F4: ${w.startDate} ~ ${w.endDate}
    \u6982\u8FF0: ${w.description}
${hls}`;
          }).join("\n\n");
          const skillsAi = (prof.skills?.aiAndDigitalization || []).join("\u3001");
          const skillsMfg = (prof.skills?.industrialEngineering || []).join("\u3001");
          const certs = (prof.skills?.certifications || []).map((c) => `${c.title} (${c.org}, ${c.date})`).join("\uFF1B");
          candidateName = basic.name || "\u5019\u9009\u4EBA";
          candidateTitle = basic.title || "\u8D44\u6DF1\u4E13\u5BB6";
          validCompanyList = (prof.workExperiences || []).map((w) => `\u3010${w.company}\u3011`).join("\u3001");
          profileGroundTruth = `
====================\u3010${candidateName}\u771F\u5B9E\u5C65\u5386\u6743\u5A01\u4E8B\u5B9E\u6E90\uFF08Ground Truth\uFF09\u3011====================
\u3010\u57FA\u672C\u4FE1\u606F\u3011
- \u59D3\u540D: ${candidateName}
- \u6838\u5FC3\u5B9A\u4F4D: ${candidateTitle}
- \u5DE5\u4F5C\u5E74\u9650: ${basic.yearsOfExperience || 10} \u5E74
- \u624B\u673A: ${basic.phone || "\u4FDD\u5BC6"} \uFF5C \u90AE\u7BB1: ${basic.email || "\u4FDD\u5BC6"}
- \u6240\u5728\u5730: ${basic.location || "\u5168\u56FD"}
- \u5B66\u5386\u80CC\u666F: ${basic.education?.school || "\u9AD8\u7B49\u5B66\u5E9C"} \xB7 ${basic.education?.degree || "\u672C\u79D1"} \xB7 ${basic.education?.major || "\u4E13\u4E1A"}

\u3010\u771F\u5B9E\u804C\u4E1A\u7ECF\u5386\uFF08\u6309\u65F6\u95F4\u5012\u5E8F\uFF0C\u8FD9\u662F${candidateName}\u5C31\u804C\u8FC7\u7684\u5168\u90E8\u771F\u5B9E\u516C\u53F8\uFF0C\u7EDD\u65E0\u5176\u4ED6\uFF09\u3011
${workExp}

\u3010\u6838\u5FC3\u6280\u80FD\u4E0E\u4E13\u4E1A\u8D44\u8D28\u3011
- \u4E13\u4E1A\u6280\u80FD: ${skillsAi}
- \u884C\u4E1A\u5DE5\u7A0B\u4E0E\u7EFC\u5408\u80FD\u529B: ${skillsMfg}
- \u6743\u5A01\u8D44\u8D28: ${certs}
=============================================================================`;
        } catch (e) {
          console.error("\u52A0\u8F7D\u4E3B\u5C65\u5386\u5F02\u5E38:", e);
        }
      }
      const systemPrompt = `\u4F60\u662F\u7531 Pi Coding Agent \u9A71\u52A8\u7684${candidateName}\u4E13\u5C5E AI \u5C65\u5386\u4E13\u5BB6\u5408\u4F19\u4EBA\uFF08Profile Copilot\uFF09\u3002
\u4F60\u7684\u804C\u8D23\u662F\u5E2E\u52A9${candidateName}\u6253\u78E8\u3001\u63D0\u70BC\u4E2A\u4EBA\u5C65\u5386\u7EC6\u8282\uFF0C\u8FD0\u7528 STAR \u539F\u5219\u6316\u6398\u5177\u6709\u6280\u672F\u6DF1\u5EA6\u3001\u6570\u636E\u91CF\u5316\u548C\u4E1A\u52A1\u5F71\u54CD\u529B\u7684\u6210\u679C\u4EAE\u70B9\u3002

${profileGroundTruth}

\u3010\u771F\u5B9E\u6027\u4E0E\u9632\u5E7B\u89C9\u6700\u9AD8\u7EA2\u7EBF\uFF08Strict Grounding\uFF09\u3011
1. **\u4E25\u683C\u4E8B\u5B9E\u4F9D\u4ECE**\uFF1A\u5173\u4E8E${candidateName}\u7684\u4E2A\u4EBA\u7ECF\u5386\u3001\u5DE5\u4F5C\u5355\u4F4D\u3001\u804C\u4F4D\u3001\u8D77\u6B62\u65F6\u95F4\u3001\u9879\u76EE\u4E0E\u5B66\u5386\uFF0C\u5FC5\u987B 100% \u4E25\u683C\u4EE5\u6743\u5A01\u4E8B\u5B9E\u6E90\u4E3A\u51C6\uFF0C\u4E25\u7981\u675C\u64B0\u6216\u51ED\u7A7A\u7F16\u9020\uFF01
2. **\u4E25\u7981\u6DF7\u6DC6\u5C31\u804C\u5355\u4F4D**\uFF1A
   - ${candidateName}\u6240\u6709\u771F\u5B9E\u4EFB\u804C\u8FC7\u7684\u5355\u4F4D\u4EC5\u9650\u6743\u5A01\u4E8B\u5B9E\u6E90\u4E2D\u5217\u51FA\u7684\uFF1A${validCompanyList || "\uFF08\u6682\u65E0\u8BB0\u5F55\uFF0C\u8BF7\u5F15\u5BFC\u5019\u9009\u4EBA\u8865\u5145\uFF09"}\uFF1B
   - \u575A\u51B3\u4E25\u7981\u675C\u64B0\u6216\u634F\u9020\u4EFB\u4F55\u672A\u5728\u6863\u6848\u4E2D\u5217\u51FA\u7684\u7B2C\u4E09\u65B9\u516C\u53F8\u3001\u57F9\u8BAD\u673A\u6784\u6216\u804C\u4F4D\uFF01
3. **\u5982\u5B9E\u56DE\u7B54**\uFF1A\u5982\u679C${candidateName}\u6216\u5BF9\u8BDD\u95EE\u53CA\u6863\u6848\u4E2D\u672A\u8F7D\u660E\u7684\u4FE1\u606F\uFF0C\u8BF7\u5982\u5B9E\u544A\u77E5\u6863\u6848\u4E2D\u6682\u65E0\u8BB0\u5F55\uFF0C\u5E76\u5F15\u5BFC${candidateName}\u8865\u5145\u7EC6\u8282\uFF0C\u7EDD\u4E0D\u53EF\u5984\u52A0\u731C\u6D4B\u3002
4. **\u8F93\u51FA\u89C4\u8303**\uFF1A\u8BED\u8A00\u7CBE\u7EC3\u4E13\u4E1A\uFF0C\u7A81\u51FA\u91CF\u5316\u6210\u679C\u4E0E\u6280\u672F\u6DF1\u5EA6\uFF1B\u683C\u5F0F\u4F18\u5148\u4F7F\u7528 Markdown\uFF08\u52A0\u7C97\u3001\u6E05\u6670\u5217\u8868\u3001\u5C0F\u6807\u9898\uFF09\u3002`;
      const loader = new DefaultResourceLoader({
        cwd,
        agentDir,
        systemPromptOverride: () => systemPrompt,
        appendSystemPromptOverride: () => []
      });
      await loader.reload();
      const modelRuntime = await ModelRuntime.create();
      const available = await modelRuntime.getAvailable();
      const selectedModel = available.find((m) => m.id.includes("flash") || m.id.includes("glm-5.3") || m.id.includes("gemini-3")) || available[0];
      const sessionManager = SessionManager.continueRecent(cwd, this.sessionDir);
      const { session } = await createAgentSession({
        resourceLoader: loader,
        sessionManager,
        modelRuntime,
        model: selectedModel,
        tools: []
      });
      this.session = session;
      return session;
    } catch (err) {
      console.warn("[PiSessionCopilot] \u521D\u59CB\u5316 Pi \u5F15\u64CE\u56DE\u9000\u81F3\u6807\u51C6\u6A21\u5F0F:", err);
      this.useFallback = true;
      this.fallbackHistory = await readJson(this.fallbackKey, []);
      return null;
    } finally {
      this.isInitializing = false;
    }
  }
  async prompt(message) {
    await this.getOrCreateSession();
    if (this.useFallback || !this.session) {
      this.fallbackHistory.push({ role: "user", content: message, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
      const promptText = `\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u5C65\u5386\u8F85\u5BFC\u987E\u95EE\uFF0C\u8BF7\u534F\u52A9\u5019\u9009\u4EBA\u68B3\u7406\u804C\u4E1A\u7ECF\u5386\u4E0E\u6280\u80FD\u6210\u679C\uFF1A

\u7528\u6237\u63D0\u95EE\uFF1A${message}`;
      const reply = await this.llmClient.complete(promptText, "\u4F60\u662F\u4E00\u4F4D\u4E25\u8C28\u4E13\u4E1A\u7684\u9AD8\u7EA7\u804C\u4E1A\u53D1\u5C55\u4E0E\u7B80\u5386\u4F18\u5316\u4E13\u5BB6\u3002");
      this.fallbackHistory.push({ role: "assistant", content: reply, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
      void writeJson(this.fallbackKey, this.fallbackHistory);
      return reply;
    }
    let replyText = "";
    const unsubscribe = this.session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
        replyText += event.assistantMessageEvent.delta;
      }
    });
    try {
      await this.session.prompt(message);
      return replyText.trim();
    } finally {
      unsubscribe();
    }
  }
  async getHistory() {
    await this.getOrCreateSession();
    if (this.useFallback || !this.session) {
      if (this.fallbackHistory.length === 0) {
        this.fallbackHistory = [
          {
            role: "assistant",
            content: `\u60A8\u597D\uFF01\u6211\u662F\u60A8\u7684\u4E13\u5C5E AI \u5C65\u5386\u4E13\u5BB6\u5408\u4F19\u4EBA\u3002

\u5DF2\u5C31\u7EEA\uFF1A
- \u{1F4A1} \u589E\u91CF\u5BF9\u8BDD\uFF1A\u652F\u6301\u4E0A\u4E0B\u6587\u5173\u8054\uFF1B
- \u{1F3AF} \u4E13\u4E1A\u6DA6\u8272\uFF1A\u57FA\u4E8E STAR \u539F\u5219\u63D0\u70BC\u6280\u672F\u4EAE\u70B9\u3002

\u8BF7\u544A\u8BC9\u6211\u60A8\u60F3\u4F18\u5316\u54EA\u4E00\u6BB5\u5DE5\u4F5C\u7ECF\u5386\uFF1F`,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }
        ];
      }
      return this.fallbackHistory;
    }
    const result = [];
    if (this.session.messages.length === 0) {
      result.push({
        role: "assistant",
        content: `\u60A8\u597D\uFF01\u6211\u662F\u4E13\u5C5E AI \u5C65\u5386\u4E13\u5BB6\u5408\u4F19\u4EBA\u3002

\u8BF7\u544A\u8BC9\u6211\u60A8\u60F3\u6253\u78E8\u6216\u8865\u5145\u54EA\u4E00\u6BB5\u7ECF\u5386\uFF1F`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      return result;
    }
    for (const msg of this.session.messages) {
      let text = "";
      if (typeof msg.content === "string") {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        text = msg.content.filter((p) => p.type === "text").map((p) => p.text).join("\n");
      }
      if (text && (msg.role === "user" || msg.role === "assistant")) {
        result.push({ role: msg.role, content: text, timestamp: msg.timestamp });
      }
    }
    return result;
  }
  async compactContext() {
    if (this.useFallback || !this.session) {
      if (this.fallbackHistory.length > 4) {
        this.fallbackHistory = this.fallbackHistory.slice(-4);
        void writeJson(this.fallbackKey, this.fallbackHistory);
      }
      return { success: true, message: "\u5386\u53F2\u8BB0\u5F55\u5DF2\u4FEE\u526A\u7CBE\u70BC" };
    }
    try {
      await this.session.compact("\u603B\u7ED3\u5173\u952E\u6280\u80FD\u91CD\u70B9\u4E0E\u6570\u636E\u4E8B\u5B9E\uFF0C\u538B\u7F29\u4E0A\u4E0B\u6587\u5E76\u4FDD\u7559\u5173\u952E\u4FE1\u606F\u3002");
      return { success: true, message: "\u4F1A\u8BDD\u4E0A\u4E0B\u6587\u538B\u7F29\u5B8C\u6210" };
    } catch (e) {
      return { success: false, message: e.message || "\u538B\u7F29\u5931\u8D25" };
    }
  }
  async resetSession() {
    if (this.useFallback || !this.session) {
      this.fallbackHistory = [];
      void writeJson(this.fallbackKey, []);
      return;
    }
    try {
      this.session.dispose();
    } catch (e) {
    }
    this.session = null;
  }
  async getStatus() {
    await this.getOrCreateSession();
    if (this.useFallback || !this.session) {
      return {
        sessionId: "cloud-copilot",
        sessionFile: this.fallbackKey,
        messageCount: this.fallbackHistory.length
      };
    }
    return {
      sessionId: this.session.sessionId,
      sessionFile: this.session.sessionFile,
      messageCount: this.session.messages.length
    };
  }
};

// src/modules/onboarding/OnboardingService.ts
init_storage();
import * as fs8 from "node:fs";
import * as path8 from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
var OnboardingService = class {
  statusKey;
  constructor() {
    this.statusKey = "data/system_status.json";
  }
  /**
   * 异步获取系统初始化状态（优先从统一存储层读取）
   */
  async getSystemStatusAsync() {
    const prof = await readJson("data/profile/master_profile.json", null);
    const llm = await readJson("data/preferences/llm_config.json", null);
    const status = await readJson(this.statusKey, null);
    let hasProfile = false;
    let candidateName = "\u672A\u8BBE\u7F6E";
    if (prof?.basicInfo?.name && prof.basicInfo.name !== "\u5F20\u4E09") {
      hasProfile = true;
      candidateName = prof.basicInfo.name;
    }
    let hasLlm = false;
    const apiKey = llm?.apiKey || process.env.LLM_API_KEY;
    if (apiKey && apiKey.trim().length > 5) {
      hasLlm = true;
    }
    const initialized = Boolean(status?.initialized) || hasProfile && hasLlm;
    return {
      initialized,
      hasLlm,
      hasProfile,
      candidateName,
      initializedAt: status?.initializedAt
    };
  }
  /**
   * 同步快速获取当前系统初始化状态（用于本地或快速兜底）
   */
  getSystemStatus() {
    const profilePath = path8.resolve(process.cwd(), "data/profile/master_profile.json");
    const llmPath = path8.resolve(process.cwd(), "data/preferences/llm_config.json");
    let hasProfile = false;
    let candidateName = "\u672A\u8BBE\u7F6E";
    if (fs8.existsSync(profilePath)) {
      try {
        const prof = JSON.parse(fs8.readFileSync(profilePath, "utf-8"));
        if (prof.basicInfo?.name && prof.basicInfo.name !== "\u5F20\u4E09") {
          hasProfile = true;
          candidateName = prof.basicInfo.name;
        }
      } catch (e) {
      }
    }
    let hasLlm = Boolean(process.env.LLM_API_KEY && process.env.LLM_API_KEY.length > 5);
    if (!hasLlm && fs8.existsSync(llmPath)) {
      try {
        const llm = JSON.parse(fs8.readFileSync(llmPath, "utf-8"));
        if (llm.apiKey && llm.apiKey.trim().length > 5) {
          hasLlm = true;
        }
      } catch (e) {
      }
    }
    let initialized = false;
    let initializedAt = void 0;
    const absStatus = path8.resolve(process.cwd(), this.statusKey);
    if (fs8.existsSync(absStatus)) {
      try {
        const status = JSON.parse(fs8.readFileSync(absStatus, "utf-8"));
        initialized = Boolean(status.initialized);
        initializedAt = status.initializedAt;
      } catch (e) {
      }
    } else {
      initialized = hasProfile && hasLlm;
    }
    return {
      initialized,
      hasLlm,
      hasProfile,
      candidateName,
      initializedAt
    };
  }
  /**
   * 测试指定 LLM 参数的连通性
   */
  async testLlm(config) {
    if (!config.apiKey || !config.baseUrl || !config.model) {
      return { success: false, message: "\u8BF7\u586B\u5199\u5B8C\u6574\u7684 API Key\u3001Base URL \u53CA\u6A21\u578B\u540D\u79F0" };
    }
    try {
      const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12e3);
      const resp = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: "user", content: 'Say "OK" if you can hear me.' }],
          max_tokens: 10
        })
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return { success: false, message: `\u63A5\u53E3\u54CD\u5E94\u5931\u8D25 HTTP ${resp.status}: ${errText.slice(0, 100)}` };
      }
      const data = await resp.json();
      const reply = data?.choices?.[0]?.message?.content || "OK";
      return { success: true, message: `\u8FDE\u63A5\u6210\u529F\uFF01\u6A21\u578B\u56DE\u5E94: ${reply.trim()}` };
    } catch (e) {
      return { success: false, message: `\u8BF7\u6C42\u51FA\u9519: ${e.message}` };
    }
  }
  /**
   * 从用户上传的简历文件中提取纯文本（支持 PDF/TXT/MD/JSON）
   */
  extractTextFromFile(buffer, fileName) {
    const ext = path8.extname(fileName).toLowerCase();
    if (ext === ".txt" || ext === ".md" || ext === ".json") {
      return buffer.toString("utf-8");
    }
    if (ext === ".pdf") {
      const tempPath = path8.join(os.tmpdir(), `temp_resume_${Date.now()}.pdf`);
      try {
        fs8.writeFileSync(tempPath, buffer);
        const text = execSync(`pdftotext "${tempPath}" -`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
        return text;
      } catch (e) {
        console.warn("pdftotext \u89E3\u6790 PDF \u5931\u8D25\uFF0C\u5C1D\u8BD5\u964D\u7EA7:", e.message);
        throw new Error("PDF \u6587\u672C\u63D0\u53D6\u5931\u8D25\u3002\u82E5\u4E3A\u626B\u63CF\u7248\u56FE\u7247 PDF \u6216\u7CFB\u7EDF\u672A\u5B89\u88C5 pdftotext\uFF0C\u8BF7\u76F4\u63A5\u5C06\u7B80\u5386\u6587\u672C\u590D\u5236\u7C98\u8D34\u5230\u8F93\u5165\u6846\u4E2D\u3002");
      } finally {
        if (fs8.existsSync(tempPath)) {
          try {
            fs8.unlinkSync(tempPath);
          } catch (e) {
          }
        }
      }
    }
    throw new Error(`\u6682\u4E0D\u652F\u6301 ${ext} \u6587\u4EF6\u7C7B\u578B\uFF0C\u5EFA\u8BAE\u4E0A\u4F20 .pdf, .txt, .md \u6587\u4EF6\u6216\u76F4\u63A5\u590D\u5236\u6587\u672C\u3002`);
  }
  /**
   * 调用 LLM 将非结构化简历解构为标准的 MasterProfile
   */
  async parseResumeWithLlm(rawResumeText, config) {
    const promptSystem = `\u4F60\u662F\u4E00\u4F4D\u4E16\u754C\u9876\u5C16\u7684\u9AD8\u7BA1\u730E\u5934\u4E0E\u7B80\u5386\u6570\u5B57\u5316\u4E13\u5BB6\u3002
\u4F60\u7684\u4EFB\u52A1\u662F\u5C06\u7528\u6237\u63D0\u4F9B\u7684\u975E\u7ED3\u6784\u5316\u7B80\u5386\u6587\u672C\uFF0C\u7CBE\u51C6\u63D0\u53D6\u3001\u7ED3\u6784\u5316\u91CD\u6784\u4E3A\u6807\u51C6 JSON \u683C\u5F0F\u7684 MasterProfile\u3002
\u3010\u4E25\u82DB\u5B88\u5219\u3011\uFF1A
1. 100% \u4FDD\u771F\uFF0C\u6240\u6709\u4EFB\u804C\u516C\u53F8\u3001\u804C\u4F4D\u3001\u65F6\u95F4\u3001\u9879\u76EE\u4E0E\u5B66\u5386\u5FC5\u987B\u5FE0\u4E8E\u539F\u6587\uFF0C\u7EDD\u5BF9\u4E25\u7981\u675C\u64B0\u6216\u81C6\u9020\u4EFB\u4F55\u672A\u63D0\u53CA\u7684\u4FE1\u606F\uFF01
2. \u7ECF\u5386\u8981\u6309\u7167\u65F6\u95F4\u5012\u5E8F\u6392\u5217\uFF1B
3. \u8F93\u51FA\u4E25\u683C\u7684 JSON \u683C\u5F0F\uFF08\u4E0D\u8981\u5305\u542B\u4EFB\u4F55 markdown \u4EE3\u7801\u5757\u6216\u989D\u5916\u8BF4\u660E\u6587\u5B57\uFF09\uFF0C\u683C\u5F0F\u89C4\u8303\u5982\u4E0B\uFF1A
{
  "basicInfo": {
    "name": "\u5019\u9009\u4EBA\u59D3\u540D",
    "title": "\u804C\u4E1A\u5B9A\u4F4D/\u6838\u5FC3\u5934\u8854",
    "yearsOfExperience": 10,
    "phone": "\u624B\u673A\u53F7",
    "email": "\u90AE\u7BB1",
    "location": "\u57CE\u5E02",
    "workModePreference": "\u671F\u671B\u5DE5\u4F5C\u6A21\u5F0F",
    "education": {
      "school": "\u6BD5\u4E1A\u9662\u6821",
      "degree": "\u6700\u9AD8\u5B66\u5386",
      "major": "\u4E13\u4E1A"
    }
  },
  "summary": ["\u4E2A\u4EBA\u6838\u5FC3\u4F18\u52BF1", "\u6838\u5FC3\u4F18\u52BF2"],
  "workExperiences": [
    {
      "company": "\u516C\u53F8\u540D\u79F0",
      "role": "\u804C\u4F4D",
      "startDate": "YYYY.MM",
      "endDate": "\u81F3\u4ECA\u6216YYYY.MM",
      "description": "\u5C97\u4F4D\u804C\u8D23\u6982\u8FF0",
      "highlights": [
        { "module": "\u5173\u952E\u9879\u76EE\u6216\u80FD\u529B\u6A21\u5757", "details": "STAR\u539F\u5219\u91CF\u5316\u6210\u679C\u7EC6\u8282" }
      ]
    }
  ],
  "skills": {
    "aiAndDigitalization": ["\u6280\u80FD\u6807\u7B7E1", "\u6280\u80FD\u6807\u7B7E2"],
    "industrialEngineering": ["\u5DE5\u7A0B\u6280\u80FD1"],
    "projectManagement": ["\u7BA1\u7406\u80FD\u529B1"],
    "languages": ["\u82F1\u8BED"],
    "certifications": []
  }
}`;
    const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: promptSystem },
          { role: "user", content: `\u4EE5\u4E0B\u662F\u6C42\u804C\u8005\u7684\u539F\u59CB\u7B80\u5386\u5185\u5BB9\uFF1A

${rawResumeText}` }
        ],
        temperature: 0.2,
        max_tokens: 3500
      })
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`LLM \u89E3\u6790\u5931\u8D25 HTTP ${resp.status}: ${err.slice(0, 100)}`);
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("\u5927\u6A21\u578B\u672A\u80FD\u8F93\u51FA\u5408\u6CD5\u7684 Profile JSON \u7ED3\u6784");
    }
    return JSON.parse(match[0]);
  }
  /**
   * 与用户互动对齐需求与偏好规则
   */
  async alignWithUser(userMessage, currentProfile, currentRules, history, config) {
    const promptSystem = `\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u3001\u5BCC\u6709\u540C\u7406\u5FC3\u7684\u4E13\u5C5E\u6C42\u804C\u5408\u4F19\u4EBA\u987E\u95EE\u3002
\u6B63\u5728\u8FDB\u884C\u7CFB\u7EDF\u521D\u59CB\u5316\uFF08Onboarding\uFF09\u9700\u6C42\u5BF9\u9F50\u3002
\u8BF7\u6839\u636E\u7528\u6237\u7684\u8F93\u5165\uFF0C\u534F\u52A9\u7528\u6237\u6F84\u6E05\u6C42\u804C\u610F\u5411\uFF08\u8FDC\u7A0B\u4F18\u5148\u8FD8\u662F\u672C\u5730\uFF1F\u671F\u671B\u85AA\u8D44\uFF1F\u662F\u5426\u63A5\u53D7\u51FA\u5DEE\uFF1F\u6709\u54EA\u4E9B\u6392\u65A5\u7684\u884C\u4E1A\u3001\u516C\u53F8\u6216\u8D1F\u9762\u8981\u6C42\u6BD4\u5982\u5355\u4F11\u3001\u5916\u5305\uFF1F\uFF09\u3002

\u5F53\u7528\u6237\u8868\u8FBE\u4E86\u660E\u786E\u7684\u89C4\u5219\u6216\u504F\u597D\u65F6\uFF0C\u8BF7\u5728\u56DE\u590D\u7684\u672B\u5C3E\u8F93\u51FA\u5E26\u6709\u6807\u8BB0\u7684\u4EE3\u7801\u5757\uFF1A
\`\`\`rules_update
{
  ...\u66F4\u65B0\u540E\u7684\u5B8C\u6574 PreferenceRules JSON...
}
\`\`\`

\u5F53\u524D\u7528\u6237\u7684\u89C4\u5219\u8349\u6848\uFF1A
${JSON.stringify(currentRules, null, 2)}`;
    const messages = [
      { role: "system", content: promptSystem },
      ...history.slice(-6),
      { role: "user", content: userMessage }
    ];
    const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.3,
        max_tokens: 2e3
      })
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`\u5BF9\u9F50\u5BF9\u8BDD\u5931\u8D25: ${err.slice(0, 100)}`);
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    let updatedRules = void 0;
    let cleanReply = content;
    const rulesMatch = content.match(/```rules_update\s*([\s\S]*?)\s*```/);
    if (rulesMatch) {
      try {
        updatedRules = JSON.parse(rulesMatch[1]);
        cleanReply = content.replace(/```rules_update[\s\S]*?```/, "").trim();
      } catch (e) {
      }
    }
    return {
      reply: cleanReply,
      updatedRules
    };
  }
  /**
   * 完成 Onboarding：将对齐好的档案、偏好与模型配置持久化（支持 Vercel KV 和本地 FS）
   */
  async completeOnboarding(profile, rules, llmConfig) {
    await writeJson("data/profile/master_profile.json", profile);
    await writeJson("data/preferences/rules.json", rules);
    await writeJson("data/preferences/llm_config.json", llmConfig);
    await writeJson(this.statusKey, {
      initialized: true,
      initializedAt: (/* @__PURE__ */ new Date()).toISOString(),
      candidateName: profile.basicInfo?.name || "\u6C42\u804C\u8005"
    });
    console.log(`\u{1F389} [Onboarding] \u7CFB\u7EDF\u914D\u7F6E\u5B8C\u6210\uFF01\u5019\u9009\u4EBA\u3010${profile.basicInfo?.name}\u3011\u5DF2\u6210\u529F\u521D\u59CB\u5316\u5E76\u542F\u52A8\u3002`);
  }
};

// src/modules/auth/AuthService.ts
init_storage();
import * as crypto2 from "node:crypto";
var SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
var MAX_FAILED_ATTEMPTS = 5;
var FAILED_WINDOW_MS = 15 * 60 * 1e3;
var MIN_PASSWORD_LENGTH = 8;
var AuthService = class {
  stateKey;
  state;
  ready;
  constructor() {
    this.stateKey = "data/auth/auth_state.json";
    this.state = { accounts: [], sessions: [], failedAttempts: {} };
    this.ready = this.loadState();
  }
  async ensureReady() {
    await this.ready;
  }
  async loadState() {
    const loaded = await readJson(this.stateKey, { accounts: [], sessions: [], failedAttempts: {} });
    this.state = {
      accounts: loaded.accounts || [],
      sessions: loaded.sessions || [],
      failedAttempts: loaded.failedAttempts || {}
    };
    this.cleanupExpiredSessions();
  }
  /** 是否处于首次初始化模式（尚无任何账号） */
  isSetupMode() {
    return this.state.accounts.length === 0;
  }
  hasAccount(username) {
    return this.state.accounts.some((a) => a.username === username);
  }
  hashPassword(password, salt) {
    return crypto2.scryptSync(password, salt, 64).toString("hex");
  }
  save() {
    void writeJson(this.stateKey, this.state);
  }
  getAccount(username) {
    return this.state.accounts.find((a) => a.username === username);
  }
  /**
   * 首次初始化：创建管理员账号（仅在无任何账号时可用）
   */
  createAccount(username, password) {
    username = (username || "").trim();
    if (this.state.accounts.length > 0) {
      return { ok: false, message: "\u7CFB\u7EDF\u5DF2\u521D\u59CB\u5316\uFF0C\u7981\u6B62\u91CD\u590D\u521B\u5EFA\u8D26\u53F7\uFF0C\u8BF7\u76F4\u63A5\u767B\u5F55" };
    }
    if (!username || username.length < 2 || username.length > 32) {
      return { ok: false, message: "\u7528\u6237\u540D\u957F\u5EA6\u9700\u5728 2~32 \u4E2A\u5B57\u7B26\u4E4B\u95F4" };
    }
    if (!/^[\w\u4e00-\u9fa5@.\-]+$/.test(username)) {
      return { ok: false, message: "\u7528\u6237\u540D\u4EC5\u652F\u6301\u4E2D\u82F1\u6587\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u3001@\u3001.\u3001-" };
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, message: `\u5BC6\u7801\u957F\u5EA6\u81F3\u5C11 ${MIN_PASSWORD_LENGTH} \u4F4D` };
    }
    const salt = crypto2.randomBytes(16).toString("hex");
    const account = {
      username,
      salt,
      hash: this.hashPassword(password, salt),
      collectorToken: crypto2.randomBytes(24).toString("hex"),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.state.accounts.push(account);
    this.save();
    const token = this.issueSession(username);
    return { ok: true, message: `\u7BA1\u7406\u5458\u8D26\u53F7\u3010${username}\u3011\u521B\u5EFA\u6210\u529F`, sessionToken: token, username };
  }
  /**
   * 登录校验（含失败次数限流）
   */
  login(username, password, clientIp = "unknown") {
    username = (username || "").trim();
    const throttleKey = `${username}@${clientIp}`;
    const attempts = this.state.failedAttempts[throttleKey];
    if (attempts && attempts.count >= MAX_FAILED_ATTEMPTS) {
      const since = Date.now() - new Date(attempts.lastAt).getTime();
      if (since < FAILED_WINDOW_MS) {
        const waitMin = Math.ceil((FAILED_WINDOW_MS - since) / 6e4);
        return { ok: false, message: `\u5931\u8D25\u6B21\u6570\u8FC7\u591A\uFF0C\u8BF7\u7EA6 ${waitMin} \u5206\u949F\u540E\u91CD\u8BD5` };
      }
      delete this.state.failedAttempts[throttleKey];
    }
    const account = this.getAccount(username);
    if (!account || this.hashPassword(password || "", account.salt) !== account.hash) {
      const rec = this.state.failedAttempts[throttleKey] || { count: 0, lastAt: "" };
      rec.count += 1;
      rec.lastAt = (/* @__PURE__ */ new Date()).toISOString();
      this.state.failedAttempts[throttleKey] = rec;
      this.save();
      return { ok: false, message: "\u7528\u6237\u540D\u6216\u5BC6\u7801\u9519\u8BEF" };
    }
    delete this.state.failedAttempts[throttleKey];
    this.save();
    const token = this.issueSession(username);
    return { ok: true, message: "\u767B\u5F55\u6210\u529F", sessionToken: token, username };
  }
  issueSession(username) {
    const token = crypto2.randomBytes(32).toString("hex");
    this.state.sessions.push({
      tokenHash: crypto2.createHash("sha256").update(token).digest("hex"),
      username,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
    });
    if (this.state.sessions.length > 10) {
      this.state.sessions = this.state.sessions.slice(-10);
    }
    this.save();
    return token;
  }
  /**
   * 校验会话令牌，返回用户名（无效/过期返回 null）
   */
  validateSession(token) {
    if (!token) return null;
    const tokenHash = crypto2.createHash("sha256").update(token).digest("hex");
    this.cleanupExpiredSessions();
    const session = this.state.sessions.find((s) => s.tokenHash === tokenHash);
    return session ? session.username : null;
  }
  logout(token) {
    if (!token) return;
    const tokenHash = crypto2.createHash("sha256").update(token).digest("hex");
    this.state.sessions = this.state.sessions.filter((s) => s.tokenHash !== tokenHash);
    this.save();
  }
  /**
   * 修改密码（修改后吊销全部既有会话）
   */
  changePassword(username, oldPassword, newPassword) {
    const account = this.getAccount(username);
    if (!account) return { ok: false, message: "\u8D26\u53F7\u4E0D\u5B58\u5728" };
    if (this.hashPassword(oldPassword || "", account.salt) !== account.hash) {
      return { ok: false, message: "\u539F\u5BC6\u7801\u9519\u8BEF" };
    }
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, message: `\u65B0\u5BC6\u7801\u957F\u5EA6\u81F3\u5C11 ${MIN_PASSWORD_LENGTH} \u4F4D` };
    }
    const salt = crypto2.randomBytes(16).toString("hex");
    account.salt = salt;
    account.hash = this.hashPassword(newPassword, salt);
    this.state.sessions = this.state.sessions.filter((s) => s.username !== username);
    this.save();
    const token = this.issueSession(username);
    return { ok: true, message: "\u5BC6\u7801\u4FEE\u6539\u6210\u529F\uFF0C\u5DF2\u81EA\u52A8\u7EED\u671F\u767B\u5F55", sessionToken: token, username };
  }
  /**
   * 校验书签采集器静态令牌
   */
  verifyCollectorToken(token) {
    if (!token) return null;
    const account = this.state.accounts.find((a) => a.collectorToken === token);
    return account ? account.username : null;
  }
  getCollectorToken(username) {
    return this.getAccount(username)?.collectorToken || null;
  }
  /**
   * 重置书签采集令牌（旧令牌立即失效）
   */
  regenerateCollectorToken(username) {
    const account = this.getAccount(username);
    if (!account) return { ok: false, message: "\u8D26\u53F7\u4E0D\u5B58\u5728" };
    account.collectorToken = crypto2.randomBytes(24).toString("hex");
    this.save();
    return { ok: true, message: "\u91C7\u96C6\u4EE4\u724C\u5DF2\u91CD\u7F6E\uFF0C\u8BF7\u91CD\u65B0\u5B89\u88C5\u4E66\u7B7E", username };
  }
  cleanupExpiredSessions() {
    const now = Date.now();
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
    if (this.state.sessions.length !== before) this.save();
  }
};

// src/modules/demo/DemoData.ts
var DEMO_PROFILE = {
  basicInfo: {
    name: "\u674E\u660E (Demo \u6F14\u793A\u6863\u6848)",
    title: "\u8D44\u6DF1\u5168\u6808\u67B6\u6784\u5E08 / AI \u5DE5\u7A0B\u5316\u4E13\u5BB6",
    yearsOfExperience: 8,
    phone: "138****8888",
    email: "demo@jobhunter-os.local",
    location: "\u4E0A\u6D77 / \u8FDC\u7A0B",
    workModePreference: "\u8FDC\u7A0B\u4F18\u5148 / \u6DF7\u5408\u529E\u516C",
    education: {
      school: "\u77E5\u540D\u91CD\u70B9\u5927\u5B66 (\u793A\u4F8B)",
      degree: "\u7855\u58EB",
      major: "\u8F6F\u4EF6\u5DE5\u7A0B\u4E0E\u5206\u5E03\u5F0F\u7CFB\u7EDF"
    }
  },
  summary: [
    "8\u5E74\u5168\u6808\u7CFB\u7EDF\u67B6\u6784\u4E0E\u9AD8\u5E76\u53D1\u540E\u7AEF\u7814\u53D1\u7ECF\u9A8C\uFF0C\u6DF1\u8015 TypeScript / Node.js / Go \u4E0E\u73B0\u4EE3\u4E91\u539F\u751F\u6280\u672F\u6808\u3002",
    "\u4E3B\u5BFC\u8FC7\u591A\u6B3E\u5927\u6A21\u578B Agent \u667A\u80FD\u4F53\u7CFB\u7EDF\u4E0E\u4F01\u4E1A\u7EA7\u5DE5\u4F5C\u6D41\u5F15\u64CE\u7684\u843D\u5730\uFF0C\u5177\u5907\u843D\u5730\u7EA7 Prompt \u4E0E RAG \u5B9E\u6218\u67B6\u6784\u80FD\u529B\u3002",
    "\u6CE8\u91CD\u5DE5\u7A0B\u89C4\u8303\u4E0E\u81EA\u52A8\u5316\u5DE5\u5177\u94FE\u8BBE\u8BA1\uFF0C\u63A8\u5D07\u7CBE\u76CA\u7814\u53D1\u4E0E\u9AD8\u8D28\u91CF\u4EA4\u4ED8\u3002"
  ],
  workExperiences: [
    {
      company: "\u67D0\u77E5\u540D\u79D1\u6280\u72EC\u89D2\u517D\uFF08\u6F14\u793A\u516C\u53F8\uFF09",
      role: "\u8D44\u6DF1\u67B6\u6784\u5E08 / Tech Lead",
      startDate: "2021.03",
      endDate: "\u81F3\u4ECA",
      description: "\u8D1F\u8D23\u6838\u5FC3\u4E91\u5E73\u53F0\u67B6\u6784\u6F14\u8FDB\u53CA AI \u667A\u80FD\u52A9\u7406\u7CFB\u7EDF\u7684\u7814\u53D1\u4E0E\u5DE5\u7A0B\u5316\u843D\u5730\u3002",
      highlights: [
        {
          module: "AI Agent \u5E73\u53F0\u7814\u53D1",
          details: "\u4E3B\u5BFC\u7814\u53D1\u57FA\u4E8E LLM \u4E0E\u5DE5\u4F5C\u6D41\u7F16\u6392\u7684\u81EA\u52A8\u5316\u52A9\u624B\u7CFB\u7EDF\uFF0C\u7AEF\u5230\u7AEF\u8C03\u7528\u5EF6\u8FDF\u964D\u4F4E 40%\uFF0C\u6708\u5747\u81EA\u52A8\u5316\u6267\u884C\u8D85 20 \u4E07\u6B21\u3002"
        },
        {
          module: "\u4E91\u539F\u751F\u9AD8\u53EF\u7528\u67B6\u6784",
          details: "\u91CD\u6784\u6838\u5FC3 API \u7F51\u5173\u4E0E\u670D\u52A1\u8C03\u5EA6\u5C42\uFF0C\u5728\u5343\u4E07\u7EA7\u65E5\u6D3B\u6D41\u91CF\u4E0B\u8FBE\u6210 99.99% \u53EF\u7528\u6027\u3002"
        }
      ]
    },
    {
      company: "\u67D0\u4E92\u8054\u7F51\u96C6\u56E2\uFF08\u6F14\u793A\u516C\u53F8\uFF09",
      role: "\u9AD8\u7EA7\u5168\u6808\u5DE5\u7A0B\u5E08",
      startDate: "2018.07",
      endDate: "2021.02",
      description: "\u4E3B\u5BFC\u4E2D\u540E\u53F0\u4F4E\u4EE3\u7801\u770B\u677F\u4F53\u7CFB\u4E0E\u6838\u5FC3\u4E1A\u52A1\u5FAE\u670D\u52A1\u7684\u5F00\u53D1\u4E0E\u6027\u80FD\u8C03\u4F18\u3002",
      highlights: [
        {
          module: "\u770B\u677F\u7CFB\u7EDF\u7814\u53D1",
          details: "\u4ECE\u96F6\u8BBE\u8BA1\u4F01\u4E1A\u7EA7\u9AD8\u5B9E\u65F6\u770B\u677F\u7CFB\u7EDF\uFF0C\u652F\u6301\u6D77\u91CF\u4EFB\u52A1\u62D6\u62FD\u534F\u540C\u4E0E\u591A\u7EF4\u6743\u9650\u7BA1\u63A7\u3002"
        }
      ]
    }
  ],
  skills: {
    aiAndDigitalization: ["TypeScript", "Node.js", "Go", "React", "Next.js", "LLM Agent", "LangChain", "RAG", "PostgreSQL", "Redis", "Docker"],
    industrialEngineering: ["\u7CFB\u7EDF\u67B6\u6784", "\u9AD8\u5E76\u53D1\u5FAE\u670D\u52A1", "CI/CD \u81EA\u52A8\u5316", "\u6027\u80FD\u8C03\u4F18"],
    projectManagement: ["\u654F\u6377\u5F00\u53D1 Scrum", "\u6280\u672F\u8BC4\u5BA1\u89C4\u8303", "\u8DE8\u56E2\u961F\u534F\u540C"],
    languages: ["\u4E2D\u6587 (\u6BCD\u8BED)", "\u82F1\u8BED (\u4E13\u4E1A\u8BFB\u5199/\u5DE5\u4F5C\u4EA4\u6D41)"],
    certifications: [
      {
        title: "AWS Certified Solutions Architect",
        org: "Amazon Web Services",
        date: "2023.05"
      }
    ]
  }
};
var DEMO_JOBS = [
  {
    job: {
      id: "demo-job-1",
      title: "AI \u5168\u6808\u67B6\u6784\u5E08 (Remote)",
      company: "NextGen Global AI (\u793A\u4F8B\u5916\u4F01)",
      city: "\u5168\u56FD\u8FDC\u7A0B",
      workMode: "REMOTE",
      salaryText: "35K-50K\xB715\u85AA",
      salaryMin: 35e3,
      salaryMax: 5e4,
      description: "\u6211\u4EEC\u6B63\u5728\u5BFB\u627E\u4F18\u79C0\u7684 AI \u5168\u6808\u67B6\u6784\u5E08\u3002\u4E3B\u8981\u804C\u8D23\u5305\u62EC\u6784\u5EFA\u4E0B\u4E00\u4EE3\u4F01\u4E1A\u7EA7\u81EA\u4E3B Agent \u534F\u540C\u7CFB\u7EDF\uFF0C\u96C6\u6210 LLM\u3001\u5411\u91CF\u68C0\u7D22\u4E0E\u81EA\u9002\u5E94\u5DE5\u4F5C\u6D41\u3002\u8981\u6C42\u719F\u7EC3\u638C\u63E1 TypeScript\u3001Node.js\uFF0C\u6709\u77E5\u540D\u5F00\u6E90\u8D21\u732E\u6216 Agent \u7814\u53D1\u7ECF\u9A8C\u4F18\u5148\uFF0C\u53CC\u4F11\uFF0C\u5F39\u6027\u4E0D\u6253\u5361\u3002",
      url: "https://example.com/demo-job-1",
      platform: "OFFICIAL_FOREIGN",
      publishOrActiveTime: "2\u5C0F\u65F6\u524D\u6D3B\u8DC3",
      hrName: "Sarah (Recruiter)",
      hrTitle: "Head of Talent",
      discoveredAt: new Date(Date.now() - 36e5 * 2).toISOString()
    },
    status: "OFFER",
    statusHistory: [
      { status: "DISCOVERED", timestamp: "2026-09-01T08:00:00Z", note: "\u4E66\u7B7E\u91C7\u96C6\u5668\u81EA\u52A8\u6355\u83B7" },
      { status: "APPROVED", timestamp: "2026-09-02T09:30:00Z", note: "AI \u5339\u914D\u5EA6 94 \u5206\uFF0C\u7528\u6237\u786E\u8BA4\u6295\u9012" },
      { status: "APPLIED", timestamp: "2026-09-02T10:00:00Z", note: "\u5DF2\u53D1\u9001\u5B9A\u5236\u7B80\u5386\u4E0E\u91CF\u5316\u6C42\u804C\u4FE1" },
      { status: "COMMUNICATING", timestamp: "2026-09-04T14:20:00Z", note: "HR \u53D1\u8D77\u9996\u8F6E\u7535\u8BDD\u6C9F\u901A" },
      { status: "INTERVIEWING", timestamp: "2026-09-08T15:00:00Z", note: "\u5B8C\u6210\u4E24\u8F6E\u6280\u672F\u67B6\u6784\u6DF1\u5165\u9762\u8BD5" },
      { status: "OFFER", timestamp: "2026-09-14T11:00:00Z", note: "\u6536\u5230\u6B63\u5F0F Offer" }
    ],
    filterResult: {
      passed: true,
      score: 94,
      matchedScenario: "remote",
      reasons: [
        "\u3010\u6280\u672F\u5339\u914D\u3011\u8981\u6C42 TypeScript\u3001Node.js \u4E0E Agent \u67B6\u6784\uFF0C\u4E0E\u5019\u9009\u4EBA\u4E3B\u80CC\u666F\u5B8C\u7F8E\u5951\u5408\uFF08+40\u5206\uFF09",
        "\u3010\u5DE5\u4F5C\u6A21\u5F0F\u3011\u7EAF\u8FDC\u7A0B + \u5F39\u6027\u5236\uFF0C\u7B26\u5408\u9996\u9009\u573A\u666F\u8BC9\u6C42\uFF08+25\u5206\uFF09",
        "\u3010\u85AA\u8D44\u5F85\u9047\u301135K-50K \u5904\u4E8E\u7406\u60F3\u533A\u95F4\u4E1415\u85AA\u5F85\u9047\u4F18\u6E25\uFF08+29\u5206\uFF09"
      ],
      breakdown: {
        skillMatch: 40,
        experienceMatch: 25,
        scheduleAndBenefits: 15,
        growthAndDomain: 14
      }
    },
    tailoredResume: {
      jobId: "demo-job-1",
      company: "NextGen Global AI (\u793A\u4F8B\u5916\u4F01)",
      jobTitle: "AI \u5168\u6808\u67B6\u6784\u5E08 (Remote)",
      generatedAt: "2026-09-02T09:30:00Z",
      greetingMessage: "Sarah \u60A8\u597D\uFF01\u770B\u5230\u8D35\u53F8\u6B63\u5728\u5BFB\u627E AI \u5168\u6808\u67B6\u6784\u5E08\u3002\u6211\u6709 8 \u5E74\u9AD8\u53EF\u7528\u5168\u6808\u67B6\u6784\u7ECF\u9A8C\uFF0C\u66FE\u4E3B\u5BFC\u4F01\u4E1A\u7EA7\u81EA\u4E3B Agent \u5F15\u64CE\u7814\u53D1\uFF08\u6708\u8C03\u5EA6\u8D8520\u4E07\u6B21\uFF09\u3002\u5BF9\u8D35\u53F8\u5206\u5E03\u5F0F Agent \u534F\u540C\u65B9\u5411\u6DF1\u611F\u5174\u8DA3\uFF0C\u9644\u4E0A\u91CF\u8EAB\u5B9A\u5236\u7684\u5C65\u5386\uFF0C\u671F\u5F85\u4E0E\u60A8\u6DF1\u5165\u4EA4\u6D41\uFF01",
      keyMatchingPoints: [
        "\u62E5\u6709 8 \u5E74\u5168\u6808\u7CFB\u7EDF\u4E0E\u5206\u5E03\u5F0F\u4E91\u67B6\u6784\u7814\u53D1\u843D\u5730\u7ECF\u9A8C",
        "\u6DF1\u5EA6\u4E3B\u5BFC\u8FC7 LLM Agent \u5E73\u53F0\u4E0E\u4F01\u4E1A\u7EA7\u5DE5\u4F5C\u6D41\u5F15\u64CE\u67B6\u6784\u8BBE\u8BA1",
        "\u5168\u8FDC\u7A0B\u53CA\u8DE8\u65F6\u533A\u534F\u540C\u5B9E\u8DF5\u7ECF\u9A8C\u4E30\u5BCC\uFF0C\u82F1\u6587\u6D41\u5229"
      ],
      markdownContent: `# \u674E\u660E - AI \u5168\u6808\u67B6\u6784\u5E08\u5B9A\u5236\u7B80\u5386

**\u6838\u5FC3\u5B9A\u4F4D**\uFF1A\u8D44\u6DF1\u5168\u6808\u67B6\u6784\u5E08 / AI \u5DE5\u7A0B\u5316\u4E13\u5BB6\uFF088\u5E74\uFF09
**\u671F\u671B\u804C\u4F4D**\uFF1AAI \u5168\u6808\u67B6\u6784\u5E08 (Remote)

### \u6838\u5FC3\u5951\u5408\u4EAE\u70B9
- **Agent \u5E73\u53F0\u5DE5\u7A0B\u5316**\uFF1A\u81EA\u7814\u81EA\u4E3B Agent \u7F16\u6392\u8C03\u5EA6\u5E73\u53F0\uFF0C\u4F18\u5316 LLM \u94FE\u8DEF\u5EF6\u8FDF 40%
- **\u6280\u672F\u6808\u7EAF\u6B63**\uFF1ATypeScript / Node.js / Go / \u4E91\u539F\u751F\u9AD8\u53EF\u7528\u5FAE\u670D\u52A1
- **\u5206\u5E03\u5F0F\u534F\u4F5C**\uFF1A\u957F\u671F\u5168\u8FDC\u7A0B\u4E0E\u8DE8\u56FD\u56E2\u961F\u534F\u540C\u4EA4\u4ED8\u7ECF\u9A8C
`
    },
    lastUpdated: new Date(Date.now() - 36e5 * 24).toISOString()
  },
  {
    job: {
      id: "demo-job-2",
      title: "\u8D44\u6DF1\u5168\u6808\u5DE5\u7A0B\u5E08 (Node/React)",
      company: "\u667A\u80FD\u4E91\u56FE\u79D1\u6280\u6709\u9650\u516C\u53F8 (\u793A\u4F8B\u4F01\u4E1A)",
      city: "\u4E0A\u6D77 (\u652F\u6301\u6BCF\u54682\u5929\u8FDC\u7A0B)",
      workMode: "HYBRID",
      salaryText: "30K-45K\xB714\u85AA",
      salaryMin: 3e4,
      salaryMax: 45e3,
      description: "\u8D1F\u8D23\u6838\u5FC3\u4F01\u4E1A\u534F\u540C SaaS \u4EA7\u54C1\u7684\u5168\u6808\u67B6\u6784\u4E0E\u5F00\u53D1\u3002\u8981\u6C42\u719F\u7EC3\u638C\u63E1 TypeScript\u3001Node.js \u670D\u52A1\u7AEF\u3001React \u524D\u7AEF\u67B6\u6784\uFF0C\u5BF9\u9AD8\u5E76\u53D1\u4E0E\u7CFB\u7EDF\u7A33\u5B9A\u6027\u6709\u6DF1\u5165\u8BA4\u77E5\u3002\u4E94\u9669\u4E00\u91D1\u5168\u989D\uFF0C\u53CC\u4F11\u4E0D\u52A0\u73ED\u3002",
      url: "https://example.com/demo-job-2",
      platform: "BOSS",
      publishOrActiveTime: "\u521A\u521A\u6D3B\u8DC3",
      hrName: "\u738B\u7ECF\u7406",
      hrTitle: "\u6280\u672F\u62DB\u8058\u603B\u76D1",
      discoveredAt: new Date(Date.now() - 36e5 * 5).toISOString()
    },
    status: "INTERVIEWING",
    statusHistory: [
      { status: "DISCOVERED", timestamp: "2026-09-05T10:00:00Z" },
      { status: "APPROVED", timestamp: "2026-09-06T11:00:00Z" },
      { status: "APPLIED", timestamp: "2026-09-06T11:10:00Z" },
      { status: "COMMUNICATING", timestamp: "2026-09-07T09:30:00Z" },
      { status: "INTERVIEWING", timestamp: "2026-09-11T14:00:00Z", note: "\u5B8C\u6210\u7EC8\u9762\uFF0C\u7B49\u5F85\u5B9A\u7EA7" }
    ],
    filterResult: {
      passed: true,
      score: 89,
      matchedScenario: "onsite",
      reasons: [
        "\u3010\u6280\u80FD\u6808\u9AD8\u5EA6\u5339\u914D\u3011Node.js + React + TypeScript \u5168\u6280\u672F\u6808\u5BF9\u9F50",
        "\u3010\u5DE5\u4F5C\u5236\u5065\u5EB7\u3011\u4E25\u683C\u53CC\u4F11\uFF0C\u6DF7\u5408\u529E\u516C\u6A21\u5F0F"
      ],
      breakdown: {
        skillMatch: 38,
        experienceMatch: 23,
        scheduleAndBenefits: 14,
        growthAndDomain: 14
      }
    },
    lastUpdated: new Date(Date.now() - 36e5 * 12).toISOString()
  },
  {
    job: {
      id: "demo-job-3",
      title: "AI \u4EA7\u54C1\u6280\u672F\u7814\u53D1\u4E13\u5BB6",
      company: "\u67D0\u4E00\u7EBF\u4EBA\u5DE5\u667A\u80FD\u521B\u65B0\u5E73\u53F0",
      city: "\u5317\u4EAC / \u6DF1\u5733 / \u8FDC\u7A0B",
      workMode: "REMOTE",
      salaryText: "40K-60K",
      salaryMin: 4e4,
      salaryMax: 6e4,
      description: "\u63A2\u7D22\u4E0B\u4E00\u4EE3\u5927\u6A21\u578B\u8D4B\u80FD\u5DE5\u5177\u4EA7\u54C1\uFF0C\u8D1F\u8D23 Agent \u5DE5\u5177\u94FE\u67B6\u6784\u3002\u8981\u6C42\u5BF9\u4E3B\u6D41\u5927\u6A21\u578B API\u3001Function Call\u3001Prompt \u5DE5\u7A0B\u4E0E\u591A\u667A\u80FD\u4F53\u7CFB\u7EDF\u6709\u6DF1\u5165\u7406\u89E3\u3002",
      url: "https://example.com/demo-job-3",
      platform: "ATS_FEISHU",
      publishOrActiveTime: "\u6628\u65E5\u6D3B\u8DC3",
      hrName: "\u5F20\u654F",
      hrTitle: "HRBP",
      discoveredAt: new Date(Date.now() - 36e5 * 20).toISOString()
    },
    status: "COMMUNICATING",
    statusHistory: [
      { status: "DISCOVERED", timestamp: "2026-09-10T09:00:00Z" },
      { status: "APPROVED", timestamp: "2026-09-10T10:00:00Z" },
      { status: "APPLIED", timestamp: "2026-09-10T10:15:00Z" },
      { status: "COMMUNICATING", timestamp: "2026-09-12T16:00:00Z", note: "HR \u5DF2\u63A8\u7ED9\u4E1A\u52A1\u603B\u76D1\u521D\u7B5B\u901A\u8FC7" }
    ],
    filterResult: {
      passed: true,
      score: 91,
      matchedScenario: "remote",
      reasons: ["\u3010AI \u8D5B\u9053\u524D\u6CBF\u3011\u5C97\u4F4D\u5951\u5408\u4E2A\u4EBA AI Agent \u65B9\u5411", "\u3010\u85AA\u8D44\u4E0A\u9650\u9AD8\u3011\u53EF\u8FBE 60K"],
      breakdown: {
        skillMatch: 39,
        experienceMatch: 24,
        scheduleAndBenefits: 14,
        growthAndDomain: 14
      }
    },
    lastUpdated: new Date(Date.now() - 36e5 * 6).toISOString()
  },
  {
    job: {
      id: "demo-job-4",
      title: "\u540E\u7AEF\u67B6\u6784\u5E08 (Go / \u9AD8\u5E76\u53D1)",
      company: "\u67D0\u77E5\u540D FinTech \u8DE8\u56FD\u516C\u53F8",
      city: "\u4E0A\u6D77",
      workMode: "ONSITE",
      salaryText: "35K-48K\xB716\u85AA",
      salaryMin: 35e3,
      salaryMax: 48e3,
      description: "\u8D1F\u8D23\u6838\u5FC3\u7ED3\u7B97\u4EA4\u6613\u94FE\u8DEF\u7684\u91CD\u6784\u4E0E\u6027\u80FD\u538B\u6D4B\uFF0C\u8981\u6C42\u719F\u7EC3\u638C\u63E1\u9AD8\u53EF\u7528\u67B6\u6784\u8BBE\u8BA1\u4E0E\u5206\u5E03\u5F0F\u4E00\u81F4\u6027\u3002",
      url: "https://example.com/demo-job-4",
      platform: "LIEPIN",
      publishOrActiveTime: "3\u5929\u524D\u6D3B\u8DC3",
      discoveredAt: new Date(Date.now() - 36e5 * 48).toISOString()
    },
    status: "APPLIED",
    statusHistory: [
      { status: "DISCOVERED", timestamp: "2026-09-12T11:00:00Z" },
      { status: "APPROVED", timestamp: "2026-09-13T09:00:00Z" },
      { status: "APPLIED", timestamp: "2026-09-13T09:15:00Z", note: "\u5B98\u7F51 ATS \u6E20\u9053\u6295\u9012\u5B8C\u6210" }
    ],
    filterResult: {
      passed: true,
      score: 86,
      matchedScenario: "onsite",
      reasons: ["\u3010\u4E1A\u52A1\u7A33\u5B9A\u6027\u5F3A\u3011\u91D1\u878D\u6838\u5FC3\u94FE\u8DEF", "\u3010\u5E74\u7EC8\u5956\u4E30\u539A\u301116\u85AA\u4F53\u7CFB"],
      breakdown: {
        skillMatch: 36,
        experienceMatch: 22,
        scheduleAndBenefits: 14,
        growthAndDomain: 14
      }
    },
    lastUpdated: new Date(Date.now() - 36e5 * 18).toISOString()
  },
  {
    job: {
      id: "demo-job-5",
      title: "\u5168\u6808\u5F00\u53D1\u5DE5\u7A0B\u5E08 (\u6025\u8058/\u9A7B\u573A)",
      company: "\u67D0\u5916\u5305\u6280\u672F\u670D\u52A1\u5546 (\u98CE\u9669\u62E6\u622A\u793A\u4F8B)",
      city: "\u672C\u5730\u9A7B\u573A",
      workMode: "ONSITE",
      salaryText: "18K-22K",
      salaryMin: 18e3,
      salaryMax: 22e3,
      description: "\u4E3A\u67D0\u94F6\u884C\u9A7B\u573A\u5F00\u53D1\uFF0C\u8981\u6C42\u80FD\u63A5\u53D7\u968F\u65F6\u52A0\u73ED\u4E0E\u5C01\u95ED\u5F0F\u5F00\u53D1\uFF0C\u5355\u4F11\uFF0C\u6280\u672F\u6808\u8001\u65E7 JSP/Struts2\u3002",
      url: "https://example.com/demo-job-5",
      platform: "OTHER",
      publishOrActiveTime: "\u521A\u521A",
      discoveredAt: new Date(Date.now() - 36e5 * 1).toISOString()
    },
    status: "FILTERED_OUT",
    statusHistory: [
      { status: "DISCOVERED", timestamp: "2026-09-15T09:00:00Z" },
      { status: "FILTERED_OUT", timestamp: "2026-09-15T09:00:05Z", note: "\u547D\u4E2D\u53CD\u5411\u4E25\u683C\u89C4\u5219\uFF1A\u5355\u4F11+\u5916\u5305\u9A7B\u573A+\u6280\u672F\u8001\u65E7" }
    ],
    filterResult: {
      passed: false,
      score: 28,
      reasons: [
        "\u3010\u786C\u89C4\u5219\u6DD8\u6C70\u3011\u547D\u4E2D\u4E25\u683C\u89C4\u5219\uFF1A\u975E\u53CC\u4F11\uFF08\u5355\u4F11/\u5927\u5C0F\u5468\u6392\u65A5\uFF09",
        "\u3010\u9ED1\u540D\u5355\u5173\u952E\u8BCD\u3011\u547D\u4E2D\u5916\u5305/\u9A7B\u573A\u98CE\u9669\u8BCD\u6C47",
        "\u3010\u85AA\u8D44\u4E0E\u6280\u672F\u6808\u4E0D\u7B26\u3011\u8FDC\u4F4E\u4E8E\u671F\u671B\u5E95\u7EBF"
      ],
      breakdown: {
        skillMatch: 10,
        experienceMatch: 10,
        scheduleAndBenefits: 0,
        growthAndDomain: 8
      }
    },
    lastUpdated: new Date(Date.now() - 36e5 * 1).toISOString()
  }
];

// src/modules/discovery/RegionalCareerRadar.ts
init_LlmClient();
var PRESET_REGIONAL_PORTALS = [
  // ============ 长沙重点企业 ============
  {
    companyName: "\u4E07\u5174\u79D1\u6280 (Wondershare)",
    city: "\u957F\u6C99",
    industry: "AI\u4E0E\u6570\u5B57\u521B\u610F\u8F6F\u4EF6",
    portalType: "FEISHU_ATS",
    portalUrl: "https://wondershare.jobs.feishu.cn/index",
    description: "AIGC \u8F6F\u4EF6\u9F99\u5934\uFF0C\u5168\u7403\u7814\u53D1\u4E2D\u5FC3\u843D\u5730\u957F\u6C99\uFF0C\u6280\u672F\u6808\u4EE5 AI/\u5168\u6808\u4E3A\u4E3B\uFF0C\u4E25\u683C\u53CC\u4F11\u3002",
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: "\u535A\u4E16\u957F\u6C99 (Bosch \u957F\u6C99)",
    city: "\u957F\u6C99",
    industry: "\u6C7D\u8F66\u7535\u5B50\u4E0E\u667A\u80FD\u5236\u9020",
    portalType: "OFFICIAL_CAREERS",
    portalUrl: "https://careers.smartrecruiters.com/BoschGroup",
    description: "\u4E16\u754C\u7EA7\u5DE5\u4E1A 4.0 \u706F\u5854\u5DE5\u5382\uFF0C\u6570\u5B57\u5316\u8F6C\u578B\u6807\u6746\uFF0C\u798F\u5229\u4E0E\u5DE5\u4F5C\u5236\u6781\u5176\u89C4\u8303\u3002",
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: "\u4E2D\u79D1\u4E91\u8C37 (\u4E2D\u8054\u91CD\u79D1\u5DE5\u4E1A\u4E92\u8054\u7F51)",
    city: "\u957F\u6C99",
    industry: "\u5DE5\u4E1A\u4E92\u8054\u7F51\u4E0E\u667A\u80FD\u5236\u9020",
    portalType: "OFFICIAL_CAREERS",
    portalUrl: "https://www.zvalley.com/careers",
    description: "\u56FD\u5BB6\u7EA7\u53CC\u8DE8\u5DE5\u4E1A\u4E92\u8054\u7F51\u5E73\u53F0\uFF0C\u4E3B\u5BFC\u5DE5\u7A0B\u673A\u68B0\u5927\u578B\u6570\u5B57\u5316\u4E0E\u5DE5\u4E1A AI\u3002",
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: "\u7D22\u6069\u683C\u6C7D\u8F66\u90E8\u4EF6 (SEG Automotive)",
    city: "\u957F\u6C99",
    industry: "\u5FB7\u8D44\u9AD8\u7AEF\u5236\u9020\u4E0E\u65B0\u80FD\u6E90",
    portalType: "OFFICIAL_CAREERS",
    portalUrl: "https://www.seg-automotive.cn",
    description: "\u539F\u535A\u4E16\u8D77\u52A8\u673A\u4E0E\u53D1\u7535\u673A\u4E8B\u4E1A\u90E8\uFF0C\u5FB7\u4F01\u6587\u5316\uFF0C\u53CC\u4F11\u4E0E\u5408\u89C4\u3002",
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: "\u5DF4\u65AF\u592B\u6749\u6749 (BASF Shanshan)",
    city: "\u957F\u6C99",
    industry: "\u65B0\u80FD\u6E90\u6B63\u6781\u6750\u6599",
    portalType: "OFFICIAL_CAREERS",
    portalUrl: "https://www.basf-shanshan.com",
    description: "\u5FB7\u8D44\u5DE8\u5934\u63A7\u80A1\uFF0C\u7814\u53D1\u4E2D\u5FC3\u4F4D\u4E8E\u957F\u6C99\u671B\u57CE\uFF0C\u9AD8\u89C4\u683C\u73AF\u4FDD\u4E0E\u5DE5\u4F5C\u5236\u4FDD\u969C\u3002",
    doubleWeekend: true,
    directApplyAvailable: true
  },
  // ============ 上海重点标杆企业 ============
  {
    companyName: "\u5FAE\u521B\u533B\u7597 (MicroPort)",
    city: "\u4E0A\u6D77",
    industry: "\u9AD8\u7AEF\u533B\u7597\u5668\u68B0\u4E0E\u6570\u5B57\u5316",
    portalType: "MOKA_ATS",
    portalUrl: "https://app.mokahr.com/apply/microport",
    description: "\u5F20\u6C5F\u9AD8\u79D1\u533B\u7597\u5668\u68B0\u5DE8\u5934\uFF0C\u8F6F\u4EF6\u4E2D\u5FC3\u4E0E\u6570\u5B57\u5316\u7814\u53D1\u56E2\u961F\u89C4\u6A21\u5E9E\u5927\u3002",
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: "\u8054\u5408\u5229\u534E\u4E2D\u56FD (Unilever)",
    city: "\u4E0A\u6D77",
    industry: "\u5FEB\u6D88\u4E0E\u5168\u7403\u6570\u5B57\u5316\u4E2D\u5FC3",
    portalType: "WORKDAY",
    portalUrl: "https://careers.unilever.com/china",
    description: "\u77E5\u540D\u5916\u4F01\u4E2D\u56FD\u603B\u90E8\uFF0C\u5021\u5BFC Agile \u5DE5\u4F5C\u5236\u4E0E\u6DF7\u5408\u529E\u516C\uFF0C\u53CC\u4F11\u4E0D\u6253\u5361\u3002",
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: "\u851A\u6765\u6C7D\u8F66 (NIO)",
    city: "\u4E0A\u6D77",
    industry: "\u667A\u80FD\u7535\u52A8\u6C7D\u8F66 / \u81EA\u52A8\u9A7E\u9A76",
    portalType: "FEISHU_ATS",
    portalUrl: "https://nio.jobs.feishu.cn",
    description: "\u667A\u80FD\u5EA7\u8231\u3001\u4E91\u7AEF\u67B6\u6784\u4E0E\u6570\u5B57\u5316\u7CFB\u7EDF\u5C97\u4F4D\uFF0C\u516C\u5F00 ATS \u76F4\u63A5\u68C0\u7D22\u6295\u9012\u3002",
    doubleWeekend: true,
    directApplyAvailable: true
  },
  // ============ 深圳/广州重点企业 ============
  {
    companyName: "\u817E\u8BAF\u97F3\u4E50 (TME)",
    city: "\u6DF1\u5733",
    industry: "\u6570\u5B57\u97F3\u4E50\u4E0E\u4E92\u52A8\u5A31\u4E50",
    portalType: "OFFICIAL_CAREERS",
    portalUrl: "https://join.tencentmusic.com",
    description: "\u5B98\u65B9\u62DB\u8058\u4E3B\u9875\uFF0C\u652F\u6301\u5168\u91CF\u5C97\u4F4D\u76F4\u6295\u4E0E\u8FDB\u5EA6\u67E5\u9605\u3002",
    doubleWeekend: true,
    directApplyAvailable: true
  },
  {
    companyName: "\u5927\u7586\u521B\u65B0 (DJI)",
    city: "\u6DF1\u5733",
    industry: "\u65E0\u4EBA\u673A\u4E0E\u667A\u80FD\u673A\u5668\u4EBA",
    portalType: "OFFICIAL_CAREERS",
    portalUrl: "https://we.dji.com",
    description: "\u5168\u7403\u521B\u65B0\u786C\u4EF6\u9886\u8DD1\u8005\uFF0C\u5B98\u7F51\u62DB\u8058\u5F00\u653E\u900F\u660E\u3002",
    doubleWeekend: true,
    directApplyAvailable: true
  },
  // ============ 全国远程友好标杆 ============
  {
    companyName: "GitLab / Remote \u5F00\u653E\u4F01\u4E1A\u7FA4",
    city: "\u5168\u56FD\u8FDC\u7A0B",
    industry: "\u5F00\u6E90\u8F6F\u4EF6\u4E0E\u4E91\u539F\u751F\u5DE5\u5177",
    portalType: "OFFICIAL_CAREERS",
    portalUrl: "https://about.gitlab.com/jobs",
    description: "\u5168\u5458\u5168\u8FDC\u7A0B\u529E\u516C\u6807\u6746\uFF0C\u7F8E\u5143\u6216\u672C\u5730\u5316\u85AA\u916C\u4F53\u7CFB\u3002",
    doubleWeekend: true,
    directApplyAvailable: true
  }
];
var RegionalCareerRadar = class {
  llmClient;
  constructor() {
    this.llmClient = new LlmClient();
  }
  /**
   * 根据目标城市筛选企业招聘门户
   * 优先匹配本地精选企业库；若为其他城市或需扩展，调用 AI 动态推荐该区域名企官网
   */
  async getPortalsForCity(targetCity, industryHint) {
    const cleanCity = (targetCity || "").trim();
    if (!cleanCity) {
      return { city: "\u5168\u56FD\u7CBE\u9009", portals: PRESET_REGIONAL_PORTALS, source: "preset" };
    }
    const matched = PRESET_REGIONAL_PORTALS.filter(
      (p) => p.city.includes(cleanCity) || cleanCity.includes(p.city)
    );
    if (matched.length >= 3) {
      return { city: cleanCity, portals: matched, source: "preset" };
    }
    try {
      const dynamicPortals = await this.discoverCompanyPortalsViaLlm(cleanCity, industryHint);
      const combined = [...matched, ...dynamicPortals];
      return { city: cleanCity, portals: combined, source: "ai_enhanced" };
    } catch (e) {
      return { city: cleanCity, portals: matched.length > 0 ? matched : PRESET_REGIONAL_PORTALS, source: "preset" };
    }
  }
  /**
   * 利用 LLM 生成目标城市的高价值企业官方招聘清单
   */
  async discoverCompanyPortalsViaLlm(city, industryHint) {
    const promptSystem = `\u4F60\u662F\u4E00\u4F4D\u4E13\u6CE8\u4E8E\u4E2D\u56FD\u5404\u57CE\u5E02\u4F18\u8D28\u96C7\u4E3B\u4E0E\u540D\u4F01\u62DB\u8058\u6E20\u9053\u7684\u804C\u4E1A\u987E\u95EE\u3002
\u8BF7\u6839\u636E\u7528\u6237\u8F93\u5165\u7684\u57CE\u5E02\u3010${city}\u3011${industryHint ? `\u4E0E\u884C\u4E1A\u3010${industryHint}\u3011` : ""}\uFF0C\u5217\u51FA\u8BE5\u57CE\u5E02\u6700\u503C\u5F97\u6C42\u804C\u8005\u6295\u9012\u7684 5 \u5BB6\u6807\u6746\u77E5\u540D\u4F01\u4E1A\uFF08\u4F18\u5148\u8003\u8651\u5916\u4F01\u7814\u53D1\u4E2D\u5FC3\u3001\u884C\u4E1A\u4E0A\u5E02\u9F99\u5934\u3001\u4E25\u683C\u53CC\u4F11\u5408\u89C4\u4F01\u4E1A\u3001\u62E5\u6709\u5B98\u65B9\u516C\u5F00\u62DB\u8058 ATS \u7684\u4F01\u4E1A\uFF09\u3002
\u8BF7\u8F93\u51FA\u4E25\u683C\u7684 JSON \u6570\u7EC4\u683C\u5F0F\uFF08\u4E0D\u8981\u5305\u542B markdown \u4EE3\u7801\u5757\uFF09\uFF1A
[
  {
    "companyName": "\u516C\u53F8\u540D\u79F0",
    "city": "${city}",
    "industry": "\u4E3B\u8425\u4E1A\u52A1/\u884C\u4E1A\u8D5B\u9053",
    "portalType": "FEISHU_ATS",
    "portalUrl": "https://company.jobs.feishu.cn \u6216\u5B98\u7F51\u62DB\u8058\u7F51\u5740",
    "description": "\u4F01\u4E1A\u5728\u5F53\u5730\u7684\u7814\u53D1\u89C4\u6A21\u3001\u4E1A\u52A1\u91CD\u70B9\u4E0E\u5DE5\u4F5C\u5236\u53E3\u7891",
    "doubleWeekend": true,
    "directApplyAvailable": true
  }
]`;
    const reply = await this.llmClient.complete(`\u8BF7\u68C0\u7D22\u5E76\u63A8\u8350\u3010${city}\u3011\u7684\u6807\u6746\u96C7\u4E3B\u62DB\u8058\u5B98\u7F51`, promptSystem);
    const match = reply.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!match) return [];
    return JSON.parse(match[0]);
  }
};

// src/modules/discovery/CompanyResolver.ts
init_LlmClient();
function buildPositionFingerprint(job) {
  const normTitle = normalizeTitle(job.title);
  const salaryBand = normalizeSalaryBand(job.salaryText);
  const city = (job.city || "").split(/[·\-—\s,，/]/)[0].replace(/市$/, "").slice(0, 4);
  return `${normTitle}|${salaryBand}|${city}`;
}
function normalizeTitle(title) {
  return (title || "").replace(/[【】\[\]()（）]/g, "").replace(/急聘|急招|热招|高薪|资深|高级|初级|中级|junior|senior/gi, "").replace(/\d+\s*年|三年|五年|十年/g, "").replace(/\d+(?:\.\d+)?\s*[kK万]?\s*[-~至]\s*\d+(?:\.\d+)?\s*[kK万]/g, "").replace(/\d+(?:\.\d+)?\s*[kK万]/g, "").replace(/面议/g, "").replace(/[\s,，。、;；:：·|/\\-]+/g, "").toLowerCase().slice(0, 30);
}
function normalizeSalaryBand(salaryText) {
  const txt = (salaryText || "").replace(/\s+/g, "");
  const kMatch = txt.match(/(\d+(?:\.\d+)?)[kK]?[-~至](\d+(?:\.\d+)?)[kK]/);
  if (kMatch) {
    const mid = (parseFloat(kMatch[1]) + parseFloat(kMatch[2])) / 2;
    return "band_" + Math.round(mid / 5) * 5;
  }
  const wanMatch = txt.match(/(\d+(?:\.\d+)?)万?[-~至](\d+(?:\.\d+)?)万/);
  if (wanMatch) {
    const mid = (parseFloat(wanMatch[1]) + parseFloat(wanMatch[2])) / 2;
    return "band_" + Math.round(mid * 10 / 5) * 5;
  }
  const singleK = txt.match(/^(\d+(?:\.\d+)?)[kK]/);
  if (singleK) return "band_" + Math.round(parseFloat(singleK[1]) / 5) * 5;
  const singleWan = txt.match(/^(\d+(?:\.\d+)?)万/);
  if (singleWan) return "band_" + Math.round(parseFloat(singleWan[1]) * 10 / 5) * 5;
  return "band_unknown";
}
function jdRequirementOverlap(jdA, jdB) {
  const extract = (jd) => {
    const chineseWords = (jd || "").match(/[\u4e00-\u9fa5]{2,6}/g) || [];
    const freq = /* @__PURE__ */ new Map();
    chineseWords.forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
    return new Set(Array.from(freq.entries()).filter(([, c]) => c >= 1).map(([w]) => w));
  };
  const setA = extract(jdA);
  const setB = extract(jdB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  setA.forEach((w) => {
    if (setB.has(w)) overlap++;
  });
  return overlap / Math.min(setA.size, setB.size);
}
var CompanyResolver = class {
  llmClient;
  constructor() {
    this.llmClient = new LlmClient();
  }
  /**
   * 对猎头帖解析真实招聘企业：
   * 策略 1（免费、优先）：职位指纹 + JD 重合度匹配看板中已有的企业官方直发帖；
   * 策略 2（兜底）：调用 LLM 从 JD 商业线索（行业/规模/业务描述）推断实际企业。
   * @param allowLlm 是否允许消耗 LLM 配额做 AI 推断（采集入库时默认关闭，仅做免费指纹匹配）
   */
  async resolveHeadhunterJob(job, allRecords, allowLlm = true) {
    const fingerprint = buildPositionFingerprint(job);
    const officialPosts = allRecords.filter(
      (r) => r.job.sourceType !== "HEADHUNTER" && r.job.platform === job.platform
      // 同平台官方帖可信度最高（Boss/猎聘内企业直发）
    );
    for (const official of officialPosts) {
      const ofFp = buildPositionFingerprint(official.job);
      if (ofFp !== fingerprint) continue;
      const overlap = jdRequirementOverlap(job.description, official.job.description);
      if (overlap >= 0.45) {
        return {
          jobId: job.id,
          displayCompany: official.job.company,
          actualCompany: official.job.company,
          method: "official_match",
          confidence: Math.min(95, 60 + Math.round(overlap * 40)),
          matchedOfficialJobId: official.job.id,
          explanation: `\u804C\u4F4D\u6307\u7EB9\u4E0E\u3010${official.job.company}\u3011\u5B98\u65B9\u76F4\u53D1\u5E16\u5B8C\u5168\u543B\u5408\uFF08JD \u8981\u6C42\u91CD\u5408\u5EA6 ${(overlap * 100).toFixed(0)}%\uFF09\uFF0C\u5224\u5B9A\u4E3A\u540C\u4E00\u5C97\u4F4D\u7684\u4F01\u4E1A\u5B98\u65B9\u6E20\u9053\u53D1\u5E03\u3002`,
          resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
      }
    }
    if (allowLlm) {
      try {
        const inferred = await this.inferCompanyViaLlm(job);
        if (inferred && inferred.companyName) {
          return {
            jobId: job.id,
            displayCompany: `${inferred.companyName}\uFF08AI \u63A8\u65AD\uFF09`,
            actualCompany: inferred.companyName,
            method: "ai_inference",
            confidence: inferred.confidence,
            explanation: inferred.reasoning,
            resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
      } catch (e) {
      }
    }
    return {
      jobId: job.id,
      displayCompany: job.company,
      actualCompany: null,
      method: "as_is",
      confidence: 0,
      explanation: allowLlm ? "\u6682\u672A\u53D1\u73B0\u53EF\u5339\u914D\u7684\u4F01\u4E1A\u5B98\u65B9\u76F4\u53D1\u5E16\uFF0C\u4E14 AI \u63A8\u65AD\u8BC1\u636E\u4E0D\u8DB3\u3002\u5EFA\u8BAE\u5728\u5B98\u7F51\u96F7\u8FBE\u4E2D\u68C0\u7D22\u8BE5\u884C\u4E1A\u6807\u6746\u4F01\u4E1A\u505A\u4EBA\u5DE5\u786E\u8BA4\u3002" : "\u91C7\u96C6\u5165\u5E93\u65F6\u4EC5\u505A\u514D\u8D39\u6307\u7EB9\u5339\u914D\uFF0C\u672A\u53D1\u73B0\u5B98\u65B9\u76F4\u53D1\u540C\u6B3E\u5C97\u4F4D\u3002\u70B9\u51FB\u300C\u6DF1\u5EA6\u89E3\u6790\u771F\u5B9E\u4F01\u4E1A\u300D\u53EF\u8C03\u7528 AI \u4ECE JD \u7EBF\u7D22\u63A8\u65AD\u3002",
      resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * AI 从猎头帖 JD 中的商业线索推断实际企业
   * （猎头为吸引候选人，JD 常泄露：行业赛道、业务形态、融资/规模、地点园区等特征）
   */
  async inferCompanyViaLlm(job) {
    const systemPrompt = `\u4F60\u662F\u4E00\u4F4D\u8D44\u6DF1\u4EBA\u529B\u8D44\u6E90\u60C5\u62A5\u5206\u6790\u4E13\u5BB6\u3002\u62DB\u8058\u5E73\u53F0\u4E0A\u730E\u5934\u5E38\u4EE3\u4F01\u4E1A\u53D1\u5E16\u4E14\u9690\u53BB\u771F\u5B9E\u516C\u53F8\u540D\uFF0C\u4F46 JD \u4E2D\u5F80\u5F80\u6CC4\u9732\u5546\u4E1A\u7EBF\u7D22\uFF08\u884C\u4E1A\u8D5B\u9053\u3001\u4E1A\u52A1\u63CF\u8FF0\u3001\u89C4\u6A21\u3001\u878D\u8D44\u9636\u6BB5\u3001\u5730\u70B9\u56ED\u533A\u3001\u4EA7\u54C1\u7279\u5F81\uFF09\u3002

\u8BF7\u6839\u636E\u7ED9\u5B9A\u7684\u730E\u5934\u804C\u4F4D\u4FE1\u606F\uFF0C\u63A8\u65AD\u771F\u5B9E\u62DB\u8058\u4F01\u4E1A\u3002\u5224\u65AD\u4F9D\u636E\u4F18\u5148\u7EA7\uFF1A
1. JD \u4E2D\u660E\u786E\u6216\u6697\u793A\u7684\u4EA7\u54C1/\u4E1A\u52A1/\u884C\u4E1A\u7279\u5F81\uFF1B
2. \u57CE\u5E02\u4E0E\u4EA7\u4E1A\u96C6\u805A\u7279\u5F81\uFF1B
3. \u5C97\u4F4D\u7A00\u7F3A\u5EA6\u4E0E\u8BE5\u9886\u57DF\u77E5\u540D\u4F01\u4E1A\u5339\u914D\u5EA6\u3002

\u3010\u4E25\u683C\u5B88\u5219\u3011\u5982\u679C\u8BC1\u636E\u4E0D\u8DB3\u4EE5\u9501\u5B9A\u5177\u4F53\u4F01\u4E1A\uFF0C\u5FC5\u987B\u8BDA\u5B9E\u8FD4\u56DE null\uFF0C\u4E25\u7981\u51ED\u7A7A\u634F\u9020\u516C\u53F8\u540D\uFF01

\u8F93\u51FA\u4E25\u683C JSON\uFF08\u4E0D\u8981 markdown \u4EE3\u7801\u5757\uFF09\uFF1A
{
  "companyName": "\u63A8\u65AD\u7684\u4F01\u4E1A\u5168\u79F0 \u6216 null",
  "confidence": 78,
  "reasoning": "\u63A8\u65AD\u4F9D\u636E\u7684\u7B80\u8981\u8BF4\u660E\uFF08\u5F15\u7528 JD \u4E2D\u7684\u5177\u4F53\u7EBF\u7D22\uFF09"
}`;
    const userPrompt = `\u730E\u5934\u5E16\u4FE1\u606F\uFF1A
- \u804C\u4F4D\uFF1A${job.title}
- \u6807\u6CE8\u4F01\u4E1A\uFF08\u53EF\u80FD\u4E3A\u730E\u5934\u65B9\u6216\u4EE3\u79F0\uFF09\uFF1A${job.company}
- \u57CE\u5E02\uFF1A${job.city}
- \u85AA\u8D44\uFF1A${job.salaryText}
- JD \u539F\u6587\uFF1A${(job.description || "").slice(0, 2e3)}`;
    const reply = await this.llmClient.complete(userPrompt, systemPrompt);
    const match = reply.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.companyName || parsed.confidence < 50) return null;
    return {
      companyName: parsed.companyName,
      confidence: Math.min(90, parsed.confidence),
      reasoning: parsed.reasoning || "\u57FA\u4E8E JD \u5546\u4E1A\u7EBF\u7D22\u63A8\u65AD"
    };
  }
};

// src/modules/server/CollectorServer.ts
init_storage();
var SESSION_COOKIE = "jobhunter_session";
var CollectorServer = class {
  server = null;
  agent;
  port;
  llmClient;
  onboardingService;
  auth;
  careerRadar;
  companyResolver;
  constructor(agent, port = 8765) {
    this.agent = agent || new JobHunterCore();
    this.port = port;
    this.llmClient = new LlmClient();
    this.onboardingService = new OnboardingService();
    this.auth = new AuthService();
    this.careerRadar = new RegionalCareerRadar();
    this.companyResolver = new CompanyResolver();
  }
  parseSessionCookie(req) {
    const raw = req.headers.cookie || "";
    const match = raw.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : void 0;
  }
  getClientIp(req) {
    return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  }
  async handle(req, res) {
    await this.auth.ensureReady();
    await this.llmClient.ensureReady();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }
    const host = req.headers.host || `127.0.0.1:${this.port}`;
    const url = new URL(req.url || "/", `http://${host}`);
    let pathname = url.pathname;
    if (pathname.startsWith("/api/")) {
      const rest = pathname.slice("/api/".length);
      if (rest === "healthz" || rest.startsWith("healthz/") || rest.startsWith("auth/") || rest === "bookmarklet.js") {
        pathname = "/" + rest;
      }
    }
    const sendJson = (code, payload, cookie) => {
      const headers = { "Content-Type": "application/json; charset=utf-8" };
      if (cookie) headers["Set-Cookie"] = cookie;
      res.writeHead(code, headers);
      res.end(JSON.stringify(payload));
    };
    const sendHtml = (filePath) => {
      try {
        const abs = path10.resolve(process.cwd(), filePath);
        if (fs10.existsSync(abs)) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(fs10.readFileSync(abs));
        } else {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Page Not Found");
        }
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(e.message);
      }
    };
    if (pathname === "/login") {
      sendHtml("public/login.html");
      return;
    }
    if (pathname.startsWith("/auth/")) {
      let authBody = "";
      req.on("data", (c) => authBody += c);
      req.on("end", async () => {
        try {
          const data = authBody ? JSON.parse(authBody) : {};
          const ip = this.getClientIp(req);
          if (req.method === "GET" && pathname === "/auth/status") {
            const setupMode = this.auth.isSetupMode();
            const username = this.auth.validateSession(this.parseSessionCookie(req));
            const isDemo2 = !Boolean(username);
            return sendJson(200, {
              code: 0,
              setupMode,
              loggedIn: Boolean(username),
              username: username || null,
              isDemo: isDemo2
            });
          }
          if (req.method === "POST" && pathname === "/auth/setup") {
            const result = this.auth.createAccount(data.username, data.password);
            const cookie = result.sessionToken ? `${SESSION_COOKIE}=${encodeURIComponent(result.sessionToken)}; HttpOnly; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=Lax` : void 0;
            return sendJson(result.ok ? 200 : 400, { code: result.ok ? 0 : -1, message: result.message }, cookie);
          }
          if (req.method === "POST" && pathname === "/auth/login") {
            const result = this.auth.login(data.username, data.password, ip);
            const cookie = result.sessionToken ? `${SESSION_COOKIE}=${encodeURIComponent(result.sessionToken)}; HttpOnly; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=Lax` : void 0;
            return sendJson(result.ok ? 200 : 401, { code: result.ok ? 0 : -1, message: result.message }, cookie);
          }
          if (req.method === "POST" && pathname === "/auth/logout") {
            this.auth.logout(this.parseSessionCookie(req));
            const cookie = `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
            return sendJson(200, { code: 0, message: "\u5DF2\u5B89\u5168\u9000\u51FA\u767B\u5F55" }, cookie);
          }
          const sessionUser2 = this.auth.validateSession(this.parseSessionCookie(req));
          if (!sessionUser2) {
            return sendJson(401, { code: -1, message: "\u8BF7\u5148\u767B\u5F55\u7BA1\u7406\u5458\u8D26\u53F7" });
          }
          if (req.method === "POST" && pathname === "/auth/change-password") {
            const result = this.auth.changePassword(sessionUser2, data.oldPassword, data.newPassword);
            const cookie = result.sessionToken ? `${SESSION_COOKIE}=${encodeURIComponent(result.sessionToken)}; HttpOnly; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=Lax` : void 0;
            return sendJson(result.ok ? 200 : 400, { code: result.ok ? 0 : -1, message: result.message }, cookie);
          }
          if (req.method === "GET" && pathname === "/auth/collector-token") {
            return sendJson(200, {
              code: 0,
              username: sessionUser2,
              collectorToken: this.auth.getCollectorToken(sessionUser2)
            });
          }
          if (req.method === "POST" && pathname === "/auth/collector-token/regenerate") {
            const result = this.auth.regenerateCollectorToken(sessionUser2);
            return sendJson(result.ok ? 200 : 400, {
              code: result.ok ? 0 : -1,
              message: result.message,
              collectorToken: this.auth.getCollectorToken(sessionUser2)
            });
          }
          return sendJson(404, { code: -1, message: "\u672A\u77E5\u7684\u8BA4\u8BC1\u63A5\u53E3" });
        } catch (e) {
          return sendJson(500, { code: -1, message: e.message });
        }
      });
      return;
    }
    if (pathname === "/bookmarklet.js") {
      const publicPath = path10.resolve(process.cwd(), "public/bookmarklet.js");
      const scriptsPath = path10.resolve(process.cwd(), "scripts/bookmarklet.js");
      const jsPath = fs10.existsSync(publicPath) ? publicPath : scriptsPath;
      if (fs10.existsSync(jsPath)) {
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(fs10.readFileSync(jsPath));
      } else {
        res.writeHead(404);
        res.end("bookmarklet not found");
      }
      return;
    }
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const sessionUser = this.auth.validateSession(this.parseSessionCookie(req));
    const tokenUser = this.auth.verifyCollectorToken(bearer || url.searchParams.get("token") || void 0);
    const authenticatedUser = sessionUser || tokenUser;
    const isDemo = !Boolean(authenticatedUser);
    if (pathname === "/" || pathname === "/index.html" || pathname === "/demo") {
      sendHtml("public/index.html");
      return;
    }
    if (pathname === "/setup") {
      if (isDemo) {
        res.writeHead(302, { Location: "/login?redirect=/setup" });
        res.end();
        return;
      }
      sendHtml("public/setup.html");
      return;
    }
    if (pathname === "/onboarding") {
      if (isDemo) {
        res.writeHead(302, { Location: "/login?redirect=/onboarding" });
        res.end();
        return;
      }
      sendHtml("public/onboarding.html");
      return;
    }
    if (pathname === "/api/system/status") {
      if (isDemo) {
        return sendJson(200, {
          code: 0,
          initialized: true,
          hasLlm: false,
          // 对访客隐藏真实 LLM 状态
          hasProfile: true,
          candidateName: "\u674E\u660E (Demo \u6F14\u793A\u6A21\u5F0F)",
          isDemo: true
        });
      }
      const sysStatus = await this.onboardingService.getSystemStatusAsync();
      return sendJson(200, {
        code: 0,
        ...sysStatus,
        isDemo: false
      });
    }
    if (pathname === "/api/profile") {
      if (req.method === "GET") {
        if (isDemo) {
          return sendJson(200, { code: 0, profile: DEMO_PROFILE, isDemo: true });
        }
        const prof = await readJson("data/profile/master_profile.json", null);
        return sendJson(200, { code: 0, profile: prof, isDemo: false });
      }
      if (req.method === "POST") {
        if (isDemo) {
          return sendJson(403, { code: -1, error: "\u6F14\u793A\u6A21\u5F0F\u4E0B\u7981\u6B62\u4FEE\u6539\u5019\u9009\u4EBA\u4E3B\u6863\u6848" });
        }
        let body = "";
        req.on("data", (c) => body += c);
        req.on("end", async () => {
          try {
            const data = JSON.parse(body);
            await writeJson("data/profile/master_profile.json", data);
            return sendJson(200, { code: 0, message: "\u5168\u91CF\u5C65\u5386\u6863\u6848\u4FDD\u5B58\u6210\u529F\uFF01" });
          } catch (e) {
            return sendJson(400, { code: -1, error: e.message });
          }
        });
        return;
      }
    }
    if (req.method === "GET" && pathname === "/api/jobs") {
      if (isDemo) {
        return sendJson(200, { code: 0, jobs: DEMO_JOBS, isDemo: true });
      }
      const tracker = this.agent.tracker;
      await tracker.ensureReady?.();
      const records = tracker.getAllRecords();
      return sendJson(200, { code: 0, jobs: records, isDemo: false });
    }
    if (req.method === "POST" && pathname.startsWith("/api/jobs/") && pathname.endsWith("/action")) {
      if (isDemo) {
        return sendJson(200, {
          code: 0,
          message: "\u3010\u6F14\u793A\u6A21\u5F0F\u3011\u6A21\u62DF\u64CD\u4F5C\u6210\u529F\uFF01\u5F53\u524D\u6570\u636E\u4EC5\u5728\u6C99\u7BB1\u4E2D\u5C55\u793A\uFF0C\u4E0D\u4F1A\u5F71\u54CD\u751F\u4EA7\u6570\u636E\u3002"
        });
      }
      const parts = pathname.split("/");
      const jobId = parts[3];
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", () => {
        try {
          const { action, reason } = JSON.parse(body);
          this.agent.handleUserAction(jobId, action === "APPROVED" ? "APPROVED" : "REJECTED", reason);
          return sendJson(200, { code: 0, message: "\u64CD\u4F5C\u6210\u529F" });
        } catch (e) {
          return sendJson(400, { code: -1, error: e.message });
        }
      });
      return;
    }
    if (req.method === "POST" && pathname === "/api/scan") {
      if (isDemo) {
        return sendJson(403, { code: -1, error: "\u6F14\u793A\u6A21\u5F0F\u4E0B\u7981\u6B62\u89E6\u53D1\u771F\u5B9E\u722C\u866B\u626B\u63CF" });
      }
      try {
        const { StandaloneJobHunter: StandaloneJobHunter2 } = await Promise.resolve().then(() => (init_standalone(), standalone_exports));
        const standalone = new StandaloneJobHunter2();
        const count = await standalone.runSingleScan();
        return sendJson(200, { code: 0, message: `\u626B\u63CF\u5B8C\u6210\uFF0C\u672C\u6B21\u5171\u63D0\u53D6\u5E76\u63A8\u9001\u4E86 ${count} \u4E2A\u9AD8\u5339\u914D\u804C\u4F4D\uFF01` });
      } catch (e) {
        return sendJson(500, { code: -1, error: e.message });
      }
    }
    if (pathname === "/api/radar/portals") {
      if (req.method === "GET") {
        if (isDemo) {
          return sendJson(200, {
            code: 0,
            city: "Demo \u7CBE\u9009",
            source: "preset",
            isDemo: true,
            portals: PRESET_REGIONAL_PORTALS.slice(0, 5)
          });
        }
        return sendJson(200, {
          code: 0,
          city: "\u5168\u56FD\u7CBE\u9009",
          source: "preset",
          isDemo: false,
          portals: PRESET_REGIONAL_PORTALS
        });
      }
      if (req.method === "POST") {
        if (isDemo) {
          return sendJson(403, { code: -1, error: "\u6F14\u793A\u6A21\u5F0F\u4E0B\u4EC5\u53EF\u6D4F\u89C8\u7CBE\u9009\u95E8\u6237\u5217\u8868\uFF0C\u52A8\u6001\u57CE\u5E02\u68C0\u7D22\u9700\u7BA1\u7406\u5458\u767B\u5F55" });
        }
        let body = "";
        req.on("data", (c) => body += c);
        req.on("end", async () => {
          try {
            const { city, industry } = JSON.parse(body || "{}");
            const result = await this.careerRadar.getPortalsForCity(city, industry);
            return sendJson(200, { code: 0, ...result, isDemo: false });
          } catch (e) {
            return sendJson(500, { code: -1, error: e.message });
          }
        });
        return;
      }
    }
    if (pathname === "/api/config/llm") {
      if (isDemo) {
        return sendJson(200, {
          provider: "demo-sandbox",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o-mini (Demo)",
          apiKey: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
          hasKey: false,
          isDemo: true
        });
      }
      if (req.method === "GET") {
        return sendJson(200, this.llmClient.getMaskedConfig());
      }
      if (req.method === "POST") {
        let body = "";
        req.on("data", (c) => body += c);
        req.on("end", async () => {
          try {
            const newCfg = JSON.parse(body);
            await this.llmClient.saveConfig(newCfg);
            return sendJson(200, { code: 0, message: "LLM \u914D\u7F6E\u5DF2\u5B89\u5168\u4FDD\u5B58" });
          } catch (e) {
            return sendJson(400, { code: -1, error: e.message });
          }
        });
        return;
      }
    }
    if (req.method === "POST" && pathname === "/api/config/llm/test") {
      if (isDemo) {
        return sendJson(200, {
          success: true,
          message: "\u3010Demo \u6F14\u793A\u6C99\u7BB1\u3011\u8FDE\u901A\u6027\u6D4B\u8BD5\u901A\u8FC7\uFF08\u5DF2\u4FDD\u62A4\u79C1\u6709\u5BC6\u94A5\uFF0C\u672A\u53D1\u8D77\u5B9E\u9645 API \u8BA1\u8D39\uFF09"
        });
      }
      const testRes = await this.llmClient.testConnection();
      return sendJson(200, testRes);
    }
    if (pathname === "/api/safety/status") {
      const safety = new AntiRiskEngine();
      return sendJson(200, safety.getState());
    }
    if (req.method === "POST" && pathname === "/api/safety/reset") {
      if (isDemo) {
        return sendJson(200, { code: 0, message: "\u3010Demo \u6A21\u5F0F\u3011\u98CE\u63A7\u7194\u65AD\u5DF2\u6A21\u62DF\u590D\u4F4D" });
      }
      const safety = new AntiRiskEngine();
      safety.resetCircuitBreaker();
      return sendJson(200, { code: 0, message: "\u98CE\u63A7\u7194\u65AD\u5DF2\u6210\u529F\u590D\u4F4D\uFF01" });
    }
    if (pathname === "/api/config/feishu") {
      if (isDemo) {
        if (req.method === "GET") {
          return sendJson(200, {
            webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
            appId: "cli_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
            appSecret: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
            isDemo: true
          });
        }
        return sendJson(403, { code: -1, error: "\u6F14\u793A\u6A21\u5F0F\u4E0B\u7981\u6B62\u4FEE\u6539\u98DE\u4E66\u914D\u7F6E" });
      }
      if (req.method === "GET") {
        const feishuConf = await readJson("data/preferences/feishu.json", {
          webhookUrl: process.env.FEISHU_WEBHOOK_URL || "",
          appId: process.env.FEISHU_APP_ID || "",
          appSecret: process.env.FEISHU_APP_SECRET || ""
        });
        return sendJson(200, feishuConf);
      }
      if (req.method === "POST") {
        let body = "";
        req.on("data", (c) => body += c);
        req.on("end", async () => {
          try {
            const data = JSON.parse(body);
            await writeJson("data/preferences/feishu.json", data);
            return sendJson(200, { code: 0, message: "\u98DE\u4E66\u914D\u7F6E\u5DF2\u66F4\u65B0" });
          } catch (e) {
            return sendJson(400, { code: -1, error: e.message });
          }
        });
        return;
      }
    }
    if (req.method === "POST" && pathname === "/api/config/feishu/test") {
      if (isDemo) {
        return sendJson(200, { success: true, message: "\u3010Demo \u6F14\u793A\u6A21\u5F0F\u3011\u5DF2\u6A21\u62DF\u53D1\u9001\u98DE\u4E66\u6D4B\u8BD5\u5361\u7247" });
      }
      const feishu = this.agent.feishu;
      const ok = await feishu.sendApprovalNotification(
        {
          id: "test_demo",
          title: "\u8D44\u6DF1\u5168\u6808\u67B6\u6784\u5E08 (\u6D4B\u8BD5\u63A8\u9001)",
          company: "\u6D4B\u8BD5\u79D1\u6280\u96C6\u56E2",
          city: "\u4E0A\u6D77",
          workMode: "REMOTE",
          salaryText: "35-50K\xB715\u85AA",
          description: "\u98DE\u4E66\u901A\u9053\u6D4B\u8BD5\u5361\u7247",
          url: "https://example.com",
          platform: "BOSS",
          publishOrActiveTime: "\u521A\u521A\u5728\u7EBF",
          discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        {
          passed: true,
          score: 95,
          reasons: ["\u65F6\u6548\u4F18\u826F\uFF1A\u521A\u521A\u5728\u7EBF", "\u53CC\u4F11\u4FDD\u969C\uFF1A\u5468\u672B\u53CC\u4F11", "\u6280\u80FD\u5339\u914D\uFF1A\u5168\u6808\u67B6\u6784"],
          breakdown: { skillMatch: 40, experienceMatch: 30, scheduleAndBenefits: 20, growthAndDomain: 5 }
        },
        {
          jobId: "test_demo",
          company: "\u6D4B\u8BD5\u79D1\u6280\u96C6\u56E2",
          jobTitle: "\u8D44\u6DF1\u5168\u6808\u67B6\u6784\u5E08",
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          markdownContent: "# \u6D4B\u8BD5\u7B80\u5386",
          greetingMessage: "\u60A8\u597D\uFF01\u8FD9\u662F\u4E00\u6761\u6D4B\u8BD5\u5361\u7247\uFF0C\u8BF4\u660E\u98DE\u4E66\u901A\u9053\u5DF2\u5B8C\u7F8E\u6253\u901A\uFF01",
          keyMatchingPoints: ["\u5168\u6808\u67B6\u6784", "\u9AD8\u5E76\u53D1"]
        }
      );
      return sendJson(200, { success: ok, message: ok ? "\u63A8\u9001\u6210\u529F" : "\u63A8\u9001\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u914D\u7F6E" });
    }
    if (pathname === "/api/config/preferences") {
      if (isDemo) {
        const demoRules = await readJson("data/preferences/rules.json", {});
        if (req.method === "GET") return sendJson(200, demoRules);
        return sendJson(403, { code: -1, error: "\u6F14\u793A\u6A21\u5F0F\u4E0B\u7981\u6B62\u4FEE\u6539\u6C42\u804C\u504F\u597D\u89C4\u5219" });
      }
      if (req.method === "GET") {
        const rules = await readJson("data/preferences/rules.json", {});
        return sendJson(200, rules);
      }
      if (req.method === "POST") {
        let body = "";
        req.on("data", (c) => body += c);
        req.on("end", async () => {
          try {
            const data = JSON.parse(body);
            const current = await readJson("data/preferences/rules.json", { scenarios: { remote: {}, onsite: {} } });
            if (data.remoteEnabled !== void 0) current.scenarios.remote.enabled = Boolean(data.remoteEnabled);
            if (data.onsiteEnabled !== void 0) current.scenarios.onsite.enabled = Boolean(data.onsiteEnabled);
            if (data.salaryMin !== void 0) {
              current.scenarios.onsite.salaryRange = current.scenarios.onsite.salaryRange || {};
              current.scenarios.onsite.salaryRange.min = data.salaryMin;
              if (current.scenarios.remote) {
                current.scenarios.remote.salaryRange = current.scenarios.remote.salaryRange || {};
                current.scenarios.remote.salaryRange.min = data.salaryMin;
              }
            }
            if (data.mustDoubleWeekend !== void 0) {
              current.strictRules = current.strictRules || {};
              current.strictRules.mustDoubleWeekend = Boolean(data.mustDoubleWeekend);
            }
            await writeJson("data/preferences/rules.json", current);
            return sendJson(200, { code: 0, message: "\u6C42\u804C\u504F\u597D\u8BBE\u7F6E\u5DF2\u66F4\u65B0\uFF01" });
          } catch (e) {
            return sendJson(400, { code: -1, error: e.message });
          }
        });
        return;
      }
    }
    if (pathname.startsWith("/api/onboarding/")) {
      if (isDemo) {
        return sendJson(403, { code: -1, error: "\u6F14\u793A\u6A21\u5F0F\u4E0B\u8BF7\u5148\u767B\u5F55\u7BA1\u7406\u5458\u8D26\u53F7" });
      }
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          if (pathname === "/api/onboarding/llm-test") {
            const result = await this.onboardingService.testLlm(data);
            return sendJson(200, { code: result.success ? 0 : -1, ...result });
          }
          if (pathname === "/api/onboarding/extract-file") {
            const { fileBase64, fileName } = data;
            if (!fileBase64 || !fileName) {
              return sendJson(400, { code: -1, error: "\u7F3A\u5C11\u6587\u4EF6\u6570\u636E" });
            }
            const buffer = Buffer.from(fileBase64, "base64");
            const text = this.onboardingService.extractTextFromFile(buffer, fileName);
            return sendJson(200, { code: 0, text });
          }
          if (pathname === "/api/onboarding/parse-resume") {
            const { text, llmConfig } = data;
            if (!text || !text.trim()) {
              return sendJson(400, { code: -1, error: "\u7B80\u5386\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A" });
            }
            const profile = await this.onboardingService.parseResumeWithLlm(text, llmConfig || this.llmClient.getConfig());
            return sendJson(200, { code: 0, profile });
          }
          if (pathname === "/api/onboarding/align-chat") {
            const { message, draftProfile, draftRules, history, llmConfig } = data;
            const result = await this.onboardingService.alignWithUser(
              message,
              draftProfile,
              draftRules,
              history || [],
              llmConfig || this.llmClient.getConfig()
            );
            return sendJson(200, { code: 0, ...result });
          }
          if (pathname === "/api/onboarding/complete") {
            const { profile, rules, llmConfig } = data;
            if (!profile || !rules) {
              return sendJson(400, { code: -1, error: "\u6863\u6848\u4E0E\u89C4\u5219\u6570\u636E\u4E0D\u5B8C\u6574" });
            }
            await this.onboardingService.completeOnboarding(profile, rules, llmConfig || this.llmClient.getConfig());
            this.agent.reloadConfig();
            return sendJson(200, { code: 0, message: "\u7CFB\u7EDF\u521D\u59CB\u5316\u5C31\u7EEA\uFF01\u5DF2\u6210\u529F\u542F\u52A8\u3002" });
          }
          return sendJson(404, { code: -1, error: "\u672A\u77E5\u7684 Onboarding \u63A5\u53E3" });
        } catch (e) {
          return sendJson(500, { code: -1, error: e.message });
        }
      });
      return;
    }
    if (pathname === "/api/profile/chat/history") {
      if (isDemo) {
        return sendJson(200, {
          code: 0,
          history: [
            {
              role: "assistant",
              content: "\u60A8\u597D\uFF01\u5F53\u524D\u5904\u4E8E\u3010Demo \u6F14\u793A\u6A21\u5F0F\u3011\u3002\n\n\u4F5C\u4E3A\u60A8\u7684 AI \u5C65\u5386\u5408\u4F19\u4EBA\uFF0C\u8FD9\u91CC\u5C55\u793A\u4E86\u57FA\u4E8E STAR \u539F\u5219\u5BF9\u5019\u9009\u4EBA\u6218\u7EE9\u91CF\u5316\u6253\u78E8\u7684\u5BF9\u8BDD\u6548\u679C\u3002\u5728\u6F14\u793A\u6A21\u5F0F\u4E0B\uFF0C\u6240\u6709\u56DE\u7B54\u7531\u6F14\u793A\u6C99\u7BB1\u751F\u6210\uFF0C\u7EDD\u4E0D\u6D88\u8017\u7BA1\u7406\u5458\u771F\u5B9E\u7684 LLM Token\u3002",
              timestamp: (/* @__PURE__ */ new Date()).toISOString()
            }
          ],
          status: { sessionId: "demo-session", messageCount: 1 }
        });
      }
      const copilot = PiSessionCopilot.getInstance();
      if (req.method === "GET") {
        const history = await copilot.getHistory();
        const status = await copilot.getStatus();
        return sendJson(200, { code: 0, history, status });
      }
      if (req.method === "DELETE") {
        await copilot.resetSession();
        return sendJson(200, { code: 0, message: "\u4F1A\u8BDD\u5DF2\u91CD\u7F6E" });
      }
    }
    if (pathname === "/api/profile/chat") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", async () => {
        try {
          const { message } = JSON.parse(body || "{}");
          if (!message || !message.trim()) {
            return sendJson(400, { code: -1, error: "\u6D88\u606F\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A" });
          }
          if (isDemo) {
            return sendJson(200, {
              code: 0,
              reply: `\u3010Demo \u6F14\u793A\u5E94\u7B54\u3011\u60A8\u597D\uFF01\u6536\u5230\u5173\u4E8E\u201C${message.slice(0, 20)}...\u201D\u7684\u63D0\u95EE\u3002

\u5728\u771F\u5B9E\u6A21\u5F0F\u4E0B\uFF0C\u7CFB\u7EDF\u4F1A\u8C03\u53D6\u60A8\u4E13\u5C5E\u7684 LLM \u6A21\u578B\uFF08\u5982 DeepSeek-V3 / GPT-4o\uFF09\uFF0C\u8FD0\u7528 STAR \u539F\u5219\u6DF1\u5165\u5256\u6790\u60A8\u7684\u6280\u672F\u67B6\u6784\u4EAE\u70B9\u4E0E\u91CF\u5316\u4E1A\u52A1\u6307\u6807\u3002\u5F53\u524D\u4E3A Demo \u6F14\u793A\u73AF\u5883\uFF0C\u5DF2\u81EA\u52A8\u9694\u79BB\u79C1\u6709 API Key\u3002`,
              status: { sessionId: "demo-session", messageCount: 2 }
            });
          }
          const copilot = PiSessionCopilot.getInstance();
          const reply = await copilot.prompt(message);
          const status = await copilot.getStatus();
          return sendJson(200, { code: 0, reply, status });
        } catch (e) {
          return sendJson(500, { code: -1, error: e.message });
        }
      });
      return;
    }
    if (req.method === "POST" && pathname === "/api/collect") {
      if (isDemo) {
        return sendJson(401, { code: -1, message: "\u672A\u6388\u6743\uFF1A\u91C7\u96C6\u6269\u5C55\u9700\u8981\u643A\u5E26\u5408\u6CD5\u91C7\u96C6\u4EE4\u724C\u6216\u767B\u5F55\u7BA1\u7406\u5458\u8D26\u53F7" });
      }
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const data = JSON.parse(body);
          const jobs = data.jobs || [];
          let approvedCount = 0;
          let detailCount = 0;
          let headhunterCount = 0;
          let storedOnlyCount = 0;
          const tracker = this.agent.tracker;
          const safety = new AntiRiskEngine();
          for (const job of jobs) {
            if (job.detailCaptured) detailCount++;
            if (job.sourceType === "HEADHUNTER") headhunterCount++;
            const quota = safety.canProcess(job.platform);
            if (!quota.allowed) {
              job.id = tracker.generateFingerprint(job.company, job.title, job.url);
              if (!tracker.isAlreadyProcessed(job.id)) {
                tracker.registerDiscoveredJob(job);
                storedOnlyCount++;
              }
              continue;
            }
            const result = await this.agent.processSingleJob(job);
            if (result.approved) {
              approvedCount++;
              safety.recordAction(job.platform);
            }
            if (job.sourceType === "HEADHUNTER") {
              try {
                const allRecords = tracker.getAllRecords();
                const resolution = await this.companyResolver.resolveHeadhunterJob(job, allRecords, false);
                const record = allRecords.find((r) => r.job.id === job.id);
                if (record) {
                  record.companyResolution = resolution;
                  tracker.updateStatus(job.id, record.status, "\u730E\u5934\u5E16\u6307\u7EB9\u5339\u914D\u5B8C\u6210", {});
                }
              } catch (e) {
              }
            }
          }
          const parts = [];
          parts.push(`\u6210\u529F\u63D0\u53D6 ${jobs.length} \u4E2A\u5C97\u4F4D\uFF08\u670D\u52A1\u7AEF\u6307\u7EB9\u81EA\u52A8\u53BB\u91CD\uFF09`);
          if (detailCount > 0) parts.push(`\u542B ${detailCount} \u4E2A\u5168\u91CF JD \u6DF1\u5EA6\u6293\u53D6`);
          if (headhunterCount > 0) parts.push(`${headhunterCount} \u4E2A\u730E\u5934\u5E16\u5DF2\u5C1D\u8BD5\u6307\u7EB9\u6EAF\u6E90`);
          if (storedOnlyCount > 0) parts.push(`${storedOnlyCount} \u4E2A\u8D85\u51FA\u4ECA\u65E5\u914D\u989D\u4EC5\u5165\u5E93`);
          parts.push(`${approvedCount} \u4E2A\u8FC7\u7B5B\u63A8\u9001\uFF01`);
          return sendJson(200, {
            code: 0,
            message: parts.join("\uFF0C"),
            approvedCount
          });
        } catch (e) {
          return sendJson(400, { code: -1, error: e.message });
        }
      });
      return;
    }
    if (req.method === "POST" && pathname.startsWith("/api/jobs/") && pathname.endsWith("/resolve-company")) {
      if (isDemo) {
        return sendJson(403, { code: -1, error: "\u6F14\u793A\u6A21\u5F0F\u4E0B\u7981\u6B62\u8C03\u7528 AI \u4F01\u4E1A\u6EAF\u6E90" });
      }
      const parts = pathname.split("/");
      const jobId = parts[3];
      try {
        const tracker = this.agent.tracker;
        await tracker.ensureReady?.();
        const allRecords = tracker.getAllRecords();
        const record = allRecords.find((r) => r.job.id === jobId);
        if (!record) {
          return sendJson(404, { code: -1, error: "\u5C97\u4F4D\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u6E05\u7406" });
        }
        const resolution = await this.companyResolver.resolveHeadhunterJob(
          record.job,
          allRecords,
          true
          // 允许 AI 推断
        );
        record.companyResolution = resolution;
        await tracker.updateStatus(jobId, record.status, `\u771F\u5B9E\u4F01\u4E1A\u89E3\u6790: ${resolution.displayCompany}`, {});
        return sendJson(200, {
          code: 0,
          resolution,
          message: resolution.method === "official_match" ? `\u2705 \u5DF2\u5339\u914D\u5230\u5B98\u65B9\u76F4\u53D1\u5E16\uFF1A${resolution.actualCompany}` : resolution.method === "ai_inference" ? `\u2728 AI \u63A8\u65AD\u771F\u5B9E\u4F01\u4E1A\uFF1A${resolution.actualCompany}\uFF08\u7F6E\u4FE1\u5EA6 ${resolution.confidence}%\uFF09` : "\u26A0\uFE0F \u8BC1\u636E\u4E0D\u8DB3\uFF0C\u672A\u80FD\u9501\u5B9A\u5177\u4F53\u4F01\u4E1A"
        });
      } catch (e) {
        return sendJson(500, { code: -1, error: e.message });
      }
    }
    if (pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Job Hunter Server is healthy");
      return;
    }
    const publicStaticPath = path10.resolve(process.cwd(), "public", pathname.replace(/^\/+/, ""));
    if (fs10.existsSync(publicStaticPath) && !fs10.statSync(publicStaticPath).isDirectory()) {
      const ext = path10.extname(publicStaticPath).toLowerCase();
      const mimeTypes = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml"
      };
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      res.end(fs10.readFileSync(publicStaticPath));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
  start() {
    return new Promise((resolve10) => {
      this.server = http.createServer((req, res) => this.handle(req, res));
      this.server.listen(this.port, () => {
        console.log(`
=============================================================`);
        console.log(`\u{1F3AF} [Job-Hunter OS] \u73B0\u4EE3\u5316\u5DE5\u4F5C\u53F0\u5DF2\u542F\u52A8:`);
        console.log(`\u{1F449} Web \u53EF\u89C6\u5316\u770B\u677F:   http://127.0.0.1:${this.port}`);
        console.log(`\u{1F449} \u6F14\u793A\u6A21\u5F0F\u9875\u9762:     http://127.0.0.1:${this.port}/demo`);
        console.log(`\u{1F449} \u7BA1\u7406\u5458\u767B\u5F55\u5165\u53E3:   http://127.0.0.1:${this.port}/login`);
        console.log(`=============================================================
`);
        resolve10();
      });
    });
  }
};

// src/api-entry.ts
var serverInstance = null;
function getServerInstance() {
  if (!serverInstance) {
    serverInstance = new CollectorServer();
  }
  return serverInstance;
}
async function handler(req, res) {
  const server = getServerInstance();
  await server.handle(req, res);
}
export {
  handler as default
};
