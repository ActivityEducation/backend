import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { FrontendController } from './controllers/frontend.controller';

const feDir = join(__dirname, '..', '..', '..', 'static');

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: feDir,
      exclude: [
        '/api*',
        '/robots.txt',
        '/.well-known/(.*)',
        '/nodeinfo/(.*)',
        '/ns/(.*)',
        '/swagger',
        '/health',
      ], // Exclude your API routes
    }),
  ],
  exports: [ServeStaticModule],
  controllers: [FrontendController],
})
export class FrontendModule {
    onModuleInit() {
        console.log(feDir);
    }
}
