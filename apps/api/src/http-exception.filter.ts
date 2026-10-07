import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Response } from "express";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (isApiBody(body)) {
        response.status(exception.getStatus()).json(body);
        return;
      }
      const status = exception.getStatus();
      response.status(status).json({
        error: {
          code: status === 401 ? "UNAUTHORIZED" : status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR",
          message: typeof body === "string" ? body : exception.message,
          details: [],
        },
      });
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: "INTERNAL", message: "Lỗi máy chủ", details: [] },
    });
  }
}

function isApiBody(body: unknown): body is { error: { code: string } } {
  return typeof body === "object" && body !== null && "error" in body;
}
