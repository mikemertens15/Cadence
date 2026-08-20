import { colors, fonts, shadows } from '../theme';
import { NAV_ITEMS, navSection } from '../nav';

// Phone chrome: a fixed tab bar with all five destinations, and a floating add
// button above it. Five tabs fit without a "More" menu, which is the point —
// nothing in an app this small deserves to be two taps deep.
export function MobileNav({ view, setView, onAdd }) {
  const section = navSection(view);

  return (
    <>
      <button
        onClick={onAdd}
        aria-label="Add"
        style={{
          position: 'fixed',
          right: 18,
          bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
          zIndex: 25,
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: colors.accent,
          color: colors.onAccent,
          font: `400 27px ${fonts.sans}`,
          lineHeight: 1,
          boxShadow: shadows.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        +
      </button>

      <nav
        className="cad-safe-bottom"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 24,
          display: 'flex',
          background: colors.navBar,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderTop: `1px solid ${colors.divider}`,
        }}
      >
        {NAV_ITEMS.map(([key, label, glyph]) => {
          const active = section === key;
          return (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-current={active ? 'page' : undefined}
              style={{
                flex: 1,
                padding: '10px 2px 12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                color: active ? colors.accent : colors.muted,
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>{glyph}</span>
              <span style={{ font: `${active ? 600 : 500} 10.5px ${fonts.sans}` }}>{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
