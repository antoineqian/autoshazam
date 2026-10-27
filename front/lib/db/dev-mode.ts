import 'dotenv/config';
import { databaseConfig } from './config';

const config = databaseConfig();
console.log(config.managedLocal ? 'managed-local' : 'external');
