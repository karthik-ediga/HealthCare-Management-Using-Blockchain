import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownLeft, ArrowUpRight, BadgeCheck, CalendarDays,
  Check, ChevronDown, CircleAlert, Clock3, Eye, FileLock2,
  FilePlus2, FileText, HeartPulse, HelpCircle, LayoutDashboard, Link2,
  LockKeyhole, LogOut, Menu, Plus, RefreshCw, Search, ShieldAlert,
  ShieldCheck, Stethoscope, UploadCloud, Users, X, XCircle, KeyRound, UserCheck
} from "lucide-react";

// Record category definitions
export const RECORD_TYPES = [
  { id: 0, label: "Medical History", class: "cat-history" },
  { id: 1, label: "Lab Report", class: "cat-lab" },
  { id: 2, label: "Prescription", class: "cat-rx" },
  { id: 3, label: "Consultation Note", class: "cat-consult" },
  { id: 4, label: "Payment Log", class: "cat-payment" }
];

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "records", label: "Medical records", icon: FileLock2 },
  { id: "access", label: "Access control", icon: ShieldCheck },
  { id: "appointments", label: "Appointments", icon: CalendarDays }
];

const appointmentLabels = ["Awaiting response", "Confirmed", "Completed", "Cancelled"];
const DEFAULT_ACCESS_POLICY_SECONDS = 30 * 24 * 60 * 60;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3001" : "");
let apiSessionToken = "";

function readableError(error) {
  return error?.message || "The request could not be completed.";
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(apiSessionToken ? { Authorization: `Bearer ${apiSessionToken}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Healthcare API request failed.");
  return data;
}

// Compute real cryptographic SHA-256 in browser
async function computeSha256(data) {
  const enc = new TextEncoder();
  const buffer = typeof data === "string" ? enc.encode(data) : data;
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function App() {
  const [activeView, setActiveView] = useState("overview");
  const [loginUser, setLoginUser] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [roles, setRoles] = useState({ admin: false, doctor: false, patient: true });

  // Database-backed state
  const [records, setRecords] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);
  const [authorizedDoctors, setAuthorizedDoctors] = useState([]);
  const [accessLogs, setAccessLogs] = useState([]);
  const [doctorDirectory, setDoctorDirectory] = useState([]);
  const [patientDirectory, setPatientDirectory] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);

  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Modal inspection state
  const [activeModalRecord, setActiveModalRecord] = useState(null);

  const loadDatabaseDashboard = useCallback(async (user) => {
    setLoading(true);
    try {
      const dashboard = await apiRequest("/api/dashboard");
      setRecords(dashboard.records || []);
      setAppointments((dashboard.appointments || []).map((item) => ({
        ...item,
        fee: Number(item.fee)
      })));
      setAccessRequests(dashboard.accessRequests || []);
      setAccessLogs(dashboard.accessLogs || []);
      setAuthorizedDoctors([...new Set((dashboard.accessLogs || []).filter(item => item.granted).map((item) => item.doctorId))]);
      setDoctorDirectory(dashboard.doctors || []);
      setPatientDirectory(dashboard.patients || []);
      setAdminUsers(dashboard.users || []);
      return dashboard;
    } finally {
      setLoading(false);
    }
  }, []);

  const notify = useCallback((kind, message) => {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const handleLogin = async (email, password, selectedRole) => {
    setLoginError("");

    try {
      const { user, token } = await apiRequest("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          role: selectedRole
        })
      });
      apiSessionToken = token;
      await loadDatabaseDashboard(user);
      setLoginUser(user);
      const isAdm = user.role === "administrator";
      const isDoc = user.role === "doctor";
      const isPat = user.role === "patient";
      setRoles({
        admin: isAdm,
        doctor: isDoc,
        patient: isPat
      });
      setActiveView(isAdm ? "admin" : "overview");
    } catch (error) {
      apiSessionToken = "";
      setLoginError(error.message || "Invalid email, password or role selection.");
    }
  };

  const handleSignOut = () => {
    apiSessionToken = "";
    setLoginUser(null);
    setLoginError("");
    setActiveView("overview");
    notify("success", "Signed out successfully.");
  };

  useEffect(() => {
    if (loginUser) {
      setRoles({
        admin: loginUser.role === "administrator",
        doctor: loginUser.role === "doctor",
        patient: loginUser.role === "patient"
      });
    }
  }, [loginUser]);

  // Database action handler
  const runTransaction = async (_unusedAction, successMessage, databaseAction) => {
    setPending(true);
    try {
      await databaseAction();
      notify("success", successMessage);
      return true;
    } catch (error) {
      notify("error", readableError(error));
      return false;
    } finally {
      setPending(false);
    }
  };

  const roleName = roles.admin
    ? "Administrator"
    : roles.doctor
    ? "Clinician"
    : "Patient";

  const displayNavigation = useMemo(() => {
    if (roles.admin) {
      return [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        { id: "admin", label: "Administration", icon: Users },
        { id: "access", label: "Access Control", icon: ShieldCheck },
        { id: "records", label: "Medical records", icon: FileLock2 },
        { id: "appointments", label: "Appointments", icon: CalendarDays }
      ];
    }
    return navigation;
  }, [roles.admin]);

  const upcomingAppointments = appointments.filter((item) => Number(item.status) < 2);

  // CRITICAL FIX: Only patients have actionable inbound consent requests waiting for their approval!
  // Neither Doctors nor Administrators see an improper "1" badge in their sidebar.
  const patientPendingRequests = useMemo(() => {
    if (!roles.patient || !loginUser) return [];
    return accessRequests.filter(
      (r) => Number(r.patientId) === Number(loginUser.id) && Number(r.status) === 0
    );
  }, [roles.patient, loginUser, accessRequests]);

  const selectView = (view) => {
    setActiveView(view);
    setMobileNavOpen(false);
  };

  if (!loginUser) {
    return <LoginScreen onLogin={handleLogin} error={loginError} />;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <a className="brand" href="#overview" onClick={(e) => { e.preventDefault(); selectView("overview"); }}>
          <span className="brand-mark"><HeartPulse size={21} strokeWidth={2.2} /></span>
          <span className="brand-name">medledger<span>.</span><small>CARE, WITH CONSENT</small></span>
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={(event) => { event.preventDefault(); setMobileNavOpen(false); }}
          >
            <X size={18} />
          </button>
        </a>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {displayNavigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-link ${activeView === id ? "active" : ""}`}
              onClick={() => selectView(id)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {/* Sidebar count only displays for patients who have actionable pending requests */}
              {id === "access" && roles.patient && patientPendingRequests.length > 0 && (
                <span className="nav-count">{patientPendingRequests.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-note">
            <LockKeyhole size={16} />
            <div>
              <strong>Patient-First Access</strong>
              <span>Consent managed by patients</span>
            </div>
          </div>
        </div>
      </aside>

      {mobileNavOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{displayNavigation.find((item) => item.id === activeView)?.label || "Overview"}</strong>
          </div>
          <div className="topbar-actions">
            <span className="role-pill">
              <span className="role-indicator" />
              {`${roleName}: ${loginUser.name}`}
            </span>
            <button className="text-action" onClick={handleSignOut}>Sign out <LogOut size={14} /></button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">HEALTHCARE PORTAL</div>
              <h1>{headingFor(activeView, roles)}</h1>
              <p>{subtitleFor(activeView, roles)}</p>
            </div>
            <button
              className="refresh-button"
              onClick={() => loadDatabaseDashboard(loginUser).catch((error) => notify("error", error.message))}
              disabled={loading}
              aria-label="Refresh data"
              title="Refresh data"
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>

          {activeView === "overview" && (
            <Overview
              userId={loginUser?.id}
              roles={roles}
              records={records}
              appointments={upcomingAppointments}
              authorizedDoctors={authorizedDoctors}
              accessRequests={accessRequests}
              selectView={selectView}
            />
          )}

          {activeView === "records" && (
            <RecordsView
              userId={loginUser?.id}
              records={records}
              roles={roles}
              pending={pending}
              runTransaction={runTransaction}
              setRecords={setRecords}
              onInspectRecord={(rec) => setActiveModalRecord(rec)}
            />
          )}

          {activeView === "access" && (
            <AccessView
              userId={loginUser?.id}
              roles={roles}
              pending={pending}
              runTransaction={runTransaction}
              notify={notify}
              accessRequests={accessRequests}
              setAccessRequests={setAccessRequests}
              authorizedDoctors={authorizedDoctors}
              setAuthorizedDoctors={setAuthorizedDoctors}
              accessLogs={accessLogs}
              doctors={doctorDirectory}
              patients={patientDirectory}
              records={records}
            />
          )}

          {activeView === "appointments" && (
            <AppointmentsView
              userId={loginUser?.id}
              userName={loginUser?.name}
              doctors={doctorDirectory}
              patients={patientDirectory}
              roles={roles}
              appointments={appointments}
              pending={pending}
              runTransaction={runTransaction}
              setAppointments={setAppointments}
            />
          )}

          {activeView === "admin" && roles.admin && (
            <AdminView
              users={adminUsers}
              accessRequests={accessRequests}
              records={records}
              appointments={appointments}
            />
          )}

          {activeView === "admin" && !roles.admin && <AccessDenied />}

          <footer className="page-footer">
            <span>MedLedger Decentralized Healthcare Portal</span>
          </footer>
        </div>
      </main>

      {/* Record Inspection Modal */}
      {activeModalRecord && (
        <div className="modal-overlay" onClick={() => setActiveModalRecord(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Medical Record Details</h3>
              <button
                className="icon-button"
                onClick={() => setActiveModalRecord(null)}
                style={{ border: 0, padding: 0 }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: "12px" }}>
                <span className={`category-badge ${RECORD_TYPES[activeModalRecord.recordType]?.class || "cat-history"}`}>
                  {activeModalRecord.category || RECORD_TYPES[activeModalRecord.recordType]?.label || "Medical Record"}
                </span>
                <h4 style={{ margin: "8px 0 4px", fontSize: "16px", color: "#1d382f" }}>
                  {activeModalRecord.title}
                </h4>
                <p style={{ margin: 0, fontSize: "13px", color: "#546e63" }}>
                  {activeModalRecord.description || "No clinical narrative attached."}
                </p>
              </div>

              <div style={{ display: "grid", gap: "8px", background: "#f8fbf9", padding: "12px", borderRadius: "6px" }}>
                <div style={{ fontSize: "11px", color: "#50695f" }}>
                  <strong>Added:</strong> {new Date(Number(activeModalRecord.createdAt) * 1000).toLocaleString()}
                </div>
                {activeModalRecord.digest && (
                  <div style={{ fontSize: "11px", color: "#50695f", wordBreak: "break-all" }}>
                    <strong>Integrity Digest:</strong> <code>{activeModalRecord.digest}</code>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                <button className="primary-button" onClick={() => setActiveModalRecord(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.kind}`} role="status">
          <span className="toast-icon">
            {toast.kind === "error" ? <XCircle size={17} /> : <Check size={17} />}
          </span>
          {toast.message}
          <button aria-label="Dismiss" onClick={() => setToast(null)}><X size={15} /></button>
        </div>
      )}

      {pending && (
        <div className="transaction-bar">
          <span className="transaction-spinner" />
          Saving your changes...
        </div>
      )}
    </div>
  );
}

// Preset verified credentials for seamless role switching and zero-error admin login
const DEMO_ACCOUNTS = {
  patient: {
    role: "patient",
    email: "emma.patient@medledger.local",
    password: "patient123",
    label: "Patient",
    name: "Emma Johnson"
  },
  doctor: {
    role: "doctor",
    email: "hannah.doctor@medledger.local",
    password: "doctor123",
    label: "Doctor",
    name: "Dr. Hannah Lee"
  },
  administrator: {
    role: "administrator",
    email: "admin@medledger.local",
    password: "admin123",
    label: "Admin",
    name: "System Admin"
  }
};

function LoginScreen({ onLogin, error }) {
  const [selectedRole, setSelectedRole] = useState("patient");
  const [email, setEmail] = useState(DEMO_ACCOUNTS.patient.email);
  const [password, setPassword] = useState(DEMO_ACCOUNTS.patient.password);

  // When clicking role tab, immediately update role and pre-fill credentials
  const selectRoleTab = (roleKey) => {
    setSelectedRole(roleKey);
    const demo = DEMO_ACCOUNTS[roleKey];
    if (demo) {
      setEmail(demo.email);
      setPassword(demo.password);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onLogin(email, password, selectedRole);
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "linear-gradient(135deg, #edf8f3 0%, #eaf1ff 100%)",
      padding: "24px"
    }}>
      <div style={{
        width: "100%",
        maxWidth: "460px",
        background: "#ffffff",
        borderRadius: "18px",
        boxShadow: "0 18px 40px rgba(28, 55, 46, 0.12)",
        border: "1px solid #dfece5",
        padding: "28px"
      }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{
            width: "52px",
            height: "52px",
            margin: "0 auto 10px",
            borderRadius: "14px",
            background: "#dff6ea",
            display: "grid",
            placeItems: "center",
            fontSize: "24px"
          }}>
            🩺
          </div>
          <h2 style={{ margin: 0, color: "#1d3d32", fontSize: "28px" }}>MedLedger</h2>
          <p style={{ margin: "8px 0 0", color: "#5d7d72", fontSize: "13px" }}>
            Secure Healthcare Access & Consent Portal
          </p>
        </div>

        {/* Role Selector Tabs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginBottom: "18px" }}>
          {[
            { label: "Patient", value: "patient" },
            { label: "Doctor", value: "doctor" },
            { label: "Admin", value: "administrator" }
          ].map((roleOption) => (
            <button
              key={roleOption.value}
              type="button"
              onClick={() => selectRoleTab(roleOption.value)}
              style={{
                border: selectedRole === roleOption.value ? "2px solid #2d7d63" : "1px solid #dfe9e4",
                background: selectedRole === roleOption.value ? "#eaf9f1" : "#f8faf9",
                color: selectedRole === roleOption.value ? "#1d5744" : "#4a6358",
                borderRadius: "10px",
                padding: "10px 8px",
                fontWeight: selectedRole === roleOption.value ? 700 : 600,
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              {roleOption.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "14px" }}>
          <label style={{ display: "grid", gap: "6px", fontSize: "12px", color: "#34554d", fontWeight: 600 }}>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                height: "42px",
                padding: "0 12px",
                borderRadius: "10px",
                border: "1px solid #dfe8e3",
                background: "#fbfdfc",
                fontSize: "14px"
              }}
            />
          </label>

          <label style={{ display: "grid", gap: "6px", fontSize: "12px", color: "#34554d", fontWeight: 600 }}>
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                height: "42px",
                padding: "0 12px",
                borderRadius: "10px",
                border: "1px solid #dfe8e3",
                background: "#fbfdfc",
                fontSize: "14px"
              }}
            />
          </label>

          {error && (
            <div style={{
              background: "#fff1f2",
              color: "#9c2d3d",
              border: "1px solid #f4d5db",
              borderRadius: "10px",
              padding: "10px 12px",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}>
              <CircleAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            style={{
              height: "44px",
              border: 0,
              borderRadius: "10px",
              background: "linear-gradient(135deg, #2a7f63 0%, #1d694d 100%)",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            Sign in as {selectedRole === "administrator" ? "Administrator" : selectedRole === "doctor" ? "Doctor" : "Patient"}
          </button>
        </form>

        {/* Quick Demo Fill Buttons */}
        <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #eef3f0", textAlign: "center" }}>
          <div style={{ fontSize: "11px", color: "#6a867b", marginBottom: "8px", fontWeight: 600 }}>
            QUICK LOGIN DEMO ACCOUNTS
          </div>
          <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
            {Object.entries(DEMO_ACCOUNTS).map(([key, acc]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  selectRoleTab(key);
                  onLogin(acc.email, acc.password, acc.role);
                }}
                style={{
                  padding: "5px 10px",
                  fontSize: "11px",
                  borderRadius: "6px",
                  border: "1px solid #d4e2db",
                  background: "#f3f8f5",
                  color: "#215344",
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                {acc.name} ({acc.label})
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function headingFor(view, roles) {
  if (view === "access" && roles?.admin) return "System Consent & Access Governance";
  return (
    {
      overview: "Your Care Overview",
      records: "Medical Records",
      access: "Patient Access & Consent Management",
      appointments: "Appointments",
      admin: "Network Administration"
    }[view] || "Overview"
  );
}

function subtitleFor(view, roles) {
  if (view === "access" && roles?.admin) return "Audit clinician access permissions and patient consent logs across the hospital network.";
  return (
    {
      overview: "Review health records, manage care permissions, and keep appointments organized.",
      records: "View and manage your medical records and clinical summaries.",
      access: "Patients control which clinicians can view their shared records.",
      appointments: "Schedule visits with clinicians and manage upcoming appointments.",
      admin: "Review registered accounts, role assignments, and governance logs."
    }[view] || "Manage your healthcare data securely."
  );
}

// -------------------------------------------------------------
// VIEW 1: Overview
// -------------------------------------------------------------
function Overview({
  userId,
  roles,
  records,
  appointments,
  authorizedDoctors,
  accessRequests,
  selectView
}) {
  const stats = [
    { label: "RECORD REFERENCES", value: records.length, icon: FileLock2, tone: "mint", link: "records" },
    { label: "SCHEDULED VISITS", value: appointments.length, icon: CalendarDays, tone: "blue", link: "appointments" },
    {
      label: roles.admin ? "ACCESS REQUESTS" : "AUTHORIZED CLINICIANS",
      value: roles.admin ? accessRequests.length : authorizedDoctors.length,
      icon: ShieldCheck,
      tone: "amber",
      link: "access"
    }
  ];

  return (
    <>
      <section className="welcome-band">
        <div className="welcome-copy">
          <span className="welcome-kicker">
            <span /> PATIENT-CENTERED CARE
          </span>
          <h2>Your health, in one place</h2>
          <p>
            Keep your health records, clinician permissions, and appointments organized in one secure portal.
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-ring ring-one" />
          <div className="art-ring ring-two" />
          <div className="art-cross"><span /><span /></div>
          <div className="art-spark">+</div>
        </div>
      </section>

      {/* Interactive Use Case Workflow Card */}
      <section style={{ margin: "16px 0", padding: "16px 20px", background: "#f0f6f3", borderRadius: "8px", border: "1px solid #d4e5dc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <BadgeCheck size={18} color="#216450" />
          <strong style={{ fontSize: "13px", color: "#194738" }}>
            Complete Healthcare Workflow Walkthrough
          </strong>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", fontSize: "11px", color: "#476458" }}>
          <div style={{ background: "white", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e1ebe5" }}>
            <strong>1. Add a record:</strong> Patient enters medical details in Medical Records.
          </div>
          <div style={{ background: "white", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e1ebe5" }}>
            <strong>2. Doctor Requests:</strong> Clinician requests record access with clinical reason in Access Control.
          </div>
          <div style={{ background: "white", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e1ebe5" }}>
            <strong>3. Patient approves:</strong> Patient reviews request in inbound queue and grants consent.
          </div>
          <div style={{ background: "white", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e1ebe5" }}>
            <strong>4. Continue care:</strong> Clinician reviews authorized records and completes appointments.
          </div>
        </div>
      </section>

      <section className="stats-grid" aria-label="Care overview">
        {stats.map(({ label, value, icon: Icon, tone, link }) => (
          <button className="stat-card" key={label} onClick={() => selectView(link)}>
            <span className={`stat-icon ${tone}`}><Icon size={18} /></span>
            <span className="stat-label">{label}</span>
            <strong className="stat-value">{value}</strong>
            <span className="stat-link">View details <ArrowUpRight size={13} /></span>
          </button>
        ))}
      </section>

      <div className="overview-grid">
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">CARE TIMELINE</span>
              <h2>Active care events</h2>
            </div>
            <button className="subtle-action" onClick={() => selectView("appointments")}>
              View all <ArrowUpRight size={14} />
            </button>
          </div>
          {appointments.length ? (
            <div className="activity-list">
              {appointments.slice(0, 4).map((item) => (
                <AppointmentRow key={item.id} item={item} userId={userId} compact />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Activity}
              title="No pending appointments"
              message="Scheduled visits will appear here."
            />
          )}
        </section>

        <section className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">QUICK ACCESS</span>
              <h2>Core features</h2>
            </div>
            <span className="panel-dot" />
          </div>
          <div className="quick-links">
            <button onClick={() => selectView("records")}>
              <span className="quick-icon quick-mint"><FilePlus2 size={17} /></span>
              <span>
                <strong>Medical records</strong>
                <small>Review reports and clinical summaries</small>
              </span>
              <ArrowUpRight size={15} />
            </button>
            <button onClick={() => selectView("access")}>
              <span className="quick-icon quick-blue"><ShieldCheck size={17} /></span>
              <span>
                <strong>Care permissions & requests</strong>
                <small>Approve clinician requests or revoke access</small>
              </span>
              <ArrowUpRight size={15} />
            </button>
            <button onClick={() => selectView("appointments")}>
              <span className="quick-icon quick-amber"><CalendarDays size={17} /></span>
              <span>
                <strong>Book consultation</strong>
                <small>Schedule with a registered clinician</small>
              </span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </section>
      </div>

      {roles.admin && (
        <div className="admin-notice">
          <ShieldCheck size={16} />
          <span>Manage registered accounts in</span>
          <button onClick={() => selectView("admin")}>
            Network Administration <ArrowUpRight size={13} />
          </button>
          <span>.</span>
        </div>
      )}
    </>
  );
}

// -------------------------------------------------------------
// VIEW 2: Medical Records
// -------------------------------------------------------------
function RecordsView({
  userId,
  records,
  roles,
  pending,
  runTransaction,
  setRecords,
  onInspectRecord
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recordType, setRecordType] = useState(1); // Default to Lab Report
  const [uri, setUri] = useState("");
  const [digest, setDigest] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");

  const isPatient = roles.patient;

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));

    const arrayBuffer = await file.arrayBuffer();
    const hash = await computeSha256(new Uint8Array(arrayBuffer));
    setDigest(hash);
    setUri(`record-reference:${hash.slice(2)}`);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!userId) return;
    const recordDigest = digest || await computeSha256(`${title}\n${description}`);
    const recordUri = uri || `record-reference:${Date.now()}`;
    const createdTimestamp = Math.floor(Date.now() / 1000);

    const success = await runTransaction(
      async () => {},
      "Medical record saved to the patient database.",
      async () => {
        const result = await apiRequest("/api/records", {
          method: "POST",
          body: JSON.stringify({
            userId,
            title: title.trim(),
            category: RECORD_TYPES[Number(recordType)].label,
            description: description.trim(),
            encryptedUri: recordUri,
            digest: recordDigest
          })
        });
        const newRecord = {
          id: result.id,
          patientId: Number(userId),
          authorId: Number(userId),
          encryptedUri: recordUri,
          digest: recordDigest,
          recordType: Number(recordType),
          title: title.trim(),
          description: description.trim(),
          createdAt: createdTimestamp
        };
        setRecords([newRecord, ...records]);
      }
    );

    if (success) {
      setTitle("");
      setDescription("");
      setUri("");
      setDigest("");
      setSelectedFile(null);
    }
  };

  const filteredRecords = records.filter((r) => {
    if (activeFilter === "all") return true;
    const typeObj = RECORD_TYPES[Number(r.recordType)] || RECORD_TYPES[0];
    return (r.category || typeObj.label) === activeFilter;
  });

  const recordCategories = [...new Set(records.map((record) => (
    record.category || RECORD_TYPES[Number(record.recordType)]?.label || "Medical History"
  )))];

  return (
    <div className="content-stack">
      <div className="privacy-callout">
        <LockKeyhole size={17} />
        <div>
          <strong>Record storage & privacy</strong>
          <span>Record references are saved securely with cryptographic SHA-256 checksums to verify integrity.</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button
          className={`sandbox-role-btn ${activeFilter === "all" ? "active" : ""}`}
          onClick={() => setActiveFilter("all")}
        >
          All Records ({records.length})
        </button>
        {recordCategories.map((category) => (
          <button
            key={category}
            className={`sandbox-role-btn ${activeFilter === category ? "active" : ""}`}
            onClick={() => setActiveFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">PATIENT RECORDS</span>
            <h2>Record references <span className="heading-count">{filteredRecords.length}</span></h2>
          </div>
          <span className="immutable-tag"><FileText size={13} /> DATABASE RECORDS</span>
        </div>

        {filteredRecords.length ? (
          <div className="record-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>TYPE & TITLE</th>
                  <th>CLINICAL SUMMARY</th>
                  <th>DATE</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => {
                  const typeObj = RECORD_TYPES[record.recordType] || RECORD_TYPES[0];
                  return (
                    <tr key={record.id.toString()}>
                      <td>
                        <span className="record-file-icon"><FileLock2 size={16} /></span>
                        <div style={{ display: "inline-block", verticalAlign: "middle" }}>
                          <span className={`category-badge ${typeObj.class}`}>{record.category || typeObj.label}</span>
                          <div className="record-id" style={{ marginTop: "2px" }}>
                            {record.title || `Record #${record.id.toString()}`}
                          </div>
                        </div>
                      </td>
                      <td>{record.description || "No summary provided."}</td>
                      <td>{new Date(Number(record.createdAt) * 1000).toLocaleDateString()}</td>
                      <td>
                        <button
                          className="subtle-action"
                          onClick={() => onInspectRecord(record)}
                          style={{ padding: "4px 8px" }}
                        >
                          <Eye size={13} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={FileLock2}
            title="No records matching filter"
            message="Medical records added to your account will appear here."
          />
        )}
      </section>

      {/* Form to add a new record */}
      {isPatient && (
        <section className="panel form-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">PATIENT RECORDS</span>
              <h2>Add a medical record</h2>
            </div>
            <span className="form-step">INTEGRITY CHECKED</span>
          </div>

          <form onSubmit={submit} className="form-grid">
            <label className="field">
              Record Category
              <select
                value={recordType}
                onChange={(e) => setRecordType(Number(e.target.value))}
                style={{
                  height: "38px",
                  padding: "0 10px",
                  borderRadius: "4px",
                  border: "1px solid #dfe8e3",
                  background: "#fbfdfc"
                }}
              >
                {RECORD_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              Title
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Annual Wellness Blood Panel"
              />
            </label>

            <label className="field full-width">
              Clinical Narrative / Notes
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Summary, diagnosis, dosages, or key clinical observations..."
                rows={3}
              />
            </label>

            <label className="field full-width">
              Supporting Medical Document (Optional)
              <input
                type="file"
                onChange={handleFileChange}
                style={{ padding: "6px" }}
              />
              <small>File bytes are used to generate a unique cryptographic SHA-256 fingerprint.</small>
            </label>

            <div className="form-footer">
              <span>{digest ? `SHA-256: ${digest.slice(0, 18)}...` : "SHA-256 digest computed automatically."}</span>
              <button className="primary-button" disabled={pending || !title}>
                <Plus size={15} /> Save Record
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 3: Access Control & Doctor-Patient Consent
// -------------------------------------------------------------
function AccessView({
  userId,
  roles,
  pending,
  runTransaction,
  notify,
  accessRequests,
  setAccessRequests,
  authorizedDoctors,
  setAuthorizedDoctors,
  accessLogs,
  doctors,
  patients,
  records
}) {
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [lookupRecords, setLookupRecords] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  const isPatient = roles.patient;
  const selectedPatient = patients.find((patient) => String(patient.id) === selectedPatientId);

  // Patient grants or revokes direct access
  const handleSetAccess = async (doctorId, granted) => {
    const clinician = doctors.find((doctor) => String(doctor.id) === String(doctorId));
    if (!clinician) {
      notify("error", "Select a clinician from the directory.");
      return;
    }
    await runTransaction(
      async () => {},
      granted ? "Clinician access saved for 30 days." : "Clinician access revoked.",
      async () => {
        await apiRequest("/api/access-grants", {
          method: "POST",
          body: JSON.stringify({ userId, doctorId: clinician.id, granted })
        });
        if (granted) {
          if (!authorizedDoctors.some((id) => Number(id) === Number(clinician.id))) {
            setAuthorizedDoctors([...authorizedDoctors, clinician.id]);
          }
        } else {
          setAuthorizedDoctors(authorizedDoctors.filter((id) => Number(id) !== Number(clinician.id)));
        }
      }
    );
  };

  // Patient responds to access request from doctor
  const handleRespondRequest = async (requestId, approve) => {
    await runTransaction(
      async () => {},
      approve ? "Access request approved." : "Access request declined.",
      async () => {
        await apiRequest(`/api/access-requests/${requestId}`, {
          method: "PATCH",
          body: JSON.stringify({ userId, approved: approve })
        });
        setAccessRequests(
          accessRequests.map((req) =>
            req.id === requestId ? { ...req, status: approve ? 1 : 2 } : req
          )
        );
        const reqObj = accessRequests.find((r) => r.id === requestId);
        if (approve && reqObj && !authorizedDoctors.some((id) => Number(id) === Number(reqObj.doctorId))) {
          setAuthorizedDoctors([...authorizedDoctors, reqObj.doctorId]);
        }
      }
    );
  };

  // Doctor sends access request to patient
  const handleDoctorSendRequest = async (event) => {
    event.preventDefault();
    if (!selectedPatient) {
      notify("error", "Select a patient from the directory.");
      return;
    }
    await runTransaction(
      async () => {},
      "Access request sent to patient.",
      async () => {
        const result = await apiRequest("/api/access-requests", {
          method: "POST",
          body: JSON.stringify({
            userId,
            patientId: selectedPatient.id,
            reason: requestReason || "Medical review"
          })
        });
        const newReq = {
          id: result.id,
          doctorId: Number(userId),
          doctorName: doctors.find((doctor) => doctor.id === Number(userId))?.name || "Clinician",
          specialty: doctors.find((doctor) => doctor.id === Number(userId))?.specialty || "",
          patientId: selectedPatient.id,
          reason: requestReason || "Consultation and medical history review",
          status: 0,
          requestedAt: Math.floor(Date.now() / 1000)
        };
        setAccessRequests([newReq, ...accessRequests]);
        setRequestReason("");
      }
    );
  };

  // Doctor looks up patient's records
  const handleLookup = async (event) => {
    event.preventDefault();
    if (!selectedPatient) {
      notify("error", "Select a patient from the directory.");
      return;
    }
    setLookupLoading(true);
    try {
      const patientRecords = records.filter(
        (record) => Number(record.patientId) === Number(selectedPatient.id)
      );
      if (!patientRecords.length) {
        notify("error", "No shared records are available. Request the patient's permission first.");
        setLookupRecords([]);
      } else {
        setLookupRecords(patientRecords);
        notify("success", "Loaded authorized patient records.");
      }
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setLookupLoading(false);
    }
  };

  // For patient: filter inbound pending requests
  const patientPendingRequests = accessRequests.filter(
    (r) => Number(r.patientId) === Number(userId) && Number(r.status) === 0
  );

  return (
    <div className="content-stack">
      <div className="privacy-callout">
        <ShieldCheck size={17} />
        <div>
          <strong>Patient-controlled record access</strong>
          <span>Clinicians can view shared records after a patient approves their request. Patients can revoke access at any time.</span>
        </div>
      </div>

      {/* Patient View: Pending Inbound Access Requests */}
      {isPatient && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">INBOUND CONSENT QUEUE</span>
                <h2>Pending Clinician Requests <span className="heading-count">{patientPendingRequests.length}</span></h2>
              </div>
              <span className="immutable-tag"><LockKeyhole size={13} /> YOU DECIDE</span>
            </div>

            {patientPendingRequests.length ? (
              <div style={{ padding: "8px 0" }}>
                {patientPendingRequests.map((req) => (
                  <div key={req.id} className="request-card">
                    <div className="request-card-info">
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Stethoscope size={15} color="#2b7762" />
                        <strong>{req.doctorName || "Clinician"}</strong>
                        {req.specialty && <span className="category-badge cat-consult">{req.specialty}</span>}
                      </div>
                      <span><strong>Reason:</strong> {req.reason || "Clinical evaluation"}</span>
                      <small style={{ color: "#748f84" }}>
                        Requested {new Date(Number(req.requestedAt) * 1000).toLocaleString()}
                      </small>
                    </div>
                    <div className="request-card-actions">
                      <button
                        className="small-reject"
                        disabled={pending}
                        onClick={() => handleRespondRequest(req.id, false)}
                      >
                        <X size={14} /> Decline
                      </button>
                      <button
                        className="small-accept"
                        disabled={pending}
                        onClick={() => handleRespondRequest(req.id, true)}
                      >
                        <Check size={14} /> Approve Access
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="No pending clinician requests"
                message="When a doctor requests permission to review your health records, the request will appear here for your approval."
              />
            )}
          </section>

          {/* Active Authorized Doctors */}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">AUTHORIZED CLINICIANS</span>
                <h2>Active Permissions <span className="heading-count">{authorizedDoctors.length}</span></h2>
              </div>
              <span className="panel-dot" />
            </div>
            {authorizedDoctors.length ? (
              <div style={{ padding: "10px 18px" }}>
                {authorizedDoctors.map((doctorId) => {
                  const doctor = doctors.find((item) => Number(item.id) === Number(doctorId));
                  if (!doctor) return null;
                  return (
                    <div
                      key={doctorId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 0",
                        borderBottom: "1px solid #edf1ee"
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: "13px", color: "#244439" }}>{doctor.name}</strong>
                        {doctor.specialty && <div style={{ fontSize: "11px", color: "#6a8378" }}>{doctor.specialty}</div>}
                      </div>
                      <button
                        className="small-reject"
                        disabled={pending}
                        onClick={() => handleSetAccess(doctor.id, false)}
                      >
                        <X size={13} /> Revoke Access
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={LockKeyhole}
                title="No active authorizations"
                message="No clinicians currently have permission to view your records."
              />
            )}
          </section>

          {/* Patient permission form */}
          <section className="panel form-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">GRANT RECORD ACCESS</span>
                <h2>Authorize a clinician</h2>
              </div>
            </div>
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); handleSetAccess(selectedDoctorId, true); }}>
              <label className="field">
                Clinician
                <select
                  required
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  disabled={!doctors.length}
                >
                  <option value="" disabled>
                    {doctors.length ? "Select a clinician" : "No clinicians available"}
                  </option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name}{doctor.specialty ? ` - ${doctor.specialty}` : ""}
                    </option>
                  ))}
                </select>
                <small>Select a registered clinician to grant access to your records.</small>
              </label>
              <button className="primary-button" disabled={!userId || pending || !selectedDoctorId}>
                <Check size={14} /> Grant Access
              </button>
            </form>
          </section>
        </>
      )}

      {/* Clinician View: Request Access & Search Patient */}
      {roles.doctor && (
        <>
          <section className="panel form-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">CLINICIAN LOOKUP</span>
                <h2>Search patient records</h2>
              </div>
              <span className="immutable-tag"><Stethoscope size={13} /> CLINICIAN ACCOUNT</span>
            </div>
            <form className="inline-form" onSubmit={handleLookup}>
              <label className="field">
                Patient
                <select
                  required
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  disabled={!patients.length}
                >
                  <option value="" disabled>{patients.length ? "Select a patient" : "No patients available"}</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>{patient.name}</option>
                  ))}
                </select>
              </label>
              <button className="primary-button" disabled={lookupLoading || !selectedPatientId}>
                {lookupLoading ? "Loading records..." : "Load Records"}
                <Search size={14} />
              </button>
            </form>
          </section>

          {/* Form for Doctor to Request Access from Patient */}
          <section className="panel form-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">REQUEST AUTHORIZATION</span>
                <h2>Send access request to patient</h2>
              </div>
            </div>
            <form className="form-grid" onSubmit={handleDoctorSendRequest}>
              <label className="field">
                Patient
                <select
                  required
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  disabled={!patients.length}
                >
                  <option value="" disabled>{patients.length ? "Select a patient" : "No patients available"}</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>{patient.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Clinical Reason for Access
                <input
                  required
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="e.g. Cardiology evaluation and lab monitoring"
                />
              </label>
              <div className="form-footer">
                <span>The request will appear in the patient&apos;s Consent Queue for approval.</span>
                <button className="primary-button" disabled={pending || !selectedPatientId}>
                  <ArrowUpRight size={14} /> Request Medical Access
                </button>
              </div>
            </form>
          </section>

          {lookupRecords.length > 0 && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Shared Patient Records <span className="heading-count">{lookupRecords.length}</span></h2>
              </div>
              <div className="record-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>RECORD</th>
                      <th>SUMMARY</th>
                      <th>DATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lookupRecords.map((r) => (
                      <tr key={r.id.toString()}>
                        <td>
                          <strong>{r.title || `Record #${r.id}`}</strong>
                          <div style={{ fontSize: "11px", color: "#688579" }}>{r.category}</div>
                        </td>
                        <td>{r.description || "No summary provided."}</td>
                        <td>{new Date(Number(r.createdAt) * 1000).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* Administrator View: Network Consent & Access Audit Log */}
      {roles.admin && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">GOVERNANCE AUDIT</span>
                <h2>Network Access Requests <span className="heading-count">{accessRequests.length}</span></h2>
              </div>
              <span className="immutable-tag"><LockKeyhole size={13} /> CONSENT AUDIT</span>
            </div>
            {accessRequests.length ? (
              <div className="record-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>CLINICIAN</th>
                      <th>PATIENT</th>
                      <th>CLINICAL REASON</th>
                      <th>REQUESTED AT</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessRequests.map((req) => (
                      <tr key={req.id}>
                        <td>
                          <strong>{req.doctorName || `Doctor #${req.doctorId}`}</strong>
                          {req.specialty && <div style={{ fontSize: "11px", color: "#6a8578" }}>{req.specialty}</div>}
                        </td>
                        <td>
                          <strong>{req.patientName || `Patient #${req.patientId}`}</strong>
                        </td>
                        <td>{req.reason || "Clinical evaluation"}</td>
                        <td>{new Date(Number(req.requestedAt) * 1000).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</td>
                        <td>
                          <StatusBadge
                            status={req.status === 1 ? "Approved" : req.status === 0 ? "Pending" : "Declined"}
                            tone={req.status === 1 ? "green" : req.status === 0 ? "amber" : "neutral"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="No access requests recorded"
                message="Access requests between clinicians and patients will appear here for audit."
              />
            )}
          </section>

          {accessLogs && accessLogs.length > 0 && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">ACTIVE PERMISSIONS</span>
                  <h2>Granted Direct Access Log <span className="heading-count">{accessLogs.length}</span></h2>
                </div>
              </div>
              <div className="record-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>CLINICIAN</th>
                      <th>PATIENT</th>
                      <th>PURPOSE</th>
                      <th>STATUS</th>
                      <th>EXPIRES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{log.doctorName || `Doctor #${log.doctorId}`}</td>
                        <td>{log.patientName || `Patient #${log.patientId}`}</td>
                        <td>{log.purpose}</td>
                        <td>
                          <StatusBadge
                            status={log.granted ? "Active" : "Revoked"}
                            tone={log.granted ? "green" : "neutral"}
                          />
                        </td>
                        <td>{log.expiresAt ? new Date(Number(log.expiresAt) * 1000).toLocaleDateString() : "No expiry"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {!isPatient && !roles.doctor && !roles.admin && <AccessDenied />}
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 4: Appointments
// -------------------------------------------------------------
function AppointmentsView({
  userId,
  userName,
  roles,
  doctors,
  appointments,
  pending,
  runTransaction,
  setAppointments
}) {
  const [doctorId, setDoctorId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [fee, setFee] = useState("");

  const isPatient = roles.patient;

  useEffect(() => {
    if (!doctorId && doctors.length) {
      setDoctorId(String(doctors[0].id));
      setFee(doctors[0].fee);
    }
  }, [doctorId, doctors]);

  const book = async (event) => {
    event.preventDefault();
    const selectedDoctor = doctors.find((item) => String(item.id) === doctorId);
    if (!selectedDoctor || !startsAt || !fee) return;
    const timestamp = Math.floor(new Date(startsAt).getTime() / 1000);

    const success = await runTransaction(
      async () => {},
      "Appointment saved to the database.",
      async () => {
        const result = await apiRequest("/api/appointments", {
          method: "POST",
          body: JSON.stringify({ userId, doctorId: selectedDoctor.id, startsAt, fee })
        });
        const newApt = {
          id: result.id,
          patientId: Number(userId),
          patientName: userName,
          doctorId: selectedDoctor.id,
          doctorName: selectedDoctor.name,
          startsAt: timestamp,
          fee: Number(fee),
          status: 0
        };
        setAppointments([newApt, ...appointments]);
      }
    );

    if (success) {
      setStartsAt("");
    }
  };

  const appointmentAction = (item, action, label) =>
    runTransaction(
      async () => {},
      label === "Accept"
        ? "Appointment confirmed by clinician."
        : label === "Complete"
        ? "Appointment completed."
        : "Appointment updated.",
      async () => {
        const actionName = action === "respondToAppointment"
          ? label.toLowerCase()
          : action === "cancelAppointment"
          ? "cancel"
          : "complete";
        await apiRequest(`/api/appointments/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ userId, action: actionName })
        });
        let newStatus = item.status;
        if (action === "respondToAppointment") newStatus = label === "Accept" ? 1 : 3;
        if (action === "cancelAppointment") newStatus = 3;
        if (action === "completeAppointment") newStatus = 2;
        setAppointments(
          appointments.map((a) => (a.id === item.id ? { ...a, status: newStatus } : a))
        );
      }
    );

  return (
    <div className="content-stack">
      {/* Registered clinicians */}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">CLINICIAN DIRECTORY</span>
            <h2>Choose a specialist</h2>
          </div>
          <span className="escrow-tag"><ShieldCheck size={13} /> REGISTERED CLINICIANS</span>
        </div>
        <div className="doctor-grid">
          {doctors.map((item) => (
            <div className="doctor-card" key={item.id}>
              <div className="doctor-card-header">
                <div className="doctor-avatar"><Stethoscope size={20} /></div>
                <div className="doctor-card-info">
                  <strong>{item.name}</strong>
                  <span>{item.specialty}</span>
                </div>
              </div>
              <div style={{ fontSize: "11px", color: "#698177" }}>
                License: {item.license}
              </div>
              <div className="doctor-card-footer">
                {isPatient && (
                  <button
                    className="secondary-button"
                    style={{ minHeight: "28px", padding: "0 8px", fontSize: "11px" }}
                    onClick={() => {
                      setDoctorId(String(item.id));
                      setFee(item.fee);
                    }}
                  >
                    {doctorId === String(item.id) ? "Selected" : "Select Doctor"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {isPatient && (
        <section className="panel form-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">NEW VISIT</span>
              <h2>Book an appointment</h2>
            </div>
          </div>
          <form className="form-grid" onSubmit={book}>
            <label className="field">
              Selected Clinician
              <select value={doctorId} onChange={(event) => {
                const selected = doctors.find((item) => String(item.id) === event.target.value);
                setDoctorId(event.target.value);
                if (selected) setFee(selected.fee);
              }} required>
                <option value="" disabled>Select a clinician</option>
                {doctors.map((item) => (
                  <option value={item.id} key={item.id}>{item.name} · {item.specialty}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Date and Time
              <input
                required
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              />
            </label>
            <div className="form-footer">
              <span>Your appointment request will be sent to the selected clinician.</span>
              <button className="primary-button" disabled={!userId || !doctorId || pending}>
                <CalendarDays size={15} /> Book Appointment
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">CARE SCHEDULE</span>
            <h2>Appointments <span className="heading-count">{appointments.length}</span></h2>
          </div>
          <span className="panel-dot" />
        </div>
        {appointments.length ? (
          <div className="appointment-list">
            {appointments.map((item) => (
              <AppointmentRow
                key={item.id}
                item={item}
                userId={userId}
                actions={roles.patient || roles.doctor ? appointmentAction : null}
                pending={pending}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No appointments scheduled"
            message="Your scheduled visits will appear here."
          />
        )}
      </section>
    </div>
  );
}

function AppointmentRow({ item, userId, compact = false, actions, pending }) {
  const status = Number(item.status);
  const isPatient = Number(userId) === Number(item.patientId);
  const visitStarted = Date.now() >= Number(item.startsAt) * 1000;
  return (
    <div className={`appointment-row ${compact ? "compact-row" : ""}`}>
      <span className="appointment-calendar"><CalendarDays size={17} /></span>
      <div className="appointment-main">
        <strong>
          {isPatient
            ? `With ${item.doctorName || "your clinician"}`
            : `With ${item.patientName || "patient"}`}
        </strong>
        <span>
          <Clock3 size={13} />
          {new Date(Number(item.startsAt) * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>
      <div className="appointment-meta">
        <StatusBadge
          status={appointmentLabels[status] || "Unknown"}
          tone={status === 1 ? "green" : status === 0 ? "amber" : "neutral"}
        />
      </div>
      {actions && (
        <div className="row-actions">
          {status === 0 && !isPatient && (
            <>
              <button
                className="small-accept"
                disabled={pending}
                onClick={() => actions(item, "respondToAppointment", "Accept")}
              >
                <Check size={14} /> Accept
              </button>
              <button
                className="small-reject"
                disabled={pending}
                onClick={() => actions(item, "respondToAppointment", "Decline")}
              >
                <X size={14} /> Decline
              </button>
            </>
          )}
          {status === 0 && isPatient && (
            <button
              className="small-reject"
              disabled={pending}
              onClick={() => actions(item, "cancelAppointment", "Cancel")}
            >
              Cancel Appointment
            </button>
          )}
          {status === 1 && !isPatient && (
            <button
              className="small-accept"
              disabled={pending || !visitStarted}
              title={visitStarted ? undefined : "Available after the scheduled appointment time"}
              onClick={() => actions(item, "completeAppointment", "Complete")}
            >
              Complete Visit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 5: Network Administration
// -------------------------------------------------------------
function AdminView({ users, accessRequests = [], records = [], appointments = [] }) {
  const [filterRole, setFilterRole] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = (users || []).filter((user) => {
    const matchesRole = filterRole === "all" || user.role === filterRole;
    const matchesSearch = !searchQuery ||
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesRole && matchesSearch;
  });

  const patientCount = (users || []).filter((u) => u.role === "patient").length;
  const doctorCount = (users || []).filter((u) => u.role === "doctor").length;
  const adminCount = (users || []).filter((u) => u.role === "administrator").length;

  return (
    <div className="content-stack">
      <div className="privacy-callout admin-callout">
        <ShieldCheck size={17} />
        <div>
          <strong>Healthcare Network Administration</strong>
          <span>Review registered accounts, role configurations, and system-wide medical governance.</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
        <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #dfe9e4" }}>
          <div style={{ fontSize: "11px", color: "#6a867b", fontWeight: 700 }}>PATIENTS</div>
          <div style={{ fontSize: "24px", color: "#1d3d32", fontWeight: 800, marginTop: "4px" }}>{patientCount}</div>
        </div>
        <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #dfe9e4" }}>
          <div style={{ fontSize: "11px", color: "#6a867b", fontWeight: 700 }}>CLINICIANS</div>
          <div style={{ fontSize: "24px", color: "#1d3d32", fontWeight: 800, marginTop: "4px" }}>{doctorCount}</div>
        </div>
        <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #dfe9e4" }}>
          <div style={{ fontSize: "11px", color: "#6a867b", fontWeight: 700 }}>ADMINISTRATORS</div>
          <div style={{ fontSize: "24px", color: "#1d3d32", fontWeight: 800, marginTop: "4px" }}>{adminCount}</div>
        </div>
        <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #dfe9e4" }}>
          <div style={{ fontSize: "11px", color: "#6a867b", fontWeight: 700 }}>TOTAL ACCOUNTS</div>
          <div style={{ fontSize: "24px", color: "#1d3d32", fontWeight: 800, marginTop: "4px" }}>{users?.length || 0}</div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">REGISTERED ACCOUNTS</span>
            <h2>User Directory <span className="heading-count">{filteredUsers.length}</span></h2>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                height: "32px",
                padding: "0 10px",
                borderRadius: "6px",
                border: "1px solid #dfe8e3",
                fontSize: "12px",
                width: "180px"
              }}
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: "flex", gap: "8px", padding: "12px 18px 0", flexWrap: "wrap" }}>
          {[
            { label: "All Users", value: "all" },
            { label: "Patients", value: "patient" },
            { label: "Clinicians", value: "doctor" },
            { label: "Administrators", value: "administrator" }
          ].map((f) => (
            <button
              key={f.value}
              className={`sandbox-role-btn ${filterRole === f.value ? "active" : ""}`}
              onClick={() => setFilterRole(f.value)}
              style={{ padding: "4px 10px", fontSize: "11px" }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="record-table-wrap" style={{ marginTop: "10px" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>USER ID</th>
                <th>NAME</th>
                <th>EMAIL</th>
                <th>ROLE</th>
                <th>ASSIGNED ROLE BADGE</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td><strong>#{user.id}</strong></td>
                  <td><strong>{user.name}</strong></td>
                  <td>{user.email}</td>
                  <td style={{ textTransform: "capitalize" }}>{user.role}</td>
                  <td>
                    <StatusBadge
                      status={user.role === "administrator" ? "Admin" : user.role === "doctor" ? "Clinician" : "Patient"}
                      tone={user.role === "administrator" ? "amber" : user.role === "doctor" ? "blue" : "green"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// -------------------------------------------------------------
// Common Components
// -------------------------------------------------------------
function StatusBadge({ status, tone }) {
  return (
    <span className={`status-badge status-${tone}`}>
      <span />
      {status}
    </span>
  );
}

function EmptyState({ icon: Icon, title, message }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={20} /></span>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}

function AccessDenied() {
  return (
    <section className="panel">
      <EmptyState
        icon={ShieldAlert}
        title="Unauthorized"
        message="Your account does not have permission to view this section."
      />
    </section>
  );
}

export default App;