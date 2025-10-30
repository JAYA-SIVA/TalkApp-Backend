// mailer.js
const nodemailer = require("nodemailer");

const PROVIDER = (process.env.MAIL_PROVIDER || "sendgrid").toLowerCase();

function mask(s) {
  if (!s) return "<empty>";
  const t = String(s).trim();
  return `${t.slice(0, 3)}…${t.slice(-4)} (len:${t.length})`;
}

/**
 * Build one real Nodemailer transport and a safe info object
 * (no secrets exposed).
 */
function buildTransport() {
  if (PROVIDER === "gmail") {
    // Gmail (requires 2FA + App Password)
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    if (!user || !pass) {
      throw new Error("Gmail EMAIL_USER/EMAIL_PASS missing");
    }

    const from = process.env.SMTP_FROM || user; // default from = your Gmail
    console.log("[MAIL] Provider: gmail");
    console.log("[MAIL] Gmail config:", {
      user,
      from,
      pass: mask(pass),
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    const info = { provider: "gmail", host: "smtp.gmail.com", port: 465, user, from };
    return { transporter, info };
  }

  // Default: SendGrid over SMTP
  const host = process.env.SMTP_HOST || "smtp.sendgrid.net";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || "apikey"; // must literally be "apikey"
  const pass = (process.env.SMTP_PASS || "").trim().replace(/^['"]|['"]$/g, "");
  const from = process.env.SMTP_FROM; // must be a verified sender in SendGrid

  console.log("[MAIL] Provider: sendgrid");
  console.log("[MAIL] SendGrid config:", {
    host,
    port: String(port),
    user,
    from,
    pass: mask(pass),
  });

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,       // STARTTLS on 587
    requireTLS: true,
    authMethod: "PLAIN", // what SendGrid expects
    auth: { user, pass },
  });

  const info = { provider: "sendgrid", host, port, user, from };
  return { transporter, info };
}

const { transporter: _transport, info } = buildTransport();

/** Verify once on boot (non-fatal). */
(async () => {
  try {
    await _transport.verify();
    console.log("✅ SMTP verified OK");
  } catch (e) {
    console.error("❌ SMTP verify failed:", e.message);
  }
})();

/** Send helper — calls the REAL transport directly (no recursion). */
async function sendMail(opts = {}) {
  const from =
    opts.from ||
    info.from ||
    "Talk <no-reply@example.com>";

  return _transport.sendMail({ ...opts, from });
}

async function verify() {
  return _transport.verify();
}

module.exports = {
  sendMail,
  verify,
  info,                               // for GET /_mailinfo diagnostics
  getProvider: () => PROVIDER,
};
