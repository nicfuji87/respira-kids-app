import { initializeApp } from 'firebase/app';
import { getMessaging, isSupported } from 'firebase/messaging';

// AI dev note: Configuração do Firebase para notificações push
// Usa variáveis de ambiente para segurança em produção
// Em desenvolvimento, usa valores hardcoded

const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    'AIzaSyDXwW6Id1CMaW-PeRY0cEz1bHehnDQ-IFQ',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    'respira-kids-app.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'respira-kids-app',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'respira-kids-app.firebasestorage.app',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '551722225681',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    '1:551722225681:web:f02f8bf486919dd1d321b0',
};

// Validar configuração
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.warn('⚠️ Firebase não configurado - notificações push desabilitadas');
}

// Inicializar Firebase
export const firebaseApp = initializeApp(firebaseConfig);

// Função helper para obter messaging (com verificação de suporte)
export const getFirebaseMessaging = async () => {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn('⚠️ Push notifications não suportadas neste navegador');
      return null;
    }
    return getMessaging(firebaseApp);
  } catch (error) {
    console.error('Erro ao verificar suporte a notificações:', error);
    return null;
  }
};

// VAPID Key - gerada em 12/10/2025
export const vapidKey =
  import.meta.env.VITE_FIREBASE_VAPID_KEY ||
  'BGspTEoU8P2K34YeSH1qtTvPEXk6qOdzAxU-B79Ny8HDzsVmSJd6eelLxTvnn4a0_rtg7nbIlv68iwcO3z2XMa8';

console.log('🔥 Firebase inicializado:', {
  projectId: firebaseConfig.projectId,
  hasVapidKey: !!vapidKey,
});
