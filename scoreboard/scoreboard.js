function getFirstWord(str) {
  return str.trim().split(/\s+/)[0] || '';
}

function initFirstWord() {
  document.querySelectorAll('.first-word').forEach((el) => {
    el.textContent = getFirstWord(el.textContent);
  });
}

function createArrowButton(direction) {
  const button = document.createElement('button');
  button.className = `c_scoreboard-arrow is-${direction}`;
  button.type = 'button';
  button.setAttribute('aria-label', direction === 'left' ? 'Scroll scoreboard left' : 'Scroll scoreboard right');

  button.innerHTML = direction === 'left'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  return button;
}

function ensureArrows(scoreboard) {
  let arrowsWrap = scoreboard.querySelector('.c_scoreboard-arrows');
  if (!arrowsWrap) {
    arrowsWrap = document.createElement('div');
    arrowsWrap.className = 'c_scoreboard-arrows';
    scoreboard.appendChild(arrowsWrap);
  }

  let leftArrow = arrowsWrap.querySelector('.c_scoreboard-arrow.is-left');
  let rightArrow = arrowsWrap.querySelector('.c_scoreboard-arrow.is-right');

  if (!leftArrow) {
    leftArrow = createArrowButton('left');
    arrowsWrap.appendChild(leftArrow);
  }

  if (!rightArrow) {
    rightArrow = createArrowButton('right');
    arrowsWrap.appendChild(rightArrow);
  }

  return { leftArrow, rightArrow };
}

function initScrollGradients() {
  document.querySelectorAll('.c_scoreboard').forEach((scoreboard) => {
    const scoreboardWrap = scoreboard.querySelector('.c_scoreboard-wrap');
    if (!scoreboardWrap) return;

    const { leftArrow, rightArrow } = ensureArrows(scoreboard);

    function checkScrollPosition() {
      const tolerance = 2;
      const maxScrollLeft = Math.max(0, scoreboardWrap.scrollWidth - scoreboardWrap.clientWidth);
      const isAtStart = scoreboardWrap.scrollLeft <= tolerance;
      const isAtEnd = scoreboardWrap.scrollLeft >= maxScrollLeft - tolerance;
      const canScroll = maxScrollLeft > tolerance;

      scoreboard.classList.toggle('scrolled-to-start', isAtStart);
      scoreboard.classList.toggle('scrolled-to-end', isAtEnd);

      leftArrow.disabled = !canScroll || isAtStart;
      rightArrow.disabled = !canScroll || isAtEnd;
    }

    function scrollByPage(direction) {
      scoreboardWrap.scrollBy({
        left: direction * scoreboardWrap.clientWidth,
        behavior: 'smooth'
      });
    }

    leftArrow.addEventListener('click', () => scrollByPage(-1));
    rightArrow.addEventListener('click', () => scrollByPage(1));

    scoreboardWrap.addEventListener('scroll', checkScrollPosition);
    window.addEventListener('resize', checkScrollPosition);

    checkScrollPosition();
    setTimeout(checkScrollPosition, 100);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initFirstWord();
  initScrollGradients();
});
