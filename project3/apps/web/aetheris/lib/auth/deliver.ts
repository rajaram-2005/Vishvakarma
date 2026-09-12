/** Delivery of one-time codes. Email via Resend, SMS via Twilio Verify-less Messages API or MSG91; dev fallback logs the code. */
import { hydrateRouterStores } from "@/aetheris/lib/router/hydrate";
import { resolvedEnv } from "@/aetheris/lib/router/runtimeKeys";

export function emailConfigured() { return !!resolvedEnv("RESEND_API_KEY"); }
export function smsConfigured() { return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) || !!process.env.MSG91_AUTH_KEY; }
export function googleConfigured() { return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }

const FROM = process.env.AUTH_EMAIL_FROM ?? "Aetheris <onboarding@resend.dev>";

export async function sendEmailCode(to: string, code: string): Promise<void> {
  await hydrateRouterStores(); // hosted: refresh runtime keys (TTL-gated; no-op on files)
  if (!emailConfigured()) { console.log(`[aetheris auth] email code for ${to}: ${code}`); return; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${resolvedEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject: `${code} is your Aetheris sign-in code`, html: `<div style="font-family:system-ui;max-width:420px"><h2>Sign in to Aetheris</h2><p>Your code is</p><p style="font-size:32px;letter-spacing:6px;font-weight:700">${code}</p><p style="color:#666">It expires in 10 minutes. If you didn't request it, ignore this email.</p></div>` }),
  });
  if (!r.ok) throw new Error(`email delivery failed (${r.status})`);
}

export async function sendSmsCode(to: string, code: string): Promise<void> {
  const text = `${code} is your Aetheris sign-in code. Valid 10 minutes.`;
  if (process.env.MSG91_AUTH_KEY) {
    const r = await fetch("https://control.msg91.com/api/v5/flow/", { method: "POST", headers: { authkey: process.env.MSG91_AUTH_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ template_id: process.env.MSG91_TEMPLATE_ID, recipients: [{ mobiles: to.replace("+", ""), code }] }) });
    if (!r.ok) throw new Error(`SMS delivery failed (${r.status})`);
    return;
  }
  if (process.env.TWILIO_ACCOUNT_SID) {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: text }),
    });
    if (!r.ok) throw new Error(`SMS delivery failed (${r.status})`);
    return;
  }
  console.log(`[aetheris auth] SMS code for ${to}: ${code}`);
}
