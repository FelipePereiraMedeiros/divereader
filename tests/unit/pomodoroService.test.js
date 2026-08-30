import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PomodoroService } from '../../src/js/services/pomodoroService.js';

describe('Pomodoro Service', () => {
  beforeEach(() => {
    PomodoroService.reset(20);
  });

  afterEach(() => {
    PomodoroService.pause();
  });

  it('deve inicializar com 20 minutos e pausado', () => {
    const state = PomodoroService.getState();
    expect(state.text).toBe('20:00');
    expect(state.isRunning).toBe(false);
  });

  it('deve iniciar e pausar com o método toggle', () => {
    const started = PomodoroService.toggle();
    expect(started).toBe(true);
    expect(PomodoroService.getState().isRunning).toBe(true);

    const paused = PomodoroService.toggle();
    expect(paused).toBe(false);
    expect(PomodoroService.getState().isRunning).toBe(false);
  });

  it('deve ajustar o tempo para mais e para menos quando pausado', () => {
    PomodoroService.adjust(5);
    expect(PomodoroService.getState().text).toBe('25:00');

    PomodoroService.adjust(-10);
    expect(PomodoroService.getState().text).toBe('15:00');
  });

  it('não deve permitir tempo menor que 1 minuto no ajuste', () => {
    PomodoroService.adjust(-30);
    expect(PomodoroService.getState().text).toBe('01:00');
  });

  it('deve adicionar tempo de soneca (+5m) e iniciar automaticamente', () => {
    PomodoroService.reset(0);
    PomodoroService.snooze(5);
    const state = PomodoroService.getState();
    expect(state.text).toBe('05:00');
    expect(state.isRunning).toBe(true);
  });
});
