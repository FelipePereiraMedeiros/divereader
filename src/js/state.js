/**
 * Estado Reativo Centralizado da Aplicação
 */

import { EVENTS, READING_MODES, THEMES, ZOOM_MODES } from './constants.js';

class StateManager {
  constructor() {
    this.state = {
      fileName: 'Nenhum arquivo',
      fileKey: null,
      pdfDoc: null,
      pageNum: 1,
      totalPages: 0,
      isRendering: false,
      readingMode: READING_MODES.SPREAD, // 'spread' | 'single' | 'continuous'
      readingStats: {
        pagesReadThisSession: 0,
        pageStartTime: Date.now(),
        pageDurations: [], // array de segundos gastos por página
        estimatedRemainingMinutes: null,
      },
      highlights: {}, // Object.<number, Highlight[]>
      manualNotes: {}, // Object.<number, string>
      outline: [], // Array<{ title: string, pageNum: number|null, items: Array }>
      zoomLevel: 1.0,
      zoomMode: ZOOM_MODES.FIT_WIDTH,
      pageJumpHistory: null,
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
    if (this.state.readingMode === READING_MODES.SINGLE) return true;
    return window.innerWidth <= 900 || this.state.zoomLevel > 1.0;
  }

  /**
   * Verifica se o layout atual está em modo de rolagem contínua vertical
   * @returns {boolean}
   */
  isContinuousScrollMode() {
    return this.state.readingMode === READING_MODES.CONTINUOUS;
  }
}

export const appState = new StateManager();
