import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { store } from "@/aetheris/lib/store";
import { PAYEE, planById } from "./plans";
import { grant } from "./entitlements";

export type PaymentStatus = "pending" | "submitted" | "approved" | "rejected";

export interface Payment {
  id: string;          // Aetheris order ref, also used as UPI transaction note
  uid: string;
  planId: string;
  amountInr: number;
  status: PaymentStatus;
  createdAt: number;
  utr?: string;        // 12-digit UPI reference the user submits after paying
  submittedAt?: number;
  decidedAt?: number;
  note?: string;
}

/** upi:// deep link understood by GPay / PhonePe / Paytm / BHIM. */
export function upiLink(p: Payment): string {
  const q = new URLSearchParams({
    pa: PAYEE.vpa,
    pn: PAYEE.name,
    am: p.amountInr.toFixed(2),
    cu: "INR",
    tn: `Aetheris ${p.id}`,
    tr: p.id,
  });
  return `upi://pay?${q.toString()}`;
}

export async function createPayment(uid: string, planId: string): Promise<Payment & { link: string; qr: string }> {
  const plan = planById(planId);
  if (!plan) throw new Error("Unknown plan");
  const id = "AET" + randomBytes(4).toString("hex").toUpperCase();
  const p: Payment = { id, uid, planId, amountInr: plan.priceInr, status: "pending", createdAt: Date.now() };
  await store.set("payments", id, p);
  const link = upiLink(p);
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 280, color: { dark: "#0b0d12", light: "#ffffff" } });
  return { ...p, link, qr };
}

export async function submitUtr(uid: string, id: string, utr: string): Promise<Payment> {
  const clean = utr.replace(/\D/g, "");
  if (!/^\d{12}$/.test(clean)) throw new Error("UTR must be the 12-digit UPI reference number");
  return store.update<Payment>("payments", id, (cur) => {
    if (!cur || cur.uid !== uid) throw new Error("Payment not found");
    if (cur.status === "approved") return cur;
    return { ...cur, utr: clean, status: "submitted", submittedAt: Date.now() };
  });
}

export async function getPayment(uid: string, id: string): Promise<Payment | null> {
  const p = await store.get<Payment>("payments", id);
  return p && p.uid === uid ? p : null;
}

export async function listPayments(status?: PaymentStatus): Promise<Payment[]> {
  const all = Object.values(await store.all<Payment>("payments"));
  return all.filter((p) => !status || p.status === status).sort((a, b) => b.createdAt - a.createdAt);
}

export async function decide(id: string, approve: boolean, note?: string): Promise<Payment> {
  const p = await store.update<Payment>("payments", id, (cur) => {
    if (!cur) throw new Error("Payment not found");
    return { ...cur, status: approve ? "approved" : "rejected", decidedAt: Date.now(), note };
  });
  if (approve) await grant(p.uid, p.planId, p.id);
  return p;
}
