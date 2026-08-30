import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTouchAndGestures } from '../../src/js/events/touch.js';
import { appState } from '../../src/js/state.js';

describe('Touch Events and Gestures', () => {
  let container;
  let viewer;
  let onNextPage;
  let onPrevPage;
  let onSetZoom;
  let onChangeZoom;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="book-container">
        <div id="pdf-viewer"></div>
      </div>
      <div id="sidebar" class="hidden"></div>
      <div id="quick-highlight-tooltip" style="display: none"></div>
    `;
    container = document.getElementById('book-container');
    viewer = document.getElementById('pdf-viewer');

    onNextPage = vi.fn();
    onPrevPage = vi.fn();
    onSetZoom = vi.fn();
    onChangeZoom = vi.fn();

    appState.set({ zoomLevel: 1.0, totalPages: 10, pageNum: 1 });

    setupTouchAndGestures({
      container,
      onNextPage,
      onPrevPage,
      onSetZoom,
      onChangeZoom,
    });
  });

  it('deve disparar onNextPage ao fazer swipe horizontal para a esquerda', () => {
    // Touchstart na posição x=200, y=100
    const touchStart = new Event('touchstart');
    touchStart.touches = [{ clientX: 200, clientY: 100 }];
    container.dispatchEvent(touchStart);

    // Touchend na posição x=100, y=100 (deslocamento de 100px para a esquerda)
    const touchEnd = new Event('touchend');
    touchEnd.touches = [];
    touchEnd.changedTouches = [{ clientX: 100, clientY: 100 }];
    container.dispatchEvent(touchEnd);

    expect(onNextPage).toHaveBeenCalledTimes(1);
    expect(onPrevPage).not.toHaveBeenCalled();
  });

  it('deve disparar onPrevPage ao fazer swipe horizontal para a direita', () => {
    // Touchstart na posição x=100, y=100
    const touchStart = new Event('touchstart');
    touchStart.touches = [{ clientX: 100, clientY: 100 }];
    container.dispatchEvent(touchStart);

    // Touchend na posição x=200, y=100 (deslocamento de 100px para a direita)
    const touchEnd = new Event('touchend');
    touchEnd.touches = [];
    touchEnd.changedTouches = [{ clientX: 200, clientY: 100 }];
    container.dispatchEvent(touchEnd);

    expect(onPrevPage).toHaveBeenCalledTimes(1);
    expect(onNextPage).not.toHaveBeenCalled();
  });

  it('não deve mudar de página se o swipe for vertical predominante', () => {
    const touchStart = new Event('touchstart');
    touchStart.touches = [{ clientX: 100, clientY: 100 }];
    container.dispatchEvent(touchStart);

    // Deslocamento vertical de 150px e horizontal pequeno de 30px
    const touchEnd = new Event('touchend');
    touchEnd.touches = [];
    touchEnd.changedTouches = [{ clientX: 70, clientY: 250 }];
    container.dispatchEvent(touchEnd);

    expect(onNextPage).not.toHaveBeenCalled();
    expect(onPrevPage).not.toHaveBeenCalled();
  });

  it('deve detectar gesto de pinça (pinch) e acionar onSetZoom no touchend', () => {
    // Início da pinça com 2 dedos a 100px de distância (dedo1: 100, dedo2: 200)
    const touchStart = new Event('touchstart');
    touchStart.touches = [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ];
    container.dispatchEvent(touchStart);

    // Movimento de abertura para 200px de distância (2x a distância inicial)
    const touchMove = new Event('touchmove');
    touchMove.touches = [
      { clientX: 50, clientY: 100 },
      { clientX: 250, clientY: 100 },
    ];
    container.dispatchEvent(touchMove);

    // Fim da pinça
    const touchEnd = new Event('touchend');
    touchEnd.touches = [];
    touchEnd.changedTouches = [
      { clientX: 50, clientY: 100 },
      { clientX: 250, clientY: 100 },
    ];
    container.dispatchEvent(touchEnd);

    // Base zoom era 1.0, com 2x distância deve acionar onSetZoom com 2.0
    expect(onSetZoom).toHaveBeenCalledTimes(1);
    expect(onSetZoom).toHaveBeenCalledWith(2.0);
    // Não deve disparar navegação de página acidental
    expect(onNextPage).not.toHaveBeenCalled();
    expect(onPrevPage).not.toHaveBeenCalled();
  });
});
