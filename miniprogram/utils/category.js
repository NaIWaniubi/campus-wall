const CATEGORY_CONFIG = {
  lost: {
    id: 'lost',
    name: '失物招领',
    icon: '🔍',
    color: '#16A085',
    subTypes: [
      { id: 'campus_card', name: '校园卡' },
      { id: 'keys', name: '钥匙' },
      { id: 'phone', name: '手机' },
      { id: 'clothes', name: '衣物' },
      { id: 'id_card', name: '证件' },
      { id: 'other', name: '其他' }
    ]
  },
  confession: {
    id: 'confession',
    name: '表白墙',
    icon: '💕',
    color: '#FF6B6B',
    subTypes: [
      { id: 'confession', name: '匿名表白' },
      { id: 'mention', name: '@同学' },
      { id: 'birthday', name: '生日祝福' },
      { id: 'holiday', name: '节日祝福' },
      { id: 'graduation', name: '毕业祝福' }
    ]
  },
  help: {
    id: 'help',
    name: '校园求助',
    icon: '🆘',
    color: '#FECA57',
    subTypes: [
      { id: 'study', name: '学习求助' },
      { id: 'life', name: '生活求助' },
      { id: 'other', name: '其他咨询' }
    ]
  },
  trade: {
    id: 'trade',
    name: '二手闲置',
    icon: '📦',
    color: '#00D2D3',
    subTypes: [
      { id: 'textbook', name: '课本教材' },
      { id: 'digital', name: '电子数码' },
      { id: 'beauty', name: '美妆护肤' },
      { id: 'daily', name: '生活用品' },
      { id: 'sports', name: '运动器材' },
      { id: 'other', name: '其他' }
    ]
  },
  carshare: {
    id: 'carshare',
    name: '拼车/拼单',
    icon: '🚗',
    color: '#3498DB',
    subTypes: [
      { id: 'campus_commute', name: '校区通勤' },
      { id: 'station', name: '高铁站/机场' },
      { id: 'holiday_trip', name: '节假日出行' },
      { id: 'food_share', name: '外卖拼单' },
      { id: 'group_buy', name: '零食团购' },
      { id: 'daily_buy', name: '生活用品团购' }
    ]
  },
  team: {
    id: 'team',
    name: '社团/组队',
    icon: '👥',
    color: '#1ABC9C',
    subTypes: [
      { id: 'club', name: '社团招新' },
      { id: 'competition', name: '比赛组队' },
      { id: 'study_partner', name: '学习搭子' },
      { id: 'hobby', name: '兴趣小组' }
    ]
  },
  daily: {
    id: 'daily',
    name: '校园日常',
    icon: '🌟',
    color: '#E67E22',
    subTypes: [
      { id: 'share', name: '生活分享' },
      { id: 'positive', name: '正能量' },
      { id: 'fun', name: '校园趣事' },
      { id: 'rant', name: '匿名吐槽' }
    ]
  },
  activity: {
    id: 'activity',
    name: '校园活动',
    icon: '🎉',
    color: '#9B59B6',
    subTypes: [
      { id: 'show', name: '文体演出' },
      { id: 'lecture', name: '讲座论坛' },
      { id: 'club', name: '社团活动' },
      { id: 'match', name: '比赛赛事' },
      { id: 'other', name: '其他' }
    ]
  }
}

const getCategoryList = () => {
  return Object.keys(CATEGORY_CONFIG).map(key => CATEGORY_CONFIG[key])
}

const getCategoryById = (id) => {
  return CATEGORY_CONFIG[id] || null
}

const getSubTypeList = (categoryId) => {
  const category = CATEGORY_CONFIG[categoryId]
  return category ? category.subTypes : []
}

module.exports = {
  CATEGORY_CONFIG,
  getCategoryList,
  getCategoryById,
  getSubTypeList
}
