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

    // 1.5 活跃度检查：招聘信息时效红线（可通过 rules.strictRules.maxStaleMonths 配置，0 表示不限）
    const maxStaleMonths = this.rules.strictRules.maxStaleMonths ?? 3;
    if (maxStaleMonths > 0 && job.publishOrActiveTime) {
      const timeStr = job.publishOrActiveTime.trim();
      const isStale = this.checkIfStale(timeStr, maxStaleMonths);
      if (isStale) {
        return {
          passed: false,
          score: 0,
          reasons: [`触发时效红线：岗位更新时间为「${timeStr}」，超过 ${maxStaleMonths} 个月未更新，判定为僵尸挂牌岗位`],
          breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
        };
      }
      reasons.push(`时效优良：招聘信息近期待更新/活跃（${timeStr}）`);
    }

    // 1.6 工作制红线：严格周末双休（单休、大小周、轮休等一票否决）
    if (this.rules.strictRules.mustDoubleWeekend) {
      const disallowedList = this.rules.strictRules.disallowedWorkSchedules || [];
      for (const disallowed of disallowedList) {
        if (disallowed && textToScan.includes(disallowed.toLowerCase())) {
          return {
            passed: false,
            score: 0,
            reasons: [`触发工作制红线：工作制包含非双休关键词「${disallowed}」`],
            breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
          };
        }
      }
    }

    // 2. 硬性红线：排除形式关键词（如驻场、驻厂、外派等）
    for (const kw of (this.rules.strictRules.excludeKeywords || [])) {
      if (kw && textToScan.includes(kw.toLowerCase())) {
        return {
          passed: false,
          score: 0,
          reasons: [`触发硬性红线：包含禁止工作形式「${kw}」`],
          breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
        };
      }
    }

    // 2.5 企业黑名单红线
    for (const comp of (this.rules.strictRules.excludeCompanies || [])) {
      if (comp && job.company.toLowerCase().includes(comp.toLowerCase())) {
        return {
          passed: false,
          score: 0,
          reasons: [`触发企业黑名单红线：企业命中屏蔽名单「${comp}」`],
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

    // 4. 工作地点与模式判定（支持可配置的远程办公 与 线下目标城市）
    let matchedScenario: 'remote' | 'onsite' | undefined = undefined;
    const isRemoteJob = job.workMode === 'REMOTE' ||
      job.city.includes('远程') ||
      job.title.toLowerCase().includes('远程') ||
      job.title.toLowerCase().includes('remote');

    const homeBase = this.rules.scenarios.onsite?.homeBase || '常住地';
    const maxCommute = this.rules.scenarios.onsite?.maxCommuteMinutes || 90;
    const targetCities = this.rules.scenarios.onsite?.targetCities || ['长沙'];

    if (isRemoteJob) {
      if (this.rules.scenarios.remote?.enabled) {
        matchedScenario = 'remote';
        reasons.push('命中求职场景：远程办公模式（Remote）');
      } else {
        return {
          passed: false,
          score: 10,
          reasons: ['工作模式不符：当前为远程岗位，但配置未启用远程办公'],
          breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
        };
      }
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
    } else {
      return {
        passed: false,
        score: 0,
        reasons: ['工作模式不符：未启用任何符合该岗位的求职场景（远程或线下）'],
        breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
      };
    }

    // 5. 薪资底线判定（根据命中场景读取对应最低薪资）
    const minSalaryExpected = matchedScenario === 'remote'
      ? (this.rules.scenarios.remote?.salaryRange?.min || 15000)
      : (this.rules.scenarios.onsite?.salaryRange?.min || 15000);

    if (job.salaryMax && job.salaryMax < minSalaryExpected) {
      return {
        passed: false,
        score: 30,
        reasons: [`薪资不符：最高月薪 ${job.salaryMax} 元低于期望底线 ${minSalaryExpected} 元`],
        breakdown: { skillMatch: 0, experienceMatch: 0, scheduleAndBenefits: 0, growthAndDomain: 0 }
      };
    }

    // 6. 技能覆盖度评分 (40分) - 动态取自候选人档案与目标技能
    const profileSkills = [
      ...(profile.skills?.aiAndDigitalization || []),
      ...(profile.skills?.industrialEngineering || []),
      ...(profile.skills?.projectManagement || [])
    ];
    const targetRoles = [
      ...(this.rules.scenarios.onsite?.targetRoles || []),
      ...(this.rules.scenarios.remote?.targetRoles || [])
    ];
    const candidateSkills = Array.from(new Set([
      ...profileSkills,
      ...targetRoles
    ])).filter(s => Boolean(s && s.length >= 2));

    let matchedSkillCount = 0;
    const hitSkills: string[] = [];
    for (const skill of candidateSkills) {
      if (textToScan.includes(skill.toLowerCase())) {
        matchedSkillCount++;
        if (hitSkills.length < 6) hitSkills.push(skill);
      }
    }
    const skillScore = Math.min(40, Math.round((matchedSkillCount / Math.max(3, candidateSkills.length > 0 ? 5 : 3)) * 40));
    if (hitSkills.length > 0) {
      reasons.push(`技能契合：匹配核心关键词 [${hitSkills.join(', ')}]`);
    }

    // 7. 经验与职能契合度评分 (30分) - 动态对齐目标职位列表
    const allExpectedRoles = Array.from(new Set([
      ...targetRoles,
      profile.basicInfo?.title || ''
    ])).filter(Boolean);

    let expScore = 20;
    const hitRoles: string[] = [];
    for (const role of allExpectedRoles) {
      const rLower = role.toLowerCase();
      const parts = rLower.split(/[\/\s·,，]+/).filter(p => p.length >= 2);
      for (const part of parts) {
        if (textToScan.includes(part) && !hitRoles.includes(part)) {
          hitRoles.push(part);
        }
      }
    }
    if (hitRoles.length > 0) {
      expScore += 10;
      reasons.push(`职能契合：命中目标职位 [${hitRoles.slice(0, 3).join(', ')}] 与候选人实战经验匹配`);
    }

    // 8. 双休保障与网络口碑排查 (20分)
    let scheduleScore = 15;
    if (textToScan.includes('双休') || textToScan.includes('周末双休') || textToScan.includes('五天工作制')) {
      scheduleScore = 20;
      reasons.push('工作制审核：JD 明确承诺【周末双休】');
    } else {
      reasons.push('工作制审核：JD 未直接标注双休，系统标记待HR核验');
    }

    // 9. 赛道与领域契合度评分 (10分) - 动态取自 rules.strictRules.targetDomains
    const targetDomains = (this.rules.strictRules.targetDomains && this.rules.strictRules.targetDomains.length > 0)
      ? this.rules.strictRules.targetDomains
      : ['AI', '软件', '互联网', '智能制造', '数字化'];

    let domainScore = 6;
    const hitDomains = targetDomains.filter(d => textToScan.includes(d.toLowerCase()));
    if (hitDomains.length > 0) {
      domainScore = 10;
      reasons.push(`赛道契合：命中期望行业领域 [${hitDomains.slice(0, 3).join('、')}]`);
    } else {
      domainScore = 8;
    }

    const totalScore = skillScore + expScore + scheduleScore + domainScore;
    const minScore = this.rules.scoringThresholds?.minScoreToNotify ?? 75;
    const passed = totalScore >= minScore;

    if (!passed) {
      reasons.push(`综合契合度得分（${totalScore}分）低于预设门槛（${minScore}分）`);
    }

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
   * 判断招聘信息是否超过规定月数未更新
   */
  private checkIfStale(timeStr: string, maxMonths: number = 3): boolean {
    if (maxMonths <= 0) return false;
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

    if (maxMonths <= 1 && (lower.includes('个月前') || lower.includes('月前'))) {
      return true;
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
      if (diffDays > maxMonths * 30) {
        return true;
      }
    }

    return false;
  }
}
