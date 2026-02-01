import {} from "bullmq";
import { BullRedisConnection } from "./bull-redis-connection";

export interface FilterState {
  connectionName?: string; // exact connection name match
  queueName?: string; // exact queue name match
  queueNamePattern?: string;
  jobIdPattern?: string;
}

export type QueueSortOrder = "jobCountAsc" | "jobCountDesc" | "none";
export type JobSortOrder = "idAsc" | "idDesc" | "none";

export interface SortState {
  queueSort: QueueSortOrder;
  jobSort: JobSortOrder;
}

export const state = {
  redisConnections: new Map<string, BullRedisConnection>(),
  filter: undefined as FilterState | undefined,
  sort: undefined as SortState | undefined,
};
