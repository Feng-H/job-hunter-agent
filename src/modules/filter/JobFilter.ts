import * as fs from 'node:fs';
import * as path from 'node:path';
import { JobPost, FilterResult, PreferenceRules, MasterProfile, FeedbackMemory } from '../../types/index.js';
import { ScheduleChecker } from './ScheduleChecker.js';
import { CommutePlanner, CommuteEstimate } from './CommutePlanner.js';

export class JobFilter {
  private rules: PreferenceRules;
  private scheduleChecker: ScheduleChecker;
  private commutePlanner: CommutePlanner;

  constructor(rulesPath: string = path.resolve(process.cwd(), 'data/preferences/rules.json')) {
    this.rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
    this.scheduleChecker = new ScheduleChecker();
    this.commutePlanner = new CommutePlanner();
  }

  public reloadRules(rulesPath: string = path.resolve(process.cwd(), 'data/preferences/rules.json')) {
    this.rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
  }

  /**
   * 对岗位进行深度过滤与评分
   */
  public evaluate(job: JobPost, profile: MasterProfile, feedbackMemory?: FeedbackMemory): FilterResult {
    const reasons: string[] = [];
    const textToScan = `${job.title} ${job.company} ${job.description}`.toLowerCase();

    // 1.5 活跃度检查：招聘信息必须在最近 3 个月内有更新（拒绝挂牌僵尸岗）
    if (job.publishOrActiveTime) {
      const timeStr = job.publishOrActiveTime.trim();
      const isStale = this.checkIfStale(timeStr);
      if (isStale) {
        return {
          passed: false,
          score: 0,
          reasons: [`触发时效红线：岗位更新时间为「${timeStr}」，超过 3 个月未更新，判定为僵尸挂牌岗位`],
          breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
        };
      }
      reasons.push(`时效优良：招聘信息近期待更新/活跃（${timeStr}）`);
    }
    if (this.rules.strictRules.mustDoubleWeekend) {
      for (const disallowed of this.rules.strictRules.disallowedWorkSchedules) {
        if (textToScan.includes(disallowed.toLowerCase())) {
          return {
            passed: false,
            score: 0,
            reasons: [`触发硬性红线：工作制包含非双休关键词「${disallowed}」`],
            breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
          };
        }
      }
    }

    // 2. 硬性红线：绝对不接受“驻场/驻厂/外派异地/常驻客户现场”
    for (const kw of this.rules.strictRules.excludeKeywords) {
      if (textToScan.includes(kw.toLowerCase())) {
        return {
          passed: false,
          score: 0,
          reasons: [`触发硬性红线：包含禁止工作形式「${kw}」`],
          breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
        };
      }
    }

    // 3. 用户历史负向规则与排除公司
    if (feedbackMemory) {
      for (const comp of feedbackMemory.negativeCompanyKeywords) {
        if (job.company.toLowerCase().includes(comp.toLowerCase())) {
          return {
            passed: false,
            score: 0,
            reasons: [`触发用户历史屏蔽公司规则：「${comp}」`],
            breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
          };
        }
      }
      for (const kw of feedbackMemory.negativeKeywords) {
        if (textToScan.includes(kw.toLowerCase())) {
          return {
            passed: false,
            score: 0,
            reasons: [`触发用户历史负向关键词：「${kw}」`],
            breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
          };
        }
      }
    }

    // 4. 工作地点与模式判定（仅支持：配置的远程办公 或 目标城市本地线下）
    let matchedScenario: 'remote' | 'onsite' | undefined = undefined;
    const isRemoteJob = job.workMode === 'REMOTE' ||
      job.city.includes('远程') ||
      job.title.toLowerCase().includes('远程') ||
      job.title.toLowerCase().includes('remote');

    const homeBase = this.rules.scenarios.onsite?.homeBase || '设定常住地';
    const maxCommute = this.rules.scenarios.onsite?.maxCommuteMinutes || 90;
    const targetCities = this.rules.scenarios.onsite?.targetCities || ['长沙'];

    if (isRemoteJob && this.rules.scenarios.remote?.enabled) {
      matchedScenario = 'remote';
      reasons.push('命中求职场景：远程办公模式（Remote）');
    } else if (this.rules.scenarios.onsite?.enabled) {
      const matchCity = targetCities.some(city =>
        job.city.includes(city) || textToScan.includes(city.toLowerCase())
      );
      if (matchCity) {
        matchedScenario = 'onsite';
        // 进行通勤时间与路线规划（使用配置的常住地起点）
        const commute = this.commutePlanner.estimateCommute(`${job.city} ${job.description} ${job.company}`, homeBase, maxCommute);
        if (!commute.isFeasible) {
          return {
            passed: false,
            score: 0,
            reasons: [`触发通勤红线：距离起点【${homeBase}】单程超出 ${maxCommute} 分钟（${commute.transitSummary}）`],
            breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
          };
        }
        reasons.push(`命中求职场景：【${targetCities.join('、')}】本地线下（起点：${homeBase} ｜ ${commute.transitSummary}）`);
      } else {
        return {
          passed: false,
          score: 10,
          reasons: [`地点不符：当前为「${job.city}」，线下只考虑【${targetCities.join('、')}】本地`],
          breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
        };
      }
    }

    // 5. 薪资底线判定
    const minSalaryExpected = this.rules.scenarios.onsite?.salaryRange?.min || 15000;
    if (job.salaryMax && job.salaryMax < minSalaryExpected) {
      return {
        passed: false,
        score: 30,
        reasons: [`薪资不符：最高月薪 ${job.salaryMax} 元低于期望底线 ${minSalaryExpected} 元`],
        breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
      };
    }

    // 6. 技能覆盖度评分 (40分)
    const allCandidateSkills = [
      ...profile.skills.aiAndDigitalization,
      ...profile.skills.industrialEngineering,
      'EAM', 'MES', 'RAG', 'Agent', 'FastAPI', 'VLM', '知识图谱', 'PostgreSQL', 'pgvector',
      'LiteLLM', 'Qwen', 'Dify', 'PMP', '精益生产', 'TPM', 'SPC', 'DOE', '半导体', '制造'
    ];

    let matchedSkillCount = 0;
    const hitSkills: string[] = [];
    for (const skill of allCandidateSkills) {
      if (textToScan.includes(skill.toLowerCase())) {
        matchedSkillCount++;
        if (hitSkills.length < 6) hitSkills.push(skill);
      }
    }
    const skillScore = Math.min(40, Math.round((matchedSkillCount / 5) * 40));
    if (hitSkills.length > 0) {
      reasons.push(`技能契合：匹配核心关键词 [${hitSkills.join(', ')}]`);
    }

    // 7. 经验契合度评分 (30分)
    let expScore = 20;
    if (
      textToScan.includes('产品经理') ||
      textToScan.includes('产品负责人') ||
      textToScan.includes('数字化专家') ||
      textToScan.includes('架构师') ||
      textToScan.includes('项目经理') ||
      textToScan.includes('总监') ||
      textToScan.includes('部长') ||
      textToScan.includes('负责人')
    ) {
      expScore += 10;
      reasons.push('经验契合：目标职能（专家/部长/总监/负责人）与 15 年实战底蕴高度匹配');
    }

    // 8. 双休保障与网络口碑排查 (20分)
    let scheduleScore = 15;
    if (textToScan.includes('双休') || textToScan.includes('周末双休')) {
      scheduleScore = 20;
      reasons.push('工作制审核：JD 明确承诺【周末双休】');
    } else {
      reasons.push('工作制审核：JD 未直接标注双休，系统已标记待核验');
    }

    // 9. 赛道与领域契合度评分 (10分)
    let domainScore = 8;
    if (textToScan.includes('ai') || textToScan.includes('智能制造') || textToScan.includes('工业') || textToScan.includes('大模型')) {
      domainScore = 10;
      reasons.push('赛道契合：AI 原生应用 / 工业智能制造');
    }

    const totalScore = skillScore + expScore + scheduleScore + domainScore;
    const passed = totalScore >= this.rules.scoringThresholds.minScoreToNotify;

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
   * 判断招聘信息是否超过 3 个月（90天）未更新
   */
  private checkIfStale(timeStr: string): boolean {
    const lower = timeStr.toLowerCase();
    // 明确为近期活跃
    if (
      lower.includes('刚刚') ||
      lower.includes('今日') ||
      lower.includes('今天') ||
      lower.includes('昨天') ||
      lower.includes('天前') ||
      lower.includes('小时前') ||
      lower.includes('周内') ||
      lower.includes('周前') ||
      lower.includes('月内') ||
      lower.includes('本月')
    ) {
      return false;
    }

    // 超过3个月或半年前或1年前
    if (
      lower.includes('半年前') ||
      lower.includes('1年前') ||
      lower.includes('2年前') ||
      lower.includes('4个月前') ||
      lower.includes('5个月前') ||
      lower.includes('6个月前')
    ) {
      return true;
    }

    // 解析具象日期（如 2025-03-01 或 05月12日）
    const dateMatch = timeStr.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (dateMatch) {
      const year = parseInt(dateMatch[1], 10);
      const month = parseInt(dateMatch[2], 10) - 1;
      const day = parseInt(dateMatch[3], 10);
      const postDate = new Date(year, month, day);
      const diffDays = (Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 90) {
        return true;
      }
    }

    return false;
  }
}
