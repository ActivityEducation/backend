import { Module } from "@nestjs/common";
import { FrontendController } from "./controllers/frontend.controller";

@Module({
    controllers: [FrontendController]
})
export class FrontendModule {}