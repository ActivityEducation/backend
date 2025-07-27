import { Controller, Get, Redirect } from "@nestjs/common";

@Controller('/')
export class FrontendController {
  @Get('/')
  @Redirect('/app', 302) // Redirects root requests to /app
  redirectToAppRoot() {
    // This method simply triggers the redirect.
    // The response is handled by @Redirect decorator.
  }
}