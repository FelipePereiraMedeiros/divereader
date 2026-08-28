/**
 * DiveReader Pro - Ponto de Entrada Principal (Bootstrap da Aplicação)
 */

import { appState } from './state.js';
import { Storage } from './storage.js';
import { PdfService } from './services/pdfService.js';
import { HighlightService } from './services/highlightService.js';
import { NoteService } from './services/noteService.js';
import { PomodoroService } from './services/pomodoroService.js';
import { BackupService } from './services/backupService.js';
import { NotebookView } from './ui/notebookView.js';
import { QuickHighlightTooltip } from './ui/quickHighlight.js';
import { showToast } from './ui/toast.js';
import { DOM, refreshIcons } from './ui/dom.js';
import { setupKeyboardShortcuts } from './events/keyboard.js';
import { setupMouseEvents } from './events/mouse.js';
import { setupTouchAndGestures } from './events/touch.js';
import { EVENTS, ZOOM_LIMITS } from './constants.js';

export const App = {
  focusTimer: null,

  /**
   * Inicialização da aplicação
   */
  async init() {
    refreshIcons();
    PdfService.initWorker();

    // Carrega e aplica o tema salvo
    const savedTheme = Storage.loadTheme();
    document.body.className = savedTheme;
    if (DOM.themeSelector) DOM.themeSelector.value = savedTheme;

    // Inicializa componentes de UI
    NotebookView.init();
    QuickHighlightTooltip.init();
    this.initEventListeners();
    this.initPomodoro();

    // Redimensionamento de tela
    window.addEventListener('resize', () => {
      if (appState.get('pdfDoc') && !appState.get('isRendering')) {
        this.updateBodyMode();
        let pageNum = appState.get('pageNum');
        if (!appState.isSinglePageMode() && pageNum % 2 === 0) {
          pageNum -= 1;
        }
        this.renderPages(pageNum);
      }
    });

    console.log('DiveReader Pro 2.0 inicializado com sucesso.');
  },

  /**
   * Configuração de todos os ouvintes de eventos da UI
   */
  initEventListeners() {
    // 1. Abertura de Arquivo PDF
    if (DOM.fileInput) {
      DOM.fileInput.addEventListener('change', (e) => {
        if (e.target.files?.length > 0) {
          this.handleFile(e.target.files[0]);
        }
      });
    }

    // 2. Seletor de Tema
    if (DOM.themeSelector) {
      DOM.themeSelector.addEventListener('change', (e) => {
        const theme = e.target.value;
        document.body.className = theme;
        Storage.saveTheme(theme);
      });
    }

    // 3. Zoom
    if (DOM.btnZoomOut) DOM.btnZoomOut.onclick = () => this.changeZoom(-ZOOM_LIMITS.STEP);
    if (DOM.btnZoomIn) DOM.btnZoomIn.onclick = () => this.changeZoom(ZOOM_LIMITS.STEP);

    // 4. Navegação de Páginas (Top Bar)
    if (DOM.btnPrev) DOM.btnPrev.onclick = () => this.onPrevPage();
    if (DOM.btnNext) DOM.btnNext.onclick = () => this.onNextPage();

    if (DOM.pageInput) {
      DOM.pageInput.addEventListener('change', (e) => {
        if (!appState.get('pdfDoc') || appState.get('isRendering')) return;
        let target = parseInt(e.target.value, 10);
        const total = appState.get('totalPages');
        if (isNaN(target) || target < 1) target = 1;
        if (target > total) target = total;
        if (!appState.isSinglePageMode() && target % 2 === 0) target -= 1;
        this.renderPages(target);
      });
    }

    // 5. Botões de Grifo, Caderno e Foco
    if (DOM.btnHighlight) {
      DOM.btnHighlight.onclick = () => {
        const sel = window.getSelection();
        const res = HighlightService.createFromSelection(sel);
        if (res.success) {
          NotebookView.render();
          showToast('Trecho grifado e arquivado no Caderno!', 'book-marked');
        } else {
          showToast(res.message || 'Selecione um texto para grifar.', 'mouse-pointer-click');
        }
      };
    }

    if (DOM.btnToggleSidebar) {
      DOM.btnToggleSidebar.onclick = () => NotebookView.toggleSidebar();
    }

    if (DOM.btnToggleFocus) {
      DOM.btnToggleFocus.onclick = () => this.toggleFocusMode();
    }

    // 6. Backup (Exportar / Importar)
    if (DOM.btnExportBackup) {
      DOM.btnExportBackup.onclick = () => {
        const res = BackupService.exportBackup();
        if (res.success) {
          showToast('Backup exportado com sucesso!', 'save');
        } else {
          showToast(res.message || 'Erro ao exportar backup.', 'alert-circle');
        }
      };
    }

    if (DOM.importBackupInput) {
      DOM.importBackupInput.addEventListener('change', async (e) => {
        if (e.target.files?.length > 0) {
          const res = await BackupService.importBackup(e.target.files[0]);
          if (res.success) {
            showToast('Backup restaurado com sucesso!', 'check-circle-2');
            if (appState.get('pdfDoc')) {
              this.renderPages(appState.get('pageNum'));
            }
          } else {
            showToast(res.message || 'Falha ao restaurar backup.', 'alert-triangle');
          }
          e.target.value = '';
        }
      });
    }

    // 7. Mobile Bottom Bar
    if (DOM.mobileBtnPrev) DOM.mobileBtnPrev.onclick = () => this.onPrevPage();
    if (DOM.mobileBtnNext) DOM.mobileBtnNext.onclick = () => this.onNextPage();
    if (DOM.mobileBtnHighlight) {
      DOM.mobileBtnHighlight.onclick = () => {
        const sel = window.getSelection();
        const res = HighlightService.createFromSelection(sel);
        if (res.success) {
          NotebookView.render();
          showToast('Trecho grifado!', 'book-marked');
        } else {
          showToast(res.message || 'Selecione um texto antes de grifar.', 'mouse-pointer-click');
        }
      };
    }
    if (DOM.mobileBtnFocus) {
      DOM.mobileBtnFocus.onclick = () => this.toggleFocusMode();
    }
    if (DOM.mobileBtnSidebar) {
      DOM.mobileBtnSidebar.onclick = () => NotebookView.toggleSidebar();
    }
    if (DOM.mobileBtnTheme) {
      DOM.mobileBtnTheme.onclick = () => {
        const themes = ['theme-light', 'theme-sepia', 'theme-dark'];
        const current = Storage.loadTheme();
        const nextIdx = (themes.indexOf(current) + 1) % themes.length;
        const nextTheme = themes[nextIdx];
        document.body.className = nextTheme;
        Storage.saveTheme(nextTheme);
        if (DOM.themeSelector) DOM.themeSelector.value = nextTheme;
        showToast(`Tema alterado para ${nextTheme.replace('theme-', '')}`, 'sun');
      };
    }

    // 8. Barra de Foco Flutuante
    if (DOM.floatingBar) {
      document.addEventListener('mousemove', () => this.wakeFocusBar());
      DOM.floatingBar.addEventListener('mouseenter', () => {
        clearTimeout(this.focusTimer);
        DOM.floatingBar.classList.remove('faded');
      });
      DOM.floatingBar.addEventListener('mouseleave', () => this.wakeFocusBar());
    }

    // 9. Configuração de Eventos de Entrada
    setupKeyboardShortcuts({
      onNextPage: () => this.onNextPage(),
      onPrevPage: () => this.onPrevPage(),
      onChangeZoom: (delta) => this.changeZoom(delta),
      onToggleMenu: () => this.toggleFocusMode(),
      onToggleSidebar: () => NotebookView.toggleSidebar(),
    });

    setupMouseEvents({
      container: DOM.bookContainer,
      dragOverlay: DOM.dragOverlay,
      onFileDrop: (file) => this.handleFile(file),
      onNextPage: () => this.onNextPage(),
      onPrevPage: () => this.onPrevPage(),
      onChangeZoom: (delta) => this.changeZoom(delta),
    });

    setupTouchAndGestures({
      container: DOM.bookContainer,
      onNextPage: () => this.onNextPage(),
      onPrevPage: () => this.onPrevPage(),
    });
  },

  /**
   * Processa o carregamento de um arquivo PDF
   * @param {File} file
   */
  async handleFile(file) {
    if (!file || file.type !== 'application/pdf') {
      return showToast('Por favor, selecione um arquivo PDF válido.', 'file-warning');
    }

    const fileKey = Storage.generateFileKey(file.name, file.size);

    appState.set({
      fileName: file.name,
      fileKey,
      zoomLevel: 1.0,
    });

    if (DOM.fileTitle) {
      DOM.fileTitle.textContent = file.name;
      DOM.fileTitle.style.display = 'block';
    }

    if (DOM.emptyState) DOM.emptyState.style.display = 'none';
    if (DOM.bookContainer) DOM.bookContainer.style.display = 'flex';
    if (DOM.sidebar) DOM.sidebar.style.display = 'flex';

    // Habilita botões e inputs
    [
      DOM.btnZoomOut,
      DOM.btnZoomIn,
      DOM.btnToggleSidebar,
      DOM.btnToggleFocus,
      DOM.themeSelector,
      DOM.btnHighlight,
      DOM.pageInput,
      DOM.notepad,
      DOM.mobileBtnHighlight,
      DOM.mobileBtnFocus,
      DOM.mobileBtnSidebar,
    ].forEach((el) => {
      if (el) el.disabled = false;
    });

    if (DOM.loading) DOM.loading.style.display = 'flex';

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PdfService.loadDocument(arrayBuffer);

      const savedPage = Storage.loadPage(fileKey);
      const savedHighlights = Storage.loadHighlights(fileKey);
      const savedNotes = Storage.loadManualNotes(fileKey);

      let pageNum = savedPage || 1;
      if (!appState.isSinglePageMode() && pageNum % 2 === 0) {
        pageNum -= 1;
      }

      appState.set({
        pdfDoc,
        pageNum,
        totalPages: pdfDoc.numPages,
        highlights: savedHighlights,
        manualNotes: savedNotes,
      });

      if (DOM.totalPages) DOM.totalPages.textContent = String(pdfDoc.numPages);
      if (DOM.pageInput) DOM.pageInput.max = String(pdfDoc.numPages);

      this.updateBodyMode();
      await this.renderPages(pageNum);

      showToast('Documento carregado e pronto para estudo!', 'check-circle-2');
    } catch (error) {
      console.error('Erro ao carregar PDF:', error);
      showToast('Erro ao processar o arquivo PDF.', 'alert-circle');
      if (DOM.emptyState) DOM.emptyState.style.display = 'flex';
      if (DOM.bookContainer) DOM.bookContainer.style.display = 'none';
    } finally {
      if (DOM.loading) DOM.loading.style.display = 'none';
    }
  },

  /**
   * Renderiza as páginas ativas no leitor (Normalizando Páginas Esquerda/Direita)
   * @param {number} num
   */
  async renderPages(num) {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) return;

    const totalPages = appState.get('totalPages') || pdfDoc.numPages;
    const singlePage = appState.isSinglePageMode();

    let targetPage = parseInt(num, 10);
    if (isNaN(targetPage) || targetPage < 1) targetPage = 1;
    if (targetPage > totalPages) targetPage = totalPages;

    // No modo duas páginas (livro aberto), a página da esquerda é SEMPRE ímpar (1, 3, 5...)
    // Se o usuário clicar em uma página par (ex: 4), o spread renderiza a 3 na esquerda e a 4 na direita
    const leftPageNum = singlePage
      ? targetPage
      : (targetPage % 2 === 0 ? targetPage - 1 : targetPage);

    appState.set({ isRendering: true, pageNum: leftPageNum });
    Storage.savePage(appState.get('fileKey'), leftPageNum);

    if (DOM.pageInput) DOM.pageInput.value = String(targetPage);
    if (DOM.btnPrev) DOM.btnPrev.disabled = leftPageNum <= 1;
    if (DOM.mobileBtnPrev) DOM.mobileBtnPrev.disabled = leftPageNum <= 1;

    if (DOM.pdfViewer) DOM.pdfViewer.innerHTML = '';

    if (appState.get('zoomLevel') > 1.0 && DOM.bookContainer) {
      DOM.bookContainer.scrollTop = 0;
      DOM.bookContainer.scrollLeft = 0;
    }

    let indicatorText = `${leftPageNum}`;

    if (singlePage) {
      if (DOM.btnNext) DOM.btnNext.disabled = leftPageNum >= totalPages;
      if (DOM.mobileBtnNext) DOM.mobileBtnNext.disabled = leftPageNum >= totalPages;

      const wrapper = await PdfService.buildPageWrapper(
        leftPageNum,
        true,
        DOM.bookContainer,
        (p, layer) => HighlightService.drawPageHighlights(p, layer),
      );
      if (DOM.pdfViewer) DOM.pdfViewer.appendChild(wrapper);
    } else {
      const rightPageNum = leftPageNum + 1;
      const hasRightPage = rightPageNum <= totalPages;

      if (DOM.btnNext) DOM.btnNext.disabled = leftPageNum >= totalPages - 1;
      if (DOM.mobileBtnNext) DOM.mobileBtnNext.disabled = leftPageNum >= totalPages - 1;

      // Página da Esquerda (Sempre ímpar: 1, 3, 5, 7...)
      const wrapperLeft = await PdfService.buildPageWrapper(
        leftPageNum,
        false,
        DOM.bookContainer,
        (p, layer) => HighlightService.drawPageHighlights(p, layer),
      );
      if (DOM.pdfViewer) DOM.pdfViewer.appendChild(wrapperLeft);

      // Página da Direita (Sempre par: 2, 4, 6, 8...)
      if (hasRightPage) {
        const wrapperRight = await PdfService.buildPageWrapper(
          rightPageNum,
          false,
          DOM.bookContainer,
          (p, layer) => HighlightService.drawPageHighlights(p, layer),
        );
        if (DOM.pdfViewer) DOM.pdfViewer.appendChild(wrapperRight);
        indicatorText += ` & ${rightPageNum}`;
      }
    }

    // Atualiza o indicador de página
    if (DOM.indicator) {
      DOM.indicator.textContent = `Pág. ${indicatorText} / ${totalPages}`;
      DOM.indicator.style.opacity = '1';
      setTimeout(() => {
        if (appState.get('zoomLevel') <= 1.0 && DOM.indicator) {
          DOM.indicator.style.opacity = '0';
        }
      }, 3000);
    }

    // Atualiza o caderno de anotações
    NotebookView.render();
    appState.set({ isRendering: false });
  },

  /**
   * Avança para a próxima página com animação
   */
  onNextPage() {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc || appState.get('isRendering')) return;

    const single = appState.isSinglePageMode();
    const currentPage = appState.get('pageNum');
    const total = appState.get('totalPages');

    if (currentPage >= total - (single ? 0 : 1)) return;

    appState.set({ isRendering: true });
    const pages = DOM.pdfViewer?.children || [];
    const target = single ? pages[0] : pages.length > 1 ? pages[1] : pages[0];

    if (target && appState.get('zoomLevel') <= 1.0) {
      target.classList.add('flip-next');
      setTimeout(() => {
        appState.set({ isRendering: false });
        this.renderPages(currentPage + (single ? 1 : 2));
      }, 350);
    } else {
      this.renderPages(currentPage + (single ? 1 : 2));
    }
  },

  /**
   * Volta para a página anterior com animação
   */
  onPrevPage() {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc || appState.get('isRendering')) return;

    const single = appState.isSinglePageMode();
    const currentPage = appState.get('pageNum');
    if (currentPage <= 1) return;

    appState.set({ isRendering: true });
    const pages = DOM.pdfViewer?.children || [];
    const target = pages[0];

    if (target && appState.get('zoomLevel') <= 1.0) {
      target.classList.add('flip-prev');
      setTimeout(() => {
        appState.set({ isRendering: false });
        const nextPage = Math.max(1, currentPage - (single ? 1 : 2));
        this.renderPages(nextPage);
      }, 350);
    } else {
      const nextPage = Math.max(1, currentPage - (single ? 1 : 2));
      this.renderPages(nextPage);
    }
  },

  /**
   * Altera o nível de zoom
   * @param {number} delta
   */
  changeZoom(delta) {
    const current = appState.get('zoomLevel');
    const newZoom = Math.max(ZOOM_LIMITS.MIN, Math.min(ZOOM_LIMITS.MAX, current + delta));
    if (newZoom === current) return;

    const wasSingle = appState.isSinglePageMode();
    appState.set({ zoomLevel: newZoom });
    this.updateBodyMode();

    if (newZoom > 1.0) {
      if (DOM.topMenu) DOM.topMenu.classList.add('hidden');
      if (DOM.floatingBar) DOM.floatingBar.classList.add('faded');
      if (DOM.sidebar) DOM.sidebar.classList.add('hidden');
    } else {
      if (DOM.floatingBar) DOM.floatingBar.classList.add('visible');
      this.wakeFocusBar();
    }

    let pageNum = appState.get('pageNum');
    if (wasSingle && !appState.isSinglePageMode() && pageNum % 2 === 0) {
      pageNum -= 1;
    }
    this.renderPages(pageNum);
  },

  updateBodyMode() {
    document.body.classList.toggle('single-page-mode', appState.isSinglePageMode());
    document.body.classList.toggle('zoomed-mode', appState.get('zoomLevel') > 1.0);
  },

  toggleFocusMode() {
    if (!DOM.topMenu) return;
    DOM.topMenu.classList.toggle('hidden');
    const isHidden = DOM.topMenu.classList.contains('hidden');
    appState.set({ isFocusMode: isHidden });
    document.body.classList.toggle('focus-mode', isHidden);

    // No mobile, oculta também a barra inferior para liberar 100% da tela
    if (DOM.mobileNavBar) {
      DOM.mobileNavBar.classList.toggle('hidden', isHidden);
    }

    if (isHidden) {
      if (DOM.floatingBar) {
        DOM.floatingBar.classList.add('visible');
        this.wakeFocusBar();
      }
      showToast('Modo Foco (Tela Cheia)', 'maximize');
    } else if (DOM.floatingBar) {
      DOM.floatingBar.classList.remove('visible', 'faded');
      clearTimeout(this.focusTimer);
      showToast('Modo Foco desativado', 'minimize');
    }
  },

  wakeFocusBar() {
    if (!DOM.floatingBar || appState.get('zoomLevel') > 1.0 || !DOM.floatingBar.classList.contains('visible')) {
      return;
    }
    DOM.floatingBar.classList.remove('faded');
    clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() => {
      if (DOM.floatingBar && !DOM.floatingBar.matches(':hover')) {
        DOM.floatingBar.classList.add('faded');
      }
    }, 4000);
  },

  /**
   * Inicializa o Pomodoro e seus ouvintes de UI
   */
  initPomodoro() {
    const updatePomodoroDOM = (state) => {
      if (DOM.pomodoroText) {
        DOM.pomodoroText.textContent = state.text;
        DOM.pomodoroText.style.opacity = state.isRunning ? '1' : '0.5';
      }
      if (DOM.pomodoroHand) {
        DOM.pomodoroHand.style.transform = `translateX(-50%) rotate(${state.degrees}deg)`;
      }
      if (DOM.pomodoroFace) {
        DOM.pomodoroFace.style.background = `conic-gradient(transparent ${state.degrees}deg, var(--pomodoro-accent) ${state.degrees}deg)`;
      }
      if (DOM.pomodoroControls) {
        DOM.pomodoroControls.classList.toggle('faded', state.isRunning);
      }
    };

    appState.on(EVENTS.POMODORO_TICK, (state) => {
      updatePomodoroDOM(state);
    });

    appState.on(EVENTS.POMODORO_FINISHED, () => {
      if (DOM.pomodoroAlert) {
        DOM.pomodoroAlert.classList.remove('hidden');
        refreshIcons(DOM.pomodoroAlert);
      }
      showToast('Ciclo Pomodoro finalizado! Hora de descansar.', 'coffee');
    });

    if (DOM.pomodoroWidget) {
      DOM.pomodoroWidget.onclick = () => {
        const running = PomodoroService.toggle();
        showToast(running ? 'Pomodoro iniciado!' : 'Pomodoro pausado', running ? 'play' : 'pause');
      };
    }

    // Mini controles (-5, reset, +5)
    const btnSub5 = document.getElementById('btn-pomodoro-sub5');
    const btnReset = document.getElementById('btn-pomodoro-reset');
    const btnAdd5 = document.getElementById('btn-pomodoro-add5');

    if (btnSub5) btnSub5.onclick = () => PomodoroService.adjust(-5);
    if (btnReset) btnReset.onclick = () => PomodoroService.reset(20);
    if (btnAdd5) btnAdd5.onclick = () => PomodoroService.adjust(5);

    // Modal de Alerta Pomodoro
    const btnAlertBreak = document.getElementById('btn-alert-break');
    const btnAlertSnooze = document.getElementById('btn-alert-snooze');
    const btnAlertReset = document.getElementById('btn-alert-reset');

    if (btnAlertBreak) {
      btnAlertBreak.onclick = () => {
        if (DOM.pomodoroAlert) DOM.pomodoroAlert.classList.add('hidden');
        PomodoroService.reset(5);
        PomodoroService.start();
        showToast('Pausa iniciada (5m)!', 'coffee');
      };
    }

    if (btnAlertSnooze) {
      btnAlertSnooze.onclick = () => {
        if (DOM.pomodoroAlert) DOM.pomodoroAlert.classList.add('hidden');
        PomodoroService.snooze(5);
        showToast('Soneca de +5 minutos adicionada!', 'alarm-clock-plus');
      };
    }

    if (btnAlertReset) {
      btnAlertReset.onclick = () => {
        if (DOM.pomodoroAlert) DOM.pomodoroAlert.classList.add('hidden');
        PomodoroService.reset(20);
      };
    }

    // Inicializa a UI do Pomodoro
    updatePomodoroDOM(PomodoroService.getState());
  },
};

// Auto-inicialização no navegador
if (typeof window !== 'undefined') {
  window.app = App;
  window.addEventListener('DOMContentLoaded', () => {
    App.init();
  });
}
