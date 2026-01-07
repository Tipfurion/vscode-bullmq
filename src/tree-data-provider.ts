import * as vscode from "vscode";
import { Queue, Job } from "bullmq";
import { BullRedisConnection } from "./bull-redis-connection";
import { BullRedisConnectionsProvider } from "./bull-redis-connections-provider";

export class BullMQTreeDataProvider implements vscode.TreeDataProvider<Node> {
  private needRefresh = false;

  private bullRedisConnectionsProvider: BullRedisConnectionsProvider;

  private _onDidChangeTreeData: vscode.EventEmitter<Node | undefined | void> =
    new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<Node | undefined | void> =
    this._onDidChangeTreeData.event;

  constructor(bullRedisConnectionsProvider: BullRedisConnectionsProvider) {
    this.bullRedisConnectionsProvider = bullRedisConnectionsProvider;

    this.bullRedisConnectionsProvider.initConnections();

    this.bullRedisConnectionsProvider.onConnectionAdded((connection) => {
      connection.exploreQueues();
      connection.onQueuesExplored(() => {
        this.refresh();
      });
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (!element) {
      return this.getConnections();
    }

    if (element instanceof ConnectionNode) {
      return this.getQueues(element.connection);
    }

    if (element instanceof QueueNode) {
      return this.getJobStatuses(element.queue);
    }

    if (element instanceof JobStatusNode) {
      return this.getJobs(element.queue, element.status);
    }

    return [];
  }

  private async getConnections(): Promise<ConnectionNode[]> {
    const connections = this.bullRedisConnectionsProvider.getConnections();

    return connections.map((connection) => new ConnectionNode(connection));
  }

  private async getQueues(
    connection: BullRedisConnection
  ): Promise<QueueNode[]> {
    const queues = Array.from(connection.queues.values());

    return queues.map((queue) => new QueueNode(queue, connection));
  }

  private getJobStatuses(queue: Queue): JobStatusNode[] {
    const statuses: (
      | "waiting"
      | "active"
      | "completed"
      | "failed"
      | "delayed"
    )[] = ["waiting", "active", "completed", "failed", "delayed"];
    return statuses.map((status) => new JobStatusNode(status, queue));
  }

  private async getJobs(
    queue: Queue,
    status: "waiting" | "active" | "completed" | "failed" | "delayed"
  ): Promise<JobNode[]> {
    const jobs = await queue.getJobs([status], 0, 100, true); // Limit to 100 for now
    return jobs.map((job) => new JobNode(job));
  }
}

export abstract class Node extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}

export class ConnectionNode extends Node {
  public connection: BullRedisConnection;

  constructor(_connection: BullRedisConnection) {
    super(_connection.name, vscode.TreeItemCollapsibleState.Collapsed);

    this.connection = _connection;
    this.contextValue = "connection";

    if (_connection.status === "idle" || _connection.status === "connected") {
      this.iconPath = new vscode.ThemeIcon("primitive-dot");
    }

    if (_connection.status === "loading-queues") {
      this.iconPath = new vscode.ThemeIcon("loading~spin");
    }

    if (_connection.status === "failed") {
      this.iconPath = new vscode.ThemeIcon(
        "primitive-dot",
        new vscode.ThemeColor("charts.red")
      );
    }

    if (_connection.status === "ready") {
      this.iconPath = new vscode.ThemeIcon(
        "primitive-dot",
        new vscode.ThemeColor("charts.green")
      );
    }
  }
}

export class QueueNode extends Node {
  public connection: BullRedisConnection;
  public queue: Queue;

  constructor(
    public readonly _queue: Queue,
    public readonly _connection: BullRedisConnection
  ) {
    super(_queue.name, vscode.TreeItemCollapsibleState.Collapsed);

    this.connection = _connection;
    this.queue = _queue;

    this.contextValue = "queue";

    this.iconPath = new vscode.ThemeIcon(
      this.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed
        ? "primitive-dot"
        : "primitive-dot"
    );
  }
}

export class JobStatusNode extends Node {
  constructor(
    public readonly status:
      | "waiting"
      | "active"
      | "completed"
      | "failed"
      | "delayed",
    public readonly queue: Queue
  ) {
    super(
      status.charAt(0).toUpperCase() + status.slice(1),
      vscode.TreeItemCollapsibleState.Collapsed
    );
    this.contextValue = "status";
    this.iconPath = new vscode.ThemeIcon("checklist");
  }
}

export class JobNode extends Node {
  constructor(public readonly job: Job) {
    super(job.id || "?", vscode.TreeItemCollapsibleState.None);
    this.description = job.name;
    this.tooltip = `ID: ${job.id}\nName: ${job.name}\nProgress: ${job.progress}`;
    this.contextValue = "job";
    this.iconPath = new vscode.ThemeIcon("gear");

    // Command to open job details (maybe can reuse or create a command to show json)
    // For now no command on click, but right click context menu works.
  }
}
