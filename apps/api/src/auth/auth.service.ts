import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Env } from "../env";
import { apiError } from "../http";
import { PrismaService } from "../prisma.service";
import { APP_ENV } from "../tokens";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  async register(emailRaw: string, password: string): Promise<{ id: string; email: string }> {
    const email = emailRaw.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const user = await this.prisma.user.create({ data: { email, passwordHash } });
      return { id: user.id, email: user.email };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw apiError(409, "CONFLICT", "Email đã được đăng ký");
      }
      throw error;
    }
  }

  async login(emailRaw: string, password: string): Promise<{ access_token: string }> {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw apiError(401, "UNAUTHORIZED", "Email hoặc mật khẩu không đúng");
    }
    const access_token = jwt.sign({ sub: user.id }, this.env.jwtSecret, { expiresIn: TOKEN_TTL_SECONDS });
    return { access_token };
  }

  async me(userId: string): Promise<{ id: string; email: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw apiError(401, "UNAUTHORIZED", "Phiên đăng nhập không còn hiệu lực");
    }
    return { id: user.id, email: user.email };
  }

  userIdFromToken(header: string | undefined): string {
    if (!header?.startsWith("Bearer ")) {
      throw apiError(401, "UNAUTHORIZED", "Thiếu token");
    }
    try {
      const payload = jwt.verify(header.slice("Bearer ".length), this.env.jwtSecret);
      if (typeof payload === "string" || typeof payload.sub !== "string") {
        throw apiError(401, "UNAUTHORIZED", "Token không hợp lệ");
      }
      return payload.sub;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
        throw apiError(401, "UNAUTHORIZED", "Token không hợp lệ");
      }
      throw error;
    }
  }
}
