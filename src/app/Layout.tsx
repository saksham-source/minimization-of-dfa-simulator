import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { HelpCircle, Menu, Moon, Settings, Sun, Trash2, X } from 'lucide-react';
import { Dialog } from '../components/ui/Dialog';
import { useApp, type MotionPreference, type ThemePreference } from '../store/AppContext';

export function Layout({ children }: { children: React.ReactNode }) {
  const {
    preferences,
    updatePreferences,
    resolvedTheme,
    storageWarning,
    versionNotice,
    dismissNotice,
    clearLocalData,
    toastMessage,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const navItems = [
    { to: '/learn', label: 'Learn' },
    { to: '/simulator', label: 'Simulator' },
    { to: '/practice', label: 'Practice' },
    { to: '/help', label: 'Help' },
  ];

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="app-header">
        <div className="app-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <NavLink to="/" className="brand-link" onClick={() => setMobileMenuOpen(false)}>
              <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <rect width="32" height="32" rx="8" fill="var(--accent-subtle)" />
                <path d="M3 16h5" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
                <path
                  d="M7 13.5L10 16l-3 2.5"
                  stroke="var(--accent)"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="19" cy="16" r="8" stroke="var(--text)" strokeWidth="2" />
                <circle cx="19" cy="16" r="4.5" stroke="var(--accent)" strokeWidth="1.7" />
              </svg>
              <span>DFA Studio</span>
            </NavLink>

            <nav className="nav-links desktop-only" aria-label="Main navigation">
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} className="nav-link">
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon"
              aria-label={`Switch theme (current: ${resolvedTheme})`}
              title={`Theme: ${preferences.theme} (${resolvedTheme})`}
              onClick={() =>
                updatePreferences({
                  theme: resolvedTheme === 'light' ? 'dark' : 'light',
                })
              }
            >
              {resolvedTheme === 'dark' ? (
                <Sun size={17} aria-hidden="true" />
              ) : (
                <Moon size={17} aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon"
              aria-label="Open settings"
              title="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={17} aria-hidden="true" />
            </button>

            <NavLink
              to="/help"
              className="btn btn-ghost btn-sm btn-icon"
              aria-label="Help and glossary"
              title="Help & Glossary"
            >
              <HelpCircle size={17} aria-hidden="true" />
            </NavLink>

            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon mobile-menu-btn"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              {mobileMenuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav className="mobile-nav-drawer" aria-label="Mobile navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className="nav-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {(storageWarning || versionNotice) && (
        <div className="page-container" style={{ paddingBottom: 0 }}>
          {storageWarning && (
            <div className="status-banner warning" role="status" style={{ marginBottom: 8 }}>
              {storageWarning}
            </div>
          )}
          {versionNotice && (
            <div
              className="status-banner info"
              role="status"
              style={{ justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>{versionNotice}</span>
              <button type="button" className="btn btn-sm" onClick={dismissNotice}>
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      <main id="main-content" className="app-main" tabIndex={-1}>
        {children}
      </main>

      {toastMessage && (
        <div className="toast-region" role="status" aria-live="polite">
          <div className="toast-item">{toastMessage}</div>
        </div>
      )}

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Preferences & local data">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label htmlFor="pref-theme" className="field-label">
              Theme
            </label>
            <select
              id="pref-theme"
              className="select-input"
              value={preferences.theme}
              onChange={(e) => updatePreferences({ theme: e.target.value as ThemePreference })}
            >
              <option value="system">Follow system ({resolvedTheme})</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div>
            <label htmlFor="pref-motion" className="field-label">
              Motion &amp; animations
            </label>
            <select
              id="pref-motion"
              className="select-input"
              value={preferences.motion}
              onChange={(e) => updatePreferences({ motion: e.target.value as MotionPreference })}
            >
              <option value="system">Follow system preference</option>
              <option value="reduce">Reduce motion</option>
              <option value="no-preference">Full motion</option>
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={preferences.disable3D}
              onChange={(e) => updatePreferences({ disable3D: e.target.checked })}
            />
            Turn off 3D landing overview (always use 2D SVG)
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={preferences.pauseOnRoundSummaries}
              onChange={(e) => updatePreferences({ pauseOnRoundSummaries: e.target.checked })}
            />
            Pause autoplay at refinement round summaries
          </label>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)' }}>
              Drafts and practice stats are saved only in this browser&apos;s local storage and never sync to a server.
            </p>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                setSettingsOpen(false);
                setConfirmClearOpen(true);
              }}
            >
              <Trash2 size={14} aria-hidden="true" />
              Clear local data
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        title="Clear all local DFA Studio data?"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            This removes your saved draft, preferences, and practice progress from this browser. Other
            sites&apos; data is untouched.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setConfirmClearOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                clearLocalData();
                setConfirmClearOpen(false);
              }}
            >
              Clear local data
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
