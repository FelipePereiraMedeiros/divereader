/**
 * Gerenciador de Eventos de Mouse, Roda de Scroll e Drag & Drop
 */

import { appState } from '../state.js';

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
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
      dragOverlay.classList.add('active');
    });

    document.addEventListener('dragleave', (e) => {
      if (e.clientX === 0 || e.clientY === 0) {
        dragOverlay.classList.remove('active');
      }
    });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
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
        // Ctrl + Wheel = Zoom
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (zoomWheelCD) return;
          zoomWheelCD = setTimeout(() => {
            zoomWheelCD = null;
          }, 100);
          onChangeZoom(e.deltaY < 0 ? 0.25 : -0.25);
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
  }
}
