import * as vscode from "vscode";
import { SettingsRedisConnection } from "../settings";
import { parse as parseJsonc } from "jsonc-parser";
import { BullRedisConnectionsProvider } from "../bull-redis-connections-provider";

const VIRTUAL_DOCUMENT_SCHEME = "bullmq-connections";

function getConnectionsUri(): vscode.Uri {
  return vscode.Uri.from({
    scheme: VIRTUAL_DOCUMENT_SCHEME,
    path: "/connections.jsonc",
  });
}

function formatConnectionsWithDocs(
  connections: SettingsRedisConnection[]
): string {
  const docs = `/**
 * BullMQ Explorer Connections Configuration
 * 
 * This file defines Redis connections for BullMQ Explorer.  Save file to apply settings. 
 * Each connection requires:
 *   - name: A unique identifier for the connection
 *   - config: Redis connection options (ioredis library options)
 *   - prefix (optional): A prefix for queue names
 * 
 * Example:
 * [
 *   {
 *     "name": "local-redis",
 *     "prefix": "bull",
 *     "config": {
 *       "host": "localhost",
 *       "port": 6379,
 *       "password": ""
 *     }
 *   }
 * ]
 */
`;
  return docs + JSON.stringify(connections || [], null, 2);
}

class ConnectionsFileSystemProvider implements vscode.FileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile = this._onDidChangeFile.event;

  constructor(
    private bullRedisConnectionsProvider: BullRedisConnectionsProvider
  ) {}

  watch(
    uri: vscode.Uri,
    options: { recursive: boolean; excludes: string[] }
  ): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const config = vscode.workspace.getConfiguration("bullmq-explorer");
    const connections = config.get<SettingsRedisConnection[]>("connections");
    const content = formatConnectionsWithDocs(connections || []);
    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
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
    const expectedUri = getConnectionsUri();
    if (uri.scheme !== expectedUri.scheme || uri.path !== expectedUri.path) {
      throw new vscode.FileSystemError("File not found");
    }

    const config = vscode.workspace.getConfiguration("bullmq-explorer");
    const connections = config.get<SettingsRedisConnection[]>("connections");
    const content = formatConnectionsWithDocs(connections || []);
    return Buffer.from(content, "utf8");
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean }
  ): Promise<void> {
    const expectedUri = getConnectionsUri();
    if (uri.scheme !== expectedUri.scheme || uri.path !== expectedUri.path) {
      throw new vscode.FileSystemError("File not found");
    }

    const text = Buffer.from(content).toString("utf8");
    const connections = parseJsonc(text) as SettingsRedisConnection[];

    // Validate the structure
    if (!Array.isArray(connections)) {
      throw new vscode.FileSystemError("Connections must be an array");
    }

    // Validate each connection
    for (const conn of connections) {
      if (!conn.name || typeof conn.name !== "string") {
        throw new vscode.FileSystemError(
          "Each connection must have a 'name' property"
        );
      }
      if (!conn.config || typeof conn.config !== "object") {
        throw new vscode.FileSystemError(
          "Each connection must have a 'config' property"
        );

        // TODO: Validate redis connection options
      }
    }

    try {
      const config = vscode.workspace.getConfiguration("bullmq-explorer");
      await config.update(
        "connections",
        connections,
        vscode.ConfigurationTarget.Workspace
      );
      
      // Reinitialize connections (tree will refresh automatically via event)
      await this.bullRedisConnectionsProvider.reinitializeConnections();
      
      vscode.window.showInformationMessage(
        `Successfully saved ${connections.length} connection(s)`
      );
      this._onDidChangeFile.fire([
        {
          type: vscode.FileChangeType.Changed,
          uri: uri,
        },
      ]);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Failed to save connections: ${errorMessage}`
      );
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
}

let fileSystemProvider: ConnectionsFileSystemProvider | undefined;

export function registerConnectionsDocumentProvider(
  context: vscode.ExtensionContext,
  bullRedisConnectionsProvider: BullRedisConnectionsProvider
): void {
  fileSystemProvider = new ConnectionsFileSystemProvider(
    bullRedisConnectionsProvider
  );
  const registration = vscode.workspace.registerFileSystemProvider(
    VIRTUAL_DOCUMENT_SCHEME,
    fileSystemProvider,
    { isCaseSensitive: true }
  );
  context.subscriptions.push(registration);
}

export async function manageConnections(): Promise<void> {
  try {
    // Ensure filesystem provider is registered
    if (!fileSystemProvider) {
      throw new Error("FileSystemProvider not registered");
    }

    // Open the virtual document
    const uri = getConnectionsUri();
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.Active,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to open connections editor: ${errorMessage}`
    );
  }
}
