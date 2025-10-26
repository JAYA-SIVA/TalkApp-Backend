// services/moderationService.js
import axios from "axios";
import FormData from "form-data";

const USER = process.env.SIGHTENGINE_USER;
const SECRET = process.env.SIGHTENGINE_SECRET;
const STRICT = (process.env.MOD_STRICT || "strict").toLowerCase(); // "soft" | "strict"

if (!USER || !SECRET) {
  console.warn("[moderationService] Missing SIGHTENGINE_USER/SECRET in .env");
}

function decide(se) {
  // Sightengine common fields
  const nudity = se.nudity || {};
  const items = se.items || {};
  const minors = se.minors || {};

  const raw = Number(nudity.raw || 0);
  const suggestive = Number(nudity.suggestive || 0);
  const sexualActivity = Number(items.sexual_activity || 0);
  const sexualDisplay = Number(items.sexual_display || 0);
  const minorsProb = Number(minors.probability || 0);

  let reasons = [];
  let block = false;

  if (raw > 0.15) { block = true; reasons.push(`nudity_raw:${raw.toFixed(2)}`); }
  if (sexualActivity > 0.10) { block = true; reasons.push(`sexual_activity:${sexualActivity.toFixed(2)}`); }
  if (sexualDisplay > 0.10) { block = true; reasons.push(`sexual_display:${sexualDisplay.toFixed(2)}`); }
  if (minorsProb > 0.20) { block = true; reasons.push(`minors:${minorsProb.toFixed(2)}`); }
  if (STRICT === "strict" && suggestive > 0.45) {
    block = true; reasons.push(`suggestive:${suggestive.toFixed(2)}`);
  }

  return { allowed: !block, reason: block ? reasons.join(", ") : "OK" };
}

export async function checkImage(buffer) {
  if (!USER || !SECRET) return { allowed: false, reason: "Moderator not configured" };

  const form = new FormData();
  form.append("models", "nudity-2.0,wad,offensive,face-attributes");
  form.append("api_user", USER);
  form.append("api_secret", SECRET);
  // send as data URL base64 to avoid disk I/O
  form.append("media", `data:image/jpeg;base64,${buffer.toString("base64")}`);

  const resp = await axios.post("https://api.sightengine.com/1.0/check.json", form, {
    headers: form.getHeaders(),
    timeout: 15000
  });

  const decision = decide(resp.data);
  return { ...decision, raw: resp.data };
}
