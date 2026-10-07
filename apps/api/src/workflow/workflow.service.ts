import { Injectable, Logger } from "@nestjs/common";
import { WorkflowRun } from "@prisma/client";
import { ownedComic } from "../comics/ownership";
import { GenerationService, PANEL_PROMPT_INCLUDE, PromptSnapshot } from "../generation/generation.service";
import { computeIdempotencyKey } from "../generation/idempotency";
import { apiError } from "../http";
import { PrismaService } from "../prisma.service";
import { AWAITING_IMAGES, FINISHED, WorkflowProgressService } from "./workflow-progress.service";
import { countJobs, latestJobPerPanel, panelIdsFromContext } from "./workflow-status";

export const MAX_BATCH_PANELS = 30;

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: GenerationService,
    private readonly progress: WorkflowProgressService,
  ) {}

  async startBatch(userId: string, comicId: string, sceneIds?: string[]) {
    const comic = await ownedComic(this.prisma, userId, comicId);
    const story = await this.prisma.story.findUnique({ where: { comicId: comic.id } });
    const scenes = await this.prisma.scene.findMany({
      where: { storyId: story?.id ?? "00000000-0000-0000-0000-000000000000" },
      orderBy: { sortOrder: "asc" },
    });
    const selected = sceneIds ? scenes.filter((scene) => sceneIds.includes(scene.id)) : scenes;
    if (sceneIds && selected.length !== new Set(sceneIds).size) {
      throw apiError(400, "VALIDATION_ERROR", "Có cảnh không thuộc comic này", [{ field: "scene_ids", issue: "invalid" }]);
    }

    const panels = (
      await this.prisma.panel.findMany({
        where: { sceneId: { in: selected.map((scene) => scene.id) } },
        include: PANEL_PROMPT_INCLUDE,
      })
    ).sort(
      (a, b) =>
        selected.findIndex((scene) => scene.id === a.sceneId) - selected.findIndex((scene) => scene.id === b.sceneId) ||
        a.sortOrder - b.sortOrder,
    );
    if (panels.length === 0) {
      throw apiError(400, "VALIDATION_ERROR", "Không có panel nào để sinh ảnh", [{ field: "scene_ids", issue: "empty" }]);
    }
    if (panels.length > MAX_BATCH_PANELS) {
      throw apiError(400, "VALIDATION_ERROR", `Tối đa ${MAX_BATCH_PANELS} panel một lần`, [
        { field: "scene_ids", issue: "too_many" },
      ]);
    }
    const busy = await this.prisma.generationJob.findMany({
      where: { panelId: { in: panels.map((panel) => panel.id) }, status: { in: ["pending", "queued", "running"] } },
      select: { panelId: true },
    });
    if (busy.length > 0) {
      throw apiError(409, "CONFLICT", "Có panel đang có job chạy", busy.map((job) => ({ field: job.panelId, issue: "busy" })));
    }

    const prepared: { panelId: string; snapshot: PromptSnapshot }[] = [];
    const missing: string[] = [];
    for (const panel of panels) {
      const snapshot = await this.generation.prepareSnapshot(panel);
      if (snapshot) {
        prepared.push({ panelId: panel.id, snapshot });
      } else {
        missing.push(panel.id);
      }
    }
    if (missing.length > 0) {
      throw apiError(
        400,
        "VALIDATION_ERROR",
        "Có panel chưa có prompt và comic chưa có nội dung để điền",
        missing.map((id) => ({ field: id, issue: "no_prompt" })),
      );
    }

    const workflow = await this.prisma.workflowRun.create({
      data: {
        comicId: comic.id,
        type: "batch_panel_images",
        status: "running",
        currentStep: AWAITING_IMAGES,
        context: { panel_ids: prepared.map((item) => item.panelId) },
      },
    });
    const skipped: string[] = [];
    for (const item of prepared) {
      const result = await this.generation.enqueue({
        panelId: item.panelId,
        comicId: comic.id,
        snapshot: item.snapshot,
        idempotencyKey: computeIdempotencyKey({
          panelId: item.panelId,
          prompt: item.snapshot.prompt,
          negativePrompt: item.snapshot.negative_prompt,
          seed: item.snapshot.seed,
          width: item.snapshot.width,
          height: item.snapshot.height,
          steps: item.snapshot.steps,
        }),
        attempt: 1,
        workflowRunId: workflow.id,
      });
      if (result.kind === "conflict" || result.kind === "existing") {
        skipped.push(item.panelId);
      }
    }
    if (skipped.length > 0) {
      await this.prisma.workflowRun.update({
        where: { id: workflow.id },
        data: {
          context: { panel_ids: prepared.map((item) => item.panelId).filter((id) => !skipped.includes(id)) },
          errorSummary: `Bỏ qua ${skipped.length} panel vì vừa có job khác: ${skipped.join(", ")}`,
        },
      });
    }
    await this.progress.refresh(workflow.id);
    this.logger.log(`workflow started workflow_id=${workflow.id} panels=${prepared.length}`);
    return this.describe(await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: workflow.id } }));
  }

  async get(userId: string, workflowId: string) {
    return this.describe(await this.ownedWorkflow(userId, workflowId));
  }

  async cancel(userId: string, workflowId: string) {
    const workflow = await this.ownedWorkflow(userId, workflowId);
    if (workflow.status !== "running") {
      throw apiError(409, "CONFLICT", "Workflow đã kết thúc");
    }
    await this.prisma.workflowRun.update({
      where: { id: workflow.id },
      data: { status: "cancelled", currentStep: FINISHED },
    });
    const active = await this.prisma.generationJob.findMany({
      where: { workflowRunId: workflow.id, status: { in: ["pending", "queued", "running"] } },
    });
    for (const job of active) {
      await this.generation.cancelJob(job);
    }
    this.logger.log(`workflow cancelled workflow_id=${workflow.id} jobs=${active.length}`);
    return this.describe(await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: workflow.id } }));
  }

  private async ownedWorkflow(userId: string, workflowId: string): Promise<WorkflowRun> {
    const workflow = await this.prisma.workflowRun.findFirst({
      where: { id: workflowId, comic: { ownerId: userId } },
    });
    if (!workflow) {
      throw apiError(404, "NOT_FOUND", "Không tìm thấy workflow");
    }
    return workflow;
  }

  private async describe(workflow: WorkflowRun) {
    const jobs = await this.prisma.generationJob.findMany({ where: { workflowRunId: workflow.id } });
    return {
      workflow_id: workflow.id,
      comic_id: workflow.comicId,
      type: workflow.type,
      status: workflow.status,
      current_step: workflow.currentStep,
      error_summary: workflow.errorSummary,
      ...countJobs(jobs, panelIdsFromContext(workflow.context)),
      jobs: latestJobPerPanel(jobs).map((job) => ({
        job_id: job.id,
        panel_id: job.panelId,
        status: job.status,
        attempt: job.attempt,
        error_code: job.errorCode,
      })),
      created_at: workflow.createdAt.toISOString(),
      updated_at: workflow.updatedAt.toISOString(),
    };
  }
}
