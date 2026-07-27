/**
 * Logger Module
 * Configures and provides the Winston logger throughout the application
 */

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAppLogger } from '../../infrastructure/config/logger.config';
import { LoggerService } from './logger.service';

@Global()
@Module({
  providers: [
    {
      provide: 'WINSTON_LOGGER',
      useFactory: (configService: ConfigService) => {
        const environment = configService.get<string>(
          'NODE_ENV',
          'development',
        );
        return createAppLogger(environment);
      },
      inject: [ConfigService],
    },
    LoggerService,
  ],
  exports: ['WINSTON_LOGGER', LoggerService],
})
export class LoggerModule {}
