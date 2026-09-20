import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appState } from '../../src/js/state.js';
import { App } from '../../src/js/app.js';
import { DOM } from '../../src/js/ui/dom.js';

describe('Page Jump Feature (Mobile & Desktop)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="app-container">
        <div id="discreet-indicator">Pág. 1 / 10</div>
        <div id="reading-progress-bar-container">
          <div id="reading-progress-bar" style="width: 10%;"></div>
        </div>
        <div id="book-container">
          <div id="pdf-viewer"></div>
        </div>
        <nav id="mobile-nav-bar">
          <button id="mobile-btn-prev"></button>
          <button id="mobile-btn-page">
            <span id="mobile-page-text">Pág. 1/10</span>
          </button>
          <button id="mobile-btn-next"></button>
        </nav>
        <dialog id="page-jump-dialog">
          <button id="btn-close-page-jump"></button>
          <span id="pj-current-num">1</span>
          <span id="pj-total-num">10</span>
          <span id="pj-percent">10%</span>
          <input type="range" id="pj-slider" min="1" max="10" value="1" />
          <form id="pj-form">
            <input type="number" id="pj-number-input" />
            <button type="submit" id="btn-pj-go"></button>
          </form>
          <button id="btn-pj-first"></button>
          <button id="btn-pj-return" class="hidden">
            <span id="pj-return-text"></span>
          </button>
          <button id="btn-pj-last"><span id="pj-last-text"></span></button>
          <button id="btn-pj-toc"></button>
        </dialog>
      </div>
    `;

    // Atualiza referências DOM
    DOM.indicator = document.getElementById('discreet-indicator');
    DOM.readingProgressBarContainer = document.getElementById('reading-progress-bar-container');
    DOM.pageJumpDialog = document.getElementById('page-jump-dialog');
    DOM.btnClosePageJump = document.getElementById('btn-close-page-jump');
    DOM.pjCurrentNum = document.getElementById('pj-current-num');
    DOM.pjTotalNum = document.getElementById('pj-total-num');
    DOM.pjPercent = document.getElementById('pj-percent');
    DOM.pjSlider = document.getElementById('pj-slider');
    DOM.pjForm = document.getElementById('pj-form');
    DOM.pjNumberInput = document.getElementById('pj-number-input');
    DOM.btnPjGo = document.getElementById('btn-pj-go');
    DOM.btnPjFirst = document.getElementById('btn-pj-first');
    DOM.btnPjReturn = document.getElementById('btn-pj-return');
    DOM.pjReturnText = document.getElementById('pj-return-text');
    DOM.btnPjLast = document.getElementById('btn-pj-last');
    DOM.pjLastText = document.getElementById('pj-last-text');
    DOM.btnPjToc = document.getElementById('btn-pj-toc');
    DOM.mobileBtnPage = document.getElementById('mobile-btn-page');
    DOM.mobilePageText = document.getElementById('mobile-page-text');

    // Mock do showModal / close se jsdom não tiver nativo
    if (!DOM.pageJumpDialog.showModal) {
      DOM.pageJumpDialog.showModal = vi.fn(function () {
        this.open = true;
      });
    }
    if (!DOM.pageJumpDialog.close) {
      DOM.pageJumpDialog.close = vi.fn(function () {
        this.open = false;
      });
    }

    const mockPdfDoc = { numPages: 20 };
    appState.set({
      pdfDoc: mockPdfDoc,
      totalPages: 20,
      pageNum: 3,
      pageJumpHistory: null,
    });
  });

  it('deve abrir o modal de navegação rápida e preencher os dados atuais da leitura', () => {
    App.openPageJumpDialog();

    expect(DOM.pageJumpDialog.open).toBe(true);
    expect(DOM.pjCurrentNum.textContent).toBe('3');
    expect(DOM.pjTotalNum.textContent).toBe('20');
    expect(DOM.pjPercent.textContent).toBe('15%');
    expect(DOM.pjSlider.value).toBe('3');
    expect(DOM.pjSlider.max).toBe('20');
  });

  it('deve saltar diretamente para uma página e registrar histórico de retorno', () => {
    const renderSpy = vi.spyOn(App, 'renderPages').mockResolvedValue(undefined);

    App.goToPage(15, true);

    expect(appState.get('pageJumpHistory')).toBe(3);
    expect(renderSpy).toHaveBeenCalledWith(15);
  });

  it('deve exibir botão de retorno e permitir voltar à página anterior após salto', () => {
    const renderSpy = vi.spyOn(App, 'renderPages').mockResolvedValue(undefined);
    appState.set({ pageNum: 15, pageJumpHistory: 3 });

    App.openPageJumpDialog();
    expect(DOM.btnPjReturn.classList.contains('hidden')).toBe(false);
    expect(DOM.pjReturnText.textContent).toContain('3');

    App.returnToPreviousPage();
    expect(renderSpy).toHaveBeenCalledWith(3);
  });

  it('deve atualizar o preview em tempo real ao mover o slider', () => {
    const event = { target: { value: '8' } };
    App.onPjSliderInput(event);

    expect(DOM.pjCurrentNum.textContent).toBe('8');
    expect(DOM.pjPercent.textContent).toBe('40%');
  });
});
