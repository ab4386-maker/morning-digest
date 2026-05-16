"use client";

import { useEffect } from "react";

/**
 * Toggles the `.dark` class on <html> based on local time.
 *
 * - Dark mode: 7pm to 7am (roughly post-sunset / pre-sunrise)
 * - Light mode: 7am to 7pm
 * - Re-checks every minute so the theme flips automatically when the hour rolls over
 */
export function ThemeManager() {
  useEffect(() => {
    const apply = () => {
      const hour = new Date().getHours();
      const isDark = hour < 7 || hour >= 19;
      document.documentElement.classList.toggle("dark", isDark);
    };
    apply();
    const interval = setInterval(apply, 60_000);
    return () => clearInterval(interval);
  }, []);
  return null;
}
