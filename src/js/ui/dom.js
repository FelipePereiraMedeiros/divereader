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

  // Indicador Discreto & Barra Flutuante
  indicator: document.getElementById('discreet-indicator'),
  floatingBar: document.getElementById('floating-focus-bar'),

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
  mobileBtnHighlight: document.getElementById('mobile-btn-highlight'),
  mobileBtnFocus: document.getElementById('mobile-btn-focus'),
  mobileBtnSidebar: document.getElementById('mobile-btn-sidebar'),
  mobileBtnTheme: document.getElementById('mobile-btn-theme'),
  quickHighlightTooltip: document.getElementById('quick-highlight-tooltip'),
  btnQuickHighlight: document.getElementById('btn-quick-highlight'),

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
