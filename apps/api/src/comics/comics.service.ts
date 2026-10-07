import { Injectable } from "@nestjs/common";
import { apiError } from "../http";
import { PrismaService } from "../prisma.service";
import { blankToNull, optionalText, ownedComic, ownedStory } from "./ownership";
import { toComic, toStory } from "./serializers";

@Injectable()
export class ComicsService {
  constructor(private readonly prisma: PrismaService) {}

  async createComic(userId: string, input: { title: string; description?: string; styleGuide?: string }) {
    const title = requiredTitle(input.title);
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
    return toComic(await ownedComic(this.prisma, userId, comicId));
  }

  async updateComic(
    userId: string,
    comicId: string,
    input: { title?: string; description?: string; styleGuide?: string; status?: "draft" | "active" },
  ) {
    const comic = await ownedComic(this.prisma, userId, comicId);
    const updated = await this.prisma.comic.update({
      where: { id: comic.id },
      data: {
        title: input.title === undefined ? undefined : requiredTitle(input.title),
        description: optionalText(input.description),
        styleGuide: optionalText(input.styleGuide),
        status: input.status,
      },
    });
    return toComic(updated);
  }

  async archiveComic(userId: string, comicId: string) {
    const comic = await ownedComic(this.prisma, userId, comicId);
    const updated = await this.prisma.comic.update({
      where: { id: comic.id },
      data: { status: "archived" },
    });
    return toComic(updated);
  }

  async getStory(userId: string, comicId: string) {
    return toStory(await ownedStory(this.prisma, userId, comicId));
  }

  async putStory(userId: string, comicId: string, input: { title: string; synopsis?: string; content?: string }) {
    const comic = await ownedComic(this.prisma, userId, comicId);
    const data = {
      title: requiredTitle(input.title),
      synopsis: blankToNull(input.synopsis),
      content: blankToNull(input.content),
    };
    const story = await this.prisma.story.upsert({
      where: { comicId: comic.id },
      create: { comicId: comic.id, ...data },
      update: data,
    });
    return toStory(story);
  }
}

function requiredTitle(value: string): string {
  const title = value.trim();
  if (!title) {
    throw apiError(400, "VALIDATION_ERROR", "Thiếu tiêu đề", [{ field: "title", issue: "required" }]);
  }
  return title;
}
