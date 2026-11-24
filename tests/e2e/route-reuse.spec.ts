/**
 * R4 审查 P1 回归：同路径换路由参数的组件复用不重载。
 *
 * App.vue 的 RouterView 无 :key：/post/:id → /post/:id（详情页「可能相关」卡片、
 * 雷达候选、通知跳转全是 router.push 同路径不同参数）复用同一组件实例，
 * onMounted 不重跑 → 新 id 仍渲染旧帖内容，点赞/删除/回复全部作用于错误帖子。
 *
 * 场景：造一对失物招领帖（丢卡/捡卡互为雷达候选）→ 打开 A 详情 → 点 B 候选卡片
 * （同路径换参数）→ 断言内容换成 B、A 标题消失；再点回 A 断言可逆。
 */
import { expect } from '@playwright/test'
import { test, login } from './helpers'

async function publishLostFound(page: import('@playwright/test').Page, variant: 'lost' | 'found', stamp: number): Promise<number> {
  // R4E2E 踩坑记录：发帖页草稿是 localStorage 实时保存，发布成功路径与
  // 400ms 防抖写入存在竞态（先清后写），下次进 /publish 可能自动恢复出
  // 「板块已选 + 表单已填」的状态——入口文案随之变成板块名而不是占位符。
  // 这里清一次草稿，且选择器交互不依赖占位文案：点触发框开选择器再选板块。
  await page.evaluate(() => {
    try { localStorage.removeItem('campus-wall-draft-local') } catch { /* 忽略 */ }
  })
  await page.goto('/publish')
  const trigger = page.locator('section.ds-card > button').first()
  await trigger.waitFor({ state: 'visible', timeout: 10_000 })
  await trigger.click()
  const sectionBtn = page.getByRole('button', { name: '失物招领' }).first()
  await sectionBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await sectionBtn.click()
  const isLost = variant === 'lost'
  const title = `${isLost ? '丢失' : '捡到'}校园卡测试帖${stamp}`
  await page.getByPlaceholder('一句话概括').fill(title)
  await page.getByPlaceholder('说点什么，至少10个字').fill(
    `${isLost ? '我在图书馆丢失了一张校园卡' : '在图书馆捡到一张校园卡'}，有认识的同学请联系，非常感谢！`
  )
  // 失物招领板块的扩展字段（类型必选，其余一并填写，避免校验拦截提交）
  await page.getByRole('button', { name: isLost ? '我丢失了' : '我捡到了' }).click()
  await page.getByPlaceholder('丢失/拾到地点').fill('图书馆')
  await page.getByPlaceholder('如：今天上午').fill('今天上午')
  await page.getByPlaceholder('如：校园卡/钥匙').fill('校园卡')
  const respPromise = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/api/posts'),
    { timeout: 15_000 }
  )
  await page.getByRole('main').getByRole('button', { name: '发布' }).click()
  const resp = await respPromise
  const body = await resp.json()
  expect(body?.data?.id).toBeTruthy()
  return body.data.id
}

test('帖子详情同路径切换不残留旧内容（RouterView 复用缺陷）', async ({ page }) => {
  await login(page)
  const stamp = Date.now()

  const lostId = await publishLostFound(page, 'lost', stamp)
  const foundId = await publishLostFound(page, 'found', stamp)

  // 主帖标题 = 详情页 hero 的唯一 h1（「可能相关」候选卡是 button/link，
  // 不带 heading 角色 → 用 h1 做断言不会被候选列表干扰）
  const heroH1 = () => page.locator('h1').first()

  // 打开「丢失」帖详情：雷达/可能相关应给出「捡到」候选
  await page.goto(`/post/${lostId}`)
  const lostTitle = `丢失校园卡测试帖${stamp}`
  await expect(heroH1()).toContainText(lostTitle)

  const foundTitle = `捡到校园卡测试帖${stamp}`
  // V3-P2：从详情页「相关推荐」轨道跳转，同时覆盖新轨道与同路径路由复用
  await expect(page.getByRole('heading', { name: '相关推荐' })).toBeVisible({ timeout: 10_000 })
  const candidate = page.getByRole('button', { name: `查看相关帖子：${foundTitle}`, exact: true })
  await expect(candidate).toBeVisible({ timeout: 10_000 })
  await candidate.click()

  // 同路径换参数跳转后必须显示新帖（URL 是路由参数生效的硬证据）
  expect(page.url()).toContain(`/post/${foundId}`)
  await expect(heroH1()).toContainText(foundTitle)
  await expect(heroH1()).not.toContainText(lostTitle)

  // 再从 B 点回 A：重复切换仍然正确（证明不是一次性的 remount 巧合）
  const back = page.getByRole('button', { name: `查看相关帖子：${lostTitle}`, exact: true })
  await expect(back).toBeVisible({ timeout: 10_000 })
  await back.click()
  expect(page.url()).toContain(`/post/${lostId}`)
  await expect(heroH1()).toContainText(lostTitle)
  await expect(heroH1()).not.toContainText(foundTitle)
})