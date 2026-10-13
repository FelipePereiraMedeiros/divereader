/**
 * Gerenciador de Eventos de Teclado e Atalhos
 */

import { appState } from '../state.js';
import { showToast } from '../ui/toast.js';

/**
 * Alterna o modo do cursor entre Seleção de Texto e Mãozinha (Scroll / Pan)
 */
export function toggleCursorMode() {
  const currentMode = appState.get('cursorMode') || 'select';
  const nextMode = currentMode === 'hand' ? 'select' : 'hand';
  appState.set({ cursorMode: nextMode });

  const isHand = nextMode === 'hand';
  document.body.classList.toggle('hand-tool-active', isHand);
  document.body.classList.toggle('space-hand-tool', isHand);

  if (isHand) {
    showToast('Modo Scroll / Mãozinha ativado', 'hand');
  } else {
    showToast('Modo Seleção de Texto ativado', 'mouse-pointer-click');
  }
}

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

    // 2. Previne disparos APENAS quando o usuário estiver digitando em campos de texto editáveis
    const activeEl = document.activeElement;
    const activeTag = activeEl?.tagName;
    const isTextInput =
      activeTag === 'TEXTAREA' ||
      activeTag === 'SELECT' ||
      (activeTag === 'INPUT' && !['button', 'submit', 'checkbox', 'radio', 'range'].includes(activeEl.type)) ||
      activeEl?.isContentEditable;

    if (isTextInput) {
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
        e.preventDefault();
        onNextPage();
        break;

      case ' ': // Barra de espaço: alterna o modo do cursor entre Seleção de Texto e Scroll (Mãozinha)
        e.preventDefault();
        if (!e.repeat) {
          toggleCursorMode();
        }
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
