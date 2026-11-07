// The Guard as a Durable Object (one instance, named "guard", in Western
// Europe). All the logic is in worker/guard.ts; this only hands it the
// object's own storage. Workers call its methods directly (RPC).
import { DurableObject } from 'cloudflare:workers';
import { GuardCore, type GuardStore } from './guard.ts';

export class Guard extends DurableObject {
  private core: GuardCore;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.core = new GuardCore(ctx.storage as unknown as GuardStore, () => Date.now());
  }

  hit(key: string, limit: number, windowS: number) { return this.core.hit(key, limit, windowS); }
  claim(key: string, ttlS: number, value?: string) { return this.core.claim(key, ttlS, value); }
  settle(key: string, value: string, ttlS: number) { return this.core.settle(key, value, ttlS); }
  release(key: string) { return this.core.release(key); }
  sessionCreate(ttlS: number) { return this.core.sessionCreate(ttlS); }
  sessionCheck(id: string) { return this.core.sessionCheck(id); }
  sessionEnd(id: string) { return this.core.sessionEnd(id); }
  sessionEndAll() { return this.core.sessionEndAll(); }
  sweep() { return this.core.sweep(); }
}
