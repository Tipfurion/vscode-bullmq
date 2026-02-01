import * as vscode from "vscode";
import { JobState, Queue } from "bullmq";
import { BullRedisConnection } from "../bull-redis-connection";
import { BullRedisConnectionsProvider } from "../bull-redis-connections-provider";
import { state } from "../state";
import { BULL_JOB_STATUS } from "../consts";
import { Node } from "./nodes/node";
import { ConnectionNode } from "./nodes/connection-node";
import { QueueNode } from "./nodes/queue-node";
import { JobStatusNode } from "./nodes/job-status-node";
import { JobNode } from "./nodes/job-node";
import { FilterNode } from "./nodes/filter-node";
import { SortNode } from "./nodes/sort-node";
import { ManageConnectionsNode } from "./nodes/manage-connections-node";

export class BullMQTreeDataProvider implements vscode.TreeDataProvider<Node> {
  private needRefresh = false;

  private bullRedisConnectionsProvider: BullRedisConnectionsProvider;

  private _onDidChangeTreeData: vscode.EventEmitter<Node | undefined | void> =
    new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<Node | undefined | void> =
    this._onDidChangeTreeData.event;

  constructor(bullRedisConnectionsProvider: BullRedisConnectionsProvider) {
    this.bullRedisConnectionsProvider = bullRedisConnectionsProvider;

    this.bullRedisConnectionsProvider.initConnections();

    this.bullRedisConnectionsProvider.onConnectionAdded((connection) => {
      connection.exploreQueues();
      connection.onQueuesExplored(() => {
        this.refresh();
      });
    });

    this.bullRedisConnectionsProvider.onConnectionsReinitialized(() => {
      this.refresh();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (!element) {
      const children: Node[] = [];

      children.push(new ManageConnectionsNode());
      children.push(new FilterNode(state.filter));
      children.push(new SortNode(state.sort));

      const connections = await this.getConnections();
      children.push(...connections);

      return children;
    }

    if (element instanceof ManageConnectionsNode) {
      return [];
    }

    if (element instanceof FilterNode) {
      return [];
    }

    if (element instanceof SortNode) {
      return [];
    }

    if (element instanceof ConnectionNode) {
      return this.getQueues(element.connection);
    }

    if (element instanceof QueueNode) {
      return await this.getJobStatuses(element.queue, element.connection.name);
    }

    if (element instanceof JobStatusNode) {
      return this.getJobs(element.queue, element.status);
    }

    return [];
  }

  private async getConnections(): Promise<ConnectionNode[]> {
    let connections = this.bullRedisConnectionsProvider.getConnections();

    // Apply connection name filter if set
    if (state.filter?.connectionName !== undefined) {
      const filteredConnection = connections.find(
        (c) => c.name === state.filter!.connectionName
      );
      connections = filteredConnection ? [filteredConnection] : [];
    }

    // Calculate queue counts for each connection (after filtering)
    const connectionNodes = await Promise.all(
      connections.map(async (connection) => {
        let queues = Array.from(connection.queues.values());

        // Apply queue name filter (exact match)
        if (state.filter?.queueName !== undefined) {
          const filteredQueue = queues.find(
            (q) => q.name === state.filter!.queueName
          );
          queues = filteredQueue ? [filteredQueue] : [];
        }

        // Apply queue name pattern filter
        if (state.filter?.queueNamePattern) {
          const pattern = state.filter.queueNamePattern;
          queues = queues.filter((q) => q.name.includes(pattern));
        }

        // If job ID pattern filter is set, filter queues that have matching jobs
        if (state.filter?.jobIdPattern) {
          const filteredQueues: Queue[] = [];
          for (const queue of queues) {
            const hasMatchingJobs = await this.queueHasMatchingJobs(
              queue,
              state.filter!.jobIdPattern!
            );
            if (hasMatchingJobs) {
              filteredQueues.push(queue);
            }
          }
          queues = filteredQueues;
        }

        const queueCount = queues.length;
        return new ConnectionNode(connection, queueCount);
      })
    );

    return connectionNodes;
  }

  private async getTotalJobCount(queue: Queue): Promise<number> {
    try {
      const allStatuses = Object.values(BULL_JOB_STATUS);
      const statusCounts = await Promise.allSettled(
        allStatuses.map(async (status) => {
          try {
            const jobIds = await queue.getRanges([status], 0, -1, false);

            // Apply job ID pattern filter if set
            let filteredJobIds = jobIds;
            if (state.filter?.jobIdPattern) {
              const pattern = state.filter.jobIdPattern;
              filteredJobIds = jobIds.filter((id) => {
                if (typeof id === "string") {
                  return id.includes(pattern);
                }
                return false;
              });
            }

            return filteredJobIds.length;
          } catch (err) {
            return 0;
          }
        })
      );

      // Sum all counts
      let totalCount = 0;
      for (const result of statusCounts) {
        if (result.status === "fulfilled") {
          totalCount += result.value;
        }
      }

      return totalCount;
    } catch (err) {
      return 0;
    }
  }

  private async getQueues(
    connection: BullRedisConnection
  ): Promise<QueueNode[]> {
    let queues = Array.from(connection.queues.values());

    // Apply queue name filter (exact match)
    if (state.filter?.queueName !== undefined) {
      const filteredQueue = queues.find(
        (q) => q.name === state.filter!.queueName
      );
      queues = filteredQueue ? [filteredQueue] : [];
    }

    // Apply queue name pattern filter
    if (state.filter?.queueNamePattern) {
      const pattern = state.filter.queueNamePattern;
      queues = queues.filter((q) => q.name.includes(pattern));
    }

    // If job ID pattern filter is set, filter queues that have matching jobs
    if (state.filter?.jobIdPattern) {
      const filteredQueues: Queue[] = [];
      for (const queue of queues) {
        const hasMatchingJobs = await this.queueHasMatchingJobs(
          queue,
          state.filter!.jobIdPattern!
        );
        if (hasMatchingJobs) {
          filteredQueues.push(queue);
        }
      }
      queues = filteredQueues;
    }

    // Create queue nodes with job counts
    const queueNodes = await Promise.all(
      queues.map(async (queue) => {
        const totalJobCount = await this.getTotalJobCount(queue);
        return new QueueNode(queue, connection, totalJobCount);
      })
    );

    // Apply sorting if set
    if (state.sort?.queueSort && state.sort.queueSort !== "none") {
      queueNodes.sort((a, b) => {
        if (state.sort!.queueSort === "jobCountAsc") {
          return a.totalJobCount - b.totalJobCount;
        } else if (state.sort!.queueSort === "jobCountDesc") {
          return b.totalJobCount - a.totalJobCount;
        }
        return 0;
      });
    }

    return queueNodes;
  }

  private async queueHasMatchingJobs(
    queue: Queue,
    pattern: string
  ): Promise<boolean> {
    try {
      // Get all possible job statuses
      const statuses = Object.values(BULL_JOB_STATUS);

      // Use getRanges to get job IDs efficiently
      for (const status of statuses) {
        try {
          const jobIds = await queue.getRanges([status], 0, -1, true);
          const matchingIds = jobIds.filter((id) => {
            if (typeof id === "string") {
              return id.includes(pattern);
            }
            return false;
          });
          if (matchingIds.length > 0) {
            return true;
          }
        } catch (err) {
          continue;
        }
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  private async getJobStatuses(
    queue: Queue,
    connectionName: string
  ): Promise<JobStatusNode[]> {
    // Get actual job statuses from BullMQ
    // BullMQ supports: waiting, active, completed, failed, delayed, paused, prioritized
    const allStatuses = Object.values(BULL_JOB_STATUS);

    const statusChecks = await Promise.allSettled(
      allStatuses.map(async (status) => {
        try {
          const jobIds = await queue.getRanges([status], 0, -1, true);

          let filteredJobIds = jobIds;
          if (state.filter?.jobIdPattern) {
            const pattern = state.filter.jobIdPattern;
            filteredJobIds = jobIds.filter((id) => {
              if (typeof id === "string") {
                return id.includes(pattern);
              }
              return false;
            });
          }

          const jobCount = filteredJobIds.length;
          return { status, jobCount, hasJobs: jobCount > 0 };
        } catch (err) {
          return { status, jobCount: 0, hasJobs: false };
        }
      })
    );

    const statusesWithJobs: Array<{
      status: JobState;
      jobCount: number;
    }> = [];

    for (const result of statusChecks) {
      if (result.status === "fulfilled" && result.value.hasJobs) {
        statusesWithJobs.push({
          status: result.value.status as JobState,
          jobCount: result.value.jobCount,
        });
      }
    }

    return statusesWithJobs.map(
      ({ status, jobCount }) =>
        new JobStatusNode(status, queue, jobCount, connectionName)
    );
  }

  private async getJobs(queue: Queue, status: JobState): Promise<JobNode[]> {
    const jobIds = await queue.getRanges([status], 0, -1, true);

    let filteredJobIds = jobIds;
    if (state.filter?.jobIdPattern) {
      const pattern = state.filter.jobIdPattern;
      filteredJobIds = jobIds.filter((id) => {
        if (typeof id === "string") {
          return id.includes(pattern);
        }
        return false;
      });
    }

    // Limit to 1000 for performance (can be adjusted)
    const limitedIds = filteredJobIds.slice(0, 10000);

    let sortedIds = limitedIds.filter(
      (id): id is string => typeof id === "string"
    );

    if (state.sort?.jobSort && state.sort.jobSort !== "none") {
      sortedIds = sortedIds.sort((a, b) => {
        // Check if IDs are numeric
        const aNum = Number(a);
        const bNum = Number(b);
        const aIsNumeric = !isNaN(aNum) && isFinite(aNum) && a === String(aNum);
        const bIsNumeric = !isNaN(bNum) && isFinite(bNum) && b === String(bNum);

        if (aIsNumeric && bIsNumeric) {
          if (state.sort!.jobSort === "idAsc") {
            return aNum - bNum;
          } else {
            return bNum - aNum;
          }
        } else {
          if (state.sort!.jobSort === "idAsc") {
            return a.localeCompare(b);
          } else {
            return b.localeCompare(a);
          }
        }
      });
    }

    return sortedIds.map((jobId) => new JobNode(jobId, queue, status));
  }
}
