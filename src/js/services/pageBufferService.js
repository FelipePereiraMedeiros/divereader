/**
 * PageBufferService - Gerenciador de Buffer Preditivo de Páginas (Sliding Window LRU)
 * Inspirado na arquitetura do PDFPageViewBuffer do PDF.js e nos leitores Foliate e KOReader.
 *
 * Mantém em memória as páginas adjacentes já renderizadas (Canvas + TextLayer + Highlights)
 * para garantir transição imediata (0ms de atraso percebido) nas viradas de página,
 * com descarte estrito por LRU para evitar saturação de memória GPU/DOM.
 */

import { appState } from '../state.js';
import { PdfService } from './pdfService.js';
import { HighlightService } from './highlightService.js';

export const PageBufferService = {
  // Cache de wrappers DOM: Map<string, { wrapper: HTMLElement, lastUsed: number, pageNum: number, key: string }>
  _cache: new Map(),

  // Fila de tarefas de prefetching agendadas
  _prefetchQueue: [],
  _isPrefetching: false,
  _currentSignature: '',
  _idleCallbackId: null,

  // Limite máximo de páginas mantidas em cache (LRU)
  getMaxCacheSize() {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 820;
    return isMobile ? 4 : 8;
  },

  /**
   * Gera uma assinatura de renderização baseada no documento, nível de zoom e modo
   * Se a assinatura mudar (ex: zoom alterado), o buffer deve ser invalidado
   */
  getSignature(forceSingle) {
    const fileKey = appState.get('fileKey') || 'default';
    const zoomLevel = appState.get('zoomLevel') || 1.0;
    const zoomMode = appState.get('zoomMode') || 'fit-width';
    return `${fileKey}_z${zoomLevel.toFixed(2)}_${zoomMode}_s${forceSingle ? 1 : 0}`;
  },

  /**
   * Chave única do item no cache
   */
  _buildKey(pageNum, signature) {
    return `${signature}_p${pageNum}`;
  },

  /**
   * Obtém uma página do buffer ou renderiza caso ainda não esteja presente
   * @param {number} pageNum
   * @param {boolean} forceSingle
   * @param {HTMLElement} container
   * @param {Function} [onDrawHighlights]
   * @returns {Promise<HTMLElement>}
   */
  async getOrRenderPage(pageNum, forceSingle, container, onDrawHighlights) {
    const signature = this.getSignature(forceSingle);
    if (this._currentSignature !== signature) {
      this.clearAll();
      this._currentSignature = signature;
    }

    const key = this._buildKey(pageNum, signature);

    if (this._cache.has(key)) {
      const entry = this._cache.get(key);
      entry.lastUsed = Date.now();

      // Se o elemento foi anexado a outro nó e depois removido, podemos reutilizá-lo diretamente
      // Garantimos que a camada de grifos está sincronizada
      const highlightLayer = entry.wrapper.querySelector('.highlight-layer');
      if (highlightLayer && typeof onDrawHighlights === 'function') {
        highlightLayer.innerHTML = '';
        onDrawHighlights(pageNum, highlightLayer);
      }
      return entry.wrapper;
    }

    // Renderiza a página via PdfService
    const wrapper = await PdfService.buildPageWrapper(
      pageNum,
      forceSingle,
      container,
      onDrawHighlights || ((p, layer) => HighlightService.drawPageHighlights(p, layer))
    );

    this._put(key, pageNum, wrapper);
    return wrapper;
  },

  /**
   * Insere um wrapper no cache e aplica descarte LRU se necessário
   */
  _put(key, pageNum, wrapper) {
    // Aplica descarte se ultrapassar o limite
    const maxSize = this.getMaxCacheSize();
    while (this._cache.size >= maxSize) {
      this._evictOldest();
    }

    this._cache.set(key, {
      key,
      pageNum,
      wrapper,
      lastUsed: Date.now(),
    });
  },

  /**
   * Descarta a página menos utilizada recentemente (LRU) liberando memória GPU
   */
  _evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this._cache.entries()) {
      // Não descarta se a página estiver atualmente no DOM
      if (document.body.contains(entry.wrapper)) {
        continue;
      }
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this._cache.get(oldestKey);
      this._destroyWrapper(entry.wrapper);
      this._cache.delete(oldestKey);
    } else {
      // Se todas estiverem no DOM, descarte qualquer uma que não seja a ativa
      for (const [key, entry] of this._cache.entries()) {
        if (!document.body.contains(entry.wrapper)) {
          this._destroyWrapper(entry.wrapper);
          this._cache.delete(key);
          break;
        }
      }
    }
  },

  /**
   * Libera nós do canvas e referências para coleta de lixo do navegador
   */
  _destroyWrapper(wrapper) {
    if (!wrapper) return;
    const canvases = wrapper.querySelectorAll('canvas');
    canvases.forEach((canvas) => {
      canvas.width = 0;
      canvas.height = 0;
    });
    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  },

  /**
   * Agenda a pré-renderização em segundo plano das páginas próximas (janela preditiva)
   * @param {number} currentPage
   * @param {boolean} forceSingle
   * @param {HTMLElement} container
   * @param {Function} [onDrawHighlights]
   */
  prefetchSurroundingPages(currentPage, forceSingle, container, onDrawHighlights) {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc || !container) return;

    const totalPages = appState.get('totalPages') || pdfDoc.numPages;
    const signature = this.getSignature(forceSingle);
    this._currentSignature = signature;

    // Cancela pré-renderizações agendadas anteriores
    this.cancelPrefetchQueue();

    // Determina páginas prioritárias de pré-renderização
    const pagesToPrefetch = [];
    const step = forceSingle ? 1 : 2;

    // Próxima(s) página(s) - Prioridade Máxima
    const nextPage1 = currentPage + (forceSingle ? 1 : 2);
    if (nextPage1 <= totalPages) {
      pagesToPrefetch.push(nextPage1);
      if (!forceSingle && nextPage1 + 1 <= totalPages) {
        pagesToPrefetch.push(nextPage1 + 1);
      }
    }

    // Página(s) seguinte(s) se houver margem
    const nextPage2 = nextPage1 + step;
    if (nextPage2 <= totalPages) {
      pagesToPrefetch.push(nextPage2);
    }

    // Página anterior para navegação reversa rápida
    const prevPage = currentPage - (forceSingle ? 1 : 2);
    if (prevPage >= 1) {
      pagesToPrefetch.push(prevPage);
    }

    // Enfileira apenas páginas que ainda não estão no cache
    for (const pNum of pagesToPrefetch) {
      const key = this._buildKey(pNum, signature);
      if (!this._cache.has(key)) {
        this._prefetchQueue.push({ pageNum: pNum, forceSingle, container, onDrawHighlights });
      }
    }

    this._processNextInQueue();
  },

  /**
   * Processa itens da fila durante momentos ociosos do navegador
   */
  _processNextInQueue() {
    if (this._isPrefetching || this._prefetchQueue.length === 0) return;

    const schedule = (cb) => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        return window.requestIdleCallback(cb, { timeout: 1000 });
      }
      return setTimeout(cb, 50);
    };

    this._idleCallbackId = schedule(async () => {
      if (this._prefetchQueue.length === 0) return;
      const item = this._prefetchQueue.shift();

      const signature = this.getSignature(item.forceSingle);
      const key = this._buildKey(item.pageNum, signature);

      // Se já está no cache ou se a assinatura mudou, passa para o próximo
      if (this._cache.has(key) || signature !== this._currentSignature) {
        this._processNextInQueue();
        return;
      }

      this._isPrefetching = true;
      try {
        const wrapper = await PdfService.buildPageWrapper(
          item.pageNum,
          item.forceSingle,
          item.container,
          item.onDrawHighlights || ((p, layer) => HighlightService.drawPageHighlights(p, layer))
        );
        this._put(key, item.pageNum, wrapper);
      } catch (err) {
        // Ignora erros de cancelamento normais durante prefetching
      } finally {
        this._isPrefetching = false;
        this._processNextInQueue();
      }
    });
  },

  /**
   * Cancela a fila de prefetching ativa
   */
  cancelPrefetchQueue() {
    this._prefetchQueue = [];
    if (this._idleCallbackId) {
      if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(this._idleCallbackId);
      } else {
        clearTimeout(this._idleCallbackId);
      }
      this._idleCallbackId = null;
    }
  },

  /**
   * Limpa todo o cache e descarta elementos
   */
  clearAll() {
    this.cancelPrefetchQueue();
    for (const entry of this._cache.values()) {
      this._destroyWrapper(entry.wrapper);
    }
    this._cache.clear();
  },

  /**
   * Retorna estatísticas de uso do buffer
   */
  getStats() {
    return {
      size: this._cache.size,
      maxSize: this.getMaxCacheSize(),
      cachedPages: Array.from(this._cache.values()).map((e) => e.pageNum),
    };
  },
};
