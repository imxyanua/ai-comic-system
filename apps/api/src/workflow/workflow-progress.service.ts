import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { nextWorkflowStatus, panelIdsFromContext } from "./workflow-status";

export const AWAITING_IMAGES = "awaiting_images";
export const FINISHED = "finished";

@Injectable()
export class WorkflowProgressService {
  private readonly logger = new Logger(WorkflowProgressService.name);

  constructor(private readonly prisma: PrismaService) {}

  async refresh(workflowRunId: string | null | undefined): Promise<void> {
    if (!workflowRunId) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM workflow_runs WHERE id = ${workflowRunId}::uuid FOR UPDATE`;
      const workflow = await tx.workflowRun.findUnique({ where: { id: workflowRunId } });
      if (!workflow) {
        return;
      }
      const jobs = await tx.generationJob.findMany({
        where: { workflowRunId },
        select: { panelId: true, status: true, createdAt: true },
      });
      const status = nextWorkflowStatus(workflow.status, jobs, panelIdsFromContext(workflow.context));
      if (status === workflow.status) {
        return;
      }
      await tx.workflowRun.update({
        where: { id: workflow.id },
        data: { status, currentStep: status === "running" ? AWAITING_IMAGES : FINISHED },
      });
      this.logger.log(`workflow ${status} workflow_id=${workflow.id}`);
    });
  }
}
