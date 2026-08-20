import { useEffect } from 'react';
import { colors, tone, shadows, fonts } from '../theme';

// Shared dialog chrome: dimmed backdrop, card, title row with a close button,
// Escape-to-close. Children are the form body; the footer renders the caller's
// actions right-aligned.
//
// On a phone the card sits at the bottom of the screen rather than the middle —
// a sheet within thumb reach, since the mobile job here is a ten-second capture
// between classes, usually one-handed.
export function ModalShell({ title, onClose, children, footer, phone = false, width = 480 }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: shadows.backdrop,
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: phone ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: phone ? 0 : 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: phone ? '100%' : width,
          maxWidth: '100%',
          maxHeight: phone ? '92vh' : '90vh',
          overflowY: 'auto',
          background: colors.card,
          borderRadius: phone ? '22px 22px 0 0' : 22,
          padding: phone ? '22px 20px calc(24px + env(safe-area-inset-bottom, 0px))' : '28px 30px',
          boxShadow: shadows.modal,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <div style={{ font: `400 24px ${fonts.serif}`, color: colors.ink }}>{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: colors.chipBg,
              color: colors.muted2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 17,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {children}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 24 }}>{footer}</div>
      </div>
    </div>
  );
}

export function Label({ children, hint }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 7,
      }}
    >
      <span style={{ font: `600 12px ${fonts.sans}`, color: colors.muted2 }}>{children}</span>
      {hint && <span style={{ font: `400 11.5px ${fonts.sans}`, color: colors.faint }}>{hint}</span>}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Label hint={hint}>{label}</Label>
      {children}
    </div>
  );
}

export function Chip({ active, onClick, children, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '9px 14px',
        borderRadius: 12,
        font: `600 12.5px ${fonts.sans}`,
        ...(active
          ? { background: colors.accent, color: colors.onAccent }
          : {
              background: colors.inputBg,
              border: `1px solid ${colors.cardBorder}`,
              color: colors.muted2,
              fontWeight: 500,
            }),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export const inputStyle = {
  width: '100%',
  border: `1px solid ${colors.inputBorder}`,
  background: colors.inputBg,
  borderRadius: 12,
  padding: '11px 13px',
  font: `500 14px ${fonts.sans}`,
  color: colors.ink,
  outline: 'none',
  boxSizing: 'border-box',
};

// 16px on phones, because anything smaller makes iOS Safari zoom the whole page
// on focus and then leave you there.
export const phoneInputStyle = { ...inputStyle, fontSize: 16, padding: '13px 13px' };

export function PrimaryButton({ onClick, children, disabled, type = 'button', style }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '11px 22px',
        borderRadius: 22,
        background: colors.accent,
        color: colors.onAccent,
        font: `600 13px ${fonts.sans}`,
        boxShadow: shadows.accent,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'default' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({ onClick, children, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '11px 18px',
        borderRadius: 22,
        font: `600 13px ${fonts.sans}`,
        color: colors.muted2,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// Quiet destructive action, pinned to the left edge of the footer so it's never
// next to the button you actually meant to press.
export function DeleteButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '11px 4px',
        borderRadius: 22,
        font: `600 13px ${fonts.sans}`,
        color: tone.red,
        marginRight: 'auto',
      }}
    >
      {children}
    </button>
  );
}
