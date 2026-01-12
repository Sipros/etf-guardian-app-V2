import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "YOUR_SUPABASE_URL";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

// Initialize Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface PortfolioData {
  id?: string;
  totalValue: number;
  totalInvested: number;
  totalBuffer: number;
  totalPriceChange: number;
  priceChangePercentage: number;
  averageDrawdown: number;
  timestamp: string;
  assets: PortfolioAsset[];
}

export interface AssetPrice {
  id?: string;
  symbol: string;
  name: string;
  type: 'ETF' | 'CRYPTO';
  price: number;
  change: number;
  changePercent: number;
  timestamp: string;
  currency: string;
}

export interface PortfolioAsset {
  id?: string;
  symbol: string;
  name: string;
  type: 'ETF' | 'CRYPTO';
  data_inizio: string;
  prezzo_inizio: number;
  massimo_attuale: number;
  data_massimo: string;
  threshold_alert: number;
  attivo: boolean;
  created_at: string;
  updated_at: string;
}

export interface DrawdownAlert {
  id?: string;
  symbol: string;
  asset_name: string;
  drawdown: number;
  threshold: number;
  prezzo_corrente: number;
  massimo: number;
  timestamp: string;
  notifica_inviata: boolean;
}

export interface AlertData {
  id?: string;
  type: 'drawdown' | 'recovery' | 'threshold';
  asset: string;
  assetName: string;
  value: number;
  threshold?: number;
  message: string;
  timestamp: string;
}

export interface UserPreferences {
  id?: string;
  drawdownThreshold: number;
  recoveryThreshold: number;
  notificationsEnabled: boolean;
  timestamp: string;
}

export default supabase;
