import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { PriceUpdate, MarketState, ConnectionStatus } from '../types';

const MAX_HISTORY_POINTS = 50;

export function useCryptoStream(url: string = 'http://localhost:3000'): MarketState {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [prices, setPrices] = useState<Record<string, PriceUpdate>>({});
  const [history, setHistory] = useState<Record<string, PriceUpdate[]>>({});
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(url, {
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    });
    
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
      console.log('Connected to crypto stream backend');
    });

    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        setStatus('disconnected');
      } else {
        setStatus('reconnecting');
      }
      console.log('Disconnected from crypto stream backend:', reason);
    });

    socket.on('connect_error', () => setStatus('reconnecting'));
    socket.on('reconnect', () => setStatus('connected'));
    socket.on('reconnect_attempt', () => setStatus('reconnecting'));

    socket.on('snapshot', (data: Record<string, PriceUpdate>) => {
      setPrices(data);
      setHistory((prev) => {
        const newHistory = { ...prev };
        Object.values(data).forEach((update) => {
          if (!newHistory[update.pair]) {
            newHistory[update.pair] = [update];
          } else {
            const last = newHistory[update.pair][newHistory[update.pair].length - 1];
            if (last.timestamp !== update.timestamp) {
              newHistory[update.pair] = [...newHistory[update.pair], update].slice(-MAX_HISTORY_POINTS);
            }
          }
        });
        return newHistory;
      });
    });

    socket.on('price-update', (update: PriceUpdate) => {
      setPrices((prev) => ({ ...prev, [update.pair]: update }));
      
      setHistory((prev) => {
        const pairHistory = prev[update.pair] || [];
        // Prevent duplicate timestamps and preserve reference if unchanged
        if (pairHistory.length > 0 && pairHistory[pairHistory.length - 1].timestamp === update.timestamp) {
          return prev;
        }
        return {
          ...prev,
          [update.pair]: [...pairHistory, update].slice(-MAX_HISTORY_POINTS),
        };
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [url]);

  return { status, prices, history };
}
