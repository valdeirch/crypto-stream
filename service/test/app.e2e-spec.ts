import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { FinnhubClient } from './../src/modules/market/market.finnhub';
import { ConnectionStatus } from './../src/modules/market/market.types';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Prevent the real FinnhubClient from opening a WebSocket during tests.
      .overrideProvider(FinnhubClient)
      .useValue({
        status: ConnectionStatus.CONNECTED,
        reconnectCount: 0,
        onModuleInit: () => {},
        onModuleDestroy: () => {},
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns 200 with a well-formed health payload', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(body.status).toBe('ok');
      expect(body.finnhub).toBe(ConnectionStatus.CONNECTED);
      expect(typeof body.tradesProcessed).toBe('number');
      expect(typeof body.uptime).toBe('number');
      expect(body.memory).toBeDefined();
      expect(body.storeMetrics).toBeDefined();
      expect(body.at).toBeDefined();
    });

    it('reports degraded when Finnhub is disconnected', async () => {
      // Swap the provider value mid-test to simulate a disconnected state.
      const client = app.get(FinnhubClient);
      (client as unknown as { status: ConnectionStatus }).status =
        ConnectionStatus.DISCONNECTED;

      const { body } = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(body.status).toBe('degraded');
      expect(body.finnhub).toBe(ConnectionStatus.DISCONNECTED);
    });
  });
});
