import React from 'react';
import { useCryptoStream } from './hooks/useCryptoStream';
import { PriceCard } from './components/PriceCard';
import { Activity, Server, Wifi, WifiOff, RefreshCw } from 'lucide-react';

export default function App() {
  const { status, prices, history } = useCryptoStream('http://localhost:3000');
  const pairs = ['ETH/USDC', 'ETH/USDT', 'ETH/BTC'];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="bg-slate-900/80 border-b border-slate-800 sticky top-0 z-10 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-500/20 p-2 rounded-lg border border-indigo-500/30">
              <Activity className="w-5 h-5 text-indigo-400" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Crypto Stream
            </h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className={`flex items-center px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              status === 'connected' 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : status === 'reconnecting'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}>
              {status === 'connected' && <><Wifi className="w-4 h-4 mr-2 animate-pulse" /> Live</>}
              {status === 'reconnecting' && <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Reconnecting...</>}
              {status === 'disconnected' && <><WifiOff className="w-4 h-4 mr-2" /> Disconnected</>}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {status === 'disconnected' && Object.keys(prices).length === 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 mb-8 flex items-start space-x-4">
            <Server className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-amber-400 font-medium mb-1">Backend Not Connected</h3>
              <p className="text-amber-400/80 text-sm">
                Waiting for connection to <code className="bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-300">http://localhost:3000</code>. 
                Make sure your NestJS backend is running locally.
              </p>
            </div>
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-lg font-medium text-slate-300 mb-4">Real-Time Markets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pairs.map((pair) => (
              <PriceCard 
                key={pair} 
                pair={pair} 
                data={prices[pair]} 
                history={history[pair]} 
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
