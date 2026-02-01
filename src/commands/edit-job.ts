import * as vscode from "vscode";
import { JobNode } from "../tree/nodes/job-node";
import { showJob } from "./show-job";

export async function editJob(node: JobNode): Promise<void> {
  // Open job in editable mode
  await showJob(node, false, true);
}
