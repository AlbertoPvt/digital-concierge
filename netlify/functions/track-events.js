// netlify/functions/track-event.js

exports.handler = async (event, context) => {
  // Solo metodo POST permesso
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse dei dati dell'evento
    const eventData = JSON.parse(event.body);
    
    // Configurazione NoCodeAPI
    const NOCODEAPI_ENDPOINT = process.env.NOCODEAPI_ENDPOINT;
    const SHEET_TAB_NAME = process.env.SHEET_TAB_NAME || 'Foglio1'; // Default: Foglio1
    
    // Verifica che la variabile d'ambiente sia configurata
    if (!NOCODEAPI_ENDPOINT) {
      console.error('Missing NOCODEAPI_ENDPOINT environment variable');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }
    
    // Invia a NoCodeAPI con tabId come parametro URL
    const url = `${NOCODEAPI_ENDPOINT}?tabId=${encodeURIComponent(SHEET_TAB_NAME)}`;
    
    // Crea l'array con i valori nell'ordine corretto delle colonne
    const rowData = [
      eventData.timestamp,
      eventData.eventType,
      eventData.dealName,
      eventData.dealCategory,
      eventData.dealDiscount,
      eventData.hotelName,
      eventData.url,
      eventData.userAgent,
      new Date().toISOString() // serverTimestamp
    ];
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([rowData]) // Array di array
    });
    
    if (!response.ok) {
      throw new Error(`NoCodeAPI responded with ${response.status}`);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
    
  } catch (error) {
    console.error('Error tracking event:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to track event' })
    };
  }
};