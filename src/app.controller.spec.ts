import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: { get: (_key: string, fallback: string) => fallback },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('returns the application information', () => {
      const result = appController.getHello();

      expect(result).toMatchObject({
        message: 'La Gambeta Backend API',
        version: '1.0.0',
        environment: 'development',
        docs: '/api/docs',
      });
      expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
    });
  });
});
