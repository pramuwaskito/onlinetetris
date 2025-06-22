/**
 * 游戏主逻辑
 */
class Game {
  /**
   * 创建游戏实例
   */
  constructor() {
    // 获取游戏画布
    this.gameCanvas = document.getElementById("gameCanvas");
    this.nextCanvas = document.getElementById("nextCanvas");

    // 禁用双击缩放
    this.disableDoubleTapZoom();

    // 创建游戏面板
    this.board = new Board(this.gameCanvas, this.nextCanvas);

    // 初始化显示历史最高分
    this.board.updateHighScoreDisplay();

    // 初始化按钮元素
    this.startBtn = null;
    this.pauseBtn = null;
    this.restartBtn = null;
    this.restartGameBtn = null;
    this.resumeBtn = null;
    this.musicToggle = null;
    this.soundToggle = null;
    this.fullscreenToggle = null;
    this.returnToModeSelectBtn = null;

    // 初始化控制按钮
    this.initControls();

    // 初始化游戏模式选择
    this.initGameModeSelector();

    // 初始化键盘事件
    this.initKeyboardEvents();

    // 初始化触摸事件
    this.bindEvents();

    // 游戏循环相关变量
    this.isRunning = false;
    this.dropInterval = null;
    this.isPaused = false;

    // 初始化游戏状态
    this.lastDropTime = 0;
    this.frameInterval = 1000 / 60; // 60 FPS

    // 隐藏游戏结束模态框
    const gameOverModal = document.getElementById("gameOverModal");
    if (gameOverModal) {
      gameOverModal.style.display = "none";
    }

    // 触控相关状态
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.lastMoveTime = 0;
    this.isSwiping = false;
    this.lastMoveDirection = null; // 记录最后一次移动的方向：'horizontal' 或 'vertical'

    // 添加动画相关状态
    this.lastRenderTime = 0;
    this.dropAccumulator = 0;

    // 页面可见性状态
    this._wasRunningBeforeHidden = false;

    // 初始化音频设置
    this.initAudioSettings();

    // 窗口大小变化时重新计算尺寸
    window.addEventListener("resize", () => {
      if (this.resizeTimeout) clearTimeout(this.resizeTimeout);

      this.resizeTimeout = setTimeout(() => {
        this.board.updateCanvasSize();
      }, 100);
    });

    // 强制立即更新画布尺寸
    setTimeout(() => {
      this.board.updateCanvasSize();
    }, 0);

    // 添加移动端控制
    if (document.getElementById("mobile-controls")) {
      this.addMobileControls();
    }

    // 添加页面可见性变化监听
    document.addEventListener("visibilitychange", () => {
      this._handleVisibilityChange(document.hidden);
    });

    // 添加移动设备上的额外事件监听
    window.addEventListener("pagehide", () => {
      this._handleVisibilityChange(true);
    });

    window.addEventListener("pageshow", () => {
      this._handleVisibilityChange(false);
    });

    // 处理iOS设备上的特殊情况
    window.addEventListener("blur", () => {
      this._handleVisibilityChange(true);
    });

    window.addEventListener("focus", () => {
      this._handleVisibilityChange(false);
    });

    console.log("Game initialized");

    // 从 this.gameCanvas 中移除 class="gameCanvas-bg"
    this.gameCanvas.classList.remove("gameCanvas-bg");
    this.gameCanvas.style.backgroundColor = "var(--panel-bg)";

    // 触发开始游戏
    // this.board._triggerStartGame();
  }

  /**
   * 初始化音频设置
   */
  initAudioSettings() {
    // 如果本地存储中没有音频设置，则设置默认值
    if (localStorage.getItem("tetris_music") === null) {
      localStorage.setItem("tetris_music", "true");
    }

    if (localStorage.getItem("tetris_sound") === null) {
      localStorage.setItem("tetris_sound", "true");
    }
  }

  /**
   * 初始化控制按钮
   */
  initControls() {
    // 获取控制按钮元素
    this.startBtn = document.getElementById("startBtn");
    this.pauseBtn = document.getElementById("pauseBtn");
    this.restartBtn = document.getElementById("restartBtn");
    this.restartGameBtn = document.getElementById("restartGameBtn");
    this.returnToModeSelectBtn = document.getElementById(
      "returnToModeSelectBtn"
    );
    this.resumeBtn = document.getElementById("resumeBtn");
    this.musicToggle = document.getElementById("musicToggle");
    this.soundToggle = document.getElementById("soundToggle");

    // 绑定开始按钮点击事件
    if (this.startBtn) {
      this.startBtn.addEventListener("click", () => {
        console.log("点击开始按钮");
        this.startGame();
      });
      this.startBtn.setAttribute("data-codelab", 11);
    }

    // 绑定暂停按钮点击事件
    if (this.pauseBtn) {
      this.pauseBtn.addEventListener("click", () => {
        console.log("点击暂停按钮");
        this.togglePause();
      });
    }

    // 绑定重新开始按钮点击事件
    if (this.restartBtn) {
      this.restartBtn.addEventListener("click", () => {
        console.log("点击重新开始按钮");
        this.restartGame();
      });
    }

    // 绑定游戏结束弹窗中的重新开始按钮事件
    if (this.restartGameBtn) {
      this.restartGameBtn.addEventListener("click", () => {
        console.log("点击游戏结束弹窗重新开始按钮");
        this.restartGame();
        const gameOverModal = document.getElementById("gameOverModal");
        if (gameOverModal) {
          gameOverModal.style.display = "none";
        }
      });
    }

    // 绑定游戏结束弹窗中的返回选择按钮事件
    if (this.returnToModeSelectBtn) {
      this.returnToModeSelectBtn.addEventListener("click", () => {
        console.log("点击返回选择按钮");
        // 隐藏游戏结束弹窗
        const gameOverModal = document.getElementById("gameOverModal");
        if (gameOverModal) {
          gameOverModal.style.display = "none";
        }

        // 显示模式选择界面
        if (this.board) {
          window.game.isRunning = false;
          this.board.drawModeSelection();
        }
      });
    }

    // 初始化音乐和音效按钮
    this.initAudioControls();

    // 初始化全屏按钮
    this.initFullscreenControl();

    // 初始化移动设备控制按钮
    this.initMobileControls();
  }

  /**
   * 初始化音乐和音效控制
   */
  initAudioControls() {
    // 从本地存储获取音乐和音效设置
    const musicEnabled = localStorage.getItem("tetris_music") !== "false";
    const soundEnabled = localStorage.getItem("tetris_sound") !== "false";

    // 更新按钮状态
    this.updateAudioButtonState(this.musicToggle, musicEnabled);
    this.updateAudioButtonState(this.soundToggle, soundEnabled);

    // 绑定音乐按钮事件
    if (this.musicToggle) {
      this.musicToggle.addEventListener("click", () => {
        const newState = localStorage.getItem("tetris_music") === "false";
        localStorage.setItem("tetris_music", newState);
        this.updateAudioButtonState(this.musicToggle, newState);

        // 如果游戏正在运行，根据新状态控制背景音乐
        if (this.isRunning && !this.isPaused) {
          if (newState) {
            this.board.playSound("background");
          } else {
            this.board.stopSound("background");
          }
        }
      });
    }

    // 绑定音效按钮事件
    if (this.soundToggle) {
      this.soundToggle.addEventListener("click", () => {
        const newState = localStorage.getItem("tetris_sound") === "false";
        localStorage.setItem("tetris_sound", newState);
        this.updateAudioButtonState(this.soundToggle, newState);

        // 更新所有音效的静音状态
        if (this.board && this.board.sounds) {
          Object.keys(this.board.sounds).forEach((key) => {
            if (key !== "background") {
              this.board.sounds[key].muted = !newState;
            }
          });
        }
      });
    }
  }

  /**
   * 更新音频按钮状态
   * @param {HTMLElement} button 按钮元素
   * @param {boolean} enabled 是否启用
   */
  updateAudioButtonState(button, enabled) {
    if (!button) return;

    // 获取图标元素
    const iconElement = button.querySelector(".material-icons");
    if (!iconElement) return;

    // 更新按钮样式
    if (enabled) {
      button.classList.remove("disabled");
      iconElement.style.opacity = "1";

      // 根据按钮类型设置正确的图标
      if (button.id === "musicToggle") {
        iconElement.textContent = "music_note";
      } else if (button.id === "soundToggle") {
        iconElement.textContent = "volume_up";
      }
    } else {
      button.classList.add("disabled");
      iconElement.style.opacity = "0.5";

      // 根据按钮类型设置带斜杠的图标
      if (button.id === "musicToggle") {
        iconElement.textContent = "music_off";
      } else if (button.id === "soundToggle") {
        iconElement.textContent = "volume_off";
      }
    }
  }

  /**
   * 初始化移动设备控制按钮
   */
  initMobileControls() {
    console.log("初始化移动设备控制按钮");

    // 获取移动设备控制按钮
    const leftBtn = document.getElementById("leftBtn");
    const rightBtn = document.getElementById("rightBtn");
    const downBtn = document.getElementById("downBtn");
    const rotateBtn = document.getElementById("rotateBtn");
    const dropBtn = document.getElementById("dropBtn");

    // 检查按钮是否存在
    if (!leftBtn || !rightBtn || !downBtn || !rotateBtn || !dropBtn) {
      console.log("移动设备控制按钮不存在或未找到");
      return;
    }

    // 为按钮添加触摸事件
    this.addMobileButtonEvent(leftBtn, () => {
      if (this.board && !this.board.isGameOver && !this.board.isPaused) {
        this.board.movePiece(-1, 0);
      }
    });

    this.addMobileButtonEvent(rightBtn, () => {
      if (this.board && !this.board.isGameOver && !this.board.isPaused) {
        this.board.movePiece(1, 0);
      }
    });

    this.addMobileButtonEvent(downBtn, () => {
      if (this.board && !this.board.isGameOver && !this.board.isPaused) {
        this.board.movePiece(0, 1);
      }
    });

    this.addMobileButtonEvent(rotateBtn, () => {
      if (this.board && !this.board.isGameOver && !this.board.isPaused) {
        this.board.rotatePiece();
      }
    });

    this.addMobileButtonEvent(dropBtn, () => {
      if (this.board && !this.board.isGameOver && !this.board.isPaused) {
        this.board.hardDrop();
      }
    });

    console.log("移动设备控制按钮初始化完成");
  }

  /**
   * 为移动设备按钮添加触摸事件
   * @param {HTMLElement} button 按钮元素
   * @param {Function} action 按钮动作
   */
  addMobileButtonEvent(button, action) {
    // 使用触摸开始事件
    button.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault(); // 防止默认行为
        action();

        // 添加触感反馈（如果支持）
        if ("vibrate" in navigator) {
          navigator.vibrate(15);
        }
      },
      { passive: false }
    );
  }

  /**
   * 绑定事件处理器
   */
  bindEvents() {
    // 触控事件
    this.gameCanvas.addEventListener(
      "touchstart",
      (e) => {
        if (!this.isRunning || this.board.isGameOver || this.board.isPaused)
          return;

        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.touchStartTime = Date.now();
        this.isSwiping = true;

        // 防止触摸事件导致页面缩放
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    this.gameCanvas.addEventListener(
      "touchmove",
      (e) => {
        if (!this.isSwiping) return;

        // 防止页面滚动
        e.preventDefault();

        const touch = e.touches[0];
        const deltaX = touch.clientX - this.touchStartX;
        const deltaY = touch.clientY - this.touchStartY;
        const threshold = 15; // 降低滑动阈值，提高灵敏度

        // 记录当前时间，用于计算滑动速度
        const currentTime = Date.now();
        const timeDelta = currentTime - this.lastMoveTime || 0;

        // 如果移动太快，限制处理频率，防止过度触发
        if (timeDelta < 50) return;

        // 更新最后移动时间
        this.lastMoveTime = currentTime;

        // 水平滑动
        if (Math.abs(deltaX) > threshold) {
          // 计算应该移动的格数（根据滑动距离可能一次移动多格）
          const moveSteps = Math.min(
            2,
            Math.floor(Math.abs(deltaX) / threshold)
          );
          const direction = deltaX > 0 ? 1 : -1;

          // 移动方块（由于movePiece返回Promise，我们不使用循环）
          this.board
            .movePiece(direction, 0)
            .then((success) => {
              // 如果第一次移动成功且滑动距离足够大，尝试第二次移动
              if (success && moveSteps > 1) {
                return this.board.movePiece(direction, 0);
              }
              return false;
            })
            .catch((error) => {
              console.error("移动方块时出错:", error);
            });

          // 重置触摸起始点，但保留一部分偏移，使连续滑动更流畅
          this.touchStartX = touch.clientX - (deltaX % threshold) * 0.5;
          this.lastMoveDirection = "horizontal";
        }

        // 垂直滑动（下移）
        if (deltaY > threshold) {
          this.board.movePiece(0, 1).catch((error) => {
            console.error("下移方块时出错:", error);
          });

          // 重置触摸起始点，但保留一部分偏移
          this.touchStartY = touch.clientY - (deltaY % threshold) * 0.5;
          this.lastMoveDirection = "vertical";
        }
      },
      { passive: false }
    );

    this.gameCanvas.addEventListener(
      "touchend",
      (e) => {
        if (!this.isSwiping) return;

        const touchEndTime = Date.now();
        const touchDuration = touchEndTime - this.touchStartTime;
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - this.touchStartX;
        const deltaY = touch.clientY - this.touchStartY;
        const threshold = 15; // 与touchmove中的阈值保持一致

        // 记录是否已经执行了滑动操作
        let hasPerformedSlideAction = false;

        // 如果最后一次移动是在短时间内（200ms内）
        const isRecentMove = touchEndTime - this.lastMoveTime < 200;

        // 只有在没有最近移动且没有记录移动方向的情况下，才根据最终位置判断是否需要移动
        if (!isRecentMove && !this.lastMoveDirection) {
          // 处理滑动结束时的移动（如果没有记录方向）
          if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
            hasPerformedSlideAction = true;
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
              // 水平移动
              this.board
                .movePiece(deltaX > 0 ? 1 : -1, 0)
                .catch((error) =>
                  console.error("触摸结束时移动方块出错:", error)
                );
            } else {
              // 垂直移动
              this.board
                .movePiece(0, 1)
                .catch((error) =>
                  console.error("触摸结束时下移方块出错:", error)
                );
            }
          }
        } else if (this.lastMoveDirection) {
          // 如果已经有移动方向，标记为已执行滑动操作，但不再额外移动
          hasPerformedSlideAction = true;
        }

        // 只有在没有执行滑动操作且触摸时间短的情况下才旋转方块
        if (
          !hasPerformedSlideAction &&
          touchDuration < 200 &&
          Math.abs(deltaX) < threshold &&
          Math.abs(deltaY) < threshold
        ) {
          this.board
            .rotatePiece()
            .catch((error) => console.error("旋转方块出错:", error));
        }

        // 重置状态
        this.isSwiping = false;
        this.lastMoveDirection = null;
      },
      { passive: true }
    );
  }

  /**
   * 开始游戏
   */
  startGame() {
    console.log("开始游戏");

    // 重置游戏状态
    this.board.reset();

    // 更新按钮状态
    if (this.startBtn) {
      this.startBtn.style.display = "none";
    }

    if (this.pauseBtn) {
      this.pauseBtn.disabled = false;
      this.pauseBtn.classList.remove("disabled");

      // 获取图标元素
      const iconElement = this.pauseBtn.querySelector(".material-icons");
      if (iconElement) {
        // 设置暂停图标
        iconElement.textContent = "pause";
      }
    }

    // 设置游戏状态
    this.isRunning = true;
    this.isPaused = false;

    // 生成第一个方块
    this.board.spawnNewPiece();

    // 开始游戏循环
    this.startGameLoop();

    // 开始计时
    this.board.startTimer();

    this.board.playSound("background");
  }

  /**
   * 清除下降定时器
   */
  clearDropInterval() {
    // 清除之前的定时器
    if (this.dropInterval) {
      clearInterval(this.dropInterval);
      this.dropInterval = null;
    }
  }

  /**
   * 重新计算下落时间
   */
  recalculateDropTime() {
    this.clearDropInterval();

    console.log(`恢复游戏，使用下落间隔: ${this.board.interval}ms`);

    // 定义下落逻辑函数
    const dropLogic = () => {
      // 如果游戏暂停或结束，不执行下落
      if (
        !this.isRunning ||
        this.board.isPaused ||
        this.board.isGameOver ||
        !this.board.currentPiece ||
        this.board._processingLineClear
      ) {
        return;
      }

      console.log("定时器触发方块下落");

      // 尝试下落当前方块，传入isAutoMove=true表示这是自动下落
      this.board
        .movePiece(0, 1, true)
        .catch((error) => console.error("下落方块时出错:", error));
    };

    // 立即执行一次
    dropLogic();

    // 使用最新计算的下落间隔创建新的下落定时器
    this.dropInterval = setInterval(dropLogic, this.board.interval);
  }

  /**
   * 切换游戏暂停状态
   */
  togglePause() {
    if (!this.isRunning) return;

    this.isPaused = !this.isPaused;
    // 同步更新Board类的isPaused属性
    if (this.board) {
      this.board.isPaused = this.isPaused;
    }

    console.log(`游戏${this.isPaused ? "已暂停" : "继续"}`);

    // 更新暂停按钮图标
    if (this.pauseBtn) {
      // 获取图标元素
      const iconElement = this.pauseBtn.querySelector(".material-icons");
      if (iconElement) {
        // 根据暂停状态设置不同的图标
        iconElement.textContent = this.isPaused ? "play_arrow" : "pause";
      }
    }

    // 显示或隐藏暂停覆盖层
    const pauseOverlay = document.getElementById("pauseOverlay");
    if (pauseOverlay) {
      pauseOverlay.style.display = this.isPaused ? "flex" : "none";
    }

    if (this.isPaused) {
      // 暂停游戏
      this.stopGameLoop();
      this.board.pauseTimer();

      // 绘制暂停界面
      if (this.board) {
        this.board.drawPauseScreen();
      }

      this.board.stopBackgroundSound();
    } else {
      // 继续游戏前先完全停止游戏循环
      this.stopGameLoop();

      // 开始游戏循环
      this.startGameLoop();

      // 启动游戏主循环
      this.lastRenderTime = performance.now();
      this.dropAccumulator = 0; // 重置下落累积器
      requestAnimationFrame((time) => this.gameLoop(time));

      // 恢复计时器
      this.board.resumeTimer();

      this.board.playSound("background");
    }
  }

  /**
   * 停止游戏循环
   */
  stopGameLoop() {
    console.log("停止游戏循环");

    this.clearDropInterval();
  }

  /**
   * 重新开始游戏
   */
  restartGame() {
    console.log("重新开始游戏");

    // 停止当前游戏循环，传递isGameOver=true
    this.stopGameLoop();

    // 停止所有音效
    if (this.board.sounds) {
      Object.keys(this.board.sounds).forEach((soundName) => {
        this.board.stopSound(soundName);
      });
    }

    // 隐藏游戏结束模态框
    const gameOverModal = document.getElementById("gameOverModal");
    if (gameOverModal) {
      gameOverModal.style.display = "none";
    }

    // 隐藏暂停覆盖层
    const pauseOverlay = document.getElementById("pauseOverlay");
    if (pauseOverlay) {
      pauseOverlay.style.display = "none";
    }

    // 重置游戏状态
    this.board.reset();

    // 开始新游戏
    this.startGame();
  }

  /**
   * 游戏主循环
   */
  gameLoop(currentTime = performance.now()) {
    if (!this.isRunning) {
      console.log("游戏停止运行");
      return;
    }

    // 更新游戏状态
    if (!this.board.isPaused && !this.board.isGameOver) {
      // 确保当前方块存在，且不在处理行消除过程中
      if (!this.board.currentPiece && !this.board._processingLineClear) {
        console.log("生成新方块");
        this.board.spawnNewPiece();
      }

      // 注意：方块的自动下落由定时器处理，这里不再处理下落逻辑

      // 重绘游戏画面
      this.board.draw();
    }

    // 如果游戏结束
    if (this.board.isGameOver) {
      console.log("游戏结束");
      this.isRunning = false;
      this.startBtn.disabled = false;
      this.pauseBtn.disabled = true;
      document.getElementById("gameOverModal").style.display = "block";
      return;
    }

    this.lastRenderTime = currentTime;

    // 继续游戏循环
    requestAnimationFrame((time) => this.gameLoop(time));
  }

  // 添加禁用双击缩放的方法
  disableDoubleTapZoom() {
    // 禁用双击缩放
    let lastTouchEnd = 0;
    document.addEventListener(
      "touchend",
      (event) => {
        const now = Date.now();
        if (now - lastTouchEnd < 300) {
          event.preventDefault();
        }
        lastTouchEnd = now;
      },
      { passive: false }
    );

    // 禁用双指缩放
    document.addEventListener(
      "touchmove",
      (event) => {
        if (event.touches.length > 1) {
          event.preventDefault();
        }
      },
      { passive: false }
    );

    // 特别处理游戏画布的触摸事件
    if (this.gameCanvas) {
      // 阻止画布上的所有默认触摸行为
      this.gameCanvas.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
        },
        { passive: false }
      );

      this.gameCanvas.addEventListener(
        "touchmove",
        (e) => {
          e.preventDefault();
        },
        { passive: false }
      );

      this.gameCanvas.addEventListener(
        "touchend",
        (e) => {
          e.preventDefault();
        },
        { passive: false }
      );

      // 阻止画布上的手势事件
      this.gameCanvas.addEventListener(
        "gesturestart",
        (e) => {
          e.preventDefault();
        },
        { passive: false }
      );

      this.gameCanvas.addEventListener(
        "gesturechange",
        (e) => {
          e.preventDefault();
        },
        { passive: false }
      );

      this.gameCanvas.addEventListener(
        "gestureend",
        (e) => {
          e.preventDefault();
        },
        { passive: false }
      );
    }
  }

  /**
   * 开始游戏循环
   */
  startGameLoop() {
    console.log("开始游戏循环");

    this.recalculateDropTime();

    // 启动游戏主循环
    this.lastRenderTime = performance.now();
    this.dropAccumulator = 0; // 重置下落累积器
    requestAnimationFrame((time) => this.gameLoop(time));

    console.log("游戏循环已启动");
  }

  /**
   * 初始化键盘事件
   */
  initKeyboardEvents() {
    console.log("初始化键盘事件");

    // 添加键盘事件监听器
    document.addEventListener("keydown", (e) => {
      // 游戏结束时的特殊按键处理
      if (this.board.isGameOver) {
        switch (e.key) {
          case "Enter":
            // 回车键触发重新开始游戏
            if (this.restartGameBtn) {
              console.log("按下回车键，重新开始游戏");
              this.restartGameBtn.click();
            }
            break;
          case "Escape":
            // ESC键触发返回模式选择
            if (this.returnToModeSelectBtn) {
              console.log("按下ESC键，返回模式选择");
              this.returnToModeSelectBtn.click();
            }
            break;
          default:
            return;
        }
        e.preventDefault();
        return;
      }

      // 只有游戏运行中且未暂停时才处理其他键盘输入
      if (!this.isRunning || this.board.isPaused || this.board.isGameOver)
        return;

      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          this.board.movePiece(-1, 0);
          break;
        case "ArrowRight":
        case "d":
        case "D":
          this.board.movePiece(1, 0);
          break;
        case "ArrowDown":
        case "s":
        case "S":
          this.board.movePiece(0, 1);
          break;
        case "ArrowUp":
        case "w":
        case "W":
          this.board.rotatePiece();
          break;
        case " ": // 空格键
          this.board.hardDrop();
          break;
        case "c":
        case "C":
          this.board.holdPiece();
          break;
        case "p":
        case "P":
          this.togglePause();
          break;
        default:
          return;
      }

      e.preventDefault();
    });

    console.log("键盘事件初始化完成");
  }

  /**
   * 游戏结束
   */
  gameOver() {
    console.log("游戏结束");

    // 停止游戏循环
    this.stopGameLoop();

    // 更新游戏状态
    this.isRunning = false;
    this.isPaused = false;

    this.board.drawGameOver();

    // 停止背景音乐
    this.board.stopBackgroundSound();

    this.board.playSound("gameover");

    if (this.pauseBtn) {
      // 恢复为"开始游戏"状态
      const iconElement = this.pauseBtn.querySelector(".material-icons");
      if (iconElement) {
        iconElement.textContent = "play_arrow";
      }
      this.pauseBtn.disabled = false;
      this.pauseBtn.classList.remove("disabled");
    }
  }

  /**
   * 处理页面可见性变化
   * @param {boolean} isHidden 页面是否隐藏
   */
  _handleVisibilityChange(isHidden) {
    if (isHidden) {
      // 页面切换到后台时暂停游戏和音乐
      if (this.isRunning && !this.board.isPaused) {
        console.log("页面切换到后台，暂停音乐");
        // 只暂停音乐，不暂停游戏
        if (this.board.sounds && this.board.sounds.background) {
          console.log("暂停背景音乐");
          try {
            this.board.sounds.background.pause();
          } catch (error) {
            console.error("暂停背景音乐时出错:", error);
          }
        }

        // 记录页面切换到后台前的游戏状态
        this._wasRunningBeforeHidden = true;
      }
    } else {
      // 页面切换回前台时，如果之前是运行状态，则恢复音乐播放
      if (
        this._wasRunningBeforeHidden &&
        this.isRunning &&
        !this.board.isPaused
      ) {
        console.log("页面切换回前台，恢复音乐播放");
        if (this.board.sounds && this.board.sounds.background) {
          console.log("恢复背景音乐");
          try {
            this.board.sounds.background.play().catch((error) => {
              console.warn("恢复背景音乐时出错:", error);
            });
          } catch (error) {
            console.error("恢复背景音乐时出错:", error);
          }
        }

        // 重置状态标记
        this._wasRunningBeforeHidden = false;
      }
    }
  }

  /**
   * 恢复游戏
   */
  resumeGame() {
    if (this.isPaused) {
      this.togglePause();
    }
  }

  /**
   * 初始化游戏模式选择功能
   */
  initGameModeSelector() {
    // 获取元素
    this.modeToggle = document.getElementById("modeToggle");
    this.modeSelectModal = document.getElementById("modeSelectModal");
    this.standardModeBtn = document.getElementById("standardModeBtn");
    this.crazyModeBtn = document.getElementById("crazyModeBtn");
    this.closeModeSelectorBtn = document.getElementById("closeModeSelectorBtn");
    this.modeDescription = document.getElementById("modeDescription");

    // 初始隐藏模式选择弹窗
    if (this.modeSelectModal) {
      this.modeSelectModal.style.display = "none";
    }

    // 绑定点击事件
    if (this.modeToggle) {
      this.modeToggle.addEventListener("click", () => {
        // 显示模式选择弹窗
        if (this.modeSelectModal) {
          this.modeSelectModal.style.display = "block";
        }
      });
    }

    // 标准模式按钮点击事件
    if (this.standardModeBtn) {
      this.standardModeBtn.addEventListener("click", () => {
        // 设置为标准模式
        window.setGameMode("STANDARD");
        this.updateModeDisplay();

        // 如果游戏正在运行，需要重新开始
        if (this.isRunning) {
          this.restartGame();
        }

        // 关闭模式选择弹窗
        if (this.modeSelectModal) {
          this.modeSelectModal.style.display = "none";
        }
      });
    }

    // 疯狂模式按钮点击事件
    if (this.crazyModeBtn) {
      this.crazyModeBtn.addEventListener("click", () => {
        // 设置为疯狂模式
        window.setGameMode("CRAZY");
        this.updateModeDisplay();

        // 如果游戏正在运行，需要重新开始
        if (this.isRunning) {
          this.restartGame();
        }

        // 关闭模式选择弹窗
        if (this.modeSelectModal) {
          this.modeSelectModal.style.display = "none";
        }
      });
    }

    // 关闭按钮点击事件
    if (this.closeModeSelectorBtn) {
      this.closeModeSelectorBtn.addEventListener("click", () => {
        // 关闭模式选择弹窗
        if (this.modeSelectModal) {
          this.modeSelectModal.style.display = "none";
        }
      });
    }

    // 更新模式显示
    this.updateModeDisplay();
  }

  /**
   * 更新游戏模式显示
   */
  updateModeDisplay() {
    // 获取当前游戏模式
    const currentModeName = window.getCurrentGameMode();

    // 更新模式切换按钮标题
    if (this.modeToggle) {
      this.modeToggle.title = `游戏模式: ${currentModeName}`;
    }

    // 更新模式描述
    if (this.modeDescription) {
      if (window.GAME_CONFIG.CURRENT_MODE === "STANDARD") {
        this.modeDescription.textContent =
          "标准模式：标准下降速度，适合新手玩家。";
      } else if (window.GAME_CONFIG.CURRENT_MODE === "CRAZY") {
        this.modeDescription.textContent =
          "疯狂模式：初始下降速度更快 (600毫秒每格)，难度更高。";
      }
    }
  }

  /**
   * 初始化全屏按钮
   */
  initFullscreenControl() {
    // 获取全屏按钮元素
    this.fullscreenToggle = document.getElementById("fullscreenToggle");

    // 绑定全屏按钮点击事件
    if (this.fullscreenToggle) {
      this.fullscreenToggle.addEventListener("click", () => {
        console.log("点击全屏按钮");
        this.toggleFullscreen();
      });
    }
  }

  /**
   * 切换全屏状态
   */
  toggleFullscreen() {
    console.log("切换全屏状态");

    if (this.board) {
      this.board.toggleFullscreen();
    }
  }

  /**
   * 设置游戏模式
   * @param {string} mode 游戏模式
   */
  setGameMode(mode) {
    // 设置全局模式
    if (setGameMode) {
      setGameMode(mode);
    }

    // 通知游戏板更新模式
    if (this.board) {
      this.board.isTimedMode = mode === "TIMED";

      // 如果是限时模式，初始化相关参数
      if (mode === "TIMED" && GAME_CONFIG.GAME_MODES.TIMED) {
        this.board.timedModeSeconds = GAME_CONFIG.GAME_MODES.TIMED.duration;
        this.board.remainingTime = this.board.timedModeSeconds * 1000;
      }

      // 更新游戏板上的模式显示
      const modeDisplay = document.getElementById("gameMode");
      if (modeDisplay) {
        modeDisplay.textContent = GAME_CONFIG.GAME_MODES[mode]?.name || mode;
      }
    }

    console.log(`游戏模式已设置为: ${mode}`);
  }
}

// 当页面加载完成时初始化游戏
window.addEventListener("load", () => {
  // 检查是否为移动端
  const isMobile = window.innerWidth <= 480;

  // 初始化游戏
  window.game = new Game();

  if (isMobile) {
    // 移动端不需要 holdCanvas
    window.game.holdCanvas = null;
    window.game.board = new Board(
      window.game.gameCanvas,
      window.game.nextCanvas
    );

    // 确保移动端控制区域可见
    const mobileControls = document.querySelector(".mobile-controls-area");
    if (mobileControls) {
      mobileControls.style.display = "flex";
    }

    console.log("移动端游戏初始化完成");
  }
});
