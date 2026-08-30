import { describe, it, expect, beforeEach } from 'vitest';
import { Highlight } from '../../src/js/models/Highlight.js';
import { HighlightService } from '../../src/js/services/highlightService.js';
import { appState } from '../../src/js/state.js';

describe('Highlight Service & Model', () => {
  beforeEach(() => {
    localStorage.clear();
    appState.set({
      fileKey: 'dr2_test.pdf_123',
      highlights: {},
      pageNum: 1,
    });
  });

  it('Highlight.containsPoint deve identificar corretamente se um ponto está dentro do retângulo', () => {
    const hl = new Highlight({
      pageNum: 1,
      text: 'Texto de teste',
      rects: [
        { x: 0.1, y: 0.1, width: 0.5, height: 0.1 }, // x: 0.1..0.6, y: 0.1..0.2
      ],
    });

    expect(hl.containsPoint(0.2, 0.15)).toBe(true);
    expect(hl.containsPoint(0.05, 0.15)).toBe(false);
    expect(hl.containsPoint(0.7, 0.15)).toBe(false);
    expect(hl.containsPoint(0.2, 0.3)).toBe(false);
  });

  it('deve atualizar o comentário vinculado a um grifo', () => {
    const hl = new Highlight({
      id: 'hl_123',
      pageNum: 2,
      text: 'Uma tese importante',
      rects: [{ x: 0.2, y: 0.3, width: 0.4, height: 0.05 }],
      note: '',
    });

    appState.set({
      highlights: { 2: [hl] },
    });

    HighlightService.updateHighlightNote(2, 'hl_123', 'Anotação adicionada pelo usuário');

    const updated = HighlightService.getHighlight(2, 'hl_123');
    expect(updated).toBeDefined();
    expect(updated?.note).toBe('Anotação adicionada pelo usuário');
  });

  it('deve excluir um grifo da página correta', () => {
    const hl1 = new Highlight({ id: 'hl_1', pageNum: 1, text: 'Primeiro', rects: [] });
    const hl2 = new Highlight({ id: 'hl_2', pageNum: 1, text: 'Segundo', rects: [] });

    appState.set({
      highlights: { 1: [hl1, hl2] },
    });

    HighlightService.deleteHighlight(1, 'hl_1');

    const remaining = appState.get('highlights')[1];
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe('hl_2');
    expect(HighlightService.getHighlight(1, 'hl_1')).toBeNull();
  });

  it('drawPageHighlights deve gerar elementos DOM com atributos dataset corretos', () => {
    const hl = new Highlight({
      id: 'hl_abc',
      pageNum: 1,
      text: 'Texto grifado',
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    });

    appState.set({
      highlights: { 1: [hl] },
    });

    const layer = document.createElement('div');
    HighlightService.drawPageHighlights(1, layer);

    expect(layer.children.length).toBe(1);
    const rectEl = layer.children[0];
    expect(rectEl.className).toBe('highlight-rect');
    expect(rectEl.dataset.highlightId).toBe('hl_abc');
    expect(rectEl.dataset.pageNum).toBe('1');
    expect(parseFloat(rectEl.style.left)).toBeCloseTo(10, 0);
    expect(parseFloat(rectEl.style.top)).toBeCloseTo(20, 0);
  });

  it('consolidateRectsByLine deve fundir múltiplos retângulos de palavras na mesma linha em um retângulo único contínuo', () => {
    // 3 palavras na mesma linha (y ~ 0.15)
    const wordRects = [
      { x: 0.1, y: 0.15, width: 0.08, height: 0.03 }, // Palavra 1
      { x: 0.19, y: 0.15, width: 0.15, height: 0.03 }, // Palavra 2
      { x: 0.35, y: 0.15, width: 0.1, height: 0.03 }, // Palavra 3
    ];

    const consolidated = HighlightService.consolidateRectsByLine(wordRects);

    expect(consolidated.length).toBe(1);
    expect(consolidated[0].x).toBe(0.1);
    expect(consolidated[0].width).toBeCloseTo(0.35, 2); // de 0.1 até 0.45 = 0.35
    expect(consolidated[0].y).toBeCloseTo(0.15, 2);
    expect(consolidated[0].height).toBeCloseTo(0.03, 2);
  });

  it('findHighlightAtPoint deve identificar grifo diretamente pelo elemento alvo', () => {
    const hl = new Highlight({
      id: 'hl_direct',
      pageNum: 1,
      text: 'Texto direto',
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }],
    });
    appState.set({ highlights: { 1: [hl] } });

    const rectEl = document.createElement('div');
    rectEl.className = 'highlight-rect';
    rectEl.dataset.highlightId = 'hl_direct';
    rectEl.dataset.pageNum = '1';

    const result = HighlightService.findHighlightAtPoint(100, 100, rectEl);
    expect(result).not.toBeNull();
    expect(result?.highlightId).toBe('hl_direct');
    expect(result?.pageNum).toBe(1);
    expect(result?.highlight.text).toBe('Texto direto');
  });

  it('findHighlightAtPoint deve identificar grifo através de document.elementsFromPoint quando textLayer está sobreposta', () => {
    const hl = new Highlight({
      id: 'hl_under_text',
      pageNum: 1,
      text: 'Texto sob a textLayer',
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }],
    });
    appState.set({ highlights: { 1: [hl] } });

    const rectEl = document.createElement('div');
    rectEl.className = 'highlight-rect';
    rectEl.dataset.highlightId = 'hl_under_text';
    rectEl.dataset.pageNum = '1';

    const spanEl = document.createElement('span');
    spanEl.textContent = 'Texto';

    // Mock elementsFromPoint para simular clique através da camada de texto
    const originalElementsFromPoint = document.elementsFromPoint;
    document.elementsFromPoint = (x, y) => [spanEl, rectEl];

    try {
      const result = HighlightService.findHighlightAtPoint(50, 50, spanEl);
      expect(result).not.toBeNull();
      expect(result?.highlightId).toBe('hl_under_text');
      expect(result?.pageNum).toBe(1);
    } finally {
      document.elementsFromPoint = originalElementsFromPoint;
    }
  });

  it('findHighlightAtPoint deve identificar grifo geometricamente nas coordenadas da página', () => {
    const hl = new Highlight({
      id: 'hl_geo',
      pageNum: 1,
      text: 'Texto geométrico',
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }],
    });
    appState.set({ highlights: { 1: [hl] } });

    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'page-wrapper';
    pageWrapper.dataset.page = '1';
    // Mock getBoundingClientRect: x: 0..1000, y: 0..1000
    pageWrapper.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
      right: 1000,
      bottom: 1000,
    });

    const spanEl = document.createElement('span');
    pageWrapper.appendChild(spanEl);

    // Clique em (200, 220) -> x = 0.2, y = 0.22 (dentro de x: 0.1..0.4, y: 0.2..0.25)
    const result = HighlightService.findHighlightAtPoint(200, 220, spanEl);
    expect(result).not.toBeNull();
    expect(result?.highlightId).toBe('hl_geo');
    expect(result?.pageNum).toBe(1);
  });
});
