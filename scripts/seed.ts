import { faker } from "@faker-js/faker";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { sleep } from "../src/utils";

interface SampleJob {
  queueName: string;
  data: Record<string, any>;
  statusType: "waiting" | "active" | "completed" | "failed" | "delayed";
}

type JobStatus = "waiting" | "active" | "completed" | "failed" | "delayed";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

// Parse command line arguments for total jobs count
const totalJobs = parseInt(
  process.argv[2] || process.env.TOTAL_JOBS || "100000",
  10
);

if (isNaN(totalJobs) || totalJobs < 1) {
  console.error("Invalid total jobs count. Please provide a positive number.");
  process.exit(1);
}

console.log(`Creating ${totalJobs.toLocaleString()} jobs...`);

const queueNames = Array.from({ length: 50 }, () => faker.hacker.verb());

// Distribute jobs across different statuses (20% each)
const statusDistribution: Record<JobStatus, number> = {
  waiting: Math.floor(totalJobs * 0.2),
  active: Math.floor(totalJobs * 0.2),
  completed: Math.floor(totalJobs * 0.2),
  failed: Math.floor(totalJobs * 0.2),
  delayed: Math.floor(totalJobs * 0.2),
};

// Add any remaining jobs to waiting
const remaining =
  totalJobs - Object.values(statusDistribution).reduce((a, b) => a + b, 0);
statusDistribution.waiting += remaining;

const sampleJobs: SampleJob[] = [];

// Create jobs for each status type
Object.entries(statusDistribution).forEach(([status, count]) => {
  for (let i = 0; i < count; i++) {
    sampleJobs.push({
      queueName: faker.helpers.arrayElement(queueNames),
      data: {
        name: faker.person.firstName(),
        age: faker.number.int({ min: 18, max: 65 }),
        statusType: status as JobStatus,
        // Mark jobs that should fail
        shouldFail: status === "failed",
        // Mark jobs that should process slowly (to keep them active)
        slowProcess: status === "active",
      },
      statusType: status as JobStatus,
    });
  }
});

// Shuffle jobs to randomize their order
const shuffledJobs = faker.helpers.shuffle(sampleJobs);

async function seedQueues() {
  await connection.flushdb();
  console.log("Database flushed!");

  console.log("Starting to seed BullMQ queues...");
  console.log(`Job distribution:`, statusDistribution);

  const queues: Record<string, Queue> = {};
  const workers: Record<string, Worker> = {};

  // Create queues and workers for all unique queue names
  const uniqueQueueNames = [...new Set(shuffledJobs.map((j) => j.queueName))];
  for (const queueName of uniqueQueueNames) {
    queues[queueName] = new Queue(queueName, { connection });
    workers[queueName] = new Worker(
      queueName,
      async (job) => {
        // For jobs that should fail
        if (job.data.shouldFail) {
          throw new Error(`Error processing ${job.name || job.id}`);
        }

        // For jobs that should process slowly (to keep them active)
        if (job.data.slowProcess) {
          await sleep(Math.random() * 5000 + 2000); // 2-7 seconds
        }

        return { result: faker.hacker.noun() };
      },
      { connection, concurrency: 5 }
    );
  }
  console.log(`Created ${uniqueQueueNames.length} queues with workers`);

  // Separate jobs by status type
  const waitingJobs = shuffledJobs.filter((j) => j.statusType === "waiting");
  const activeJobs = shuffledJobs.filter((j) => j.statusType === "active");
  const completedJobs = shuffledJobs.filter(
    (j) => j.statusType === "completed"
  );
  const failedJobs = shuffledJobs.filter((j) => j.statusType === "failed");
  const delayedJobs = shuffledJobs.filter((j) => j.statusType === "delayed");

  // Step 1: Add jobs that should complete successfully
  console.log(`Adding ${completedJobs.length} jobs to complete...`);
  for (const jobData of completedJobs) {
    const queue = queues[jobData.queueName];
    await queue.add(faker.hacker.noun(), jobData.data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });
  }

  // Step 2: Add jobs that should fail
  console.log(`Adding ${failedJobs.length} jobs that will fail...`);
  for (const jobData of failedJobs) {
    const queue = queues[jobData.queueName];
    await queue.add(faker.hacker.noun(), jobData.data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });
  }

  // Step 3: Process completed and failed jobs (wait for workers to process them)
  console.log("Waiting for jobs to be processed (completed and failed)...");
  await sleep(15000); // Give workers time to process jobs

  // Step 4: Add delayed jobs (they won't be processed until delay expires)
  console.log(`Adding ${delayedJobs.length} delayed jobs...`);
  for (const jobData of delayedJobs) {
    const queue = queues[jobData.queueName];
    await queue.add(faker.hacker.noun(), jobData.data, {
      delay: Math.random() * 120000 + 30000, // 30 seconds to 2.5 minutes
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });
  }

  // Step 5: Add waiting jobs first (before closing workers, but they won't be processed yet)
  // Actually, we'll add them after closing workers to ensure they stay waiting
  // First, let's close workers temporarily to add waiting jobs
  console.log("Temporarily closing workers to add waiting jobs...");
  for (const worker of Object.values(workers)) {
    await worker.close();
  }

  console.log(`Adding ${waitingJobs.length} waiting jobs...`);
  for (const jobData of waitingJobs) {
    const queue = queues[jobData.queueName];
    await queue.add(faker.hacker.noun(), jobData.data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });
  }

  // Step 6: Recreate workers for active jobs
  console.log("Recreating workers for active jobs...");
  for (const queueName of uniqueQueueNames) {
    workers[queueName] = new Worker(
      queueName,
      async (job) => {
        // For jobs that should fail (shouldn't be any in active jobs, but just in case)
        if (job.data.shouldFail) {
          throw new Error(`Error processing ${job.name || job.id}`);
        }

        // For jobs that should process slowly (to keep them active)
        if (job.data.slowProcess) {
          await sleep(Math.random() * 5000 + 2000); // 2-7 seconds
        }

        return { result: faker.hacker.noun() };
      },
      { connection, concurrency: 5 }
    );
  }

  // Step 7: Add jobs that should remain active (slow processing)
  console.log(`Adding ${activeJobs.length} jobs that will remain active...`);
  for (const jobData of activeJobs) {
    const queue = queues[jobData.queueName];
    await queue.add(faker.hacker.noun(), jobData.data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });
  }

  // Wait for active jobs to start processing (they take 2-7 seconds)
  // Don't wait for them to complete - they should remain active
  console.log("Waiting for active jobs to start processing...");
  await sleep(3000);

  // Don't close workers - let them keep processing active jobs
  // When the script exits, they'll be cleaned up by the process

  console.log("Seeding completed!");
  console.log("Summary:");
  console.log(
    `  - Waiting jobs: ${waitingJobs.length} (no workers to process them)`
  );
  console.log(
    `  - Active jobs: ${activeJobs.length} (processing slowly, workers still running)`
  );
  console.log(`  - Completed jobs: ${completedJobs.length}`);
  console.log(`  - Failed jobs: ${failedJobs.length}`);
  console.log(`  - Delayed jobs: ${delayedJobs.length} (scheduled for future)`);
  console.log(
    "\nNote: Active jobs will continue processing until workers complete them."
  );
  console.log("Closing queues and workers...");

  // Close queues
  for (const queue of Object.values(queues)) {
    await queue.close();
  }

  // Close workers (active jobs will finish processing or move back to waiting)
  for (const worker of Object.values(workers)) {
    await worker.close();
  }

  await connection.quit();
  process.exit(0);
}

seedQueues().catch(console.error);
