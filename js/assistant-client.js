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
        throw new Error("Nessuna risposta dall'assistant");
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
  if (typeof ASSISTANT_CONFIG !== "undefined") {
    return ASSISTANT_CONFIG;
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

// Variabili globali
let assistant = null;
let isWaitingForResponse = false;

// Inizializza l'assistant quando la pagina è pronta
async function initializeAssistant() {
  try {
    // Carica la configurazione specifica dell'hotel
    const config = await loadAssistantConfig();

    assistant = new AssistantClient({
      assistantId: config.assistantId,
    });

    await assistant.initialize();
    updateConnectionStatus(true);

    // Se c'è un messaggio di benvenuto personalizzato
    if (config.welcomeMessage) {
      const chatBox = document.getElementById("chatBox");
      if (chatBox && chatBox.children.length === 0) {
        addMessage(config.welcomeMessage, "bot");
      }
    }
  } catch (error) {
    console.error("Errore inizializzazione:", error);
    showError("Errore di connessione. Ricarica la pagina per riprovare.");
    updateConnectionStatus(false);
  }
}

// Invia messaggio (chiamata dal pulsante)
async function sendMessage() {
  const input = document.getElementById("userInput");
  const sendButton = document.getElementById("sendButton");
  const typingIndicator = document.getElementById("typingIndicator");

  if (!input.value.trim() || isWaitingForResponse || !assistant) return;

  const userMessage = input.value;
  input.value = "";

  // Disabilita input durante l'invio
  isWaitingForResponse = true;
  input.disabled = true;
  sendButton.disabled = true;

  // Aggiungi messaggio utente
  addMessage(userMessage, "user");

  // Mostra indicatore di digitazione
  typingIndicator.classList.add("show");

  try {
    // Ottieni risposta dall'assistant
    const response = await assistant.sendMessage(userMessage);

    // Mostra la risposta
    addMessage(response, "bot");
  } catch (error) {
    console.error("Errore:", error);
    showError("Si è verificato un errore. Riprova tra qualche istante.");
  } finally {
    // Riabilita input
    isWaitingForResponse = false;
    input.disabled = false;
    sendButton.disabled = false;
    typingIndicator.classList.remove("show");
    input.focus();
  }
}

// Funzioni UI helper
function addMessage(text, type) {
  const chatBox = document.getElementById("chatBox");
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${
    type === "user" ? "user-message" : "bot-message"
  }`;

  // Formatta il testo
  messageDiv.innerHTML = formatMessage(text);

  chatBox.appendChild(messageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function formatMessage(text) {
  // Escape HTML per sicurezza
  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Converti markdown base
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");
  text = text.replace(/\n/g, "<br>");
  text = text.replace(/^- (.*?)$/gm, "• $1");

  // Auto-link URL
  text = text.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>'
  );

  return text;
}

function showError(message) {
  const errorDiv = document.getElementById("errorMessage");
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.classList.add("show");
    setTimeout(() => errorDiv.classList.remove("show"), 5000);
  }
}

function updateConnectionStatus(isConnected) {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");

  if (statusDot && statusText) {
    if (isConnected) {
      statusDot.classList.remove("offline");
      statusText.textContent = "Connesso";
    } else {
      statusDot.classList.add("offline");
      statusText.textContent = "Offline";
    }
  }
}

// Event listeners
document.addEventListener("DOMContentLoaded", function () {
  initializeAssistant();

  const userInput = document.getElementById("userInput");
  if (userInput) {
    userInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    userInput.focus();
  }
});

// Esporta per uso globale
window.sendMessage = sendMessage;
window.resetConversation = async () => {
  if (assistant) {
    await assistant.resetConversation();

    // Ricarica la configurazione per il messaggio di benvenuto
    try {
      const config = await loadAssistantConfig();
      document.getElementById("chatBox").innerHTML = `
        <div class="message bot-message">
          ${
            config.resetMessage ||
            "Conversazione resettata. Come posso aiutarti?"
          }
        </div>
      `;
    } catch (error) {
      document.getElementById("chatBox").innerHTML = `
        <div class="message bot-message">
          Conversazione resettata. Come posso aiutarti?
        </div>
      `;
    }
  }
};
