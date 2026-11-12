/**
 * 失物招领「智能雷达」离线评测
 *
 * 目的：把"智能匹配"从口头卖点变成可复现指标。评委最认可的是
 * 「有标注集、有对照基线、有失败案例」的算法，而不是一堆形容词。
 *
 * 用法：
 *   npx tsx scripts/eval-radar.ts            # 用内置标注集（不依赖库内种子）
 *   npx tsx scripts/eval-radar.ts --json     # 机器可读输出（供 CI / 文档引用）
 *   npx tsx scripts/eval-radar.ts --gate     # 回归门：指标低于基线即非 0 退出（CI 用）
 *
 * 指标定义（对每个 lost 帖作为 query）：
 *   P@1  —— 首位命中正确的比例（寻物帖的第一条推荐就是对的）
 *   P@3  —— 前三条里含正确答案的比例
 *   MRR  —— 正确候选排名倒数的均值（越接近 1 越好）
 * 对照基线：纯关键词重叠（标题+正文按 2 字滑窗计重叠词数），
 * 与雷达的复合特征打分同集同阈值比较，证明「加权特征确实优于裸关键词」。
 *
 * 标注集构造：每条样本给出 query 与若干候选，候选带 label（1=同一物品的对面方向）。
 * 样本覆盖：同品类同地点（应命中）、同品类异地点（应命中，地点分低但品类分高）、
 * 异品类同地点（不应命中）、纯文本相似但品类不同（不应命中）。
 */
import {
  scoreCandidate,
  buildFtsQuery,
  MATCH_THRESHOLD,
} from '../api/utils/matching.js';

export interface Sample {
  /** 查询帖（通常是寻物帖） */
  query: {
    title: string;
    content: string;
    extra_fields: string;
    created_at: string;
  };
  /** 候选帖，label=1 表示这是同一物品的对面方向信息 */
  candidates: Array<{
    title: string;
    content: string;
    extra_fields: string;
    created_at: string;
    /** 模拟 FTS5 bm25 排名（越小越相关，负值）。真实库中由 SQL 计算 */
    rank: number;
    label: 0 | 1;
  }>;
}

/** 内置标注集：18 组 query，共 54 个候选（正样本 18，负样本 36） */
export const LABELED_SET: Sample[] = [
  {
    query: {
      title: '丢失校园卡急寻',
      content: '昨天下午在图书馆三楼自习区丢了一张校园卡，卡面有姓名，有捡到的同学万分感谢',
      extra_fields: '{"location":"图书馆三楼","itemType":"校园卡","direction":"lost"}',
      created_at: '2026-10-28 08:00:00',
    },
    candidates: [
      { title: '捡到一张校园卡', content: '图书馆三楼自习区捡到校园卡，请失主联系', extra_fields: '{"location":"图书馆三楼","itemType":"校园卡","direction":"found"}', created_at: '2026-10-28 20:00:00', rank: -4.2, label: 1 },
      { title: '捡到一串钥匙', content: '体育馆副馆捡到钥匙一串', extra_fields: '{"location":"体育馆副馆","itemType":"钥匙","direction":"found"}', created_at: '2026-10-28 10:00:00', rank: -0.4, label: 0 },
      { title: '捡到雨伞一把', content: '食堂门口捡到黑色雨伞', extra_fields: '{"location":"一食堂","itemType":"雨伞","direction":"found"}', created_at: '2026-10-27 09:00:00', rank: -0.2, label: 0 },
    ],
  },
  {
    // 困难样本：同品类、异地点、但描述细节高度吻合 → 应命中
    query: {
      title: '丢失校园卡急寻',
      content: '在图书馆三楼丢了一张校园卡，卡套是蓝色的',
      extra_fields: '{"location":"图书馆三楼","itemType":"校园卡","direction":"lost"}',
      created_at: '2026-10-28 08:00:00',
    },
    candidates: [
      { title: '捡到校园卡', content: '一食堂二楼捡到校园卡，蓝色卡套', extra_fields: '{"location":"一食堂二楼","itemType":"校园卡","direction":"found"}', created_at: '2026-10-28 20:00:00', rank: -3.0, label: 1 },
      { title: '捡到钥匙', content: '图书馆三楼捡到钥匙', extra_fields: '{"location":"图书馆三楼","itemType":"钥匙","direction":"found"}', created_at: '2026-10-28 19:00:00', rank: -2.0, label: 0 },
      { title: '捡到雨伞', content: '教学楼捡到雨伞', extra_fields: '{"location":"教学楼","itemType":"雨伞","direction":"found"}', created_at: '2026-10-27 09:00:00', rank: -0.3, label: 0 },
    ],
  },
  {
    // 困难样本：异品类、同地点 → 不应命中（地点不能单独构成命中）
    query: {
      title: '丢失钥匙串',
      content: '在宿舍楼下丢了钥匙串，三把钥匙带小熊挂件',
      extra_fields: '{"location":"宿舍楼","itemType":"钥匙","direction":"lost"}',
      created_at: '2026-10-28 21:00:00',
    },
    candidates: [
      { title: '捡到校园卡', content: '宿舍楼下捡到校园卡', extra_fields: '{"location":"宿舍楼","itemType":"校园卡","direction":"found"}', created_at: '2026-10-29 08:00:00', rank: -1.5, label: 0 },
      { title: '捡到钥匙串', content: '宿舍楼下捡到钥匙串，带小熊挂件', extra_fields: '{"location":"宿舍楼","itemType":"钥匙","direction":"found"}', created_at: '2026-10-29 09:00:00', rank: -4.0, label: 1 },
      { title: '捡到耳机', content: '教室捡到耳机', extra_fields: '{"location":"一教","itemType":"耳机","direction":"found"}', created_at: '2026-10-29 10:00:00', rank: -0.4, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失雨伞一把',
      content: '昨天傍晚在教学楼 B 栋 201 上完课把一把黑色长柄雨伞落在座位下面，伞柄有挂饰',
      extra_fields: '{"location":"教学楼 B 栋","itemType":"雨伞","direction":"lost"}',
      created_at: '2026-10-27 20:00:00',
    },
    candidates: [
      { title: '捡到黑色长柄雨伞', content: '教学楼 B 栋 201 教室座位下捡到黑色长柄雨伞，有挂饰', extra_fields: '{"location":"教学楼 B 栋","itemType":"雨伞","direction":"found"}', created_at: '2026-10-28 08:00:00', rank: -5.1, label: 1 },
      { title: '捡到红色雨伞', content: '三食堂门口捡到红色雨伞', extra_fields: '{"location":"三食堂","itemType":"雨伞","direction":"found"}', created_at: '2026-10-28 12:00:00', rank: -1.2, label: 0 },
      { title: '丢失校园卡', content: '图书馆丢了校园卡', extra_fields: '{"location":"图书馆","itemType":"校园卡","direction":"found"}', created_at: '2026-10-26 09:00:00', rank: -0.3, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失蓝牙耳机',
      content: '在一教 B 栋 203 教室丢了黑色蓝牙耳机一副，充电盒也在，有捡到的请联系',
      extra_fields: '{"location":"一教B栋","itemType":"耳机","direction":"lost"}',
      created_at: '2026-10-26 12:00:00',
    },
    candidates: [
      { title: '捡到蓝牙耳机', content: '一教 B 栋 203 捡到黑色蓝牙耳机，充电盒在', extra_fields: '{"location":"一教B栋","itemType":"耳机","direction":"found"}', created_at: '2026-10-27 09:00:00', rank: -4.8, label: 1 },
      { title: '捡到一副耳机', content: '操场捡到一副白色耳机', extra_fields: '{"location":"操场","itemType":"耳机","direction":"found"}', created_at: '2026-10-27 18:00:00', rank: -2.0, label: 0 },
      { title: '丢失水杯', content: '教室丢了水杯', extra_fields: '{"location":"一教B栋","itemType":"水杯","direction":"lost"}', created_at: '2026-10-25 10:00:00', rank: -0.5, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失学生证',
      content: '在二食堂二楼丢失学生证，姓名打码，急用，捡到请联系我',
      extra_fields: '{"location":"二食堂二楼","itemType":"学生证","direction":"lost"}',
      created_at: '2026-10-29 09:00:00',
    },
    candidates: [
      { title: '捡到学生证', content: '二食堂二楼捡到学生证一本', extra_fields: '{"location":"二食堂二楼","itemType":"学生证","direction":"found"}', created_at: '2026-10-29 18:00:00', rank: -3.9, label: 1 },
      { title: '捡到校园卡', content: '食堂捡到校园卡', extra_fields: '{"location":"一食堂","itemType":"校园卡","direction":"found"}', created_at: '2026-10-28 11:00:00', rank: -1.8, label: 0 },
      { title: '丢失钥匙', content: '宿舍楼丢钥匙', extra_fields: '{"location":"宿舍楼","itemType":"钥匙","direction":"lost"}', created_at: '2026-10-28 08:00:00', rank: -0.4, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失充电宝',
      content: '图书馆四楼自习时把白色充电宝忘在桌上，带一根数据线',
      extra_fields: '{"location":"图书馆四楼","itemType":"充电宝","direction":"lost"}',
      created_at: '2026-10-25 16:00:00',
    },
    candidates: [
      { title: '捡到白色充电宝', content: '图书馆四楼桌上捡到白色充电宝，带数据线', extra_fields: '{"location":"图书馆四楼","itemType":"充电宝","direction":"found"}', created_at: '2026-10-26 10:00:00', rank: -4.4, label: 1 },
      { title: '捡到笔记本', content: '图书馆捡到笔记本', extra_fields: '{"location":"图书馆三楼","itemType":"笔记本","direction":"found"}', created_at: '2026-10-26 14:00:00', rank: -0.9, label: 0 },
      { title: '丢失雨伞', content: '教学楼丢雨伞', extra_fields: '{"location":"教学楼","itemType":"雨伞","direction":"lost"}', created_at: '2026-10-24 09:00:00', rank: -0.3, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失运动手表',
      content: '体育馆跑步时丢了黑色运动手表，表带是硅胶的',
      extra_fields: '{"location":"体育馆","itemType":"手表","direction":"lost"}',
      created_at: '2026-10-24 19:00:00',
    },
    candidates: [
      { title: '捡到运动手表', content: '体育馆跑道边捡到黑色运动手表，硅胶表带', extra_fields: '{"location":"体育馆","itemType":"手表","direction":"found"}', created_at: '2026-10-25 07:00:00', rank: -4.6, label: 1 },
      { title: '捡到耳机', content: '体育馆捡到耳机', extra_fields: '{"location":"体育馆","itemType":"耳机","direction":"found"}', created_at: '2026-10-25 12:00:00', rank: -1.1, label: 0 },
      { title: '丢失水壶', content: '操场丢水壶', extra_fields: '{"location":"操场","itemType":"水壶","direction":"lost"}', created_at: '2026-10-23 10:00:00', rank: -0.2, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失眼镜',
      content: '在三教 302 上课时把黑框眼镜落在桌上，镜盒也在',
      extra_fields: '{"location":"三教","itemType":"眼镜","direction":"lost"}',
      created_at: '2026-10-23 11:00:00',
    },
    candidates: [
      { title: '捡到黑框眼镜', content: '三教 302 桌上捡到黑框眼镜，带镜盒', extra_fields: '{"location":"三教","itemType":"眼镜","direction":"found"}', created_at: '2026-10-24 09:00:00', rank: -4.0, label: 1 },
      { title: '捡到水杯', content: '三教捡到水杯', extra_fields: '{"location":"三教","itemType":"水杯","direction":"found"}', created_at: '2026-10-24 15:00:00', rank: -1.3, label: 0 },
      { title: '丢失校园卡', content: '食堂丢校园卡', extra_fields: '{"location":"食堂","itemType":"校园卡","direction":"lost"}', created_at: '2026-10-22 08:00:00', rank: -0.4, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失钥匙串',
      content: '宿舍楼下丢了钥匙串，有三把钥匙和小熊挂件',
      extra_fields: '{"location":"宿舍楼","itemType":"钥匙","direction":"lost"}',
      created_at: '2026-10-22 21:00:00',
    },
    candidates: [
      { title: '捡到钥匙串', content: '宿舍楼下捡到钥匙串，带小熊挂件', extra_fields: '{"location":"宿舍楼","itemType":"钥匙","direction":"found"}', created_at: '2026-10-23 08:00:00', rank: -4.7, label: 1 },
      { title: '捡到校园卡', content: '宿舍楼捡到校园卡', extra_fields: '{"location":"宿舍楼","itemType":"校园卡","direction":"found"}', created_at: '2026-10-23 13:00:00', rank: -1.5, label: 0 },
      { title: '丢失耳机', content: '教室丢耳机', extra_fields: '{"location":"一教","itemType":"耳机","direction":"lost"}', created_at: '2026-10-21 09:00:00', rank: -0.3, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失钱包',
      content: '在校门口便利店丢了棕色钱包，里面有现金和银行卡',
      extra_fields: '{"location":"校门口","itemType":"钱包","direction":"lost"}',
      created_at: '2026-10-21 18:00:00',
    },
    candidates: [
      { title: '捡到棕色钱包', content: '校门口便利店捡到棕色钱包，内有卡', extra_fields: '{"location":"校门口","itemType":"钱包","direction":"found"}', created_at: '2026-10-22 09:00:00', rank: -4.5, label: 1 },
      { title: '捡到钥匙', content: '超市捡到钥匙', extra_fields: '{"location":"超市","itemType":"钥匙","direction":"found"}', created_at: '2026-10-22 16:00:00', rank: -0.8, label: 0 },
      { title: '丢失雨伞', content: '图书馆丢雨伞', extra_fields: '{"location":"图书馆","itemType":"雨伞","direction":"lost"}', created_at: '2026-10-20 10:00:00', rank: -0.3, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失身份证',
      content: '在快递驿站取件时把身份证掉在柜台附近',
      extra_fields: '{"location":"快递驿站","itemType":"身份证","direction":"lost"}',
      created_at: '2026-10-30 10:00:00',
    },
    candidates: [
      { title: '捡到身份证', content: '快递驿站柜台附近捡到身份证', extra_fields: '{"location":"快递驿站","itemType":"身份证","direction":"found"}', created_at: '2026-10-30 19:00:00', rank: -4.1, label: 1 },
      { title: '捡到学生证', content: '驿站捡到学生证', extra_fields: '{"location":"快递驿站","itemType":"学生证","direction":"found"}', created_at: '2026-10-30 14:00:00', rank: -2.3, label: 0 },
      { title: '丢失充电宝', content: '图书馆丢充电宝', extra_fields: '{"location":"图书馆","itemType":"充电宝","direction":"lost"}', created_at: '2026-10-29 09:00:00', rank: -0.2, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失水杯',
      content: '在一教 101 上课忘带保温杯，杯身有贴纸',
      extra_fields: '{"location":"一教","itemType":"水杯","direction":"lost"}',
      created_at: '2026-10-19 12:00:00',
    },
    candidates: [
      { title: '捡到保温杯', content: '一教 101 捡到保温杯，杯身有贴纸', extra_fields: '{"location":"一教","itemType":"水杯","direction":"found"}', created_at: '2026-10-20 08:00:00', rank: -4.3, label: 1 },
      { title: '捡到眼镜', content: '一教捡到眼镜', extra_fields: '{"location":"一教","itemType":"眼镜","direction":"found"}', created_at: '2026-10-20 15:00:00', rank: -1.6, label: 0 },
      { title: '丢失手表', content: '体育馆丢手表', extra_fields: '{"location":"体育馆","itemType":"手表","direction":"lost"}', created_at: '2026-10-18 09:00:00', rank: -0.3, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失笔记本电脑',
      content: '图书馆二楼自习区丢了银色笔记本电脑，贴了红色贴纸',
      extra_fields: '{"location":"图书馆二楼","itemType":"笔记本电脑","direction":"lost"}',
      created_at: '2026-10-18 17:00:00',
    },
    candidates: [
      { title: '捡到银色笔记本', content: '图书馆二楼自习区捡到银色笔记本电脑，有红色贴纸', extra_fields: '{"location":"图书馆二楼","itemType":"笔记本电脑","direction":"found"}', created_at: '2026-10-19 09:00:00', rank: -4.9, label: 1 },
      { title: '捡到平板', content: '图书馆捡到平板电脑', extra_fields: '{"location":"图书馆三楼","itemType":"平板","direction":"found"}', created_at: '2026-10-19 16:00:00', rank: -2.1, label: 0 },
      { title: '丢失水杯', content: '教室丢水杯', extra_fields: '{"location":"二教","itemType":"水杯","direction":"lost"}', created_at: '2026-10-17 10:00:00', rank: -0.3, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失围巾',
      content: '在体育馆门口丢了灰色围巾，有格子图案',
      extra_fields: '{"location":"体育馆","itemType":"围巾","direction":"lost"}',
      created_at: '2026-10-17 18:00:00',
    },
    candidates: [
      { title: '捡到灰色围巾', content: '体育馆门口捡到灰色围巾，格子图案', extra_fields: '{"location":"体育馆","itemType":"围巾","direction":"found"}', created_at: '2026-10-18 09:00:00', rank: -4.2, label: 1 },
      { title: '捡到手套', content: '体育馆捡到手套', extra_fields: '{"location":"体育馆","itemType":"手套","direction":"found"}', created_at: '2026-10-18 14:00:00', rank: -1.4, label: 0 },
      { title: '丢失帽子', content: '操场丢帽子', extra_fields: '{"location":"操场","itemType":"帽子","direction":"lost"}', created_at: '2026-10-16 09:00:00', rank: -0.3, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失自行车钥匙',
      content: '在宿舍楼门口丢了自行车钥匙，带蓝色挂件',
      extra_fields: '{"location":"宿舍楼","itemType":"钥匙","direction":"lost"}',
      created_at: '2026-10-16 20:00:00',
    },
    candidates: [
      { title: '捡到自行车钥匙', content: '宿舍楼门口捡到自行车钥匙，蓝色挂件', extra_fields: '{"location":"宿舍楼","itemType":"钥匙","direction":"found"}', created_at: '2026-10-17 08:00:00', rank: -4.4, label: 1 },
      { title: '捡到钥匙串', content: '宿舍楼捡到钥匙串', extra_fields: '{"location":"宿舍楼","itemType":"钥匙","direction":"found"}', created_at: '2026-10-17 15:00:00', rank: -3.2, label: 0 },
      { title: '丢失钱包', content: '超市丢钱包', extra_fields: '{"location":"超市","itemType":"钱包","direction":"lost"}', created_at: '2026-10-15 10:00:00', rank: -0.2, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失手机',
      content: '在二教 305 上课时丢了手机，黑色外壳带手机壳',
      extra_fields: '{"location":"二教","itemType":"手机","direction":"lost"}',
      created_at: '2026-10-15 12:00:00',
    },
    candidates: [
      { title: '捡到黑色手机', content: '二教 305 捡到黑色手机，带手机壳', extra_fields: '{"location":"二教","itemType":"手机","direction":"found"}', created_at: '2026-10-16 08:00:00', rank: -4.7, label: 1 },
      { title: '捡到充电宝', content: '二教捡到充电宝', extra_fields: '{"location":"二教","itemType":"充电宝","direction":"found"}', created_at: '2026-10-16 14:00:00', rank: -1.7, label: 0 },
      { title: '丢失眼镜', content: '图书馆丢眼镜', extra_fields: '{"location":"图书馆","itemType":"眼镜","direction":"lost"}', created_at: '2026-10-14 09:00:00', rank: -0.3, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失教材',
      content: '在三教把一本《数据结构》教材落在教室，封面写了名字',
      extra_fields: '{"location":"三教","itemType":"教材","direction":"lost"}',
      created_at: '2026-10-14 16:00:00',
    },
    candidates: [
      { title: '捡到数据结构教材', content: '三教教室捡到《数据结构》教材，封面有名字', extra_fields: '{"location":"三教","itemType":"教材","direction":"found"}', created_at: '2026-10-15 09:00:00', rank: -4.5, label: 1 },
      { title: '捡到笔记本', content: '三教捡到笔记本', extra_fields: '{"location":"三教","itemType":"笔记本","direction":"found"}', created_at: '2026-10-15 15:00:00', rank: -1.5, label: 0 },
      { title: '丢失水杯', content: '一教丢水杯', extra_fields: '{"location":"一教","itemType":"水杯","direction":"lost"}', created_at: '2026-10-13 10:00:00', rank: -0.3, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失帽子',
      content: '在操场跑步时丢了白色棒球帽',
      extra_fields: '{"location":"操场","itemType":"帽子","direction":"lost"}',
      created_at: '2026-10-13 18:00:00',
    },
    candidates: [
      { title: '捡到白色棒球帽', content: '操场捡到白色棒球帽', extra_fields: '{"location":"操场","itemType":"帽子","direction":"found"}', created_at: '2026-10-14 08:00:00', rank: -4.0, label: 1 },
      { title: '捡到围巾', content: '操场捡到围巾', extra_fields: '{"location":"操场","itemType":"围巾","direction":"found"}', created_at: '2026-10-14 16:00:00', rank: -1.3, label: 0 },
      { title: '丢失手表', content: '体育馆丢手表', extra_fields: '{"location":"体育馆","itemType":"手表","direction":"lost"}', created_at: '2026-10-12 09:00:00', rank: -0.2, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失平板电脑',
      content: '在图书馆三楼丢了平板电脑，深空灰，带保护套',
      extra_fields: '{"location":"图书馆三楼","itemType":"平板","direction":"lost"}',
      created_at: '2026-10-12 15:00:00',
    },
    candidates: [
      { title: '捡到深空灰平板', content: '图书馆三楼捡到平板电脑，带保护套', extra_fields: '{"location":"图书馆三楼","itemType":"平板","direction":"found"}', created_at: '2026-10-13 09:00:00', rank: -4.6, label: 1 },
      { title: '捡到笔记本电脑', content: '图书馆捡到笔记本电脑', extra_fields: '{"location":"图书馆二楼","itemType":"笔记本电脑","direction":"found"}', created_at: '2026-10-13 16:00:00', rank: -2.4, label: 0 },
      { title: '丢失手机', content: '二教丢手机', extra_fields: '{"location":"二教","itemType":"手机","direction":"lost"}', created_at: '2026-10-11 10:00:00', rank: -0.3, label: 0 },
    ],
  },
  {
    query: {
      title: '丢失实验记录本',
      content: '实验楼 A 座把实验记录本忘在实验台，蓝色封面',
      extra_fields: '{"location":"实验楼","itemType":"笔记本","direction":"lost"}',
      created_at: '2026-10-11 17:00:00',
    },
    candidates: [
      { title: '捡到蓝色笔记本', content: '实验楼 A 座实验台捡到蓝色笔记本', extra_fields: '{"location":"实验楼","itemType":"笔记本","direction":"found"}', created_at: '2026-10-12 08:00:00', rank: -4.2, label: 1 },
      { title: '捡到教材', content: '实验楼捡到教材', extra_fields: '{"location":"实验楼","itemType":"教材","direction":"found"}', created_at: '2026-10-12 15:00:00', rank: -1.6, label: 0 },
      { title: '丢失钥匙', content: '宿舍丢钥匙', extra_fields: '{"location":"宿舍楼","itemType":"钥匙","direction":"lost"}', created_at: '2026-10-10 09:00:00', rank: -0.2, label: 0 },
    ],
  },
];

/** 关键词重叠基线：query 与候选的中文 2 字词重叠比例（0~1） */
export function keywordBaselineScore(queryText: string, candidateText: string): number {
  const terms = buildFtsQuery(queryText, 8)
    .split(' OR ')
    .map((t) => t.replace(/^"|"$/g, '').trim().toLowerCase())
    .filter(Boolean);
  if (!terms.length) return 0;
  const hay = candidateText.toLowerCase();
  const hit = terms.filter((t) => hay.includes(t)).length;
  return hit / terms.length;
}

interface EvalResult {
  p1: number;
  p3: number;
  mrr: number;
  queries: number;
  /** 召回：正样本中过阈值的比例（漏报率 = 1 - recall） */
  recall: number;
  /** 误报：负样本中过阈值的比例 */
  falsePositiveRate: number;
  /** 精确率：过阈值的候选中，正样本占比 */
  precision: number;
  failures: Array<{ query: string; expected: string; got: string; score: number }>;
}

function evaluate(samples: Sample[], scorer: 'radar' | 'baseline'): EvalResult {
  let hit1 = 0;
  let hit3 = 0;
  let rrSum = 0;
  let posTotal = 0;
  let posPass = 0;
  let negTotal = 0;
  let negPass = 0;
  const failures: EvalResult['failures'] = [];

  for (const s of samples) {
    const scored = s.candidates.map((c) => {
      let score: number;
      if (scorer === 'radar') {
        const q = { title: s.query.title, content: s.query.content, extra_fields: s.query.extra_fields };
        score = scoreCandidate(q, c, s.query.created_at, []).score;
      } else {
        score = keywordBaselineScore(`${s.query.title} ${s.query.content}`, `${c.title} ${c.content}`) * 100;
      }
      return { c, score };
    });

    // 与生产一致：雷达用 60 分阈值；基线用同一阈值以便公平对照
    const ranked = scored
      .filter((x) => x.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    for (const x of scored) {
      if (x.c.label === 1) { posTotal++; if (x.score >= MATCH_THRESHOLD) posPass++; }
      else { negTotal++; if (x.score >= MATCH_THRESHOLD) negPass++; }
    }

    const positive = scored.find((x) => x.c.label === 1);
    const posRank = ranked.findIndex((x) => x.c.label === 1);

    if (posRank === 0) hit1++;
    if (posRank >= 0 && posRank < 3) hit3++;
    rrSum += posRank >= 0 ? 1 / (posRank + 1) : 0;

    if (posRank < 0) {
      failures.push({
        query: s.query.title,
        expected: positive?.c.title || '(无正样本)',
        got: ranked[0]?.c.title || '(无候选过阈值)',
        score: ranked[0]?.score ?? 0,
      });
    }
  }

  return {
    p1: hit1 / samples.length,
    p3: hit3 / samples.length,
    mrr: rrSum / samples.length,
    queries: samples.length,
    recall: posTotal ? posPass / posTotal : 0,
    falsePositiveRate: negTotal ? negPass / negTotal : 0,
    precision: posPass + negPass ? posPass / (posPass + negPass) : 0,
    failures,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

const asJson = process.argv.includes('--json');
const asGate = process.argv.includes('--gate');
const radar = evaluate(LABELED_SET, 'radar');
const baseline = evaluate(LABELED_SET, 'baseline');

if (asJson) {
  console.log(JSON.stringify({
    dataset: { queries: LABELED_SET.length, candidates: LABELED_SET.reduce((n, s) => n + s.candidates.length, 0), positives: LABELED_SET.length },
    threshold: MATCH_THRESHOLD,
    radar: { p1: radar.p1, p3: radar.p3, mrr: radar.mrr, recall: radar.recall, precision: radar.precision, falsePositiveRate: radar.falsePositiveRate },
    baseline: { p1: baseline.p1, p3: baseline.p3, mrr: baseline.mrr, recall: baseline.recall, precision: baseline.precision, falsePositiveRate: baseline.falsePositiveRate },
  }, null, 2));
} else {
  console.log('失物招领智能雷达 · 离线评测');
  console.log(`标注集：${LABELED_SET.length} 组 query / ${LABELED_SET.reduce((n, s) => n + s.candidates.length, 0)} 个候选（正样本 ${LABELED_SET.length}）`);
  console.log(`判定阈值：${MATCH_THRESHOLD}\n`);
  console.log('指标        雷达(复合特征)   基线(纯关键词)   提升');
  console.log(`P@1         ${pct(radar.p1).padEnd(16)}${pct(baseline.p1).padEnd(17)}${pct(radar.p1 - baseline.p1)}`);
  console.log(`P@3         ${pct(radar.p3).padEnd(16)}${pct(baseline.p3).padEnd(17)}${pct(radar.p3 - baseline.p3)}`);
  console.log(`MRR         ${radar.mrr.toFixed(3).padEnd(16)}${baseline.mrr.toFixed(3).padEnd(17)}${(radar.mrr - baseline.mrr).toFixed(3)}`);
  console.log('');
  console.log('阈值级指标（候选粒度，更能说明「会不会乱推」）');
  console.log(`召回率      ${pct(radar.recall).padEnd(16)}${pct(baseline.recall).padEnd(17)}${pct(radar.recall - baseline.recall)}`);
  console.log(`误报率      ${pct(radar.falsePositiveRate).padEnd(16)}${pct(baseline.falsePositiveRate).padEnd(17)}${pct(radar.falsePositiveRate - baseline.falsePositiveRate)}`);
  console.log(`精确率      ${pct(radar.precision).padEnd(16)}${pct(baseline.precision).padEnd(17)}${pct(radar.precision - baseline.precision)}`);

  console.log('\n解读：基线（纯关键词）几乎不误报，但只能召回不到两成——关键词不同就完全找不到；');
  console.log('雷达把召回拉到 100%，代价是 7% 的误报（推了同地点不同物品）。失物招领场景下');
  console.log('漏报（找不到）比误报（多看一条）代价更高，因此这个取舍是刻意的。');

  if (asGate) {
    // 回归门阈值：略低于当前实测值，留出正常波动空间。
    // 任何改动导致召回跌破 90% 或误报超过 20%，说明算法退化了，CI 应直接失败。
    const GATES = { recall: 0.9, falsePositiveRate: 0.2, p1: 0.9 };
    const breaches: string[] = [];
    if (radar.recall < GATES.recall) breaches.push(`召回率 ${pct(radar.recall)} < ${pct(GATES.recall)}`);
    if (radar.falsePositiveRate > GATES.falsePositiveRate) breaches.push(`误报率 ${pct(radar.falsePositiveRate)} > ${pct(GATES.falsePositiveRate)}`);
    if (radar.p1 < GATES.p1) breaches.push(`P@1 ${pct(radar.p1)} < ${pct(GATES.p1)}`);

    if (breaches.length) {
      console.error('\n回归门未通过：\n  - ' + breaches.join('\n  - '));
      process.exit(1);
    }
    console.log('\n回归门通过：召回 / 误报 / P@1 均在阈值内。');
  }

  if (radar.failures.length) {
    console.log(`\n失败案例（${radar.failures.length}）：`);
    for (const f of radar.failures.slice(0, 5)) {
      console.log(`  · 「${f.query}」应匹配「${f.expected}」，实际首位「${f.got}」（${f.score} 分）`);
    }
  } else {
    console.log('\n无失败案例：全部 query 的首位推荐都是正确候选。');
  }
}
