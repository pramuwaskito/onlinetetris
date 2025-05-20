/**
 * 国际化支持模块 (i18n.js)
 * 实现网站的多语言切换功能
 */
class I18n {
  /**
   * 初始化i18n实例
   */
  constructor() {
    // 支持的语言列表
    this.languages = ["en", "zh"];

    // 默认语言
    this.defaultLanguage = "en";

    // 当前语言
    this.currentLanguage = this.getSavedLanguage() || this.defaultLanguage;

    // 翻译资源
    this.resources = {
      // 英文翻译
      en: {
        // 语言切换
        languageSwitch: "中文",

        // 游戏标题和描述
        gameTitle: "Tetris",
        gameDescription: "Classic Tetris game",

        // 游戏状态和分数
        time: "Time",
        highScore: "High Score",
        score: "Score",
        level: "Level",
        speed: "Speed",

        // 游戏元素
        nextBlock: "Next Block",

        // 控制说明
        controls: "Controls",
        moveLeft: "Move Left/Right",
        rotate: "Rotate",
        moveDown: "Move Down",
        hardDrop: "Hard Drop",
        pauseGame: "Pause Game",

        // 按钮
        continueBtn: "Continue",
        restartBtn: "Restart",
        backBtn: "Back",

        gamePausedDesc: "Game Paused",

        // 游戏模式
        switchMode: "Switch Mode",
        selectGameMode: "Select Game Mode",

        standardMode: "Standard Mode",
        crazyMode: "Crazy Mode",
        timedMode: "Timed Mode(3min)",

        defaultModeExplanation: "Please select a game mode to start the game",
        standardModeExplanation:
          "Standard speed, suitable for beginners and casual players",
        crazyModeExplanation:
          "High speed falling, suitable for challenging difficult players",
        timedModeExplanation:
          "Limited time mode (3 minutes), get the highest score within the limited time",

        // 游戏结束
        gameOver: "Game Over",
        yourScore: "Your Score",
        gameTime: "Game Time",

        // 积分规则
        scoringRules: "Scoring Rules",
        linesCleared: "Lines Cleared",
        line1: "1 Line: 10pts × Level",
        line2: "2 Lines: 30pts × Level",
        line3: "3 Lines: 50pts × Level",
        line4: "4 Lines: 60pts × Level",
        gameDifficulty: "Game Difficulty",
        standardModeRule: "Standard Mode: Speed +10% per level",
        crazyModeRule: "Crazy Mode: Speed +15% per level",
        timedModeRule: "Timed Mode: 3 minutes countdown",
        levelUp: "Level Up",
        levelUpRule: "Rise one level for every 10 rows eliminated",
        speedUp: "Higher level, faster drop speed",

        // 移动端控制
        moveRight: "Move Right",
        softDrop: "Soft Drop",
      },

      // 中文翻译
      zh: {
        // 语言切换
        languageSwitch: "English",

        // 游戏标题和描述
        gameTitle: "俄罗斯方块",
        gameDescription: "经典俄罗斯方块游戏",

        // 游戏状态和分数
        time: "时间",
        highScore: "最高分",
        score: "得分",
        level: "等级",
        speed: "速度",

        // 游戏元素
        nextBlock: "下一个方块",

        // 控制说明
        controls: "操作说明",
        moveLeft: "左/右移动",
        rotate: "旋转",
        moveDown: "下移",
        hardDrop: "快速下落",
        pauseGame: "暂停游戏",

        // 按钮
        continueBtn: "继续",
        restartBtn: "重新开始",
        backBtn: "返回",

        gamePausedDesc: "游戏暂停",

        // 游戏模式
        switchtMode: "切换模式",
        selectGameMode: "选择游戏模式",

        standardMode: "标准模式",
        crazyMode: "疯狂模式",
        timedMode: "限时模式",

        defaultModeExplanation: "请选择游戏模式开始游戏",
        standardModeExplanation: "经典俄罗斯方块规则，速度逐渐增加",
        crazyModeExplanation: "更快的速度和随机特殊方块",
        timedModeExplanation: "与时间赛跑 - 3分钟内获得最高分",

        // 游戏结束
        gameOver: "游戏结束",
        yourScore: "你的得分",
        gameTime: "游戏时间",

        // 积分规则
        scoringRules: "积分规则",
        linesCleared: "消除行数",
        line1: "1行：10分 × 当前等级",
        line2: "2行：30分 × 当前等级",
        line3: "3行：50分 × 当前等级",
        line4: "4行：60分 × 当前等级",
        gameDifficulty: "游戏难度",
        standardModeRule: "标准模式：速度每级+10%",
        crazyModeRule: "疯狂模式：速度每级+15%",
        timedModeRule: "限时模式：3分钟倒计时",
        levelUp: "等级提升",
        levelUpRule: "每消除 10 行提升一级",
        speedUp: "等级越高，下落速度越快",

        // 移动端控制
        moveRight: "右移",
        softDrop: "缓慢下落",
      },
    };

    console.log(`I18n initialized. Current language: ${this.currentLanguage}`);
  }

  /**
   * 初始化
   */
  init() {
    // 设置HTML的lang属性
    document.documentElement.lang = this.currentLanguage;

    // 初始翻译页面
    this.translatePage();

    console.log(`Language initialized: ${this.currentLanguage}`);
  }

  /**
   * 获取保存的语言设置
   * @returns {string|null} 语言代码或null
   */
  getSavedLanguage() {
    return localStorage.getItem("tetris_language");
  }

  /**
   * 设置语言
   * @param {string} lang 语言代码
   */
  setLanguage(lang) {
    // 验证语言是否被支持
    if (!this.languages.includes(lang)) {
      console.error(`Language ${lang} is not supported`);
      return;
    }

    // 设置语言
    this.currentLanguage = lang;

    // 保存语言设置
    localStorage.setItem("tetris_language", lang);

    // 更新HTML lang属性
    document.documentElement.lang = lang;

    // 触发语言变化事件
    const event = new Event("languageChanged");
    document.dispatchEvent(event);

    // 更新国旗图标
    this.updateFlagIcon();

    console.log(`Language set to: ${lang}`);
  }

  /**
   * 切换语言
   */
  toggleLanguage() {
    const currentIndex = this.languages.indexOf(this.currentLanguage);
    const nextIndex = (currentIndex + 1) % this.languages.length;
    const nextLanguage = this.languages[nextIndex];

    this.setLanguage(nextLanguage);
  }

  /**
   * 获取翻译文本
   * @param {string} key 翻译键
   * @returns {string} 翻译后的文本
   */
  getText(key) {
    const translations = this.resources[this.currentLanguage];
    if (!translations || !translations[key]) {
      // 如果找不到翻译，返回键名或英文翻译
      return this.resources.en[key] || key;
    }
    return translations[key];
  }

  /**
   * 翻译整个页面
   */
  translatePage() {
    // 翻译所有带有data-i18n属性的元素
    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach((element) => {
      const key = element.getAttribute("data-i18n");
      element.textContent = this.getText(key);
    });

    // 更新带有data-title-i18n属性的元素的title属性
    document.querySelectorAll("[data-title-i18n]").forEach((el) => {
      const key = el.getAttribute("data-title-i18n");
      el.title = this.getText(key);
    });

    // 更新国旗图标
    this.updateFlagIcon();
  }

  /**
   * 更新国旗图标
   */
  updateFlagIcon() {
    const langBtns = document.querySelectorAll(".lang-flag-icon");
    langBtns.forEach((btn) => {
      if (this.currentLanguage === "en") {
        btn.textContent = "🇺🇸";
        btn.title = this.getText("languageSwitch");
      } else if (this.currentLanguage === "zh") {
        btn.textContent = "🇨🇳";
        btn.title = this.getText("languageSwitch");
      }
    });
  }
}

// 创建全局i18n实例
window.i18n = new I18n();

// 页面加载完成后初始化i18n
document.addEventListener("DOMContentLoaded", () => {
  window.i18n.init();

  const commentBtn = document.getElementById("commentScrollBtn");
  const reviewContent = document.querySelector(".review-content");

  if (commentBtn && reviewContent) {
    commentBtn.addEventListener("click", function () {
      // 滚动到评论区域
      reviewContent.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  // 添加语言切换功能
  const langOptions = document.querySelectorAll(".lang-option");

  // 为语言选项添加点击事件
  langOptions.forEach((option) => {
    option.addEventListener("click", function () {
      const lang = this.getAttribute("data-lang");
      if (window.i18n && lang) {
        window.i18n.setLanguage(lang);
        window.i18n.translatePage();

        window.game.board.drawModeSelection();
      }
    });
  });
});
