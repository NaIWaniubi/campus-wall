/**
 * 多模态单元测试：视觉 JSON 严格校验、启发式降级、meta 读写、
 * 语音特性检测纯逻辑、三态组件纯逻辑。
 * 全离线：不触网关（gatewayVision 因未配置直接抛错 → analyzeImage 走 heuristicVision）。
 */
import { describe, it, expect } from 'vitest';
import { validateVisionJson, heuristicVision, analyzeImage } from '../../multimodal/vision.js';
import { saveMeta, getMeta, allLabels, analyzeAndSave } from '../../multimodal/store.js';
import { isSpeechRecognitionSupported, isTextToSpeechSupported } from '../../../src/composables/useSpeech.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('vision validateVisionJson 严格校验', () => {
  it('合法 JSON 通过', () => {
    const meta = validateVisionJson('{"labels":["手机","黑色"],"summary":"一部黑色手机","category_guess":"数码","safe":true}');
    expect(meta).not.toBeNull();
    expect(meta!.labels).toEqual(['手机', '黑色']);
    expect(meta!.model).toBe('vision-gateway');
  });

  it('markdown 围栏包裹的 JSON 也能提取', () => {
    const meta = validateVisionJson('```json\n{"labels":["书"],"summary":"一本书","category_guess":"书籍","safe":true}\n```');
    expect(meta).not.toBeNull();
    expect(meta!.category_guess).toBe('书籍');
  });

  it('缺字段拒绝', () => {
    expect(validateVisionJson('{"labels":["a"],"summary":"x"}')).toBeNull();
    expect(validateVisionJson('{"labels":["a"],"summary":"x","category_guess":"其他"}')).toBeNull();
  });

  it('类型错误拒绝（labels 非字符串数组 / safe 非布尔）', () => {
    expect(validateVisionJson('{"labels":[1,2],"summary":"x","category_guess":"y","safe":true}')).toBeNull();
    expect(validateVisionJson('{"labels":["a"],"summary":"x","category_guess":"y","safe":"yes"}')).toBeNull();
  });

  it('非 JSON / 空串拒绝', () => {
    expect(validateVisionJson('完全不是 JSON')).toBeNull();
    expect(validateVisionJson('')).toBeNull();
    expect(validateVisionJson('{"labels":[]}')).toBeNull(); // 空 labels 拒绝
  });
});

describe('vision heuristicVision 启发式降级', () => {
  it('对真实生成的图片产出带「离线解析」标注的结果', async () => {
    // 生成一张 300x500 的暖色测试图（临时文件，测后清理）
    const tmp = path.join(os.tmpdir(), `cw-vision-test-${Date.now()}.png`);
    await sharp({
      create: { width: 300, height: 500, channels: 3, background: { r: 200, g: 120, b: 60 } },
    })
      .png()
      .toFile(tmp);
    try {
      const meta = await heuristicVision(tmp);
      expect(meta.labels).toContain('离线解析');
      expect(meta.labels).toContain('竖构图');
      expect(meta.model).toBe('heuristic');
      // 启发式只做视觉描述、无能力判定内容安全 → parsed=true 但 safe 未知(null)
      expect(meta.parsed).toBe(true);
      expect(meta.safe).toBeNull();
      expect(meta.summary.length).toBeGreaterThan(0);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  // sharp 冷启动编译在整库并发跑时可超默认 5s（与 multimodal-wiring 同款抖动）→ 提余量
  it('analyzeImage 未配置网关时自动走启发式', { timeout: 30_000 }, async () => {
    const tmp = path.join(os.tmpdir(), `cw-vision-test2-${Date.now()}.png`);
    await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 60, g: 100, b: 200 } },
    })
      .png()
      .toFile(tmp);
    try {
      const meta = await analyzeImage(tmp);
      expect(meta.model).toBe('heuristic');
      expect(meta.labels).toContain('横构图');
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('analyzeImage 对不存在的文件也不 reject（安全兜底）', async () => {
    const meta = await analyzeImage('/nonexistent/path/ghost.png');
    // 解析失败 ≠ 判定不安全：parsed=false，safe 未知(null)
    expect(meta.parsed).toBe(false);
    expect(meta.safe).toBeNull();
    expect(meta.model).toBe('fallback');
  });
});

describe('multimodal store 读写', () => {
  it('saveMeta / getMeta 往返', () => {
    saveMeta({
      postId: 999901,
      labels: ['自行车', '蓝色', '离线解析'],
      summary: '一辆蓝色自行车',
      categoryGuess: '运动',
      parsed: true,
      safe: true,
      model: 'heuristic',
    });
    const m = getMeta(999901);
    expect(m).not.toBeNull();
    expect(m!.labels).toEqual(['自行车', '蓝色', '离线解析']);
    expect(m!.categoryGuess).toBe('运动');
    expect(m!.parsed).toBe(true);
    expect(m!.safe).toBe(true);
    // upsert 覆盖
    saveMeta({
      postId: 999901,
      labels: ['更新'],
      summary: '更新后',
      categoryGuess: '其他',
      parsed: false,
      safe: null,
      model: 'fallback',
    });
    const m2 = getMeta(999901);
    expect(m2!.labels).toEqual(['更新']);
    // safe=null（未知）必须原样读回，不能被压成 false
    expect(m2!.parsed).toBe(false);
    expect(m2!.safe).toBeNull();
  });

  it('getMeta 不存在的 post 返回 null', () => {
    expect(getMeta(-1)).toBeNull();
  });

  it('allLabels 聚合并排除通用标签', () => {
    saveMeta({ postId: 999902, labels: ['手机', '离线解析', '图片'], summary: '', categoryGuess: '数码', parsed: true, safe: null, model: 'heuristic' });
    saveMeta({ postId: 999903, labels: ['手机', '耳机'], summary: '', categoryGuess: '数码', safe: true, parsed: true, model: 'heuristic' });
    const labels = allLabels(20);
    const phone = labels.find((l) => l.label === '手机');
    expect(phone).toBeDefined();
    expect(phone!.count).toBeGreaterThanOrEqual(2);
    expect(labels.find((l) => l.label === '离线解析')).toBeUndefined();
  });

  it('analyzeAndSave 端到端（启发式路径）写入 meta', async () => {
    const tmp = path.join(os.tmpdir(), `cw-vision-test3-${Date.now()}.png`);
    await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 30, g: 30, b: 30 } },
    })
      .png()
      .toFile(tmp);
    try {
      await analyzeAndSave(999904, tmp);
      const m = getMeta(999904);
      expect(m).not.toBeNull();
      expect(m!.model).toBe('heuristic');
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});

describe('useSpeech 特性检测', () => {
  it('Node/测试环境无浏览器 API 时优雅返回 false', () => {
    // vitest node 环境无 window；函数不抛错且返回 false（防护分支生效）
    expect(isSpeechRecognitionSupported()).toBe(false);
    expect(isTextToSpeechSupported()).toBe(false);
  });

  it('注入 stub 全局后特性检测为 true（逻辑分支验证）', async () => {
    const g: any = globalThis;
    const savedSpeech = g.speechSynthesis;
    const savedWindow = g.window;
    const savedSR = g.SpeechRecognition;
    try {
      g.window = {
        SpeechRecognition: class {
          lang = '';
          interimResults = false;
          continuous = false;
          start() {}
          stop() {}
          abort() {}
          onresult = null;
          onerror = null;
          onend = null;
        },
        speechSynthesis: { getVoices: () => [], cancel: () => {}, speak: () => {} },
      };
      expect(isSpeechRecognitionSupported()).toBe(true);
      expect(isTextToSpeechSupported()).toBe(true);
    } finally {
      if (savedSR === undefined) delete g.SpeechRecognition;
      else g.SpeechRecognition = savedSR;
      if (savedSpeech === undefined) delete g.speechSynthesis;
      else g.speechSynthesis = savedSpeech;
      if (savedWindow === undefined) delete g.window;
      else g.window = savedWindow;
    }
  });
});

describe('AiThinkingState 组件文件存在性与四态 props 契约', () => {
  it('SFC 源码包含四个 phase 分支（api 测试工程不编译 .vue，做源级断言）', () => {
    const src = fs.readFileSync(
      new URL('../../../src/components/AiThinkingState.vue', import.meta.url),
      'utf-8',
    );
    for (const p of ['thinking', 'streaming', 'done', 'fallback']) {
      expect(src).toContain(`'${p}'`);
    }
  });
});
