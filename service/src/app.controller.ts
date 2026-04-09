import { Controller, Get } from '@nestjs/common';
import { FinnhubClient } from './modules/market/market.finnhub';
import { MarketService } from './modules/market/market.service';
import { MarketStore } from './modules/market/market.store';

@Controller()
export class AppController {
  constructor(
    private readonly finnhubClient: FinnhubClient,
    private readonly marketService: MarketService,
    private readonly marketStore: MarketStore,
  ) {}

  @Get('health')
  getHealth(): object {
    const mem = process.memoryUsage();

    return {
      status: this.finnhubClient.status === 'CONNECTED' ? 'ok' : 'degraded',
      finnhub: this.finnhubClient.status,
      reconnectCount: this.finnhubClient.reconnectCount,
      tradesProcessed: this.marketService.tradesProcessed,
      storeMetrics: this.marketStore.getMetrics(),
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: formatBytes(mem.rss),
        heapUsed: formatBytes(mem.heapUsed),
        heapTotal: formatBytes(mem.heapTotal),
      },
      at: new Date().toISOString(),
    };
  }
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
