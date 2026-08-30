/**
 * Serviço de Integração com o Motor PDF.js e Renderização de Páginas
 */

import { appState } from '../state.js';
import { EVENTS } from '../constants.js';

export const PdfService = {
  /**
   * Inicializa o worker do PDF.js
   */
  initWorker() {
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    }
  },

  /**
   * Carrega um documento PDF a partir de um ArrayBuffer
   * @param {ArrayBuffer} arrayBuffer
   * @returns {Promise<any>} pdfDoc
   */
  async loadDocument(arrayBuffer) {
    this.initWorker();
    if (!window.pdfjsLib) {
      throw new Error('PDF.js não está carregado no ambiente global.');
    }
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    return loadingTask.promise;
  },

  /**
   * Calcula a escala apropriada para a página no container (com Fit to Width no Mobile)
   * @param {Object} viewport Viewport em escala 1.0
   * @param {boolean} forceSingle
   * @param {HTMLElement} container
   * @param {number} zoomLevel
   * @returns {number}
   */
  getScale(viewport, forceSingle, container, zoomLevel = 1.0) {
    if (!container) return 1.0 * zoomLevel;
    const containerWidth = container.clientWidth || 800;
    const containerHeight = container.clientHeight || 600;
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 820;

    // No modo mobile com página única, ajusta para cobrir 100% da largura da tela
    if (isMobile && forceSingle) {
      const mobileTargetWidth = containerWidth - (containerWidth < 480 ? 4 : 12);
      const scaleX = mobileTargetWidth / viewport.width;
      return Math.max(0.2, scaleX * zoomLevel);
    }

    const widthTarget = forceSingle
      ? containerWidth - 32
      : containerWidth / 2 - 32;
    const heightTarget = containerHeight - 32;

    const scaleX = widthTarget / viewport.width;
    const scaleY = heightTarget / viewport.height;
    const baseScale = Math.min(scaleX, scaleY) * 0.98;

    return Math.max(0.2, baseScale * zoomLevel);
  },

  /**
   * Constrói o wrapper DOM completo para uma página PDF (Canvas + Highlights + TextLayer)
   * @param {number} pageNum
   * @param {boolean} forceSingle
   * @param {HTMLElement} container
   * @param {Function} [onDrawHighlights]
   * @returns {Promise<HTMLElement>}
   */
  async buildPageWrapper(pageNum, forceSingle, container, onDrawHighlights) {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) throw new Error('Nenhum documento PDF aberto.');

    const page = await pdfDoc.getPage(pageNum);
    const zoomLevel = appState.get('zoomLevel');
    const scale = this.getScale(page.getViewport({ scale: 1 }), forceSingle, container, zoomLevel);
    const viewport = page.getViewport({ scale });

    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;
    wrapper.dataset.page = String(pageNum);

    // 1. Camada Canvas (Visual do PDF)
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    wrapper.appendChild(canvas);

    // 2. Camada de Grifos (Marca-texto amarelo)
    const highlightLayer = document.createElement('div');
    highlightLayer.className = 'highlight-layer';
    wrapper.appendChild(highlightLayer);

    // 3. Camada de Texto Nível PDF.js (Invisível, selecionável)
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    textLayer.style.width = `${viewport.width}px`;
    textLayer.style.height = `${viewport.height}px`;
    wrapper.appendChild(textLayer);

    // Renderiza Canvas
    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: viewport,
    }).promise;

    // 3. Renderiza Text Content no TextLayer (com renderTextLayer oficial ou fallback calibrado)
    const textContent = await page.getTextContent();
    if (window.pdfjsLib && typeof window.pdfjsLib.renderTextLayer === 'function') {
      try {
        await window.pdfjsLib.renderTextLayer({
          textContent,
          container: textLayer,
          viewport: viewport,
          textDivs: [],
        }).promise;
      } catch (err) {
        this.renderManualTextLayer(textContent, textLayer, viewport);
      }
    } else {
      this.renderManualTextLayer(textContent, textLayer, viewport);
    }

    // 4. Desenha Grifos na camada de grifos
    if (typeof onDrawHighlights === 'function') {
      onDrawHighlights(pageNum, highlightLayer);
    }

    return wrapper;
  },

  /**
   * Renderizador manual de fallback para a TextLayer com alinhamento sub-pixel de baseline
   * @param {Object} textContent
   * @param {HTMLElement} textLayer
   * @param {Object} viewport
   */
  renderManualTextLayer(textContent, textLayer, viewport) {
    if (!window.pdfjsLib?.Util?.transform || !textContent?.items) return;

    textContent.items.forEach((item) => {
      const span = document.createElement('span');
      span.textContent = item.str + (item.hasEOL ? '\n' : '');

      const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 12;

      // Compensa a baseline Y do PDF para a caixa superior do span no DOM
      span.style.left = `${tx[4]}px`;
      span.style.top = `${tx[5] - fontHeight * 0.85}px`;
      span.style.fontSize = `${fontHeight}px`;
      span.style.fontFamily = item.fontName || 'sans-serif';

      if (item.width > 0) {
        span.style.width = `${item.width * viewport.scale}px`;
      }

      textLayer.appendChild(span);
    });
  },
};
