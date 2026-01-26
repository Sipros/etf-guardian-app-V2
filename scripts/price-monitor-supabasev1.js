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
    // Configurazione crypto da definire in futuro
    // Esempio: livelli più aggressivi per crypto
    { level: -10, percentage: 20 },
    { level: -20, percentage: 30 },
    { level: -30, percentage: 25 },
    { level: -40, percentage: 15 },
    { level: -50, percentage: 10 },
  ]
};

// Yahoo Finance API
async function fetchETFPrice(symbol) {
  try {
    // Map European ETFs to Yahoo Finance tickers
    const tickerMapping = {
      'XDWD': 'XDWD.MI',  // MSCI World - ticker italiano
      'XAIX': 'XAIX.MI',  // AI/Tech - ticker italiano  
      'ZPDF': 'ZPDF.DE',  // Financials - ticker tedesco
      'VVMX': 'VVMX.DE', // Rare Earth - ticker tedesco
      'PPFB': 'PPFB.SG',  // Gold - ticker di Singapore
    };

    const yahooSymbol = tickerMapping[symbol] || symbol;
    
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`);
    const chart = response.data.chart.result[0];
    const currentPrice = chart.indicators.quote[0].close[chart.indicators.quote[0].close.length - 1];
    const previousClose = chart.meta.previousClose;
    
    return {
      price: currentPrice,
      change: currentPrice - previousClose,
      changePercent: ((currentPrice - previousClose) / previousClose) * 100
    };
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error.message);
    return null;
  }
}

// Yahoo Finance API for Crypto (using -USD suffix)
async function fetchCryptoPrice(symbol) {
  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}-USD`);
    const chart = response.data.chart.result[0];
    const currentPrice = chart.indicators.quote[0].close[chart.indicators.quote[0].close.length - 1];
    const previousClose = chart.meta.previousClose;
    
    return {
      price: currentPrice,
      change: currentPrice - previousClose,
      changePercent: ((currentPrice - previousClose) / previousClose) * 100
    };
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error.message);
    return null;
  }
}

// Save price to Supabase
async function savePriceToSupabase(asset, priceData) {
  try {
    const { error } = await supabase
      .from('prices')
      .upsert({
        symbol: asset.symbol,
        name: asset.name,
        type: asset.type,
        price: priceData.price,
        change: priceData.change,
        change_percent: priceData.changePercent,
        currency: 'USD',
        timestamp: new Date().toISOString()
      }, {
        onConflict: 'symbol, timestamp'
      });
    
    if (error) {
      console.error(`Error saving price for ${asset.symbol}:`, error);
      return false;
    }
    
    console.log(`✅ ${asset.symbol}: $${priceData.price} (${priceData.changePercent >= 0 ? '+' : ''}${priceData.changePercent.toFixed(2)}%)`);
    return true;
  } catch (error) {
    console.error(`Error saving price for ${asset.symbol}:`, error);
    return false;
  }
}

// Get last drawdown alert for an asset
async function getLastDrawdownAlert(symbol) {
  try {
    const { data, error } = await supabase
      .from('drawdown_alerts')
      .select('drawdown, timestamp')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !data) {
      return null;
    }
    
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
    
    if (!botToken || !chatId) {
      console.warn('Telegram not configured, skipping notification');
      return false;
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Telegram API error:', errorData);
      return false;
    }

    console.log('📨 Telegram notification sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
    return false;
  }
}

// Check drawdown levels and send Telegram notifications
async function checkDrawdownLevels(asset, currentPrice) {
  try {
    // Get asset peak and used levels
    const { data: assetData } = await supabase
      .from('portfolio_assets')
      .select('massimo_attuale')
      .eq('symbol', asset.symbol)
      .single();

    if (!assetData) {
      console.log(`⚠️ No asset data found for ${asset.symbol}`);
      return;
    }

    const peak = assetData.massimo_attuale;
    const currentDrawdown = ((currentPrice - peak) / peak) * 100;

    // Get configuration per tipo di asset
    const config = DRAWDOWN_CONFIG[asset.type] || DRAWDOWN_CONFIG.ETF;

    // Get used drawdown levels for current peak
    const { data: usedLevels } = await supabase
      .from('drawdown_levels')
      .select('level, used, created_at')
      .eq('symbol', asset.symbol)
      .eq('peak_price', peak);

    console.log(`🔍 Checking ${asset.symbol} (${asset.type}): drawdown ${currentDrawdown.toFixed(2)}%, config has ${config.length} levels`);

    // Check for newly available levels
    const newlyAvailable = config.filter(drawdownConfig => {
      const isDrawdownReached = currentDrawdown <= drawdownConfig.level;
      const isUsed = usedLevels?.find(l => l.level === drawdownConfig.level)?.used;
      return isDrawdownReached && !isUsed;
    });

    // Check for reminder levels (available but not invested for > 1 hour)
    const reminderLevels = config.filter(drawdownConfig => {
      const isDrawdownReached = currentDrawdown <= drawdownConfig.level;
      const usedLevel = usedLevels?.find(l => l.level === drawdownConfig.level);
      const isUsed = usedLevel?.used;
      const createdAt = usedLevel?.created_at;
      
      if (!isDrawdownReached || isUsed) return false;
      
      // Check if level was marked as "available" for more than 1 hour
      if (createdAt) {
        const createdTime = new Date(createdAt);
        const now = new Date();
        const hoursDiff = (now - createdTime) / (1000 * 60 * 60);
        return hoursDiff >= 1;
      }
      
      return false;
    });

    // Send notifications for newly available levels
    if (newlyAvailable.length > 0) {
      const levelsText = newlyAvailable
        .map(l => `${l.level}% (${l.percentage}% del buffer)`)
        .join(', ');
      
      const message = `🎯 Livelli Drawdown Disponibili\n\n` +
        `Asset: ${asset.symbol} (${asset.type})\n` +
        `Prezzo: $${currentPrice.toFixed(4)}\n` +
        `Drawdown: ${currentDrawdown.toFixed(2)}%\n` +
        `Livelli: ${levelsText}\n\n` +
        `Apri l'app per investire manualmente`;

      await sendTelegramNotification(message);
      console.log(`📨 Telegram notification sent for ${asset.symbol} (${asset.type}): ${levelsText}`);
      
      // Mark levels as "available" by creating records with created_at timestamp
      for (const level of newlyAvailable) {
        await supabase
          .from('drawdown_levels')
          .upsert({
            symbol: asset.symbol,
            level: level.level,
            percentage: level.percentage,
            used: false,
            peak_price: peak,
            peak_date: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'symbol,level,peak_price'
          });
      }
    }

    // Send reminder notifications for levels not invested after 1 hour
    if (reminderLevels.length > 0) {
      const levelsText = reminderLevels
        .map(l => `${l.level}% (${l.percentage}% del buffer)`)
        .join(', ');
      
      const message = `⏰ RICORDA: Livelli Drawdown Ancora Disponibili\n\n` +
        `Asset: ${asset.symbol} (${asset.type})\n` +
        `Prezzo: $${currentPrice.toFixed(4)}\n` +
        `Drawdown: ${currentDrawdown.toFixed(2)}%\n` +
        `Livelli da oltre 1 ora: ${levelsText}\n\n` +
        `💡 Non hai ancora investito a questi livelli!\n` +
        `Apri l'app per investire ora`;

      await sendTelegramNotification(message);
      console.log(`⏰ Reminder sent for ${asset.symbol} (${asset.type}): ${levelsText}`);
    }

    if (newlyAvailable.length === 0 && reminderLevels.length === 0) {
      console.log(`📋 No new drawdown levels available for ${asset.symbol}`);
    }
  } catch (error) {
    console.error(`Error checking drawdown levels for ${asset.symbol}:`, error);
  }
}

// Check for drawdown alerts with variation logic
async function checkDrawdownAlerts(asset, currentPrice) {
  try {
    // Get asset peak from Supabase
    const { data: assetData, error } = await supabase
      .from('portfolio_assets')
      .select('massimo_attuale, threshold_alert, attivo')
      .eq('symbol', asset.symbol)
      .single();
    
    if (error || !assetData || !assetData.attivo) {
      return;
    }
    
    const peak = assetData.massimo_attuale;
    const threshold = assetData.threshold_alert;
    const drawdown = ((currentPrice - peak) / peak) * 100;
    
    // Get last alert for this asset
    const lastAlert = await getLastDrawdownAlert(asset.symbol);
    
    // Define variation threshold (1% change)
    const VARIATION_THRESHOLD = 1.0;
    
    let shouldSendAlert = false;
    let isVariation = false;
    
    if (drawdown <= -threshold) {
      if (!lastAlert) {
        // First time crossing threshold
        shouldSendAlert = true;
        isVariation = false;
        console.log(`🚨 ${asset.symbol} threshold crossed: ${drawdown.toFixed(2)}% (threshold: ${threshold}%)`);
      } else {
        // Check if drawdown has varied significantly (at least 1%)
        const drawdownVariation = Math.abs(drawdown - lastAlert.drawdown);
        if (drawdownVariation >= VARIATION_THRESHOLD) {
          shouldSendAlert = true;
          isVariation = true;
          console.log(`📉 ${asset.symbol} drawdown variation: ${drawdown.toFixed(2)}% (was ${lastAlert.drawdown.toFixed(2)}%, variation: ${drawdownVariation.toFixed(2)}%)`);
        }
      }
      
      if (shouldSendAlert) {
        // Log alert to Supabase
        const alertId = `alert_${new Date().toISOString().replace(/[:.]/g, '').replace('T', '_')}_${asset.symbol.toLowerCase()}`;
        
        const { error: alertError } = await supabase
          .from('drawdown_alerts')
          .insert({
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
        
        if (alertError) {
          console.error(`Error logging alert for ${asset.symbol}:`, alertError);
        }
      }
    }
    
    // Update peak if price is higher
    if (currentPrice > peak) {
      const { error: updateError } = await supabase
        .from('portfolio_assets')
        .update({
          massimo_attuale: currentPrice,
          data_massimo: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('symbol', asset.symbol);
      
      if (updateError) {
        console.error(`Error updating peak for ${asset.symbol}:`, updateError);
      } else {
        console.log(`📈 ${asset.symbol} new peak: $${currentPrice}`);
      }
    }
    
  } catch (error) {
    console.error(`Error checking alerts for ${asset.symbol}:`, error);
  }
}

// Main monitoring function
async function monitorPrices() {
  console.log(`🚀 Starting price monitoring at ${new Date().toISOString()}`);
  console.log('=====================================');
  console.log('📉 Drawdown variation threshold: 1.0%');
  console.log('📊 Monitoring assets:', ASSETS.map(a => `${a.symbol} (${a.type})`).join(', '));
  console.log('=====================================');
  
  let successCount = 0;
  
  for (const asset of ASSETS) {
    try {
      let priceData;
      
      if (asset.type === 'ETF') {
        priceData = await fetchETFPrice(asset.symbol);
      } else {
        priceData = await fetchCryptoPrice(asset.symbol);
      }
      
      if (priceData) {
        const saved = await savePriceToSupabase(asset, priceData);
        if (saved) {
          await checkDrawdownAlerts(asset, priceData.price);  // Esistente
          await checkDrawdownLevels(asset, priceData.price);  // Nuovo
          successCount++;
        }
      }
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Error processing ${asset.symbol}:`, error);
    }
  }
  
  console.log('=====================================');
  console.log(`✅ Monitoring completed: ${successCount}/${ASSETS.length} assets updated`);
  console.log(`📊 Timestamp: ${new Date().toISOString()}`);
}

// Run monitoring
monitorPrices()
  .then(() => {
    console.log('🎉 Price monitoring completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Price monitoring failed:', error);
    process.exit(1);
  });
