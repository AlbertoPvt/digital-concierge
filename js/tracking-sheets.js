// tracking-sheets.js - Sistema di tracking con Google Sheets

// Configurazione NoCodeAPI
const SHEETS_CONFIG = {
    // Sostituisci con il tuo endpoint NoCodeAPI
    apiEndpoint: 'https://v1.nocodeapi.com/albertopvt/google_sheets/XVfVXrIHiPekMIKj?tabId=TrackingSheet',
    
    // Tab/foglio dove salvare i dati
    tabName: 'TrackingSheet', // Nome del foglio in Google Sheets
    
    // Headers del tuo Google Sheet (devono corrispondere esattamente)
    // Esempio colonne: Data | Ora | Hotel | Deal | Azione | Codice Coupon
};

// Sistema di tracking con Google Sheets
const sheetsTracking = {
    // Traccia evento su Google Sheets
    async trackEvent(dealName, action, additionalData = {}) {
        try {
            // Prepara i dati da inviare
            const now = new Date();
            const data = {
                Data: now.toLocaleDateString('it-IT'),
                Ora: now.toLocaleTimeString('it-IT'),
                Hotel: this.getHotelName(),
                Deal: dealName,
                Azione: action,
                'Codice Coupon': additionalData.couponCode || '',
                // Aggiungi altri campi se necessari
                Browser: navigator.userAgent.substring(0, 50),
                Timestamp: now.toISOString()
            };

            // Invia a NoCodeAPI
            const response = await fetch(SHEETS_CONFIG.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify([data]) // NoCodeAPI vuole un array
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Evento tracciato su Google Sheets:', result);
            
            // Salva anche localmente come backup
            this.saveLocalBackup(dealName, action, additionalData);
            
        } catch (error) {
            console.error('Errore invio a Google Sheets:', error);
            
            // Se fallisce, salva localmente per retry successivo
            this.saveFailedEvent(dealName, action, additionalData);
        }
    },

    // Ottieni nome hotel dalla configurazione
    getHotelName() {
        // Prova a prendere il nome dalla configurazione
        if (typeof DEALS_CONFIG !== 'undefined' && DEALS_CONFIG.hotelName) {
            return DEALS_CONFIG.hotelName;
        }
        
        // Altrimenti usa il dominio
        return window.location.hostname.split('.')[0];
    },

    // Salva backup locale
    saveLocalBackup(dealName, action, additionalData) {
        const backup = JSON.parse(localStorage.getItem('trackingBackup') || '[]');
        backup.push({
            timestamp: new Date().toISOString(),
            dealName,
            action,
            ...additionalData
        });
        
        // Mantieni solo ultimi 10 eventi
        if (backup.length > 10) {
            backup.shift();
        }
        
        localStorage.setItem('trackingBackup', JSON.stringify(backup));
    },

    // Salva eventi falliti per retry
    saveFailedEvent(dealName, action, additionalData) {
        const failed = JSON.parse(localStorage.getItem('failedEvents') || '[]');
        failed.push({
            timestamp: new Date().toISOString(),
            dealName,
            action,
            ...additionalData,
            retryCount: 0
        });
        
        localStorage.setItem('failedEvents', JSON.stringify(failed));
        
        // Prova a reinviare eventi falliti
        this.retryFailedEvents();
    },

    // Riprova a inviare eventi falliti
    async retryFailedEvents() {
        const failed = JSON.parse(localStorage.getItem('failedEvents') || '[]');
        if (failed.length === 0) return;

        const stillFailed = [];
        
        for (const event of failed) {
            try {
                await this.trackEvent(event.dealName, event.action, event);
                console.log('Evento recuperato e inviato:', event);
            } catch (error) {
                event.retryCount++;
                if (event.retryCount < 3) { // Max 3 tentativi
                    stillFailed.push(event);
                }
            }
        }
        
        localStorage.setItem('failedEvents', JSON.stringify(stillFailed));
    },

    // Genera report da backup locale
    getLocalReport() {
        const backup = JSON.parse(localStorage.getItem('trackingBackup') || '[]');
        const report = {};
        
        backup.forEach(event => {
            const key = `${event.dealName} - ${event.action}`;
            report[key] = (report[key] || 0) + 1;
        });
        
        return report;
    }
};

// ============================================
// INTEGRAZIONE CON IL TUO CODICE ESISTENTE
// ============================================

// Modifica la funzione showCoupon esistente
function showCouponWithTracking(deal, hotelName) {
    const modal = document.getElementById('couponModal');
    const code = generateCouponCode(deal.name, hotelName);
    
    document.getElementById('couponTitle').textContent = deal.name;
    document.getElementById('couponInstructions').textContent = 'Mostra questo codice per ottenere:';
    document.getElementById('couponCode').textContent = code;
    document.getElementById('couponValidity').textContent = `Codice valido per 30 giorni dalla generazione`;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Traccia su Google Sheets
    sheetsTracking.trackEvent(deal.name, 'Coupon Visualizzato', {
        couponCode: code
    });
    
    // Traccia anche localmente (mantieni il sistema esistente)
    if (typeof dealTracking !== 'undefined') {
        dealTracking.track(deal.name, 'coupon_views');
    }
}

// Modifica la funzione visitWebsite esistente
function visitWebsiteWithTracking(deal) {
    if (deal.link) {
        // Traccia su Google Sheets
        sheetsTracking.trackEvent(deal.name, 'Click Sito Web', {
            destinationUrl: deal.link
        });
        
        // Traccia anche localmente
        if (typeof dealTracking !== 'undefined') {
            dealTracking.track(deal.name, 'website_clicks');
        }
        
        window.open(deal.link, '_blank');
    }
}

// Riprova eventi falliti quando la pagina si carica
document.addEventListener('DOMContentLoaded', function() {
    // Aspetta 5 secondi poi riprova eventi falliti
    setTimeout(() => {
        sheetsTracking.retryFailedEvents();
    }, 5000);
});

// ============================================
// SETUP GOOGLE SHEETS
// ============================================

/* 
ISTRUZIONI PER CONFIGURARE GOOGLE SHEETS:

1. Crea un Google Sheet con queste colonne:
   A: Data
   B: Ora
   C: Hotel
   D: Deal
   E: Azione
   F: Codice Coupon
   G: Browser
   H: Timestamp

2. Vai su NoCodeAPI.com:
   - Registrati/Login
   - Crea una nuova API Google Sheets
   - Autorizza l'accesso al tuo Google Account
   - Seleziona il tuo Sheet
   - Copia l'endpoint API

3. Aggiorna SHEETS_CONFIG sopra con:
   - Il tuo endpoint NoCodeAPI
   - Il nome del tab/foglio

4. Nel tuo HTML, sostituisci le chiamate:
   - showCoupon() → showCouponWithTracking()
   - visitWebsite() → visitWebsiteWithTracking()
*/