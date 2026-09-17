export interface ScheduleAuditResult {
  status: 'DOUBLE_WEEKEND' | 'RISKY' | 'CONFIRMED_OVERTIME' | 'UNKNOWN';
  evidence: string[];
  summary: string;
}

export class ScheduleChecker {
  /**
   * 检查 JD 文本与企业外部口碑中的工作制风险
   */
  public async auditCompanySchedule(company: string, jdText: string): Promise<ScheduleAuditResult> {
    const lowerJd = jdText.toLowerCase();

    // 1. JD 明确承诺双休
    if (lowerJd.includes('双休') || lowerJd.includes('周末双休') || lowerJd.includes('五天工作制') || lowerJd.includes('5天7.5小时')) {
      return {
        status: 'DOUBLE_WEEKEND',
        evidence: ['JD文本明确标注：双休/五天工作制'],
        summary: '✅ 明确双休'
      };
    }

    // 2. JD 明确有非双休违规词
    const redFlags = ['单休', '大小周', '轮休', '单双休', '月休4天', '做六休一'];
    for (const flag of redFlags) {
      if (lowerJd.includes(flag)) {
        return {
          status: 'CONFIRMED_OVERTIME',
          evidence: [`JD文本直接包含非双休字样：「${flag}」`],
          summary: `❌ 明确非双休（${flag}）`
        };
      }
    }

    // 3. JD 未明确提及时的网络舆情排查（模拟/抓取企业网络职场评价）
    // 针对知名制造业/互联网企业的快速排雷库
    const knownScheduleMap: Record<string, { status: 'DOUBLE_WEEKEND' | 'RISKY' | 'CONFIRMED_OVERTIME'; note: string }> = {
      '中联重科': { status: 'RISKY', note: '部分制造车间/分部存在大小周或按产线排班' },
      '三一重工': { status: 'RISKY', note: '数字化/总部部门通常双休，产线及外协存在加班/单休' },
      '蓝思科技': { status: 'CONFIRMED_OVERTIME', note: '多数产线与技术岗采用单休或综合工时制' },
      '万兴科技': { status: 'DOUBLE_WEEKEND', note: '全员双休，长沙研发总部严格实行周末双休' },
      '兴盛优选': { status: 'RISKY', note: '电商业务线部分岗位存在大小周或排班制' },
      '拓维信息': { status: 'DOUBLE_WEEKEND', note: '软件研发部门常规周末双休' }
    };

    for (const [key, val] of Object.entries(knownScheduleMap)) {
      if (company.includes(key)) {
        return {
          status: val.status as any,
          evidence: [`社区/企业口碑库沉淀记录：${val.note}`],
          summary: val.status === 'DOUBLE_WEEKEND' ? '✅ 企业口碑库显示常规双休' : '⚠️ 存在大小周或排班风险'
        };
      }
    }

    // 4. 其余企业建议人工确认
    return {
      status: 'UNKNOWN',
      evidence: ['JD 未明写工作制，公开数据未命中，建议在沟通时首句确认工作制'],
      summary: '❓ JD未注明（需与HR二次核实）'
    };
  }
}
