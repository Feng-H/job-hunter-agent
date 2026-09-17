import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { MasterProfile, PreferenceRules } from '../../types/index.js';
import { LlmConfig } from '../ai/LlmClient.js';

export interface OnboardingStatus {
  initialized: boolean;
  hasLlm: boolean;
  hasProfile: boolean;
  candidateName: string;
  initializedAt?: string;
}

export class OnboardingService {
  private statusFilePath: string;

  constructor() {
    this.statusFilePath = path.resolve(process.cwd(), 'data/system_status.json');
  }

  /**
   * 获取当前系统初始化状态
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

    let hasLlm = false;
    if (fs.existsSync(llmPath)) {
      try {
        const llm = JSON.parse(fs.readFileSync(llmPath, 'utf-8'));
        if (llm.apiKey && llm.apiKey.trim().length > 5) {
          hasLlm = true;
        }
      } catch (e) {}
    }

    let initialized = false;
    let initializedAt: string | undefined = undefined;
    if (fs.existsSync(this.statusFilePath)) {
      try {
        const status = JSON.parse(fs.readFileSync(this.statusFilePath, 'utf-8'));
        initialized = Boolean(status.initialized);
        initializedAt = status.initializedAt;
      } catch (e) {}
    } else {
      // 若没有显式标记文件，但已经有真实档案和 LLM，也算已就绪
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
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Please respond with: OK' }
          ],
          temperature: 0.1,
          max_tokens: 30
        })
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return { success: false, message: `模型接口返回错误 HTTP ${resp.status}: ${errText.slice(0, 100)}` };
      }

      const data = await resp.json() as any;
      const content = data?.choices?.[0]?.message?.content || '';
      return { success: true, message: `连接成功！模型响应: ${content.trim() || 'OK'}` };
    } catch (e: any) {
      return { success: false, message: `连接失败: ${e.message}` };
    }
  }

  /**
   * 从上传的文件中提取纯文本
   */
  public extractTextFromFile(buffer: Buffer, fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();

    if (ext === '.txt' || ext === '.md' || ext === '.json') {
      return buffer.toString('utf-8');
    }

    if (ext === '.pdf') {
      // 写入临时文件调用 pdftotext
      const tempPath = path.resolve(process.cwd(), `data/temp_resume_${Date.now()}.pdf`);
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
  "summary": [
    "核心优势与专长概括1",
    "核心优势2"
  ],
  "workExperiences": [
    {
      "company": "公司名称",
      "role": "担任职务",
      "startDate": "2021.06",
      "endDate": "至今",
      "description": "主要职责与业务范畴概述",
      "highlights": [
        {
          "module": "重点项目或模块名称",
          "details": "STAR 原则量化成果与技术方案细节"
        }
      ]
    }
  ],
  "skills": {
    "aiAndDigitalization": ["核心专业技能1", "技能2"],
    "industrialEngineering": ["行业工程实践技能1"],
    "projectManagement": ["项目与团队管理能力1"],
    "languages": ["中文 (母语)", "英语 (商务流利)"],
    "certifications": [
      {
        "title": "证书名称",
        "org": "发证机构",
        "date": "获得时间",
        "note": "备注/成绩"
      }
    ]
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
          { role: 'user', content: `以下是我的原始简历内容，请解构成 MasterProfile JSON：\n\n${rawResumeText.slice(0, 10000)}` }
        ],
        temperature: 0.1,
        max_tokens: 3000
      })
    });

    if (!resp.ok) {
      throw new Error(`LLM 解析简历失败 HTTP ${resp.status}`);
    }

    const data = await resp.json() as any;
    const content = data?.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM 未返回合法的 JSON 格式简历');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Onboarding 对齐对话：与用户互动，根据反馈动态调整 Profile 和 Rules
   */
  public async alignWithUser(
    userMessage: string,
    draftProfile: MasterProfile,
    draftRules: PreferenceRules,
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    config: LlmConfig
  ): Promise<{
    reply: string;
    updatedProfile: MasterProfile;
    updatedRules: PreferenceRules;
  }> {
    const promptSystem = `你是由 Pi Coding Agent 驱动的 Job-Hunter OS 专属求职合伙人。
你正在与新用户进行【入职启动前的信息对齐（Onboarding Alignment）】。
你的任务是：
1. 深入倾听用户对当前提取的【个人档案】和【求职偏好规则】的调整诉求；
2. 如果用户提出了修改建议（例如：“改一下我的目标城市”、“期望薪资提高到20K”、“把某某公司加入黑名单”、“补充一段我的专业技能”等），你必须在回答的同时，更新对应的 JSON 数据；
3. 输出严格的格式规范：
在你的文本回复最后，附带一个特定的代码块（如果未变更则保持原样输出）：
\`\`\`state_update
{
  "updatedProfile": { ...更新后的 MasterProfile 全量 JSON... },
  "updatedRules": { ...更新后的 PreferenceRules 全量 JSON... }
}
\`\`\`
回答语气要专业、干练、富有同理心与启发性。`;

    const statePayload = {
      currentDraftProfile: draftProfile,
      currentDraftRules: draftRules
    };

    const messages = [
      { role: 'system', content: promptSystem },
      { role: 'system', content: `【当前草稿状态】:\n${JSON.stringify(statePayload, null, 2)}` },
      ...chatHistory.slice(-4),
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
        max_tokens: 3500
      })
    });

    if (!resp.ok) {
      throw new Error(`LLM 对齐对话请求失败 HTTP ${resp.status}`);
    }

    const data = await resp.json() as any;
    const fullReply = data?.choices?.[0]?.message?.content || '';

    let updatedProfile = draftProfile;
    let updatedRules = draftRules;
    let cleanReply = fullReply;

    const match = fullReply.match(/```state_update([\s\S]*?)```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.updatedProfile) updatedProfile = parsed.updatedProfile;
        if (parsed.updatedRules) updatedRules = parsed.updatedRules;
        cleanReply = fullReply.replace(/```state_update[\s\S]*?```/, '').trim();
      } catch (e) {
        console.warn('解析 state_update 异常:', e);
      }
    }

    return {
      reply: cleanReply,
      updatedProfile,
      updatedRules
    };
  }

  /**
   * 完成 Onboarding：将对齐好的档案、偏好与模型配置固化落盘
   */
  public completeOnboarding(profile: MasterProfile, rules: PreferenceRules, llmConfig: LlmConfig): void {
    const profileDir = path.resolve(process.cwd(), 'data/profile');
    const prefDir = path.resolve(process.cwd(), 'data/preferences');
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
    if (!fs.existsSync(prefDir)) fs.mkdirSync(prefDir, { recursive: true });

    // 1. 落盘个人档案
    const profilePath = path.resolve(profileDir, 'master_profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf-8');

    // 2. 落盘求职偏好
    const rulesPath = path.resolve(prefDir, 'rules.json');
    fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2), 'utf-8');

    // 3. 落盘大模型配置
    const llmPath = path.resolve(prefDir, 'llm_config.json');
    fs.writeFileSync(llmPath, JSON.stringify(llmConfig, null, 2), 'utf-8');

    // 4. 标记系统已初始化
    fs.writeFileSync(this.statusFilePath, JSON.stringify({
      initialized: true,
      initializedAt: new Date().toISOString(),
      candidateName: profile.basicInfo?.name || '求职者'
    }, null, 2), 'utf-8');

    console.log(`🎉 [Onboarding] 系统配置完成！候选人【${profile.basicInfo?.name}】已成功初始化并启动。`);
  }
}
