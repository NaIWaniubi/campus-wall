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
import type { Application, NextFunction, Request, Response } from 'express'
import { db } from '../db'
import { cacheGet, cacheSet, cacheInvalidate } from './cache'

const SITE_NAME = '校园墙'
const SITE_DESC = '本校学生的信息聚合社区：二手、拼车、失物招领、课程交流、表白墙。'
// 注入结果缓存要跟着模板指纹走：发版后旧 HTML 引用的 chunk 已消失，绝不能继续吐缓存
const SPA_CACHE_TTL = 120_000
const SPA_CACHE_PREFIX = 'seo:spa:'

export interface SeoMeta {
  title: string
  description: string
  /** 绝对 URL 或 null（null 时回退到站点默认图） */
  image: string | null
  url: string
  type: 'website' | 'article'
  /** article 专属：发布时间（ISO）与署名（匿名已归一） */
  publishedAt?: string
  authorName?: string
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
        `SELECT p.title, p.content, p.images, p.is_anonymous, p.status, p.created_at,
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
      publishedAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
      authorName: who,
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

/**
 * JSON-LD 结构化数据（V5）：article 型输出 schema.org/SocialMediaPosting，
 * 帮助 Google/百度富媒体摘录取（OG 面向社交爬虫，JSON-LD 面向搜索引擎）。
 */
export function buildJsonLd(meta: SeoMeta): string | null {
  if (meta.type !== 'article') return null
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    headline: meta.title.replace(' - 校园墙', ''),
    url: meta.url,
    description: meta.description,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: meta.url.replace(/\/post\/\d+.*$/, '/') },
  }
  if (meta.publishedAt) ld.datePublished = meta.publishedAt
  if (meta.authorName) ld.author = { '@type': 'Person', name: meta.authorName }
  if (meta.image) ld.image = meta.image
  // </script> 注入防护：把 < > 转成 unicode 转义（JSON 合法，HTML 解析器不再误闭合）
  const json = JSON.stringify(ld).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  return '<script type="application/ld+json">' + json + '</script>'
}

/** 把 OG + JSON-LD 注入进 index.html 模板 */
export function injectSeo(html: string, meta: SeoMeta, defaultImage: string): string {
  const tags = buildMetaTags(meta, defaultImage)
  const ld = buildJsonLd(meta)
  const block = ld ? `${tags}\n    ${ld}` : tags
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(meta.title)}</title>`)
  // 先删掉模板里预置的所有 og:/twitter: 标签，避免与注入块重复打架
  out = out.replace(/[ \t]*<meta\s+(?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>\s*?\n?/gi, '')
  // 模板若预置了 ld+json，先清掉再注入，保证同一页面只有一份结构化数据
  out = out.replace(/[ \t]*<script type="application\/ld\+json">[\s\S]*?<\/script>\s*?\n?/gi, '')
  // 站点原有 description meta：有就替换，没有就随 OG 一起注入
  if (/<meta\s+name="description"/i.test(out)) {
    out = out.replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeAttr(meta.description)}">`)
    return out.replace('</head>', `    ${block}\n  </head>`)
  }
  return out.replace('</head>', `    <meta name="description" content="${escapeAttr(meta.description)}">\n    ${block}\n  </head>`)
}

/** 按 mtime 缓存模板内容：发版改文件立即失效，避免引用到已不存在的旧 chunk */
const tplCache = { mtimeMs: -1, html: '' }

/**
 * 生产环境 SPA fallback 处理器：
 * GET /post/35 → 查一次库拼 OG → 返回注入后的 index.html（结果 120s 缓存，跟模板 mtime 走）
 */
export function spaHandler(indexPath: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') { next(); return }
    try {
      const base = requestBase(req)
      const stat = await fs.stat(indexPath)
      // 模板变了（发版），连同注入结果一起作废
      if (tplCache.mtimeMs !== stat.mtimeMs) {
        tplCache.html = await fs.readFile(indexPath, 'utf8')
        tplCache.mtimeMs = stat.mtimeMs
        cacheInvalidate(SPA_CACHE_PREFIX)
      }
      const key = `${SPA_CACHE_PREFIX}${stat.mtimeMs}:${req.path}`
      const hit = cacheGet<string>(key)
      if (hit) {
        res.type('html').set('Cache-Control', 'public, max-age=120').send(hit)
        return
      }
      const meta = seoMetaForPath(req.path, base)
      const html = injectSeo(tplCache.html, meta, `${base}/icons/icon-512.png`)
      cacheSet(key, html, SPA_CACHE_TTL)
      res.type('html').set('Cache-Control', 'public, max-age=120').send(html)
    } catch (err) {
      // 兜底：查库失败也要把页面吐出去，宁可没卡片不能白屏
      try {
        const html = await fs.readFile(indexPath, 'utf8')
        res.type('html').send(html)
      } catch {
        next(err)
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 爬虫静态面（V5）：robots.txt + 动态 sitemap.xml
// 帖子是内容主体，收录它们才有公域流量；结果缓存 10 分钟。
// ─────────────────────────────────────────────────────────────

export interface SitemapEntry {
  loc: string
  lastmod?: string
  priority?: string
}

/** 纯函数：拼 sitemap XML（独立出来便于单测） */
export function buildSitemapXml(entries: SitemapEntry[]): string {
  const body = entries
    .map((e) => {
      const lastmod = e.lastmod ? `<lastmod>${escapeAttr(e.lastmod)}</lastmod>` : ''
      const priority = e.priority ? `<priority>${e.priority}</priority>` : ''
      return `<url><loc>${escapeAttr(e.loc)}</loc>${lastmod}${priority}</url>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`
}

const SITEMAP_TTL = 600_000
const SITEMAP_CACHE_KEY = 'seo:sitemap'

// ─────────────────────────────────────────────────────────────
// RSS 订阅面（V5）：/rss.xml（/feed 别名）
// 最近 30 条已发布帖子，10 分钟缓存；匿名统一归一为「匿名同学」，
// 绝不在订阅输出里泄露真实昵称与未过审内容。
// ─────────────────────────────────────────────────────────────

export interface RssItem {
  title: string
  link: string
  guid: string
  /** RFC 822 时间（RSS 2.0 标准要求） */
  pubDate: string
  description: string
  author: string
}

/** 纯函数：拼 RSS 2.0 XML（独立出来便于单测）。所有动态字段一律 XML 转义 */
export function buildRssXml(base: string, items: RssItem[]): string {
  const channel = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">`,
    `<channel>`,
    `<title>${escapeAttr(SITE_NAME)}</title>`,
    `<link>${escapeAttr(`${base}/`)}</link>`,
    `<description>${escapeAttr(SITE_DESC)}</description>`,
    `<language>zh-CN</language>`,
    `<generator>campus-wall</generator>`,
    `<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
  ].join('')
  const body = items
    .map(
      (it) =>
        `<item><title>${escapeAttr(it.title)}</title>` +
        `<link>${escapeAttr(it.link)}</link>` +
        `<guid isPermaLink="false">${escapeAttr(it.guid)}</guid>` +
        `<pubDate>${escapeAttr(it.pubDate)}</pubDate>` +
        `<dc:creator>${escapeAttr(it.author)}</dc:creator>` +
        `<description>${escapeAttr(it.description)}</description></item>`
    )
    .join('')
  return `${channel}${body}</channel></rss>`
}

const RSS_TTL = 600_000
const RSS_CACHE_KEY = 'seo:rss'

/** 查库拼 RSS（带缓存）；查库失败直接抛出，由调用方决定降级 */
function rssXmlFor(base: string): string {
  const hit = cacheGet<string>(RSS_CACHE_KEY)
  if (hit) return hit
  const rows = db
    .prepare(
      `SELECT p.id, p.created_at, p.title, p.content, p.is_anonymous, u.nickname
       FROM posts p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.status = 'published'
       ORDER BY p.id DESC LIMIT 30`
    )
    .all() as { id: number; created_at: number | string; title: string | null; content: string; is_anonymous: number; nickname: string | null }[]
  const items: RssItem[] = rows.map((r) => {
    const who = r.is_anonymous ? '匿名同学' : r.nickname || '同学'
    const when = r.created_at ? new Date(r.created_at) : null
    return {
      title: clip(r.title || r.content, 60) || `帖子 #${r.id}`,
      link: `${base}/post/${r.id}`,
      guid: `campus-wall:post:${r.id}`,
      pubDate: when && !Number.isNaN(when.getTime()) ? when.toUTCString() : new Date().toUTCString(),
      description: clip(`${who}：${r.content || ''}`, 200),
      author: who,
    }
  })
  const xml = buildRssXml(base, items)
  cacheSet(RSS_CACHE_KEY, xml, RSS_TTL)
  return xml
}

/** 注册 robots/sitemap/rss（必须早于 SPA fallback 的通配路由） */
export function registerCrawlEndpoints(app: Application): void {
  app.get('/robots.txt', (req, res) => {
    const base = requestBase(req)
    res.type('text/plain').set('Cache-Control', 'public, max-age=3600')
      .send(`User-agent: *\nDisallow: /admin\nDisallow: /api\nSitemap: ${base}/sitemap.xml\n`)
  })

  app.get('/sitemap.xml', (req, res) => {
    try {
      const base = requestBase(req)
      const hit = cacheGet<string>(SITEMAP_CACHE_KEY)
      if (hit) {
        res.type('application/xml').set('Cache-Control', 'public, max-age=600').send(hit)
        return
      }
      const posts = db
        .prepare("SELECT id, created_at FROM posts WHERE status = 'published' ORDER BY id DESC LIMIT 5000")
        .all() as { id: number; created_at: string }[]
      const sections = db.prepare('SELECT id FROM sections ORDER BY id').all() as { id: number }[]
      const entries: SitemapEntry[] = [
        { loc: `${base}/`, priority: '1.0' },
        { loc: `${base}/topics`, priority: '0.6' },
        ...sections.map((s) => ({ loc: `${base}/section/${s.id}`, priority: '0.7' })),
        ...posts.map((p) => ({ loc: `${base}/post/${p.id}`, lastmod: String(p.created_at || '').slice(0, 10), priority: '0.8' })),
      ]
      const xml = buildSitemapXml(entries)
      cacheSet(SITEMAP_CACHE_KEY, xml, SITEMAP_TTL)
      res.type('application/xml').set('Cache-Control', 'public, max-age=600').send(xml)
    } catch {
      res.status(500).type('text/plain').send('sitemap unavailable')
    }
  })

  const rssHandler = (req: Request, res: Response) => {
    try {
      res.type('application/rss+xml').set('Cache-Control', 'public, max-age=600').send(rssXmlFor(requestBase(req)))
    } catch {
      res.status(500).type('text/plain').send('feed unavailable')
    }
  }
  app.get('/rss.xml', rssHandler)
  app.get('/feed', rssHandler)
}
