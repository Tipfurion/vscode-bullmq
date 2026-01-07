import * as vscode from "vscode";
import { SettingsRedisConnection } from "./settings";
import { logger } from "./logger";
import { BullRedisConnection } from "./bull-redis-connection";

export class BullRedisConnectionsProvider {
  private connections: BullRedisConnection[] = [];
  private globalState: vscode.Memento;

  private _onConnectionAdded = new vscode.EventEmitter<BullRedisConnection>();
  public readonly onConnectionAdded = this._onConnectionAdded.event;

  constructor(globalState: vscode.Memento) {
    this.globalState = globalState;
  }

  public getConnections() {
    return this.connections;
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

    await Promise.all(
      connections.map(async (settingsConnection) => {
        const connection = new BullRedisConnection({
          name: settingsConnection.name,
          config: settingsConnection.config,
          prefix: settingsConnection.prefix,
          globalState: this.globalState,
        });

        try {
          await connection.connect();
        } catch (err) {
          logger.error(
            `Failed to connect to ${settingsConnection.name}: ${err}`
          );
        }

        if (connection.status === "connected") {
          logger.info(`Connected to ${settingsConnection.name}`);
        }

        this.connections.push(connection);
        this._onConnectionAdded.fire(connection);
      })
    );
  }
}
