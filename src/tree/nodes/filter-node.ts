import * as vscode from "vscode";
import { Node } from "./node";
import { FilterState } from "../../state";

export class FilterNode extends Node {
  constructor(public readonly filter: FilterState = {}) {
    const filterTooltipParts: string[] = [];

    if (filter.connectionName) {
      filterTooltipParts.push(`Connection: ${filter.connectionName}`);
    }

    if (filter.queueName) {
      filterTooltipParts.push(`Queue: ${filter.queueName}`);
    }
    if (filter.queueNamePattern) {
      filterTooltipParts.push(`Queue pattern: ${filter.queueNamePattern}*`);
    }

    if (filter.jobIdPattern) {
      filterTooltipParts.push(`Job ID pattern: ${filter.jobIdPattern}*`);
    }

    super("Filter", vscode.TreeItemCollapsibleState.None);

    this.id = "filter";
    this.contextValue = "filter";
    this.iconPath = new vscode.ThemeIcon("filter");

    this.tooltip = `Filter:\n${
      filterTooltipParts.join("\n") || "No specific filters"
    }\n\nClick to manage filters`;
    this.description = "Click to manage";
    this.command = {
      command: "bullmq-explorer.showFilterMenu",
      title: "Manage Filter",
    };
  }
}
