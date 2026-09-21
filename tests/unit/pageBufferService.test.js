import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PageBufferService } from '../../src/js/services/pageBufferService.js';
import { appState } from '../../src/js/state.js';
import { PdfService } from '../../src/js/services/pdfService.js';

describe('PageBufferService (Sliding Window LRU Cache)', () => {
  beforeEach(() => {
    PageBufferService.clearAll();
    appState.set({
      fileKey: 'test_book.pdf_123',
      zoomLevel: 1.0,
      zoomMode: 'fit-width',
      pdfDoc: {
        numPages: 20,
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 600, height: 800 }),
          render: () => ({ promise: Promise.resolve() }),
          getTextContent: () => Promise.resolve({ items: [] }),
        }),
      },
    });
  });

  it('deve gerar assinaturas consistentes baseadas no estado de zoom e modo', () => {
    const sig1 = PageBufferService.getSignature(true);
    expect(sig1).toContain('test_book.pdf_123');
    expect(sig1).toContain('z1.00');
    expect(sig1).toContain('s1');

    appState.set({ zoomLevel: 1.5 });
    const sig2 = PageBufferService.getSignature(true);
    expect(sig2).toContain('z1.50');
    expect(sig2).not.toBe(sig1);
  });

  it('deve armazenar páginas no cache e recuperar sem nova chamada ao PdfService', async () => {
    const mockWrapper = document.createElement('div');
    mockWrapper.className = 'page-wrapper';
    mockWrapper.innerHTML = '<div class="highlight-layer"></div><canvas width="100" height="100"></canvas>';

    const spyBuild = vi.spyOn(PdfService, 'buildPageWrapper').mockResolvedValue(mockWrapper);

    const container = document.createElement('div');
    const page1 = await PageBufferService.getOrRenderPage(1, true, container);
    expect(spyBuild).toHaveBeenCalledTimes(1);
    expect(page1).toBe(mockWrapper);

    // Segunda chamada para a mesma página deve bater no cache
    const page1Cached = await PageBufferService.getOrRenderPage(1, true, container);
    expect(spyBuild).toHaveBeenCalledTimes(1); // Não aumentou as chamadas!
    expect(page1Cached).toBe(mockWrapper);

    spyBuild.mockRestore();
  });

  it('deve descartar páginas mais antigas por LRU quando exceder o limite', async () => {
    const maxSize = PageBufferService.getMaxCacheSize();

    for (let i = 1; i <= maxSize + 2; i++) {
      const el = document.createElement('div');
      el.className = 'page-wrapper';
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      el.appendChild(canvas);
      PageBufferService._put(PageBufferService._buildKey(i, PageBufferService._currentSignature || 'sig'), i, el);
    }

    const stats = PageBufferService.getStats();
    expect(stats.size).toBeLessThanOrEqual(maxSize);
  });

  it('deve limpar todas as instâncias e resetar canvases ao chamar clearAll', () => {
    const el = document.createElement('div');
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    el.appendChild(canvas);

    PageBufferService._put('key_1', 1, el);
    expect(PageBufferService._cache.size).toBe(1);

    PageBufferService.clearAll();
    expect(PageBufferService._cache.size).toBe(0);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});
