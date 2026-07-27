import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getAppInfo(): {
    message: string;
    version: string;
    environment: string;
    timestamp: string;
    docs: string;
  } {
    return {
      message: 'La Gambeta Backend API',
      version: '1.0.0',
      environment: this.configService.get('NODE_ENV', 'development'),
      timestamp: new Date().toISOString(),
      docs: '/api/docs',
    };
  }

  getHealthCheck(): {
    status: string;
    timestamp: string;
    uptime: { seconds: number; readable: string };
    memory: {
      rss: string;
      heapTotal: string;
      heapUsed: string;
      external: string;
    };
    environment: string;
    nodeVersion: string;
  } {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(uptime),
        readable: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
      },
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      },
      environment: this.configService.get('NODE_ENV', 'development'),
      nodeVersion: process.version,
    };
  }
}
