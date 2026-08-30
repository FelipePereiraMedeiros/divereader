import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PdfService } from '../../src/js/services/pdfService.js';
import { NotebookView } from '../../src/js/ui/notebookView.js';
import { appState } from '../../src/js/state.js';
import { DOM } from '../../src/js/ui/dom.js';

describe('PDF Outline / Sumário TOC', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="sidebar">
        <div class="sidebar-tabs">
          <button id="tab-btn-page" class="active">Nesta Página</button>
          <button id="tab-btn-global">Fichamento</button>
          <button id="tab-btn-toc">Sumário</button>
        </div>
        <div id="tab-page" class="tab-content active"></div>
        <div id="tab-global" class="tab-content"></div>
        <div id="tab-toc" class="tab-content">
          <div id="toc-list" class="toc-container"></div>
        </div>
      </div>
    `;

    DOM.tabBtnPage = document.getElementById('tab-btn-page');
    DOM.tabBtnGlobal = document.getElementById('tab-btn-global');
    DOM.tabBtnToc = document.getElementById('tab-btn-toc');
    DOM.tabPage = document.getElementById('tab-page');
    DOM.tabGlobal = document.getElementById('tab-global');
    DOM.tabToc = document.getElementById('tab-toc');
    DOM.tocList = document.getElementById('toc-list');
    DOM.sidebar = document.getElementById('sidebar');

    NotebookView.init();
  });

  it('PdfService.getOutline deve extrair e resolver números de páginas do sumário', async () => {
    const mockPdfDoc = {
      getOutline: vi.fn().mockResolvedValue([
        {
          title: 'Capítulo 1: Introdução',
          dest: [{ num: 12, gen: 0 }],
          items: [
            {
              title: '1.1 Conceitos',
              dest: 'named_dest_1',
              items: [],
            },
          ],
        },
        {
          title: 'Capítulo 2: Metodologia',
          dest: [{ num: 34, gen: 0 }],
          items: [],
        },
      ]),
      getDestination: vi.fn().mockResolvedValue([{ num: 20, gen: 0 }]),
      getPageIndex: vi.fn().mockImplementation((ref) => {
        if (ref.num === 12) return Promise.resolve(0); // Pág 1
        if (ref.num === 20) return Promise.resolve(4); // Pág 5
        if (ref.num === 34) return Promise.resolve(9); // Pág 10
        return Promise.resolve(0);
      }),
    };

    const outline = await PdfService.getOutline(mockPdfDoc);

    expect(outline).toHaveLength(2);
    expect(outline[0].title).toBe('Capítulo 1: Introdução');
    expect(outline[0].pageNum).toBe(1);
    expect(outline[0].items[0].title).toBe('1.1 Conceitos');
    expect(outline[0].items[0].pageNum).toBe(5);
    expect(outline[1].title).toBe('Capítulo 2: Metodologia');
    expect(outline[1].pageNum).toBe(10);
  });

  it('NotebookView.renderToc deve renderizar mensagem amigável quando outline for vazio', () => {
    appState.set({ outline: [] });
    NotebookView.renderToc();

    expect(DOM.tocList.innerHTML).toContain('Nenhum sumário encontrado');
  });

  it('NotebookView.renderToc deve renderizar árvore de itens e navegar ao clicar', () => {
    const navigateSpy = vi.fn();
    NotebookView.onNavigatePage = navigateSpy;

    appState.set({
      pageNum: 1,
      outline: [
        {
          title: 'Capítulo 1',
          pageNum: 1,
          items: [{ title: 'Seção 1.1', pageNum: 3, items: [] }],
        },
        { title: 'Capítulo 2', pageNum: 10, items: [] },
      ],
    });

    NotebookView.renderToc();

    const items = DOM.tocList.querySelectorAll('.toc-item');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('Capítulo 1');
    expect(items[0].classList.contains('active')).toBe(true);

    // Clicar no item da Seção 1.1 (p. 3)
    items[1].click();
    expect(navigateSpy).toHaveBeenCalledWith(3);
  });
});
