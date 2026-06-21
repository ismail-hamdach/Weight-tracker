"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./page.module.css";

interface WeightLog {
  date: string;
  weight: number;
}

interface User {
  name: string;
  email: string;
  picture: string;
}

type AppState = "loading" | "logged_out" | "no_sheet" | "ready";

export default function Home() {
  // Auth & app state
  const [appState, setAppState] = useState<AppState>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string>("");

  // Sheet linking
  const [sheetInput, setSheetInput] = useState<string>("");
  const [sheetLoading, setSheetLoading] = useState<boolean>(false);

  // Weight logging
  const [weight, setWeight] = useState<string>("75.0");
  const [date, setDate] = useState<string>("");
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);

  // UI
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>("");

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Set today's date
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    setDate(`${y}-${m}-${d}`);

    // Check for auth_error param in URL
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) {
      setAuthError(decodeURIComponent(err));
      window.history.replaceState({}, "", "/");
    }

    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
        if (data.spreadsheetId) {
          setSpreadsheetId(data.spreadsheetId);
          setAppState("ready");
          fetchLogs(true);
        } else {
          setAppState("no_sheet");
        }
      } else {
        setAppState("logged_out");
      }
    } catch {
      setAppState("logged_out");
    }
  };

  const fetchLogs = useCallback(async (initial = false) => {
    try {
      if (initial) setLogsLoading(true);
      const res = await fetch("/api/weight");
      const result = await res.json();
      if (res.ok && result.data) {
        setLogs(result.data);
        if (result.data.length > 0) {
          setWeight(result.data[result.data.length - 1].weight.toFixed(1));
        }
      }
    } catch {
      showToast("Failed to load weight history", "error");
    } finally {
      if (initial) setLogsLoading(false);
    }
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const adjustWeight = (amount: number) => {
    const cur = parseFloat(weight) || 75.0;
    setWeight(Math.max(1.0, cur + amount).toFixed(1));
  };

  // ── Sheet Setup Actions ───────────────────────────────────────────────────────

  const handleCreateSheet = async () => {
    setSheetLoading(true);
    try {
      const res = await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_sheet" }),
      });
      const data = await res.json();
      if (res.ok && data.spreadsheetId) {
        setSpreadsheetId(data.spreadsheetId);
        setAppState("ready");
        showToast("✅ WeightTracker sheet created in your Google Drive!", "success");
        fetchLogs(true);
      } else {
        showToast(data.error || "Failed to create sheet", "error");
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setSheetLoading(false);
    }
  };

  const handleLinkSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetInput.trim()) return;
    setSheetLoading(true);
    try {
      const res = await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link_sheet", spreadsheetId: sheetInput }),
      });
      const data = await res.json();
      if (res.ok && data.spreadsheetId) {
        setSpreadsheetId(data.spreadsheetId);
        setAppState("ready");
        setSheetInput("");
        showToast("✅ Sheet linked successfully!", "success");
        fetchLogs(true);
      } else {
        showToast(data.error || "Failed to link sheet. Check the URL/ID.", "error");
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setSheetLoading(false);
    }
  };

  const handleUnlinkSheet = async () => {
    try {
      await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink_sheet" }),
      });
      setSpreadsheetId("");
      setLogs([]);
      setAppState("no_sheet");
      setShowUserMenu(false);
      showToast("Sheet unlinked", "info");
    } catch {
      showToast("Failed to unlink sheet", "error");
    }
  };

  // ── Log Weight Action ─────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedWeight = parseFloat(weight);
    if (isNaN(parsedWeight) || parsedWeight <= 0 || parsedWeight > 500) {
      showToast("Please enter a valid weight (1–500 kg)", "error");
      return;
    }
    if (!date) {
      showToast("Please select a date", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, weight: parsedWeight }),
      });
      const result = await res.json();
      if (res.ok) {
        showToast("✅ Weight logged to your Google Sheet!", "success");
        fetchLogs();
      } else {
        showToast(result.error || "Failed to save", "error");
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Stats Helpers ─────────────────────────────────────────────────────────────

  const getLatestWeight = () =>
    logs.length === 0 ? "–" : logs[logs.length - 1].weight.toFixed(1);

  const getWeightChange = (daysAgo: number): number | null => {
    if (logs.length < 2) return null;
    const latest = logs[logs.length - 1];
    const targetTime = new Date(latest.date).getTime() - daysAgo * 86400000;
    let closest = logs[0];
    let minDiff = Math.abs(new Date(closest.date).getTime() - targetTime);
    for (let i = 1; i < logs.length - 1; i++) {
      const diff = Math.abs(new Date(logs[i].date).getTime() - targetTime);
      if (diff < minDiff) { minDiff = diff; closest = logs[i]; }
    }
    if (Math.abs(new Date(closest.date).getTime() - targetTime) / 86400000 > daysAgo / 2 + 3) return null;
    return latest.weight - closest.weight;
  };

  const renderChangePill = (change: number | null) => {
    if (change === null)
      return <span className={`${styles.changePill} ${styles.changeNeutral}`}>–</span>;
    const isLoss = change < 0;
    return (
      <span className={`${styles.changePill} ${isLoss ? styles.changeLoss : styles.changeGain}`}>
        {isLoss ? "↓" : "↑"} {Math.abs(change).toFixed(1)} kg
      </span>
    );
  };

  // ── SVG Chart ─────────────────────────────────────────────────────────────────

  const renderChart = () => {
    if (logs.length < 2)
      return <div className={styles.chartEmpty}>Add at least 2 entries to see your trend.</div>;
    const chartLogs = logs.slice(-10);
    const weights = chartLogs.map(l => l.weight);
    const minW = Math.min(...weights) - 1.5;
    const maxW = Math.max(...weights) + 1.5;
    const range = maxW - minW;
    const W = 420, H = 160, pL = 36, pR = 12, pT = 14, pB = 24;
    const cW = W - pL - pR, cH = H - pT - pB;
    const pts = chartLogs.map((log, i) => ({
      x: pL + (i / (chartLogs.length - 1)) * cW,
      y: range === 0 ? pT + cH / 2 : pT + cH - ((log.weight - minW) / range) * cH,
      ...log,
    }));
    const lineD = pts.reduce((acc, p, i) => i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, "");
    const fillD = `${lineD} L ${pts[pts.length - 1].x} ${H - pB} L ${pts[0].x} ${H - pB} Z`;
    const gridWts = [maxW - 0.5, minW + range / 2, minW + 0.5];

    return (
      <div className={styles.chartWrapper}>
        <svg className={styles.svgChart} viewBox={`0 0 ${W} ${H}`} width="100%">
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {gridWts.map((wv, i) => {
            const y = range === 0 ? pT + cH / 2 : pT + cH - ((wv - minW) / range) * cH;
            return (
              <g key={i}>
                <line className={styles.chartGridLine} x1={pL} y1={y} x2={W - pR} y2={y} />
                <text className={styles.chartLabel} x={pL - 6} y={y + 4} textAnchor="end">{wv.toFixed(1)}</text>
              </g>
            );
          })}
          <path className={styles.chartFill} d={fillD} />
          <path className={styles.chartLine} d={lineD} />
          {pts.map((p, i) => (
            <g key={i}>
              <circle className={styles.chartDot} cx={p.x} cy={p.y} r={3.5} />
              <text className={styles.chartLabel} x={p.x} y={H - 6} textAnchor="middle">
                {new Date(p.date).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  // ── Format helpers ────────────────────────────────────────────────────────────

  const formatDate = (ds: string) => {
    try { return new Date(ds).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch { return ds; }
  };
  const formatDOW = (ds: string) => {
    try { return new Date(ds).toLocaleDateString(undefined, { weekday: "long" }); }
    catch { return ""; }
  };

  // ── RENDER STATES ─────────────────────────────────────────────────────────────

  // Loading skeleton
  if (appState === "loading") {
    return (
      <div className={styles.centeredScreen}>
        <div className={styles.logoMark}>W</div>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  // Logged-out landing page
  if (appState === "logged_out") {
    return (
      <div className={styles.landingWrapper}>
        {/* Glow orbs */}
        <div className={styles.orb1} />
        <div className={styles.orb2} />

        <div className={styles.landingContent}>
          {/* Logo */}
          <div className={styles.landingLogo}>
            <div className={styles.logoMark}>W</div>
            <h1 className={styles.landingTitle}>WeightTracker</h1>
          </div>

          <p className={styles.landingSubtitle}>
            Your personal weight journal — synced securely to your own Google Sheet.
          </p>

          {/* Features */}
          <div className={styles.featureGrid}>
            {[
              { icon: "📊", label: "Personal Google Sheet", desc: "Your data stays in your Drive" },
              { icon: "📈", label: "Trend Charts", desc: "Visualize your progress" },
              { icon: "🔒", label: "Private & Secure", desc: "OAuth — no passwords stored" },
            ].map(f => (
              <div key={f.label} className={styles.featureCard}>
                <span className={styles.featureIcon}>{f.icon}</span>
                <span className={styles.featureLabel}>{f.label}</span>
                <span className={styles.featureDesc}>{f.desc}</span>
              </div>
            ))}
          </div>

          {/* Auth error */}
          {authError && (
            <div className={styles.authErrorBanner}>
              ⚠️ Sign-in failed: {authError}
            </div>
          )}

          {/* Sign-in button */}
          <a href="/api/auth/login" className={styles.googleSignInBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </a>

          <p className={styles.landingNote}>
            We request Google Sheets access so your data can be stored privately in your own Drive.
          </p>
        </div>
      </div>
    );
  }

  // Logged in — no sheet linked
  if (appState === "no_sheet") {
    return (
      <div className={styles.centeredScreen}>
        <div className={styles.orb1} />
        <div className={styles.orb2} />

        {toast && (
          <div className={`${styles.toast} ${toast.type === "error" ? styles.toastError : toast.type === "info" ? styles.toastInfo : ""}`}>
            {toast.message}
          </div>
        )}

        <div className={styles.setupCard}>
          {/* User greeting */}
          {user && (
            <div className={styles.setupGreeting}>
              {user.picture && <img src={user.picture} alt={user.name} className={styles.avatarLg} />}
              <div>
                <p className={styles.greetingName}>Welcome, {user.name.split(" ")[0]}!</p>
                <p className={styles.greetingEmail}>{user.email}</p>
              </div>
            </div>
          )}

          <h2 className={styles.setupCardTitle}>Connect your Google Sheet</h2>
          <p className={styles.setupCardDesc}>
            Choose how to store your weight data. All data goes directly into your personal Google Drive — we never store it on our servers.
          </p>

          {/* Option 1: Create automatically */}
          <div className={styles.setupOption}>
            <div className={styles.setupOptionHeader}>
              <span className={styles.setupOptionBadge}>Recommended</span>
              <h3 className={styles.setupOptionTitle}>✨ Create a new sheet automatically</h3>
              <p className={styles.setupOptionDesc}>
                We'll instantly create a <strong>WeightTracker</strong> spreadsheet in your Google Drive — ready to use in seconds.
              </p>
            </div>
            <button
              onClick={handleCreateSheet}
              disabled={sheetLoading}
              className={styles.btnPrimary}
            >
              {sheetLoading ? <><div className={styles.spinner} /> Creating…</> : "Create My Sheet"}
            </button>
          </div>

          {/* Divider */}
          <div className={styles.orDivider}><span>or</span></div>

          {/* Option 2: Link existing */}
          <div className={styles.setupOption}>
            <h3 className={styles.setupOptionTitle}>🔗 Link an existing Google Sheet</h3>
            <p className={styles.setupOptionDesc}>
              Paste the URL or Spreadsheet ID of an existing Google Sheet. Make sure the sheet is accessible with your account.
            </p>
            <form onSubmit={handleLinkSheet} className={styles.linkForm}>
              <input
                type="text"
                className={styles.linkInput}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={sheetInput}
                onChange={e => setSheetInput(e.target.value)}
                required
              />
              <button type="submit" disabled={sheetLoading} className={styles.btnSecondary}>
                {sheetLoading ? <div className={styles.spinner} /> : "Link Sheet"}
              </button>
            </form>
          </div>

          <a href="/api/auth/logout" className={styles.signOutLink}>Sign out</a>
        </div>
      </div>
    );
  }

  // ── Main Dashboard (ready) ───────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === "error" ? styles.toastError : toast.type === "info" ? styles.toastInfo : ""}`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>WeightTracker</h1>
        {user && (
          <div className={styles.userArea}>
            <button
              className={styles.avatarBtn}
              onClick={() => setShowUserMenu(v => !v)}
              aria-label="User menu"
            >
              {user.picture
                ? <img src={user.picture} alt={user.name} className={styles.avatarSm} />
                : <div className={styles.avatarFallback}>{user.name[0]}</div>
              }
            </button>

            {showUserMenu && (
              <div className={styles.userMenu}>
                <div className={styles.userMenuHeader}>
                  <p className={styles.userMenuName}>{user.name}</p>
                  <p className={styles.userMenuEmail}>{user.email}</p>
                </div>
                <div className={styles.userMenuDivider} />
                {spreadsheetId && (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.userMenuItem}
                  >
                    📊 Open in Google Sheets
                  </a>
                )}
                <button onClick={handleUnlinkSheet} className={styles.userMenuItem}>
                  🔗 Change Sheet
                </button>
                <div className={styles.userMenuDivider} />
                <a href="/api/auth/logout" className={`${styles.userMenuItem} ${styles.userMenuDanger}`}>
                  Sign Out
                </a>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Quick Log Card */}
      <section className={styles.glassCard}>
        <h2 className={styles.cardTitle}>Log Today's Weight</h2>
        <form onSubmit={handleSubmit} className={styles.logForm}>

          <div className={styles.dialWrapper}>
            <div className={styles.weightDisplay}>
              <input
                className={styles.weightInput}
                type="number"
                step="0.1" min="1" max="500"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                required
              />
              <span className={styles.weightUnit}>kg</span>
            </div>
            <div className={styles.bumpGrid}>
              <button type="button" className={styles.bumpBtn} onClick={() => adjustWeight(-1)}>-1.0</button>
              <button type="button" className={`${styles.bumpBtn} ${styles.bumpBtnBig}`} onClick={() => adjustWeight(-0.1)}>-0.1</button>
              <button type="button" className={`${styles.bumpBtn} ${styles.bumpBtnBig}`} onClick={() => adjustWeight(0.1)}>+0.1</button>
              <button type="button" className={styles.bumpBtn} onClick={() => adjustWeight(1)}>+1.0</button>
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Log Date</label>
            <input
              className={styles.dateInput}
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>

          <button type="submit" className={styles.btnPrimary} disabled={submitting}>
            {submitting ? <><div className={styles.spinner} /> Saving…</> : "Log Weight"}
          </button>
        </form>
      </section>

      {/* Stats */}
      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Latest</span>
          <span className={styles.statValue}>{getLatestWeight()}<span className={styles.statUnit}> kg</span></span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>7D Change</span>
          {renderChangePill(getWeightChange(7))}
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>30D Change</span>
          {renderChangePill(getWeightChange(30))}
        </div>
      </section>

      {/* Chart */}
      <section className={styles.glassCard}>
        <h2 className={styles.cardTitle}>Weight Progress</h2>
        {logsLoading
          ? <div className={styles.chartEmpty}><div className={styles.spinner} /></div>
          : renderChart()
        }
      </section>

      {/* History */}
      <section className={`${styles.glassCard} ${styles.historyCard}`}>
        <h2 className={styles.cardTitle}>Recent Logs</h2>
        {logsLoading ? (
          <div className={styles.chartEmpty}><div className={styles.spinner} /></div>
        ) : logs.length === 0 ? (
          <div className={styles.chartEmpty}>No logs yet. Log your first weight above!</div>
        ) : (
          <div className={styles.historyList}>
            {logs.slice().reverse().map((log, i) => (
              <div key={i} className={styles.historyRow}>
                <div className={styles.historyDateInfo}>
                  <span className={styles.historyDate}>{formatDate(log.date)}</span>
                  <span className={styles.historyDay}>{formatDOW(log.date)}</span>
                </div>
                <div className={styles.historyWeightInfo}>
                  <span className={styles.historyWeight}>{log.weight.toFixed(1)}</span>
                  <span className={styles.historyUnit}>kg</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
