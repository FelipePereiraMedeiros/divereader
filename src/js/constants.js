/**
 * Constantes globais da aplicação DiveReader Pro
 */

export const STORAGE_PREFIX = 'dr2_';
export const STORAGE_VERSION = '2.0';

export const THEMES = {
  LIGHT: 'theme-light',
  SEPIA: 'theme-sepia',
  DARK: 'theme-dark',
};

export const POMODORO_DEFAULTS = {
  WORK_MINUTES: 20,
  BREAK_MINUTES: 5,
  SNOOZE_MINUTES: 5,
};

export const ZOOM_LIMITS = {
  MIN: 1.0,
  MAX: 4.0,
  STEP: 0.25,
};

export const EVENTS = {
  PAGE_CHANGED: 'page_changed',
  HIGHLIGHTS_UPDATED: 'highlights_updated',
  NOTES_UPDATED: 'notes_updated',
  DOCUMENT_LOADED: 'document_loaded',
  THEME_CHANGED: 'theme_changed',
  POMODORO_TICK: 'pomodoro_tick',
  POMODORO_FINISHED: 'pomodoro_finished',
};
