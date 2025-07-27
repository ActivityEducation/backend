import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { FrontendController } from './controllers/frontend.controller';

const isProduction = false;
const reactAppPath = join(__dirname, '..', '..', '..', 'static');


@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: reactAppPath, // Use the dynamically determined path
      serveRoot: '/app', // Your React app will be served from /app/
      exclude: [
        '/api/*path',
        '/robots.txt',
        '/.well-known/*path',
        '/nodeinfo/*path',
        '/ns/*path',
        '/swagger',
        '/health',
      ],
      // renderPath: 'index.html', // Essential for client-side routing and refreshes

      // rootPath: reactBuildPath, // Absolute path to the React build output
      // renderPath: '*', // Crucial for client-side routing (React Router history fallback)
                        // Ensures any unmatched route serves index.html
      serveStaticOptions: {
        // maxAge: isProduction ? 31536000000 : 0, // Cache for 1 year in production, no cache in development
        // immutable: isProduction, // Enable immutable directive in production for hashed filenames
        // cacheControl: isProduction, // Enable Cache-Control header in production
        index: false, // Prevents directory listing for security
        // fallthrough: true, // Important for Fastify adapter to mimic Express's SPA fallback
      },
    }),
  ],
  controllers: [FrontendController],
  exports: [ServeStaticModule],
})
export class FrontendModule {
    onModuleInit() {
        console.log(`FrontendModule serving static files from: ${reactAppPath} at URL prefix: /app`);
    }
}