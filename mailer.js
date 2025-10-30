// mailer.js
const nodemailer = require("nodemailer");

// detect mail provider from env
const PROVIDER = (process.env.MAIL_PROVIDER || "brevo").toLowerCase();

function mask(s) {
  if (!s) return "<empty>";
  const t = String(s).trim();
  return `${t.slice(0, 3)}…${t.slice(-4)} (len:${t.length})`;
}

/**
 * Builds and verifies the email transport configuration.
 */
function buildTransport() {
  // ──────────────── GMAIL SUPPORT ────────────────
  if (PROVIDER === "gmail") {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass) {
      throw new Error("Gmail EMAIL_USER/EMAIL_PASS missing");
    }

    const from = process.env.SMTP_FROM || user;
    console.log("[MAIL] Provider: Gmail");
    console.log("[MAIL] Gmail Config:", {
      user,
      from,
      pass: mask(pass),
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    const info = {
      provider: "gmail",
      host: "smtp.gmail.com",
      port: 465,
      user,
      from,
    };
    return { transporter, info };
  }

  // ──────────────── BREVO (SENDINBLUE) SMTP ────────────────
  const host = process.env.SMTP_HOST || "smtp-relay.brevo.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER; // e.g. 9a692e001@smtp-brevo.com
  const pass = (process.env.SMTP_PASS || "").trim();
  const from = process.env.SMTP_FROM; // must match verified sender in Brevo

  if (!user || !pass || !from) {
    throw new Error("Brevo SMTP_USER/SMTP_PASS/SMTP_FROM missing in .env");
  }

  console.log("[MAIL] Provider: Brevo (Sendinblue)");
  console.log("[MAIL] Brevo Config:", {
    host,
    port,
    user,
    from,
    pass: mask(pass),
  });

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // STARTTLS
    requireTLS: true,
    auth: { user, pass },
  });

  const info = {
    provider: "brevo",
    host,
    port,
    user,
    from,
  };
  return { transporter, info };
}

// build transport
const { transporter: _transport, info } = buildTransport();

/** Verify SMTP connection on startup (non-fatal). */
(async () => {
  try {
    await _transport.verify();
    console.log("✅ SMTP verified OK");
  } catch (e) {
    console.error("❌ SMTP verify failed:", e.message);
  }
})();

/** Sends an email using the established transport */
async function sendMail(opts = {}) {
  const from =
    opts.from ||
    info.from ||
    "Talk App <no-reply@talkapp.com>";

  return _transport.sendMail({ ...opts, from });
}

/** Optional manual verification */
async function verify() {
  return _transport.verify();
}

module.exports = {
  sendMail,
  verify,
  info,
  getProvider: () => PROVIDER,
};
