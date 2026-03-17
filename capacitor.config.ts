import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.relay.marketplace',
  appName: 'Relay',
  webDir: 'out',
  server: {
    url: 'https://relay-tan-three.vercel.app',
    cleartext: false
  }
};

export default config;