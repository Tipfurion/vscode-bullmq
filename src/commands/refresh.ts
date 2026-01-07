import { BullMQTreeDataProvider } from "../tree-data-provider";
import { BullRedisConnection } from "../bull-redis-connection";
import { Queue } from "bullmq";

export function refresh(bullMQTreeDataProvider: BullMQTreeDataProvider) {
  bullMQTreeDataProvider.refresh();
}

export async function refreshConnection(connection: BullRedisConnection) {
  await connection.exploreQueues(true);
}

export function refreshQueue(bullMQTreeDataProvider: BullMQTreeDataProvider) {
  bullMQTreeDataProvider.refresh();
}
