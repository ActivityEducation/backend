import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import Redis from "ioredis";

const redisClient = {
    provide: 'REDIS_CLIENT', // This is the token used by @InjectRedis()
    useFactory: (configService: ConfigService) => new Redis({
    host: configService.get<string>('REDIS_HOST'),
    port: configService.get<number>('REDIS_PORT'),
    }),
    inject: [ConfigService], // Inject ConfigService to get Redis connection details
};

@Module({
    imports: [ConfigModule],
    controllers: [],
    providers: [redisClient],
    exports: [redisClient]
})
export class RedisModule {}