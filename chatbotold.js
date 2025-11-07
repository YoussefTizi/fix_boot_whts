// ==========================================
// STEP-BY-STEP WHATSAPP CHATBOT GUIDE
// ==========================================

/*
📚 COMPLETE SETUP GUIDE

STEP 1: CREATE PROJECT FOLDER
------------------------------
mkdir whatsapp-phone-shop-bot
cd whatsapp-phone-shop-bot
npm init -y

STEP 2: INSTALL DEPENDENCIES
-----------------------------
npm install express body-parser axios dotenv

STEP 3: CREATE .env FILE
-------------------------
Create a file named ".env" in your project root:

VERIFY_TOKEN=your_secret_verify_token_12345
PORT=3000
WHATSAPP_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_ID=your_phone_number_id
TWILIO_ACCOUNT_SID=your_twilio_sid (if using Twilio)
TWILIO_AUTH_TOKEN=your_twilio_token (if using Twilio)
TWILIO_WHATSAPP_NUMBER=+14155238886 (if using Twilio)

STEP 4: CREATE THIS FILE (chatbot.js)
--------------------------------------
Copy all the code below into chatbot.js

STEP 5: RUN THE SERVER
-----------------------
node chatbot.js

STEP 6: EXPOSE YOUR SERVER (for testing)
-----------------------------------------
Option A - Using ngrok:
  - Download ngrok: https://ngrok.com/download
  - Run: ngrok http 3000
  - Copy the https URL (e.g., https://abc123.ngrok.io)

Option B - Deploy to a server (production)
  - Heroku, AWS, DigitalOcean, etc.

STEP 7: CONFIGURE WHATSAPP
---------------------------
For WhatsApp Cloud API:
  1. Go to: https://developers.facebook.com
  2. Create an App → Add WhatsApp Product
  3. Go to Configuration → Webhook
  4. Set Callback URL: https://your-domain.com/webhook/whatsapp
  5. Set Verify Token: (same as in your .env file)
  6. Subscribe to: messages

For Twilio:
  1. Go to: https://console.twilio.com
  2. Get WhatsApp Sandbox or approved number
  3. Set webhook URL: https://your-domain.com/webhook/twilio

STEP 8: TEST YOUR BOT
---------------------
Send a WhatsApp message to your bot number
It should respond with the welcome menu!
*/

// ==========================================
// REQUIRED IMPORTS
// ==========================================

require('dotenv').config();
const express = require('express');
const axios = require('axios');

// ==========================================
// CONVERSATION FLOW CONFIGURATION
// ==========================================

const flow = {
  flow_name: "smartfix_phone_shop",
  steps: [
    {
      id: "welcome",
      type: "button",
      text: "👋 Bonjour ! Bienvenue chez SmartFix Mobile 📱\nComment pouvons-nous vous aider ?",
      buttons: [
        { id: "buy", title: "🛒 Acheter" },
        { id: "sell", title: "💰 Vendre" },
        { id: "repair", title: "🔧 Réparer" }
      ],
      next: {
        buy: "ask_brand_buy",
        sell: "ask_brand_sell",
        repair: "ask_brand_repair"
      }
    },
    {
      id: "ask_brand_buy",
      type: "input",
      text: "Super 🛍️ Quelle marque cherchez-vous ?\n(Ex: iPhone, Samsung, Xiaomi...)",
      store: "brand",
      next: "ask_budget"
    },
    {
      id: "ask_budget",
      type: "input",
      text: "Quel est votre budget approximatif ?\n(Ex: 3000 MAD, 5000 MAD...)",
      store: "budget",
      next: "confirm_buy"
    },
    {
      id: "confirm_buy",
      type: "message",
      text: "Merci ! ✅ Nous allons chercher des options pour un {{brand}} à environ {{budget}} 💸\n\nUn conseiller vous contactera sous peu !",
      next: "end"
    },
    {
      id: "ask_brand_sell",
      type: "input",
      text: "Quelle est la marque et le modèle de votre téléphone ?\n(Ex: iPhone 13, Samsung Galaxy S21...)",
      store: "brand",
      next: "ask_condition"
    },
    {
      id: "ask_condition",
      type: "button",
      text: "Quel est son état ?",
      buttons: [
        { id: "neuf", title: "✨ Neuf" },
        { id: "bon", title: "👍 Bon état" },
        { id: "casse", title: "🔨 Cassé" }
      ],
      store: "condition",
      next: {
        neuf: "confirm_sell",
        bon: "confirm_sell",
        casse: "confirm_sell"
      }
    },
    {
      id: "confirm_sell",
      type: "message",
      text: "Merci 🙏 Nous vous contacterons pour estimer votre {{brand}} en état {{condition}}.\n\nNous vous ferons une offre rapidement !",
      next: "end"
    },
    {
      id: "ask_brand_repair",
      type: "input",
      text: "Quel est le modèle de votre téléphone à réparer ?\n(Ex: iPhone 12, Huawei P30...)",
      store: "brand",
      next: "ask_issue"
    },
    {
      id: "ask_issue",
      type: "button",
      text: "Quel est le problème rencontré ?",
      buttons: [
        { id: "ecran", title: "📱 Écran cassé" },
        { id: "batterie", title: "🔋 Batterie" },
        { id: "autre", title: "🔧 Autre" }
      ],
      store: "issue",
      next: {
        ecran: "confirm_repair",
        batterie: "confirm_repair",
        autre: "ask_issue_detail"
      }
    },
    {
      id: "ask_issue_detail",
      type: "input",
      text: "Décrivez le problème en détail :",
      store: "issue_detail",
      next: "confirm_repair"
    },
    {
      id: "confirm_repair",
      type: "message",
      text: "Merci 🔧 Nous vous enverrons un devis pour la réparation de votre {{brand}}.\n\nProblème : {{issue}} {{issue_detail}}\n\nRéponse dans les 24h !",
      next: "end"
    },
    {
      id: "end",
      type: "end",
      text: "Merci pour votre visite 👋\nNous restons à votre disposition sur WhatsApp !\n\n💬 Tapez 'menu' pour recommencer"
    }
  ]
};

// ==========================================
// CHATBOT ENGINE CLASS
// ==========================================

class WhatsAppChatbot {
  constructor(flowConfig) {
    this.flow = flowConfig;
    this.sessions = new Map();
  }

  getSession(userId) {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, {
        currentStep: "welcome",
        userData: {},
        history: []
      });
    }
    return this.sessions.get(userId);
  }

  getStep(stepId) {
    return this.flow.steps.find(s => s.id === stepId);
  }

  interpolate(text, userData) {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return userData[key] || '';
    });
  }

  async handleMessage(userId, messageText) {
    // Reset command
    if (messageText.toLowerCase() === 'menu' || messageText.toLowerCase() === 'start') {
      this.resetSession(userId);
      return this.startConversation(userId);
    }

    const session = this.getSession(userId);
    const currentStep = this.getStep(session.currentStep);

    if (!currentStep) {
      return this.createResponse("Erreur: étape introuvable. Tapez 'menu' pour recommencer.");
    }

    // Store user input
    if (currentStep.store) {
      session.userData[currentStep.store] = messageText;
      session.history.push({
        step: currentStep.id,
        input: messageText,
        timestamp: new Date()
      });
    }

    // Determine next step
    let nextStepId;
    if (currentStep.type === "button" && currentStep.next[messageText]) {
      nextStepId = currentStep.next[messageText];
    } else if (typeof currentStep.next === "string") {
      nextStepId = currentStep.next;
    } else if (currentStep.type === "button") {
      // Invalid button response
      return this.createResponse(
        "Veuillez choisir une option valide :",
        currentStep.buttons,
        "button"
      );
    }

    session.currentStep = nextStepId;
    const nextStep = this.getStep(nextStepId);

    return this.createResponse(
      this.interpolate(nextStep.text, session.userData),
      nextStep.buttons,
      nextStep.type
    );
  }

  createResponse(text, buttons = null, type = "message") {
    const response = { text };
    if (buttons && buttons.length > 0) {
      response.buttons = buttons;
      response.type = "interactive";
    } else {
      response.type = type === "end" ? "end" : "text";
    }
    return response;
  }

  startConversation(userId) {
    const session = this.getSession(userId);
    session.currentStep = "welcome";
    const welcomeStep = this.getStep("welcome");
    return this.createResponse(welcomeStep.text, welcomeStep.buttons, welcomeStep.type);
  }

  getSessionData(userId) {
    return this.sessions.get(userId);
  }

  resetSession(userId) {
    this.sessions.delete(userId);
  }
}

// ==========================================
// WHATSAPP CLOUD API HELPER
// ==========================================

async function sendWhatsAppMessage(to, response) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_ID;

  let payload;

  if (response.type === "interactive" && response.buttons) {
    payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: response.text },
        action: {
          buttons: response.buttons.map(btn => ({
            type: "reply",
            reply: { id: btn.id, title: btn.title }
          }))
        }
      }
    };
  } else {
    payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: response.text }
    };
  }

  try {
    const result = await axios.post(
      `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return result.data;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.response?.data || error.message);
    throw error;
  }
}

// ==========================================
// EXPRESS SERVER
// ==========================================

const app = express();
app.use(express.json());

const bot = new WhatsAppChatbot(flow);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    bot: flow.flow_name,
    endpoints: {
      webhook: '/webhook/whatsapp',
      test: '/test',
      session: '/session/:userId'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// WhatsApp webhook verification (GET)
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('📞 Webhook verification request received');

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully!');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

// WhatsApp webhook messages (POST)
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    console.log('📨 Incoming webhook:', JSON.stringify(req.body, null, 2));

    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      console.log('⚠️ No message in webhook');
      return res.sendStatus(200);
    }

    const userId = message.from;
    let userMessage;

    // Handle different message types
    if (message.type === "interactive") {
      userMessage = message.interactive.button_reply.id;
      console.log(`👆 Button clicked: ${userMessage}`);
    } else if (message.type === "text") {
      userMessage = message.text.body;
      console.log(`💬 Text received: ${userMessage}`);
    } else {
      console.log(`⚠️ Unsupported message type: ${message.type}`);
      return res.sendStatus(200);
    }

    // Process message with bot
    const response = await bot.handleMessage(userId, userMessage);
    console.log('🤖 Bot response:', response);

    // Send response
    await sendWhatsAppMessage(userId, response);
    console.log('✅ Message sent successfully');

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.sendStatus(500);
  }
});

// Test endpoint (for local testing without WhatsApp)
app.post('/test', async (req, res) => {
  const { userId, message } = req.body;
  
  if (!userId || !message) {
    return res.status(400).json({ error: 'userId and message are required' });
  }

  try {
    const response = await bot.handleMessage(userId, message);
    res.json({
      success: true,
      response: response,
      session: bot.getSessionData(userId)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get session data
app.get('/session/:userId', (req, res) => {
  const sessionData = bot.getSessionData(req.params.userId);
  res.json(sessionData || { error: "Session not found" });
});

// Reset session
app.post('/session/:userId/reset', (req, res) => {
  bot.resetSession(req.params.userId);
  res.json({ success: true, message: 'Session reset' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n🚀 WhatsApp Chatbot Server Started!');
  console.log('================================');
  console.log(`📱 Bot Name: ${flow.flow_name}`);
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`🔗 Webhook: http://localhost:${PORT}/webhook/whatsapp`);
  console.log(`🧪 Test URL: http://localhost:${PORT}/test`);
  console.log('================================\n');
  console.log('💡 Next steps:');
  console.log('1. Expose with ngrok: ngrok http 3000');
  console.log('2. Configure WhatsApp webhook with your ngrok URL');
  console.log('3. Start chatting!\n');
});

// ==========================================
// TESTING EXAMPLES
// ==========================================

/*
TEST WITH CURL (local testing without WhatsApp):

# Start conversation
curl -X POST http://localhost:3000/test \
  -H "Content-Type: application/json" \
  -d '{"userId": "test123", "message": "menu"}'

# User selects "buy"
curl -X POST http://localhost:3000/test \
  -H "Content-Type: application/json" \
  -d '{"userId": "test123", "message": "buy"}'

# User enters brand
curl -X POST http://localhost:3000/test \
  -H "Content-Type: application/json" \
  -d '{"userId": "test123", "message": "iPhone"}'

# User enters budget
curl -X POST http://localhost:3000/test \
  -H "Content-Type: application/json" \
  -d '{"userId": "test123", "message": "5000 MAD"}'

# Check session data
curl http://localhost:3000/session/test123
*/

module.exports = { WhatsAppChatbot, flow, sendWhatsAppMessage };