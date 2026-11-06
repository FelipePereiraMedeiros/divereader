/**
 * Leitura em Voz Alta (Text-to-Speech) com a Web Speech API do navegador.
 *
 * Pontos-chave para uma leitura fluida:
 *  - O texto da página é reconstruído a partir da camada de texto do PDF.js, juntando linhas
 *    em frases, desfazendo hifenização de fim de linha e descartando cabeçalhos/rodapés.
 *  - A leitura é feita frase a frase (pausas naturais, destaque sincronizado e imunidade ao
 *    corte de ~15s que alguns navegadores Chromium aplicam a falas longas).
 *  - A melhor voz disponível é escolhida automaticamente (vozes "Natural"/neurais/online primeiro).
 *  - Pausar = cancelar e lembrar a frase atual; retomar = repetir a frase. É o único jeito
 *    confiável entre Chrome, Edge, Opera e Safari (pause/resume nativos são instáveis).
 */

const MIN_SENTENCE_CHARS = 25;
const MAX_SENTENCE_CHARS = 220;
const HEADER_FOOTER_BAND = 0.06;
const STORAGE_KEYS = { voice: 'dr2_tts_voice', rate: 'dr2_tts_rate' };

/* ------------------------------------------------------------------ */
/* Funções puras (testáveis)                                           */
/* ------------------------------------------------------------------ */

const fontHeightOf = (item) =>
  Math.hypot(item.transform[2], item.transform[3]) || Math.abs(item.height) || 10;

/**
 * Reconstrói o texto corrido de uma página a partir dos itens do PDF.js, registrando o
 * intervalo de caracteres de cada item para permitir o destaque da frase lida.
 * @param {Array} items textContent.items
 * @param {{ pageHeight?: number, skipHeaderFooter?: boolean }} [opts]
 * @returns {{ text: string, spans: Array<{ item: any, start: number, end: number }> }}
 */
export function buildPageText(items, opts = {}) {
  const pageHeight = opts.pageHeight || 0;
  const valid = (items || []).filter((it) => it && typeof it.str === 'string' && Array.isArray(it.transform));

  // 1. Agrupa itens em linhas pela baseline
  const lines = [];
  let current = null;
  valid.forEach((item) => {
    const y = item.transform[5];
    const fh = fontHeightOf(item);
    if (!current || Math.abs(y - current.y) > fh * 0.5) {
      current = { y, fh, items: [] };
      lines.push(current);
    }
    current.items.push(item);
  });

  // 2. Remove cabeçalhos, rodapés e números de página (linhas curtas nas faixas extremas)
  const keptLines = lines.filter((line) => {
    if (!opts.skipHeaderFooter || !pageHeight) return true;
    const lineText = line.items.map((i) => i.str).join('').trim();
    if (!lineText) return false;
    const yNorm = line.y / pageHeight;
    const inBand = yNorm < HEADER_FOOTER_BAND || yNorm > 1 - HEADER_FOOTER_BAND;
    const isPageNumber = /^[\divxlcIVXLC\s.\-–—|/]+$/.test(lineText) && lineText.length <= 12;
    if (isPageNumber && (inBand || lineText.length <= 4)) return false;
    return !(inBand && lineText.length <= 70);
  });

  // 3. Concatena com regras de espaçamento e hifenização
  let text = '';
  const spans = [];
  let prevItem = null;
  let prevSpan = null;

  keptLines.forEach((line, lineIdx) => {
    line.items.forEach((item, idx) => {
      let str = item.str.replace(/\s+/g, ' ');
      if (!str) return;

      if (text.length > 0) {
        const isNewLine = idx === 0 && lineIdx > 0;
        if (isNewLine) {
          const endsWithHyphen = /[\p{L}]-$/u.test(text);
          if (endsWithHyphen && /^\p{Ll}/u.test(str.trimStart())) {
            // "desenvolvi-" + "mento" → "desenvolvimento"
            text = text.slice(0, -1);
            if (prevSpan) prevSpan.end = Math.min(prevSpan.end, text.length);
            str = str.trimStart();
          } else if (endsWithHyphen) {
            // Palavra composta quebrada na linha: "Rio-" + "Grande" → "Rio-Grande"
            str = str.trimStart();
          } else if (!/\s$/.test(text)) {
            text += ' ';
          }
        } else if (!/\s$/.test(text) && !/^\s/.test(str) && prevItem) {
          const gap = item.transform[4] - (prevItem.transform[4] + (prevItem.width || 0));
          if (gap > fontHeightOf(item) * 0.15) text += ' ';
        }
      }

      if (/\s$/.test(text)) str = str.trimStart();
      if (!str) return;

      const start = text.length;
      text += str;
      prevSpan = { item, start, end: text.length };
      spans.push(prevSpan);
      prevItem = item;
    });
  });

  return { text, spans };
}

/**
 * Divide o texto em frases com tamanho adequado para fala fluida.
 * @param {string} text
 * @param {string} [locale='pt-BR']
 * @returns {Array<{ text: string, start: number, end: number }>}
 */
export function splitSentences(text, locale = 'pt-BR') {
  if (!text || !text.trim()) return [];

  // 1. Segmentação base
  let raw = [];
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
    for (const seg of segmenter.segment(text)) {
      raw.push({ start: seg.index, end: seg.index + seg.segment.length });
    }
  } else {
    const re = /[^.!?…]+(?:[.!?…]+["'”»)]*\s*|$)/g;
    let m;
    while ((m = re.exec(text)) && m[0].length > 0) {
      raw.push({ start: m.index, end: m.index + m[0].length });
    }
  }

  // 2. Junta fragmentos curtos (ex.: "Art.", "p. 12", títulos) à frase seguinte
  const merged = [];
  raw.forEach((seg) => {
    const last = merged[merged.length - 1];
    if (last && text.slice(last.start, last.end).trim().length < MIN_SENTENCE_CHARS) {
      last.end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  });

  // 3. Quebra frases longas em pontuações internas (vírgula, ponto e vírgula, dois-pontos)
  const result = [];
  merged.forEach(({ start, end }) => {
    let s = start;
    while (end - s > MAX_SENTENCE_CHARS) {
      const window = text.slice(s, s + MAX_SENTENCE_CHARS);
      let cut = Math.max(window.lastIndexOf('; '), window.lastIndexOf(': '), window.lastIndexOf(', '));
      if (cut < MAX_SENTENCE_CHARS * 0.4) cut = window.lastIndexOf(' ');
      if (cut <= 0) cut = MAX_SENTENCE_CHARS - 1;
      result.push({ start: s, end: s + cut + 1 });
      s = s + cut + 1;
    }
    result.push({ start: s, end });
  });

  return result
    .map(({ start, end }) => {
      // Ajusta os limites para não incluir espaços nas pontas
      while (start < end && /\s/.test(text[start])) start++;
      while (end > start && /\s/.test(text[end - 1])) end--;
      return { text: text.slice(start, end), start, end };
    })
    .filter((s) => /[\p{L}\p{N}]/u.test(s.text));
}

/**
 * Pontua uma voz: quanto maior, mais natural/adequada ao idioma.
 * @param {SpeechSynthesisVoice} voice
 * @param {string} [lang='pt-BR']
 */
export function scoreVoice(voice, lang = 'pt-BR') {
  if (!voice) return -Infinity;
  const vLang = (voice.lang || '').replace('_', '-').toLowerCase();
  const target = lang.toLowerCase();
  const base = target.split('-')[0];
  let score = 0;
  if (vLang === target) score += 100;
  else if (vLang.startsWith(base)) score += 60;
  else return -1000;

  const name = voice.name || '';
  if (/natural/i.test(name)) score += 80;
  if (/neural|premium|enhanced|aprimorad/i.test(name)) score += 60;
  if (/online/i.test(name)) score += 30;
  if (/google/i.test(name)) score += 40;
  if (voice.localService === false) score += 5;
  if (/espeak|compact/i.test(name)) score -= 50;
  return score;
}

/**
 * Converte o trecho [start, end) de um item de texto em um retângulo normalizado (0..1) da página.
 */
function rectForSpanPart(span, start, end, viewport) {
  const { item } = span;
  const len = Math.max(1, span.end - span.start);
  const fh = fontHeightOf(item);
  const x = item.transform[4];
  const y = item.transform[5];
  const w = item.width || 0;
  const a = (Math.max(start, span.start) - span.start) / len;
  const b = (Math.min(end, span.end) - span.start) / len;

  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
    x + w * a,
    y - fh * 0.22,
    x + w * b,
    y + fh * 0.88,
  ]);
  return {
    x: Math.min(x1, x2) / viewport.width,
    y: Math.min(y1, y2) / viewport.height,
    width: Math.abs(x2 - x1) / viewport.width,
    height: Math.abs(y2 - y1) / viewport.height,
  };
}

/**
 * Retângulos normalizados que cobrem a frase, mesclados por linha.
 */
export function sentenceRects(pageData, sentence) {
  if (!pageData || !sentence) return [];
  const rects = [];
  pageData.spans.forEach((span) => {
    if (span.end <= sentence.start || span.start >= sentence.end) return;
    const r = rectForSpanPart(span, sentence.start, sentence.end, pageData.viewport);
    if (r.width > 0.001 && r.height > 0.001) rects.push(r);
  });

  // Mescla pedaços da mesma linha em uma faixa contínua
  const lines = [];
  rects
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((r) => {
      const line = lines.find((l) => Math.abs(l.y + l.height / 2 - (r.y + r.height / 2)) < Math.min(l.height, r.height) * 0.5);
      if (line) {
        const right = Math.max(line.x + line.width, r.x + r.width);
        line.x = Math.min(line.x, r.x);
        line.width = right - line.x;
        const bottom = Math.max(line.y + line.height, r.y + r.height);
        line.y = Math.min(line.y, r.y);
        line.height = bottom - line.y;
      } else {
        lines.push({ ...r });
      }
    });
  return lines;
}

/* ------------------------------------------------------------------ */
/* Serviço de reprodução                                               */
/* ------------------------------------------------------------------ */

export const TtsService = {
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  state: 'idle', // 'idle' | 'playing' | 'paused'
  pageNum: 1,
  sentenceIdx: 0,
  rate: 1,
  voice: null,
  voices: [],
  pageCache: new Map(),
  token: 0,
  currentUtterance: null,
  emptyPagesInRow: 0,
  selfNavigating: false,
  callbacks: {},

  /**
   * @param {{ getPdfDoc: Function, getTotalPages: Function, isPageRendered: Function,
   *   navigateToPage: Function, getScrollContainer: Function, onStateChange: Function, notify: Function }} callbacks
   */
  init(callbacks = {}) {
    this.callbacks = callbacks;
    if (!this.supported) return;

    try {
      const savedRate = parseFloat(localStorage.getItem(STORAGE_KEYS.rate));
      if (savedRate >= 0.5 && savedRate <= 2.5) this.rate = savedRate;
    } catch (e) {}

    const loadVoices = () => {
      this.voices = window.speechSynthesis.getVoices() || [];
      if (!this.voices.length) return;
      let savedName = null;
      try {
        savedName = localStorage.getItem(STORAGE_KEYS.voice);
      } catch (e) {}
      this.voice = this.voices.find((v) => v.name === savedName) || this.pickBestVoice();
      this.emitState();
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);

    // Alguns navegadores continuam falando após recarregar a página
    window.addEventListener('beforeunload', () => window.speechSynthesis.cancel());
  },

  pickBestVoice(lang = 'pt-BR') {
    const ranked = [...this.voices].sort((a, b) => scoreVoice(b, lang) - scoreVoice(a, lang));
    return ranked[0] && scoreVoice(ranked[0], lang) > 0 ? ranked[0] : ranked[0] || null;
  },

  /** Vozes ordenadas: português primeiro (melhores no topo), depois as demais */
  getVoiceOptions() {
    return [...this.voices].sort((a, b) => {
      const diff = scoreVoice(b) - scoreVoice(a);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
  },

  hasPortugueseVoice() {
    return this.voices.some((v) => scoreVoice(v) > 0);
  },

  setVoice(name) {
    const v = this.voices.find((voice) => voice.name === name);
    if (!v) return;
    this.voice = v;
    try {
      localStorage.setItem(STORAGE_KEYS.voice, v.name);
    } catch (e) {}
    if (this.state === 'playing') this.speakCurrent();
    this.emitState();
  },

  setRate(rate) {
    const r = Math.max(0.5, Math.min(2.5, Number(rate) || 1));
    this.rate = r;
    try {
      localStorage.setItem(STORAGE_KEYS.rate, String(r));
    } catch (e) {}
    if (this.state === 'playing') this.speakCurrent();
    this.emitState();
  },

  isActive() {
    return this.state !== 'idle';
  },

  emitState() {
    this.callbacks.onStateChange?.(this.getState());
  },

  getState() {
    const page = this.pageCache.get(this.pageNum);
    const total = page && !(page instanceof Promise) ? page.sentences.length : 0;
    return {
      state: this.state,
      pageNum: this.pageNum,
      sentenceIdx: this.sentenceIdx,
      sentenceCount: total,
      rate: this.rate,
      voiceName: this.voice?.name || '',
      supported: this.supported,
    };
  },

  /** Limpa o cache ao trocar de documento */
  reset() {
    this.stop();
    this.pageCache = new Map();
  },

  /**
   * Carrega (com cache) o texto, as frases e o viewport de uma página.
   */
  async loadPage(pageNum) {
    const cached = this.pageCache.get(pageNum);
    if (cached) return cached;

    const promise = (async () => {
      const pdfDoc = this.callbacks.getPdfDoc?.();
      if (!pdfDoc) return null;
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const pageHeight = Array.isArray(page.view) ? page.view[3] - page.view[1] : viewport.height;
      const { text, spans } = buildPageText(content.items, {
        pageHeight,
        skipHeaderFooter: !page.rotate,
      });
      const data = { pageNum, text, spans, viewport, sentences: splitSentences(text) };
      this.pageCache.set(pageNum, data);
      return data;
    })();

    this.pageCache.set(pageNum, promise);
    try {
      return await promise;
    } catch (err) {
      this.pageCache.delete(pageNum);
      throw err;
    }
  },

  /**
   * Inicia a leitura.
   * @param {{ pageNum: number, sentenceIdx?: number, point?: { x: number, y: number } }} from
   *   point = posição normalizada (0..1) na página: começa na primeira frase a partir dela
   */
  async start({ pageNum, sentenceIdx = null, point = null }) {
    if (!this.supported) return;
    window.speechSynthesis.cancel();
    this.token++;
    this.state = 'playing';
    this.pageNum = pageNum;
    this.emptyPagesInRow = 0;

    const data = await this.loadPage(pageNum);
    if (!data || this.state !== 'playing') return;

    if (sentenceIdx !== null) {
      this.sentenceIdx = Math.max(0, Math.min(sentenceIdx, data.sentences.length - 1));
    } else if (point) {
      this.sentenceIdx = this.findSentenceAtPoint(data, point);
    } else {
      this.sentenceIdx = 0;
    }

    if (!data.sentences.length) {
      this.advancePage();
      return;
    }
    this.speakCurrent();
  },

  findSentenceAtPoint(data, point) {
    for (let i = 0; i < data.sentences.length; i++) {
      const rects = sentenceRects(data, data.sentences[i]);
      // Primeira frase que está no ponto ou depois dele, na ordem de leitura
      const hit = rects.some(
        (r) => r.y + r.height > point.y && (r.y > point.y || r.x + r.width >= point.x),
      );
      if (hit) return i;
    }
    return 0;
  },

  speakCurrent() {
    const data = this.pageCache.get(this.pageNum);
    if (!data || data instanceof Promise) return;
    const sentence = data.sentences[this.sentenceIdx];
    if (!sentence) {
      this.advancePage();
      return;
    }

    const myToken = ++this.token;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(sentence.text);
    if (this.voice) {
      utterance.voice = this.voice;
      utterance.lang = this.voice.lang;
    } else {
      utterance.lang = 'pt-BR';
    }
    utterance.rate = this.rate;

    utterance.onend = () => {
      if (myToken !== this.token || this.state !== 'playing') return;
      this.next();
    };
    utterance.onerror = (e) => {
      if (myToken !== this.token) return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.warn('Erro na síntese de voz:', e.error);
      if (this.state === 'playing') this.next();
    };

    // Mantém referência (Chromium descarta utterances sem referência e o onend nunca dispara)
    this.currentUtterance = utterance;
    this.ensurePageVisible(this.pageNum);
    this.highlightCurrent(true);
    this.emitState();

    // Pequeno atraso após cancel(): alguns navegadores ignoram speak() imediato
    setTimeout(() => {
      if (myToken !== this.token || this.state !== 'playing') return;
      window.speechSynthesis.speak(utterance);
    }, 60);

    // Pré-carrega a próxima página perto do fim desta
    if (this.sentenceIdx >= data.sentences.length - 3) {
      const total = this.callbacks.getTotalPages?.() || 0;
      if (this.pageNum < total) this.loadPage(this.pageNum + 1).catch(() => {});
    }
  },

  next() {
    const data = this.pageCache.get(this.pageNum);
    if (data && !(data instanceof Promise) && this.sentenceIdx < data.sentences.length - 1) {
      this.sentenceIdx++;
      this.speakCurrent();
    } else {
      this.advancePage();
    }
  },

  async advancePage() {
    const total = this.callbacks.getTotalPages?.() || 0;
    if (this.pageNum >= total) {
      this.stop();
      this.callbacks.notify?.('Leitura concluída: fim do documento.', 'check-circle-2');
      return;
    }
    const myToken = ++this.token;
    this.pageNum++;
    this.sentenceIdx = 0;
    const data = await this.loadPage(this.pageNum);
    if (myToken !== this.token || this.state !== 'playing' || !data) return;

    if (!data.sentences.length) {
      this.emptyPagesInRow++;
      if (this.emptyPagesInRow >= 3) {
        this.stop();
        this.callbacks.notify?.(
          'Estas páginas não têm texto selecionável (PDF digitalizado). A leitura foi interrompida.',
          'alert-circle',
        );
        return;
      }
      this.advancePage();
      return;
    }
    this.emptyPagesInRow = 0;
    this.speakCurrent();
  },

  /** Volta/avança frases manualmente (atravessando páginas) */
  async skip(delta) {
    if (this.state === 'idle') return;
    const data = this.pageCache.get(this.pageNum);
    if (!data || data instanceof Promise) return;
    let idx = this.sentenceIdx + delta;

    if (idx < 0 && this.pageNum > 1) {
      const prev = await this.loadPage(this.pageNum - 1);
      if (prev && prev.sentences.length) {
        this.pageNum -= 1;
        this.sentenceIdx = prev.sentences.length - 1;
      } else {
        this.sentenceIdx = 0;
      }
    } else if (idx >= data.sentences.length) {
      if (this.state === 'playing') {
        this.advancePage();
        return;
      }
      idx = data.sentences.length - 1;
      this.sentenceIdx = idx;
    } else {
      this.sentenceIdx = Math.max(0, idx);
    }

    if (this.state === 'playing') this.speakCurrent();
    else {
      this.ensurePageVisible(this.pageNum);
      this.highlightCurrent(true);
      this.emitState();
    }
  },

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.token++;
    window.speechSynthesis.cancel();
    this.emitState();
  },

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.speakCurrent();
  },

  toggle() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  },

  stop() {
    if (this.supported) window.speechSynthesis.cancel();
    this.token++;
    this.state = 'idle';
    this.currentUtterance = null;
    this.clearHighlight();
    this.emitState();
  },

  /**
   * Chamado quando o usuário navega manualmente: a leitura acompanha a nova página.
   * @param {number[]} visiblePages
   */
  handleUserNavigation(visiblePages) {
    if (this.selfNavigating) {
      this.selfNavigating = false;
      return;
    }
    if (this.state === 'idle' || !visiblePages.length) return;
    if (visiblePages.includes(this.pageNum)) return;
    const wasPlaying = this.state === 'playing';
    this.pageNum = visiblePages[0];
    this.sentenceIdx = 0;
    if (wasPlaying) {
      this.start({ pageNum: this.pageNum });
    } else {
      this.loadPage(this.pageNum).then(() => {
        this.highlightCurrent(false);
        this.emitState();
      });
    }
  },

  ensurePageVisible(pageNum) {
    if (this.callbacks.isPageRendered?.(pageNum)) return;
    this.selfNavigating = true;
    this.callbacks.navigateToPage?.(pageNum);
  },

  /* ---------------- Destaque visual ---------------- */

  clearHighlight() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.tts-layer').forEach((el) => el.remove());
  },

  /** Redesenha o destaque (após re-renderizações de zoom/página) */
  refreshHighlight() {
    if (this.state !== 'idle') this.highlightCurrent(false);
  },

  highlightCurrent(scroll = false) {
    this.clearHighlight();
    const data = this.pageCache.get(this.pageNum);
    if (!data || data instanceof Promise) return;
    const sentence = data.sentences[this.sentenceIdx];
    const wrapper = document.querySelector(`.page-wrapper[data-page="${this.pageNum}"]`);
    if (!sentence || !wrapper) return;

    const layer = document.createElement('div');
    layer.className = 'tts-layer';
    layer.setAttribute('aria-hidden', 'true');
    sentenceRects(data, sentence).forEach((r) => {
      const mark = document.createElement('div');
      mark.className = 'tts-rect';
      mark.style.left = `${r.x * 100}%`;
      mark.style.top = `${r.y * 100}%`;
      mark.style.width = `${r.width * 100}%`;
      mark.style.height = `${r.height * 100}%`;
      layer.appendChild(mark);
    });
    wrapper.appendChild(layer);

    if (scroll) this.scrollIntoViewIfNeeded(layer.firstElementChild);
  },

  scrollIntoViewIfNeeded(el) {
    const container = this.callbacks.getScrollContainer?.();
    if (!el || !container || typeof el.getBoundingClientRect !== 'function') return;
    const r = el.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    const margin = Math.min(120, c.height * 0.2);
    if (r.top < c.top + margin || r.bottom > c.bottom - margin) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  },
};
