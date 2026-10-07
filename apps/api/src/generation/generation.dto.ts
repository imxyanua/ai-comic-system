import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class GeneratePanelDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  seed?: number;

  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(2048)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(2048)
  height?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(150)
  steps?: number;
}

export class JobCallbackDto {
  @IsIn(["running", "succeeded", "failed"])
  status!: "running" | "succeeded" | "failed";

  @IsOptional()
  @IsInt()
  @Min(0)
  size_bytes?: number;

  @IsOptional()
  @IsString()
  error_code?: string;

  @IsOptional()
  @IsString()
  error_message?: string;
}
