import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUserId } from "../auth/current-user.decorator";
import { CharactersService } from "./characters.service";
import { CreateCharacterDto, UpdateCharacterDto } from "./comics.dto";

@Controller("api/v1")
@UseGuards(AuthGuard)
export class CharactersController {
  constructor(private readonly characters: CharactersService) {}

  @Get("comics/:comicId/characters")
  list(@CurrentUserId() userId: string, @Param("comicId", ParseUUIDPipe) comicId: string) {
    return this.characters.list(userId, comicId);
  }

  @Post("comics/:comicId/characters")
  create(
    @CurrentUserId() userId: string,
    @Param("comicId", ParseUUIDPipe) comicId: string,
    @Body() body: CreateCharacterDto,
  ) {
    return this.characters.create(userId, comicId, body);
  }

  @Patch("characters/:characterId")
  update(
    @CurrentUserId() userId: string,
    @Param("characterId", ParseUUIDPipe) characterId: string,
    @Body() body: UpdateCharacterDto,
  ) {
    return this.characters.update(userId, characterId, body);
  }

  @Delete("characters/:characterId")
  @HttpCode(204)
  remove(@CurrentUserId() userId: string, @Param("characterId", ParseUUIDPipe) characterId: string) {
    return this.characters.remove(userId, characterId);
  }
}
