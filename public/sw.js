const CACHE_NAME = 'ff-challenge-v4';
const STATIC_ASSETS = [
    '/',
    '/offline.html',
    '/css/liquid-glass.css',
    '/css/main.css',
    '/manifest.json',
    '/css/admin.css',
    '/icons/flame.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (event.request.url.includes('/api/')) return;
    
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return response;
            })
            .catch(() => {
                return caches.match(event.request).then((response) => {
                    if (response) return response;
                    if (event.request.mode === 'navigate') {
                        return caches.match('/offline.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

// Push-Nachricht empfangen
self.addEventListener('push', (event) => {
    if (!event.data) return;
    try {
        const data = event.data.json();
        const options = {
            body: data.body || '',
            icon: '/icons/flame.svg',
            badge: '/icons/flame.svg',
            vibrate: [200, 100, 200],
            data: { url: data.url || '/' },
            requireInteraction: true,
            actions: [
                { action: 'open', title: 'Öffnen' }
            ]
        };
        event.waitUntil(
            self.registration.showNotification(data.title || 'Feuerwehr-Challenge', options)
        );
    } catch (e) {
        console.error('Push error:', e);
    }
});

// Klick auf Benachrichtigung
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((list) => {
                for (const client of list) {
                    if (client.url === url && 'focus' in client) return client.focus();
                }
                if (clients.openWindow) return clients.openWindow(url);
            })
    );
});