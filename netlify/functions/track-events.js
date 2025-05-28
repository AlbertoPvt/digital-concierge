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
    const NOCODEAPI_TOKEN = process.env.NOCODEAPI_TOKEN;
    
    // Verifica che le variabili d'ambiente siano configurate
    if (!NOCODEAPI_ENDPOINT || !NOCODEAPI_TOKEN) {
      console.error('Missing environment variables');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }
    
    // Invia a NoCodeAPI
    const response = await fetch(NOCODEAPI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NOCODEAPI_TOKEN}`
      },
      body: JSON.stringify({
        ...eventData,
        // Aggiungi timestamp del server per maggiore affidabilità
        serverTimestamp: new Date().toISOString()
      })
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