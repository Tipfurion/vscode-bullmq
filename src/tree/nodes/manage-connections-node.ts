import * as vscode from "vscode";
import { Node } from "./node";

export class ManageConnectionsNode extends Node {
  constructor() {
    super("Manage Connections", vscode.TreeItemCollapsibleState.None);

    this.id = "manageConnections";
    this.contextValue = "manageConnections";
    this.iconPath = new vscode.ThemeIcon("settings-gear");

    this.tooltip = "Manage Connections\n\nClick to open connections editor";
    this.description = "Click to manage";
    this.command = {
      command: "bullmq-explorer.manageConnections",
      title: "Manage Connections",
    };
  }
}
