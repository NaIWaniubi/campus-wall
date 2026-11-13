<script setup lang="ts">
/**
 * 分享海报生成（V5）
 * 纯 Canvas 绘制 750×1000 的 V4 海报（纸底墨字 + 板块色 + 首图 + 统计），
 * 零新依赖。产出：下载 PNG / 复制到剪贴板 / 系统分享（支持时）。
 */
import { ref, computed, watch, nextTick } from 'vue'
import { Download, ClipboardCopy, Share2, Loader2, X } from '@lucide/vue'
import { sectionColor } from '@/utils/sections'
import { toast } from '@/utils/request'
import { trapWithInert } from '@/composables/useModalInert'

const props = defineProps<{
  visible: boolean
  post: {
    id?: number
    title: string
    content: string
    images?: string[]
    section?: { id?: number; name?: string }
    author?: { nickname?: string }
    isAnonymous?: boolean
    likeCount?: number
    commentCount?: number
    viewCount?: number
    createdAt?: string
  } | null
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const busy = ref(false)
const dataUrl = ref('')

const W = 750
const H = 1000

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number): number {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  let line = ''
  let cy = y
  let used = 0
  for (const ch of clean) {
    const test = line + ch
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy)
      used++
      if (used >= maxLines) return used
      line = ch
      cy += lineH
    } else {
      line = test
    }
  }
  if (line && used < maxLines) { ctx.fillText(line, x, cy); used++ }
  return used
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

async function render() {
  const p = props.post
  const canvas = canvasRef.value
  if (!p || !canvas) return
  busy.value = true
  try {
    const dpr = 2 // 高清导出
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = '100%'
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    // 纸底
    ctx.fillStyle = '#F7F2E8'
    ctx.fillRect(0, 0, W, H)

    const accent = sectionColor(p.section?.id ?? 0, p.section?.name ?? '') || '#6D3BF5'

    // ── 顶部品牌带（恒暗海报头）──
    ctx.fillStyle = '#14110F'
    ctx.fillRect(0, 0, W, 150)
    // 贴纸
    ctx.save()
    ctx.translate(48, 52)
    ctx.rotate((-4 * Math.PI) / 180)
    ctx.fillStyle = '#FF4D2E'
    roundRect(ctx, 0, 0, 150, 44, 10)
    ctx.fill()
    ctx.strokeStyle = '#F7F2E8'
    ctx.lineWidth = 2
    roundRect(ctx, 0, 0, 150, 44, 10)
    ctx.stroke()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '900 22px "PingFang SC","Microsoft YaHei",sans-serif'
    ctx.fillText('CAMPUS', 18, 30)
    ctx.restore()
    // 字标
    ctx.fillStyle = '#F7F2E8'
    ctx.font = '900 46px "PingFang SC","Microsoft YaHei",sans-serif'
    ctx.fillText('校园', 216, 88)
    ctx.fillStyle = '#C8F04A'
    ctx.fillText('墙', 312, 88)
    ctx.fillStyle = 'rgba(247,242,232,0.55)'
    ctx.font = '600 20px "PingFang SC","Microsoft YaHei",sans-serif'
    ctx.fillText('本校学生的信息聚合社区', 216, 118)

    // ── 板块胶囊 ──
    const sectionName = p.section?.name || '校园墙'
    ctx.font = '800 24px "PingFang SC","Microsoft YaHei",sans-serif'
    const sw = ctx.measureText(sectionName).width + 64
    ctx.fillStyle = accent
    roundRect(ctx, 48, 190, sw, 56, 28)
    ctx.fill()
    ctx.strokeStyle = '#14110F'
    ctx.lineWidth = 3
    roundRect(ctx, 48, 190, sw, 56, 28)
    ctx.stroke()
    // 色点 + 文字（白/黑随板块色亮度自动取反保证可读）
    ctx.fillStyle = '#14110F'
    ctx.beginPath()
    ctx.arc(76, 218, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#14110F'
    ctx.fillText(sectionName, 96, 227)

    // ── 标题 ──
    ctx.fillStyle = '#14110F'
    ctx.font = '900 44px "PingFang SC","Microsoft YaHei",sans-serif'
    const titleLines = wrapText(ctx, p.title || '（无标题）', 48, 312, W - 96, 58, 3)

    // ── 自适应内容区：统计带固定在 STATS_Y 之上，空间不足先舍图、再舍摘要行数 ──
    const STATS_Y = 690
    const bodyTop = 312 + titleLines * 58 + 24
    const zone = STATS_Y - bodyTop - 56
    const cover = p.images?.[0]
    const IMG_H = 280
    ctx.fillStyle = '#4A443C'
    ctx.font = '500 26px "PingFang SC","Microsoft YaHei",sans-serif'
    if (cover && zone >= IMG_H + 130) {
      // 图 + 最多 2 行摘要
      const used = wrapText(ctx, p.content || '', 48, bodyTop, W - 96, 40, 2)
      const iy = bodyTop + used * 40 + 20
      const img = await loadImage(cover)
      if (img && iy + IMG_H <= STATS_Y - 24) {
        const boxW = W - 96
        const ratio = Math.max(boxW / img.width, IMG_H / img.height)
        const dw = img.width * ratio
        const dh = img.height * ratio
        ctx.save()
        roundRect(ctx, 48, iy, boxW, IMG_H, 20)
        ctx.clip()
        ctx.drawImage(img, 48 + (boxW - dw) / 2, iy + (IMG_H - dh) / 2, dw, dh)
        ctx.restore()
        ctx.strokeStyle = '#14110F'
        ctx.lineWidth = 3
        roundRect(ctx, 48, iy, boxW, IMG_H, 20)
        ctx.stroke()
      }
    } else {
      const maxLines = Math.max(2, Math.min(6, Math.floor(zone / 40)))
      wrapText(ctx, p.content || '', 48, bodyTop, W - 96, 40, maxLines)
    }

    // ── 统计条（虚线分隔 + 三组数字，固定带）──
    ctx.strokeStyle = 'rgba(20,17,15,0.25)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 8])
    ctx.beginPath()
    ctx.moveTo(48, STATS_Y)
    ctx.lineTo(W - 48, STATS_Y)
    ctx.stroke()
    ctx.setLineDash([])
    const stats = [
      ['点赞', p.likeCount ?? 0],
      ['评论', p.commentCount ?? 0],
      ['浏览', p.viewCount ?? 0],
    ] as const
    ctx.textAlign = 'center'
    stats.forEach(([label, val], i) => {
      const cx = 48 + ((W - 96) / 6) * (1 + i * 2)
      ctx.fillStyle = '#14110F'
      ctx.font = '900 40px "PingFang SC","Microsoft YaHei",sans-serif'
      ctx.fillText(String(val), cx, STATS_Y + 64)
      ctx.fillStyle = '#6E6659'
      ctx.font = '600 22px "PingFang SC","Microsoft YaHei",sans-serif'
      ctx.fillText(label, cx, STATS_Y + 96)
    })
    ctx.textAlign = 'left'

    // ── 底部：作者 + 短说明 ──
    const who = p.isAnonymous ? '匿名同学' : p.author?.nickname || '同学'
    ctx.fillStyle = '#6E6659'
    ctx.font = '500 22px "PingFang SC","Microsoft YaHei",sans-serif'
    ctx.fillText(`来自 @${who} 的分享`, 48, STATS_Y + 140)

    ctx.fillStyle = '#14110F'
    roundRect(ctx, 48, H - 100, W - 96, 60, 14)
    ctx.fill()
    ctx.fillStyle = '#C8F04A'
    ctx.font = '900 26px "PingFang SC","Microsoft YaHei",sans-serif'
    ctx.fillText('校园墙', 72, H - 60)
    ctx.fillStyle = 'rgba(247,242,232,0.72)'
    ctx.font = '500 20px "PingFang SC","Microsoft YaHei",sans-serif'
    const link = location.host
    ctx.fillText(`${link}/post/${p.id ?? ''} · 微信搜「校园墙」看全校新鲜事`, 176, H - 60)

    dataUrl.value = canvas.toDataURL('image/png')
  } catch {
    toast.error('海报生成失败，请重试')
  } finally {
    busy.value = false
  }
}

async function download() {
  if (!dataUrl.value) return
  const a = document.createElement('a')
  a.href = dataUrl.value
  a.download = `campus-wall-post-${props.post?.id ?? 'x'}.png`
  a.click()
  toast.success('海报已保存')
}

async function copyImage() {
  if (!dataUrl.value) return
  try {
    const blob = await (await fetch(dataUrl.value)).blob()
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    toast.success('已复制图片，去粘贴吧')
  } catch {
    toast.error('当前浏览器不支持复制图片，请下载')
  }
}

async function systemShare() {
  if (!dataUrl.value) return
  try {
    const blob = await (await fetch(dataUrl.value)).blob()
    const file = new File([blob], 'campus-wall.png', { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: props.post?.title || '校园墙' })
    } else {
      toast.info('当前设备不支持系统分享，请下载后发送')
    }
  } catch { /* 用户取消分享不算错误 */ }
}

const visibleRef = computed(() => props.visible)
trapWithInert(visibleRef)

watch(() => props.visible, async (v) => {
  if (v) {
    await nextTick()
    render()
  }
})
</script>

<template>
  <Teleport to="body">
    <transition name="sp-fade">
      <div v-if="visible" class="fixed inset-0 z-[78] flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="分享海报">
        <div class="absolute inset-0 ds-scrim" @click="emit('close')"></div>
        <div class="relative w-full max-w-[380px] flex flex-col gap-2" style="max-height: 92vh">
          <div class="flex items-center gap-2 px-1">
            <span class="ds-sticker ds-sticker--sky">POSTER</span>
            <span class="ds-label" style="color: rgb(247 242 232 / 0.72)">生成海报 · 发群发圈更好看</span>
            <button type="button" class="ds-icon-btn !w-8 !h-8 ml-auto" style="background: rgb(255 255 255 / 0.12); border-color: rgb(255 255 255 / 0.34); color: #fff; box-shadow: none" aria-label="关闭海报" @click="emit('close')">
              <X class="w-4 h-4" />
            </button>
          </div>
          <div class="overflow-y-auto rounded-[18px]" style="border: 1.5px solid rgb(247 242 232 / 0.3)">
            <canvas ref="canvasRef"></canvas>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="ds-btn flex-1 !py-2.5 justify-center" style="background: #FFF; color: #14110F" :disabled="busy || !dataUrl" @click="download">
              <Download class="w-4 h-4" /> 下载
            </button>
            <button type="button" class="ds-btn flex-1 !py-2.5 justify-center" style="background: #FFF; color: #14110F" :disabled="busy || !dataUrl" @click="copyImage">
              <ClipboardCopy class="w-4 h-4" /> 复制
            </button>
            <button type="button" class="ds-btn flex-1 !py-2.5 justify-center" style="background: var(--lime); color: #14110F; border-color: #14110F" :disabled="busy || !dataUrl" @click="systemShare">
              <Share2 v-if="!busy" class="w-4 h-4" />
              <Loader2 v-else class="w-4 h-4 animate-spin" />
              分享
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.sp-fade-enter-active, .sp-fade-leave-active { transition: opacity 0.18s ease; }
.sp-fade-enter-from, .sp-fade-leave-to { opacity: 0; }
</style>
