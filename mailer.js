// mailer.js
const nodemailer = require("nodemailer");

const PROVIDER = (process.env.MAIL_PROVIDER || "sendgrid").toLowerCase();

function mask(s) {
  if (!s) return "<empty>";
  const t = String(s).trim();
  return `${t.slice(0, 3)}…${t.slice(-4)} (len:${t.length})`;
}

/** Build a real nodemailer transport once */
function buildTransport() {
  if (PROVIDER === "gmail") {
    // Gmail App Password (recommended)
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    if (!user || !pass) {
      throw new Error("Gmail EMAIL_USER/EMAIL_PASS missing");
    }
    console.log("[MAIL] Provider: gmail");
    console.log("[MAIL] Gmail config:", {
      user,
      from: process.env.SMTP_FROM,
      pass: mask(pass),
    });

    return nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }

  // Default: SendGrid over SMTP
  const host = process.env.SMTP_HOST || "smtp.sendgrid.net";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || "apikey"; // literal "apikey"
  const pass = (process.env.SMTP_PASS || "").trim().replace(/^['"]|['"]$/g, "");

  console.log("[MAIL] Provider: sendgrid");
  console.log("[MAIL] SendGrid config:", {
    host,
    port: String(port),
    user,
    from: process.env.SMTP_FROM,
    pass: mask(pass),
  });

  return nodemailer.createTransport({
    host,
    port,
    secure: false,      // STARTTLS
    requireTLS: true,
    authMethod: "PLAIN",
    auth: { user, pass },
  });
}

const _transport = buildTransport(); // <-- the real Nodemailer transporter

/** Verify on boot (non-fatal) */
async function verify() {
  try {
    await _transport.verify();
    console.log("✅ SMTP verified OK");
  } catch (e) {
    console.error("❌ SMTP verify failed:", e.message);
  }
}

/** Send helper (never recursive) */
async function sendMail(opts) {
  const from =
    opts?.from ||
    process.env.SMTP_FROM ||
    "Talk <no-reply@example.com>";

  // IMPORTANT: Call the real transport directly
  return _transport.sendMail({ ...opts, from });
}

module.exports = {
  sendMail,
  verify,
  getProvider: () => PROVIDER,
};
