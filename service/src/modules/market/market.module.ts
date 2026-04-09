import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MarketStore } from './market.store';
import { MarketGateway } from './market.gateway';
import { MarketService } from './market.service';
import { FinnhubClient } from './market.finnhub';

// Dependency resolution order (no cycles):
//   MarketStore      — no deps
//   MarketGateway    — needs MarketStore
//   MarketService    — needs MarketStore + EventEmitter2
//   FinnhubClient    — needs MarketService

@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [MarketStore, MarketGateway, MarketService, FinnhubClient],
  // Export service and client so AppController can read metrics and connection status
  exports: [MarketService, FinnhubClient, MarketStore],
})
export class MarketModule {}
