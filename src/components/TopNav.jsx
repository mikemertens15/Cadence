import { colors, fonts, shadows } from '../theme';
import { NAV_ITEMS, navSection } from '../nav';
import { Mark } from '../auth/SignIn';
import { useSemester } from '../data/SemesterProvider';

// Desktop chrome: brand, destinations, term switcher, and the one button that
// matters everywhere — add.
export function TopNav({ view, setView, onAdd, onOpenSettings }) {
  const { terms, activeTerm, setTermId } = useSemester();
  const section = navSection(view);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: colors.navBar,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${colors.divider}`,
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          padding: '12px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <button
          onClick={() => setView('today')}
          style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}
        >
          <Mark size={24} />
          <span style={{ font: `400 21px ${fonts.serif}`, color: colors.ink }}>Cadence</span>
        </button>

        <nav style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          {NAV_ITEMS.map(([key, label]) => {
            const active = section === key;
            return (
              <button
                key={key}
                onClick={() => setView(key)}
                aria-current={active ? 'page' : undefined}
                style={{
                  padding: '8px 14px',
                  borderRadius: 20,
                  font: `${active ? 600 : 500} 13.5px ${fonts.sans}`,
                  color: active ? colors.ink : colors.muted2,
                  background: active ? colors.chipBg : 'transparent',
                }}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {terms.length > 1 && (
            <select
              value={activeTerm?.id ?? ''}
              onChange={(e) => setTermId(e.target.value)}
              aria-label="Term"
              style={{
                border: `1px solid ${colors.inputBorder}`,
                background: colors.inputBg,
                color: colors.muted3,
                borderRadius: 20,
                padding: '8px 12px',
                font: `600 12.5px ${fonts.sans}`,
                outline: 'none',
              }}
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={onAdd}
            style={{
              padding: '9px 18px',
              borderRadius: 20,
              background: colors.accent,
              color: colors.onAccent,
              font: `600 13px ${fonts.sans}`,
              boxShadow: shadows.accent,
            }}
          >
            Add
          </button>

          <button
            onClick={onOpenSettings}
            aria-label="Settings"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: colors.chipBg,
              color: colors.muted2,
              font: `600 14px ${fonts.sans}`,
            }}
          >
            ⚙
          </button>
        </div>
      </div>
    </header>
  );
}
