export const HISTORY_CAP = 200;

/**
 * Generic bounded undo/redo stack. Entries are opaque to this class; the
 * caller decides how to apply them. Pushing clears the redo stack.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private readonly cap = HISTORY_CAP) {}

  push(entry: T): void {
    this.past.push(entry);
    if (this.past.length > this.cap) this.past.splice(0, this.past.length - this.cap);
    this.future = [];
  }

  /** Returns the entry to undo, moving it to the redo stack. */
  undo(): T | undefined {
    const e = this.past.pop();
    if (e !== undefined) this.future.push(e);
    return e;
  }

  /** Returns the entry to redo, moving it back to the undo stack. */
  redo(): T | undefined {
    const e = this.future.pop();
    if (e !== undefined) this.past.push(e);
    return e;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get size(): number {
    return this.past.length;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
