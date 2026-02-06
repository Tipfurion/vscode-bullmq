import * as vscode from "vscode";
import { state } from "../state";
import { BullMQTreeDataProvider } from "../tree/tree-data-provider";
import { BullRedisConnectionsProvider } from "../bull-redis-connections-provider";

interface ConnectionSelectionResult {
  connectionName: string | undefined;
  connectionsToFilter: ReturnType<
    BullRedisConnectionsProvider["getConnections"]
  >;
}

interface QueueSelectionResult {
  queueName: string | undefined;
  queueNamePattern: string | undefined;
}

/**
 * Step 1: Select connection (only shown if more than one connection exists)
 */
async function selectConnection(
  connections: ReturnType<BullRedisConnectionsProvider["getConnections"]>
): Promise<ConnectionSelectionResult | undefined> {
  if (connections.length <= 1) {
    return {
      connectionName: undefined,
      connectionsToFilter: connections,
    };
  }

  const ALL_CONNECTIONS_OPTION = "___ALL_CONNECTIONS___";

  const connectionItems: (vscode.QuickPickItem & { id?: string })[] = [
    {
      label: "$(globe) All connections",
      detail: "Filter all connections",
      id: ALL_CONNECTIONS_OPTION,
    },
    ...connections.map((conn) => ({
      label: conn.name,
      id: conn.name,
    })),
  ];

  const selectedConnection = await vscode.window.showQuickPick(
    connectionItems,
    {
      placeHolder: "Select connection",
      ignoreFocusOut: true,
    }
  );

  if (selectedConnection === undefined) {
    return undefined;
  }

  const selectedConnectionId = (
    selectedConnection as (typeof connectionItems)[0]
  ).id;

  let connectionName: string | undefined;
  let connectionsToFilter: typeof connections;

  if (selectedConnectionId === ALL_CONNECTIONS_OPTION) {
    connectionName = undefined;
    connectionsToFilter = connections;
  } else if (selectedConnectionId) {
    connectionName = selectedConnectionId;
    const foundConnection = connections.find(
      (c) => c.name === selectedConnectionId
    );
    connectionsToFilter = foundConnection ? [foundConnection] : [];
  } else {
    connectionsToFilter = connections;
  }

  return {
    connectionName,
    connectionsToFilter,
  };
}

/**
 * Step 2: Select queue or queue pattern
 */
async function selectQueue(
  connectionsToFilter: ReturnType<
    BullRedisConnectionsProvider["getConnections"]
  >
): Promise<QueueSelectionResult | undefined> {
  const allQueues: { label: string; queueName: string }[] = [];

  for (const connection of connectionsToFilter) {
    const queues = Array.from(connection.queues.values());
    for (const queue of queues) {
      allQueues.push({
        label: queue.name,
        queueName: queue.name,
      });
    }
  }

  const ALL_QUEUES_OPTION = "___ALL_QUEUES___";
  const FILTER_OPTION = "___FILTER___";

  const queueItems: (vscode.QuickPickItem & { id: string })[] = [
    {
      label: "$(globe) All queues",
      detail: "Filter all queues",
      id: ALL_QUEUES_OPTION,
    },
    {
      label: "$(regex) Enter queue pattern",
      detail: "Filter queues by name pattern",
      id: FILTER_OPTION,
    },
    ...allQueues.map((q) => ({
      label: q.queueName,
      id: q.queueName,
    })),
  ];

  const selectedQueue = await vscode.window.showQuickPick(queueItems, {
    placeHolder: "Select queue or filter option",
    ignoreFocusOut: true,
  });

  if (selectedQueue === undefined) {
    return undefined;
  }

  let queueName: string | undefined;
  let queueNamePattern: string | undefined;

  const selectedId = (selectedQueue as (typeof queueItems)[0]).id;

  if (selectedId === ALL_QUEUES_OPTION) {
    queueName = undefined;
    queueNamePattern = undefined;
  } else if (selectedId === FILTER_OPTION) {
    const pattern = await vscode.window.showInputBox({
      prompt: "Enter queue name filter (leave empty for all queues)",
      placeHolder: "queue-name-filter",
      ignoreFocusOut: true,
    });

    if (pattern === undefined) {
      return undefined;
    }

    if (pattern === "") {
      queueName = undefined;
      queueNamePattern = undefined;
    } else {
      queueName = undefined;
      queueNamePattern = pattern;
    }
  } else if (selectedId) {
    queueName = selectedId;
    queueNamePattern = undefined;
  }

  return {
    queueName,
    queueNamePattern,
  };
}

/**
 * Step 3: Enter job ID pattern
 */
async function selectJobIdPattern(): Promise<string | undefined> {
  const jobIdPattern = await vscode.window.showInputBox({
    prompt: "Enter job ID filter (leave empty for all jobs)",
    placeHolder: "job-id-pattern (leave empty for all jobs)",
    ignoreFocusOut: true,
  });

  return jobIdPattern;
}

function applyFilter(
  connectionName: string | undefined,
  queueName: string | undefined,
  queueNamePattern: string | undefined,
  jobIdPattern: string | undefined
): void {
  if (
    connectionName === undefined &&
    queueName === undefined &&
    queueNamePattern === undefined &&
    (jobIdPattern === "" || jobIdPattern === undefined)
  ) {
    state.filter = undefined;
  } else {
    state.filter = {
      connectionName,
      queueName,
      queueNamePattern,
      jobIdPattern: jobIdPattern === "" ? undefined : jobIdPattern,
    };
  }
}

export async function filter(
  treeDataProvider: BullMQTreeDataProvider,
  connectionsProvider: BullRedisConnectionsProvider
): Promise<void> {
  const connections = connectionsProvider.getConnections();

  // Step 1: Connection selection (only shown if more than one connection)
  const connectionResult = await selectConnection(connections);
  if (connectionResult === undefined) {
    return;
  }

  const { connectionName, connectionsToFilter } = connectionResult;

  // Step 2: Queue selection
  const queueResult = await selectQueue(connectionsToFilter);
  if (queueResult === undefined) {
    return;
  }

  const { queueName, queueNamePattern } = queueResult;

  // Step 3: Job ID pattern
  const jobIdPattern = await selectJobIdPattern();
  if (jobIdPattern === undefined) {
    return;
  }

  // Apply filter
  applyFilter(connectionName, queueName, queueNamePattern, jobIdPattern);

  treeDataProvider.refresh();
}

export async function clearFilter(
  treeDataProvider: BullMQTreeDataProvider
): Promise<void> {
  state.filter = undefined;
  treeDataProvider.refresh();
}

export async function showFilterMenu(
  treeDataProvider: BullMQTreeDataProvider,
  connectionsProvider: BullRedisConnectionsProvider
): Promise<void> {
  const items: (vscode.QuickPickItem & { id: string })[] = [
    {
      id: "set-filter",
      label: "$(filter) Filter",
      detail: "Set filters for queues and jobs",
    },
    {
      id: "clear-filter",
      label: "$(clear-all) Clear filter",
      detail: "Remove all active filters",
    },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select an action",
    ignoreFocusOut: true,
  });

  if (!selected) {
    return;
  }

  switch (selected.id) {
    case "set-filter":
      await filter(treeDataProvider, connectionsProvider);
      break;
    case "clear-filter":
      await clearFilter(treeDataProvider);
      break;
  }
}
