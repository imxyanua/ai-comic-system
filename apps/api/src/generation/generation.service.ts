import { randomInt, randomUUID } from "crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { GenerationJob, Prisma } from "@prisma/client";
import { ownedPanel } from "../comics/ownership";
import { Env } from "../env";
import { apiError } from "../http";
import { PrismaService } from "../prisma.service";
import { APP_ENV } from "../tokens";
import { CeleryPublisher, TASK_SCHEMA_VERSION } from "./celery-publisher";
import { computeIdempotencyKey } from "./idempotency";
import { applyJobCallback, CallbackStatus } from "./job-transition";
import { buildImagePrompt, resolveNegativePrompt } from "./prompt";

const ACTIVE = ["pending", "queued", "running"] as const;

type PromptSnapshot = {
  prompt: string;
  negative_prompt: string;
  seed: number;
  width: number;
  height: number;
  steps: number;
};

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: CeleryPublisher,
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
      include: { scene: { include: { story: { include: { comic: { include: { characters: { orderBy: { createdAt: "asc" } } } } } } } } },
    });
    if (!panel) {
      throw apiError(404, "NOT_FOUND", "Không tìm thấy panel");
    }

    const prompt = buildImagePrompt({
      existingPrompt: panel.imagePrompt,
      styleGuide: panel.scene.story.comic.styleGuide,
      characters: panel.scene.story.comic.characters.map((character) => ({
        name: character.name,
        description: character.description,
      })),
      sceneSummary: panel.scene.summary,
    });
    if (!prompt) {
      throw apiError(400, "VALIDATION_ERROR", "Panel chưa có prompt và comic chưa có nội dung để điền prompt");
    }

    const snapshot: PromptSnapshot = {
      prompt,
      negative_prompt: resolveNegativePrompt(panel.negativePrompt),
      seed: input.seed ?? randomInt(0, 2147483647),
      width: input.width ?? this.env.inferenceWidth,
      height: input.height ?? this.env.inferenceHeight,
      steps: input.steps ?? this.env.inferenceSteps,
    };
    const headerKey = idempotencyHeader?.trim();
    const idempotencyKey =
      headerKey ||
      computeIdempotencyKey({
        panelId,
        prompt: snapshot.prompt,
        negativePrompt: snapshot.negative_prompt,
        seed: snapshot.seed,
        width: snapshot.width,
        height: snapshot.height,
        steps: snapshot.steps,
      });

    const active = await this.prisma.generationJob.findFirst({
      where: { panelId, status: { in: ["queued", "running"] } },
    });
    if (active) {
      if (active.idempotencyKey === idempotencyKey) {
        return { httpStatus: 200, body: toJobRef(active) };
      }
      throw apiError(409, "CONFLICT", "Panel đang có job khác tham số");
    }

    if (panel.imagePrompt?.trim() !== prompt) {
      await this.prisma.panel.update({ where: { id: panel.id }, data: { imagePrompt: prompt } });
    }

    const jobId = randomUUID();
    const assetId = randomUUID();
    const taskId = randomUUID();
    const storageKey = `panels/${panel.scene.story.comicId}/${jobId}.png`;

    try {
      await this.prisma.$transaction([
        this.prisma.asset.create({
          data: {
            id: assetId,
            comicId: panel.scene.story.comicId,
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
            celeryTaskId: taskId,
            status: "pending",
            promptSnapshot: snapshot,
            resultAssetId: assetId,
            idempotencyKey,
          },
        }),
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.generationJob.findFirst({
          where: { idempotencyKey, status: { in: [...ACTIVE] } },
        });
        if (existing) {
          return { httpStatus: 200, body: toJobRef(existing) };
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
        await tx.generationJob.update({
          where: { id: jobId },
          data: { status: "queued", queuedAt: new Date() },
        });
        await tx.panel.update({
          where: { id: panelId },
          data: { generationStatus: "queued" },
        });
      });
    } catch (error) {
      if (error instanceof ActiveJobError || isUniqueViolation(error)) {
        await this.discardPending(jobId, assetId);
        const winner =
          error instanceof ActiveJobError
            ? error.job
            : await this.prisma.generationJob.findFirst({
                where: { panelId, status: { in: ["queued", "running"] } },
              });
        if (winner && winner.idempotencyKey === idempotencyKey) {
          return { httpStatus: 200, body: toJobRef(winner) };
        }
        throw apiError(409, "CONFLICT", "Panel đang có job khác tham số");
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
    } catch (error) {
      this.logger.error(`publish failed job_id=${jobId} panel_id=${panelId}`);
      await this.prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          errorCode: "QUEUE_UNAVAILABLE",
          errorMessage: "Không gửi được task vào hàng đợi",
          finishedAt: new Date(),
          idempotencyKey: null,
        },
      });
      await this.prisma.panel.update({
        where: { id: panelId },
        data: { generationStatus: "failed" },
      });
      throw apiError(503, "QUEUE_UNAVAILABLE", "Không gửi được task vào hàng đợi");
    }

    const queued = await this.prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    this.logger.log(`job queued job_id=${jobId} panel_id=${panelId}`);
    return { httpStatus: 202, body: toJobRef(queued) };
  }

  async getJob(userId: string, jobId: string) {
    const job = await this.prisma.generationJob.findFirst({
      where: { id: jobId, panel: { scene: { story: { comic: { ownerId: userId } } } } },
    });
    if (!job) {
      throw apiError(404, "NOT_FOUND", "Không tìm thấy job");
    }
    return toJobDetail(job);
  }

  async listPanelJobs(userId: string, panelId: string) {
    const panel = await ownedPanel(this.prisma, userId, panelId);
    const jobs = await this.prisma.generationJob.findMany({
      where: { panelId: panel.id },
      orderBy: { createdAt: "desc" },
    });
    return jobs.map(toJobDetail);
  }

  async applyCallback(
    jobId: string,
    input: { status: CallbackStatus; sizeBytes?: number; errorCode?: string; errorMessage?: string },
  ): Promise<void> {
    if (input.status === "succeeded" && input.sizeBytes === undefined) {
      throw apiError(400, "VALIDATION_ERROR", "succeeded cần size_bytes");
    }
    const job = await this.prisma.generationJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw apiError(404, "NOT_FOUND", "Không tìm thấy job");
    }
    const effect = applyJobCallback(job.status, input.status);
    if (effect.type === "noop") {
      return;
    }
    if (effect.type === "conflict") {
      throw apiError(409, "CONFLICT", "Job không nhận trạng thái này");
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.generationJob.update({
        where: { id: job.id },
        data: {
          status: effect.jobStatus,
          startedAt: effect.jobStatus === "running" ? now : job.startedAt,
          finishedAt: effect.jobStatus === "succeeded" || effect.jobStatus === "failed" ? now : job.finishedAt,
          errorCode: effect.jobStatus === "failed" ? input.errorCode ?? "INFERENCE_FAILED" : job.errorCode,
          errorMessage: effect.jobStatus === "failed" ? input.errorMessage ?? null : job.errorMessage,
          idempotencyKey: effect.jobStatus === "succeeded" || effect.jobStatus === "failed" ? null : job.idempotencyKey,
        },
      });
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
    });
    this.logger.log(`job ${effect.jobStatus} job_id=${job.id} panel_id=${job.panelId}`);
  }

  private async discardPending(jobId: string, assetId: string): Promise<void> {
    await this.prisma.generationJob.delete({ where: { id: jobId } });
    await this.prisma.asset.delete({ where: { id: assetId } });
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

function toJobRef(job: GenerationJob) {
  return { job_id: job.id, status: job.status, panel_id: job.panelId };
}

function toJobDetail(job: GenerationJob) {
  return {
    job_id: job.id,
    panel_id: job.panelId,
    status: job.status,
    error_code: job.errorCode,
    error_message: job.errorMessage,
    result_asset_id: job.resultAssetId,
    attempt: job.attempt,
    created_at: job.createdAt.toISOString(),
    finished_at: job.finishedAt?.toISOString() ?? null,
  };
}
