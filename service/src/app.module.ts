import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { MarketModule } from './modules/market/market.module';

@Module({
  imports: [MarketModule],
  controllers: [AppController],
})
export class AppModule {}
