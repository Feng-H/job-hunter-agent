import path from 'path';
import fs from 'fs';
import { LlmClient } from './LlmClient.js';
import { readJson, writeJson } from '../../storage/index.js';

export interface CopilotChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export class PiSessionCopilot {
  private static instance: PiSessionCopilot | null = null;
  private session: any = null;
  private sessionDir: string;
  private isInitializing: boolean = false;
  private useFallback: boolean = false;
  private fallbackHistory: CopilotChatMessage[] = [];
  private fallbackKey: string = 'data/memory/copilot_sessions/fallback_history.json';
  private llmClient: LlmClient;

  private constructor() {
    this.sessionDir = path.resolve(process.cwd(), 'data/memory/copilot_sessions');
    this.llmClient = new LlmClient();
  }

  public static getInstance(): PiSessionCopilot {
    if (!PiSessionCopilot.instance) {
      PiSessionCopilot.instance = new PiSessionCopilot();
    }
    return PiSessionCopilot.instance;
  }

  private async getOrCreateSession(): Promise<any> {
    if (this.session || this.useFallback) {
      return this.session;
    }

    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      return this.session;
    }

    this.isInitializing = true;
    try {
      if (!fs.existsSync(this.sessionDir)) {
        try { fs.mkdirSync(this.sessionDir, { recursive: true }); } catch {}
      }

      // 尝试动态引入 @earendil-works/pi-coding-agent（仅本地环境安装）
      // 注意：使用变量模块名阻止 esbuild 在 Vercel 构建期静态解析（该包未发布、云端不存在），
      // 运行时解析失败会落入 catch 的 LlmClient 降级分支
      let piPkg: any;
      try {
        const piPkgName = '@earendil-works/pi-coding-agent';
        piPkg = await import(piPkgName);
      } catch (e) {
        // 云端环境或缺少本地依赖时，标记使用 LlmClient 回退引擎
        this.useFallback = true;
        this.fallbackHistory = await readJson<CopilotChatMessage[]>(this.fallbackKey, []);
        return null;
      }

      const { createAgentSession, SessionManager, DefaultResourceLoader, getAgentDir, ModelRuntime } = piPkg;
      const cwd = process.cwd();
      const agentDir = getAgentDir ? getAgentDir() : cwd;

      const profilePath = path.resolve(cwd, 'data/profile/master_profile.json');
      let profileGroundTruth = '';
      let candidateName = '候选人';
      let candidateTitle = '资深专家';
      let validCompanyList = '';

      if (fs.existsSync(profilePath)) {
        try {
          const prof = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
          const basic = prof.basicInfo || {};
          const workExp = (prof.workExperiences || []).map((w: any) => {
            const hls = (w.highlights || []).map((h: any) => `    * 【${h.module}】: ${h.details}`).join('\n');
            return `  - 公司: 【${w.company}】\n    职位: ${w.role} | 起止时间: ${w.startDate} ~ ${w.endDate}\n    概述: ${w.description}\n${hls}`;
          }).join('\n\n');

          const skillsAi = (prof.skills?.aiAndDigitalization || []).join('、');
          const skillsMfg = (prof.skills?.industrialEngineering || []).join('、');
          const certs = (prof.skills?.certifications || []).map((c: any) => `${c.title} (${c.org}, ${c.date})`).join('；');

          candidateName = basic.name || '候选人';
          candidateTitle = basic.title || '资深专家';
          validCompanyList = (prof.workExperiences || []).map((w: any) => `【${w.company}】`).join('、');

          profileGroundTruth = `
====================【${candidateName}真实履历权威事实源（Ground Truth）】====================
【基本信息】
- 姓名: ${candidateName}
- 核心定位: ${candidateTitle}
- 工作年限: ${basic.yearsOfExperience || 10} 年
- 手机: ${basic.phone || '保密'} ｜ 邮箱: ${basic.email || '保密'}
- 所在地: ${basic.location || '全国'}
- 学历背景: ${basic.education?.school || '高等学府'} · ${basic.education?.degree || '本科'} · ${basic.education?.major || '专业'}

【真实职业经历（按时间倒序，这是${candidateName}就职过的全部真实公司，绝无其他）】
${workExp}

【核心技能与专业资质】
- 专业技能: ${skillsAi}
- 行业工程与综合能力: ${skillsMfg}
- 权威资质: ${certs}
=============================================================================`;
        } catch (e) {
          console.error('加载主履历异常:', e);
        }
      }

      const systemPrompt = `你是由 Pi Coding Agent 驱动的${candidateName}专属 AI 履历专家合伙人（Profile Copilot）。
你的职责是帮助${candidateName}打磨、提炼个人履历细节，运用 STAR 原则挖掘具有技术深度、数据量化和业务影响力的成果亮点。

${profileGroundTruth}

【真实性与防幻觉最高红线（Strict Grounding）】
1. **严格事实依从**：关于${candidateName}的个人经历、工作单位、职位、起止时间、项目与学历，必须 100% 严格以权威事实源为准，严禁杜撰或凭空编造！
2. **严禁混淆就职单位**：
   - ${candidateName}所有真实任职过的单位仅限权威事实源中列出的：${validCompanyList || '（暂无记录，请引导候选人补充）'}；
   - 坚决严禁杜撰或捏造任何未在档案中列出的第三方公司、培训机构或职位！
3. **如实回答**：如果${candidateName}或对话问及档案中未载明的信息，请如实告知档案中暂无记录，并引导${candidateName}补充细节，绝不可妄加猜测。
4. **输出规范**：语言精练专业，突出量化成果与技术深度；格式优先使用 Markdown（加粗、清晰列表、小标题）。`;

      const loader = new DefaultResourceLoader({
        cwd,
        agentDir,
        systemPromptOverride: () => systemPrompt,
        appendSystemPromptOverride: () => [],
      });
      await loader.reload();

      const modelRuntime = await ModelRuntime.create();
      const available = await modelRuntime.getAvailable();
      const selectedModel =
        available.find((m: any) => m.id.includes('flash') || m.id.includes('glm-5.3') || m.id.includes('gemini-3')) ||
        available[0];

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
      console.warn('[PiSessionCopilot] 初始化 Pi 引擎回退至标准模式:', err);
      this.useFallback = true;
      this.fallbackHistory = await readJson<CopilotChatMessage[]>(this.fallbackKey, []);
      return null;
    } finally {
      this.isInitializing = false;
    }
  }

  public async prompt(message: string): Promise<string> {
    await this.getOrCreateSession();

    if (this.useFallback || !this.session) {
      // 标准云端轻量模式
      this.fallbackHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
      const promptText = `你是一位专业履历辅导顾问，请协助候选人梳理职业经历与技能成果：\n\n用户提问：${message}`;
      const reply = await this.llmClient.complete(promptText, '你是一位严谨专业的高级职业发展与简历优化专家。');
      this.fallbackHistory.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
      void writeJson(this.fallbackKey, this.fallbackHistory);
      return reply;
    }

    let replyText = '';
    const unsubscribe = this.session.subscribe((event: any) => {
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
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

  public async getHistory(): Promise<CopilotChatMessage[]> {
    await this.getOrCreateSession();

    if (this.useFallback || !this.session) {
      if (this.fallbackHistory.length === 0) {
        this.fallbackHistory = [
          {
            role: 'assistant',
            content: `您好！我是您的专属 AI 履历专家合伙人。\n\n已就绪：\n- 💡 增量对话：支持上下文关联；\n- 🎯 专业润色：基于 STAR 原则提炼技术亮点。\n\n请告诉我您想优化哪一段工作经历？`,
            timestamp: new Date().toISOString()
          }
        ];
      }
      return this.fallbackHistory;
    }

    const result: CopilotChatMessage[] = [];
    if (this.session.messages.length === 0) {
      result.push({
        role: 'assistant',
        content: `您好！我是专属 AI 履历专家合伙人。\n\n请告诉我您想打磨或补充哪一段经历？`,
        timestamp: new Date().toISOString()
      });
      return result;
    }

    for (const msg of this.session.messages) {
      let text = '';
      if (typeof msg.content === 'string') {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        text = msg.content
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join('\n');
      }
      if (text && (msg.role === 'user' || msg.role === 'assistant')) {
        result.push({ role: msg.role, content: text, timestamp: (msg as any).timestamp });
      }
    }
    return result;
  }

  public async compactContext(): Promise<{ success: boolean; message: string }> {
    if (this.useFallback || !this.session) {
      if (this.fallbackHistory.length > 4) {
        this.fallbackHistory = this.fallbackHistory.slice(-4);
        void writeJson(this.fallbackKey, this.fallbackHistory);
      }
      return { success: true, message: '历史记录已修剪精炼' };
    }
    try {
      await this.session.compact('总结关键技能重点与数据事实，压缩上下文并保留关键信息。');
      return { success: true, message: '会话上下文压缩完成' };
    } catch (e: any) {
      return { success: false, message: e.message || '压缩失败' };
    }
  }

  public async resetSession(): Promise<void> {
    if (this.useFallback || !this.session) {
      this.fallbackHistory = [];
      void writeJson(this.fallbackKey, []);
      return;
    }
    try {
      this.session.dispose();
    } catch (e) {}
    this.session = null;
  }

  public async getStatus(): Promise<{ sessionId: string; sessionFile?: string; messageCount: number }> {
    await this.getOrCreateSession();
    if (this.useFallback || !this.session) {
      return {
        sessionId: 'cloud-copilot',
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
}
