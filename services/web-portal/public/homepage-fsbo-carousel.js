(() => {
  const root = document.querySelector('[data-fsbo-carousel]');
  if (!root) return;

  const track = root.querySelector('[data-fsbo-track]');
  const cards = Array.from(track.querySelectorAll('.nw-fsbo-card'));
  const previous = root.querySelector('[data-fsbo-prev]');
  const next = root.querySelector('[data-fsbo-next]');
  const dots = Array.from(root.querySelectorAll('[data-fsbo-slide]'));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activeIndex = 0;
  let pendingIndex = null;
  let frame = 0;

  function cardLeft(index) {
    const trackBounds = track.getBoundingClientRect();
    return cards[index].getBoundingClientRect().left - trackBounds.left + track.scrollLeft;
  }

  function setActive(index) {
    activeIndex = index;
    dots.forEach((dot, dotIndex) => dot.setAttribute('aria-current', dotIndex === activeIndex ? 'true' : 'false'));
  }

  function syncControls() {
    previous.disabled = activeIndex <= 0;
    next.disabled = activeIndex >= cards.length - 1;
  }

  function show(index) {
    pendingIndex = Math.max(0, Math.min(cards.length - 1, index));
    setActive(pendingIndex);
    syncControls();
    track.scrollTo({ left: cardLeft(pendingIndex), behavior: reduceMotion ? 'auto' : 'smooth' });
    if (reduceMotion) {
      pendingIndex = null;
      update();
    }
  }

  function update() {
    if (pendingIndex !== null && Math.abs(cardLeft(pendingIndex) - track.scrollLeft) > 2) {
      setActive(pendingIndex);
      syncControls();
      return;
    }
    pendingIndex = null;
    const currentLeft = track.scrollLeft;
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    cards.forEach((card, index) => {
      const distance = Math.abs(cardLeft(index) - currentLeft);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActive(nearestIndex);
    previous.disabled = currentLeft <= 1;
    next.disabled = currentLeft + track.clientWidth >= track.scrollWidth - 2;
  }

  previous.addEventListener('click', () => show(activeIndex - 1));
  next.addEventListener('click', () => show(activeIndex + 1));
  dots.forEach((dot, index) => dot.addEventListener('click', () => show(index)));
  track.addEventListener('pointerdown', () => { pendingIndex = null; }, { passive: true });
  track.addEventListener('wheel', () => { pendingIndex = null; }, { passive: true });
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  }, { passive: true });
  track.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(activeIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      show(activeIndex - 1);
    }
  });
  window.addEventListener('resize', () => { pendingIndex = null; update(); });
  update();
})();
