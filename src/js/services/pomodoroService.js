/**
 * Serviço do Temporizador Pomodoro
 */

import { POMODORO_DEFAULTS, EVENTS } from '../constants.js';
import { appState } from '../state.js';

export const PomodoroService = {
  totalSeconds: POMODORO_DEFAULTS.WORK_MINUTES * 60,
  remainingSeconds: POMODORO_DEFAULTS.WORK_MINUTES * 60,
  isRunning: false,
  timerId: null,

  /**
   * Alterna entre Iniciar e Pausar o cronômetro
   * @returns {boolean} Novo estado (true = rodando, false = pausado)
   */
  toggle() {
    if (this.isRunning) {
      this.pause();
      return false;
    } else {
      this.start();
      return true;
    }
  },

  /**
   * Inicia o cronômetro
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    this.timerId = setInterval(() => {
      if (this.remainingSeconds > 0) {
        this.remainingSeconds--;
        appState.emit(EVENTS.POMODORO_TICK, this.getState());
      } else {
        this.pause();
        appState.emit(EVENTS.POMODORO_FINISHED, this.getState());
      }
    }, 1000);

    appState.emit(EVENTS.POMODORO_TICK, this.getState());
  },

  /**
   * Pausa o cronômetro
   */
  pause() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isRunning = false;
    appState.emit(EVENTS.POMODORO_TICK, this.getState());
  },

  /**
   * Ajusta o tempo restante adicionando ou subtraindo minutos
   * @param {number} minutes
   */
  adjust(minutes) {
    if (this.isRunning) return;

    this.remainingSeconds += minutes * 60;
    if (this.remainingSeconds < 60) this.remainingSeconds = 60;

    this.totalSeconds = this.remainingSeconds;
    appState.emit(EVENTS.POMODORO_TICK, this.getState());
  },

  /**
   * Reinicia o Pomodoro com um valor em minutos
   * @param {number} minutes
   */
  reset(minutes = POMODORO_DEFAULTS.WORK_MINUTES) {
    this.pause();
    this.totalSeconds = minutes * 60;
    this.remainingSeconds = this.totalSeconds;
    appState.emit(EVENTS.POMODORO_TICK, this.getState());
  },

  /**
   * Adiciona tempo de soneca (+5 minutos) e retoma o cronômetro
   * @param {number} [minutes=5]
   */
  snooze(minutes = POMODORO_DEFAULTS.SNOOZE_MINUTES) {
    this.remainingSeconds += minutes * 60;
    this.totalSeconds = Math.max(this.totalSeconds, this.remainingSeconds);
    this.start();
  },

  /**
   * Retorna o estado atual formatado
   * @returns {{ minutes: string, seconds: string, text: string, fraction: number, degrees: number, isRunning: boolean }}
   */
  getState() {
    const mins = Math.floor(this.remainingSeconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = (this.remainingSeconds % 60).toString().padStart(2, '0');
    const fraction = this.totalSeconds > 0 ? this.remainingSeconds / this.totalSeconds : 0;
    const degrees = (1 - fraction) * 360;

    return {
      minutes: mins,
      seconds: secs,
      text: `${mins}:${secs}`,
      fraction,
      degrees,
      isRunning: this.isRunning,
    };
  },
};
