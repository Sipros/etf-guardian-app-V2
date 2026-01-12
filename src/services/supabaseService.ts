import { supabase, PortfolioData, AssetPrice, PortfolioAsset, DrawdownAlert, AlertData, UserPreferences } from '../config/supabase';

// Save portfolio snapshot to Supabase
export const savePortfolioSnapshot = async (portfolioData: PortfolioData): Promise<void> => {
  try {
    const { error } = await supabase
      .from('portfolio')
      .insert([{
        ...portfolioData,
        timestamp: new Date().toISOString(),
      }]);
    
    if (error) {
      console.error('Error saving portfolio snapshot:', error);
      throw error;
    }
    console.log('Portfolio snapshot saved to Supabase');
  } catch (error) {
    console.error('Error saving portfolio snapshot:', error);
    throw error;
  }
};

// Save asset price to Supabase
export const saveAssetPrice = async (assetData: AssetPrice): Promise<void> => {
  try {
    const { error } = await supabase
      .from('prices')
      .upsert({
        ...assetData,
        timestamp: new Date().toISOString(),
      }, {
        onConflict: 'symbol'
      });
    
    if (error) {
      console.error(`Error saving price for ${assetData.symbol}:`, error);
      throw error;
    }
    console.log(`Price saved for ${assetData.symbol}`);
  } catch (error) {
    console.error(`Error saving price for ${assetData.symbol}:`, error);
    throw error;
  }
};

// Save multiple asset prices
export const saveMultipleAssetPrices = async (assets: AssetPrice[]): Promise<void> => {
  const promises = assets.map(asset => saveAssetPrice(asset));
  await Promise.all(promises);
};

// Get latest portfolio snapshot
export const getLatestPortfolioSnapshot = async (): Promise<PortfolioData | null> => {
  try {
    const { data, error } = await supabase
      .from('portfolio')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      console.error('Error getting latest portfolio snapshot:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error getting latest portfolio snapshot:', error);
    return null;
  }
};

// Get asset price history
export const getAssetPriceHistory = async (symbol: string, limit: number = 30): Promise<AssetPrice[]> => {
  try {
    const { data, error } = await supabase
      .from('prices')
      .select('*')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error(`Error getting price history for ${symbol}:`, error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error(`Error getting price history for ${symbol}:`, error);
    return [];
  }
};

// Save alert to Supabase
export const saveAlert = async (alertData: AlertData): Promise<void> => {
  try {
    const { error } = await supabase
      .from('alerts')
      .insert([{
        ...alertData,
        timestamp: new Date().toISOString(),
      }]);
    
    if (error) {
      console.error('Error saving alert:', error);
      throw error;
    }
    console.log('Alert saved to Supabase');
  } catch (error) {
    console.error('Error saving alert:', error);
    throw error;
  }
};

// Get recent alerts
export const getRecentAlerts = async (limit: number = 10): Promise<AlertData[]> => {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error getting recent alerts:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error getting recent alerts:', error);
    return [];
  }
};

// Save user preferences
export const saveUserPreferences = async (preferences: {
  drawdownThreshold: number;
  recoveryThreshold: number;
  notificationsEnabled: boolean;
}): Promise<void> => {
  try {
    const { error } = await supabase
      .from('preferences')
      .upsert({
        id: 'user',
        ...preferences,
        timestamp: new Date().toISOString(),
      }, {
        onConflict: 'id'
      });
    
    if (error) {
      console.error('Error saving user preferences:', error);
      throw error;
    }
    console.log('User preferences saved');
  } catch (error) {
    console.error('Error saving user preferences:', error);
    throw error;
  }
};

// Initialize portfolio with current mock data as peaks
export const initializePortfolioWithCurrentData = async () => {
  const mockAssets = [
    {
      symbol: 'VOO',
      name: 'Vanguard S&P 500',
      type: 'ETF' as const,
      current_price: 638.31,
      monthly_investment: 500,
      allocation: 35
    },
    {
      symbol: 'BTC',
      name: 'Bitcoin', 
      type: 'CRYPTO' as const,
      current_price: 90524.70,
      monthly_investment: 300,
      allocation: 25
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      type: 'CRYPTO' as const,
      current_price: 2280.75,
      monthly_investment: 250,
      allocation: 18
    },
    {
      symbol: 'BND',
      name: 'Vanguard Bond ETF',
      type: 'ETF' as const,
      current_price: 76.42,
      monthly_investment: 200,
      allocation: 12
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      type: 'CRYPTO' as const,
      current_price: 187.30,
      monthly_investment: 150,
      allocation: 10
    }
  ];

  const now = new Date().toISOString();
  
  for (const asset of mockAssets) {
    // Check if asset already exists
    const { data: existingAsset } = await supabase
      .from('portfolio_assets')
      .select('*')
      .eq('symbol', asset.symbol)
      .single();
    
    if (!existingAsset) {
      // Create new asset with current price as initial peak
      const portfolioAsset: PortfolioAsset = {
        symbol: asset.symbol,
        name: asset.name,
        type: asset.type,
        data_inizio: now,
        prezzo_inizio: asset.current_price,
        massimo_attuale: asset.current_price, // Current price becomes initial peak
        data_massimo: now,
        threshold_alert: 15,
        attivo: true,
        created_at: now,
        updated_at: now
      };
      
      const { error } = await supabase
        .from('portfolio_assets')
        .insert([portfolioAsset]);
      
      if (error) {
        console.error(`Error initializing ${asset.symbol}:`, error);
      } else {
        console.log(`✅ Initialized ${asset.symbol} with peak: $${asset.current_price}`);
      }
    } else {
      console.log(`ℹ️ ${asset.symbol} already exists in portfolio`);
    }
  }
};

// Get asset peak from Supabase
export const getAssetPeak = async (symbol: string): Promise<number | null> => {
  try {
    const { data, error } = await supabase
      .from('portfolio_assets')
      .select('massimo_attuale')
      .eq('symbol', symbol)
      .single();
    
    if (error) {
      console.error(`Error getting peak for ${symbol}:`, error);
      return null;
    }
    
    return data?.massimo_attuale || null;
  } catch (error) {
    console.error(`Error getting peak for ${symbol}:`, error);
    return null;
  }
};

// Update asset peak in Supabase
export const updateAssetPeak = async (symbol: string, newPeak: number): Promise<boolean> => {
  try {
    const now = new Date().toISOString();
    
    const { error } = await supabase
      .from('portfolio_assets')
      .update({
        massimo_attuale: newPeak,
        data_massimo: now,
        updated_at: now
      })
      .eq('symbol', symbol);
    
    if (error) {
      console.error(`Error updating peak for ${symbol}:`, error);
      return false;
    }
    
    console.log(`📈 Updated ${symbol} peak to: $${newPeak}`);
    return true;
  } catch (error) {
    console.error(`Error updating peak for ${symbol}:`, error);
    return false;
  }
};

// Calculate real drawdown based on Supabase peak
export const calculateDrawdown = async (symbol: string, currentPrice: number): Promise<number> => {
  try {
    const peak = await getAssetPeak(symbol);
    if (!peak) return 0;
    
    const drawdown = ((currentPrice - peak) / peak) * 100;
    return drawdown;
  } catch (error) {
    console.error(`Error calculating drawdown for ${symbol}:`, error);
    return 0;
  }
};

// Log drawdown alert
export const logDrawdownAlert = async (alert: Omit<DrawdownAlert, 'id' | 'timestamp' | 'notifica_inviata'>) => {
  try {
    const alertId = `alert_${new Date().toISOString().replace(/[:.]/g, '').replace('T', '_')}_${alert.symbol.toLowerCase()}`;
    
    const alertData: DrawdownAlert = {
      ...alert,
      id: alertId,
      timestamp: new Date().toISOString(),
      notifica_inviata: true
    };
    
    const { error } = await supabase
      .from('drawdown_alerts')
      .insert([alertData]);
    
    if (error) {
      console.error('Error logging drawdown alert:', error);
    } else {
      console.log(`🚨 Logged drawdown alert for ${alert.symbol}: ${alert.drawdown}%`);
    }
  } catch (error) {
    console.error('Error logging drawdown alert:', error);
  }
};

// Get all portfolio assets
export const getPortfolioAssets = async (): Promise<PortfolioAsset[]> => {
  try {
    const { data, error } = await supabase
      .from('portfolio_assets')
      .select('*');
    
    if (error) {
      console.error('Error getting portfolio assets:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error getting portfolio assets:', error);
    return [];
  }
};

// Real-time subscription for portfolio changes
export const subscribeToPortfolioChanges = (callback: (data: PortfolioData) => void) => {
  return supabase
    .channel('portfolio-changes')
    .on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'portfolio' 
      },
      (payload: any) => {
        if (payload.eventType === 'INSERT') {
          callback(payload.new as PortfolioData);
        }
      }
    )
    .subscribe();
};

// Real-time subscription for alerts
export const subscribeToAlerts = (callback: (alert: AlertData) => void) => {
  return supabase
    .channel('alert-changes')
    .on('postgres_changes', 
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'alerts' 
      },
      (payload: any) => {
        callback(payload.new as AlertData);
      }
    )
    .subscribe();
};
