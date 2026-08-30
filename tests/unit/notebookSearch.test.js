import { describe, it, expect, beforeEach } from 'vitest';
import { NotebookView } from '../../src/js/ui/notebookView.js';
import { Highlight } from '../../src/js/models/Highlight.js';
import { appState } from '../../src/js/state.js';
import { DOM } from '../../src/js/ui/dom.js';

describe('NotebookView Search & Color Filtering', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="sidebar">
        <div class="sidebar-search-bar">
          <input type="text" id="notebook-search-input" />
          <button id="btn-clear-search" class="hidden"></button>
          <div id="color-filter-chips">
            <button class="color-chip active" data-color="all">Todos</button>
            <button class="color-chip color-yellow" data-color="yellow"></button>
            <button class="color-chip color-blue" data-color="blue"></button>
          </div>
        </div>
        <div class="sidebar-tabs">
          <button id="tab-btn-page" class="active">Nesta Página</button>
          <button id="tab-btn-global">Fichamento</button>
        </div>
        <div id="tab-page" class="tab-content active">
          <span id="page-highlights-count">0</span>
          <div id="page-highlights-list"></div>
          <textarea id="notepad"></textarea>
        </div>
        <div id="tab-global" class="tab-content">
          <div id="global-view"></div>
        </div>
      </div>
    `;

    DOM.sidebar = document.getElementById('sidebar');
    DOM.notebookSearchInput = document.getElementById('notebook-search-input');
    DOM.btnClearSearch = document.getElementById('btn-clear-search');
    DOM.colorFilterChips = document.getElementById('color-filter-chips');
    DOM.tabBtnPage = document.getElementById('tab-btn-page');
    DOM.tabBtnGlobal = document.getElementById('tab-btn-global');
    DOM.tabPage = document.getElementById('tab-page');
    DOM.tabGlobal = document.getElementById('tab-global');
    DOM.highlightsContainer = document.getElementById('page-highlights-list');
    DOM.notepad = document.getElementById('notepad');
    DOM.globalView = document.getElementById('global-view');

    appState.set({
      pageNum: 1,
      searchQuery: '',
      activeColorFilter: 'all',
      highlights: {
        1: [
          new Highlight({
            id: 'hl_1',
            pageNum: 1,
            text: 'A teoria da relatividade geral formulada por Einstein',
            color: 'yellow',
            note: 'Física moderna',
          }),
          new Highlight({
            id: 'hl_2',
            pageNum: 1,
            text: 'O princípio da incerteza de Heisenberg na mecânica quântica',
            color: 'blue',
            note: 'Citação de física',
          }),
        ],
      },
      manualNotes: {},
    });

    NotebookView.init();
  });

  it('deve renderizar todos os grifos quando a busca estiver vazia', () => {
    NotebookView.render();
    expect(DOM.highlightsContainer.children.length).toBe(2);
  });

  it('deve filtrar grifos por palavra-chave e destacar o termo correspondente', () => {
    appState.set({ searchQuery: 'Einstein' });
    NotebookView.render();

    expect(DOM.highlightsContainer.children.length).toBe(1);
    const card = DOM.highlightsContainer.children[0];
    expect(card.textContent).toContain('Einstein');
    expect(card.innerHTML).toContain('<mark class="search-match">Einstein</mark>');
  });

  it('deve filtrar grifos por cor selecionada', () => {
    appState.set({ activeColorFilter: 'blue' });
    NotebookView.render();

    expect(DOM.highlightsContainer.children.length).toBe(1);
    expect(DOM.highlightsContainer.textContent).toContain('Heisenberg');
  });

  it('deve exibir mensagem de estado vazio quando nenhum grifo corresponder ao filtro', () => {
    appState.set({ searchQuery: 'Termo Inexistente' });
    NotebookView.render();

    expect(DOM.highlightsContainer.textContent).toContain('Nenhum grifo corresponde ao filtro');
  });

  it('highlightMatch deve escapar HTML e envolver a palavra pesquisada em tags mark', () => {
    const result = NotebookView.highlightMatch('Texto com <b>HTML</b> e termo de busca', 'termo');
    expect(result).toContain('&lt;b&gt;HTML&lt;/b&gt;');
    expect(result).toContain('<mark class="search-match">termo</mark>');
  });
});
