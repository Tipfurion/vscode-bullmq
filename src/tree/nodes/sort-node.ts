import * as vscode from "vscode";
import { Node } from "./node";
import { SortState } from "../../state";

export class SortNode extends Node {
  constructor(public readonly sort: SortState | undefined) {
    const sortTooltipParts: string[] = [];

    if (sort) {
      if (sort.queueSort !== "none") {
        const queueSortLabel =
          sort.queueSort === "jobCountAsc"
            ? "Job count (ascending)"
            : "Job count (descending)";
        sortTooltipParts.push(`Queues: ${queueSortLabel}`);
      }

      if (sort.jobSort !== "none") {
        const jobSortLabel =
          sort.jobSort === "idAsc" ? "ID (ascending)" : "ID (descending)";
        sortTooltipParts.push(`Jobs: ${jobSortLabel}`);
      }
    }

    super("Sort", vscode.TreeItemCollapsibleState.None);

    this.id = "sort";
    this.contextValue = "sort";
    this.iconPath = new vscode.ThemeIcon("sort-precedence");

    this.tooltip = `Sort:\n${
      sortTooltipParts.join("\n") || "No sorting applied"
    }\n\nClick to manage sorting`;
    this.description = "Click to manage";
    this.command = {
      command: "bullmq-explorer.showSortMenu",
      title: "Manage Sort",
    };
  }
}
