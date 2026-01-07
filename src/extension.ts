import * as vscode from "vscode";
import {
  BullMQTreeDataProvider,
  ConnectionNode,
  QueueNode,
} from "./tree-data-provider";
import { showConfig } from "./commands/showConfig";
import { refresh, refreshConnection, refreshQueue } from "./commands/refresh";
import { BullRedisConnectionsProvider } from "./bull-redis-connections-provider";

export function activate(context: vscode.ExtensionContext) {
  const bullRedisConnectionsProvider = new BullRedisConnectionsProvider(
    context.globalState
  );
  const bullMQTreeDataProvider = new BullMQTreeDataProvider(
    bullRedisConnectionsProvider
  );
  vscode.window.registerTreeDataProvider(
    "bullmq-explorer",
    bullMQTreeDataProvider
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("bullmq-explorer.showConfig", showConfig),
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
    )
  );
}

export function deactivate() {
  // Отключить все редисы
}
