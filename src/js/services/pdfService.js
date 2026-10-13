/**
 * Serviço de Integração com o Motor PDF.js e Renderização de Páginas
 */

import { appState } from '../state.js';
import { EVENTS, ZOOM_MODES } from '../constants.js';

// Controle interno de tarefas de renderização ativas para cancelamento imediato
const activeRenderTasks = new Map();

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
   * Calcula a escala apropriada para a página no container (suportando Fit to Width e Fit to Page)
   * @param {Object} viewport Viewport em escala 1.0
   * @param {boolean} forceSingle
   * @param {HTMLElement} container
   * @param {number} zoomLevel
   * @param {string} [zoomMode]
   * @returns {number}
   */
  getScale(viewport, forceSingle, container, zoomLevel = 1.0, zoomMode = null) {
    if (!container) return 1.0 * zoomLevel;
    const containerWidth = container.clientWidth || 800;
    const containerHeight = container.clientHeight || 600;
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 820;
    const effectiveMode = zoomMode || appState.get('zoomMode') || ZOOM_MODES.FIT_WIDTH;

    // No modo mobile
    if (isMobile && forceSingle) {
      const mobileTargetWidth = containerWidth - (containerWidth < 480 ? 4 : 12);
      const scaleX = mobileTargetWidth / viewport.width;

      if (effectiveMode === ZOOM_MODES.FIT_PAGE) {
        // Enquadra a página inteira na tela útil (ótimo para mangás, quadrinhos e diagramas)
        const mobileTargetHeight = containerHeight - 16;
        const scaleY = mobileTargetHeight / viewport.height;
        return Math.max(0.2, Math.min(scaleX, scaleY) * zoomLevel);
      }

      // FIT_WIDTH padrão: aproveita toda a largura para texto nítido e legível
      return Math.max(0.2, scaleX * zoomLevel);
    }

    const widthTarget = forceSingle
      ? containerWidth - 32
      : containerWidth / 2 - 32;
    const heightTarget = containerHeight - 32;

    const scaleX = widthTarget / viewport.width;
    const scaleY = heightTarget / viewport.height;

    if (effectiveMode === ZOOM_MODES.FIT_WIDTH) {
      // Ajuste à largura confortável: texto com boa leitura contínua
      return Math.max(0.2, scaleX * zoomLevel);
    }

    // FIT_PAGE ou padrão: enquadra a página inteira no campo de visão
    const baseScale = Math.min(scaleX, scaleY) * 0.98;
    return Math.max(0.2, baseScale * zoomLevel);
  },

  /**
   * Renderiza a página no elemento canvas com suporte a cancelamento de tarefas anteriores
   * e aceleração de rasterização com alpha: false
   * @param {any} page Instância da página do PDF.js
   * @param {Object} viewport
   * @param {HTMLCanvasElement} canvas
   * @param {number} pageNum
   */
  async renderCanvas(page, viewport, canvas, pageNum) {
    // Cancela renderização pendente da mesma página se o utilizador redimensionar/navegar rapidamente
    if (activeRenderTasks.has(pageNum)) {
      try {
        const prevTask = activeRenderTasks.get(pageNum);
        if (prevTask && typeof prevTask.cancel === 'function') {
          prevTask.cancel();
        }
      } catch (e) {
        // Ignora falhas de cancelamento de tarefas já finalizadas
      }
      activeRenderTasks.delete(pageNum);
    }

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    let renderScale = Math.min(Math.max(dpr, 1), 2.0);

    // Limite de segurança de memória para o canvas (evita tela branca/crash em iOS/Safari e alto zoom)
    const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;
    const estimatedPixels = viewport.width * renderScale * viewport.height * renderScale;
    if (estimatedPixels > MAX_CANVAS_PIXELS) {
      const downscaleFactor = Math.sqrt(MAX_CANVAS_PIXELS / estimatedPixels);
      renderScale = Math.max(1.0, renderScale * downscaleFactor);
    }

    canvas.width = Math.floor(viewport.width * renderScale);
    canvas.height = Math.floor(viewport.height * renderScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const canvasContext = canvas.getContext('2d', { alpha: false });
    const transform = renderScale !== 1 ? [renderScale, 0, 0, renderScale, 0, 0] : null;

    const renderTask = page.render({
      canvasContext,
      viewport,
      transform,
    });

    activeRenderTasks.set(pageNum, renderTask);

    try {
      await renderTask.promise;
    } catch (error) {
      if (error?.name !== 'RenderingCancelledException') {
        throw error;
      }
    } finally {
      if (activeRenderTasks.get(pageNum) === renderTask) {
        activeRenderTasks.delete(pageNum);
      }
    }
  },

  /**
   * Cancela todas as tarefas de renderização pendentes (ao trocar de documento ou redimensionar)
   */
  cancelAllPendingRenders() {
    for (const [pageNum, task] of activeRenderTasks.entries()) {
      try {
        if (task && typeof task.cancel === 'function') {
          task.cancel();
        }
      } catch (e) {}
    }
    activeRenderTasks.clear();
  },

  /**
   * Constrói placeholder com dimensões exatas da página para layout rápido e scroll virtualizado
   * @param {number} pageNum
   * @param {boolean} forceSingle
   * @param {HTMLElement} container
   * @returns {Promise<{ wrapper: HTMLElement, page: any, viewport: any }>}
   */
  async buildPageWrapperPlaceholder(pageNum, forceSingle, container) {
    const pdfDoc = appState.get('pdfDoc');
    if (!pdfDoc) throw new Error('Nenhum documento PDF aberto.');

    const page = await pdfDoc.getPage(pageNum);
    const zoomLevel = appState.get('zoomLevel');
    const scale = this.getScale(page.getViewport({ scale: 1 }), forceSingle, container, zoomLevel);
    const viewport = page.getViewport({ scale });

    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper page-placeholder';
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;
    wrapper.dataset.page = String(pageNum);

    return { wrapper, page, viewport };
  },

  /**
   * Preenche o wrapper DOM com Canvas, TextLayer e Grifos
   * @param {HTMLElement} wrapper
   * @param {any} page
   * @param {any} viewport
   * @param {number} pageNum
   * @param {Function} [onDrawHighlights]
   */
  async populatePageWrapper(wrapper, page, viewport, pageNum, onDrawHighlights) {
    if (wrapper.dataset.rendered === 'true') return;
    wrapper.dataset.rendered = 'true';
    wrapper.classList.remove('page-placeholder');

    // 1. Camada Canvas (Visual do PDF em Alta Resolução / Subpixel Sharpness)
    const canvas = document.createElement('canvas');
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

    // Renderiza o Canvas de forma segura e cancelável
    await this.renderCanvas(page, viewport, canvas, pageNum);

    // Renderiza Text Content no TextLayer
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

    // Desenha Grifos na camada de grifos
    if (typeof onDrawHighlights === 'function') {
      onDrawHighlights(pageNum, highlightLayer);
    }
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
    const { wrapper, page, viewport } = await this.buildPageWrapperPlaceholder(pageNum, forceSingle, container);
    await this.populatePageWrapper(wrapper, page, viewport, pageNum, onDrawHighlights);
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

  /**
   * Extrai a árvore do sumário (outline/bookmarks) com páginas resolvidas
   * @param {any} pdfDoc
   * @returns {Promise<Array<{ title: string, pageNum: number|null, items: Array }>>}
   */
  async getOutline(pdfDoc) {
    if (!pdfDoc || typeof pdfDoc.getOutline !== 'function') return [];
    try {
      const rawOutline = await pdfDoc.getOutline();
      if (!rawOutline || rawOutline.length === 0) return [];

      const resolveItems = async (items) => {
        const resolved = [];
        for (const item of items) {
          let pageNum = null;
          if (item.dest) {
            try {
              let destRef = item.dest;
              if (typeof destRef === 'string') {
                destRef = await pdfDoc.getDestination(destRef);
              }
              if (Array.isArray(destRef) && destRef.length > 0) {
                const pageIndex = await pdfDoc.getPageIndex(destRef[0]);
                pageNum = pageIndex + 1;
              }
            } catch (err) {
              console.warn('Não foi possível resolver destino:', item.title, err);
            }
          }

          const children = item.items && item.items.length > 0 ? await resolveItems(item.items) : [];
          resolved.push({
            title: item.title,
            pageNum,
            items: children,
          });
        }
        return resolved;
      };

      return await resolveItems(rawOutline);
    } catch (e) {
      console.warn('Erro ao extrair sumário do PDF:', e);
      return [];
    }
  },
};
