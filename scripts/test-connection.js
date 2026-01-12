const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔧 Testing Supabase connection...');
console.log('URL:', supabaseUrl);
console.log('Key:', supabaseAnonKey ? 'Present' : 'Missing');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  try {
    // Test basic connection
    console.log('📡 Testing basic connection...');
    
    // Try to query the preferences table
    const { data, error } = await supabase
      .from('preferences')
      .select('*')
      .eq('id', 'user')
      .single();
    
    if (error) {
      console.log('⚠️  Table not found (expected):', error.message);
      
      // Try to create the table manually
      console.log('🔨 Creating preferences table...');
      
      const { error: createError } = await supabase
        .from('preferences')
        .insert({
          id: 'user',
          drawdown_threshold: 15.0,
          recovery_threshold: 5.0,
          notifications_enabled: true,
          timestamp: new Date().toISOString()
        });
      
      if (createError) {
        console.error('❌ Failed to create table:', createError.message);
        console.log('\n📋 Manual setup required:');
        console.log('1. Go to: https://supabase.com/dashboard/project/pllrzkrpjzkblcwugmme/sql');
        console.log('2. Run the SQL from: scripts/create-database.sql');
      } else {
        console.log('✅ Preferences table created successfully!');
      }
    } else {
      console.log('✅ Connection successful!');
      console.log('📋 Preferences:', data);
    }
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

testConnection();
