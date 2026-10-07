import { randomInt, randomUUID } from "crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { GenerationJob, Prisma } from "@prisma/client";
import { ownedPanel } from "../comics/ownership";
import { Env } from "../env";
import { apiError } from "../http";
import { PrismaService } from "../prisma.service";
import { APP_ENV } from "../tokens";
import { WorkflowProgressService } from "../workflow/workflow-progress.service";
import { CeleryPublisher, TASK_SCHEMA_VERSION } from "./celery-publisher";
import { computeIdempotencyKey } from "./idempotency";
import { applyJobCallback, CallbackStatus } from "./job-transition";
import { buildImagePrompt, resolveNegativePrompt } from "./prompt";

const ACTIVE = ["pending", "queued", "running"] as const;

export type PromptSnapshot = {
  prompt: string;
  negative_prompt: string;
  seed: number;
  width: number;
  height: number;
  steps: number;
};

export type EnqueueResult =
  | { kind: "queued"; job: GenerationJob }
  | { kind: "existing"; job: GenerationJob }
  | { kind: "conflict" }
  | { kind: "publish_failed"; job: GenerationJob };

type PanelForPrompt = {
  id: string;
  imagePrompt: string | null;
  negativePrompt: string | null;
  scene: {
    summary: string | null;
    story: {
      comicId: string;
      comic: { styleGuide: string | null; characters: { name: string; description: string }[] };
    };
  };
};

export const PANEL_PROMPT_INCLUDE = {
  scene: {
    include: {
      story: { include: { comic: { include: { characters: { orderBy: { createdAt: "asc" as const } } } } } },
    },
  },
};

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: CeleryPublisher,
    private readonly progress: WorkflowProgressService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  async generate(
    userId: string,
    panelId: string,
    input: { seed?: number; width?: number; height?: number; steps?: number },
    idempotencyHeader?: string,
  ): Promise<{ httpStatus: 200 | 202; body: ReturnType<typeof toJobRef> }> {
    const panel = await this.prisma.panel.findFirst({
      where: { id: panelId, scene: { story: { comic: { ownerId: userId } } } },
      include: PANEL_PROMPT_INCLUDE,
    });
    if (!panel) {
      throw apiError(404, "NOT_FOUND", "Không tìm thấy panel");
    }
    const snapshot = await this.prepareSnapshot(panel, input);
    if (!snapshot) {
      throw apiError(400, "VALIDATION_ERROR", "Panel chưa có prompt và comic chưa có nội dung để điền prompt");
    }
    const idempotencyKey = idempotencyHeader?.trim() || keyFor(panel.id, snapshot);
    const result = await this.enqueue({
      panelId: panel.id,
      comicId: panel.scene.story.comicId,
      snapshot,
      idempotencyKey,
      attempt: 1,
    });
    return toHttp(result);
  }

  async retry(userId: string, jobId: string): Promise<{ httpStatus: 200 | 202; body: ReturnType<typeof toJobRef> }> {
    const job = await this.ownedJob(userId, jobId);
    if (job.status !== "failed") {
      throw apiError(409, "CONFLICT", "Chỉ retry được job failed");
    }
    const snapshot = job.promptSnapshot as PromptSnapshot;
    const comic = await this.prisma.panel.findUniqueOrThrow({
      where: { id: job.panelId },
      select: { scene: { select: { story: { select: { comicId: true } } } } },
    });
    const workflow = job.workflowRunId
      ? await this.prisma.workflowRun.findUnique({ where: { id: job.workflowRunId }, select: { status: true } })
      : null;
    const workflowRunId = workflow && workflow.status !== "cancelled" ? job.workflowRunId : null;
    const result = await this.enqueue({
      panelId: job.panelId,
      comicId: comic.scene.story.comicId,
      snapshot,
      idempotencyKey: keyFor(job.panelId, snapshot),
      attempt: job.attempt + 1,
      workflowRunId,
    });
    if (result.kind === "existing") {
      throw apiError(409, "CONFLICT", "Panel đang có job khác");
    }
    await this.progress.refresh(workflowRunId);
    return toHttp(result);
  }

  async cancel(userId: string, jobId: string) {
    const job = await this.ownedJob(userId, jobId);
    const cancelled = await this.cancelJob(job);
    if (!cancelled) {
      throw apiError(409, "CONFLICT", "Job đã kết thúc");
    }
    await this.progress.refresh(cancelled.workflowRunId);
    return toJobDetail(cancelled);
  }

  async cancelJob(job: GenerationJob): Promise<GenerationJob | null> {
    if (!ACTIVE.includes(job.status as (typeof ACTIVE)[number])) {
      return null;
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.generationJob.updateMany({
        where: { id: job.id, status: { in: [...ACTIVE] } },
        data: { status: "cancelled", finishedAt: new Date(), idempotencyKey: null },
      });
      if (result.count === 0) {
        return null;
      }
      await tx.panel.update({ where: { id: job.panelId }, data: { generationStatus: "cancelled" } });
      return tx.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    });
    if (updated) {
      this.logger.log(`job cancelled job_id=${job.id} panel_id=${job.panelId}`);
    }
    return updated;
  }

  async getJob(userId: string, jobId: string) {
    return toJobDetail(await this.ownedJob(userId, jobId));
  }

  async listPanelJobs(userId: string, panelId: string) {
    const panel = await ownedPanel(this.prisma, userId, panelId);
    const jobs = await this.prisma.generationJob.findMany({
      where: { panelId: panel.id },
      orderBy: { createdAt: "desc" },
    });
    return jobs.map(toJobDetail);
  }

  async prepareSnapshot(
    panel: PanelForPrompt,
    input: { seed?: number; width?: number; height?: number; steps?: number } = {},
  ): Promise<PromptSnapshot | null> {
    const prompt = buildImagePrompt({
      existingPrompt: panel.imagePrompt,
      styleGuide: panel.scene.story.comic.styleGuide,
      characters: panel.scene.story.comic.characters,
      sceneSummary: panel.scene.summary,
    });
    if (!prompt) {
      return null;
    }
    if (panel.imagePrompt?.trim() !== prompt) {
      await this.prisma.panel.update({ where: { id: panel.id }, data: { imagePrompt: prompt } });
    }
    return {
      prompt,
      negative_prompt: resolveNegativePrompt(panel.negativePrompt),
      seed: input.seed ?? randomInt(0, 2147483647),
      width: input.width ?? this.env.inferenceWidth,
      height: input.height ?? this.env.inferenceHeight,
      steps: input.steps ?? this.env.inferenceSteps,
    };
  }

  async enqueue(params: {
    panelId: string;
    comicId: string;
    snapshot: PromptSnapshot;
    idempotencyKey: string;
    attempt: number;
    workflowRunId?: string | null;
  }): Promise<EnqueueResult> {
    const { panelId, snapshot, idempotencyKey } = params;
    const active = await this.prisma.generationJob.findFirst({
      where: { panelId, status: { in: ["queued", "running"] } },
    });
    if (active) {
      return active.idempotencyKey === idempotencyKey ? { kind: "existing", job: active } : { kind: "conflict" };
    }

    const jobId = randomUUID();
    const assetId = randomUUID();
    const taskId = randomUUID();
    const storageKey = `panels/${params.comicId}/${jobId}.png`;

    try {
      await this.prisma.$transaction([
        this.prisma.asset.create({
          data: {
            id: assetId,
            comicId: params.comicId,
            kind: "panel_image",
            status: "pending",
            storageKey,
            mimeType: "image/png",
          },
        }),
        this.prisma.generationJob.create({
          data: {
            id: jobId,
            panelId,
            workflowRunId: params.workflowRunId ?? null,
            celeryTaskId: taskId,
            status: "pending",
            promptSnapshot: snapshot,
            resultAssetId: assetId,
            idempotencyKey,
            attempt: params.attempt,
          },
        }),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.prisma.generationJob.findFirst({
          where: { idempotencyKey, status: { in: [...ACTIVE] } },
        });
        if (existing) {
          return { kind: "existing", job: existing };
        }
      }
      throw error;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const winner = await tx.generationJob.findFirst({
          where: { panelId, status: { in: ["queued", "running"] } },
        });
        if (winner) {
          throw new ActiveJobError(winner);
        }
        await tx.generationJob.update({ where: { id: jobId }, data: { status: "queued", queuedAt: new Date() } });
        await tx.panel.update({ where: { id: panelId }, data: { generationStatus: "queued" } });
      });
    } catch (error) {
      if (error instanceof ActiveJobError || isUniqueViolation(error)) {
        await this.discardPending(jobId, assetId);
        const winner =
          error instanceof ActiveJobError
            ? error.job
            : await this.prisma.generationJob.findFirst({ where: { panelId, status: { in: ["queued", "running"] } } });
        return winner && winner.idempotencyKey === idempotencyKey ? { kind: "existing", job: winner } : { kind: "conflict" };
      }
      throw error;
    }

    try {
      await this.publisher.publish(taskId, {
        task_schema_version: TASK_SCHEMA_VERSION,
        job_id: jobId,
        storage_key: storageKey,
        prompt: snapshot.prompt,
        negative_prompt: snapshot.negative_prompt,
        seed: snapshot.seed,
        width: snapshot.width,
        height: snapshot.height,
        steps: snapshot.steps,
      });
    } catch {
      this.logger.error(`publish failed job_id=${jobId} panel_id=${panelId}`);
      const failed = await this.prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          errorCode: "QUEUE_UNAVAILABLE",
          errorMessage: "Không gửi được task vào hàng đợi",
          finishedAt: new Date(),
          idempotencyKey: null,
        },
      });
      await this.prisma.panel.update({ where: { id: panelId }, data: { generationStatus: "failed" } });
      return { kind: "publish_failed", job: failed };
    }

    const queued = await this.prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    this.logger.log(`job queued job_id=${jobId} panel_id=${panelId} attempt=${params.attempt}`);
    return { kind: "queued", job: queued };
  }

  async applyCallback(
    jobId: string,
    input: { status: CallbackStatus; sizeBytes?: number; errorCode?: string; errorMessage?: string },
  ): Promise<GenerationJob | null> {
    if (input.status === "succeeded" && input.sizeBytes === undefined) {
      throw apiError(400, "VALIDATION_ERROR", "succeeded cần size_bytes");
    }
    const job = await this.prisma.generationJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw apiError(404, "NOT_FOUND", "Không tìm thấy job");
    }
    const effect = applyJobCallback(job.status, input.status);
    if (effect.type === "noop") {
      return null;
    }
    if (effect.type === "conflict") {
      throw apiError(409, "CONFLICT", "Job không nhận trạng thái này");
    }

    const now = new Date();
    const terminal = effect.jobStatus === "succeeded" || effect.jobStatus === "failed";
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.generationJob.updateMany({
        where: { id: job.id, status: job.status },
        data: {
          status: effect.jobStatus,
          startedAt: effect.jobStatus === "running" ? now : job.startedAt,
          finishedAt: terminal ? now : job.finishedAt,
          errorCode: effect.jobStatus === "failed" ? input.errorCode ?? "INFERENCE_FAILED" : job.errorCode,
          errorMessage: effect.jobStatus === "failed" ? input.errorMessage ?? null : job.errorMessage,
          idempotencyKey: terminal ? null : job.idempotencyKey,
        },
      });
      if (result.count === 0) {
        return null;
      }
      await tx.panel.update({
        where: { id: job.panelId },
        data: {
          generationStatus: effect.panelStatus,
          imageAssetId: effect.attachImage ? job.resultAssetId : undefined,
        },
      });
      if (effect.markAssetReady) {
        await tx.asset.update({
          where: { id: job.resultAssetId },
          data: { status: "ready", sizeBytes: BigInt(input.sizeBytes ?? 0) },
        });
      }
      return tx.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    });
    if (!updated) {
      throw apiError(409, "CONFLICT", "Job vừa đổi trạng thái");
    }
    this.logger.log(
      `job ${effect.jobStatus} job_id=${job.id} panel_id=${job.panelId} workflow_id=${job.workflowRunId ?? "-"}`,
    );
    await this.progress.refresh(updated.workflowRunId);
    return updated;
  }

  private async ownedJob(userId: string, jobId: string): Promise<GenerationJob> {
    const job = await this.prisma.generationJob.findFirst({
      where: { id: jobId, panel: { scene: { story: { comic: { ownerId: userId } } } } },
    });
    if (!job) {
      throw apiError(404, "NOT_FOUND", "Không tìm thấy job");
    }
    return job;
  }

  private async discardPending(jobId: string, assetId: string): Promise<void> {
    await this.prisma.generationJob.delete({ where: { id: jobId } });
    await this.prisma.asset.delete({ where: { id: assetId } });
  }
}

function keyFor(panelId: string, snapshot: PromptSnapshot): string {
  return computeIdempotencyKey({
    panelId,
    prompt: snapshot.prompt,
    negativePrompt: snapshot.negative_prompt,
    seed: snapshot.seed,
    width: snapshot.width,
    height: snapshot.height,
    steps: snapshot.steps,
  });
}

function toHttp(result: EnqueueResult): { httpStatus: 200 | 202; body: ReturnType<typeof toJobRef> } {
  switch (result.kind) {
    case "queued":
      return { httpStatus: 202, body: toJobRef(result.job) };
    case "existing":
      return { httpStatus: 200, body: toJobRef(result.job) };
    case "conflict":
      throw apiError(409, "CONFLICT", "Panel đang có job khác tham số");
    case "publish_failed":
      throw apiError(503, "QUEUE_UNAVAILABLE", "Không gửi được task vào hàng đợi");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

class ActiveJobError extends Error {
  constructor(readonly job: GenerationJob) {
    super("active job");
  }
}

export function toJobRef(job: GenerationJob) {
  return { job_id: job.id, status: job.status, panel_id: job.panelId };
}

export function toJobDetail(job: GenerationJob) {
  return {
    job_id: job.id,
    panel_id: job.panelId,
    workflow_run_id: job.workflowRunId,
    status: job.status,
    error_code: job.errorCode,
    error_message: job.errorMessage,
    result_asset_id: job.resultAssetId,
    attempt: job.attempt,
    created_at: job.createdAt.toISOString(),
    finished_at: job.finishedAt?.toISOString() ?? null,
  };
}
