import type { ScheduledJob } from "./types";

/**
 * Min-heap priority queue for scheduled jobs
 * Jobs with nextRunAt closest to now have highest priority (lowest priority value)
 */
export interface PriorityQueue {
  items: ScheduledJob[];
  add(job: ScheduledJob): void;
  pop(): ScheduledJob | undefined;
  peek(): ScheduledJob | undefined;
  remove(jobId: string): boolean;
  update(job: ScheduledJob): void;
  isEmpty(): boolean;
  size(): number;
  clear(): void;
}

/**
 * Create a priority queue
 * Uses Date comparison for priority (earlier dates = higher priority)
 */
export function createPriorityQueue(): PriorityQueue {
  const items: ScheduledJob[] = [];

  const compare = (a: ScheduledJob, b: ScheduledJob): number => {
    return a.nextRunAt.getTime() - b.nextRunAt.getTime();
  };

  const parent = (index: number): number => Math.floor((index - 1) / 2);
  const left = (index: number): number => 2 * index + 1;
  const right = (index: number): number => 2 * index + 2;

  const swap = (i: number, j: number) => {
    [items[i], items[j]] = [items[j], items[i]];
  };

  const heapifyUp = (index: number) => {
    while (index > 0) {
      const p = parent(index);
      if (compare(items[index], items[p]) < 0) {
        swap(index, p);
        index = p;
      } else {
        break;
      }
    }
  };

  const heapifyDown = (index: number) => {
    while (true) {
      let smallest = index;
      const l = left(index);
      const r = right(index);

      if (l < items.length && compare(items[l], items[smallest]) < 0) {
        smallest = l;
      }

      if (r < items.length && compare(items[r], items[smallest]) < 0) {
        smallest = r;
      }

      if (smallest !== index) {
        swap(index, smallest);
        index = smallest;
      } else {
        break;
      }
    }
  };

  return {
    items,

    add(job: ScheduledJob) {
      items.push(job);
      heapifyUp(items.length - 1);
    },

    pop(): ScheduledJob | undefined {
      if (items.length === 0) return undefined;
      const root = items[0];
      if (items.length === 1) {
        items.pop();
      } else {
        items[0] = items[items.length - 1];
        items.pop();
        heapifyDown(0);
      }
      return root;
    },

    peek(): ScheduledJob | undefined {
      return items.length > 0 ? items[0] : undefined;
    },

    remove(jobId: string): boolean {
      const index = items.findIndex((job) => job.id === jobId);
      if (index === -1) return false;

      if (index === items.length - 1) {
        items.pop();
      } else {
        items[index] = items[items.length - 1];
        items.pop();
        heapifyDown(index);
      }
      return true;
    },

    update(job: ScheduledJob): boolean {
      const index = items.findIndex((j) => j.id === job.id);
      if (index === -1) return false;

      items[index] = job;
      // Re-heapify from this position
      heapifyUp(index);
      heapifyDown(index);
      return true;
    },

    isEmpty(): boolean {
      return items.length === 0;
    },

    size(): number {
      return items.length;
    },

    clear(): void {
      items.length = 0;
    },
  };
}
