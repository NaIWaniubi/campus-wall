/**
 * 板块常量：新后端 section id（1-8）与旧版分类 key 的双向映射。
 * 后端种子数据见 E:\校园墙\api\db.ts：
 * 1二手交易 2失物招领 3表白墙 4吐槽树洞 5互助问答 6校园活动 7拼车 8组队
 * 页面统一从这里取板块 id，禁止散落硬编码。
 */
const SECTIONS = {
  TRADE: 1,       // 二手交易
  LOST: 2,        // 失物招领
  CONFESSION: 3,  // 表白墙
  TREEHOLE: 4,    // 吐槽树洞（旧版 daily 校园日常）
  QA: 5,          // 互助问答（旧版 help 校园求助）
  ACTIVITY: 6,    // 校园活动（旧版无对应，新增）
  CARSHARE: 7,    // 拼车
  TEAM: 8         // 组队
}

const SECTION_LIST = [
  { id: 1, key: 'trade', name: '二手交易' },
  { id: 2, key: 'lost', name: '失物招领' },
  { id: 3, key: 'confession', name: '表白墙' },
  { id: 4, key: 'daily', name: '吐槽树洞' },
  { id: 5, key: 'help', name: '互助问答' },
  { id: 6, key: 'activity', name: '校园活动' },
  { id: 7, key: 'carshare', name: '拼车' },
  { id: 8, key: 'team', name: '组队' }
]

// 旧分类 key -> 新板块 id
const CATEGORY_TO_SECTION = {
  trade: 1,
  lost: 2,
  confession: 3,
  daily: 4,
  help: 5,
  activity: 6,
  carshare: 7,
  team: 8
}

// 新板块 id -> 旧分类 key（post-card / detail 等按 category 渲染时用）
const SECTION_TO_CATEGORY = {}
Object.keys(CATEGORY_TO_SECTION).forEach(function (k) {
  SECTION_TO_CATEGORY[CATEGORY_TO_SECTION[k]] = k
})

/**
 * 站内消息类型元数据（新后端 GET /messages 的 type 值域）：
 * match 失物招领匹配提醒 / digest 每日摘要 / system 系统（审核、信誉分、封禁等）。
 * 消息页与通知页共用，避免散落三元表达式。
 */
const MESSAGE_TYPES = {
  match: { name: '匹配提醒', icon: '🔍' },
  digest: { name: '每日摘要', icon: '📊' },
  system: { name: '系统通知', icon: '📢' },
  comment: { name: '评论', icon: '💬' },
  like: { name: '点赞', icon: '❤️' },
  chat: { name: '私信', icon: '📨' }
}

function getMessageTypeMeta(type) {
  return MESSAGE_TYPES[type] || { name: '通知', icon: '🔔' }
}

module.exports = {
  SECTIONS,
  SECTION_LIST,
  CATEGORY_TO_SECTION,
  SECTION_TO_CATEGORY,
  MESSAGE_TYPES,
  getMessageTypeMeta
}
