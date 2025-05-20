/**
 * 俄罗斯方块类
 * 负责管理单个方块的状态和行为
 */
class Tetromino {
  /**
   * 构造函数
   * @param {string} type 方块类型（I、O、T、S、Z、J、L）
   */
  constructor(type) {
    if (!GAME_CONFIG.SHAPES[type]) {
      throw new Error(`Invalid tetromino type: ${type}`);
    }

    this.type = type;
    this.shape = deepClone(GAME_CONFIG.SHAPES[type]);
    this.color = type; // 直接存储类型，而不是颜色值
    this.x = 0;
    this.y = 0;
  }

  /**
   * 移动方块
   * @param {number} dx x方向移动距离
   * @param {number} dy y方向移动距离
   */
  move(dx, dy) {
    this.x += dx;
    this.y += dy;
  }

  /**
   * 旋转方块
   * @returns {Array<Array>} 旋转后的形状矩阵
   */
  rotate() {
    // 创建新的形状数组
    const rows = this.shape[0].length;
    const cols = this.shape.length;
    const newShape = Array(rows)
      .fill()
      .map(() => Array(cols).fill(0));

    // 执行旋转
    for (let y = 0; y < cols; y++) {
      for (let x = 0; x < rows; x++) {
        newShape[x][cols - 1 - y] = this.shape[y][x];
      }
    }

    return newShape;
  }

  /**
   * 获取方块的碰撞检测点
   * @returns {Array<{x: number, y: number}>} 碰撞检测点数组
   */
  getCollisionPoints() {
    const points = [];
    for (let y = 0; y < this.shape.length; y++) {
      for (let x = 0; x < this.shape[y].length; x++) {
        if (this.shape[y][x]) {
          points.push({
            x: this.x + x,
            y: Math.floor(this.y) + y,
          });
        }
      }
    }
    return points;
  }

  /**
   * 绘制方块
   * @param {CanvasRenderingContext2D} ctx 画布上下文
   * @param {boolean} isGhost 是否为模拟降落方块
   */
  draw(ctx, isGhost = false) {
    const cellSize = getCellSize();

    for (let y = 0; y < this.shape.length; y++) {
      for (let x = 0; x < this.shape[y].length; x++) {
        if (this.shape[y][x]) {
          drawBlock(
            ctx,
            this.x + x,
            this.y + y,
            this.type,
            cellSize,
            null,
            isGhost
          );
        }
      }
    }
  }

  /**
   * 在预览区域绘制方块
   * @param {CanvasRenderingContext2D} ctx 预览区域画布上下文
   */
  drawPreview(ctx) {
    const size = getPreviewCellSize();
    const shape = this.shape;

    // 清除画布
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // 计算居中位置
    const blockWidth = shape[0].length * size;
    const blockHeight = shape.length * size;
    const startX = (ctx.canvas.width - blockWidth) / 2 / size;
    const startY = (ctx.canvas.height - blockHeight) / 2 / size;

    // 绘制方块
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          drawBlock(ctx, startX + col, startY + row, this.type, size);
        }
      }
    }
  }

  /**
   * 获取当前方块的投影（预览落地位置）
   * @param {Array<Array>} board 游戏面板
   * @returns {Tetromino} 投影方块
   */
  getGhost(board) {
    if (!board) return null;

    // 创建当前方块的副本
    const ghost = new Tetromino(this.type);
    ghost.shape = [...this.shape]; // 复制形状
    ghost.x = this.x;
    ghost.y = this.y;

    // 找到最低可下落位置
    while (isValidMove(board, ghost.shape, ghost.x, ghost.y + 1)) {
      ghost.y++;
    }

    // 如果投影位置与当前位置相同，则不显示投影
    if (ghost.y === this.y) {
      return null;
    }

    return ghost;
  }

  /**
   * 创建方块的克隆
   * @returns {Tetromino} 新的方块实例
   */
  clone() {
    try {
      const clone = new Tetromino(this.type);
      if (!clone || !this.shape) return null;

      clone.shape = deepClone(this.shape);
      clone.x = this.x;
      clone.y = this.y;
      return clone;
    } catch (error) {
      console.error("Error cloning piece:", error);
      return null;
    }
  }

  /**
   * 尝试墙踢
   * @param {Array<Array>} board 游戏面板
   * @param {Array<Array>} newShape 新的形状
   * @returns {boolean} 是否成功找到有效位置
   */
  tryWallKick(board, newShape) {
    // 定义可能的偏移量
    const offsets = [
      { x: 0, y: 0 }, // 原位置
      { x: -1, y: 0 }, // 左移
      { x: 1, y: 0 }, // 右移
      { x: 0, y: -1 }, // 上移
      { x: -2, y: 0 }, // 左移2格（用于I型方块）
      { x: 2, y: 0 }, // 右移2格（用于I型方块）
    ];

    // 尝试每个偏移量
    for (const offset of offsets) {
      if (isValidMove(board, newShape, this.x + offset.x, this.y + offset.y)) {
        this.x += offset.x;
        this.y += offset.y;
        this.shape = newShape;
        return true;
      }
    }

    return false;
  }
}

// 导出 Tetromino 类和工具函数
window.Tetromino = Tetromino;
