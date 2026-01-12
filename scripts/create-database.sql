-- ETF Guardian Database Schema
-- Create tables for Supabase

-- Portfolio snapshots table
CREATE TABLE IF NOT EXISTS portfolio (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  total_value DECIMAL(15,2) NOT NULL,
  total_invested DECIMAL(15,2) NOT NULL,
  total_buffer DECIMAL(15,2) NOT NULL,
  total_price_change DECIMAL(15,2) NOT NULL,
  price_change_percentage DECIMAL(8,4) NOT NULL,
  average_drawdown DECIMAL(8,4) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Asset prices table
CREATE TABLE IF NOT EXISTS prices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ETF', 'CRYPTO')),
  price DECIMAL(15,2) NOT NULL,
  change DECIMAL(15,2) NOT NULL,
  change_percent DECIMAL(8,4) NOT NULL,
  currency TEXT DEFAULT 'USD',
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(symbol, timestamp)
);

-- Portfolio assets table
CREATE TABLE IF NOT EXISTS portfolio_assets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ETF', 'CRYPTO')),
  data_inizio TIMESTAMP WITH TIME ZONE NOT NULL,
  prezzo_inizio DECIMAL(15,2) NOT NULL,
  massimo_attuale DECIMAL(15,2) NOT NULL,
  data_massimo TIMESTAMP WITH TIME ZONE NOT NULL,
  threshold_alert DECIMAL(5,2) DEFAULT 15.0,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('drawdown', 'recovery', 'threshold')),
  asset TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  value DECIMAL(15,2) NOT NULL,
  threshold DECIMAL(5,2),
  message TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drawdown alerts table
CREATE TABLE IF NOT EXISTS drawdown_alerts (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  drawdown DECIMAL(8,4) NOT NULL,
  threshold DECIMAL(5,2) NOT NULL,
  prezzo_corrente DECIMAL(15,2) NOT NULL,
  massimo DECIMAL(15,2) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notifica_inviata BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User preferences table
CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY DEFAULT 'user',
  drawdown_threshold DECIMAL(5,2) DEFAULT 15.0,
  recovery_threshold DECIMAL(5,2) DEFAULT 5.0,
  notifications_enabled BOOLEAN DEFAULT true,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Device tokens for push notifications
CREATE TABLE IF NOT EXISTS device_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  device_id TEXT,
  platform TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_portfolio_timestamp ON portfolio(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_prices_symbol_timestamp ON prices(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_drawdown_alerts_timestamp ON drawdown_alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_assets_symbol ON portfolio_assets(symbol);
CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token);

-- Enable Row Level Security (RLS)
ALTER TABLE portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawdown_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all operations for anonymous users)
CREATE POLICY "Enable all operations for anonymous users" ON portfolio
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all operations for anonymous users" ON prices
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all operations for anonymous users" ON portfolio_assets
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all operations for anonymous users" ON alerts
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all operations for anonymous users" ON drawdown_alerts
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all operations for anonymous users" ON preferences
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all operations for anonymous users" ON device_tokens
  FOR ALL USING (true) WITH CHECK (true);

-- Insert default user preferences
INSERT INTO preferences (id, drawdown_threshold, recovery_threshold, notifications_enabled)
VALUES ('user', 15.0, 5.0, true)
ON CONFLICT (id) DO NOTHING;
