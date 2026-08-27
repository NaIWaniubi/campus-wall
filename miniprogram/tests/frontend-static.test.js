const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8')
}

function walk(dir, predicate, acc = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name).replace(/\\/g, '/')
    if (entry.isDirectory()) walk(rel, predicate, acc)
    if (entry.isFile() && predicate(rel)) acc.push(rel)
  }
  return acc
}

test('tab publish page is opened with switchTab storage handoff, not navigateTo', () => {
  const files = walk('pages', rel => rel.endsWith('.js'))
  const offenders = files.filter(rel => /wx\.navigateTo\(\{\s*url:\s*[`'"]\/pages\/publish\/publish/.test(read(rel)))
  assert.deepEqual(offenders, [])
})

test('list reaction handlers call backend instead of local-only toggles', () => {
  const files = walk('pages', rel => rel.endsWith('.js'))
  const offenders = files.filter(rel => /isLiked:\s*!p\.isLiked|isFavorited:\s*!p\.isFavorited/.test(read(rel)))
  assert.deepEqual(offenders, [])
})

test('settings cache cleanup does not clear authentication storage', () => {
  const files = walk('pages', rel => rel.endsWith('.js')).concat(walk('utils', rel => rel.endsWith('.js')))
  const offenders = files.filter(rel => /wx\.clearStorageSync\(\)/.test(read(rel)))
  assert.deepEqual(offenders, [])
})

test('pages rendering post-card define native share handler', () => {
  const wxmlFiles = walk('pages', rel => rel.endsWith('.wxml'))
  const offenders = wxmlFiles
    .filter(rel => /<post-card\b/.test(read(rel)))
    .map(rel => rel.replace(/\.wxml$/, '.js'))
    .filter(rel => !/onShareAppMessage\s*\(/.test(read(rel)))
  assert.deepEqual(offenders, [])
})

test('wxml event handlers exist in matching page or component script', () => {
  const files = walk('pages', rel => rel.endsWith('.wxml')).concat(walk('components', rel => rel.endsWith('.wxml')))
  const offenders = []
  const eventPattern = /\b(?:bind|catch)(?::?[a-zA-Z][\w-]*)?="([a-zA-Z_$][\w$]*)"/g

  for (const wxml of files) {
    const js = wxml.replace(/\.wxml$/, '.js')
    const source = read(js)
    const markup = read(wxml)
    const names = new Set()
    let match
    while ((match = eventPattern.exec(markup))) names.add(match[1])
    for (const name of names) {
      const methodPattern = new RegExp(`${name}\\s*\\(`)
      if (!methodPattern.test(source)) offenders.push(`${wxml} -> ${name}`)
    }
  }

  assert.deepEqual(offenders, [])
})

test('profile page does not expose deferred phone binding flow', () => {
  const source = `${read('pages/mine/profile/profile.js')}\n${read('pages/mine/profile/profile.wxml')}`
  assert.equal(/onBindPhone|手机号|phone/.test(source), false)
})

test('old purple template tokens are not used as active product colors', () => {
  const files = ['app.json', 'app.wxss']
    .concat(walk('utils', rel => /\.(js|json|wxml|wxss)$/.test(rel)))
    .concat(walk('pages', rel => /\.(js|json|wxml|wxss)$/.test(rel)))
    .concat(walk('components', rel => /\.(js|json|wxml|wxss)$/.test(rel)))
  const offenders = files.filter(rel => /#6C5CE7|#A29BFE|108,\s*92,\s*231/.test(read(rel)))
  assert.deepEqual(offenders, [])
})

test('upload endpoint requires authentication', () => {
  // 后端上传路由见 E:\校园墙\api\routes\upload.ts（authRequired）；前端等价断言：
  // 上传必须携带 Bearer Authorization 头
  const source = read('utils/api.js')
  const uploadBlock = source.slice(source.indexOf('wx.uploadFile'))
  assert.match(uploadBlock, /'Authorization':\s*'Bearer '\s*\+/)
})

test('api auth failure clears both token and cached user info', () => {
  const source = read('utils/api.js')
  assert.match(source, /globalData\.userInfo\s*=\s*null/)
  assert.match(source, /removeStorageSync\('userInfo'\)/)
})

test('publish tab does not reuse the home tab icon', () => {
  const config = JSON.parse(read('app.json'))
  const publish = config.tabBar.list.find(item => item.pagePath === 'pages/publish/publish')
  const home = config.tabBar.list.find(item => item.pagePath === 'pages/index/index')
  assert.notEqual(publish.iconPath, home.iconPath)
  assert.notEqual(publish.selectedIconPath, home.selectedIconPath)
})

test('publish extra fields stay inside the backend whitelist', () => {
  const source = read('pages/publish/publish.js')
  // 后端 PUT /posts/:id 的 EXTRA_FIELD_WHITELIST：price/contact/location/tradeType/condition/time/itemType/organizer
  assert.match(source, /lost:\s*\[[^\]]*'location'/)
  assert.match(source, /carshare:\s*\[[^\]]*'time'/)
  assert.match(source, /'price',\s*'contact',\s*'location',\s*'tradeType'/)
})

test('publish forces anonymous posting for the treehole section', () => {
  const js = read('pages/publish/publish.js')
  const wxml = read('pages/publish/publish.wxml')
  assert.match(js, /FORCED_ANONYMOUS_CATEGORIES/)
  assert.match(js, /daily/)
  assert.match(wxml, /disabled="\{\{forcedAnonymous\}\}"/)
})

test('publish compresses images before upload', () => {
  const source = read('pages/publish/publish.js')
  assert.match(source, /wx\.compressImage/)
  assert.match(source, /quality:\s*80/)
})

test('upload file response parsing is guarded', () => {
  const source = read('utils/api.js')
  assert.match(source, /try\s*\{[\s\S]*JSON\.parse\(res\.data\)/)
  assert.match(source, /上传响应异常/)
})

test('feed empty state guides users to publish or retry', () => {
  const js = read('pages/index/index.js')
  const wxml = read('pages/index/index.wxml')
  assert.match(js, /emptyStateText/)
  assert.match(js, /onEmptyStateAction\s*\(/)
  assert.match(js, /onGoPublish\s*\(/)
  assert.match(wxml, /btnText="\{\{emptyStateBtnText\}\}"/)
  assert.match(wxml, /bind:btntap="onEmptyStateAction"/)
})

test('publish page exposes live missing-field guidance', () => {
  const js = read('pages/publish/publish.js')
  const wxml = read('pages/publish/publish.wxml')
  assert.match(js, /publishTip/)
  assert.match(js, /getPublishTip\s*\(/)
  assert.match(wxml, /publish-tip/)
})

test('chat page wires real conversation APIs with polling instead of a coming-soon notice', () => {
  const js = read('pages/message/chat/chat.js')
  const wxml = read('pages/message/chat/chat.wxml')
  // 后端已上线 /conversations 系列：chat 页必须真接线并轮询新消息
  assert.match(js, /\/conversations/)
  assert.match(js, /setInterval/)
  assert.match(js, /clearInterval/)
  assert.doesNotMatch(wxml, /即将上线/)
})

test('message page chat tab renders real conversations and silent wx login chain exists', () => {
  const messageJs = read('pages/message/message.js')
  const appJs = read('app.js')
  const apiJs = read('utils/api.js')
  assert.match(messageJs, /loadConversations\s*\(/)
  assert.match(messageJs, /\/conversations/)
  assert.match(appJs, /wx\.login/)
  assert.match(apiJs, /wx-login/)
  assert.match(apiJs, /silentCodes:\s*\[501\]/)
})

test('search input resets result mode when keyword is cleared', () => {
  const source = read('pages/search/search.js')
  assert.match(source, /value\.trim\(\)/)
  assert.match(source, /hasSearched:\s*false/)
  assert.match(source, /activeFilter:\s*'all'/)
})

test('feedback submit clears local form after successful submission', () => {
  const source = read('pages/mine/feedback/feedback.js')
  assert.match(source, /resetForm\s*\(/)
  assert.match(source, /content:\s*''/)
  assert.match(source, /contact:\s*''/)
  assert.match(source, /imageList:\s*\[\]/)
})

test('post detail keeps author identity on one stable row and hides empty detail panels', () => {
  const wxml = read('pages/detail/detail.wxml')
  const wxss = read('pages/detail/detail.wxss')
  assert.match(wxml, /class="post-author"/)
  assert.match(wxml, /class="post-header-actions"/)
  assert.match(wxml, /class="post-context-row"/)
  assert.match(wxml, /wx:if="\{\{post\.extra\.price \|\| post\.extra\.condition/)
  assert.match(wxss, /\.post-author\s*\{[\s\S]*?min-width:\s*0/)
  assert.match(wxss, /\.author-name\s*\{[\s\S]*?white-space:\s*nowrap/)
  assert.match(wxss, /\.contact-btn\s*\{[\s\S]*?width:\s*100%/)
})

test('post feed card owns a horizontal action layout instead of relying on blank image icons', () => {
  const wxml = read('components/post-card/post-card.wxml')
  const wxss = read('components/post-card/post-card.wxss')
  assert.match(wxml, /class="post-author"/)
  assert.match(wxml, /class="post-author-actions"/)
  assert.match(wxml, /class="action-symbol"/)
  assert.doesNotMatch(wxml, /class="action-icon"/)
  assert.match(wxml, /class="post-footer"/)
  assert.match(wxss, /\.post-footer\s*\{[\s\S]*?display:\s*flex/)
  assert.match(wxss, /\.action-btn\s*\{[\s\S]*?flex:\s*1/)
  assert.match(wxss, /\.post-author\s*\{[\s\S]*?min-width:\s*0/)
})

test('tab navigation uses a compact custom bar with visible icon assets', () => {
  const config = JSON.parse(read('app.json'))
  assert.equal(config.tabBar.custom, true)
  assert.match(read('custom-tab-bar/index.wxml'), /class="tabbar\b/)
  assert.match(read('custom-tab-bar/index.wxss'), /\.tab-publish/)
  assert.match(read('custom-tab-bar/index.js'), /wx\.switchTab/)
  assert.match(read('custom-tab-bar/index.js'), /\.svg/)
})

test('home feed uses an editorial color ribbon and motion-rich content surfaces', () => {
  const wxml = read('pages/index/index.wxml')
  const pageStyle = read('pages/index/index.wxss')
  const cardStyle = read('components/post-card/post-card.wxss')
  assert.match(wxml, /class="color-ribbon"/)
  assert.match(wxml, /class="campus-signal"/)
  assert.match(wxml, /class="topic-rail"/)
  assert.match(pageStyle, /@keyframes ribbonFlow/)
  assert.match(pageStyle, /@keyframes signalGlow/)
  assert.match(cardStyle, /@keyframes edgeSweep/)
  assert.match(cardStyle, /\.post-card::before/)
})

test('home feed gives color a substantial editorial canvas without coloring body copy', () => {
  const wxml = read('pages/index/index.wxml')
  const wxss = read('pages/index/index.wxss')
  assert.match(wxml, /class="campus-canvas"/)
  assert.match(wxml, /class="canvas-band canvas-cyan"/)
  assert.match(wxml, /class="canvas-band canvas-coral"/)
  assert.match(wxss, /\.campus-canvas\s*\{[\s\S]*?height:\s*154rpx/)
  assert.match(wxss, /\.topic-orbit\s*\{[\s\S]*?background:/)
  assert.match(wxss, /\.canvas-content\s*\{[\s\S]*?color:\s*#FFFFFF/)
})

test('custom navigation carries the colorful visual language with distinct active accents', () => {
  const style = read('custom-tab-bar/index.wxss')
  assert.match(style, /\.tabbar\s*\{[\s\S]*?background:\s*linear-gradient/)
  assert.match(style, /\.tab-item:nth-child\(1\)\.is-active .tab-icon-wrap/)
  assert.match(style, /\.tab-item:nth-child\(2\)\.is-active .tab-icon-wrap/)
  assert.match(style, /\.tab-item:nth-child\(4\)\.is-active .tab-icon-wrap/)
  assert.match(style, /\.tab-item:nth-child\(5\)\.is-active .tab-icon-wrap/)
})
