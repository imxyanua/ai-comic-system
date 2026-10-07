import { PrismaClient } from "@prisma/client";
import { apiError } from "../http";

export async function ownedComic(prisma: PrismaClient, userId: string, comicId: string) {
  const comic = await prisma.comic.findFirst({ where: { id: comicId, ownerId: userId } });
  if (!comic) {
    throw apiError(404, "NOT_FOUND", "Không tìm thấy comic");
  }
  return comic;
}

export async function ownedStory(prisma: PrismaClient, userId: string, comicId: string) {
  const comic = await ownedComic(prisma, userId, comicId);
  const story = await prisma.story.findUnique({ where: { comicId: comic.id } });
  if (!story) {
    throw apiError(404, "NOT_FOUND", "Không tìm thấy story");
  }
  return story;
}

export async function ownedScene(prisma: PrismaClient, userId: string, sceneId: string) {
  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, story: { comic: { ownerId: userId } } },
  });
  if (!scene) {
    throw apiError(404, "NOT_FOUND", "Không tìm thấy cảnh");
  }
  return scene;
}

export async function ownedPanel(prisma: PrismaClient, userId: string, panelId: string) {
  const panel = await prisma.panel.findFirst({
    where: { id: panelId, scene: { story: { comic: { ownerId: userId } } } },
  });
  if (!panel) {
    throw apiError(404, "NOT_FOUND", "Không tìm thấy panel");
  }
  return panel;
}

export async function ownedCharacter(prisma: PrismaClient, userId: string, characterId: string) {
  const character = await prisma.character.findFirst({
    where: { id: characterId, comic: { ownerId: userId } },
  });
  if (!character) {
    throw apiError(404, "NOT_FOUND", "Không tìm thấy nhân vật");
  }
  return character;
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function optionalText(value: string | null | undefined): string | null | undefined {
  return value === undefined ? undefined : blankToNull(value);
}
