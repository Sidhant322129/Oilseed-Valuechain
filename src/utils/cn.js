// src/utils/cn.js
// Tiny className joiner — filters out falsy values.
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
