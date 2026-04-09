"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { MobileMenuButton } from "@/components/MobileMenuButton";
import {
  getPreferences,
  updatePreferences,
  updateProfileName,
  changePassword,
  type PreferenceData,
} from "@/actions/settings";
import { useCurrency } from "@/contexts/CurrencyContext";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD"];
const THEMES = ["Dark", "Light", "System"];
const DATE_FORMATS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];

const SECTION_ICONS = {
  profile: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 1 0-16 0" />
    </svg>
  ),
  preferences: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  security: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  notifications: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const { currency: ctxCurrency, setCurrency: ctxSetCurrency } = useCurrency();
  const user = session?.user;
  const initials = (user?.name || user?.email || "U").charAt(0).toUpperCase();

  // Profile state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);

  // Preferences state
  const [prefs, setPrefs] = useState<PreferenceData | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [savingPref, setSavingPref] = useState<string | null>(null);

  // Security state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [pwData, setPwData] = useState({ current: "", new: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    if (user?.name) setDisplayName(user.name);
  }, [user?.name]);

  useEffect(() => {
    getPreferences()
      .then(setPrefs)
      .catch(console.error)
      .finally(() => setPrefsLoading(false));
  }, []);

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    setNameSaving(true);
    setNameError(null);
    try {
      await updateProfileName(editName);
      setDisplayName(editName.trim());
      setIsEditingName(false);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setNameSaving(false);
    }
  };

  const handlePrefChange = async (key: keyof PreferenceData, value: string | boolean) => {
    if (!prefs) return;
    setSavingPref(key);
    const updated = { ...prefs, [key]: value };
    setPrefs(updated); // optimistic
    try {
      const saved = await updatePreferences({ [key]: value });
      setPrefs(saved);
    } catch {
      setPrefs(prefs); // revert on error
    } finally {
      setSavingPref(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (pwData.new !== pwData.confirm) {
      setPwError("New passwords do not match");
      return;
    }
    if (pwData.new.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    setPwSaving(true);
    try {
      await changePassword(pwData.current, pwData.new);
      setPwSuccess(true);
      setPwData({ current: "", new: "", confirm: "" });
      setShowPasswordForm(false);
      setTimeout(() => setPwSuccess(false), 4000);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <>
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 bg-surface-container-low border-b border-line-subtle/10">
        <div className="px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <MobileMenuButton />
            <div className="hidden md:block">
              <h1 className="text-xl font-bold text-on-surface tracking-tight">Settings</h1>
              <p className="text-xs text-on-surface-variant mt-0.5 tracking-wide">
                Manage your account and preferences
              </p>
            </div>
          </div>
          <div className="w-9 h-9 rounded-full bg-primary-gradient flex items-center justify-center text-white font-bold text-sm shadow-primary-glow">
            {initials}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Profile ── */}
        <section className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              {SECTION_ICONS.profile}
            </div>
            <h2 className="text-base font-bold text-on-surface">Profile</h2>
          </div>

          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-primary-gradient flex items-center justify-center text-white font-bold text-2xl shadow-primary-glow shrink-0">
              {(displayName || user?.email || "U").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape") setIsEditingName(false);
                    }}
                    className="input text-sm"
                    autoFocus
                    placeholder="Your display name"
                  />
                  {nameError && (
                    <p className="text-xs text-error">{nameError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveName}
                      disabled={nameSaving || !editName.trim()}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      {nameSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingName(false);
                        setNameError(null);
                      }}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-on-surface text-lg truncate">
                    {displayName || user?.name || "—"}
                  </p>
                  <button
                    onClick={() => {
                      setEditName(displayName || user?.name || "");
                      setIsEditingName(true);
                    }}
                    className="text-xs px-2.5 py-1 rounded-lg bg-primary/12 text-primary hover:bg-primary/20 transition-colors shrink-0"
                  >
                    Edit
                  </button>
                </div>
              )}
              <p className="text-sm text-on-surface-variant mt-1 truncate">
                {user?.email}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-tertiary/12 text-tertiary px-2.5 py-1 rounded-lg">
                  Active
                </span>
                {user?.emailVerified && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/12 text-primary px-2.5 py-1 rounded-lg">
                    Verified
                  </span>
                )}
                {nameSuccess && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-tertiary/12 text-tertiary px-2.5 py-1 rounded-lg">
                    Name Updated
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Preferences ── */}
        <section className="card space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              {SECTION_ICONS.preferences}
            </div>
            <h2 className="text-base font-bold text-on-surface">Preferences</h2>
          </div>

          {prefsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="shimmer h-4 w-24 rounded" />
                  <div className="flex gap-2">
                    {[...Array(4)].map((_, j) => (
                      <div key={j} className="shimmer h-8 w-14 rounded-full" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : prefs ? (
            <>
              {/* Currency */}
              <div>
                <p className="label">Default Currency</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        handlePrefChange("currency", c);
                        ctxSetCurrency(c);
                      }}
                      disabled={savingPref === "currency"}
                      className={ctxCurrency === c ? "type-pill-active" : "type-pill-inactive"}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-on-surface-variant mt-2">
                  Currently selected:{" "}
                  <span className="text-primary font-semibold">{ctxCurrency}</span>
                  {savingPref === "currency" && (
                    <span className="ml-2 text-on-surface-variant/50">Saving…</span>
                  )}
                </p>
              </div>

              {/* Theme */}
              <div>
                <p className="label">Theme</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {THEMES.map((t) => (
                    <button
                      key={t}
                      onClick={() => handlePrefChange("theme", t)}
                      disabled={savingPref === "theme"}
                      className={prefs.theme === t ? "type-pill-active" : "type-pill-inactive"}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-on-surface-variant mt-2">
                  Currently selected:{" "}
                  <span className="text-primary font-semibold">{prefs.theme}</span>
                  {savingPref === "theme" && (
                    <span className="ml-2 text-on-surface-variant/50">Saving…</span>
                  )}
                </p>
              </div>

              {/* Date Format */}
              <div>
                <p className="label">Date Format</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {DATE_FORMATS.map((f) => (
                    <button
                      key={f}
                      onClick={() => handlePrefChange("dateFormat", f)}
                      disabled={savingPref === "dateFormat"}
                      className={prefs.dateFormat === f ? "type-pill-active" : "type-pill-inactive"}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-on-surface-variant mt-2">
                  Currently selected:{" "}
                  <span className="text-primary font-semibold">{prefs.dateFormat}</span>
                  {savingPref === "dateFormat" && (
                    <span className="ml-2 text-on-surface-variant/50">Saving…</span>
                  )}
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-on-surface-variant">Failed to load preferences.</p>
          )}
        </section>

        {/* ── Security ── */}
        <section className="card space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              {SECTION_ICONS.security}
            </div>
            <h2 className="text-base font-bold text-on-surface">Security</h2>
          </div>

          {/* Password */}
          <div className="border-b border-line-subtle/10 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-on-surface">Password</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Change your account password
                </p>
              </div>
              {!showPasswordForm && (
                <button
                  onClick={() => {
                    setShowPasswordForm(true);
                    setPwError(null);
                    setPwData({ current: "", new: "", confirm: "" });
                  }}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  Change
                </button>
              )}
            </div>

            {pwSuccess && (
              <div className="mt-3 p-3 rounded-lg bg-tertiary/10 border border-tertiary/20">
                <p className="text-xs text-tertiary font-medium">Password changed successfully.</p>
              </div>
            )}

            {showPasswordForm && (
              <form onSubmit={handleChangePassword} className="mt-4 space-y-3">
                <div>
                  <label className="label">Current Password</label>
                  <input
                    type="password"
                    value={pwData.current}
                    onChange={(e) => setPwData((p) => ({ ...p, current: e.target.value }))}
                    className="input"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <div>
                  <label className="label">New Password</label>
                  <input
                    type="password"
                    value={pwData.new}
                    onChange={(e) => setPwData((p) => ({ ...p, new: e.target.value }))}
                    className="input"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Minimum 8 characters"
                  />
                </div>
                <div>
                  <label className="label">Confirm New Password</label>
                  <input
                    type="password"
                    value={pwData.confirm}
                    onChange={(e) => setPwData((p) => ({ ...p, confirm: e.target.value }))}
                    className="input"
                    required
                    autoComplete="new-password"
                  />
                </div>
                {pwError && (
                  <div className="p-3 rounded-lg bg-error/10 border border-error/20">
                    <p className="text-xs text-error">{pwError}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={pwSaving}
                    className="btn-primary text-xs px-3 py-1.5"
                  >
                    {pwSaving ? "Updating…" : "Update Password"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setPwError(null);
                    }}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* 2FA */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-on-surface">Two-Factor Authentication</p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Add an extra layer of security
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-error/12 text-error px-2.5 py-1 rounded-lg">
                Off
              </span>
              <button
                disabled
                className="btn-secondary text-xs px-3 py-1.5 opacity-40 cursor-not-allowed"
                title="Coming soon"
              >
                Coming Soon
              </button>
            </div>
          </div>
        </section>

        {/* ── Notifications ── */}
        <section className="card space-y-1">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              {SECTION_ICONS.notifications}
            </div>
            <h2 className="text-base font-bold text-on-surface">Notifications</h2>
          </div>

          {prefsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <div className="space-y-1.5">
                    <div className="shimmer h-4 w-32 rounded" />
                    <div className="shimmer h-3 w-48 rounded" />
                  </div>
                  <div className="shimmer h-6 w-10 rounded-full" />
                </div>
              ))}
            </div>
          ) : prefs ? (
            [
              {
                key: "txAlerts" as const,
                label: "Transaction Alerts",
                desc: "Get notified on every transaction",
              },
              {
                key: "monthlySummary" as const,
                label: "Monthly Summary",
                desc: "Receive a monthly spending report",
              },
              {
                key: "lowBalanceWarning" as const,
                label: "Low Balance Warning",
                desc: "Alert when balance drops below threshold",
              },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between py-3 border-b border-line-subtle/10 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-on-surface">{item.label}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">{item.desc}</p>
                </div>
                <button
                  onClick={() => handlePrefChange(item.key, !prefs[item.key])}
                  disabled={savingPref === item.key}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                    prefs[item.key] ? "bg-primary" : "bg-surface-container-highest"
                  } ${savingPref === item.key ? "opacity-60" : ""}`}
                  role="switch"
                  aria-checked={prefs[item.key]}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      prefs[item.key] ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            ))
          ) : null}
        </section>

      </main>
    </>
  );
}
