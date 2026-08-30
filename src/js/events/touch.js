/**
 * Gerenciador de Eventos Touch e Gestos Mobile (Swipe e Duplo Toque)
 */

import { appState } from '../state.js';
import { HighlightService } from '../services/highlightService.js';
import { DialogService } from '../ui/dialogs.js';
import { NotebookView } from '../ui/notebookView.js';
import { showToast } from '../ui/toast.js';
import { QuickHighlightTooltip } from '../ui/quickHighlight.js';

export function setupTouchAndGestures({ container, onNextPage, onPrevPage }) {
  if (!container) return;

  let touchStartX = 0;
  let touchStartY = 0;

  container.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    },
    { passive: true },
  );

  container.addEventListener(
    'touchend',
    (e) => {
      // Ignora se o toque for dentro da barra lateral, modal ou tooltip
      if (e.target.closest('#sidebar') || e.target.closest('dialog') || e.target.closest('#quick-highlight-tooltip')) {
        return;
      }

      if (e.changedTouches.length === 1) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;

        // Se houver texto selecionado no momento, não vira a página
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) return;

        // Se o gesto horizontal for expressivo (> 55px) e maior que o vertical
        if (Math.abs(diffX) > 55 && Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX > 0) {
            onNextPage(); // Deslizar para a esquerda -> Próxima página
          } else {
            onPrevPage(); // Deslizar para a direita -> Página anterior
          }
        }
      }
    },
    { passive: true },
  );

  // Deleção de Grifos por Duplo Clique no Leitor
  container.addEventListener('dblclick', async (e) => {
    if (e.target.closest('#sidebar') || e.target.closest('dialog') || e.target.closest('#quick-highlight-tooltip')) {
      return;
    }

    const match = HighlightService.findHighlightAtPoint(e.clientX, e.clientY, e.target);
    if (!match) return;

    e.preventDefault();
    e.stopPropagation();

    // Fecha o tooltip rápido de grifar e desfaz seleção nativa de texto do duplo clique
    QuickHighlightTooltip.hide();
    window.getSelection()?.removeAllRanges();

    const { highlight, pageNum, highlightId } = match;

    const choice = await DialogService.confirmHighlightDeletion({
      title: 'Remover Grifo do Documento',
      message: 'Você deseja excluir este grifo?',
      quoteText: highlight.text,
      hasNote: !!(highlight.note && highlight.note.trim()),
      primaryActionText: 'Excluir do PDF e do Caderno',
      secondaryActionText: 'Remover do PDF, mas manter citação no Caderno',
    });

    if (choice === 'delete-all' || choice === 'delete-one') {
      HighlightService.deleteHighlight(pageNum, highlightId);
      NotebookView.render();
      showToast('Grifo removido da página.', 'eraser');
    }
  });

  // Duplo toque no mobile para grifos
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  container.addEventListener('touchend', async (e) => {
    if (e.target.closest('#sidebar') || e.target.closest('dialog') || e.target.closest('#quick-highlight-tooltip')) {
      return;
    }

    const currentTime = Date.now();
    const tapLength = currentTime - lastTapTime;

    if (e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      const dist = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);

      if (tapLength < 400 && tapLength > 0 && dist < 35) {
        const match = HighlightService.findHighlightAtPoint(touch.clientX, touch.clientY, e.target);
        if (match) {
          e.preventDefault();
          e.stopPropagation();

          QuickHighlightTooltip.hide();
          window.getSelection()?.removeAllRanges();

          const { highlight, pageNum, highlightId } = match;

          const choice = await DialogService.confirmHighlightDeletion({
            title: 'Remover Grifo',
            message: 'Deseja excluir este grifo?',
            quoteText: highlight.text,
            hasNote: !!(highlight.note && highlight.note.trim()),
            primaryActionText: 'Excluir do PDF e Caderno',
            secondaryActionText: 'Remover apenas do PDF',
          });

          if (choice === 'delete-all' || choice === 'delete-one') {
            HighlightService.deleteHighlight(pageNum, highlightId);
            NotebookView.render();
            showToast('Grifo removido.', 'eraser');
          }
        }
      }

      lastTapTime = currentTime;
      lastTapX = touch.clientX;
      lastTapY = touch.clientY;
    }
  });
}
