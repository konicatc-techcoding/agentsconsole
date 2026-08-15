import {
  RADII,
  RADIUS_LABELS,
  THEMES,
  THEME_LABELS,
  type RadiusId,
  type ThemeId,
} from "./useAppearance";

type Props = {
  theme: ThemeId;
  radius: RadiusId;
  onThemeChange: (next: ThemeId) => void;
  onRadiusChange: (next: RadiusId) => void;
};

/**
 * Header control: a colour-theme <select> plus three corner-shape buttons.
 * Drop it into `.tauri-header-controls`, before `.terminal-font-controls`,
 * so appearance controls sit together.
 */
export function AppearanceControls({
  theme,
  radius,
  onThemeChange,
  onRadiusChange,
}: Props) {
  return (
    <div className="appearance-controls">
      <span className="appearance-label">Style</span>

      <label className="sr-only" htmlFor="appearance-theme">
        Color theme
      </label>
      <select
        id="appearance-theme"
        value={theme}
        onChange={(event) => onThemeChange(event.target.value as ThemeId)}
      >
        {THEMES.map((id) => (
          <option key={id} value={id}>
            {THEME_LABELS[id]}
          </option>
        ))}
      </select>

      <div className="appearance-radius" role="group" aria-label="Corner shape">
        {RADII.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={radius === id}
            title={`${RADIUS_LABELS[id]} corners`}
            onClick={() => onRadiusChange(id)}
          >
            <span className={`appearance-radius-glyph appearance-radius-${id}`} />
            <span className="sr-only">{RADIUS_LABELS[id]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
