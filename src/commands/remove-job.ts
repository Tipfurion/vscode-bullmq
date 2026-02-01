import * as vscode from "vscode";
import { JobNode } from "../tree/nodes/job-node";
import { BullMQTreeDataProvider } from "../tree/tree-data-provider";

export async function removeJob(
  node: JobNode,
  treeDataProvider: BullMQTreeDataProvider
): Promise<void> {
  try {
    if (!node.queue) {
      throw new Error("Queue reference not available");
    }

    if (!node.jobId) {
      throw new Error("Job ID not available");
    }

    const job = await node.queue.getJob(node.jobId);
    if (!job) {
      vscode.window.showWarningMessage(`Job ${node.jobId} not found`);
      return;
    }

    await job.remove();
    vscode.window.showInformationMessage(`Job ${node.jobId} removed successfully`);

    // Refresh the tree to reflect the change
    treeDataProvider.refresh();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to remove job: ${errorMessage}`
    );
  }
}
