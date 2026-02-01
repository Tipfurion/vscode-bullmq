import * as vscode from "vscode";
import { Node } from "./node";
import { BullRedisConnection } from "../../bull-redis-connection";

export class ConnectionNode extends Node {
  public connection: BullRedisConnection;

  constructor(_connection: BullRedisConnection, queueCount: number) {
    const label = `${_connection.name} (${queueCount} ${
      queueCount === 1 ? "queue" : "queues"
    })`;
    super(label, vscode.TreeItemCollapsibleState.Collapsed);

    this.connection = _connection;
    this.id = `connection:${_connection.name}`;
    this.contextValue = "connection";

    if (_connection.status === "idle" || _connection.status === "connected") {
      this.iconPath = new vscode.ThemeIcon("server");
    }

    if (_connection.status === "loading-queues") {
      this.iconPath = new vscode.ThemeIcon("loading~spin");
    }

    if (_connection.status === "failed") {
      this.iconPath = new vscode.ThemeIcon(
        "server",
        new vscode.ThemeColor("charts.red")
      );
    }

    if (_connection.status === "ready") {
      this.iconPath = new vscode.ThemeIcon(
        "server",
        new vscode.ThemeColor("charts.green")
      );
    }
  }
}
