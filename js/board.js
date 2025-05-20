/**
 * 游戏面板类
 * 负责管理游戏状态和逻辑
 */
class Board {
  /**
   * 创建游戏面板
   * @param {HTMLCanvasElement} canvas 游戏画布
   * @param {HTMLCanvasElement} nextCanvas 下一个方块画布
   * @param {HTMLCanvasElement} holdCanvas 暂存方块画布（可选）
   */
  constructor(canvas, nextCanvas, holdCanvas) {
    // 保存画布引用
    this.canvas = canvas;
    this.nextCanvas = nextCanvas;
    this.holdCanvas = holdCanvas;

    // 获取画布上下文
    this.ctx = canvas.getContext("2d");
    this.nextCtx = nextCanvas ? nextCanvas.getContext("2d") : null;
    this.holdCtx = holdCanvas ? holdCanvas.getContext("2d") : null;

    // 初始化历史最高分
    this.highScore = this.loadHighScore();

    // 防止画布上的缩放行为
    this.preventCanvasZoom();

    // 初始化行消除处理标记
    this._processingLineClear = false;

    // 初始化游戏状态 - 先初始化游戏状态
    this.reset();

    // 设置画布大小 - 再更新画布大小
    this.updateCanvasSize();

    // 添加窗口大小变化监听
    window.addEventListener("resize", () => {
      requestAnimationFrame(() => {
        this.updateCanvasSize();
      });
    });

    // 初始化音效
    this.sounds = {
      background: new Audio("sounds/background.mp3"),
      lineClear: new Audio("sounds/line-clear.mp3"),
      move: new Audio("sounds/move.mp3"),
      rotate: new Audio("sounds/rotate.mp3"),
      drop: new Audio("sounds/drop.mp3"),
    };

    // 预加载音效
    Object.values(this.sounds).forEach((sound) => {
      sound.load();
      sound.volume = 0.5;
    });

    const bgAudo = this.sounds.background;
    // 设置背景音乐循环播放
    bgAudo.loop = true;
    bgAudo.volume = 0.3; // 背景音乐音量稍低

    console.log("游戏面板初始化完成");
  }

  /**
   * 防止画布上的缩放行为
   */
  preventCanvasZoom() {
    if (!this.canvas) return;

    // 阻止画布上的所有默认触摸行为，但允许点击事件传递
    const preventDefaultTouch = (e) => {
      // 阻止默认行为，但不阻止事件传播
      e.preventDefault();
    };

    // 只阻止多点触控和手势事件
    this.canvas.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    // 阻止画布上的手势事件
    this.canvas.addEventListener("gesturestart", preventDefaultTouch, {
      passive: false,
    });
    this.canvas.addEventListener("gesturechange", preventDefaultTouch, {
      passive: false,
    });
    this.canvas.addEventListener("gestureend", preventDefaultTouch, {
      passive: false,
    });

    // 阻止双击事件，但允许单击事件
    let lastTap = 0;
    this.canvas.addEventListener(
      "touchend",
      (e) => {
        const now = Date.now();
        if (now - lastTap < 300) {
          e.preventDefault();
          e.stopPropagation();
        }
        lastTap = now;
      },
      { passive: false }
    );
  }

  /**
   * 更新画布大小
   */
  updateCanvasSize() {
    // 获取格子大小
    const cellSize = getCellSize();

    // 计算游戏画布的理想尺寸
    const idealWidth = GAME_CONFIG.COLS * cellSize;
    const idealHeight = GAME_CONFIG.ROWS * cellSize;

    // 更新主游戏画布
    this.canvas.width = idealWidth;
    this.canvas.height = idealHeight;

    // 设置容器尺寸与画布一致（保持精确的像素大小）
    if (this.canvas.parentElement) {
      // 判断是否为移动设备
      const isMobile = window.innerWidth <= 480;
      if (isMobile) {
        // 移动设备上，让容器宽度与画布完全一致
        this.canvas.parentElement.style.width = `${idealWidth}px`;
        this.canvas.parentElement.style.height = `${idealHeight}px`;

        // 保存实际使用的单元格大小
        this.actualCellSize = cellSize;
      } else {
        // 桌面设备上可以根据需要设置不同的宽度
        this.canvas.parentElement.style.width = "";
        this.canvas.parentElement.style.height = "";
        this.actualCellSize = cellSize;
      }
    }

    // 更新预览区域大小
    const previewCellSize = getPreviewCellSize();
    const previewSize = 5 * previewCellSize; // 增加预览区域大小确保方块完全显示

    // 配置下一个方块画布
    this.nextCanvas.width = previewSize;
    this.nextCanvas.height = previewSize;

    // 配置暂存方块画布（如果存在）
    if (this.holdCanvas && this.holdCtx) {
      this.holdCanvas.width = previewSize;
      this.holdCanvas.height = previewSize;
    }

    // 更新上下文设置
    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = "#333";

    // 仅当网格已初始化时绘制
    if (this.grid) {
      this.draw();
    }
  }

  /**
   * 清理事件监听器
   */
  cleanup() {
    // 清理暂停按钮事件监听器
    if (this._pauseClickHandler) {
      this.canvas.removeEventListener("click", this._pauseClickHandler);
      this._pauseClickHandler = null;
    }

    // 清理暂停界面触摸事件监听器
    if (this._pauseTouchHandler) {
      this.canvas.removeEventListener("touchend", this._pauseTouchHandler);
      this._pauseTouchHandler = null;
    }

    // 清理开始按钮事件监听器
    if (this._startClickHandler) {
      this.canvas.removeEventListener("click", this._startClickHandler);
      this._startClickHandler = null;
    }

    // 清理开始按钮触摸事件监听器
    if (this._startTouchHandler) {
      this.canvas.removeEventListener("touchend", this._startTouchHandler);
      this._startTouchHandler = null;
    }

    // 清理鼠标移动事件监听器
    if (this._mouseMoveHandler) {
      this.canvas.removeEventListener("mousemove", this._mouseMoveHandler);
      this._mouseMoveHandler = null;
    }
  }

  /**
   * 重置游戏状态
   */
  reset() {
    // 清理事件监听器
    this.cleanup();

    // 创建空白游戏面板
    this.grid = create2DArray(GAME_CONFIG.ROWS, GAME_CONFIG.COLS, null);

    // 初始化游戏数据
    this.score = 0;
    this.lines = 0;
    this.level = 1;

    const { interval, multiplier } = calculateDropSpeed(this.level);
    this.interval = interval;
    this.speed = multiplier;

    // 初始化游戏耗时
    this.gameStartTime = 0;
    this.gameTime = 0;
    this.isTimerRunning = false;
    this.timerInterval = null;

    // 初始化限时模式
    this.isTimedMode = GAME_CONFIG.CURRENT_MODE === "TIMED";
    this.timedModeSeconds = GAME_CONFIG.GAME_MODES.TIMED.duration;
    this.remainingTime = this.timedModeSeconds * 1000; // 转换为毫秒

    // 重置方块池
    this.piecePool = [];

    // 初始化方块
    this.currentPiece = null;
    this.nextPiece = new Tetromino(getRandomPiece(this.grid));
    this.heldPiece = null;
    this.canHold = true;

    // 游戏状态
    this.isGameOver = false;
    this.isPaused = false;
    this._processingLineClear = false;

    // 隐藏游戏结束模态框
    const gameOverModal = document.getElementById("gameOverModal");
    if (gameOverModal) {
      gameOverModal.style.display = "none";
    }

    // 更新显示
    this.updateScoreDisplay();
    this.updateHighScoreDisplay();

    // 绘制初始状态
    this.draw();
  }

  /**
   * 生成新的方块
   */
  spawnNewPiece() {
    // 如果正在处理行消除，不生成新方块
    if (this._processingLineClear) {
      console.log("正在处理行消除，暂不生成新方块");
      return;
    }

    // 如果没有下一个方块，创建一个
    if (!this.nextPiece) {
      this.nextPiece = new Tetromino(getRandomPiece(this.grid));
    }

    // 将下一个方块设置为当前方块
    this.currentPiece = this.nextPiece;

    // 计算初始位置（从游戏区域上方开始）
    const shape = this.currentPiece.shape;
    const x = Math.floor((GAME_CONFIG.COLS - shape[0].length) / 2);
    const y = -shape.length + 1; // 确保新方块部分可见

    this.currentPiece.x = x;
    this.currentPiece.y = y;

    // 创建下一个方块
    this.nextPiece = new Tetromino(getRandomPiece(this.grid));

    // 检查游戏是否结束（当新方块无法放置时）
    if (
      !isValidMove(this.grid, this.currentPiece.shape, x, y) ||
      !isValidMove(this.grid, this.currentPiece.shape, x, y + 1)
    ) {
      console.log("游戏结束：无法放置新方块或方块无法下落");
      window.game.gameOver();
      return;
    }

    // 允许暂存
    this.canHold = true;
  }

  /**
   * 暂存当前方块
   */
  holdPiece() {
    try {
      // 检查游戏状态和当前方块
      if (!this.currentPiece || this.isGameOver || this.isPaused) {
        console.log("Cannot hold piece: invalid game state");
        return;
      }

      // 检查是否可以暂存
      if (!this.canHold) {
        console.log("Cannot hold piece: hold is not available");
        return;
      }

      const temp = this.currentPiece;

      if (this.heldPiece === null) {
        // 第一次暂存
        this.heldPiece = new Tetromino(temp.type);
        this.spawnNewPiece();
      } else {
        // 交换当前方块和暂存方块
        const newPiece = new Tetromino(this.heldPiece.type);
        this.heldPiece = new Tetromino(temp.type);

        // 设置新方块位置
        newPiece.x = Math.floor(
          (GAME_CONFIG.COLS - newPiece.shape[0].length) / 2
        );
        newPiece.y = 0;

        // 检查新位置是否有效
        if (isValidMove(this.grid, newPiece.shape, newPiece.x, newPiece.y)) {
          this.currentPiece = newPiece;
        } else {
          // 如果新位置无效，恢复原状
          this.heldPiece = new Tetromino(newPiece.type);
          console.log("Cannot hold piece: invalid position for held piece");
          return;
        }
      }

      // 禁用暂存直到下一次移动
      this.canHold = false;

      // 更新显示
      this.draw();
    } catch (error) {
      console.error("Error in holdPiece:", error);
    }
  }

  /**
   * 移动当前方块
   * @param {number} dx x方向移动距离
   * @param {number} dy y方向移动距离
   * @param {boolean} [isAutoMove=false] 是否为自动移动（定时下落）
   * @returns {Promise<boolean>} 移动是否成功的Promise
   */
  movePiece(dx, dy, isAutoMove = false) {
    return new Promise((resolve) => {
      if (this.isGameOver || this.isPaused || !this.currentPiece) {
        resolve(false);
        return;
      }

      const newX = this.currentPiece.x + dx;
      const newY = this.currentPiece.y + dy;

      if (isValidMove(this.grid, this.currentPiece.shape, newX, newY)) {
        // 只在非自动移动时播放音效
        if (!isAutoMove && ((dx !== 0 && dy === 0) || (dx === 0 && dy > 0))) {
          this.playSound("move");
        }

        this.currentPiece.move(dx, dy);
        this.draw();
        resolve(true);
        return;
      }

      // 如果向下移动失败，则固定方块
      if (dy > 0) {
        // 保存当前方块信息用于动画
        const pieceInfo = {
          x: this.currentPiece.x,
          y: this.currentPiece.y,
          shape: JSON.parse(JSON.stringify(this.currentPiece.shape)),
          type: this.currentPiece.type,
        };

        // 将方块固定到网格
        this.placePiece();

        resolve(false);
        return;
      }

      resolve(false);
    });
  }

  /**
   * 旋转当前方块
   * @returns {Promise<boolean>} 旋转是否成功
   */
  rotatePiece() {
    return new Promise((resolve) => {
      if (this.isGameOver || this.isPaused || !this.currentPiece) {
        resolve(false);
        return;
      }

      const newShape = this.currentPiece.rotate();

      // 尝试墙踢
      if (this.currentPiece.tryWallKick(this.grid, newShape)) {
        // 旋转成功时播放旋转音效
        this.playSound("rotate");
        this.draw();
        resolve(true);
      } else {
        resolve(false);
      }
    });
  }

  /**
   * 硬降（立即下落到底部）
   */
  async hardDrop() {
    if (this.isGameOver || this.isPaused || !this.currentPiece) return;

    console.log("执行硬降操作");

    // 计算下落距离
    let dropDistance = 0;
    const originalY = this.currentPiece.y;

    // 找到最低可下落位置
    while (
      isValidMove(
        this.grid,
        this.currentPiece.shape,
        this.currentPiece.x,
        this.currentPiece.y + 1
      )
    ) {
      this.currentPiece.y++;
      dropDistance++;
    }

    if (dropDistance > 0) {
      // 播放落地音效
      this.playSound("drop");

      // 保存当前方块信息用于动画
      const pieceInfo = {
        x: this.currentPiece.x,
        y: this.currentPiece.y,
        shape: JSON.parse(JSON.stringify(this.currentPiece.shape)),
        type: this.currentPiece.type,
      };

      // 将方块固定到网格
      this.placePiece();

      // 等待落地动画完成
      await this.playLandingAnimation(pieceInfo);
    }
  }

  /**
   * 播放落地气体效果
   * @param {Object} pieceInfo 方块信息
   * @param {number} dropDistance 下落距离
   */
  playLandingDustEffect(pieceInfo, dropDistance) {
    // 动画持续时间
    const duration = 800;
    const startTime = performance.now();

    // 创建气体粒子
    const gasParticles = [];

    // 为每个方块底部创建轻微的气体效果
    pieceInfo.shape.forEach((row, dy) => {
      row.forEach((value, dx) => {
        if (value) {
          // 计算方块在网格中的位置
          const blockX = pieceInfo.x + dx;
          const blockY = pieceInfo.y + dy;

          // 只为方块底部创建气体（检查下方是否有其他方块或到达底部）
          const isBottom =
            blockY + 1 >= GAME_CONFIG.ROWS ||
            (this.grid[blockY + 1] && this.grid[blockY + 1][blockX] !== null);

          if (isBottom) {
            // 气体粒子数量基于下落距离，但保持较少数量
            const particleCount = Math.min(2 + Math.floor(dropDistance / 5), 4);

            // 创建气体粒子
            for (let i = 0; i < particleCount; i++) {
              // 计算粒子初始位置（方块底部）
              const x = (blockX + 0.5) * this.actualCellSize;
              const y = (blockY + 1) * this.actualCellSize - 2; // 稍微上移一点

              // 使用非常淡的灰白色
              const grayValue = 230 + Math.floor(Math.random() * 25);
              const color = `rgba(${grayValue}, ${grayValue}, ${grayValue}, 0.4)`;

              // 创建气体粒子 - 更轻盈的设置
              gasParticles.push({
                x: x + (Math.random() - 0.5) * this.actualCellSize * 0.5, // 水平位置更集中
                y: y,
                vx: (Math.random() - 0.5) * 0.5, // 非常缓慢的水平漂移
                vy: -0.5 - Math.random() * 0.5, // 缓慢上升
                size: 4 + Math.random() * (2 + dropDistance * 0.1), // 初始大小
                maxSize: 8 + Math.random() * (3 + dropDistance * 0.1), // 最大尺寸
                growSpeed: 0.05 + Math.random() * 0.05, // 缓慢增长
                color: color,
                opacity: 0.3 + Math.random() * 0.2, // 更低的初始透明度
                fadeSpeed: 0.003 + Math.random() * 0.002, // 非常缓慢的消失
                wobble: {
                  amplitude: 0.2 + Math.random() * 0.3, // 轻微摆动幅度
                  frequency: 0.01 + Math.random() * 0.01, // 摆动频率
                  offset: Math.random() * Math.PI * 2, // 随机相位
                },
              });
            }
          }
        }
      });
    });

    // 如果没有粒子，直接返回
    if (gasParticles.length === 0) return;

    // 动画函数
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // 如果动画已经结束，不再继续
      if (progress >= 1 || gasParticles.length === 0) return;

      // 更新和绘制粒子
      for (let i = gasParticles.length - 1; i >= 0; i--) {
        const p = gasParticles[i];

        // 更新位置 - 加入轻微的摆动效果模拟气流
        p.x +=
          p.vx +
          Math.sin(elapsed * p.wobble.frequency + p.wobble.offset) *
            p.wobble.amplitude;
        p.y += p.vy;

        // 随着上升，水平速度逐渐减小
        p.vx *= 0.99;

        // 随着上升，垂直速度逐渐减小
        p.vy *= 0.995;

        // 更新大小（缓慢增长）
        if (p.size < p.maxSize) {
          p.size += p.growSpeed;
          if (p.size > p.maxSize) p.size = p.maxSize;
        }

        // 更新透明度（缓慢消失）
        p.opacity -= p.fadeSpeed;
        if (p.opacity <= 0) {
          gasParticles.splice(i, 1);
          continue;
        }

        // 绘制气体粒子 - 使用更柔和的渐变
        this.ctx.save();
        this.ctx.globalAlpha = p.opacity;

        // 使用径向渐变创建柔和的气体效果
        const gradient = this.ctx.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          p.size * 2
        );
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(0.5, `rgba(255, 255, 255, ${p.opacity * 0.5})`);
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
      }

      // 如果还有粒子，继续动画
      if (gasParticles.length > 0) {
        requestAnimationFrame(animate);
      }
    };

    // 开始动画
    requestAnimationFrame(animate);
  }

  /**
   * 播放方块快速落地回弹动画
   * @param {Object} pieceInfo 方块信息
   * @returns {Promise} 动画完成的Promise
   */
  async playLandingAnimation(pieceInfo) {
    // 创建一个新的Promise来处理动画
    return new Promise((resolve) => {
      const duration = 400; // 动画持续时间（毫秒）
      const startTime = performance.now();

      // 弹性缓动函数
      const easeOutElastic = (t) => {
        const p = 0.3;
        return (
          Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1
        );
      };

      // 动画帧
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // 应用弹性缓动
        const animProgress = easeOutElastic(progress);

        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 绘制背景网格
        this.drawGrid();

        // 绘制网格中的方块（除了刚落下的方块）
        for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
          for (let x = 0; x < GAME_CONFIG.COLS; x++) {
            // 跳过刚落下的方块位置
            let skipCell = false;
            if (pieceInfo) {
              for (let py = 0; py < pieceInfo.shape.length; py++) {
                for (let px = 0; px < pieceInfo.shape[py].length; px++) {
                  if (
                    pieceInfo.shape[py][px] &&
                    pieceInfo.x + px === x &&
                    pieceInfo.y + py === y
                  ) {
                    skipCell = true;
                    break;
                  }
                }
                if (skipCell) break;
              }
            }

            if (!skipCell && this.grid[y] && this.grid[y][x]) {
              drawBlock(this.ctx, x, y, this.grid[y][x], this.actualCellSize);
            }
          }
        }

        // 绘制落地的方块（带回弹动画效果）
        if (pieceInfo) {
          for (let py = 0; py < pieceInfo.shape.length; py++) {
            for (let px = 0; px < pieceInfo.shape[py].length; px++) {
              if (pieceInfo.shape[py][px]) {
                const x = pieceInfo.x + px;
                const y = pieceInfo.y + py;

                // 计算形变效果 - 增强回弹效果
                const deformation = Math.sin(animProgress * Math.PI) * 0.4; // 增加到0.4
                const scaleX = 1 + deformation * 0.4; // 增加到0.8
                const scaleY = 1 - deformation * 0.8; // 增加到1.2

                this.ctx.save();

                // 设置变换中心点
                const cellSize = this.actualCellSize;
                const centerX = x * cellSize + cellSize / 2;
                const centerY = y * cellSize + cellSize / 2;

                // 应用变换
                this.ctx.translate(centerX, centerY);
                this.ctx.scale(scaleX, scaleY);
                this.ctx.translate(-centerX, -centerY);

                // 绘制方块
                drawBlock(this.ctx, x, y, pieceInfo.type, this.actualCellSize);

                this.ctx.restore();
              }
            }
          }
        }

        // 继续动画或结束
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      // 开始动画
      requestAnimationFrame(animate);
    });
  }

  /**
   * 将当前方块固定到网格中
   */
  placePiece() {
    if (!this.currentPiece) return;

    console.log("固定方块到网格");

    const { shape, x, y, type } = this.currentPiece;

    // 将方块的每个部分添加到网格中
    shape.forEach((row, dy) => {
      row.forEach((value, dx) => {
        if (value) {
          const gridY = y + dy;
          const gridX = x + dx;
          if (
            gridY >= 0 &&
            gridY < GAME_CONFIG.ROWS &&
            gridX >= 0 &&
            gridX < GAME_CONFIG.COLS
          ) {
            this.grid[gridY][gridX] = type;
            console.log(`设置网格[${gridY}][${gridX}] = ${type}`); // 添加调试日志
          }
        }
      });
    });

    // 打印网格状态
    console.log("当前网格状态:");
    for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
      if (this.grid[y].some((cell) => cell !== null)) {
        console.log(`行 ${y}:`, this.grid[y]);
      }
    }

    // 清除当前方块
    this.currentPiece = null;

    // 更新界面显示
    this.draw();

    // 如果已经在处理行消除，不要再次调用clearLines
    if (this._processingLineClear) {
      console.log("已经在处理行消除，跳过重复调用");
      return;
    }

    // 立即检查是否有完整行需要消除
    // 注意：clearLines方法会在完成后生成新方块
    this.clearLines();
  }

  /**
   * 检查并消除完整的行
   */
  async clearLines() {
    // 记录已填满的行索引
    const fullRows = [];

    // 检查每一行
    for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
      // 确保行存在且所有单元格都有方块
      if (this.grid[y] && this.grid[y].every((cell) => cell !== null)) {
        fullRows.push(y);
        console.log(`发现完整行: ${y}, 内容:`, this.grid[y]); // 增强调试日志
      }
    }

    // 如果没有可消除的行，直接生成新方块
    if (fullRows.length === 0) {
      console.log("没有完整行，生成新方块");
      this.spawnNewPiece();
      return;
    }

    console.log(`找到 ${fullRows.length} 行需要消除:`, fullRows);

    try {
      // 标记正在处理行消除，防止重复生成方块
      this._processingLineClear = true;

      // 播放音效
      this.playSound("lineClear");

      // 播放消除动画
      await this.playLineClearAnimation(fullRows);

      console.log("消除动画完成，开始实际消除行并播放下落动画");

      // 创建一个临时网格用于动画和保存原始网格
      const oldGrid = [];
      // 手动深拷贝网格，避免使用JSON序列化可能带来的问题
      for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
        oldGrid[y] = [...this.grid[y]];
      }

      // 创建一个新的临时网格
      const tempGrid = Array(GAME_CONFIG.ROWS)
        .fill()
        .map(() => Array(GAME_CONFIG.COLS).fill(null));

      // 从下往上处理，跳过被消除的行
      let targetRow = GAME_CONFIG.ROWS - 1;

      // 从原网格底部开始，向上遍历
      for (let sourceRow = GAME_CONFIG.ROWS - 1; sourceRow >= 0; sourceRow--) {
        // 如果当前行是要消除的行，跳过
        if (fullRows.includes(sourceRow)) {
          console.log(`跳过消除行: ${sourceRow}`);
          continue;
        }

        // 将非消除行复制到新网格中
        for (let x = 0; x < GAME_CONFIG.COLS; x++) {
          tempGrid[targetRow][x] = this.grid[sourceRow][x];
        }

        console.log(`将原行 ${sourceRow} 移动到新行 ${targetRow}`);
        targetRow--;
      }

      // 播放上方方块下落动画
      this.playBlocksFallingAnimation(oldGrid, tempGrid, fullRows);

      // 更新实际网格
      this.grid = tempGrid;

      // 打印消除后的网格状态
      console.log("消除后的网格状态:");
      for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
        if (this.grid[y].some((cell) => cell !== null)) {
          console.log(`行 ${y}:`, this.grid[y]);
        }
      }

      // await new Promise((resolve) => setTimeout(resolve, 150));

      // 只有在消除行时才加分
      if (fullRows.length > 0) {
        // 计算得分
        let scoreToAdd = fullRows.length * 10;
        if (fullRows.length == 4) {
          scoreToAdd = 60;
        } else if (fullRows.length == 3) {
          scoreToAdd = 50;
        } else if (fullRows.length == 2) {
          scoreToAdd = 30;
        } else if (fullRows.length == 1) {
          scoreToAdd = 10;
        }

        scoreToAdd = scoreToAdd * this.level;

        // 更新总分
        this.score += scoreToAdd;

        // 更新分数统计
        this.lines += fullRows.length;
        // 计算等级
        this.level = Math.max(1, Math.floor(this.lines / 10) + 1);

        // 更新下落速度
        const { interval, multiplier } = calculateDropSpeed(this.level);
        this.interval = interval;
        this.speed = multiplier;

        // 显示积分动画
        // 计算动画显示位置（在画布的中上位置）
        const canvasRect = this.canvas.getBoundingClientRect();
        const x = canvasRect.left + this.canvas.width / 2;
        const y = canvasRect.top + this.canvas.height * 0.25; // 画布顶部1/4处

        // 使用多位置积分动画
        this.showScoreAnimation(scoreToAdd, x, y);

        // 更新分数显示
        this.updateScoreDisplay();

        // 重新计算下落时间
        window.game.recalculateDropTime();
      }

      // await new Promise((resolve) => setTimeout(resolve, 350));

      // 重新绘制
      this.draw();

      // 清除处理标记
      this._processingLineClear = false;

      // 只有当游戏没有暂停时，才生成新方块
      if (!this.isPaused) {
        console.log("游戏未暂停，生成新方块");
        this.spawnNewPiece();
      } else {
        console.log("游戏已暂停，不生成新方块");
      }
    } catch (error) {
      console.error("行消除过程中出错:", error);
      // 清除处理标记
      this._processingLineClear = false;
      // 只有当游戏没有暂停时，才继续游戏（生成新方块）
      if (!this.isPaused) {
        // 确保即使出错也能继续游戏
        this.spawnNewPiece();
      }
    }
  }

  /**
   * 播放消除动画
   * @param {Array<number>} rows 要消除的行索引数组
   * @returns {Promise} 动画完成的Promise
   */
  async playLineClearAnimation(rows) {
    console.log("开始播放行消除动画", rows);
    return new Promise((resolve) => {
      const duration = 800; // 动画持续时间（毫秒）
      const startTime = performance.now();

      // 保存原始状态
      const originalGrid = this.grid.map((row) => [...row]);

      // 为每个方块创建碎片
      const fragments = [];

      // 缓动函数 - 四次方缓动
      const easeInOutQuart = (t) => {
        return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
      };

      // 动画帧
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // 应用缓动
        const animProgress = easeInOutQuart(progress);

        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 绘制背景网格
        this.drawGrid();

        // 绘制未消除的方块
        for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
          // 跳过要消除的行
          if (rows.includes(y)) continue;

          for (let x = 0; x < GAME_CONFIG.COLS; x++) {
            if (originalGrid[y] && originalGrid[y][x]) {
              drawBlock(
                this.ctx,
                x,
                y,
                originalGrid[y][x],
                this.actualCellSize
              );
            }
          }
        }

        // 在消除行的位置绘制闪光效果（仅在动画开始阶段）
        if (progress < 0.2) {
          const flashIntensity = 1 - progress / 0.2; // 闪光强度随时间减弱

          rows.forEach((rowIndex) => {
            const cellSize = this.actualCellSize;
            const y = rowIndex * cellSize;

            // 创建闪光渐变
            const glow = this.ctx.createLinearGradient(
              0,
              y,
              this.canvas.width,
              y + cellSize
            );
            glow.addColorStop(0, `rgba(255, 255, 255, 0)`);
            glow.addColorStop(0.5, `rgba(255, 255, 255, ${flashIntensity})`);
            glow.addColorStop(1, `rgba(255, 255, 255, 0)`);

            // 绘制闪光效果
            this.ctx.fillStyle = glow;
            this.ctx.fillRect(0, y, this.canvas.width, cellSize);

            // 在闪光阶段，仍然绘制原始方块（但会闪烁）
            if (Math.sin(progress * 50) > 0) {
              for (let x = 0; x < GAME_CONFIG.COLS; x++) {
                if (originalGrid[rowIndex] && originalGrid[rowIndex][x]) {
                  drawBlock(
                    this.ctx,
                    x,
                    rowIndex,
                    originalGrid[rowIndex][x],
                    this.actualCellSize
                  );
                }
              }
            }
          });
        }

        // 从左到右逐渐消散的动画（在闪光后开始）
        if (progress >= 0.2) {
          const disappearProgress = (progress - 0.2) / 0.8; // 消失动画进度

          rows.forEach((rowIndex) => {
            for (let x = 0; x < GAME_CONFIG.COLS; x++) {
              if (originalGrid[rowIndex] && originalGrid[rowIndex][x]) {
                // 计算每个方块的消失时间点（从左到右依次消失）
                const blockDisappearPoint = (x / GAME_CONFIG.COLS) * 0.7; // 0.7是调整系数，控制消失速度

                // 如果当前进度小于这个方块的消失时间点，则绘制方块
                if (disappearProgress < blockDisappearPoint) {
                  drawBlock(
                    this.ctx,
                    x,
                    rowIndex,
                    originalGrid[rowIndex][x],
                    this.actualCellSize
                  );
                }
                // 如果当前进度接近这个方块的消失时间点，则创建碎片效果
                else if (
                  disappearProgress < blockDisappearPoint + 0.1 &&
                  fragments.filter(
                    (f) => f.originX === x && f.originY === rowIndex
                  ).length === 0
                ) {
                  // 为这个方块创建碎片
                  this.createBlockFragments(
                    x,
                    rowIndex,
                    originalGrid[rowIndex][x],
                    fragments
                  );
                }
              }
            }
          });

          // 更新和绘制碎片
          this.updateAndDrawFragments(fragments, disappearProgress);
        }

        // 继续动画或结束
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          console.log("行消除动画完成");
          resolve();
        }
      };

      // 开始动画
      requestAnimationFrame(animate);
    });
  }

  /**
   * 为方块创建碎片效果
   * @param {number} x 方块的x坐标
   * @param {number} y 方块的y坐标
   * @param {string} blockType 方块类型
   * @param {Array} fragments 碎片数组
   */
  createBlockFragments(x, y, blockType, fragments) {
    const colors = GAME_CONFIG.COLORS[blockType];
    const cellSize = this.actualCellSize;
    const centerX = x * cellSize + cellSize / 2;
    const centerY = y * cellSize + cellSize / 2;

    // 为每个方块创建8-12个碎片
    const fragmentCount = 8 + Math.floor(Math.random() * 5);

    for (let i = 0; i < fragmentCount; i++) {
      // 确定碎片类型：0=矩形, 1=三角形, 2=圆形
      const fragmentType = Math.floor(Math.random() * 3);

      // 碎片大小（随机但较小）
      const size = cellSize * (0.1 + Math.random() * 0.2);

      // 初始位置（在方块内随机分布）
      const offsetX = (Math.random() - 0.5) * cellSize * 0.8;
      const offsetY = (Math.random() - 0.5) * cellSize * 0.8;

      // 随机速度和方向（爆炸效果）
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3; // 初始速度
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 1; // 向上的初始趋势

      // 随机旋转
      const rotationSpeed = (Math.random() - 0.5) * 0.3;

      // 随机选择主色或次色
      const color = Math.random() > 0.5 ? colors.primary : colors.secondary;

      // 创建碎片对象
      fragments.push({
        x: centerX + offsetX,
        y: centerY + offsetY,
        vx: vx,
        vy: vy,
        size: size,
        originalSize: size,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: rotationSpeed,
        color: color,
        opacity: 0.9,
        type: fragmentType,
        gravity: 0.15 + Math.random() * 0.05,
        friction: 0.98,
        bounce: 0.3 + Math.random() * 0.2,
        originX: x,
        originY: y,
        lifespan: 0.5 + Math.random() * 0.5, // 碎片寿命
      });
    }
  }

  /**
   * 更新和绘制碎片
   * @param {Array} fragments 碎片数组
   * @param {number} progress 动画进度
   */
  updateAndDrawFragments(fragments, progress) {
    for (let i = fragments.length - 1; i >= 0; i--) {
      const fragment = fragments[i];

      // 更新碎片位置
      fragment.x += fragment.vx;
      fragment.y += fragment.vy;

      // 应用重力
      fragment.vy += fragment.gravity;

      // 应用空气阻力
      fragment.vx *= fragment.friction;
      fragment.vy *= fragment.friction;

      // 边界碰撞检测（仅底部和侧面）
      if (fragment.y > this.canvas.height && fragment.vy > 0) {
        fragment.vy = -fragment.vy * fragment.bounce;
        fragment.y = this.canvas.height;
      }

      if (fragment.x < 0 && fragment.vx < 0) {
        fragment.vx = -fragment.vx * fragment.bounce;
        fragment.x = 0;
      } else if (fragment.x > this.canvas.width && fragment.vx > 0) {
        fragment.vx = -fragment.vx * fragment.bounce;
        fragment.x = this.canvas.width;
      }

      // 更新旋转
      fragment.rotation += fragment.rotationSpeed;

      // 随着动画进行，碎片逐渐变小并消失
      fragment.lifespan -= 0.01;
      fragment.opacity = fragment.lifespan;
      fragment.size = fragment.originalSize * fragment.lifespan;

      // 如果碎片寿命结束，移除它
      if (fragment.lifespan <= 0) {
        fragments.splice(i, 1);
        continue;
      }

      // 绘制碎片
      this.ctx.save();

      // 设置透明度
      this.ctx.globalAlpha = fragment.opacity;

      // 设置变换
      this.ctx.translate(fragment.x, fragment.y);
      this.ctx.rotate(fragment.rotation);

      // 设置碎片颜色和发光效果
      this.ctx.fillStyle = fragment.color;
      this.ctx.shadowColor = fragment.color;
      this.ctx.shadowBlur = 5 * fragment.opacity;

      // 根据碎片类型绘制不同形状
      switch (fragment.type) {
        case 0: // 矩形
          this.ctx.fillRect(
            -fragment.size / 2,
            -fragment.size / 2,
            fragment.size,
            fragment.size
          );
          break;

        case 1: // 三角形
          this.ctx.beginPath();
          this.ctx.moveTo(0, -fragment.size / 2);
          this.ctx.lineTo(fragment.size / 2, fragment.size / 2);
          this.ctx.lineTo(-fragment.size / 2, fragment.size / 2);
          this.ctx.closePath();
          this.ctx.fill();
          break;

        case 2: // 圆形
          this.ctx.beginPath();
          this.ctx.arc(0, 0, fragment.size / 2, 0, Math.PI * 2);
          this.ctx.fill();
          break;
      }

      this.ctx.restore();
    }
  }

  /**
   * 播放上方方块下落动画
   * @param {Array} oldGrid - 原始网格
   * @param {Array} newGrid - 更新后的网格
   * @param {Array} clearedRows - 被消除的行索引
   * @returns {Promise} - 动画完成的Promise
   */
  playBlocksFallingAnimation(oldGrid, newGrid, clearedRows) {
    return new Promise((resolve) => {
      // 动画持续时间（毫秒）
      const duration = 500;
      // 动画开始时间
      const startTime = performance.now();
      // 缓动函数 - 弹性下落效果
      const easeOutBounce = (t) => {
        const n1 = 7.5625;
        const d1 = 2.75;

        if (t < 1 / d1) {
          return n1 * t * t;
        } else if (t < 2 / d1) {
          return n1 * (t -= 1.5 / d1) * t + 0.75;
        } else if (t < 2.5 / d1) {
          return n1 * (t -= 2.25 / d1) * t + 0.9375;
        } else {
          return n1 * (t -= 2.625 / d1) * t + 0.984375;
        }
      };

      // 创建方块移动映射
      const blockMoves = [];

      // 遍历旧网格中的每个方块
      for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
        // 跳过被消除的行
        if (clearedRows.includes(y)) continue;

        for (let x = 0; x < GAME_CONFIG.COLS; x++) {
          const block = oldGrid[y][x];
          if (block !== null) {
            // 计算这个方块在新网格中的位置
            // 计算在当前位置下方有多少个被消除的行
            const rowsBelow = clearedRows.filter((row) => row > y).length;

            // 只有当下方有被消除的行时，才需要移动
            if (rowsBelow > 0) {
              const newY = y + rowsBelow;
              blockMoves.push({
                x: x,
                startY: y,
                endY: newY,
                block: block,
              });
            }
          }
        }
      }

      console.log(`需要动画的方块数量: ${blockMoves.length}`);

      // 如果没有方块需要移动，直接结束
      if (blockMoves.length === 0) {
        resolve();
        return;
      }

      // 动画函数
      const animate = (currentTime) => {
        // 计算动画进度
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutBounce(progress);

        // 清除画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 绘制背景网格
        this.drawGrid();

        // 绘制所有方块
        for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
          for (let x = 0; x < GAME_CONFIG.COLS; x++) {
            // 检查这个位置是否有需要动画的方块
            const movingBlock = blockMoves.find(
              (move) => move.x === x && move.startY === y
            );

            if (movingBlock) {
              // 计算当前位置
              const startY = movingBlock.startY;
              const endY = movingBlock.endY;
              const currentY = startY + (endY - startY) * easedProgress;

              // 绘制移动中的方块
              drawBlock(
                this.ctx,
                x,
                currentY,
                movingBlock.block,
                this.actualCellSize
              );
            } else {
              // 绘制静态方块（不在被消除的行中且不需要移动的方块）
              if (!clearedRows.includes(y) && oldGrid[y][x] !== null) {
                drawBlock(this.ctx, x, y, oldGrid[y][x], this.actualCellSize);
              }
            }
          }
        }

        // 绘制UI元素
        this.drawUI();

        // 如果动画未完成，继续下一帧
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          console.log("下落动画完成");
          resolve();
        }
      };

      // 开始动画
      requestAnimationFrame(animate);
    });
  }

  /**
   * 调整颜色亮度
   * @param {string} color RGB颜色字符串或十六进制颜色
   * @param {number} factor 亮度因子
   * @returns {string} 调整后的颜色
   */
  adjustBrightness(color, factor) {
    // 安全地提取RGB值
    let r = 128,
      g = 128,
      b = 128; // 默认灰色

    try {
      // 尝试匹配RGB格式
      const rgbMatch = color.match(/\d+/g);
      if (rgbMatch && rgbMatch.length >= 3) {
        r = parseInt(rgbMatch[0], 10);
        g = parseInt(rgbMatch[1], 10);
        b = parseInt(rgbMatch[2], 10);
      }

      // 应用亮度调整
      r = Math.min(255, Math.floor(r * factor));
      g = Math.min(255, Math.floor(g * factor));
      b = Math.min(255, Math.floor(b * factor));
    } catch (error) {
      console.error("颜色调整错误:", error);
    }

    // 返回有效的RGB颜色
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * 绘制UI元素
   */
  drawUI() {
    // 如果需要绘制额外的UI元素，可以在这里添加
    // 目前这个方法是空的，但保留它以便将来扩展
  }

  /**
   * 绘制游戏画面
   */
  draw() {
    try {
      // 清空画布
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.nextCtx.clearRect(
        0,
        0,
        this.nextCanvas.width,
        this.nextCanvas.height
      );
      if (this.holdCtx) {
        this.holdCtx.clearRect(
          0,
          0,
          this.holdCanvas.width,
          this.holdCanvas.height
        );
      }

      // 检查网格是否已初始化
      if (!this.grid) return;

      // 绘制背景网格线
      this.drawGrid();

      // 如果游戏还未开始（没有当前方块且不在处理行消除），显示模式选择界面
      if (
        !this.currentPiece &&
        !this.isGameOver &&
        !this._processingLineClear
      ) {
        console.log("直接显示模式选择界面");
        this.drawModeSelection();
        return;
      }

      // 绘制网格
      for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
        for (let x = 0; x < GAME_CONFIG.COLS; x++) {
          if (this.grid[y] && this.grid[y][x]) {
            drawBlock(this.ctx, x, y, this.grid[y][x], this.actualCellSize);
          }
        }
      }

      // 绘制当前方块的投影
      if (this.currentPiece && !this.isGameOver && !this.isPaused) {
        try {
          const ghost = this.currentPiece.getGhost(this.grid);
          if (ghost && ghost.shape) {
            ghost.draw(this.ctx, true); // 传入 true 表示这是模拟降落方块
          }
        } catch (error) {
          console.error("Error drawing ghost piece:", error);
        }
      }

      // 绘制当前方块
      if (this.currentPiece && this.currentPiece.shape) {
        this.currentPiece.draw(this.ctx);
      }

      // 绘制下一个方块
      if (this.nextPiece && this.nextPiece.shape) {
        this.nextPiece.drawPreview(this.nextCtx);
      }

      // 绘制暂存方块（如果存在）
      if (this.holdCtx && this.heldPiece && this.heldPiece.shape) {
        this.heldPiece.drawPreview(this.holdCtx);
      }

      // 如果游戏暂停，绘制暂停界面
      if (this.isPaused) {
        this.drawPauseScreen();
      }
    } catch (error) {
      console.error("Error in draw method:", error);
    }
  }

  /**
   * 绘制背景网格线
   */
  drawGrid() {
    const cellSize = this.actualCellSize || getCellSize();
    const width = this.canvas.width;
    const height = this.canvas.height;

    // 设置网格线样式
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; // 半透明白色
    this.ctx.lineWidth = 1;

    // 绘制垂直线
    for (let x = 0; x <= GAME_CONFIG.COLS; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * cellSize, 0);
      this.ctx.lineTo(x * cellSize, height);
      this.ctx.stroke();
    }

    // 绘制水平线
    for (let y = 0; y <= GAME_CONFIG.ROWS; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * cellSize);
      this.ctx.lineTo(width, y * cellSize);
      this.ctx.stroke();
    }

    // 额外绘制游戏区域的边界线
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; // 更明显的边界线
    this.ctx.lineWidth = 2;

    // 绘制四个角
    const cornerSize = 10; // 角的大小

    // 左上角
    this.ctx.beginPath();
    this.ctx.moveTo(0, cornerSize);
    this.ctx.lineTo(0, 0);
    this.ctx.lineTo(cornerSize, 0);
    this.ctx.stroke();

    // 右上角
    this.ctx.beginPath();
    this.ctx.moveTo(width - cornerSize, 0);
    this.ctx.lineTo(width, 0);
    this.ctx.lineTo(width, cornerSize);
    this.ctx.stroke();

    // 左下角
    this.ctx.beginPath();
    this.ctx.moveTo(0, height - cornerSize);
    this.ctx.lineTo(0, height);
    this.ctx.lineTo(cornerSize, height);
    this.ctx.stroke();

    // 右下角
    this.ctx.beginPath();
    this.ctx.moveTo(width - cornerSize, height);
    this.ctx.lineTo(width, height);
    this.ctx.lineTo(width, height - cornerSize);
    this.ctx.stroke();
  }

  /**
   * 绘制游戏结束画面
   */
  drawGameOver() {
    // 游戏结束
    this.isGameOver = true;

    // 停止游戏计时
    this.stopTimer();

    // 保存最高分
    this.saveHighScore(this.score);

    // 更新游戏结束模态框中的分数信息
    const finalScoreElement = document.getElementById("finalScore");
    const finalHighScoreElement = document.getElementById("finalHighScore");
    const finalTimeElement = document.getElementById("finalTime");
    const gameOverTitleElement = document.getElementById("gameOverTitle");

    if (finalScoreElement) {
      finalScoreElement.textContent = this.score;
    }

    if (finalHighScoreElement) {
      finalHighScoreElement.textContent = this.highScore;
    }

    if (finalTimeElement) {
      if (this.isTimedMode) {
        // 限时模式显示总时长
        finalTimeElement.textContent = this.formatTime(
          this.timedModeSeconds * 1000
        );
      } else {
        // 普通模式显示已用时间
        finalTimeElement.textContent = this.formatTime(this.gameTime);
      }
    }

    // 根据游戏模式设置不同的标题
    if (gameOverTitleElement) {
      if (this.isTimedMode && this.remainingTime <= 0) {
        gameOverTitleElement.textContent = "Time's Up!";
        gameOverTitleElement.style.color = "#ff3838";
      } else {
        gameOverTitleElement.textContent = "Game Over";
        gameOverTitleElement.style.color = "";
      }
    }

    // 显示游戏结束模态框
    const gameOverModal = document.getElementById("gameOverModal");
    if (gameOverModal) {
      gameOverModal.style.display = "block";
    }
  }

  /**
   * 绘制暂停界面
   */
  drawPauseScreen() {
    if (!this.isPaused) return;

    // console.log("绘制暂停界面");

    // 获取画布上下文
    const ctx = this.ctx;
    if (!ctx) return;

    // 保存当前状态
    ctx.save();

    // 绘制半透明背景
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 设置文本样式
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 绘制暂停标题
    ctx.fillText(
      window.i18n.getText("gamePausedDesc"),
      this.canvas.width / 2,
      this.canvas.height / 3
    );

    // 绘制继续按钮
    const btnWidth = 160;
    const btnHeight = 50;
    const btnX = (this.canvas.width - btnWidth) / 2;
    const btnY = this.canvas.height / 2;
    const btnRadius = 25; // 按钮圆角半径

    // 继续按钮背景
    ctx.fillStyle = "#4CAF50";
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnWidth, btnHeight, btnRadius);
    ctx.fill();

    // 继续按钮文字
    ctx.fillStyle = "#FFFFFF";
    this.ctx.font = "bold 20px Arial";

    ctx.fillText(
      window.i18n.getText("continueBtn"),
      this.canvas.width / 2,
      btnY + btnHeight / 2
    );

    // 绘制重新开始按钮
    const restartBtnY = btnY + btnHeight + 20;

    // 重新开始按钮背景
    ctx.fillStyle = "#2196F3";
    ctx.beginPath();
    ctx.roundRect(btnX, restartBtnY, btnWidth, btnHeight, btnRadius);
    ctx.fill();

    // 重新开始按钮文字
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(
      window.i18n.getText("restartBtn"),
      this.canvas.width / 2,
      restartBtnY + btnHeight / 2
    );

    // 绘制切换模式按钮
    const switchModeBtnY = restartBtnY + btnHeight + 20;

    // 切换模式按钮背景 - 使用橙色
    ctx.fillStyle = "#FF9800";
    ctx.beginPath();
    ctx.roundRect(btnX, switchModeBtnY, btnWidth, btnHeight, btnRadius);
    ctx.fill();
    // 切换模式按钮文字
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(
      window.i18n.getText("switchtMode"),
      this.canvas.width / 2,
      switchModeBtnY + btnHeight / 2
    );

    // 恢复状态
    ctx.restore();

    // 清理旧的事件监听器
    if (this._pauseClickHandler) {
      this.canvas.removeEventListener("click", this._pauseClickHandler);
      this._pauseClickHandler = null;
    }

    // 重要：确保移除开始游戏的事件监听器，防止冲突
    if (this._startClickHandler) {
      console.log("移除开始游戏的点击事件监听器");
      this.canvas.removeEventListener("click", this._startClickHandler);
      this._startClickHandler = null;
    }

    if (this._mouseMoveHandler) {
      console.log("移除鼠标移动事件监听器");
      this.canvas.removeEventListener("mousemove", this._mouseMoveHandler);
      this._mouseMoveHandler = null;
    }

    // 添加新的点击事件监听
    this._pauseClickHandler = (e) => {
      // 检查游戏是否正在运行
      if (window.game && window.game.isRunning && !window.game.isPaused) {
        console.log("游戏正在运行中,忽略触摸事件");
        return;
      }

      console.log("触发暂停界面点击事件处理器");
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      console.log(
        "点击位置:",
        x,
        y,
        "按钮位置:",
        btnX,
        btnY,
        btnWidth,
        btnHeight
      );

      // 检查继续按钮点击
      if (
        x >= btnX &&
        x <= btnX + btnWidth &&
        y >= btnY &&
        y <= btnY + btnHeight
      ) {
        console.log("点击了继续游戏按钮");

        // 如果存在全局游戏实例，调用resumeGame方法
        if (window.game && typeof window.game.resumeGame === "function") {
          console.log("调用window.game.resumeGame()");
          window.game.resumeGame();
          return;
        }

        // 备用方案：直接恢复游戏状态
        console.log("使用备用方案恢复游戏");
        this.isPaused = false;
        this.playSound("background");
        this.draw();
      }

      // 检查重新开始按钮点击
      if (
        x >= btnX &&
        x <= btnX + btnWidth &&
        y >= restartBtnY &&
        y <= restartBtnY + btnHeight
      ) {
        console.log("点击了重新开始按钮");

        // 如果存在全局游戏实例，调用重新开始方法
        if (window.game && typeof window.game.restartGame === "function") {
          console.log("调用window.game.restartGame()");
          window.game.restartGame();
        }
      }

      // 检查切换模式按钮点击
      if (
        x >= btnX &&
        x <= btnX + btnWidth &&
        y >= switchModeBtnY &&
        y <= switchModeBtnY + btnHeight
      ) {
        console.log("点击了切换模式按钮");

        // 结束当前游戏
        if (window.game) {
          window.game.isRunning = false;

          // 如果游戏有结束逻辑，确保不调用它
          window.game.isPaused = false;
        }

        // 恢复未暂停状态以便显示模式选择界面
        this.isPaused = false;

        // 重置游戏网格
        this.reset();

        // 显示模式选择界面
        this.drawModeSelection();
      }
    };

    this.canvas.addEventListener("click", this._pauseClickHandler);

    // 添加触摸事件支持
    if (this._pauseTouchHandler) {
      this.canvas.removeEventListener("touchend", this._pauseTouchHandler);
      this._pauseTouchHandler = null;
    }

    // 重要：确保移除开始游戏的触摸事件监听器，防止冲突
    if (this._startTouchHandler) {
      console.log("移除开始游戏的触摸事件监听器");
      this.canvas.removeEventListener("touchend", this._startTouchHandler);
      this._startTouchHandler = null;
    }

    this._pauseTouchHandler = (e) => {
      e.preventDefault();

      // 检查游戏是否正在运行
      if (window.game && window.game.isRunning && !window.game.isPaused) {
        console.log("游戏正在运行中,忽略触摸事件");
        return;
      }

      if (e.changedTouches.length === 0) return;

      const rect = this.canvas.getBoundingClientRect();
      const touch = e.changedTouches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      console.log("暂停界面触摸结束在位置:", x, y);

      // 检查继续按钮点击
      if (
        x >= btnX &&
        x <= btnX + btnWidth &&
        y >= btnY &&
        y <= btnY + btnHeight
      ) {
        console.log("触摸了继续游戏按钮");

        // 如果存在全局游戏实例，调用resumeGame方法
        if (window.game && typeof window.game.resumeGame === "function") {
          console.log("调用window.game.resumeGame()");
          window.game.resumeGame();
          return;
        }

        // 备用方案：直接恢复游戏状态
        console.log("使用备用方案恢复游戏");
        this.isPaused = false;
        this.playSound("background");
        this.draw();
      }

      // 检查重新开始按钮点击
      if (
        x >= btnX &&
        x <= btnX + btnWidth &&
        y >= restartBtnY &&
        y <= restartBtnY + btnHeight
      ) {
        console.log("触摸了重新开始按钮");

        // 如果存在全局游戏实例，调用重新开始方法
        if (window.game && typeof window.game.restartGame === "function") {
          console.log("调用window.game.restartGame()");
          window.game.restartGame();
        }
      }

      // 检查切换模式按钮点击
      if (
        x >= btnX &&
        x <= btnX + btnWidth &&
        y >= switchModeBtnY &&
        y <= switchModeBtnY + btnHeight
      ) {
        console.log("触摸了切换模式按钮");

        // 结束当前游戏
        if (window.game) {
          window.game.isRunning = false;

          // 如果游戏有结束逻辑，确保不调用它
          window.game.isPaused = false;
        }

        // 恢复未暂停状态以便显示模式选择界面
        this.isPaused = false;

        // 重置游戏网格
        this.reset();

        // 显示模式选择界面
        this.drawModeSelection();
      }
    };

    this.canvas.addEventListener("touchend", this._pauseTouchHandler, {
      passive: false,
    });

    console.log("暂停界面绘制完成");
  }

  /**
   * 触发游戏开始
   * @private
   */
  _triggerStartGame() {
    // 移除事件监听器
    if (this._mouseMoveHandler) {
      this.canvas.removeEventListener("mousemove", this._mouseMoveHandler);
      this._mouseMoveHandler = null;
    }
    if (this._startClickHandler) {
      this.canvas.removeEventListener("click", this._startClickHandler);
      this._startClickHandler = null;
    }
    if (this._startTouchHandler) {
      this.canvas.removeEventListener("touchend", this._startTouchHandler);
      this._startTouchHandler = null;
    }

    this.canvas.style.cursor = "default";

    console.log("触发游戏开始");

    // 触发开始按钮点击事件来启动游戏
    const startBtn = document.getElementById("startBtn");
    if (startBtn) {
      console.log("找到开始按钮，模拟点击");

      // 创建并分发点击事件
      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      });

      startBtn.dispatchEvent(clickEvent);
      console.log("已分发点击事件");

      // 直接调用游戏实例的开始方法（作为备用方案）
      if (window.game && typeof window.game.startGame === "function") {
        console.log("直接调用游戏开始方法");
        window.game.startGame();
      }
    } else {
      console.error("未找到开始按钮");

      // 尝试直接调用游戏实例的开始方法
      if (window.game && typeof window.game.startGame === "function") {
        console.log("直接调用游戏开始方法");
        window.game.startGame();
      }
    }
  }

  /**
   * 检查鼠标是否在按钮上
   * @param {number} btnX 按钮X坐标
   * @param {number} btnY 按钮Y坐标
   * @param {number} btnWidth 按钮宽度
   * @param {number} btnHeight 按钮高度
   * @param {number} mouseX 鼠标X坐标
   * @param {number} mouseY 鼠标Y坐标
   * @returns {boolean} 是否在按钮上
   */
  _isMouseOverButton(btnX, btnY, btnWidth, btnHeight, mouseX, mouseY) {
    // 确保传入的鼠标坐标有效
    if (typeof mouseX !== "number" || typeof mouseY !== "number") {
      return false;
    }

    return (
      mouseX >= btnX &&
      mouseX <= btnX + btnWidth &&
      mouseY >= btnY &&
      mouseY <= btnY + btnHeight
    );
  }

  /**
   * 更新分数显示
   */
  updateScoreDisplay() {
    // 更新分数
    const scoreElement = document.getElementById("score");
    if (scoreElement) {
      // 检查是否有score-roll类，如果没有则添加
      if (!scoreElement.classList.contains("score-roll")) {
        scoreElement.classList.add("score-roll");
      }

      const oldScore = scoreElement.textContent;
      const newScore = formatNumber(this.score);

      // 如果分数没有变化，不执行动画
      if (oldScore === newScore) {
        return;
      }

      // 创建旧分数元素（向上滚动消失）
      const oldScoreElement = document.createElement("div");
      oldScoreElement.className = "score-roll-item score-roll-old";
      oldScoreElement.textContent = oldScore;

      // 创建新分数元素（从下方滚动进入）
      const newScoreElement = document.createElement("div");
      newScoreElement.className = "score-roll-item";
      newScoreElement.textContent = newScore;

      // 清空分数容器并添加新元素
      scoreElement.innerHTML = "";
      scoreElement.appendChild(oldScoreElement);
      scoreElement.appendChild(newScoreElement);

      // 动画结束后清理DOM
      setTimeout(() => {
        // 移除动画元素，直接显示文本
        scoreElement.innerHTML = newScore;
      }, 500); // 与CSS动画时长一致
    }

    // 更新等级
    const levelElement = document.getElementById("level");
    if (levelElement) {
      levelElement.textContent = this.level;
    }

    const speedElement = document.getElementById("speed");
    if (speedElement) {
      speedElement.textContent = `${this.speed}x`;
    }

    // 检查并更新历史最高分
    // this.saveHighScore(this.score); // 只在游戏结束时更新最高分，此处注释掉

    // 更新游戏时间
    this.updateTimeDisplay();
  }

  /**
   * 播放音效
   * @param {string} soundName 音效名称
   */
  playSound(soundName) {
    if (this.sounds && this.sounds[soundName]) {
      console.log("播放音效:", soundName);

      try {
        // 获取音频元素
        const sound = this.sounds[soundName];

        // 根据音效类型设置音量
        if (soundName === "background") {
          if (localStorage.getItem("tetris_music") == "false") {
            return;
          }
          // 背景音乐音量
          sound.volume = 0.5;
          sound.loop = true;
        } else {
          if (localStorage.getItem("tetris_sound") == "false") {
            return;
          }
          // 其他音效音量
          sound.volume = 0.7;
        }

        // 播放音效
        sound.play().catch((error) => {
          console.warn(`无法播放音效 ${soundName}:`, error);
        });
      } catch (error) {
        console.error(`播放音效 ${soundName} 时出错:`, error);
      }
    } else {
      console.warn(`音效 ${soundName} 不存在`);
    }
  }

  // 停止所有声音
  stopAllSounds() {
    if (this.sounds) {
      Object.keys(this.sounds).forEach((soundName) => {
        this.stopSound(soundName);
      });
    }
  }

  /**
   * 停止指定的音效
   * @param {string} soundName - 要停止的音效名称
   */
  stopSound(soundName) {
    if (this.sounds && this.sounds[soundName]) {
      try {
        // 暂停原始音效
        this.sounds[soundName].pause();

        // 重置播放位置
        this.sounds[soundName].currentTime = 0;

        // 对于背景音乐等长音效，我们需要确保它们不会再次播放
        if (soundName === "background") {
          // 确保背景音乐完全停止
          this.sounds[soundName].loop = false;
          setTimeout(() => {
            // 恢复循环设置，以便下次播放时正常循环
            if (this.sounds && this.sounds[soundName]) {
              this.sounds[soundName].loop = true;
            }
          }, 100);
        }
      } catch (error) {
        console.error(`停止音效 ${soundName} 时出错:`, error);
      }
    } else {
      console.warn(`音效 ${soundName} 不存在`);
    }
  }

  stopBackgroundSound() {
    this.stopSound("background");
  }

  /**
   * 开始游戏计时
   */
  startTimer() {
    if (this.isTimerRunning) return;

    if (this.isTimedMode) {
      // 限时模式使用倒计时
      this.gameStartTime = Date.now();
      this.remainingTime = this.timedModeSeconds * 1000; // 重置剩余时间为3分钟（毫秒）
    } else {
      // 普通模式使用正计时
      this.gameStartTime = Date.now() - this.gameTime;
    }

    this.isTimerRunning = true;

    // 每秒更新一次游戏时间显示
    this.timerInterval = setInterval(() => {
      if (this.isTimerRunning) {
        if (this.isTimedMode) {
          // 限时模式，计算剩余时间
          const elapsedTime = Date.now() - this.gameStartTime;
          this.remainingTime = Math.max(
            0,
            this.timedModeSeconds * 1000 - elapsedTime
          );

          // 检查是否时间到
          if (this.remainingTime <= 0) {
            window.game.gameOver();

            console.log("限时模式时间到，游戏结束");
          }
        } else {
          // 普通模式，累加游戏时间
          this.gameTime = Date.now() - this.gameStartTime;
        }
        this.updateTimeDisplay();
      }
    }, 1000);
  }

  /**
   * 暂停计时器
   */
  pauseTimer() {
    if (!this.isTimerRunning) return;

    this.isTimerRunning = false;

    if (this.isTimedMode) {
      // 限时模式，保存当前剩余时间
      const elapsedTime = Date.now() - this.gameStartTime;
      this.remainingTime = Math.max(
        0,
        this.timedModeSeconds * 1000 - elapsedTime
      );
    } else {
      // 普通模式，保存已用时间
      this.gameTime = Date.now() - this.gameStartTime;
    }

    // 清除计时器
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * 恢复计时器
   */
  resumeTimer() {
    if (this.isTimerRunning) return;

    if (this.isTimedMode) {
      // 限时模式，根据剩余时间重新计算开始时间
      this.gameStartTime =
        Date.now() - (this.timedModeSeconds * 1000 - this.remainingTime);
    } else {
      // 普通模式，根据已用时间设置开始时间
      this.gameStartTime = Date.now() - this.gameTime;
    }

    // 设置计时器状态为运行中
    this.isTimerRunning = true;

    // 创建新的计时器
    this.timerInterval = setInterval(() => {
      if (this.isTimerRunning) {
        if (this.isTimedMode) {
          // 限时模式，计算剩余时间
          const elapsedTime = Date.now() - this.gameStartTime;
          this.remainingTime = Math.max(
            0,
            this.timedModeSeconds * 1000 - elapsedTime
          );

          // 检查是否时间到
          if (this.remainingTime <= 0) {
            window.game.gameOver();

            console.log("限时模式时间到，游戏结束");
          }
        } else {
          // 普通模式，累加游戏时间
          this.gameTime = Date.now() - this.gameStartTime;
        }
        this.updateTimeDisplay();
      }
    }, 1000);

    console.log("计时器已恢复");
  }

  /**
   * 停止游戏计时
   */
  stopTimer() {
    this.pauseTimer();

    let finalTime;
    if (this.isTimedMode) {
      // 限时模式显示初始时间
      finalTime = this.formatTime(this.timedModeSeconds * 1000);
    } else {
      // 普通模式显示累计时间
      finalTime = this.formatTime(this.gameTime);
    }

    console.log(
      `游戏结束，${
        this.isTimedMode ? "限时模式，初始时间" : "总耗时"
      }: ${finalTime}`
    );

    // 更新游戏结束模态框中的时间显示
    const finalTimeElement = document.getElementById("finalTime");
    if (finalTimeElement) {
      finalTimeElement.textContent = finalTime;
    }
  }

  /**
   * 格式化时间为 mm:ss 格式
   * @param {number} timeMs 毫秒时间
   * @returns {string} 格式化后的时间字符串
   */
  formatTime(timeMs) {
    const totalSeconds = Math.floor(timeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  /**
   * 更新时间显示
   */
  updateTimeDisplay() {
    const timeElement = document.getElementById("time");
    if (timeElement) {
      if (this.isTimedMode) {
        // 限时模式显示剩余时间
        timeElement.textContent =
          this.remainingTime > 60
            ? this.formatTime(this.remainingTime)
            : this.remainingTime;

        // 当剩余时间少于30秒时，添加警告样式
        if (this.remainingTime <= 30000) {
          timeElement.classList.add("time-warning");
        } else {
          timeElement.classList.remove("time-warning");
        }
      } else {
        // 普通模式显示已用时间
        timeElement.textContent = this.formatTime(this.gameTime);
        timeElement.classList.remove("time-warning");
      }
    }
  }

  /**
   * 显示积分动画
   * @param {number} score 获得的积分
   * @param {number} x 动画显示的X坐标
   * @param {number} y 动画显示的Y坐标
   */
  showScoreAnimation(score, x, y) {
    // 创建积分动画元素
    const scoreAnimation = document.createElement("div");
    scoreAnimation.className = "score-animation";
    scoreAnimation.textContent = `+${score}`;

    // 先设置为不可见，防止闪烁
    scoreAnimation.style.opacity = "0";

    // 先添加到文档中，这样才能获取尺寸
    document.body.appendChild(scoreAnimation);

    // 获取元素尺寸并设置位置，确保居中显示
    const width = scoreAnimation.offsetWidth;
    const height = scoreAnimation.offsetHeight;

    // 设置位置并居中显示
    scoreAnimation.style.left = `${x - width / 2}px`;
    scoreAnimation.style.top = `${y - height / 2}px`;

    // 强制重排，确保位置设置生效
    scoreAnimation.offsetHeight;

    // 移除内联样式，让CSS动画生效
    scoreAnimation.style.opacity = "";

    // 动画结束后移除元素
    setTimeout(() => {
      if (document.body.contains(scoreAnimation)) {
        document.body.removeChild(scoreAnimation);
      }
    }, 1500); // 与CSS动画时长一致
  }

  /**
   * 加载历史最高分
   * @returns {number} 历史最高分
   */
  loadHighScore() {
    const savedHighScore = localStorage.getItem("tetrisHighScore");
    return savedHighScore ? parseInt(savedHighScore, 10) : 0;
  }

  /**
   * 保存历史最高分
   * @param {number} score 要保存的分数
   */
  saveHighScore(score) {
    if (score > this.highScore) {
      this.highScore = score;
      localStorage.setItem("tetrisHighScore", score.toString());
      this.updateHighScoreDisplay();
    }
  }

  /**
   * 更新历史最高分显示
   */
  updateHighScoreDisplay() {
    const highScoreElement = document.getElementById("highScore");
    if (highScoreElement) {
      highScoreElement.textContent = formatNumber(this.highScore);
    }
  }

  /**
   * 绘制游戏模式选择界面
   */
  drawModeSelection() {
    // 检查游戏是否正在运行
    if (window.game && window.game.isRunning) {
      console.log("游戏正在运行中,取消绘制 drawModeSelection");
      return;
    }

    console.log("绘制游戏模式选择界面");
    // 绘制半透明背景
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 绘制游戏标题
    this.ctx.fillStyle = "#fff";
    this.ctx.font = "bold 28px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(
      window.i18n.getText("gameTitle"),
      this.canvas.width / 2,
      this.canvas.height / 6
    );

    // 绘制副标题
    this.ctx.font = "bold 20px Arial";
    this.ctx.fillStyle = "#3498db";
    this.ctx.fillText(
      window.i18n.getText("selectGameMode"),
      this.canvas.width / 2,
      this.canvas.height / 6 + 40
    );

    // 定义模式按钮的尺寸和位置
    const btnWidth = 210;
    const btnHeight = 50;
    const btnSpacing = 30;
    const startY = this.canvas.height / 2 - btnHeight - btnSpacing; // 调整起始位置以适应三个按钮

    // 标准模式按钮
    const standardBtnX = this.canvas.width / 2 - btnWidth / 2;
    const standardBtnY = startY;

    // 疯狂模式按钮
    const crazyBtnX = this.canvas.width / 2 - btnWidth / 2;
    const crazyBtnY = startY + btnHeight + btnSpacing;

    // 限时模式按钮
    const timedBtnX = this.canvas.width / 2 - btnWidth / 2;
    const timedBtnY = startY + (btnHeight + btnSpacing) * 2;

    // 检查鼠标是否在按钮上
    const isStandardHovered = this._isMouseOverButton(
      standardBtnX,
      standardBtnY,
      btnWidth,
      btnHeight,
      this.lastMouseX,
      this.lastMouseY
    );
    const isCrazyHovered = this._isMouseOverButton(
      crazyBtnX,
      crazyBtnY,
      btnWidth,
      btnHeight,
      this.lastMouseX,
      this.lastMouseY
    );
    const isTimedHovered = this._isMouseOverButton(
      timedBtnX,
      timedBtnY,
      btnWidth,
      btnHeight,
      this.lastMouseX,
      this.lastMouseY
    );

    // 绘制标准模式按钮
    this._drawModeButton(
      standardBtnX,
      standardBtnY,
      btnWidth,
      btnHeight,
      window.i18n.getText("standardMode"),
      isStandardHovered,
      "#2196F3",
      "#1976D2"
    );

    // 绘制疯狂模式按钮
    this._drawModeButton(
      crazyBtnX,
      crazyBtnY,
      btnWidth,
      btnHeight,
      window.i18n.getText("crazyMode"),
      isCrazyHovered,
      "#e74c3c",
      "#c0392b"
    );

    // 绘制限时模式按钮
    this._drawModeButton(
      timedBtnX,
      timedBtnY,
      btnWidth,
      btnHeight,
      window.i18n.getText("timedMode"),
      isTimedHovered,
      "#9b59b6",
      "#8e44ad"
    );

    // 绘制模式说明背景
    const explanationY = timedBtnY + btnHeight + 40;
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.fillRect(this.canvas.width / 2 - 200, explanationY - 20, 400, 60);

    // 绘制模式说明文本
    this.ctx.font = "18px Arial";
    this.ctx.fillStyle = "#f8f8f8";
    let explanationText = "";

    if (isStandardHovered) {
      explanationText = window.i18n.getText("standardModeExplanation");
    } else if (isCrazyHovered) {
      explanationText = window.i18n.getText("crazyModeExplanation");
    } else if (isTimedHovered) {
      explanationText = window.i18n.getText("timedModeExplanation");
    } else {
      explanationText = window.i18n.getText("defaultModeExplanation");
    }

    if (document.body.clientWidth >= 768) {
      // 设置文本居中对齐
      this.ctx.textAlign = "center";

      // 计算文本宽度
      const maxWidth = document.getElementById("gameCanvas")?.width - 30 || 300; // 留出一些边距
      const words = explanationText.split(" ");
      let line = "";
      let lines = [];

      // 分行处理文本
      for (let word of words) {
        const testLine = line + (line ? " " : "") + word;
        const metrics = this.ctx.measureText(testLine);

        if (metrics.width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = testLine;
        }
      }
      lines.push(line);

      // 绘制多行文本
      const lineHeight = 24;
      lines.forEach((line, i) => {
        this.ctx.fillText(
          line,
          this.canvas.width / 2,
          explanationY + i * lineHeight
        );
      });
    }

    // 设置鼠标样式
    this.canvas.style.cursor =
      isStandardHovered || isCrazyHovered || isTimedHovered
        ? "pointer"
        : "default";

    // 移除旧的事件监听器
    this._removeEventListeners();

    // 创建新的事件监听器 - 鼠标移动
    this._mouseMoveHandler = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 保存最后鼠标位置
      this.lastMouseX = x;
      this.lastMouseY = y;

      const currentStandardHovered = this._isMouseOverButton(
        standardBtnX,
        standardBtnY,
        btnWidth,
        btnHeight,
        x,
        y
      );
      const currentCrazyHovered = this._isMouseOverButton(
        crazyBtnX,
        crazyBtnY,
        btnWidth,
        btnHeight,
        x,
        y
      );
      const currentTimedHovered = this._isMouseOverButton(
        timedBtnX,
        timedBtnY,
        btnWidth,
        btnHeight,
        x,
        y
      );

      if (
        currentStandardHovered !== isStandardHovered ||
        currentCrazyHovered !== isCrazyHovered ||
        currentTimedHovered !== isTimedHovered
      ) {
        requestAnimationFrame(() => this.drawModeSelection());
      }
    };

    // 创建新的事件监听器 - 鼠标点击
    this._startClickHandler = (e) => {
      // 检查游戏是否正在运行
      if (window.game && window.game.isRunning) {
        console.log("游戏正在运行中,忽略触摸事件");
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (
        this._isMouseOverButton(
          standardBtnX,
          standardBtnY,
          btnWidth,
          btnHeight,
          x,
          y
        )
      ) {
        this._selectGameMode("STANDARD");
      } else if (
        this._isMouseOverButton(crazyBtnX, crazyBtnY, btnWidth, btnHeight, x, y)
      ) {
        this._selectGameMode("CRAZY");
      } else if (
        this._isMouseOverButton(timedBtnX, timedBtnY, btnWidth, btnHeight, x, y)
      ) {
        this._selectGameMode("TIMED");
      }
    };

    // 创建新的事件监听器 - 触摸结束
    this._startTouchHandler = (e) => {
      // 防止触摸事件同时触发点击事件
      e.preventDefault();

      if (e.changedTouches.length === 0) return;

      const rect = this.canvas.getBoundingClientRect();
      const touch = e.changedTouches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      if (
        this._isMouseOverButton(
          standardBtnX,
          standardBtnY,
          btnWidth,
          btnHeight,
          x,
          y
        )
      ) {
        this._selectGameMode("STANDARD");
      } else if (
        this._isMouseOverButton(crazyBtnX, crazyBtnY, btnWidth, btnHeight, x, y)
      ) {
        this._selectGameMode("CRAZY");
      } else if (
        this._isMouseOverButton(timedBtnX, timedBtnY, btnWidth, btnHeight, x, y)
      ) {
        this._selectGameMode("TIMED");
      }
    };

    // 添加新的事件监听器
    this.canvas.addEventListener("mousemove", this._mouseMoveHandler);
    this.canvas.addEventListener("click", this._startClickHandler);
    this.canvas.addEventListener("touchend", this._startTouchHandler);

    // 保存按钮位置信息
    this._modeButtonsInfo = {
      standard: {
        x: standardBtnX,
        y: standardBtnY,
        width: btnWidth,
        height: btnHeight,
      },
      crazy: { x: crazyBtnX, y: crazyBtnY, width: btnWidth, height: btnHeight },
      timed: { x: timedBtnX, y: timedBtnY, width: btnWidth, height: btnHeight },
    };
  }

  /**
   * 辅助方法 - 绘制模式按钮
   * @param {number} x 按钮X坐标
   * @param {number} y 按钮Y坐标
   * @param {number} width 按钮宽度
   * @param {number} height 按钮高度
   * @param {string} text 按钮文本
   * @param {boolean} isHovered 是否悬停
   * @param {string} color1 渐变颜色1
   * @param {string} color2 渐变颜色2
   * @private
   */
  _drawModeButton(x, y, width, height, text, isHovered, color1, color2) {
    // 创建渐变
    const gradient = this.ctx.createLinearGradient(x, y, x, y + height);

    if (isHovered) {
      // 悬停状态使用更亮的颜色
      gradient.addColorStop(0, this._lightenColor(color1, 20));
      gradient.addColorStop(1, color1);
    } else {
      gradient.addColorStop(0, color1);
      gradient.addColorStop(1, color2);
    }

    // 添加按钮阴影
    this.ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    this.ctx.shadowBlur = 15;
    this.ctx.shadowOffsetY = isHovered ? 4 : 8; // 悬停时阴影更小

    // 绘制按钮背景
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, width, height, 25);
    this.ctx.fill();

    // 绘制按钮边框
    if (isHovered) {
      this.ctx.strokeStyle = "#fff";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, width, height, 25);
      this.ctx.stroke();
    }

    // 绘制按钮文字
    this.ctx.fillStyle = "#fff";
    this.ctx.font = "bold 22px Arial";
    this.ctx.shadowColor = "transparent"; // 移除文字阴影
    this.ctx.fillText(text, x + width / 2, y + height / 2);

    // 绘制按钮光效
    if (isHovered) {
      // 添加顶部高光
      const highlight = this.ctx.createLinearGradient(
        x,
        y,
        x,
        y + height * 0.4
      );
      highlight.addColorStop(0, "rgba(255, 255, 255, 0.3)");
      highlight.addColorStop(1, "rgba(255, 255, 255, 0)");

      this.ctx.fillStyle = highlight;
      this.ctx.beginPath();
      this.ctx.roundRect(x + 2, y + 2, width - 4, height * 0.4 - 2, 22);
      this.ctx.fill();
    }
  }

  /**
   * 辅助方法 - 使颜色变亮
   * @param {string} color 颜色值
   * @param {number} percent 提亮百分比
   * @returns {string} 提亮后的颜色
   * @private
   */
  _lightenColor(color, percent) {
    // 移除颜色字符串中的 # 符号
    const hex = color.replace("#", "");

    // 将十六进制颜色转换为 RGB 值
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // 计算提亮后的 RGB 值
    const lightenR = Math.min(255, Math.floor((r * (100 + percent)) / 100));
    const lightenG = Math.min(255, Math.floor((g * (100 + percent)) / 100));
    const lightenB = Math.min(255, Math.floor((b * (100 + percent)) / 100));

    // 将 RGB 值转换回十六进制颜色
    return `#${lightenR.toString(16).padStart(2, "0")}${lightenG
      .toString(16)
      .padStart(2, "0")}${lightenB.toString(16).padStart(2, "0")}`;
  }

  /**
   * 辅助方法 - 移除所有事件监听器
   * @private
   */
  _removeEventListeners() {
    if (this._mouseMoveHandler) {
      this.canvas.removeEventListener("mousemove", this._mouseMoveHandler);
      this._mouseMoveHandler = null;
    }
    if (this._startClickHandler) {
      this.canvas.removeEventListener("click", this._startClickHandler);
      this._startClickHandler = null;
    }
    if (this._startTouchHandler) {
      this.canvas.removeEventListener("touchend", this._startTouchHandler);
      this._startTouchHandler = null;
    }
  }

  /**
   * 选择游戏模式并开始游戏
   * @param {string} mode 游戏模式
   * @private
   */
  _selectGameMode(mode) {
    console.log(`选择了游戏模式: ${mode}`);

    // 移除事件监听器
    this._removeEventListeners();

    // 重置鼠标样式
    this.canvas.style.cursor = "default";

    // 设置游戏模式
    if (window.setGameMode) {
      window.setGameMode(mode);
    }

    // 触发游戏开始
    this._triggerStartGame();
  }
}

// 导出 Board 类
if (typeof window !== "undefined") {
  window.Board = Board;
}
