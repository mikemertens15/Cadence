import { useState } from 'react';
import { colors, fonts } from './theme';
import { useHashRoute } from './useHashRoute';
import { navAvailable, NAV_FALLBACK } from './nav';
import { useIsPhone } from './useMediaQuery';
import { useTheme } from './useTheme';
import { useAuth } from './auth/AuthProvider';
import { SignIn, Mark } from './auth/SignIn';
import { ResetPassword } from './auth/ResetPassword';
import { useSemester } from './data/SemesterProvider';
import { TopNav } from './components/TopNav';
import { MobileNav } from './components/MobileNav';
import { CourseModal } from './components/CourseModal';
import { AssignmentModal } from './components/AssignmentModal';
import { SettingsModal } from './components/SettingsModal';
import { StudyModal } from './components/StudyModal';
import { VersionChip } from './components/VersionChip';
import { Onboarding } from './views/Onboarding';
import { TodayView } from './views/TodayView';
import { ScheduleView } from './views/ScheduleView';
import { WorkView } from './views/WorkView';
import { GradesView, CourseGradeView } from './views/GradesView';
import { CoursesView } from './views/CoursesView';
import { ReleasesView } from './views/ReleasesView';

export default function App() {
  const { session, loading: authLoading, recovering } = useAuth();
  const { loading: dataLoading, loaded, terms } = useSemester();

  // Keeps the theme following the OS for as long as the app is open, not just
  // while the settings modal happens to be mounted.
  useTheme();

  // The gate: load session → set a new password (if we arrived from a reset
  // email) → sign in → load data → create a first term → the app.
  if (authLoading) return <Splash />;
  if (recovering && session) return <ResetPassword />;
  if (!session) return <SignIn />;
  if (dataLoading) return <Splash />;

  // `loaded` rather than `terms.length`, and the order matters.
  //
  // A read that failed leaves the dataset empty, and "empty" and "no terms yet"
  // are indistinguishable from here — so a phone that opened with no signal used
  // to sail past a real semester into the first-run wizard and offer to create a
  // term or sign out. Onboarding is now only reachable after a read that
  // actually came back, which makes "you have nothing" a fact we checked rather
  // than a guess we made while offline.
  if (!loaded) return <CantLoad />;
  if (!terms.length) return <Onboarding />;
  return <Shell />;
}

function Shell() {
  const [route, navigate] = useHashRoute('today');
  const phone = useIsPhone();
  const { courses, error, features } = useSemester();

  // One slot: only ever one dialog open, and opening another replaces it.
  const [modal, setModal] = useState(null);
  const close = () => setModal(null);

  // A route pointing at a switched-off part of the app falls back rather than
  // rendering an empty screen. It arrives that way from the places the tab bar
  // doesn't control — a bookmark, the back button, the hash still sitting in
  // the address bar from before the switch was flipped. Resolved rather than
  // redirected: a navigate() here would fire during render, and "today" drawn
  // immediately beats "schedule" drawn for one frame and then replaced.
  const shown = navAvailable(route, features) ? route : NAV_FALLBACK;
  const [section, detail] = shown.split('/');

  // What "Add" means depends on where you are and what exists. With no courses
  // yet there's only one sensible thing to create, and on the Courses tab the
  // course is obviously the subject.
  const add = () =>
    setModal(
      !courses.length || section === 'courses'
        ? { kind: 'course' }
        : { kind: 'assignment', defaultCourseId: section === 'grades' ? detail : undefined },
    );

  return (
    <div style={{ minHeight: '100vh', background: colors.bg }}>
      {!phone && (
        <TopNav
          view={shown}
          setView={navigate}
          onAdd={add}
          onOpenSettings={() => setModal({ kind: 'settings', startOn: 'terms' })}
        />
      )}

      {phone && (
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '12px 18px',
            background: colors.navBar,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderBottom: `1px solid ${colors.divider}`,
          }}
        >
          <Mark size={22} />
          <span style={{ font: `400 19px ${fonts.serif}`, color: colors.ink }}>Cadence</span>
          <VersionChip view={route} setView={navigate} size={9} />
          <button
            onClick={() => setModal({ kind: 'settings', startOn: 'terms' })}
            aria-label="Settings"
            style={{
              marginLeft: 'auto',
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: colors.chipBg,
              color: colors.muted2,
            }}
          >
            ⚙
          </button>
        </header>
      )}

      <main
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          // Extra room at the bottom on phones so the tab bar never covers the
          // last row of a list.
          padding: phone ? '18px 16px 130px' : '28px 32px 70px',
        }}
      >
        {error && (
          <div
            style={{
              font: `500 12.5px ${fonts.sans}`,
              color: colors.accentDark,
              background: colors.chipBg,
              borderRadius: 12,
              padding: '10px 14px',
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {section === 'today' && (
          <TodayView
            navigate={navigate}
            onAddCourse={() => setModal({ kind: 'course' })}
            onAddAssignment={() => setModal({ kind: 'assignment' })}
            onOpenAssignment={(assignment) => setModal({ kind: 'assignment', assignment })}
            onStartStudy={() => setModal({ kind: 'study' })}
          />
        )}

        {section === 'schedule' && (
          <ScheduleView
            onAddCourse={() => setModal({ kind: 'course' })}
            onOpenAssignment={(assignment) => setModal({ kind: 'assignment', assignment })}
          />
        )}

        {section === 'work' && (
          <WorkView
            onOpen={(assignment) => setModal({ kind: 'assignment', assignment })}
            onAdd={() => setModal({ kind: 'assignment' })}
          />
        )}

        {section === 'grades' &&
          (detail ? (
            <CourseGradeView
              /* Keyed by course so switching between two courses resets the
                 what-if scratchpad — carrying hypotheticals across would be a
                 quiet way to show someone the wrong grade. */
              key={detail}
              courseId={detail}
              navigate={navigate}
              onEditCourse={() =>
                setModal({ kind: 'course', course: courses.find((c) => c.id === detail) })
              }
              onOpenAssignment={(assignment) => setModal({ kind: 'assignment', assignment })}
            />
          ) : (
            <GradesView
              navigate={navigate}
              onAddCourse={() => setModal({ kind: 'course' })}
              onOpenCourse={() => navigate('courses')}
              onOpenDegree={() => setModal({ kind: 'settings', startOn: 'degree' })}
            />
          ))}

        {/* Not a nav section — reached only from the version chip, so nothing
            in the tab bar highlights while it's open. */}
        {section === 'releases' && <ReleasesView />}

        {section === 'courses' && (
          <CoursesView
            onAddCourse={() => setModal({ kind: 'course' })}
            onEditCourse={(course) => setModal({ kind: 'course', course })}
            onManageTerms={() => setModal({ kind: 'settings', startOn: 'terms' })}
          />
        )}
      </main>

      {phone && <MobileNav view={shown} setView={navigate} onAdd={add} />}

      {modal?.kind === 'course' && (
        <CourseModal course={modal.course} onClose={close} phone={phone} />
      )}
      {modal?.kind === 'assignment' && (
        <AssignmentModal
          assignment={modal.assignment}
          defaultCourseId={modal.defaultCourseId}
          onClose={close}
          phone={phone}
        />
      )}
      {modal?.kind === 'settings' && (
        <SettingsModal onClose={close} phone={phone} startOn={modal.startOn} />
      )}
      {modal?.kind === 'study' && (
        <StudyModal defaultCourseId={modal.defaultCourseId} onClose={close} phone={phone} />
      )}
    </div>
  );
}

/**
 * A first load that didn't come back.
 *
 * Deliberately says what went wrong and offers the two things that fix it,
 * rather than the old behaviour of assuming an empty database and offering to
 * build a semester on top of one that already exists. Retry is first because
 * the cause is almost always a phone that woke up before its network did — the
 * provider also re-reads on its own the moment the tab becomes visible or the
 * connection returns, so this screen usually clears itself.
 */
function CantLoad() {
  const { error, refresh } = useSemester();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 28,
        textAlign: 'center',
      }}
    >
      <Mark size={26} />
      <div style={{ font: `400 22px ${fonts.serif}`, color: colors.ink }}>
        Couldn&rsquo;t load your semester
      </div>
      <div style={{ font: `400 13.5px/1.55 ${fonts.sans}`, color: colors.muted2, maxWidth: 340 }}>
        {error || 'No answer from the server. This is usually a connection that hasn\u2019t come back yet.'}
      </div>
      <button
        onClick={async () => {
          setBusy(true);
          await refresh();
          setBusy(false);
        }}
        disabled={busy}
        style={{
          padding: '11px 22px',
          borderRadius: 22,
          background: colors.accent,
          color: colors.onAccent,
          font: `600 13px ${fonts.sans}`,
          opacity: busy ? 0.55 : 1,
        }}
      >
        {busy ? 'Trying…' : 'Try again'}
      </button>
      <button
        onClick={signOut}
        style={{ font: `600 12.5px ${fonts.sans}`, color: colors.muted, marginTop: 2 }}
      >
        Sign out
      </button>
    </div>
  );
}

function Splash() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 11,
      }}
    >
      <Mark size={26} />
      <div style={{ font: `400 25px ${fonts.serif}`, color: colors.muted2 }}>Cadence</div>
    </div>
  );
}
