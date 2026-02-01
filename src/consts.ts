export const SUCCEESS_CONNECTTION_COLOR = "#20c906";
export const ERROR_CONNECTTION_COLOR = "#dc3545";
import { JobState } from "bullmq";

export const BULL_JOB_STATUS: Record<JobState, JobState> = {
  waiting: "waiting",
  active: "active",
  completed: "completed",
  failed: "failed",
  delayed: "delayed",
  prioritized: "prioritized",
  "waiting-children": "waiting-children",
} as const;
