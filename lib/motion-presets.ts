export const EASE_SWIFT = [0.32, 0.72, 0, 1] as const;
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export const springSoft = { type: "spring", stiffness: 220, damping: 28, mass: 0.9 };
export const springSnappy = { type: "spring", stiffness: 380, damping: 32, mass: 0.7 };

export const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE_SWIFT, delay: i * 0.05 },
  }),
};

export const stagger = (staggerChildren = 0.045, delayChildren = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren, delayChildren } },
});

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.45, ease: EASE_OUT_EXPO } },
};
