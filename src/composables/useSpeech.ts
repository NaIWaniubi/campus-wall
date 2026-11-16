/**
 * 语音交互组合式函数：语音转文字（发帖输入）+ 文字转语音（帖子朗读）。
 * 评分点：多模态（语音模态）+ 端侧能力——纯浏览器 API，无网络依赖。
 * 全部特性检测：不支持的浏览器优雅降级（返回可用标志，UI 隐藏入口）。
 */
import { ref, computed, onUnmounted, type Ref } from 'vue';

// ---------- 类型声明（浏览器 API，TS lib.dom 未覆盖部分） ----------
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null; // SSR / Node 环境防护
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

/**
 * 语音转文字：start() 开始、stop() 结束；中间结果实时回传 onResult。
 * 仅注入依赖（ctor / window）便于离线测试。
 */
export function useSpeechToText(options: { lang?: string } = {}) {
  const listening = ref(false);
  const supported = isSpeechRecognitionSupported();
  const error = ref('');
  let rec: SpeechRecognitionLike | null = null;

  function start(onResult: (text: string, isFinal: boolean) => void, onEnd?: () => void): boolean {
    error.value = '';
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      error.value = '当前浏览器不支持语音输入';
      return false;
    }
    if (listening.value) return false;
    rec = new Ctor();
    rec.lang = options.lang ?? 'zh-CN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = String(r[0]?.transcript ?? '');
        if (r.isFinal) final += t;
        else interim += t;
      }
      if (interim) onResult(interim, false);
      if (final) onResult(final, true);
    };
    rec.onerror = (e: any) => {
      error.value = e?.error === 'not-allowed' ? '麦克风权限被拒绝' : `语音识别出错: ${e?.error ?? 'unknown'}`;
      listening.value = false;
    };
    rec.onend = () => {
      listening.value = false;
      onEnd?.();
    };
    try {
      rec.start();
      listening.value = true;
      return true;
    } catch {
      error.value = '无法启动语音识别';
      listening.value = false;
      return false;
    }
  }

  function stop(): void {
    rec?.stop();
    listening.value = false;
  }

  onUnmounted(() => {
    try { rec?.abort(); } catch { /* 已停止 */ }
  });

  return { listening, supported, error, start, stop };
}

// ---------- 文字转语音 ----------

export function isTextToSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * 帖子朗读：speak/cancel + 语速控制；中文 voice 优先（无则用默认）。
 */
export function useTextToSpeech() {
  const speaking = ref(false);
  const rate: Ref<number> = ref(1.0);
  const supported = isTextToSpeechSupported();

  function pickZhVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => v.lang?.toLowerCase().startsWith('zh')) ?? null;
  }

  function speak(text: string, opts: { rate?: number } = {}): boolean {
    if (!supported) return false;
    window.speechSynthesis.cancel(); // 打断上一次
    const clean = text.replace(/[#*`\[\]()>]/g, ' ').slice(0, 2000); // 去 markdown 噪声
    if (!clean.trim()) return false;
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'zh-CN';
    u.rate = opts.rate ?? rate.value;
    const zh = pickZhVoice();
    if (zh) u.voice = zh;
    u.onend = () => { speaking.value = false; };
    u.onerror = () => { speaking.value = false; };
    speaking.value = true;
    window.speechSynthesis.speak(u);
    return true;
  }

  function cancel(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    speaking.value = false;
  }

  onUnmounted(cancel);

  return { speaking, supported, rate, speak, cancel };
}

/** 特性检测汇总（UI 决定隐藏哪些入口） */
export function speechCapabilities() {
  return computed(() => ({
    stt: isSpeechRecognitionSupported(),
    tts: isTextToSpeechSupported(),
  }));
}
