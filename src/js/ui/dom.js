/**
 * Cache centralizado de referências DOM e utilitários
 */

export const DOM = {
  // Contêineres Principais
  app: document.querySelector('.app-container'),
  topMenu: document.getElementById('top-menu'),
  bookContainer: document.getElementById('book-container'),
  pdfViewer: document.getElementById('pdf-viewer'),
  emptyState: document.getElementById('empty-state'),
  sidebar: document.getElementById('sidebar'),
  loading: document.getElementById('loading-msg'),
  dragOverlay: document.getElementById('drag-overlay'),
  toastContainer: document.getElementById('toast-container'),

  // Elementos do Top Bar
  fileInput: document.getElementById('file-input'),
  fileTitle: document.getElementById('file-title'),
  themeSelector: document.getElementById('theme-selector'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),
  pageInput: document.getElementById('page-input'),
  totalPages: document.getElementById('total-pages'),
  btnHighlight: document.getElementById('btn-highlight'),
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  btnToggleFocus: document.getElementById('btn-toggle-focus'),
  btnExportBackup: document.getElementById('btn-export-backup'),
  importBackupInput: document.getElementById('import-backup-input'),

  // Indicador Discreto, Barra Flutuante & Barra de Progresso
  indicator: document.getElementById('discreet-indicator'),
  floatingBar: document.getElementById('floating-focus-bar'),
  readingProgressBar: document.getElementById('reading-progress-bar'),
  readingProgressBarContainer: document.getElementById('reading-progress-bar-container'),

  // Caderno de Estudos (Sidebar)
  tabBtnPage: document.getElementById('tab-btn-page'),
  tabBtnGlobal: document.getElementById('tab-btn-global'),
  tabBtnToc: document.getElementById('tab-btn-toc'),
  tabPage: document.getElementById('tab-page'),
  tabGlobal: document.getElementById('tab-global'),
  tabToc: document.getElementById('tab-toc'),
  highlightsContainer: document.getElementById('page-highlights-list'),
  notepad: document.getElementById('notepad'),
  globalView: document.getElementById('global-view'),
  tocList: document.getElementById('toc-list'),
  btnCopyGlobal: document.getElementById('btn-copy-global'),
  btnDownloadNotes: document.getElementById('btn-download-notes'),
  btnCloseSidebar: document.getElementById('btn-close-sidebar'),
  notebookSearchInput: document.getElementById('notebook-search-input'),
  btnClearSearch: document.getElementById('btn-clear-search'),
  colorFilterChips: document.getElementById('color-filter-chips'),

  // Pomodoro
  pomodoroContainer: document.getElementById('pomodoro-container'),
  pomodoroWidget: document.getElementById('pomodoro-widget'),
  pomodoroText: document.getElementById('pomodoro-text'),
  pomodoroHand: document.getElementById('clock-hand'),
  pomodoroFace: document.getElementById('clock-face'),
  pomodoroControls: document.getElementById('pomodoro-controls'),
  pomodoroAlert: document.getElementById('pomodoro-alert'),

  // Mobile
  mobileNavBar: document.getElementById('mobile-nav-bar'),
  mobileBtnPrev: document.getElementById('mobile-btn-prev'),
  mobileBtnNext: document.getElementById('mobile-btn-next'),
  mobileBtnPage: document.getElementById('mobile-btn-page'),
  mobilePageText: document.getElementById('mobile-page-text'),
  mobileBtnHighlight: document.getElementById('mobile-btn-highlight'),
  mobileBtnFocus: document.getElementById('mobile-btn-focus'),
  mobileBtnSidebar: document.getElementById('mobile-btn-sidebar'),
  mobileBtnTheme: document.getElementById('mobile-btn-theme'),
  quickHighlightTooltip: document.getElementById('quick-highlight-tooltip'),
  btnQuickHighlight: document.getElementById('btn-quick-highlight'),

  // Zoom Controls & HUD
  btnZoomPreset: document.getElementById('btn-zoom-preset'),
  zoomPresetLabel: document.getElementById('zoom-preset-label'),
  zoomHud: document.getElementById('zoom-hud'),
  hudBtnZoomOut: document.getElementById('hud-btn-zoom-out'),
  hudBtnPreset: document.getElementById('hud-btn-preset'),
  hudZoomText: document.getElementById('hud-zoom-text'),
  hudBtnZoomIn: document.getElementById('hud-btn-zoom-in'),
  hudBtnFit: document.getElementById('hud-btn-fit'),

  // Salto de Página (Page Jump Bottom Sheet)
  pageJumpDialog: document.getElementById('page-jump-dialog'),
  btnClosePageJump: document.getElementById('btn-close-page-jump'),
  pjSlider: document.getElementById('pj-slider'),
  pjCurrentNum: document.getElementById('pj-current-num'),
  pjTotalNum: document.getElementById('pj-total-num'),
  pjPercent: document.getElementById('pj-percent'),
  pjForm: document.getElementById('pj-form'),
  pjNumberInput: document.getElementById('pj-number-input'),
  btnPjGo: document.getElementById('btn-pj-go'),
  btnPjFirst: document.getElementById('btn-pj-first'),
  btnPjReturn: document.getElementById('btn-pj-return'),
  pjReturnText: document.getElementById('pj-return-text'),
  btnPjLast: document.getElementById('btn-pj-last'),
  btnPjToc: document.getElementById('btn-pj-toc'),

  // Diálogo de Confirmação
  confirmDialog: document.getElementById('confirm-dialog'),
};

/**
 * Atualiza os ícones do Lucide em todo o documento ou dentro de um elemento específico
 * @param {HTMLElement} [root]
 */
export function refreshIcons(root) {
  if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons(root ? { root } : undefined);
  }
}
