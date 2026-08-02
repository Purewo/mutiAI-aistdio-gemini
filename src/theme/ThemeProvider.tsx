import { Moon, Sun } from 'lucide-react';
import { useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ThemeContext } from './themeContext';
import type { Theme, ThemeContextValue } from './themeContext';
import { useTheme } from './useTheme';

const THEME_STORAGE_KEY = 'nexwork:theme';

function readInitialTheme(): Theme {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === 'dark' ? '#07111f' : '#f4f8ff';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (nextTheme) => {
        setThemeState(nextTheme);
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        } catch {
          // Locked-down webviews can reject storage; the current tab still works.
        }
      },
      toggleTheme: () => {
        setThemeState((current) => {
          const nextTheme: Theme = current === 'light' ? 'dark' : 'light';
          try {
            window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
          } catch {
            // Persistence is best effort; the in-memory theme remains authoritative for this tab.
          }
          return nextTheme;
        });
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'light' ? 'dark' : 'light';
  const label = theme === 'light' ? '日间模式' : '夜间模式';
  const nextLabel = nextTheme === 'light' ? '日间模式' : '夜间模式';
  const Icon = theme === 'light' ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`切换到${nextLabel}`}
      title={`当前${label}，切换到${nextLabel}`}
      className={`theme-toggle group flex min-h-11 items-center rounded-xl border px-3 text-left text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 ${
        compact ? 'w-full justify-between gap-3' : 'w-full justify-center gap-2 lg:justify-start'
      }`}
    >
      <span className="theme-toggle-icon flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <span className={compact ? 'min-w-0 flex-1' : 'hidden truncate lg:inline'}>{label}</span>
      <span className="theme-toggle-action hidden text-[10px] font-medium sm:inline">切换</span>
    </button>
  );
}
