import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { CurrentUserId } from "./current-user.decorator";
import { LoginDto, RegisterDto } from "./auth.dto";

@Controller("api/v1/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() body: RegisterDto): Promise<{ id: string; email: string }> {
    return this.auth.register(body.email, body.password);
  }

  @Post("login")
  login(@Body() body: LoginDto): Promise<{ access_token: string }> {
    return this.auth.login(body.email, body.password);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUserId() userId: string): Promise<{ id: string; email: string }> {
    return this.auth.me(userId);
  }
}
