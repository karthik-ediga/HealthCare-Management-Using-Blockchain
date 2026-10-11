const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { pool } = require("./dbConnection");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../dist")));

const recordTypes = {
  "Medical History": 0,
  "Lab Report": 1,
  Prescription: 2,
  "Consultation Note": 3,
  "Clinical Note": 3,
  Imaging: 1,
  "Payment Log": 4
};
const appointmentStatuses = { pending: 0, accepted: 1, completed: 2, cancelled: 3 };
const requestStatuses = { pending: 0, approved: 1, rejected: 2 };
const claimStatuses = { pending: 0, approved: 1, paid: 1, rejected: 2 };
const tokenSecret = process.env.JWT_SECRET || "local-demo-secret-change-before-deployment";

function createSessionToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60
  })).toString("base64url");
  const value = `${header}.${payload}`;
  const signature = crypto.createHmac("sha256", tokenSecret).update(value).digest("base64url");
  return `${value}.${signature}`;
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "Sign in to continue." });
  try {
    const [header, payload, signature] = token.split(".");
    const expected = crypto.createHmac("sha256", tokenSecret).update(`${header}.${payload}`).digest();
    const provided = Buffer.from(signature, "base64url");
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
      return res.status(401).json({ message: "Invalid session." });
    }
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.sub || session.exp <= Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ message: "Session expired. Sign in again." });
    }
    req.auth = { userId: Number(session.sub), role: session.role };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid session." });
  }
}

async function findActor(userId) {
  const [rows] = await pool.execute(
    "SELECT id, name, email, role, wallet FROM users WHERE id = ?",
    [Number(userId)]
  );
  return rows[0] || null;
}

function respondWithError(res, error) {
  console.error(error);
  return res.status(500).json({ message: "Database request failed." });
}

async function readRecords(whereSql, params) {
  const [rows] = await pool.execute(
    `SELECT r.*, patient.wallet AS patient_wallet, author.wallet AS author_wallet
     FROM records r
     JOIN users patient ON patient.id = r.patient_id
     JOIN users author ON author.id = r.author_id
     ${whereSql}
     ORDER BY r.created_at DESC, r.id DESC`,
    params
  );
  return rows.map((row) => ({
    id: Number(row.id),
    patient: row.patient_wallet,
    author: row.author_wallet,
    category: row.category,
    encryptedUri: row.encrypted_uri,
    digest: row.digest,
    recordType: recordTypes[row.category] ?? 0,
    title: row.title,
    description: row.description || "",
    createdAt: Math.floor(new Date(row.created_at).getTime() / 1000)
  }));
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Healthcare API is running." });
});

app.post("/api/login", async (req, res) => {
  const { email, password, role } = req.body || {};

  if (!email || !password || !role) {
    return res.status(400).json({ message: "Email, password and role are required." });
  }

  let connection;

  try {
    connection = await pool.getConnection();

    const [rows] = await connection.execute(
      "SELECT id, name, email, role, wallet FROM users WHERE email = ? AND password = ? AND role = ?",
      [String(email).trim(), String(password), String(role).trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Invalid credentials for the selected role." });
    }

    const user = rows[0];
    return res.status(200).json({ user, token: createSessionToken(user) });
  } catch (error) {
    return respondWithError(res, error);
  } finally {
    if (connection) connection.release();
  }
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  try {
    const actor = await findActor(req.auth.userId);
    if (!actor) return res.status(404).json({ message: "Account not found." });

    let recordWhere = "";
    let recordParams = [];
    if (actor.role === "patient") {
      recordWhere = "WHERE r.patient_id = ?";
      recordParams = [actor.id];
    } else if (actor.role === "doctor") {
      recordWhere = `WHERE EXISTS (
        SELECT 1 FROM access_logs access
        WHERE access.patient_id = r.patient_id AND access.doctor_id = ?
          AND access.granted = TRUE
          AND (access.expires_at IS NULL OR access.expires_at > NOW())
      )`;
      recordParams = [actor.id];
    }
    const records = await readRecords(recordWhere, recordParams);

    const appointmentWhere = actor.role === "patient"
      ? "WHERE a.patient_id = ?"
      : actor.role === "doctor"
      ? "WHERE a.doctor_id = ?"
      : "";
    const appointmentParams = actor.role === "patient" || actor.role === "doctor" ? [actor.id] : [];
    const [appointmentRows] = await pool.execute(
      `SELECT a.*, patient.wallet AS patient_wallet, doctor.wallet AS doctor_wallet
       FROM appointments a
       JOIN users patient ON patient.id = a.patient_id
       JOIN users doctor ON doctor.id = a.doctor_id
       ${appointmentWhere} ORDER BY a.starts_at DESC`,
      appointmentParams
    );

    const claimWhere = actor.role === "patient" ? "WHERE c.patient_id = ?" : actor.role === "administrator" ? "" : "WHERE 1 = 0";
    const claimParams = actor.role === "patient" ? [actor.id] : [];
    const [claimRows] = await pool.execute(
      `SELECT c.*, patient.wallet AS patient_wallet
       FROM insurance_claims c JOIN users patient ON patient.id = c.patient_id
       ${claimWhere} ORDER BY c.created_at DESC`,
      claimParams
    );

    let requestWhere = "";
    let requestParams = [];
    if (actor.role === "patient") {
      requestWhere = "WHERE ar.patient_id = ?";
      requestParams = [actor.id];
    } else if (actor.role === "doctor") {
      requestWhere = "WHERE ar.doctor_id = ?";
      requestParams = [actor.id];
    }
    const [requestRows] = await pool.execute(
      `SELECT ar.*, patient.wallet AS patient_wallet, doctor.wallet AS doctor_wallet,
              doctor.name AS doctor_name, dp.specialty
       FROM access_requests ar
       JOIN users patient ON patient.id = ar.patient_id
       JOIN users doctor ON doctor.id = ar.doctor_id
       LEFT JOIN doctor_profiles dp ON dp.user_id = doctor.id
       ${requestWhere} ORDER BY ar.requested_at DESC`,
      requestParams
    );

    let logWhere = "";
    let logParams = [];
    if (actor.role === "patient") {
      logWhere = "WHERE al.patient_id = ? AND al.granted = TRUE AND (al.expires_at IS NULL OR al.expires_at > NOW())";
      logParams = [actor.id];
    } else if (actor.role === "doctor") {
      logWhere = "WHERE al.doctor_id = ?";
      logParams = [actor.id];
    }
    const [logRows] = await pool.execute(
      `SELECT al.*, patient.wallet AS patient_wallet, doctor.wallet AS doctor_wallet,
              doctor.name AS doctor_name
       FROM access_logs al
       JOIN users patient ON patient.id = al.patient_id
       JOIN users doctor ON doctor.id = al.doctor_id
       ${logWhere} ORDER BY al.created_at DESC`,
      logParams
    );

    const [doctors] = await pool.execute(
      `SELECT u.id, u.name, u.wallet, dp.specialty, dp.license_number, dp.consultation_fee
       FROM users u JOIN doctor_profiles dp ON dp.user_id = u.id
       WHERE u.role = 'doctor' ORDER BY u.name`
    );
    const [profileRows] = actor.role === "patient"
      ? await pool.execute("SELECT * FROM patient_profiles WHERE user_id = ?", [actor.id])
      : actor.role === "doctor"
      ? await pool.execute("SELECT * FROM doctor_profiles WHERE user_id = ?", [actor.id])
      : [[]];
    const [adminUsers] = actor.role === "administrator"
      ? await pool.execute("SELECT id, name, email, role, wallet, created_at FROM users ORDER BY id")
      : [[]];

    res.json({
      profile: profileRows[0] || null,
      doctors: doctors.map((doctor) => ({
        id: Number(doctor.id),
        name: doctor.name,
        address: doctor.wallet,
        specialty: doctor.specialty,
        license: doctor.license_number,
        fee: String(doctor.consultation_fee).match(/[0-9]+(?:\.[0-9]+)?/)?.[0] || "0"
      })),
      records,
      appointments: appointmentRows.map((item) => ({
        id: Number(item.id),
        patient: item.patient_wallet,
        doctor: item.doctor_wallet,
        startsAt: Math.floor(new Date(item.starts_at).getTime() / 1000),
        fee: String(item.fee),
        status: appointmentStatuses[item.status] ?? 0
      })),
      claims: claimRows.map((item) => ({
        id: Number(item.id),
        patient: item.patient_wallet,
        encryptedEvidenceUri: item.encrypted_evidence_uri || "",
        amountEth: String(item.claim_amount),
        status: claimStatuses[item.status] ?? 0
      })),
      accessRequests: requestRows.map((item) => ({
        id: Number(item.id),
        doctor: item.doctor_wallet,
        doctorName: item.doctor_name,
        specialty: item.specialty,
        patient: item.patient_wallet,
        reason: item.reason || "",
        status: requestStatuses[item.status] ?? 0,
        requestedAt: Math.floor(new Date(item.requested_at).getTime() / 1000)
      })),
      accessLogs: logRows.map((item) => ({
        id: Number(item.id),
        patient: item.patient_wallet,
        doctor: item.doctor_wallet,
        doctorName: item.doctor_name,
        purpose: item.purpose,
        granted: Boolean(item.granted),
        expiresAt: item.expires_at ? Math.floor(new Date(item.expires_at).getTime() / 1000) : null
      })),
      users: adminUsers
    });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.post("/api/records", requireAuth, async (req, res) => {
  try {
    const actor = await findActor(req.auth.userId);
    if (!actor || actor.role !== "patient") return res.status(403).json({ message: "Only patients can add their own records." });
    const { title, category, description, encryptedUri, digest } = req.body;
    if (!title || !category || !encryptedUri || !/^0x[\da-f]{64}$/i.test(digest || "")) {
      return res.status(400).json({ message: "A title, category, encrypted URI, and valid SHA-256 digest are required." });
    }
    const [result] = await pool.execute(
      "INSERT INTO records (patient_id, author_id, title, category, description, encrypted_uri, digest) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [actor.id, actor.id, title, category, description || "", encryptedUri, digest]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.post("/api/access-requests", requireAuth, async (req, res) => {
  try {
    const actor = await findActor(req.auth.userId);
    if (!actor || actor.role !== "doctor") return res.status(403).json({ message: "Only doctors can request patient access." });
    const [patients] = await pool.execute("SELECT id FROM users WHERE wallet = ? AND role = 'patient'", [req.body.patientWallet]);
    if (!patients.length) return res.status(404).json({ message: "Patient wallet was not found." });
    const [result] = await pool.execute(
      "INSERT INTO access_requests (patient_id, doctor_id, reason, status) VALUES (?, ?, ?, 'pending')",
      [patients[0].id, actor.id, req.body.reason || "Medical review"]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.patch("/api/access-requests/:requestId", requireAuth, async (req, res) => {
  let connection;
  try {
    const actor = await findActor(req.auth.userId);
    if (!actor || actor.role !== "patient") return res.status(403).json({ message: "Only patients can respond to access requests." });
    const status = req.body.approved ? "approved" : "rejected";
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.execute(
      "UPDATE access_requests SET status = ? WHERE id = ? AND patient_id = ? AND status = 'pending'",
      [status, Number(req.params.requestId), actor.id]
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ message: "Pending request not found for this patient." });
    }
    if (req.body.approved) {
      const [rows] = await connection.execute("SELECT doctor_id FROM access_requests WHERE id = ?", [Number(req.params.requestId)]);
      await connection.execute(
        "INSERT INTO access_logs (patient_id, doctor_id, purpose, granted, expires_at) VALUES (?, ?, 'Patient-approved medical review', TRUE, DATE_ADD(NOW(), INTERVAL 30 DAY))",
        [actor.id, rows[0].doctor_id]
      );
    }
    await connection.commit();
    res.json({ status });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    return respondWithError(res, error);
  } finally {
    if (connection) connection.release();
  }
});

app.post("/api/access-grants", requireAuth, async (req, res) => {
  try {
    const actor = await findActor(req.auth.userId);
    if (!actor || actor.role !== "patient") return res.status(403).json({ message: "Only patients can manage access to their records." });
    const [doctors] = await pool.execute("SELECT id FROM users WHERE wallet = ? AND role = 'doctor'", [req.body.doctorWallet]);
    if (!doctors.length) return res.status(404).json({ message: "Doctor wallet was not found." });
    if (req.body.granted) {
      await pool.execute(
        "INSERT INTO access_logs (patient_id, doctor_id, purpose, granted, expires_at) VALUES (?, ?, ?, TRUE, DATE_ADD(NOW(), INTERVAL 30 DAY))",
        [actor.id, doctors[0].id, "Patient-approved medical review"]
      );
    } else {
      await pool.execute("UPDATE access_logs SET granted = FALSE WHERE patient_id = ? AND doctor_id = ? AND granted = TRUE", [actor.id, doctors[0].id]);
    }
    res.json({ granted: Boolean(req.body.granted) });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.post("/api/appointments", requireAuth, async (req, res) => {
  try {
    const actor = await findActor(req.auth.userId);
    if (!actor || actor.role !== "patient") return res.status(403).json({ message: "Only patients can book appointments." });
    const [doctors] = await pool.execute(
      `SELECT u.id, dp.consultation_fee
       FROM users u JOIN doctor_profiles dp ON dp.user_id = u.id
       WHERE u.wallet = ? AND u.role = 'doctor'`,
      [req.body.doctorWallet]
    );
    if (!doctors.length) return res.status(404).json({ message: "Doctor not found." });
    const startsAt = new Date(req.body.startsAt);
    const fee = Number(req.body.fee);
    const doctorFee = Number(String(doctors[0].consultation_fee).match(/[0-9]+(?:\.[0-9]+)?/)?.[0]);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      return res.status(400).json({ message: "Choose a valid appointment date in the future." });
    }
    if (!Number.isFinite(fee) || fee <= 0 || !Number.isFinite(doctorFee) || Math.abs(fee - doctorFee) > 0.00000001) {
      return res.status(400).json({ message: "The appointment fee must match the selected doctor's listed fee." });
    }
    const [result] = await pool.execute(
      "INSERT INTO appointments (patient_id, doctor_id, starts_at, fee, status) VALUES (?, ?, ?, ?, 'pending')",
      [actor.id, doctors[0].id, startsAt, fee]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.patch("/api/appointments/:appointmentId", requireAuth, async (req, res) => {
  try {
    const actor = await findActor(req.auth.userId);
    if (!actor || !["patient", "doctor"].includes(actor.role)) return res.status(403).json({ message: "This account cannot manage appointments." });
    const [rows] = await pool.execute("SELECT * FROM appointments WHERE id = ?", [Number(req.params.appointmentId)]);
    const appointment = rows[0];
    if (!appointment) return res.status(404).json({ message: "Appointment not found." });
    const transitions = {
      accept: { role: "doctor", owner: appointment.doctor_id, current: "pending", status: "accepted" },
      decline: { role: "doctor", owner: appointment.doctor_id, current: "pending", status: "cancelled" },
      complete: { role: "doctor", owner: appointment.doctor_id, current: "accepted", status: "completed" },
      cancel: { role: "patient", owner: appointment.patient_id, current: "pending", status: "cancelled" }
    };
    const transition = transitions[req.body.action];
    if (!transition || actor.role !== transition.role || actor.id !== transition.owner) {
      return res.status(403).json({ message: "This account cannot perform that appointment action." });
    }
    if (transition.current && appointment.status !== transition.current) {
      return res.status(409).json({ message: `Appointment must be ${transition.current} before this action.` });
    }
    if (req.body.action === "complete" && new Date(appointment.starts_at).getTime() > Date.now()) {
      return res.status(409).json({ message: "The appointment cannot be completed before its scheduled time." });
    }
    const [result] = await pool.execute(
      "UPDATE appointments SET status = ? WHERE id = ? AND status = ?",
      [transition.status, appointment.id, appointment.status]
    );
    if (!result.affectedRows) return res.status(409).json({ message: "Appointment status changed. Refresh and try again." });
    res.json({ status: transition.status });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.post("/api/claims", requireAuth, async (req, res) => {
  try {
    const actor = await findActor(req.auth.userId);
    if (!actor || actor.role !== "patient") return res.status(403).json({ message: "Only patients can submit claims." });
    const amount = Number(req.body.amount);
    if (!req.body.encryptedEvidenceUri || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Evidence URI and positive claim amount are required." });
    }
    const [result] = await pool.execute(
      "INSERT INTO insurance_claims (patient_id, insurer_name, claim_number, claim_amount, encrypted_evidence_uri, reason, status) VALUES (?, 'Demo insurer', ?, ?, ?, 'Patient-submitted encrypted evidence', 'pending')",
      [actor.id, `DEMO-${Date.now()}`, amount, req.body.encryptedEvidenceUri]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.patch("/api/claims/:claimId", requireAuth, async (req, res) => {
  try {
    const actor = await findActor(req.auth.userId);
    if (!actor || actor.role !== "administrator") return res.status(403).json({ message: "Only administrators can review demo claims." });
    const status = req.body.approved ? "approved" : "rejected";
    const [result] = await pool.execute(
      "UPDATE insurance_claims SET status = ? WHERE id = ? AND status = 'pending'",
      [status, Number(req.params.claimId)]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Pending claim not found." });
    res.json({ status });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.listen(port, () => {
  console.log(`Healthcare auth server running on http://localhost:${port}`);
});
