// flashcard.js — 闪卡认读模式

const Flashcard = {
  words: [],
  queue: [],       // 当前轮待复习队列
  index: 0,
  known: 0,
  total: 0,
  flipped: false,
  _busy: false,    // 防止动画中途渲染下一张卡

  init(words) {
    this.words = words;
    this.queue = [...words];
    this.index = 0;
    this.known = 0;
    this.total = words.length;
    this.flipped = false;
    this._busy = false;

    App.startGame('flashcard');
    App.showScreen('flashcard');
    this.bindEvents();
    this.render();
  },

  bindEvents() {
    // 每次 init 时重绑（避免重复注册）
    this._bound = this._bound || {};

    const rebind = (id, event, fn) => {
      const el = document.getElementById(id);
      if (this._bound[id]) el.removeEventListener(event, this._bound[id]);
      this._bound[id] = fn.bind(this);
      el.addEventListener(event, this._bound[id]);
    };

    rebind('flash-card',    'click',  this.handleCardClick);
    rebind('btn-fc-know',   'click',  this.know);
    rebind('btn-fc-again',  'click',  this.again);
    rebind('btn-fc-speak',  'click',  this.speakCurrent);
    rebind('btn-fc-back',   'click',  () => App.showScreen('home'));
  },

  handleCardClick() {
    if (!this.flipped && !this._busy) this.flip();
  },

  render() {
    // 动画中途不渲染下一张卡
    if (this._busy) return;

    const word = this.queue[this.index];
    const total = this.total;
    const done = this.index; // approximate progress

    this.flipped = false;

    // Header
    document.getElementById('fc-counter').textContent =
      `${Math.min(done + 1, total)} / ${total}`;
    document.getElementById('fc-progress-fill').style.width =
      `${(done / total) * 100}%`;

    // 熟悉度标签
    const level = App.getFamiliarityLevel(word.word);
    const fcBadge = document.getElementById('fc-familiarity');
    if (fcBadge) {
      fcBadge.textContent = App.getFamiliarityLabel(level);
      fcBadge.style.background = App.getFamiliarityColor(level);
    }

    // Card faces
    document.getElementById('fc-word').textContent = word.word;
    document.getElementById('fc-phonetic').textContent = word.phonetic || '';
    document.getElementById('fc-meaning').textContent = word.meaning;
    document.getElementById('fc-example').textContent = word.example || '';

    // Reset flip state
    document.getElementById('flash-card').classList.remove('flipped');
    document.getElementById('fc-actions').classList.add('hidden');
    document.getElementById('fc-tap-hint').classList.remove('hidden');

    // Auto speak
    setTimeout(() => App.speak(word.word), 400);
  },

  flip() {
    this.flipped = true;
    document.getElementById('flash-card').classList.add('flipped');
    document.getElementById('fc-actions').classList.remove('hidden');
    document.getElementById('fc-tap-hint').classList.add('hidden');
  },

  speakCurrent() {
    App.speak(this.queue[this.index].word);
  },

  know() {
    if (this._busy) return;
    App.saveProgress(this.queue[this.index].word, true);
    App.earn('flashcard', 2);   // 认识 +2 金币
    this.known++;
    this._advance();
  },

  again() {
    if (this._busy) return;
    App.saveProgress(this.queue[this.index].word, false);
    // 把这张卡移到队尾，再练一次（无金币）
    const card = this.queue.splice(this.index, 1)[0];
    this.queue.push(card);
    // 若 index 越界则回到 0
    if (this.index >= this.queue.length) this.index = 0;
    // 动画延迟渲染，避免泄露下一张内容
    this._busy = true;
    setTimeout(() => {
      this._busy = false;
      this.render();
    }, 650);
  },

  _advance() {
    this.index++;
    if (this.index >= this.queue.length) {
      // 闪卡完成
      App.showResults(this.known, this.total);
    } else {
      // 等待翻转动画完成后再渲染下一张
      this._busy = true;
      setTimeout(() => {
        this._busy = false;
        this.render();
      }, 650);
    }
  }
};
