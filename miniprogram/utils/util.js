const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

const timeAgo = dateTimeStamp => {
  const minute = 1000 * 60
  const hour = minute * 60
  const day = hour * 24
  const month = day * 30
  const now = new Date().getTime()
  const diffValue = now - dateTimeStamp

  if (diffValue < 0) return '刚刚'

  const monthC = diffValue / month
  const weekC = diffValue / (7 * day)
  const dayC = diffValue / day
  const hourC = diffValue / hour
  const minC = diffValue / minute

  if (monthC >= 1) {
    return parseInt(monthC) + '个月前'
  } else if (weekC >= 1) {
    return parseInt(weekC) + '周前'
  } else if (dayC >= 1) {
    return parseInt(dayC) + '天前'
  } else if (hourC >= 1) {
    return parseInt(hourC) + '小时前'
  } else if (minC >= 1) {
    return parseInt(minC) + '分钟前'
  }
  return '刚刚'
}

const debounce = (fn, delay = 500) => {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

const throttle = (fn, delay = 500) => {
  let last = 0
  return function (...args) {
    const now = Date.now()
    if (now - last >= delay) {
      last = now
      fn.apply(this, args)
    }
  }
}

const generateRandomName = () => {
  const adjectives = ['快乐的', '聪明的', '勇敢的', '温柔的', '可爱的', '帅气的', '美丽的', '阳光的', '机智的', '善良的']
  const nouns = ['小熊', '小猫', '小狗', '小兔', '小鸟', '小鱼', '小虎', '小龙', '小狐', '小鹿']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  return adj + noun
}

const sensitiveWordsFilter = content => {
  const sensitiveWords = ['违禁词1', '违禁词2', '违禁词3']
  let filteredContent = content
  sensitiveWords.forEach(word => {
    const reg = new RegExp(word, 'gi')
    filteredContent = filteredContent.replace(reg, '*'.repeat(word.length))
  })
  return filteredContent
}

const validatePhone = phone => {
  return /^1[3-9]\d{9}$/.test(phone)
}

const validateContent = content => {
  if (!content || content.trim().length === 0) {
    return { valid: false, msg: '内容不能为空' }
  }
  if (content.length > 500) {
    return { valid: false, msg: '内容不能超过500字' }
  }
  return { valid: true, msg: '' }
}

const compressImage = (tempFilePath, quality = 80) => {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: tempFilePath,
      quality: quality,
      success: res => resolve(res.tempFilePath),
      fail: err => reject(err)
    })
  })
}

const chooseImage = (count = 9) => {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: res => {
        const tempFiles = res.tempFiles.map(file => file.tempFilePath)
        resolve(tempFiles)
      },
      fail: err => reject(err)
    })
  })
}

const previewImage = (current, urls) => {
  wx.previewImage({
    current: current,
    urls: urls
  })
}

const showToast = (title, icon = 'none', duration = 2000) => {
  wx.showToast({
    title: title,
    icon: icon,
    duration: duration
  })
}

// 引用计数：并发多个请求时，先完成的那个调 hideLoading 会提前撤掉遮罩，
// 而后台请求仍在 pending —— 用户以为加载完了，其实还没。计数归零才真正撤罩。
let loadingCount = 0

const showLoading = (title = '加载中...') => {
  loadingCount += 1
  wx.showLoading({
    title: title,
    mask: true
  })
}

const hideLoading = () => {
  loadingCount = Math.max(0, loadingCount - 1)
  if (loadingCount === 0) wx.hideLoading()
}

const showModal = (title, content, confirmText = '确定', cancelText = '取消') => {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: title,
      content: content,
      confirmText: confirmText,
      cancelText: cancelText,
      success: res => {
        if (res.confirm) {
          resolve(true)
        } else {
          resolve(false)
        }
      },
      fail: err => reject(err)
    })
  })
}

module.exports = {
  formatTime,
  formatNumber,
  timeAgo,
  debounce,
  throttle,
  generateRandomName,
  sensitiveWordsFilter,
  validatePhone,
  validateContent,
  compressImage,
  chooseImage,
  previewImage,
  showToast,
  showLoading,
  hideLoading,
  showModal
}
