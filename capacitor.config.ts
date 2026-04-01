import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lifestreak.app',
  appName: 'Life Streak',
  webDir: 'www',           // Capacitor가 복사할 웹 앱 폴더
  server: {
    androidScheme: 'https',
    // 개발 중에는 라이브 서버 사용 (빌드 후 주석 처리)
    // url: 'http://192.168.x.x:5500',
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    }
  }
};

export default config;
