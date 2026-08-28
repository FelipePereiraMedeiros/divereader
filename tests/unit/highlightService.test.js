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
});
