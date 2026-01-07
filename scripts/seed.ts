import { faker } from "@faker-js/faker";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { sleep } from "../src/utils";

interface SampleJob {
  queueName: string;
  data: Record<string, any>;
}

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

const queueNames = Array.from({ length: 50 }, () => faker.hacker.verb());

const sampleJobs: SampleJob[] = Array.from({ length: 100_000 }).map(() => {
  return {
    queueName: faker.helpers.arrayElement(queueNames),
    data: {
      name: faker.person.firstName(),
      age: faker.number.int({ min: 18, max: 65 }),
      failed: Math.random() > 0.7,
      willWait: Math.random() > 0.5,
    },
  };
});

async function seedQueues() {
  await connection.flushdb();
  console.log("Database flushed!");

  console.log("Starting to seed BullMQ queues...");

  const queues: Record<string, Queue> = {};
  const workers: Record<string, Worker> = {};

  for (const jobData of sampleJobs) {
    if (!queues[jobData.queueName]) {
      queues[jobData.queueName] = new Queue(jobData.queueName, { connection });
      workers[jobData.queueName] = new Worker(
        jobData.queueName,
        async (job) => {
          if (job.data.failed) {
            throw new Error(`Error processing ${job.name}`);
          }

          return { result: faker.hacker.noun() };
        },
        { connection }
      );
      console.log(`Created queue: ${jobData.queueName}`);
    }
  }

  for (const jobData of sampleJobs.filter((job) => !job.data.willWait)) {
    const queue = queues[jobData.queueName];

    await queue.add(faker.hacker.noun(), jobData.data, {
      delay: Math.random() > 0.7 ? 60000 : 0,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });
  }

  console.log(`waiting for 10 seconds to process jobs`);

  await sleep(10000);

  console.log(`waiting completed!`);

  for (const worker of Object.values(workers)) {
    await worker.close();
  }

  for (const jobData of sampleJobs.filter((job) => job.data.willWait)) {
    const queue = queues[jobData.queueName];

    await queue.add(faker.hacker.noun(), jobData.data, {
      delay: Math.random() > 0.7 ? 60000 : 0,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    });
  }

  await connection.quit();
  process.exit(0);
}

seedQueues().catch(console.error);
