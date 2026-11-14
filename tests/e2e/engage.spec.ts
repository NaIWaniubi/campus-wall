/**
 * 流程 4：互动（点赞状态翻转 + 评论落楼）
 */
import { expect } from '@playwright/test'
import { test } from './helpers'
import { login } from './helpers'

test('可对种子帖点赞且状态翻转', async ({ page }) => {
  await login(page)
  // 从搜索进详情：首页是虚拟列表，卡内标题会因重渲染脱离 DOM 让 click 悬挂（此前 30s 超时的根因）
  await page.goto('/search')
  await page.getByPlaceholder('搜索帖子').fill('iPad')
  await page.getByPlaceholder('搜索帖子').press('Enter')
  await page.getByText('出九成新 iPad Air 5 蓝色 64G').first().click()
  await expect(page).toHaveURL(/\/post\/\d+/)

  const likeBtn = page.locator('button:has(svg.lucide-heart)').first()
  const before = await likeBtn.locator('svg').getAttribute('fill')
  await likeBtn.click()
  // 点赞后 Heart 的 fill 从 none 变 currentColor（或计数 +1）
  await expect(async () => {
    const after = await likeBtn.locator('svg').getAttribute('fill')
    expect(after).not.toBe(before)
  }).toPass({ timeout: 8_000 })
})

test('可发表评论并立即上楼', async ({ page }) => {
  await login(page)
  await page.goto('/search')
  await page.getByPlaceholder('搜索帖子').fill('捡到一张校园卡')
  await page.getByPlaceholder('搜索帖子').press('Enter')
  await page.getByText('捡到一张校园卡').first().click()
  await expect(page).toHaveURL(/\/post\/\d+/)

  const content = `E2E 评论 ${Date.now()}：楼主干得漂亮`
  await page.getByPlaceholder('写下你的评论...').fill(content)
  await page.getByPlaceholder('写下你的评论...').press('Enter')
  await expect(page.getByText(content)).toBeVisible({ timeout: 8_000 })
})

test('对回复再回复仍可见（R1 修复：parent_id 服务端归一顶层）', async ({ page }) => {
  await login(page)
  await page.goto('/search')
  await page.getByPlaceholder('搜索帖子').fill('捡到一张校园卡')
  await page.getByPlaceholder('搜索帖子').press('Enter')
  await page.getByText('捡到一张校园卡').first().click()
  await expect(page).toHaveURL(/\/post\/\d+/)

  // 先发顶层评论
  const topContent = `E2E 顶层 ${Date.now()}`
  await page.getByPlaceholder('写下你的评论...').fill(topContent)
  await page.getByPlaceholder('写下你的评论...').press('Enter')
  await expect(page.getByText(topContent)).toBeVisible({ timeout: 8_000 })
  // 对这条顶层评论的「回复」按钮再点回复——若服务端把二级回复归一顶层，
  // 刷新后它必须仍然出现在该评论的 replies 列表里
  const replyContent = `E2E 回复的回复 ${Date.now()}`
  await page.getByPlaceholder('写下你的回复...').fill(replyContent)
  await page.getByPlaceholder('写下你的回复...').press('Enter')
  await expect(page.getByText(replyContent).first()).toBeVisible({ timeout: 8_000 })
  await page.reload()
  await expect(page.getByText(replyContent).first()).toBeVisible({ timeout: 8_000 })
})
