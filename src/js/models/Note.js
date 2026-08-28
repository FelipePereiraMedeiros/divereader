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

  toJSON() {
    return {
      pageNum: this.pageNum,
      content: this.content,
      updatedAt: this.updatedAt,
    };
  }

  static fromJSON(data) {
    return new PageSynthesis(data);
  }
}
