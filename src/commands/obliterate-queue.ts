import * as vscode from "vscode";
import { QueueNode } from "../tree/nodes/queue-node";
import { BullMQTreeDataProvider } from "../tree/tree-data-provider";

export async function obliterateQueue(
  node: QueueNode,
  treeDataProvider: BullMQTreeDataProvider
): Promise<void> {
  const queueName = node.queue.name;

  // Show confirmation dialog - obliterate is more destructive than drain
  const confirm = await vscode.window.showWarningMessage(
    `Are you sure you want to obliterate queue "${queueName}"? This will completely remove the queue and all of its contents (including active, completed, and failed jobs). This action cannot be undone.`,
    { modal: true },
    "Yes, Obliterate Queue"
  );

  if (confirm !== "Yes, Obliterate Queue") {
    return;
  }

  try {
    await node.queue.obliterate();

    vscode.window.showInformationMessage(
      `Successfully obliterated queue "${queueName}"`
    );

    // Refresh the tree to reflect the obliterated queue
    treeDataProvider.refresh();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to obliterate queue "${queueName}": ${errorMessage}`
    );
  }
}
