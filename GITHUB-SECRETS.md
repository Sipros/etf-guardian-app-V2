# 🔧 GitHub Secrets Configuration for Supabase

## Required Secrets

Add these secrets to your GitHub repository:

### 1. Go to Repository Settings
- Navigate to: https://github.com/Sipros/etf-guardian-app/settings/secrets/actions

### 2. Add the following secrets:

#### EXPO_PUBLIC_SUPABASE_URL
```
https://pllrzkrpjzkblcwugmme.supabase.co
```

#### EXPO_PUBLIC_SUPABASE_ANON_KEY
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsbHJ6a3JwanprYmxjd3VnbW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNjQ3NjUsImV4cCI6MjA4Mzc0MDc2NX0.LguGHc-fwQS1l_CjSgz4bpcx87wudacMIxGSygpch1o
```

#### SUPABASE_PROJECT_ID
```
pllrzkrpjzkblcwugmme
```

## Remove Old Firebase Secrets

Delete these old Firebase secrets:
- EXPO_PUBLIC_FIREBASE_API_KEY
- EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID  
- EXPO_PUBLIC_FIREBASE_APP_ID
- FIREBASE_SERVICE_ACCOUNT

## What the Workflow Does

The updated `price-monitor.yml` workflow:

1. **Every 15 minutes** checks prices for:
   - VOO (Vanguard S&P 500)
   - BTC (Bitcoin)
   - ETH (Ethereum)
   - BND (Vanguard Bond ETF)
   - SOL (Solana)

2. **Saves data to Supabase**:
   - Current prices in `prices` table
   - Updates peaks in `portfolio_assets` table
   - Logs drawdown alerts in `drawdown_alerts` table

3. **Monitors drawdowns**:
   - Compares current price to stored peak
   - Triggers alerts when drawdown exceeds threshold (default 15%)
   - Updates peak when new high is reached

## Testing

After adding secrets, you can:
1. Go to Actions tab in GitHub
2. Select "ETF Guardian - Price Monitor" workflow
3. Click "Run workflow" to test manually

The workflow will run automatically every 15 minutes once configured.

## Benefits of Supabase Integration

✅ **No Firebase dependencies** - Works with unsigned IPA
✅ **Real-time data** - WebSocket subscriptions available
✅ **Free tier** - 500MB storage, 2GB bandwidth
✅ **GitHub Actions compatible** - Easy API access
✅ **Automatic backups** - Included in free plan
