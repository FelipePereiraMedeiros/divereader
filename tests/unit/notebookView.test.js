import { describe, it, expect, beforeEach } from 'vitest';
import { NotebookView } from '../../src/js/ui/notebookView.js';
import { Highlight } from '../../src/js/models/Highlight.js';
import { appState } from '../../src/js/state.js';
import { DOM } from '../../src/js/ui/dom.js';

describe('NotebookView UI Component', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="sidebar" class="hidden">
        <div class="sidebar-header">
          <button id="btn-close-sidebar"></button>
        </div>
        <div class="sidebar-tabs">
          <button id="tab-btn-page" class="active">Nesta Página</button>
          <button id="tab-btn-global">Fichamento Completo</button>
        </div>
        <div id="tab-page" class="tab-content active">
          <span id="page-highlights-count">0</span>
          <div id="page-highlights-list"></div>
          <textarea id="notepad"></textarea>
        </div>
        <div id="tab-global" class="tab-content">
          <div id="global-view"></div>
          <button id="btn-copy-global"></button>
          <button id="btn-download-notes"></button>
        </div>
      </div>
    `;

    // Reassina referências do DOM para o novo HTML
    DOM.sidebar = document.getElementById('sidebar');
    DOM.tabBtnPage = document.getElementById('tab-btn-page');
    DOM.tabBtnGlobal = document.getElementById('tab-btn-global');
    DOM.tabPage = document.getElementById('tab-page');
    DOM.tabGlobal = document.getElementById('tab-global');
    DOM.highlightsContainer = document.getElementById('page-highlights-list');
    DOM.notepad = document.getElementById('notepad');
    DOM.globalView = document.getElementById('global-view');
    DOM.btnCopyGlobal = document.getElementById('btn-copy-global');
    DOM.btnDownloadNotes = document.getElementById('btn-download-notes');
    DOM.btnCloseSidebar = document.getElementById('btn-close-sidebar');

    appState.set({
      pageNum: 1,
      highlights: {},
      manualNotes: {},
      activeTab: 'page',
    });

    NotebookView.init();
  });

  it('deve alternar a visibilidade da sidebar', () => {
    expect(DOM.sidebar.classList.contains('hidden')).toBe(true);

    NotebookView.toggleSidebar(true);
    expect(DOM.sidebar.classList.contains('hidden')).toBe(false);

    NotebookView.toggleSidebar(false);
    expect(DOM.sidebar.classList.contains('hidden')).toBe(true);
  });

  it('deve alternar entre as abas page e global', () => {
    NotebookView.switchTab('global');
    expect(DOM.tabBtnGlobal.classList.contains('active')).toBe(true);
    expect(DOM.tabGlobal.classList.contains('active')).toBe(true);
    expect(DOM.tabBtnPage.classList.contains('active')).toBe(false);

    NotebookView.switchTab('page');
    expect(DOM.tabBtnPage.classList.contains('active')).toBe(true);
    expect(DOM.tabPage.classList.contains('active')).toBe(true);
  });

  it('deve renderizar os cards de grifos na página', () => {
    const hl = new Highlight({
      id: 'hl_view_test',
      pageNum: 1,
      text: 'Trecho grifado para teste de interface',
      note: 'Comentário vinculado',
    });

    appState.set({
      highlights: { 1: [hl] },
      manualNotes: { 1: 'Minha síntese da página 1' },
    });

    NotebookView.render();

    expect(DOM.highlightsContainer.children.length).toBe(1);
    const card = DOM.highlightsContainer.children[0];
    expect(card.textContent).toContain('Trecho grifado para teste de interface');

    const noteInput = card.querySelector('input');
    expect(noteInput).toBeDefined();
    expect(noteInput.value).toBe('Comentário vinculado');

    expect(DOM.notepad.value).toBe('Minha síntese da página 1');
  });

  it('deve renderizar o Fichamento Completo estruturado com cards de página e grifos', () => {
    const hl = new Highlight({
      id: 'hl_global_test',
      pageNum: 3,
      text: 'Conceito importante no fichamento geral',
      note: 'Comentário global',
    });

    appState.set({
      highlights: { 3: [hl] },
      manualNotes: { 3: 'Síntese da página 3' },
    });

    NotebookView.switchTab('global');

    expect(DOM.globalView.children.length).toBe(1);
    const pageCard = DOM.globalView.children[0];
    expect(pageCard.className).toContain('global-page-card');
    expect(pageCard.textContent).toContain('Página 3');
    expect(pageCard.textContent).toContain('Conceito importante no fichamento geral');

    const noteInput = pageCard.querySelector('.global-quote-note-input');
    expect(noteInput).toBeDefined();
    expect(noteInput.value).toBe('Comentário global');

    const synthTextarea = pageCard.querySelector('.global-synthesis-textarea');
    expect(synthTextarea).toBeDefined();
    expect(synthTextarea.value).toBe('Síntese da página 3');
  });

  it('deve renderizar grifos de ambas as páginas visíveis quando em modo duas páginas', () => {
    // Configura tela larga e zoom 1.0 (modo 2 páginas)
    window.innerWidth = 1200;
    appState.set({
      zoomLevel: 1.0,
      pageNum: 1,
      highlights: {
        1: [new Highlight({ id: 'hl_p1', pageNum: 1, text: 'Grifo da Página Esquerda' })],
        2: [new Highlight({ id: 'hl_p2', pageNum: 2, text: 'Grifo da Página Direita' })],
      },
    });

    NotebookView.render();

    expect(DOM.highlightsContainer.children.length).toBe(2);
    expect(DOM.highlightsContainer.textContent).toContain('Grifo da Página Esquerda');
    expect(DOM.highlightsContainer.textContent).toContain('Grifo da Página Direita');
  });
});
