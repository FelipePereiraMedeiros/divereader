import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appState } from '../../src/js/state.js';
import { App } from '../../src/js/app.js';
import { READING_MODES } from '../../src/js/constants.js';
import { DOM } from '../../src/js/ui/dom.js';

describe('Reading Mode Feature (Paged vs Continuous)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="app-container">
        <button id="btn-reading-mode">
          <span id="reading-mode-label">Páginas</span>
        </button>
        <div id="book-container">
          <div id="pdf-viewer"></div>
        </div>
      </div>
    `;

    DOM.btnReadingMode = document.getElementById('btn-reading-mode');
    DOM.readingModeLabel = document.getElementById('reading-mode-label');
    DOM.bookContainer = document.getElementById('book-container');
    DOM.pdfViewer = document.getElementById('pdf-viewer');

    appState.set({
      readingMode: READING_MODES.PAGED,
      pdfDoc: { numPages: 10 },
      pageNum: 1,
      totalPages: 10,
    });
  });

  it('deve iniciar no modo paginado por padrão', () => {
    expect(appState.get('readingMode')).toBe(READING_MODES.PAGED);
  });

  it('deve alternar entre modo PAGED e CONTINUOUS com toggleReadingMode', () => {
    const renderSpy = vi.spyOn(App, 'renderPages').mockResolvedValue(undefined);

    App.toggleReadingMode();
    expect(appState.get('readingMode')).toBe(READING_MODES.CONTINUOUS);
    expect(DOM.readingModeLabel.textContent).toBe('Contínuo');
    expect(renderSpy).toHaveBeenCalled();

    App.toggleReadingMode();
    expect(appState.get('readingMode')).toBe(READING_MODES.PAGED);
    expect(DOM.readingModeLabel.textContent).toBe('Páginas');
  });

  it('isSinglePageMode deve retornar true quando o modo for contínuo', () => {
    appState.set({ readingMode: READING_MODES.CONTINUOUS });
    expect(appState.isSinglePageMode()).toBe(true);
  });
});
