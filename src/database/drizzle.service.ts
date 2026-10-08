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
    const username = encodeURIComponent(
      this.configService.get<string>('DATABASE_USERNAME') ?? '',
    );
    const password = encodeURIComponent(
      this.configService.get<string>('DATABASE_PASSWORD') ?? '',
    );
    const connectionString = `postgresql://${username}:${password}@${this.configService.get<string>('DATABASE_HOST')}:${this.configService.get<string>('DATABASE_PORT')}/${this.configService.get<string>('DATABASE_NAME')}`;
    const ssl = this.configService.get<string>('DATABASE_SSL') === 'true';

    const client = postgres(connectionString, {
      max: 20,
      idle_timeout: 20,
      connect_timeout: 60,
      ssl: ssl ? 'require' : false,
    });

    this.db = drizzle(client, { schema, logger: false });
  }
}
