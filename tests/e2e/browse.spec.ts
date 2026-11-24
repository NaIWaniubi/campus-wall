/**
 * 流程 1：游客浏览（未登录首页信息流 + 搜索）
 */
import { expect } from '@playwright/test'
import { test, login } from './helpers'

test('登录用户首页切换为个性化今日简报', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('heading', { name: '我的今日校园' })).toBeVisible({ timeout: 15_000 })
})

test('游客可浏览首页信息流并看到种子帖子', async ({ page }) => {
  await page.goto('/')
  // 种子帖标题（seed-demo：二手 iPad 帖）
  await expect(page.getByText('出九成新 iPad Air 5 蓝色 64G').first()).toBeVisible()
  // 信息流渲染出多张帖子卡：用 PostCard 的无障碍锚（aria-label=查看帖子：*），
  // 不再断言某篇具体旧帖——首页按时间倒序 + 虚拟滚动，非首屏标题断言必腐
  const cards = page.getByRole('button', { name: /^查看帖子：/ })
  await expect(cards.first()).toBeVisible()
  expect(await cards.count()).toBeGreaterThanOrEqual(3)
})

test('游客可搜索到目标帖子', async ({ page }) => {
  await page.goto('/search')
  await page.getByPlaceholder('搜索帖子').fill('iPad')
  await page.getByPlaceholder('搜索帖子').press('Enter')
  await expect(page.getByText('出九成新 iPad Air 5 蓝色 64G').first()).toBeVisible()
})

test('游客可打开匿名帖详情（作者脱敏展示）', async ({ page }) => {
  // 从搜索进而非首页点击：seed 帖子时间随机排序 + 虚拟滚动，按标题点首页卡片必 flaky
  await page.goto('/search')
  await page.getByPlaceholder('搜索帖子').fill('选课系统')
  await page.getByPlaceholder('搜索帖子').press('Enter')
  await page.getByText('选课系统能不能争点气').first().click()
  await expect(page).toHaveURL(/\/post\/\d+/)
  // 该帖 seed 里 anonymous:1 —— 详情页必须显示归一署名而非真实昵称
  await expect(page.getByText(/匿名用户|匿名同学/).first()).toBeVisible()
})

test('法律文本页可达且渲染隐私政策正文（注册流协议入口）', async ({ page }) => {
  await page.goto('/legal/privacyPolicy')
  await expect(page.getByText('校园墙隐私政策')).toBeVisible()
  // 与小程序同源的关键章节标题应出现
  await expect(page.getByText('一、我们如何收集和使用您的个人信息')).toBeVisible()
  await expect(page.getByText('四、您的权利')).toBeVisible()
})

test('用户协议页同源可达', async ({ page }) => {
  await page.goto('/legal/userAgreement')
  await expect(page.getByText('校园墙用户服务协议')).toBeVisible()
  await expect(page.getByText('一、总则')).toBeVisible()
})
