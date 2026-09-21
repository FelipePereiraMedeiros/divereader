/**
 * SearchService - Mecanismo de Busca Textual Global no Documento PDF
 * Inspirado nos mecanismos de busca do Foliate-js e Readest.
 *
 * Permite busca em tempo real com extração concorrente, navegação circular
 * entre ocorrências (Next / Prev), contagem precisa e realce de correspondências.
 */

import { appState } from '../state.js';

export const SearchService = {
  _pageTextCache: new Map(), // pageNum -> { fullText: string, items: Array }
  _matches: [], // Array<{ pageNum: number, snippet: string, matchIndex: number, text: string }>
  _currentMatchIndex: -1,
  _currentQuery: '',
  _isSearching: false,
  _abortController: null,
  _listeners: new Set(),

  /**
   * Registra ouvintes para eventos de busca
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  },

  _notify(type, data) {
    for (const listener of this._listeners) {
      try {
        listener(type, data);
      } catch (err) {
        console.error('Erro em listener do SearchService:', err);
      }
    }
  },

  /**
   * Limpa caches ao descarregar documento
   */
  clearCache() {
    this.cancelSearch();
    this._pageTextCache.clear();
    this._matches = [];
    this._currentMatchIndex = -1;
    this._currentQuery = '';
  },

  /**
   * Cancela busca em andamento
   */
  cancelSearch() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._isSearching = false;
  },

  /**
   * Extrai e armazena em cache o texto de uma página do PDF
   */
  async getPageText(pageNum) {
    if (this._pageTextCache.has(pageNum)) {
      return this._pageTextCache.get(pageNum);
    }

    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) return { fullText: '', items: [] };

    try {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items || [];

      // Concatena mantendo espaçamentos lógicos
      let fullText = '';
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        fullText += item.str;
        if (item.hasEOL) {
          fullText += '\n';
        } else if (i < items.length - 1 && !item.str.endsWith(' ')) {
          fullText += ' ';
        }
      }

      const record = { fullText, items };
      this._pageTextCache.set(pageNum, record);
      return record;
    } catch (err) {
      console.warn(`SearchService: Falha ao extrair texto da página ${pageNum}:`, err);
      return { fullText: '', items: [] };
    }
  },

  /**
   * Executa a busca textual em todo o documento
   * @param {string} query Termo de busca
   * @param {Object} [options]
   * @param {boolean} [options.matchCase]
   * @returns {Promise<Array>}
   */
  async search(query, options = {}) {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      this._matches = [];
      this._currentMatchIndex = -1;
      this._currentQuery = '';
      this._notify('cleared', null);
      return [];
    }

    this.cancelSearch();
    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    this._isSearching = true;
    this._currentQuery = trimmed;
    this._matches = [];
    this._currentMatchIndex = -1;

    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) {
      this._isSearching = false;
      return [];
    }

    const totalPages = appState.get('totalPages') || pdfDoc.numPages;
    const matchCase = !!options.matchCase;
    const targetQuery = matchCase ? trimmed : trimmed.toLowerCase();

    this._notify('start', { query: trimmed, totalPages });

    // Varredura progressiva página por página
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (signal.aborted) break;

      const { fullText } = await this.getPageText(pageNum);
      if (signal.aborted) break;

      const compareText = matchCase ? fullText : fullText.toLowerCase();
      let pos = 0;

      while ((pos = compareText.indexOf(targetQuery, pos)) !== -1) {
        // Gera snippet contextual (ex: ...20 caracteres antes [termo] 20 caracteres depois...)
        const startSnippet = Math.max(0, pos - 30);
        const endSnippet = Math.min(fullText.length, pos + trimmed.length + 30);
        let snippet = fullText.substring(startSnippet, endSnippet).replace(/\s+/g, ' ');
        if (startSnippet > 0) snippet = '...' + snippet;
        if (endSnippet < fullText.length) snippet = snippet + '...';

        const match = {
          id: `${pageNum}_${pos}`,
          pageNum,
          charOffset: pos,
          length: trimmed.length,
          snippet,
          matchedText: fullText.substring(pos, pos + trimmed.length),
        };

        this._matches.push(match);
        pos += Math.max(1, trimmed.length);

        // Notifica progresso parcial para a UI atualizar o contador em tempo real
        this._notify('progress', {
          count: this._matches.length,
          scannedPages: pageNum,
          totalPages,
        });
      }
    }

    this._isSearching = false;

    if (this._matches.length > 0) {
      // Posiciona no primeiro resultado igual ou posterior à página atual
      const currentPage = appState.get('pageNum') || 1;
      let initialIndex = this._matches.findIndex((m) => m.pageNum >= currentPage);
      if (initialIndex === -1) initialIndex = 0;
      this._currentMatchIndex = initialIndex;
    }

    this._notify('complete', {
      matches: this._matches,
      total: this._matches.length,
      currentIndex: this._currentMatchIndex,
    });

    return this._matches;
  },

  /**
   * Avança para o próximo resultado de busca
   */
  nextMatch() {
    if (this._matches.length === 0) return null;
    this._currentMatchIndex = (this._currentMatchIndex + 1) % this._matches.length;
    const match = this._matches[this._currentMatchIndex];
    this._notify('change', {
      match,
      currentIndex: this._currentMatchIndex,
      total: this._matches.length,
    });
    return match;
  },

  /**
   * Retorna ao resultado de busca anterior
   */
  prevMatch() {
    if (this._matches.length === 0) return null;
    this._currentMatchIndex =
      (this._currentMatchIndex - 1 + this._matches.length) % this._matches.length;
    const match = this._matches[this._currentMatchIndex];
    this._notify('change', {
      match,
      currentIndex: this._currentMatchIndex,
      total: this._matches.length,
    });
    return match;
  },

  /**
   * Retorna o resultado ativo atual
   */
  getCurrentMatch() {
    if (this._currentMatchIndex >= 0 && this._currentMatchIndex < this._matches.length) {
      return {
        match: this._matches[this._currentMatchIndex],
        index: this._currentMatchIndex,
        total: this._matches.length,
      };
    }
    return null;
  },

  /**
   * Retorna o total de correspondências encontradas
   */
  getTotalMatches() {
    return this._matches.length;
  },

  /**
   * Realça temporariamente a ocorrência no DOM da página
   * @param {Object} match
   */
  highlightMatchInDOM(match) {
    if (!match) return;

    // Remove destaques temporários anteriores
    document.querySelectorAll('.search-highlight-active').forEach((el) => {
      el.classList.remove('search-highlight-active');
    });

    const pageWrapper = document.querySelector(`.page-wrapper[data-page="${match.pageNum}"]`);
    if (!pageWrapper) return;

    const textLayer = pageWrapper.querySelector('.textLayer');
    if (!textLayer) return;

    const queryLower = (match.matchedText || this._currentQuery).toLowerCase();
    const spans = textLayer.querySelectorAll('span');

    let foundTargetSpan = null;
    for (const span of spans) {
      if (span.textContent.toLowerCase().includes(queryLower)) {
        foundTargetSpan = span;
        break;
      }
    }

    if (foundTargetSpan) {
      foundTargetSpan.classList.add('search-highlight-active');
      foundTargetSpan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  },
};
