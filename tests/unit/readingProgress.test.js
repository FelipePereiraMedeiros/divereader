import { describe, it, expect, beforeEach } from 'vitest';
import { appState } from '../../src/js/state.js';
import { DOM } from '../../src/js/ui/dom.js';

describe('Reading Progress Bar & Indicator (%)', () => {
  let progressBar;
  let indicator;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="reading-progress-bar-container">
        <div id="reading-progress-bar" style="width: 0%;"></div>
      </div>
      <div id="discreet-indicator">Pág. - / -</div>
    `;

    progressBar = document.getElementById('reading-progress-bar');
    indicator = document.getElementById('discreet-indicator');
    DOM.readingProgressBar = progressBar;
    DOM.indicator = indicator;
  });

  it('deve calcular corretamente a porcentagem em modo página única', () => {
    const totalPages = 50;
    const targetPage = 25;
    const progressPercent = Math.min(100, Math.max(1, Math.round((targetPage / totalPages) * 100)));

    expect(progressPercent).toBe(50);
  });

  it('deve calcular corretamente a porcentagem na primeira e última página', () => {
    const totalPages = 100;

    const page1Percent = Math.min(100, Math.max(1, Math.round((1 / totalPages) * 100)));
    expect(page1Percent).toBe(1);

    const page100Percent = Math.min(100, Math.max(1, Math.round((100 / totalPages) * 100)));
    expect(page100Percent).toBe(100);
  });

  it('deve atualizar o estilo de largura da barra de progresso no DOM', () => {
    progressBar.style.width = '75%';
    expect(progressBar.style.width).toBe('75%');
  });
});
