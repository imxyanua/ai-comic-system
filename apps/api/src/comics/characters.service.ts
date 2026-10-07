import { Injectable } from "@nestjs/common";
import { apiError } from "../http";
import { PrismaService } from "../prisma.service";
import { ownedCharacter, ownedComic } from "./ownership";
import { toCharacter } from "./serializers";

@Injectable()
export class CharactersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, comicId: string) {
    const comic = await ownedComic(this.prisma, userId, comicId);
    const characters = await this.prisma.character.findMany({
      where: { comicId: comic.id },
      orderBy: { createdAt: "asc" },
    });
    return characters.map(toCharacter);
  }

  async create(userId: string, comicId: string, input: { name: string; description: string }) {
    const comic = await ownedComic(this.prisma, userId, comicId);
    const character = await this.prisma.character.create({
      data: { comicId: comic.id, name: requiredName(input.name), description: input.description.trim() },
    });
    return toCharacter(character);
  }

  async update(
    userId: string,
    characterId: string,
    input: { name?: string; description?: string; reference_asset_id?: string | null },
  ) {
    const character = await ownedCharacter(this.prisma, userId, characterId);
    if (input.reference_asset_id) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: input.reference_asset_id, comicId: character.comicId, kind: "character_ref", status: "ready" },
      });
      if (!asset) {
        throw apiError(400, "VALIDATION_ERROR", "Ảnh tham chiếu chưa upload xong hoặc không thuộc comic này", [
          { field: "reference_asset_id", issue: "invalid" },
        ]);
      }
    }
    const updated = await this.prisma.character.update({
      where: { id: character.id },
      data: {
        name: input.name === undefined ? undefined : requiredName(input.name),
        description: input.description?.trim(),
        referenceAssetId: input.reference_asset_id,
      },
    });
    return toCharacter(updated);
  }

  async remove(userId: string, characterId: string): Promise<void> {
    const character = await ownedCharacter(this.prisma, userId, characterId);
    await this.prisma.character.delete({ where: { id: character.id } });
  }
}

function requiredName(value: string): string {
  const name = value.trim();
  if (!name) {
    throw apiError(400, "VALIDATION_ERROR", "Thiếu tên nhân vật", [{ field: "name", issue: "required" }]);
  }
  return name;
}
