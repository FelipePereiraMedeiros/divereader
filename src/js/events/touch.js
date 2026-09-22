/**
 * Gerenciador de Eventos Touch e Gestos Mobile (Pinch-to-Zoom, Pan e Swipe)
 */

import { appState } from '../state.js';
import { HighlightService } from '../services/highlightService.js';
import { DialogService } from '../ui/dialogs.js';
import { NotebookView } from '../ui/notebookView.js';
import { showToast } from '../ui/toast.js';
import { QuickHighlightTooltip } from '../ui/quickHighlight.js';
import { DOM } from '../ui/dom.js';
import { ZOOM_LIMITS } from '../constants.js';

export function setupTouchAndGestures({ container, onNextPage, onPrevPage, onSetZoom, onChangeZoom }) {
  if (!container) return;

  // Estado de Swipe e Toque Único (Pan)
  let touchStartX = 0;
  let touchStartY = 0;
  let panStartX = 0;
  let panStartY = 0;
  let panStartScrollLeft = 0;
  let panStartScrollTop = 0;
  let isSingleFingerPanning = false;

  // Estado de Pinch-to-Zoom (Multitoque)
  let isPinching = false;
  let pinchStartDist = 0;
  let pinchStartZoom = 1.0;
  let currentPinchZoom = 1.0;
  let pinchCenterX = 0;
  let pinchCenterY = 0;
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
      if (
        e.target.closest('#sidebar') ||
        e.target.closest('dialog') ||
        e.target.closest('#quick-highlight-tooltip') ||
        e.target.closest('#zoom-hud')
      ) {
        return;
      }

      // Detecção de Gesto de Pinça (2 Dedos)
      if (e.touches.length === 2) {
        isPinching = true;
        isSingleFingerPanning = false;
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        pinchStartDist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
        pinchStartZoom = appState.get('zoomLevel') || 1.0;
        currentPinchZoom = pinchStartZoom;
        pinchCenterX = (touch1.clientX + touch2.clientX) / 2;
        pinchCenterY = (touch1.clientY + touch2.clientY) / 2;

        // Fixa a origem de transformação no início da pinça para eliminar tremores dinâmicos
        const viewer = getViewer();
        if (viewer) {
          const viewerRect = viewer.getBoundingClientRect();
          const originX = pinchCenterX - viewerRect.left;
          const originY = pinchCenterY - viewerRect.top;
          viewer.style.transformOrigin = `${originX}px ${originY}px`;
        }

        // Oculta tooltips e cancela seleções para evitar artefatos visuais
        QuickHighlightTooltip.hide();
        window.getSelection()?.removeAllRanges();
        return;
      }

      // Toque Único (1 Dedo)
      if (e.touches.length === 1) {
        if (isPinching) return;
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        panStartX = touch.clientX;
        panStartY = touch.clientY;
        panStartScrollLeft = container.scrollLeft;
        panStartScrollTop = container.scrollTop;

        // Ativa pan com 1 dedo se o documento estiver com zoom aplicado
        const currentZoom = appState.get('zoomLevel') || 1.0;
        isSingleFingerPanning = currentZoom > 1.01;
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
      // 2.1 Pinch-to-Zoom (2 Dedos): Variação proporcional de 1 em 1 por cento
      if (isPinching && e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
        pinchCenterX = (touch1.clientX + touch2.clientX) / 2;
        pinchCenterY = (touch1.clientY + touch2.clientY) / 2;

        if (pinchStartDist > 0) {
          const ratio = currentDist / pinchStartDist;
          const rawZoom = Math.max(ZOOM_LIMITS.MIN, Math.min(ZOOM_LIMITS.MAX, pinchStartZoom * ratio));

          // Incrementa/decrementa estritamente de 1 em 1 por cento
          const percent = Math.round(rawZoom * 100);
          currentPinchZoom = percent / 100;

          // Escala visual suave proporcional 1:1 (largura e altura idênticas, sem distorção)
          const visualRatio = currentPinchZoom / pinchStartZoom;
          const viewer = getViewer();
          if (viewer) {
            viewer.style.transform = `scale(${visualRatio})`;
            viewer.style.transition = 'none';
          }

          // Atualização em tempo real do indicador de zoom
          if (DOM.hudZoomText) DOM.hudZoomText.textContent = `${percent}%`;
          if (DOM.zoomPresetLabel) DOM.zoomPresetLabel.textContent = `${percent}%`;
        }
        return;
      }

      // 2.2 Movimento da Visão da Página com Dedo Único (Pan)
      if (!isPinching && e.touches.length === 1 && isSingleFingerPanning) {
        const touch = e.touches[0];
        const dx = touch.clientX - panStartX;
        const dy = touch.clientY - panStartY;

        // Movimenta a visão do container proporcionalmente ao arrasto
        container.scrollLeft = panStartScrollLeft - dx;
        container.scrollTop = panStartScrollTop - dy;

        if (e.cancelable && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          e.preventDefault();
        }
      }
    },
    { passive: false },
  );

  // ==========================================
  // 3. TOUCHEND / CANCEL: Finalização de Gestos
  // ==========================================
  const handleTouchEnd = async (e) => {
    if (
      e.target.closest('#sidebar') ||
      e.target.closest('dialog') ||
      e.target.closest('#quick-highlight-tooltip') ||
      e.target.closest('#zoom-hud')
    ) {
      return;
    }

    // 3.1 Finalização do Pinch-to-Zoom: Para e fixa no zoom exato
    if (isPinching) {
      if (e.touches.length < 2) {
        isPinching = false;
        lastPinchEndTime = Date.now();

        const viewer = getViewer();
        if (viewer) {
          viewer.style.transform = '';
          viewer.style.transformOrigin = '';
          viewer.style.transition = '';
        }

        // Aplica o zoom com resolução exata de 1%
        const finalZoom = Math.max(
          ZOOM_LIMITS.MIN,
          Math.min(ZOOM_LIMITS.MAX, Math.round(currentPinchZoom * 100) / 100),
        );

        if (Math.abs(finalZoom - pinchStartZoom) >= 0.005) {
          if (typeof onSetZoom === 'function') {
            onSetZoom(finalZoom, { clientX: pinchCenterX, clientY: pinchCenterY });
          } else if (typeof onChangeZoom === 'function') {
            onChangeZoom(finalZoom - pinchStartZoom);
          }
        }
        return;
      }
    }

    if (isSingleFingerPanning) {
      isSingleFingerPanning = false;
    }

    // Se um gesto de pinça acabou de ocorrer, ignora swipes e toques residuais
    if (Date.now() - lastPinchEndTime < 450) {
      return;
    }

    // ----------------------------------------------------
    // Swipe Horizontal de Mudança de Página (1 Dedo quando Zoom <= 1.05)
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

      const currentZoom = appState.get('zoomLevel') || 1.0;
      if (currentZoom <= 1.05) {
        // Gesto horizontal expressivo (> 70px) e com forte predominância horizontal (2.0x)
        if (Math.abs(diffX) > 70 && Math.abs(diffX) > Math.abs(diffY) * 2.0) {
          if (diffX > 0) {
            onNextPage(); // Swipe para a esquerda -> Próxima página
          } else {
            onPrevPage(); // Swipe para a direita -> Página anterior
          }
          return;
        }
      }

      // ----------------------------------------------------
      // Duplo Toque: Deleção de Grifo OU Smart Zoom
      // ----------------------------------------------------
      const currentTime = Date.now();
      const tapLength = currentTime - lastTapTime;
      const dist = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);

      const hasActiveSelection = selection && selection.toString().trim().length > 0;

      if (!hasActiveSelection && lastTapTime > 0 && tapLength <= 350 && tapLength >= 0 && dist < 30) {
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
        } else {
          // Apenas aplica zoom inteligente se o toque NÃO foi sobre nós de texto selecionáveis
          const elementUnderTouch = typeof document.elementFromPoint === 'function'
            ? document.elementFromPoint(touch.clientX, touch.clientY)
            : null;
          const isTextSpan = elementUnderTouch?.closest('.textLayer') || e.target?.closest('.textLayer');

          if (!isTextSpan) {
            if (e.cancelable) e.preventDefault();
            if (currentZoom <= 1.05) {
              if (typeof onSetZoom === 'function') {
                onSetZoom(1.8, { clientX: touch.clientX, clientY: touch.clientY });
                showToast('Zoom Inteligente (1.8x)', 'zoom-in');
              }
            } else {
              if (typeof onSetZoom === 'function') {
                onSetZoom(1.0);
                showToast('Ajustado à tela', 'minimize-2');
              }
            }
          }
        }
        lastTapTime = 0;
        return;
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
