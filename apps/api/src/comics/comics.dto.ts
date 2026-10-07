import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class CreateComicDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  style_guide?: string;
}

export class UpdateComicDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  style_guide?: string;

  @IsOptional()
  @IsIn(["draft", "active"])
  status?: "draft" | "active";
}

export class PutStoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  synopsis?: string;

  @IsOptional()
  @IsString()
  content?: string;
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

export class UpdateSceneDto extends CreateSceneDto {}

export class DialogLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  speaker!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DialogLineDto)
  dialog?: DialogLineDto[];
}

export class UpdatePanelDto {
  @IsOptional()
  @IsString()
  image_prompt?: string;

  @IsOptional()
  @IsString()
  negative_prompt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DialogLineDto)
  dialog?: DialogLineDto[];
}

export class PanelOrderDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID("all", { each: true })
  panel_ids!: string[];
}

export class CreateCharacterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;
}

export class UpdateCharacterDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
