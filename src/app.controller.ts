import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator';
import { AppService } from './app.service';

@ApiTags('Application')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Returns application status and version information',
  })
  @ApiResponse({
    status: 200,
    description: 'Application is healthy',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        version: { type: 'string' },
        environment: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
  })
  getHello() {
    return this.appService.getAppInfo();
  }

  @Public()
  @Get('health')
  @ApiOperation({
    summary: 'Detailed health check',
    description: 'Returns detailed application health status',
  })
  @ApiResponse({
    status: 200,
    description: 'Detailed health information',
  })
  getHealth() {
    return this.appService.getHealthCheck();
  }
}
