/**
 * Notificações Toast Modernas e Acessíveis
 */

import { refreshIcons } from './dom.js';

export function showToast(message, icon = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  toast.innerHTML = `
    <i data-lucide="${icon}" style="width: 16px; height: 16px; flex-shrink: 0;"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  refreshIcons(toast);

  // Animação de entrada
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Remoção com transição
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300);
  }, duration);
}
