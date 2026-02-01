import { faker } from "@faker-js/faker";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { sleep } from "../src/utils";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const prefix = process.env.BULLMQ_PREFIX || "bull";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

// Parse command line arguments
const processDelay = parseInt(
  process.argv[2] || process.env.PROCESS_DELAY || "1000",
  10
);
const failureRate = parseFloat(
  process.argv[3] || process.env.FAILURE_RATE || "0.3"
); // 30% failure rate by default
const createInterval = parseInt(
  process.argv[4] || process.env.CREATE_INTERVAL || "5000",
  10
); // Create jobs every 5 seconds by default
const jobsPerInterval = parseInt(
  process.argv[5] || process.env.JOBS_PER_INTERVAL || "3",
  10
); // Create 3 jobs per interval by default

if (isNaN(processDelay) || processDelay < 0) {
  console.error("Invalid process delay. Please provide a non-negative number.");
  process.exit(1);
}

if (isNaN(failureRate) || failureRate < 0 || failureRate > 1) {
  console.error(
    "Invalid failure rate. Please provide a number between 0 and 1."
  );
  process.exit(1);
}

if (isNaN(createInterval) || createInterval < 0) {
  console.error(
    "Invalid create interval. Please provide a non-negative number."
  );
  process.exit(1);
}

if (isNaN(jobsPerInterval) || jobsPerInterval < 1) {
  console.error("Invalid jobs per interval. Please provide a positive number.");
  process.exit(1);
}

console.log(`Starting job processing...`);
console.log(`Process delay: ${processDelay}ms`);
console.log(`Failure rate: ${(failureRate * 100).toFixed(1)}%`);
console.log(`Job creation interval: ${createInterval}ms`);
console.log(`Jobs created per interval: ${jobsPerInterval}`);

/**
 * Scans Redis to find all BullMQ queue names
 */
async function discoverQueues(): Promise<string[]> {
  const queueNamesSet = new Set<string>();
  const stream = connection.scanStream({
    match: `${prefix}:*:id`,
    count: 1000,
  });

  for await (const keys of stream) {
    for (const key of keys) {
      const parts = key.split(":");
      if (parts.length >= 3) {
        const queueName = parts[1];
        if (queueName && queueName !== "" && queueName !== "*") {
          queueNamesSet.add(queueName);
        }
      }
    }
  }

  return Array.from(queueNamesSet);
}

/**
 * Creates a new job in a random queue
 */
async function createJob(
  queues: Record<string, Queue>,
  queueNames: string[]
): Promise<void> {
  if (queueNames.length === 0) return;

  const queueName = faker.helpers.arrayElement(queueNames);
  const queue = queues[queueName];

  const jobData = {
    name: faker.person.firstName(),
    age: faker.number.int({ min: 18, max: 65 }),
    email: faker.internet.email(),
    createdAt: new Date().toISOString(),
  };

  const jobName = faker.hacker.noun();
  await queue.add(jobName, jobData, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  });

  console.log(`➕ Created job "${jobName}" in queue "${queueName}"`);
}

/**
 * Starts periodic job creation
 */
function startPeriodicJobCreation(
  queues: Record<string, Queue>,
  queueNames: string[]
): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      for (let i = 0; i < jobsPerInterval; i++) {
        await createJob(queues, queueNames);
      }
    } catch (error) {
      console.error("Error creating jobs:", error);
    }
  }, createInterval);
}

/**
 * Creates workers for all discovered queues
 */
async function processAllQueues() {
  try {
    console.log("Discovering queues...");
    const queueNames = await discoverQueues();

    if (queueNames.length === 0) {
      console.log("No queues found. Exiting.");
      await connection.quit();
      process.exit(0);
    }

    console.log(
      `Found ${queueNames.length} queue(s): ${queueNames.join(", ")}`
    );

    const workers: Record<string, Worker> = {};
    const queues: Record<string, Queue> = {};

    // Create queues and workers
    for (const queueName of queueNames) {
      queues[queueName] = new Queue(queueName, { connection, prefix });
      workers[queueName] = new Worker(
        queueName,
        async (job) => {
          console.log(
            `[${queueName}] Processing job ${job.id} (${
              job.name || "unnamed"
            })...`
          );

          // Simulate processing delay
          await sleep(processDelay);

          // Determine if job should fail based on failure rate
          const shouldFail = Math.random() < failureRate;

          if (shouldFail) {
            const errorMessage = `Job ${
              job.id
            } failed intentionally (failure rate: ${(failureRate * 100).toFixed(
              1
            )}%)`;
            console.error(`[${queueName}] ❌ ${errorMessage}`);
            throw new Error(errorMessage);
          }

          // Job succeeded
          const result = {
            processedAt: new Date().toISOString(),
            queueName,
            jobId: job.id,
            data: job.data,
          };
          console.log(`[${queueName}] ✅ Job ${job.id} completed successfully`);
          return result;
        },
        {
          connection,
          prefix,
          concurrency: 5, // Process up to 5 jobs concurrently per queue
        }
      );

      // Set up event handlers for worker
      workers[queueName].on("completed", (job) => {
        console.log(`[${queueName}] ✓ Job ${job.id} completed`);
      });

      workers[queueName].on("failed", (job, err) => {
        console.error(
          `[${queueName}] ✗ Job ${job?.id || "unknown"} failed: ${err.message}`
        );
      });

      workers[queueName].on("error", (err) => {
        console.error(`[${queueName}] Worker error: ${err.message}`);
      });
    }

    console.log(
      `\n✅ Started processing jobs from ${queueNames.length} queue(s)`
    );
    console.log("Workers are running... Press Ctrl+C to stop.\n");

    // Start periodic job creation
    const jobCreationInterval = startPeriodicJobCreation(queues, queueNames);
    console.log(
      `📝 Periodic job creation started: ${jobsPerInterval} job(s) every ${createInterval}ms\n`
    );

    // Keep the process alive and handle graceful shutdown
    const shutdown = async () => {
      console.log("\n\nShutting down...");
      clearInterval(jobCreationInterval);
      console.log("Stopped job creation");
      await Promise.all(Object.values(workers).map((worker) => worker.close()));
      await Promise.all(Object.values(queues).map((queue) => queue.close()));
      await connection.quit();
      console.log("Shutdown complete.");
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Error processing queues:", error);
    await connection.quit();
    process.exit(1);
  }
}

processAllQueues().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
