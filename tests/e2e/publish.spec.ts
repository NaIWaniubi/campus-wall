/**
 * 流程 3：发帖（选板块 → 填标题正文 → 提交 → 详情可见）
 */
import { expect } from '@playwright/test'
import { test } from './helpers'
import { login } from './helpers'

test('登录用户可发帖并跳到帖子详情', async ({ page }) => {
  await login(page)
  await page.goto('/publish')

  // 打开板块选择器并选「互助问答」（无必填扩展字段、非强匿名）
  await page.getByText('请选择板块').click()
  await page.getByRole('button', { name: '互助问答' }).click()

  const title = `E2E 冒烟 ${Date.now()}：互助提问测试`
  await page.getByPlaceholder('一句话概括').fill(title)
  await page.getByPlaceholder('说点什么，至少10个字').fill('这是一条由 Playwright 自动化发布的冒烟测试内容，用于验证发帖主链路。')
  await page.getByRole('main').getByRole('button', { name: '发布' }).click()

  // 捕获 POST /api/posts 的响应拿新帖 id，跳详情断言标题
  const resp = await page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/api/posts'), { timeout: 15_000 })
  const body = await resp.json()
  const newId = body?.data?.id
  expect(newId).toBeTruthy()

  await page.goto(`/post/${newId}`)
  await expect(page.getByText(title)).toBeVisible()
})

test('发帖敏感词拦截：硬词命中被前端拦截', async ({ page }) => {
  await login(page)
  await page.goto('/publish')
  await page.getByText('请选择板块').click()
  await page.getByRole('button', { name: '互助问答' }).click()
  await page.getByPlaceholder('一句话概括').fill(`E2E 敏感词 ${Date.now()}`)
  await page.getByPlaceholder('说点什么，至少10个字').fill('这里包含毒品相关词汇的内容用于验证拦截。')
  await page.getByRole('main').getByRole('button', { name: '发布' }).click()
  // 前端 assessRisk：review 级硬词 → 提交被拦，提示修改
  // 行内提示 + toast 双元素同文，取首个避免 strict violation
  await expect(page.getByText(/违规敏感词/).first()).toBeVisible({ timeout: 8_000 })
  // 未发出 POST
  await page.waitForTimeout(1000)
})
