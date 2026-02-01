import * as vscode from "vscode";
import { state, QueueSortOrder, JobSortOrder } from "../state";
import { BullMQTreeDataProvider } from "../tree/tree-data-provider";

/**
 * Select queue sort order
 */
async function selectQueueSort(): Promise<QueueSortOrder | undefined> {
  const items: (vscode.QuickPickItem & { id: QueueSortOrder })[] = [
    {
      id: "none",
      label: "$(circle-slash) No sorting",
      detail: "Don't sort queues",
    },
    {
      id: "jobCountAsc",
      label: "$(arrow-up) Job count (ascending)",
      detail: "Sort queues by job count, lowest first",
    },
    {
      id: "jobCountDesc",
      label: "$(arrow-down) Job count (descending)",
      detail: "Sort queues by job count, highest first",
    },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select queue sort order",
    ignoreFocusOut: true,
  });

  return selected?.id;
}

/**
 * Select job sort order
 */
async function selectJobSort(): Promise<JobSortOrder | undefined> {
  const items: (vscode.QuickPickItem & { id: JobSortOrder })[] = [
    {
      id: "none",
      label: "$(circle-slash) No sorting",
      detail: "Don't sort jobs",
    },
    {
      id: "idAsc",
      label: "$(arrow-up) ID (ascending)",
      detail: "Sort jobs by ID, ascending",
    },
    {
      id: "idDesc",
      label: "$(arrow-down) ID (descending)",
      detail: "Sort jobs by ID, descending",
    },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select job sort order",
    ignoreFocusOut: true,
  });

  return selected?.id;
}

function applySort(
  queueSort: QueueSortOrder | undefined,
  jobSort: JobSortOrder | undefined
): void {
  if (
    queueSort === undefined &&
    jobSort === undefined &&
    state.sort === undefined
  ) {
    return;
  }

  const currentSort = state.sort || {
    queueSort: "none" as QueueSortOrder,
    jobSort: "none" as JobSortOrder,
  };

  const newSort = {
    queueSort: queueSort ?? currentSort.queueSort,
    jobSort: jobSort ?? currentSort.jobSort,
  };

  // If both are "none", clear the sort
  if (newSort.queueSort === "none" && newSort.jobSort === "none") {
    state.sort = undefined;
  } else {
    state.sort = newSort;
  }
}

export async function sort(
  treeDataProvider: BullMQTreeDataProvider
): Promise<void> {
  // Step 1: Queue sort
  const queueSort = await selectQueueSort();
  if (queueSort === undefined) {
    return;
  }

  // Step 2: Job sort
  const jobSort = await selectJobSort();
  if (jobSort === undefined) {
    return;
  }

  // Apply sort
  applySort(queueSort, jobSort);

  treeDataProvider.refresh();
}

export async function clearSort(
  treeDataProvider: BullMQTreeDataProvider
): Promise<void> {
  state.sort = undefined;
  treeDataProvider.refresh();
}

export async function showSortMenu(
  treeDataProvider: BullMQTreeDataProvider
): Promise<void> {
  const items: (vscode.QuickPickItem & { id: string })[] = [
    {
      id: "set-sort",
      label: "$(sort-precedence) Sort",
      detail: "Set sorting for queues and jobs",
    },
    {
      id: "clear-sort",
      label: "$(clear-all) Clear sort",
      detail: "Remove all active sorting",
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
    case "set-sort":
      await sort(treeDataProvider);
      break;
    case "clear-sort":
      await clearSort(treeDataProvider);
      break;
  }
}
