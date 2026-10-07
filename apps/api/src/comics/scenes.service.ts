import { Injectable } from "@nestjs/common";
import { JobStatus, Prisma } from "@prisma/client";
import { apiError } from "../http";
import { PrismaService } from "../prisma.service";
import { blankToNull, optionalText, ownedPanel, ownedScene, ownedStory } from "./ownership";
import { toPanel, toScene } from "./serializers";

type DialogInput = { speaker: string; text: string }[];

const ACTIVE_JOB: { status: { in: JobStatus[] } } = { status: { in: ["pending", "queued", "running"] } };

@Injectable()
export class ScenesService {
  constructor(private readonly prisma: PrismaService) {}

  async listScenes(userId: string, comicId: string) {
    const story = await ownedStory(this.prisma, userId, comicId);
    const scenes = await this.prisma.scene.findMany({
      where: { storyId: story.id },
      orderBy: { sortOrder: "asc" },
    });
    return scenes.map(toScene);
  }

  async createScene(userId: string, comicId: string, input: { sortOrder?: number; title?: string; summary?: string }) {
    const story = await ownedStory(this.prisma, userId, comicId);
    const sortOrder = input.sortOrder ?? (await this.nextSceneOrder(story.id));
    const scene = await uniqueOrConflict("Thứ tự cảnh đã tồn tại", () =>
      this.prisma.scene.create({
        data: {
          storyId: story.id,
          sortOrder,
          title: blankToNull(input.title),
          summary: blankToNull(input.summary),
        },
      }),
    );
    return toScene(scene);
  }

  async updateScene(userId: string, sceneId: string, input: { sortOrder?: number; title?: string; summary?: string }) {
    const scene = await ownedScene(this.prisma, userId, sceneId);
    const updated = await uniqueOrConflict("Thứ tự cảnh đã tồn tại", () =>
      this.prisma.scene.update({
        where: { id: scene.id },
        data: {
          sortOrder: input.sortOrder,
          title: optionalText(input.title),
          summary: optionalText(input.summary),
        },
      }),
    );
    return toScene(updated);
  }

  async deleteScene(userId: string, sceneId: string): Promise<void> {
    const scene = await ownedScene(this.prisma, userId, sceneId);
    const active = await this.prisma.generationJob.count({
      where: { panel: { sceneId: scene.id }, ...ACTIVE_JOB },
    });
    if (active > 0) {
      throw apiError(409, "CONFLICT", "Cảnh còn job đang chạy");
    }
    await this.prisma.scene.delete({ where: { id: scene.id } });
  }

  async listPanels(userId: string, sceneId: string) {
    const scene = await ownedScene(this.prisma, userId, sceneId);
    const panels = await this.prisma.panel.findMany({
      where: { sceneId: scene.id },
      orderBy: { sortOrder: "asc" },
      include: { dialogLines: true },
    });
    return panels.map(toPanel);
  }

  async createPanel(
    userId: string,
    sceneId: string,
    input: { sortOrder?: number; imagePrompt?: string; negativePrompt?: string; dialog?: DialogInput },
  ) {
    const scene = await ownedScene(this.prisma, userId, sceneId);
    const sortOrder = input.sortOrder ?? (await this.nextPanelOrder(scene.id));
    const panel = await uniqueOrConflict("Thứ tự panel đã tồn tại", () =>
      this.prisma.panel.create({
        data: {
          sceneId: scene.id,
          sortOrder,
          imagePrompt: blankToNull(input.imagePrompt),
          negativePrompt: blankToNull(input.negativePrompt),
          dialogLines: { create: dialogRows(input.dialog ?? []) },
        },
        include: { dialogLines: true },
      }),
    );
    return toPanel(panel);
  }

  async updatePanel(
    userId: string,
    panelId: string,
    input: { imagePrompt?: string; negativePrompt?: string; dialog?: DialogInput },
  ) {
    const panel = await ownedPanel(this.prisma, userId, panelId);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.dialog !== undefined) {
        await tx.dialogLine.deleteMany({ where: { panelId: panel.id } });
        await tx.dialogLine.createMany({
          data: dialogRows(input.dialog).map((row) => ({ ...row, panelId: panel.id })),
        });
      }
      return tx.panel.update({
        where: { id: panel.id },
        data: {
          imagePrompt: optionalText(input.imagePrompt),
          negativePrompt: optionalText(input.negativePrompt),
        },
        include: { dialogLines: true },
      });
    });
    return toPanel(updated);
  }

  async deletePanel(userId: string, panelId: string): Promise<void> {
    const panel = await ownedPanel(this.prisma, userId, panelId);
    const active = await this.prisma.generationJob.count({ where: { panelId: panel.id, ...ACTIVE_JOB } });
    if (active > 0) {
      throw apiError(409, "CONFLICT", "Panel còn job đang chạy");
    }
    await this.prisma.panel.delete({ where: { id: panel.id } });
  }

  async reorderPanels(userId: string, sceneId: string, panelIds: string[]) {
    const scene = await ownedScene(this.prisma, userId, sceneId);
    const current = await this.prisma.panel.findMany({ where: { sceneId: scene.id }, select: { id: true } });
    const currentIds = new Set(current.map((panel) => panel.id));
    if (panelIds.length !== currentIds.size || panelIds.some((id) => !currentIds.has(id))) {
      throw apiError(400, "VALIDATION_ERROR", "panel_ids phải gồm đúng mọi panel của cảnh", [
        { field: "panel_ids", issue: "mismatch" },
      ]);
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of panelIds.entries()) {
        await tx.panel.update({ where: { id }, data: { sortOrder: -(index + 1) } });
      }
      for (const [index, id] of panelIds.entries()) {
        await tx.panel.update({ where: { id }, data: { sortOrder: index } });
      }
    });
    return this.listPanels(userId, sceneId);
  }

  private async nextSceneOrder(storyId: string): Promise<number> {
    const last = await this.prisma.scene.findFirst({ where: { storyId }, orderBy: { sortOrder: "desc" } });
    return last ? last.sortOrder + 1 : 0;
  }

  private async nextPanelOrder(sceneId: string): Promise<number> {
    const last = await this.prisma.panel.findFirst({ where: { sceneId }, orderBy: { sortOrder: "desc" } });
    return last ? last.sortOrder + 1 : 0;
  }
}

function dialogRows(dialog: DialogInput) {
  return dialog.map((line, index) => ({
    sortOrder: index,
    speaker: line.speaker.trim(),
    text: line.text.trim(),
  }));
}

async function uniqueOrConflict<T>(message: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw apiError(409, "CONFLICT", message);
    }
    throw error;
  }
}
