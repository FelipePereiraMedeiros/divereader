/**
 * Serviço de Gerenciamento de Grifos (Criação, Colisão, Renderização e Sincronização)
 */

import { appState } from '../state.js';
import { Storage } from '../storage.js';
import { Highlight } from '../models/Highlight.js';
import { EVENTS } from '../constants.js';

export const HighlightService = {
  /**
   * Cria um novo grifo a partir da seleção de texto atual ou de um Range clonado
   * @param {Selection|Range} selectionOrRange
   * @param {string} [color='yellow']
   * @param {string} [customText]
   * @returns {{ success: boolean, highlight?: Highlight, message?: string }}
   */
  createFromSelection(selectionOrRange, color = 'yellow', customText = null) {
    if (!selectionOrRange) {
      return { success: false, message: 'Selecione um texto antes de grifar.' };
    }

    let range;
    let textExtracted = '';

    if (typeof Range !== 'undefined' && selectionOrRange instanceof Range) {
      range = selectionOrRange;
      textExtracted = customText || range.toString();
    } else if (selectionOrRange.getRangeAt && selectionOrRange.rangeCount > 0) {
      if (selectionOrRange.isCollapsed || !selectionOrRange.toString().trim()) {
        return { success: false, message: 'Selecione um texto antes de grifar.' };
      }
      range = selectionOrRange.getRangeAt(0);
      textExtracted = customText || selectionOrRange.toString();
    } else {
      return { success: false, message: 'Selecione um texto antes de grifar.' };
    }

    textExtracted = textExtracted.replace(/[\r\n]+/g, ' ').trim();
    if (textExtracted.length < 2) {
      return { success: false, message: 'Selecione um texto válido para grifar.' };
    }

    const rects = range.getClientRects();

    let container = range.commonAncestorContainer;
    if (container.nodeType === 3) container = container.parentNode;
    const wrapper = container.closest('.page-wrapper');

    if (!wrapper) {
      return { success: false, message: 'Seleção fora da área do documento.' };
    }

    const pageNum = parseInt(wrapper.dataset.page, 10);
    const wrapperRect = wrapper.getBoundingClientRect();
    const allHighlights = appState.get('highlights') || {};
    const pageHighlights = allHighlights[pageNum] || [];

    // Checagem de Colisão / Duplo Grifo
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const centerX = (r.left - wrapperRect.left + r.width / 2) / wrapperRect.width;
      const centerY = (r.top - wrapperRect.top + r.height / 2) / wrapperRect.height;

      const isCollision = pageHighlights.some((h) => h.containsPoint(centerX, centerY));
      if (isCollision) {
        try {
          const winSel = window.getSelection();
          if (winSel && typeof winSel.removeAllRanges === 'function') {
            winSel.removeAllRanges();
          }
        } catch (err) {}
        return { success: false, message: 'Este trecho já foi grifado.' };
      }
    }

    const highlightId = `hl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const rawRects = [];

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const x = (r.left - wrapperRect.left) / wrapperRect.width;
      const y = (r.top - wrapperRect.top) / wrapperRect.height;
      const width = r.width / wrapperRect.width;
      const height = r.height / wrapperRect.height;

      if (width > 0.002 && height > 0.002) {
        rawRects.push({ x, y, width, height });
      }
    }

    // Consolida múltiplos micro-retângulos de palavras em um único retângulo contínuo por linha
    const normalizedRects = this.consolidateRectsByLine(rawRects);

    if (normalizedRects.length === 0) {
      return { success: false, message: 'Não foi possível capturar as coordenadas do grifo.' };
    }

    const newHighlight = new Highlight({
      id: highlightId,
      pageNum,
      text: textExtracted,
      rects: normalizedRects,
      color,
    });

    const updatedHighlights = {
      ...allHighlights,
      [pageNum]: [...pageHighlights, newHighlight],
    };

    appState.set({ highlights: updatedHighlights }, EVENTS.HIGHLIGHTS_UPDATED);
    Storage.saveHighlights(appState.get('fileKey'), updatedHighlights);

    // Limpa a seleção azul nativa de forma segura
    try {
      const winSel = window.getSelection();
      if (winSel && typeof winSel.removeAllRanges === 'function') {
        winSel.removeAllRanges();
      }
    } catch (err) {}

    // Redesenha a camada na página visível imediatamente
    const pageWrapper = wrapper || document.querySelector(`.page-wrapper[data-page="${pageNum}"]`);
    if (pageWrapper) {
      const layer = pageWrapper.querySelector('.highlight-layer');
      if (layer) {
        this.drawPageHighlights(pageNum, layer);
      }
    }

    return { success: true, highlight: newHighlight };
  },

  /**
   * Consolida múltiplos retângulos adjacentes ou de palavras na mesma linha em um único bloco contínuo
   * @param {Array<{ x: number, y: number, width: number, height: number }>} rawRects
   * @returns {Array<{ x: number, y: number, width: number, height: number }>}
   */
  consolidateRectsByLine(rawRects) {
    if (!rawRects || rawRects.length === 0) return [];

    // Ordena de cima para baixo (Y) e da esquerda para a direita (X)
    const sorted = [...rawRects].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > 0.008) return yDiff;
      return a.x - b.x;
    });

    const lines = [];

    sorted.forEach((r) => {
      // Procura se pertence a uma linha já mapeada
      const line = lines.find((group) => {
        const overlapMin = Math.max(group.minY, r.y);
        const overlapMax = Math.min(group.maxY, r.y + r.height);
        const overlap = overlapMax - overlapMin;
        const minHeight = Math.min(group.maxY - group.minY, r.height);
        return overlap > minHeight * 0.35;
      });

      if (line) {
        line.rects.push(r);
        line.minX = Math.min(line.minX, r.x);
        line.maxX = Math.max(line.maxX, r.x + r.width);
        line.minY = Math.min(line.minY, r.y);
        line.maxY = Math.max(line.maxY, r.y + r.height);
      } else {
        lines.push({
          rects: [r],
          minX: r.x,
          maxX: r.x + r.width,
          minY: r.y,
          maxY: r.y + r.height,
        });
      }
    });

    // Retorna retângulos unificados contínuos por linha com leve respiro vertical para cobrir ascendentes e descendentes
    return lines.map((line) => {
      const rawHeight = line.maxY - line.minY;
      const vPad = rawHeight * 0.04;
      const y = Math.max(0, line.minY - vPad);
      const height = Math.min(1 - y, rawHeight + vPad * 2);

      return {
        x: Math.max(0, line.minX),
        y,
        width: Math.min(1 - line.minX, line.maxX - line.minX),
        height,
      };
    });
  },

  /**
   * Desenha os grifos na camada visual da página
   * @param {number} pageNum
   * @param {HTMLElement} layerNode
   */
  drawPageHighlights(pageNum, layerNode) {
    if (!layerNode) return;
    layerNode.innerHTML = '';
    const allHighlights = appState.get('highlights') || {};
    const hList = allHighlights[pageNum] || [];

    hList.forEach((h) => {
      // Garante renderização contínua mesmo para grifos carregados do storage antigo
      const continuousRects = this.consolidateRectsByLine(h.rects);

      continuousRects.forEach((rect) => {
        const mark = document.createElement('div');
        const colorClass = h.color ? `highlight-${h.color}` : 'highlight-yellow';
        mark.className = `highlight-rect ${colorClass}`;
        mark.dataset.highlightId = h.id;
        mark.dataset.pageNum = String(pageNum);
        mark.dataset.color = h.color || 'yellow';
        mark.style.left = `${rect.x * 100}%`;
        mark.style.top = `${rect.y * 100}%`;
        mark.style.width = `${rect.width * 100}%`;
        mark.style.height = `${rect.height * 100}%`;
        mark.title = h.text ? `"${h.text}" (Duplo clique para opções)` : 'Grifo';

        layerNode.appendChild(mark);
      });
    });
  },

  /**
   * Localiza um grifo pelo ID na página
   * @param {number} pageNum
   * @param {string} highlightId
   * @returns {Highlight|null}
   */
  getHighlight(pageNum, highlightId) {
    const allHighlights = appState.get('highlights') || {};
    const pageList = allHighlights[pageNum] || [];
    return pageList.find((h) => h.id === highlightId) || null;
  },

  /**
   * Atualiza a cor de um grifo existente
   * @param {number} pageNum
   * @param {string} highlightId
   * @param {string} newColor
   */
  updateHighlightColor(pageNum, highlightId, newColor) {
    const allHighlights = appState.get('highlights') || {};
    const pageHighlights = allHighlights[pageNum] || [];

    const updatedPage = pageHighlights.map((h) => {
      if (h.id === highlightId) {
        return new Highlight({
          id: h.id,
          pageNum: h.pageNum,
          text: h.text,
          rects: h.rects,
          color: newColor,
          note: h.note,
          createdAt: h.createdAt,
        });
      }
      return h;
    });

    const updatedHighlights = {
      ...allHighlights,
      [pageNum]: updatedPage,
    };

    appState.set({ highlights: updatedHighlights }, EVENTS.HIGHLIGHTS_UPDATED);
    Storage.saveHighlights(appState.get('fileKey'), updatedHighlights);

    const wrapper = document.querySelector(`.page-wrapper[data-page="${pageNum}"]`);
    if (wrapper) {
      const layer = wrapper.querySelector('.highlight-layer');
      if (layer) this.drawPageHighlights(pageNum, layer);
    }
  },

  /**
   * Atualiza a anotação/comentário personalizado de um grifo
   * @param {number} pageNum
   * @param {string} highlightId
   * @param {string} note
   */
  updateHighlightNote(pageNum, highlightId, note) {
    const allHighlights = appState.get('highlights') || {};
    const pageList = allHighlights[pageNum] || [];

    const updatedList = pageList.map((h) => {
      if (h.id === highlightId) {
        h.note = note;
      }
      return h;
    });

    const updatedHighlights = {
      ...allHighlights,
      [pageNum]: updatedList,
    };

    appState.set({ highlights: updatedHighlights }, EVENTS.HIGHLIGHTS_UPDATED);
    Storage.saveHighlights(appState.get('fileKey'), updatedHighlights);
  },

  /**
   * Remove um grifo estruturado
   * @param {number} pageNum
   * @param {string} highlightId
   */
  deleteHighlight(pageNum, highlightId) {
    const allHighlights = appState.get('highlights') || {};
    const pageList = allHighlights[pageNum] || [];

    const filtered = pageList.filter((h) => h.id !== highlightId);
    const updatedHighlights = {
      ...allHighlights,
      [pageNum]: filtered,
    };

    appState.set({ highlights: updatedHighlights }, EVENTS.HIGHLIGHTS_UPDATED);
    Storage.saveHighlights(appState.get('fileKey'), updatedHighlights);

    // Redesenha a camada na página visível
    const pageWrapper = document.querySelector(`.page-wrapper[data-page="${pageNum}"]`);
    if (pageWrapper) {
      const layer = pageWrapper.querySelector('.highlight-layer');
      if (layer) this.drawPageHighlights(pageNum, layer);
    }
  },

  /**
   * Pisca visualmente os retângulos do grifo selecionado no leitor
   * @param {number} pageNum
   * @param {string} highlightId
   */
  flashHighlight(pageNum, highlightId) {
    const marks = document.querySelectorAll(
      `.highlight-rect[data-highlight-id="${highlightId}"]`,
    );
    marks.forEach((m) => {
      m.classList.add('highlight-pulse');
      setTimeout(() => m.classList.remove('highlight-pulse'), 2400);
    });
  },

  /**
   * Identifica um grifo a partir das coordenadas do clique ou elemento alvo
   * @param {number} clientX
   * @param {number} clientY
   * @param {HTMLElement} [targetEl]
   * @returns {{ highlight: Highlight, pageNum: number, highlightId: string } | null}
   */
  findHighlightAtPoint(clientX, clientY, targetEl = null) {
    // 1. Tenta encontrar elemento .highlight-rect no alvo direto
    let mark = targetEl?.closest?.('.highlight-rect') || null;

    // 2. Se não encontrou no target direto, busca nos elementos sob o cursor (através da textLayer)
    if (!mark && typeof document !== 'undefined' && typeof document.elementsFromPoint === 'function') {
      const elements = document.elementsFromPoint(clientX, clientY) || [];
      mark = elements.find((el) => el.classList && el.classList.contains('highlight-rect')) || null;
    }

    if (mark) {
      const highlightId = mark.dataset.highlightId;
      const pageNum = parseInt(mark.dataset.pageNum, 10);
      if (highlightId && !isNaN(pageNum)) {
        const highlight = this.getHighlight(pageNum, highlightId);
        if (highlight) {
          return { highlight, pageNum, highlightId };
        }
      }
    }

    // 3. Fallback geométrico: verifica colisão de coordenadas no .page-wrapper
    let pageWrapper = targetEl?.closest?.('.page-wrapper') || null;
    if (!pageWrapper && typeof document !== 'undefined') {
      if (typeof document.elementsFromPoint === 'function') {
        const elements = document.elementsFromPoint(clientX, clientY) || [];
        pageWrapper = elements.find((el) => el.classList && el.classList.contains('page-wrapper')) || null;
      }
      if (!pageWrapper) {
        pageWrapper = document.querySelector('.page-wrapper');
      }
    }

    if (pageWrapper) {
      const pageNum = parseInt(pageWrapper.dataset.page, 10);
      if (!isNaN(pageNum)) {
        const rect = pageWrapper.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const xPercent = (clientX - rect.left) / rect.width;
          const yPercent = (clientY - rect.top) / rect.height;

          const allHighlights = appState.get('highlights') || {};
          const pageHighlights = allHighlights[pageNum] || [];

          const match = pageHighlights.find((h) => {
            if (typeof h.containsPoint === 'function') {
              return h.containsPoint(xPercent, yPercent, 0.005);
            }
            return (
              Array.isArray(h.rects) &&
              h.rects.some(
                (r) =>
                  xPercent >= r.x - 0.005 &&
                  xPercent <= r.x + r.width + 0.005 &&
                  yPercent >= r.y - 0.005 &&
                  yPercent <= r.y + r.height + 0.005,
              )
            );
          });

          if (match) {
            return { highlight: match, pageNum, highlightId: match.id };
          }
        }
      }
    }

    return null;
  },
};
