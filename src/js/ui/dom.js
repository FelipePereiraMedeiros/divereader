/**
 * Cache centralizado de referências DOM e utilitários
 */

const SELECTOR_MAP = {
  // Contêineres Principais
  app: '.app-container',
  topMenu: 'top-menu',
  bookContainer: 'book-container',
  pdfViewer: 'pdf-viewer',
  emptyState: 'empty-state',
  btnEmptyOpen: 'btn-empty-open',
  sidebar: 'sidebar',
  loading: 'loading-msg',
  dragOverlay: 'drag-overlay',
  toastContainer: 'toast-container',

  // Elementos do Top Bar
  fileInput: 'file-input',
  fileTitle: 'file-title',
  themeSelector: 'theme-selector',
  btnZoomOut: 'btn-zoom-out',
  btnZoomIn: 'btn-zoom-in',
  btnPrev: 'btn-prev',
  btnNext: 'btn-next',
  pageInput: 'page-input',
  totalPages: 'total-pages',
  btnHighlight: 'btn-highlight',
  btnToggleSidebar: 'btn-toggle-sidebar',
  btnToggleFocus: 'btn-toggle-focus',
  btnExportBackup: 'btn-export-backup',
  importBackupInput: 'import-backup-input',

  // Indicador Discreto, Barra Flutuante & Barra de Progresso
  indicator: 'discreet-indicator',
  floatingBar: 'floating-focus-bar',
  btnFocusSidebar: 'btn-focus-sidebar',
  btnFocusHighlight: 'btn-focus-highlight',
  btnFocusToggle: 'btn-focus-toggle',
  readingProgressBar: 'reading-progress-bar',
  readingProgressBarContainer: 'reading-progress-bar-container',

  // Caderno de Estudos (Sidebar)
  tabBtnPage: 'tab-btn-page',
  tabBtnGlobal: 'tab-btn-global',
  tabBtnToc: 'tab-btn-toc',
  tabPage: 'tab-page',
  tabGlobal: 'tab-global',
  tabToc: 'tab-toc',
  highlightsContainer: 'page-highlights-list',
  notepad: 'notepad',
  globalView: 'global-view',
  tocList: 'toc-list',
  btnCopyGlobal: 'btn-copy-global',
  btnDownloadNotes: 'btn-download-notes',
  btnCloseSidebar: 'btn-close-sidebar',
  notebookSearchInput: 'notebook-search-input',
  btnClearSearch: 'btn-clear-search',
  colorFilterChips: 'color-filter-chips',

  // Pomodoro
  pomodoroContainer: 'pomodoro-container',
  pomodoroWidget: 'pomodoro-widget',
  pomodoroText: 'pomodoro-text',
  pomodoroHand: 'clock-hand',
  pomodoroFace: 'clock-face',
  pomodoroControls: 'pomodoro-controls',
  pomodoroAlert: 'pomodoro-alert',

  // Mobile
  mobileNavBar: 'mobile-nav-bar',
  mobileBtnPrev: 'mobile-btn-prev',
  mobileBtnNext: 'mobile-btn-next',
  mobileBtnPage: 'mobile-btn-page',
  mobilePageText: 'mobile-page-text',
  mobileBtnHighlight: 'mobile-btn-highlight',
  mobileBtnFocus: 'mobile-btn-focus',
  mobileBtnSidebar: 'mobile-btn-sidebar',
  quickHighlightTooltip: 'quick-highlight-tooltip',

  // Zoom Controls & HUD
  btnZoomPreset: 'btn-zoom-preset',
  zoomPresetLabel: 'zoom-preset-label',
  zoomHud: 'zoom-hud',
  hudBtnZoomOut: 'hud-btn-zoom-out',
  hudBtnPreset: 'hud-btn-preset',
  hudZoomText: 'hud-zoom-text',
  hudBtnZoomIn: 'hud-btn-zoom-in',
  hudBtnFit: 'hud-btn-fit',

  // Salto de Página (Page Jump Bottom Sheet)
  pageJumpDialog: 'page-jump-dialog',
  btnClosePageJump: 'btn-close-page-jump',
  pjSlider: 'pj-slider',
  pjCurrentNum: 'pj-current-num',
  pjTotalNum: 'pj-total-num',
  pjPercent: 'pj-percent',
  pjForm: 'pj-form',
  pjNumberInput: 'pj-number-input',
  btnPjGo: 'btn-pj-go',
  btnPjFirst: 'btn-pj-first',
  btnPjReturn: 'btn-pj-return',
  pjReturnText: 'pj-return-text',
  btnPjLast: 'btn-pj-last',
  btnPjToc: 'btn-pj-toc',

  // Diálogo de Confirmação
  confirmDialog: 'confirm-dialog',
};

const overrides = new Map();

/**
 * Proxy dinâmico que busca elementos sob demanda e suporta atribuição em testes
 */
export const DOM = new Proxy(SELECTOR_MAP, {
  get(target, prop) {
    if (overrides.has(prop)) {
      return overrides.get(prop);
    }
    const selectorOrId = target[prop];
    if (!selectorOrId || typeof document === 'undefined') return null;
    if (selectorOrId.startsWith('.')) {
      return document.querySelector(selectorOrId);
    }
    return document.getElementById(selectorOrId);
  },
  set(target, prop, value) {
    overrides.set(prop, value);
    return true;
  },
  has(target, prop) {
    return prop in target || overrides.has(prop);
  },
});

/**
 * Atualiza os ícones do Lucide em todo o documento ou dentro de um elemento específico
 * @param {HTMLElement} [root]
 */
export function refreshIcons(root) {
  if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons(root ? { root } : undefined);
  }
}
