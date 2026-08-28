/**
 * Serviço de Backup (Exportação e Importação de Dados de Estudo em JSON)
 */

import { Storage } from '../storage.js';
import { appState } from '../state.js';
import { EVENTS } from '../constants.js';

export const BackupService = {
  /**
   * Exporta todo o histórico de estudos do navegador em formato JSON
   * @returns {{ success: boolean, count?: number, totalDocuments?: number, message?: string }}
   */
  exportBackup() {
    const backupData = Storage.getAllDataForBackup();
    const keysCount = Object.keys(backupData.data || {}).length;

    if (keysCount === 0) {
      return { success: false, message: 'Não há dados de estudo para exportar.' };
    }

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    link.download = `DiveReader_Backup_${dateStr}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    return {
      success: true,
      count: keysCount,
      totalDocuments: backupData.totalDocuments || 1,
    };
  },

  /**
   * Importa e restaura dados a partir de um arquivo JSON (qualquer versão)
   * @param {File} file
   * @returns {Promise<{ success: boolean, count?: number, documentsCount?: number, message?: string }>}
   */
  async importBackup(file) {
    if (!file) return { success: false, message: 'Nenhum arquivo selecionado.' };

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const { count, documentsCount, fileKeys } = Storage.restoreBackup(data);

      if (count > 0) {
        // Se houver um PDF aberto atualmente, recarrega os dados imediatamente
        const currentFileKey = appState.get('fileKey');
        if (currentFileKey) {
          const reloadedHighlights = Storage.loadHighlights(currentFileKey);
          const reloadedNotes = Storage.loadManualNotes(currentFileKey);

          appState.set(
            {
              highlights: reloadedHighlights,
              manualNotes: reloadedNotes,
            },
            EVENTS.HIGHLIGHTS_UPDATED,
          );
        }

        return {
          success: true,
          count,
          documentsCount,
        };
      } else {
        return {
          success: false,
          message: 'O arquivo selecionado não contém dados válidos do DiveReader.',
        };
      }
    } catch (err) {
      console.error('Erro ao importar backup:', err);
      return {
        success: false,
        message: 'Arquivo de backup inválido ou corrompido.',
      };
    }
  },
};
