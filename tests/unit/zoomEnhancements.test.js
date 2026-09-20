import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appState } from '../../src/js/state.js';
import { App } from '../../src/js/app.js';
import { PdfService } from '../../src/js/services/pdfService.js';
import { ZOOM_MODES } from '../../src/js/constants.js';
import { DOM } from '../../src/js/ui/dom.js';

describe('Zoom Enhancements (Fit Width, Fit Page, Focal Point)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="app-container">
        <div id="book-container" style="width: 800px; height: 600px;">
          <div id="pdf-viewer"></div>
        </div>
        <button id="btn-zoom-out"></button>
        <button id="btn-zoom-in"></button>
        <button id="btn-zoom-preset">
          <span id="zoom-preset-label">100%</span>
        </button>
        <div id="zoom-hud">
          <button id="hud-btn-zoom-out"></button>
          <button id="hud-btn-preset">
            <span id="hud-zoom-text">100%</span>
          </button>
          <button id="hud-btn-zoom-in"></button>
          <button id="hud-btn-fit"></button>
        </div>
      </div>
    `;

    DOM.bookContainer = document.getElementById('book-container');
    DOM.pdfViewer = document.getElementById('pdf-viewer');
    DOM.btnZoomOut = document.getElementById('btn-zoom-out');
    DOM.btnZoomIn = document.getElementById('btn-zoom-in');
    DOM.btnZoomPreset = document.getElementById('btn-zoom-preset');
    DOM.zoomPresetLabel = document.getElementById('zoom-preset-label');
    DOM.zoomHud = document.getElementById('zoom-hud');
    DOM.hudBtnZoomOut = document.getElementById('hud-btn-zoom-out');
    DOM.hudBtnPreset = document.getElementById('hud-btn-preset');
    DOM.hudZoomText = document.getElementById('hud-zoom-text');
    DOM.hudBtnZoomIn = document.getElementById('hud-btn-zoom-in');
    DOM.hudBtnFit = document.getElementById('hud-btn-fit');

    appState.set({
      zoomLevel: 1.0,
      zoomMode: ZOOM_MODES.FIT_WIDTH,
      pdfDoc: { numPages: 10 },
      pageNum: 1,
      totalPages: 10,
    });
  });

  it('deve calcular escala no modo FIT_WIDTH aproveitando a largura disponível', () => {
    const mockViewport = { width: 600, height: 800 };
    const mockContainer = { clientWidth: 1000, clientHeight: 700 };

    const scaleFitWidth = PdfService.getScale(mockViewport, true, mockContainer, 1.0, ZOOM_MODES.FIT_WIDTH);
    // (1000 - 32) / 600 = 968 / 600 = 1.6133
    expect(scaleFitWidth).toBeCloseTo(1.61, 1);
  });

  it('deve calcular escala no modo FIT_PAGE enquadrando altura e largura', () => {
    const mockViewport = { width: 600, height: 800 };
    const mockContainer = { clientWidth: 1000, clientHeight: 700 };

    const scaleFitPage = PdfService.getScale(mockViewport, true, mockContainer, 1.0, ZOOM_MODES.FIT_PAGE);
    // Height target = (700 - 32) / 800 = 668 / 800 = 0.835; baseScale = 0.835 * 0.98 = 0.818
    expect(scaleFitPage).toBeLessThan(1.0);
    expect(scaleFitPage).toBeCloseTo(0.82, 1);
  });

  it('deve alternar entre modos FIT_WIDTH e FIT_PAGE através de toggleZoomMode', () => {
    const renderSpy = vi.spyOn(App, 'renderPages').mockResolvedValue(undefined);

    expect(appState.get('zoomMode')).toBe(ZOOM_MODES.FIT_WIDTH);

    App.toggleZoomMode();
    expect(appState.get('zoomMode')).toBe(ZOOM_MODES.FIT_PAGE);
    expect(renderSpy).toHaveBeenCalled();

    App.toggleZoomMode();
    expect(appState.get('zoomMode')).toBe(ZOOM_MODES.FIT_WIDTH);
  });

  it('deve atualizar os labels de UI do Zoom (Top Bar e HUD) corretamente', () => {
    appState.set({ zoomLevel: 1.5, zoomMode: ZOOM_MODES.FIT_WIDTH });
    App.updateZoomUI();

    expect(DOM.zoomPresetLabel.textContent).toBe('150%');
    expect(DOM.hudZoomText.textContent).toBe('150%');

    appState.set({ zoomLevel: 1.0, zoomMode: ZOOM_MODES.FIT_PAGE });
    App.updateZoomUI();

    expect(DOM.zoomPresetLabel.textContent).toBe('Página');
    expect(DOM.hudZoomText.textContent).toBe('Pág. Int.');
  });
});
