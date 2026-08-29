import { colors, tone, fonts } from '../theme';
import { FEATURES, PRESETS, presetFor, BETA, BETA_KEYS } from '../features';
import { useSemester } from '../data/SemesterProvider';
import { Chip } from './Modal';

// Which parts of the app you want, and whether you're seeing the ones that
// aren't finished being decided about yet.
//
// The reason this screen exists is the one everybody hits at about week three:
// five classes, a study timer, a semester bar, a degree bar and the day's
// schedule all want the top of the same page, and four of them are only worth
// their space to some of the people looking at it. An app that answers a
// question you never ask teaches you to scroll past the place it answers it —
// and the thing you were actually looking for is underneath.
//
// Two rules, and the panel says both out loud rather than making anyone guess:
//
//   Nothing is deleted. Hours logged, meeting times, programs — switching a
//   feature off hides its screens and leaves every row where it is, so turning
//   it back on next semester finds it all intact. A settings screen that can
//   destroy data by being tapped is a settings screen people are right to be
//   afraid of.
//
//   Some things go with others. Turning off the timetable is not just one fewer
//   tab: the whole "where do I need to be" half of Today is built out of meeting
//   times. Saying so before the tap beats leaving someone to work out why their
//   home screen changed shape.

export function FeaturesPanel() {
  const { features, releaseChannel, setFeature, setFeatures, setChannel } = useSemester();
  const preset = presetFor(features);

  const applyPreset = (p) =>
    setFeatures(Object.fromEntries(FEATURES.map((f) => [f.key, p.on.includes(f.key)])));

  return (
    <>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
        {PRESETS.map((p) => (
          <Chip key={p.key} active={preset === p.key} onClick={() => applyPreset(p)}>
            {p.label}
          </Chip>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {FEATURES.map((f) => {
          const on = features[f.key];
          return (
            <div
              key={f.key}
              style={{
                padding: '13px 14px',
                borderRadius: 13,
                background: colors.inputBg,
                border: `1px solid ${colors.cardBorder}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: `600 13px ${fonts.sans}`, color: on ? colors.ink : colors.muted2 }}>
                    {f.label}
                  </div>
                  <div style={{ font: `400 11.5px/1.5 ${fonts.sans}`, color: colors.muted2, marginTop: 3 }}>
                    {f.blurb}
                  </div>
                </div>
                <Switch on={on} label={f.label} onChange={() => setFeature(f.key, !on)} />
              </div>

              {/* Only once it's off. A line explaining what you lose by turning
                  something off is noise while it's on, and the one sentence you
                  want the moment it isn't. */}
              {!on && (
                <div style={{ font: `400 11.5px/1.5 ${fonts.sans}`, color: colors.faint, marginTop: 9 }}>
                  {f.off}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ font: `400 11.5px/1.6 ${fonts.sans}`, color: colors.faint, marginTop: 14 }}>
        Switching something off hides it. Nothing is deleted &mdash; your hours, meeting times and
        programs stay exactly where they are, and come back the moment you switch it on again.
      </div>

      <div style={{ height: 1, background: colors.divider, margin: '22px 0 16px' }} />

      <ChannelPanel channel={releaseChannel} setChannel={setChannel} />
    </>
  );
}

/**
 * Which version of the app this account is on.
 *
 * One bundle, deployed the way it always was. What the channel decides is
 * whether the finished-but-not-yet-general parts of it are drawn — see BETA in
 * src/features.js, where turning something on for everybody is deleting a line.
 *
 * Deliberately not a secret. It's a switch anyone can find, which means a friend
 * could flip it and see something half-finished — and for a beta among five
 * people that is the correct trade: the alternative is an allow-list of email
 * addresses baked into a public bundle, or a redeploy every time somebody wants
 * in. What matters is that a beta account cannot write a row a stable one chokes
 * on, and that is a property of the schema (every migration additive) rather
 * than of this switch.
 */
function ChannelPanel({ channel, setChannel }) {
  const beta = channel === 'beta';

  return (
    <>
      <div style={{ font: `600 12px ${fonts.sans}`, color: colors.muted, marginBottom: 4 }}>
        Preview features
      </div>
      <div style={{ font: `400 11.5px/1.6 ${fonts.sans}`, color: colors.muted2, marginBottom: 11 }}>
        Beta turns on the things that are built but haven&rsquo;t been switched on for everyone
        yet. They work; they just haven&rsquo;t had a semester pointed at them.
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <Chip active={!beta} onClick={() => setChannel('stable')}>
          Stable
        </Chip>
        <Chip active={beta} onClick={() => setChannel('beta')}>
          Beta
        </Chip>
      </div>

      {/* What you actually get, by name. "Preview features: on" tells a tester
          nothing about what to look at, and a tester who doesn't know what is
          new can only report that nothing seems broken. */}
      {BETA_KEYS.length > 0 ? (
        <div
          style={{
            marginTop: 12,
            padding: '11px 13px',
            borderRadius: 12,
            background: colors.inputBg,
            border: `1px solid ${colors.cardBorder}`,
          }}
        >
          <div style={{ font: `600 11.5px ${fonts.sans}`, color: beta ? colors.accentDark : colors.muted2 }}>
            {beta ? "You're seeing" : 'Waiting behind this'}
          </div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
            {BETA_KEYS.map((key) => (
              <li
                key={key}
                style={{ font: `400 11.5px/1.6 ${fonts.sans}`, color: colors.muted2 }}
              >
                {BETA[key]}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div style={{ font: `400 11.5px/1.6 ${fonts.sans}`, color: colors.faint, marginTop: 11 }}>
          Nothing is waiting behind this right now &mdash; both channels are the same app.
        </div>
      )}

      {beta && (
        <div style={{ font: `400 11.5px/1.6 ${fonts.sans}`, color: tone.amberText, marginTop: 11 }}>
          If one of these gets something wrong, take a backup from the Data tab before you spend
          an evening acting on it.
        </div>
      )}
    </>
  );
}

// A switch, and it says which one it is. An unlabelled toggle in a list of four
// is four identical controls to a screen reader.
function Switch({ on, label, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      style={{
        flexShrink: 0,
        width: 46,
        height: 27,
        borderRadius: 999,
        background: on ? colors.accent : colors.inputBorder,
        border: 'none',
        padding: 3,
        display: 'flex',
        justifyContent: on ? 'flex-end' : 'flex-start',
        alignItems: 'center',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 21,
          height: 21,
          borderRadius: '50%',
          background: on ? colors.onAccent : colors.card,
          display: 'block',
        }}
      />
    </button>
  );
}
