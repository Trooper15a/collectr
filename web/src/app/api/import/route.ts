import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { commitImport, previewImport, type ImportRow } from "@/lib/import";
import { snapshotPortfolios } from "@/lib/portfolio";

const Commit = z.object({
  rows: z.array(z.custom<ImportRow>((v) => typeof v === "object" && v !== null && "line" in v)).max(5000),
  defaultPortfolio: z.string().trim().min(1).max(80).default("Imported"),
});

/** POST /api/import  (multipart "file" or text/csv body) -> preview rows with matches */
export async function POST(req: NextRequest) {
  let text = "";
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
      if (file.size > 5_000_000) return NextResponse.json({ error: "File too large (5 MB max)" }, { status: 400 });
      text = await file.text();
    } else {
      text = await req.text();
    }
    if (!text.trim()) return NextResponse.json({ error: "Empty file" }, { status: 400 });
    const rows = previewImport(text);
    const summary = {
      total: rows.length,
      matched: rows.filter((r) => r.status === "matched").length,
      ambiguous: rows.filter((r) => r.status === "ambiguous").length,
      unmatched: rows.filter((r) => r.status === "unmatched").length,
      errors: rows.filter((r) => r.status === "error").length,
    };
    return NextResponse.json({ rows, summary });
  } catch (e) {
    console.error("import preview error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 500 });
  }
}

/** PUT /api/import { rows, defaultPortfolio } -> writes the matched rows */
export async function PUT(req: NextRequest) {
  const parsed = Commit.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  try {
    const result = commitImport(parsed.data.rows, parsed.data.defaultPortfolio);
    snapshotPortfolios().catch(() => undefined);
    return NextResponse.json(result);
  } catch (e) {
    console.error("import commit error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 500 });
  }
}
