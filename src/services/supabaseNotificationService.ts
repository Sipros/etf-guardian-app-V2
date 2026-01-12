import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '../config/supabase';
import { AlertData } from '../config/supabase';

// Set notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Initialize notifications and save device token to Supabase
export const initializeNotifications = async (): Promise<string | null> => {
  try {
    // Request permissions
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('Notification permissions denied');
      return null;
    }

    // Get project ID from app config
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.error('Project ID not found in app config');
      return null;
    }

    // Get push token
    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    if (token) {
      // Save device token to Supabase
      const { error } = await supabase
        .from('device_tokens')
        .upsert({
          token: token.data,
          platform: 'ios',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'token'
        });

      if (error) {
        console.error('Error saving device token:', error);
      } else {
        console.log('Device token saved to Supabase');
      }

      return token.data;
    }

    return null;
  } catch (error) {
    console.error('Error initializing notifications:', error);
    return null;
  }
};

// Send local notification
export const sendLocalNotification = async (title: string, body: string, data?: any) => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        data: data || {},
      },
      trigger: null, // Show immediately
    });
  } catch (error) {
    console.error('Error sending local notification:', error);
  }
};

// Send push notification via Supabase Edge Function
export const sendPushNotification = async (token: string, title: string, body: string, data?: any) => {
  try {
    // This would use a Supabase Edge Function to send push notifications
    // For now, we'll use Expo's push service directly
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data: data || {},
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send push notification');
    }

    const result = await response.json();
    console.log('Push notification sent:', result);
    return result;
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
};

// Send alert notification
export const sendAlertNotification = async (alert: AlertData) => {
  try {
    // Get all device tokens
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

    // Send notification to all devices
    const promises = tokens.map(({ token }: { token: string }) => 
      sendPushNotification(token, 'ETF Guardian Alert', alert.message, {
        type: alert.type,
        asset: alert.asset,
        value: alert.value,
      })
    );

    await Promise.all(promises);
    console.log(`Alert notification sent to ${tokens.length} devices`);
  } catch (error) {
    console.error('Error sending alert notification:', error);
  }
};

// Subscribe to real-time alerts
export const subscribeToAlertNotifications = () => {
  return supabase
    .channel('alert-notifications')
    .on('postgres_changes', 
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'alerts' 
      },
      async (payload: any) => {
        const alert = payload.new as AlertData;
        
        // Send local notification
        await sendLocalNotification('ETF Guardian', alert.message, {
          type: alert.type,
          asset: alert.asset,
        });

        // Send push notification if permissions granted
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'granted') {
          await sendAlertNotification(alert);
        }
      }
    )
    .subscribe();
};

// Get notification settings
export const getNotificationSettings = async () => {
  try {
    const { data, error } = await supabase
      .from('preferences')
      .select('notificationsEnabled, drawdownThreshold, recoveryThreshold')
      .eq('id', 'user')
      .single();

    if (error) {
      console.error('Error getting notification settings:', error);
      return {
        notificationsEnabled: true,
        drawdownThreshold: 15,
        recoveryThreshold: 5,
      };
    }

    return data || {
      notificationsEnabled: true,
      drawdownThreshold: 15,
      recoveryThreshold: 5,
    };
  } catch (error) {
    console.error('Error getting notification settings:', error);
    return {
      notificationsEnabled: true,
      drawdownThreshold: 15,
      recoveryThreshold: 5,
    };
  }
};

export default {
  initializeNotifications,
  sendLocalNotification,
  sendPushNotification,
  sendAlertNotification,
  subscribeToAlertNotifications,
  getNotificationSettings,
};
