import "reflect-metadata";
import { createServer } from "http";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationError } from "class-validator";
import { AppModule } from "./app.module";
import { loadEnv } from "./env";
import { apiError } from "./http";
import { ApiExceptionFilter } from "./http-exception.filter";
import { internalPortOnly, securityHeaders } from "./security";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(internalPortOnly(env.internalPort));
  app.useBodyParser("json", { limit: "1mb" });
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
  createServer(app.getHttpAdapter().getInstance()).listen(env.internalPort, "0.0.0.0");
  new Logger("Bootstrap").log(`public port ${env.port}, internal port ${env.internalPort}`);
}

void bootstrap();
