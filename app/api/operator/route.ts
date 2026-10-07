import { assertOperatorMutation } from "@/operator/guard";
import { applyRiskPosture, applyRuntimeAction, patchOperatorConfig, requestOneCycle, type OperatorAction } from "@/operator/actions";
import { POSTURES, type RiskPosture } from "@/operator/posture";
import { admitOperatorAction, controlFace } from "@/operator/mandate";
import { autonomousStore } from "@/runtime/store";
import { DEFAULT_AGENT_ID, LOCAL_RUNTIME_USER_ID } from "@/domain/watchlist";
import { readOperatorConfig } from "@/operator/store";
import { operatorMutationsAllowed } from "@/operator/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  if (!operatorMutationsAllowed()) {
    return Response.json({ ok: false, reason: "OPERATOR_DISABLED" }, { status: 403 });
  }
  return Response.json({ ok: true, config: readOperatorConfig() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const gate = assertOperatorMutation(request);
  if (!gate.ok) {
    return Response.json({ ok: false, reason: gate.reason }, { status: gate.status });
  }
  const body = (await request.json().catch(() => null)) as { action?: OperatorAction; patch?: Record<string, unknown> } | null;
  const action = body?.action;
  if (action === "RUN" || action === "STOP" || action === "ONE_CYCLE") {
    const face = controlFace(autonomousStore().readControl(LOCAL_RUNTIME_USER_ID, DEFAULT_AGENT_ID), false);
    const allowed = admitOperatorAction(action, face, true);
    if (!allowed.ok) {
      return Response.json(allowed, { status: 409 });
    }
  }
  if (action === "ONE_CYCLE") {
    const outcome = await requestOneCycle();
    return Response.json({ ok: true, cycleId: outcome.cycleId, status: outcome.status, signed: false, broadcast: false });
  }
  if (action === "RUN" || action === "PAUSE" || action === "STOP" || action === "EXECUTION_DISABLE") {
    const result = applyRuntimeAction(action);
    return Response.json(result, { status: result.ok ? 200 : 409 });
  }
  if (action === "POSTURE") {
    const posture = (body as { posture?: string } | null)?.posture;
    if (!POSTURES.includes(posture as RiskPosture)) {
      return Response.json({ ok: false, reason: "UNKNOWN_POSTURE" }, { status: 400 });
    }
    const result = applyRiskPosture(posture as RiskPosture);
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }
  if (action === "CONFIG_PATCH") {
    const result = patchOperatorConfig(body?.patch ?? {});
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }
  return Response.json({ ok: false, reason: "UNKNOWN_ACTION" }, { status: 400 });
}
