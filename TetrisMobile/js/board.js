/**
 * 游戏面板类
 * 负责管理游戏状态和逻辑
 */
class Board {
  /**
   * 创建游戏面板
   * @param {HTMLCanvasElement} canvas 游戏画布
   * @param {HTMLCanvasElement} nextCanvas 下一个方块画布
   */
  constructor(canvas, nextCanvas) {
    // 保存画布引用
    this.canvas = canvas;
    this.currentMode = "";
    this.nextCanvas = nextCanvas;

    // 获取画布上下文
    this.ctx = canvas.getContext("2d");
    this.nextCtx = nextCanvas ? nextCanvas.getContext("2d") : null;

    // 初始化历史最高分
    this.highScore = this.loadHighScore();

    // 防止画布上的缩放行为
    this.preventCanvasZoom();

    // 初始化行消除处理标记
    this._processingLineClear = false;

    // 绘制优化相关属性
    this._needsRedraw = true; // 标记是否需要重绘
    this._lastGameState = null; // 缓存上次的游戏状态
    this._staticContentCached = false; // 静态内容是否已缓存
    this._ghostPieceCache = null; // 投影方块缓存
    this._lastPiecePosition = null; // 上次方块位置缓存

    // 离屏画布缓存系统
    this._offscreenCanvas = null; // 离屏画布
    this._offscreenCtx = null; // 离屏画布上下文
    this._staticContentDirty = true; // 静态内容是否需要更新
    this._lastGridState = null; // 上次网格状态的哈希值

    // 性能优化设置
    this.performanceMode = "balanced"; // 'performance' | 'visual' | 'balanced'

    // 从localStorage加载性能模式偏好
    const savedPerformanceMode = localStorage.getItem(
      "tetris_performance_mode"
    );
    if (
      savedPerformanceMode &&
      ["performance", "visual", "balanced"].includes(savedPerformanceMode)
    ) {
      this.performanceMode = savedPerformanceMode;
    }

    // 初始化排名提交标记
    this._scoreSubmitted = false;

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
      background: new Audio("assets/sounds/background.mp3"),
      lineClear: new Audio("assets/sounds/line-clear.mp3"),
      move: new Audio("assets/sounds/move.mp3"),
      rotate: new Audio("assets/sounds/rotate.mp3"),
      drop: new Audio("assets/sounds/drop.mp3"),
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

    // 更新上下文设置
    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = "#333";

    // 初始化或更新离屏画布
    this.initOffscreenCanvas();

    // 画布大小改变，标记需要重绘
    this.markForRedraw("canvas size updated");

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

    // 游戏状态
    this.isGameOver = false;
    this.isPaused = false;
    this._processingLineClear = false;

    // 重置排名提交标记
    this._scoreSubmitted = false;

    // 重置绘制缓存
    this._needsRedraw = true;
    this._lastGameState = null;
    this._staticContentCached = false;
    this._ghostPieceCache = null;
    this._lastPiecePosition = null;

    // 重置离屏画布缓存
    this._staticContentDirty = true;
    this._lastGridState = null;

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

    // 新方块生成，清除投影缓存并标记重绘
    this._ghostPieceCache = null;
    this.markForRedraw("new piece spawned");
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
        // 只有在手动移动时播放音效
        if (!isAutoMove && ((dx !== 0 && dy === 0) || (dx === 0 && dy > 0))) {
          this.playSound("move");
        }

        this.currentPiece.move(dx, dy);

        // 检查是否到底
        const isAtBottom = !isValidMove(
          this.grid,
          this.currentPiece.shape,
          this.currentPiece.x,
          this.currentPiece.y + 1
        );

        // 判断方块是否还有左右移动空间
        const isLeftMove = isValidMove(
          this.grid,
          this.currentPiece.shape,
          this.currentPiece.x - 1,
          this.currentPiece.y
        );

        const isRightMove = isValidMove(
          this.grid,
          this.currentPiece.shape,
          this.currentPiece.x + 1,
          this.currentPiece.y
        );

        const fullRows = this.getFullRows(this.generateGrid());

        if (isAtBottom) {
          // 如果方块无法左右移动，则固定方块
          if (!isLeftMove && !isRightMove) {
            this.placePiece();
            resolve(false);
            return;
          }

          // 如果当前有可消除的行，则固定方块
          if (fullRows.length > 0) {
            this.placePiece();
            resolve(false);
            return;
          }
        }

        // 方块位置改变，清除投影缓存并标记重绘
        this._ghostPieceCache = null;
        this.markForRedraw("piece moved");

        this.draw();
        resolve(true);
        return;
      }

      // 如果向下移动失败，则固定方块
      if (dy > 0) {
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

        // 方块形状改变，清除投影缓存并标记重绘
        this._ghostPieceCache = null;
        this.markForRedraw("piece rotated");

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
      this.playLandingAnimation(pieceInfo);
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
      const duration = 300; // 动画持续时间（毫秒）
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
    // 判断当前方块是否超出顶部，超出的话，结束游戏。
    if (this.currentPiece.y < 0) {
      console.log("游戏结束：方块超出顶部");
      setTimeout(() => {
        window.game.gameOver();
      }, 1000);
      return;
    }

    console.log("固定方块到网格");
    this.grid = this.generateGrid();

    // 清除当前方块
    this.currentPiece = null;

    // 网格状态发生变化，标记重绘
    this.markForRedraw("piece placed");

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
   *  生成网格
   */
  generateGrid() {
    let newGrid = this.grid.map((row) => [...row]);

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
            newGrid[gridY][gridX] = type;
          }
        }
      });
    });

    return newGrid;
  }
  /**
   * 获取需要消除的行
   */
  getFullRows(grid) {
    // 记录已填满的行索引
    const fullRows = [];

    // 检查每一行
    for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
      // 确保行存在且所有单元格都有方块
      if (grid[y] && grid[y].every((cell) => cell !== null)) {
        fullRows.push(y);
        console.log(`发现完整行: ${y}, 内容:`, grid[y]); // 增强调试日志
      }
    }
    return fullRows;
  }

  /**
   * 检查并消除完整的行
   */
  async clearLines() {
    // 记录已填满的行索引
    const fullRows = this.getFullRows(this.grid);

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

      // 保存原始网格状态
      const originalGrid = this.grid.map((row) => [...row]);

      // 计算得分
      let scoreToAdd = fullRows.length * 10;
      if (fullRows.length == 4) {
        scoreToAdd = 100;
      } else if (fullRows.length == 3) {
        scoreToAdd = 60;
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

      // 计算动画显示位置（在画布的中上位置）
      const canvasRect = this.canvas.getBoundingClientRect();
      const x = canvasRect.left + this.canvas.width / 2;
      const y = canvasRect.top + this.canvas.height * 0.25; // 画布顶部1/4处

      // 执行积分动画（不等待，让它独立执行）
      this.showScoreAnimation(scoreToAdd, x, y);

      // 提前创建新网格，移除被消除的行（在消除动画进行时就准备好）
      const newGrid = [];

      // 先添加空行（被消除行的数量）
      for (let i = 0; i < fullRows.length; i++) {
        newGrid.push(Array(GAME_CONFIG.COLS).fill(null));
      }

      // 然后添加未被消除的行（从上到下）
      for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
        if (!fullRows.includes(y)) {
          newGrid.push([...this.grid[y]]);
        }
      }

      // 预计算下落动画需要的方块移动映射
      const blockMoves = [];
      for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
        if (fullRows.includes(y)) continue;
        for (let x = 0; x < GAME_CONFIG.COLS; x++) {
          const block = originalGrid[y][x];
          if (block !== null) {
            const rowsBelow = fullRows.filter((row) => row > y).length;
            const newY = y + rowsBelow;
            if (newY !== y) {
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

      console.log(`预计算完成，需要下落的方块数量: ${blockMoves.length}`);

      // 执行消除动画
      await this.playLineClearAnimation(fullRows);

      console.log("消除动画完成，立即开始方块下落动画");

      // 如果有方块需要下落，立即开始下落动画
      if (blockMoves.length > 0) {
        await this.playBlocksFallingAnimationOptimized(
          originalGrid,
          newGrid,
          fullRows,
          blockMoves
        );
      } else {
        console.log("没有方块需要下落，直接更新网格");
      }

      console.log("下落动画完成，更新网格数据");

      // 动画完成后更新实际网格
      this.grid = newGrid;

      // 打印消除后的网格状态
      console.log("消除后的网格状态:");
      for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
        if (this.grid[y].some((cell) => cell !== null)) {
          console.log(`行 ${y}:`, this.grid[y]);
        }
      }

      // 清除处理标记
      this._processingLineClear = false;

      // 网格发生重大变化，标记重绘
      this.markForRedraw("lines cleared");

      // 更新分数显示
      this.updateScoreDisplay();

      if (this.isPaused) {
        return;
      }

      this.spawnNewPiece();

      // 重新绘制最终状态
      this.draw();

      // 重新计算下落时间
      window.game.recalculateDropTime();
    } catch (error) {
      console.error("行消除过程中出错:", error);
      // 清除处理标记
      // 只有当游戏没有暂停时，才继续游戏（生成新方块）
      if (!this.isPaused) {
        // 确保即使出错也能继续游戏
        this.spawnNewPiece();
        // 重新绘制最终状态
        this.draw();
      }
    }
  }

  /**
   * 播放消除动画（性能优化版本）
   * @param {Array<number>} rows 要消除的行索引数组
   * @returns {Promise} 动画完成的Promise
   */
  async playLineClearAnimation(rows) {
    console.log("开始播放行消除动画", rows);
    return new Promise((resolve) => {
      const duration = 750; // 动画持续时间缩短到500ms,让动画更快速流畅
      const startTime = performance.now();

      // 保存原始状态
      const originalGrid = this.grid.map((row) => [...row]);

      // 为每个方块创建碎片
      const fragments = [];

      // 使用更平滑的缓动函数
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

        // 绘制未消除的方块
        for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
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

        // 消除行的动画效果
        if (progress < 0.3) {
          // 闪光阶段缩短到30%时间
          // 闪光效果
          const flashProgress = progress / 0.3;
          const flashIntensity =
            Math.sin(flashProgress * Math.PI * 4) * (1 - flashProgress);

          rows.forEach((rowIndex) => {
            const cellSize = this.actualCellSize;
            const y = rowIndex * cellSize;

            // 创建更亮的闪光效果
            const glow = this.ctx.createLinearGradient(
              0,
              y,
              this.canvas.width,
              y + cellSize
            );
            glow.addColorStop(
              0,
              `rgba(255, 255, 255, ${flashIntensity * 0.2})`
            );
            glow.addColorStop(0.5, `rgba(255, 255, 255, ${flashIntensity})`);
            glow.addColorStop(
              1,
              `rgba(255, 255, 255, ${flashIntensity * 0.2})`
            );

            // 绘制闪光
            this.ctx.fillStyle = glow;
            this.ctx.fillRect(0, y, this.canvas.width, cellSize);

            // 绘制原始方块
            for (let x = 0; x < GAME_CONFIG.COLS; x++) {
              if (originalGrid[rowIndex] && originalGrid[rowIndex][x]) {
                this.ctx.save();
                this.ctx.globalAlpha = 0.8 + flashIntensity * 0.2;
                drawBlock(
                  this.ctx,
                  x,
                  rowIndex,
                  originalGrid[rowIndex][x],
                  this.actualCellSize
                );
                this.ctx.restore();
              }
            }
          });
        } else {
          // 消散动画
          const disappearProgress = (progress - 0.3) / 0.7;

          rows.forEach((rowIndex) => {
            for (let x = 0; x < GAME_CONFIG.COLS; x++) {
              if (originalGrid[rowIndex] && originalGrid[rowIndex][x]) {
                const centerX = GAME_CONFIG.COLS / 2;
                const distanceFromCenter = Math.abs(x - centerX);
                const maxDistance = Math.max(
                  centerX,
                  GAME_CONFIG.COLS - centerX
                );

                // 从中心向两边消失
                const blockDisappearPoint =
                  (distanceFromCenter / maxDistance) * 0.6;

                if (disappearProgress < blockDisappearPoint) {
                  this.ctx.save();
                  const alpha = Math.pow(
                    1 - disappearProgress / blockDisappearPoint,
                    1.2
                  );
                  this.ctx.globalAlpha = alpha;

                  // 添加缩放和旋转效果
                  const scale = 1 + 0.2 * (1 - alpha);
                  const rotation = ((1 - alpha) * Math.PI) / 6;

                  this.ctx.translate(
                    x * this.actualCellSize + this.actualCellSize / 2,
                    rowIndex * this.actualCellSize + this.actualCellSize / 2
                  );
                  this.ctx.rotate(rotation);
                  this.ctx.scale(scale, scale);
                  this.ctx.translate(
                    -this.actualCellSize / 2,
                    -this.actualCellSize / 2
                  );

                  drawBlock(
                    this.ctx,
                    0,
                    0,
                    originalGrid[rowIndex][x],
                    this.actualCellSize
                  );
                  this.ctx.restore();
                }
                // 创建碎片
                else if (disappearProgress < blockDisappearPoint + 0.1) {
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
          fragments.forEach((fragment) => {
            fragment.x += fragment.vx * 5;
            fragment.y += fragment.vy * 5;
            fragment.vy += 0.2; // 重力效果
            fragment.rotation += fragment.rotationSpeed;
            fragment.size = fragment.originalSize * (1 - disappearProgress);

            this.ctx.save();
            this.ctx.translate(fragment.x, fragment.y);
            this.ctx.rotate(fragment.rotation);
            this.ctx.fillStyle = fragment.color;
            this.ctx.fillRect(
              -fragment.size / 2,
              -fragment.size / 2,
              fragment.size,
              fragment.size
            );
            this.ctx.restore();
          });
        }

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
   * 为方块创建碎片效果（原始华丽版本）
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

    // 适当增加碎片数量以配合更长的动画
    const fragmentCount = 5 + Math.floor(Math.random() * 4); // 5-8个碎片

    for (let i = 0; i < fragmentCount; i++) {
      // 确定碎片类型：0=矩形, 1=三角形, 2=圆形
      const fragmentType = Math.floor(Math.random() * 3);

      // 碎片大小（稍微大一些，更明显）
      const size = cellSize * (0.12 + Math.random() * 0.2);

      // 初始位置（在方块内随机分布）
      const offsetX = (Math.random() - 0.5) * cellSize * 0.7;
      const offsetY = (Math.random() - 0.5) * cellSize * 0.7;

      // 随机速度和方向（更优雅的扩散效果）
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 1.2; // 更温和的初始速度
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 0.3; // 轻微向上的初始趋势

      // 随机旋转（更慢的旋转速度）
      const rotationSpeed = (Math.random() - 0.5) * 0.15;

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
        opacity: 0.95,
        type: fragmentType,
        gravity: 0.08 + Math.random() * 0.02, // 更轻的重力
        friction: 0.988, // 更少的空气阻力
        bounce: 0.15 + Math.random() * 0.1, // 更小的弹性
        originX: x,
        originY: y,
        lifespan: 1.2 + Math.random() * 0.6, // 更长的寿命配合更长的动画
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
        fragment.vx *= 0.7; // 落地时减少水平速度
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

      // 随着动画进行，碎片逐渐变小并消失（更慢的消失速度）
      fragment.lifespan -= 0.008; // 更慢的消失速度配合更长的动画
      fragment.opacity = Math.max(0, fragment.lifespan);

      // 更平滑的尺寸变化
      const lifespanRatio = fragment.lifespan / (1.2 + 0.6); // 基于初始寿命范围
      fragment.size = fragment.originalSize * Math.pow(lifespanRatio, 0.5);

      // 如果碎片寿命结束，移除它
      if (fragment.lifespan <= 0) {
        fragments.splice(i, 1);
        continue;
      }

      // 绘制碎片
      this.ctx.save();

      // 设置透明度（更平滑的透明度过渡）
      const alphaMultiplier = Math.pow(fragment.opacity, 0.8);
      this.ctx.globalAlpha = alphaMultiplier;

      // 设置变换
      this.ctx.translate(fragment.x, fragment.y);
      this.ctx.rotate(fragment.rotation);

      // 设置碎片颜色和轻微发光效果
      this.ctx.fillStyle = fragment.color;
      this.ctx.shadowColor = fragment.color;
      this.ctx.shadowBlur = 2 * alphaMultiplier; // 更柔和的发光效果

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
   * 播放上方方块下落动画（优化版本，使用预计算数据）
   * @param {Array} oldGrid - 原始网格
   * @param {Array} newGrid - 更新后的网格
   * @param {Array} clearedRows - 被消除的行索引
   * @param {Array} blockMoves - 预计算的方块移动数据
   * @returns {Promise} - 动画完成的Promise
   */
  playBlocksFallingAnimationOptimized(
    oldGrid,
    newGrid,
    clearedRows,
    blockMoves
  ) {
    return new Promise((resolve) => {
      // 动画持续时间（毫秒）- 缩短到150ms让下落更快
      const duration = 200;
      // 动画开始时间
      const startTime = performance.now();

      // 缓动函数 - 使用更快的下落效果，模拟重力加速
      const easeInQuart = (t) => {
        return t * t * t * t;
      };

      console.log(`开始下落动画，需要移动的方块数量: ${blockMoves.length}`);

      // 动画函数
      const animate = (currentTime) => {
        // 计算动画进度
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeInQuart(progress);

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
                // 检查这个方块是否会被其他移动的方块覆盖
                const willBeCovered = blockMoves.some(
                  (move) =>
                    move.x === x &&
                    move.startY < y &&
                    move.endY >= y &&
                    move.startY + (move.endY - move.startY) * easedProgress <= y
                );

                if (!willBeCovered) {
                  drawBlock(this.ctx, x, y, oldGrid[y][x], this.actualCellSize);
                }
              }
            }
          }
        }

        // 如果动画未完成，继续下一帧
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          console.log("优化版下落动画完成");
          resolve();
        }
      };

      // 立即开始动画
      requestAnimationFrame(animate);
    });
  }

  /**
   * 播放上方方块下落动画（原版本，保留作为备用）
   * @param {Array} oldGrid - 原始网格
   * @param {Array} newGrid - 更新后的网格
   * @param {Array} clearedRows - 被消除的行索引
   * @returns {Promise} - 动画完成的Promise
   */
  playBlocksFallingAnimation(oldGrid, newGrid, clearedRows) {
    return new Promise((resolve) => {
      // 动画持续时间（毫秒）- 缩短到200ms让下落更快
      const duration = 200;
      // 动画开始时间
      const startTime = performance.now();

      // 缓动函数 - 使用更快的下落效果，模拟重力加速
      const easeInQuart = (t) => {
        return t * t * t * t;
      };

      // 创建方块移动映射 - 记录每个方块的移动轨迹
      const blockMoves = [];

      // 遍历原网格中的每个方块
      for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
        // 跳过被消除的行
        if (clearedRows.includes(y)) continue;

        for (let x = 0; x < GAME_CONFIG.COLS; x++) {
          const block = oldGrid[y][x];
          if (block !== null) {
            // 计算这个方块在新网格中的位置
            // 计算在当前位置下方有多少个被消除的行
            const rowsBelow = clearedRows.filter((row) => row > y).length;
            const newY = y + rowsBelow;

            // 只有当位置发生变化时才需要动画
            if (newY !== y) {
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

      // 动画函数
      const animate = (currentTime) => {
        // 计算动画进度
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeInQuart(progress);

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
                // 检查这个方块是否会被其他移动的方块覆盖
                const willBeCovered = blockMoves.some(
                  (move) =>
                    move.x === x &&
                    move.startY < y &&
                    move.endY >= y &&
                    move.startY + (move.endY - move.startY) * easedProgress <= y
                );

                if (!willBeCovered) {
                  drawBlock(this.ctx, x, y, oldGrid[y][x], this.actualCellSize);
                }
              }
            }
          }
        }

        // 如果动画未完成，继续下一帧
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          console.log("下落动画完成");
          resolve();
        }
      };

      // 如果没有方块需要移动，直接结束
      if (blockMoves.length === 0) {
        console.log("没有方块需要下落，直接完成");
        resolve();
        return;
      }

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
      // 检查是否需要重绘
      if (!this._needsRedraw && !this.hasGameStateChanged()) {
        // 游戏状态没有变化，跳过重绘
        return;
      }

      // 重置重绘标记
      this._needsRedraw = false;

      // 检查网格是否已初始化
      if (!this.grid) return;

      // 清空画布
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.nextCtx.clearRect(
        0,
        0,
        this.nextCanvas.width,
        this.nextCanvas.height
      );

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

      // 绘制静态内容（背景网格线和已放置的方块）
      this.drawStaticContent();

      // 绘制当前方块的投影（优化：使用缓存）
      if (this.currentPiece && !this.isGameOver && !this.isPaused) {
        this.drawGhostPiece();
      }

      // 绘制当前方块
      if (this.currentPiece && this.currentPiece.shape) {
        this.currentPiece.draw(this.ctx);
      }

      // 绘制预览区域内容
      this.drawPreviewAreas();

      // 如果游戏暂停，绘制暂停界面
      if (this.isPaused) {
        this.drawPauseScreen();
      }
    } catch (error) {
      console.error("Error in draw method:", error);
      // 出错时标记需要重绘，避免卡住
      this.markForRedraw("draw error");
    }
  }

  /**
   * 绘制静态内容（背景网格和已放置的方块）- 使用离屏画布缓存
   */
  drawStaticContent() {
    // 检查是否需要更新静态内容缓存
    if (this.needsStaticContentUpdate()) {
      this.updateStaticContent();
    }

    // 直接将离屏画布复制到主画布（超高性能）
    if (this._offscreenCanvas) {
      this.ctx.drawImage(this._offscreenCanvas, 0, 0);
    } else {
      // 备用方案：直接绘制（兼容性）
      console.warn("离屏画布未初始化，使用备用绘制方法");
      this.drawGrid();

      for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
        for (let x = 0; x < GAME_CONFIG.COLS; x++) {
          if (this.grid[y] && this.grid[y][x]) {
            drawBlock(this.ctx, x, y, this.grid[y][x], this.actualCellSize);
          }
        }
      }
    }
  }

  /**
   * 绘制投影方块（带缓存优化）
   */
  drawGhostPiece() {
    try {
      // 检查是否需要重新计算投影
      const currentPiecePosition = this.currentPiece
        ? {
            x: this.currentPiece.x,
            y: this.currentPiece.y,
            type: this.currentPiece.type,
            rotation: this.currentPiece.rotation,
          }
        : null;

      // 如果当前方块位置没有改变且有缓存，直接使用缓存
      if (
        this._ghostPieceCache &&
        this._lastPiecePosition &&
        this.deepEqual(currentPiecePosition, this._lastPiecePosition)
      ) {
        // 使用缓存的投影方块
        if (this._ghostPieceCache.shape) {
          this._ghostPieceCache.draw(this.ctx, true);
        }
        return;
      }

      // 重新计算投影方块
      const ghost = this.currentPiece.getGhost(this.grid);

      // 缓存投影结果
      this._ghostPieceCache = ghost;
      this._lastPiecePosition = JSON.parse(
        JSON.stringify(currentPiecePosition)
      );

      // 绘制投影方块
      if (ghost && ghost.shape) {
        ghost.draw(this.ctx, true);
      }
    } catch (error) {
      console.error("Error drawing ghost piece:", error);
      // 出错时清除缓存
      this._ghostPieceCache = null;
      this._lastPiecePosition = null;
    }
  }

  /**
   * 绘制预览区域
   */
  drawPreviewAreas() {
    // 绘制下一个方块
    if (this.nextPiece && this.nextPiece.shape) {
      this.nextPiece.drawPreview(this.nextCtx);
    }
  }

  /**
   * 绘制背景网格线到指定画布
   * @param {CanvasRenderingContext2D} ctx 画布上下文
   */
  drawGridToCanvas(ctx) {
    const cellSize = this.actualCellSize || getCellSize();
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    // 设置网格线样式
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; // 半透明白色
    ctx.lineWidth = 1;

    // 绘制垂直线
    for (let x = 0; x <= GAME_CONFIG.COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize, 0);
      ctx.lineTo(x * cellSize, height);
      ctx.stroke();
    }

    // 绘制水平线
    for (let y = 0; y <= GAME_CONFIG.ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize);
      ctx.lineTo(width, y * cellSize);
      ctx.stroke();
    }

    // 额外绘制游戏区域的边界线
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; // 更明显的边界线
    ctx.lineWidth = 2;

    // 绘制四个角
    const cornerSize = 10; // 角的大小

    // 左上角
    ctx.beginPath();
    ctx.moveTo(0, cornerSize);
    ctx.lineTo(0, 0);
    ctx.lineTo(cornerSize, 0);
    ctx.stroke();

    // 右上角
    ctx.beginPath();
    ctx.moveTo(width - cornerSize, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, cornerSize);
    ctx.stroke();

    // 左下角
    ctx.beginPath();
    ctx.moveTo(0, height - cornerSize);
    ctx.lineTo(0, height);
    ctx.lineTo(cornerSize, height);
    ctx.stroke();

    // 右下角
    ctx.beginPath();
    ctx.moveTo(width - cornerSize, height);
    ctx.lineTo(width, height);
    ctx.lineTo(width, height - cornerSize);
    ctx.stroke();
  }

  /**
   * 绘制背景网格线（兼容性方法）
   */
  drawGrid() {
    this.drawGridToCanvas(this.ctx);
  }

  /**
   * 绘制游戏结束画面
   */
  drawGameOver() {
    // 如果游戏已经结束，防止重复执行
    if (this.isGameOver) {
      console.log("游戏已经结束，跳过重复调用 drawGameOver");
      return;
    }

    console.log("开始处理游戏结束逻辑");

    // 设置游戏结束状态
    this.isGameOver = true;

    // 停止游戏计时
    this.stopTimer();

    // 保存最高分（只会执行一次）
    this.saveHighScore(this.score);

    // 游戏结束状态改变，标记重绘
    this.markForRedraw("game over");

    // 更新游戏结束模态框中的分数信息

    const gameOverTitleElement = document.getElementById("gameOverTitle");

    const finalLevelElement = document.getElementById("finalLevel");
    const finalLinesElement = document.getElementById("finalLines");
    const finalScoreElement = document.getElementById("finalScore");
    const finalHighScoreElement = document.getElementById("finalHighScore");
    const finalScorePercentageElement = document.getElementById(
      "finalScorePercentage"
    );

    const finalTimeElement = document.getElementById("finalTime");

    if (finalLevelElement) {
      finalLevelElement.textContent = this.level;
    }

    if (finalLinesElement) {
      finalLinesElement.textContent = this.lines;
    }

    if (finalScoreElement) {
      finalScoreElement.textContent = this.score;
    }

    if (finalHighScoreElement) {
      finalHighScoreElement.textContent = this.highScore;
    }

    if (finalTimeElement) {
      finalTimeElement.textContent = this.formatTime(this.gameTime);
    }

    if (finalScorePercentageElement) {
      // 通过分数，模拟百分比，搞一个区间即可，按照最 0 ～ 100000 的区间，0 分是 %10，100000 分是 %100，

      if (this.score >= 100000) {
        this.scorePercentage = "99.9%";
      } else if (this.score >= 90000) {
        this.scorePercentage = "99%";
      } else if (this.score >= 80000) {
        this.scorePercentage = "98%";
      } else if (this.score >= 70000) {
        this.scorePercentage = "97%";
      } else if (this.score >= 60000) {
        this.scorePercentage = "96%";
      } else if (this.score >= 50000) {
        this.scorePercentage = "95%";
      } else if (this.score >= 40000) {
        this.scorePercentage = "90%";
      } else if (this.score >= 30000) {
        this.scorePercentage = "80%";
      } else if (this.score >= 20000) {
        this.scorePercentage = "75%";
      } else if (this.score >= 10000) {
        this.scorePercentage = "70%";
      } else if (this.score >= 8000) {
        this.scorePercentage = "60%";
      } else if (this.score >= 5000) {
        this.scorePercentage = "55%";
      } else if (this.score >= 3000) {
        this.scorePercentage = "35%";
      } else if (this.score >= 1000) {
        this.scorePercentage = "25%";
      } else {
        this.scorePercentage = "10%";
      }

      finalScorePercentageElement.textContent = this.scorePercentage;
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

    console.log("游戏结束逻辑处理完成");
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
      window.i18n.getText("switchMode"),
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
  async showScoreAnimation(score, x, y) {
    await new Promise((resolve) => setTimeout(resolve, 150));
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
    // 更新本地最高分记录
    if (score > this.highScore) {
      localStorage.setItem("tetrisHighScore", score.toString());
      this.highScore = score;
      this.updateHighScoreDisplay();
      console.log("新的最高分已保存:", score);
    }

    console.log("saveHighScore - 开始保存分数:", score);

    // 防止重复提交同一局游戏的分数
    if (this._scoreSubmitted) {
      console.log("本局游戏分数已提交，跳过重复提交");
      return;
    }

    // 标记分数已提交
    this._scoreSubmitted = true;

    let params = {};

    try {
      params = this.genParams(score);
      GoogleAnalytics.event("update_score", {
        ...params,
        high_score: this.highScore,
      });
    } catch (error) {
      console.error("GA事件记录失败:", error);
    }

    try {
      if (score > 0) {
        const encryptedParams = this.encryptParams(params);
        localStorage.setItem("latestparams", encryptedParams);
        console.log("准备提交排名数据:", params);
        window.updateRank(encryptedParams);
      } else {
        console.log("分数为0，跳过排名提交");
      }
    } catch (error) {
      console.error("更新排名失败", error);
      // 提交失败时重置标记，允许重试
      this._scoreSubmitted = false;
    }
  }

  // 随机生成三个字母组合
  generateId() {
    // 生成三个随机字母的组合
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    for (let i = 0; i < 3; i++) {
      result += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return result;
  }

  simpleEncrypt(text, key) {
    let mixed = "";
    for (let i = 0; i < text.length; i++) {
      const t = text.charCodeAt(i);
      const k = key.charCodeAt(i % key.length);
      mixed += String.fromCharCode(t ^ k); // 异或混淆
    }

    // 将混淆后的字符串编码为 UTF-8，再 base64 编码
    const utf8Bytes = new TextEncoder().encode(mixed);
    const binaryStr = Array.from(utf8Bytes)
      .map((b) => String.fromCharCode(b))
      .join("");
    return btoa(binaryStr);
  }

  encryptParams(params) {
    return this.simpleEncrypt(JSON.stringify(params), "mysecret");
  }

  genParams(score) {
    // 从 localStorage 中获取 id, 如果没有的话，生成 id, 并保存到 localStorage, 规则是 用户名 + 当前时间戳
    const id = localStorage.getItem("tetrisId");
    if (!id) {
      const username = this.generateId();
      const currentTime = new Date().getTime();
      id = `${username}-${currentTime}`;
      localStorage.setItem("tetrisId", id);
    }

    let params = {
      client_version: "v1.7.1", // 添加版本号
      id,
      score: Number(score),
      mode: this.currentMode,
      lines: Number(this.lines),
      speed: Number(this.speed),
      level: Number(this.level),
      time: Math.floor(this.gameTime / 1000),
    };

    return params;
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

    // 标记需要重绘模式选择界面
    this.markForRedraw("mode selection");

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

    this.currentMode = mode;

    // 重置鼠标样式
    this.canvas.style.cursor = "default";

    // 设置游戏模式
    if (window.setGameMode) {
      window.setGameMode(mode);
    }

    // 触发游戏开始
    this._triggerStartGame();
  }

  /**
   * 标记需要重绘
   * @param {string} reason 重绘原因（用于调试）
   */
  markForRedraw(reason = "") {
    this._needsRedraw = true;
    this._staticContentCached = false;

    // 如果是网格相关的变化，标记静态内容需要更新
    if (
      reason.includes("placed") ||
      reason.includes("cleared") ||
      reason.includes("spawned") ||
      reason.includes("canvas size")
    ) {
      this._staticContentDirty = true;
    }

    if (reason) {
      // console.log(`标记重绘: ${reason}`);
    }
  }

  /**
   * 检查游戏状态是否发生变化
   * @returns {boolean} 是否有变化
   */
  hasGameStateChanged() {
    const currentState = {
      currentPiece: this.currentPiece
        ? {
            x: this.currentPiece.x,
            y: this.currentPiece.y,
            type: this.currentPiece.type,
            rotation: this.currentPiece.rotation,
          }
        : null,
      grid: this.grid.map((row) => [...row]), // 深拷贝网格
      isGameOver: this.isGameOver,
      isPaused: this.isPaused,
      nextPiece: this.nextPiece ? this.nextPiece.type : null,
    };

    // 如果是第一次检查或者状态发生变化
    if (
      !this._lastGameState ||
      !this.deepEqual(currentState, this._lastGameState)
    ) {
      this._lastGameState = JSON.parse(JSON.stringify(currentState)); // 深拷贝
      return true;
    }

    return false;
  }

  /**
   * 深度比较两个对象是否相等
   * @param {*} obj1 对象1
   * @param {*} obj2 对象2
   * @returns {boolean} 是否相等
   */
  deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true;

    if (obj1 == null || obj2 == null) return obj1 === obj2;

    if (typeof obj1 !== typeof obj2) return false;

    if (typeof obj1 !== "object") return obj1 === obj2;

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this.deepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
  }

  /**
   * 初始化离屏画布
   */
  initOffscreenCanvas() {
    // 创建离屏画布
    this._offscreenCanvas = document.createElement("canvas");
    this._offscreenCanvas.width = this.canvas.width;
    this._offscreenCanvas.height = this.canvas.height;
    this._offscreenCtx = this._offscreenCanvas.getContext("2d");

    // 设置与主画布相同的上下文属性
    this._offscreenCtx.lineWidth = 1;
    this._offscreenCtx.strokeStyle = "#333";

    // 标记静态内容需要更新
    this._staticContentDirty = true;

    console.log(
      "离屏画布已初始化:",
      this._offscreenCanvas.width,
      "x",
      this._offscreenCanvas.height
    );
  }

  /**
   * 生成网格状态的简单哈希值
   * @returns {string} 网格状态哈希
   */
  getGridHash() {
    let hash = "";
    for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
      for (let x = 0; x < GAME_CONFIG.COLS; x++) {
        hash += this.grid[y][x] ? "1" : "0";
      }
    }
    return hash;
  }

  /**
   * 检查静态内容是否需要更新
   * @returns {boolean} 是否需要更新
   */
  needsStaticContentUpdate() {
    if (this._staticContentDirty || !this._offscreenCanvas) {
      return true;
    }

    const currentGridHash = this.getGridHash();
    if (currentGridHash !== this._lastGridState) {
      this._lastGridState = currentGridHash;
      return true;
    }

    return false;
  }

  /**
   * 更新离屏画布中的静态内容
   */
  updateStaticContent() {
    if (!this._offscreenCanvas || !this._offscreenCtx) {
      this.initOffscreenCanvas();
    }

    // 清空离屏画布
    this._offscreenCtx.clearRect(
      0,
      0,
      this._offscreenCanvas.width,
      this._offscreenCanvas.height
    );

    // 绘制网格线到离屏画布
    this.drawGridToCanvas(this._offscreenCtx);

    // 绘制已放置的方块到离屏画布
    for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
      for (let x = 0; x < GAME_CONFIG.COLS; x++) {
        if (this.grid[y] && this.grid[y][x]) {
          drawBlock(
            this._offscreenCtx,
            x,
            y,
            this.grid[y][x],
            this.actualCellSize
          );
        }
      }
    }

    // 标记静态内容已更新
    this._staticContentDirty = false;
    this._lastGridState = this.getGridHash();

    console.log("静态内容已更新到离屏画布");
  }

  /**
   * 计算当前方块堆积程度
   * @returns {number} 堆积百分比 (0-1)
   */
  calculateBlockDensity() {
    let filledCells = 0;
    let totalCells = GAME_CONFIG.ROWS * GAME_CONFIG.COLS;

    for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
      for (let x = 0; x < GAME_CONFIG.COLS; x++) {
        if (this.grid[y] && this.grid[y][x]) {
          filledCells++;
        }
      }
    }

    return filledCells / totalCells;
  }

  /**
   * 计算最高方块的位置
   * @returns {number} 最高方块的行数（从底部开始计算）
   */
  getHighestBlockRow() {
    for (let y = 0; y < GAME_CONFIG.ROWS; y++) {
      for (let x = 0; x < GAME_CONFIG.COLS; x++) {
        if (this.grid[y] && this.grid[y][x]) {
          return GAME_CONFIG.ROWS - y; // 返回从底部开始的行数
        }
      }
    }
    return 0; // 没有方块
  }

  /**
   * 根据游戏状态获取动画设置
   * @returns {Object} 动画配置对象
   */
  getAnimationSettings() {
    const density = this.calculateBlockDensity();
    const highestRow = this.getHighestBlockRow();
    const stackHeight = highestRow / GAME_CONFIG.ROWS; // 堆积高度百分比

    // 根据性能模式调整策略
    if (this.performanceMode === "visual") {
      // 视觉优先：始终保持完整动画
      return {
        level: "full",
        fragmentsPerBlock: 4, // 更多碎片
        animationDuration: 800, // 更长动画时间
        useFragments: true,
        useFlash: true,
        fragmentComplexity: "rich",
      };
    } else if (this.performanceMode === "performance") {
      // 性能优先：根据堆积情况积极优化
      if (stackHeight < 0.6 || density < 0.5) {
        return {
          level: "medium",
          fragmentsPerBlock: 2,
          animationDuration: 500,
          useFragments: true,
          useFlash: true,
          fragmentComplexity: "simple",
        };
      } else {
        return {
          level: "minimal",
          fragmentsPerBlock: 1,
          animationDuration: 300,
          useFragments: true,
          useFlash: true,
          fragmentComplexity: "simple",
        };
      }
    } else {
      // 平衡模式：当前的设置（调整后的保守策略）
      if (stackHeight < 0.85 || density < 0.75) {
        return {
          level: "full",
          fragmentsPerBlock: 3,
          animationDuration: 750,
          useFragments: true,
          useFlash: true,
          fragmentComplexity: "normal",
        };
      } else if (stackHeight < 0.95 && density < 0.85) {
        return {
          level: "medium",
          fragmentsPerBlock: 2,
          animationDuration: 600,
          useFragments: true,
          useFlash: true,
          fragmentComplexity: "simple",
        };
      } else {
        return {
          level: "minimal",
          fragmentsPerBlock: 1,
          animationDuration: 400,
          useFragments: true,
          useFlash: true,
          fragmentComplexity: "simple",
        };
      }
    }
  }

  /**
   * 设置性能模式
   * @param {string} mode 性能模式：'performance' | 'visual' | 'balanced'
   */
  setPerformanceMode(mode) {
    if (["performance", "visual", "balanced"].includes(mode)) {
      this.performanceMode = mode;
      localStorage.setItem("tetris_performance_mode", mode);
      console.log(`性能模式已设置为: ${mode}`);

      // 如果游戏正在运行，标记需要重绘
      this.markForRedraw("performance mode changed");
    } else {
      console.warn("无效的性能模式:", mode);
    }
  }
}

// 导出 Board 类
if (typeof window !== "undefined") {
  // 修改配置
  window.Board = Board;

  // 添加全局函数供控制台调用
  window.setPerformanceMode = function (mode) {
    if (window.board && typeof window.board.setPerformanceMode === "function") {
      window.board.setPerformanceMode(mode);
      console.log(`🎮 游戏性能模式已切换到: ${mode}`);
      console.log(
        '📝 可选模式: "visual"(视觉优先), "performance"(性能优先), "balanced"(平衡)'
      );
    } else {
      console.warn("游戏未初始化或board对象不可用");
    }
  };

  // 显示当前性能模式
  window.getPerformanceMode = function () {
    if (window.board && window.board.performanceMode) {
      console.log(`🎮 当前性能模式: ${window.board.performanceMode}`);
      console.log(
        '📝 可用命令: setPerformanceMode("visual"), setPerformanceMode("performance"), setPerformanceMode("balanced")'
      );
      return window.board.performanceMode;
    } else {
      console.warn("游戏未初始化或board对象不可用");
    }
  };
}
