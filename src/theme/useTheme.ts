import { useContext } from 'react';
import { ThemeContext } from './themeContext';
import type { ThemeContextValue } from './themeContext';

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}
