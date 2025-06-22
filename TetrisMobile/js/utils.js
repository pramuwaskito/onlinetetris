/**
 * 工具函数集合
 */

// 游戏配置常量
const GAME_CONFIG = {
  COLS: 10, // 游戏面板列数
  ROWS: 20, // 游戏面板行数
  PREVIEW_SIZE: 4, // 预览区域大小
  // 游戏模式配置
  GAME_MODES: {
    STANDARD: {
      name: "标准模式",
      base_speed: 1000,
      min_speed: 300,
      speed_factor: 0.1,
    },
    CRAZY: {
      name: "疯狂模式",
      base_speed: 350, // 疯狂模式下降速度更快
      min_speed: 70, // 最低速度也更快
      speed_factor: 0.15, // 速度增长更快
    },
    TIMED: {
      name: "限时模式",
      base_speed: 800, // 适中的下降速度
      min_speed: 300, // 最低速度适中
      speed_factor: 0.12, // 速度增长适中
      duration: 180, // 游戏时长（秒）：3分钟
    },
  },
  CURRENT_MODE: "STANDARD", // 默认为标准模式
  PIECES: ["I", "J", "L", "O", "S", "T", "Z"],
  COLORS: {
    // 方块颜色
    I: { primary: "#6FFFF6", secondary: "#65E7DF" }, // 清新青色
    J: { primary: "#7595E8", secondary: "#6A89DB" }, // 优雅蓝色
    L: { primary: "#FFBF63", secondary: "#FFAF5C" }, // 温暖橙色
    O: { primary: "#FFF95D", secondary: "#FFE357" }, // 柔和黄色
    S: { primary: "#8BFB97", secondary: "#7FE58A" }, // 自然绿色
    T: { primary: "#BB79D6", secondary: "#AE64CD" }, // 高贵紫色
    Z: { primary: "#FF8B8B", secondary: "#FF7F7F" }, // 活力红色
  },
  SHAPES: {
    // 方块形状定义
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],

    O: [
      [1, 1],
      [1, 1],
    ],

    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],

    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],

    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],

    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],

    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
};

// 保存最近生成的方块历史
let pieceHistory = [];
const MAX_HISTORY_LENGTH = 3; // 记录最近3个方块

// 方块池，用于池化生成
let piecePool = [];

/**
 * 获取随机方块类型，使用池化生成和智能生成相结合的方式
 * @param {Array<Array>} grid 当前游戏网格
 * @returns {string} 方块类型
 */
function getRandomPiece(grid) {
  // 如果方块池为空，重新填充
  if (piecePool.length === 0) {
    console.log("方块池已空，重新填充");
    piecePool = [...GAME_CONFIG.PIECES, ...GAME_CONFIG.PIECES];
    // 打乱方块池顺序
    shuffleArray(piecePool);
  }

  // 默认使用池化生成
  let selectedPiece = piecePool.pop();
  // 使用池化生成
  console.log("使用池化生成方块");

  // 更新历史记录
  pieceHistory.push(selectedPiece);
  if (pieceHistory.length > MAX_HISTORY_LENGTH) {
    pieceHistory.shift(); // 移除最旧的记录
  }

  console.log(`生成方块: ${selectedPiece}, 剩余池大小: ${piecePool.length}`);
  return selectedPiece;
}

/**
 * 打乱数组顺序（Fisher-Yates洗牌算法）
 * @param {Array} array 要打乱的数组
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * 获取当前格子大小
 * @returns {number} 格子大小（像素）
 */
function getCellSize() {
  if (document.body.clientWidth < 768) {
    let height = document.body.clientHeight;
    let width = document.body.clientWidth;
    if ("visualViewport" in window) {
      height = visualViewport.height;
      width = visualViewport.width;
    }

    let width1 = document.querySelector(".score-grid")?.offsetWidth || 0;
    let width2 = document.querySelector(".audio-controls")?.offsetWidth || 0;

    let height2 = document.querySelector(".game-controls")?.offsetHeight || 0;

    let clientHeight = height - height2 - 20;
    let clientWidth = width - width1 - width2 - 20;

    let cellSize = Math.min(
      clientHeight / GAME_CONFIG.ROWS,
      clientWidth / GAME_CONFIG.COLS
    );

    return Math.floor(cellSize);
  }

  // 从 CSS 变量中获取方块大小
  const blockSize = getComputedStyle(document.documentElement)
    .getPropertyValue("--block-size")
    .trim();
  return parseInt(blockSize) || 30; // 如果获取失败则返回默认值 30
}

/**
 * 获取预览区域的格子大小
 * @returns {number} 预览区域格子大小（像素）
 */
function getPreviewCellSize() {
  if (document.body.clientWidth < 768) {
    return Math.floor(getCellSize() * 0.4);
  }
  // 预览区域的方块大小为主游戏区域的 0.7 倍
  return Math.floor(getCellSize() * 0.7);
}

/**
 * 创建并初始化一个二维数组
 * @param {number} rows 行数
 * @param {number} cols 列数
 * @param {*} defaultValue 默认值
 * @returns {Array<Array>} 二维数组
 */
function create2DArray(rows, cols, defaultValue = null) {
  return Array(rows)
    .fill()
    .map(() => Array(cols).fill(defaultValue));
}

/**
 * 深拷贝一个对象或数组
 * @param {*} obj 要拷贝的对象
 * @returns {*} 拷贝后的新对象
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 旋转矩阵（顺时针90度）
 * @param {Array<Array>} matrix 要旋转的矩阵
 * @returns {Array<Array>} 旋转后的新矩阵
 */
function rotateMatrix(matrix) {
  const N = matrix.length;
  const result = create2DArray(N, N);

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      result[j][N - 1 - i] = matrix[i][j];
    }
  }

  return result;
}

/**
 * 检查位置是否有效（在游戏面板内且不与其他方块重叠）
 * @param {Array<Array>} board 游戏面板
 * @param {Array<Array>} piece 方块形状
 * @param {number} x 方块x坐标
 * @param {number} y 方块y坐标
 * @returns {boolean} 位置是否有效
 */
function isValidMove(board, piece, x, y) {
  // 检查输入参数
  if (!board || !piece || !Array.isArray(piece) || !Array.isArray(board)) {
    console.error("isValidMove: 无效的输入参数", { board, piece, x, y });
    return false;
  }

  // 检查坐标是否为数字
  if (typeof x !== "number" || typeof y !== "number") {
    console.error("isValidMove: 坐标不是数字", { x, y });
    return false;
  }

  const N = piece.length;

  // 检查piece是否是有效的二维数组
  for (let i = 0; i < N; i++) {
    if (!Array.isArray(piece[i]) || piece[i].length !== N) {
      console.error("isValidMove: piece不是有效的二维数组", piece);
      return false;
    }
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (piece[i][j]) {
        const newX = x + j;
        const newY = y + i;

        // 检查是否超出边界
        if (newX < 0 || newX >= GAME_CONFIG.COLS || newY >= GAME_CONFIG.ROWS) {
          return false;
        }

        // 允许方块部分在顶部之上
        if (newY < 0) continue;

        // 检查是否与其他方块重叠
        if (board[newY] === undefined) {
          console.error(`isValidMove: board[${newY}] 未定义`, board);
          return false;
        }

        if (board[newY][newX] === undefined) {
          console.error(
            `isValidMove: board[${newY}][${newX}] 未定义`,
            board[newY]
          );
          return false;
        }

        if (board[newY][newX] !== null) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * 格式化数字显示
 * @param {number} num 要格式化的数字
 * @returns {string} 格式化后的字符串
 */
function formatNumber(num) {
  return num.toString();
}

/**
 * 绘制单个方块
 * @param {CanvasRenderingContext2D} ctx 画布上下文
 * @param {number} x 方块的 x 坐标
 * @param {number} y 方块的 y 坐标
 * @param {string} type 方块类型（I、O、T、S、Z、J、L）
 * @param {number} size 方块的大小
 * @param {Object} customColors 自定义颜色对象（可选）
 * @param {boolean} isGhost 是否为模拟降落方块（可选）
 */
function drawBlock(
  ctx,
  x,
  y,
  type,
  size,
  customColors = null,
  isGhost = false
) {
  const blockSize = size || getCellSize();
  const padding = Math.max(1, blockSize * 0.03); // 减小内边距，使方块更大

  // 计算实际绘制位置和大小
  const xPos = x * blockSize;
  const yPos = y * blockSize;
  const innerSize = blockSize - padding * 2;

  // 获取颜色
  const colors = customColors || GAME_CONFIG.COLORS[type];

  // 如果是模拟降落方块，使用更清晰的轮廓线绘制方式
  if (isGhost) {
    // 保存当前上下文状态
    ctx.save();

    // 绘制圆角矩形路径
    const radius = Math.max(2, blockSize * 0.15); // 圆角半径，至少2像素
    ctx.beginPath();
    ctx.moveTo(xPos + padding + radius, yPos + padding);
    ctx.lineTo(xPos + blockSize - padding - radius, yPos + padding);
    ctx.quadraticCurveTo(
      xPos + blockSize - padding,
      yPos + padding,
      xPos + blockSize - padding,
      yPos + padding + radius
    );
    ctx.lineTo(xPos + blockSize - padding, yPos + blockSize - padding - radius);
    ctx.quadraticCurveTo(
      xPos + blockSize - padding,
      yPos + blockSize - padding,
      xPos + blockSize - padding - radius,
      yPos + blockSize - padding
    );
    ctx.lineTo(xPos + padding + radius, yPos + blockSize - padding);
    ctx.quadraticCurveTo(
      xPos + padding,
      yPos + blockSize - padding,
      xPos + padding,
      yPos + blockSize - padding - radius
    );
    ctx.lineTo(xPos + padding, yPos + padding + radius);
    ctx.quadraticCurveTo(
      xPos + padding,
      yPos + padding,
      xPos + padding + radius,
      yPos + padding
    );
    ctx.closePath();

    // 绘制内边框 - 使用白色虚线增加对比度
    ctx.strokeStyle = `${colors.primary}`;
    ctx.lineWidth = Math.max(1, blockSize * 0.05);
    ctx.setLineDash([blockSize * 0.15, blockSize * 0.1]); // 设置虚线样式
    ctx.stroke();

    // 绘制极淡的填充，增加可见性但不影响下方方块的可见性
    ctx.fillStyle = `${colors.primary}20`;

    // 恢复上下文状态
    ctx.restore();

    return; // 提前返回，不执行下面的实心方块绘制
  }

  // 保存当前上下文状态
  ctx.save();

  // 绘制方块主体 - 使用圆角矩形
  const radius = Math.max(2, blockSize * 0.15); // 圆角半径

  // 绘制外部轮廓（边框）
  ctx.beginPath();
  ctx.moveTo(xPos + padding + radius, yPos + padding);
  ctx.lineTo(xPos + blockSize - padding - radius, yPos + padding);
  ctx.quadraticCurveTo(
    xPos + blockSize - padding,
    yPos + padding,
    xPos + blockSize - padding,
    yPos + padding + radius
  );
  ctx.lineTo(xPos + blockSize - padding, yPos + blockSize - padding - radius);
  ctx.quadraticCurveTo(
    xPos + blockSize - padding,
    yPos + blockSize - padding,
    xPos + blockSize - padding - radius,
    yPos + blockSize - padding
  );
  ctx.lineTo(xPos + padding + radius, yPos + blockSize - padding);
  ctx.quadraticCurveTo(
    xPos + padding,
    yPos + blockSize - padding,
    xPos + padding,
    yPos + blockSize - padding - radius
  );
  ctx.lineTo(xPos + padding, yPos + padding + radius);
  ctx.quadraticCurveTo(
    xPos + padding,
    yPos + padding,
    xPos + padding + radius,
    yPos + padding
  );
  ctx.closePath();

  // 绘制阴影
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = blockSize * 0.15;
  ctx.shadowOffsetX = blockSize * 0.05;
  ctx.shadowOffsetY = blockSize * 0.05;

  // 填充主体颜色
  const mainGradient = ctx.createLinearGradient(
    xPos + padding,
    yPos + padding,
    xPos + blockSize - padding,
    yPos + blockSize - padding
  );
  mainGradient.addColorStop(0, colors.primary);
  mainGradient.addColorStop(1, colors.secondary);
  ctx.fillStyle = mainGradient;
  ctx.fill();

  // 重置阴影
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // 绘制内部高光 - 创建3D效果
  const innerPadding = blockSize * 0.15;
  const innerRadius = Math.max(1, radius - 2);

  ctx.beginPath();
  ctx.moveTo(
    xPos + padding + innerPadding + innerRadius,
    yPos + padding + innerPadding
  );
  ctx.lineTo(
    xPos + blockSize - padding - innerPadding - innerRadius,
    yPos + padding + innerPadding
  );
  ctx.quadraticCurveTo(
    xPos + blockSize - padding - innerPadding,
    yPos + padding + innerPadding,
    xPos + blockSize - padding - innerPadding,
    yPos + padding + innerPadding + innerRadius
  );
  ctx.lineTo(
    xPos + blockSize - padding - innerPadding,
    yPos + blockSize - padding - innerPadding - innerRadius
  );
  ctx.quadraticCurveTo(
    xPos + blockSize - padding - innerPadding,
    yPos + blockSize - padding - innerPadding,
    xPos + blockSize - padding - innerPadding - innerRadius,
    yPos + blockSize - padding - innerPadding
  );
  ctx.lineTo(
    xPos + padding + innerPadding + innerRadius,
    yPos + blockSize - padding - innerPadding
  );
  ctx.quadraticCurveTo(
    xPos + padding + innerPadding,
    yPos + blockSize - padding - innerPadding,
    xPos + padding + innerPadding,
    yPos + blockSize - padding - innerPadding - innerRadius
  );
  ctx.lineTo(
    xPos + padding + innerPadding,
    yPos + padding + innerPadding + innerRadius
  );
  ctx.quadraticCurveTo(
    xPos + padding + innerPadding,
    yPos + padding + innerPadding,
    xPos + padding + innerPadding + innerRadius,
    yPos + padding + innerPadding
  );
  ctx.closePath();

  // 创建内部高光渐变
  const highlightGradient = ctx.createLinearGradient(
    xPos + padding + innerPadding,
    yPos + padding + innerPadding,
    xPos + blockSize - padding - innerPadding,
    yPos + blockSize - padding - innerPadding
  );
  highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.7)");
  highlightGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.2)");
  highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.fillStyle = highlightGradient;
  ctx.fill();

  // 添加顶部高光 - 模拟光源从左上方照射
  ctx.beginPath();
  ctx.moveTo(xPos + padding + radius, yPos + padding);
  ctx.lineTo(xPos + blockSize - padding - radius, yPos + padding);
  ctx.quadraticCurveTo(
    xPos + blockSize - padding,
    yPos + padding,
    xPos + blockSize - padding,
    yPos + padding + radius
  );
  ctx.lineTo(xPos + blockSize - padding, yPos + padding + blockSize * 0.3);
  ctx.lineTo(xPos + padding, yPos + padding + blockSize * 0.3);
  ctx.lineTo(xPos + padding, yPos + padding + radius);
  ctx.quadraticCurveTo(
    xPos + padding,
    yPos + padding,
    xPos + padding + radius,
    yPos + padding
  );
  ctx.closePath();

  const topHighlight = ctx.createLinearGradient(
    xPos + padding,
    yPos + padding,
    xPos + padding,
    yPos + padding + blockSize * 0.3
  );
  topHighlight.addColorStop(0, "rgba(255, 255, 255, 0.6)");
  topHighlight.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.fillStyle = topHighlight;
  ctx.fill();

  // 添加左侧高光
  ctx.beginPath();
  ctx.moveTo(xPos + padding, yPos + padding + radius);
  ctx.lineTo(xPos + padding, yPos + blockSize - padding - radius);
  ctx.quadraticCurveTo(
    xPos + padding,
    yPos + blockSize - padding,
    xPos + padding + radius,
    yPos + blockSize - padding
  );
  ctx.lineTo(xPos + padding + blockSize * 0.3, yPos + blockSize - padding);
  ctx.lineTo(xPos + padding + blockSize * 0.3, yPos + padding);
  ctx.lineTo(xPos + padding + radius, yPos + padding);
  ctx.quadraticCurveTo(
    xPos + padding,
    yPos + padding,
    xPos + padding,
    yPos + padding + radius
  );
  ctx.closePath();

  const leftHighlight = ctx.createLinearGradient(
    xPos + padding,
    yPos + padding,
    xPos + padding + blockSize * 0.3,
    yPos + padding
  );
  leftHighlight.addColorStop(0, "rgba(255, 255, 255, 0.4)");
  leftHighlight.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.fillStyle = leftHighlight;
  ctx.fill();

  // 恢复上下文状态
  ctx.restore();
}

/**
 * 计算当前等级的下落速度
 * @param {number} level 当前等级
 * @returns {{interval: number, multiplier: number}} 返回下落间隔和速度倍数
 */
function calculateDropSpeed(level) {
  level = level - 1;
  // 获取当前游戏模式的配置
  const currentMode = GAME_CONFIG.GAME_MODES[GAME_CONFIG.CURRENT_MODE];

  // 使用当前模式的速度参数
  let multiplier = Math.min(
    1 + level * currentMode.speed_factor,
    currentMode.base_speed / currentMode.min_speed
  );

  multiplier = multiplier.toFixed(1);

  const interval = Math.max(
    currentMode.min_speed,
    Math.floor(currentMode.base_speed / multiplier)
  );

  return {
    interval,
    multiplier,
  };
}

// 导出所有工具函数和配置
window.GAME_CONFIG = GAME_CONFIG;
window.create2DArray = create2DArray;
window.deepClone = deepClone;
window.rotateMatrix = rotateMatrix;
window.isValidMove = isValidMove;
window.formatNumber = formatNumber;
window.drawBlock = drawBlock;
window.getCellSize = getCellSize;
window.getPreviewCellSize = getPreviewCellSize;
window.calculateDropSpeed = calculateDropSpeed;
window.getRandomPiece = getRandomPiece;

/**
 * 切换游戏模式
 * @param {string} mode 游戏模式("STANDARD" 或 "CRAZY")
 * @returns {Object} 返回当前模式的配置
 */
function setGameMode(mode) {
  if (GAME_CONFIG.GAME_MODES[mode]) {
    GAME_CONFIG.CURRENT_MODE = mode;
    console.log(`游戏模式已切换为: ${GAME_CONFIG.GAME_MODES[mode].name}`);
    return GAME_CONFIG.GAME_MODES[mode];
  } else {
    console.error(`未知游戏模式: ${mode}`);
    return GAME_CONFIG.GAME_MODES[GAME_CONFIG.CURRENT_MODE];
  }
}

/**
 * 获取当前游戏模式
 * @returns {string} 当前游戏模式的名称
 */
function getCurrentGameMode() {
  return GAME_CONFIG.GAME_MODES[GAME_CONFIG.CURRENT_MODE].name;
}

// 导出游戏模式相关函数
window.setGameMode = setGameMode;
window.getCurrentGameMode = getCurrentGameMode;
