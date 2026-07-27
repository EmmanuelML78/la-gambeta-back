import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import postgres = require('postgres');
import * as schema from './schema';

@Injectable()
export class DrizzleService {
  public readonly db: PostgresJsDatabase<typeof schema>;

  constructor(private readonly configService: ConfigService) {
    const connectionString = `postgresql://${this.configService.get('DATABASE_USERNAME')}:${this.configService.get('DATABASE_PASSWORD')}@${this.configService.get('DATABASE_HOST')}:${this.configService.get('DATABASE_PORT')}/${this.configService.get('DATABASE_NAME')}`;

    const client = postgres(connectionString, {
      max: 20,
      idle_timeout: 20,
      connect_timeout: 60,
      ssl: false,
    });

    this.db = drizzle(client, { schema, logger: true });
  }
}
