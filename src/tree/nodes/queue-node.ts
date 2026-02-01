import * as vscode from "vscode";
import { Queue } from "bullmq";
import { Node } from "./node";
import { BullRedisConnection } from "../../bull-redis-connection";

export class QueueNode extends Node {
  public connection: BullRedisConnection;
  public queue: Queue;

  constructor(
    public readonly _queue: Queue,
    public readonly _connection: BullRedisConnection,
    public readonly totalJobCount: number
  ) {
    const label = `${_queue.name} (${totalJobCount} ${
      totalJobCount === 1 ? "job" : "jobs"
    })`;
    super(label, vscode.TreeItemCollapsibleState.Collapsed);

    this.connection = _connection;
    this.queue = _queue;

    this.id = `queue:${_connection.name}:${_queue.name}`;
    this.contextValue = "queue";

    this.iconPath = new vscode.ThemeIcon("list-flat");
  }
}
