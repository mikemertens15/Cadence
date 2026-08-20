import { useState } from 'react';
import { colors, fonts } from './theme';
import { useHashRoute } from './useHashRoute';
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
import { Onboarding } from './views/Onboarding';
import { TodayView } from './views/TodayView';
import { ScheduleView } from './views/ScheduleView';
import { WorkView } from './views/WorkView';
import { GradesView, CourseGradeView } from './views/GradesView';
import { CoursesView } from './views/CoursesView';

export default function App() {
  const { session, loading: authLoading, recovering } = useAuth();
  const { loading: dataLoading, terms } = useSemester();

  // Keeps the theme following the OS for as long as the app is open, not just
  // while the settings modal happens to be mounted.
  useTheme();

  // The gate: load session → set a new password (if we arrived from a reset
  // email) → sign in → load data → create a first term → the app.
  if (authLoading) return <Splash />;
  if (recovering && session) return <ResetPassword />;
  if (!session) return <SignIn />;
  if (dataLoading) return <Splash />;
  if (!terms.length) return <Onboarding />;
  return <Shell />;
}

function Shell() {
  const [route, navigate] = useHashRoute('today');
  const phone = useIsPhone();
  const { courses, error } = useSemester();

  // One slot: only ever one dialog open, and opening another replaces it.
  const [modal, setModal] = useState(null);
  const close = () => setModal(null);

  const [section, detail] = route.split('/');

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
          view={route}
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
          />
        )}

        {section === 'schedule' && (
          <ScheduleView onAddCourse={() => setModal({ kind: 'course' })} />
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
            />
          ))}

        {section === 'courses' && (
          <CoursesView
            onAddCourse={() => setModal({ kind: 'course' })}
            onEditCourse={(course) => setModal({ kind: 'course', course })}
            onManageTerms={() => setModal({ kind: 'settings', startOn: 'terms' })}
          />
        )}
      </main>

      {phone && <MobileNav view={route} setView={navigate} onAdd={add} />}

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
