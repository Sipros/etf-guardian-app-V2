const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

// Initialize Firebase Admin
const serviceAccount = JSON.parse(fs.readFileSync('C:\\Users\\Admin\\Downloads\\etf-guardian-firebase-adminsdk-fbsvc-03800b523d.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const firestore = admin.firestore();

// Initialize Supabase
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function migrateFirebaseToSupabase() {
  console.log('🚀 Starting migration from Firebase to Supabase...');
  
  try {
    // 1. Migrate portfolio_assets
    console.log('\n📦 Migrating portfolio assets...');
    const assetsSnapshot = await firestore.collection('portfolio_assets').get();
    
    for (const doc of assetsSnapshot.docs) {
      const data = doc.data();
      
      const supabaseAsset = {
        id: doc.id,
        symbol: data.symbol,
        name: data.name,
        type: data.type,
        data_inizio: data.data_inizio,
        prezzo_inizio: data.prezzo_inizio,
        massimo_attuale: data.massimo_attuale,
        data_massimo: data.data_massimo,
        threshold_alert: data.threshold_alert || 15.0,
        attivo: data.attivo !== false,
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString()
      };
      
      const { error } = await supabase
        .from('portfolio_assets')
        .upsert(supabaseAsset, { onConflict: 'symbol' });
      
      if (error) {
        console.error(`❌ Error migrating ${data.symbol}:`, error.message);
      } else {
        console.log(`✅ Migrated ${data.symbol} - Peak: $${data.massimo_attuale}`);
      }
    }
    
    // 2. Migrate drawdown_alerts
    console.log('\n🚨 Migrating drawdown alerts...');
    const alertsSnapshot = await firestore.collection('drawdown_alerts').get();
    
    for (const doc of alertsSnapshot.docs) {
      const data = doc.data();
      
      const supabaseAlert = {
        id: doc.id,
        symbol: data.symbol,
        asset_name: data.asset_name,
        drawdown: data.drawdown,
        threshold: data.threshold,
        prezzo_corrente: data.prezzo_corrente,
        massimo: data.massimo,
        timestamp: data.timestamp,
        notifica_inviata: data.notifica_inviata || false
      };
      
      const { error } = await supabase
        .from('drawdown_alerts')
        .insert(supabaseAlert);
      
      if (error) {
        console.error(`❌ Error migrating alert ${data.symbol}:`, error.message);
      } else {
        console.log(`✅ Migrated alert for ${data.symbol} - ${data.drawdown}%`);
      }
    }
    
    // 3. Migrate portfolio snapshots
    console.log('\n📊 Migrating portfolio snapshots...');
    const portfolioSnapshot = await firestore.collection('portfolio').get();
    
    for (const doc of portfolioSnapshot.docs) {
      const data = doc.data();
      
      const supabasePortfolio = {
        id: doc.id,
        total_value: data.totalValue,
        total_invested: data.totalInvested,
        total_buffer: data.totalBuffer,
        total_price_change: data.totalPriceChange,
        price_change_percentage: data.priceChangePercentage,
        average_drawdown: data.averageDrawdown,
        timestamp: data.timestamp
      };
      
      const { error } = await supabase
        .from('portfolio')
        .insert(supabasePortfolio);
      
      if (error) {
        console.error(`❌ Error migrating portfolio snapshot:`, error.message);
      } else {
        console.log(`✅ Migrated portfolio snapshot - $${data.totalValue}`);
      }
    }
    
    // 4. Migrate alerts
    console.log('\n📢 Migrating general alerts...');
    const generalAlertsSnapshot = await firestore.collection('alerts').get();
    
    for (const doc of generalAlertsSnapshot.docs) {
      const data = doc.data();
      
      const supabaseAlert = {
        id: doc.id,
        type: data.type,
        asset: data.asset,
        asset_name: data.assetName,
        value: data.value,
        threshold: data.threshold,
        message: data.message,
        timestamp: data.timestamp
      };
      
      const { error } = await supabase
        .from('alerts')
        .insert(supabaseAlert);
      
      if (error) {
        console.error(`❌ Error migrating general alert:`, error.message);
      } else {
        console.log(`✅ Migrated alert: ${data.type} for ${data.asset}`);
      }
    }
    
    // 5. Set default preferences
    console.log('\n⚙️ Setting up default preferences...');
    const { error: prefError } = await supabase
      .from('preferences')
      .upsert({
        id: 'user',
        drawdown_threshold: 15.0,
        recovery_threshold: 5.0,
        notifications_enabled: true,
        timestamp: new Date().toISOString()
      }, { onConflict: 'id' });
    
    if (prefError) {
      console.error('❌ Error setting preferences:', prefError.message);
    } else {
      console.log('✅ Default preferences set');
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('📊 Summary:');
    console.log(`   - Portfolio assets: ${assetsSnapshot.size}`);
    console.log(`   - Drawdown alerts: ${alertsSnapshot.size}`);
    console.log(`   - Portfolio snapshots: ${portfolioSnapshot.size}`);
    console.log(`   - General alerts: ${generalAlertsSnapshot.size}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await admin.app().delete();
  }
}

migrateFirebaseToSupabase();
