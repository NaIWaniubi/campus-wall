# -*- coding: utf-8 -*-
"""生成 2026 微信小程序开发大赛 · 小程序说明文档（PDF）"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_JUSTIFY, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, HRFlowable, KeepTogether)

# ── 字体注册（Windows 微软雅黑）──────────────────────────────────
FONTS = r'C:\Windows\Fonts'
pdfmetrics.registerFont(TTFont('YH', os.path.join(FONTS, 'msyh.ttc'), subfontIndex=0))
pdfmetrics.registerFont(TTFont('YHB', os.path.join(FONTS, 'msyhbd.ttc'), subfontIndex=0))
pdfmetrics.registerFontFamily('YH', normal='YH', bold='YHB')

BRAND = colors.HexColor('#2563EB')
DARK = colors.HexColor('#111827')
GREY = colors.HexColor('#4B5563')
LIGHT = colors.HexColor('#F3F4F6')

def S(name, **kw):
    base = dict(fontName='YH', fontSize=10.5, leading=18, textColor=DARK,
                alignment=TA_JUSTIFY, spaceAfter=6)
    base.update(kw)
    return ParagraphStyle(name, **base)

TITLE = S('title', fontName='YHB', fontSize=24, leading=34, alignment=TA_CENTER,
          textColor=BRAND, spaceAfter=4)
SUB = S('sub', fontSize=12, leading=20, alignment=TA_CENTER, textColor=GREY, spaceAfter=2)
H1 = S('h1', fontName='YHB', fontSize=14.5, leading=24, textColor=BRAND,
       spaceBefore=14, spaceAfter=7, alignment=TA_LEFT)
H2 = S('h2', fontName='YHB', fontSize=11.5, leading=20, textColor=DARK,
       spaceBefore=8, spaceAfter=4, alignment=TA_LEFT)
BODY = S('body', firstLineIndent=0)
BULLET = S('bullet', leftIndent=14, bulletIndent=2, spaceAfter=3.5)
CELL = S('cell', fontSize=9.5, leading=15, spaceAfter=0)
CELLB = S('cellb', fontName='YHB', fontSize=9.5, leading=15, spaceAfter=0)
CAP = S('cap', fontSize=9, leading=14, textColor=GREY, alignment=TA_CENTER, spaceAfter=2)

def P(t, st=BODY):
    return Paragraph(t, st)

def B(t):
    return Paragraph(t, BULLET, bulletText='•')

def rule():
    return HRFlowable(width='100%', thickness=0.7, color=colors.HexColor('#DBEAFE'),
                      spaceBefore=2, spaceAfter=8)

story = []

# ── 封面标题区 ────────────────────────────────────────────────
story += [
    Spacer(1, 6),
    P('校园墙 Campus Wall', TITLE),
    P('——面向高校场景的 AI 智能信息聚合与撮合平台', SUB),
    Spacer(1, 4),
    rule(),
    Spacer(1, 2),
]

info = [
    ['小程序名称', '校园墙'],
    ['小程序 AppID', 'wxe576045854db55ac'],
    ['参赛赛事', '2026 微信小程序开发大赛（主题：与 AI 共生）'],
    ['主办单位', '微信小程序团队 · 世界人工智能大会创新孵化平台 WAIC Future Tech'],
    ['作品形态', '微信小程序（28 个原生页面）+ Web 端 + 管理后台'],
    ['技术栈', '微信小程序原生 · TypeScript · Node.js · SQLite(FTS5) · Vue 3'],
]
t = Table([[Paragraph(k, CELLB), Paragraph(v, CELL)] for k, v in info],
          colWidths=[32 * mm, 128 * mm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (0, -1), LIGHT),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('LINEBELOW', (0, 0), (-1, -2), 0.4, colors.HexColor('#E5E7EB')),
    ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#DBEAFE')),
]))
story += [t, Spacer(1, 10)]

# ── 一、功能简介 ──────────────────────────────────────────────
story += [P('一、小程序功能简介', H1), rule()]
story += [P('「校园墙」是一款面向高校学生的校园信息聚合与智能撮合社区平台。针对校园信息高度碎片化、'
            '传播效率低、匿名表达需求强等痛点，平台按真实校园场景划分<b>八大垂直板块</b>：'
            '二手交易、失物招领、表白墙、吐槽树洞、互助问答、校园活动、拼车出行、组队招募，'
            '通过「小程序 + Web + 管理后台」三端协同，构建纯净、高效、可治理的校园信息生态。', BODY)]

story += [P('1. 用户端核心能力', H2)]
for x in [
    '<b>账号与信用体系</b>：学号注册登录，内置 0–120 分级信誉分模型，信誉分直接驱动发帖频次、'
    '匿名权限与互动权限，形成正向激励闭环。',
    '<b>内容发布</b>：支持草稿箱（本地实时保存 + 云端跨设备同步）、24 小时内编辑、'
    '敏感词实时检测；不同板块呈现差异化表单字段（二手价格/新旧程度、失物地点/时间、活动主办方等）。',
    '<b>信息浏览与检索</b>：首页信息流、板块横向 Tab、下拉刷新、上拉无限加载、骨架屏；'
    '300ms 防抖搜索、本地搜索历史、热门搜索词。',
    '<b>互动体系</b>：点赞、收藏、楼中楼回复、热门评论标识、举报（24 小时频控、3 人举报自动升级优先级）。',
    '<b>社交与消息</b>：私信会话、关注/粉丝体系、评论与点赞通知分类、未读红点提醒。',
    '<b>AI 智能助手</b>：基于站内知识库与帖子检索的智能问答，为校园场景提供即时应答。',
]:
    story.append(B(x))

story += [P('2. 管理后台能力', H2)]
story += [P('提供数据看板（6 项核心指标 + 近 7 天趋势 + 板块/学院分布）、用户管理（封禁/解封、'
            '重置密码、信誉分调整）、内容审核、评论管理、举报处理、板块管理、公告管理，'
            '以及<b>人工审核队列</b>与<b>匿名帖阈值曝光</b>（同一匿名帖待处理举报 ≥3 时向管理员揭示作者）'
            '等校园治理专属能力。', BODY)]

# ── 二、应用场景 ──────────────────────────────────────────────
story += [P('二、应用场景', H1), rule()]
scenes = [
    ['场景', '典型痛点', '校园墙解决方案'],
    ['二手交易', '毕业季/换季物品流转依赖微信群，信息被快速刷屏淹没，无信用约束',
     '二手板块结构化字段（价格/新旧/交易方式）+ 意向出价撮合 + 双向互评联动信誉分'],
    ['失物招领', '丢失与拾获信息分散在不同群聊，人工比对效率极低，找回率低',
     '「智能雷达」自动反向召回高相似对向信息，发布即匹配，双向站内通知'],
    ['匿名表达', '树洞/表白等强匿名需求与平台合规治理存在天然冲突',
     '强制匿名板块 + 后台可溯源 + 敏感词三级风险评定，兼顾表达自由与内容安全'],
    ['校园活动', '活动信息散落在各学院通知渠道，学生触达率低',
     '活动板块结构化发布（时间/地点/主办方）+ 板块订阅每日摘要推送'],
    ['拼车与组队', '寒暑假/节假日出行与组队需求集中爆发，缺乏匹配工具',
     '拼车（出发地/目的地/时间/费用）与组队（队伍名称/招募人数/截止日期）专属字段化发布'],
]
t2 = Table([[Paragraph(c, CELLB if i == 0 else CELL) for c in row] for i, row in enumerate(scenes)],
           colWidths=[22 * mm, 58 * mm, 80 * mm], repeatRows=1)
t2.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EFF6FF')),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#E5E7EB')),
]))
story += [t2, Spacer(1, 6)]

# ── 三、解决的实际问题 ────────────────────────────────────────
story += [P('三、解决的实际问题', H1), rule()]
for x in [
    '<b>信息碎片化</b>：将分散于数十个微信群的校园信息统一归集到八大结构化板块，'
    '并通过 FTS5 全文检索实现秒级召回。',
    '<b>匹配效率低</b>：失物招领场景由「人工翻群比对」升级为「算法自动反向召回」，'
    '复合评分模型同时考虑文本相似度、地点重合度与时间衰减。',
    '<b>交易无保障</b>：引入意向出价排他锁定机制与交易后双向互评，好评/差评直接联动信誉分升降，'
    '使校园二手交易具备可追溯的信用约束。',
    '<b>匿名社区治理难</b>：三级内容风险评定（高风险驳回 / 中风险进人工队列 / 低风险放行）'
    '+ 匿名可溯源 + 举报动态升权，解决「匿名」与「合规」的根本矛盾。',
    '<b>信息触达被动</b>：板块订阅 + 每日定时摘要推送，把「人找信息」变为「信息找人」。',
]:
    story.append(B(x))

# ── 四、技术开发方案 ──────────────────────────────────────────
story += [P('四、技术开发方案', H1), rule()]
story += [P('4.1 总体架构', H2)]
story += [P('采用「小程序原生 + Web 前端 + Node.js 服务端」三端同源架构，'
            '小程序端与 Web 端共用同一套后端接口契约，保证数据一致性与功能对齐。'
            '服务端基于 Express 5 + TypeScript 严格模式构建，数据层通过 Kysely 抽象并支持 '
            'SQLite / PostgreSQL 双引擎切换。', BODY)]

story += [P('4.2 全文检索底座（中文分词攻坚）', H2)]
story += [P('SQLite FTS5 内置的 unicode61 分词器无法切分中文（连续汉字被视为单一 token，'
            '导致子串无法匹配）。项目通过注册自定义 SQL 函数 <b>cjk_bigrams</b>，'
            '将文本预切分为「ASCII 词块 + 中文 2 字滑窗」的空格分隔 token 串写入索引，'
            '并在查询侧以同构滑窗构造 MATCH 表达式，二者一一对应。'
            '同时通过三个同步触发器（INSERT / UPDATE / DELETE）保证索引与主表原子一致，'
            '老库可自动检测重建并幂等回填存量数据。', BODY)]

story += [P('4.3 智能雷达匹配算法', H2)]
story += [P('面向失物招领场景，设计「反向方向召回 + 复合评分」两阶段算法：', BODY)]
story += [B('<b>召回阶段</b>：基于 FTS5 BM25 排序召回对向方向（寻物 ↔ 招领）的候选集；')]
story += [B('<b>评分阶段</b>：复合评分 = BM25 归一化得分（0–30）+ 地点强匹配（+35）+ 时间线性衰减（0–25），'
            '阈值设为 60，确保「同地点 + 同时段」必然达标，同时有效排除无地点噪声；')]
story += [B('<b>可解释性</b>：算法输出命中原因列表（如「地点重合」「时间吻合」），'
            '在前端以标签形式展示，让匹配结果对用户透明可理解。')]

story += [P('4.4 意向出价排他锁定闭环', H2)]
story += [P('二手交易板块实现完整的意向撮合状态机：买家发起出价 → 卖家接受（事务内排他锁定，'
            '同帖其余 pending 出价自动置为拒绝）→ 标记交易完成后自动收口为 completed。'
            '全流程在数据库事务中执行，避免并发场景下的重复成交。', BODY)]

story += [P('4.5 内容安全与合规体系', H2)]
for x in [
    '前后端双重敏感词检测，三级风险评定（高风险直接驳回 / 中风险进人工审核队列 / 低风险正常发布）；',
    'ASCII 敏感词按词边界匹配，避免「USB」被「sb」子串误杀；后端支持命中位置提取供审核高亮；',
    '信誉分阈值控制发帖、评论与匿名权限；发帖每日上限、评论 10 秒频控、举报 24 小时频控；',
    '软删除机制保证数据可追溯，匿名帖在举报达阈值时可向管理员溯源。',
]:
    story.append(B(x))

story += [P('4.6 工程质量与可观测性', H2)]
for x in [
    'TypeScript 严格模式全量覆盖，Zod 对全部写操作入参做 schema 校验；',
    'Vitest 单元与集成测试 135 项、Playwright 端到端测试覆盖核心业务流；',
    'Sentry 异常上报 + Prometheus 指标暴露（HTTP 时延、数据库查询耗时直方图、缓存命中率）；',
    'Winston 分级日志落盘、JWT 鉴权、接口限流、上传文件魔数校验与路径穿越防护。',
]:
    story.append(B(x))

# ── 五、创新点 ────────────────────────────────────────────────
story += [P('五、小程序创新点', H1), rule()]
for x in [
    '<b>中文全文检索的自研解法</b>：在不引入外部检索引擎的前提下，'
    '用自定义 SQL 函数 + 滑窗分词在 SQLite FTS5 上实现了可用的中文检索，'
    '兼顾轻量化部署与检索性能。',
    '<b>可解释的智能匹配</b>：不止给出匹配结果，还输出「为什么匹配」的原因标签，'
    '让算法决策对用户透明，显著提升用户对撮合结果的信任度。',
    '<b>信用驱动的社区治理</b>：将信誉分贯穿发帖、匿名、互动、交易全链路，'
    '配合双向互评形成自净化的社区生态，而非单纯依赖人工审核。',
    '<b>三端同源的一致性设计</b>：小程序、Web 与管理后台共用同一套后端契约与业务规则，'
    '确保多端功能与数据严格对齐。',
    '<b>AI 能力与校园真实场景结合</b>：AI 助手基于站内知识库与帖子检索作答，'
    '并将算法智能（雷达撮合）落到失物找回这一高频刚需场景，'
    '契合大赛「与 AI 共生」主题。',
]:
    story.append(B(x))

# ── 六、团队情况 ──────────────────────────────────────────────
story += [P('六、团队情况', H1), rule()]
story += [P('本项目由参赛者独立完成全部产品设计、前端开发、服务端开发与测试工作，'
            '涵盖需求分析、交互设计、数据库设计、算法设计、工程化建设与部署运维全流程。'
            '（如为团队参赛，请在此处补充每位成员的分工说明，单队人数上限 3 人。）', BODY)]

# ── 七、第三方成果说明 ────────────────────────────────────────
story += [P('七、第三方成果与开源依赖说明', H1), rule()]
story += [P('本作品除下述公开开源软件依赖外，全部业务逻辑、算法与界面均为参赛者独立开发，'
            '未使用任何非团队成员提供的专有开发成果。', BODY)]
deps = [
    ['类别', '依赖项', '用途'],
    ['服务端框架', 'Express 5、Kysely、better-sqlite3', 'HTTP 服务、数据访问与本地数据库'],
    ['前端框架', 'Vue 3、Vite、Pinia、Tailwind CSS', 'Web 端界面与状态管理'],
    ['内容安全', '自研敏感词与风险分级模块', '三级风险评定（自研）'],
    ['可观测性', 'Sentry、prom-client、Winston', '异常上报、指标暴露与日志'],
    ['测试', 'Vitest、Playwright', '单元/集成/端到端测试'],
    ['AI 能力', 'OpenRouter 兼容大模型网关', 'AI 助手问答（调用公开 API）'],
]
t3 = Table([[Paragraph(c, CELLB if i == 0 else CELL) for c in row] for i, row in enumerate(deps)],
           colWidths=[26 * mm, 64 * mm, 70 * mm], repeatRows=1)
t3.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EFF6FF')),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#E5E7EB')),
]))
story += [t3, Spacer(1, 8)]
story += [P('以上开源组件均遵循各自的开源许可协议使用，未对作品核心业务逻辑构成实质性贡献。', CAP)]

# ── 页脚 ──────────────────────────────────────────────────────
def footer(canv, doc):
    canv.saveState()
    canv.setFont('YH', 8.5)
    canv.setFillColor(colors.HexColor('#9CA3AF'))
    canv.drawString(20 * mm, 12 * mm, '校园墙 Campus Wall · 2026 微信小程序开发大赛参赛作品说明文档')
    canv.drawRightString(190 * mm, 12 * mm, '第 %d 页' % doc.page)
    canv.setStrokeColor(colors.HexColor('#E5E7EB'))
    canv.setLineWidth(0.5)
    canv.line(20 * mm, 16 * mm, 190 * mm, 16 * mm)
    canv.restoreState()

OUT = r'E:\Downloads\2026微信小程序开发大赛_小程序说明文档_校园墙.pdf'
doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=20 * mm, rightMargin=20 * mm,
                        topMargin=18 * mm, bottomMargin=22 * mm,
                        title='校园墙 Campus Wall · 小程序说明文档',
                        author='校园墙参赛团队',
                        subject='2026 微信小程序开发大赛参赛作品说明文档')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print('OK ->', OUT)
print('size:', os.path.getsize(OUT), 'bytes')
