import { NextResponse } from "next/server";
import { parseEarningsXlsx } from "@/lib/parse-earnings-xlsx";
import { writeEarningsGrid } from "@/lib/store";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no 'file' field in form data" }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large (max 5MB)" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let grid;
  try {
    grid = parseEarningsXlsx(buffer, file.name);
  } catch (e) {
    return NextResponse.json(
      { error: `parse failed: ${(e as Error).message}` },
      { status: 400 }
    );
  }

  await writeEarningsGrid(grid);
  return NextResponse.json({
    ok: true,
    id: grid.id,
    gridName: grid.gridName,
    companyCount: grid.companies.length,
    columnCount: grid.columnHeaders.length,
  });
}
