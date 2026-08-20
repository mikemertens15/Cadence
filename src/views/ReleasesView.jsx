import { colors, tone, fonts } from '../theme';
import { parseDay, monthDay } from '../dates';
import { useIsPhone } from '../useMediaQuery';
import { Card } from '../components/ui';
import { RELEASES, BUILD } from '../data/releases';

// Proof the thing is going somewhere. Newest first, with the running build
// stamped at the bottom so there's always an honest answer to "which version am
// I actually on?" — the chip in the header shows what the bundle was built
// with, not what the log claims.

const TAGS = {
  added: ['New', tone.green],
  changed: ['Changed', tone.amberText],
  fixed: ['Fixed', tone.amberText],
  removed: ['Gone', tone.red],
};

export function ReleasesView() {
  const phone = useIsPhone();

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ font: `400 ${phone ? 24 : 30}px ${fonts.serif}`, color: colors.ink, marginBottom: 4 }}>
          Release log
        </div>
        <div style={{ font: `400 13.5px ${fonts.sans}`, color: colors.muted }}>
          What&rsquo;s changed in Cadence, newest first.
        </div>
      </div>

      {RELEASES.map((release, i) => (
        <div key={release.version} style={{ display: 'flex', gap: phone ? 12 : 18, marginBottom: 22 }}>
          {/* Timeline rail: a dot per release, filled for the newest. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flexShrink: 0,
              width: 14,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                marginTop: 20,
                background: i === 0 ? colors.accent : colors.card,
                border: `2px solid ${i === 0 ? colors.accent : colors.cardBorder}`,
              }}
            />
            {i < RELEASES.length - 1 && (
              <div style={{ flex: 1, width: 2, background: colors.divider, marginTop: 6 }} />
            )}
          </div>

          <Card style={{ padding: phone ? '15px 16px' : '18px 24px', flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 2,
              }}
            >
              <span style={{ font: `600 13px ${fonts.mono}`, color: colors.accent }}>
                v{release.version}
              </span>
              <span style={{ font: `400 ${phone ? 18 : 20}px ${fonts.serif}`, color: colors.ink }}>
                {release.name}
              </span>
              <span
                style={{
                  font: `400 12px ${fonts.sans}`,
                  color: colors.faint,
                  marginLeft: 'auto',
                }}
              >
                {monthDay(parseDay(release.date))}, {parseDay(release.date).getFullYear()}
              </span>
            </div>

            <div style={{ marginTop: 12 }}>
              {release.notes.map(([kind, text], n) => {
                const [label, color] = TAGS[kind] ?? TAGS.changed;
                return (
                  <div
                    key={n}
                    style={{
                      display: 'flex',
                      gap: 11,
                      // On a phone the tag sits above the sentence: side by
                      // side there isn't enough width left for the text to be
                      // anything but a ragged column.
                      flexDirection: phone ? 'column' : 'row',
                      alignItems: phone ? 'flex-start' : 'baseline',
                      padding: '6px 0',
                    }}
                  >
                    <span
                      style={{
                        font: `600 9.5px ${fonts.sans}`,
                        letterSpacing: '.06em',
                        textTransform: 'uppercase',
                        color,
                        background: colors.chipBg,
                        padding: '3px 8px',
                        borderRadius: 20,
                        flexShrink: 0,
                        minWidth: 54,
                        textAlign: 'center',
                      }}
                    >
                      {label}
                    </span>
                    <span style={{ font: `400 13.5px/1.55 ${fonts.sans}`, color: colors.muted3 }}>
                      {text}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ))}

      <div
        style={{
          font: `400 11.5px ${fonts.mono}`,
          color: colors.faint,
          textAlign: 'center',
          paddingTop: 6,
        }}
      >
        running v{BUILD.version} · {BUILD.commit}
        {BUILD.builtAt && ` · built ${monthDay(new Date(BUILD.builtAt))}`}
      </div>
    </div>
  );
}
