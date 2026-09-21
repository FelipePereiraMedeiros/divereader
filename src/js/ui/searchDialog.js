/**
 * SearchDialog - Barra de Busca Flutuante In-Document (Foliate / Modern Reader UX)
 */

import { SearchService } from '../services/searchService.js';
import { HighlightService } from '../services/highlightService.js';
import { NotebookView } from './notebookView.js';
import { showToast } from './toast.js';
import { appState } from '../state.js';

export const SearchDialog = {
  element: null,
  input: null,
  badge: null,
  btnPrev: null,
  btnNext: null,
  btnClose: null,
  btnHighlightAll: null,
  matchCaseToggle: null,
  isOpen: false,

  init() {
    this.createElement();
    this.bindEvents();

    // Registra ouvinte no SearchService
    SearchService.subscribe((type, data) => {
      this.handleSearchEvent(type, data);
    });
  },

  createElement() {
    if (document.getElementById('floating-search-bar')) {
      this.element = document.getElementById('floating-search-bar');
      return;
    }

    const bar = document.createElement('div');
    bar.id = 'floating-search-bar';
    bar.className = 'floating-search-bar hidden';
    bar.setAttribute('role', 'search');
    bar.setAttribute('aria-label', 'Busca no documento');

    bar.innerHTML = `
      <div class="search-inner">
        <i data-lucide="search" class="search-icon"></i>
        <input
          type="text"
          id="search-doc-input"
          placeholder="Buscar no texto (Enter para próximo)..."
          autocomplete="off"
          spellcheck="false"
        />
        <span id="search-doc-badge" class="search-badge">0 de 0</span>
        
        <div class="search-controls">
          <button id="search-btn-prev" class="search-ctrl-btn" title="Ocorrência anterior (Shift+Enter)" disabled>
            <i data-lucide="chevron-up"></i>
          </button>
          <button id="search-btn-next" class="search-ctrl-btn" title="Próxima ocorrência (Enter)" disabled>
            <i data-lucide="chevron-down"></i>
          </button>
          <button id="search-toggle-case" class="search-ctrl-btn" title="Diferenciar Maiúsculas/Minúsculas">
            Aa
          </button>
          <button id="search-btn-highlight-all" class="search-ctrl-btn" title="Grifar todas as ocorrências no livro" disabled>
            <i data-lucide="highlighter"></i>
          </button>
          <button id="search-btn-close" class="search-ctrl-btn close" title="Fechar busca (Esc)">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(bar);

    this.element = bar;
    this.input = bar.querySelector('#search-doc-input');
    this.badge = bar.querySelector('#search-doc-badge');
    this.btnPrev = bar.querySelector('#search-btn-prev');
    this.btnNext = bar.querySelector('#search-btn-next');
    this.btnClose = bar.querySelector('#search-btn-close');
    this.btnHighlightAll = bar.querySelector('#search-btn-highlight-all');
    this.matchCaseToggle = bar.querySelector('#search-toggle-case');

    if (typeof lucide !== 'undefined') {
      lucide.createIcons({ root: bar });
    }
  },

  bindEvents() {
    if (!this.element) return;

    let debounceTimer = null;
    let isMatchCase = false;

    // Digitação com debounce de 250ms
    this.input.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const val = e.target.value;
      if (!val.trim()) {
        SearchService.search('');
        this.updateBadge(0, 0);
        return;
      }

      this.badge.textContent = 'Buscando...';
      debounceTimer = setTimeout(() => {
        SearchService.search(val, { matchCase: isMatchCase });
      }, 250);
    });

    // Teclas de atalho no input
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          this.goToPrev();
        } else {
          this.goToNext();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });

    this.btnNext.onclick = () => this.goToNext();
    this.btnPrev.onclick = () => this.goToPrev();
    this.btnClose.onclick = () => this.close();

    // Alternador de Maiúsculas/Minúsculas
    this.matchCaseToggle.onclick = () => {
      isMatchCase = !isMatchCase;
      this.matchCaseToggle.classList.toggle('active', isMatchCase);
      if (this.input.value.trim()) {
        SearchService.search(this.input.value, { matchCase: isMatchCase });
      }
    };

    // Grifar todas as ocorrências
    this.btnHighlightAll.onclick = () => this.highlightAllMatches();
  },

  handleSearchEvent(type, data) {
    if (type === 'progress') {
      this.badge.textContent = `${data.count} encontrados...`;
    } else if (type === 'complete') {
      if (data.total === 0) {
        this.updateBadge(0, 0);
        this.btnNext.disabled = true;
        this.btnPrev.disabled = true;
        this.btnHighlightAll.disabled = true;
      } else {
        this.updateBadge(data.currentIndex + 1, data.total);
        this.btnNext.disabled = false;
        this.btnPrev.disabled = false;
        this.btnHighlightAll.disabled = false;
        this.onMatchChanged(data.matches[data.currentIndex]);
      }
    } else if (type === 'change') {
      this.updateBadge(data.currentIndex + 1, data.total);
      this.onMatchChanged(data.match);
    } else if (type === 'cleared') {
      this.updateBadge(0, 0);
      this.btnNext.disabled = true;
      this.btnPrev.disabled = true;
      this.btnHighlightAll.disabled = true;
    }
  },

  updateBadge(current, total) {
    if (total === 0) {
      this.badge.textContent = this.input.value.trim() ? 'Nenhum resultado' : '0 de 0';
    } else {
      this.badge.textContent = `${current} de ${total}`;
    }
  },

  goToNext() {
    const match = SearchService.nextMatch();
    if (match) this.onMatchChanged(match);
  },

  goToPrev() {
    const match = SearchService.prevMatch();
    if (match) this.onMatchChanged(match);
  },

  onMatchChanged(match) {
    if (!match) return;

    // Navega para a página correspondente se necessário
    const current = appState.get('pageNum');
    const isSingle = appState.isSinglePageMode();

    const isVisible = isSingle
      ? current === match.pageNum
      : current === match.pageNum || current + 1 === match.pageNum;

    if (!isVisible) {
      let target = match.pageNum;
      if (!isSingle && target % 2 === 0) target -= 1;
      appState.emit('NAVIGATE_PAGE', target);

      // Aguarda renderização para aplicar o highlight pulsante
      setTimeout(() => {
        SearchService.highlightMatchInDOM(match);
      }, 350);
    } else {
      SearchService.highlightMatchInDOM(match);
    }
  },

  /**
   * Converte todas as ocorrências encontradas em grifos de estudo salvos no Caderno
   */
  highlightAllMatches() {
    const total = SearchService.getTotalMatches();
    if (total === 0) return;

    const matches = SearchService._matches;
    let createdCount = 0;
    const activeColor = HighlightService.activeColor || 'yellow';

    for (const match of matches) {
      // Cria grifo baseado na linha/texto
      HighlightService.addHighlight(
        match.pageNum,
        [
          {
            topRatio: 0.1,
            leftRatio: 0.1,
            widthRatio: 0.8,
            heightRatio: 0.03,
          },
        ],
        match.snippet || match.matchedText,
        activeColor
      );
      createdCount++;
    }

    HighlightService.save();
    NotebookView.render();
    if (window.app && typeof window.app.renderPages === 'function') {
      window.app.renderPages(appState.get('pageNum'));
    }

    showToast(`${createdCount} ocorrências grifadas e arquivadas no Caderno!`, 'book-marked');
  },

  open() {
    if (!this.element) this.init();
    this.element.classList.remove('hidden');
    this.isOpen = true;
    setTimeout(() => {
      this.input.focus();
      this.input.select();
    }, 50);
  },

  close() {
    if (!this.element) return;
    this.element.classList.add('hidden');
    this.isOpen = false;
    SearchService.cancelSearch();
    document.querySelectorAll('.search-highlight-active').forEach((el) => {
      el.classList.remove('search-highlight-active');
    });
  },

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  },
};
