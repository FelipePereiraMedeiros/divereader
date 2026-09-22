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

  // Estado de Toque Único (1 Dedo - exclusivo para mover/posicionar o texto)
  let touchStartX = 0;
  let touchStartY = 0;

  // Estado de Pinch-to-Zoom (Multitoque / 2 Dedos - incremento de 1 em 1%)
  let isPinching = false;
  let pinchStartDist = 0;
  let pinchStartZoom = 1.0;
  let currentSteppedZoom = 1.0;
  let pinchCenterX = 0;
  let pinchCenterY = 0;
  let pinchOriginX = 0;
  let pinchOriginY = 0;
  let lastPinchEndTime = 0;

  // Estado de Duplo Toque Estacionário
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  const getViewer = () => container.querySelector('#pdf-viewer') || container;

  const updateHUDLive = (zoomVal) => {
    const percent = `${Math.round(zoomVal * 100)}%`;
    const hudText = document.getElementById('hud-zoom-text');
    const presetLabel = document.getElementById('zoom-preset-label');
    const zoomHud = document.getElementById('zoom-hud');
    if (hudText) hudText.textContent = percent;
    if (presetLabel) presetLabel.textContent = percent;
    if (zoomHud) zoomHud.classList.remove('hidden');
  };

  // ==========================================
  // 1. TOUCHSTART: Início do Gesto
  // ==========================================
  container.addEventListener(
    'touchstart',
    (e) => {
      // Ignora se o toque for em componentes de interface flutuantes
      if (e.target.closest('#sidebar') || e.target.closest('dialog') || e.target.closest('#quick-highlight-tooltip') || e.target.closest('#zoom-hud')) {
        return;
      }

      // Detecção de Gesto de Pinça (2 Dedos)
      if (e.touches.length === 2) {
        isPinching = true;
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        pinchStartDist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
        pinchStartZoom = appState.get('zoomLevel') || 1.0;
        currentSteppedZoom = pinchStartZoom;
        pinchCenterX = (touch1.clientX + touch2.clientX) / 2;
        pinchCenterY = (touch1.clientY + touch2.clientY) / 2;

        const viewer = getViewer();
        if (viewer) {
          const rect = viewer.getBoundingClientRect();
          pinchOriginX = pinchCenterX - rect.left;
          pinchOriginY = pinchCenterY - rect.top;
          viewer.style.transformOrigin = `${pinchOriginX}px ${pinchOriginY}px`;
          viewer.style.transition = 'none';
        }

        updateHUDLive(pinchStartZoom);
        QuickHighlightTooltip.hide();
        window.getSelection()?.removeAllRanges();
        return;
      }

      // Toque Único (1 Dedo - reservado apenas para mover/posicionar a página)
      if (e.touches.length === 1) {
        if (isPinching) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    },
    { passive: true },
  );

  // ==========================================
  // 2. TOUCHMOVE: Rastreamento Contínuo (1% por 1%)
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
        pinchCenterX = (touch1.clientX + touch2.clientX) / 2;
        pinchCenterY = (touch1.clientY + touch2.clientY) / 2;

        if (pinchStartDist > 0) {
          const distRatio = currentDist / pinchStartDist;
          // Zoom proporcional contínuo
          const rawZoom = pinchStartZoom * distRatio;
          const clampedZoom = Math.max(ZOOM_LIMITS.MIN, Math.min(ZOOM_LIMITS.MAX, rawZoom));

          // Incrementa de 1 em 1% (passos de 0.01 / 1%)
          const steppedZoom = Math.round(clampedZoom * 100) / 100;
          currentSteppedZoom = steppedZoom;

          // Escala visual estritamente proporcional nos eixos X e Y
          const visualScale = steppedZoom / pinchStartZoom;
          const viewer = getViewer();
          if (viewer) {
            viewer.style.transform = `scale(${visualScale})`;
            viewer.style.transition = 'none';
          }

          // Atualiza HUD em tempo real exibindo a porcentagem exata de 1% em 1%
          updateHUDLive(steppedZoom);
        }
      }
    },
    { passive: false },
  );

  // ==========================================
  // 3. TOUCHEND / CANCEL: Finalização de Gestos
  // ==========================================
  const handleTouchEnd = async (e) => {
    if (e.target.closest('#sidebar') || e.target.closest('dialog') || e.target.closest('#quick-highlight-tooltip') || e.target.closest('#zoom-hud')) {
      return;
    }

    // Finalização de Pinch-to-Zoom: trava o zoom quando o usuário solta os dedos da tela
    if (isPinching) {
      if (e.touches.length < 2) {
        isPinching = false;
        lastPinchEndTime = Date.now();

        // Reseta o transform temporário do viewer antes do re-render limpo
        const viewer = getViewer();
        if (viewer) {
          viewer.style.transform = '';
          viewer.style.transformOrigin = '';
          viewer.style.transition = '';
        }

        // Fixa e aplica o zoom alcançado (se houver variação de pelo menos 1% / 0.005)
        if (currentSteppedZoom && Math.abs(currentSteppedZoom - pinchStartZoom) >= 0.005) {
          if (typeof onSetZoom === 'function') {
            onSetZoom(currentSteppedZoom, { clientX: pinchCenterX, clientY: pinchCenterY });
          } else if (typeof onChangeZoom === 'function') {
            onChangeZoom(currentSteppedZoom - pinchStartZoom);
          }
        }

        return;
      }
    }

    // Se um gesto de pinça acabou de ocorrer, ignora toques residuais
    if (Date.now() - lastPinchEndTime < 450) {
      return;
    }

    // ----------------------------------------------------
    // Toque Único (1 Dedo):
    // 1 dedo SÓ DEVE mover a página para posicionar o texto.
    // O arraste horizontal NÃO deve virar a página.
    // ----------------------------------------------------
    if (e.changedTouches.length === 1 && !isPinching) {
      const touch = e.changedTouches[0];

      // Se houver texto selecionado, não interfere
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) return;

      // ----------------------------------------------------
      // Duplo Toque Estacionário: Deleção de Grifo OU Smart Zoom
      // ----------------------------------------------------
      const currentTime = Date.now();
      const tapLength = currentTime - lastTapTime;
      const dist = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);

      if (lastTapTime > 0 && tapLength <= 400 && tapLength >= 0 && dist < 35) {
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
          // SMART DOUBLE-TAP ZOOM (Estilo Kindle / Acrobat Reader)
          if (e.cancelable) e.preventDefault();
          const currentZoom = appState.get('zoomLevel') || 1.0;
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
          lastTapTime = 0;
          return;
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
