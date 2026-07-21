import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { serializzaTask } from "@/lib/task-api";

// GET /api/v1/tasks/by-ref/:sistema/:idEsterno
// Ritrova una task dall'identità dell'app di origine, senza conoscerne l'id
// nativo di Tasks. Utile all'app che ha creato la task per rileggerne lo stato.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ sistema: string; idEsterno: string }> },
) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const { sistema, idEsterno } = await ctx.params;
  const task = await prisma.task.findUnique({
    where: { sistema_idEsterno: { sistema, idEsterno: decodeURIComponent(idEsterno) } },
    include: { livelli: true },
  });
  if (!task) return erroreApi(404, "Task non trovata");
  return NextResponse.json(serializzaTask(task));
}
