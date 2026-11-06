/**
 * Tooltip Flutuante de Seleção Rápida com Cores Semânticas
 * Posicionamento Padrão Inferior (Bottom-First) para Imunidade Total a Menus Nativos (Opera, Edge, Mobile) e Extensões
 */

import { HighlightService } from '../services/highlightService.js';
import { NotebookView } from './notebookView.js';
import { showToast } from './toast.js';
import { DOM, refreshIcons } from './dom.js';

export const QuickHighlightTooltip = {
  tooltipEl: null,
  lastSelectionRect: null,
  savedRange: null,
  savedText: '',

  /** Callback opcional: ({ pageNum, point }) => void para "Ouvir a partir daqui" */
  onReadFromSelection: null,

  init(options = {}) {
    if (typeof options.onReadFromSelection === 'function') {
      this.onReadFromSelection = options.onReadFromSelection;
    }
    this.tooltipEl = DOM.quickHighlightTooltip;
    if (!this.tooltipEl) return;

    // Impede que o mousedown nos botões do tooltip limpe a seleção de texto no PDF
    this.tooltipEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    // Trata clique nas amostras de cores
    this.tooltipEl.addEventListener('click', (e) => {
      if (e.target.closest('#btn-tts-from-selection')) {
        e.preventDefault();
        e.stopPropagation();
        this.readFromSelection();
        return;
      }
      const swatchBtn = e.target.closest('.color-swatch-btn');
      if (swatchBtn) {
        e.preventDefault();
        e.stopPropagation();
        const color = swatchBtn.dataset.color || 'yellow';
        this.executeHighlight(color);
      }
    });

    // Monitora a seleção de texto no documento
    document.addEventListener('selectionchange', () => {
      this.handleSelectionChange();
    });

    // Fecha ao clicar fora
    document.addEventListener('mousedown', (e) => {
      if (this.tooltipEl && !this.tooltipEl.contains(e.target)) {
        this.hide();
      }
    });
    document.addEventListener(
      'touchstart',
      (e) => {
        if (this.tooltipEl && !this.tooltipEl.contains(e.target)) {
          this.hide();
        }
      },
      { passive: true },
    );
  },

  handleSelectionChange() {
    if (typeof document !== 'undefined' && document.querySelector('dialog[open]')) {
      this.hide();
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      this.hide();
      return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText.length < 2) {
      this.hide();
      return;
    }

    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) {
        this.hide();
      }

      // Salva cópia do range e do texto para garantir que o clique nas cores não perca a seleção
      this.savedRange = range.cloneRange();
      this.savedText = selectedText;
      this.lastSelectionRect = rect;

      const centerX = rect.left + rect.width / 2;
      const bottomSpace = window.innerHeight - rect.bottom;

      // Se o espaço abaixo for insuficiente (< 70px), posiciona acima da seleção
      const placement = bottomSpace < 70 ? 'top' : 'bottom';
      const targetY = placement === 'bottom' ? rect.bottom + 8 : rect.top - 8;
      const targetX = centerX;

      this.show(targetX, targetY, placement);
    } catch (e) {
      this.hide();
    }
  },

  /**
   * Exibe o menu flutuante na posição calculada com classe de alinhamento
   * @param {number} x
   * @param {number} y
   * @param {'top'|'bottom'} [placement='bottom']
   */
  show(x, y, placement = 'bottom') {
    if (!this.tooltipEl) return;
    this.tooltipEl.style.left = `${x}px`;
    this.tooltipEl.style.top = `${y}px`;
    this.tooltipEl.classList.toggle('placement-bottom', placement === 'bottom');
    this.tooltipEl.classList.toggle('placement-top', placement === 'top');
    this.tooltipEl.style.display = 'flex';
  },

  hide() {
    this.lastSelectionRect = null;
    if (!this.tooltipEl) return;
    this.tooltipEl.style.display = 'none';
  },

  /**
   * Localiza o início da seleção na página (coordenadas normalizadas) e inicia a leitura dali
   */
  readFromSelection() {
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 && !sel.isCollapsed ? sel.getRangeAt(0) : this.savedRange;
    this.hide();
    if (!range || typeof this.onReadFromSelection !== 'function') return;

    let node = range.startContainer;
    if (node && node.nodeType === 3) node = node.parentNode;
    const wrapper = node?.closest?.('.page-wrapper');
    const firstRect = range.getClientRects?.()[0];
    if (!wrapper || !firstRect) return;

    const wr = wrapper.getBoundingClientRect();
    const point = {
      x: (firstRect.left - wr.left + 1) / wr.width,
      y: (firstRect.top - wr.top + firstRect.height / 2) / wr.height,
    };
    window.getSelection()?.removeAllRanges();
    this.onReadFromSelection({ pageNum: parseInt(wrapper.dataset.page, 10), point });
  },

  executeHighlight(color = 'yellow') {
    const currentSelection = window.getSelection();
    let target = null;
    let text = this.savedText;

    if (currentSelection && !currentSelection.isCollapsed && currentSelection.toString().trim().length >= 2) {
      target = currentSelection;
      text = currentSelection.toString();
    } else if (this.savedRange) {
      target = this.savedRange;
    }

    const result = HighlightService.createFromSelection(target, color, text);

    this.hide();
    this.savedRange = null;
    this.savedText = '';

    if (result.success) {
      NotebookView.render();
      const colorLabels = {
        yellow: 'Amarelo (Conceito)',
        green: 'Verde (Exemplo)',
        pink: 'Rosa (Dúvida)',
        blue: 'Azul (Citação)',
        purple: 'Roxo (Tese)',
      };
      showToast(`Grifado em ${colorLabels[color] || color}!`, 'book-marked');
    } else {
      showToast(result.message || 'Não foi possível grifar.', 'alert-circle');
    }
  },
};
