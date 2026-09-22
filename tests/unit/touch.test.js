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
      <div id="zoom-hud" class="hidden">
        <span id="hud-zoom-text">100%</span>
      </div>
      <span id="zoom-preset-label">100%</span>
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

  it('1 dedo só deve mover a página para posicionar o texto e NÃO deve trocar de página ao arrastar horizontalmente', () => {
    // Touchstart na posição x=200, y=100
    const touchStart = new Event('touchstart');
    touchStart.touches = [{ clientX: 200, clientY: 100 }];
    container.dispatchEvent(touchStart);

    // Touchend na posição x=100, y=100 (arraste de 100px para a esquerda)
    const touchEnd = new Event('touchend');
    touchEnd.touches = [];
    touchEnd.changedTouches = [{ clientX: 100, clientY: 100 }];
    container.dispatchEvent(touchEnd);

    // Não deve navegar de página: 1 dedo é exclusivo para mover/posicionar o texto
    expect(onNextPage).not.toHaveBeenCalled();
    expect(onPrevPage).not.toHaveBeenCalled();
  });

  it('1 dedo arrastando para a direita também não deve voltar página', () => {
    const touchStart = new Event('touchstart');
    touchStart.touches = [{ clientX: 100, clientY: 100 }];
    container.dispatchEvent(touchStart);

    const touchEnd = new Event('touchend');
    touchEnd.touches = [];
    touchEnd.changedTouches = [{ clientX: 250, clientY: 100 }];
    container.dispatchEvent(touchEnd);

    expect(onPrevPage).not.toHaveBeenCalled();
    expect(onNextPage).not.toHaveBeenCalled();
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

  it('deve incrementar o zoom de 1 em 1% durante a pinça e travar ao soltar os dedos', () => {
    // Início da pinça: distância de 100px (dedos em x=100 e x=200)
    const touchStart = new Event('touchstart');
    touchStart.touches = [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ];
    container.dispatchEvent(touchStart);

    // Pequeno movimento de abertura de 1% (distância vai para 101px: x=99.5 e x=200.5)
    const touchMove1 = new Event('touchmove');
    touchMove1.touches = [
      { clientX: 99.5, clientY: 100 },
      { clientX: 200.5, clientY: 100 },
    ];
    container.dispatchEvent(touchMove1);

    const hudText = document.getElementById('hud-zoom-text');
    expect(hudText.textContent).toBe('101%');

    // Mais um pequeno movimento para 103px (3% de zoom: 103%)
    const touchMove2 = new Event('touchmove');
    touchMove2.touches = [
      { clientX: 98.5, clientY: 100 },
      { clientX: 201.5, clientY: 100 },
    ];
    container.dispatchEvent(touchMove2);
    expect(hudText.textContent).toBe('103%');

    // Usuário solta os dedos da tela (touchend)
    const touchEnd = new Event('touchend');
    touchEnd.touches = [];
    touchEnd.changedTouches = [
      { clientX: 98.5, clientY: 100 },
      { clientX: 201.5, clientY: 100 },
    ];
    container.dispatchEvent(touchEnd);

    // O zoom final alcançado (1.03) é fixado e aplicado
    expect(onSetZoom).toHaveBeenCalledTimes(1);
    expect(onSetZoom).toHaveBeenCalledWith(1.03, { clientX: 150, clientY: 100 });
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
});
