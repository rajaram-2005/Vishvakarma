'use client';
// SUTRA — cinematic intro. Skipped entirely under reduced motion.

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export function IntroOverlay() {
  const rm = useReducedMotion();
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (rm) {
      setShow(false);
      return;
    }
    const t = window.setTimeout(() => setShow(false), 2600);
    return () => window.clearTimeout(t);
  }, [rm]);

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          aria-label="skip intro"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center cursor-pointer"
          style={{ background: 'radial-gradient(80% 80% at 50% 45%, #070818 0%, #030309 100%)' }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, filter: 'blur(6px)' }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
          onClick={() => setShow(false)}
        >
          <svg width="120" height="120" viewBox="0 0 120 120" className="mb-8">
            <polygon
              points={hex(60, 60, 44)}
              fill="none"
              stroke="url(#intro-g)"
              strokeWidth="1.6"
              strokeDasharray="264"
              strokeDashoffset="264"
            >
              <animate attributeName="stroke-dashoffset" from="264" to="0" dur="1.1s" fill="freeze" />
            </polygon>
            <circle cx="60" cy="60" r="14" fill="none" stroke="url(#intro-g)" strokeWidth="1.2">
              <animate attributeName="r" from="4" to="14" dur="1.2s" fill="freeze" />
              <animate attributeName="opacity" from="0" to="1" dur="1.2s" fill="freeze" />
            </circle>
            <circle cx="60" cy="60" r="4" fill="#c9b8ff">
              <animate attributeName="r" values="2;5;3" dur="1.4s" />
            </circle>
            <defs>
              <linearGradient id="intro-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="60%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#e879f9" />
              </linearGradient>
            </defs>
          </svg>
          <motion.div
            className="font-display text-4xl font-semibold tracking-[0.5em] pl-[0.5em]"
            initial={{ opacity: 0, letterSpacing: '1em' }}
            animate={{ opacity: 1, letterSpacing: '0.5em' }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          >
            <span className="text-grad">SUTRA</span>
          </motion.div>
          <motion.div
            className="overline mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.8 }}
          >
            the open ai ecosystem
          </motion.div>
          <div className="w-40 h-px mt-8 overflow-hidden" style={{ background: 'var(--panel-2)' }}>
            <motion.div
              className="h-full"
              style={{ background: 'linear-gradient(90deg, var(--acc), var(--acc2))', boxShadow: '0 0 12px var(--acc)' }}
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 2.1, ease: 'easeInOut' }}
            />
          </div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function hex(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(' ');
}
