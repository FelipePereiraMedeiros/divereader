/**
 * DiveReader Pro - Ponto de Entrada Principal (Bootstrap da Aplicação)
 */

import { appState } from './state.js';
import { Storage } from './storage.js';
import { PdfService } from './services/pdfService.js';
import { PageBufferService } from './services/pageBufferService.js';
import { SearchService } from './services/searchService.js';
import { HighlightService } from './services/highlightService.js';
import { NoteService } from './services/noteService.js';
import { PomodoroService } from './services/pomodoroService.js';
import { BackupService } from './services/backupService.js';
import { NotebookView } from './ui/notebookView.js';
import { QuickHighlightTooltip } from './ui/quickHighlight.js';
import { SearchDialog } from './ui/searchDialog.js';
import { showToast } from './ui/toast.js';
import { DOM, refreshIcons } from './ui/dom.js';
import { setupKeyboardShortcuts } from './events/keyboard.js';
import { setupMouseEvents, applyFocalZoom } from './events/mouse.js';
import { setupTouchAndGestures } from './events/touch.js';
import { cachePdfDocument, getLastCachedPdf } from './storage/indexedDB.js';
import { EVENTS, READING_MODES, THEMES, ZOOM_LIMITS, ZOOM_MODES } from './constants.js';

export const App = {
  focusTimer: null,
  _scrollObserver: null,

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
    NotebookView.init({
      onNavigatePage: (pageNum) => this.renderPages(pageNum),
    });
    QuickHighlightTooltip.init();
    SearchDialog.init();

    // Listener global para navegação direta de página via eventos
    appState.on('NAVIGATE_PAGE', (pageNum) => {
      if (typeof pageNum === 'number' && !isNaN(pageNum)) {
        this.renderPages(pageNum);
      }
    });

    this.initEventListeners();
    this.initPomodoro();
    window.app = this;

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

    // Restauração de sessão persistente via cache IndexedDB
    try {
      const cached = await getLastCachedPdf();
      if (cached && cached.arrayBuffer && !appState.get('pdfDoc')) {
        await this.loadPdfBuffer(cached.arrayBuffer, cached.fileName, cached.fileSize, true);
      }
    } catch (err) {
      console.warn('Não foi possível restaurar sessão anterior do IndexedDB:', err);
    }
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

    if (DOM.btnEmptyOpen) {
      DOM.btnEmptyOpen.onclick = () => DOM.fileInput?.click();
    }

    // 2. Seletor de Tema
    if (DOM.themeSelector) {
      DOM.themeSelector.addEventListener('change', (e) => {
        const theme = e.target.value;
        document.body.className = theme;
        Storage.saveTheme(theme);
      });
    }

    // 2.1 Seletor de Modo de Leitura (Duas Páginas / Página Única / Rolagem Contínua)
    if (DOM.readingModeSelector) {
      DOM.readingModeSelector.addEventListener('change', (e) => {
        this.setReadingMode(e.target.value);
      });
    }

    // 2.2 Busca Global no Documento PDF (Ctrl+F)
    if (DOM.btnSearchDoc) {
      DOM.btnSearchDoc.onclick = () => SearchDialog.toggle();
    }
    if (DOM.mobileBtnSearch) {
      DOM.mobileBtnSearch.onclick = () => SearchDialog.toggle();
    }

    // 3. Zoom (Top Bar & Floating HUD)
    if (DOM.btnZoomOut) DOM.btnZoomOut.onclick = () => this.changeZoom(-ZOOM_LIMITS.STEP);
    if (DOM.btnZoomIn) DOM.btnZoomIn.onclick = () => this.changeZoom(ZOOM_LIMITS.STEP);
    if (DOM.btnZoomPreset) DOM.btnZoomPreset.onclick = () => this.toggleZoomMode();

    if (DOM.hudBtnZoomOut) DOM.hudBtnZoomOut.onclick = () => this.changeZoom(-ZOOM_LIMITS.STEP);
    if (DOM.hudBtnZoomIn) DOM.hudBtnZoomIn.onclick = () => this.changeZoom(ZOOM_LIMITS.STEP);
    if (DOM.hudBtnPreset) DOM.hudBtnPreset.onclick = () => this.toggleZoomMode();
    if (DOM.hudBtnFit) DOM.hudBtnFit.onclick = () => this.toggleZoomMode();

    // 4. Navegação de Páginas (Top Bar, Mobile & Indicador Discreto)
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

    if (DOM.indicator) {
      DOM.indicator.onclick = () => this.openPageJumpDialog();
      DOM.indicator.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openPageJumpDialog();
        }
      });
    }

    if (DOM.readingProgressBarContainer) {
      DOM.readingProgressBarContainer.onclick = (e) => this.onProgressBarClick(e);
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
    if (DOM.mobileBtnPage) DOM.mobileBtnPage.onclick = () => this.openPageJumpDialog();
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

    // 8. Diálogo de Salto Rápido de Página (Page Jump Bottom Sheet)
    if (DOM.btnClosePageJump) {
      DOM.btnClosePageJump.onclick = () => this.closePageJumpDialog();
    }
    if (DOM.pageJumpDialog) {
      DOM.pageJumpDialog.oncancel = () => this.closePageJumpDialog();
    }
    if (DOM.pjSlider) {
      DOM.pjSlider.addEventListener('input', (e) => this.onPjSliderInput(e));
      DOM.pjSlider.addEventListener('change', (e) => this.onPjSliderChange(e));
    }
    if (DOM.pjForm) {
      DOM.pjForm.addEventListener('submit', (e) => this.onPjFormSubmit(e));
    }
    if (DOM.btnPjFirst) DOM.btnPjFirst.onclick = () => this.goToPage(1);
    if (DOM.btnPjLast) DOM.btnPjLast.onclick = () => this.goToPage(appState.get('totalPages'));
    if (DOM.btnPjReturn) DOM.btnPjReturn.onclick = () => this.returnToPreviousPage();
    if (DOM.btnPjToc) {
      DOM.btnPjToc.onclick = () => {
        this.closePageJumpDialog();
        NotebookView.toggleSidebar();
        NotebookView.switchTab('toc');
      };
    }

    // 9. Barra de Foco Flutuante
    if (DOM.floatingBar) {
      document.addEventListener('mousemove', () => this.wakeFocusBar());
      DOM.floatingBar.addEventListener('mouseenter', () => {
        clearTimeout(this.focusTimer);
        DOM.floatingBar.classList.remove('faded');
      });
      DOM.floatingBar.addEventListener('mouseleave', () => this.wakeFocusBar());
    }

    if (DOM.btnFocusSidebar) {
      DOM.btnFocusSidebar.onclick = () => NotebookView.toggleSidebar();
    }
    if (DOM.btnFocusHighlight) {
      DOM.btnFocusHighlight.onclick = () => DOM.btnHighlight?.click();
    }
    if (DOM.btnFocusToggle) {
      DOM.btnFocusToggle.onclick = () => this.toggleFocusMode();
    }

    // 10. Configuração de Eventos de Entrada
    setupKeyboardShortcuts({
      onNextPage: () => this.onNextPage(),
      onPrevPage: () => this.onPrevPage(),
      onGoToPage: (p) => this.renderPages(p),
      onChangeZoom: (delta, opts) => this.changeZoom(delta, opts),
      onResetZoom: () => this.setZoom(1.0),
      onToggleMenu: () => this.toggleFocusMode(),
      onToggleSidebar: () => NotebookView.toggleSidebar(),
      onSearch: () => SearchDialog.toggle(),
    });

    setupMouseEvents({
      container: DOM.bookContainer,
      dragOverlay: DOM.dragOverlay,
      onFileDrop: (file) => this.handleFile(file),
      onNextPage: () => this.onNextPage(),
      onPrevPage: () => this.onPrevPage(),
      onChangeZoom: (delta, focalPoint) => this.changeZoom(delta, focalPoint),
    });

    setupTouchAndGestures({
      container: DOM.bookContainer,
      onNextPage: () => this.onNextPage(),
      onPrevPage: () => this.onPrevPage(),
      onSetZoom: (zoom, focalPoint) => this.setZoom(zoom, focalPoint),
      onChangeZoom: (delta) => this.changeZoom(delta),
    });
  },

  /**
   * Processa o carregamento de um arquivo PDF a partir de um File do sistema
   * @param {File} file
   */
  async handleFile(file) {
    if (!file || file.type !== 'application/pdf') {
      return showToast('Por favor, selecione um arquivo PDF válido.', 'file-warning');
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      await this.loadPdfBuffer(arrayBuffer, file.name, file.size, false);
    } catch (err) {
      console.error('Erro ao ler arquivo PDF:', err);
      showToast('Falha ao ler o arquivo do disco.', 'alert-circle');
    }
  },

  /**
   * Carrega um ArrayBuffer de PDF no leitor e sincroniza com o cache IndexedDB
   * @param {ArrayBuffer} arrayBuffer
   * @param {string} fileName
   * @param {number} fileSize
   * @param {boolean} isFromCache
   */
  async loadPdfBuffer(arrayBuffer, fileName, fileSize, isFromCache = false) {
    const fileKey = Storage.generateFileKey(fileName, fileSize);

    appState.set({
      fileName,
      fileKey,
      zoomLevel: 1.0,
    });

    if (DOM.fileTitle) {
      DOM.fileTitle.textContent = fileName;
      DOM.fileTitle.style.display = 'block';
    }

    if (DOM.emptyState) DOM.emptyState.style.display = 'none';
    if (DOM.bookContainer) DOM.bookContainer.style.display = 'flex';
    if (DOM.sidebar) DOM.sidebar.style.display = 'flex';

    // Limpa caches ao carregar novo documento
    PageBufferService.clearAll();
    SearchService.clearCache();

    // Habilita botões e inputs
    [
      DOM.btnZoomOut,
      DOM.btnZoomIn,
      DOM.btnZoomPreset,
      DOM.btnToggleSidebar,
      DOM.btnToggleFocus,
      DOM.themeSelector,
      DOM.readingModeSelector,
      DOM.btnSearchDoc,
      DOM.btnHighlight,
      DOM.pageInput,
      DOM.notepad,
      DOM.mobileBtnHighlight,
      DOM.mobileBtnSearch,
      DOM.mobileBtnFocus,
      DOM.mobileBtnSidebar,
      DOM.mobileBtnPage,
      DOM.hudBtnZoomOut,
      DOM.hudBtnZoomIn,
      DOM.hudBtnPreset,
      DOM.hudBtnFit,
    ].forEach((el) => {
      if (el) el.disabled = false;
    });

    if (DOM.readingModeSelector) {
      DOM.readingModeSelector.value = appState.get('readingMode') || READING_MODES.SPREAD;
    }

    if (DOM.zoomHud) DOM.zoomHud.classList.remove('hidden');

    if (DOM.loading) DOM.loading.style.display = 'flex';

    try {
      const resolvedKey = await Storage.resolveFileKey(fileName, fileSize, arrayBuffer);
      appState.set({ fileKey: resolvedKey });

      // Persiste no cache IndexedDB para reabertura automática instantânea
      if (!isFromCache) {
        cachePdfDocument(resolvedKey, fileName, fileSize, arrayBuffer).catch((err) => {
          console.warn('Falha ao salvar no cache IndexedDB:', err);
        });
      }

      const pdfDoc = await PdfService.loadDocument(arrayBuffer);
      const outline = await PdfService.getOutline(pdfDoc);

      const savedPage = Storage.loadPage(resolvedKey);
      const savedHighlights = Storage.loadHighlights(resolvedKey);
      const savedNotes = Storage.loadManualNotes(resolvedKey);

      let pageNum = savedPage || 1;
      if (!appState.isSinglePageMode() && pageNum % 2 === 0) {
        pageNum -= 1;
      }

      appState.set({
        pdfDoc,
        outline,
        pageNum,
        totalPages: pdfDoc.numPages,
        highlights: savedHighlights,
        manualNotes: savedNotes,
      });

      if (DOM.totalPages) DOM.totalPages.textContent = String(pdfDoc.numPages);
      if (DOM.pageInput) DOM.pageInput.max = String(pdfDoc.numPages);
      if (DOM.mobilePageText) DOM.mobilePageText.textContent = `Pág. ${pageNum}/${pdfDoc.numPages}`;
      if (DOM.mobileBtnPage) DOM.mobileBtnPage.disabled = false;

      this.updateBodyMode();
      this.updateZoomUI();
      await this.renderPages(pageNum);

      showToast(
        isFromCache
          ? 'Sessão anterior restaurada com sucesso!'
          : 'Documento carregado e pronto para estudo!',
        'check-circle-2'
      );
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
   * Renderiza as páginas ativas no leitor (Normalizando Páginas Esquerda/Direita ou Rolagem Contínua)
   * @param {number} num
   */
  async renderPages(num) {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) return;

    const totalPages = appState.get('totalPages') || pdfDoc.numPages;

    let targetPage = parseInt(num, 10);
    if (isNaN(targetPage) || targetPage < 1) targetPage = 1;
    if (targetPage > totalPages) targetPage = totalPages;

    // Modo Rolagem Contínua Vertical
    if (appState.isContinuousScrollMode()) {
      return this.renderContinuousPages(targetPage);
    }

    const singlePage = appState.isSinglePageMode();

    // No modo duas páginas (livro aberto), a página da esquerda é SEMPRE ímpar (1, 3, 5...)
    const leftPageNum = singlePage
      ? targetPage
      : (targetPage % 2 === 0 ? targetPage - 1 : targetPage);

    appState.set({ isRendering: true, pageNum: leftPageNum });
    Storage.savePage(appState.get('fileKey'), leftPageNum);

    if (DOM.pageInput) DOM.pageInput.value = String(targetPage);
    if (DOM.btnPrev) DOM.btnPrev.disabled = leftPageNum <= 1;
    if (DOM.mobileBtnPrev) DOM.mobileBtnPrev.disabled = leftPageNum <= 1;
    if (DOM.mobileBtnPage) DOM.mobileBtnPage.disabled = false;

    PdfService.cancelAllPendingRenders();
    if (DOM.pdfViewer) DOM.pdfViewer.innerHTML = '';

    let indicatorText = `${leftPageNum}`;

    if (singlePage) {
      if (DOM.btnNext) DOM.btnNext.disabled = leftPageNum >= totalPages;
      if (DOM.mobileBtnNext) DOM.mobileBtnNext.disabled = leftPageNum >= totalPages;

      // Obtém do buffer pré-renderizado instantâneo (0ms) ou renderiza sob demanda
      const wrapper = await PageBufferService.getOrRenderPage(
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

      // Página da Esquerda (Sempre ímpar: 1, 3, 5, 7...) via PageBufferService
      const wrapperLeft = await PageBufferService.getOrRenderPage(
        leftPageNum,
        false,
        DOM.bookContainer,
        (p, layer) => HighlightService.drawPageHighlights(p, layer),
      );
      if (DOM.pdfViewer) DOM.pdfViewer.appendChild(wrapperLeft);

      // Página da Direita (Sempre par: 2, 4, 6, 8...) via PageBufferService
      if (hasRightPage) {
        const wrapperRight = await PageBufferService.getOrRenderPage(
          rightPageNum,
          false,
          DOM.bookContainer,
          (p, layer) => HighlightService.drawPageHighlights(p, layer),
        );
        if (DOM.pdfViewer) DOM.pdfViewer.appendChild(wrapperRight);
        indicatorText += ` & ${rightPageNum}`;
      }
    }

    // Atualiza o texto do botão mobile
    if (DOM.mobilePageText) {
      DOM.mobilePageText.textContent = `Pág. ${indicatorText}/${totalPages}`;
    }

    // Agenda pré-renderização preditiva em segundo plano das páginas adjacentes
    PageBufferService.prefetchSurroundingPages(
      leftPageNum,
      singlePage,
      DOM.bookContainer,
      (p, layer) => HighlightService.drawPageHighlights(p, layer)
    );

    // Atualiza métricas de leitura e tempo estimado restante
    this.updateReadingMetrics(leftPageNum, totalPages, indicatorText);

    // Atualiza o caderno de anotações e interface de zoom
    NotebookView.render();
    this.updateZoomUI();
    appState.set({ isRendering: false });
  },

  /**
   * Renderiza o modo de Rolagem Contínua Vertical (Continuous Scroll)
   * @param {number} targetPage
   */
  async renderContinuousPages(targetPage) {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) return;

    const totalPages = appState.get('totalPages') || pdfDoc.numPages;
    let pageToFocus = parseInt(targetPage, 10);
    if (isNaN(pageToFocus) || pageToFocus < 1) pageToFocus = 1;
    if (pageToFocus > totalPages) pageToFocus = totalPages;

    appState.set({ isRendering: true, pageNum: pageToFocus });
    Storage.savePage(appState.get('fileKey'), pageToFocus);

    if (DOM.pageInput) DOM.pageInput.value = String(pageToFocus);
    if (DOM.btnPrev) DOM.btnPrev.disabled = pageToFocus <= 1;
    if (DOM.btnNext) DOM.btnNext.disabled = pageToFocus >= totalPages;
    if (DOM.mobileBtnPrev) DOM.mobileBtnPrev.disabled = pageToFocus <= 1;
    if (DOM.mobileBtnNext) DOM.mobileBtnNext.disabled = pageToFocus >= totalPages;

    PdfService.cancelAllPendingRenders();
    if (DOM.pdfViewer) DOM.pdfViewer.innerHTML = '';

    // Renderiza uma janela de leitura ampla em torno da página alvo
    const windowStart = Math.max(1, pageToFocus - 1);
    const windowEnd = Math.min(totalPages, pageToFocus + 5);

    for (let p = windowStart; p <= windowEnd; p++) {
      const wrapper = await PageBufferService.getOrRenderPage(
        p,
        true,
        DOM.bookContainer,
        (pageNum, layer) => HighlightService.drawPageHighlights(pageNum, layer)
      );
      if (DOM.pdfViewer) DOM.pdfViewer.appendChild(wrapper);
    }

    // Posiciona a rolagem na página solicitada
    const targetWrapper = DOM.pdfViewer?.querySelector(`.page-wrapper[data-page="${pageToFocus}"]`);
    if (targetWrapper && DOM.bookContainer) {
      targetWrapper.scrollIntoView({ behavior: 'auto', block: 'start' });
    }

    this.setupContinuousScrollObserver();
    this.updateReadingMetrics(pageToFocus, totalPages, `${pageToFocus}`);

    NotebookView.render();
    this.updateZoomUI();
    appState.set({ isRendering: false });
  },

  /**
   * Observador de interseção para identificar página visível durante a rolagem contínua
   */
  setupContinuousScrollObserver() {
    if (this._scrollObserver) {
      this._scrollObserver.disconnect();
    }

    if (typeof IntersectionObserver === 'undefined') return;

    this._scrollObserver = new IntersectionObserver(
      (entries) => {
        let maxEntry = null;
        for (const entry of entries) {
          if (entry.isIntersecting && (!maxEntry || entry.intersectionRatio > maxEntry.intersectionRatio)) {
            maxEntry = entry;
          }
        }

        if (maxEntry && maxEntry.intersectionRatio > 0.3) {
          const visiblePage = parseInt(maxEntry.target.dataset.page, 10);
          if (visiblePage && visiblePage !== appState.get('pageNum')) {
            appState.set({ pageNum: visiblePage });
            Storage.savePage(appState.get('fileKey'), visiblePage);
            if (DOM.pageInput) DOM.pageInput.value = String(visiblePage);
            if (DOM.mobilePageText) {
              DOM.mobilePageText.textContent = `Pág. ${visiblePage}/${appState.get('totalPages')}`;
            }
            this.updateReadingMetrics(visiblePage, appState.get('totalPages'), `${visiblePage}`);
          }
        }
      },
      {
        root: DOM.bookContainer,
        threshold: [0.3, 0.6, 0.9],
      }
    );

    const wrappers = DOM.pdfViewer?.querySelectorAll('.page-wrapper') || [];
    wrappers.forEach((w) => this._scrollObserver.observe(w));
  },

  /**
   * Calcula ritmo de leitura (segundos/página) e estimativa de tempo restante
   * @param {number} currentPage
   * @param {number} totalPages
   * @param {string} indicatorText
   */
  updateReadingMetrics(currentPage, totalPages, indicatorText = '') {
    const now = Date.now();
    const stats = appState.get('readingStats') || {};
    const startTime = stats.pageStartTime || now;
    const durationSeconds = Math.max(2, Math.min(600, Math.round((now - startTime) / 1000)));

    let pageDurations = stats.pageDurations ? [...stats.pageDurations] : [];
    if (durationSeconds >= 5) {
      pageDurations.push(durationSeconds);
      if (pageDurations.length > 10) pageDurations.shift();
    }

    let avgSeconds = 60;
    if (pageDurations.length > 0) {
      const sum = pageDurations.reduce((a, b) => a + b, 0);
      avgSeconds = Math.round(sum / pageDurations.length);
    }

    const remainingPages = Math.max(0, totalPages - currentPage);
    const estimatedMinutes = Math.max(1, Math.round((remainingPages * avgSeconds) / 60));

    appState.set({
      readingStats: {
        ...stats,
        pageStartTime: now,
        pageDurations,
        estimatedRemainingMinutes: estimatedMinutes,
        pagesReadThisSession: (stats.pagesReadThisSession || 0) + 1,
      },
    });

    // Atualiza a barra linear de progresso (%)
    const progressPercent = totalPages > 0
      ? Math.min(100, Math.max(1, Math.round((currentPage / totalPages) * 100)))
      : 0;

    const progressBar = DOM.readingProgressBar || document.getElementById('reading-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${progressPercent}%`;
    }

    // Indicador discreto com estimativa
    if (DOM.indicator) {
      const label = indicatorText || `${currentPage}`;
      DOM.indicator.textContent = `Pág. ${label} / ${totalPages} (${progressPercent}%) • ~${estimatedMinutes} min restantes ▾`;
      DOM.indicator.style.opacity = '1';
      setTimeout(() => {
        if (appState.get('zoomLevel') <= 1.0 && DOM.indicator) {
          DOM.indicator.style.opacity = '0';
        }
      }, 3500);
    }
  },

  /**
   * Avança para a próxima página com animação
   */
  onNextPage() {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc || appState.get('isRendering')) return;

    if (appState.isContinuousScrollMode()) {
      if (DOM.bookContainer) {
        DOM.bookContainer.scrollBy({ top: DOM.bookContainer.clientHeight * 0.85, behavior: 'smooth' });
      }
      return;
    }

    const single = appState.isSinglePageMode();
    const currentPage = appState.get('pageNum');
    const total = appState.get('totalPages');

    if (currentPage >= total - (single ? 0 : 1)) return;

    appState.set({ isRendering: true });
    const pages = DOM.pdfViewer?.children || [];
    const target = single ? pages[0] : pages.length > 1 ? pages[1] : pages[0];

    if (target && appState.get('zoomLevel') <= 1.0) {
      DOM.pdfViewer?.classList.add('flipping');
      target.classList.add('flip-next');
      setTimeout(() => {
        DOM.pdfViewer?.classList.remove('flipping');
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

    if (appState.isContinuousScrollMode()) {
      if (DOM.bookContainer) {
        DOM.bookContainer.scrollBy({ top: -DOM.bookContainer.clientHeight * 0.85, behavior: 'smooth' });
      }
      return;
    }

    const single = appState.isSinglePageMode();
    const currentPage = appState.get('pageNum');
    if (currentPage <= 1) return;

    appState.set({ isRendering: true });
    const pages = DOM.pdfViewer?.children || [];
    const target = pages[0];

    if (target && appState.get('zoomLevel') <= 1.0) {
      DOM.pdfViewer?.classList.add('flipping');
      target.classList.add('flip-prev');
      setTimeout(() => {
        DOM.pdfViewer?.classList.remove('flipping');
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
   * Define o nível de zoom absoluto preservando o ponto focal
   * @param {number} targetZoom
   * @param {Object} [focalPoint] { clientX, clientY }
   */
  setZoom(targetZoom, focalPoint = null) {
    const current = appState.get('zoomLevel');
    const clamped = Math.max(ZOOM_LIMITS.MIN, Math.min(ZOOM_LIMITS.MAX, targetZoom));
    const newZoom = Math.round(clamped * 100) / 100;
    if (Math.abs(newZoom - current) < 0.005) return;

    const container = DOM.bookContainer;
    const wasSingle = appState.isSinglePageMode();
    PageBufferService.clearAll();
    appState.set({ zoomLevel: newZoom });
    this.updateBodyMode();
    this.updateZoomUI();

    let pageNum = appState.get('pageNum');
    if (wasSingle && !appState.isSinglePageMode() && pageNum % 2 === 0) {
      pageNum -= 1;
    }

    this.renderPages(pageNum).then(() => {
      if (container && newZoom > 1.0) {
        if (focalPoint && typeof focalPoint.clientX === 'number') {
          applyFocalZoom(container, newZoom, current, focalPoint);
        } else {
          const centerX = container.clientWidth / 2;
          const centerY = container.clientHeight / 2;
          applyFocalZoom(container, newZoom, current, {
            clientX: container.getBoundingClientRect().left + centerX,
            clientY: container.getBoundingClientRect().top + centerY,
          });
        }
      }
    });
  },

  /**
   * Altera o nível de zoom relativamente
   * @param {number} delta
   * @param {Object} [focalPoint]
   */
  changeZoom(delta, focalPoint = null) {
    if (delta === null || (focalPoint && focalPoint.reset)) {
      this.setZoom(1.0);
      return;
    }
    const current = appState.get('zoomLevel');
    this.setZoom(current + delta, focalPoint);
  },

  /**
   * Alterna entre modo Ajustar à Largura (Textos) e Ajustar à Página (Imagens/Mangás)
   */
  toggleZoomMode() {
    const currentMode = appState.get('zoomMode') || ZOOM_MODES.FIT_WIDTH;
    const nextMode = currentMode === ZOOM_MODES.FIT_WIDTH ? ZOOM_MODES.FIT_PAGE : ZOOM_MODES.FIT_WIDTH;
    PageBufferService.clearAll();
    appState.set({ zoomMode: nextMode, zoomLevel: 1.0 });
    this.updateBodyMode();
    this.updateZoomUI();
    this.renderPages(appState.get('pageNum'));

    showToast(
      nextMode === ZOOM_MODES.FIT_PAGE
        ? 'Modo: Ajustar à Página (Imagens & Mangás)'
        : 'Modo: Ajustar à Largura (Textos Contínuos)',
      'scaling',
    );
  },

  /**
   * Atualiza a exibição visual de Zoom no Top Bar e no HUD Flutuante
   */
  updateZoomUI() {
    const zoomLevel = appState.get('zoomLevel') || 1.0;
    const zoomMode = appState.get('zoomMode') || ZOOM_MODES.FIT_WIDTH;
    const hasDoc = !!appState.get('pdfDoc');
    const zoomPercent = `${Math.round(zoomLevel * 100)}%`;

    if (DOM.zoomPresetLabel) {
      DOM.zoomPresetLabel.textContent = zoomLevel === 1.0
        ? (zoomMode === ZOOM_MODES.FIT_PAGE ? 'Página' : 'Largura')
        : zoomPercent;
    }
    if (DOM.hudZoomText) {
      DOM.hudZoomText.textContent = zoomLevel === 1.0
        ? (zoomMode === ZOOM_MODES.FIT_PAGE ? 'Pág. Int.' : 'Largura')
        : zoomPercent;
    }

    if (DOM.btnZoomOut) DOM.btnZoomOut.disabled = !hasDoc || zoomLevel <= ZOOM_LIMITS.MIN;
    if (DOM.btnZoomIn) DOM.btnZoomIn.disabled = !hasDoc || zoomLevel >= ZOOM_LIMITS.MAX;
    if (DOM.hudBtnZoomOut) DOM.hudBtnZoomOut.disabled = !hasDoc || zoomLevel <= ZOOM_LIMITS.MIN;
    if (DOM.hudBtnZoomIn) DOM.hudBtnZoomIn.disabled = !hasDoc || zoomLevel >= ZOOM_LIMITS.MAX;
    if (DOM.btnZoomPreset) DOM.btnZoomPreset.disabled = !hasDoc;
  },

  /**
   * Abre a gaveta modal de navegação rápida de páginas
   */
  openPageJumpDialog() {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc || !DOM.pageJumpDialog) return;

    const current = appState.get('pageNum') || 1;
    const total = appState.get('totalPages') || pdfDoc.numPages || 1;
    const percent = Math.min(100, Math.max(1, Math.round((current / total) * 100)));

    if (DOM.pjCurrentNum) DOM.pjCurrentNum.textContent = String(current);
    if (DOM.pjTotalNum) DOM.pjTotalNum.textContent = String(total);
    if (DOM.pjPercent) DOM.pjPercent.textContent = `${percent}%`;

    if (DOM.pjSlider) {
      DOM.pjSlider.min = '1';
      DOM.pjSlider.max = String(total);
      DOM.pjSlider.value = String(current);
    }

    if (DOM.pjNumberInput) {
      DOM.pjNumberInput.min = '1';
      DOM.pjNumberInput.max = String(total);
      DOM.pjNumberInput.value = '';
      DOM.pjNumberInput.placeholder = `1 a ${total}`;
    }

    const historyPage = appState.get('pageJumpHistory');
    if (DOM.btnPjReturn) {
      if (historyPage && historyPage !== current) {
        DOM.btnPjReturn.classList.remove('hidden');
        if (DOM.pjReturnText) DOM.pjReturnText.textContent = `Voltar à pág. ${historyPage}`;
      } else {
        DOM.btnPjReturn.classList.add('hidden');
      }
    }

    if (DOM.btnPjLast && DOM.pjLastText) {
      DOM.pjLastText.textContent = `Fim (${total})`;
    }

    refreshIcons(DOM.pageJumpDialog);
    DOM.pageJumpDialog.showModal();

    setTimeout(() => {
      DOM.pjNumberInput?.focus();
    }, 60);
  },

  /**
   * Fecha a gaveta de salto de páginas
   */
  closePageJumpDialog() {
    if (DOM.pageJumpDialog?.open) {
      DOM.pageJumpDialog.close();
    }
  },

  onPjSliderInput(e) {
    const val = parseInt(e.target.value, 10);
    const total = appState.get('totalPages') || 1;
    if (DOM.pjCurrentNum) DOM.pjCurrentNum.textContent = String(val);
    if (DOM.pjPercent) DOM.pjPercent.textContent = `${Math.min(100, Math.max(1, Math.round((val / total) * 100)))}%`;
  },

  onPjSliderChange(e) {
    const targetPage = parseInt(e.target.value, 10);
    if (!isNaN(targetPage)) {
      this.goToPage(targetPage, true);
    }
  },

  onPjFormSubmit() {
    if (!DOM.pjNumberInput) return;
    const val = parseInt(DOM.pjNumberInput.value, 10);
    if (isNaN(val)) return;
    this.goToPage(val, true);
  },

  /**
   * Navega diretamente para uma página específica
   * @param {number} targetPage
   * @param {boolean} [trackHistory=true]
   */
  goToPage(targetPage, trackHistory = true) {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) return;
    const total = appState.get('totalPages') || pdfDoc.numPages || 1;
    let page = parseInt(targetPage, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (page > total) page = total;

    const currentPage = appState.get('pageNum') || 1;
    if (trackHistory && currentPage !== page) {
      appState.set({ pageJumpHistory: currentPage });
    }

    this.closePageJumpDialog();

    if (!appState.isSinglePageMode() && page % 2 === 0) {
      page -= 1;
    }

    this.renderPages(page);
    showToast(`Página ${page} de ${total}`, 'book-open');
  },

  /**
   * Retorna à página em que o leitor estava antes do último salto
   */
  returnToPreviousPage() {
    const history = appState.get('pageJumpHistory');
    if (history) {
      this.goToPage(history, false);
    }
  },

  /**
   * Trata o clique na barra linear de progresso para salto proporcional rápido
   * @param {MouseEvent} e
   */
  onProgressBarClick(e) {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc || !DOM.readingProgressBarContainer) return;
    const total = appState.get('totalPages') || pdfDoc.numPages || 1;
    const rect = DOM.readingProgressBarContainer.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetPage = Math.max(1, Math.round(ratio * total));
    this.goToPage(targetPage, true);
  },

  updateBodyMode() {
    document.body.classList.toggle('single-page-mode', appState.isSinglePageMode());
    document.body.classList.toggle('zoomed-mode', appState.get('zoomLevel') > 1.0);
    if (DOM.bookContainer) {
      DOM.bookContainer.classList.toggle('continuous-mode', appState.isContinuousScrollMode());
    }
  },

  /**
   * Altera o modo de leitura (Spread / Single / Continuous)
   * @param {string} mode
   */
  setReadingMode(mode) {
    if (!Object.values(READING_MODES).includes(mode)) return;
    appState.set({ readingMode: mode });
    if (DOM.readingModeSelector) {
      DOM.readingModeSelector.value = mode;
    }
    PageBufferService.clearAll();
    this.updateBodyMode();

    let pageNum = appState.get('pageNum') || 1;
    if (mode === READING_MODES.SPREAD && pageNum % 2 === 0) {
      pageNum -= 1;
    }
    this.renderPages(pageNum);

    const labels = {
      [READING_MODES.SPREAD]: 'Modo Livro Aberto (Duas Páginas)',
      [READING_MODES.SINGLE]: 'Modo Página Única Centralizada',
      [READING_MODES.CONTINUOUS]: 'Modo Rolagem Contínua Vertical',
    };
    showToast(labels[mode] || mode, 'book-open');
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
      DOM.pomodoroWidget.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          DOM.pomodoroWidget.click();
        }
      });
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
