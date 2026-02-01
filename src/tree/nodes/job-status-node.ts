import * as vscode from "vscode";
import { JobState, Queue } from "bullmq";
import { Node } from "./node";

export class JobStatusNode extends Node {
  constructor(
    public readonly status: JobState,
    public readonly queue: Queue,
    public readonly jobCount: number,
    public readonly connectionName?: string
  ) {
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const label = `${statusLabel} (${jobCount} ${
      jobCount === 1 ? "job" : "jobs"
    })`;
    super(label, vscode.TreeItemCollapsibleState.Collapsed);

    if (connectionName) {
      this.id = `status:${connectionName}:${queue.name}:${status}`;
    } else {
      this.id = `status:${queue.name}:${status}`;
    }

    this.contextValue = "status";

    switch (status) {
      case "waiting":
        this.iconPath = new vscode.ThemeIcon("clock");
        break;
      case "waiting-children":
        this.iconPath = new vscode.ThemeIcon("clock");
        break;
      case "active":
        this.iconPath = new vscode.ThemeIcon("sync~spin");
        break;
      case "completed":
        this.iconPath = new vscode.ThemeIcon(
          "check",
          new vscode.ThemeColor("charts.green")
        );
        break;
      case "failed":
        this.iconPath = new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("charts.red")
        );
        break;
      case "delayed":
        this.iconPath = new vscode.ThemeIcon("calendar");
        break;

      case "prioritized":
        this.iconPath = new vscode.ThemeIcon("star-full");
        break;
      default:
        this.iconPath = new vscode.ThemeIcon("checklist");
    }
  }
}
