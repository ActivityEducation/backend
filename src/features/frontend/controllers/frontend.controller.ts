import { Controller, Get } from "@nestjs/common";

@Controller('fe')
export class FrontendController {
    @Get()
    public getPrimaryIndex() {
        return "please pardon our dust";
    }
}