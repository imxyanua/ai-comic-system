import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ValidationError } from "class-validator";
import { AppModule } from "./app.module";
import { loadEnv } from "./env";
import { apiError } from "./http";
import { ApiExceptionFilter } from "./http-exception.filter";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({ origin: env.corsOrigin });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        apiError(
          400,
          "VALIDATION_ERROR",
          "Dữ liệu không hợp lệ",
          errors.map((error) => ({
            field: error.property,
            issue: Object.values(error.constraints ?? {})[0] ?? "invalid",
          })),
        ),
    }),
  );
  await app.listen(env.port, "0.0.0.0");
}

void bootstrap();
