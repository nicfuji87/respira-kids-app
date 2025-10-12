// Service Worker para notificações push em background
// AI dev note: Este arquivo é executado fora do contexto do React
// É carregado diretamente pelo navegador para processar notificações em background

importScripts(
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js'
);
importScripts(
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js'
);

// Inicializar Firebase no Service Worker
firebase.initializeApp({
  apiKey: 'AIzaSyDXwW6Id1CMaW-PeRY0cEz1bHehnDQ-IFQ',
  authDomain: 'respira-kids-app.firebaseapp.com',
  projectId: 'respira-kids-app',
  storageBucket: 'respira-kids-app.firebasestorage.app',
  messagingSenderId: '551722225681',
  appId: '1:551722225681:web:f02f8bf486919dd1d321b0',
});

const messaging = firebase.messaging();

// Handler para notificações em background (quando app não está em foco)
messaging.onBackgroundMessage((payload) => {
  console.log(
    '[firebase-messaging-sw.js] 📱 Notificação recebida em background:',
    payload
  );

  const notificationTitle = payload.notification?.title || 'Respira Kids';
  const notificationOptions = {
    body: payload.notification?.body || 'Você tem uma nova notificação',
    icon: '/images/logos/icone-respira-kids.png',
    badge: '/images/logos/icone-respira-kids.png',
    tag: payload.data?.event_type || 'default',
    data: payload.data || {},
    requireInteraction: false,
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'open',
        title: 'Abrir',
        icon: '/images/logos/icone-respira-kids.png',
      },
      {
        action: 'close',
        title: 'Fechar',
      },
    ],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handler para cliques em notificações
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] 🖱️ Notificação clicada:', event);

  event.notification.close();

  // Se clicou no botão "close", apenas fecha
  if (event.action === 'close') {
    return;
  }

  // Abrir ou focar na aba do app
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const data = event.notification.data || {};
        let targetUrl = '/';

        // Redirecionar baseado no tipo de evento
        if (
          data.event_type === 'appointment_created' ||
          data.event_type === 'appointment_updated'
        ) {
          targetUrl = '/#/agenda';
        } else if (data.event_type === 'patient_created' && data.paciente_id) {
          targetUrl = `/#/pacientes/${data.paciente_id}`;
        } else if (
          data.event_type === 'evolution_created' &&
          data.paciente_id
        ) {
          targetUrl = `/#/pacientes/${data.paciente_id}`;
        } else if (data.event_type === 'payment_received') {
          targetUrl = '/#/financeiro';
        }

        // Se já tem uma aba aberta, focar nela e navegar
        for (const client of clientList) {
          if (
            client.url.includes(self.registration.scope) &&
            'focus' in client
          ) {
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              data: data,
              targetUrl: targetUrl,
            });
            return client.focus();
          }
        }

        // Senão, abrir nova aba
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// Log de instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('[firebase-messaging-sw.js] ✅ Service Worker instalado');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[firebase-messaging-sw.js] ✅ Service Worker ativado');
  event.waitUntil(clients.claim());
});

console.log(
  '[firebase-messaging-sw.js] 🔥 Firebase Messaging Service Worker carregado'
);
