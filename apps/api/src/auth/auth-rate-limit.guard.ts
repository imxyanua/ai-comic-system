import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request, Response } from "express";
import { apiError } from "../http";
import { RateLimiter } from "./rate-limiter";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly login = new RateLimiter(10, FIFTEEN_MINUTES);
  private readonly register = new RateLimiter(20, ONE_HOUR);

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const ip = request.ip ?? request.socket.remoteAddress ?? "unknown";
    const isLogin = request.path.endsWith("/login");
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const retryAfter = isLogin ? this.login.hit(`${ip}|${email}`) : this.register.hit(ip);
    if (retryAfter > 0) {
      http.getResponse<Response>().setHeader("Retry-After", String(retryAfter));
      throw apiError(429, "TOO_MANY_REQUESTS", `Thử quá nhiều lần. Thử lại sau ${retryAfter} giây`);
    }
    return true;
  }
}
