/**
 * Sistema de Diálogos e Modais de Confirmação (com suporte a <dialog> acessível)
 */

import { refreshIcons } from './dom.js';

export const DialogService = {
  /**
   * Exibe um modal de confirmação para exclusão de grifo (PDF ou Caderno)
   * @param {Object} params
   * @param {string} params.title
   * @param {string} params.message
   * @param {string} [params.quoteText='']
   * @param {boolean} [params.hasNote=false]
   * @param {string} [params.primaryActionText='Excluir do PDF e Caderno']
   * @param {string} [params.secondaryActionText='Remover apenas visual']
   * @returns {Promise<'delete-all'|'delete-one'|'cancel'>}
   */
  confirmHighlightDeletion({
    title = 'Excluir Grifo',
    message = 'Deseja remover este grifo?',
    quoteText = '',
    hasNote = false,
    primaryActionText = 'Excluir do PDF e do Caderno',
    secondaryActionText = 'Remover grifo, mas manter citação no Caderno',
  }) {
    return new Promise((resolve) => {
      let dialog = document.getElementById('confirm-dialog');
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'confirm-dialog';
        dialog.setAttribute('closedby', 'any');
        document.body.appendChild(dialog);
      }

      const quoteSnippet = quoteText
        ? `<div class="modal-quote-preview">"${quoteText.length > 180 ? quoteText.substring(0, 180) + '...' : quoteText}"</div>`
        : '';

      dialog.innerHTML = `
        <div class="modal-dialog-content">
          <div class="modal-header">
            <div class="icon-badge warning">
              <i data-lucide="help-circle" style="width: 22px; height: 22px;"></i>
            </div>
            <h3>${title}</h3>
          </div>
          <div class="modal-body">
            <p style="margin: 0 0 6px 0;">${message}</p>
            ${quoteSnippet}
          </div>
          <div class="modal-actions">
            <button id="modal-btn-primary" class="btn-danger">
              <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> ${primaryActionText}
            </button>
            ${
              secondaryActionText
                ? `<button id="modal-btn-secondary" class="btn-primary" style="background: transparent; color: var(--text-color); border: 1px solid var(--border-color);">
                    <i data-lucide="bookmark-minus" style="width: 14px; height: 14px;"></i> ${secondaryActionText}
                  </button>`
                : ''
            }
            <button id="modal-btn-cancel" class="btn-cancel">
              Cancelar
            </button>
          </div>
        </div>
      `;

      refreshIcons(dialog);

      // Light-dismiss fallback para navegadores antigos
      const lightDismissHandler = (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isInside =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isInside) {
          cleanup('cancel');
        }
      };

      const cleanup = (result) => {
        dialog.removeEventListener('click', lightDismissHandler);
        if (dialog.open) dialog.close();
        resolve(result);
      };

      dialog.addEventListener('click', lightDismissHandler);

      const btnPrimary = dialog.querySelector('#modal-btn-primary');
      const btnSecondary = dialog.querySelector('#modal-btn-secondary');
      const btnCancel = dialog.querySelector('#modal-btn-cancel');

      if (btnPrimary) btnPrimary.onclick = () => cleanup('delete-all');
      if (btnSecondary) btnSecondary.onclick = () => cleanup('delete-one');
      if (btnCancel) btnCancel.onclick = () => cleanup('cancel');

      dialog.oncancel = () => cleanup('cancel');

      dialog.showModal();
    });
  },
};
