export class HeartbeatLoop {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly beat: () => void,
  ) {}

  start(): void {
    if (this.timer != null) {
      return;
    }
    this.beat();
    this.timer = setInterval(() => {
      this.beat();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
