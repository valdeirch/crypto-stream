import React, { useEffect, useRef, useState } from 'react';
import { PriceUpdate } from '../types';
import { LineChart, Line, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Activity, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface PriceCardProps {
  pair: string;
  data?: PriceUpdate;
  history?: PriceUpdate[];
}

const MIN_DATA_POINTS = 5;

// React.memo prevents re-rendering when OTHER pairs receive updates
export const PriceCard = React.memo(({ pair, data, history = [] }: PriceCardProps) => {
  const isBTC = pair.includes('BTC');
  const prevPriceRef = useRef<number | null>(null);
  const [flashClass, setFlashClass] = useState<string>('');

  // Trigger flash animation on price change
  useEffect(() => {
    if (data) {
      if (prevPriceRef.current !== null && prevPriceRef.current !== data.price) {
        const isUp = data.price > prevPriceRef.current;
        setFlashClass(isUp ? 'price-flash-green' : 'price-flash-red');
        const timer = setTimeout(() => setFlashClass(''), 800);
        prevPriceRef.current = data.price;
        return () => clearTimeout(timer);
      }
      prevPriceRef.current = data.price;
    }
  }, [data?.price]);

  const formatPrice = (value: number) => {
    if (isBTC) {
      return `${value.toFixed(6)} BTC`;
    }
    return `${new Intl.NumberFormat('en-US', {
      style: 'decimal',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)} ${pair.split('/')[1]}`;
  };

  // Loading / Empty State
  if (!data || history.length < MIN_DATA_POINTS) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 flex flex-col items-center justify-center min-h-[260px]">
        <Activity className="w-8 h-8 text-indigo-500/50 mb-4 animate-pulse" />
        <p className="text-slate-400 font-medium text-sm">Collecting data for {pair}...</p>
        <p className="text-slate-500 text-xs mt-2">
          {history.length} / {MIN_DATA_POINTS} points
        </p>
        {/* Skeleton Chart */}
        <div className="w-full h-[80px] mt-6 bg-slate-800/50 rounded animate-pulse"></div>
      </div>
    );
  }

  const isUp = data.price >= data.hourlyAverage;
  const diff = data.price - data.hourlyAverage;
  const percentDiff = (diff / data.hourlyAverage) * 100;

  const chartData = history.map(h => ({
    price: h.price,
    time: format(new Date(h.timestamp), 'HH:mm:ss'),
    timestamp: h.timestamp
  }));

  const prices = chartData.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.1 || data.price * 0.001;

  const latency = Date.now() - data.timestamp;

  return (
    <div className={`bg-slate-800/80 border border-slate-700 rounded-xl p-6 shadow-xl backdrop-blur-sm transition-all duration-300 hover:border-slate-500 hover:shadow-2xl hover:bg-slate-800 relative overflow-hidden group ${flashClass.replace('price-', '')}`}>
      
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div>
          <h3 className="text-slate-400 font-medium text-sm mb-1">{pair}</h3>
          <div className={`text-3xl font-bold text-white tracking-tight transition-colors ${flashClass}`}>
            {formatPrice(data.price)}
          </div>
        </div>
        <div className={`flex items-center px-2.5 py-1 rounded-full text-sm font-medium transition-colors ${isUp ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
          {isUp ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
          {Math.abs(percentDiff).toFixed(3)}%
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50 transition-colors group-hover:border-slate-600/50">
          <div className="text-slate-500 text-xs mb-1">Hourly Average</div>
          <div className="text-slate-200 font-medium text-sm">{formatPrice(data.hourlyAverage)}</div>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50 transition-colors group-hover:border-slate-600/50">
          <div className="text-slate-500 text-xs mb-1 flex items-center">
            <Clock className="w-3 h-3 mr-1" /> Last Update
          </div>
          <div className="text-slate-200 font-medium text-sm flex items-center justify-between">
            <span>{format(new Date(data.timestamp), 'HH:mm:ss.SSS')}</span>
            {latency >= 0 && latency < 60000 && (
              <span className="text-[10px] text-slate-500 ml-2">{latency}ms</span>
            )}
          </div>
        </div>
      </div>

      <div className="h-[80px] w-full mt-auto relative z-10">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <YAxis domain={[minPrice - padding, maxPrice + padding]} hide />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-slate-900 border border-slate-700 p-2 rounded shadow-lg text-xs">
                      <div className="text-slate-400 mb-1">{payload[0].payload.time}</div>
                      <div className="font-medium text-white">{formatPrice(payload[0].value as number)}</div>
                    </div>
                  );
                }
                return null;
              }}
              cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '4 4' }}
              isAnimationActive={false}
            />
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke={isUp ? '#34d399' : '#fb7185'} 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: isUp ? '#34d399' : '#fb7185', stroke: '#0f172a', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
