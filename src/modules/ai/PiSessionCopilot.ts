import path from 'path';
import fs from 'fs';
import {
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  AgentSession
} from '@earendil-works/pi-coding-agent';

export interface CopilotChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export class PiSessionCopilot {
  private static instance: PiSessionCopilot | null = null;
  private session: AgentSession | null = null;
  private sessionDir: string;
  private isInitializing: boolean = false;

  private constructor() {
    this.sessionDir = path.resolve(process.cwd(), 'data/memory/copilot_sessions');
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  public static getInstance(): PiSessionCopilot {
    if (!PiSessionCopilot.instance) {
      PiSessionCopilot.instance = new PiSessionCopilot();
    }
    return PiSessionCopilot.instance;
  }

  /**
   * 初始化或恢复 Pi AgentSession
   */
  private async getOrCreateSession(): Promise<AgentSession> {
    if (this.session) {
      return this.session;
    }

    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (this.session) return this.session;
    }

    this.isInitializing = true;
    try {
      const cwd = process.cwd();
      const agentDir = getAgentDir();

      // 读取用户权威主档案，作为严格的事实 Ground Truth 上下文注入
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

      // 获取可用模型（优先快速优质模型，如 Flash / GLM / Gemini）
      const modelRuntime = await ModelRuntime.create();
      const available = await modelRuntime.getAvailable();
      const selectedModel =
        available.find(m => m.id.includes('flash') || m.id.includes('glm-5.3') || m.id.includes('gemini-3')) ||
        available[0];

      // 使用 Pi 原生 SessionManager 恢复最近会话或新建
      const sessionManager = SessionManager.continueRecent(cwd, this.sessionDir);

      const { session } = await createAgentSession({
        resourceLoader: loader,
        sessionManager,
        modelRuntime,
        model: selectedModel,
        tools: [] // Copilot 主要用于深度履历交流，无需文件破坏性工具
      });

      this.session = session;
      return session;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * 向 Pi AgentSession 投递增量消息，由 Pi 管理上下文
   */
  public async prompt(message: string): Promise<string> {
    const session = await this.getOrCreateSession();

    let replyText = '';
    const unsubscribe = session.subscribe((event: any) => {
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        replyText += event.assistantMessageEvent.delta;
      }
    });

    try {
      // 原生增量投递，Pi 会自动将此 prompt 追加到 session 历史中，绝不重复重放旧历史
      await session.prompt(message);
      return replyText.trim();
    } finally {
      unsubscribe();
    }
  }

  /**
   * 从 Pi 的 AgentSession 中提取历史对话记录
   */
  public async getHistory(): Promise<CopilotChatMessage[]> {
    const session = await this.getOrCreateSession();
    const result: CopilotChatMessage[] = [];

    // 如果还没有任何消息，给出初始欢迎语
    if (session.messages.length === 0) {
      let candidateName = '您好';
      try {
        const profilePath = path.resolve(process.cwd(), 'data/profile/master_profile.json');
        if (fs.existsSync(profilePath)) {
          const prof = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
          if (prof.basicInfo?.name) candidateName = `您好，${prof.basicInfo.name}`;
        }
      } catch (e) {}

      result.push({
        role: 'assistant',
        content: `${candidateName}！我是以 **Pi** 为底座驱动的 AI 履历专家合伙人。\n\n已成功接入 **Pi 原生会话上下文管理**：\n- 💡 **增量会话**：无需每次重放历史，由 Pi 智能保持多轮记忆；\n- 📦 **会话持久化**：会话落盘存储于标准 Pi Session 文件中；\n- 🗜️ **智能压缩**：支持自动/手动 Compaction 浓缩历史记忆。\n\n请告诉我您想打磨或补充哪一段经历？`,
        timestamp: new Date().toISOString()
      });
      return result;
    }

    for (const msg of session.messages) {
      if (msg.role === 'user') {
        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          text = msg.content
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('\n');
        }
        if (text) {
          result.push({ role: 'user', content: text, timestamp: (msg as any).timestamp });
        }
      } else if (msg.role === 'assistant') {
        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          text = msg.content
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('\n');
        }
        if (text) {
          result.push({ role: 'assistant', content: text, timestamp: (msg as any).timestamp });
        }
      }
    }

    return result;
  }

  /**
   * 调用 Pi 原生 Compaction 压缩精炼上下文，节省 Token 并沉淀关键记忆
   */
  public async compactContext(): Promise<{ success: boolean; message: string }> {
    const session = await this.getOrCreateSession();
    try {
      let candidateName = '候选人';
      try {
        const profilePath = path.resolve(process.cwd(), 'data/profile/master_profile.json');
        if (fs.existsSync(profilePath)) {
          const prof = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
          if (prof.basicInfo?.name) candidateName = prof.basicInfo.name;
        }
      } catch (e) {}

      const res = await session.compact(`总结${candidateName}在此前对话中确认的工作经历、技能重点与数据事实，压缩上下文并保留关键信息。`);
      return { success: true, message: `Pi 会话上下文压缩完成` };
    } catch (e: any) {
      return { success: false, message: e.message || '压缩失败' };
    }
  }

  /**
   * 重置/开启新的 Pi 会话
   */
  public async resetSession(): Promise<void> {
    if (this.session) {
      try {
        this.session.dispose();
      } catch (e) {}
      this.session = null;
    }

    // 新建 session
    const cwd = process.cwd();
    const sessionManager = SessionManager.create(cwd, this.sessionDir);
    const modelRuntime = await ModelRuntime.create();
    const available = await modelRuntime.getAvailable();
    const selectedModel =
      available.find(m => m.id.includes('flash') || m.id.includes('glm-5.3') || m.id.includes('gemini-3')) ||
      available[0];

    const { session } = await createAgentSession({
      sessionManager,
      modelRuntime,
      model: selectedModel,
      tools: []
    });

    this.session = session;
  }

  /**
   * 获取当前会话状态信息
   */
  public async getStatus(): Promise<{ sessionId: string; sessionFile?: string; messageCount: number }> {
    const session = await this.getOrCreateSession();
    return {
      sessionId: session.sessionId,
      sessionFile: session.sessionFile,
      messageCount: session.messages.length
    };
  }
}
