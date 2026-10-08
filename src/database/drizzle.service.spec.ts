import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { DrizzleService } from './drizzle.service';
import * as schema from './schema';

jest.mock('drizzle-orm/postgres-js', () => ({
  drizzle: jest.fn(() => ({})),
}));
jest.mock('postgres', () => jest.fn(() => ({ end: jest.fn() })));

describe('DrizzleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('disables Drizzle query logging so bound parameters are not logged', () => {
    const configValues: Record<string, string> = {
      DATABASE_USERNAME: 'synthetic-user',
      DATABASE_PASSWORD: 'synthetic-password',
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '5432',
      DATABASE_NAME: 'synthetic-database',
      DATABASE_SSL: 'false',
    };
    const configService = {
      get: jest.fn((key: string) => configValues[key]),
    } as unknown as ConfigService;

    new DrizzleService(configService);

    expect(drizzle).toHaveBeenCalledWith(expect.anything(), {
      schema,
      logger: false,
    });
  });
});
