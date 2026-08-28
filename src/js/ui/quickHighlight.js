/**
 * Tooltip Flutuante de Seleção Rápida (Otimizado para Mobile e Telas Touch)
 */

import { HighlightService } from '../services/highlightService.js';
import { NotebookView } from './notebookView.js';
import { showToast } from './toast.js';
import { DOM, refreshIcons } from './dom.js';

export const QuickHighlightTooltip = {
  tooltipEl: null,

  init() {
    this.tooltipEl = DOM.quickHighlightTooltip;
    if (!this.tooltipEl) return;

    if (DOM.btnQuickHighlight) {
      DOM.btnQuickHighlight.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.executeHighlight();
      };
    }

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
    document.addEventListener('touchstart', (e) => {
      if (this.tooltipEl && !this.tooltipEl.contains(e.target)) {
        this.hide();
      }
    }, { passive: true });
  },

  handleSelectionChange() {
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
        return;
      }

      // Posiciona o tooltip logo acima da seleção
      const top = window.scrollY + rect.top;
      const left = window.scrollX + rect.left + rect.width / 2;

      this.show(left, top);
    } catch (e) {
      this.hide();
    }
  },

  show(x, y) {
    if (!this.tooltipEl) return;
    this.tooltipEl.style.left = `${x}px`;
    this.tooltipEl.style.top = `${y}px`;
    this.tooltipEl.style.display = 'flex';
    refreshIcons(this.tooltipEl);
  },

  hide() {
    if (!this.tooltipEl) return;
    this.tooltipEl.style.display = 'none';
  },

  executeHighlight() {
    const selection = window.getSelection();
    const result = HighlightService.createFromSelection(selection);

    this.hide();

    if (result.success) {
      NotebookView.render();
      showToast('Trecho grifado e salvo no Caderno!', 'book-marked');
    } else {
      showToast(result.message || 'Não foi possível grifar.', 'alert-circle');
    }
  },
};
