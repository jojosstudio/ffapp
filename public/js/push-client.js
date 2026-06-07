// Push-Benachrichtigungen - Automatische Anmeldung
(function() {
    'use strict';

    const VAPID_PUBLIC_KEY = 'BFUriGrUdvQT9tf2a0gj22T7vAygwSFDt-xBmDDSabvCnDl-xCHJnBWjLKo5SRaRzrlrx1SzFl0X7ntyREMWZ8M';

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async function registerPush() {
        try {
            // Service Worker registrieren
            if (!('serviceWorker' in navigator)) {
                console.log('Service Worker nicht unterstützt');
                return;
            }

            const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });

            console.log('Service Worker registriert');

            // Warten bis SW aktiv ist
            await navigator.serviceWorker.ready;

            // Push-Berechtigung anfordern
            let permission = Notification.permission;
            if (permission === 'default') {
                permission = await Notification.requestPermission();
            }

            if (permission !== 'granted') {
                console.log('Push-Berechtigung verweigert');
                return;
            }

            console.log('Push-Berechtigung erteilt');

            // Vorhandene Subscription prüfen
            let subscription = await registration.pushManager.getSubscription();
            
            if (!subscription) {
                // Neue Subscription erstellen
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                });
                console.log('Push-Subscription erstellt');
            } else {
                console.log('Bestehende Push-Subscription gefunden');
            }

            // Subscription an Server senden
            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription.toJSON())
            });

            if (response.ok) {
                console.log('Push-Subscription am Server registriert');
            } else {
                console.error('Fehler beim Registrieren am Server');
            }

        } catch (error) {
            console.error('Push-Setup-Fehler:', error);
        }
    }

    // Automatisch starten wenn Seite geladen
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registerPush);
    } else {
        registerPush();
    }

})();