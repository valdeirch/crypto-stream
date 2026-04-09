import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { FinnhubClient } from './modules/market/market.finnhub';
import { MarketService } from './modules/market/market.service';
import { MarketStore } from './modules/market/market.store';
import { ConnectionStatus } from './modules/market/market.types';

describe('AppController', () => {
  let appController: AppController;

  const mockFinnhubClient = {
    status: ConnectionStatus.CONNECTED,
    reconnectCount: 0,
  };

  const mockMarketService = {
    tradesProcessed: 42,
  };

  const mockMarketStore = {
    getMetrics: () => ({
      'ETH/USDC': { count: 10, average: 3000 },
      'ETH/USDT': { count: 10, average: 3010 },
      'ETH/BTC': { count: 10, average: 0.062 },
    }),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: FinnhubClient, useValue: mockFinnhubClient },
        { provide: MarketService, useValue: mockMarketService },
        { provide: MarketStore, useValue: mockMarketStore },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('GET /health', () => {
    it('returns status ok when Finnhub is connected', () => {
      const result = appController.getHealth() as Record<string, unknown>;
      expect(result.status).toBe('ok');
      expect(result.finnhub).toBe(ConnectionStatus.CONNECTED);
      expect(result.tradesProcessed).toBe(42);
      expect(result.reconnectCount).toBe(0);
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.memory).toBeDefined();
    });

    it('returns status degraded when Finnhub is disconnected', () => {
      mockFinnhubClient.status = ConnectionStatus.DISCONNECTED;
      const result = appController.getHealth() as Record<string, unknown>;
      expect(result.status).toBe('degraded');
      // Reset for other tests
      mockFinnhubClient.status = ConnectionStatus.CONNECTED;
    });
  });
});
