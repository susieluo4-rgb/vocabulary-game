// matching.js — 连连看模式

const Matching = {
  pairs: [],        // [{word, meaning}, ...]
  selected: null,   // { side: 'left'|'right', index: number, el: Element }
  matchedCount: 0,
  startTime: null,
  PAIR_COUNT: 5,
  dailyRounds: 0,    // 每日任务累计轮数
  dailyTotalScore: 0, // 每日任务累计得分

  init(words) {
    // 每轮随机取 PAIR_COUNT 对
    const pool = App.shuffle(words).slice(0, this.PAIR_COUNT);
    this.pairs = pool;
    this.selected = null;
    this.matchedCount = 0;
    this.startTime = null;

    App.startGame('matching');
    App.showScreen('matching');
    this.bindEvents();
    this.render();
  },

  bindEvents() {
    this._bound = this._bound || {};
    const rebind = (id, event, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (this._bound[id]) el.removeEventListener(event, this._bound[id]);
      this._bound[id] = fn.bind(this);
      el.addEventListener(event, this._bound[id]);
    };
    rebind('btn-match-back', 'click', () => App.showScreen('home'));
    rebind('btn-match-next', 'click', () => this.nextRound());
  },

  render() {
    const leftWords    = this.pairs.map(p => p.word);
    const rightMeanings = App.shuffle(this.pairs.map(p => p.meaning));

    this.leftItems  = leftWords;
    this.rightItems = rightMeanings;

    document.getElementById('match-progress').textContent =
      `0 / ${this.PAIR_COUNT}`;

    const leftCol  = document.getElementById('match-left');
    const rightCol = document.getElementById('match-right');
    leftCol.innerHTML  = '';
    rightCol.innerHTML = '';

    leftWords.forEach((word, i) => {
      const btn = document.createElement('button');
      btn.className = 'match-item';
      btn.textContent = word;
      btn.dataset.index = i;
      btn.dataset.side = 'left';
      btn.addEventListener('click', () => this.selectItem('left', i, btn));
      leftCol.appendChild(btn);
    });

    rightMeanings.forEach((meaning, i) => {
      const btn = document.createElement('button');
      btn.className = 'match-item';
      btn.textContent = meaning;
      btn.dataset.index = i;
      btn.dataset.side = 'right';
      btn.addEventListener('click', () => this.selectItem('right', i, btn));
      rightCol.appendChild(btn);
    });

    document.getElementById('btn-match-next').classList.add('hidden');
    document.getElementById('match-timer').textContent = '';
    this.startTime = Date.now();
  },

  selectItem(side, index, el) {
    if (el.disabled || el.classList.contains('matched')) return;

    // 如果已选中同侧的，切换选中
    if (this.selected && this.selected.side === side) {
      this.selected.el.classList.remove('selected');
      if (this.selected.el === el) {
        this.selected = null;
        return;
      }
    }

    el.classList.add('selected');

    if (!this.selected) {
      // 第一次选中
      this.selected = { side, index, el };
    } else {
      // 第二次选中，检查匹配
      const first  = this.selected;
      const second = { side, index, el };

      // 确保两个来自不同侧
      if (first.side === second.side) {
        // 同侧，只切换选中
        this.selected = second;
        return;
      }

      this.selected = null;
      this.checkMatch(first, second);
    }
  },

  checkMatch(a, b) {
    // 确定左右
    const left  = a.side === 'left' ? a : b;
    const right = a.side === 'right' ? a : b;

    const word    = this.leftItems[left.index];
    const meaning = this.rightItems[right.index];

    // 找到该 word 对应的 meaning
    const pair = this.pairs.find(p => p.word === word);
    const isCorrect = pair && pair.meaning === meaning;

    if (isCorrect) {
      // 配对成功
      left.el.classList.remove('selected');
      right.el.classList.remove('selected');
      left.el.classList.add('matched');
      right.el.classList.add('matched');
      left.el.disabled  = true;
      right.el.disabled = true;

      // 短暂弹跳动画
      left.el.classList.add('match-pop');
      right.el.classList.add('match-pop');
      setTimeout(() => {
        left.el.classList.remove('match-pop');
        right.el.classList.remove('match-pop');
      }, 400);

      App.saveProgress(word, true);
      App.earn('matching', 2); // 每配对成功 +2 金币
      this.matchedCount++;
      document.getElementById('match-progress').textContent =
        `${this.matchedCount} / ${this.PAIR_COUNT}`;

      App.speak(word);

      if (this.matchedCount === this.PAIR_COUNT) {
        this.finish();
      }
    } else {
      // 配对失败
      left.el.classList.add('match-wrong');
      right.el.classList.add('match-wrong');
      App.saveProgress(word, false);

      setTimeout(() => {
        left.el.classList.remove('selected', 'match-wrong');
        right.el.classList.remove('selected', 'match-wrong');
      }, 600);
    }
  },

  finish() {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timeStr = mins > 0
      ? `${mins}分${secs}秒`
      : `${secs}秒`;

    this.dailyTotalScore += this.PAIR_COUNT;
    document.getElementById('match-timer').textContent = `用时：${timeStr}`;

    // 每日任务模式：5轮完成才算任务结束
    if (App._inTaskFlow) {
      this.dailyRounds++;
      if (this.dailyRounds >= 5) {
        // 5轮全部完成 → 显示结果并进入下一任务
        document.getElementById('btn-match-next').classList.remove('hidden');
        setTimeout(() => {
          App.showResults(this.dailyTotalScore, this.dailyTotalScore, '完成5局');
          this.dailyRounds = 0;
          this.dailyTotalScore = 0;
        }, 1000);
      } else {
        // 继续下一轮
        document.getElementById('btn-match-next').classList.remove('hidden');
      }
    } else {
      // 自由模式：直接显示结果
      document.getElementById('btn-match-next').classList.remove('hidden');
      setTimeout(() => {
        App.showResults(this.PAIR_COUNT, this.PAIR_COUNT, `完成用时：${timeStr}`);
      }, 1000);
    }
  },

  nextRound() {
    // 从原始词库再取一轮（App 会传入新 shuffle 的词）
    const allWords = App.getSelectedWords();
    Matching.init(App.shuffle(allWords));
  }
};
