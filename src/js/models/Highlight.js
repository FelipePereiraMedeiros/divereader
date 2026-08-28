/**
 * Modelo de Grifo (Highlight)
 */

export class Highlight {
  /**
   * @param {Object} params
   * @param {string} [params.id]
   * @param {number} params.pageNum
   * @param {string} params.text
   * @param {Array<{x: number, y: number, width: number, height: number}>} params.rects
   * @param {string} [params.color='yellow']
   * @param {string} [params.note='']
   * @param {string} [params.createdAt]
   */
  constructor({
    id = `hl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    pageNum,
    text = '',
    rects = [],
    color = 'yellow',
    note = '',
    createdAt = new Date().toISOString(),
  }) {
    this.id = id;
    this.pageNum = Number(pageNum);
    this.text = text.trim();
    this.rects = Array.isArray(rects) ? rects : [];
    this.color = color;
    this.note = note;
    this.createdAt = createdAt;
  }

  /**
   * Verifica se um ponto percentual (px, py) colide com algum dos retângulos deste grifo
   * @param {number} px
   * @param {number} py
   * @returns {boolean}
   */
  containsPoint(px, py) {
    return this.rects.some(
      (r) => px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height,
    );
  }

  /**
   * Serializa o grifo para persistência
   */
  toJSON() {
    return {
      id: this.id,
      pageNum: this.pageNum,
      text: this.text,
      rects: this.rects,
      color: this.color,
      note: this.note,
      createdAt: this.createdAt,
    };
  }

  /**
   * Cria instância a partir de dados salvos
   * @param {Object} data
   * @returns {Highlight}
   */
  static fromJSON(data) {
    return new Highlight(data);
  }
}
