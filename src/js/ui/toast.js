/**
 * Notificações Toast Modernas e Acessíveis
 */

import { refreshIcons } from './dom.js';

const MAX_TOASTS = 3;

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

  const iconEl = document.createElement('i');
  iconEl.setAttribute('data-lucide', icon);
  iconEl.style.cssText = 'width: 16px; height: 16px; flex-shrink: 0;';
  const textEl = document.createElement('span');
  textEl.textContent = message;
  toast.append(iconEl, textEl);

  // Evita empilhamento excessivo: mantém no máximo 3 toasts visíveis
  const existing = container.querySelectorAll('.toast');
  if (existing.length >= MAX_TOASTS) {
    existing[0].remove();
  }

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
