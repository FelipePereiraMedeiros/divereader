/**
 * Gerenciador de Eventos Touch e Gestos Mobile (Pinch-to-Zoom, Swipe e Duplo Toque)
 */

import { appState } from '../state.js';
import { HighlightService } from '../services/highlightService.js';
import { DialogService } from '../ui/dialogs.js';
import { NotebookView } from '../ui/notebookView.js';
import { showToast } from '../ui/toast.js';
import { QuickHighlightTooltip } from '../ui/quickHighlight.js';
import { ZOOM_LIMITS } from '../constants.js';

export function setupTouchAndGestures({ container, onNextPage, onPrevPage, onSetZoom, onChangeZoom }) {
  if (!container) return;

  // Estado de Swipe e Toque Único
  let touchStartX = 0;
  let touchStartY = 0;

  // Estado de Pinch-to-Zoom (Multitoque)
  let isPinching = false;
  let pinchStartDist = 0;
  let pinchStartZoom = 1.0;
  let pinchScaleRatio = 1.0;
  let lastPinchEndTime = 0;

  // Estado de Duplo Toque
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  const getViewer = () => container.querySelector('#pdf-viewer') || container;

  // ==========================================
  // 1. TOUCHSTART: Início do Gesto
  // ==========================================
  container.addEventListener(
    'touchstart',
    (e) => {
      // Ignora se o toque for em componentes de interface flutuantes
      if (e.target.closest('#sidebar') || e.target.closest('dialog') || e.target.closest('#quick-highlight-tooltip')) {
        return;
      }

      // Detecção de Gesto de Pinça (2 Dedos)
      if (e.touches.length === 2) {
        isPinching = true;
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        pinchStartDist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
        pinchStartZoom = appState.get('zoomLevel') || 1.0;
        pinchScaleRatio = 1.0;

        // Oculta tooltips e cancela seleções para evitar artefatos visuais
        QuickHighlightTooltip.hide();
        window.getSelection()?.removeAllRanges();
        return;
      }

      // Toque Único (1 Dedo)
      if (e.touches.length === 1) {
        if (isPinching) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    },
    { passive: true },
  );

  // ==========================================
  // 2. TOUCHMOVE: Rastreamento Contínuo
  // ==========================================
  container.addEventListener(
    'touchmove',
    (e) => {
      // Manipulação em Tempo Real do Pinch-to-Zoom (60fps)
      if (isPinching && e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);

        if (pinchStartDist > 0) {
          pinchScaleRatio = currentDist / pinchStartDist;
          // Limites visuais elásticos durante o gesto
          const clampedRatio = Math.max(0.6, Math.min(3.0, pinchScaleRatio));

          const viewer = getViewer();
          if (viewer) {
            viewer.style.transform = `scale(${clampedRatio})`;
            viewer.style.transformOrigin = 'center center';
            viewer.style.transition = 'none';
          }
        }
      }
    },
    { passive: false },
  );

  // ==========================================
  // 3. TOUCHEND / CANCEL: Finalização de Gestos
  // ==========================================
  const handleTouchEnd = async (e) => {
    if (e.target.closest('#sidebar') || e.target.closest('dialog') || e.target.closest('#quick-highlight-tooltip')) {
      return;
    }

    // Finalização de Pinch-to-Zoom
    if (isPinching) {
      if (e.touches.length < 2) {
        isPinching = false;
        lastPinchEndTime = Date.now();

        // Reseta o transform temporário do viewer
        const viewer = getViewer();
        if (viewer) {
          viewer.style.transform = '';
          viewer.style.transformOrigin = '';
          viewer.style.transition = '';
        }

        // Se a escala mudou significativamente (> 8%), aplica o novo zoom re-renderizando o PDF
        if (Math.abs(pinchScaleRatio - 1.0) > 0.08) {
          const targetZoom = Math.max(
            ZOOM_LIMITS.MIN,
            Math.min(ZOOM_LIMITS.MAX, pinchStartZoom * pinchScaleRatio),
          );

          if (typeof onSetZoom === 'function') {
            onSetZoom(targetZoom);
          } else if (typeof onChangeZoom === 'function') {
            onChangeZoom(targetZoom - pinchStartZoom);
          }
        }

        return;
      }
    }

    // Se um gesto de pinça acabou de ocorrer, ignora swipes e toques residuais
    if (Date.now() - lastPinchEndTime < 450) {
      return;
    }

    // ----------------------------------------------------
    // Swipe Horizontal de Mudança de Página (1 Dedo)
    // ----------------------------------------------------
    if (e.changedTouches.length === 1 && !isPinching) {
      const touch = e.changedTouches[0];
      const touchEndX = touch.clientX;
      const touchEndY = touch.clientY;
      const diffX = touchStartX - touchEndX;
      const diffY = touchStartY - touchEndY;

      // Se houver texto selecionado no momento, preserva a seleção
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) return;

      // Se houver zoom aplicado (> 1.0), permite pan/scroll livre em vez de mudar de página
      const currentZoom = appState.get('zoomLevel') || 1.0;
      if (currentZoom <= 1.0) {
        // Gesto horizontal expressivo (> 50px) e com predominância horizontal
        if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.3) {
          if (diffX > 0) {
            onNextPage(); // Swipe para a esquerda -> Próxima página
          } else {
            onPrevPage(); // Swipe para a direita -> Página anterior
          }
          return;
        }
      }

      // ----------------------------------------------------
      // Duplo Toque para Deletar Grifo
      // ----------------------------------------------------
      const currentTime = Date.now();
      const tapLength = currentTime - lastTapTime;
      const dist = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);

      if (tapLength < 400 && tapLength > 0 && dist < 35) {
        const match = HighlightService.findHighlightAtPoint(touch.clientX, touch.clientY, e.target);
        if (match) {
          if (e.cancelable) e.preventDefault();
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
  };

  container.addEventListener('touchend', handleTouchEnd, { passive: true });
  container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

  // ==========================================
  // 4. DBLCLICK DESKTOP: Deleção de Grifos
  // ==========================================
  container.addEventListener('dblclick', async (e) => {
    if (e.target.closest('#sidebar') || e.target.closest('dialog') || e.target.closest('#quick-highlight-tooltip')) {
      return;
    }

    const match = HighlightService.findHighlightAtPoint(e.clientX, e.clientY, e.target);
    if (!match) return;

    e.preventDefault();
    e.stopPropagation();

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
}
