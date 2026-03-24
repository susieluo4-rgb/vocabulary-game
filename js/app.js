// app.js — 核心状态管理、路由、公共工具

const App = {
  state: {
    selectedUnit: 'all',
    lastMode: null,
    progress: {}
  },

  init() {
    this.loadProgress();
    this.bindHomeEvents();
    this.updateHomeProgress();
    this._initVoice();   // 预加载最佳美音voice
    this.showScreen('home');
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
    // 支持前缀匹配，如 "四上" 匹配 "四上 M1", "四上 M2" 等
    return WORDS.filter(w => w.unit === u || w.unit.startsWith(u + ' '));
  },

  getReviewWords() {
    return WORDS.filter(w => {
      const p = this.state.progress[w.word];
      return p && p.errors > 0;
    });
  },

  // ── 语音朗读（标准美音）──────────────────────────────────────
  // 使用 iOS/iPad 系统语音，优先选择高质量美音voice
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

    if (this._preferredVoice) {
      utt.voice = this._preferredVoice;
    }
    window.speechSynthesis.speak(utt);
  },

  // 初始化时预加载并选择最佳美音voice
  _initVoice() {
    if (!window.speechSynthesis) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;
      // 优先顺序：Samantha > Daniel > Alex > Karen > 其他美音
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
    // iOS Safari voices 是异步加载的
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

  resetProgress() {
    this.state.progress = {};
    try { localStorage.removeItem('vocab-progress-v1'); } catch (_) {}
    this.updateHomeProgress();
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

    // 错题本按钮
    const reviewBtn = document.getElementById('btn-review');
    const reviewCount = this.getReviewWords().length;
    if (reviewBtn) {
      reviewBtn.textContent = `错题本 (${reviewCount} 词)`;
      reviewBtn.style.display = reviewCount > 0 ? 'block' : 'none';
    }
  },

  // ── 首页事件绑定 ─────────────────────────────────────────────
  bindHomeEvents() {
    // 单元选择
    document.querySelectorAll('.unit-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.unit-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.state.selectedUnit = tab.dataset.unit;
      });
    });

    // 模式按钮
    const startMode = (mode, minWords, fn) => {
      const words = this.getSelectedWords();
      if (words.length < minWords) {
        alert(`至少需要 ${minWords} 个单词，请选择更多单元`);
        return;
      }
      this.state.lastMode = mode;
      fn(this.shuffle(words));
    };

    document.getElementById('btn-flashcard').addEventListener('click', () =>
      startMode('flashcard', 2, w => Flashcard.init(w)));
    document.getElementById('btn-quiz').addEventListener('click', () =>
      startMode('quiz', 4, w => Quiz.init(w)));
    document.getElementById('btn-spelling').addEventListener('click', () =>
      startMode('spelling', 2, w => Spelling.init(w)));
    document.getElementById('btn-matching').addEventListener('click', () =>
      startMode('matching', 5, w => Matching.init(w)));

    // 错题本
    document.getElementById('btn-review').addEventListener('click', () => {
      const words = this.getReviewWords();
      if (words.length < 4) {
        Flashcard.init(this.shuffle(words));
      } else {
        this.state.lastMode = 'quiz';
        Quiz.init(this.shuffle(words));
      }
    });

    // 重置进度
    document.getElementById('btn-reset').addEventListener('click', () => {
      if (confirm('确定要清除所有进度吗？')) this.resetProgress();
    });

    // 结果页按钮
    document.getElementById('btn-retry').addEventListener('click', () => {
      const words = this.getSelectedWords();
      const shuffled = this.shuffle(words);
      switch (this.state.lastMode) {
        case 'flashcard': Flashcard.init(shuffled); break;
        case 'quiz':      Quiz.init(shuffled);      break;
        case 'spelling':  Spelling.init(shuffled);  break;
        case 'matching':  Matching.init(shuffled);  break;
      }
    });

    document.getElementById('btn-home-from-results').addEventListener('click', () => {
      this.updateHomeProgress();
      this.showScreen('home');
    });
  },

  // ── 结果屏幕 ─────────────────────────────────────────────────
  showResults(score, total, extra) {
    const pct = total > 0 ? Math.round(score / total * 100) : 0;
    const stars = pct >= 90 ? 3 : pct >= 60 ? 2 : 1;

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

    if (stars === 3) this.createStarBurst(24);
    this.showScreen('results');
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
