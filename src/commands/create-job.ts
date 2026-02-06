import * as vscode from "vscode";
import { QueueNode } from "../tree/nodes/queue-node";
import { parse as parseJsonc } from "jsonc-parser";
import { BullMQTreeDataProvider } from "../tree/tree-data-provider";

const VIRTUAL_DOCUMENT_SCHEME = "bullmq-create-job";

function getCreateJobUri(queueName: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: VIRTUAL_DOCUMENT_SCHEME,
    path: `/${queueName}-job.jsonc`,
  });
}

function formatJobTemplate(queueName: string): string {
  return `/**
 * Create Job for Queue: ${queueName}
 * 
 * Fill in the fields below and save this file to create the job.
 * 
 * Fields:
 *   - name: Job name (string, required)
 *   - data: Job data payload (any JSON-serializable value, required)
 *   - opts: Job options (object, optional) - see descriptions below
 * 
 * Job Options (opts):
 *   - delay: number (milliseconds) - Time to wait before the job becomes available
 *   - priority: number - Priority level (1-2097152, lower = higher priority)
 *   - attempts: number - Number of retry attempts if job fails (default: 1)
 *   - backoff: { type: "fixed" | "exponential", delay: number } - Retry behavior
 *   - repeat: { cron?: string, every?: number, limit?: number } - For repeatable jobs
 *   - jobId: string - Custom unique identifier
 *   - lifo: boolean - Use Last-In-First-Out instead of FIFO
 *   - removeOnComplete: boolean | number - Remove job after completion (number = keep N completed)
 *   - removeOnFail: boolean | number - Remove job after failure (number = keep N failed)
 *   - timeout: number - Milliseconds before job is considered timed out
 */
{
  "name": "",
  "data": {},
  "opts": {
    // "delay": 0,
    // "priority": 0,
    // "attempts": 1,
    // "backoff": {
    //   "type": "exponential",
    //   "delay": 1000
    // },
    // "repeat": {
    //   "every": 60000,
    //   "limit": 5
    // },
    // "jobId": "custom-job-id",
    // "lifo": false,
    // "removeOnComplete": true,
    // "removeOnFail": false,
    // "timeout": 30000
  }
}
`;
}

interface JobTemplate {
  name: string;
  data: any;
  opts?: {
    delay?: number;
    priority?: number;
    attempts?: number;
    backoff?: {
      type: "fixed" | "exponential";
      delay: number;
    };
    repeat?: {
      cron?: string;
      every?: number;
      limit?: number;
    };
    jobId?: string;
    lifo?: boolean;
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
    timeout?: number;
  };
}

class CreateJobFileSystemProvider implements vscode.FileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile = this._onDidChangeFile.event;

  private openDocuments = new Map<string, { queueNode: QueueNode }>();
  private treeDataProvider: BullMQTreeDataProvider;

  constructor(treeDataProvider: BullMQTreeDataProvider) {
    this.treeDataProvider = treeDataProvider;
  }

  watch(
    _uri: vscode.Uri,
    _options: { recursive: boolean; excludes: string[] }
  ): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const queueName = uri.path.replace("/", "").replace("-job.jsonc", "");
    const content = formatJobTemplate(queueName);
    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: Buffer.byteLength(content, "utf8"),
    };
  }

  readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(_uri: vscode.Uri): void {
    throw new vscode.FileSystemError("Not supported");
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const queueName = uri.path.replace("/", "").replace("-job.jsonc", "");
    const content = formatJobTemplate(queueName);
    return Buffer.from(content, "utf8");
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    _options: { create: boolean; overwrite: boolean }
  ): Promise<void> {
    const queueName = uri.path.replace("/", "").replace("-job.jsonc", "");
    const text = Buffer.from(content).toString("utf8");
    let jobTemplate: JobTemplate;

    try {
      jobTemplate = parseJsonc(text) as JobTemplate;
    } catch (error) {
      throw new vscode.FileSystemError(
        `Invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    // Validate the structure
    if (!jobTemplate.name || typeof jobTemplate.name !== "string") {
      throw new vscode.FileSystemError(
        "Job 'name' is required and must be a string"
      );
    }

    if (jobTemplate.data === undefined) {
      throw new vscode.FileSystemError("Job 'data' is required");
    }

    // Get the queue node from open documents
    const docKey = uri.toString();
    const docInfo = this.openDocuments.get(docKey);
    if (!docInfo) {
      throw new vscode.FileSystemError("Queue information not found");
    }

    const { queueNode } = docInfo;

    try {
      // Add the job to the queue
      await queueNode.queue.add(
        jobTemplate.name,
        jobTemplate.data,
        jobTemplate.opts || {}
      );

      vscode.window.showInformationMessage(
        `Successfully created job "${jobTemplate.name}" in queue "${queueName}"`
      );

      this.treeDataProvider.refresh();

      // Close the document after successful creation (defer to avoid blocking save)
      setTimeout(async () => {
        const editors = vscode.window.visibleTextEditors.filter(
          (editor) => editor.document.uri.toString() === uri.toString()
        );
        if (editors.length > 0) {
          await vscode.window.showTextDocument(editors[0].document);
          await vscode.commands.executeCommand(
            "workbench.action.closeActiveEditor"
          );
        }
        this.openDocuments.delete(docKey);
      }, 100);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new vscode.FileSystemError(`Failed to create job: ${errorMessage}`);
    }
  }

  delete(_uri: vscode.Uri, _options: { recursive: boolean }): void {
    throw new vscode.FileSystemError("Not supported");
  }

  rename(
    _oldUri: vscode.Uri,
    _newUri: vscode.Uri,
    _options: { overwrite: boolean }
  ): void {
    throw new vscode.FileSystemError("Not supported");
  }

  registerDocument(queueNode: QueueNode, uri: vscode.Uri): void {
    this.openDocuments.set(uri.toString(), { queueNode });
  }

  unregisterDocument(uri: vscode.Uri): void {
    this.openDocuments.delete(uri.toString());
  }
}

let fileSystemProvider: CreateJobFileSystemProvider | undefined;

export function registerCreateJobDocumentProvider(
  context: vscode.ExtensionContext,
  treeDataProvider: BullMQTreeDataProvider
): void {
  fileSystemProvider = new CreateJobFileSystemProvider(treeDataProvider);
  const registration = vscode.workspace.registerFileSystemProvider(
    VIRTUAL_DOCUMENT_SCHEME,
    fileSystemProvider,
    { isCaseSensitive: true }
  );
  context.subscriptions.push(registration);
}

export async function createJob(node: QueueNode): Promise<void> {
  try {
    if (!fileSystemProvider) {
      throw new Error("FileSystemProvider not registered");
    }

    const uri = getCreateJobUri(node.queue.name);

    fileSystemProvider.registerDocument(node, uri);

    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.Active,
    });

    const disposable = vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.uri.toString() === uri.toString()) {
        fileSystemProvider?.unregisterDocument(uri);
        disposable.dispose();
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to open job creation editor: ${errorMessage}`
    );
  }
}
