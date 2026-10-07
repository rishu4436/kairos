import { fulfillIntelligenceJob } from "@/studio/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const result = fulfillIntelligenceJob(await request.json().catch(() => null));
  return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
}
