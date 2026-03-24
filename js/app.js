// app.js — 核心状态管理、路由、公共工具

const App = {
  state: {
    selectedUnit: 'all',
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

  // 称号配置
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
    this.bindHomeEvents();
    this.updateHomeProgress();
    this.updateCoinBar();
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
    const u = this.state.selectedUnit;
    if (u === 'all') return [...WORDS];
    return WORDS.filter(w => w.unit === u || w.unit.startsWith(u + ' '));
  },

  getReviewWords() {
    return WORDS.filter(w => {
      const p = this.state.progress[w.word];
      return p && p.errors > 0;
    });
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
    if (!this.state.progress[word]) {
      this.state.progress[word] = { correct: 0, errors: 0 };
    }
    correct
      ? this.state.progress[word].correct++
      : this.state.progress[word].errors++;
    try {
      localStorage.setItem('vocab-progress-v1', JSON.stringify(this.state.progress));
    } catch (_) {}
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
  getWordsSmartSorted(unit) {
    const words = unit === 'all' ? [...WORDS] : WORDS.filter(w => w.unit === unit || w.unit.startsWith(unit + ' '));
    const sorted = [...words].sort((a, b) => {
      return this.getUnfamiliarity(b.word) - this.getUnfamiliarity(a.word);
    });
    return sorted;
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
    document.querySelectorAll('.unit-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.unit-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.state.selectedUnit = tab.dataset.unit;
      });
    });

    const startMode = (mode, minWords, fn) => {
      const u = this.state.selectedUnit;
      const words = this.getSelectedWords();
      if (words.length < minWords) {
        alert(`至少需要 ${minWords} 个单词，请选择更多单元`);
        return;
      }
      this.state.lastMode = mode;
      this._roundCoins = 0;
      this._hadPerfectRound = false;
      // 智能排序：最不熟的词优先出现，同陌生度内随机打乱
      const sorted = this.getWordsSmartSorted(u);
      fn(this.shuffle(sorted));
    };

    document.getElementById('btn-flashcard').addEventListener('click', () =>
      startMode('flashcard', 2, w => Flashcard.init(w)));
    document.getElementById('btn-quiz').addEventListener('click', () =>
      startMode('quiz', 4, w => Quiz.init(w)));
    document.getElementById('btn-spelling').addEventListener('click', () =>
      startMode('spelling', 2, w => Spelling.init(w)));
    document.getElementById('btn-matching').addEventListener('click', () =>
      startMode('matching', 5, w => Matching.init(w)));

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
      const u = this.state.selectedUnit;
      const sorted = this.getWordsSmartSorted(u);
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
