// netlify/functions/openai-proxy.js
// Funzione serverless per proteggere l'API key di OpenAI

exports.handler = async (event, context) => {
  // Configura CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };

  // Gestisci preflight OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Solo POST è permesso
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { endpoint, ...body } = JSON.parse(event.body);
    
    // Validazione endpoint
    const allowedEndpoints = [
      'threads',
      'threads/messages',
      'threads/runs',
      'threads/runs/retrieve',
      'messages'
    ];
    
    const isAllowed = allowedEndpoints.some(allowed => 
      endpoint.includes(allowed)
    );
    
    if (!isAllowed) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Endpoint not allowed' })
      };
    }

    // Costruisci URL completo
    const url = `https://api.openai.com/v1/${endpoint}`;
    
    // Determina il metodo HTTP
    let method = 'POST';
    if (endpoint.includes('messages') && !body.content) {
      method = 'GET';
    } else if (endpoint.includes('runs/') && endpoint.includes('/retrieve')) {
      method = 'GET';
    }

    // Fai la richiesta a OpenAI
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: method === 'POST' ? JSON.stringify(body) : undefined
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      headers,
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};