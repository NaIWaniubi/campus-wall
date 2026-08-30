/**
 * 流程 4：互动（点赞状态翻转 + 评论落楼）
 */
import { expect } from '@playwright/test'
import { test } from './helpers'
import { login } from './helpers'

test('可对种子帖点赞且状态翻转', async ({ page }) => {
  await login(page)
  await page.goto('/')
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
  await page.goto('/')
  await page.getByText('捡到一张校园卡').first().click()
  await expect(page).toHaveURL(/\/post\/\d+/)

  const content = `E2E 评论 ${Date.now()}：楼主干得漂亮`
  await page.getByPlaceholder('写下你的评论...').fill(content)
  await page.getByPlaceholder('写下你的评论...').press('Enter')
  await expect(page.getByText(content)).toBeVisible({ timeout: 8_000 })
})
