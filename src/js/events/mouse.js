/**
 * Gerenciador de Eventos de Mouse, Roda de Scroll e Drag & Drop
 */

import { appState } from '../state.js';

/**
 * Ajusta scrollLeft e scrollTop do contêiner para manter o ponto sob o cursor estático durante o zoom
 * @param {HTMLElement} container
 * @param {number} newScale
 * @param {number} currentScale
 * @param {{ clientX: number, clientY: number }} focalPoint
 */
export function applyFocalZoom(container, newScale, currentScale, focalPoint) {
  if (!container || !focalPoint || currentScale <= 0) return;

  const rect = container.getBoundingClientRect();
  const mouseX = focalPoint.clientX - rect.left;
  const mouseY = focalPoint.clientY - rect.top;

  const scaleRatio = newScale / currentScale;

  // Ajusta a translação das barras de deslocamento para manter o ponto focal fixo
  container.scrollLeft = (container.scrollLeft + mouseX) * scaleRatio - mouseX;
  container.scrollTop = (container.scrollTop + mouseY) * scaleRatio - mouseY;
}

export function setupMouseEvents({
  container,
  dragOverlay,
  onFileDrop,
  onNextPage,
  onPrevPage,
  onChangeZoom,
}) {
  // Drag & Drop de arquivos PDF
  if (dragOverlay) {
    let dragCounter = 0;

    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      dragOverlay.classList.add('active');
    });

    document.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragOverlay.classList.contains('active')) {
        dragOverlay.classList.add('active');
      }
    });

    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) {
        dragOverlay.classList.remove('active');
      }
    });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dragOverlay.classList.remove('active');
      if (e.dataTransfer?.files?.length > 0) {
        onFileDrop(e.dataTransfer.files[0]);
      }
    });
  }

  // Evento de Scroll com a Roda do Mouse
  if (container) {
    let zoomWheelCD = null;
    let scrollCooldown = false;

    container.addEventListener(
      'wheel',
      (e) => {
        // Ctrl + Wheel = Zoom com Ponto Focal
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (zoomWheelCD) return;
          zoomWheelCD = setTimeout(() => {
            zoomWheelCD = null;
          }, 100);
          onChangeZoom(e.deltaY < 0 ? 0.2 : -0.2, { clientX: e.clientX, clientY: e.clientY });
          return;
        }

        // Se houver zoom aplicado, permite scroll natural
        const zoomLevel = appState.get('zoomLevel');
        if (!appState.get('pdfDoc') || zoomLevel > 1.0) return;

        // Se não houver zoom, scroll vira a página
        e.preventDefault();
        if (!scrollCooldown) {
          scrollCooldown = true;
          setTimeout(() => {
            scrollCooldown = false;
          }, 500);

          if (e.deltaY > 0) {
            onNextPage();
          } else if (e.deltaY < 0) {
            onPrevPage();
          }
        }
      },
      { passive: false },
    );

    // ==========================================
    // Hand Tool / Pan Livre via PointerEvents com setPointerCapture
    // ==========================================
    let isPanning = false;
    let startX = 0;
    let startY = 0;
    let scrollStartX = 0;
    let scrollStartY = 0;

    container.addEventListener('pointerdown', (e) => {
      const zoomLevel = appState.get('zoomLevel') || 1.0;
      if (zoomLevel <= 1.05) return;

      // Não inicia pan se o clique foi em grifos, tooltips ou botões
      if (
        e.target.closest('#sidebar') ||
        e.target.closest('dialog') ||
        e.target.closest('#quick-highlight-tooltip') ||
        e.target.closest('.highlight-rect') ||
        e.target.closest('button') ||
        e.button !== 0 // apenas botão primário
      ) {
        return;
      }

      isPanning = true;
      document.body.classList.add('is-panning');
      startX = e.clientX;
      startY = e.clientY;
      scrollStartX = container.scrollLeft;
      scrollStartY = container.scrollTop;

      try {
        container.setPointerCapture(e.pointerId);
      } catch (err) {}
    });

    container.addEventListener('pointermove', (e) => {
      if (!isPanning) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      container.scrollLeft = scrollStartX - dx;
      container.scrollTop = scrollStartY - dy;
    });

    const stopPanning = (e) => {
      if (isPanning) {
        isPanning = false;
        document.body.classList.remove('is-panning');
        if (e && typeof e.pointerId === 'number') {
          try {
            container.releasePointerCapture(e.pointerId);
          } catch (err) {}
        }
      }
    };

    container.addEventListener('pointerup', stopPanning);
    container.addEventListener('pointercancel', stopPanning);
  }
}
