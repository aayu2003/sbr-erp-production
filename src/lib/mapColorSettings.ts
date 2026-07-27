export type GlobalMapColorSettings = {
  land: string;
  crops: Record<string, string>;
};

export const GLOBAL_MAP_COLORS_KEY = 'land-directory-map-colors';

export const DEFAULT_GLOBAL_MAP_COLORS: GlobalMapColorSettings = {
  land: '#fde047',
  crops: {},
};

const sanitizeCropKey = (crop: string) =>
  crop.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
let appliedCropKeys = new Set<string>();

export const loadGlobalMapColors = (): GlobalMapColorSettings => {
  try {
    const stored = window.localStorage.getItem(GLOBAL_MAP_COLORS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        land: String(parsed?.land || DEFAULT_GLOBAL_MAP_COLORS.land),
        crops: typeof parsed?.crops === 'object' && parsed.crops ? parsed.crops : {},
      };
    }
  } catch {
    // Use defaults when storage is unavailable or invalid.
  }
  return DEFAULT_GLOBAL_MAP_COLORS;
};

export const applyGlobalMapColors = (settings: GlobalMapColorSettings) => {
  const root = document.documentElement;
  root.style.setProperty('--land-boundary-color', settings.land);
  root.style.setProperty(
    '--land-boundary-fill',
    settings.land.toLowerCase() === '#fde047' ? '#fef9c3' : settings.land,
  );
  appliedCropKeys.forEach(crop => {
    root.style.removeProperty(`--crop-${crop}-color`);
  });
  appliedCropKeys = new Set();
  Object.entries(settings.crops).forEach(([crop, color]) => {
    const cropKey = sanitizeCropKey(crop);
    root.style.setProperty(`--crop-${cropKey}-color`, color);
    appliedCropKeys.add(cropKey);
  });
};

export const saveGlobalMapColors = (settings: GlobalMapColorSettings) => {
  try {
    window.localStorage.setItem(GLOBAL_MAP_COLORS_KEY, JSON.stringify(settings));
  } catch {
    // Keep the active CSS variables even if persistence is unavailable.
  }
  applyGlobalMapColors(settings);
};

export const globalCropColor = (crop: string, fallback: string) =>
  `var(--crop-${sanitizeCropKey(crop)}-color, ${fallback})`;

export const GLOBAL_LAND_BOUNDARY_COLOR = 'var(--land-boundary-color, #fde047)';
export const GLOBAL_LAND_BOUNDARY_FILL = 'var(--land-boundary-fill, #fef9c3)';
