/**
 * Serviço de Anotações, Fichamento e Exportação em Markdown
 */

import { appState } from '../state.js';
import { Storage } from '../storage.js';
import { EVENTS } from '../constants.js';
import { PageSynthesis } from '../models/Note.js';

export const NoteService = {
  /**
   * Salva a síntese manual da página atual utilizando o modelo PageSynthesis
   * @param {number} pageNum
   * @param {string|PageSynthesis} content
   */
  savePageSynthesis(pageNum, content) {
    const allNotes = appState.get('manualNotes') || {};
    const textContent = typeof content === 'string' ? content : (content?.content || '');
    const instance = new PageSynthesis({
      pageNum: Number(pageNum),
      content: textContent,
      updatedAt: new Date().toISOString(),
    });

    const updated = {
      ...allNotes,
      [pageNum]: instance.toJSON(),
    };

    appState.set({ manualNotes: updated }, EVENTS.NOTES_UPDATED);
    Storage.saveManualNotes(appState.get('fileKey'), updated);
  },

  /**
   * Obtém a síntese manual de uma página
   * @param {number} pageNum
   * @returns {string}
   */
  getPageSynthesis(pageNum) {
    const allNotes = appState.get('manualNotes') || {};
    const note = allNotes[pageNum];
    if (!note) return '';
    return typeof note === 'string' ? note : (note.content || '');
  },

  /**
   * Compila o fichamento global estruturado de todas as páginas
   * @returns {string} Texto compilado formatado
   */
  compileGlobalDossier() {
    const fileName = appState.get('fileName') || 'Documento';
    const highlights = appState.get('highlights') || {};
    const manualNotes = appState.get('manualNotes') || {};

    // Coleta todas as páginas com grifos ou anotações
    const pageSet = new Set([
      ...Object.keys(highlights).map(Number),
      ...Object.keys(manualNotes).map(Number),
    ]);

    const pages = Array.from(pageSet).sort((a, b) => a - b);
    let output = '';
    let hasContent = false;

    for (const p of pages) {
      const pageHighlights = highlights[p] || [];
      const rawSynthesis = manualNotes[p];
      const pageSynthesis = (typeof rawSynthesis === 'string' ? rawSynthesis : (rawSynthesis?.content || '')).trim();

      if (pageHighlights.length === 0 && !pageSynthesis) continue;

      hasContent = true;
      output += `==============================\n`;
      output += `📄 PÁGINA ${p}\n`;
      output += `==============================\n\n`;

      // 1. Grifos da página
      if (pageHighlights.length > 0) {
        output += `📌 Citações Grifadas:\n`;
        pageHighlights.forEach((h, idx) => {
          output += `  [${idx + 1}] "${h.text}"\n`;
          if (h.note && h.note.trim()) {
            output += `      💬 Anotação: ${h.note.trim()}\n`;
          }
        });
        output += '\n';
      }

      // 2. Síntese manual
      if (pageSynthesis) {
        output += `✍️ Síntese / Anotações:\n`;
        output += `${pageSynthesis}\n\n`;
      }
    }

    return hasContent ? output.trim() : 'Nenhuma anotação ou grifo feito ainda.';
  },

  /**
   * Gera o arquivo Markdown formatado para download
   * @returns {string}
   */
  generateMarkdown() {
    const fileName = appState.get('fileName') || 'Documento';
    const highlights = appState.get('highlights') || {};
    const manualNotes = appState.get('manualNotes') || {};

    const pageSet = new Set([
      ...Object.keys(highlights).map(Number),
      ...Object.keys(manualNotes).map(Number),
    ]);

    const pages = Array.from(pageSet).sort((a, b) => a - b);

    // Frontmatter padrão para interoperabilidade (Obsidian / Zettelkasten / PKM)
    let md = `---\n`;
    md += `title: "${fileName}"\n`;
    md += `type: reading-notes\n`;
    md += `source: DiveReader\n`;
    md += `export_date: ${new Date().toISOString()}\n`;
    md += `total_annotated_pages: ${pages.length}\n`;
    md += `---\n\n`;

    md += `# 📖 Fichamento de Leitura: ${fileName}\n\n`;

    for (const p of pages) {
      const pageHighlights = highlights[p] || [];
      const rawSynthesis = manualNotes[p];
      const pageSynthesis = (typeof rawSynthesis === 'string' ? rawSynthesis : (rawSynthesis?.content || '')).trim();

      if (pageHighlights.length === 0 && !pageSynthesis) continue;

      md += `## 📄 Página ${p}\n\n`;

      if (pageHighlights.length > 0) {
        md += `### 📌 Citações & Grifos\n\n`;
        pageHighlights.forEach((h) => {
          const tag = h.color ? ` #${h.color}` : '';
          md += `> "${h.text}"${tag}\n`;
          if (h.note && h.note.trim()) {
            md += `>\n> **Nota:** *${h.note.trim()}*\n`;
          }
          md += `\n`;
        });
      }

      if (pageSynthesis) {
        md += `### ✍️ Síntese da Página\n\n`;
        md += `${pageSynthesis}\n\n`;
      }

      md += `---\n\n`;
    }

    return md;
  },

  /**
   * Dispara o download do Fichamento em formato .md
   * @returns {boolean}
   */
  downloadMarkdownDossier() {
    const md = this.generateMarkdown();
    const fileName = appState.get('fileName') || 'Anotacoes';
    const cleanName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Fichamento_${cleanName}_${new Date().toISOString().slice(0, 10)}.md`;

    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  },

  /**
   * Copia o fichamento compilado para a área de transferência
   * @returns {Promise<boolean>}
   */
  async copyToClipboard() {
    const text = this.compileGlobalDossier();
    if (text.includes('Nenhuma anotação')) return false;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  },
};
