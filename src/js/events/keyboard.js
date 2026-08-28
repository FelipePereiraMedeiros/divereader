/**
 * Gerenciador de Eventos de Teclado e Atalhos
 */

import { appState } from '../state.js';

export function setupKeyboardShortcuts({ onNextPage, onPrevPage, onChangeZoom, onToggleMenu, onToggleSidebar }) {
  document.addEventListener('keydown', (e) => {
    // Zoom com atalhos de teclado (Ctrl + / Ctrl -)
    if (e.ctrlKey || e.metaKey) {
      if (['+', '=', '-'].includes(e.key)) {
        e.preventDefault();
        onChangeZoom(e.key === '-' ? -0.25 : 0.25);
        return;
      }
    }

    // Se estiver digitando em campo de texto, não dispara atalhos de navegação
    if (['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) {
      return;
    }

    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onPrevPage();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onNextPage();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      onToggleMenu();
    } else if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      onToggleSidebar();
    }
  });
}
