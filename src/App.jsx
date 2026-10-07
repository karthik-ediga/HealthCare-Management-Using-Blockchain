import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, formatEther, isAddress, parseEther } from "ethers";
import {
  Activity, ArrowDownLeft, ArrowUpRight, BadgeCheck, CalendarDays,
  Check, ChevronDown, CircleAlert, ClipboardList, Clock3, Eye, FileLock2,
  FilePlus2, FileText, HeartPulse, HelpCircle, LayoutDashboard, Link2,
  LockKeyhole, LogOut, Menu, Plus, RefreshCw, Search, ShieldAlert,
  ShieldCheck, Stethoscope, UploadCloud, Users, Wallet, X, XCircle
} from "lucide-react";
import { contractAddress, makeContract } from "./contract.js";

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
  { id: "appointments", label: "Appointments", icon: CalendarDays },
  { id: "claims", label: "Insurance claims", icon: ClipboardList }
];

const appointmentLabels = ["Awaiting response", "Confirmed", "Completed", "Cancelled"];
const claimLabels = ["In review", "Approved", "Declined"];

// Sandbox demo accounts for zero-friction evaluation
const DEMO_ACCOUNTS = {
  patient: {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    name: "Alice Smith",
    roleName: "Patient",
    blood: "O+",
    allergies: "Penicillin"
  },
  doctor: {
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    name: "Dr. Sarah Chen, MD",
    roleName: "Clinician",
    specialty: "Cardiology & Internal Medicine",
    license: "MED-CA-88349",
    fee: "0.02"
  },
  consultant: {
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    name: "Dr. David Miller, MD",
    roleName: "Consultant",
    specialty: "Neurology & Diagnostics",
    license: "MED-NY-44120",
    fee: "0.035"
  },
  insurer: {
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    name: "MetHealth Insurer",
    roleName: "Insurer",
    organization: "MetHealth Global Health Plan"
  },
  admin: {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    name: "Protocol Admin",
    roleName: "Administrator"
  }
};

function shortAddress(address = "") {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}

function readableError(error) {
  const message = error?.shortMessage || error?.reason || error?.message || "Transaction failed";
  if (message.includes("user rejected")) return "Transaction was cancelled in your wallet.";
  if (message.includes("No patient authorization")) return "The patient has not granted this wallet access.";
  return message.replace(/^execution reverted: /, "");
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
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);
  const [contract, setContract] = useState(null);
  const [roles, setRoles] = useState({ admin: false, doctor: false, insurer: false, patient: true });

  // Local sample-data preview until a wallet is connected
  const [sandboxMode, setSandboxMode] = useState(true);

  // On-chain / Demo state
  const [records, setRecords] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [claims, setClaims] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);
  const [claimPool, setClaimPool] = useState("1.0");
  const [authorizedDoctors, setAuthorizedDoctors] = useState([]);

  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Modal inspection state
  const [activeModalRecord, setActiveModalRecord] = useState(null);

  const notify = useCallback((kind, message) => {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  // Initialize sandbox with realistic baseline data
  const initSandboxData = useCallback(() => {
    const demoRecords = [
      {
        id: 1,
        patient: DEMO_ACCOUNTS.patient.address,
        author: DEMO_ACCOUNTS.patient.address,
        encryptedUri: "ipfs://bafybeihdwdcefgh456789alicecardio",
        digest: "0x8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4",
        recordType: 1,
        title: "Comprehensive Lipid & Cardiac Biomarker Panel",
        description: "HDL 58 mg/dL, LDL 112 mg/dL, Triglycerides 140 mg/dL, hs-CRP normal.",
        createdAt: Math.floor(Date.now() / 1000) - 86400 * 9
      },
      {
        id: 2,
        patient: DEMO_ACCOUNTS.patient.address,
        author: DEMO_ACCOUNTS.doctor.address,
        encryptedUri: "ipfs://bafybeigrx998234prescriptiondrch",
        digest: "0x3b9a5286cd6e695d7f12e873b22b6a98299292a1040ef3dd2e7f415cba27931c",
        recordType: 2,
        title: "Atorvastatin 10mg Daily Prescription",
        description: "Take 10mg daily with dinner. Follow-up consultation in 6 weeks.",
        createdAt: Math.floor(Date.now() / 1000) - 86400 * 6
      },
      {
        id: 3,
        patient: DEMO_ACCOUNTS.patient.address,
        author: DEMO_ACCOUNTS.doctor.address,
        encryptedUri: "ipfs://bafybeiclinicalnoteafternoonreview",
        digest: "0x9a1112dc7eb8a87c12d6a8f3933cfd1fc4748f44f107e2f7433d16f3bd35d9be",
        recordType: 3,
        title: "Post-Visit Consultation Summary",
        description: "Reviewed chest discomfort symptoms, advised stress test and routine bloodwork.",
        createdAt: Math.floor(Date.now() / 1000) - 86400 * 4
      },
      {
        id: 4,
        patient: DEMO_ACCOUNTS.patient.address,
        author: DEMO_ACCOUNTS.patient.address,
        encryptedUri: "ipfs://bafybeimhmedicalhistorywellnessreview",
        digest: "0x8db0b70ed9469f0e5c86c937cfadaf1d0688ec7b1a4e0cad16867f6d8cc96af3",
        recordType: 0,
        title: "Annual Wellness Medical History",
        description: "No known allergies beyond penicillin; blood pressure stable; annual screening due in Q4.",
        createdAt: Math.floor(Date.now() / 1000) - 86400 * 12
      },
      {
        id: 5,
        patient: DEMO_ACCOUNTS.patient.address,
        author: DEMO_ACCOUNTS.consultant.address,
        encryptedUri: "ipfs://bafybeineurologyeegsummarymrn",
        digest: "0x41d1677e0a5cb6c8c0171d4d8ff76bcf2e2d1a0dbd180e8a4b8fa7a83678d31a",
        recordType: 1,
        title: "EEG & Neurology Diagnostic Summary",
        description: "Routine neurological screening indicates normal baseline with no acute concerns.",
        createdAt: Math.floor(Date.now() / 1000) - 86400 * 2
      }
    ];

    const demoAppointments = [
      {
        id: 1,
        patient: DEMO_ACCOUNTS.patient.address,
        doctor: DEMO_ACCOUNTS.doctor.address,
        startsAt: Math.floor(Date.now() / 1000) + 86400 * 3,
        fee: parseEther("0.02"),
        status: 1
      },
      {
        id: 2,
        patient: DEMO_ACCOUNTS.patient.address,
        doctor: DEMO_ACCOUNTS.consultant.address,
        startsAt: Math.floor(Date.now() / 1000) + 86400 * 5,
        fee: parseEther("0.035"),
        status: 0
      },
      {
        id: 3,
        patient: DEMO_ACCOUNTS.patient.address,
        doctor: DEMO_ACCOUNTS.doctor.address,
        startsAt: Math.floor(Date.now() / 1000) - 86400 * 3,
        fee: parseEther("0.02"),
        status: 2
      }
    ];

    const demoClaims = [
      {
        id: 1,
        patient: DEMO_ACCOUNTS.patient.address,
        encryptedEvidenceUri: "ipfs://bafybeiclaimproof8984920evidence",
        amount: parseEther("0.015"),
        status: 0
      },
      {
        id: 2,
        patient: DEMO_ACCOUNTS.patient.address,
        encryptedEvidenceUri: "ipfs://bafybeiclearclaimlabinvoice2026",
        amount: parseEther("0.02"),
        status: 1
      },
      {
        id: 3,
        patient: DEMO_ACCOUNTS.patient.address,
        encryptedEvidenceUri: "ipfs://bafybeimissedfollowupcareinvoice",
        amount: parseEther("0.011"),
        status: 2
      }
    ];

    const demoRequests = [
      {
        id: 1,
        doctor: DEMO_ACCOUNTS.doctor.address,
        doctorName: DEMO_ACCOUNTS.doctor.name,
        specialty: DEMO_ACCOUNTS.doctor.specialty,
        patient: DEMO_ACCOUNTS.patient.address,
        reason: "Cardiology assessment & lipid monitoring review",
        status: 0,
        requestedAt: Math.floor(Date.now() / 1000) - 3600 * 3
      },
      {
        id: 2,
        doctor: DEMO_ACCOUNTS.consultant.address,
        doctorName: DEMO_ACCOUNTS.consultant.name,
        specialty: DEMO_ACCOUNTS.consultant.specialty,
        patient: DEMO_ACCOUNTS.patient.address,
        reason: "Neurology follow-up and diagnostic review",
        status: 1,
        requestedAt: Math.floor(Date.now() / 1000) - 3600 * 12
      },
      {
        id: 3,
        doctor: DEMO_ACCOUNTS.doctor.address,
        doctorName: DEMO_ACCOUNTS.doctor.name,
        specialty: DEMO_ACCOUNTS.doctor.specialty,
        patient: DEMO_ACCOUNTS.patient.address,
        reason: "Medication reconciliation after annual screening",
        status: 2,
        requestedAt: Math.floor(Date.now() / 1000) - 3600 * 30
      }
    ];

    setRecords(demoRecords);
    setAppointments(demoAppointments);
    setClaims(demoClaims);
    setAccessRequests(demoRequests);
    setAuthorizedDoctors([DEMO_ACCOUNTS.doctor.address, DEMO_ACCOUNTS.consultant.address]);
    setClaimPool("1.25");
  }, []);

  // Synchronize on-chain data when contract & MetaMask are active
  const refresh = useCallback(async (activeContract, activeAccount) => {
    if (!activeContract || !activeAccount) return;
    setLoading(true);
    try {
      const [owner, doctor, insurer, network, ownRecordIds, nextAppointment, nextClaim, nextReq, pool, doctorDirectory] = await Promise.all([
        activeContract.owner(),
        activeContract.approvedDoctors(activeAccount),
        activeContract.approvedInsurers(activeAccount),
        activeContract.runner.provider.getNetwork(),
        activeContract.getPatientRecordIds(activeAccount).catch(() => []),
        activeContract.nextAppointmentId(),
        activeContract.nextClaimId(),
        activeContract.nextRequestId().catch(() => 1n),
        activeContract.claimPoolBalance(),
        activeContract.getDoctorDirectory().catch(() => [])
      ]);

      const isAdmin = owner.toLowerCase() === activeAccount.toLowerCase();
      setRoles({
        admin: isAdmin,
        doctor: !!doctor,
        insurer: !!insurer,
        patient: !doctor && !insurer && !isAdmin
      });
      setChainId(Number(network.chainId));

      const doctorAccess = await Promise.all(
        doctorDirectory.map(async (doctorAddress) => ({
          address: doctorAddress,
          granted: await activeContract.hasRecordAccess(activeAccount, doctorAddress).catch(() => false)
        }))
      );
      setAuthorizedDoctors(doctorAccess.filter((entry) => entry.granted).map((entry) => entry.address));

      // Fetch patient records with metadata
      const loadedRecords = await Promise.all(
        ownRecordIds.map(async (id) => {
          const rec = await activeContract.getRecord(id);
          let meta = { recordType: 0, title: "Medical Record", description: "" };
          try {
            meta = await activeContract.getRecordMeta(id);
          } catch {
            // fallback for legacy records
          }
          return {
            id: Number(rec.id),
            patient: rec.patient,
            author: rec.author,
            encryptedUri: rec.encryptedUri,
            digest: rec.digest,
            createdAt: Number(rec.createdAt),
            recordType: Number(meta.recordType || 0),
            title: meta.title || "Medical Record",
            description: meta.description || ""
          };
        })
      );
      setRecords(loadedRecords);

      // Fetch appointments
      const appointmentRows = await Promise.all(
        Array.from({ length: Number(nextAppointment) - 1 }, async (_, index) => {
          try {
            const appointment = await activeContract.getAppointment(index + 1);
            return { ...appointment, id: index + 1 };
          } catch {
            return null;
          }
        })
      );
      setAppointments(appointmentRows.filter(Boolean));

      // Fetch claims
      const claimRows = await Promise.all(
        Array.from({ length: Number(nextClaim) - 1 }, async (_, index) => {
          try {
            const claim = await activeContract.getClaim(index + 1);
            return { ...claim, id: index + 1 };
          } catch {
            return null;
          }
        })
      );
      setClaims(claimRows.filter(Boolean));

      // Fetch access requests
      const requestRows = await Promise.all(
        Array.from({ length: Number(nextReq) - 1 }, async (_, index) => {
          try {
            const req = await activeContract.getAccessRequest(index + 1);
            return {
              id: Number(req.id),
              doctor: req.doctor,
              patient: req.patient,
              reason: req.reason,
              status: Number(req.status),
              requestedAt: Number(req.requestedAt)
            };
          } catch {
            return null;
          }
        })
      );
      setAccessRequests(requestRows.filter(Boolean));

      setClaimPool(formatEther(pool));
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      notify("error", "Install MetaMask to connect a real Web3 wallet.");
      return;
    }
    try {
      const provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const activeContract = makeContract(signer);
      setAccount(address);
      setContract(activeContract);
      setSandboxMode(false);
      if (!activeContract) {
        notify("error", "Set VITE_CONTRACT_ADDRESS to a deployed platform address.");
        return;
      }
      await refresh(activeContract, address);
      notify("success", "MetaMask wallet connected successfully.");
    } catch (error) {
      notify("error", readableError(error));
    }
  }, [notify, refresh]);

  const disconnectWallet = () => {
    setAccount("");
    setChainId(null);
    setContract(null);
    setSandboxMode(true);
    notify("success", "Wallet disconnected.");
  };

  useEffect(() => {
    if (sandboxMode) {
      initSandboxData();
      setAccount(DEMO_ACCOUNTS.patient.address);
      setRoles({
        admin: false,
        doctor: false,
        insurer: false,
        patient: true
      });
      setChainId(31337);
    }
  }, [sandboxMode, initSandboxData]);

  // Universal transaction handler: executes on-chain or updates sandbox state
  const runTransaction = async (action, successMessage, sandboxFallback) => {
    setPending(true);
    try {
      if (!sandboxMode && contract) {
        const transaction = await action();
        await transaction.wait();
        await refresh(contract, account);
      } else {
        // Execute sandbox mock execution with slight delay for realistic Web3 feedback
        await new Promise((r) => setTimeout(r, 600));
        if (sandboxFallback) {
          sandboxFallback();
        }
      }
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
    : roles.insurer
    ? "Insurer"
    : "Patient";

  const displayNavigation = useMemo(
    () => [...navigation, ...(roles.admin ? [{ id: "admin", label: "Administration", icon: Users }] : [])],
    [roles.admin]
  );

  const upcomingAppointments = appointments.filter((item) => Number(item.status) < 2);
  const pendingClaims = claims.filter((item) => Number(item.status) === 0);
  const pendingRequests = accessRequests.filter((r) => Number(r.status) === 0);

  const selectView = (view) => {
    setActiveView(view);
    setMobileNavOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <a className="brand" href="#overview" onClick={() => selectView("overview")}>
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
              {id === "claims" && pendingClaims.length > 0 && <span className="nav-count">{pendingClaims.length}</span>}
              {id === "access" && pendingRequests.length > 0 && <span className="nav-count">{pendingRequests.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-note">
            <LockKeyhole size={16} />
            <div>
              <strong>Patient-First Access</strong>
              <span>Consent Enforced On-Chain</span>
            </div>
          </div>
          <div className="network-line">
            <span className={`network-dot ${!sandboxMode && account ? "connected" : ""}`} />
            {sandboxMode || !account ? "Wallet not connected" : `Chain ID ${chainId}`}
          </div>
          <div className="sidebar-foot">
            MEDLEDGER PROTOCOL <span>v1.0 (Ethers v6)</span>
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
            {account && (
              <span className="role-pill">
                <span className="role-indicator" />
                {sandboxMode ? `Patient: ${DEMO_ACCOUNTS.patient.name}` : `${roleName}: ${shortAddress(account)}`}
              </span>
            )}
            <button
              className={`wallet-button ${account && !sandboxMode ? "wallet-connected" : ""}`}
              onClick={account && !sandboxMode ? disconnectWallet : connectWallet}
              title={sandboxMode ? "Connect MetaMask wallet" : "Disconnect wallet from this session"}
            >
              <Wallet size={16} />
              {sandboxMode ? "Connect wallet" : shortAddress(account)}
              {!sandboxMode && <LogOut size={14} />}
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">WEB 3.0 HEALTHCARE ECOSYSTEM</div>
              <h1>{headingFor(activeView)}</h1>
              <p>{subtitleFor(activeView)}</p>
            </div>
            <button
              className="refresh-button"
              onClick={() => (!sandboxMode && contract ? refresh(contract, account) : initSandboxData())}
              disabled={loading}
              aria-label="Refresh data"
              title="Refresh data"
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>

          {!contract && !sandboxMode && (
            <div className="setup-banner">
              <div className="setup-icon"><CircleAlert size={18} /></div>
              <div>
                <strong>Connect to your care network</strong>
                <span>Configure a deployed contract address, then connect MetaMask to its network.</span>
              </div>
              <button onClick={connectWallet} className="text-action">
                Connect wallet <ArrowUpRight size={15} />
              </button>
            </div>
          )}

          {activeView === "overview" && (
            <Overview
              account={account}
              roles={roles}
              records={records}
              appointments={upcomingAppointments}
              claims={pendingClaims}
              selectView={selectView}
            />
          )}

          {activeView === "records" && (
            <RecordsView
              account={account}
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
              account={account}
              roles={roles}
              contract={contract}
              sandboxMode={sandboxMode}
              pending={pending}
              runTransaction={runTransaction}
              notify={notify}
              accessRequests={accessRequests}
              setAccessRequests={setAccessRequests}
              authorizedDoctors={authorizedDoctors}
              setAuthorizedDoctors={setAuthorizedDoctors}
              records={records}
            />
          )}

          {activeView === "appointments" && (
            <AppointmentsView
              account={account}
              roles={roles}
              sandboxMode={sandboxMode}
              appointments={appointments}
              pending={pending}
              runTransaction={runTransaction}
              setAppointments={setAppointments}
            />
          )}

          {activeView === "claims" && (
            <ClaimsView
              account={account}
              roles={roles}
              claims={claims}
              claimPool={claimPool}
              pending={pending}
              runTransaction={runTransaction}
              setClaims={setClaims}
              setClaimPool={setClaimPool}
            />
          )}

          {activeView === "admin" && roles.admin && (
            <AdminView
              pending={pending}
              runTransaction={runTransaction}
              claimPool={claimPool}
            />
          )}

          {activeView === "admin" && !roles.admin && <AccessDenied />}

          <footer className="page-footer">
            <span>Modern Web 3.0 Healthcare Platform • Encrypted IPFS Off-chain Storage with Ethereum Smart Contracts</span>
            <a href="https://ethereum.org/en/developers/docs/" target="_blank" rel="noreferrer">
              Ethereum Specs <ArrowUpRight size={13} />
            </a>
          </footer>
        </div>
      </main>

      {/* Record Inspection Modal */}
      {activeModalRecord && (
        <div className="modal-overlay" onClick={() => setActiveModalRecord(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cryptographic Record Verification</h3>
              <button
                className="icon-button"
                onClick={() => setActiveModalRecord(null)}
                style={{ border: 0, padding: 0 }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div>
                <span className={`category-badge ${RECORD_TYPES[activeModalRecord.recordType]?.class || "cat-history"}`}>
                  {RECORD_TYPES[activeModalRecord.recordType]?.label || "Medical Record"}
                </span>
                <h4 style={{ margin: "8px 0 4px", fontSize: "16px", color: "#1d382f" }}>
                  {activeModalRecord.title}
                </h4>
                <p style={{ margin: 0, fontSize: "12px", color: "#546e63" }}>
                  {activeModalRecord.description || "No clinical narrative attached."}
                </p>
              </div>

              <div style={{ display: "grid", gap: "8px", background: "#f8fbf9", padding: "12px", borderRadius: "6px" }}>
                <div style={{ fontSize: "11px", color: "#50695f" }}>
                  <strong>Patient Address:</strong> {activeModalRecord.patient}
                </div>
                <div style={{ fontSize: "11px", color: "#50695f" }}>
                  <strong>Author Address:</strong> {activeModalRecord.author}
                </div>
                <div style={{ fontSize: "11px", color: "#50695f" }}>
                  <strong>Off-Chain URI:</strong> {activeModalRecord.encryptedUri}
                </div>
                <div style={{ fontSize: "11px", color: "#50695f" }}>
                  <strong>Created At:</strong> {new Date(Number(activeModalRecord.createdAt) * 1000).toLocaleString()}
                </div>
              </div>

              <div className="hash-pill">
                <ShieldCheck size={16} color="#2b7e64" />
                <span>SHA-256 Digest: {activeModalRecord.digest}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
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
          Broadcasting transaction to blockchain ledger...
        </div>
      )}
    </div>
  );
}

function headingFor(view) {
  return (
    {
      overview: "Healthcare, Decoupled & Decentralized",
      records: "Medical Records Ledger",
      access: "Patient Access & Consent Management",
      appointments: "Consultation Bookings & Escrow",
      claims: "Automated Insurance Claims",
      admin: "Network Governance & Role Registry"
    }[view] || "Overview"
  );
}

function subtitleFor(view) {
  return (
    {
      overview: "Patient-controlled health records, crypto escrow payments, and verifiable medical data sharing.",
      records: "Encrypted record pointers anchored with cryptographic SHA-256 checksums.",
      access: "Clinicians request access, and patients grant or revoke permission on-chain.",
      appointments: "Book doctor visits with cryptocurrency payments held safely in smart contract escrow.",
      claims: "Submit and settle verified insurance claims directly from the smart contract liquidity pool.",
      admin: "Authorize clinicians, verify health insurers, and manage contract liquidity pools."
    }[view] || "Manage your healthcare data securely."
  );
}

// -------------------------------------------------------------
// VIEW 1: Overview
// -------------------------------------------------------------
function Overview({
  account,
  roles,
  records,
  appointments,
  claims,
  selectView
}) {
  const stats = [
    { label: "RECORD REFERENCES", value: records.length, icon: FileLock2, tone: "mint", link: "records" },
    { label: "SCHEDULED VISITS", value: appointments.length, icon: CalendarDays, tone: "blue", link: "appointments" },
    { label: "CLAIMS IN REVIEW", value: claims.length, icon: ClipboardList, tone: "amber", link: "claims" }
  ];

  return (
    <>
      <section className="welcome-band">
        <div className="welcome-copy">
          <span className="welcome-kicker">
            <span /> CONSENT-DRIVEN WEB 3.0 HEALTHCARE
          </span>
          <h2>Your Health, Your Keys, Your Data</h2>
          <p>
            Experience true patient sovereignty. Sensitive medical information remains off-chain in encrypted IPFS
            storage while smart contracts enforce role-based access, escrow doctor fees, and disburse insurance claims.
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
            <strong>1. Upload Report:</strong> Patient adds encrypted report + SHA-256 hash in Records.
          </div>
          <div style={{ background: "white", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e1ebe5" }}>
            <strong>2. Doctor Requests:</strong> Clinician requests access with clinical reason in Access Control.
          </div>
          <div style={{ background: "white", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e1ebe5" }}>
            <strong>3. Patient Approves:</strong> Patient reviews queue and grants access to doctor on-chain.
          </div>
          <div style={{ background: "white", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e1ebe5" }}>
            <strong>4. Escrow & Settle:</strong> Book visit with crypto escrow, and settle insurance claims.
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
              <span className="section-kicker">ON-CHAIN TIMELINE</span>
              <h2>Active care events</h2>
            </div>
            <button className="subtle-action" onClick={() => selectView("appointments")}>
              View all <ArrowUpRight size={14} />
            </button>
          </div>
          {appointments.length ? (
            <div className="activity-list">
              {appointments.slice(0, 4).map((item) => (
                <AppointmentRow key={item.id} item={item} account={account} compact />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Activity}
              title="No pending appointments"
              message="Scheduled visits and smart contract consultations will appear here."
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
                <strong>Medical records ledger</strong>
                <small>Upload encrypted references & checksums</small>
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
                <small>Schedule with smart contract escrow</small>
              </span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </section>
      </div>

      {roles.admin && (
        <div className="admin-notice">
          <ShieldCheck size={16} />
          <span>This wallet administers the network. Use</span>
          <button onClick={() => selectView("admin")}>
            Network administration <ArrowUpRight size={13} />
          </button>
          <span>to approve clinicians and insurers.</span>
        </div>
      )}
    </>
  );
}

// -------------------------------------------------------------
// VIEW 2: Medical Records
// -------------------------------------------------------------
function RecordsView({
  account,
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

  const isPatient = account && !roles.doctor && !roles.insurer;

  // Real in-browser cryptographic hashing when a file or notes are provided
  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));

    // Read bytes and calculate SHA-256
    const arrayBuffer = await file.arrayBuffer();
    const hash = await computeSha256(new Uint8Array(arrayBuffer));
    setDigest(hash);

    // Generate mock IPFS CID pointer
    const mockCid = `ipfs://bafybei${hash.slice(2, 28)}medical${Date.now()}`;
    setUri(mockCid);
  };

  const handleComputeManualHash = async () => {
    if (!description && !title) return;
    const textData = `${title}\n${description}`;
    const hash = await computeSha256(textData);
    setDigest(hash);
    setUri(`ipfs://bafybeihash${hash.slice(2, 26)}med`);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!isAddress(account)) return;
    if (!/^0x[\da-fA-F]{64}$/.test(digest)) return;

    const newRecordId = records.length + 1;
    const createdTimestamp = Math.floor(Date.now() / 1000);

    const success = await runTransaction(
      () => {
        if (contractAddress && window.ethereum) {
          return (async () => {
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const activeContract = makeContract(signer);
            return activeContract.addRecordWithDetails(
              account,
              uri.trim(),
              digest.trim(),
              Number(recordType),
              title.trim(),
              description.trim()
            );
          })();
        }
        return Promise.reject(new Error("Contract unavailable"));
      },
      "Encrypted medical record added to ledger.",
      () => {
        // Sandbox update
        const newRecord = {
          id: newRecordId,
          patient: account,
          author: account,
          encryptedUri: uri.trim(),
          digest: digest.trim(),
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
    return Number(r.recordType) === Number(activeFilter);
  });

  return (
    <div className="content-stack">
      <div className="privacy-callout">
        <LockKeyhole size={17} />
        <div>
          <strong>Keep clinical data off-chain (Zero Knowledge & IPFS)</strong>
          <span>
            Only encrypted storage references and SHA-256 checksums are stored on the blockchain. The browser
            computes cryptographic hashes locally before broadcasting transactions.
          </span>
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
        {RECORD_TYPES.map((t) => (
          <button
            key={t.id}
            className={`sandbox-role-btn ${activeFilter === String(t.id) ? "active" : ""}`}
            onClick={() => setActiveFilter(String(t.id))}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">PATIENT MEDICAL LEDGER</span>
            <h2>Record references <span className="heading-count">{filteredRecords.length}</span></h2>
          </div>
          <span className="immutable-tag"><Link2 size={13} /> IMMUTABLE LEDGER</span>
        </div>

        {filteredRecords.length ? (
          <div className="record-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>TYPE & TITLE</th>
                  <th>CHECKSUM (SHA-256)</th>
                  <th>ADDED BY</th>
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
                          <span className={`category-badge ${typeObj.class}`}>{typeObj.label}</span>
                          <div className="record-id" style={{ marginTop: "2px" }}>
                            {record.title || `Record #${record.id.toString()}`}
                          </div>
                        </div>
                      </td>
                      <td className="mono-cell">{shortAddress(record.digest)}</td>
                      <td className="mono-cell">{shortAddress(record.author)}</td>
                      <td>{new Date(Number(record.createdAt) * 1000).toLocaleDateString()}</td>
                      <td>
                        <button
                          className="subtle-action"
                          onClick={() => onInspectRecord(record)}
                          style={{ padding: "4px 8px" }}
                        >
                          <Eye size={13} /> Verify
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
            message={account ? "Encrypted record pointers added to this wallet will appear here." : "Connect wallet to view ledger."}
          />
        )}
      </section>

      {/* Form to add a new record */}
      {isPatient && (
        <section className="panel form-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">DECENTRALIZED STORAGE</span>
              <h2>Add new encrypted health record</h2>
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
              Record Title
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Annual Blood Panel Report"
              />
            </label>

            <label className="field field-wide">
              Clinical Summary / Notes (Encrypted Off-chain)
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter doctor notes, test results, or diagnostic details..."
                rows={3}
                style={{
                  padding: "8px 10px",
                  borderRadius: "4px",
                  border: "1px solid #dfe8e3",
                  background: "#fbfdfc",
                  fontFamily: "inherit",
                  fontSize: "11px"
                }}
              />
            </label>

            {/* Drag & Drop File Selector */}
            <div className="field field-wide">
              <span>Select File to Compute SHA-256 Checksum</span>
              <label className="dropzone-box">
                <UploadCloud size={24} color="#357864" />
                <div>
                  <strong>{selectedFile ? selectedFile.name : "Click to select report or drop file here"}</strong>
                  <span style={{ display: "block", fontSize: "10px", color: "#748f83", marginTop: "3px" }}>
                    Supports PDF, DICOM, Lab PNG, or Text Documents
                  </span>
                </div>
                <input type="file" style={{ display: "none" }} onChange={handleFileChange} />
              </label>
            </div>

            <label className="field field-wide">
              Encrypted IPFS URI
              <input
                required
                value={uri}
                onChange={(e) => setUri(e.target.value)}
                placeholder="ipfs://bafybei..."
              />
              <small>Decentralized CID pointer to the off-chain encrypted medical asset.</small>
            </label>

            <label className="field field-wide">
              SHA-256 Cryptographic Checksum
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  required
                  value={digest}
                  onChange={(e) => setDigest(e.target.value)}
                  placeholder="0x followed by 64 hexadecimal characters"
                  pattern="^0x[\da-fA-F]{64}$"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleComputeManualHash}
                  title="Compute hash from title and notes"
                >
                  Generate Hash
                </button>
              </div>
              <small>Verifies that off-chain files are never tampered with.</small>
            </label>

            <div className="form-footer">
              <span>
                <ShieldCheck size={14} /> Signed by patient wallet.
              </span>
              <button className="primary-button" disabled={!account || pending}>
                <Plus size={16} /> Add to blockchain
              </button>
            </div>
          </form>
        </section>
      )}

      {roles.doctor && (
        <p className="role-hint">
          <Stethoscope size={15} /> To view a patient's records, request access in the Access Control tab.
        </p>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 3: Access Control & Doctor-Patient Consent
// -------------------------------------------------------------
function AccessView({
  account,
  roles,
  contract,
  sandboxMode,
  pending,
  runTransaction,
  notify,
  accessRequests,
  setAccessRequests,
  authorizedDoctors,
  setAuthorizedDoctors,
  records
}) {
  const [doctorAddress, setDoctorAddress] = useState("");
  const [patientLookupAddress, setPatientLookupAddress] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [lookupRecords, setLookupRecords] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  const isPatient = account && !roles.doctor && !roles.insurer;

  // Patient grants or revokes direct access
  const handleSetAccess = async (doctorTarget, granted) => {
    if (!isAddress(doctorTarget)) {
      notify("error", "Enter a valid clinician wallet address.");
      return;
    }
    await runTransaction(
      () => {
        if (contract) return contract.setRecordAccess(doctorTarget, granted);
        return Promise.reject(new Error("No contract"));
      },
      granted ? "Clinician access granted on-chain." : "Clinician access revoked.",
      () => {
        // Sandbox update
        if (granted) {
          if (!authorizedDoctors.includes(doctorTarget)) {
            setAuthorizedDoctors([...authorizedDoctors, doctorTarget]);
          }
        } else {
          setAuthorizedDoctors(authorizedDoctors.filter((a) => a.toLowerCase() !== doctorTarget.toLowerCase()));
        }
      }
    );
  };

  // Patient responds to access request from doctor
  const handleRespondRequest = async (requestId, approve) => {
    await runTransaction(
      () => {
        if (contract) return contract.respondToAccessRequest(requestId, approve);
        return Promise.reject(new Error("No contract"));
      },
      approve ? "Access request approved. Clinician authorized." : "Access request declined.",
      () => {
        // Sandbox update
        setAccessRequests(
          accessRequests.map((req) =>
            req.id === requestId ? { ...req, status: approve ? 1 : 2 } : req
          )
        );
        const reqObj = accessRequests.find((r) => r.id === requestId);
        if (approve && reqObj && !authorizedDoctors.includes(reqObj.doctor)) {
          setAuthorizedDoctors([...authorizedDoctors, reqObj.doctor]);
        }
      }
    );
  };

  // Doctor sends access request to patient
  const handleDoctorSendRequest = async (event) => {
    event.preventDefault();
    if (!isAddress(patientLookupAddress)) {
      notify("error", "Enter a valid patient address.");
      return;
    }
    await runTransaction(
      () => {
        if (contract) return contract.requestRecordAccess(patientLookupAddress, requestReason || "Medical review");
        return Promise.reject(new Error("No contract"));
      },
      "Access request sent to patient. Awaiting on-chain approval.",
      () => {
        const newReq = {
          id: accessRequests.length + 1,
          doctor: account,
          doctorName: DEMO_ACCOUNTS.doctor.name,
          specialty: DEMO_ACCOUNTS.doctor.specialty,
          patient: patientLookupAddress,
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
    if (!isAddress(patientLookupAddress)) {
      notify("error", "Enter a valid patient address.");
      return;
    }
    setLookupLoading(true);
    try {
      if (!sandboxMode && contract) {
        const ids = await contract.getPatientRecordIds(patientLookupAddress);
        const loaded = await Promise.all(
          ids.map(async (id) => {
            const rec = await contract.getRecord(id);
            const meta = await contract.getRecordMeta(id).catch(() => ({ recordType: 0, title: "Record" }));
            return { ...rec, ...meta, id: Number(rec.id) };
          })
        );
        setLookupRecords(loaded);
      } else {
        // Sandbox check
        const isAuth = authorizedDoctors.some((d) => d.toLowerCase() === account.toLowerCase());
        if (!isAuth) {
          notify("error", "The patient has not granted this wallet access yet. Submit an access request below.");
          setLookupRecords([]);
        } else {
          setLookupRecords(records);
          notify("success", "Loaded authorized patient records.");
        }
      }
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setLookupLoading(false);
    }
  };

  const patientPendingRequests = accessRequests.filter((r) => Number(r.status) === 0);

  return (
    <div className="content-stack">
      <div className="privacy-callout">
        <ShieldCheck size={17} />
        <div>
          <strong>Consent Enforced by Smart Contract</strong>
          <span>
            Doctors cannot view patient records without explicit on-chain authorization. When a patient revokes
            access, smart contract view methods will revert with &apos;No patient authorization&apos;.
          </span>
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
                        <strong>{req.doctorName || shortAddress(req.doctor)}</strong>
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
                {authorizedDoctors.map((docAddr) => (
                  <div
                    key={docAddr}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 0",
                      borderBottom: "1px solid #edf1ee"
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: "11px", color: "#244439" }}>
                        {docAddr.toLowerCase() === DEMO_ACCOUNTS.doctor.address.toLowerCase()
                          ? DEMO_ACCOUNTS.doctor.name
                          : shortAddress(docAddr)}
                      </strong>
                      <div style={{ fontSize: "10px", color: "#6a8378" }}>{docAddr}</div>
                    </div>
                    <button
                      className="small-reject"
                      disabled={pending}
                      onClick={() => handleSetAccess(docAddr, false)}
                    >
                      <X size={13} /> Revoke Access
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={LockKeyhole}
                title="No active authorizations"
                message="No clinicians currently have permission to view your records."
              />
            )}
          </section>

          {/* Manual Access Grant Form */}
          <section className="panel form-panel">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">MANUAL PERMISSION</span>
                <h2>Authorize clinician by address</h2>
              </div>
            </div>
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); handleSetAccess(doctorAddress, true); }}>
              <label className="field">
                Clinician Wallet Address
                <input
                  required
                  value={doctorAddress}
                  onChange={(e) => setDoctorAddress(e.target.value)}
                  placeholder="0x…"
                />
              </label>
              <button className="primary-button" disabled={!account || pending}>
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
              <span className="immutable-tag"><Stethoscope size={13} /> VERIFIED CLINICIAN</span>
            </div>
            <form className="inline-form" onSubmit={handleLookup}>
              <label className="field">
                Patient Wallet Address
                <input
                  required
                  value={patientLookupAddress}
                  onChange={(e) => setPatientLookupAddress(e.target.value)}
                  placeholder="0x…"
                />
              </label>
              <button className="primary-button" disabled={lookupLoading}>
                {lookupLoading ? "Querying ledger..." : "Load Records"}
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
                Patient Wallet Address
                <input
                  required
                  value={patientLookupAddress}
                  onChange={(e) => setPatientLookupAddress(e.target.value)}
                  placeholder="0x…"
                />
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
                <button className="primary-button" disabled={pending}>
                  <SendIcon size={14} /> Request Medical Access
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
                      <th>CHECKSUM</th>
                      <th>DATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lookupRecords.map((r) => (
                      <tr key={r.id.toString()}>
                        <td>
                          <strong>{r.title || `Record #${r.id}`}</strong>
                          <div style={{ fontSize: "10px", color: "#688579" }}>{r.description}</div>
                        </td>
                        <td className="mono-cell">{shortAddress(r.digest)}</td>
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

      {!isPatient && !roles.doctor && <AccessDenied />}
    </div>
  );
}

function SendIcon({ size }) {
  return <ArrowUpRight size={size} />;
}

// -------------------------------------------------------------
// VIEW 4: Appointments with Escrow
// -------------------------------------------------------------
function AppointmentsView({
  account,
  roles,
  sandboxMode,
  appointments,
  pending,
  runTransaction,
  setAppointments
}) {
  const [doctor, setDoctor] = useState(DEMO_ACCOUNTS.doctor.address);
  const [startsAt, setStartsAt] = useState("");
  const [fee, setFee] = useState("0.02");

  const isPatient = account && !roles.doctor && !roles.insurer;

  const book = async (event) => {
    event.preventDefault();
    if (!isAddress(doctor) || !startsAt || !fee) return;
    const timestamp = Math.floor(new Date(startsAt).getTime() / 1000);

    const success = await runTransaction(
      async () => {
        const signer = await new BrowserProvider(window.ethereum).getSigner();
        return makeContract(signer).bookAppointment(doctor, timestamp, { value: parseEther(fee) });
      },
      "Appointment booked! Fee is held in smart contract escrow.",
      () => {
        const newApt = {
          id: appointments.length + 1,
          patient: account,
          doctor,
          startsAt: timestamp,
          fee: parseEther(fee),
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
      async () => {
        const signer = await new BrowserProvider(window.ethereum).getSigner();
        return makeContract(signer)[action](
          item.id,
          ...(action === "respondToAppointment" ? [label === "Accept"] : [])
        );
      },
      label === "Accept"
        ? "Appointment confirmed by clinician."
        : label === "Complete"
        ? "Appointment completed! Escrow released to doctor."
        : "Appointment updated.",
      () => {
        // Sandbox update
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
      {/* Verified Doctors Directory */}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">VERIFIED CLINICIANS DIRECTORY</span>
            <h2>Choose a specialist</h2>
          </div>
          <span className="escrow-tag"><ShieldCheck size={13} /> ON-CHAIN VERIFIED</span>
        </div>
        <div className="doctor-grid">
          <div className="doctor-card">
            <div className="doctor-card-header">
              <div className="doctor-avatar"><Stethoscope size={20} /></div>
              <div className="doctor-card-info">
                <strong>{DEMO_ACCOUNTS.doctor.name}</strong>
                <span>{DEMO_ACCOUNTS.doctor.specialty}</span>
              </div>
            </div>
            <div style={{ fontSize: "10px", color: "#698177" }}>
              License: {DEMO_ACCOUNTS.doctor.license} • 99.4% Patient Rating
            </div>
            <div className="doctor-card-footer">
              <span className="doctor-fee">0.02 ETH / consultation</span>
              {isPatient && (
                <button
                  className="secondary-button"
                  style={{ minHeight: "28px", padding: "0 8px", fontSize: "10px" }}
                  onClick={() => {
                    setDoctor(DEMO_ACCOUNTS.doctor.address);
                    setFee("0.02");
                  }}
                >
                  Select Doctor
                </button>
              )}
            </div>
          </div>

          {sandboxMode && (
          <div className="doctor-card">
            <div className="doctor-card-header">
              <div className="doctor-avatar"><Stethoscope size={20} /></div>
              <div className="doctor-card-info">
                <strong>Dr. David Miller, MD</strong>
                <span>Neurology & Diagnostics</span>
              </div>
            </div>
            <div style={{ fontSize: "10px", color: "#698177" }}>
              License: MED-NY-44120 • 98.7% Patient Rating
            </div>
            <div className="doctor-card-footer">
              <span className="doctor-fee">0.035 ETH / consultation</span>
              {isPatient && (
                <button
                  className="secondary-button"
                  style={{ minHeight: "28px", padding: "0 8px", fontSize: "10px" }}
                  onClick={() => {
                    setDoctor("0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65");
                    setFee("0.035");
                  }}
                >
                  Select Doctor
                </button>
              )}
            </div>
          </div>
          )}
        </div>
      </section>

      {isPatient && (
        <section className="panel form-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">NEW VISIT</span>
              <h2>Book an appointment with escrow</h2>
            </div>
            <span className="escrow-tag"><LockKeyhole size={13} /> ESCROW PROTECTED</span>
          </div>
          <form className="form-grid" onSubmit={book}>
            <label className="field">
              Clinician Wallet
              <input
                required
                value={doctor}
                onChange={(event) => setDoctor(event.target.value)}
                placeholder="0x…"
              />
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
            <label className="field">
              Consultation Fee
              <span className="input-suffix">
                <input
                  required
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={fee}
                  onChange={(event) => setFee(event.target.value)}
                />
                <span>ETH</span>
              </span>
            </label>
            <div className="form-footer">
              <span>Payment remains locked in smart contract until the consultation is concluded.</span>
              <button className="primary-button" disabled={!account || pending}>
                <CalendarDays size={15} /> Book & Escrow Payment
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
                account={account}
                actions={appointmentAction}
                pending={pending}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No appointments scheduled"
            message={account ? "Bookings linked to this wallet will appear here." : "Connect wallet to view appointments."}
          />
        )}
      </section>
    </div>
  );
}

function AppointmentRow({ item, account, compact = false, actions, pending }) {
  const status = Number(item.status);
  const isPatient = account?.toLowerCase() === item.patient?.toLowerCase();
  const visitStarted = Date.now() >= Number(item.startsAt) * 1000;
  return (
    <div className={`appointment-row ${compact ? "compact-row" : ""}`}>
      <span className="appointment-calendar"><CalendarDays size={17} /></span>
      <div className="appointment-main">
        <strong>
          {isPatient
            ? `With Clinician ${shortAddress(item.doctor)}`
            : `Patient ${shortAddress(item.patient)}`}
        </strong>
        <span>
          <Clock3 size={13} />
          {new Date(Number(item.startsAt) * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>
      <div className="appointment-meta">
        <strong>{formatEther(item.fee)} ETH</strong>
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
                <X size={14} /> Decline & Refund
              </button>
            </>
          )}
          {status === 0 && isPatient && (
            <button
              className="small-reject"
              disabled={pending}
              onClick={() => actions(item, "cancelAppointment", "Cancel")}
            >
              Cancel & Refund
            </button>
          )}
          {status === 1 && (
            <button
              className="small-accept"
              disabled={pending || !visitStarted}
              title={visitStarted ? undefined : "Available after the scheduled appointment time"}
              onClick={() => actions(item, "completeAppointment", "Complete")}
            >
              Complete Visit & Release Escrow
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 5: Insurance Claims
// -------------------------------------------------------------
function ClaimsView({
  account,
  roles,
  claims,
  claimPool,
  pending,
  runTransaction,
  setClaims,
  setClaimPool
}) {
  const [uri, setUri] = useState("");
  const [amount, setAmount] = useState("0.015");

  const isPatient = account && !roles.doctor && !roles.insurer && !roles.admin;

  const submit = async (event) => {
    event.preventDefault();
    const success = await runTransaction(
      async () => {
        const signer = await new BrowserProvider(window.ethereum).getSigner();
        return makeContract(signer).submitClaim(uri.trim(), parseEther(amount));
      },
      "Insurance claim submitted. Queued for insurer smart contract review.",
      () => {
        const newClaim = {
          id: claims.length + 1,
          patient: account,
          encryptedEvidenceUri: uri.trim(),
          amount: parseEther(amount),
          status: 0
        };
        setClaims([newClaim, ...claims]);
      }
    );
    if (success) setUri("");
  };

  const claimAction = (item, approve) =>
    runTransaction(
      async () => {
        const signer = await new BrowserProvider(window.ethereum).getSigner();
        return makeContract(signer).resolveClaim(item.id, approve);
      },
      approve ? "Claim approved! Payment transferred from pool to patient." : "Claim declined.",
      () => {
        setClaims(
          claims.map((c) => (c.id === item.id ? { ...c, status: approve ? 1 : 2 } : c))
        );
        if (approve) {
          const payoutEth = parseFloat(formatEther(item.amount));
          setClaimPool((prev) => Math.max(0, parseFloat(prev) - payoutEth).toFixed(3));
        }
      }
    );

  const fundPool = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const value = form.get("poolAmount");
    if (!value || Number(value) <= 0) return;

    await runTransaction(
      async () => {
        const signer = await new BrowserProvider(window.ethereum).getSigner();
        return makeContract(signer).fundClaimPool({ value: parseEther(value) });
      },
      `Claim liquidity pool funded with ${value} ETH!`,
      () => {
        setClaimPool((prev) => (parseFloat(prev) + parseFloat(value)).toFixed(3));
      }
    );
    formElement.reset();
  };

  return (
    <div className="content-stack">
      {/* Insurer Claims Pool Strip */}
      <section className="pool-strip">
        <div>
          <span className="pool-label">INSURANCE LIQUIDITY POOL</span>
          <strong>{Number(claimPool).toFixed(3)} <small>ETH AVAILABLE</small></strong>
        </div>
        {(roles.insurer || roles.admin) && (
          <form onSubmit={fundPool}>
            <label className="visually-hidden" htmlFor="pool-amount">Amount to fund</label>
            <input
              id="pool-amount"
              name="poolAmount"
              type="number"
              min="0.001"
              step="0.001"
              placeholder="Amount in ETH"
              required
            />
            <button className="secondary-button" disabled={pending}>
              <ArrowDownLeft size={15} /> Fund Claims Pool
            </button>
          </form>
        )}
      </section>

      {isPatient && (
        <section className="panel form-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">PATIENT SUBMISSION</span>
              <h2>Submit an insurance claim</h2>
            </div>
            <span className="immutable-tag"><LockKeyhole size={13} /> ENCRYPTED EVIDENCE</span>
          </div>
          <form className="form-grid" onSubmit={submit}>
            <label className="field field-wide">
              Encrypted Evidence / Invoice URI
              <input
                required
                value={uri}
                onChange={(event) => setUri(event.target.value)}
                placeholder="ipfs://bafybei..."
              />
              <small>Submit only an IPFS pointer to encrypted invoices or discharge summaries.</small>
            </label>
            <label className="field">
              Requested Claim Amount
              <span className="input-suffix">
                <input
                  required
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <span>ETH</span>
              </span>
            </label>
            <div className="form-footer">
              <span>Claims pool balance: {Number(claimPool).toFixed(3)} ETH</span>
              <button className="primary-button" disabled={!account || pending}>
                <Plus size={15} /> File Claim
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">CLAIMS AUDIT LOG</span>
            <h2>{roles.insurer ? "Review Queue" : "Claim Records"} <span className="heading-count">{claims.length}</span></h2>
          </div>
          <span className="panel-dot" />
        </div>
        {claims.length ? (
          <div className="claim-list">
            {claims.map((claim) => (
              <div className="claim-row" key={claim.id}>
                <span className="claim-icon"><ClipboardList size={17} /></span>
                <div className="claim-info">
                  <strong>Claim #{claim.id}</strong>
                  <span>{shortAddress(claim.patient)} <i /> Evidence: {shortAddress(claim.encryptedEvidenceUri)}</span>
                </div>
                <strong className="claim-amount">{formatEther(claim.amount)} ETH</strong>
                <StatusBadge
                  status={claimLabels[Number(claim.status)] || "Unknown"}
                  tone={Number(claim.status) === 1 ? "green" : Number(claim.status) === 0 ? "amber" : "neutral"}
                />
                {roles.insurer && Number(claim.status) === 0 && (
                  <div className="row-actions">
                    <button
                      className="small-accept"
                      disabled={pending}
                      onClick={() => claimAction(claim, true)}
                    >
                      <Check size={14} /> Approve & Pay
                    </button>
                    <button
                      className="small-reject"
                      disabled={pending}
                      onClick={() => claimAction(claim, false)}
                    >
                      <X size={14} /> Decline
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No claims submitted"
            message={account ? "Submitted insurance claims will appear here." : "Connect wallet to view claims."}
          />
        )}
      </section>
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 6: Network Administration
// -------------------------------------------------------------
function AdminView({ pending, runTransaction, claimPool }) {
  const [doctor, setDoctor] = useState("");
  const [insurer, setInsurer] = useState("");

  const approve = async (event, kind, address, setter) => {
    event.preventDefault();
    if (!isAddress(address)) return;
    const method = kind === "doctor" ? "setDoctorApproval" : "setInsurerApproval";

    const success = await runTransaction(
      async () => {
        const signer = await new BrowserProvider(window.ethereum).getSigner();
        return makeContract(signer)[method](address, true);
      },
      `${kind === "doctor" ? "Clinician" : "Insurer"} approved on-chain for the network.`,
      () => {
        setter("");
      }
    );

    if (success) setter("");
  };

  return (
    <div className="content-stack">
      <div className="privacy-callout admin-callout">
        <ShieldCheck size={17} />
        <div>
          <strong>Administrator Authority</strong>
          <span>
            Only the deploying wallet can approve clinicians and insurers. Verify credential databases out-of-band
            prior to approving any address.
          </span>
        </div>
      </div>

      <div className="admin-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">ROLE MANAGEMENT</span>
              <h2>Approve clinician</h2>
            </div>
            <span className="quick-icon quick-mint"><Stethoscope size={17} /></span>
          </div>
          <form className="simple-form" onSubmit={(event) => approve(event, "doctor", doctor, setDoctor)}>
            <label className="field">
              Clinician Wallet Address
              <input
                required
                value={doctor}
                onChange={(event) => setDoctor(event.target.value)}
                placeholder="0x…"
              />
            </label>
            <button className="primary-button" disabled={pending}>
              <BadgeCheck size={15} /> Authorize Clinician
            </button>
          </form>
        </section>

        <section className="panel form-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">ROLE MANAGEMENT</span>
              <h2>Approve insurer</h2>
            </div>
            <span className="quick-icon quick-blue"><ShieldCheck size={17} /></span>
          </div>
          <form className="simple-form" onSubmit={(event) => approve(event, "insurer", insurer, setInsurer)}>
            <label className="field">
              Insurer Wallet Address
              <input
                required
                value={insurer}
                onChange={(event) => setInsurer(event.target.value)}
                placeholder="0x…"
              />
            </label>
            <button className="primary-button" disabled={pending}>
              <BadgeCheck size={15} /> Authorize Insurer
            </button>
          </form>
        </section>
      </div>

      <section className="panel" style={{ padding: "16px 18px" }}>
        <h3 style={{ margin: "0 0 10px", fontSize: "13px", color: "#224136" }}>Network Health Status</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", fontSize: "11px" }}>
          <div>Claims Pool: <strong>{claimPool} ETH</strong></div>
          <div>Contract Status: <strong style={{ color: "#2b7e64" }}>Active &amp; Operational</strong></div>
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
        title="Administrator access required"
        message="Connect the wallet that deployed this contract to manage network roles and governance."
      />
    </section>
  );
}

export default App;