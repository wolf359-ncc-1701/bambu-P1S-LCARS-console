// src/global.d.ts
import { PrinterClient } from '@bambulab-p1screen/printer-api'

export {};

declare module 'qrcode'

declare global {
  const __BUILD_ID__: string
  interface Window {
    client: PrinterClient;
    __P1ScreenOnAppLifecycle?: (state: 'foreground' | 'background') => void;
  }
}
