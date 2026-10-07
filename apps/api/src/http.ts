import { HttpException } from "@nestjs/common";

export function apiError(
  status: number,
  code: string,
  message: string,
  details: { field?: string; issue: string }[] = [],
): HttpException {
  return new HttpException({ error: { code, message, details } }, status);
}
