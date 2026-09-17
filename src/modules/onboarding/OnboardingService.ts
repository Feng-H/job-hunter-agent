import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { MasterProfile, PreferenceRules } from '../../types/index.js';
import { LlmConfig } from '../ai/LlmClient.js';
import { readJson, writeJson } from '../../storage/index.js';

export interface OnboardingStatus {
  initialized: boolean;
  hasLlm: boolean;
  hasProfile: boolean;
  candidateName: string;
  initializedAt?: string;
}

export class OnboardingService {
  private statusKey: string;

  constructor() {
    this.statusKey = 'data/system_status.json';
  }

  /**
   * 异步获取系统初始化状态（优先从统一存储层读取）
   */
  public async getSystemStatusAsync(): Promise<OnboardingStatus> {
    const prof = await readJson<MasterProfile | null>('data/profile/master_profile.json', null);
    const llm = await readJson<LlmConfig | null>('data/preferences/llm_config.json', null);
    const status = await readJson<{ initialized?: boolean; initializedAt?: string } | null>(this.statusKey, null);

    let hasProfile = false;
    let candidateName = '未设置';
    if (prof?.basicInfo?.name && prof.basicInfo.name !== '张三') {
      hasProfile = true;
      candidateName = prof.basicInfo.name;
    }

    let hasLlm = false;
    const apiKey = llm?.apiKey || process.env.LLM_API_KEY;
    if (apiKey && apiKey.trim().length > 5) {
      hasLlm = true;
    }

    const initialized = Boolean(status?.initialized) || (hasProfile && hasLlm);
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
  public getSystemStatus(): OnboardingStatus {
    const profilePath = path.resolve(process.cwd(), 'data/profile/master_profile.json');
    const llmPath = path.resolve(process.cwd(), 'data/preferences/llm_config.json');

    let hasProfile = false;
    let candidateName = '未设置';
    if (fs.existsSync(profilePath)) {
      try {
        const prof = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
        if (prof.basicInfo?.name && prof.basicInfo.name !== '张三') {
          hasProfile = true;
          candidateName = prof.basicInfo.name;
        }
      } catch (e) {}
    }

    let hasLlm = Boolean(process.env.LLM_API_KEY && process.env.LLM_API_KEY.length > 5);
    if (!hasLlm && fs.existsSync(llmPath)) {
      try {
        const llm = JSON.parse(fs.readFileSync(llmPath, 'utf-8'));
        if (llm.apiKey && llm.apiKey.trim().length > 5) {
          hasLlm = true;
        }
      } catch (e) {}
    }

    let initialized = false;
    let initializedAt: string | undefined = undefined;
    const absStatus = path.resolve(process.cwd(), this.statusKey);
    if (fs.existsSync(absStatus)) {
      try {
        const status = JSON.parse(fs.readFileSync(absStatus, 'utf-8'));
        initialized = Boolean(status.initialized);
        initializedAt = status.initializedAt;
      } catch (e) {}
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
  public async testLlm(config: LlmConfig): Promise<{ success: boolean; message: string }> {
    if (!config.apiKey || !config.baseUrl || !config.model) {
      return { success: false, message: '请填写完整的 API Key、Base URL 及模型名称' };
    }

    try {
      const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

      const resp = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
          max_tokens: 10
        })
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return { success: false, message: `接口响应失败 HTTP ${resp.status}: ${errText.slice(0, 100)}` };
      }

      const data = await resp.json() as any;
      const reply = data?.choices?.[0]?.message?.content || 'OK';
      return { success: true, message: `连接成功！模型回应: ${reply.trim()}` };
    } catch (e: any) {
      return { success: false, message: `请求出错: ${e.message}` };
    }
  }

  /**
   * 从用户上传的简历文件中提取纯文本（支持 PDF/TXT/MD/JSON）
   */
  public extractTextFromFile(buffer: Buffer, fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();

    if (ext === '.txt' || ext === '.md' || ext === '.json') {
      return buffer.toString('utf-8');
    }

    if (ext === '.pdf') {
      // 写入系统临时目录（兼容 Vercel Serverless /tmp）
      const tempPath = path.join(os.tmpdir(), `temp_resume_${Date.now()}.pdf`);
      try {
        fs.writeFileSync(tempPath, buffer);
        const text = execSync(`pdftotext "${tempPath}" -`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
        return text;
      } catch (e: any) {
        console.warn('pdftotext 解析 PDF 失败，尝试降级:', e.message);
        throw new Error('PDF 文本提取失败。若为扫描版图片 PDF 或系统未安装 pdftotext，请直接将简历文本复制粘贴到输入框中。');
      } finally {
        if (fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch (e) {}
        }
      }
    }

    throw new Error(`暂不支持 ${ext} 文件类型，建议上传 .pdf, .txt, .md 文件或直接复制文本。`);
  }

  /**
   * 调用 LLM 将非结构化简历解构为标准的 MasterProfile
   */
  public async parseResumeWithLlm(rawResumeText: string, config: LlmConfig): Promise<MasterProfile> {
    const promptSystem = `你是一位世界顶尖的高管猎头与简历数字化专家。
你的任务是将用户提供的非结构化简历文本，精准提取、结构化重构为标准 JSON 格式的 MasterProfile。
【严苛守则】：
1. 100% 保真，所有任职公司、职位、时间、项目与学历必须忠于原文，绝对严禁杜撰或臆造任何未提及的信息！
2. 经历要按照时间倒序排列；
3. 输出严格的 JSON 格式（不要包含任何 markdown 代码块或额外说明文字），格式规范如下：
{
  "basicInfo": {
    "name": "候选人姓名",
    "title": "职业定位/核心头衔",
    "yearsOfExperience": 10,
    "phone": "手机号",
    "email": "邮箱",
    "location": "城市",
    "workModePreference": "期望工作模式",
    "education": {
      "school": "毕业院校",
      "degree": "最高学历",
      "major": "专业"
    }
  },
  "summary": ["个人核心优势1", "核心优势2"],
  "workExperiences": [
    {
      "company": "公司名称",
      "role": "职位",
      "startDate": "YYYY.MM",
      "endDate": "至今或YYYY.MM",
      "description": "岗位职责概述",
      "highlights": [
        { "module": "关键项目或能力模块", "details": "STAR原则量化成果细节" }
      ]
    }
  ],
  "skills": {
    "aiAndDigitalization": ["技能标签1", "技能标签2"],
    "industrialEngineering": ["工程技能1"],
    "projectManagement": ["管理能力1"],
    "languages": ["英语"],
    "certifications": []
  }
}`;

    const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: promptSystem },
          { role: 'user', content: `以下是求职者的原始简历内容：\n\n${rawResumeText}` }
        ],
        temperature: 0.2,
        max_tokens: 3500
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`LLM 解析失败 HTTP ${resp.status}: ${err.slice(0, 100)}`);
    }

    const data = await resp.json() as any;
    const content = data?.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('大模型未能输出合法的 Profile JSON 结构');
    }

    return JSON.parse(match[0]) as MasterProfile;
  }

  /**
   * 与用户互动对齐需求与偏好规则
   */
  public async alignWithUser(
    userMessage: string,
    currentProfile: MasterProfile,
    currentRules: PreferenceRules,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    config: LlmConfig
  ): Promise<{ reply: string; updatedProfile?: MasterProfile; updatedRules?: PreferenceRules }> {
    const promptSystem = `你是一位专业、富有同理心的专属求职合伙人顾问。
正在进行系统初始化（Onboarding）需求对齐。
请根据用户的输入，协助用户澄清求职意向（远程优先还是本地？期望薪资？是否接受出差？有哪些排斥的行业、公司或负面要求比如单休、外包？）。

当用户表达了明确的规则或偏好时，请在回复的末尾输出带有标记的代码块：
\`\`\`rules_update
{
  ...更新后的完整 PreferenceRules JSON...
}
\`\`\`

当前用户的规则草案：\n${JSON.stringify(currentRules, null, 2)}`;

    const messages = [
      { role: 'system', content: promptSystem },
      ...history.slice(-6),
      { role: 'user', content: userMessage }
    ];

    const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`对齐对话失败: ${err.slice(0, 100)}`);
    }

    const data = await resp.json() as any;
    const content = data?.choices?.[0]?.message?.content || '';

    let updatedRules: PreferenceRules | undefined = undefined;
    let cleanReply = content;

    const rulesMatch = content.match(/```rules_update\s*([\s\S]*?)\s*```/);
    if (rulesMatch) {
      try {
        updatedRules = JSON.parse(rulesMatch[1]);
        cleanReply = content.replace(/```rules_update[\s\S]*?```/, '').trim();
      } catch (e) {}
    }

    return {
      reply: cleanReply,
      updatedRules
    };
  }

  /**
   * 完成 Onboarding：将对齐好的档案、偏好与模型配置持久化（支持 Vercel KV 和本地 FS）
   */
  public async completeOnboarding(profile: MasterProfile, rules: PreferenceRules, llmConfig: LlmConfig): Promise<void> {
    // 1. 持久化个人档案
    await writeJson('data/profile/master_profile.json', profile);

    // 2. 持久化求职偏好
    await writeJson('data/preferences/rules.json', rules);

    // 3. 持久化大模型配置
    await writeJson('data/preferences/llm_config.json', llmConfig);

    // 4. 标记系统已初始化
    await writeJson(this.statusKey, {
      initialized: true,
      initializedAt: new Date().toISOString(),
      candidateName: profile.basicInfo?.name || '求职者'
    });

    console.log(`🎉 [Onboarding] 系统配置完成！候选人【${profile.basicInfo?.name}】已成功初始化并启动。`);
  }
}
