/**
 * Gerenciador de Eventos de Teclado e Atalhos
 */

import { appState } from '../state.js';

export function setupKeyboardShortcuts({
  onNextPage,
  onPrevPage,
  onGoToPage,
  onChangeZoom,
  onResetZoom,
  onToggleMenu,
  onToggleSidebar,
}) {
  document.addEventListener('keydown', (e) => {
    // 1. Zoom via teclado (Ctrl/Cmd + [+] / [-] / [0])
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
        e.preventDefault();
        onChangeZoom(0.25);
        return;
      }
      if (e.key === '-' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        onChangeZoom(-0.25);
        return;
      }
      if (e.key === '0' || e.code === 'Numpad0') {
        e.preventDefault();
        if (typeof onResetZoom === 'function') {
          onResetZoom();
        } else {
          onChangeZoom(null, { reset: true });
        }
        return;
      }
    }

    // 2. Previne disparos quando o usuário edita notas, inputs, botões ou elementos com role=button
    const activeEl = document.activeElement;
    const activeTag = activeEl?.tagName;
    if (
      ['TEXTAREA', 'INPUT', 'BUTTON', 'SELECT'].includes(activeTag) ||
      activeEl?.isContentEditable ||
      activeEl?.getAttribute('role') === 'button'
    ) {
      return;
    }

    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) return;

    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
      case 'j':
      case 'J':
        e.preventDefault();
        onPrevPage();
        break;

      case 'ArrowRight':
      case 'PageDown':
      case 'k':
      case 'K':
      case ' ': // Barra de espaço avança página (padrão PDF readers)
        e.preventDefault();
        onNextPage();
        break;

      case 'Home':
        e.preventDefault();
        if (typeof onGoToPage === 'function') {
          onGoToPage(1);
        } else {
          appState.emit('NAVIGATE_PAGE', 1);
        }
        break;

      case 'End':
        e.preventDefault();
        if (typeof onGoToPage === 'function') {
          onGoToPage(pdfDoc.numPages);
        } else {
          appState.emit('NAVIGATE_PAGE', pdfDoc.numPages);
        }
        break;

      case 'f':
      case 'F':
        e.preventDefault();
        onToggleMenu();
        break;

      case 'c':
      case 'C':
        e.preventDefault();
        onToggleSidebar();
        break;
    }
  });
}
