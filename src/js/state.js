/**
 * Estado Reativo Centralizado da Aplicação
 */

import { EVENTS, THEMES } from './constants.js';

class StateManager {
  constructor() {
    this.state = {
      fileName: 'Nenhum arquivo',
      fileKey: null,
      pdfDoc: null,
      pageNum: 1,
      totalPages: 0,
      isRendering: false,
      highlights: {}, // Object.<number, Highlight[]>
      manualNotes: {}, // Object.<number, string>
      outline: [], // Array<{ title: string, pageNum: number|null, items: Array }>
      zoomLevel: 1.0,
      activeHighlightColor: 'yellow',
      theme: THEMES.LIGHT,
      isSidebarOpen: false,
      isFocusMode: false,
      activeTab: 'page', // 'page' | 'global' | 'toc'
      selectedHighlightId: null,
      searchQuery: '',
      activeColorFilter: 'all', // 'all' | 'yellow' | 'green' | 'pink' | 'blue' | 'purple'
    };

    this.listeners = new Map();
  }

  /**
   * Obtém o estado atual (ou uma propriedade específica)
   * @param {string} [key]
   */
  get(key) {
    return key ? this.state[key] : { ...this.state };
  }

  /**
   * Atualiza propriedades do estado e notifica os ouvintes
   * @param {Object} partialState
   * @param {string} [event]
   */
  set(partialState, event = null) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...partialState };

    if (event) {
      this.emit(event, this.state, prevState);
    }
  }

  /**
   * Inscreve um ouvinte para um evento
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} Função para desinscrever
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    return () => {
      const set = this.listeners.get(event);
      if (set) set.delete(callback);
    };
  }

  /**
   * Emite um evento para todos os ouvintes inscritos
   * @param {string} event
   * @param {any} data
   * @param {any} [extra]
   */
  emit(event, data, extra) {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((cb) => {
        try {
          cb(data, extra);
        } catch (err) {
          console.error(`Erro no listener do evento '${event}':`, err);
        }
      });
    }
  }

  /**
   * Verifica se o layout atual deve exibir apenas uma página
   * @returns {boolean}
   */
  isSinglePageMode() {
    if (typeof window === 'undefined') return true;
    return window.innerWidth <= 900 || this.state.zoomLevel > 1.0;
  }
}

export const appState = new StateManager();
