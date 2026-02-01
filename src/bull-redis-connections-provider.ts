import * as vscode from "vscode";
import { SettingsRedisConnection } from "./settings";
import { logger } from "./logger";
import { BullRedisConnection } from "./bull-redis-connection";

export class BullRedisConnectionsProvider {
  private connections: BullRedisConnection[] = [];
  private globalState: vscode.Memento;
  private connectionOrder: string[] = []; // Store original order from settings

  private _onConnectionAdded = new vscode.EventEmitter<BullRedisConnection>();
  public readonly onConnectionAdded = this._onConnectionAdded.event;

  private _onConnectionsReinitialized = new vscode.EventEmitter<void>();
  public readonly onConnectionsReinitialized =
    this._onConnectionsReinitialized.event;

  constructor(globalState: vscode.Memento) {
    this.globalState = globalState;
  }

  public getConnections() {
    return this.connections;
  }

  private sortConnectionsByOrder(): void {
    // Sort connections to match the original order from settings
    const connectionMap = new Map(
      this.connections.map((conn) => [conn.name, conn])
    );
    this.connections = this.connectionOrder
      .map((name) => connectionMap.get(name))
      .filter((conn): conn is BullRedisConnection => conn !== undefined);
  }

  public async initConnections() {
    const config = vscode.workspace.getConfiguration("bullmq-explorer");
    const connections = config.get<SettingsRedisConnection[]>("connections");
    if (!connections) {
      logger.warn(
        "Connections is empty, please add connections in settings.json"
      );
      return;
    }

    // Store the original order from settings
    this.connectionOrder = connections.map((conn) => conn.name);

    const connectionPromises = connections.map(async (settingsConnection) => {
      const connection = new BullRedisConnection({
        name: settingsConnection.name,
        config: settingsConnection.config,
        prefix: settingsConnection.prefix,
        globalState: this.globalState,
      });

      try {
        await connection.connect();
      } catch (err) {
        logger.error(`Failed to connect to ${settingsConnection.name}: ${err}`);
      }

      if (connection.status === "connected") {
        logger.info(`Connected to ${settingsConnection.name}`);
      }

      return connection;
    });

    const initializedConnections = await Promise.all(connectionPromises);

    this.connections = initializedConnections;
    this.sortConnectionsByOrder();

    for (const connection of this.connections) {
      this._onConnectionAdded.fire(connection);
    }
  }

  public async reinitializeConnections(): Promise<void> {
    // Disconnect all existing connections
    await Promise.all(
      this.connections.map(async (connection) => {
        try {
          await connection.disconnect();
        } catch (err) {
          logger.error(`Failed to disconnect from ${connection.name}: ${err}`);
        }
      })
    );

    this.connections = [];

    await this.initConnections();

    this._onConnectionsReinitialized.fire();
  }
}
