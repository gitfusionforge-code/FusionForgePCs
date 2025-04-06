import { ref, get, set } from 'firebase/database';
import { database } from './firebase-realtime-storage';
import { logger } from './utils/logger';

interface BusinessSettings {
  businessEmail: string;
  businessPhone: string;
  businessAddress: string;
  businessGst: string;
  businessHours: string;
  companyName: string;
  companyWebsite: string;
}

const SETTINGS_PATH = 'admin/settings';

// Default business settings - Use environment variables or configure in production
const DEFAULT_SETTINGS: BusinessSettings = {
  businessEmail: process.env.BUSINESS_EMAIL || 'contact@company.com',
  businessPhone: process.env.BUSINESS_PHONE || '+1-XXX-XXX-XXXX',
  businessAddress: process.env.BUSINESS_ADDRESS || 'Business Address Not Configured',
  businessGst: process.env.BUSINESS_GST || 'GST-NOT-SET',
  businessHours: process.env.BUSINESS_HOURS || '9AM - 6PM',
  companyName: process.env.COMPANY_NAME || 'Your Company Name',
  companyWebsite: process.env.COMPANY_WEBSITE || 'www.yourcompany.com',
};


// Load business settings from file
export async function loadBusinessSettings(): Promise<BusinessSettings> {
  if (!database) {
    // Firebase not configured, return defaults
    return DEFAULT_SETTINGS;
  }
  
  try {
    const snapshot = await get(ref(database, SETTINGS_PATH));
    
    if (snapshot.exists()) {
      const settings = snapshot.val();
      // Ensure all required fields exist, merge with defaults if needed
      return { ...DEFAULT_SETTINGS, ...settings };
    }
  } catch (error: any) {
    // Silent fallback - permission denied is expected if rules restrict access
  }
  
  // Return default settings if Firebase access fails or data doesn't exist
  return DEFAULT_SETTINGS;
}

// Save business settings to file
export async function saveBusinessSettings(settings: BusinessSettings): Promise<void> {
  if (!database) {
    throw new Error('Firebase is not configured. Cannot save business settings.');
  }
  
  try {
    // Validate required fields
    const requiredFields = ['businessEmail', 'businessPhone', 'businessAddress', 'companyName'];
    for (const field of requiredFields) {
      if (!settings[field as keyof BusinessSettings]) {
        throw new Error(`${field} is required`);
      }
    }
    
    await set(ref(database, SETTINGS_PATH), settings);
  } catch (error: any) {
    if (error?.code === 'PERMISSION_DENIED' || error?.message?.includes('Permission denied')) {
      throw new Error('Permission denied: Firebase security rules prevent saving settings. Please check your Firebase rules.');
    }
    console.error('Error saving business settings to Firebase:', error);
    throw new Error('Failed to save business settings. Please try again.');
  }
}

// Initialize settings file with defaults if it doesn't exist
export async function initializeBusinessSettings(): Promise<void> {
  if (!database) {
    return;
  }
  
  try {
    const snapshot = await get(ref(database, SETTINGS_PATH));
    
    if (!snapshot.exists()) {
      await saveBusinessSettings(DEFAULT_SETTINGS);
    }
  } catch (error: any) {
    // Silently continue with defaults if Firebase is not accessible
  }
}