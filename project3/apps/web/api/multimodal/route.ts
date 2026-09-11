import { NextResponse } from "next/server";
import { perceive, status, type Modality } from "@/aetheris/core/multimodal/perceive";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 300;

/**
 * GET → per-modality availability (honest: depends on host + keys).
 * POST multipart {modality, file?, url?, question?, series?(json)} or JSON {modality, url?, question?, series?} → Perception.
 */
export async function GET() { return NextResponse.json(await status()); }
export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  let modality: Modality | undefined; let data: Buffer | undefined; let url: string | undefined; let name: string | undefined; let mime: string | undefined; let question: string | undefined; let series: { t: number; v: number }[] | undefined; let preferred: string | undefined;
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData(); modality = (fd.get("modality") as Modality) ?? undefined; question = (fd.get("question") as string) ?? undefined; url = (fd.get("url") as string) ?? undefined; preferred = (fd.get("preferred") as string) ?? undefined;
    const f = fd.get("file"); if (f instanceof File) { if (f.size > 40 * 1024 * 1024) return NextResponse.json({ error: "file over 40 MB" }, { status: 413 }); data = Buffer.from(await f.arrayBuffer()); name = f.name; mime = f.type; }
    const s = fd.get("series"); if (typeof s === "string") { try { series = JSON.parse(s); } catch { /* ignore */ } }
  } else {
    const b = (await req.json().catch(() => ({}))) as { modality?: Modality; url?: string; question?: string; series?: { t: number; v: number }[]; preferred?: string; dataBase64?: string; name?: string; mime?: string };
    modality = b.modality; url = b.url; question = b.question; series = b.series; preferred = b.preferred; name = b.name; mime = b.mime; if (b.dataBase64) data = Buffer.from(b.dataBase64, "base64");
  }
  if (!modality || !["image", "document", "audio", "video", "sensor"].includes(modality)) return NextResponse.json({ error: "modality must be image|document|audio|video|sensor" }, { status: 400 });
  const p = await perceive({ modality, data, url, name, mime, question, series, preferred });
  return NextResponse.json(p, { status: p.ok ? 200 : 422 });
}
