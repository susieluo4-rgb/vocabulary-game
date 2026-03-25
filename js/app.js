// app.js — 核心状态管理、路由、公共工具

const App = {
  state: {
    selectedUnit: 'all',
    selectedModules: [],  // [] = 全部，否则为 ['四上 M1', '四下 M2', ...]
    lastMode: null,
    progress: {}
  },

  // ── 金币系统 ─────────────────────────────────────────────────
  coins: {
    total: 0,        // 累计金币
    todayCoins: 0,   // 今日金币
    todayDate: '',   // 用于跨天重置
    lastPlayDate: '', // 上次游戏日期（计算连续天数）
    streakDays: 0,    // 连续学习天数
    totalGames: 0,    // 累计游戏局数
    totalWordsLearned: 0, // 累计学习词数
    flashcardGames: 0, // 各模式累计局数
    quizGames: 0,
    spellingGames: 0,
    matchingGames: 0,
    badges: {},       // 已解锁的徽章 { badgeId: true }
    titleIndex: 0     // 当前称号索引
  },

  // ── 每日任务系统 ────────────────────────────────────────────
  DAILY_NEW_WORDS: 20,     // 每天新学目标词数
  DAILY_REVIEW_GOAL: 10,  // 每天复习目标词数
  newWordsToday: 0,        // 今日新学词数
  reviewWordsToday: 0,     // 今日复习词数（历史错题）
  newWordsLearnedSet: new Set(), // 今日新学过的词集合（防重复计数）

  isWeekend() {
    const day = new Date().getDay(); // 0=周日, 6=周六
    return day === 0 || day === 6;
  },

  loadDailyTasks() {
    try {
      const s = localStorage.getItem('vocab-daily-v1');
      if (s) {
        const data = JSON.parse(s);
        const today = new Date().toDateString();
        if (data.date !== today) {
          // 新的一天，重置
          this.newWordsToday = 0;
          this.reviewWordsToday = 0;
          this.newWordsLearnedSet = new Set();
          this._taskFlowCompleted = false;
          this._completedModes = {};
        } else {
          this.newWordsToday = data.newWordsToday || 0;
          this.reviewWordsToday = data.reviewWordsToday || 0;
          this.newWordsLearnedSet = new Set(data.newWordsLearnedSet || []);
          this._taskFlowCompleted = !!data.taskFlowCompleted;
          this._completedModes = data.taskModesCompleted || {};
        }
      }
    } catch (_) {
      this.newWordsToday = 0;
      this.reviewWordsToday = 0;
      this.newWordsLearnedSet = new Set();
      this._taskFlowCompleted = false;
    }
  },

  saveDailyTasks() {
    try {
      const existing = localStorage.getItem('vocab-daily-v1');
      const data = existing ? JSON.parse(existing) : {};
      data.date = new Date().toDateString();
      data.newWordsToday = this.newWordsToday;
      data.reviewWordsToday = this.reviewWordsToday;
      data.newWordsLearnedSet = [...this.newWordsLearnedSet];
      // 保留打卡流程状态
      data.taskModesCompleted = data.taskModesCompleted || {};
      data.taskFlowCompleted = data.taskFlowCompleted || false;
      localStorage.setItem('vocab-daily-v1', JSON.stringify(data));
    } catch (_) {}
  },

  // 判断一个词是否今日新学过的
  isNewWordToday(word) {
    const p = this.state.progress[word];
    // 学过至少一次就不是新词
    return !p || (p.correct + p.errors) === 0;
  },

  // 记录新词学习
  recordNewWord(word) {
    if (this.isWeekend()) return; // 周末不学新词
    if (!this.isNewWordToday(word)) return; // 已经不是新词
    if (this.newWordsLearnedSet.has(word)) return; // 今日已记录过
    this.newWordsLearnedSet.add(word);
    this.newWordsToday++;
    this.saveDailyTasks();
  },

  // 记录复习（历史错题）
  recordReview(word) {
    this.reviewWordsToday++;
    this.saveDailyTasks();
  },

  // 是否完成今日新学任务
  isDailyNewWordDone() {
    if (this.isWeekend()) return true; // 周末不要求新学
    return this.newWordsToday >= this.DAILY_NEW_WORDS;
  },

  // 是否完成今日复习任务
  isDailyReviewDone() {
    return this.reviewWordsToday >= this.DAILY_REVIEW_GOAL;
  },

  // 获取今日任务状态
  getDailyTaskStatus() {
    const newDone = this.isDailyNewWordDone();
    const reviewDone = this.isDailyReviewDone();
    const allDone = newDone && reviewDone;
    return {
      isWeekend: this.isWeekend(),
      newWords: { done: this.newWordsToday, goal: this.DAILY_NEW_WORDS, doneFlag: newDone },
      review: { done: this.reviewWordsToday, goal: this.DAILY_REVIEW_GOAL, doneFlag: reviewDone },
      allDone
    };
  },

  // 更新首页任务面板
  updateDailyTasksUI() {
    const status = this.getDailyTaskStatus();
    const panel = document.getElementById('daily-task-panel');
    const newBar = document.getElementById('task-new-bar');
    const reviewBar = document.getElementById('task-review-bar');
    const newLabel = document.getElementById('task-new-label');
    const reviewLabel = document.getElementById('task-review-label');
    const allBadge = document.getElementById('task-all-done');
    const taskCoinsEl = document.getElementById('task-coins');

    if (!panel) return;

    // 周末提示
    if (status.isWeekend) {
      newLabel.textContent = '周末自由复习 🎉';
      newBar.style.width = '100%';
      newBar.style.background = '#27AE60';
    } else {
      newLabel.textContent = `新学单词 ${status.newWords.done}/${status.newWords.goal}`;
      newBar.style.width = Math.min(100, status.newWords.done / status.newWords.goal * 100) + '%';
      newBar.style.background = status.newWords.doneFlag ? '#27AE60' : '#3498DB';
    }

    reviewLabel.textContent = `复习错题 ${status.review.done}/${status.review.goal}`;
    reviewBar.style.width = Math.min(100, status.review.done / status.review.goal * 100) + '%';
    reviewBar.style.background = status.review.doneFlag ? '#27AE60' : '#F39C12';

    // 全部完成
    if (status.allDone) {
      allBadge.style.display = 'block';
      allBadge.textContent = '🎉 今日任务完成！';
    } else {
      allBadge.style.display = 'none';
    }

    // 今日金币
    if (taskCoinsEl) {
      taskCoinsEl.textContent = `今日赚取 ${this.coins.todayCoins} 金币`;
    }
  },

  // ── 每日任务打卡流程 ────────────────────────────────────────
  DAILY_TASK_MODES: ['flashcard', 'quiz', 'matching', 'spelling'],

  _inTaskFlow: false,
  _taskFlowCompleted: false,  // 今日打卡是否已完成
  _completedModes: {},         // 内存中的完成状态 { mode: true }，避免 localStorage 时序问题

  // 加载打卡状态
  loadDailyTaskFlow() {
    try {
      const s = localStorage.getItem('vocab-daily-v1');
      if (s) {
        const data = JSON.parse(s);
        const today = new Date().toDateString();
        if (data.date === today) {
          this._taskFlowCompleted = !!data.taskFlowCompleted;
        } else {
          this._taskFlowCompleted = false;
        }
      }
    } catch (_) {
      this._taskFlowCompleted = false;
    }
  },

  saveDailyTaskFlow() {
    this.saveDailyTasks(); // saveDailyTasks now also saves taskFlowCompleted
  },

  // 打卡流程：进入某个模式
  _enterTaskMode(mode) {
    this.state.lastMode = mode; // 记录当前模式，确保完成时能用
    // 如果该任务已完成，提示不能重复做
    if (this._isTaskModeCompleted(mode)) {
      alert('该任务今日已完成！');
      return;
    }
    this._inTaskFlow = true;
    // 关闭抽屉
    document.getElementById('module-selector')?.classList.remove('active');
    document.getElementById('ms-overlay')?.classList.remove('active');

    let words;
    const minWords = { flashcard: 2, quiz: 4, spelling: 2, matching: 5 }[mode];

    if (mode === 'flashcard') {
      // 新词优先，取 DAILY_NEW_WORDS 个（20个）
      const pool = this.getWordsSmartSorted().filter(w => this.isNewWordToday(w.word));
      const newWords = this.shuffle(pool).slice(0, this.DAILY_NEW_WORDS).map(w => this.getWordObj(w));
      if (newWords.length < 2) {
        alert('没有足够的新单词了，可以直接开始四选一！');
        return;
      }
      Flashcard.init(newWords);
    } else if (mode === 'quiz') {
      // 混合池：新词 + 错题 + 随机已学词，共10题
      const quizWords = this.getTaskWordPool(10).map(w => this.getWordObj(w));
      if (quizWords.length < 4) {
        alert('词汇量不足，请选择更多模块！');
        return;
      }
      this.state.lastMode = 'quiz';
      Quiz.init(quizWords);
    } else if (mode === 'matching') {
      const allWords = this.getSelectedWords();
      if (allWords.length < 5) {
        alert('连连看至少需要5个单词，请选择更多模块！');
        return;
      }
      // 混合池取5对=10词
      const matchWords = this.getTaskWordPool(10).map(w => this.getWordObj(w));
      this.state.lastMode = 'matching';
      Matching.init(matchWords.slice(0, 5));
    } else if (mode === 'spelling') {
      // 混合池：10词（新词 + 错题 + 随机已学词）
      const spellingWords = this.getTaskWordPool(10).map(w => this.getWordObj(w));
      if (spellingWords.length < 2) {
        alert('没有足够的新单词了！');
        return;
      }
      this.state.lastMode = 'spelling';
      Spelling.init(spellingWords);
    }
  },

  _isTaskModeCompleted(mode) {
    // 优先读内存（避免 localStorage 读写时序问题）
    if (this._completedModes[mode]) return true;
    // 兜底读 localStorage（页面刷新后内存丢失）
    try {
      const s = localStorage.getItem('vocab-daily-v1');
      if (!s) return false;
      const data = JSON.parse(s);
      const today = new Date().toDateString();
      if (data.date !== today) return false;
      return !!(data.taskModesCompleted && data.taskModesCompleted[mode]);
    } catch (_) {
      return false;
    }
  },

  _markTaskModeCompleted(mode) {
    // 先更新内存，再写 localStorage
    this._completedModes[mode] = true;
    this._taskFlowCompleted = true;
    try {
      const s = localStorage.getItem('vocab-daily-v1');
      const data = s ? JSON.parse(s) : {};
      data.date = new Date().toDateString();
      if (!data.taskModesCompleted) data.taskModesCompleted = {};
      data.taskModesCompleted[mode] = true;
      data.taskFlowCompleted = true;
      data.newWordsToday = this.newWordsToday;
      data.reviewWordsToday = this.reviewWordsToday;
      data.newWordsLearnedSet = [...this.newWordsLearnedSet];
      localStorage.setItem('vocab-daily-v1', JSON.stringify(data));
    } catch (_) {}
  },

  // 任务模式完成后的回调
  // 返回 true = 全部完成（需显示完成页）；返回 false = 还有下一任务
  onTaskModeComplete(mode) {
    this._markTaskModeCompleted(mode);
    this.updateDailyTasksUI();
    this._inTaskFlow = false;
    return this.DAILY_TASK_MODES.every(m => this._isTaskModeCompleted(m));
  },

  // 显示每日任务屏幕
  showDailyTaskScreen(forceAllDone = false) {
    const modes = this.DAILY_TASK_MODES;
    // 更新每个任务卡片的badge
    for (const mode of modes) {
      const card = document.getElementById('dt-card-' + mode);
      const statusEl = document.getElementById('dt-status-' + mode);
      if (!statusEl) continue;
      const done = this._isTaskModeCompleted(mode);
      if (done) {
        statusEl.innerHTML = '<span class="dt-badge dt-badge-done">✓ 已完成</span>';
        if (card) card.style.opacity = '0.7';
      } else {
        statusEl.innerHTML = '<span class="dt-badge dt-badge-pending">开始</span>';
        if (card) card.style.opacity = '1';
      }
    }

    const rewardSection = document.getElementById('dt-reward-section');
    const completedSection = document.getElementById('dt-completed-section');
    const bannerText = document.getElementById('dt-banner-text');
    const bannerIcon = document.querySelector('.dt-banner-icon');

    const allDone = modes.every(m => this._isTaskModeCompleted(m));
    if (allDone || forceAllDone) {
      // 已完成或即将完成（刚点最后一个任务）
      if (rewardSection) rewardSection.classList.add('hidden');
      if (completedSection) completedSection.classList.remove('hidden');
      if (bannerText) bannerText.textContent = '🎉 太棒了！今日任务全部完成！';
      if (bannerIcon) bannerIcon.textContent = '🎉';
      this._taskFlowCompleted = true;
      this.saveDailyTaskFlow();
    } else {
      // 还有任务未完成
      if (rewardSection) rewardSection.classList.remove('hidden');
      if (completedSection) completedSection.classList.add('hidden');
      const completedCount = modes.filter(m => this._isTaskModeCompleted(m)).length;
      if (bannerText) bannerText.textContent = `已完成 ${completedCount}/${modes.length} 个任务，继续加油！`;
      if (bannerIcon) bannerIcon.textContent = '🎯';
    }

    this.showScreen('dailytask');
  },

  // 领取打卡奖励
  _claimDailyReward() {
    if (this._taskFlowCompleted) {
      alert('今日奖励已领取！');
      return;
    }
    const allDone = this.DAILY_TASK_MODES.every(m => this._isTaskModeCompleted(m));
    if (!allDone) {
      alert('请先完成所有任务再来领取奖励！');
      return;
    }
    this._taskFlowCompleted = true;
    this.saveDailyTaskFlow();
    this.earn('daily-task', 20);
    this.updateCoinBar();
    this.createStarBurst(30);
    alert('🎉 打卡成功！获得 +20 金币奖励！');
    this.showDailyTaskScreen(true);
  },

  // ── 恢复出厂设置 ───────────────────────────────────────────
  _resetAll() {
    if (!confirm('确定要恢复出厂设置吗？所有学习进度、金币、每日任务记录将全部清除！')) return;
    try {
      localStorage.removeItem('vocab-progress-v1');
      localStorage.removeItem('vocab-coins-v1');
      localStorage.removeItem('vocab-daily-v1');
      localStorage.removeItem('vocab-modules-v1');
    } catch (_) {}
    // 重置内存状态
    this.state.progress = {};
    this.coins = {
      total: 0, todayCoins: 0, todayDate: '', lastPlayDate: '',
      streakDays: 0, totalGames: 0, totalWordsLearned: 0,
      flashcardGames: 0, quizGames: 0, spellingGames: 0, matchingGames: 0,
      badges: {}, titleIndex: 0
    };
    this.newWordsToday = 0;
    this.reviewWordsToday = 0;
    this.newWordsLearnedSet = new Set();
    this._taskFlowCompleted = false;
    this._completedModes = {};
    this.state.selectedModules = [];
    this.updateCoinBar();
    this.updateHomeProgress();
    this.updateDailyTasksUI();
    this.showScreen('home');
    alert('已恢复出厂设置！');
  },

  // ── 每日任务系统 ────────────────────────────────────────────
  // （每日任务相关方法已在上方定义）

  // ── 称号配置 ────────────────────────────────────────────────
  TITLES: [
    { name: '英语小白',   threshold: 0 },
    { name: '单词学徒',   threshold: 50 },
    { name: '拼写新星',   threshold: 150 },
    { name: '英语小达人', threshold: 400 },
    { name: '词汇小博士', threshold: 1000 },
    { name: '英语小天才', threshold: 3000 }
  ],

  // 成就徽章配置
  BADGES: [
    { id: 'first_game',    name: '初学者',     icon: '🌱', condition: 'totalGames >= 1' },
    { id: 'streak_3',      name: '连续3天',    icon: '📅', condition: 'streakDays >= 3' },
    { id: 'streak_7',      name: '连续7天',    icon: '🔥', condition: 'streakDays >= 7' },
    { id: 'master_100',    name: '背词达人',   icon: '📚', condition: 'masteredCount >= 100' },
    { id: 'perfect',       name: '满分神手',   icon: '💯', condition: 'hadPerfectRound' },
    { id: 'spelling_50',   name: '拼写能手',   icon: '✏️', condition: 'spellingGames >= 50' },
    { id: 'matching_30',   name: '连连高手',   icon: '🔗', condition: 'matchingGames >= 30' },
    { id: 'today_learn',   name: '今日学习',   icon: '⭐', condition: 'playedToday' },
    { id: 'total_500',     name: '持之以恒',   icon: '🏆', condition: 'totalWordsLearned >= 500' },
    { id: 'coins_100',     name: '银币收藏家', icon: '🪙', condition: 'total >= 100' },
    { id: 'coins_500',     name: '金币收藏家', icon: '💰', condition: 'total >= 500' },
    { id: 'coins_2000',    name: '钻石收藏家', icon: '💎', condition: 'total >= 2000' }
  ],

  // 每局可获得的金币上限（用于成就判定）
  _roundCoins: 0,
  _hadPerfectRound: false,

  init() {
    this.loadProgress();
    this.loadCoins();
    this.loadDailyTasks();
    this.loadSelectedModules();
    this.loadCustomWords();
    this.bindHomeEvents();
    this.updateHomeProgress();
    this.updateCoinBar();
    this.updateDailyTasksUI();
    this._updateModuleCount();
    this._initVoice();
    this.showScreen('home');
    // 成就页面入口
    document.getElementById('btn-achievements')?.addEventListener('click', () => this.showAchievements());
    document.getElementById('btn-back-from-achievements')?.addEventListener('click', () => this.showScreen('home'));
    // 词库编辑入口
    document.getElementById('btn-word-editor')?.addEventListener('click', () => this.showWordEditor());
    document.getElementById('btn-we-back')?.addEventListener('click', () => this.showScreen('home'));
    // 词库搜索
    document.getElementById('we-search')?.addEventListener('input', (e) => {
      this._editorSearch = e.target.value;
      this._renderWordEditor();
    });
  },

  // ── 金币加载/保存 ────────────────────────────────────────────
  loadCoins() {
    try {
      const s = localStorage.getItem('vocab-coins-v1');
      if (s) {
        const data = JSON.parse(s);
        Object.assign(this.coins, data);
      }
    } catch (_) {}
    // 跨天重置今日金币
    const today = new Date().toDateString();
    if (this.coins.todayDate !== today) {
      this.coins.todayCoins = 0;
      this.coins.todayDate = today;
      // 检查连续学习
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (this.coins.lastPlayDate === yesterday.toDateString()) {
        // 昨天玩过，今天继续，不中断
      } else if (this.coins.lastPlayDate !== today) {
        // 超过一天没玩，重置连续天数
        this.coins.streakDays = 0;
      }
      this.saveCoins();
    }
  },

  saveCoins() {
    try {
      localStorage.setItem('vocab-coins-v1', JSON.stringify(this.coins));
    } catch (_) {}
  },

  // ── 开始游戏（追踪各模式次数）───────────────────────────────
  startGame(mode) {
    const map = { flashcard: 'flashcardGames', quiz: 'quizGames', spelling: 'spellingGames', matching: 'matchingGames' };
    if (map[mode]) this.coins[map[mode]]++;
    this.saveCoins();
  },

  // ── 赚取金币 ────────────────────────────────────────────────
  earn(type, amount) {
    this.coins.total += amount;
    this.coins.todayCoins += amount;
    this._roundCoins += amount;
    this.saveCoins();
    this.updateCoinBar();
    // 检查称号升级
    const oldIndex = this.coins.titleIndex;
    for (let i = this.TITLES.length - 1; i >= 0; i--) {
      if (this.coins.total >= this.TITLES[i].threshold) {
        this.coins.titleIndex = i;
        break;
      }
    }
    return this.coins.titleIndex > oldIndex; // 返回是否升级了称号
  },

  // ── 当前称号 ─────────────────────────────────────────────────
  getTitle() {
    return this.TITLES[this.coins.titleIndex].name;
  },

  getNextTitle() {
    if (this.coins.titleIndex >= this.TITLES.length - 1) return null;
    return this.TITLES[this.coins.titleIndex + 1];
  },

  // ── 成就检查 ─────────────────────────────────────────────────
  checkBadges() {
    const newlyUnlocked = [];
    const masteredCount = WORDS.filter(w => this.getMastery(w.word) >= 0.8).length;
    const today = new Date().toDateString();
    const playedToday = this.coins.lastPlayDate === today;

    const ctx = {
      totalGames: this.coins.totalGames,
      streakDays: this.coins.streakDays,
      masteredCount,
      hadPerfectRound: this._hadPerfectRound,
      total: this.coins.total,
      totalWordsLearned: this.coins.totalWordsLearned,
      spellingGames: this.coins.spellingGames || 0,
      matchingGames: this.coins.matchingGames || 0,
      playedToday
    };

    for (const badge of this.BADGES) {
      if (this.coins.badges[badge.id]) continue; // 已解锁
      try {
        // eslint-disable-next-line no-eval
        if (eval(badge.condition)) {
          this.coins.badges[badge.id] = true;
          newlyUnlocked.push(badge);
        }
      } catch (_) {}
    }
    this.saveCoins();
    return newlyUnlocked;
  },

  // ── 更新顶部金币栏 ───────────────────────────────────────────
  updateCoinBar() {
    const totalEl = document.getElementById('coin-total');
    const titleEl = document.getElementById('title-badge');
    const todayEl = document.getElementById('coin-today');
    if (totalEl) totalEl.textContent = this.coins.total;
    if (titleEl) titleEl.textContent = this.getTitle();
    if (todayEl) todayEl.textContent = this.coins.todayCoins;
  },

  // ── 屏幕路由 ────────────────────────────────────────────────
  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) {
      el.classList.add('active');
      window.scrollTo(0, 0);
    }
  },

  // ── 词库查询 ─────────────────────────────────────────────────
  // 自定义词库（用户编辑过的不正宗）
  _customWords: {},

  loadCustomWords() {
    try {
      const s = localStorage.getItem('vocab-words-custom-v1');
      if (s) this._customWords = JSON.parse(s);
    } catch (_) { this._customWords = {}; }
  },

  saveCustomWord(word, phonetic, meaning, text) {
    if (!phonetic && !meaning && !text) {
      delete this._customWords[word];
    } else {
      this._customWords[word] = { phonetic, meaning, text };
    }
    try {
      localStorage.setItem('vocab-words-custom-v1', JSON.stringify(this._customWords));
    } catch (_) {}
  },

  // 获取单词（合并自定义修改）
  getWordObj(original) {
    const custom = this._customWords[original.word];
    if (custom) {
      return {
        unit: original.unit,
        word: custom.text !== undefined ? custom.text : original.word,
        phonetic: custom.phonetic !== undefined ? custom.phonetic : original.phonetic,
        meaning: custom.meaning !== undefined ? custom.meaning : original.meaning
      };
    }
    return original;
  },

  getSelectedWords() {
    const mods = this.state.selectedModules;
    if (mods.length === 0) return [...WORDS];
    // 错题本特殊处理
    if (mods.includes('错题本')) {
      const others = mods.filter(m => m !== '错题本');
      const base = others.length > 0 ? WORDS.filter(w => others.includes(w.unit)) : [...WORDS];
      const wrongSet = new Set(this.getDueReviewWords().map(w => w.word));
      return base.filter(w => wrongSet.has(w.word));
    }
    return WORDS.filter(w => mods.includes(w.unit));
  },

  getReviewWords() {
    const mods = this.state.selectedModules;
    return WORDS.filter(w => {
      if (mods.length > 0 && !mods.includes(w.unit)) return false;
      const p = this.state.progress[w.word];
      return p && p.errors > 0;
    });
  },

  // 获取今日应复习的词（遗忘曲线驱动）
  getDueReviewWords() {
    const mods = this.state.selectedModules;
    const today = new Date().toDateString();
    return WORDS.filter(w => {
      if (mods.length > 0 && !mods.includes(w.unit)) return false;
      const p = this.state.progress[w.word];
      if (!p) return false;  // 从未学过的词不算复习
      // 无 nextReview 字段的旧记录：视为今天应复习
      if (!p.nextReview) return true;
      return p.nextReview <= today;
    }).sort((a, b) => {
      // overdue 最久的排最前（nextReview 越早越紧急）
      const pa = this.state.progress[a.word]?.nextReview || '';
      const pb = this.state.progress[b.word]?.nextReview || '';
      return pa.localeCompare(pb);
    });
  },

  // 构建每日任务混合词池：新词 + 错题 + 随机已学词（去重）
  getTaskWordPool(count) {
    const allWords = this.getSelectedWords();

    // 1. 今日新词（按陌生度排序）
    const newWords = this.shuffle(
      allWords.filter(w => this.isNewWordToday(w.word))
    );

    // 2. 遗忘曲线应复习的词（按 overdue 排序）
    const reviewWords = this.shuffle(this.getDueReviewWords());

    // 3. 之前学过的词（已学但非今日新，也非错题）
    const learnedWords = this.shuffle(allWords.filter(w => {
      if (this.isNewWordToday(w.word)) return false;
      const p = this.state.progress[w.word];
      return p && (p.correct + p.errors) > 0 && p.errors === 0;
    }));

    // 混合：优先新词，再补错题，最后补随机已学词
    const pool = [];
    const used = new Set();

    for (const w of newWords) {
      if (pool.length >= count) break;
      if (!used.has(w.word)) { pool.push(w); used.add(w.word); }
    }
    for (const w of reviewWords) {
      if (pool.length >= count) break;
      if (!used.has(w.word)) { pool.push(w); used.add(w.word); }
    }
    for (const w of learnedWords) {
      if (pool.length >= count) break;
      if (!used.has(w.word)) { pool.push(w); used.add(w.word); }
    }

    return this.shuffle(pool);
  },

  // ── 模块选择抽屉 ─────────────────────────────────────────────
  // 从 WORDS 动态生成模块列表（按 book 分组）
  _getModuleList() {
    const map = {};
    for (const w of WORDS) {
      // book = '四上' from unit like '四上 M1'
      const book = w.unit.replace(/ M\d+$/, '');
      if (!map[book]) map[book] = new Set();
      map[book].add(w.unit);
    }
    // 排序：四上 → 四下 → 五上 → 五下
    const order = ['四上', '四下', '五上', '五下'];
    const result = order.filter(b => map[b]).map(book => ({
      book,
      modules: [...map[book]].sort()
    }));
    // 追加错题本特殊入口
    result.push({ book: '📋 错题本', modules: ['错题本'] });
    return result;
  },

  _showModuleSelector() {
    const body = document.getElementById('ms-body');
    body.innerHTML = '';

    const list = this._getModuleList();
    for (const { book, modules } of list) {
      const bookDiv = document.createElement('div');

      // 统计每个 module 的词数
      const counts = {};
      for (const m of modules) counts[m] = WORDS.filter(w => w.unit === m).length;

      // Book 标题 + 全选
      const header = document.createElement('div');
      header.className = 'ms-book-title';
      const allSelected = modules.every(m => this.state.selectedModules.includes(m));
      const toggleAll = document.createElement('span');
      toggleAll.className = 'ms-book-toggle';
      toggleAll.textContent = allSelected ? '取消全选' : '全选';
      toggleAll.addEventListener('click', () => {
        if (allSelected) {
          modules.forEach(m => this._removeModule(m));
        } else {
          modules.forEach(m => this._addModule(m));
        }
        this._showModuleSelector(); // 重新渲染
      });
      header.textContent = book + ' ';
      header.appendChild(toggleAll);
      bookDiv.appendChild(header);

      // 模块网格
      const grid = document.createElement('div');
      grid.className = 'ms-module-grid';
      for (const m of modules) {
        const isSelected = this.state.selectedModules.includes(m);
        const item = document.createElement('div');
        item.className = 'ms-module-item' + (isSelected ? ' selected' : '');
        item.addEventListener('click', () => {
          if (this.state.selectedModules.includes(m)) this._removeModule(m);
          else this._addModule(m);
          this._updateModuleSelectorUI();
        });
        item.innerHTML = `
          <input type="checkbox" ${isSelected ? 'checked' : ''} readonly>
          <span class="ms-module-name">${m}</span>
          <span class="ms-module-count">${counts[m]}词</span>
        `;
        grid.appendChild(item);
      }
      bookDiv.appendChild(grid);
      body.appendChild(bookDiv);
    }

    this._updateModuleCount();
    document.getElementById('module-selector').classList.add('active');
    document.getElementById('ms-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  _closeModuleSelector() {
    document.getElementById('module-selector').classList.remove('active');
    document.getElementById('ms-overlay').classList.remove('active');
    document.body.style.overflow = '';
    this.saveSelectedModules();
  },

  _addModule(m) {
    if (!this.state.selectedModules.includes(m)) {
      this.state.selectedModules.push(m);
    }
    this.saveSelectedModules();
  },

  _removeModule(m) {
    this.state.selectedModules = this.state.selectedModules.filter(x => x !== m);
    this.saveSelectedModules();
  },

  saveSelectedModules() {
    try {
      localStorage.setItem('vocab-modules-v1', JSON.stringify(this.state.selectedModules));
    } catch (_) {}
  },

  loadSelectedModules() {
    try {
      const s = localStorage.getItem('vocab-modules-v1');
      if (s) {
        const arr = JSON.parse(s);
        this.state.selectedModules = Array.isArray(arr) ? arr : [];
      }
    } catch (_) {
      this.state.selectedModules = [];
    }
  },

  _toggleModule(m) {
    if (this.state.selectedModules.includes(m)) {
      this._removeModule(m);
    } else {
      this._addModule(m);
    }
  },

  _updateModuleSelectorUI() {
    const mods = this.state.selectedModules;
    // 更新每个 item 的选中状态
    document.querySelectorAll('.ms-module-item').forEach(item => {
      const name = item.querySelector('.ms-module-name')?.textContent;
      if (name && mods.includes(name)) {
        item.classList.add('selected');
        item.querySelector('input').checked = true;
      } else {
        item.classList.remove('selected');
        if (item.querySelector('input')) item.querySelector('input').checked = false;
      }
    });
    // 更新 book toggle 文字
    document.querySelectorAll('.ms-book-title').forEach(header => {
      const toggle = header.querySelector('.ms-book-toggle');
      const book = header.textContent.replace('全选', '').replace('取消全选', '').trim();
      const modules = this._getModuleList().find(g => g.book === book)?.modules || [];
      const allSelected = modules.every(m => mods.includes(m));
      if (toggle) toggle.textContent = allSelected ? '取消全选' : '全选';
    });
    this._updateModuleCount();
  },

  _updateModuleCount() {
    const count = this.getSelectedWords().length;
    document.getElementById('ms-count').textContent = count;
    const btn = document.getElementById('ms-start');
    if (btn) btn.disabled = count === 0;
    // 更新顶部按钮文字
    const btn2 = document.getElementById('btn-module-selector');
    if (btn2) {
      if (this.state.selectedModules.length === 0) {
        btn2.textContent = '📚 全部词汇 ▼';
      } else {
        btn2.textContent = `📚 已选 ${this.state.selectedModules.length} 个模块 ▼`;
      }
    }
  },

  // ── 语音朗读（标准美音）──────────────────────────────────────
  _preferredVoice: null,

  speak(text) {
    const word = text.trim().toLowerCase();
    if (!word) return;
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(word);
    utt.lang = 'en-US';
    utt.rate = 0.9;
    utt.pitch = 1.0;
    if (this._preferredVoice) utt.voice = this._preferredVoice;
    window.speechSynthesis.speak(utt);
  },

  _initVoice() {
    if (!window.speechSynthesis) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;
      const order = ['Samantha', 'Daniel', 'Alex', 'Karen', 'Allison', 'Victoria', 'Ava', 'Molly'];
      for (const name of order) {
        const v = voices.find(v => v.lang === 'en-US' && v.name.includes(name));
        if (v) { this._preferredVoice = v; break; }
      }
      if (!this._preferredVoice) {
        this._preferredVoice = voices.find(v => v.lang === 'en-US') || voices[0];
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  },

  // ── 工具函数 ─────────────────────────────────────────────────
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  randomPick(arr, exclude, count) {
    const pool = arr.filter(x => x !== exclude);
    return this.shuffle(pool).slice(0, count);
  },

  // ── 进度存储 ─────────────────────────────────────────────────
  loadProgress() {
    try {
      const s = localStorage.getItem('vocab-progress-v1');
      this.state.progress = s ? JSON.parse(s) : {};
    } catch (_) {
      this.state.progress = {};
    }
  },

  // 遗忘曲线调度（简化 SM-2），每次答题后更新复习间隔
  _updateSpacedRepetition(word, correct) {
    const p = this.state.progress[word];
    if (!p) return;
    const today = new Date().toDateString();

    if (correct) {
      // 答对了：延长复习间隔
      if (p.repetitions === 0 || p.repetitions === undefined) {
        p.interval = 1;
      } else if (p.repetitions === 1) {
        p.interval = 3;
      } else {
        p.interval = Math.round((p.interval || 1) * (p.easeFactor || 2.5));
      }
      p.repetitions = (p.repetitions || 0) + 1;
      p.easeFactor = Math.max(1.3, parseFloat((p.easeFactor || 2.5).toFixed(1)) + 0.1);
      p.lastCorrect = true;
    } else {
      // 答错了：退回间隔，退回重复次数
      p.repetitions = 0;
      p.interval = 1;
      p.easeFactor = Math.max(1.3, parseFloat((p.easeFactor || 2.5).toFixed(1)) - 0.2);
      p.lastCorrect = false;
    }

    const next = new Date();
    next.setDate(next.getDate() + (p.interval || 1));
    p.lastReviewed = today;
    p.nextReview = next.toDateString();
  },

  saveProgress(word, correct) {
    const isNew = !this.state.progress[word] || (this.state.progress[word].correct + this.state.progress[word].errors) === 0;
    if (!this.state.progress[word]) {
      this.state.progress[word] = { correct: 0, errors: 0 };
    }
    correct
      ? this.state.progress[word].correct++
      : this.state.progress[word].errors++;
    this._updateSpacedRepetition(word, correct);
    try {
      localStorage.setItem('vocab-progress-v1', JSON.stringify(this.state.progress));
    } catch (_) {}

    // 记录每日任务
    if (correct && isNew) {
      // 新词第一次答对 → 新学任务
      this.recordNewWord(word);
    }
    if (!correct) {
      // 答错 → 复习任务
      this.recordReview(word);
    }
  },

  getMastery(word) {
    const p = this.state.progress[word];
    if (!p || (p.correct + p.errors) === 0) return 0;
    return p.correct / (p.correct + p.errors);
  },

  // ── 按熟悉度排序（陌生词优先）────────────────────────────────
  // 遗忘紧急度：overdue 越多越优先（间隔已到却未复习的词）
  getUnfamiliarity(word) {
    const p = this.state.progress[word];
    if (!p || (p.correct + p.errors) === 0) return 1.0; // 未学过=最高优先
    const today = new Date().toDateString();
    const next = p.nextReview || today;
    const overdue = (new Date(today) - new Date(next)) / 86400000; // 天数差
    // overdue > 0 表示该复习了，越大约优先；无 nextReview 的旧词优先复习
    if (!p.nextReview) return 999;
    return overdue;
  },

  // 获取打乱后的词库，按陌生度从高到低排序
  getWordsSmartSorted() {
    const words = this.getSelectedWords();
    const sorted = [...words].sort((a, b) => {
      return this.getUnfamiliarity(b.word) - this.getUnfamiliarity(a.word);
    });
    return sorted;
  },

  // ── 熟悉度等级 ──────────────────────────────────────────────
  // 0=未学(红色), 1=薄弱(橙色), 2=一般(蓝色), 3=熟悉(绿色)
  getFamiliarityLevel(word) {
    const p = this.state.progress[word];
    if (!p || (p.correct + p.errors) === 0) return 0; // 未学
    const rate = p.correct / (p.correct + p.errors);
    if (rate >= 0.8) return 3; // 熟悉
    if (rate >= 0.4) return 2; // 一般
    return 1; // 薄弱
  },

  getFamiliarityLabel(level) {
    const map = { 0: '⭐未学', 1: '🔥薄弱', 2: '📖一般', 3: '✅熟悉' };
    return map[level] || map[0];
  },

  getFamiliarityColor(level) {
    const map = { 0: '#E74C3C', 1: '#F39C12', 2: '#3498DB', 3: '#27AE60' };
    return map[level] || map[0];
  },

  // ── 词单预览 ─────────────────────────────────────────────────
  _pendingGame: {},  // 待启动的游戏信息 { mode, words }

  _showPreview(mode, minWords) {
    const allWords = this.getSelectedWords();
    if (allWords.length < minWords) {
      alert(`至少需要 ${minWords} 个单词，请选择更多模块`);
      return;
    }
    this.state.lastMode = mode;

    // 智能排序取词
    const sorted = this.getWordsSmartSorted();
    const words = this.shuffle(sorted).map(w => this.getWordObj(w));

    // 保存待启动游戏
    this._pendingGame = { mode, words };

    // 模式名称映射
    const modeNames = { flashcard: '闪卡认读', quiz: '四选一', spelling: '拼写练习', matching: '连连看' };
    document.getElementById('preview-title').textContent = modeNames[mode];
    document.getElementById('preview-subtitle').textContent =
      `共 ${words.length} 词 · 陌生词优先`;

    // 渲染词单
    const list = document.getElementById('preview-word-list');
    list.innerHTML = '';
    words.forEach(w => {
      const level = this.getFamiliarityLevel(w.word);
      const badge = App.getFamiliarityLabel(level);
      const color = App.getFamiliarityColor(level);
      const item = document.createElement('div');
      item.className = 'preview-word-item';
      item.innerHTML = `
        <span class="word-badge" style="background:${color}">${badge}</span>
        <span class="word-english">${w.word}</span>
        ${w.phonetic ? `<span class="word-phonetic">${w.phonetic}</span>` : ''}
        <span class="word-meaning">${w.meaning}</span>
      `;
      list.appendChild(item);
    });

    this.showScreen('preview');
  },

  resetProgress() {
    if (confirm('确定要清除所有学习进度吗？')) {
      this.state.progress = {};
      try { localStorage.removeItem('vocab-progress-v1'); } catch (_) {}
      this.updateHomeProgress();
    }
  },

  // ── 首页进度面板 ─────────────────────────────────────────────
  updateHomeProgress() {
    const units = [...new Set(WORDS.map(w => w.unit))];
    const container = document.getElementById('progress-list');
    if (!container) return;
    container.innerHTML = '';

    const rows = [
      { label: '全部', words: WORDS },
      ...units.map(u => ({ label: u, words: WORDS.filter(w => w.unit === u) }))
    ];

    rows.forEach(({ label, words }) => {
      const mastered = words.filter(w => this.getMastery(w.word) >= 0.8).length;
      const pct = words.length ? Math.round(mastered / words.length * 100) : 0;
      const div = document.createElement('div');
      div.className = 'progress-row';
      div.innerHTML = `
        <span class="progress-label">${label}</span>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="progress-pct">${mastered}/${words.length}</span>
      `;
      container.appendChild(div);
    });

    const reviewBtn = document.getElementById('btn-review');
    const reviewCount = this.getDueReviewWords().length;
    if (reviewBtn) {
      reviewBtn.textContent = `📖 复习 (${reviewCount} 词)`;
      reviewBtn.style.display = reviewCount > 0 ? 'block' : 'none';
    }
  },

  // ── 首页事件绑定 ─────────────────────────────────────────────
  bindHomeEvents() {
    // 模块选择器按钮 → 打开抽屉
    document.getElementById('btn-module-selector')?.addEventListener('click', () => this._showModuleSelector());
    // 抽屉关闭按钮 & 遮罩
    document.getElementById('ms-close')?.addEventListener('click', () => this._closeModuleSelector());
    document.getElementById('ms-overlay')?.addEventListener('click', () => this._closeModuleSelector());
    // 开始学习
    document.getElementById('ms-start')?.addEventListener('click', () => {
      // 确认选择，关闭抽屉并回到首页（不清除 pendingMode，保留用户选的模式）
      this._closeModuleSelector();
    });

    document.getElementById('btn-flashcard').addEventListener('click', () => {
      this._showPreview('flashcard', 2);
    });
    document.getElementById('btn-quiz').addEventListener('click', () => {
      this._showPreview('quiz', 4);
    });
    document.getElementById('btn-spelling').addEventListener('click', () => {
      this._showPreview('spelling', 2);
    });
    document.getElementById('btn-matching').addEventListener('click', () => {
      this._showPreview('matching', 5);
    });

    // 预览页 → 开始学习按钮
    document.getElementById('btn-preview-start').addEventListener('click', () => {
      const { mode, words } = this._pendingGame;
      this._roundCoins = 0;
      this._hadPerfectRound = false;
      switch (mode) {
        case 'flashcard': Flashcard.init(words); break;
        case 'quiz':      Quiz.init(words);      break;
        case 'spelling':  Spelling.init(words);  break;
        case 'matching':  Matching.init(words);  break;
      }
    });

    // 预览页返回
    document.getElementById('btn-preview-back').addEventListener('click', () => {
      this.updateDailyTasksUI();
      this.showScreen('home');
    });

    document.getElementById('btn-review').addEventListener('click', () => {
      const words = this.getDueReviewWords().map(w => this.getWordObj(w));
      if (words.length < 4) {
        Flashcard.init(this.shuffle(words));
      } else {
        this.state.lastMode = 'quiz';
        Quiz.init(this.shuffle(words));
      }
    });

    document.getElementById('btn-reset').addEventListener('click', () => this.resetProgress());

    // 每日任务入口
    document.getElementById('btn-daily-task')?.addEventListener('click', () => {
      this.showDailyTaskScreen();
    });

    // 每日任务页返回
    document.getElementById('btn-dt-back')?.addEventListener('click', () => {
      this.showScreen('home');
    });

    // 结果页继续下一任务
    document.getElementById('btn-next-task')?.addEventListener('click', () => {
      const completedMode = this.state.lastMode; // 当前刚完成的是哪个
      // 标记当前任务完成，返回是否全部完成
      const allDone = (completedMode && this._inTaskFlow)
        ? this.onTaskModeComplete(completedMode)
        : false;

      // 找到下一个未完成的任务
      const modes = this.DAILY_TASK_MODES;
      const currentIdx = modes.indexOf(completedMode);
      let nextMode = null;
      for (let i = currentIdx + 1; i < modes.length; i++) {
        if (!this._isTaskModeCompleted(modes[i])) {
          nextMode = modes[i];
          break;
        }
      }

      if (nextMode) {
        // 直接进入下一个任务（不显示打卡页）
        this._enterTaskMode(nextMode);
      } else {
        // 没有下一个任务了 → 显示打卡完成页（不设置 _taskFlowCompleted，等领取奖励时再设）
        this._taskFlowCompleted = false; // 重置，避免影响
        this.showDailyTaskScreen(true);
      }
    });

    document.getElementById('btn-retry').addEventListener('click', () => {
      const sorted = this.getWordsSmartSorted();
      const shuffled = this.shuffle(sorted);
      this._roundCoins = 0;
      this._hadPerfectRound = false;
      switch (this.state.lastMode) {
        case 'flashcard': Flashcard.init(shuffled); break;
        case 'quiz':      Quiz.init(shuffled);      break;
        case 'spelling':  Spelling.init(shuffled);  break;
        case 'matching':  Matching.init(shuffled);  break;
      }
    });

    document.getElementById('btn-home-from-results').addEventListener('click', () => {
      // 任务流程中点回主页：先标记当前任务完成
      if (this._inTaskFlow && this.state.lastMode) {
        this.onTaskModeComplete(this.state.lastMode);
      }
      this._inTaskFlow = false;
      this.updateHomeProgress();
      this.updateCoinBar();
      this.updateDailyTasksUI();
      this.showScreen('home');
    });

  },

  // ── 结果屏幕（带金币展示）────────────────────────────────────
  showResults(score, total, extra) {
    const pct = total > 0 ? Math.round(score / total * 100) : 0;
    const stars = pct >= 90 ? 3 : pct >= 60 ? 2 : 1;

    // 记录今日游玩日期 & 连续天数
    const today = new Date().toDateString();
    if (this.coins.lastPlayDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (this.coins.lastPlayDate === yesterday.toDateString()) {
        this.coins.streakDays++;
      } else if (this.coins.lastPlayDate !== today) {
        this.coins.streakDays = 1;
      }
      this.coins.lastPlayDate = today;
    }
    this.coins.totalGames++;
    this.coins.totalWordsLearned += total;
    if (score === total) this._hadPerfectRound = true;

    // 完赛奖励 +5 金币
    const leveledUp = this.earn('complete', 5);

    // 成就检查
    const newBadges = this.checkBadges();

    const msgs = {
      3: ['太棒了！你是单词小达人！', '完美！继续保持！', '满分神手！'],
      2: ['做得不错！继续加油！', '很好！再练一次就满分！', '棒极了，快到了！'],
      1: ['不要灰心，再练一遍！', '加油！多练几次就能记住！', '没关系，继续努力！']
    };
    const msg = msgs[stars][Math.floor(Math.random() * 3)];

    document.getElementById('result-stars').textContent =
      '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    document.getElementById('result-score').textContent =
      `${score} / ${total} 正确（${pct}%）`;
    document.getElementById('result-extra').textContent = extra || '';
    document.getElementById('result-message').textContent = msg;

    // 金币展示
    const coinsEl = document.getElementById('result-coins');
    if (coinsEl) {
      coinsEl.textContent = `+${this._roundCoins} 🪙`;
      coinsEl.classList.remove('coin-pop');
      void coinsEl.offsetWidth;
      coinsEl.classList.add('coin-pop');
    }

    // 称号升级提示
    const titleEl = document.getElementById('result-new-title');
    if (titleEl) {
      if (leveledUp) {
        titleEl.textContent = `🎉 称号升级：${this.getTitle()}`;
        titleEl.style.display = 'block';
      } else {
        const next = this.getNextTitle();
        if (next) {
          titleEl.textContent = `距离「${next.name}」还差 ${next.threshold - this.coins.total} 金币`;
          titleEl.style.display = 'block';
        } else {
          titleEl.style.display = 'none';
        }
      }
    }

    // 新成就提示
    const badgesEl = document.getElementById('result-new-badges');
    if (badgesEl) {
      if (newBadges.length > 0) {
        badgesEl.innerHTML = `🏅 解锁成就：${newBadges.map(b => b.icon + b.name).join(' ')}`;
        badgesEl.style.display = 'block';
      } else {
        badgesEl.style.display = 'none';
      }
    }

    if (stars === 3) this.createStarBurst(24);

    // 任务流程：显示继续按钮
    const btnRetry = document.getElementById('btn-retry');
    const btnNextTask = document.getElementById('btn-next-task');
    if (this._inTaskFlow) {
      // 隐藏再来一次，显示继续下一任务
      if (btnRetry) btnRetry.classList.add('hidden');
      if (btnNextTask) btnNextTask.classList.remove('hidden');
    } else {
      if (btnRetry) btnRetry.classList.remove('hidden');
      if (btnNextTask) btnNextTask.classList.add('hidden');
    }

    this.showScreen('results');
  },

  // ── 词库编辑 ─────────────────────────────────────────────────
  _editorSearch: '',

  showWordEditor() {
    this._editorSearch = '';
    this._renderWordEditor();
    this.showScreen('wordeditor');
  },

  _renderWordEditor() {
    const list = document.getElementById('we-list');
    const countEl = document.getElementById('we-count');

    list.innerHTML = '';

    const q = this._editorSearch.toLowerCase();
    const filtered = WORDS.filter(w =>
      w.word.toLowerCase().includes(q) ||
      w.meaning.toLowerCase().includes(q) ||
      (w.phonetic || '').toLowerCase().includes(q)
    );

    if (countEl) countEl.textContent = `${filtered.length} 词`;

    filtered.forEach(w => {
      const custom = this._customWords[w.word] || {};
      const text = custom.text !== undefined ? custom.text : w.word;
      const phonetic = custom.phonetic !== undefined ? custom.phonetic : (w.phonetic || '');
      const meaning = custom.meaning !== undefined ? custom.meaning : w.meaning;
      const isModified = !!this._customWords[w.word];

      const item = document.createElement('div');
      item.className = 'we-item' + (isModified ? ' we-modified' : '');
      item.innerHTML = `
        <input class="we-text" type="text" value="${text}"
          placeholder="英文" data-word="${w.word}" />
        <div class="we-unit">${w.unit}</div>
        <input class="we-phonetic" type="text" value="${phonetic}"
          placeholder="音标" data-word="${w.word}" />
        <input class="we-meaning" type="text" value="${meaning}"
          placeholder="中文释义" data-word="${w.word}" />
        <div class="we-actions">
          <button class="btn btn-small ${isModified ? 'btn-ghost' : 'btn-primary'}"
            onclick="App._saveWordEdit('${w.word}')">
            ${isModified ? '✓' : '保存'}
          </button>
          ${isModified ? `<button class="btn btn-small btn-ghost" onclick="App._resetWord('${w.word}')">还原</button>` : ''}
        </div>
      `;
      list.appendChild(item);
    });
  },

  _saveWordEdit(word) {
    const item = document.querySelector(`.we-text[data-word="${word}"]`)?.closest('.we-item');
    const text = item?.querySelector('.we-text')?.value || '';
    const phonetic = item?.querySelector('.we-phonetic')?.value || '';
    const meaning = item?.querySelector('.we-meaning')?.value || '';
    this.saveCustomWord(word, phonetic, meaning, text);
    this._renderWordEditor();
  },

  _resetWord(word) {
    delete this._customWords[word];
    try { localStorage.setItem('vocab-words-custom-v1', JSON.stringify(this._customWords)); } catch (_) {}
    this._renderWordEditor();
  },

  // ── 成就页面 ─────────────────────────────────────────────────
  showAchievements() {
    const container = document.getElementById('badges-grid');
    if (!container) return;
    container.innerHTML = '';

    const masteredCount = WORDS.filter(w => this.getMastery(w.word) >= 0.8).length;
    const today = new Date().toDateString();
    const playedToday = this.coins.lastPlayDate === today;

    const ctx = {
      totalGames: this.coins.totalGames,
      streakDays: this.coins.streakDays,
      masteredCount,
      hadPerfectRound: this._hadPerfectRound,
      total: this.coins.total,
      totalWordsLearned: this.coins.totalWordsLearned,
      spellingGames: this.coins.spellingGames || 0,
      matchingGames: this.coins.matchingGames || 0,
      playedToday
    };

    for (const badge of this.BADGES) {
      let unlocked = !!this.coins.badges[badge.id];
      if (!unlocked) {
        try {
          // eslint-disable-next-line no-eval
          unlocked = eval(badge.condition);
        } catch (_) {}
      }
      const div = document.createElement('div');
      div.className = 'badge-card' + (unlocked ? '' : ' locked');
      div.innerHTML = `
        <div class="badge-icon">${badge.icon}</div>
        <div class="badge-name">${badge.name}</div>
        <div class="badge-status">${unlocked ? '✅ 已解锁' : '🔒 未解锁'}</div>
      `;
      container.appendChild(div);
    }

    // 更新数据面板
    const statsEl = document.getElementById('ach-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="ach-stat-row">
          <span>🪙 累计金币</span><strong>${this.coins.total}</strong>
        </div>
        <div class="ach-stat-row">
          <span>🏅 称号</span><strong>${this.getTitle()}</strong>
        </div>
        <div class="ach-stat-row">
          <span>🔥 连续学习</span><strong>${this.coins.streakDays} 天</strong>
        </div>
        <div class="ach-stat-row">
          <span>📚 掌握单词</span><strong>${masteredCount} / ${WORDS.length}</strong>
        </div>
        <div class="ach-stat-row">
          <span>🎮 累计局数</span><strong>${this.coins.totalGames}</strong>
        </div>
        <div class="ach-stat-row">
          <span>⭐ 今日金币</span><strong>${this.coins.todayCoins}</strong>
        </div>
      `;
    }

    // 称号进度
    const next = this.getNextTitle();
    const progressEl = document.getElementById('title-progress');
    if (progressEl && next) {
      const prev = this.TITLES[this.coins.titleIndex];
      const prevThresh = prev ? prev.threshold : 0;
      const pct = Math.round((this.coins.total - prevThresh) / (next.threshold - prevThresh) * 100);
      progressEl.innerHTML = `
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${Math.min(pct,100)}%"></div>
        </div>
        <div class="progress-text">${this.coins.total} / ${next.threshold} 金币升级「${next.name}」</div>
      `;
    }

    this.showScreen('achievements');
  },

  // ── 爆星动画 ─────────────────────────────────────────────────
  createStarBurst(count) {
    const overlay = document.getElementById('star-overlay');
    overlay.innerHTML = '';
    overlay.style.display = 'block';
    const icons = ['⭐', '🌟', '✨', '🎉', '🎊'];
    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');
      el.className = 'burst-star';
      el.textContent = icons[Math.floor(Math.random() * icons.length)];
      el.style.left = (5 + Math.random() * 90) + 'vw';
      el.style.animationDuration = (1.5 + Math.random() * 2) + 's';
      el.style.animationDelay = (Math.random() * 1.5) + 's';
      el.style.fontSize = (22 + Math.random() * 28) + 'px';
      overlay.appendChild(el);
    }
    setTimeout(() => { overlay.style.display = 'none'; overlay.innerHTML = ''; }, 5000);
  },

  // ── 即时视觉反馈 ─────────────────────────────────────────────
  flashFeedback(el, correct) {
    el.classList.remove('flash-correct', 'flash-wrong');
    void el.offsetWidth;
    el.classList.add(correct ? 'flash-correct' : 'flash-wrong');
    setTimeout(() => el.classList.remove('flash-correct', 'flash-wrong'), 700);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
