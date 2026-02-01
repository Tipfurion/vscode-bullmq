import * as vscode from "vscode";
import { JobNode } from "../tree/nodes/job-node";
import { Job } from "bullmq";
import { parse as parseJsonc } from "jsonc-parser";

const VIRTUAL_DOCUMENT_SCHEME = "bullmq-job";

function getJobUri(queueName: string, jobId: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: VIRTUAL_DOCUMENT_SCHEME,
    path: `/${queueName}/${jobId}.jsonc`,
  });
}

function formatJobDetails(job: Job, editable: boolean = false): string {
  const jobData: any = {
    id: job.id,
    name: job.name,
    data: job.data,
    opts: job.opts,
    progress: job.progress,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
    stacktrace: job.stacktrace,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    attemptsMade: job.attemptsMade,
    delay: job.delay,
    priority: job.priority,
  };

  if (editable) {
    // Add comments for editable fields
    return `/**
 * Edit Job: ${job.id}
 * 
 * Editable fields:
 *   - data: Update job data (any JSON-serializable value)
 *   - progress: Update job progress (number, 0-100)
 *   - delay: Change delay if job is delayed (number, milliseconds)
 *   - priority: Change priority (number, 1-2097152, lower = higher priority)
 * 
 * Note: Other fields are read-only and will be ignored if changed.
 */
${JSON.stringify(jobData, null, 2)}`;
  }

  return JSON.stringify(jobData, null, 2);
}

class JobFileSystemProvider implements vscode.FileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile = this._onDidChangeFile.event;

  private openDocuments = new Map<
    string,
    {
      jobNode: JobNode;
      job: Job | null;
      error?: string;
      editable?: boolean;
      mtime: number;
    }
  >();

  watch(
    uri: vscode.Uri,
    options: { recursive: boolean; excludes: string[] }
  ): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const docInfo = this.openDocuments.get(uri.toString());
    if (!docInfo) {
      throw new vscode.FileSystemError("File not found");
    }

    const { job, editable, mtime } = docInfo;
    const content = job ? formatJobDetails(job, editable) : "Loading...";
    return {
      type: vscode.FileType.File,
      ctime: mtime,
      mtime,
      size: Buffer.byteLength(content, "utf8"),
    };
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(uri: vscode.Uri): void {
    throw new vscode.FileSystemError("Not supported");
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const docInfo = this.openDocuments.get(uri.toString());
    if (!docInfo) {
      throw new vscode.FileSystemError("File not found");
    }

    const { job, error, editable } = docInfo;
    if (error) {
      return Buffer.from(JSON.stringify({ error: error }, null, 2), "utf8");
    }
    if (!job) {
      return Buffer.from("Loading job data...", "utf8");
    }

    const content = formatJobDetails(job, editable);
    return Buffer.from(content, "utf8");
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean }
  ): Promise<void> {
    const docInfo = this.openDocuments.get(uri.toString());
    if (!docInfo) {
      throw new vscode.FileSystemError("File not found");
    }

    if (!docInfo.editable) {
      throw new vscode.FileSystemError(
        "Job details are read-only. Use 'Edit' command to enable editing."
      );
    }

    const { jobNode, job } = docInfo;
    if (!job || !jobNode.queue) {
      throw new vscode.FileSystemError("Job information not available");
    }

    const text = Buffer.from(content).toString("utf8");
    let updatedData: any;

    try {
      // Use jsonc-parser to handle comments properly
      updatedData = parseJsonc(text);
    } catch (error) {
      throw new vscode.FileSystemError(
        `Invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    try {
      const updatePromises: Promise<any>[] = [];

      // Update data if changed
      if (JSON.stringify(updatedData.data) !== JSON.stringify(job.data)) {
        updatePromises.push(job.updateData(updatedData.data));
      }

      // Update progress if changed
      if (
        updatedData.progress !== undefined &&
        updatedData.progress !== job.progress
      ) {
        updatePromises.push(job.updateProgress(updatedData.progress));
      }

      // Update delay if changed and job is delayed
      if (updatedData.delay !== undefined && updatedData.delay !== job.delay) {
        if (job.delay) {
          // Job is delayed, update it
          updatePromises.push(job.changeDelay(updatedData.delay));
        }
      }

      // Update priority if changed
      if (
        updatedData.priority !== undefined &&
        updatedData.priority !== job.priority
      ) {
        updatePromises.push(job.changePriority(updatedData.priority));
      }

      await Promise.all(updatePromises);

      const updatedJob = await jobNode.queue.getJob(job.id!);
      if (updatedJob) {
        await this.updateJob(uri, updatedJob, { skipNotifyAfterSave: true });
        vscode.window.showInformationMessage(
          `Job ${job.id} updated successfully`
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new vscode.FileSystemError(`Failed to update job: ${errorMessage}`);
    }
  }

  delete(uri: vscode.Uri, options: { recursive: boolean }): void {
    throw new vscode.FileSystemError("Not supported");
  }

  rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean }
  ): void {
    throw new vscode.FileSystemError("Not supported");
  }

  registerDocument(
    jobNode: JobNode,
    uri: vscode.Uri,
    job: Job | null,
    error?: string,
    editable: boolean = false
  ): void {
    const now = Date.now();
    this.openDocuments.set(uri.toString(), {
      jobNode,
      job,
      error,
      editable,
      mtime: now,
    });
    this._onDidChangeFile.fire([
      {
        type: vscode.FileChangeType.Changed,
        uri: uri,
      },
    ]);
  }

  async updateJob(
    uri: vscode.Uri,
    job: Job,
    options?: { skipNotifyAfterSave?: boolean }
  ): Promise<void> {
    const docInfo = this.openDocuments.get(uri.toString());
    if (docInfo) {
      docInfo.job = job;
      docInfo.error = undefined;
      if (options?.skipNotifyAfterSave) {
        // After our own save: only update in-memory job; don't change mtime or fire Changed
        // so VS Code doesn't show "content of the file is newer" conflict
        return;
      }
      docInfo.mtime = Date.now();
      this._onDidChangeFile.fire([
        {
          type: vscode.FileChangeType.Changed,
          uri: uri,
        },
      ]);
    }
  }

  async updateError(uri: vscode.Uri, error: string): Promise<void> {
    const docInfo = this.openDocuments.get(uri.toString());
    if (docInfo) {
      docInfo.error = error;
      docInfo.job = null;
      this._onDidChangeFile.fire([
        {
          type: vscode.FileChangeType.Changed,
          uri: uri,
        },
      ]);
    }
  }

  unregisterDocument(uri: vscode.Uri): void {
    this.openDocuments.delete(uri.toString());
  }
}

let fileSystemProvider: JobFileSystemProvider | undefined;

// Track clicks for double-click detection
interface ClickInfo {
  jobId: string;
  queueName: string;
  timestamp: number;
}

let lastClick: ClickInfo | null = null;
const DOUBLE_CLICK_THRESHOLD = 300; // milliseconds

export function registerShowJobDocumentProvider(
  context: vscode.ExtensionContext
): void {
  fileSystemProvider = new JobFileSystemProvider();
  const registration = vscode.workspace.registerFileSystemProvider(
    VIRTUAL_DOCUMENT_SCHEME,
    fileSystemProvider,
    { isCaseSensitive: true }
  );
  context.subscriptions.push(registration);
}

export async function showJob(
  node: JobNode,
  preview: boolean = true,
  editable: boolean = false
): Promise<void> {
  try {
    if (!fileSystemProvider) {
      throw new Error("FileSystemProvider not registered");
    }

    if (!node.queue) {
      throw new Error("Queue reference not available");
    }

    if (!node.jobId) {
      throw new Error("Job ID not available");
    }

    const queueName = node.queue.name;
    const jobId = node.jobId;
    const uri = getJobUri(queueName, jobId);

    const now = Date.now();
    const isDoubleClick =
      lastClick &&
      lastClick.jobId === jobId &&
      lastClick.queueName === queueName &&
      now - lastClick.timestamp < DOUBLE_CLICK_THRESHOLD;

    lastClick = { jobId, queueName, timestamp: now };

    // Use preview: false for double-click (permanent open), preview: true for single click
    const shouldPreview = preview && !isDoubleClick;

    // Register document with null job initially (will be loaded)
    fileSystemProvider.registerDocument(node, uri, null, undefined, editable);

    // Open the document
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preview: shouldPreview,
      viewColumn: vscode.ViewColumn.Active,
    });

    // Fetch the job data asynchronously
    try {
      const job = await node.queue.getJob(jobId);
      if (job) {
        await fileSystemProvider.updateJob(uri, job);
      } else {
        throw new Error(`Job ${jobId} not found`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Failed to load job data: ${errorMessage}`
      );
      // Update document with error message
      await fileSystemProvider.updateError(uri, errorMessage);
    }

    // Clean up when document is closed
    const disposable = vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.uri.toString() === uri.toString()) {
        fileSystemProvider?.unregisterDocument(uri);
        disposable.dispose();
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to open job details: ${errorMessage}`
    );
  }
}
