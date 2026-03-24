// quiz.js — 四选一选择题模式

const Quiz = {
  words: [],
  index: 0,
  score: 0,
  streak: 0,
  answered: false,

  init(words) {
    this.words = words;
    this.index = 0;
    this.score = 0;
    this.streak = 0;
    this.answered = false;

    App.startGame('quiz');
    App.showScreen('quiz');
    this.bindEvents();
    this.renderQuestion();
  },

  bindEvents() {
    this._bound = this._bound || {};

    const rebind = (id, event, fn) => {
      const el = document.getElementById(id);
      if (this._bound[id]) el.removeEventListener(event, this._bound[id]);
      this._bound[id] = fn.bind(this);
      el.addEventListener(event, this._bound[id]);
    };

    rebind('btn-quiz-back', 'click', () => App.showScreen('home'));
    rebind('btn-quiz-next', 'click', this.next);

    // 四个选项按钮
    ['A', 'B', 'C', 'D'].forEach(letter => {
      rebind('quiz-opt-' + letter, 'click', () => this.checkAnswer(letter));
    });
  },

  renderQuestion() {
    const word = this.words[this.index];
    const total = this.words.length;
    this.answered = false;

    // Header
    document.getElementById('quiz-counter').textContent = `${this.index + 1} / ${total}`;
    document.getElementById('quiz-progress-fill').style.width =
      `${(this.index / total) * 100}%`;
    document.getElementById('quiz-streak').textContent =
      this.streak > 1 ? `🔥 ${this.streak}` : '';

    // 问题：显示中文
    document.getElementById('quiz-question').textContent = word.meaning;

    // 生成 4 个选项（1 正确 + 3 干扰）
    const others = App.randomPick(this.words.map(w => w.word), word.word, 3);
    const options = App.shuffle([word.word, ...others]);
    this.correctLetter = null;

    ['A', 'B', 'C', 'D'].forEach((letter, i) => {
      const btn = document.getElementById('quiz-opt-' + letter);
      btn.textContent = options[i];
      btn.dataset.value = options[i];
      btn.className = 'quiz-option';
      btn.disabled = false;
      if (options[i] === word.word) this.correctLetter = letter;
    });

    // 下一题按钮隐藏
    document.getElementById('btn-quiz-next').classList.add('hidden');
    document.getElementById('quiz-feedback').textContent = '';
  },

  checkAnswer(letter) {
    if (this.answered) return;
    this.answered = true;

    const word = this.words[this.index];
    const btn = document.getElementById('quiz-opt-' + letter);
    const isCorrect = letter === this.correctLetter;

    // 禁用所有选项
    ['A', 'B', 'C', 'D'].forEach(l => {
      document.getElementById('quiz-opt-' + l).disabled = true;
    });

    if (isCorrect) {
      this.score++;
      this.streak++;
      btn.classList.add('option-correct');
      document.getElementById('quiz-feedback').textContent = '✓ 正确！';
      document.getElementById('quiz-feedback').className = 'quiz-feedback correct';
      App.speak(word.word);
      // 金币：答对 +3，连击≥3 额外 +1
      App.earn('quiz', 3);
      if (this.streak >= 3) App.earn('quiz-streak', 1);
    } else {
      this.streak = 0;
      btn.classList.add('option-wrong');
      // 高亮正确答案
      document.getElementById('quiz-opt-' + this.correctLetter).classList.add('option-correct');
      document.getElementById('quiz-feedback').textContent =
        `✗ 正确答案是：${word.word}`;
      document.getElementById('quiz-feedback').className = 'quiz-feedback wrong';
      App.speak(word.word);
    }

    App.saveProgress(word.word, isCorrect);

    // 若非最后一题，显示"下一题"按钮
    if (this.index < this.words.length - 1) {
      document.getElementById('btn-quiz-next').classList.remove('hidden');
    } else {
      // 最后一题，延迟后进入结果页
      setTimeout(() => App.showResults(this.score, this.words.length), 1500);
    }
  },

  next() {
    this.index++;
    this.renderQuestion();
  }
};
