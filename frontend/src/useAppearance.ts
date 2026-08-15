import { useCallback, useEffect, useState } from "react";

export const THEMES = ["blueprint", "graphite", "daylight"] as const;
export const RADII = ["square", "soft", "round"] as const;

export type ThemeId = (typeof THEMES)[number];
export type RadiusId = (typeof RADII)[number];

export const THEME_LABELS: Record<ThemeId, string> = {
  blueprint: "Blueprint",
  graphite: "Graphite",
  daylight: "Daylight",
};

export const RADIUS_LABELS: Record<RadiusId, string> = {
  square: "Square",
  soft: "Soft",
  round: "Round",
};

const THEME_KEY = "agentsconsole.appearance.theme";
const RADIUS_KEY = "agentsconsole.appearance.radius";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Owns the two appearance attributes on <html>. Purely presentational:
 * it never touches session state, so switching styles cannot disturb a
 * running PTY.
 */
export function useAppearance() {
  const [theme, setThemeState] = useState<ThemeId>(() =>
    read(THEME_KEY, THEMES, "blueprint"),
  );
  const [radius, setRadiusState] = useState<RadiusId>(() =>
    read(RADIUS_KEY, RADII, "square"),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable — the attribute is still applied */
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.radius = radius;
    try {
      window.localStorage.setItem(RADIUS_KEY, radius);
    } catch {
      /* storage unavailable — the attribute is still applied */
    }
  }, [radius]);

  const setTheme = useCallback((next: ThemeId) => setThemeState(next), []);
  const setRadius = useCallback((next: RadiusId) => setRadiusState(next), []);

  return { theme, radius, setTheme, setRadius };
}
