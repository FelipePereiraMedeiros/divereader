/**
 * Modelo de Anotação Manual / Síntese de Página
 */

export class PageSynthesis {
  /**
   * @param {Object} params
   * @param {number} params.pageNum
   * @param {string} [params.content='']
   * @param {string} [params.updatedAt]
   */
  constructor({
    pageNum,
    content = '',
    updatedAt = new Date().toISOString(),
  }) {
    this.pageNum = Number(pageNum);
    this.content = content;
    this.updatedAt = updatedAt;
  }

  /**
   * Retorna o conteúdo textual da síntese para interoperabilidade
   * @returns {string}
   */
  toString() {
    return this.content;
  }

  toJSON() {
    return {
      pageNum: this.pageNum,
      content: this.content,
      updatedAt: this.updatedAt,
    };
  }

  static fromJSON(data) {
    if (!data) return null;
    if (typeof data === 'string') {
      return new PageSynthesis({ pageNum: 0, content: data });
    }
    return new PageSynthesis(data);
  }
}
