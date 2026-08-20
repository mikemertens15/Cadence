import { colors, fonts } from '../theme';
import { BUILD } from '../data/releases';

// Small, quiet, clickable — the release log behind it is the point. It shows the
// version the running bundle was built from rather than whatever the log claims,
// so if a deploy didn't land, the chip is where you find that out.
export function VersionChip({ view, setView, size = 10 }) {
  const active = view === 'releases';
  return (
    <button
      onClick={() => setView('releases')}
      title="What's new"
      aria-label={`Version ${BUILD.version} — what's new`}
      style={{
        padding: '3px 8px',
        borderRadius: 20,
        background: active ? colors.accent : colors.chipBg,
        color: active ? colors.onAccent : colors.muted2,
        font: `700 ${size}px ${fonts.mono}`,
        lineHeight: 1.4,
        flexShrink: 0,
      }}
    >
      v{BUILD.version}
    </button>
  );
}
