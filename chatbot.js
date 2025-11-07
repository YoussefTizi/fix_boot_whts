// ==========================================
// WHATSAPP BOT WITH DATABASE & ADMIN PANEL
// ==========================================

/*
📚 NEW SETUP STEPS:

STEP 1: Install new dependencies
npm install express axios dotenv sqlite3

STEP 2: Run the server
node chatbot.js

STEP 3: Access admin dashboard
http://localhost:3000/admin

STEP 4: View all conversations in real-time!
*/

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

// ==========================================
// DATABASE SETUP
// ==========================================

const db = new sqlite3.Database('./whatsapp_bot.db', (err) => {
  if (err) {
    console.error('❌ Database error:', err);
  } else {
    console.log('✅ Database connected');
  }
});

// Create tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Conversations table
  db.run(`CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone TEXT NOT NULL,
    message_type TEXT NOT NULL,
    message_text TEXT,
    step_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_phone) REFERENCES users(phone_number)
  )`);

  // User data table (stores form responses)
  db.run(`CREATE TABLE IF NOT EXISTS user_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_phone TEXT NOT NULL UNIQUE,
    intent TEXT,
    brand TEXT,
    budget TEXT,
    condition TEXT,
    issue TEXT,
    issue_detail TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_phone) REFERENCES users(phone_number)
  )`);

  console.log('✅ Database tables created');
});

// Database helper functions
const dbHelpers = {
  // Save or update user
  saveUser: (phoneNumber, name = null) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO users (phone_number, name, last_interaction) 
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(phone_number) 
         DO UPDATE SET last_interaction = CURRENT_TIMESTAMP`,
        [phoneNumber, name],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  // Save conversation message
  saveMessage: (userPhone, messageType, messageText, stepId) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO conversations (user_phone, message_type, message_text, step_id) 
         VALUES (?, ?, ?, ?)`,
        [userPhone, messageType, messageText, stepId],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  // Save or update user data
  saveUserData: (userPhone, data) => {
    return new Promise((resolve, reject) => {
      // First, check if user data exists
      db.get(
        `SELECT id FROM user_data WHERE user_phone = ?`,
        [userPhone],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (row) {
            // Update existing record
            db.run(
              `UPDATE user_data SET 
                intent = COALESCE(?, intent),
                brand = COALESCE(?, brand),
                budget = COALESCE(?, budget),
                condition = COALESCE(?, condition),
                issue = COALESCE(?, issue),
                issue_detail = COALESCE(?, issue_detail),
                updated_at = CURRENT_TIMESTAMP
               WHERE user_phone = ?`,
              [data.intent, data.brand, data.budget, data.condition, data.issue, data.issue_detail, userPhone],
              function(err) {
                if (err) reject(err);
                else resolve(row.id);
              }
            );
          } else {
            // Insert new record
            db.run(
              `INSERT INTO user_data (user_phone, intent, brand, budget, condition, issue, issue_detail, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
              [userPhone, data.intent, data.brand, data.budget, data.condition, data.issue, data.issue_detail],
              function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
              }
            );
          }
        }
      );
    });
  },

  // Get all users with their latest data
  getAllUsers: () => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT 
          u.phone_number,
          u.name,
          u.created_at,
          u.last_interaction,
          ud.intent,
          ud.brand,
          ud.budget,
          ud.condition,
          ud.issue,
          ud.issue_detail,
          ud.status,
          ud.created_at as request_date
         FROM users u
         LEFT JOIN user_data ud ON u.phone_number = ud.user_phone
         ORDER BY u.last_interaction DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },

  // Get conversation history for a user
  getUserConversation: (userPhone) => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM conversations 
         WHERE user_phone = ? 
         ORDER BY created_at ASC`,
        [userPhone],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },

  // Get statistics
  getStats: () => {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT 
          COUNT(DISTINCT phone_number) as total_users,
          (SELECT COUNT(*) FROM user_data WHERE intent = 'buy') as buy_requests,
          (SELECT COUNT(*) FROM user_data WHERE intent = 'sell') as sell_requests,
          (SELECT COUNT(*) FROM user_data WHERE intent = 'repair') as repair_requests,
          (SELECT COUNT(*) FROM conversations) as total_messages
         FROM users`,
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }
};

// ==========================================
// CONVERSATION FLOW
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
      intent: "buy",
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
      intent: "sell",
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
      intent: "repair",
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
// CHATBOT ENGINE (Enhanced with DB)
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
    // Save user
    await dbHelpers.saveUser(userId);

    // Save incoming message
    await dbHelpers.saveMessage(userId, 'incoming', messageText, null);

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
      
      // Store intent if defined
      if (currentStep.intent && !session.userData.intent) {
        session.userData.intent = currentStep.intent;
      }

      session.history.push({
        step: currentStep.id,
        input: messageText,
        timestamp: new Date()
      });

      // Save to database
      await dbHelpers.saveUserData(userId, session.userData);
    }

    // Determine next step
    let nextStepId;
    if (currentStep.type === "button" && currentStep.next[messageText]) {
      nextStepId = currentStep.next[messageText];
      
      // Store button intent
      if (messageText === 'buy' || messageText === 'sell' || messageText === 'repair') {
        session.userData.intent = messageText;
        await dbHelpers.saveUserData(userId, session.userData);
      }
    } else if (typeof currentStep.next === "string") {
      nextStepId = currentStep.next;
    } else if (currentStep.type === "button") {
      return this.createResponse(
        "Veuillez choisir une option valide :",
        currentStep.buttons,
        "button"
      );
    }

    session.currentStep = nextStepId;
    const nextStep = this.getStep(nextStepId);

    const responseText = this.interpolate(nextStep.text, session.userData);
    
    // Save outgoing message
    await dbHelpers.saveMessage(userId, 'outgoing', responseText, nextStepId);

    return this.createResponse(
      responseText,
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
// WHATSAPP API HELPER
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
      admin: '/admin',
      api: '/api/users'
    }
  });
});

// Admin Dashboard (HTML)
app.get('/admin', async (req, res) => {
  try {
    const users = await dbHelpers.getAllUsers();
    const stats = await dbHelpers.getStats();

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Dashboard - SmartFix Bot</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .header {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        .header h1 {
            color: #333;
            font-size: 32px;
            margin-bottom: 10px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-card h3 {
            color: #666;
            font-size: 14px;
            margin-bottom: 10px;
            text-transform: uppercase;
        }
        .stat-card .number {
            font-size: 36px;
            font-weight: bold;
            color: #667eea;
        }
        .table-container {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            background: #667eea;
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: 600;
            position: sticky;
            top: 0;
        }
        td {
            padding: 15px;
            border-bottom: 1px solid #eee;
        }
        tr:hover {
            background: #f8f9ff;
        }
        .badge {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
        .badge-buy { background: #d4edda; color: #155724; }
        .badge-sell { background: #fff3cd; color: #856404; }
        .badge-repair { background: #cce5ff; color: #004085; }
        .refresh-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            margin-left: 20px;
        }
        .refresh-btn:hover {
            background: #5568d3;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 SmartFix Mobile - Admin Dashboard</h1>
            <p>Gestion des conversations WhatsApp</p>
            <button class="refresh-btn" onclick="location.reload()">🔄 Actualiser</button>
        </div>

        <div class="stats">
            <div class="stat-card">
                <h3>Total Utilisateurs</h3>
                <div class="number">${stats.total_users}</div>
            </div>
            <div class="stat-card">
                <h3>🛒 Demandes Achat</h3>
                <div class="number">${stats.buy_requests}</div>
            </div>
            <div class="stat-card">
                <h3>💰 Demandes Vente</h3>
                <div class="number">${stats.sell_requests}</div>
            </div>
            <div class="stat-card">
                <h3>🔧 Demandes Réparation</h3>
                <div class="number">${stats.repair_requests}</div>
            </div>
            <div class="stat-card">
                <h3>💬 Total Messages</h3>
                <div class="number">${stats.total_messages}</div>
            </div>
        </div>

        <div class="table-container">
            <h2 style="margin-bottom: 20px;">📱 Liste des Utilisateurs</h2>
            <table>
                <thead>
                    <tr>
                        <th>📞 Téléphone</th>
                        <th>🎯 Type</th>
                        <th>📱 Marque</th>
                        <th>💰 Budget</th>
                        <th>📊 État</th>
                        <th>🔧 Problème</th>
                        <th>📅 Date</th>
                        <th>🕐 Dernière Interaction</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => `
                        <tr>
                            <td><strong>${user.phone_number}</strong></td>
                            <td>
                                ${user.intent ? `<span class="badge badge-${user.intent}">${user.intent.toUpperCase()}</span>` : '-'}
                            </td>
                            <td>${user.brand || '-'}</td>
                            <td>${user.budget || '-'}</td>
                            <td>${user.condition || '-'}</td>
                            <td>${user.issue || '-'} ${user.issue_detail || ''}</td>
                            <td>${user.request_date ? new Date(user.request_date).toLocaleDateString('fr-FR') : '-'}</td>
                            <td>${new Date(user.last_interaction).toLocaleString('fr-FR')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>

    <script>
        // Auto-refresh every 30 seconds
        setTimeout(() => location.reload(), 30000);
    </script>
</body>
</html>
    `;

    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get all users (JSON)
app.get('/api/users', async (req, res) => {
  try {
    const users = await dbHelpers.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get user conversation
app.get('/api/conversation/:phone', async (req, res) => {
  try {
    const conversation = await dbHelpers.getUserConversation(req.params.phone);
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await dbHelpers.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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

    const response = await bot.handleMessage(userId, userMessage);
    console.log('🤖 Bot response:', response);

    await sendWhatsAppMessage(userId, response);
    console.log('✅ Message sent successfully');

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.sendStatus(500);
  }
});

// Test endpoint
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

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('\n🚀 WhatsApp Chatbot Server Started!');
  console.log('================================');
  console.log(`📱 Bot Name: ${flow.flow_name}`);
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`📊 Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`🔗 Webhook: http://localhost:${PORT}/webhook/whatsapp`);
  console.log('================================\n');
});

module.exports = { WhatsAppChatbot, flow, sendWhatsAppMessage, dbHelpers };