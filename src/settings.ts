import { RedisOptions } from "ioredis";

export interface SettingsRedisConnection {
  name: string;
  prefix?: string;
  config: RedisOptions;
}
