import { describe, it, expect, beforeEach } from 'vitest';
import { HighlightService } from '../../src/js/services/highlightService.js';
import { Highlight } from '../../src/js/models/Highlight.js';
import { appState } from '../../src/js/state.js';

describe('Multi-Color Highlights', () => {
  beforeEach(() => {
    appState.set({
      fileKey: 'test_key',
      pageNum: 1,
      highlights: {
        1: [
          new Highlight({
            id: 'hl_1',
            pageNum: 1,
            text: 'Texto de conceito',
            color: 'yellow',
            rects: [{ x: 0.1, y: 0.1, width: 0.5, height: 0.05 }],
          }),
          new Highlight({
            id: 'hl_2',
            pageNum: 1,
            text: 'Texto de citação',
            color: 'blue',
            rects: [{ x: 0.1, y: 0.3, width: 0.5, height: 0.05 }],
          }),
        ],
      },
    });
  });

  it('deve permitir atualizar a cor de um grifo existente', () => {
    HighlightService.updateHighlightColor(1, 'hl_1', 'purple');

    const updated = HighlightService.getHighlight(1, 'hl_1');
    expect(updated).not.toBeNull();
    expect(updated.color).toBe('purple');
  });

  it('deve renderizar a classe de cor correspondente nos retângulos do PDF', () => {
    const layer = document.createElement('div');
    HighlightService.drawPageHighlights(1, layer);

    const marks = layer.querySelectorAll('.highlight-rect');
    expect(marks).toHaveLength(2);
    expect(marks[0].classList.contains('highlight-yellow')).toBe(true);
    expect(marks[1].classList.contains('highlight-blue')).toBe(true);
  });
});
