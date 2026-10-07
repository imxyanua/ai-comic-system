import { Character, Comic, DialogLine, Panel, Scene, Story } from "@prisma/client";

export function toComic(comic: Comic) {
  return {
    id: comic.id,
    title: comic.title,
    description: comic.description,
    style_guide: comic.styleGuide,
    status: comic.status,
    created_at: comic.createdAt.toISOString(),
    updated_at: comic.updatedAt.toISOString(),
  };
}

export function toStory(story: Story) {
  return {
    id: story.id,
    comic_id: story.comicId,
    title: story.title,
    synopsis: story.synopsis,
    content: story.content,
  };
}

export function toScene(scene: Scene) {
  return {
    id: scene.id,
    story_id: scene.storyId,
    sort_order: scene.sortOrder,
    title: scene.title,
    summary: scene.summary,
  };
}

export function toPanel(panel: Panel & { dialogLines?: DialogLine[] }) {
  return {
    id: panel.id,
    scene_id: panel.sceneId,
    sort_order: panel.sortOrder,
    image_prompt: panel.imagePrompt,
    negative_prompt: panel.negativePrompt,
    image_asset_id: panel.imageAssetId,
    generation_status: panel.generationStatus,
    dialog: (panel.dialogLines ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((line) => ({ speaker: line.speaker, text: line.text })),
  };
}

export function toCharacter(character: Character) {
  return {
    id: character.id,
    comic_id: character.comicId,
    name: character.name,
    description: character.description,
    reference_asset_id: character.referenceAssetId,
  };
}
