/**
 * TypeORM DataSource — used by migrations CLI only.
 * The app uses app.module.ts with TypeOrmModule.forRootAsync at runtime.
 * 
 * Usage:
 *   npm run migration:generate --name=InitialSchema
 *   npm run migration:run
 *   npm run migration:revert
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'gigs4you',
  username: process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  synchronize: false,      // NEVER true in migrations datasource
  logging: false,
  entities:   [join(__dirname, '**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, 'migrations/**/*{.ts,.js}')],
  subscribers: [],
});
