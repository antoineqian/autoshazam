import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';
import { databaseConfig } from './config';

dotenv.config();

const config = databaseConfig();
export const client = postgres(config.connectionString, config.options);
export const db = drizzle(client, { schema });
