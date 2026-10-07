import { Injectable } from "@nestjs/common";
import { Panel, Prisma } from "@prisma/client";
import { apiError } from "../http";
import { PrismaService } from "../prisma.service";

@Injectable()
export class ComicsService {
  constructor(private readonly prisma: PrismaService) {}

  async createComic(userId: string, input: { title: string; description?: string; styleGuide?: string }) {
    const title = input.title.trim();
    if (!title) {
      throw apiError(400, "VALIDATION_ERROR", "Thiếu tiêu đề");
    }
    const comic = await this.prisma.comic.create({
      data: {
        ownerId: userId,
        title,
        description: blankToNull(input.description),
        styleGuide: blankToNull(input.styleGuide),
        story: { create: { title } },
      },
    });
    return toComic(comic);
  }

  async listComics(userId: string) {
    const comics = await this.prisma.comic.findMany({
      where: { ownerId: userId, status: { not: "archived" } },
      orderBy: { createdAt: "desc" },
    });
    return comics.map(toComic);
  }

  async getComic(userId: string, comicId: string) {
    const comic = await this.ownedComic(userId, comicId);
    return toComic(comic);
  }

  async createScene(userId: string, comicId: string, input: { sortOrder?: number; title?: string; summary?: string }) {
    const comic = await this.ownedComic(userId, comicId);
    const story = await this.prisma.story.findUnique({ where: { comicId: comic.id } });
    if (!story) {
      throw apiError(404, "NOT_FOUND", "Không tìm thấy story");
    }
    const sortOrder = input.sortOrder ?? (await this.nextSceneOrder(story.id));
    try {
      const scene = await this.prisma.scene.create({
        data: {
          storyId: story.id,
          sortOrder,
          title: blankToNull(input.title),
          summary: blankToNull(input.summary),
        },
      });
      return toScene(scene);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw apiError(409, "CONFLICT", "Thứ tự cảnh đã tồn tại");
      }
      throw error;
    }
  }

  async listScenes(userId: string, comicId: string) {
    const comic = await this.ownedComic(userId, comicId);
    const story = await this.prisma.story.findUnique({ where: { comicId: comic.id } });
    if (!story) {
      return [];
    }
    const scenes = await this.prisma.scene.findMany({
      where: { storyId: story.id },
      orderBy: { sortOrder: "asc" },
    });
    return scenes.map(toScene);
  }

  async createPanel(
    userId: string,
    sceneId: string,
    input: { sortOrder?: number; imagePrompt?: string; negativePrompt?: string },
  ) {
    const scene = await this.ownedScene(userId, sceneId);
    const sortOrder = input.sortOrder ?? (await this.nextPanelOrder(scene.id));
    try {
      const panel = await this.prisma.panel.create({
        data: {
          sceneId: scene.id,
          sortOrder,
          imagePrompt: blankToNull(input.imagePrompt),
          negativePrompt: blankToNull(input.negativePrompt),
        },
      });
      return toPanel(panel);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw apiError(409, "CONFLICT", "Thứ tự panel đã tồn tại");
      }
      throw error;
    }
  }

  async listPanels(userId: string, sceneId: string) {
    const scene = await this.ownedScene(userId, sceneId);
    const panels = await this.prisma.panel.findMany({
      where: { sceneId: scene.id },
      orderBy: { sortOrder: "asc" },
    });
    return panels.map(toPanel);
  }

  private async ownedComic(userId: string, comicId: string) {
    const comic = await this.prisma.comic.findFirst({ where: { id: comicId, ownerId: userId } });
    if (!comic) {
      throw apiError(404, "NOT_FOUND", "Không tìm thấy comic");
    }
    return comic;
  }

  private async ownedScene(userId: string, sceneId: string) {
    const scene = await this.prisma.scene.findFirst({
      where: { id: sceneId, story: { comic: { ownerId: userId } } },
    });
    if (!scene) {
      throw apiError(404, "NOT_FOUND", "Không tìm thấy cảnh");
    }
    return scene;
  }

  private async nextSceneOrder(storyId: string): Promise<number> {
    const last = await this.prisma.scene.findFirst({
      where: { storyId },
      orderBy: { sortOrder: "desc" },
    });
    return last ? last.sortOrder + 1 : 0;
  }

  private async nextPanelOrder(sceneId: string): Promise<number> {
    const last = await this.prisma.panel.findFirst({
      where: { sceneId },
      orderBy: { sortOrder: "desc" },
    });
    return last ? last.sortOrder + 1 : 0;
  }
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function toComic(comic: {
  id: string;
  title: string;
  description: string | null;
  styleGuide: string | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: comic.id,
    title: comic.title,
    description: comic.description,
    style_guide: comic.styleGuide,
    status: comic.status,
    created_at: comic.createdAt.toISOString(),
  };
}

function toScene(scene: { id: string; storyId: string; sortOrder: number; title: string | null; summary: string | null }) {
  return {
    id: scene.id,
    story_id: scene.storyId,
    sort_order: scene.sortOrder,
    title: scene.title,
    summary: scene.summary,
  };
}

export function toPanel(panel: Panel) {
  return {
    id: panel.id,
    scene_id: panel.sceneId,
    sort_order: panel.sortOrder,
    image_prompt: panel.imagePrompt,
    negative_prompt: panel.negativePrompt,
    image_asset_id: panel.imageAssetId,
    generation_status: panel.generationStatus,
  };
}
