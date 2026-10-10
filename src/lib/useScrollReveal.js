import { useEffect } from 'react';

export function useScrollReveal() {
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    document.documentElement.classList.add('js-motion');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
    let frame = 0;
    const updateProgress = () => {
      frame = 0;
      const height = document.documentElement.scrollHeight - innerHeight;
      document.querySelector('.scroll-progress').style.width = `${height > 0 ? scrollY / height * 100 : 0}%`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(updateProgress); };
    window.addEventListener('scroll', onScroll, { passive: true });
    updateProgress();
    if (reduced.matches) document.querySelectorAll('.reveal').forEach(element => element.classList.add('visible'));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      document.documentElement.classList.remove('js-motion');
    };
  }, []);
}
