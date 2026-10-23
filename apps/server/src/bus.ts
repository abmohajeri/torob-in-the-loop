import { EventEmitter } from 'node:events';
import type { LiveEvent, SellerLiveEvent } from '@titl/shared';

/** In-process pub/sub feeding the SSE endpoints (single instance; swap for Redis pub/sub to scale out). */
export class EventBus {
  private ee = new EventEmitter();
  constructor() {
    this.ee.setMaxListeners(0);
  }

  publishSession(sessionId: string, ev: LiveEvent): void {
    this.ee.emit(`s:${sessionId}`, ev);
  }

  publishSeller(shopId: string, ev: SellerLiveEvent): void {
    this.ee.emit(`shop:${shopId}`, ev);
  }

  subscribeSession(sessionId: string, fn: (ev: LiveEvent) => void): () => void {
    const key = `s:${sessionId}`;
    this.ee.on(key, fn);
    return () => this.ee.off(key, fn);
  }

  subscribeSeller(shopId: string, fn: (ev: SellerLiveEvent) => void): () => void {
    const key = `shop:${shopId}`;
    this.ee.on(key, fn);
    return () => this.ee.off(key, fn);
  }
}
