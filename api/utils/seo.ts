/**
 * SEO / 社交分享卡片（V5）
 *
 * 校园墙的主要传播路径是微信群 / QQ 群发链接，而这些内置浏览器不执行 JS，
 * 没有 OG 标签就只有一个裸 URL。这里在 SPA fallback 时按路径注入：
 *   /post/:id  → 帖子标题 + 摘要 + 首图（仅 published，审核中/已删除不外露）
 *   其它页面    → 站点默认文案
 * 结果进内存缓存（默认 120s），爬虫来抓也只是一次极轻量的本地查询。
 */
import { promises as fs } from 'fs'
import type { NextFunction, Request, Response } from 'express'
import { db } from '../db'
import { cacheGet, cacheSet } from './cache'

const SITE_NAME = '校园墙'
const SITE_DESC = '本校学生的信息聚合社区：二手、拼车、失物招领、课程交流、表白墙。'
const SPA_CACHE_TTL = 120_000
const TPL_CACHE_KEY = 'seo:tpl'
const SPA_CACHE_PREFIX = 'seo:spa:'

export interface SeoMeta {
  title: string
  description: string
  /** 绝对 URL 或 null（null 时回退到站点默认图） */
  image: string | null
  url: string
  type: 'website' | 'article'
}

/** HTML 属性值转义：OG 内容里出现引号会直接破坏 head */
export function escapeAttr(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function clip(s: string, n: number): string {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

/** 请求的绝对前缀：https://host（TRUST_PROXY 时优先 x-forwarded-proto） */
export function requestBase(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || req.protocol || 'http'
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() || req.get('host') || 'localhost'
  return `${proto}://${host}`
}

/** 按路径算 OG meta；帖子查库，其它给站点默认 */
export function seoMetaForPath(pathname: string, base: string): SeoMeta {
  const m = /^\/post\/(\d+)$/.exec(pathname)
  if (m) {
    const row = db
      .prepare(
        `SELECT p.title, p.content, p.images, p.is_anonymous, p.status,
                u.nickname, s.name AS section_name
         FROM posts p
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN sections s ON s.id = p.section_id
         WHERE p.id = ?`
      )
      .get(Number(m[1])) as any
    // 审核中 / 已删除 / 不存在的帖子：不给社交卡片（否则等于泄露未过审内容）
    if (!row || row.status !== 'published') {
      return {
        title: `${SITE_NAME}`,
        description: SITE_DESC,
        image: null,
        url: `${base}${pathname}`,
        type: 'website',
      }
    }
    let firstImage: string | null = null
    try {
      const imgs = JSON.parse(row.images || '[]')
      if (Array.isArray(imgs) && typeof imgs[0] === 'string' && imgs[0]) {
        firstImage = imgs[0].startsWith('http') ? imgs[0] : `${base}${imgs[0].startsWith('/') ? '' : '/'}${imgs[0]}`
      }
    } catch { /* images 脏数据不影响主流程 */ }
    const who = row.is_anonymous ? '匿名同学' : row.nickname || '同学'
    const where = row.section_name ? `#${row.section_name} · ` : ''
    return {
      title: `${clip(row.title || row.content, 40)} - ${SITE_NAME}`,
      description: clip(`${where}${who}：${row.content || ''}`, 80) || SITE_DESC,
      image: firstImage,
      url: `${base}${pathname}`,
      type: 'article',
    }
  }
  return {
    title: `${SITE_NAME} - 让校园生活更有温度`,
    description: SITE_DESC,
    image: null,
    url: `${base}${pathname === '/' ? '/' : pathname}`,
    type: 'website',
  }
}

/** 生成注入 head 的 meta 串（不含 title；title 走替换） */
export function buildMetaTags(meta: SeoMeta, defaultImage: string): string {
  const img = meta.image || defaultImage
  const t = escapeAttr(meta.title)
  const d = escapeAttr(meta.description)
  const u = escapeAttr(meta.url)
  return [
    `<meta property="og:site_name" content="${escapeAttr(SITE_NAME)}">`,
    `<meta property="og:type" content="${meta.type}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    `<meta property="og:image" content="${escapeAttr(img)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${escapeAttr(img)}">`,
  ].join('\n    ')
}

/** 把 OG 注入进 index.html 模板 */
export function injectSeo(html: string, meta: SeoMeta, defaultImage: string): string {
  const tags = buildMetaTags(meta, defaultImage)
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(meta.title)}</title>`)
  // 先删掉模板里预置的所有 og:/twitter: 标签，避免与注入块重复打架
  out = out.replace(/[ \t]*<meta\s+(?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>\s*?\n?/gi, '')
  // 站点原有 description meta：有就替换，没有就随 OG 一起注入
  if (/<meta\s+name="description"/i.test(out)) {
    out = out.replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeAttr(meta.description)}">`)
  } else {
    out = out.replace('</head>', `    <meta name="description" content="${escapeAttr(meta.description)}">\n    ${tags}\n  </head>`)
    return out
  }
  return out.replace('</head>', `    ${tags}\n  </head>`)
}

/**
 * 生产环境 SPA fallback 处理器：
 * GET /post/35 → 查一次库拼 OG → 返回注入后的 index.html（缓存 120s）
 */
export function spaHandler(indexPath: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') { next(); return }
    try {
      const base = requestBase(req)
      const key = SPA_CACHE_PREFIX + req.path
      const hit = cacheGet<string>(key)
      if (hit) {
        res.type('html').set('Cache-Control', 'public, max-age=120').send(hit)
        return
      }
      let tpl = cacheGet<string>(TPL_CACHE_KEY)
      if (!tpl) {
        tpl = await fs.readFile(indexPath, 'utf8')
        cacheSet(TPL_CACHE_KEY, tpl, 600_000)
      }
      const meta = seoMetaForPath(req.path, base)
      const html = injectSeo(tpl, meta, `${base}/icons/icon-512.png`)
      cacheSet(key, html, SPA_CACHE_TTL)
      res.type('html').set('Cache-Control', 'public, max-age=120').send(html)
    } catch (err) {
      // 兜底：查库失败也要把页面吐出去，宁可没卡片不能白屏
      fs.readFile(indexPath, 'utf8').then((html) => {
        res.type('html').send(html)
      }).catch(() => next(err))
    }
  }
}
