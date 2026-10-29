export class FormulaCarousel {
  constructor(root = document) {
    this.deck = root.querySelector('#formula-deck');
    this.groups = new Map([...this.deck.querySelectorAll('[data-formula-group]')].map(group => [group.dataset.formulaGroup, group]));
    this.previous = root.querySelector('#formula-previous'); this.next = root.querySelector('#formula-next');
    this.position = root.querySelector('#formula-position'); this.index = 0; this.kind = 'glucose';
    this.previous.addEventListener('click', () => this.go(this.index - 1));
    this.next.addEventListener('click', () => this.go(this.index + 1));
    for (const group of this.groups.values()) {
      group.addEventListener('scroll', () => { if (group === this.group) this.refresh(); });
      group.addEventListener('keydown', event => {
        const keys = { ArrowDown: this.index + 1, PageDown: this.index + 1, ArrowUp: this.index - 1, PageUp: this.index - 1, Home: 0, End: this.cards.length - 1 };
        if (Object.hasOwn(keys, event.key)) { event.preventDefault(); this.go(keys[event.key]); }
      });
    }
    this.setGroup(this.kind);
  }
  get group() { return this.groups.get(this.kind); }
  get cards() { return [...this.group.children]; }
  setActive(active) { this.deck.hidden = !active; this.refresh(); }
  setGroup(kind) {
    if (!this.groups.has(kind)) return;
    this.kind = kind;
    for (const [name, group] of this.groups) group.hidden = name !== kind;
    this.index = 0; this.group.scrollTop = 0; this.refresh();
  }
  go(index) {
    this.index = Math.max(0, Math.min(this.cards.length - 1, index));
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.group.scrollTo({ top: this.cards[this.index].offsetTop, behavior: reduce ? 'auto' : 'smooth' });
    this.updateButtons();
  }
  refresh() {
    let nearest = 0, distance = Infinity;
    this.cards.forEach((card, index) => {
      const gap = Math.abs(card.offsetTop - this.group.scrollTop);
      if (gap < distance) { nearest = index; distance = gap; }
    });
    this.index = nearest; this.updateButtons();
  }
  updateButtons() {
    this.previous.disabled = this.index === 0; this.next.disabled = this.index === this.cards.length - 1;
    this.position.textContent = `${this.index + 1} / ${this.cards.length}`;
    this.cards.forEach((card, index) => {
      if (index === this.index) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current');
    });
  }
}
