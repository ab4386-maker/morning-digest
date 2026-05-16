import { NextResponse } from "next/server";
import { deleteEarningsGrid } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteEarningsGrid(id);
  return NextResponse.json({ ok: true });
}
