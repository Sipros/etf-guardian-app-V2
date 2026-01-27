const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

// Portfolio assets to monitor
const ASSETS = [
  { symbol: 'XDWD', name: 'MSCI World', type: 'ETF' },
  { symbol: 'XAIX', name: 'AI/Tech', type: 'ETF' },
  { symbol: 'ZPDF', name: 'Financials', type: 'ETF' },
  { symbol: 'VVMX', name: 'Rare Earth', type: 'ETF' },
  { symbol: 'PPFB', name: 'Gold', type: 'ETF' },
  { symbol: 'BTC', name: 'Bitcoin', type: 'CRYPTO' },
  { symbol: 'ETH', name: 'Ethereum', type: 'CRYPTO' },
  { symbol: 'SOL', name: 'Solana', type: 'CRYPTO' }
];

// Drawdown configuration per tipo di asset
const DRAWDOWN_CONFIG = {
  ETF: [
    { level: -5, percentage: 30 },
    { level: -10, percentage: 20 },
    { level: -15, percentage: 10 },
    { level: -20, percentage: 5 },
    { level: -25, percentage: 5 },
    { level: -30, percentage: 10 },
    { level: -50, percentage: 50 },
  ],
  CRYPTO: [
    { level: -10, percentage: 20 },
    { level: -20, percentage: 30 },
    { level: -30, percentage: 25 },
    { level: -40, percentage: 15 },
    { level: -50, percentage: 10 },
  ]
};

// Fetch ETF price from Yahoo Finance
async function fetchETFPrice(symbol) {
  try {
    const tickerMapping = {
      'XDWD': 'XDWD.MI',
      'XAIX': 'XAIX.MI',
      'ZPDF': 'ZPDF.DE',
      'VVMX': 'VVMX.DE',
      'PPFB': 'PPFB.SG',
    };
    const yahooSymbol = tickerMapping[symbol] || symbol;
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`);
    const chart = response.data.chart.result[0];
    const currentPrice = chart.indicators.quote[0].close.at(-1);
    const previousClose = chart.meta.previousClose;
    return { price: currentPrice, change: currentPrice - previousClose, changePercent: ((currentPrice - previousClose) / previousClose) * 100 };
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error.message);
    return null;
  }
}

// Fetch Crypto price
async function fetchCryptoPrice(symbol) {
  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}-USD`);
    const chart = response.data.chart.result[0];
    const currentPrice = chart.indicators.quote[0].close.at(-1);
    const previousClose = chart.meta.previousClose;
    return { price: currentPrice, change: currentPrice - previousClose, changePercent: ((currentPrice - previousClose) / previousClose) * 100 };
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error.message);
    return null;
  }
}

// Save price to Supabase
async function savePriceToSupabase(asset, priceData) {
  try {
    const { error } = await supabase.from('prices').upsert({
      symbol: asset.symbol,
      name: asset.name,
      type: asset.type,
      price: priceData.price,
      change: priceData.change,
      change_percent: priceData.changePercent,
      currency: 'USD',
      timestamp: new Date().toISOString()
    }, { onConflict: 'symbol, timestamp' });

    if (error) {
      console.error(`Error saving price for ${asset.symbol}:`, error);
      return false;
    }
    console.log(`✅ ${asset.symbol}: $${priceData.price} (${priceData.changePercent.toFixed(2)}%)`);
    return true;
  } catch (error) {
    console.error(`Error saving price for ${asset.symbol}:`, error);
    return false;
  }
}

// Get last drawdown alert for an asset
async function getLastDrawdownAlert(symbol) {
  try {
    const { data, error } = await supabase.from('drawdown_alerts')
      .select('drawdown, timestamp, notifica_inviata')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();
    if (error || !data) return null;
    return data;
  } catch (error) {
    return null;
  }
}

// Send Telegram notification
async function sendTelegramNotification(message) {
  try {
    const botToken = process.env.EXPO_PUBLIC_TELEGRAM_BOT_TOKEN;
    const chatId = process.env.EXPO_PUBLIC_TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return false;
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
    if (!response.ok) {
      console.error('Telegram API error:', await response.json());
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
    return false;
  }
}

// Check drawdown levels with 1-hour reminder logic
async function checkDrawdownLevels(asset, currentPrice) {
  try {
    const { data: assetData } = await supabase.from('portfolio_assets')
      .select('massimo_attuale').eq('symbol', asset.symbol).single();
    if (!assetData) return;
    const peak = assetData.massimo_attuale;
    const currentDrawdown = ((currentPrice - peak) / peak) * 100;
    const config = DRAWDOWN_CONFIG[asset.type] || DRAWDOWN_CONFIG.ETF;

    const { data: usedLevels } = await supabase.from('drawdown_levels')
      .select('level, used, created_at')
      .eq('symbol', asset.symbol).eq('peak_price', peak);

    // Newly available levels
    const newlyAvailable = config.filter(l => currentDrawdown <= l.level && !usedLevels?.find(u => u.level === l.level)?.used);

    // Levels available for >1 hour
    const reminderLevels = config.filter(l => {
      const usedLevel = usedLevels?.find(u => u.level === l.level);
      if (!usedLevel || usedLevel.used) return false;
      const createdAt = usedLevel.created_at;
      if (!createdAt) return false;
      const hoursDiff = (new Date() - new Date(createdAt)) / (1000 * 60 * 60);
      return hoursDiff >= 1;
    });

    // Send notifications for newly available levels
    if (newlyAvailable.length > 0) {
      const levelsText = newlyAvailable.map(l => `${l.level}% (${l.percentage}% buffer)`).join(', ');
      const message = `🎯 Livelli Drawdown Disponibili\nAsset: ${asset.symbol}\nPrezzo: $${currentPrice.toFixed(4)}\nDrawdown: ${currentDrawdown.toFixed(2)}%\nLivelli: ${levelsText}`;
      await sendTelegramNotification(message);

      // Mark as available in DB
      for (const level of newlyAvailable) {
        await supabase.from('drawdown_levels').upsert({
          symbol: asset.symbol,
          level: level.level,
          percentage: level.percentage,
          used: false,
          peak_price: peak,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'symbol,level,peak_price' });
      }
    }

    // Send reminder notifications after 1 hour
    if (reminderLevels.length > 0) {
      const levelsText = reminderLevels.map(l => `${l.level}% (${l.percentage}% buffer)`).join(', ');
      const message = `⏰ RICORDA: Livelli Drawdown ancora disponibili da >1h\nAsset: ${asset.symbol}\nPrezzo: $${currentPrice.toFixed(4)}\nLivelli: ${levelsText}`;
      await sendTelegramNotification(message);
    }

  } catch (error) {
    console.error(`Error checking drawdown levels for ${asset.symbol}:`, error);
  }
}

// Check drawdown alerts with variation logic
async function checkDrawdownAlerts(asset, currentPrice) {
  try {
    const { data: assetData } = await supabase.from('portfolio_assets')
      .select('massimo_attuale, threshold_alert, attivo')
      .eq('symbol', asset.symbol).single();
    if (!assetData?.attivo) return;

    const peak = assetData.massimo_attuale;
    const threshold = assetData.threshold_alert;
    const drawdown = ((currentPrice - peak) / peak) * 100;

    const lastAlert = await getLastDrawdownAlert(asset.symbol);
    const VARIATION_THRESHOLD = 1.0;

    let shouldSendAlert = false;

    if (drawdown <= -threshold) {
      if (!lastAlert) shouldSendAlert = true;
      else if (Math.abs(drawdown - lastAlert.drawdown) >= VARIATION_THRESHOLD) shouldSendAlert = true;

      if (shouldSendAlert) {
        const alertId = `alert_${new Date().toISOString().replace(/[:.]/g, '').replace('T', '_')}_${asset.symbol.toLowerCase()}`;
        await supabase.from('drawdown_alerts').insert({
          id: alertId,
          symbol: asset.symbol,
          asset_name: asset.name,
          drawdown: drawdown,
          threshold: threshold,
          prezzo_corrente: currentPrice,
          massimo: peak,
          timestamp: new Date().toISOString(),
          notifica_inviata: true
        });
      }
    }

    if (currentPrice > peak) {
      await supabase.from('portfolio_assets').update({
        massimo_attuale: currentPrice,
        updated_at: new Date().toISOString()
      }).eq('symbol', asset.symbol);
    }
  } catch (error) {
    console.error(`Error checking alerts for ${asset.symbol}:`, error);
  }
}

// Main monitoring function
async function monitorPrices() {
  console.log(`🚀 Starting price monitoring at ${new Date().toISOString()}`);
  let successCount = 0;

  for (const asset of ASSETS) {
    try {
      const priceData = asset.type === 'ETF' ? await fetchETFPrice(asset.symbol) : await fetchCryptoPrice(asset.symbol);
      if (!priceData) continue;
      const saved = await savePriceToSupabase(asset, priceData);
      if (saved) {
        await checkDrawdownAlerts(asset, priceData.price);
        await checkDrawdownLevels(asset, priceData.price);
        successCount++;
      }
      await new Promise(r => setTimeout(r, 1000)); // Avoid rate limit
    } catch (error) {
      console.error(`❌ Error processing ${asset.symbol}:`, error);
    }
  }

  console.log(`✅ Monitoring completed: ${successCount}/${ASSETS.length} assets updated`);
}

// Run monitoring
monitorPrices()
  .then(() => console.log('🎉 Price monitoring completed successfully'))
  .catch(error => console.error('❌ Price monitoring failed:', error));
