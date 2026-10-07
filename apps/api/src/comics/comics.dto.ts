import { IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreateComicDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  style_guide?: string;
}

export class CreateSceneDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string;
}

export class CreatePanelDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsString()
  image_prompt?: string;

  @IsOptional()
  @IsString()
  negative_prompt?: string;
}
