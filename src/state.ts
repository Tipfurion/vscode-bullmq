import {} from "bullmq";
import { BullRedisConnection } from "./bull-redis-connection";

export const state = {
  redisConnections: new Map<string, BullRedisConnection>(),
};
