import * as fs from 'node:fs';
import * as path from 'node:path';
import { FeedbackMemory } from '../../types/index.js';

export class FeedbackMemoryManager {
  private filePath: string;
  private memory: FeedbackMemory;

  constructor(filePath: string = path.resolve(process.cwd(), 'data/memory/feedback.json')) {
    this.filePath = filePath;
    this.memory = this.load();
  }

  public recordRejection(jobId: string, company: string, jobTitle: string, reason?: string): void {
    if (!this.memory.rejectedJobIds.includes(jobId)) {
      this.memory.rejectedJobIds.push(jobId);
    }

    if (reason) {
      // 智能提取可能产生的新负向关键词
      const lower = reason.toLowerCase();
      if (lower.includes('外包') && !this.memory.negativeKeywords.includes('外包')) {
        this.memory.negativeKeywords.push('外包');
      }
      if (lower.includes('公司') || lower.includes('黑名单')) {
        if (!this.memory.negativeCompanyKeywords.includes(company)) {
          this.memory.negativeCompanyKeywords.push(company);
        }
      }
    }

    this.memory.historyFeedback.push({
      jobId,
      company,
      jobTitle,
      action: 'REJECTED',
      reason,
      timestamp: new Date().toISOString()
    });

    this.save();
  }

  public recordResumeTweak(targetJobTitle: string, instructions: string): void {
    this.memory.resumeTweaks.push({
      targetJobTitle,
      instructions,
      timestamp: new Date().toISOString()
    });
    this.save();
  }

  public getMemory(): FeedbackMemory {
    return this.memory;
  }

  private load(): FeedbackMemory {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      }
    } catch (e) {
      console.error('[FeedbackMemoryManager] 读取失败:', e);
    }
    return {
      rejectedJobIds: [],
      negativeKeywords: [],
      negativeCompanyKeywords: [],
      resumeTweaks: [],
      historyFeedback: []
    };
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.memory, null, 2), 'utf-8');
    } catch (e) {
      console.error('[FeedbackMemoryManager] 保存失败:', e);
    }
  }
}
