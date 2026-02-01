import * as vscode from "vscode";
import { JobNode } from "../tree/nodes/job-node";
import { BullMQTreeDataProvider } from "../tree/tree-data-provider";

export async function promoteJob(
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

    // Check if job is in delayed state
    const state = await job.getState();
    if (state !== "delayed") {
      vscode.window.showWarningMessage(
        `Job ${node.jobId} is not in delayed state (current state: ${state}). Only delayed jobs can be promoted.`
      );
      return;
    }

    await job.promote();
    vscode.window.showInformationMessage(
      `Job ${node.jobId} promoted successfully`
    );

    // Refresh the tree to reflect the change
    treeDataProvider.refresh();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to promote job: ${errorMessage}`
    );
  }
}
