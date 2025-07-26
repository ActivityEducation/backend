import { Controller, Get } from "@nestjs/common";

@Controller()
export class FrontendController {
    @Get()
    public getPrimaryIndex() {
        return "please pardon our dust";
    }
}