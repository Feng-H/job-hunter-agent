import * as fs from 'node:fs';
import * as path from 'node:path';
import { JobPost, MasterProfile, FilterResult, TailoredResume } from '../../types/index.js';
import { readJson, writeJson } from '../../storage/index.js';

export interface LlmConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
}

export class LlmClient {
  private configKey: string;
  private config: LlmConfig;
  private ready: Promise<void>;

  constructor(configKey: string = 'data/preferences/llm_config.json') {
    this.configKey = configKey;
    this.config = {
      provider: 'openai_compatible',
      apiKey: process.env.LLM_API_KEY || '',
      baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
      model: process.env.LLM_MODEL || 'deepseek-chat',
      temperature: 0.3
    };
    this.ready = this.loadConfig();
  }

  public async ensureReady(): Promise<void> {
    await this.ready;
  }

  public getConfig(): LlmConfig {
    return { ...this.config };
  }

  /**
   * 获取脱敏后的安全配置（安全展示给管理员页面，敏感密钥打码）
   */
  public getMaskedConfig(): Omit<LlmConfig, 'apiKey'> & { apiKey: string; hasKey: boolean } {
    const rawKey = this.config.apiKey || '';
    let maskedKey = '';
    if (rawKey.length > 8) {
      maskedKey = `${rawKey.slice(0, 4)}••••${rawKey.slice(-4)}`;
    } else if (rawKey.length > 0) {
      maskedKey = '••••••••';
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

  public async saveConfig(newConfig: Partial<LlmConfig>): Promise<void> {
    // 若前端传入的是脱敏的掩码字符且已有原 Key，则不覆盖实际密钥
    if (newConfig.apiKey && newConfig.apiKey.includes('••••') && this.config.apiKey) {
      delete newConfig.apiKey;
    }
    this.config = { ...this.config, ...newConfig };
    await writeJson(this.configKey, this.config);
  }

  /**
   * 测试大模型 API 连通性
   */
  public async testConnection(overrideConfig?: Partial<LlmConfig>): Promise<{ success: boolean; message: string }> {
    const cfg = { ...this.config, ...(overrideConfig || {}) };
    if (!cfg.apiKey) {
      return { success: false, message: 'API Key 为空，请先配置 API Key' };
    }

    try {
      const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

      const resp = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
          max_tokens: 10
        })
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text();
        return { success: false, message: `HTTP ${resp.status}: ${errText.substring(0, 100)}` };
      }

      const data = await resp.json() as any;
      const reply = data?.choices?.[0]?.message?.content || 'OK';
      return { success: true, message: `连接成功！模型响应: ${reply.trim()}` };
    } catch (e: any) {
      return { success: false, message: `请求失败: ${e.message}` };
    }
  }

  /**
   * 标准调用接口
   */
  public async complete(userPrompt: string, systemPrompt: string = 'You are a helpful assistant.'): Promise<string> {
    return this.callChatCompletions(systemPrompt, userPrompt, 1500);
  }

  /**
   * 使用 LLM 对 JD 进行深度语义理解与风险洞察
   */
  public async analyzeJobWithLlm(job: JobPost, profile: MasterProfile): Promise<{
    score: number;
    reasons: string[];
    risks: string[];
    highlightAdvice: string;
  } | null> {
    if (!this.config.apiKey) return null;

    const candidateName = profile.basicInfo?.name || '候选人';
    const years = profile.basicInfo?.yearsOfExperience || 10;
    const title = profile.basicInfo?.title || '资深专家';
    const companies = (profile.workExperiences || []).slice(0, 3).map(e => `${e.company}·${e.role}`).join('、');

    const systemPrompt = `你是一位顶级猎头合伙人与求职顾问。
候选人【${candidateName}】拥有 ${years} 年【${title}】背景（代表经历：${companies || '详见主履历'}）。
请严格评估目标岗位与候选人的匹配度（满分100分）。
请务必识别岗位中的隐性风险（如隐晦单休/大小周、外包画饼、技术老旧、驻场出差等）。
输出严格的 JSON 格式：
{
  "score": 85,
  "reasons": ["匹配理由1", "匹配理由2"],
  "risks": ["潜在风险点1（如无则留空）"],
  "highlightAdvice": "针对本岗位建议在简历中重点突出的能力模块"
}`;

    const userPrompt = `目标企业：${job.company}
目标职位：${job.title}
薪资：${job.salaryText}
工作地点：${job.city}
JD 原文：\n${job.description}`;

    try {
      const respText = await this.callChatCompletions(systemPrompt, userPrompt);
      const jsonMatch = respText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('[LlmClient] LLM 岗位分析降级为内置规则:', e);
    }
    return null;
  }

  /**
   * 使用 LLM 针对具体目标岗位，从全量主档案中进行深度定制化简历重写
   */
  public async rewriteTailoredResumeWithLlm(
    job: JobPost,
    profile: MasterProfile,
    userTweakInstructions?: string
  ): Promise<{ markdown: string; greeting: string; highlights: string[] } | null> {
    if (!this.config.apiKey) return null;

    const systemPrompt = `你是一位资深猎头与履历精修专家。
你的任务是根据给定的【目标岗位 JD】与【候选人全量主履历库】，为候选人量身定制一份极具竞争力、结构严密、量化数据极强的高水准 Markdown 格式简历，并生成一段高质量的 HR 打招呼话术。
要求：
1. 绝对保真，所有公司名称、项目数据与技能细节必须 100% 严格来源于给定的候选人主档案，严禁凭空捏造任何未提及的公司或经历；
2. 依据 JD 的技术栈和业务侧重，重新组织经历排序与项目亮点；
3. 输出严格的 JSON 格式：
{
  "highlights": ["契合亮点1", "契合亮点2", "契合亮点3"],
  "greeting": "一段给HR发出的针对性、礼貌、专业且突出核心战绩的打招呼话术（120字左右）",
  "markdown": "# 候选人姓名 - 针对性简历全文 Markdown"
}`;

    const userPrompt = `【目标企业与岗位】：${job.company} · ${job.title} (${job.salaryText})
【JD 详情】：${job.description}
${userTweakInstructions ? `【用户的额外微调指令】：${userTweakInstructions}` : ''}
【候选人全量主履历】：\n${JSON.stringify(profile, null, 2)}`;

    try {
      const respText = await this.callChatCompletions(systemPrompt, userPrompt, 2500);
      const jsonMatch = respText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('[LlmClient] LLM 简历重写降级为内置模板:', e);
    }
    return null;
  }

  /**
   * 与用户对话协作，智能提取经历增量并更新 Master Profile
   */
  public async chatWithProfileCopilot(
    userMessage: string,
    currentProfile: MasterProfile,
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ reply: string; updatedProfile?: MasterProfile }> {
    const candidateName = currentProfile.basicInfo?.name || '求职者';
    const years = currentProfile.basicInfo?.yearsOfExperience || 10;
    const title = currentProfile.basicInfo?.title || '资深专家';
    const companyList = (currentProfile.workExperiences || []).map(e => e.company).join('、');

    const systemPrompt = `你是一位世界顶级的职业生涯顾问与高管履历主笔专家。
你的任务是通过与候选人【${candidateName}】（${years} 年【${title}】背景，真实就职单位：${companyList || '见主档案'}）进行深入对话，挖掘、量化并完善其全量个人主履历库（Master Profile）。
【严谨性守则】：候选人的经历必须 100% 严格基于其主档案或其亲口确认的内容，绝不允许虚构或杜撰未载明的第三方机构。

规则要求：
1. 请用专业、启发式且充满敬意的语气与候选人交流，善于运用 STAR 原则（背景-任务-行动-量化结果）追问关键工程数据与业务成果；
2. 如果候选人在对话中补充了具体的经历、战绩、技术栈或认证细节，请在回答的最后，输出一个明确的代码块标记：
\`\`\`profile_update
{
  ...更新后完整的 MasterProfile JSON 对象...
}
\`\`\``;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.slice(-8).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage }
    ];

    try {
      const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 40000);

      const resp = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: 0.4,
          max_tokens: 2800
        })
      });
      clearTimeout(timer);

      const data = await resp.json() as any;
      const fullReply = data?.choices?.[0]?.message?.content || '';

      // 检查是否有 profile_update 代码块
      const updateMatch = fullReply.match(/```profile_update\s*([\s\S]*?)\s*```/);
      let updatedProfile: MasterProfile | undefined = undefined;
      let cleanReply = fullReply;

      if (updateMatch) {
        try {
          updatedProfile = JSON.parse(updateMatch[1]);
          cleanReply = fullReply.replace(/```profile_update[\s\S]*?```/, '').trim();
          // 保存更新
          await writeJson('data/profile/master_profile.json', updatedProfile);
        } catch (jsonErr) {
          console.warn('解析履历更新 JSON 异常:', jsonErr);
        }
      }

      return { reply: cleanReply, updatedProfile };
    } catch (e: any) {
      return { reply: `调用大模型对话出错: ${e.message}。请检查模型设置。` };
    }
  }

  public async callChatCompletions(systemPrompt: string, userPrompt: string, maxTokens: number = 1500): Promise<string> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);

    const resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: this.config.temperature ?? 0.3,
        max_tokens: maxTokens
      })
    });
    clearTimeout(timer);

    if (!resp.ok) {
      throw new Error(`LLM 接口返回 HTTP ${resp.status}`);
    }

    const data = await resp.json() as any;
    return data?.choices?.[0]?.message?.content || '';
  }

  private async loadConfig(): Promise<void> {
    // 环境变量为兜底默认值；KV 中保存的配置（向导/设置页写入）优先。
    // 关键规则：KV 配置若缺失 apiKey（空串），回填环境变量——避免「向导存了空 Key」把环境变量配置整个废掉。
    const envDefaults: LlmConfig = {
      provider: 'openai_compatible',
      apiKey: process.env.LLM_API_KEY || '',
      baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
      model: process.env.LLM_MODEL || 'deepseek-chat',
      temperature: 0.3
    };
    const loaded = await readJson<Partial<LlmConfig>>(this.configKey, {});
    this.config = { ...envDefaults, ...loaded };

    if (!this.config.apiKey && envDefaults.apiKey) this.config.apiKey = envDefaults.apiKey;
    if (!this.config.baseUrl) this.config.baseUrl = envDefaults.baseUrl;
    if (!this.config.model) this.config.model = envDefaults.model;
  }
}
