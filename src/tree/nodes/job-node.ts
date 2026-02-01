import * as vscode from "vscode";
import { Job, JobState, Queue } from "bullmq";
import { Node } from "./node";

export class JobNode extends Node {
  public readonly job?: Job;
  public readonly jobId?: string;
  public readonly queue?: Queue;
  public readonly status?: JobState;

  constructor(jobOrId: string, queue?: Queue, status?: JobState) {
    super(jobOrId, vscode.TreeItemCollapsibleState.None);
    this.jobId = jobOrId;
    this.queue = queue;
    this.status = status;
    this.description = "";
    this.tooltip = `ID: ${jobOrId}`;

    this.contextValue = status === "delayed" ? "job.delayed" : "job";
    this.iconPath = new vscode.ThemeIcon("file-code");

    this.command = {
      command: "bullmq-explorer.showJob",
      title: "Show Job Details",
      arguments: [this, true], // true = preview mode
    };
  }
}
