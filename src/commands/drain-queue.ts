import * as vscode from "vscode";
import { QueueNode } from "../tree/nodes/queue-node";
import { BullMQTreeDataProvider } from "../tree/tree-data-provider";

export async function drainQueue(
  node: QueueNode,
  treeDataProvider: BullMQTreeDataProvider
): Promise<void> {
  const queueName = node.queue.name;

  // Show confirmation dialog
  const confirm = await vscode.window.showWarningMessage(
    `Are you sure you want to drain queue "${queueName}"? This will remove all jobs from the queue.`,
    { modal: true },
    "Yes, Drain Queue"
  );

  if (confirm !== "Yes, Drain Queue") {
    return;
  }

  try {
    await node.queue.drain();

    vscode.window.showInformationMessage(
      `Successfully drained queue "${queueName}"`
    );

    // Refresh the tree to reflect the drained queue
    treeDataProvider.refresh();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to drain queue "${queueName}": ${errorMessage}`
    );
  }
}
