import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

const reactAppPath = join(__dirname, '..', '..', '..', 'static');

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: reactAppPath, // Use the dynamically determined path
      serveRoot: '/app', // Your React app will be served from /app/
      exclude: [
        '/api/(.*)',
        '/robots.txt',
        '/.well-known/(.*)',
        '/nodeinfo/(.*)',
        '/ns/(.*)',
        '/swagger',
        '/health',
      ],
      renderPath: 'index.html', // Essential for client-side routing and refreshes
    }),
  ],
  exports: [ServeStaticModule],
})
export class FrontendModule {
    onModuleInit() {
        console.log(`FrontendModule serving static files from: ${reactAppPath} at URL prefix: /app`);
    }
}