// 本地占位资源：内联 SVG（data URI），去除 Picsum 外链依赖
function avatarPlaceholder(seed) {
  const palette = ['#16A085', '#20C4A4', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#10B981']
  let h = 0
  for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const c1 = palette[h % palette.length]
  const c2 = palette[(h >> 3) % palette.length]
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs><rect width='100' height='100' fill='url(#g)'/><text x='50%' y='54%' font-size='44' fill='#fff' text-anchor='middle' dominant-baseline='middle' font-family='sans-serif'>${(seed || '?').toString().slice(0, 1).toUpperCase()}</text></svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

function photoPlaceholder(seed) {
  const palette = ['#16A085', '#20C4A4', '#3B82F6', '#F59E0B', '#8B5CF6', '#10B981', '#0EA5E9', '#F472B6']
  let hash = 0
  for (const ch of String(seed || '')) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0
  const c1 = palette[hash % palette.length]
  const c2 = palette[(hash >> 4) % palette.length]
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs><rect width='400' height='300' fill='url(#g)'/><text x='50%' y='50%' font-size='40' fill='rgba(255,255,255,0.85)' text-anchor='middle' dominant-baseline='middle' font-family='sans-serif'>校园墙</text></svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

const mockPosts = [
  {
    id: '1',
    category: 'lost',
    subType: 'campus_card',
    title: '捡到一张校园卡',
    content: '今天中午在食堂二楼捡到一张校园卡，姓名显示为张同学，请失主联系我领取～',
    images: [photoPlaceholder('mock1')],
    author: {
      id: 'u1',
      nickname: '热心同学',
      avatar: avatarPlaceholder('u10'),
      isAnonymous: false
    },
    campus: '主校区',
    location: '第二食堂二楼',
    time: Date.now() - 3600000,
    likes: 12,
    comments: 3,
    favorites: 5,
    isLiked: false,
    isFavorited: false,
    tags: ['失物招领', '校园卡'],
    status: 'active',
    extra: {
      foundTime: '2026-05-12 12:30',
      foundLocation: '第二食堂二楼',
      contactInfo: '微信号: xxx123'
    }
  },
  {
    id: '2',
    category: 'confession',
    subType: 'confession',
    title: '',
    content: '图书馆三楼靠窗位置的那个戴眼镜的女生，每天都能看到你认真学习的样子，真的好喜欢你呀～希望能交个朋友💕',
    images: [],
    author: {
      id: 'u2',
      nickname: '匿名用户',
      avatar: '',
      isAnonymous: true
    },
    campus: '主校区',
    location: '',
    time: Date.now() - 7200000,
    likes: 56,
    comments: 15,
    favorites: 8,
    isLiked: false,
    isFavorited: false,
    tags: ['表白墙', '匿名表白'],
    status: 'active',
    extra: {}
  },
  {
    id: '3',
    category: 'help',
    subType: 'study',
    title: '求高数期末复习资料！',
    content: '有没有学长学姐有高数下册的复习笔记或者历年真题呀？期末要挂了😭可以请喝奶茶！',
    images: [],
    author: {
      id: 'u3',
      nickname: '学渣本渣',
      avatar: avatarPlaceholder('u30'),
      isAnonymous: false
    },
    campus: '南校区',
    location: '',
    time: Date.now() - 10800000,
    likes: 8,
    comments: 7,
    favorites: 3,
    isLiked: false,
    isFavorited: false,
    tags: ['校园求助', '学习求助'],
    status: 'active',
    extra: {
      deadline: '2026-05-20',
      isResolved: false
    }
  },
  {
    id: '4',
    category: 'trade',
    subType: 'digital',
    title: '出iPad Air 5 256G',
    content: '毕业了出iPad Air 5，256G wifi版，去年9月购入，有发票有保修，屏幕无划痕，配原装键盘和笔，全套出2800，可小刀～',
    images: [photoPlaceholder('mock4'), photoPlaceholder('mock5')],
    author: {
      id: 'u4',
      nickname: '毕业学长',
      avatar: avatarPlaceholder('u40'),
      isAnonymous: false
    },
    campus: '主校区',
    location: '校内自提',
    time: Date.now() - 14400000,
    likes: 23,
    comments: 9,
    favorites: 15,
    isLiked: false,
    isFavorited: false,
    tags: ['二手闲置', '电子数码'],
    status: 'active',
    extra: {
      price: 2800,
      condition: '9成新',
      tradeMethod: '自提',
      tradeLocation: '主校区南门'
    }
  },
  {
    id: '5',
    category: 'carshare',
    subType: 'station',
    title: '5月15日拼车去高铁站',
    content: '5月15日下午3点出发去高铁站，目前2人，还能再坐2人，费用AA大概15块/人，有意者加微信～',
    images: [],
    author: {
      id: 'u5',
      nickname: '旅行达人',
      avatar: avatarPlaceholder('u50'),
      isAnonymous: false
    },
    campus: '主校区',
    location: '主校区南门',
    time: Date.now() - 18000000,
    likes: 5,
    comments: 4,
    favorites: 2,
    isLiked: false,
    isFavorited: false,
    tags: ['拼车', '高铁站'],
    status: 'active',
    extra: {
      departureTime: '2026-05-15 15:00',
      departureLocation: '主校区南门',
      destination: '高铁站',
      maxPeople: 4,
      currentPeople: 2,
      costPerPerson: 15
    }
  },
  {
    id: '6',
    category: 'team',
    subType: 'competition',
    title: '互联网+大赛组队',
    content: '今年互联网+大赛有没有一起组队的同学？我负责技术开发，还需要产品经理和运营同学，有经验的优先！',
    images: [],
    author: {
      id: 'u6',
      nickname: '代码小王子',
      avatar: avatarPlaceholder('u60'),
      isAnonymous: false
    },
    campus: '主校区',
    location: '',
    time: Date.now() - 21600000,
    likes: 18,
    comments: 12,
    favorites: 6,
    isLiked: false,
    isFavorited: false,
    tags: ['组队', '比赛'],
    status: 'active',
    extra: {
      teamName: '待定',
      recruitCount: 3,
      deadline: '2026-05-20',
      requirements: '需要产品经理和运营经验'
    }
  },
  {
    id: '7',
    category: 'daily',
    subType: 'fun',
    title: '今天食堂的黑暗料理',
    content: '食堂今天出了个草莓炒鸡蛋！！！我整个人都震惊了🤯 有没有勇士去尝试一下的？',
    images: [photoPlaceholder('mock7')],
    author: {
      id: 'u7',
      nickname: '干饭人',
      avatar: avatarPlaceholder('u70'),
      isAnonymous: false
    },
    campus: '北校区',
    location: '第一食堂',
    time: Date.now() - 25200000,
    likes: 89,
    comments: 34,
    favorites: 12,
    isLiked: false,
    isFavorited: false,
    tags: ['校园日常', '校园趣事'],
    status: 'active',
    extra: {}
  },
  {
    id: '8',
    category: 'lost',
    subType: 'keys',
    title: '丢失一串钥匙',
    content: '昨天晚上在操场跑步的时候丢了一串钥匙，上面有三个钥匙和一个蓝色小挂件，捡到的同学请联系我！万分感谢🙏',
    images: [],
    author: {
      id: 'u8',
      nickname: '马虎同学',
      avatar: avatarPlaceholder('u80'),
      isAnonymous: false
    },
    campus: '主校区',
    location: '操场',
    time: Date.now() - 28800000,
    likes: 6,
    comments: 2,
    favorites: 1,
    isLiked: false,
    isFavorited: false,
    tags: ['寻物启事', '钥匙'],
    status: 'active',
    extra: {
      lostTime: '2026-05-11 21:00',
      lostLocation: '操场跑道',
      contactInfo: '手机: 138****8888',
      reward: 50
    }
  }
]

const mockComments = [
  {
    id: 'c1',
    postId: '1',
    author: {
      id: 'u10',
      nickname: '张同学',
      avatar: avatarPlaceholder('u11'),
      isAnonymous: false
    },
    content: '那是我的卡！请问在哪里领取？',
    time: Date.now() - 1800000,
    likes: 3,
    isLiked: false,
    replies: [
      {
        id: 'r1',
        commentId: 'c1',
        author: {
          id: 'u1',
          nickname: '热心同学',
          avatar: avatarPlaceholder('u10'),
          isAnonymous: false
        },
        content: '我在食堂二楼阿姨那边，你直接去问就行～',
        replyTo: {
          id: 'u10',
          nickname: '张同学'
        },
        time: Date.now() - 900000,
        likes: 1,
        isLiked: false
      }
    ]
  },
  {
    id: 'c2',
    postId: '1',
    author: {
      id: 'u11',
      nickname: '路过的',
      avatar: avatarPlaceholder('u12'),
      isAnonymous: false
    },
    content: '好人一生平安！',
    time: Date.now() - 3600000,
    likes: 5,
    isLiked: false,
    replies: []
  }
]

const mockHotTopics = [
  { id: 't1', name: '期末考试', count: 234 },
  { id: 't2', name: '毕业季', count: 189 },
  { id: 't3', name: '新生攻略', count: 156 },
  { id: 't4', name: '食堂美食', count: 132 },
  { id: 't5', name: '校园风景', count: 98 },
  { id: 't6', name: '社团招新', count: 87 },
  { id: 't7', name: '考研', count: 76 },
  { id: 't8', name: '实习', count: 65 }
]

const mockNotifications = [
  {
    id: 'n1',
    type: 'comment',
    title: '评论提醒',
    content: '张同学 评论了你的帖子 "捡到一张校园卡"',
    time: Date.now() - 1800000,
    isRead: false,
    postId: '1'
  },
  {
    id: 'n2',
    type: 'like',
    title: '点赞提醒',
    content: '5人 赞了你的帖子 "捡到一张校园卡"',
    time: Date.now() - 3600000,
    isRead: false,
    postId: '1'
  },
  {
    id: 'n3',
    type: 'reply',
    title: '回复提醒',
    content: '热心同学 回复了你的评论',
    time: Date.now() - 5400000,
    isRead: true,
    postId: '1'
  },
  {
    id: 'n4',
    type: 'mention',
    title: '@我的',
    content: '代码小王子 在帖子中@了你',
    time: Date.now() - 7200000,
    isRead: true,
    postId: '6'
  }
]

const mockUserInfo = {
  id: 'u100',
  nickname: '校园达人',
  avatar: avatarPlaceholder('u100'),
  signature: '热爱校园生活~',
  phone: '138****8888',
  campus: '主校区',
  postCount: 12,
  favoriteCount: 25,
  likeCount: 68,
  followerCount: 45,
  followingCount: 32
}

module.exports = {
  mockPosts,
  mockComments,
  mockHotTopics,
  mockNotifications,
  mockUserInfo
}