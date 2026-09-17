import * as fs from 'node:fs';
import * as path from 'node:path';
import { JobPost, MasterProfile, TailoredResume, FeedbackMemory } from '../../types/index.js';
import { LlmClient } from '../ai/LlmClient.js';

export class ResumeTailor {
  private outputDir: string;
  private llmClient: LlmClient;

  constructor(outputDir: string = path.resolve(process.cwd(), 'data/resumes_tailored')) {
    this.outputDir = outputDir;
    this.llmClient = new LlmClient();
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
    } catch {}
  }

  /**
   * 依据岗位 JD 与 Master Profile 动态裁剪定制简历（支持大模型原生重写）
   */
  public async generateTailoredResumeAsync(
    job: JobPost,
    profile: MasterProfile,
    feedbackMemory?: FeedbackMemory,
    userInstructions?: string
  ): Promise<TailoredResume> {
    // 优先尝试大模型深度定制重写
    const llmResult = await this.llmClient.rewriteTailoredResumeWithLlm(job, profile, userInstructions);
    if (llmResult && llmResult.markdown) {
      const filename = `${job.id}_${job.company.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_${job.title.replace(/[^\w\u4e00-\u9fa5]/g, '_')}.md`;
      const snapshotPath = path.join(this.outputDir, filename);
      try {
        if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
        fs.writeFileSync(snapshotPath, llmResult.markdown, 'utf-8');
      } catch (err) {
        // 云端只读环境容错
      }

      return {
        jobId: job.id,
        company: job.company,
        jobTitle: job.title,
        generatedAt: new Date().toISOString(),
        markdownContent: llmResult.markdown,
        greetingMessage: llmResult.greeting,
        keyMatchingPoints: llmResult.highlights,
        snapshotPath
      };
    }

    // 降级使用规则模板
    return this.generateTailoredResume(job, profile, feedbackMemory);
  }

  /**
   * 同步模版裁剪（兜底保护）
   */
  public generateTailoredResume(
    job: JobPost,
    profile: MasterProfile,
    feedbackMemory?: FeedbackMemory
  ): TailoredResume {
    const jdText = `${job.title} ${job.description}`.toLowerCase();

    // 分析 JD 的倾向性
    const isAiFocused = jdText.includes('ai') || jdText.includes('模型') || jdText.includes('rag') || jdText.includes('agent') || jdText.includes('算法');
    const isManufacturingFocused = jdText.includes('制造') || jdText.includes('设备') || jdText.includes('eam') || jdText.includes('mes') || jdText.includes('工业');
    const isProjectManagementFocused = jdText.includes('项目经理') || jdText.includes('pmo') || jdText.includes('交付');

    // 通用语义与关键词契合度计算，动态重排经历（完全通用化，无任何硬编码公司名）
    const tailoredExperiences = [...(profile.workExperiences || [])].sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      const textA = `${a.company} ${a.role} ${a.description} ${(a.highlights || []).map(h => h.module + ' ' + h.details).join(' ')}`.toLowerCase();
      const textB = `${b.company} ${b.role} ${b.description} ${(b.highlights || []).map(h => h.module + ' ' + h.details).join(' ')}`.toLowerCase();

      // 提取 JD 关键词计算重合度
      const jdWords = jdText.split(/[\s,./;，。、；/]+/).filter(w => w.length >= 2);
      for (const word of jdWords) {
        if (textA.includes(word)) scoreA += 5;
        if (textB.includes(word)) scoreB += 5;
      }
      return scoreB - scoreA;
    });

    // 动态提取与目标岗位最契合的经历亮点
    const matchingPoints: string[] = [];
    for (const exp of tailoredExperiences.slice(0, 2)) {
      if (exp.highlights && exp.highlights.length > 0) {
        matchingPoints.push(`在【${exp.company}】担任【${exp.role}】期间：${exp.highlights[0].module} - ${exp.highlights[0].details.slice(0, 60)}...`);
      }
    }
    if (matchingPoints.length === 0) {
      matchingPoints.push(`具备与【${job.title}】紧密吻合的 ${profile.basicInfo?.yearsOfExperience || 10} 年专业沉淀与项目落地交付经验`);
    }

    // 生成定制 Markdown
    const markdown = this.buildMarkdown(profile, job, tailoredExperiences, matchingPoints);

    // 生成针对性打招呼话术
    const greeting = this.buildGreetingMessage(profile, job, tailoredExperiences);

    const filename = `${job.id}_${job.company.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_${job.title.replace(/[^\w\u4e00-\u9fa5]/g, '_')}.md`;
    const snapshotPath = path.join(this.outputDir, filename);
    try {
      if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
      fs.writeFileSync(snapshotPath, markdown, 'utf-8');
    } catch (err) {
      // 云端只读环境容错
    }

    return {
      jobId: job.id,
      company: job.company,
      jobTitle: job.title,
      generatedAt: new Date().toISOString(),
      markdownContent: markdown,
      greetingMessage: greeting,
      keyMatchingPoints: matchingPoints,
      snapshotPath
    };
  }

  private buildGreetingMessage(profile: MasterProfile, job: JobPost, topExperiences: MasterProfile['workExperiences']): string {
    const candidateName = profile.basicInfo?.name || '求职者';
    const years = profile.basicInfo?.yearsOfExperience || 10;
    const currentTitle = profile.basicInfo?.title || '资深专家';
    const topExp = topExperiences[0];
    const expSnippet = topExp ? `（曾就职于【${topExp.company}】担任【${topExp.role}】）` : '';

    return `您好！关注到贵司正在招聘【${job.title}】。我拥有 ${years} 年 ${currentTitle} 背景${expSnippet}。细读贵司 JD 后，我的过往核心实战项目与关键技能和该岗位的要求高度契合。非常期待能查阅我的简历，并能与您进一步沟通交流！`;
  }

  private buildMarkdown(
    profile: MasterProfile,
    job: JobPost,
    experiences: MasterProfile['workExperiences'],
    points: string[]
  ): string {
    const basic = profile.basicInfo || ({} as any);
    let md = `# ${basic.name || '候选人'} - 个人简历\n\n`;
    md += `**目标岗位**：${job.company} · ${job.title}\n`;
    md += `**联系电话**：${basic.phone || '保密'} ｜ **邮箱**：${basic.email || '保密'} ｜ **所在地**：${basic.location || '全国'}\n`;
    if (basic.education) {
      md += `**学历**：${basic.education.school} · ${basic.education.degree} · ${basic.education.major} ｜ **经验**：${basic.yearsOfExperience}年\n\n`;
    }

    md += `## 🎯 岗位契合优势\n`;
    for (const p of points) {
      md += `- ${p}\n`;
    }
    md += `\n`;

    md += `## 💼 核心工作经历\n\n`;
    for (const exp of experiences) {
      md += `### ${exp.company} ｜ ${exp.role} ｜ ${exp.startDate} ~ ${exp.endDate}\n`;
      if (exp.description) md += `> ${exp.description}\n\n`;
      for (const h of exp.highlights || []) {
        md += `- **${h.module}**：${h.details}\n`;
      }
      md += `\n`;
    }

    md += `## 🛠️ 核心技能与资质\n`;
    if (profile.skills?.aiAndDigitalization?.length) {
      md += `- **专业与技术技能**：${profile.skills.aiAndDigitalization.slice(0, 6).join('、')}\n`;
    }
    if (profile.skills?.industrialEngineering?.length) {
      md += `- **行业与工程实践**：${profile.skills.industrialEngineering.slice(0, 5).join('、')}\n`;
    }
    if (profile.skills?.certifications?.length) {
      const certList = profile.skills.certifications.map(c => `${c.title}${c.org ? `（${c.org}）` : ''}`).join('、');
      md += `- **专业资质**：${certList}\n`;
    }
    if (profile.skills?.languages?.length) {
      md += `- **语言能力**：${profile.skills.languages.join('；')}\n\n`;
    }

    return md;
  }
}
