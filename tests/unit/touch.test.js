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

    // Base zoom era 1.0, com 2x distância deve acionar onSetZoom com 2.0 e ponto focal calculado
    expect(onSetZoom).toHaveBeenCalledTimes(1);
    expect(onSetZoom).toHaveBeenCalledWith(2.0, { clientX: 150, clientY: 100 });
    // Não deve disparar navegação de página acidental
    expect(onNextPage).not.toHaveBeenCalled();
    expect(onPrevPage).not.toHaveBeenCalled();
  });

  it('deve alternar zoom inteligente (smart double-tap) ao dar dois toques rápidos', () => {
    // Primeiro toque
    const t1 = new Event('touchend');
    t1.touches = [];
    t1.changedTouches = [{ clientX: 180, clientY: 220 }];
    container.dispatchEvent(t1);

    // Segundo toque 100ms depois na mesma posição
    const t2 = new Event('touchend');
    t2.touches = [];
    t2.changedTouches = [{ clientX: 182, clientY: 221 }];
    container.dispatchEvent(t2);

    expect(onSetZoom).toHaveBeenCalledTimes(1);
    expect(onSetZoom).toHaveBeenCalledWith(1.8, { clientX: 182, clientY: 221 });

    // Se já estiver com zoom > 1.0, próximo duplo toque deve restaurar para 1.0
    appState.set({ zoomLevel: 1.8 });

    const t3 = new Event('touchend');
    t3.touches = [];
    t3.changedTouches = [{ clientX: 180, clientY: 220 }];
    container.dispatchEvent(t3);

    const t4 = new Event('touchend');
    t4.touches = [];
    t4.changedTouches = [{ clientX: 181, clientY: 220 }];
    container.dispatchEvent(t4);

    expect(onSetZoom).toHaveBeenCalledTimes(2);
    expect(onSetZoom).toHaveBeenLastCalledWith(1.0);
  });

  it('não deve acionar smart zoom no duplo toque se o toque ocorrer sobre a camada de texto', () => {
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    const span = document.createElement('span');
    span.textContent = 'Palavra selecionável';
    textLayer.appendChild(span);
    container.appendChild(textLayer);

    // Primeiro toque sobre o span da textLayer
    const t1 = new Event('touchend');
    t1.touches = [];
    t1.changedTouches = [{ clientX: 180, clientY: 220 }];
    span.dispatchEvent(t1);

    // Segundo toque rápido sobre o mesmo span
    const t2 = new Event('touchend');
    t2.touches = [];
    t2.changedTouches = [{ clientX: 181, clientY: 220 }];
    span.dispatchEvent(t2);

    // Não deve acionar onSetZoom pois o usuário está realizando seleção de palavra
    expect(onSetZoom).not.toHaveBeenCalled();
  });

  it('deve permitir mover a visão da página (pan com 1 dedo) quando o zoom for maior que 1.01', () => {
    appState.set({ zoomLevel: 1.5 });
    container.scrollLeft = 50;
    container.scrollTop = 50;

    // Toque com 1 dedo
    const touchStart = new Event('touchstart');
    touchStart.touches = [{ clientX: 100, clientY: 100 }];
    container.dispatchEvent(touchStart);

    // Arrasto com 1 dedo: moveu 30px para a esquerda (dx = -30) e 20px para cima (dy = -20)
    const touchMove = new Event('touchmove');
    touchMove.touches = [{ clientX: 70, clientY: 80 }];
    container.dispatchEvent(touchMove);

    expect(container.scrollLeft).toBe(80); // 50 - (-30) = 80
    expect(container.scrollTop).toBe(70);  // 50 - (-20) = 70

    const touchEnd = new Event('touchend');
    touchEnd.touches = [];
    touchEnd.changedTouches = [{ clientX: 70, clientY: 80 }];
    container.dispatchEvent(touchEnd);

    // Não deve acionar navegação de página quando o zoom estiver ativo
    expect(onNextPage).not.toHaveBeenCalled();
    expect(onPrevPage).not.toHaveBeenCalled();
  });

  it('deve ajustar zoom em incrementos de 1% e fixar no valor final ao terminar a pinça', () => {
    // Distância inicial: 100px (100 a 200)
    const touchStart = new Event('touchstart');
    touchStart.touches = [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ];
    container.dispatchEvent(touchStart);

    // Distância final: 115px (1.15x = aumento exato de 15%, 1% em 1%)
    const touchMove = new Event('touchmove');
    touchMove.touches = [
      { clientX: 92.5, clientY: 100 },
      { clientX: 207.5, clientY: 100 },
    ];
    container.dispatchEvent(touchMove);

    const touchEnd = new Event('touchend');
    touchEnd.touches = [];
    touchEnd.changedTouches = [
      { clientX: 92.5, clientY: 100 },
      { clientX: 207.5, clientY: 100 },
    ];
    container.dispatchEvent(touchEnd);

    expect(onSetZoom).toHaveBeenCalledTimes(1);
    expect(onSetZoom).toHaveBeenCalledWith(1.15, { clientX: 150, clientY: 100 });
  });
});
