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

        // Se estiver em modo contínuo, permite scroll natural completo
        if (appState.get('readingMode') === 'continuous') {
          return;
        }

        // Se houver zoom aplicado, permite scroll natural
        const zoomLevel = appState.get('zoomLevel') || 1.0;
        if (!appState.get('pdfDoc') || zoomLevel > 1.0) return;

        // Verifica se a página é mais alta que o contêiner (ex: modo Ajustar à Largura)
        const hasVerticalOverflow = container.scrollHeight > container.clientHeight + 4;
        if (hasVerticalOverflow) {
          const atBottom = Math.ceil(container.scrollTop + container.clientHeight) >= container.scrollHeight - 2;
          const atTop = container.scrollTop <= 0;

          // Se estiver rolando dentro da página, permite rolagem vertical natural
          if ((e.deltaY > 0 && !atBottom) || (e.deltaY < 0 && !atTop)) {
            return;
          }
        }

        // Se chegou na borda ou não há scroll vertical, scroll vira a página
        e.preventDefault();
        if (!scrollCooldown) {
          scrollCooldown = true;
          setTimeout(() => {
            scrollCooldown = false;
          }, 450);

          if (e.deltaY > 0) {
            onNextPage();
          } else if (e.deltaY < 0) {
            onPrevPage();
          }
        }
      },
      { passive: false },
    );

    // =========================================================================
    // Detecção de Intenção: Marcação de Texto × Pan
    // Estados: idle | selecting | pan-pending | panning
    // A intenção é definida pelo ponto de início e modificadores, não pelo overflow.
    // =========================================================================
    const PAN_THRESHOLD = 5;
    const EDGE_ZONE = 40;
    const MAX_AUTO_SPEED = 12;

    let mode = 'idle';
    let startX = 0;
    let startY = 0;
    let scrollStartX = 0;
    let scrollStartY = 0;
    let pointerId = null;
    let lastX = 0;
    let lastY = 0;
    let autoSpeed = 0;
    let autoRaf = null;

    const isHandToolActive = () =>
      document.body.classList.contains('space-hand-tool') ||
      document.body.classList.contains('hand-tool-active') ||
      appState.get('cursorMode') === 'hand';

    const extendSelectionTo = (x, y) => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || typeof sel.extend !== 'function') return;
      let node = null;
      let offset = 0;
      if (typeof document.caretPositionFromPoint === 'function') {
        const pos = document.caretPositionFromPoint(x, y);
        if (pos) { node = pos.offsetNode; offset = pos.offset; }
      } else if (typeof document.caretRangeFromPoint === 'function') {
        const r = document.caretRangeFromPoint(x, y);
        if (r) { node = r.startContainer; offset = r.startOffset; }
      }
      if (node && node.parentElement?.closest('.textLayer')) {
        try { sel.extend(node, offset); } catch (err) {}
      }
    };

    const autoScrollStep = () => {
      if (mode !== 'selecting' || autoSpeed === 0) {
        autoRaf = null;
        return;
      }
      container.scrollTop += autoSpeed;
      extendSelectionTo(lastX, lastY);
      autoRaf = requestAnimationFrame(autoScrollStep);
    };

    const stopAutoScroll = () => {
      autoSpeed = 0;
      if (autoRaf) cancelAnimationFrame(autoRaf);
      autoRaf = null;
    };

    const beginPan = (e) => {
      mode = 'panning';
      document.body.classList.add('is-panning');
      window.getSelection()?.removeAllRanges();
      try { container.setPointerCapture(pointerId ?? e.pointerId); } catch (err) {}
    };

    const resetInteraction = () => {
      if (mode === 'panning') {
        document.body.classList.remove('is-panning');
        if (pointerId !== null) {
          try { container.releasePointerCapture(pointerId); } catch (err) {}
        }
      }
      stopAutoScroll();
      document.body.classList.remove('is-selecting');
      mode = 'idle';
      pointerId = null;
    };

    container.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return; // Touch é tratado em touch.js
      if (
        e.target.closest('#sidebar') ||
        e.target.closest('dialog') ||
        e.target.closest('#quick-highlight-tooltip') ||
        e.target.closest('.highlight-rect') ||
        e.target.closest('button') ||
        e.target.closest('input')
      ) {
        return;
      }

      // Torna a área interna do leitor ativa e remove o foco de qualquer botão/overlay externo
      if (document.activeElement !== container && !e.target.closest('input, textarea, select')) {
        container.focus({ preventScroll: true });
      }

      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      scrollStartX = container.scrollLeft;
      scrollStartY = container.scrollTop;
      pointerId = e.pointerId;

      // 1. Pan explícito: botão do meio, Espaço segurado ou Alt
      const explicitPan = e.button === 1 || (e.button === 0 && (isHandToolActive() || e.altKey));
      if (explicitPan) {
        e.preventDefault();
        beginPan(e);
        return;
      }
      if (e.button !== 0) return;

      // 2. Sobre a página → marcação de texto (nunca pan, nunca captura de ponteiro)
      if (e.target.closest('.textLayer') || e.target.closest('.page-wrapper')) {
        mode = 'selecting';
        document.body.classList.add('is-selecting');
        return;
      }

      // 3. Área neutra → pan após limiar, se houver o que rolar
      const isScrollable =
        container.scrollWidth > container.clientWidth + 8 ||
        container.scrollHeight > container.clientHeight + 8;
      if (isScrollable) {
        mode = 'pan-pending';
        e.preventDefault(); // evita iniciar seleção a partir do fundo
      }
    });

    container.addEventListener('pointermove', (e) => {
      if (mode === 'idle') return;
      lastX = e.clientX;
      lastY = e.clientY;

      if (mode === 'selecting') {
        if (!(e.buttons & 1)) {
          resetInteraction();
          return;
        }
        const rect = container.getBoundingClientRect();
        if (e.clientY > rect.bottom - EDGE_ZONE) {
          autoSpeed = Math.ceil(Math.min(1, (e.clientY - (rect.bottom - EDGE_ZONE)) / EDGE_ZONE) * MAX_AUTO_SPEED);
        } else if (e.clientY < rect.top + EDGE_ZONE) {
          autoSpeed = -Math.ceil(Math.min(1, (rect.top + EDGE_ZONE - e.clientY) / EDGE_ZONE) * MAX_AUTO_SPEED);
        } else {
          autoSpeed = 0;
        }
        if (autoSpeed !== 0 && !autoRaf) autoRaf = requestAnimationFrame(autoScrollStep);
        if (autoSpeed === 0) stopAutoScroll();
        return;
      }

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (mode === 'pan-pending') {
        if (Math.hypot(dx, dy) < PAN_THRESHOLD) return;
        beginPan(e);
      }

      if (mode === 'panning') {
        container.scrollLeft = scrollStartX - dx;
        container.scrollTop = scrollStartY - dy;
      }
    });

    // Auto-scroll também quando o mouse sai do contêiner durante a seleção
    window.addEventListener('pointermove', (e) => {
      if (mode !== 'selecting' || container.contains(e.target)) return;
      lastX = e.clientX;
      lastY = e.clientY;
      const rect = container.getBoundingClientRect();
      if (e.clientY > rect.bottom) autoSpeed = MAX_AUTO_SPEED;
      else if (e.clientY < rect.top) autoSpeed = -MAX_AUTO_SPEED;
      else autoSpeed = 0;
      if (autoSpeed !== 0 && !autoRaf) autoRaf = requestAnimationFrame(autoScrollStep);
    });

    container.addEventListener('pointercancel', resetInteraction);
    window.addEventListener('pointerup', resetInteraction);
    window.addEventListener('blur', resetInteraction);
  }
}
