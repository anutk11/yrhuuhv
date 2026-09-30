import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "dim" | "light";

const THEMES: Theme[] = ["dark", "dim", "light"];
const STORAGE_KEY = "app-theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  cycleTheme: () => {},
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return stored && THEMES.includes(stored as Theme) ? (stored as Theme) : "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-dark", "theme-dim", "theme-light", "dark", "light");
    root.classList.add(`theme-${theme}`);
    root.classList.add(theme === "light" ? "light" : "dark");
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const cycleTheme = () =>
    setThemeState((prev) => THEMES[(THEMES.indexOf(prev) + 1) % THEMES.length]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
