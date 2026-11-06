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
  onOpenPageJump,
  onShowShortcuts,
  onEscape,
  onToggleReadAloud,
  onTtsSkip,
  isTtsActive,
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
      if (e.key === 'Escape' && activeEl && typeof activeEl.blur === 'function' && !activeEl.closest('dialog')) {
        activeEl.blur();
      }
      return;
    }

    // Diálogos modais tratam o próprio teclado (Esc, Tab, Enter)
    if (document.querySelector('dialog[open]')) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    // Atalhos disponíveis mesmo sem documento aberto
    if (e.key === '?' && typeof onShowShortcuts === 'function') {
      e.preventDefault();
      onShowShortcuts();
      return;
    }

    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) return;

    // Espaço/Enter sobre um botão focado devem acionar o botão (acessibilidade via teclado)
    const isActivatable = activeEl?.closest?.('button, [role="button"], [role="tab"], a, summary, label');
    if ((e.key === ' ' || e.key === 'Enter') && isActivatable) return;

    // Leitura em voz alta ativa: Shift + setas pulam frases
    if (e.shiftKey && typeof isTtsActive === 'function' && isTtsActive() && typeof onTtsSkip === 'function') {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        onTtsSkip(e.key === 'ArrowRight' ? 1 : -1);
        return;
      }
    }

    switch (e.key) {
      case 'r':
      case 'R':
        if (typeof onToggleReadAloud === 'function') {
          e.preventDefault();
          onToggleReadAloud();
        }
        break;

      case 'ArrowLeft':
      case 'PageUp':
      case 'k':
      case 'K':
        e.preventDefault();
        onPrevPage();
        break;

      case 'ArrowRight':
      case 'PageDown':
      case 'j':
      case 'J':
        e.preventDefault();
        onNextPage();
        break;

      case 'g':
      case 'G':
        if (typeof onOpenPageJump === 'function') {
          e.preventDefault();
          onOpenPageJump();
        }
        break;

      case 'Escape':
        if (typeof onEscape === 'function') {
          onEscape();
        }
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
