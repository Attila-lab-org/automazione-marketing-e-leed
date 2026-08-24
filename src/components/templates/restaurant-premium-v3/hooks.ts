'use client';

import { useEffect, useState } from 'react';
import styles from './restaurant-v3.module.css';

/** QA / reduced-motion: all [data-reveal] visible without IntersectionObserver. */
function shouldForceReveal(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  if (document.documentElement.dataset.qaReveal === '1') return true;
  try {
    return new URLSearchParams(window.location.search).get('qa') === '1';
  } catch {
    return false;
  }
}

export function useReveal() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nodes = document.querySelectorAll<HTMLElement>('[data-reveal]');
    if (shouldForceReveal()) {
      nodes.forEach((n) => {
        n.classList.add(styles.revealVisible);
        n.classList.remove(styles.revealPending);
      });
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.revealVisible);
            entry.target.classList.remove(styles.revealPending);
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    nodes.forEach((n) => {
      n.classList.add(styles.revealPending);
      io.observe(n);
    });
    return () => io.disconnect();
  }, []);
}

export function useHeaderScroll() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return scrolled;
}
