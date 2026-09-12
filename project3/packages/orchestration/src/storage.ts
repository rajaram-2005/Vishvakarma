// §121 — Storage. A small, environment-agnostic persistence layer so projects,
// Library assets, schedules, runs and traces survive restarts (also fulfilling
// the §8 checkpoint-persistence requirement). In-memory by default; any backend
// can be plugged in by implementing `Storage`.

export interface Storage {
  get<T>(collection: string, key: string): T | undefined;
  set<T>(collection: string, key: string, value: T): void;
  delete(collection: string, key: string): boolean;
  list<T>(collection: string): T[];
  keys(collection: string): string[];
}

export class MemoryStorage implements Storage {
  private data = new Map<string, Map<string, unknown>>();

  private col(name: string): Map<string, unknown> {
    let c = this.data.get(name);
    if (!c) {
      c = new Map();
      this.data.set(name, c);
    }
    return c;
  }

  get<T>(collection: string, key: string): T | undefined {
    return this.col(collection).get(key) as T | undefined;
  }

  set<T>(collection: string, key: string, value: T): void {
    this.col(collection).set(key, value);
  }

  delete(collection: string, key: string): boolean {
    return this.col(collection).delete(key);
  }

  list<T>(collection: string): T[] {
    return [...this.col(collection).values()] as T[];
  }

  keys(collection: string): string[] {
    return [...this.col(collection).keys()];
  }
}
