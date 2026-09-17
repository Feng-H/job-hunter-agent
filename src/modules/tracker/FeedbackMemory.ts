import { FeedbackMemory } from '../../types/index.js';
import { readJson, writeJson } from '../../storage/index.js';

export class FeedbackMemoryManager {
  private fileKey: string;
  private memory: FeedbackMemory;
  private ready: Promise<void>;

  constructor(fileKey: string = 'data/memory/feedback.json') {
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

  public async ensureReady(): Promise<void> {
    await this.ready;
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

  private async load(): Promise<void> {
    this.memory = await readJson<FeedbackMemory>(this.fileKey, {
      rejectedJobIds: [],
      negativeKeywords: [],
      negativeCompanyKeywords: [],
      resumeTweaks: [],
      historyFeedback: []
    });
  }

  private async save(): Promise<void> {
    try {
      await writeJson(this.fileKey, this.memory);
    } catch (e) {
      console.error('[FeedbackMemoryManager] 保存失败:', e);
    }
  }
}
