// spelling.js — 拼写练习模式

const Spelling = {
  words: [],
  index: 0,
  score: 0,
  hintsRevealed: 0,
  firstAttempt: true,
  currentWord: '',

  init(words) {
    this.words = words;
    this.index = 0;
    this.score = 0;

    App.startGame('spelling');
    App.showScreen('spelling');
    this.bindEvents();
    this.renderWord();
  },

  bindEvents() {
    this._bound = this._bound || {};

    const rebind = (id, event, fn) => {
      const el = document.getElementById(id);
      if (this._bound[id]) el.removeEventListener(event, this._bound[id]);
      this._bound[id] = fn.bind(this);
      el.addEventListener(event, this._bound[id]);
    };

    rebind('btn-spell-back',   'click',  () => App.showScreen('home'));
    rebind('btn-spell-submit', 'click',  this.submit);
    rebind('btn-spell-hint',   'click',  this.hint);
    rebind('btn-spell-speak',  'click',  this.speakCurrent);
    rebind('btn-spell-next',   'click',  this.next);

    // 输入框 Enter 键提交
    const input = document.getElementById('spell-input');
    if (this._bound['spell-input-key']) {
      input.removeEventListener('keydown', this._bound['spell-input-key']);
    }
    this._bound['spell-input-key'] = (e) => {
      if (e.key === 'Enter') this.submit();
    };
    input.addEventListener('keydown', this._bound['spell-input-key']);

    // 实时更新字母框
    if (this._bound['spell-input-input']) {
      input.removeEventListener('input', this._bound['spell-input-input']);
    }
    this._bound['spell-input-input'] = () => this.updateBoxes();
    input.addEventListener('input', this._bound['spell-input-input']);
  },

  renderWord() {
    const word = this.words[this.index];
    const total = this.words.length;
    this.currentWord = word.word.toLowerCase();
    this.hintsRevealed = 0;
    this.firstAttempt = true;

    // Header
    document.getElementById('spell-counter').textContent = `${this.index + 1} / ${total}`;
    document.getElementById('spell-progress-fill').style.width =
      `${(this.index / total) * 100}%`;

    // 熟悉度标签
    const level = App.getFamiliarityLevel(word.word);
    const spellBadge = document.getElementById('spell-familiarity');
    if (spellBadge) {
      spellBadge.textContent = App.getFamiliarityLabel(level);
      spellBadge.style.background = App.getFamiliarityColor(level);
    }

    // 中文提示
    document.getElementById('spell-meaning').textContent = word.meaning;
    document.getElementById('spell-example').textContent = word.example || '';

    // 字母框（初始全空）
    this.renderBoxes(null);

    // 清空输入框并聚焦
    const input = document.getElementById('spell-input');
    input.value = '';
    input.disabled = false;

    // 重置反馈区域
    document.getElementById('spell-feedback').textContent = '';
    document.getElementById('spell-feedback').className = 'spell-feedback';

    // 按钮状态
    document.getElementById('btn-spell-submit').disabled = false;
    document.getElementById('btn-spell-next').classList.add('hidden');
    document.getElementById('btn-spell-hint').disabled = false;

    // 朗读单词
    setTimeout(() => App.speak(word.word), 400);
    // 朗读例句
    if (word.example) {
      setTimeout(() => App.speak(word.example), 900);
    }

    // 自动聚焦（iPad 上延迟以等待屏幕切换）
    setTimeout(() => input.focus(), 500);
  },

  renderBoxes(typed) {
    const word = this.currentWord;
    const container = document.getElementById('spell-boxes');
    container.innerHTML = '';

    for (let i = 0; i < word.length; i++) {
      const box = document.createElement('div');
      box.className = 'letter-box';

      if (i < this.hintsRevealed) {
        // 已提示的字母
        box.textContent = word[i].toUpperCase();
        box.classList.add('box-hint');
      } else if (typed && i < typed.length) {
        // 用户输入的字母
        box.textContent = typed[i].toUpperCase();
        box.classList.add('box-typed');
      } else {
        // 空白
        box.textContent = '';
      }

      container.appendChild(box);
    }
  },

  renderResultBoxes(typed) {
    // 答题后显示正确/错误颜色反馈
    const word = this.currentWord;
    const container = document.getElementById('spell-boxes');
    container.innerHTML = '';

    for (let i = 0; i < word.length; i++) {
      const box = document.createElement('div');
      box.className = 'letter-box';

      if (i < this.hintsRevealed) {
        box.textContent = word[i].toUpperCase();
        box.classList.add('box-hint');
      } else {
        const typedChar = typed ? (typed[i] || '').toLowerCase() : '';
        box.textContent = (typedChar || word[i]).toUpperCase();
        box.classList.add(typedChar === word[i] ? 'box-correct' : 'box-wrong');
      }
      container.appendChild(box);
    }
  },

  updateBoxes() {
    const typed = document.getElementById('spell-input').value.toLowerCase();
    this.renderBoxes(typed);
  },

  submit() {
    const input = document.getElementById('spell-input');
    const typed = input.value.trim().toLowerCase();
    const word = this.currentWord;

    if (!typed) {
      // 空提交，提醒输入
      document.getElementById('spell-feedback').textContent = '请先输入单词';
      return;
    }

    const isCorrect = typed === word;
    this.renderResultBoxes(typed);

    input.disabled = true;
    document.getElementById('btn-spell-submit').disabled = true;
    document.getElementById('btn-spell-hint').disabled = true;

    const fb = document.getElementById('spell-feedback');
    if (isCorrect) {
      this.score++;
      fb.textContent = '✓ 拼写正确！太棒了！';
      fb.className = 'spell-feedback fb-correct';
      // 金币：无提示满分 +5，有提示 +2
      if (this.hintsRevealed === 0) {
        App.earn('spelling', 5);
      } else {
        App.earn('spelling-hint', 2);
      }
    } else {
      fb.textContent = `✗ 正确拼写：${this.words[this.index].word}`;
      fb.className = 'spell-feedback fb-wrong';
      App.speak(this.words[this.index].word);
    }

    App.saveProgress(this.words[this.index].word, isCorrect && this.firstAttempt);

    if (this.index < this.words.length - 1) {
      document.getElementById('btn-spell-next').classList.remove('hidden');
    } else {
      setTimeout(() => App.showResults(this.score, this.words.length), 1800);
    }
  },

  hint() {
    if (this.hintsRevealed >= this.currentWord.length) return;
    this.firstAttempt = false;  // 用了提示则不算首次答对加分
    this.hintsRevealed++;
    const typed = document.getElementById('spell-input').value.toLowerCase();
    this.renderBoxes(typed);

    // 如果提示已揭露所有字母，自动提交
    if (this.hintsRevealed >= this.currentWord.length) {
      document.getElementById('spell-input').value = this.currentWord;
      this.submit();
    }
  },

  speakCurrent() {
    App.speak(this.words[this.index].word);
  },

  next() {
    this.index++;
    this.renderWord();
  }
};
