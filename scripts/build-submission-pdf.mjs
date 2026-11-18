#!/usr/bin/env node
/**
 * 生成参赛说明书 PDF（A4 / 中文 / 可观页码与目录）
 *
 * 用法：node scripts/build-submission-pdf.mjs [--keep-html]
 *
 * 设计要点：
 *  1) 不引入新依赖：markdown → HTML 由本文件的轻量转换器完成（标题 / 表格 / 列表 / 代码块 / 粗体 / 链接 / 引用 / 分隔线）。
 *  2) 排版不交给浏览器的分页算法：先在离屏容器里量出每个内容块的高度，再按 A4 内容区高度逐块装页，
 *     因此页数、目录页码、章节起始页都是确定的，也不会出现表格/图片被切断。
 *  3) 打印用项目已有的 playwright(chromium)，page.pdf({ format:'A4', printBackground:true })。
 *
 * 只读取 docs/ 与 captures/，只写入 dist-submission/。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist-submission');
const BUILD_DIR = path.join(OUT_DIR, '.build');
const OUT_PDF = path.join(OUT_DIR, '校园墙-参赛说明书.pdf');
const OUT_HTML = path.join(BUILD_DIR, 'submission.html');

const KEEP_HTML = process.argv.includes('--keep-html');

const MAIN_MD = path.join(ROOT, 'docs', 'COMPETITION-SUBMISSION.md');
const ONE_MD = path.join(ROOT, 'docs', 'SUBMISSION-ONEPAGE.md');

const META = {
  title: '校园墙 · 参赛说明书',
  work: '校园墙',
  en: 'CAMPUS WALL',
  track: 'AI WEB 网页开发挑战赛',
  author: '陈勇润',
  school: '东莞理工学院',
  date: '2026 年 11 月 18 日',
  contest: '全国大学生计算机应用能力与数字素养大赛暨传智杯全国 IT 技能大赛',
};

/* ========================================================================== *
 * 1. 轻量 markdown → 节点
 * ========================================================================== */

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 行内语法：代码 / 粗体 / 斜体 / 链接。先抽走代码片段，避免其中的 * _ 被误解析。 */
function inline(text, keepTags = false) {
  const codes = [];
  const tags = [];
  let s = String(text).replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(c);
    return `\u0000C${codes.length - 1}\u0000`;
  });

  if (keepTags) {
    s = s.replace(/<\/?(code|strong|b|em|br|span)\b[^>]*>/gi, (m) => {
      tags.push(m);
      return `\u0000T${tags.length - 1}\u0000`;
    });
  }

  s = escapeHtml(s);
  s = s.replace(/\*\*([^]*?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
    if (/^(https?:|mailto:|#|\/)/.test(href)) return `<a href="${href}">${label}</a>`;
    return `${label}<span class="url">（${href}）</span>`;
  });
  s = s.replace(/\n/g, '<br>');
  s = s.replace(/\u0000C(\d+)\u0000/g, (_m, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
  s = s.replace(/\u0000T(\d+)\u0000/g, (_m, i) => tags[Number(i)]);
  return s;
}

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

/** 解析为扁平节点数组；节点类型：h / p / table / list / code / quote / hr */
function parseMd(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const nodes = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (!buf.length) return;
    nodes.push({ type: 'p', text: buf.join('\n').trim() });
    buf.length = 0;
  };

  let para = [];

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (/^\s*```/.test(line)) {
      flushParagraph(para);
      const lang = line.replace(/^\s*```/, '').trim();
      const body = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i += 1;
      nodes.push({ type: 'code', lang, text: body.join('\n') });
      continue;
    }

    // 标题
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushParagraph(para);
      nodes.push({ type: 'h', level: h[1].length, text: h[2].trim() });
      i += 1;
      continue;
    }

    // 分隔线
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushParagraph(para);
      nodes.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // 表格
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      flushParagraph(para);
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) =>
        c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left',
      );
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      nodes.push({ type: 'table', header, align, rows });
      continue;
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      flushParagraph(para);
      const body = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      nodes.push({ type: 'quote', text: body.join('\n') });
      continue;
    }

    // 列表
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      flushParagraph(para);
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const raw = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '').trim();
        items.push(raw);
        i += 1;
        // 续行（缩进两个空格以上、非列表、非空）并入上一条
        while (
          i < lines.length &&
          /^\s{2,}\S/.test(lines[i]) &&
          !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
          !/^\s*\|/.test(lines[i])
        ) {
          items[items.length - 1] += '\n' + lines[i].trim();
          i += 1;
        }
      }
      nodes.push({ type: 'list', ordered, items });
      continue;
    }

    if (!line.trim()) {
      flushParagraph(para);
      i += 1;
      continue;
    }

    para.push(line);
    i += 1;
  }
  flushParagraph(para);
  return nodes;
}

/** 取某个标题之后、下一个任意标题之前的内容（不含子标题块）。 */
function pickFlat(nodes, re, includeHeading = false) {
  const start = nodes.findIndex((n) => n.type === 'h' && re.test(n.text));
  if (start < 0) throw new Error(`找不到章节：${re}`);
  let end = nodes.length;
  for (let i = start + 1; i < nodes.length; i += 1) {
    if (nodes[i].type === 'h') {
      end = i;
      break;
    }
  }
  return nodes.slice(includeHeading ? start : start + 1, end);
}

/* ========================================================================== *
 * 2. 内容块构造（每个块 = 一个不可分割的排版单元）
 * ========================================================================== */

const toc = [];
let _chapterNo = 0;
let chapterLabel = '';
let blockSeq = 0;

const blocks = [];

function pushBlock(html, opts = {}) {
  blockSeq += 1;
  const b = {
    id: `b${blockSeq}`,
    html,
    brk: Boolean(opts.brk),
    keep: Boolean(opts.keep),
    chapter: opts.chapter || '',
    tocId: opts.tocId || '',
  };
  blocks.push(b);
  if (opts.tocId) {
    toc.push({ level: opts.level || 2, title: opts.title || '', id: opts.tocId });
  }
  return b;
}

function chapter(no, title, en) {
  _chapterNo = no;
  chapterLabel = `第 ${no} 章　${title}`;
  const id = `ch-${no}`;
  pushBlock(
    `<div class="b ch-open" data-brk="1" data-chapter="${chapterLabel}" data-toc="${id}">
       <div class="ch-kicker"><span class="ch-no">第 ${no} 章</span><span class="ch-en">CHAPTER ${String(no).padStart(2, '0')}</span></div>
       <h1 class="ch-title">${escapeHtml(title)}</h1>
       <div class="ch-bar"></div>
       <div class="ch-en-title">${escapeHtml(en)}</div>
     </div>`,
    { brk: true, tocId: id, level: 1, title: `第 ${no} 章　${title}` },
  );
}

function h2(no, title, id) {
  pushBlock(
    `<div class="b b-h2" data-keep="1" data-chapter="${chapterLabel}"${id ? ` data-toc="${id}"` : ''}>
       <h2>${no ? `<span class="no">${escapeHtml(no)}</span>` : ''}<span class="tx">${escapeHtml(title)}</span></h2>
     </div>`,
    { keep: true, tocId: id, level: 2, title: `${no ? no + '　' : ''}${title}` },
  );
}

function h3(title) {
  pushBlock(
    `<div class="b b-h3" data-keep="1" data-chapter="${chapterLabel}"><h3>${escapeHtml(title)}</h3></div>`,
    { keep: true },
  );
}

const HTML_TAG = /<(code|strong|b|em|br|span)\b[^>]*>/i;

function para(text, cls = '') {
  const body = inline(text, HTML_TAG.test(text));
  pushBlock(`<div class="b b-p ${cls}" data-chapter="${chapterLabel}"><p>${body}</p></div>`);
}


function nodesToBlocks(nodes) {
  for (const n of nodes) {
    if (n.type === 'h') {
      h3(n.text);
    } else if (n.type === 'p') {
      para(n.text);
    } else if (n.type === 'list') {
      const tag = n.ordered ? 'ol' : 'ul';
      const items = n.items.map((t) => `<li>${inline(t)}</li>`).join('');
      pushBlock(
        `<div class="b b-list" data-chapter="${chapterLabel}"><${tag}>${items}</${tag}></div>`,
      );
    } else if (n.type === 'table') {
      table(n.header, n.rows);
    } else if (n.type === 'code') {
      pushBlock(
        `<div class="b b-code" data-chapter="${chapterLabel}"><pre>${escapeHtml(n.text)}</pre></div>`,
      );
    } else if (n.type === 'quote') {
      pushBlock(
        `<div class="b b-quote" data-chapter="${chapterLabel}"><blockquote>${inline(n.text)}</blockquote></div>`,
      );
    } else if (n.type === 'hr') {
      pushBlock(`<div class="b b-hr" data-chapter="${chapterLabel}"><div class="rule"></div></div>`);
    }
  }
}

function table(header, rows, caption) {
  const thead = `<thead><tr>${header.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  const cap = caption ? `<div class="tcap">${escapeHtml(caption)}</div>` : '';
  pushBlock(
    `<div class="b b-table" data-chapter="${chapterLabel}">${cap}<table class="tbl">${thead}${tbody}</table></div>`,
  );
}

function callout(html, opts = {}) {
  pushBlock(
    `<div class="b b-callout" data-chapter="${chapterLabel}"><div class="callout ${opts.tone || ''}">${html}</div></div>`,
  );
}

function kpiGrid(items) {
  const cell = items
    .map(
      (k) => `<div class="kpi">
        <div class="n">${k.n}${k.unit ? `<small>${k.unit}</small>` : ''}</div>
        <div class="l">${k.label}</div>
      </div>`,
    )
    .join('');
  pushBlock(`<div class="b b-kpi" data-chapter="${chapterLabel}"><div class="kpi-grid">${cell}</div></div>`);
}

const FIG_DIR = path.join(ROOT, 'captures');
function figure(src, widthMm, no, caption, noteHtml = '') {
  const rel = path.relative(BUILD_DIR, path.join(FIG_DIR, src)).split(path.sep).join('/');
  return `<figure class="fig" style="width:${widthMm}mm">
      <img class="shot" src="${rel}" alt="${escapeHtml(caption)}" style="width:${widthMm}mm">
      <figcaption class="cap"><b>${no}</b>${caption ? `　${caption}` : ''}${noteHtml ? `<span class="note">${noteHtml}</span>` : ''}</figcaption>
    </figure>`;
}

function figureBlock(src, widthMm, no, caption, noteHtml = '') {
  pushBlock(`<div class="b b-fig" data-chapter="${chapterLabel}">${figure(src, widthMm, no, caption, noteHtml)}</div>`);
}

function figureRow(defs) {
  const inner = defs
    .map((d) => figure(d.src, d.w, d.no, d.caption, d.note || ''))
    .join('');
  pushBlock(`<div class="b b-figrow" data-chapter="${chapterLabel}"><div class="fig-row">${inner}</div></div>`);
}

/* ========================================================================== *
 * 3. 读取两份材料
 * ========================================================================== */

const mainDoc = parseMd(fs.readFileSync(MAIN_MD, 'utf8'));
const oneDoc = parseMd(fs.readFileSync(ONE_MD, 'utf8'));

const fromMain = (re) => pickFlat(mainDoc, re);
const fromOne = (re) => pickFlat(oneDoc, re);

/* ========================================================================== *
 * 4. 正文编排
 * ========================================================================== */

/* ---------- 封面 / 目录由 HTML 模板负责，这里开始正文 ---------- */

/* ===== 第 1 章 ===== */
chapter(1, '作品概览', 'OVERVIEW');

para(
  '本章用两页篇幅回答三个问题：校园墙是什么、它为谁解决什么问题、它以什么样的系统形态交付。所有数字与结论均可在仓库内复现，命令见第 6 章。',
  'lead',
);

h2('1.1', '作品名称与定位', 'h-1-1');
const workName = fromOne(/^作品名称/)[0];
callout(
  `<div class="co-kicker">作品名称</div><div class="co-main">${inline(workName.text)}</div>`,
  { tone: 'co-hero' },
);
nodesToBlocks(fromMain(/^1\./));
const oneLiner = fromOne(/^一句话介绍/)[0];
para(oneLiner.text);

h2('1.2', '解决什么问题', 'h-1-2');
nodesToBlocks(fromOne(/^解决什么问题/));
table(
  ['学生的三个高频动作', '传统校园墙的做法', '校园墙的做法'],
  [
    ['发一条帖子', '填标题、正文、板块、价格、标签等 6 个字段', '一句话 → 标题/正文/板块/价格/标签自动补全'],
    ['读一条长帖', '自己从头读到尾，找重点', '「AI 划重点」给出 3 条要点 + 交易风险提示'],
    ['知道今天发生了什么', '翻信息流，靠运气', '首屏「今日校园简报」：统计 + 最活跃板块 + 今日最热 + 安全提醒'],
  ],
  '表 1-1　三条主路径的改造前后对照',
);

h2('1.3', '参赛信息', 'h-1-3');
table(
  ['项', '内容'],
  [
    ['作品名称', '校园墙（Campus Wall）'],
    ['参赛赛道', META.track],
    ['作者', `${META.author}（${META.school}）`],
    ['作品形态', 'Web 端（Vue3 + TypeScript + Vite）＋ 原生微信小程序，双端共用同一后端契约'],
    ['提交日期', META.date],
    ['材料构成', '本说明书 + 界面实拍（captures/v5、captures/v6）＋ 可复现代码与 CI 证据'],
  ],
  '表 1-2　参赛基本信息',
);

h2('1.4', '系统架构', 'h-1-4');
para(
  '双端共用一套 REST 契约，实时能力由 WebSocket 与 SSE 承载；数据层是单文件 SQLite（含 FTS5 中文二元分词）；AI 能力以「网关优先、规则兜底」的方式挂在编排层，任何模型故障都不会穿透到用户侧。',
);

const ARCH_SVG = `
<svg class="diagram" viewBox="0 0 720 372" xmlns="http://www.w3.org/2000/svg" font-family="Microsoft YaHei, sans-serif">
  <defs>
    <marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#14110F"/>
    </marker>
  </defs>
  ${[
    {
      y: 4,
      label: ['客户端', 'CLIENT'],
      boxes: [
        ['Web 端', 'Vue3 + TS + Vite'],
        ['微信小程序', '原生 29 个页面'],
        ['PWA · Web Push', '离线推送 / 安装'],
        ['分享卡 · SEO', 'OG / JSON-LD / RSS'],
      ],
    },
    {
      y: 74,
      label: ['接入层', 'API'],
      boxes: [
        ['REST /api', 'Express 5'],
        ['WebSocket', '私信实时链路'],
        ['SSE', 'Agent 事件流'],
        ['鉴权', '双 token / 401 续期'],
      ],
    },
    {
      y: 144,
      label: ['数据层', 'DATA'],
      boxes: [
        ['SQLite', 'FTS5 中文二元分词'],
        ['用户 · 帖子 · 评论', '信誉分 / 举报 / 审计'],
        ['上传与缩略图', 'sharp 可选能力'],
        ['备份', '冷启动自动建库灌种子'],
      ],
    },
    {
      y: 214,
      label: ['AI 能力', 'AI CORE'],
      boxes: [
        ['RAG', '向量 + 关键词混合'],
        ['Agent', 'planner + 工具链'],
        ['护栏', '注入 / 幻觉 / JSON'],
        ['多模态', '图片理解 + 语音'],
      ],
    },
    {
      y: 300,
      label: ['交付', 'DELIVERY'],
      boxes: [
        ['CI 六道门', '静态 / 雷达 / 体积 / 压测 / E2E / LH'],
        ['部署', 'start.sh · Docker · Render'],
        ['可复现', '407 测试 · 15 条 E2E'],
      ],
    },
  ]
    .map((band) => {
      const n = band.boxes.length;
      const gap = 8;
      const w = (624 - gap * (n - 1)) / n;
      const boxes = band.boxes
        .map(([t, s], i) => {
          const x = 96 + i * (w + gap);
          return `<g>
            <rect x="${x.toFixed(1)}" y="${band.y}" width="${w.toFixed(1)}" height="${band.y === 214 ? 68 : 56}" rx="3"
              fill="${band.y === 214 ? '#F3F9DC' : '#FFFFFF'}" stroke="#14110F" stroke-width="1.4"/>
            <text x="${(x + w / 2).toFixed(1)}" y="${band.y + 23}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#14110F">${t}</text>
            <text x="${(x + w / 2).toFixed(1)}" y="${band.y + 41}" text-anchor="middle" font-size="9.6" fill="#6E6659">${s}</text>
          </g>`;
        })
        .join('');
      return `<g>
        <text x="0" y="${band.y + 22}" font-size="13.5" font-weight="800" fill="#14110F">${band.label[0]}</text>
        <text x="0" y="${band.y + 38}" font-size="8.6" letter-spacing="1.2" fill="#6E6659">${band.label[1]}</text>
        ${boxes}
      </g>`;
    })
    .join('')}
  ${[62, 132, 202, 284]
    .map(
      (y) =>
        `<line x1="408" y1="${y}" x2="408" y2="${y + 10}" stroke="#14110F" stroke-width="1.4" marker-end="url(#arw)"/>`,
    )
    .join('')}
</svg>`;

pushBlock(
  `<div class="b b-diagram" data-chapter="${chapterLabel}"><div class="fig-frame">${ARCH_SVG}</div>
   <div class="cap"><b>图 1-1</b>　校园墙系统架构：双端共用契约，AI 编排层可降级</div></div>`,
);

/* ===== 第 2 章 ===== */
chapter(2, '核心记忆点与演示路径', 'THREE TAKEAWAYS');

para(
  '评委只有三分钟。本章把全部功能压成三条可当场验证的记忆点，并给出 90 秒体验路径与演示账号——每一句都能在界面上点出来。',
  'lead',
);

h2('2.1', '三个记忆点', 'h-2-1');
table(
  ['记忆点', '怎么讲', '证据'],
  [
    [
      '失物智能雷达',
      '发一条「捡到校园卡」，系统自动匹配方向相反、品类一致的求助帖',
      '离线评测 P@1 100% vs 纯关键词基线 19%，MRR 1.000；CI 里跑 `npm run eval:radar -- --gate` 做回归门',
    ],
    [
      '匿名是真的匿名',
      '匿名帖不能按作者反查、编辑不会脱匿名、列表缓存不串号、封禁后旧 token 立刻失效',
      '32 项安全加固逐条落在代码里（`api/routes/posts.ts`、`api/utils/jwt.ts`）',
    ],
    [
      '治理闭环',
      '发布 → 审核 → 举报 → 处理 → 审计留痕，全部可后台看到',
      '后台数据总览：待审内容、待处理举报、审核通过率、7 日趋势',
    ],
  ],
  '表 2-1　三个能在三分钟内验证的记忆点',
);

h2('2.2', '三条记忆点的验证口径', 'h-2-2');
callout(
  `<div class="co-kicker">01　失物智能雷达</div>
   <p>评测集是 21 组 query / 63 个候选的人工标注集，基线是纯关键词匹配（P@1 19%）。雷达把召回从 19% 拉到 100%，代价是 7.1% 误报（推了同地点不同物品）。失物场景下漏报比误报代价高，这个取舍是刻意的，脚本入库到 CI，任何人都能重跑。</p>`,
);
callout(
  `<div class="co-kicker">02　匿名是真的匿名</div>
   <p>四道锁：① 列表接口对非本人强制 <code>is_anonymous = 0</code>，不能按作者反查；② 编辑不传 <code>isAnonymous</code> 时保留原值，不会脱匿名；③ 缓存 key 带查看者可见性维度，游客结果不会命中作者结果；④ 改密/封禁递增 <code>token_version</code>，REST 与 WS 双通道旧 token 立即失效。</p>`,
);
callout(
  `<div class="co-kicker">03　治理闭环</div>
   <p>发布即进入机审（本地敏感词三级 + 微信 <code>msgSecCheck</code>），中风险进人工队列；举报按 24 小时频控、3 人升级优先级；处理动作写 <code>admin_logs</code> 审计表，后台数据总览可见待审 / 举报 / 通过率 / 7 日趋势。</p>`,
);

h2('2.3', '评委体验路径（建议 90 秒）', 'h-2-3');
nodesToBlocks(fromMain(/^4\./));

h2('2.4', '演示账号与体验入口', 'h-2-4');
table(
  ['项', '值'],
  [
    ['体验链接', '`<部署后填入>`（部署后回填至本节与表单）'],
    ['学生账号', '`23770001` / `demo1234`（信誉 92，可发帖、可评论、可匿名）'],
    ['超管账号', '`admin` / `admin123`（仅演示库；线上口令经环境变量注入，不进仓库）'],
    ['其余演示号', '`23770002` – `23770005`，密码同上，信誉分各不相同，可演示信誉分档位'],
    ['90 秒路径', '首页简报 → 失物板块看雷达匹配 → 详情页 AI 划重点 → 发布页一句话成稿 → 后台治理总览'],
  ],
  '表 2-2　演示账号与入口',
);
para(
  '演示库首启自动灌种子：5 个演示账号、20 帖、8 个板块与全部闭环路径；空数据目录冷启动即可复现，不依赖任何外部服务。',
);
callout(
  `<div class="co-kicker">演示提示</div>
   <p>整条演示不依赖外网：三个 AI 入口在<strong>零外网、零 Key</strong> 下都会返回可用结果（实测见 5.6）。若现场网络异常，直接按「规则兜底」讲，不要跳过任何一步。</p>`,
  { tone: 'co-hero' },
);

/* ===== 第 3 章 ===== */
chapter(3, '界面与视觉演进', 'VISUAL EVOLUTION');

para(
  '校园墙的骨架始终与原生小程序 1:1——这是老用户的手感；但配色身份与排版语言经历了三次明确的换代。本章说明每一次换代解决了什么问题，界面实拍见第 4 章。',
  'lead',
);

h2('3.1', '骨架与设计语言的边界', 'h-3-1');
const s7 = fromMain(/^7\./);
nodesToBlocks(s7.filter((n) => n.type === 'p').slice(0, 1));

h2('3.2', 'V3：多巴胺青春体系（彻底去绿白）', 'h-3-2');
nodesToBlocks(s7.filter((n) => n.type === 'table'));
para(
  '主色从校园绿改为青春紫 `#6D3BF5`，头部是紫→品红→粉的极光，页面底色改淡紫，八个板块各占一个高饱和色相——这是「不再是又一个绿白校园墙」的第一眼证据。',
);

h2('3.3', 'V4：纸感海报体系与全站逐页重做', 'h-3-3');
nodesToBlocks(fromMain(/^V4/));

h2('3.4', 'V5：产品完成度与可信度收口', 'h-3-4');
nodesToBlocks(fromMain(/^V5/));

h2('3.5', '三代设计语言对照', 'h-3-5');
table(
  ['版本', '设计语言', '容器与阴影', '强调色用法'],
  [
    ['V3', '多巴胺极光：紫→品红→珊瑚渐变头、18s 流动、两枚模糊光斑', '渐变描边卡片 + 分层彩色阴影', '八板块八色相，标签 / 头像环 / 图标底各取一色'],
    ['V4', '纸感海报：纸底 + 1.5px 墨线 + 硬投影 + 900 字重标题', 'ds-card 描边 + 3px 硬投影（hover 上浮 / active 下沉）', '荧光块（青柠 / 珊瑚 / 天蓝 / 紫）只做小面积强调'],
    ['V5', '沿用纸感海报，不再更换设计语言', '同上；新增暗色主题全套令牌映射', '荧光色只用于关键动作与数据，正文保持墨色'],
  ],
  '表 3-1　三代设计语言的分工',
);
para(
  '换代的原则是「一次只换一层」：V3 解决配色身份，V4 解决质感与层级，V5 停止换语言、只收口完成度。这样每次改版都不会推翻交互，老用户的手感始终连续。',
);

h2('3.6', '无障碍与回归基线', 'h-3-6');
const a11y = s7.filter((n) => n.type === 'p').slice(-1);
nodesToBlocks(a11y);
callout(
  `<p><strong>口径说明：</strong>文中「400/400」是 V3 时点的测试数；当前主干为 <strong>407/407</strong>（详见第 6 章）。两处数字口径不同，均可在对应提交的 CI 记录中复核。</p>`,
  { tone: 'co-note' },
);

/* ===== 第 4 章 ===== */
chapter(4, '界面实拍', 'SCREENS');

para(
  '以下截图全部来自真实运行的构建产物：桌面端 1440×900（2× 像素密度），移动端 390×844，采集时 0 条控制台报错。素材位于 <code>captures/v5/</code> 与 <code>captures/v6/</code>。',
  'lead',
);

h2('4.1', '桌面端首页：今日简报即首屏第一块内容', 'h-4-1');
figureBlock(
  'v5/d-home.png',
  168,
  '图 4-1',
  '桌面端首页（1440×900）。左栏信息流首块是「今日校园」简报卡，右栏为热门搜索、板块直达与品牌卡；顶部荧光走马条滚动真实站内统计。',
);
para(
  '简报卡把「统计 → 最活跃板块 → 今日最热 → 安全提醒」压进一屏，24 小时无人发帖时自动放宽到近 7 天，永不空窗。这是 AI 进入「浏览」主路径的落点。',
);

h2('4.2', '帖子详情：AI 划重点与雷达匹配', 'h-4-2');
figureBlock(
  'v5/d-post.png',
  168,
  '图 4-2',
  '桌面端帖子详情（1440×900）。正文 1.85 行高；底部「AI 划重点」以虚线切卡独立成条，点击后就地展开 3 条要点与交易风险提示。',
);
pushBlock(
  `<div class="b b-list" data-chapter="${chapterLabel}"><ul>
     <li><strong>划重点不跳页</strong>：入口常驻在互动区上方，展开后就地插入要点与风险提示，读者不会丢失阅读位置。</li>
     <li><strong>互动四等宽</strong>：点赞 / 评论 / 收藏 / 举报固定一行，颜色各自绑定语义（赞=玫红、评=蓝、藏=琥珀）。</li>
   </ul></div>`,
);

h2('4.3', '发布页 AI 一键成稿与分享海报', 'h-4-3');
figureBlock(
  'v5/d-publish.png',
  168,
  '图 4-3',
  '桌面端发布页（1440×900）。顶部青柠色「AI 一键成稿」卡：一句话输入即补全标题、正文、板块、价格与标签；未接入大模型时按站内规则生成。',
);
figureBlock(
  'v5/m-poster.png',
  150,
  '图 4-4',
  '一键生成分享海报（桌面实拍）。海报含品牌头、板块标签、标题正文、点赞/评论/浏览三项数据与站点信息，可直接保存转发。',
);

h2('4.4', '移动端：首页与发布', 'h-4-4');
figureRow([
  {
    src: 'v5/m-home.png',
    w: 80,
    no: '图 4-5',
    caption: '移动端首页（390×844）。海报式头部 + 荧光走马条 + 今日简报卡，TabBar 五项自定义。',
  },
  {
    src: 'v5/m-publish.png',
    w: 80,
    no: '图 4-6',
    caption: '移动端发布页。AI 成稿卡置顶，其后是板块、标题、正文、图片的完整表单，字段与 Web 端一致。',
  },
]);

h2('4.5', '管理后台：治理闭环总览', 'h-4-5');
figureBlock(
  'v5/d-admin-dark.png',
  168,
  '图 4-7',
  '管理后台数据总览（深色主题）。待审内容、待处理举报、审核通过率与 7 日趋势集中呈现，深色主题为全站主题令牌映射，非单独实现。',
);
pushBlock(
  `<div class="b b-list" data-chapter="${chapterLabel}"><ul>
     <li><strong>三块卡片对应治理三步</strong>：待审内容（发布后机审 + 人工队列）、待处理举报（用户侧反馈）、审核通过率与 7 日趋势（质量回看）。</li>
     <li><strong>暗色不是另做一套</strong>：V4 令牌在暗色主题下整体映射（纸→深墨、墨线→纸色），组件与交互完全复用。</li>
   </ul></div>`,
);

h2('4.6', '合规页与注册协议勾选', 'h-4-6');
figureRow([
  {
    src: 'v6/m-legal-privacy.png',
    w: 80,
    no: '图 4-8',
    caption: '移动端隐私政策页。协议文本由小程序 wxml 确定性提取后双端同源渲染，Web 与小程序内容一致。',
  },
  {
    src: 'v6/m-register-agreement.png',
    w: 80,
    no: '图 4-9',
    caption: '注册页协议强制勾选。未勾选「用户协议 + 隐私政策」时注册按钮不可提交，勾选状态与协议链接同屏。',
  },
]);
pushBlock(
  `<div class="b b-list" data-chapter="${chapterLabel}"><ul>
     <li><strong>双端同源</strong>：协议正文由小程序 wxml 确定性提取（<code>gen-legal-web.mjs</code>），Web 与小程序不会出现两个版本。</li>
     <li><strong>强制勾选</strong>：未勾选时注册按钮不可提交；协议链接就在勾选框同屏，不需要二次寻找。</li>
   </ul></div>`,
);

/* ===== 第 5 章 ===== */
chapter(5, 'AI 技术深度：四子系统', 'AI DEPTH');

nodesToBlocks(fromMain(/^9\./));
para('四个子系统的能力概览（速贴版口径）：');
nodesToBlocks(fromOne(/^AI 技术深度/));

const AI_SVG = `
<svg class="diagram" viewBox="0 0 720 226" xmlns="http://www.w3.org/2000/svg" font-family="Microsoft YaHei, sans-serif">
  <defs>
    <marker id="arw2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#14110F"/>
    </marker>
  </defs>
  ${[
    { x: 0, t: '用户动作', s: '发布 / 读帖 / 浏览' },
    { x: 186, t: 'AI 快网关', s: '总预算 8s · 单模型 4s' },
    { x: 372, t: '护栏', s: '注入分级 / 风险改写' },
    { x: 558, t: '产物', s: '成稿 / 要点 / 简报' },
  ]
    .map(
      (b) => `<g>
      <rect x="${b.x}" y="14" width="160" height="56" rx="3" fill="#FFFFFF" stroke="#14110F" stroke-width="1.5"/>
      <text x="${b.x + 80}" y="38" text-anchor="middle" font-size="13" font-weight="800" fill="#14110F">${b.t}</text>
      <text x="${b.x + 80}" y="56" text-anchor="middle" font-size="9.4" fill="#6E6659">${b.s}</text>
    </g>`,
    )
    .join('')}
  <g>
    <rect x="186" y="136" width="346" height="56" rx="3" fill="#F3F9DC" stroke="#14110F" stroke-width="1.5" stroke-dasharray="5 3"/>
    <text x="359" y="159" text-anchor="middle" font-size="12.5" font-weight="800" fill="#14110F">规则兜底（确定性，离线可用）</text>
    <text x="359" y="177" text-anchor="middle" font-size="9.4" fill="#6E6659">板块套版 / 抽取式摘要 / SQL 模板句</text>
  </g>
  <line x1="160" y1="42" x2="182" y2="42" stroke="#14110F" stroke-width="1.5" marker-end="url(#arw2)"/>
  <line x1="346" y1="42" x2="368" y2="42" stroke="#14110F" stroke-width="1.5" marker-end="url(#arw2)"/>
  <line x1="532" y1="42" x2="554" y2="42" stroke="#14110F" stroke-width="1.5" marker-end="url(#arw2)"/>
  <line x1="266" y1="72" x2="266" y2="132" stroke="#14110F" stroke-width="1.4" stroke-dasharray="4 3" marker-end="url(#arw2)"/>
  <text x="274" y="104" font-size="9.2" fill="#6E6659">超时 / 失败 / 5 分钟熔断</text>
  <path d="M532 164 L620 164 L620 74" fill="none" stroke="#14110F" stroke-width="1.4" stroke-dasharray="4 3" marker-end="url(#arw2)"/>
  <text x="300" y="212" font-size="9.2" fill="#6E6659">熔断期内不发起任何网络请求，直接返回规则产物；故障恢复后自动回到模型链路。</text>
</svg>`;

pushBlock(
  `<div class="b b-diagram" data-chapter="${chapterLabel}"><div class="fig-frame">${AI_SVG}</div>
   <div class="cap"><b>图 5-1</b>　AI 请求链路与兜底路径：模型是增强项，不是单点依赖</div></div>`,
);

h2('5.1', '主链路三个 AI 入口', 'h-5-1');
const v3ai = fromMain(/^V3 新增/);
nodesToBlocks(v3ai.filter((n) => n.type === 'table'));
nodesToBlocks(v3ai.filter((n) => n.type === 'p'));

h2('5.2', 'RAG 检索增强（api/rag/，4 文件）', 'h-5-2');
nodesToBlocks(fromMain(/^9\.1/));

h2('5.3', 'Agent 工作流（api/agent/，921 行）', 'h-5-3');
nodesToBlocks(fromMain(/^9\.2/));

h2('5.4', 'AI 护栏（api/ai/guard.ts，225 行）', 'h-5-4');
nodesToBlocks(fromMain(/^9\.3/));

h2('5.5', '多模态（api/multimodal/，274 行）', 'h-5-5');
nodesToBlocks(fromMain(/^9\.4/));

h2('5.6', '断网兜底实测：零 Key、零外网', 'h-5-6');
nodesToBlocks(fromMain(/^9\.5/));

h2('5.7', '模型链容错与前台/后台分轨', 'h-5-7');
const aiBullets = v3ai.filter((n) => n.type === 'list');
const aiFault = aiBullets.length ? aiBullets[0].items.filter((t) => /AI 助手三级容错/.test(t)) : [];
if (aiFault.length) {
  pushBlock(
    `<div class="b b-list" data-chapter="${chapterLabel}"><ul>${aiFault.map((t) => `<li>${inline(t)}</li>`).join('')}</ul></div>`,
  );
}
const v5Rows = fromMain(/^V5/).filter((n) => n.type === 'table');
if (v5Rows.length) {
  const aiRow = v5Rows[0].rows.filter((r) => /AI 分轨|可信度基建/.test(r[0]));
  if (aiRow.length) table(v5Rows[0].header, aiRow, '表 5-2　V5 的 AI 分轨与可信度基建');
}

/* ===== 第 6 章 ===== */
chapter(6, '工程质量与可复现证据', 'ENGINEERING');

para(
  '工程可信度不是形容词，是一组任何人拿到仓库都能重跑的数字。本章的每条命令都写在仓库脚本里，CI 每次 push 自动复验。',
  'lead',
);

h2('6.1', '可复现的工程数据', 'h-6-1');
nodesToBlocks(fromMain(/^3\./));

h2('6.2', '关键指标一览', 'h-6-2');
kpiGrid([
  { n: '407', label: '自动化测试全通过（43 个测试文件）' },
  { n: '15', label: 'Playwright E2E，真 Chromium 全流程' },
  { n: '6', label: 'CI 质量门，master 常绿' },
  { n: '100', unit: '%', label: '失物雷达离线评测 P@1（基线 19%）' },
  { n: '2409', label: '契约压测吞吐（req/s，24 并发）' },
  { n: '5', unit: 'ms', label: '契约压测 p95，零 5xx' },
  { n: '24', unit: '/24', label: 'AI 护栏评估样本通过率' },
  { n: '0', label: '空目录冷启动全链路 5xx 数' },
]);
para(
  '上述指标分别对应 `npm test`、`npx playwright test`、GitHub Actions 六道门、`npm run eval:radar -- --gate`、`npm run loadtest`、`npx tsx scripts/eval-ai.ts` 与 `scripts/verify-stage-wsl.sh`，命令与产物均在仓库内。',
);

h2('6.3', '复现命令与期望结果', 'h-6-3');
table(
  ['命令', '期望'],
  [
    ['`npm test`', '407 passed / 43 个测试文件'],
    ['`npx playwright test`', '15 passed（隔离库自动重灌种子）'],
    ['`npm run lint` / `npm run check`', '0 错误 / 0 错误'],
    ['`npm run eval:radar -- --gate`', '雷达门通过（P@1 100%、MRR 1.000）'],
    ['`npx tsx scripts/eval-ai.ts`', '24/24，产出 `docs/ai-eval-report.md`'],
    ['`bash scripts/verify-stage-wsl.sh`', '冷启动全链路 0 个 5xx'],
  ],
  '表 6-1　评审现场可执行的复现命令',
);

h2('6.4', '工程质量清单（速贴版口径）', 'h-6-4');
nodesToBlocks(fromOne(/^工程质量/));

/* ===== 第 7 章 ===== */
chapter(7, '上线改造、部署与双端交付', 'SHIP & DELIVER');

para(
  '从「能演示」到「能上线」之间隔着一批不体面但必须做的事。本章记录这一轮为上线做的工程改造，以及双端与合规的交付方式。',
  'lead',
);

h2('7.1', '为上线做的工程改造', 'h-7-1');
nodesToBlocks(fromMain(/^6\./));

const v3List = v3ai.filter((n) => n.type === 'list');
if (v3List.length) {
  const rest = v3List[0].items.filter((t) => !/AI 助手三级容错/.test(t));
  if (rest.length) {
    h3('演示素材与静态资源的两个修正');
    pushBlock(
      `<div class="b b-list" data-chapter="${chapterLabel}"><ul>${rest.map((t) => `<li>${inline(t)}</li>`).join('')}</ul></div>`,
    );
  }
}

h2('7.2', '双端与合规交付', 'h-7-2');
nodesToBlocks(fromOne(/^双端与合规/));
callout(
  `<div class="co-kicker">部署与冷启动</div>
   <p>单进程 Node 服务，<code>bash start.sh</code> 即起；服务显式绑定 <code>0.0.0.0</code>，支持 <code>PORT</code> / <code>DATA_DIR</code> / <code>UPLOAD_DIR</code> / <code>BACKUP_DIR</code> 环境变量。<strong>空数据目录冷启动 → 自动建库灌种子 → 登录 / 发帖 / 雷达 / 缩略图 / 今日简报 / AI 成稿 / AI 划重点</strong>全链路在 Ubuntu 24.04.1 + Node 24.22.2 复验 0 个 5xx（<code>scripts/verify-stage-wsl.sh</code>）。同一份产物可部署到 ZCode Sites / Render / 任意容器平台。</p>`,
  { tone: 'co-hero' },
);

/* ===== 第 8 章 ===== */
chapter(8, '安全与合规加固', 'SECURITY');

para(
  '安全条目按「可验证」写：每一条都给出实现位置与验证方式，而不是形容词。本章 8 项为本轮新增或强化。',
  'lead',
);

h2('8.1', '三条最容易被追问的边界', 'h-8-1');
callout(
  `<div class="co-kicker">令牌边界</div>
   <p>access token 只在内存（不落 localStorage），2 小时过期；refresh token 7 天且<strong>单次消费</strong>，jti 登记后重放即拒。业务接口与 WebSocket 只认 <code>type=access</code>，被盗的 refresh 不能当长寿命凭证使用。</p>`,
);
callout(
  `<div class="co-kicker">匿名边界</div>
   <p>匿名不是前端隐藏昵称，而是服务端在列表、详情、编辑、缓存四个层面的一致性约束：非本人强制 <code>is_anonymous = 0</code>，编辑保留原值，缓存 key 带可见性维度，封禁/改密递增 <code>token_version</code>。</p>`,
);
callout(
  `<div class="co-kicker">内容安全边界</div>
   <p>本地敏感词三级 + 微信 <code>msgSecCheck</code>（risky 拒 / review 转人工）+ <code>mediaCheckAsync</code> 图片异步送审；接口异常默认 fail-open，可用 <code>WX_CONTENT_FAIL_CLOSED=1</code> 切为拒绝。策略可配置，行为可预期。</p>`,
);

h2('8.2', '加固清单（逐条可验）', 'h-8-2');
nodesToBlocks(fromMain(/^10\./));

/* ===== 第 9 章 ===== */
chapter(9, '答辩预设 Q&A', 'Q & A');

para('以下 6 个问题来自评审最可能追问的方向，答案均指向可验证的证据而非形容词。', 'lead');

const qaNodes = fromMain(/^11\./);
for (const n of qaNodes) {
  if (n.type !== 'p') {
    nodesToBlocks([n]);
    continue;
  }
  const m = /^\*\*Q：([^]*?)\*\*\s*\n\s*A：([^]*)$/.exec(n.text);
  if (m) {
    pushBlock(
      `<div class="b qa" data-chapter="${chapterLabel}">
         <div class="qa-q"><span class="tag">Q</span>${inline(m[1])}</div>
         <div class="qa-a"><span class="tag tag-a">A</span><div>${inline(m[2])}</div></div>
       </div>`,
    );
  } else {
    para(n.text);
  }
}

h2('9.1', '答辩时的三条口径', 'h-9-1');
pushBlock(
  `<div class="b b-list" data-chapter="${chapterLabel}"><ul>
     <li><strong>先给数字，再给解释</strong>：P@1 100% / MRR 1.000 / 407 测试 / 15 条 E2E / p95 5ms——数字先行，解释只用来交代取舍。</li>
     <li><strong>主动交代边界</strong>：雷达误报 7.1%（刻意用召回换精确）、当前是单校冷启动、演示库每次重启重置。边界说清楚，追问就变成讨论。</li>
     <li><strong>能给命令就不给形容词</strong>：&quot;可复现&quot;的证据是 <code>npm test</code> 的 407 passed，而不是一句「测试很全」。</li>
   </ul></div>`,
);
callout(
  `<p><strong>一句话收尾：</strong>校园墙不是在校园墙上加了一个 AI 入口，而是把 AI 变成了发布、阅读、浏览的默认路径，并且保证这条路径在模型不可用时依然成立。</p>`,
  { tone: 'co-hero' },
);

/* ===== 附录 ===== */
_chapterNo = 10;
chapterLabel = '附录　材料索引与团队';
pushBlock(
  `<div class="b ch-open" data-brk="1" data-chapter="${chapterLabel}" data-toc="ch-app">
     <div class="ch-kicker"><span class="ch-no">附录</span><span class="ch-en">APPENDIX</span></div>
     <h1 class="ch-title">材料索引与团队</h1>
     <div class="ch-bar"></div>
     <div class="ch-en-title">INDEX &amp; TEAM</div>
   </div>`,
  { brk: true, tocId: 'ch-app', level: 1, title: '附录　材料索引与团队' },
);

h2('A', '截图与录屏素材', 'h-a-1');
nodesToBlocks(fromMain(/^8\./));

h2('B', '团队', 'h-b-1');
nodesToBlocks(fromOne(/^团队/));

h2('C', '材料文件索引', 'h-c-1');
table(
  ['材料', '位置', '说明'],
  [
    ['作品说明书（本文件）', '`dist-submission/校园墙-参赛说明书.pdf`', '由 `node scripts/build-submission-pdf.mjs` 生成'],
    ['作品说明书（Markdown 源）', '`docs/COMPETITION-SUBMISSION.md`', '完整版，含全部数字与代码位置'],
    ['速贴版（表单用）', '`docs/SUBMISSION-ONEPAGE.md`', '约 1100 字，可直接粘贴'],
    ['演示视频分镜', '`docs/DEMO-SCRIPT.md`', '90 秒逐镜头旁白，需本人录屏'],
    ['界面实拍', '`captures/v5/`、`captures/v6/`', '桌面 1440×900 / 移动 390×844，0 控制台报错'],
    ['部署说明', '`docs/DEPLOY.md`', '含 VPS 运营级部署'],
    ['安全说明', '`SECURITY.md`', '支持范围、响应承诺、上线检查单'],
    ['提交自查', '`docs/SUBMISSION-CHECKLIST.md`', '账号资格 / 材料 / 60 秒自查 / 风险预案'],
  ],
  '表 C-1　提交材料索引',
);

/* ========================================================================== *
 * 5. HTML 模板
 * ========================================================================== */

const CSS = String.raw`
@page { size: A4; margin: 0; }

:root{
  --ink:#14110F; --ink-2:#241F1B; --ink-soft:#4A443C; --ink-mute:#6E6659;
  --paper:#F7F2E8; --lime:#C8F04A; --coral:#FF4D2E; --sky:#38D6F5; --violet:#6D3BF5;
  --hair:rgba(20,17,15,.16);
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{
  font-family:'Microsoft YaHei','Microsoft YaHei UI','PingFang SC','Noto Sans SC',sans-serif;
  font-size:10pt; line-height:1.68; color:var(--ink-2);
  -webkit-print-color-adjust:exact; print-color-adjust:exact;
}
a{color:var(--violet);text-decoration:none;border-bottom:.2mm dotted rgba(109,59,245,.55)}
.url{color:var(--ink-mute);font-size:.92em}
code{
  font-family:Consolas,'Courier New',monospace; font-size:.86em; color:var(--ink);
  background:#F3EEE2; border:.22mm solid rgba(20,17,15,.2); border-radius:.8mm; padding:0 .8mm;
  white-space:nowrap;
}

/* ---------- 页面骨架 ---------- */
.page{
  position:relative; width:210mm; height:296.8mm; overflow:hidden; background:#fff;
  break-after:page; page-break-after:always;
}
.page:last-child{break-after:auto;page-break-after:auto}
.runhead{
  position:absolute; left:17mm; right:17mm; top:9.5mm;
  display:flex; justify-content:space-between; align-items:flex-end;
  font-size:7.3pt; letter-spacing:.08em; color:var(--ink-mute);
  border-bottom:.35mm solid var(--ink); padding-bottom:1.4mm;
}
.rh-l{font-weight:700;color:var(--ink);letter-spacing:.1em}
.runfoot{
  position:absolute; left:17mm; right:17mm; bottom:8.2mm;
  display:flex; justify-content:space-between; font-size:7.3pt; color:var(--ink-mute); letter-spacing:.04em;
}
.page-body{position:absolute; left:17mm; top:20mm; width:176mm; height:261mm}
#stage{position:absolute; left:-6000px; top:0; visibility:hidden}
#doc{position:static}

/* ---------- 封面 ---------- */
.cover{background:var(--paper)}
.cover .bg{
  position:absolute; inset:0;
  background-image:radial-gradient(rgba(20,17,15,.13) 1px, transparent 1px);
  background-size:4.2mm 4.2mm;
}
.cover .rule-top{position:absolute;left:0;right:0;top:0;height:7mm;background:var(--ink)}
.cover .topbar{
  position:absolute; left:0; right:0; top:0; height:18mm;
  display:flex; justify-content:space-between; align-items:center; padding:0 17mm;
  color:var(--paper); font-size:8pt; letter-spacing:.22em; font-weight:700;
}
.cover .topbar .pill{
  background:var(--lime); color:var(--ink); padding:1.2mm 3.2mm; border-radius:6mm;
  letter-spacing:.18em; font-weight:800;
}
.cover .body{position:absolute; left:17mm; right:17mm; top:54mm}
.cover .sticker{
  display:inline-block; background:var(--coral); color:#fff; font-weight:800;
  font-size:9.5pt; letter-spacing:.2em; padding:1.4mm 3.4mm; transform:rotate(-1.4deg);
  border:.35mm solid var(--ink); box-shadow:1.2mm 1.2mm 0 var(--ink);
}
.cover h1{
  margin:7mm 0 0; font-size:60pt; line-height:1.02; letter-spacing:-.04em; font-weight:900; color:var(--ink);
  position:relative; display:block; width:max-content;
}
.cover h1 .hl{
  position:absolute; left:1mm; right:-2mm; bottom:3mm; height:10mm; background:var(--lime);
  border:.35mm solid var(--ink); z-index:-1;
}
.cover .en{margin-top:3mm;font-size:11pt;letter-spacing:.5em;font-weight:800;color:var(--ink-mute)}
.cover .sub{margin-top:9mm;font-size:19pt;font-weight:800;color:var(--ink);letter-spacing:-.01em;line-height:1.35}
.cover .desc{margin-top:3mm;font-size:10.5pt;color:var(--ink-soft);line-height:1.8;max-width:150mm}
.cover .rule{height:.5mm;background:var(--ink);margin:11mm 0 6mm}
.cover .meta{display:grid;grid-template-columns:repeat(2,1fr);gap:5.5mm 8mm}
.cover .meta .k{font-size:7.4pt;letter-spacing:.16em;color:var(--ink-mute);font-weight:700}
.cover .meta .v{font-size:11.5pt;font-weight:800;color:var(--ink);margin-top:.8mm;line-height:1.35}
.cover .facts{
  position:absolute; left:17mm; right:17mm; bottom:30mm;
  display:flex; gap:4mm; flex-wrap:wrap;
}
.cover .fact{
  border:.35mm solid var(--ink); background:#fff; padding:2.6mm 4mm;
  font-size:9pt; font-weight:700; box-shadow:1.2mm 1.2mm 0 var(--ink);
}
.cover .fact b{font-weight:900}
.cover .foot{
  position:absolute; left:0; right:0; bottom:0; height:16mm; background:var(--ink);
  color:var(--paper); display:flex; align-items:center; justify-content:space-between;
  padding:0 17mm; font-size:8pt; letter-spacing:.1em;
}
.cover .foot .lime{color:var(--lime);font-weight:800}

/* ---------- 正文块 ---------- */
.b{padding:0}
.b-p{padding-bottom:2.7mm}
.b-p p{margin:0;text-align:justify;text-justify:inter-ideograph;word-break:break-word}
.lead p{font-size:11.1pt;line-height:1.78;color:var(--ink);font-weight:500}
.lead p::first-letter{font-weight:900}
p.lead{}
strong{
  font-weight:800;color:var(--ink);
  background:linear-gradient(transparent 64%,rgba(200,240,74,.5) 64%,rgba(200,240,74,.5) 94%,transparent 94%);
}
em{font-style:normal;font-weight:700;color:var(--ink)}

/* 章节头 */
.ch-open{padding:1mm 0 8mm;border-bottom:.4mm solid var(--ink);margin:0}
.ch-kicker{display:flex;gap:4mm;align-items:center;font-size:8pt;letter-spacing:.2em;color:var(--ink-mute);margin-bottom:4mm}
.ch-no{background:var(--ink);color:var(--lime);padding:1mm 2.6mm;font-weight:800;letter-spacing:.12em}
.ch-en{font-weight:700;letter-spacing:.26em}
.ch-title{margin:0;font-size:28pt;line-height:1.06;font-weight:900;letter-spacing:-.025em;color:var(--ink)}
.ch-bar{width:28mm;height:2.6mm;background:var(--lime);border:.35mm solid var(--ink);margin-top:5mm}
.ch-en-title{margin-top:3mm;font-size:8.4pt;letter-spacing:.3em;color:var(--ink-mute);font-weight:700}

/* 小节头 */
.b-h2{padding:3.8mm 0 2.1mm}
.b-h2 h2{margin:0;display:flex;align-items:baseline;gap:2.6mm;font-size:13.2pt;line-height:1.4;font-weight:800;letter-spacing:-.012em;color:var(--ink)}
.b-h2 .no{background:var(--lime);border:.32mm solid var(--ink);border-radius:.9mm;padding:.2mm 1.8mm;font-size:9pt;font-weight:800;letter-spacing:.02em;color:var(--ink);white-space:nowrap}
.b-h3{padding:3mm 0 1.8mm}
.b-h3 h3{margin:0;font-size:11pt;font-weight:800;color:var(--ink);border-left:1.6mm solid var(--lime);padding-left:2.6mm}

/* 表格 */
.b-table{padding-bottom:3.8mm}
.tcap{font-size:7.8pt;color:var(--ink-mute);letter-spacing:.04em;margin-bottom:1.4mm;font-weight:700}
.tbl{width:100%;border-collapse:collapse;font-size:8.4pt;line-height:1.52;border:.35mm solid var(--ink)}
.tbl th{background:var(--ink);color:#F7F2E8;text-align:left;vertical-align:middle;padding:2.1mm 2.4mm;font-size:8.3pt;font-weight:700;letter-spacing:.03em}
.tbl td{padding:1.9mm 2.4mm;border-top:.22mm solid var(--hair);vertical-align:top;word-break:break-word}
.tbl tbody tr:nth-child(even) td{background:#FBF8F0}
.tbl td:first-child{color:var(--ink);font-weight:700}
.tbl strong{background:none;font-weight:800}
.tbl code{font-size:.92em;white-space:normal}

/* 列表 */
.b-list{padding-bottom:2.6mm}
.b-list ul{list-style:none;margin:0;padding:0}
.b-list ul li{position:relative;padding:0 0 1.8mm 4.8mm;text-align:justify}
.b-list ul li::before{content:'';position:absolute;left:0;top:2.35mm;width:1.7mm;height:1.7mm;background:var(--lime);border:.3mm solid var(--ink)}
.b-list ol{margin:0;padding-left:5.4mm}
.b-list ol li{padding-bottom:1.8mm;text-align:justify}
.b-list ol li::marker{color:var(--ink);font-weight:800}

/* 代码 */
.b-code{padding-bottom:3.4mm}
.b-code pre{
  margin:0;background:#F5F0E4;border:.3mm solid var(--ink);border-left:1.8mm solid var(--lime);
  padding:2.6mm 3.2mm;font-family:Consolas,monospace;font-size:8.2pt;line-height:1.55;
  white-space:pre-wrap;word-break:break-word;
}
.b-quote{padding-bottom:3mm}
.b-quote blockquote{margin:0;padding:1mm 0 1mm 4mm;border-left:1.6mm solid var(--ink);color:var(--ink-soft)}
.b-hr{padding:2mm 0 4mm}
.b-hr .rule{height:.3mm;background:var(--ink);opacity:.35}

/* 强调块 */
.b-callout{padding-bottom:3.4mm}
.callout{
  background:var(--paper);border:.35mm solid var(--ink);border-left:2.4mm solid var(--lime);
  padding:3.2mm 4mm;box-shadow:1.1mm 1.1mm 0 var(--ink);
}
.callout p{margin:0;text-align:justify;font-size:9.5pt;line-height:1.7}
.callout p + p{margin-top:2mm}
.co-kicker{font-size:8pt;font-weight:800;letter-spacing:.12em;color:var(--ink);margin-bottom:1.6mm}
.co-main{font-size:12.5pt;font-weight:800;line-height:1.45;color:var(--ink)}
.co-hero{border-left-color:var(--ink);background:#F3F9DC}
.co-note{border-left-color:var(--coral);background:#FFF6EF}
.co-note p{font-size:9pt}

/* KPI */
.b-kpi{padding-bottom:4mm}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:3.2mm}
.kpi{border:.35mm solid var(--ink);background:#fff;padding:3mm 2.8mm 3.2mm;box-shadow:1mm 1mm 0 var(--ink)}
.kpi .n{font-size:19pt;font-weight:900;line-height:1;letter-spacing:-.03em;color:var(--ink);font-variant-numeric:tabular-nums}
.kpi .n small{font-size:9pt;font-weight:800;margin-left:.5mm;letter-spacing:0}
.kpi .l{font-size:7.6pt;color:var(--ink-mute);margin-top:1.8mm;line-height:1.42}

/* 图 */
.b-fig{padding-bottom:4mm}
.fig{margin:0}
.fig img.shot{display:block;border:.35mm solid var(--ink);box-shadow:1.3mm 1.3mm 0 var(--ink);background:#fff}
.fig .cap{margin-top:2.8mm;font-size:8pt;line-height:1.55;color:var(--ink-mute);text-align:justify}
.fig .cap b{color:var(--ink);font-weight:800;letter-spacing:.02em}
.fig .cap .note{display:block;margin-top:.8mm}
.fig-row{display:flex;gap:8mm;align-items:flex-start}
.fig-row .fig{flex:0 0 auto}
.b-figrow{padding-bottom:4mm}
.b-diagram{padding-bottom:5mm}
.fig-frame{border:.35mm solid var(--ink);background:#fff;padding:3mm;box-shadow:1.3mm 1.3mm 0 var(--ink)}
.diagram{display:block;width:100%;height:auto}

/* Q&A */
.qa{padding-bottom:4.2mm}
.qa-q{
  display:flex;gap:2.6mm;align-items:flex-start;font-size:10.6pt;font-weight:800;color:var(--ink);
  background:var(--paper);border:.35mm solid var(--ink);border-left:2.4mm solid var(--lime);
  padding:2.8mm 3.6mm;
}
.qa-a{display:flex;gap:2.6mm;padding:2.6mm 3.6mm 0;font-size:9.6pt;line-height:1.72;text-align:justify;color:var(--ink-2)}
.qa-a > div{flex:1}
.tag{
  flex:0 0 auto;background:var(--ink);color:var(--lime);font-size:8pt;font-weight:800;
  width:5mm;height:5mm;display:flex;align-items:center;justify-content:center;border-radius:.8mm;margin-top:.2mm;
}
.tag-a{background:var(--lime);color:var(--ink);border:.3mm solid var(--ink)}

/* 目录 */
.toc-head{padding:2mm 0 5mm;border-bottom:.4mm solid var(--ink)}
.toc-title{font-size:24pt;font-weight:900;letter-spacing:.08em;color:var(--ink)}
.toc-sub{font-size:8pt;letter-spacing:.28em;color:var(--ink-mute);font-weight:700;margin-top:2mm}
.toc-entry{display:flex;align-items:baseline;padding:1.55mm 0}
.toc-entry .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.toc-entry .dots{flex:1;border-bottom:.2mm dotted #B6AE9F;margin:0 2mm;transform:translateY(-.9mm)}
.toc-entry .pg{font-variant-numeric:tabular-nums;font-weight:800;color:var(--ink);min-width:7mm;text-align:right}
.toc-entry.lv1{font-size:10.4pt;font-weight:800;color:var(--ink);padding-top:3.4mm;border-top:.22mm solid var(--hair)}
.toc-entry.lv1:first-of-type{border-top:0;margin-top:0}
.toc-entry.lv2{font-size:9pt;padding-left:6.5mm;color:var(--ink-soft)}
`;

function buildHtml() {
  const bodyBlocks = blocks
    .map(
      (b) =>
        b.html.replace(
          /^<div class="b ([^"]*)"/,
          (m, cls) =>
            `<div class="b ${cls}" data-brk="${b.brk ? 1 : 0}" data-keep="${b.keep ? 1 : 0}"${
              b.tocId ? ` data-toc="${b.tocId}"` : ''
            }`,
        ),
    )
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${META.title}</title>
<meta name="author" content="${META.author}">
<meta name="description" content="校园墙参赛说明书｜${META.track}">
<style>${CSS}</style>
</head>
<body>
<section class="page cover">
  <div class="bg"></div>
  <div class="rule-top"></div>
  <div class="topbar">
    <span class="pill">CAMPUS WALL</span>
    <span>${META.track}</span>
  </div>
  <div class="body">
    <span class="sticker">参赛说明书</span>
    <h1>校园墙<span class="hl"></span></h1>
    <div class="en">CAMPUS WALL</div>
    <div class="sub">面向高校的 AI 原生校园社区</div>
    <div class="desc">Web（Vue3 + TypeScript）＋ 原生微信小程序双端 · 八大板块 · AI 进入发布、阅读、浏览三条主路径，且每个能力都带确定性规则兜底。</div>
    <div class="rule"></div>
    <div class="meta">
      <div><div class="k">作品名称</div><div class="v">校园墙 Campus Wall</div></div>
      <div><div class="k">参赛赛道</div><div class="v">${META.track}</div></div>
      <div><div class="k">作者</div><div class="v">${META.author}</div></div>
      <div><div class="k">学校</div><div class="v">${META.school}</div></div>
      <div><div class="k">日期</div><div class="v">${META.date}</div></div>
      <div><div class="k">作品形态</div><div class="v">Web ＋ 微信小程序（双端）</div></div>
    </div>
  </div>
  <div class="facts">
    <div class="fact"><b>407</b> 条自动化测试</div>
    <div class="fact"><b>15</b> 条 Playwright E2E</div>
    <div class="fact"><b>6</b> 道 CI 质量门</div>
    <div class="fact">失物雷达 <b>P@1 100%</b></div>
  </div>
  <div class="foot">
    <span>${META.contest}</span>
    <span class="lime">2026 · AI WEB</span>
  </div>
</section>

<div id="stage">
${bodyBlocks}
</div>

<div id="doc"></div>

<script>
window.__layout = async function (cfg) {
  const MM = 96 / 25.4;
  const bodyH = cfg.bodyH * MM;
  const bodyW = cfg.bodyW * MM;
  const doc = document.getElementById('doc');
  const stage = document.getElementById('stage');
  stage.style.width = bodyW + 'px';

  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
  await Promise.all([...document.images].map((img) => (img.decode ? img.decode().catch(() => {}) : null)));

  const warnings = [];
  const mkPage = (extraClass) => {
    const s = document.createElement('section');
    s.className = 'page' + (extraClass ? ' ' + extraClass : '');
    s.innerHTML =
      '<div class="runhead"><span class="rh-l">校园墙 · 参赛说明书</span><span class="rh-r"></span></div>' +
      '<div class="page-body"></div>' +
      '<div class="runfoot"><span class="rf-l">AI WEB 赛道 · 东莞理工学院</span><span class="pg"></span></div>';
    return s;
  };

  const measure = () => {
    const out = [];
    for (const el of [...stage.children]) {
      out.push({
        el,
        h: el.getBoundingClientRect().height,
        brk: el.dataset.brk === '1',
        keep: el.dataset.keep === '1',
        toc: el.dataset.toc || '',
      });
    }
    return out;
  };

  /* ---- 正文装页 ---- */
  const items = measure();
  const pages = [];
  const pageOf = {};
  let cur = null;
  const newPage = () => {
    const el = mkPage();
    doc.appendChild(el);
    const p = { el, body: el.querySelector('.page-body'), used: 0, index: pages.length };
    pages.push(p);
    return p;
  };

  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const nxt = items[i + 1];
    const need = it.h + (it.keep && nxt ? nxt.h : 0);

    if (it.brk) {
      cur = newPage();
    } else if (!cur) {
      cur = newPage();
    } else if (cur.used + need > bodyH + 0.6) {
      cur = newPage();
    }

    if (it.h > bodyH) {
      warnings.push('块高于整页（' + Math.round(it.h) + 'px > ' + Math.round(bodyH) + 'px）：' + (it.el.textContent || '').slice(0, 40));
    }

    cur.body.appendChild(it.el);
    cur.used += it.h;
    if (it.toc) pageOf[it.toc] = cur.index;
  }

  /* ---- 目录 ---- */
  stage.innerHTML = '';
  const tocHead = document.createElement('div');
  tocHead.className = 'b toc-head';
  tocHead.innerHTML = '<div class="toc-title">目　录</div><div class="toc-sub">CONTENTS</div>';
  stage.appendChild(tocHead);

  const entries = cfg.toc.map((e) => {
    const d = document.createElement('div');
    d.className = 'b toc-entry lv' + e.level;
    d.innerHTML =
      '<span class="t">' + e.title.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>' +
      '<span class="dots"></span><span class="pg">—</span>';
    d.dataset.tocId = e.id;
    stage.appendChild(d);
    return d;
  });

  const tocItems = measure();
  const tocPages = [];
  let tcur = null;
  const newTocPage = () => {
    const el = mkPage('toc-page');
    const p = { el, body: el.querySelector('.page-body'), used: 0, index: tocPages.length };
    tocPages.push(p);
    return p;
  };
  for (let i = 0; i < tocItems.length; i += 1) {
    const it = tocItems[i];
    const nxt = tocItems[i + 1];
    const need = it.h + (it.keep && nxt ? nxt.h : 0);
    if (!tcur) tcur = newTocPage();
    else if (tcur.used + need > bodyH + 0.6) tcur = newTocPage();
    tcur.body.appendChild(it.el);
    tcur.used += it.h;
  }

  const anchor = doc.firstChild;
  for (const p of tocPages) doc.insertBefore(p.el, anchor);

  /* ---- 页码 ---- */
  const contentPages = [...doc.querySelectorAll('.page:not(.toc-page)')];
  const allPages = [...doc.querySelectorAll('.page')];
  const total = allPages.length + 1; // + 封面
  let label = '';
  for (const p of contentPages) {
    const cb = p.querySelector('.page-body [data-chapter]');
    if (cb && cb.dataset.chapter) label = cb.dataset.chapter;
    const rh = p.querySelector('.rh-r');
    if (rh) rh.textContent = label;
  }
  allPages.forEach((p, i) => {
    const n = p.querySelector('.runfoot .pg');
    if (n) n.textContent = '第 ' + (i + 2) + ' 页 / 共 ' + total + ' 页';
  });

  const tocOffset = tocPages.length + 2; // 封面 1 页 + 目录页 + 1
  for (const e of entries) {
    const id = e.dataset.tocId;
    const idx = pageOf[id];
    const num = e.querySelector('.pg');
    if (num) num.textContent = typeof idx === 'number' ? String(tocOffset + idx) : '—';
  }

  return {
    total,
    contentCount: contentPages.length,
    tocCount: tocPages.length,
    warnings,
    pageMap: pageOf,
  };
};
</script>
</body>
</html>`;
}

/* ========================================================================== *
 * 6. 主流程
 * ========================================================================== */

function countPdfPages(buf) {
  const s = buf.toString('latin1');
  const pageObjs = (s.match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
  const counts = [...s.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  return { pageObjs, maxCount: counts.length ? Math.max(...counts) : null };
}
const fmtKB = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function main() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.writeFileSync(OUT_HTML, buildHtml(), 'utf8');

  const browser = await chromium.launch();
  let result;
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(pathToFileURL(OUT_HTML).href, { waitUntil: 'load' });
    result = await page.evaluate(
      async (cfg) => window.__layout(cfg),
      { bodyH: 261, bodyW: 176, toc },
    );

    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      outline: true,
      tagged: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    }).then((buf) => fs.writeFileSync(OUT_PDF, buf));

    if (consoleErrors.length) {
      console.log('⚠ 页面控制台错误：');
      consoleErrors.slice(0, 5).forEach((e) => console.log('  ' + e));
    }
  } finally {
    await browser.close();
  }

  const buf = fs.readFileSync(OUT_PDF);
  const pdf = countPdfPages(buf);

  console.log('');
  console.log('校园墙 · 参赛说明书');
  console.log('─'.repeat(52));
  console.log(`输出文件   ${OUT_PDF}`);
  console.log(`页数       ${result.total} 页（封面 1 + 目录 ${result.tocCount} + 正文 ${result.contentCount}）`);
  console.log(`PDF 校验   解析到 /Type /Page 对象 ${pdf.pageObjs} 个`);
  console.log(`文件大小   ${fmtKB(buf.length)}（${buf.length} 字节）`);
  console.log(
    `章节起始页 ${toc
      .filter((t) => t.level === 1)
      .map((t) => `${t.title.replace(/^第 (\d+) 章.*/, '第$1章').replace(/^附录.*/, '附录')}=P${(result.pageMap[t.id] ?? 0) + result.tocCount + 2}`)
      .join('  ')}`,
  );
  if (result.warnings.length) {
    console.log('');
    console.log('⚠ 排版告警：');
    result.warnings.forEach((w) => console.log('  - ' + w));
  }
  if (pdf.pageObjs !== result.total) {
    console.log('');
    console.log(`⚠ PDF 实际页数（${pdf.pageObjs}）与排版页数（${result.total}）不一致，请检查分页高度。`);
    process.exitCode = 1;
  }
  if (result.total > 30) {
    console.log('');
    console.log(`⚠ 页数 ${result.total} 超过 30 页上限，需要精简内容或调小字号。`);
    process.exitCode = 1;
  } else if (result.total < 20) {
    console.log('');
    console.log(`ℹ 页数 ${result.total} 少于 20 页，可按需补充截图或说明。`);
  }

  if (!KEEP_HTML) {
    try {
      fs.rmSync(BUILD_DIR, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  } else {
    console.log(`中间 HTML  ${OUT_HTML}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
