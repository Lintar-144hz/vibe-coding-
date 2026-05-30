import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import * as baileys from "@whiskeysockets/baileys";
import pino from "pino";

// Safe extraction helper to prevent bundler inline/default optimizations
const getWASocket = (): any => {
  const b = baileys as any;
  if (typeof b.default === "function") {
    return b.default;
  }
  if (b.default && typeof b.default.default === "function") {
    return b.default.default;
  }
  if (typeof b === "function") {
    return b;
  }
  return b;
};

const makeWASocket = getWASocket();
const useMultiFileAuthState = baileys.useMultiFileAuthState;
const delay = baileys.delay;

// Define structured types
interface WAConnectedUser {
  id: string;
  name: string;
}

interface WAMessageData {
  id: string;
  from: string;
  senderName: string;
  message: string;
  timestamp: number;
  fromMe: boolean;
  type: string;
}

class WhatsAppManager {
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' = 'DISCONNECTED';
  phoneNumber: string | null = null;
  pairingCode: string | null = null;
  error: string | null = null;
  socket: any = null;
  connectedUser: WAConnectedUser | null = null;
  messages: WAMessageData[] = [];
  authPath = path.join(process.cwd(), 'baileys_auth');
  messagesPath = path.join(process.cwd(), 'baileys_auth', 'messages.json');

  constructor() {
    this.loadMessages();
  }

  loadMessages() {
    try {
      if (fs.existsSync(this.messagesPath)) {
        const raw = fs.readFileSync(this.messagesPath, 'utf8');
        this.messages = JSON.parse(raw);
        console.log(`Loaded ${this.messages.length} messages from storage`);
      }
    } catch (e) {
      console.error('Failed to load messages from storage:', e);
      this.messages = [];
    }
  }

  saveMessages() {
    try {
      const dir = path.dirname(this.messagesPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.messagesPath, JSON.stringify(this.messages, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save messages to storage:', e);
    }
  }

  addMessage(msg: any) {
    if (!msg || !msg.message) return;

    // Reject system messages or group updates of no text interest
    const messageKeys = Object.keys(msg.message);
    if (messageKeys.length === 0) return;
    
    const messageType = messageKeys[0];
    if (['protocolMessage', 'senderKeyDistributionMessage', 'peerDataOperationRequestMessage', 'reactionMessage'].includes(messageType)) {
      return;
    }

    const id = msg.key?.id;
    if (!id) return;

    // Check if duplicate
    if (this.messages.some(m => m.id === id)) return;

    let text = '';
    let category = 'text';

    const m = msg.message;

    if (m.conversation) {
      text = m.conversation;
    } else if (m.extendedTextMessage) {
      text = m.extendedTextMessage.text || '';
    } else if (m.imageMessage) {
      text = m.imageMessage.caption || '[🖼️ Gambar]';
      category = 'image';
    } else if (m.videoMessage) {
      text = m.videoMessage.caption || '[📹 Video]';
      category = 'video';
    } else if (m.documentMessage) {
      text = m.documentMessage.caption || m.documentMessage.title || '[📄 Dokumen]';
      category = 'document';
    } else if (m.audioMessage) {
      text = '[🎵 Audio]';
      category = 'audio';
    } else if (m.stickerMessage) {
      text = '[📌 Stiker]';
      category = 'sticker';
    } else {
      // Look for nested structures (e.g. viewOnceMessage)
      if (m.viewOnceMessageV2?.message?.imageMessage) {
        text = m.viewOnceMessageV2.message.imageMessage.caption || '[🖼️ Gambar Sekali Lihat]';
        category = 'image';
      } else if (m.viewOnceMessageV2?.message?.videoMessage) {
        text = m.viewOnceMessageV2.message.videoMessage.caption || '[📹 Video Sekali Lihat]';
        category = 'video';
      } else if (m.ephemeralMessage?.message) {
        // Recurse once into ephemeral message content
        const ephemeralType = Object.keys(m.ephemeralMessage.message)[0];
        const ephMsg = m.ephemeralMessage.message;
        if (ephMsg.conversation) text = ephMsg.conversation;
        else if (ephMsg.extendedTextMessage) text = ephMsg.extendedTextMessage.text || '';
        else text = '[⏳ Pesan Sementara]';
      } else {
        text = '[Pesan Media atau Lainnya]';
        category = 'other';
      }
    }

    // Skip empty updates
    if (!text && m.conversation === undefined) {
      return;
    }

    const timestamp = msg.messageTimestamp ? (Number(msg.messageTimestamp) * 1000) : Date.now();
    const fromMe = !!msg.key?.fromMe;
    const remoteJid = msg.key?.remoteJid || '';

    let senderName = msg.pushName || '';
    if (fromMe) {
      senderName = 'Saya';
    } else if (!senderName) {
      senderName = remoteJid.split('@')[0] || 'Unknown';
    }

    this.messages.push({
      id,
      from: remoteJid,
      senderName,
      message: text,
      timestamp,
      fromMe,
      type: category
    });

    // Deduplicate and Sort newest first
    this.messages = this.messages.filter((val, idx, self) => 
      idx === self.findIndex((t) => t.id === val.id)
    );
    this.messages.sort((a, b) => b.timestamp - a.timestamp);

    // Caps at 1000
    if (this.messages.length > 1000) {
      this.messages = this.messages.slice(0, 1000);
    }

    this.saveMessages();
  }

  async logout() {
    this.status = 'DISCONNECTED';
    this.phoneNumber = null;
    this.pairingCode = null;
    this.connectedUser = null;
    this.error = null;

    if (this.socket) {
      try {
        await this.socket.logout();
      } catch (e) {}
      try {
        this.socket.end(undefined);
      } catch (e) {}
      this.socket = null;
    }

    try {
      if (fs.existsSync(this.authPath)) {
        fs.rmSync(this.authPath, { recursive: true, force: true });
        console.log('Credentials auth directories deleted cleanly');
      }
    } catch (e) {
      console.error('Failed to cleanup session files:', e);
    }
  }

  async clearMessages() {
    this.messages = [];
    this.saveMessages();
    console.log('Local logs cleared successfully.');
  }

  async connect(phoneNumber: string) {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanNumber) {
      throw new Error('Nomor telepon tidak valid. Pastikan hanya berupa angka.');
    }

    // Since this is a manual, fresh user connection request, completely log out past session first
    await this.logout();

    this.status = 'CONNECTING';
    this.phoneNumber = cleanNumber;
    this.error = null;

    await this.initSocket(cleanNumber, true);
  }

  async initSocket(phoneNumber: string, requestNewPairing = false) {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

      // Create a fresh socket referencing existing or clean auth state
      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
      });

      // Request pairing code only when user initiates a fresh run AND is unregistered
      if (!this.socket.authState.creds.registered && requestNewPairing) {
        await delay(2500); // Give socket a moment to establish noise handshake
        try {
          const code = await this.socket.requestPairingCode(phoneNumber);
          this.pairingCode = code;
          console.log(`Pairing code generated for ${phoneNumber}: ${code}`);
        } catch (err: any) {
          console.error(`Gagal membuat pairing code untuk nomor ${phoneNumber}:`, err);
          this.error = `Gagal mendapatkan kode OTP dari WhatsApp: ${err.message || err}`;
          this.status = 'DISCONNECTED';
          this.pairingCode = null;
        }
      }

      this.socket.ev.on('creds.update', saveCreds);

      this.socket.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'connecting') {
          if (this.status !== 'CONNECTED') {
            this.status = 'CONNECTING';
          }
        }

        if (connection === 'open') {
          this.status = 'CONNECTED';
          this.pairingCode = null;
          this.error = null;
          const userObj = this.socket.user;
          this.connectedUser = {
            id: userObj?.id || phoneNumber,
            name: userObj?.name || phoneNumber
          };
          console.log(`WhatsApp connection is OPEN. Registered user: ${userObj?.id}`);
        }

        if (connection === 'close') {
          const reasonCode = (lastDisconnect?.error as any)?.output?.statusCode;
          console.log(`WhatsApp connection closed with code: ${reasonCode}`);

          if (reasonCode === 401) {
            console.log('Session is unauthenticated or revoked (401). Cleaning up state...');
            this.logout();
          } else {
            // Reconnect using the same credentials and keys.
            // DO NOT delete files! DO NOT call logout()! DO NOT request a new pairing code!
            if (this.phoneNumber) {
              console.log(`Disconnected. Reconnecting stream for ${this.phoneNumber} in 4 seconds...`);
              setTimeout(() => {
                if (this.phoneNumber) {
                  // Connect back without requesting a new pairing code (keeps existing code valid on UI if still connecting)
                  this.initSocket(this.phoneNumber, false);
                }
              }, 4000);
            } else {
              this.status = 'DISCONNECTED';
            }
          }
        }
      });

      // Listen for real-time incoming or outgoing messages
      this.socket.ev.on('messages.upsert', (data: any) => {
        if (data && data.messages) {
          for (const msg of data.messages) {
            this.addMessage(msg);
          }
        }
      });

      // Listen for initial historical chats/messages load
      this.socket.ev.on('messaging-history.set', (data: any) => {
        if (data && data.messages) {
          console.log(`Syncing ${data.messages.length} historical messages...`);
          for (const msg of data.messages) {
            this.addMessage(msg);
          }
        }
      });

    } catch (err: any) {
      console.error('Core Baileys initialization crash in initSocket:', err);
      if (this.status !== 'CONNECTED') {
        this.status = 'DISCONNECTED';
        this.error = err.message || 'Gagal memulai koneksi WhatsApp.';
      }
    }
  }

  async autoReconnect() {
    const credsPath = path.join(this.authPath, 'creds.json');
    if (fs.existsSync(credsPath)) {
      console.log('Saved WhatsApp credentials file found. Performing silent auto-reconnect...');
      try {
        const raw = fs.readFileSync(credsPath, 'utf8');
        const parsed = JSON.parse(raw);
        const pairingPhone = parsed.me?.id?.split(':')[0] || parsed.me?.id?.split('@')[0];
        
        if (pairingPhone) {
          console.log(`Auto reconnecting to phone: ${pairingPhone}`);
          this.status = 'CONNECTING';
          this.phoneNumber = pairingPhone;
          await this.initSocket(pairingPhone, false);
        }
      } catch (err) {
        console.error('Silently failed to auto reconnect:', err);
        this.status = 'DISCONNECTED';
      }
    }
  }
}

// Instantiate manager singleton
const waManager = new WhatsAppManager();
waManager.autoReconnect();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parsing and static routes
  app.use(express.json());

  // API - Status info
  app.get("/api/whatsapp/status", (req, res) => {
    res.json({
      status: waManager.status,
      phoneNumber: waManager.phoneNumber,
      pairingCode: waManager.pairingCode,
      error: waManager.error,
      connectedUser: waManager.connectedUser
    });
  });

  // API - Connect (Request pairing code)
  app.post("/api/whatsapp/connect", async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: "Nomor telepon harus diisi" });
    }

    try {
      console.log(`Received request to connect phone: ${phoneNumber}`);
      await waManager.connect(phoneNumber);
      res.json({
        success: true,
        status: waManager.status,
        phoneNumber: waManager.phoneNumber,
        pairingCode: waManager.pairingCode
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Gagal menginisiasi WhatsApp pairing" });
    }
  });

  // API - Get all messages logs
  app.get("/api/whatsapp/messages", (req, res) => {
    res.json({
      messages: waManager.messages
    });
  });

  // API - Logout / Disconnect
  app.post("/api/whatsapp/logout", async (req, res) => {
    try {
      await waManager.logout();
      res.json({ success: true, message: "Koneksi WhatsApp diputus." });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Gagal memutus koneksi." });
    }
  });

  // API - Clear local messages logs
  app.post("/api/whatsapp/clear-messages", async (req, res) => {
    try {
      await waManager.clearMessages();
      res.json({ success: true, message: "Log pesan berhasil dibersihkan." });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Gagal membersihkan log." });
    }
  });

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully running on http://localhost:${PORT}`);
  });
}

startServer();
