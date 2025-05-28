class AssistantClient {
  constructor(config) {
    this.assistantId = config.assistantId;
    this.apiEndpoint = config.apiEndpoint || "/.netlify/functions/openai-proxy";
    this.threadId = null;
    this.isInitialized = false;
  }

  // Inizializza creando un nuovo thread
  async initialize() {
    try {
      const response = await this.makeRequest("threads", {});
      this.threadId = response.id;
      this.isInitialized = true;
      console.log("Assistant inizializzato con thread:", this.threadId);
      return this.threadId;
    } catch (error) {
      console.error("Errore inizializzazione:", error);
      throw error;
    }
  }

  // Invia un messaggio e ottieni la risposta
  async sendMessage(message) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // 1. Aggiungi il messaggio dell'utente al thread
      await this.makeRequest(`threads/${this.threadId}/messages`, {
        role: "user",
        content: message,
      });

      // 2. Esegui l'assistant
      const run = await this.makeRequest(`threads/${this.threadId}/runs`, {
        assistant_id: this.assistantId,
      });

      // 3. Attendi il completamento
      const completedRun = await this.waitForCompletion(run.id);

      // 4. Recupera i messaggi
      const messages = await this.makeRequest(
        `threads/${this.threadId}/messages`
      );

      // 5. Trova l'ultima risposta dell'assistant
      const assistantMessage = messages.data.find(
        (msg) =>
          msg.role === "assistant" &&
          msg.created_at > completedRun.created_at - 10
      );

      if (assistantMessage) {
        return assistantMessage.content[0].text.value;
      } else {
        throw new Error(getTranslation("noResponse"));
      }
    } catch (error) {
      console.error("Errore invio messaggio:", error);
      throw error;
    }
  }

  // Attendi che il run sia completato
  async waitForCompletion(runId) {
    const maxAttempts = 60; // Aumentato per risposte più lunghe
    let attempts = 0;

    while (attempts < maxAttempts) {
      const run = await this.makeRequest(
        `threads/${this.threadId}/runs/${runId}`
      );

      if (run.status === "completed") {
        return run;
      } else if (["failed", "cancelled", "expired"].includes(run.status)) {
        throw new Error(`Run terminato con stato: ${run.status}`);
      }

      // Attendi 1 secondo prima del prossimo tentativo
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error("Timeout in attesa della risposta");
  }

  // Metodo generico per fare richieste tramite Netlify Function
  async makeRequest(endpoint, body = null) {
    console.log("Making request to:", endpoint);

    const response = await fetch(this.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        endpoint,
        ...body,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("API Error:", error);
      throw new Error(error.error || "Errore nella richiesta");
    }

    return response.json();
  }

  // Resetta la conversazione creando un nuovo thread
  async resetConversation() {
    this.threadId = null;
    this.isInitialized = false;
    return this.initialize();
  }
}

// Funzione per caricare la configurazione specifica dell'hotel
async function loadAssistantConfig() {
  // Metodo 1: Carica da file di configurazione esterno
  if (typeof window.ASSISTANT_CONFIG !== "undefined") {
    return window.ASSISTANT_CONFIG;
  }

  // Metodo 2: Carica da file JSON basato sul dominio
  try {
    const hostname = window.location.hostname;
    const hotelName = hostname.split(".")[0]; // es: 'hotel-milano'

    const response = await fetch(`/configs/${hotelName}-assistant.json`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error("Errore caricamento configurazione assistant:", error);
  }

  // Fallback: configurazione di default
  throw new Error(
    "Configurazione assistant non trovata. Aggiungi ASSISTANT_CONFIG o il file di configurazione."
  );
}

// Traduzioni per i messaggi del sistema
const systemTranslations = {
  it: {
    connectionError: "Errore di connessione. Ricarica la pagina per riprovare.",
    genericError: "Si è verificato un errore. Riprova tra qualche istante.",
    resetMessage: "Conversazione resettata. Come posso aiutarti?",
    noResponse: "Nessuna risposta dall'assistant"
  },
  en: {
    connectionError: "Connection error. Reload the page to try again.",
    genericError: "An error occurred. Please try again in a moment.",
    resetMessage: "Conversation reset. How can I help you?",
    noResponse: "No response from the assistant"
  },
  es: {
    connectionError: "Error de conexión. Recarga la página para intentar de nuevo.",
    genericError: "Se produjo un error. Inténtalo de nuevo en un momento.",
    resetMessage: "Conversación reiniciada. ¿Cómo puedo ayudarte?",
    noResponse: "Sin respuesta del asistente"
  },
  fr: {
    connectionError: "Erreur de connexion. Rechargez la page pour réessayer.",
    genericError: "Une erreur s'est produite. Veuillez réessayer dans un instant.",
    resetMessage: "Conversation réinitialisée. Comment puis-je vous aider?",
    noResponse: "Pas de réponse de l'assistant"
  },
  pt: {
    connectionError: "Erro de conexão. Recarregue a página para tentar novamente.",
    genericError: "Ocorreu um erro. Tente novamente em instantes.",
    resetMessage: "Conversa reiniciada. Como posso ajudar?",
    noResponse: "Sem resposta do assistente"
  },
  de: {
    connectionError: "Verbindungsfehler. Laden Sie die Seite neu, um es erneut zu versuchen.",
    genericError: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es gleich noch einmal.",
    resetMessage: "Unterhaltung zurückgesetzt. Wie kann ich Ihnen helfen?",
    noResponse: "Keine Antwort vom Assistenten"
  }
};

// Variabili globali
let assistant = null;
let isWaitingForResponse = false;
let currentLanguage = 'it';

// Rileva la lingua corrente
function getCurrentLanguage() {
  // Prima controlla se è stata impostata dalla pagina HTML
  if (window.currentLanguage) {
    return window.currentLanguage;
  }
  
  // Altrimenti rileva dal browser
  const browserLang = navigator.language || navigator.userLanguage;
  const lang = browserLang.substring(0, 2).toLowerCase();
  
  // Controlla se abbiamo traduzioni per questa lingua
  if (systemTranslations[lang]) {
    return lang;
  }
  
  // Default all'italiano
  return 'it';
}

// Ottieni la traduzione corrente
function getTranslation(key) {
  currentLanguage = getCurrentLanguage();
  return systemTranslations[currentLanguage][key] || systemTranslations['it'][key];
}
