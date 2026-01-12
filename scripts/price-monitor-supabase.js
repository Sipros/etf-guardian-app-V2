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
  { symbol: 'VOO', name: 'Vanguard S&P 500', type: 'ETF' },
  { symbol: 'BTC', name: 'Bitcoin', type: 'CRYPTO' },
  { symbol: 'ETH', name: 'Ethereum', type: 'CRYPTO' },
  { symbol: 'BND', name: 'Vanguard Bond ETF', type: 'ETF' },
  { symbol: 'SOL', name: 'Solana', type: 'CRYPTO' }
];

// Yahoo Finance API
async function fetchETFPrice(symbol) {
  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
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

// CoinGecko API
async function fetchCryptoPrice(symbol) {
  try {
    const coinMap = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'SOL': 'solana'
    };
    
    const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinMap[symbol]}&vs_currency=usd&include_24hr_change=true`);
    const data = response.data[coinMap[symbol]];
    
    return {
      price: data.usd,
      change: data.usd_24h_change > 0 ? data.usd * (data.usd_24h_change / 100) : data.usd * (data.usd_24h_change / 100),
      changePercent: data.usd_24h_change
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

// Send push notification via Expo
async function sendPushNotification(token, title, body, data = {}) {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send push notification');
    }

    const result = await response.json();
    console.log(`📱 Push notification sent to ${token}`);
    return result;
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

// Send alert notifications to all devices
async function sendAlertNotifications(alertData, isVariation = false) {
  try {
    // Get all device tokens from Supabase
    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('token');

    if (error) {
      console.error('Error getting device tokens:', error);
      return;
    }

    if (!tokens || tokens.length === 0) {
      console.log('No device tokens found');
      return;
    }

    // Create different messages based on whether this is a new alert or variation
    let title, body;
    
    if (isVariation) {
      title = '📉 Drawdown Update';
      body = `${alertData.asset_name}: drawdown now ${alertData.drawdown.toFixed(2)}%`;
    } else {
      title = '🚨 Drawdown Alert';
      body = `${alertData.asset_name}: ${alertData.drawdown.toFixed(2)}% drawdown threshold reached`;
    }

    // Send notification to all devices
    const promises = tokens.map(({ token }) => 
      sendPushNotification(
        token, 
        title,
        body,
        {
          type: 'drawdown',
          asset: alertData.symbol,
          drawdown: alertData.drawdown,
          currentPrice: alertData.prezzo_corrente,
          peak: alertData.massimo,
          isVariation: isVariation
        }
      )
    );

    await Promise.all(promises);
    console.log(`🚨 Alert sent to ${tokens.length} devices (${isVariation ? 'variation' : 'new alert'})`);
  } catch (error) {
    console.error('Error sending alert notifications:', error);
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
        } else {
          // Send notification
          await sendAlertNotifications({
            symbol: asset.symbol,
            asset_name: asset.name,
            drawdown: drawdown,
            threshold: threshold,
            prezzo_corrente: currentPrice,
            massimo: peak
          }, isVariation);
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
          await checkDrawdownAlerts(asset, priceData.price);
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
