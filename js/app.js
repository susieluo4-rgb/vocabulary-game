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
  DAILY_NEW_WORDS: 5,     // 每天新学目标词数
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
        } else {
          this.newWordsToday = data.newWordsToday || 0;
          this.reviewWordsToday = data.reviewWordsToday || 0;
          this.newWordsLearnedSet = new Set(data.newWordsLearnedSet || []);
        }
      }
    } catch (_) {
      this.newWordsToday = 0;
      this.reviewWordsToday = 0;
      this.newWordsLearnedSet = new Set();
    }
  },

  saveDailyTasks() {
    try {
      localStorage.setItem('vocab-daily-v1', JSON.stringify({
        date: new Date().toDateString(),
        newWordsToday: this.newWordsToday,
        reviewWordsToday: this.reviewWordsToday,
        newWordsLearnedSet: [...this.newWordsLearnedSet]
      }));
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
  getSelectedWords() {
    const mods = this.state.selectedModules;
    if (mods.length === 0) return [...WORDS];
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
    return order.filter(b => map[b]).map(book => ({
      book,
      modules: [...map[book]].sort()
    }));
  },

  _showModuleSelector() {
    const mods = this.state.selectedModules;
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
      const allSelected = modules.every(m => mods.includes(m));
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
        const item = document.createElement('div');
        item.className = 'ms-module-item' + (mods.includes(m) ? ' selected' : '');
        item.addEventListener('click', () => {
          if (mods.includes(m)) this._removeModule(m);
          else this._addModule(m);
          this._updateModuleSelectorUI();
        });
        item.innerHTML = `
          <input type="checkbox" ${mods.includes(m) ? 'checked' : ''} readonly>
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
      if (s) this.state.selectedModules = JSON.parse(s);
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

  saveProgress(word, correct) {
    const isNew = !this.state.progress[word] || (this.state.progress[word].correct + this.state.progress[word].errors) === 0;
    if (!this.state.progress[word]) {
      this.state.progress[word] = { correct: 0, errors: 0 };
    }
    correct
      ? this.state.progress[word].correct++
      : this.state.progress[word].errors++;
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
  //陌生度分数：未学过=1.0（最高优先），答错越多越优先，答对越多越靠后
  getUnfamiliarity(word) {
    const p = this.state.progress[word];
    if (!p || (p.correct + p.errors) === 0) return 1.0; // 未学过，优先
    const total = p.correct + p.errors;
    return p.errors / total; // 错误率越高越靠前
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
    const words = this.shuffle(sorted);

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
    const reviewCount = this.getReviewWords().length;
    if (reviewBtn) {
      reviewBtn.textContent = `错题本 (${reviewCount} 词)`;
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
      this._closeModuleSelector();
      // 根据当前按钮触发的模式启动
      const mode = this._pendingMode || 'flashcard';
      const minWords = mode === 'matching' ? 5 : mode === 'quiz' ? 4 : 2;
      const words = this.getSelectedWords();
      if (words.length < minWords) {
        alert(`至少需要 ${minWords} 个单词，请选择更多模块`);
        return;
      }
      this.state.lastMode = mode;
      this._roundCoins = 0;
      this._hadPerfectRound = false;
      const sorted = this.getWordsSmartSorted();
      const shuffled = this.shuffle(sorted);
      switch (mode) {
        case 'flashcard': Flashcard.init(shuffled); break;
        case 'quiz':      Quiz.init(shuffled);      break;
        case 'spelling':  Spelling.init(shuffled);  break;
        case 'matching':  Matching.init(shuffled);   break;
      }
    });

    document.getElementById('btn-flashcard').addEventListener('click', () => {
      this._pendingMode = 'flashcard';
      this._showPreview('flashcard', 2);
    });
    document.getElementById('btn-quiz').addEventListener('click', () => {
      this._pendingMode = 'quiz';
      this._showPreview('quiz', 4);
    });
    document.getElementById('btn-spelling').addEventListener('click', () => {
      this._pendingMode = 'spelling';
      this._showPreview('spelling', 2);
    });
    document.getElementById('btn-matching').addEventListener('click', () => {
      this._pendingMode = 'matching';
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
      const words = this.getReviewWords();
      if (words.length < 4) {
        Flashcard.init(this.shuffle(words));
      } else {
        this.state.lastMode = 'quiz';
        Quiz.init(this.shuffle(words));
      }
    });

    document.getElementById('btn-reset').addEventListener('click', () => this.resetProgress());

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
      this.updateHomeProgress();
      this.updateCoinBar();
      this.updateDailyTasksUI();
      this.showScreen('home');
    });

    // 词库总览按钮
    document.getElementById('btn-wordlist')?.addEventListener('click', () => this.showWordList());
    document.getElementById('btn-back-from-wordlist')?.addEventListener('click', () => this.showScreen('home'));

    // 词库搜索
    document.getElementById('wl-search')?.addEventListener('input', (e) => {
      this._wlQuery = e.target.value;
      this._renderWordList();
    });

    // 词库筛选标签
    document.querySelectorAll('.wl-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wl-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._wlFilter = btn.dataset.filter;
        this._renderWordList();
      });
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
    this.showScreen('results');
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

  // ── 词库总览 ─────────────────────────────────────────────────
  _wlFilter: 'all',
  _wlQuery: '',

  showWordList() {
    this._wlFilter = 'all';
    this._wlQuery = '';
    // 重置筛选标签
    document.querySelectorAll('.wl-filter').forEach(b => b.classList.remove('active'));
    document.querySelector('.wl-filter[data-filter="all"]')?.classList.add('active');
    const searchInput = document.getElementById('wl-search');
    if (searchInput) searchInput.value = '';
    this._renderWordList();
    this.showScreen('wordlist');
  },

  _renderWordList() {
    const body = document.getElementById('wl-body');
    if (!body) return;
    body.innerHTML = '';

    const filter = this._wlFilter;
    const query = this._wlQuery.trim();

    const filtered = WORDS.filter(w => {
      const matchBook = filter === 'all' || w.unit.startsWith(filter + ' ');
      const q = query.toLowerCase();
      const matchQuery = !q ||
        w.word.toLowerCase().includes(q) ||
        w.meaning.toLowerCase().includes(q);
      return matchBook && matchQuery;
    });

    if (filtered.length === 0) {
      body.innerHTML = '<div class="wl-empty">没有找到匹配的单词</div>';
      return;
    }

    // 按 book > module 分组
    const groups = {};
    for (const w of filtered) {
      const book = w.unit.replace(/ M\d+$/, '');
      const mod  = w.unit;
      if (!groups[book]) groups[book] = {};
      if (!groups[book][mod]) groups[book][mod] = [];
      groups[book][mod].push(w);
    }

    const bookIcons = { '四上': '📘', '四下': '📗', '五上': '📙', '五下': '📕' };
    const bookOrder = ['四上', '四下', '五上', '五下'];

    for (const book of bookOrder) {
      if (!groups[book]) continue;
      const bookDiv = document.createElement('div');

      const bookTitle = document.createElement('div');
      bookTitle.className = 'wl-book-title';
      bookTitle.textContent = (bookIcons[book] || '📚') + ' ' + book;
      bookDiv.appendChild(bookTitle);

      for (const mod of Object.keys(groups[book]).sort()) {
        const modTitle = document.createElement('div');
        modTitle.className = 'wl-module-title';
        modTitle.textContent = mod;
        bookDiv.appendChild(modTitle);

        for (const w of groups[book][mod]) {
          const level = this.getFamiliarityLevel(w.word);
          const label = this.getFamiliarityLabel(level);
          const color = this.getFamiliarityColor(level);
          const item = document.createElement('div');
          item.className = 'wl-word-item';
          item.innerHTML = `
            <span class="wl-word">${w.word}</span>
            <span class="wl-phonetic">${w.phonetic || ''}</span>
            <span class="wl-meaning">${w.meaning}</span>
            <span class="wl-level" style="background:${color}22;color:${color}">${label}</span>
          `;
          item.addEventListener('click', () => this.speak(w.word));
          bookDiv.appendChild(item);
        }
      }
      body.appendChild(bookDiv);
    }
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
