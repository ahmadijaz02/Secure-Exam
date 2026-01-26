import React, { createContext, useContext, useReducer, useEffect } from 'react';

// Initial state
const initialState = {
  theme: 'light', // 'light' | 'dark' | 'system'
  isDark: false,
};

// Action types
const THEME_ACTIONS = {
  SET_THEME: 'SET_THEME',
  TOGGLE_THEME: 'TOGGLE_THEME',
  SET_SYSTEM_THEME: 'SET_SYSTEM_THEME',
};

// Reducer
function themeReducer(state, action) {
  switch (action.type) {
    case THEME_ACTIONS.SET_THEME:
      return {
        ...state,
        theme: action.payload.theme,
        isDark: action.payload.isDark,
      };
    case THEME_ACTIONS.TOGGLE_THEME:
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      return {
        ...state,
        theme: newTheme,
        isDark: newTheme === 'dark',
      };
    case THEME_ACTIONS.SET_SYSTEM_THEME:
      return {
        ...state,
        theme: 'system',
        isDark: action.payload.isDark,
      };
    default:
      return state;
  }
}

// Create context
const ThemeContext = createContext();

// Provider component
export function ThemeProvider({ children }) {
  const [state, dispatch] = useReducer(themeReducer, initialState);

  // Initialize theme on mount
  useEffect(() => {
    initializeTheme();
  }, []);

  // Apply theme changes to document
  useEffect(() => {
    applyTheme(state.isDark);
  }, [state.isDark]);

  // Listen for system theme changes
  useEffect(() => {
    if (state.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e) => {
        dispatch({
          type: THEME_ACTIONS.SET_SYSTEM_THEME,
          payload: { isDark: e.matches },
        });
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [state.theme]);

  const initializeTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
      if (savedTheme === 'system') {
        dispatch({
          type: THEME_ACTIONS.SET_SYSTEM_THEME,
          payload: { isDark: systemPrefersDark },
        });
      } else {
        dispatch({
          type: THEME_ACTIONS.SET_THEME,
          payload: { 
            theme: savedTheme, 
            isDark: savedTheme === 'dark' 
          },
        });
      }
    } else {
      // Default to system preference
      dispatch({
        type: THEME_ACTIONS.SET_SYSTEM_THEME,
        payload: { isDark: systemPrefersDark },
      });
    }
  };

  const applyTheme = (isDark) => {
    const root = document.documentElement;
    if (isDark) {
      root.setAttribute('data-theme', 'dark');
      root.classList.add('dark');
    } else {
      root.setAttribute('data-theme', 'light');
      root.classList.remove('dark');
    }
  };

  const setTheme = (theme) => {
    localStorage.setItem('theme', theme);
    
    if (theme === 'system') {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      dispatch({
        type: THEME_ACTIONS.SET_SYSTEM_THEME,
        payload: { isDark: systemPrefersDark },
      });
    } else {
      dispatch({
        type: THEME_ACTIONS.SET_THEME,
        payload: { 
          theme, 
          isDark: theme === 'dark' 
        },
      });
    }
  };

  const toggleTheme = () => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  const value = {
    ...state,
    setTheme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// Custom hook to use theme context
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;
