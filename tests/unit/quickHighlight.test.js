import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuickHighlightTooltip } from '../../src/js/ui/quickHighlight.js';
import { DOM } from '../../src/js/ui/dom.js';

describe('QuickHighlightTooltip Adaptive Positioning & Conflict Avoidance', () => {
  let tooltipEl;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="quick-highlight-tooltip" style="display: none">
        <div class="color-swatches">
          <button class="color-swatch-btn color-yellow" data-color="yellow"></button>
          <button class="color-swatch-btn color-blue" data-color="blue"></button>
        </div>
      </div>
      <div id="book-container">
        <div class="page-wrapper"></div>
      </div>
    `;

    tooltipEl = document.getElementById('quick-highlight-tooltip');
    DOM.quickHighlightTooltip = tooltipEl;

    QuickHighlightTooltip.init();
  });

  it('deve posicionar abaixo (placement-bottom) por padrão para evitar conflito com menus nativos de navegadores', () => {
    QuickHighlightTooltip.show(200, 300, 'bottom');

    expect(tooltipEl.style.display).toBe('flex');
    expect(tooltipEl.classList.contains('placement-bottom')).toBe(true);
    expect(tooltipEl.classList.contains('placement-top')).toBe(false);
  });

  it('deve alternar para placement-top quando forçado ou quando a seleção estiver no rodapé extremo', () => {
    QuickHighlightTooltip.show(200, 750, 'top');

    expect(tooltipEl.style.display).toBe('flex');
    expect(tooltipEl.classList.contains('placement-top')).toBe(true);
    expect(tooltipEl.classList.contains('placement-bottom')).toBe(false);
  });

  it('isForeignOverlayAt deve detectar nós injetados por extensões externas', () => {
    const fakeExtensionNode = document.createElement('div');
    fakeExtensionNode.id = 'deepl-inline-popup';
    fakeExtensionNode.style.position = 'fixed';
    document.body.appendChild(fakeExtensionNode);

    document.elementsFromPoint = vi.fn().mockReturnValue([fakeExtensionNode]);

    const hasConflict = QuickHighlightTooltip.isForeignOverlayAt(150, 100);
    expect(hasConflict).toBe(true);

    fakeExtensionNode.remove();
  });

  it('isForeignOverlayAt deve ignorar nós nativos do próprio DiveReader', () => {
    const bookContainer = document.getElementById('book-container');
    document.elementsFromPoint = vi.fn().mockReturnValue([bookContainer]);

    const hasConflict = QuickHighlightTooltip.isForeignOverlayAt(150, 100);
    expect(hasConflict).toBe(false);
  });
});
