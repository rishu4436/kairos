import { generateResearchThesis } from "@/research/generate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { userId?: unknown; assetId?: unknown; mode?: unknown } | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const assetId = typeof body?.assetId === "string" ? body.assetId.trim() : "";
  const mode = body?.mode === "mock" ? "mock" : "llm";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId) || !/^[A-Za-z0-9:._-]{1,64}$/.test(assetId)) {
    return Response.json(
      { ok: false, stage: "FAILED", code: "INVALID_REQUEST", message: "The user or asset is not valid." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const result = await generateResearchThesis({ userId, assetId, mode });
  return Response.json(result, {
    status: result.ok ? 200 : 400,
    headers: { "Cache-Control": "no-store" },
  });
}
