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

  init() {
    this.tooltipEl = DOM.quickHighlightTooltip;
    if (!this.tooltipEl) return;

    // Impede que o mousedown nos botões do tooltip limpe a seleção de texto no PDF
    this.tooltipEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    // Trata clique nas amostras de cores
    this.tooltipEl.addEventListener('click', (e) => {
      const swatchBtn = e.target.closest('.color-swatch-btn');
      if (swatchBtn) {
        e.preventDefault();
        e.stopPropagation();
        const color = swatchBtn.dataset.color || 'yellow';
        this.executeHighlight(color);
        return;
      }

      const defaultBtn = e.target.closest('#btn-quick-highlight');
      if (defaultBtn) {
        e.preventDefault();
        e.stopPropagation();
        this.executeHighlight('yellow');
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

  /**
   * Identifica se há algum elemento estranho (extensão de navegador) nas coordenadas fornecidas
   * @param {number} x Coordenada X na viewport
   * @param {number} y Coordenada Y na viewport
   * @returns {boolean}
   */
  isForeignOverlayAt(x, y) {
    if (typeof document === 'undefined' || !document.elementsFromPoint) return false;
    try {
      const elements = document.elementsFromPoint(x, y);
      if (!elements || elements.length === 0) return false;

      for (const el of elements) {
        if (!el || el === document.body || el === document.documentElement) continue;

        // Elementos legítimos do DiveReader são ignorados
        if (
          el.closest('#book-container') ||
          el.closest('#sidebar') ||
          el.closest('#top-menu') ||
          el.closest('#mobile-nav-bar') ||
          el.closest('#pomodoro-container') ||
          el.closest('#quick-highlight-tooltip') ||
          el.closest('.page-wrapper') ||
          el.closest('#drag-overlay') ||
          el.closest('#toast-container')
        ) {
          continue;
        }

        const tag = el.tagName.toLowerCase();
        const id = (el.id || '').toLowerCase();
        const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';

        if (
          tag.includes('-') ||
          id.includes('translate') ||
          id.includes('grammarly') ||
          id.includes('deepl') ||
          id.includes('popover') ||
          id.includes('tooltip') ||
          className.includes('translate') ||
          className.includes('grammarly') ||
          className.includes('deepl') ||
          className.includes('popup') ||
          className.includes('popover') ||
          window.getComputedStyle(el).position === 'fixed' ||
          window.getComputedStyle(el).position === 'absolute'
        ) {
          return true;
        }
      }
    } catch (err) {
      // Coordenadas fora da viewport
    }
    return false;
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

      // Por padrão, posicionamos SEMPRE ABAIXO (placement = 'bottom').
      // Motivo arquitetural: Navegadores como Opera (popup de pesquisa/cópia nativo), Edge (mini-menu)
      // e navegadores mobile abrem seus popups nativos SEMPRE ACIMA do texto selecionado.
      // Posicionando abaixo, o DiveReader fica 100% visível, acessível e sem nenhuma sobreposição!
      const placement = bottomSpace < 60 ? 'top' : 'bottom';

      const targetY = placement === 'bottom'
        ? window.scrollY + rect.bottom
        : window.scrollY + rect.top;
      const targetX = window.scrollX + centerX;

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
    refreshIcons(this.tooltipEl);
  },

  hide() {
    this.lastSelectionRect = null;
    if (!this.tooltipEl) return;
    this.tooltipEl.style.display = 'none';
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
