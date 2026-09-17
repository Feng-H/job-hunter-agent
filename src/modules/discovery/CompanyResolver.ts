import { JobPost, TrackedJobRecord, CompanyResolution } from '../../types/index.js';
import { LlmClient } from '../ai/LlmClient.js';

export interface ExtendedJobPost extends JobPost {
  sourceType?: 'HEADHUNTER' | 'COMPANY_DIRECT';
  detailCaptured?: boolean;
  companyMeta?: string;
  hrName?: string;
}

export interface ResolutionResult extends CompanyResolution {
  jobId: string;
  displayCompany: string;            // 看板最终展示的企业归属
}

/**
 * 职位指纹：用于跨渠道关联「猎头帖 ↔ 企业官方直发帖」
 * 同一岗位常被猎头与企业 HR 双渠道发布；标题语义 + 薪资区间 + 城市高度重合时判定为同一职位。
 */
export function buildPositionFingerprint(job: JobPost): string {
  const normTitle = normalizeTitle(job.title);
  const salaryBand = normalizeSalaryBand(job.salaryText);
  // 城市归一：取分隔符前的主城区名（"长沙·岳麓区" -> "长沙"），剔除"市"后缀
  const city = (job.city || '')
    .split(/[·\-—\s,，/]/)[0]
    .replace(/市$/, '')
    .slice(0, 4);
  return `${normTitle}|${salaryBand}|${city}`;
}

/** 标准化职位名：剔除【】、紧急程度词、年限前缀、薪资区间、空格与标点 */
export function normalizeTitle(title: string): string {
  return (title || '')
    .replace(/[【】\[\]()（）]/g, '')
    .replace(/急聘|急招|热招|高薪|资深|高级|初级|中级|junior|senior/gi, '')
    .replace(/\d+\s*年|三年|五年|十年/g, '')
    // 薪资区间统一剔除（兼容 25-50K / 25k-50k / 1.5-3万 / 15K / 2万 等写法）
    .replace(/\d+(?:\.\d+)?\s*[kK万]?\s*[-~至]\s*\d+(?:\.\d+)?\s*[kK万]/g, '')
    .replace(/\d+(?:\.\d+)?\s*[kK万]/g, '')
    .replace(/面议/g, '')
    .replace(/[\s,，。、;；:：·|/\\-]+/g, '')
    .toLowerCase()
    .slice(0, 30);
}

/** 标准化薪资区间：取中值分档（如 25-50K·14薪 / 25k-50k -> band_40，5K 一档） */
export function normalizeSalaryBand(salaryText: string): string {
  const txt = (salaryText || '').replace(/\s+/g, '');
  // 格式1: 25-50K / 25k-50k（末尾统一单位）
  const kMatch = txt.match(/(\d+(?:\.\d+)?)[kK]?[-~至](\d+(?:\.\d+)?)[kK]/);
  if (kMatch) {
    const mid = (parseFloat(kMatch[1]) + parseFloat(kMatch[2])) / 2;
    return 'band_' + (Math.round(mid / 5) * 5);
  }
  // 格式2: 1.5-3万（万元月薪）
  const wanMatch = txt.match(/(\d+(?:\.\d+)?)万?[-~至](\d+(?:\.\d+)?)万/);
  if (wanMatch) {
    const mid = (parseFloat(wanMatch[1]) + parseFloat(wanMatch[2])) / 2;
    return 'band_' + (Math.round(mid * 10 / 5) * 5);
  }
  // 格式3: 单值 15K / 2万
  const singleK = txt.match(/^(\d+(?:\.\d+)?)[kK]/);
  if (singleK) return 'band_' + (Math.round(parseFloat(singleK[1]) / 5) * 5);
  const singleWan = txt.match(/^(\d+(?:\.\d+)?)万/);
  if (singleWan) return 'band_' + (Math.round(parseFloat(singleWan[1]) * 10 / 5) * 5);
  return 'band_unknown';
}

/** JD 关键要求重合度（0-1）：跨帖验证同一岗位的核心证据 */
export function jdRequirementOverlap(jdA: string, jdB: string): number {
  const extract = (jd: string) => {
    const chineseWords = (jd || '').match(/[\u4e00-\u9fa5]{2,6}/g) || [];
    const freq = new Map<string, number>();
    chineseWords.forEach(w => freq.set(w, (freq.get(w) || 0) + 1));
    return new Set(Array.from(freq.entries()).filter(([, c]) => c >= 1).map(([w]) => w));
  };
  const setA = extract(jdA);
  const setB = extract(jdB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  setA.forEach(w => { if (setB.has(w)) overlap++; });
  return overlap / Math.min(setA.size, setB.size);
}

export class CompanyResolver {
  private llmClient: LlmClient;

  constructor() {
    this.llmClient = new LlmClient();
  }

  /**
   * 对猎头帖解析真实招聘企业：
   * 策略 1（免费、优先）：职位指纹 + JD 重合度匹配看板中已有的企业官方直发帖；
   * 策略 2（兜底）：调用 LLM 从 JD 商业线索（行业/规模/业务描述）推断实际企业。
   * @param allowLlm 是否允许消耗 LLM 配额做 AI 推断（采集入库时默认关闭，仅做免费指纹匹配）
   */
  public async resolveHeadhunterJob(
    job: ExtendedJobPost,
    allRecords: TrackedJobRecord[],
    allowLlm: boolean = true
  ): Promise<ResolutionResult> {
    const fingerprint = buildPositionFingerprint(job);

    // ---- 策略 1：与官方直发帖做指纹匹配 ----
    const officialPosts = allRecords.filter(r =>
      (r.job as ExtendedJobPost).sourceType !== 'HEADHUNTER' &&
      r.job.platform === job.platform // 同平台官方帖可信度最高（Boss/猎聘内企业直发）
    );

    for (const official of officialPosts) {
      const ofFp = buildPositionFingerprint(official.job);
      if (ofFp !== fingerprint) continue;

      // 指纹命中后，用 JD 重合度二次验证（防误报）
      const overlap = jdRequirementOverlap(job.description, official.job.description);
      if (overlap >= 0.45) {
        return {
          jobId: job.id,
          displayCompany: official.job.company,
          actualCompany: official.job.company,
          method: 'official_match',
          confidence: Math.min(95, 60 + Math.round(overlap * 40)),
          matchedOfficialJobId: official.job.id,
          explanation: `职位指纹与【${official.job.company}】官方直发帖完全吻合（JD 要求重合度 ${(overlap * 100).toFixed(0)}%），判定为同一岗位的企业官方渠道发布。`,
          resolvedAt: new Date().toISOString()
        };
      }
    }

    // ---- 策略 2：AI 商业线索推断（仅在明确允许时消耗 LLM 配额） ----
    if (allowLlm) {
      try {
        const inferred = await this.inferCompanyViaLlm(job);
        if (inferred && inferred.companyName) {
          return {
            jobId: job.id,
            displayCompany: `${inferred.companyName}（AI 推断）`,
            actualCompany: inferred.companyName,
            method: 'ai_inference',
            confidence: inferred.confidence,
            explanation: inferred.reasoning,
            resolvedAt: new Date().toISOString()
          };
        }
      } catch (e) {
        // LLM 不可用时静默降级
      }
    }

    // ---- 无法解析：按原样展示 ----
    return {
      jobId: job.id,
      displayCompany: job.company,
      actualCompany: null,
      method: 'as_is',
      confidence: 0,
      explanation: allowLlm
        ? '暂未发现可匹配的企业官方直发帖，且 AI 推断证据不足。建议在官网雷达中检索该行业标杆企业做人工确认。'
        : '采集入库时仅做免费指纹匹配，未发现官方直发同款岗位。点击「深度解析真实企业」可调用 AI 从 JD 线索推断。',
      resolvedAt: new Date().toISOString()
    };
  }

  /**
   * AI 从猎头帖 JD 中的商业线索推断实际企业
   * （猎头为吸引候选人，JD 常泄露：行业赛道、业务形态、融资/规模、地点园区等特征）
   */
  private async inferCompanyViaLlm(job: ExtendedJobPost): Promise<{
    companyName: string | null;
    confidence: number;
    reasoning: string;
  } | null> {
    const systemPrompt = `你是一位资深人力资源情报分析专家。招聘平台上猎头常代企业发帖且隐去真实公司名，但 JD 中往往泄露商业线索（行业赛道、业务描述、规模、融资阶段、地点园区、产品特征）。

请根据给定的猎头职位信息，推断真实招聘企业。判断依据优先级：
1. JD 中明确或暗示的产品/业务/行业特征；
2. 城市与产业集聚特征；
3. 岗位稀缺度与该领域知名企业匹配度。

【严格守则】如果证据不足以锁定具体企业，必须诚实返回 null，严禁凭空捏造公司名！

输出严格 JSON（不要 markdown 代码块）：
{
  "companyName": "推断的企业全称 或 null",
  "confidence": 78,
  "reasoning": "推断依据的简要说明（引用 JD 中的具体线索）"
}`;

    const userPrompt = `猎头帖信息：
- 职位：${job.title}
- 标注企业（可能为猎头方或代称）：${job.company}
- 城市：${job.city}
- 薪资：${job.salaryText}
- JD 原文：${(job.description || '').slice(0, 2000)}`;

    const reply = await this.llmClient.complete(userPrompt, systemPrompt);
    const match = reply.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    if (!parsed.companyName || parsed.confidence < 50) return null;
    return {
      companyName: parsed.companyName,
      confidence: Math.min(90, parsed.confidence),
      reasoning: parsed.reasoning || '基于 JD 商业线索推断'
    };
  }
}
