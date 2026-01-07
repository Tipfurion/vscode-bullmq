import { Redis, RedisOptions } from "ioredis";
import { logger } from "./logger";
import { Queue } from "bullmq";
import * as vscode from "vscode";

export class BullRedisConnection {
  private _name: string;

  private _client: Redis;

  private _config: RedisOptions;

  private _status: ConnectionStatus;

  private _prefix: string;

  private _queues: Map<string, Queue>;

  private _globalState: vscode.Memento;

  private _onQueuesExplored = new vscode.EventEmitter<{
    connectionName: string;
    queueCount: number;
  }>();

  public readonly onQueuesExplored = this._onQueuesExplored.event;

  public constructor({
    name,
    config,
    prefix,
    globalState,
  }: RedisConnectionOptions) {
    this._name = name;
    this._config = config;
    this._prefix = prefix || "bull";
    this._status = "idle";
    this._queues = new Map<string, Queue>();
    this._globalState = globalState;

    this._client = new Redis({
      ...this._config,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }

  public get name(): string {
    return this._name;
  }

  public get status(): ConnectionStatus {
    return this._status;
  }

  public get client(): Redis {
    return this._client;
  }

  public get prefix(): string {
    return this._prefix;
  }

  public get queues(): Map<string, Queue> {
    return this._queues;
  }

  public async connect(): Promise<Redis> {
    try {
      await this.client.connect();
      this._status = "connected";
      return this.client;
    } catch (error) {
      this._status = "failed";
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this._client) {
      await this._client.quit();
    }
  }

  public async exploreQueues(forceRefresh = false): Promise<void> {
    if (this.status === "failed" || this.status === "idle") {
      return;
    }

    if (Array.from(this.queues.values()).length && !forceRefresh) {
      return;
    }

    this._status = "loading-queues";

    const cachedQueueNames = this.getQueueNamesFromCache();

    const queueNames: string[] =
      forceRefresh || !Array.from(this.queues.values()).length
        ? await this.scanQueueNames()
        : cachedQueueNames;

    this.updateQueueNamesCache(queueNames);

    this._queues.clear();

    for (const queueName of queueNames) {
      const queue = new Queue(queueName, {
        connection: this._client,
        prefix: this._prefix,
      });

      this._queues.set(queueName, queue);
    }

    this._status = "ready";

    this._onQueuesExplored.fire({
      connectionName: this._name,
      queueCount: this._queues.size,
    });
  }

  private async scanQueueNames(): Promise<string[]> {
    const stream = this._client.scanStream({
      match: `${this._prefix}:*:id`,
      count: 1000,
    });
    const startScanTimestamp = Date.now();
    logger.info(`Scanning queues for connection ${this._name}...`);
    const queueNamesSet = new Set<string>();

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

    const endScanTimestamp = Date.now();

    logger.info(
      `Scanned queues for connection ${this._name} in ${
        endScanTimestamp - startScanTimestamp
      }ms`
    );

    const queueNames = Array.from(queueNamesSet);

    return queueNames;
  }

  private getQueueNamesFromCache(): string[] {
    const cacheKey = `bullmq:queues:${this._name}`;
    const cachedQueueNames = this._globalState.get<string[]>(cacheKey);
    if (cachedQueueNames && cachedQueueNames.length > 0) {
      return cachedQueueNames;
    }
    return [];
  }

  private updateQueueNamesCache(queueNames: string[]): void {
    const cacheKey = `bullmq:queues:${this._name}`;
    this._globalState.update(cacheKey, queueNames);
  }
}

export type ConnectionStatus =
  | "idle"
  | "connected"
  | "failed"
  | "loading-queues"
  | "ready";

interface RedisConnectionOptions {
  name: string;
  config: RedisOptions;
  prefix?: string;
  globalState: vscode.Memento;
}
