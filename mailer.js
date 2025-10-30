// mailer.js
const nodemailer = require("nodemailer");

/**
 * Environment
 * ----------
 * For SendGrid (recommended):
 *   MAIL_PROVIDER=sendgrid
 *   SMTP_HOST=smtp.sendgrid.net
 *   SMTP_PORT=587
 *   SMTP_USER=apikey              // literally the word: apikey
 *   SMTP_PASS=SG.xxxxxx...        // your SendGrid API key (NO quotes)
 *   SMTP_FROM=OTP <verified@sender.com>   // must be verified in SendGrid
 *
 * For Gmail (fallback option):
 *   MAIL_PROVIDER=gmail
 *   EMAIL_USER=yourgmail@gmail.com
 *   EMAIL_PASS=xxxx xxxx xxxx xxxx        // 16-char App Password
 *   SMTP_FROM=Talk OTP <yourgmail@gmail.com>
 */

const PROVIDER = (process.env.MAIL_PROVIDER || "sendgrid").toLowerCase();

function mask(s) {
  if (!s) return "<empty>";
  return `${s.slice(0, 3)}…${s.slice(-4)} (len:${s.length})`;
}

function makeTransport() {
  if (PROVIDER === "gmail") {
    // Gmail with App Password
    const user = (process.env.EMAIL_USER || "").trim();
    const pass = (process.env.EMAIL_PASS || "").trim();
    if (!user || !pass) {
      throw new Error("Gmail SMTP missing EMAIL_USER or EMAIL_PASS.");
    }
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }

  // Default: SendGrid SMTP
  const host = process.env.SMTP_HOST || "smtp.sendgrid.net";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || "apikey"; // literal for SendGrid
  const pass = (process.env.SMTP_PASS || "").trim().replace(/^['"]|['"]$/g, ""); // strip quotes

  if (!pass) {
    throw new Error("SendGrid SMTP missing SMTP_PASS (API key).");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: false,        // STARTTLS on 587
    requireTLS: true,
    authMethod: "PLAIN",  // SendGrid expects this
    auth: { user, pass },
  });
}

const transporter = makeTransport();

// One-time verify (non-fatal if it fails)
(async () => {
  try {
    console.log("[MAIL] Provider:", PROVIDER);
    if (PROVIDER === "gmail") {
      console.log("[MAIL] Gmail user:", process.env.EMAIL_USER);
    } else {
      console.log("[MAIL] SendGrid config:", {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        from: process.env.SMTP_FROM,
        pass: mask((process.env.SMTP_PASS || "").trim()),
      });
    }
    await transporter.verify();
    console.log("✅ SMTP verify OK");
  } catch (e) {
    console.error("❌ SMTP verify failed:", e.message);
  }
})();

/**
 * Small helper to enforce a valid "from" address.
 * If you pass no `from`, we’ll use SMTP_FROM.
 */
async function sendMail(opts) {
  const from =
    opts.from ||
    process.env.SMTP_FROM ||
    (PROVIDER === "gmail" ? process.env.EMAIL_USER : null);

  if (!from) {
    throw new Error("Missing 'from' address. Set SMTP_FROM (or EMAIL_USER for Gmail).");
  }

  return transporter.sendMail({ ...opts, from });
}

module.exports = transporter;
module.exports.sendMail = sendMail;
