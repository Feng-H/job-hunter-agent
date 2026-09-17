export interface CommuteEstimate {
  isFeasible: boolean;        // 是否在规定通勤时间内
  estimatedMinutes: number;   // 预估单程分钟
  transitSummary: string;     // 通勤线路规划摘要
  locationTag: string;        // 所在片区
  distanceCategory: 'CLOSE' | 'MEDIUM' | 'FAR' | 'OUT_OF_RANGE';
}

export class CommutePlanner {
  private defaultHomeBase: string;
  private defaultMaxMinutes: number;

  constructor(homeBase: string = '长沙地铁3号线松雅湖南站', maxMinutes: number = 90) {
    this.defaultHomeBase = homeBase;
    this.defaultMaxMinutes = maxMinutes;
  }

  /**
   * 估算从用户常住地到工作地点的公共交通/地铁通勤时间与路线规划
   * 支持多城市与自定义常住地评估
   */
  public estimateCommute(
    workAddressOrArea: string,
    homeBase?: string,
    maxMinutes?: number
  ): CommuteEstimate {
    const origin = homeBase || this.defaultHomeBase;
    const limitMinutes = maxMinutes ?? this.defaultMaxMinutes;
    const text = (workAddressOrArea || '').toLowerCase();
    const originLower = origin.toLowerCase();

    // 针对长沙本地地铁网络的精细化通勤估算
    const isChangshaContext = originLower.includes('长沙') || originLower.includes('星沙') || originLower.includes('松雅湖') || text.includes('长沙');

    if (isChangshaContext) {
      return this.estimateChangshaCommute(text, origin, limitMinutes);
    }

    // 针对其他城市的通用通勤评估逻辑
    return this.estimateGeneralCommute(text, origin, limitMinutes);
  }

  /**
   * 长沙本地地铁网络精细化路线规划
   */
  private estimateChangshaCommute(text: string, origin: string, limitMinutes: number): CommuteEstimate {
    // 1. 远郊不可达区域（严重超出通勤时间红线，或无地铁覆盖）
    // 如：宁乡市（距离50+公里）、浏阳市（距离50+公里）、望城铜官、偏远乡镇
    if (text.includes('宁乡') || text.includes('浏阳') || text.includes('铜官') || text.includes('暮云') || text.includes('坪塘深处') || text.includes('茶亭')) {
      return {
        isFeasible: false,
        estimatedMinutes: 120,
        transitSummary: `🚫 远郊通勤超标：距起点【${origin}】超过 40+ 公里且无直达地铁，单程约需 120 分钟`,
        locationTag: '远郊/无直达地铁区（超标否决）',
        distanceCategory: 'OUT_OF_RANGE'
      };
    }

    // 2. 星沙 / 长沙经开区 / 泉塘 / 湘龙（近起点区域）
    if (text.includes('星沙') || text.includes('经济技术开发区') || text.includes('经开区') || text.includes('泉塘') || text.includes('湘龙') || text.includes('㮾梨') || text.includes('松雅湖')) {
      const mins = 20;
      return {
        isFeasible: mins <= limitMinutes,
        estimatedMinutes: mins,
        transitSummary: '🚇 极速通勤：3号线直达或公交直达，单程约 15~25 分钟',
        locationTag: '星沙/经开区产业园（极近）',
        distanceCategory: 'CLOSE'
      };
    }

    // 3. 开福区 / 马栏山视频文创园 / 广电 / 月湖
    if (text.includes('马栏山') || text.includes('开福') || text.includes('广电') || text.includes('月湖') || text.includes('四方坪')) {
      const mins = 30;
      return {
        isFeasible: mins <= limitMinutes,
        estimatedMinutes: mins,
        transitSummary: '🚇 轻松通勤：3号线 → 月湖公园北站换乘5号线，单程约 25~35 分钟',
        locationTag: '马栏山/开福核心区',
        distanceCategory: 'CLOSE'
      };
    }

    // 4. 芙蓉区 / 市中心 / 雨花区北部（五一广场、长沙火车站、东塘）
    if (text.includes('芙蓉') || text.includes('火车站') || text.includes('五一') || text.includes('雨花') || text.includes('东塘') || text.includes('高桥')) {
      const mins = 40;
      return {
        isFeasible: mins <= limitMinutes,
        estimatedMinutes: mins,
        transitSummary: '🚇 便捷通勤：3号线直达或火车站换乘2号线，单程约 35~45 分钟',
        locationTag: '芙蓉区/雨花核心区',
        distanceCategory: 'MEDIUM'
      };
    }

    // 5. 岳麓区 / 河西高新区 / 麓谷高新园区 / 梅溪湖（研发与高新产业阵地）
    if (text.includes('麓谷') || text.includes('中电软件园') || text.includes('高新区') || text.includes('岳麓') || text.includes('梅溪湖') || text.includes('洋湖') || text.includes('大学科技城')) {
      const mins = 55;
      return {
        isFeasible: mins <= limitMinutes,
        estimatedMinutes: mins,
        transitSummary: '🚇 地铁骨干互联：3号线朝阳村站换乘6号线直达麓谷产业园，单程约 50~65 分钟',
        locationTag: '河西高新区/麓谷软件园',
        distanceCategory: 'MEDIUM'
      };
    }

    // 6. 天心区 / 省政府 / 大托（3号线换1号线）
    if (text.includes('天心') || text.includes('省政府') || text.includes('新开铺') || text.includes('桂花坪')) {
      const mins = 50;
      return {
        isFeasible: mins <= limitMinutes,
        estimatedMinutes: mins,
        transitSummary: '🚇 地铁换乘：3号线侯家塘站换乘1号线直达，单程约 45~55 分钟',
        locationTag: '天心区/省政府片区',
        distanceCategory: 'MEDIUM'
      };
    }

    // 7. 望城滨水新城 / 月亮岛片区
    if (text.includes('望城') && (text.includes('滨水') || text.includes('月亮岛') || text.includes('金星北'))) {
      const mins = 70;
      return {
        isFeasible: mins <= limitMinutes,
        estimatedMinutes: mins,
        transitSummary: '🚇 地铁跨区：3号线换乘4号线，单程约 65~75 分钟',
        locationTag: '望城月亮岛片区',
        distanceCategory: 'FAR'
      };
    }

    // 8. 默认常规市区覆盖
    const mins = 50;
    return {
      isFeasible: mins <= limitMinutes,
      estimatedMinutes: mins,
      transitSummary: `🚇 地铁常规网络覆盖，距【${origin}】单程预估约 45~60 分钟`,
      locationTag: '常规城区网络',
      distanceCategory: 'MEDIUM'
    };
  }

  /**
   * 通用城市通勤评估
   */
  private estimateGeneralCommute(text: string, origin: string, limitMinutes: number): CommuteEstimate {
    // 检查是否有远郊、外省或超距离关键词
    if (text.includes('偏远') || text.includes('边郊') || text.includes('远郊') || text.includes('县城')) {
      return {
        isFeasible: false,
        estimatedMinutes: 110,
        transitSummary: `🚫 远郊或未覆盖区域：距起点【${origin}】过远，单程预计 > ${limitMinutes} 分钟`,
        locationTag: '远郊区县',
        distanceCategory: 'OUT_OF_RANGE'
      };
    }

    const estimatedMins = 45;
    return {
      isFeasible: estimatedMins <= limitMinutes,
      estimatedMinutes: estimatedMins,
      transitSummary: `🚇 城市常规公共交通网络覆盖，距起点【${origin}】单程预估约 35~50 分钟`,
      locationTag: '同城常规通勤范围',
      distanceCategory: 'MEDIUM'
    };
  }
}
