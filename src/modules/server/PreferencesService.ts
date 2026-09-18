/**
 * 求职偏好规则更新合并（纯函数，供 API 路由与回归测试共用）。
 * 历史事故：该逻辑曾内联在路由中且只持久化 4 个字段，导致"保存成功"是假象（targetCities 等被静默丢弃，
 * 云端过滤器读到示例配置的北京）。抽离为纯函数后由 test-regression.ts 全字段回归。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyPreferencesUpdate(current: any, data: any): any {
  current = current && typeof current === 'object' ? current : {};
  current.scenarios = current.scenarios || { remote: {}, onsite: {} };
  current.scenarios.remote = current.scenarios.remote || {};
  current.scenarios.onsite = current.scenarios.onsite || {};
  current.strictRules = current.strictRules || {};
  current.scoringThresholds = current.scoringThresholds || {};

  // 场景开关
  if (data.remoteEnabled !== undefined) current.scenarios.remote.enabled = Boolean(data.remoteEnabled);
  if (data.onsiteEnabled !== undefined) current.scenarios.onsite.enabled = Boolean(data.onsiteEnabled);

  // 目标城市 / 常住地 / 通勤（onsite 场景）
  if (Array.isArray(data.targetCities) && data.targetCities.length) {
    current.scenarios.onsite.targetCities = data.targetCities.map((c: string) => String(c).trim()).filter(Boolean);
  }
  if (data.homeBase !== undefined) current.scenarios.onsite.homeBase = String(data.homeBase).trim() || '常住地';
  if (data.commuteMax !== undefined && Number(data.commuteMax) > 0) current.scenarios.onsite.maxCommuteMinutes = Number(data.commuteMax);

  // 薪资底线（onsite + remote 同步）
  if (data.salaryMin !== undefined) {
    current.scenarios.onsite.salaryRange = current.scenarios.onsite.salaryRange || {};
    current.scenarios.onsite.salaryRange.min = Number(data.salaryMin);
    current.scenarios.remote.salaryRange = current.scenarios.remote.salaryRange || {};
    current.scenarios.remote.salaryRange.min = Number(data.salaryMin);
  }

  // 硬性红线
  if (data.doubleWeekend !== undefined) current.strictRules.mustDoubleWeekend = Boolean(data.doubleWeekend);
  if (Array.isArray(data.disallowedWorkSchedules) && data.disallowedWorkSchedules.length) {
    current.strictRules.disallowedWorkSchedules = data.disallowedWorkSchedules;
  }
  if (data.maxStaleMonths !== undefined) current.strictRules.maxStaleMonths = Number(data.maxStaleMonths) || 3;
  if (Array.isArray(data.excludeKeywords)) current.strictRules.excludeKeywords = data.excludeKeywords;
  if (Array.isArray(data.excludeCompanies)) current.strictRules.excludeCompanies = data.excludeCompanies;
  if (Array.isArray(data.targetDomains)) current.strictRules.targetDomains = data.targetDomains;

  // 目标职位方向（onsite + remote 同步）
  if (Array.isArray(data.targetRoles) && data.targetRoles.length) {
    current.scenarios.onsite.targetRoles = data.targetRoles;
    current.scenarios.remote.targetRoles = data.targetRoles;
  }

  // 评分门槛
  if (data.minScoreToNotify !== undefined) {
    current.scoringThresholds.minScoreToNotify = Number(data.minScoreToNotify) || 75;
  }

  return current;
}
