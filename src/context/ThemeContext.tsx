import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

export interface AccentPreset {
  id: string;
  label: string;
  primary: string;
  hover: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'forest',   label: 'Forest Green', primary: '#0D3A35', hover: '#092B27' },
  { id: 'navy',     label: 'Navy Blue',    primary: '#0F2A4A', hover: '#0A1F38' },
  { id: 'charcoal', label: 'Charcoal',     primary: '#1F2937', hover: '#111827' },
  { id: 'maroon',   label: 'Maroon',       primary: '#4A1223', hover: '#350D19' },
  { id: 'indigo',   label: 'Indigo',       primary: '#312E81', hover: '#231F63' },
  { id: 'teal',     label: 'Teal',         primary: '#0F4C4C', hover: '#0A3838' },
];

const DEFAULT_ACCENT_ID = 'forest';
const THEME_STORAGE_KEY = 'sbr-erp-theme-accent';

interface ThemeContextValue {
  accentId: string;
  accent: AccentPreset;
  setAccentId: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getPreset = (id: string): AccentPreset =>
  ACCENT_PRESETS.find(p => p.id === id) ?? ACCENT_PRESETS[0];

const readStoredAccentId = (): string => {
  if (typeof window === 'undefined') return DEFAULT_ACCENT_ID;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored && ACCENT_PRESETS.some(p => p.id === stored) ? stored : DEFAULT_ACCENT_ID;
  } catch {
    return DEFAULT_ACCENT_ID;
  }
};

const applyAccentToDocument = (preset: AccentPreset) => {
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', preset.primary);
  root.style.setProperty('--brand-primary-hover', preset.hover);
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [accentId, setAccentIdState] = useState<string>(() => readStoredAccentId());

  useEffect(() => {
    applyAccentToDocument(getPreset(accentId));
  }, [accentId]);

  const setAccentId = (id: string) => {
    setAccentIdState(id);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // localStorage unavailable - theme still applies for this session
    }
  };

  return (
    <ThemeContext.Provider value={{ accentId, accent: getPreset(accentId), setAccentId }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};
