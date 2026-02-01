import * as vscode from "vscode";
import { BullMQTreeDataProvider } from "./tree/tree-data-provider";
import { ConnectionNode, QueueNode, JobNode } from "./tree/nodes";
import { refresh, refreshConnection, refreshQueue } from "./commands/refresh";
import { filter, clearFilter, showFilterMenu } from "./commands/filter";
import { sort, clearSort, showSortMenu } from "./commands/sort";
import {
  manageConnections,
  registerConnectionsDocumentProvider,
} from "./commands/manage-connections";
import {
  createJob,
  registerCreateJobDocumentProvider,
} from "./commands/create-job";
import { drainQueue } from "./commands/drain-queue";
import { obliterateQueue } from "./commands/obliterate-queue";
import { showJob, registerShowJobDocumentProvider } from "./commands/show-job";
import { editJob } from "./commands/edit-job";
import { removeJob } from "./commands/remove-job";
import { promoteJob } from "./commands/promote-job";
import { BullRedisConnectionsProvider } from "./bull-redis-connections-provider";

export function activate(context: vscode.ExtensionContext) {
  const bullRedisConnectionsProvider = new BullRedisConnectionsProvider(
    context.globalState
  );
  const bullMQTreeDataProvider = new BullMQTreeDataProvider(
    bullRedisConnectionsProvider
  );
  vscode.window.createTreeView("bullmq-explorer", {
    treeDataProvider: bullMQTreeDataProvider,
  });

  registerConnectionsDocumentProvider(context, bullRedisConnectionsProvider);

  registerCreateJobDocumentProvider(context, bullMQTreeDataProvider);

  registerShowJobDocumentProvider(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("bullmq-explorer.refresh", () =>
      refresh(bullMQTreeDataProvider)
    ),
    vscode.commands.registerCommand(
      "bullmq-explorer.refreshConnection",
      async (node: ConnectionNode) => {
        await refreshConnection(node.connection);
      }
    ),
    vscode.commands.registerCommand(
      "bullmq-explorer.refreshQueue",
      (node: QueueNode) => {
        refreshQueue(bullMQTreeDataProvider);
      }
    ),
    vscode.commands.registerCommand("bullmq-explorer.filter", () =>
      filter(bullMQTreeDataProvider, bullRedisConnectionsProvider)
    ),
    vscode.commands.registerCommand("bullmq-explorer.clearFilter", () =>
      clearFilter(bullMQTreeDataProvider)
    ),
    vscode.commands.registerCommand("bullmq-explorer.showFilterMenu", () =>
      showFilterMenu(bullMQTreeDataProvider, bullRedisConnectionsProvider)
    ),
    vscode.commands.registerCommand("bullmq-explorer.sort", () =>
      sort(bullMQTreeDataProvider)
    ),
    vscode.commands.registerCommand("bullmq-explorer.clearSort", () =>
      clearSort(bullMQTreeDataProvider)
    ),
    vscode.commands.registerCommand("bullmq-explorer.showSortMenu", () =>
      showSortMenu(bullMQTreeDataProvider)
    ),
    vscode.commands.registerCommand("bullmq-explorer.manageConnections", () =>
      manageConnections()
    ),
    vscode.commands.registerCommand(
      "bullmq-explorer.createJob",
      (node: QueueNode) => createJob(node)
    ),
    vscode.commands.registerCommand(
      "bullmq-explorer.drainQueue",
      (node: QueueNode) => drainQueue(node, bullMQTreeDataProvider)
    ),
    vscode.commands.registerCommand(
      "bullmq-explorer.obliterateQueue",
      (node: QueueNode) => obliterateQueue(node, bullMQTreeDataProvider)
    ),
    vscode.commands.registerCommand(
      "bullmq-explorer.showJob",
      (node: JobNode, preview: boolean = true) => showJob(node, preview)
    ),
    vscode.commands.registerCommand(
      "bullmq-explorer.editJob",
      (node: JobNode) => editJob(node)
    ),
    vscode.commands.registerCommand(
      "bullmq-explorer.removeJob",
      (node: JobNode) => removeJob(node, bullMQTreeDataProvider)
    ),
    vscode.commands.registerCommand(
      "bullmq-explorer.promoteJob",
      (node: JobNode) => promoteJob(node, bullMQTreeDataProvider)
    )
  );
}

export function deactivate() {
  // Отключить все редисы
}
