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
import { TtsService, scoreVoice } from './services/ttsService.js';
import { NotebookView } from './ui/notebookView.js';
import { QuickHighlightTooltip } from './ui/quickHighlight.js';
import { showToast } from './ui/toast.js';
import { DOM, refreshIcons } from './ui/dom.js';
import { setupKeyboardShortcuts } from './events/keyboard.js';
import { setupMouseEvents, applyFocalZoom } from './events/mouse.js';
import { setupTouchAndGestures } from './events/touch.js';
import { cachePdfDocument, getLastCachedPdf } from './storage/indexedDB.js';
import { EVENTS, ZOOM_LIMITS, ZOOM_MODES, READING_MODES, THEMES } from './constants.js';

export const App = {
  focusTimer: null,
  renderToken: 0,
  indicatorTimer: null,
  continuousObserver: null,
  continuousUnloadObserver: null,
  continuousZoomLevel: null,
  continuousZoomMode: null,
  continuousContainerWidth: 0,
  resizeTimer: null,
  zoomDebounceTimer: null,
  prefetchTimer: null,
  layoutSize: { width: 0, height: 0 },

  /**
   * Inicialização da aplicação
   */
  async init() {
    refreshIcons();
    PdfService.initWorker();

    // Carrega e aplica o tema salvo
    this.applyTheme(Storage.loadTheme(), false);

    // Inicializa componentes de UI
    NotebookView.init({
      onNavigatePage: (pageNum) => this.goToPage(pageNum, true),
    });
    QuickHighlightTooltip.init({
      onReadFromSelection: ({ pageNum, point }) => this.startReadAloud({ pageNum, point }),
    });
    this.initReadAloud();

    // Listener global para navegação direta de página via eventos
    appState.on('NAVIGATE_PAGE', (pageNum) => {
      if (typeof pageNum === 'number' && !isNaN(pageNum)) {
        this.goToPage(pageNum, true);
      }
    });

    this.initEventListeners();
    this.initPomodoro();
    this.updateReadingModeUI();
    window.app = this;

    this.setupResizeHandling();
    this.setupContinuousPageTracking();

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
   * Modo contínuo: define a página atual pela posição de rolagem (linha de referência a 35% da
   * altura visível). O IntersectionObserver sozinho falha com páginas mais altas que a tela.
   */
  setupContinuousPageTracking() {
    const container = DOM.bookContainer;
    if (!container) return;
    let ticking = false;
    container.addEventListener(
      'scroll',
      () => {
        if (ticking || appState.get('readingMode') !== READING_MODES.CONTINUOUS) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          const c = container.getBoundingClientRect();
          const refY = c.top + c.height * 0.35;
          const wrappers = DOM.pdfViewer?.querySelectorAll('.page-wrapper') || [];
          // Busca binária: primeira página cujo rodapé está abaixo da linha de referência
          let lo = 0;
          let hi = wrappers.length - 1;
          let found = -1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (wrappers[mid].getBoundingClientRect().bottom >= refY) {
              found = mid;
              hi = mid - 1;
            } else {
              lo = mid + 1;
            }
          }
          if (found >= 0) {
            const pageNum = parseInt(wrappers[found].dataset.page, 10);
            if (!isNaN(pageNum)) this.onContinuousPageVisible(pageNum);
          }
        });
      },
      { passive: true },
    );
  },

  /**
   * Reajusta as páginas quando a área de leitura muda de tamanho
   * (janela redimensionada, Caderno aberto/fechado, rotação do dispositivo).
   */
  setupResizeHandling() {
    const scheduleRefit = () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        const container = DOM.bookContainer;
        if (!container || !appState.get('pdfDoc')) return;
        if (appState.get('isRendering')) {
          scheduleRefit();
          return;
        }
        const width = container.clientWidth;
        const height = container.clientHeight;
        // Limiar acima da largura de uma barra de rolagem para não entrar em ciclo de re-render
        const widthChanged = Math.abs(width - this.layoutSize.width) > 24;
        // A altura só importa no modo "Ajustar à Página" (evita re-render quando a barra do navegador mobile oculta)
        const heightMatters = appState.get('zoomMode') === ZOOM_MODES.FIT_PAGE;
        const heightChanged = heightMatters && Math.abs(height - this.layoutSize.height) > 40;
        const modeChanged = document.body.classList.contains('single-page-mode') !== appState.isSinglePageMode();
        if (!widthChanged && !heightChanged && !modeChanged) return;

        this.updateBodyMode();
        this.renderPages(appState.get('pageNum'));
      }, 180);
    };

    if (typeof ResizeObserver !== 'undefined' && DOM.bookContainer) {
      new ResizeObserver(scheduleRefit).observe(DOM.bookContainer);
    }
    window.addEventListener('resize', scheduleRefit);
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
        // Permite reabrir o mesmo arquivo logo em seguida
        e.target.value = '';
      });
    }

    if (DOM.btnEmptyOpen) {
      DOM.btnEmptyOpen.onclick = () => DOM.fileInput?.click();
    }
    if (DOM.btnOpenFile) {
      DOM.btnOpenFile.onclick = () => DOM.fileInput?.click();
    }
    if (DOM.btnImportBackup) {
      DOM.btnImportBackup.onclick = () => DOM.importBackupInput?.click();
    }
    if (DOM.btnShortcuts) {
      DOM.btnShortcuts.onclick = () => this.openShortcutsDialog();
    }
    if (DOM.btnEmptyShortcuts) {
      DOM.btnEmptyShortcuts.onclick = () => this.openShortcutsDialog();
    }
    if (DOM.btnCloseShortcuts) {
      DOM.btnCloseShortcuts.onclick = () => DOM.shortcutsDialog?.close();
    }

    // 2. Seletor de Tema & Modo de Leitura
    if (DOM.themeSelector) {
      DOM.themeSelector.addEventListener('change', (e) => {
        this.applyTheme(e.target.value);
      });
    }

    if (DOM.btnThemeCycle) {
      DOM.btnThemeCycle.onclick = () => {
        const order = [THEMES.LIGHT, THEMES.SEPIA, THEMES.DARK];
        const labels = { [THEMES.LIGHT]: 'Tema Claro', [THEMES.SEPIA]: 'Tema Sépia', [THEMES.DARK]: 'Tema Noturno' };
        const current = order.find((t) => document.body.classList.contains(t)) || THEMES.LIGHT;
        const next = order[(order.indexOf(current) + 1) % order.length];
        this.applyTheme(next);
        showToast(labels[next], 'sun-moon');
      };
    }

    if (DOM.btnReadingMode) {
      DOM.btnReadingMode.onclick = () => this.toggleReadingMode();
    }

    // 3. Zoom (Top Bar & Floating HUD)
    if (DOM.btnZoomOut) DOM.btnZoomOut.onclick = () => this.changeZoom(-ZOOM_LIMITS.STEP);
    if (DOM.btnZoomIn) DOM.btnZoomIn.onclick = () => this.changeZoom(ZOOM_LIMITS.STEP);
    if (DOM.btnZoomPreset) DOM.btnZoomPreset.onclick = () => this.toggleZoomMode();

    if (DOM.hudBtnZoomOut) DOM.hudBtnZoomOut.onclick = () => this.changeZoom(-ZOOM_LIMITS.STEP);
    if (DOM.hudBtnZoomIn) DOM.hudBtnZoomIn.onclick = () => this.changeZoom(ZOOM_LIMITS.STEP);
    if (DOM.hudBtnPreset) DOM.hudBtnPreset.onclick = () => this.toggleZoomMode();
    if (DOM.hudBtnFit) DOM.hudBtnFit.onclick = () => this.toggleFocusMode();

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
      onGoToPage: (p) => this.goToPage(p, true),
      onChangeZoom: (delta, opts) => this.changeZoom(delta, opts),
      onResetZoom: () => this.setZoom(1.0),
      onToggleMenu: () => this.toggleFocusMode(),
      onToggleSidebar: () => NotebookView.toggleSidebar(),
      onOpenPageJump: () => this.openPageJumpDialog(),
      onShowShortcuts: () => this.openShortcutsDialog(),
      onEscape: () => this.handleEscape(),
      onToggleReadAloud: () => this.startReadAloud(),
      onTtsSkip: (delta) => TtsService.skip(delta),
      isTtsActive: () => TtsService.isActive(),
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

    // 11. Desfoca botões de interface e overlay após o clique para que o leitor permaneça ativo para navegação
    document.addEventListener('pointerup', (e) => {
      const btn = e.target.closest('button, .file-upload-label');
      if (btn && !btn.closest('dialog')) {
        setTimeout(() => {
          btn.blur();
          DOM.bookContainer?.focus({ preventScroll: true });
        }, 40);
      }
    });
  },

  /**
   * Processa o carregamento de um arquivo PDF a partir de um File do sistema
   * @param {File} file
   */
  async handleFile(file) {
    const isPdf = file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (!isPdf) {
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

    NotebookView.flushPendingSynthesis();
    TtsService.reset();
    appState.set({
      fileName,
      fileKey,
      zoomLevel: 1.0,
      pageJumpHistory: null,
      pageJumpHistoryStack: [],
    });

    if (DOM.fileTitle) {
      DOM.fileTitle.textContent = fileName;
      DOM.fileTitle.title = fileName;
      DOM.fileTitle.style.display = 'block';
    }
    document.title = `${fileName.replace(/\.pdf$/i, '')} · DiveReader`;
    if (DOM.loadingText) DOM.loadingText.textContent = `Abrindo "${fileName}"...`;

    if (DOM.emptyState) DOM.emptyState.style.display = 'none';
    if (DOM.bookContainer) DOM.bookContainer.style.display = 'flex';
    if (DOM.sidebar) DOM.sidebar.style.display = 'flex';

    // Habilita botões e inputs
    [
      DOM.btnZoomOut,
      DOM.btnZoomIn,
      DOM.btnZoomPreset,
      DOM.btnReadingMode,
      DOM.btnToggleSidebar,
      DOM.btnToggleFocus,
      DOM.themeSelector,
      DOM.btnHighlight,
      DOM.pageInput,
      DOM.notepad,
      DOM.mobileBtnHighlight,
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

    if (DOM.zoomHud) DOM.zoomHud.classList.remove('hidden');
    if (DOM.btnReadAloud) DOM.btnReadAloud.disabled = !TtsService.supported;

    if (DOM.loading) DOM.loading.style.display = 'flex';

    try {
      const resolvedKey = await Storage.resolveFileKey(fileName, fileSize, arrayBuffer);
      appState.set({ fileKey: resolvedKey });

      // Persiste no cache IndexedDB com buffer clonado para evitar erro de buffer detached caso o worker o transfira
      if (!isFromCache) {
        const bufferClone = arrayBuffer.slice(0);
        cachePdfDocument(resolvedKey, fileName, fileSize, bufferClone).catch((err) => {
          console.warn('Falha ao salvar no cache IndexedDB:', err);
        });
      }

      const pdfDoc = await PdfService.loadDocument(arrayBuffer);
      const outline = await PdfService.getOutline(pdfDoc);

      const savedPage = Storage.loadPage(resolvedKey);
      const savedHighlights = Storage.loadHighlights(resolvedKey);
      const savedNotes = Storage.loadManualNotes(resolvedKey);
      const savedPrefs = Storage.loadDocPreferences(resolvedKey);

      if (savedPrefs) {
        if (typeof savedPrefs.zoomLevel === 'number') appState.set({ zoomLevel: savedPrefs.zoomLevel });
        if (savedPrefs.zoomMode) appState.set({ zoomMode: savedPrefs.zoomMode });
        if (savedPrefs.readingMode) appState.set({ readingMode: savedPrefs.readingMode });
      }

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

      this.updateReadingModeUI();
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
      const isPassword = error?.name === 'PasswordException';
      showToast(
        isPassword
          ? 'Este PDF é protegido por senha e não pode ser aberto.'
          : 'Não foi possível abrir este PDF. O arquivo pode estar corrompido.',
        'alert-circle',
        4500,
      );
      if (!appState.get('pdfDoc')) {
        if (DOM.emptyState) DOM.emptyState.style.display = 'flex';
        if (DOM.bookContainer) DOM.bookContainer.style.display = 'none';
        if (DOM.zoomHud) DOM.zoomHud.classList.add('hidden');
        document.title = 'DiveReader Pro | O Leitor Definitivo para Estudos';
      }
    } finally {
      if (DOM.loading) DOM.loading.style.display = 'none';
    }
  },

  /**
   * Renderiza as páginas ativas no leitor (Normalizando Páginas Esquerda/Direita ou Modo Contínuo)
   * @param {number} num
   */
  async renderPages(num) {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) return;

    const currentToken = ++this.renderToken;
    if (DOM.bookContainer) {
      this.layoutSize = { width: DOM.bookContainer.clientWidth, height: DOM.bookContainer.clientHeight };
    }
    const totalPages = appState.get('totalPages') || pdfDoc.numPages;
    const isContinuous = appState.get('readingMode') === READING_MODES.CONTINUOUS;
    const singlePage = appState.isSinglePageMode();

    let targetPage = parseInt(num, 10);
    if (isNaN(targetPage) || targetPage < 1) targetPage = 1;
    if (targetPage > totalPages) targetPage = totalPages;

    // No modo duas páginas (livro aberto), a página da esquerda é SEMPRE ímpar (1, 3, 5...)
    const leftPageNum = singlePage
      ? targetPage
      : (targetPage % 2 === 0 ? targetPage - 1 : targetPage);

    appState.set({ isRendering: true, pageNum: leftPageNum });
    Storage.savePage(appState.get('fileKey'), leftPageNum);
    this.saveCurrentPreferences();

    if (DOM.pageInput) DOM.pageInput.value = String(targetPage);
    if (DOM.btnPrev) DOM.btnPrev.disabled = leftPageNum <= 1;
    if (DOM.mobileBtnPrev) DOM.mobileBtnPrev.disabled = leftPageNum <= 1;
    if (DOM.mobileBtnPage) DOM.mobileBtnPage.disabled = false;

    try {
      PdfService.cancelAllPendingRenders();

      if (isContinuous) {
        await this.renderContinuousMode(targetPage, currentToken);
      } else {
        await this.renderPagedMode(leftPageNum, targetPage, totalPages, singlePage, currentToken);
      }
    } catch (err) {
      console.error('Erro na renderização das páginas:', err);
    } finally {
      if (this.renderToken === currentToken) {
        appState.set({ isRendering: false });
      }
    }
  },

  /**
   * Renderização em modo paginado (Página única ou Livro aberto de duas páginas)
   */
  async renderPagedMode(leftPageNum, targetPage, totalPages, singlePage, currentToken) {
    this.continuousZoomLevel = null;
    this.continuousZoomMode = null;
    this.continuousContainerWidth = 0;
    if (this.continuousObserver) {
      this.continuousObserver.disconnect();
      this.continuousObserver = null;
    }
    if (this.continuousUnloadObserver) {
      this.continuousUnloadObserver.disconnect();
      this.continuousUnloadObserver = null;
    }

    let indicatorText = `${leftPageNum}`;
    const buildPromises = [];

    if (singlePage) {
      if (DOM.btnNext) DOM.btnNext.disabled = leftPageNum >= totalPages;
      if (DOM.mobileBtnNext) DOM.mobileBtnNext.disabled = leftPageNum >= totalPages;

      buildPromises.push(
        PdfService.buildPageWrapper(
          leftPageNum,
          true,
          DOM.bookContainer,
          (p, layer) => HighlightService.drawPageHighlights(p, layer),
        ),
      );
    } else {
      const rightPageNum = leftPageNum + 1;
      const hasRightPage = rightPageNum <= totalPages;

      if (DOM.btnNext) DOM.btnNext.disabled = leftPageNum >= totalPages - 1;
      if (DOM.mobileBtnNext) DOM.mobileBtnNext.disabled = leftPageNum >= totalPages - 1;

      // Página da Esquerda (Sempre ímpar: 1, 3, 5, 7...)
      buildPromises.push(
        PdfService.buildPageWrapper(
          leftPageNum,
          false,
          DOM.bookContainer,
          (p, layer) => HighlightService.drawPageHighlights(p, layer),
        ),
      );

      // Página da Direita (Sempre par: 2, 4, 6, 8...)
      if (hasRightPage) {
        buildPromises.push(
          PdfService.buildPageWrapper(
            rightPageNum,
            false,
            DOM.bookContainer,
            (p, layer) => HighlightService.drawPageHighlights(p, layer),
          ),
        );
        indicatorText += ` & ${rightPageNum}`;
      }
    }

    const wrappers = await Promise.all(buildPromises);

    // Descarta se uma renderização mais recente foi solicitada durante os awaits
    if (this.renderToken !== currentToken) return;

    // Troca atômica de conteúdo sem flash/piscada de tela branca
    if (DOM.pdfViewer) {
      DOM.pdfViewer.classList.remove('mode-continuous');
      DOM.pdfViewer.replaceChildren(...wrappers);
    }

    this.updatePageProgressUI(indicatorText, singlePage ? targetPage : Math.min(totalPages, leftPageNum + 1), totalPages);
    NotebookView.render();
    this.updateZoomUI();

    // Leitura em voz alta: acompanha navegação manual e redesenha o destaque da frase
    const visiblePages = singlePage ? [leftPageNum] : [leftPageNum, leftPageNum + 1].filter((p) => p <= totalPages);
    TtsService.handleUserNavigation(visiblePages);
    TtsService.refreshHighlight();

    // Pré-carregamento em background da próxima página para transição imediata
    this.schedulePrefetch(leftPageNum + (singlePage ? 1 : 2), totalPages);
  },

  /**
   * Renderização em modo de rolagem contínua vertical com placeholders virtuais
   */
  async renderContinuousMode(targetPage, currentToken) {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) return;
    const totalPages = appState.get('totalPages') || pdfDoc.numPages;

    if (DOM.btnNext) DOM.btnNext.disabled = targetPage >= totalPages;
    if (DOM.mobileBtnNext) DOM.mobileBtnNext.disabled = targetPage >= totalPages;

    const hadModeClass = DOM.pdfViewer?.classList.contains('mode-continuous');
    if (DOM.pdfViewer && !hadModeClass) {
      DOM.pdfViewer.classList.add('mode-continuous');
    }

    const currentZoom = appState.get('zoomLevel') || 1.0;
    const currentMode = appState.get('zoomMode') || ZOOM_MODES.FIT_WIDTH;
    const container = DOM.bookContainer;
    const containerWidth = container?.clientWidth || 800;

    const existingWrappers = DOM.pdfViewer?.querySelectorAll('.page-wrapper') || [];
    const isContinuousMounted = hadModeClass && existingWrappers.length === totalPages;

    const layoutNeedsUpdate =
      this.continuousZoomLevel !== currentZoom ||
      this.continuousZoomMode !== currentMode ||
      Math.abs(this.continuousContainerWidth - containerWidth) > 8;

    // Se todos os wrappers já estão montados e a escala/tamanho não mudou, apenas rola (navegação pura)
    if (isContinuousMounted && !layoutNeedsUpdate) {
      const targetWrapper = DOM.pdfViewer?.querySelector(`.page-wrapper[data-page="${targetPage}"]`);
      if (targetWrapper) {
        targetWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      TtsService.handleUserNavigation([targetPage]);
      this.updatePageProgressUI(String(targetPage), targetPage, totalPages);
      NotebookView.render();
      this.updateZoomUI();
      return;
    }

    this.continuousZoomLevel = currentZoom;
    this.continuousZoomMode = currentMode;
    this.continuousContainerWidth = containerWidth;

    // Se os wrappers já estão montados e a escala/tamanho mudou, atualiza dimensões e re-renderiza visíveis
    if (isContinuousMounted) {
      const containerRect = container ? container.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const visiblePages = new Set();

      existingWrappers.forEach((wrapper) => {
        const rect = wrapper.getBoundingClientRect();
        if (rect.bottom >= containerRect.top - 200 && rect.top <= containerRect.bottom + 200) {
          visiblePages.add(parseInt(wrapper.dataset.page, 10));
        }
      });

      if (visiblePages.size === 0) {
        visiblePages.add(targetPage);
      }

      const updatePromises = [];
      for (let i = 0; i < existingWrappers.length; i++) {
        const wrapper = existingWrappers[i];
        const pageNum = parseInt(wrapper.dataset.page, 10);
        updatePromises.push(
          (async () => {
            try {
              const page = await pdfDoc.getPage(pageNum);
              const scale = PdfService.getScale(page.getViewport({ scale: 1 }), true, container, currentZoom, currentMode);
              const viewport = page.getViewport({ scale });
              wrapper.style.width = `${viewport.width}px`;
              wrapper.style.height = `${viewport.height}px`;

              if (visiblePages.has(pageNum)) {
                wrapper.replaceChildren();
                wrapper.dataset.rendered = 'false';
                wrapper.classList.remove('page-placeholder');
                await PdfService.populatePageWrapper(
                  wrapper,
                  page,
                  viewport,
                  pageNum,
                  (p, layer) => HighlightService.drawPageHighlights(p, layer),
                );
              } else if (wrapper.dataset.rendered === 'true') {
                wrapper.replaceChildren();
                wrapper.dataset.rendered = 'false';
                wrapper.classList.add('page-placeholder');
              }
            } catch (err) {
              console.warn('Erro ao atualizar página no zoom contínuo:', pageNum, err);
            }
          })()
        );
      }

      await Promise.all(updatePromises);
      if (this.renderToken !== currentToken) return;
      TtsService.refreshHighlight();

      this.updatePageProgressUI(String(targetPage), targetPage, totalPages);
      NotebookView.render();
      this.updateZoomUI();
      return;
    }

    // Primeira montagem do modo contínuo: cria placeholders dimensionados para todas as páginas
    const placeholderPromises = [];
    for (let p = 1; p <= totalPages; p++) {
      placeholderPromises.push(PdfService.buildPageWrapperPlaceholder(p, true, DOM.bookContainer));
    }

    const placeholders = await Promise.all(placeholderPromises);
    if (this.renderToken !== currentToken) return;

    const wrappers = placeholders.map((item) => item.wrapper);
    if (DOM.pdfViewer) {
      DOM.pdfViewer.replaceChildren(...wrappers);
    }

    this.setupContinuousObserver();
    TtsService.refreshHighlight();

    // Rola até a página solicitada na primeira montagem
    const targetWrapper = DOM.pdfViewer?.querySelector(`.page-wrapper[data-page="${targetPage}"]`);
    if (targetWrapper) {
      targetWrapper.scrollIntoView({ behavior: 'auto', block: 'start' });
    }

    this.updatePageProgressUI(String(targetPage), targetPage, totalPages);
    NotebookView.render();
    this.updateZoomUI();
  },

  /**
   * Observador de interseção para carregamento sob demanda de páginas em modo contínuo
   */
  setupContinuousObserver() {
    if (this.continuousObserver) {
      this.continuousObserver.disconnect();
    }
    const container = DOM.bookContainer;
    this.continuousObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(async (entry) => {
          const wrapper = entry.target;
          const pageNum = parseInt(wrapper.dataset.page, 10);

          if (entry.isIntersecting) {
            if (wrapper.dataset.rendered !== 'true') {
              const pdfDoc = appState.get('pdfDoc');
              if (pdfDoc) {
                try {
                  const page = await pdfDoc.getPage(pageNum);
                  const zoomLevel = appState.get('zoomLevel');
                  const scale = PdfService.getScale(
                    page.getViewport({ scale: 1 }),
                    true,
                    container,
                    zoomLevel,
                    appState.get('zoomMode'),
                  );
                  const viewport = page.getViewport({ scale });
                  await PdfService.populatePageWrapper(
                    wrapper,
                    page,
                    viewport,
                    pageNum,
                    (p, layer) => HighlightService.drawPageHighlights(p, layer),
                  );
                  if (TtsService.pageNum === pageNum) TtsService.refreshHighlight();
                } catch (e) {
                  console.warn('Erro ao carregar página contínua:', pageNum, e);
                }
              }
            }

            if (entry.intersectionRatio >= 0.4 || (entry.boundingClientRect.top >= 0 && entry.boundingClientRect.top < window.innerHeight * 0.5)) {
              this.onContinuousPageVisible(pageNum);
            }
          }
        });
      },
      {
        root: container,
        rootMargin: '250px 0px 250px 0px',
        threshold: [0, 0.25, 0.5, 0.75],
      },
    );

    const wrappers = DOM.pdfViewer?.querySelectorAll('.page-wrapper') || [];
    wrappers.forEach((w) => this.continuousObserver.observe(w));

    // Descarrega páginas muito distantes da área visível para limitar o uso de memória em PDFs longos
    if (this.continuousUnloadObserver) this.continuousUnloadObserver.disconnect();
    this.continuousUnloadObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const wrapper = entry.target;
          if (!entry.isIntersecting && wrapper.dataset.rendered === 'true') {
            wrapper.replaceChildren();
            wrapper.dataset.rendered = 'false';
            wrapper.classList.add('page-placeholder');
          }
        });
      },
      { root: container, rootMargin: '2500px 0px 2500px 0px', threshold: 0 },
    );
    wrappers.forEach((w) => this.continuousUnloadObserver.observe(w));
  },

  onContinuousPageVisible(pageNum) {
    const current = appState.get('pageNum');
    if (current === pageNum) return;

    NotebookView.flushPendingSynthesis();
    appState.set({ pageNum });
    Storage.savePage(appState.get('fileKey'), pageNum);
    if (DOM.pageInput) DOM.pageInput.value = String(pageNum);

    const totalPages = appState.get('totalPages') || 1;
    if (DOM.btnPrev) DOM.btnPrev.disabled = pageNum <= 1;
    if (DOM.mobileBtnPrev) DOM.mobileBtnPrev.disabled = pageNum <= 1;
    if (DOM.btnNext) DOM.btnNext.disabled = pageNum >= totalPages;
    if (DOM.mobileBtnNext) DOM.mobileBtnNext.disabled = pageNum >= totalPages;
    this.updatePageProgressUI(String(pageNum), pageNum, totalPages);
    NotebookView.render();
  },

  /**
   * Atualiza a barra linear de progresso e o indicador de leitura com timer seguro
   */
  updatePageProgressUI(indicatorText, currentEffectivePage, totalPages) {
    if (DOM.mobilePageText) {
      DOM.mobilePageText.textContent = `Pág. ${indicatorText}/${totalPages}`;
    }

    const progressPercent = totalPages > 0 ? Math.min(100, Math.max(1, Math.round((currentEffectivePage / totalPages) * 100))) : 0;
    const progressBar = DOM.readingProgressBar || document.getElementById('reading-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${progressPercent}%`;
    }

    clearTimeout(this.indicatorTimer);
    if (DOM.indicator) {
      DOM.indicator.textContent = `Pág. ${indicatorText} / ${totalPages} (${progressPercent}%) ▾`;
      DOM.indicator.classList.add('visible');
      this.indicatorTimer = setTimeout(() => {
        if (appState.get('zoomLevel') <= 1.0 && DOM.indicator) {
          DOM.indicator.classList.remove('visible');
        }
      }, 3000);
    }
  },

  /**
   * Pré-carrega metadados e texto da próxima página no cache de forma ociosa
   */
  schedulePrefetch(nextPageNum, totalPages) {
    clearTimeout(this.prefetchTimer);
    if (nextPageNum > totalPages) return;
    this.prefetchTimer = setTimeout(async () => {
      const pdfDoc = appState.get('pdfDoc');
      if (!pdfDoc) return;
      try {
        const page = await pdfDoc.getPage(nextPageNum);
        await page.getTextContent();
      } catch (e) {}
    }, 350);
  },

  /**
   * Alterna entre modo Paginado (Individual/Livro) e Rolagem Contínua Vertical
   */
  toggleReadingMode() {
    const current = appState.get('readingMode') || READING_MODES.PAGED;
    const next = current === READING_MODES.PAGED ? READING_MODES.CONTINUOUS : READING_MODES.PAGED;
    appState.set({ readingMode: next });
    this.updateReadingModeUI();
    this.updateBodyMode();
    const currentPage = appState.get('pageNum') || 1;
    this.renderPages(currentPage);
    showToast(
      next === READING_MODES.CONTINUOUS
        ? 'Modo: Rolagem Contínua'
        : 'Modo: Páginas Lado a Lado / Individual',
      next === READING_MODES.CONTINUOUS ? 'scroll' : 'book-open',
    );
  },

  updateReadingModeUI() {
    const mode = appState.get('readingMode') || READING_MODES.PAGED;
    const isContinuous = mode === READING_MODES.CONTINUOUS;
    if (DOM.readingModeLabel) {
      DOM.readingModeLabel.textContent = isContinuous ? 'Contínuo' : 'Páginas';
    }
    if (DOM.btnReadingMode) {
      DOM.btnReadingMode.title = isContinuous
        ? 'Modo Atual: Rolagem Contínua (Clique para mudar para Páginas)'
        : 'Modo Atual: Páginas (Clique para mudar para Rolagem Contínua)';
      const icon = DOM.btnReadingMode.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', isContinuous ? 'scroll' : 'book-open');
        refreshIcons(DOM.btnReadingMode);
      }
    }
  },

  saveCurrentPreferences() {
    const fileKey = appState.get('fileKey');
    if (!fileKey) return;
    Storage.saveDocPreferences(fileKey, {
      zoomLevel: appState.get('zoomLevel'),
      zoomMode: appState.get('zoomMode'),
      readingMode: appState.get('readingMode'),
    });
  },

  /**
   * Avança para a próxima página com animação
   */
  onNextPage() {
    NotebookView.flushPendingSynthesis();
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc || appState.get('isRendering')) return;

    const total = appState.get('totalPages');
    const currentPage = appState.get('pageNum');

    if (appState.get('readingMode') === READING_MODES.CONTINUOUS) {
      if (currentPage < total) {
        this.goToPage(currentPage + 1, false);
      }
      return;
    }

    const single = appState.isSinglePageMode();
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
    NotebookView.flushPendingSynthesis();
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc || appState.get('isRendering')) return;

    const currentPage = appState.get('pageNum');
    if (currentPage <= 1) return;

    if (appState.get('readingMode') === READING_MODES.CONTINUOUS) {
      this.goToPage(currentPage - 1, false);
      return;
    }

    const single = appState.isSinglePageMode();
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
    const current = appState.get('zoomLevel') || 1.0;
    const clamped = Math.max(ZOOM_LIMITS.MIN, Math.min(ZOOM_LIMITS.MAX, targetZoom));
    const newZoom = Math.round(clamped * 100) / 100;
    if (Math.abs(newZoom - current) < 0.005) return;

    const container = DOM.bookContainer;
    const wasSingle = appState.isSinglePageMode();

    // Captura o ponto focal antes de esvaziar o container para manter a visão estável
    let targetScrollLeft = 0;
    let targetScrollTop = 0;
    let hasTargetScroll = false;

    if (container && current > 0) {
      const isContinuous = appState.get('readingMode') === READING_MODES.CONTINUOUS;
      const isAtTop = container.scrollTop <= 6;
      const isAtLeft = container.scrollLeft <= 6;
      const hasExplicitFocal = Boolean(
        focalPoint &&
        typeof focalPoint.clientX === 'number' &&
        typeof focalPoint.clientY === 'number'
      );

      if (!hasExplicitFocal && isAtTop) {
        // Se o usuário está no topo do documento e aplica zoom via botão/tecla, mantém visão no topo absoluto
        targetScrollTop = 0;
      } else {
        const rect = container.getBoundingClientRect();
        const focalY = hasExplicitFocal
          ? focalPoint.clientY - rect.top
          : container.clientHeight / 2;
        const scaleRatio = newZoom / current;
        targetScrollTop = Math.max(0, (container.scrollTop + focalY) * scaleRatio - focalY);
      }

      if (!hasExplicitFocal && isAtLeft) {
        targetScrollLeft = 0;
      } else {
        const rect = container.getBoundingClientRect();
        const focalX = hasExplicitFocal
          ? focalPoint.clientX - rect.left
          : container.clientWidth / 2;
        const scaleRatio = newZoom / current;
        targetScrollLeft = Math.max(0, (container.scrollLeft + focalX) * scaleRatio - focalX);
      }

      // No modo paginado (duas páginas ou página única), se o novo zoom for 1.0 ou menor, centraliza
      if (!isContinuous && newZoom <= 1.0) {
        targetScrollLeft = 0;
        targetScrollTop = 0;
      }

      hasTargetScroll = true;
    }

    appState.set({ zoomLevel: newZoom });
    this.saveCurrentPreferences();
    this.updateBodyMode();
    this.updateZoomUI();

    let pageNum = appState.get('pageNum');
    if (wasSingle && !appState.isSinglePageMode() && pageNum % 2 === 0) {
      pageNum -= 1;
    }

    this.renderPages(pageNum).then(() => {
      if (container && hasTargetScroll) {
        const prevBehavior = container.style.scrollBehavior;
        container.style.scrollBehavior = 'auto';
        container.scrollLeft = targetScrollLeft;
        container.scrollTop = targetScrollTop;
        requestAnimationFrame(() => {
          container.style.scrollBehavior = prevBehavior;
        });
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
   * Configura o serviço e o player de leitura em voz alta
   */
  initReadAloud() {
    if (!TtsService.supported) {
      if (DOM.btnReadAloud) {
        DOM.btnReadAloud.title = 'Leitura em voz alta não é suportada neste navegador';
      }
      DOM.btnTtsFromSelection?.remove();
      return;
    }

    TtsService.init({
      getPdfDoc: () => appState.get('pdfDoc'),
      getTotalPages: () => appState.get('totalPages') || 0,
      isPageRendered: (p) => {
        if (appState.get('readingMode') === READING_MODES.CONTINUOUS) return true;
        return Boolean(DOM.pdfViewer?.querySelector(`.page-wrapper[data-page="${p}"]`));
      },
      navigateToPage: (p) => this.goToPage(p, false),
      getScrollContainer: () => DOM.bookContainer,
      onStateChange: (state) => this.updateReadAloudUI(state),
      notify: (msg, icon) => showToast(msg, icon, 4500),
    });

    if (DOM.btnReadAloud) DOM.btnReadAloud.onclick = () => this.startReadAloud();
    if (DOM.ttsBtnPlay) DOM.ttsBtnPlay.onclick = () => TtsService.toggle();
    if (DOM.ttsBtnPrev) DOM.ttsBtnPrev.onclick = () => TtsService.skip(-1);
    if (DOM.ttsBtnNext) DOM.ttsBtnNext.onclick = () => TtsService.skip(1);
    if (DOM.ttsBtnClose) DOM.ttsBtnClose.onclick = () => TtsService.stop();
    if (DOM.ttsRate) {
      DOM.ttsRate.onchange = (e) => TtsService.setRate(parseFloat(e.target.value));
    }
    if (DOM.ttsVoice) {
      DOM.ttsVoice.onchange = (e) => TtsService.setVoice(e.target.value);
    }
    this.updateReadAloudUI(TtsService.getState());
  },

  /**
   * Inicia a leitura (ou pausa/continua se já estiver ativa).
   * Sem ponto explícito, começa na primeira frase visível da página atual.
   * @param {{ pageNum?: number, point?: { x: number, y: number } }} [from]
   */
  startReadAloud(from = {}) {
    if (!TtsService.supported || !appState.get('pdfDoc')) return;

    if (!from.point && TtsService.isActive()) {
      TtsService.toggle();
      return;
    }

    let pageNum = from.pageNum || appState.get('pageNum') || 1;
    let point = from.point || null;

    if (!point) {
      // Começa do trecho visível (útil com zoom ou rolagem dentro da página)
      const container = DOM.bookContainer;
      const wrapper = DOM.pdfViewer?.querySelector(`.page-wrapper[data-page="${pageNum}"]`);
      if (container && wrapper) {
        const c = container.getBoundingClientRect();
        const w = wrapper.getBoundingClientRect();
        if (w.top < c.top && w.height > 0) {
          point = { x: 0, y: Math.min(0.98, (c.top - w.top) / w.height) };
        }
      }
    }

    if (!TtsService.hasPortugueseVoice() && TtsService.voices.length) {
      showToast('Nenhuma voz em português encontrada no sistema. Escolha uma voz no player.', 'alert-circle', 5000);
    }
    TtsService.start({ pageNum, point });
  },

  updateReadAloudUI(state) {
    const active = state.state !== 'idle';
    document.body.classList.toggle('tts-active', active);
    DOM.ttsPlayer?.classList.toggle('hidden', !active);

    if (DOM.btnReadAloud) {
      DOM.btnReadAloud.classList.toggle('btn-active', active);
      DOM.btnReadAloud.setAttribute('aria-pressed', String(active));
    }

    if (DOM.ttsBtnPlay) {
      const isPlaying = state.state === 'playing';
      const label = isPlaying ? 'Pausar' : 'Continuar';
      DOM.ttsBtnPlay.setAttribute('aria-label', label);
      DOM.ttsBtnPlay.title = `${label} (R)`;
      const icon = isPlaying ? 'pause' : 'play';
      if (DOM.ttsBtnPlay.dataset.icon !== icon) {
        DOM.ttsBtnPlay.dataset.icon = icon;
        DOM.ttsBtnPlay.innerHTML = `<i data-lucide="${icon}"></i>`;
        refreshIcons(DOM.ttsBtnPlay);
      }
    }

    if (DOM.ttsStatus) {
      DOM.ttsStatus.textContent = state.sentenceCount
        ? `Pág. ${state.pageNum} · ${state.sentenceIdx + 1}/${state.sentenceCount}`
        : `Pág. ${state.pageNum}`;
    }

    if (DOM.ttsRate) {
      const closest = Array.from(DOM.ttsRate.options).reduce((best, opt) =>
        Math.abs(parseFloat(opt.value) - state.rate) < Math.abs(parseFloat(best.value) - state.rate) ? opt : best,
      );
      DOM.ttsRate.value = closest.value;
    }

    if (DOM.ttsVoice) {
      const voices = TtsService.getVoiceOptions();
      if (DOM.ttsVoice.options.length !== voices.length) {
        DOM.ttsVoice.replaceChildren();
        const pt = document.createElement('optgroup');
        pt.label = 'Português';
        const others = document.createElement('optgroup');
        others.label = 'Outros idiomas';
        voices.forEach((v) => {
          const opt = document.createElement('option');
          opt.value = v.name;
          const isPt = scoreVoice(v) > 0;
          const shortName = v.name
            .replace(/^Microsoft\s+/i, '')
            .replace(/\s+-\s+.*$/, '')
            .replace(/\s+Online\b/i, '')
            .trim();
          opt.textContent = isPt && v.lang.toLowerCase() === 'pt-br' ? shortName : `${shortName} (${v.lang})`;
          opt.title = v.name;
          (isPt ? pt : others).appendChild(opt);
        });
        if (pt.children.length) DOM.ttsVoice.appendChild(pt);
        if (others.children.length) DOM.ttsVoice.appendChild(others);
      }
      if (state.voiceName) DOM.ttsVoice.value = state.voiceName;
    }
  },

  /**
   * Abre o painel de atalhos de teclado
   */
  openShortcutsDialog() {
    if (!DOM.shortcutsDialog || DOM.shortcutsDialog.open) return;
    refreshIcons(DOM.shortcutsDialog);
    DOM.shortcutsDialog.showModal();
  },

  /**
   * Esc: fecha o Caderno ou sai do Modo Foco, nesta ordem
   */
  handleEscape() {
    if (TtsService.isActive()) {
      TtsService.stop();
      return;
    }
    if (appState.get('isSidebarOpen')) {
      NotebookView.toggleSidebar(false);
      DOM.bookContainer?.focus({ preventScroll: true });
      return;
    }
    if (appState.get('isFocusMode')) {
      this.toggleFocusMode();
    }
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
    NotebookView.flushPendingSynthesis();
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) return;
    const total = appState.get('totalPages') || pdfDoc.numPages || 1;
    let page = parseInt(targetPage, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (page > total) page = total;

    const currentPage = appState.get('pageNum') || 1;
    if (trackHistory && currentPage !== page) {
      const stack = [...(appState.get('pageJumpHistoryStack') || [])];
      stack.push(currentPage);
      appState.set({ pageJumpHistory: currentPage, pageJumpHistoryStack: stack });
    }

    this.closePageJumpDialog();

    // renderPages normaliza a página esquerda no modo livro aberto (duas páginas)
    this.renderPages(page);
  },

  /**
   * Retorna à página em que o leitor estava antes do último salto (com suporte a histórico em pilha)
   */
  returnToPreviousPage() {
    const stack = [...(appState.get('pageJumpHistoryStack') || [])];
    if (stack.length > 0) {
      const prev = stack.pop();
      appState.set({
        pageJumpHistory: stack.length > 0 ? stack[stack.length - 1] : null,
        pageJumpHistoryStack: stack,
      });
      this.goToPage(prev, false);
    } else {
      const history = appState.get('pageJumpHistory');
      if (history) {
        this.goToPage(history, false);
      }
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

  /**
   * Aplica o tema preservando as demais classes de estado do <body>
   * @param {string} theme
   * @param {boolean} [persist=true]
   */
  applyTheme(theme, persist = true) {
    const valid = Object.values(THEMES);
    const nextTheme = valid.includes(theme) ? theme : THEMES.LIGHT;
    valid.forEach((t) => document.body.classList.remove(t));
    document.body.classList.add(nextTheme);
    if (DOM.themeSelector) DOM.themeSelector.value = nextTheme;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      const colors = { [THEMES.LIGHT]: '#ffffff', [THEMES.SEPIA]: '#f5edd8', [THEMES.DARK]: '#1e1e24' };
      themeMeta.setAttribute('content', colors[nextTheme]);
    }
    if (persist) Storage.saveTheme(nextTheme);
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
    if (DOM.btnToggleFocus) DOM.btnToggleFocus.setAttribute('aria-pressed', String(isHidden));

    // No mobile, oculta também a barra inferior para liberar 100% da tela
    if (DOM.mobileNavBar) {
      DOM.mobileNavBar.classList.toggle('hidden', isHidden);
    }

    if (isHidden) {
      if (DOM.floatingBar) {
        DOM.floatingBar.classList.add('visible');
        this.wakeFocusBar();
      }
      showToast('Modo Foco ativado — pressione F ou Esc para sair', 'maximize');
    } else if (DOM.floatingBar) {
      DOM.floatingBar.classList.remove('visible', 'faded');
      clearTimeout(this.focusTimer);
      showToast('Modo Foco desativado', 'minimize');
    }

    // Libera o foco do botão de modo foco e foca imediatamente a área de leitura
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
      document.activeElement.blur();
    }
    DOM.bookContainer?.focus({ preventScroll: true });
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
      PomodoroService.playChime();
      if (DOM.pomodoroAlert) {
        DOM.pomodoroAlert.classList.remove('hidden');
        refreshIcons(DOM.pomodoroAlert);
        document.getElementById('btn-alert-break')?.focus();
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

    // Esc fecha o alerta do Pomodoro sem alterar o ciclo
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && DOM.pomodoroAlert && !DOM.pomodoroAlert.classList.contains('hidden')) {
        DOM.pomodoroAlert.classList.add('hidden');
      }
    });

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
