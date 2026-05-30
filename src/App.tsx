import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MessageSquare,
  Clock,
  LogOut,
  Trash2,
  Search,
  User,
  Check,
  Copy,
  RefreshCw,
  Sliders,
  ShieldCheck,
  AlertCircle,
  Smartphone,
  MessageCircle,
  HelpCircle,
  ArrowRight,
  Database,
  CheckCheck,
  Activity
} from "lucide-react";
import { WAMessage, WAStatusResponse } from "./types";

export default function App() {
  const [status, setStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectedUser, setConnectedUser] = useState<{ id: string; name: string } | null>(null);
  const [messages, setMessages] = useState<WAMessage[]>([]);
  
  // Local state UI controls
  const [phoneInput, setPhoneInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'received' | 'sent' | 'media'>('all');
  const [isLoadingConnect, setIsLoadingConnect] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // References
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch Connection Status
  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/whatsapp/status");
      const data: WAStatusResponse = await response.json();
      setStatus(data.status);
      setPhoneNumber(data.phoneNumber || "");
      setPairingCode(data.pairingCode);
      setError(data.error);
      setConnectedUser(data.connectedUser);
    } catch (err) {
      console.error("Gagal mengambil status WhatsApp:", err);
    }
  };

  // Fetch Message Logs
  const fetchMessages = async () => {
    try {
      const response = await fetch("/api/whatsapp/messages");
      const data = await response.json();
      if (data && Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error("Gagal mengambil daftar pesan:", err);
    }
  };

  // Immediate update and set up polling
  useEffect(() => {
    fetchStatus();
    fetchMessages();

    // Constant quick polling to ensure pairing code works synchronously
    const interval = setInterval(() => {
      fetchStatus();
      fetchMessages();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Scroll to bottom of chat when messages array or selected contact shifts
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedContact]);

  // Connect request
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput) {
      setError("Masukkan nomor telepon terlebih dahulu");
      return;
    }

    const cleanedPhone = phoneInput.replace(/[^0-9]/g, '');
    if (cleanedPhone.length < 8) {
      setError("Nomor telepon tidak valid (minimal 8 angka)");
      return;
    }

    setIsLoadingConnect(true);
    setError(null);

    try {
      const response = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: cleanedPhone })
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setStatus(data.status);
        setPairingCode(data.pairingCode);
        setPhoneNumber(data.phoneNumber);
      }
    } catch (err) {
      setError("Terjadi kesalahan koneksi ke server.");
      console.error(err);
    } finally {
      setIsLoadingConnect(false);
    }
  };

  // Manual Trigger Sync
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStatus();
    await fetchMessages();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  // Clear Logs
  const handleClearLogs = async () => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus seluruh riwayat pesan lokal di web ini? (Ini tidak akan menghapus pesan di handphone Anda)")) {
      return;
    }
    setIsClearing(true);
    try {
      const response = await fetch("/api/whatsapp/clear-messages", { method: "POST" });
      if (response.ok) {
        setMessages([]);
        setSelectedContact(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsClearing(false);
    }
  };

  // Logout/Disconnet
  const handleLogout = async () => {
    if (!window.confirm("Apakah Anda yakin ingin memutuskan hubungan WhatsApp?")) {
      return;
    }
    setIsLoggingOut(true);
    try {
      const response = await fetch("/api/whatsapp/logout", { method: "POST" });
      if (response.ok) {
        setStatus("DISCONNECTED");
        setPairingCode(null);
        setConnectedUser(null);
        setPhoneNumber("");
        setSelectedContact(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Copy pairing code helper
  const handleCopyCode = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Copy message helper
  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 1500);
  };

  // Helper formatting dates in ID locale
  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return "Hari ini";
    } else if (d.toDateString() === yesterday.toDateString()) {
      return "Kemarin";
    } else {
      return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    }
  };

  // Filter messages array
  const filteredMessages = useMemo(() => {
    return messages.filter(msg => {
      // 1. Filter type check
      if (filterType === 'received' && msg.fromMe) return false;
      if (filterType === 'sent' && !msg.fromMe) return false;
      if (filterType === 'media' && ['image', 'video', 'document', 'audio', 'sticker'].indexOf(msg.type) === -1) return false;

      // 2. Search query match
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const msgMatch = msg.message?.toLowerCase().includes(query);
        const nameMatch = msg.senderName?.toLowerCase().includes(query);
        const jidMatch = msg.from?.toLowerCase().includes(query);
        return msgMatch || nameMatch || jidMatch;
      }
      return true;
    });
  }, [messages, filterType, searchQuery]);

  // Group messages into distinct Contacts listed on Left chats sidebar
  const contactSidebarList = useMemo(() => {
    const map = new Map<string, {
      jid: string;
      name: string;
      lastMsg: string;
      lastTimestamp: number;
      unreadCount: number;
    }>();

    // Iterate sorted message lists (newest first)
    messages.forEach(msg => {
      const jid = msg.from;
      if (!jid) return;

      if (!map.has(jid)) {
        map.set(jid, {
          jid,
          name: msg.senderName || jid.split('@')[0],
          lastMsg: msg.message,
          lastTimestamp: msg.timestamp,
          unreadCount: msg.fromMe ? 0 : 1 // simplified local highlight
        });
      } else {
        // Just increment metrics if needed, but lastMsg & lastTimestamp are already oldest inside iteration if done backward of sort
      }
    });

    const list = Array.from(map.values());
    // Sort contacts by latest message timestamp
    return list.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }, [messages]);

  // Messages of the *selected* contact chat thread (sorted oldest first for correct chat-bubble reading)
  const conversationMessages = useMemo(() => {
    if (!selectedContact) return [];
    return messages
      .filter(msg => msg.from === selectedContact)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, selectedContact]);

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-900">
      
      {/* Top Header navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 text-emerald-400 p-2 rounded-xl border border-emerald-500/20">
            <MessageSquare className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight text-white flex items-center gap-2">
              WhatsApp OTP Reader
            </h1>
            <span className="text-xs text-slate-400 font-mono">Live Monitoring Portal</span>
          </div>
        </div>

        {/* Status indicator panel */}
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            {status === "CONNECTED" && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="hidden sm:flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-full text-xs font-medium"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Terhubung: {connectedUser?.name || phoneNumber}</span>
              </motion.div>
            )}

            {status === "CONNECTING" && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="hidden sm:flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-full text-xs font-medium"
              >
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-spin border-t-transparent border-2" />
                <span>Menunggu Autentikasi...</span>
              </motion.div>
            )}

            {status === "DISCONNECTED" && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="hidden sm:flex items-center gap-2 bg-slate-800 text-slate-400 border border-slate-700 px-3 py-1.5 rounded-full text-xs font-medium"
              >
                <div className="w-2 h-2 rounded-full bg-slate-500" />
                <span>Terputus</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition duration-200 border border-transparent hover:border-slate-750 disabled:opacity-50"
            title="Sikronisasi Manual"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>
      </header>

      {/* Main container layout split */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        
        {/* Left Interactive column panel (Connection setup OR session metadata) */}
        <section className="lg:col-span-4 flex flex-col gap-6">

          {/* Connection Card states */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -z-0 pointer-events-none" />
            
            <h2 className="text-md font-semibold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Status Koneksi WhatsApp</span>
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Render based on state conditions */}
            <AnimatePresence mode="wait">
              
              {/* STATE: DISCONNECTED */}
              {status === "DISCONNECTED" && (
                <motion.div
                  key="disconnected-panel"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Sistem ini menyambungkan perangkat WhatsApp Anda menggunakan metode kode OTP (Pairing Code) tanpa memindai QR Code. Silakan masukkan nomor WhatsApp Anda di bawah.
                  </p>

                  <form onSubmit={handleConnect} className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 font-medium">Nomor Telepon WhatsApp</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 font-mono">
                          ID
                        </span>
                        <input
                          type="text"
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          placeholder="Contoh: 628123456789"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-xs font-mono text-slate-100 placeholder-slate-650 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        * Gunakan format internasional tanpa kode '+' atau spasi. Contoh: <strong className="text-slate-400">62812xxxxxx</strong>.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoadingConnect}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/30 text-slate-950 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-lg shadow-emerald-500/10"
                    >
                      {isLoadingConnect ? (
                        <>
                          <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                          <span>Menghubungi Server...</span>
                        </>
                      ) : (
                        <>
                          <span>Sambungkan via Kode OTP</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </form>
                </motion.div>
              )}

              {/* STATE: CONNECTING (Generating pairing code) */}
              {status === "CONNECTING" && (
                <motion.div
                  key="connecting-panel"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4 text-center py-2"
                >
                  {pairingCode ? (
                    <div className="space-y-4">
                      <div className="text-xs text-slate-400 text-left bg-slate-950/80 p-3.5 rounded-xl border border-slate-850">
                        <p className="font-semibold text-amber-400 flex items-center gap-1.5 mb-1.5">
                          <Activity className="w-3.5 h-3.5 animate-pulse" />
                          Masukkan Kode di Ponsel Anda
                        </p>
                        <ol className="list-decimal pl-4 space-y-1 text-slate-300">
                          <li>Buka WhatsApp di ponsel pintar Anda.</li>
                          <li>Masuk ke <strong className="text-white">Perangkat Tertaut (Linked Devices)</strong>.</li>
                          <li>Pilih <strong className="text-white">Tautkan Perangkat</strong>.</li>
                          <li>Ketuk <strong className="text-emerald-400">Tautkan dengan nomor telepon saja</strong> di bagian bawah.</li>
                          <li>Masukkan kode OTP 8-karakter berikut:</li>
                        </ol>
                      </div>

                      {/* Display Pairing Code with visual grouping */}
                      <div className="bg-slate-950 border border-emerald-900/30 rounded-2xl py-4.5 px-3 flex flex-col items-center gap-2.5 relative">
                        <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-mono font-bold">KODE OTP ANDA</span>
                        
                        <div className="text-stone-100 font-bold text-2xl tracking-widest font-mono text-center select-all select-none">
                          {pairingCode.slice(0, 4)} - {pairingCode.slice(4)}
                        </div>

                        <button
                          onClick={handleCopyCode}
                          className="flex items-center gap-1 text-[10px] bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white px-2.5 py-1 rounded-md transition"
                        >
                          {copiedCode ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin Kode</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleLogout}
                          disabled={isLoggingOut}
                          className="flex-1 bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 hover:text-white py-2 rounded-xl text-xs font-semibold cursor-pointer transition"
                        >
                          Batalkan Prosedur
                        </button>
                        <button
                          onClick={fetchStatus}
                          className="p-2 border border-slate-800 hover:bg-slate-850 text-slate-400 rounded-xl"
                          title="Cek Status"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 space-y-3">
                      <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      <div className="space-y-1">
                        <p className="text-xs text-white font-medium">Mempersiapkan Protokol WhatsApp...</p>
                        <p className="text-[10px] text-slate-500">Meminta kode Pairing baru dari WhatsApp Web Server.</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* STATE: CONNECTED */}
              {status === "CONNECTED" && (
                <motion.div
                  key="connected-panel"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex gap-3.5 items-center">
                    <div className="bg-emerald-500 text-slate-950 p-2.5 rounded-full shadow-lg shadow-emerald-500/20">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">WhatsApp Terhubung</h3>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        Menyimak pergerakan pesan yang masuk pada ponsel Anda.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-850 space-y-1.5 font-mono text-xs">
                    <div className="flex justify-between text-slate-500">
                      <span>Nama Perangkat:</span>
                      <span className="text-slate-300 font-semibold">{connectedUser?.name || 'WhatsApp Client'}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Nomor JID:</span>
                      <span className="text-slate-300 font-semibold">{phoneNumber || connectedUser?.id?.split('@')[0]}</span>
                    </div>
                    <div className="flex justify-between text-slate-500 pt-1.5 border-t border-slate-900">
                      <span>Server Sync:</span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                        ONLINE
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center pt-1">
                    <button
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      className="bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition font-semibold"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                      <span>Refresh</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition font-semibold"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Statistics Box - Shown only if connected & has messages logs */}
          {status === "CONNECTED" && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3.5 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Statistik Log Pesan Lokal</span>
              </h3>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <div className="text-xs text-slate-500">Total</div>
                  <div className="text-lg font-bold text-slate-200 mt-0.5">{messages.length}</div>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <div className="text-xs text-slate-500">Masuk</div>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5">
                    {messages.filter(m => !m.fromMe).length}
                  </div>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <div className="text-xs text-slate-500">Keluar</div>
                  <div className="text-lg font-bold text-amber-400 mt-0.5">
                    {messages.filter(m => m.fromMe).length}
                  </div>
                </div>
              </div>

              <button
                onClick={handleClearLogs}
                disabled={isClearing || messages.length === 0}
                className="w-full mt-3.5 bg-slate-950 hover:bg-slate-850 hover:text-rose-400 disabled:opacity-30 disabled:hover:text-slate-500 text-slate-500 border border-slate-850 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Bersihkan Semua Log Lokal</span>
              </button>
            </div>
          )}

          {/* Quick Informational Section */}
          <div className="bg-slate-900/60 border border-slate-850 rounded-2xl p-5 text-xs text-slate-400 leading-relaxed space-y-2.5">
            <h4 className="font-semibold text-slate-300 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-slate-400" />
              <span>Bagaimana Cara Kerja OTP?</span>
            </h4>
            <p>
              Prosedur ini memanfaatkan otorisasi resmi bawaan aplikasi WhatsApp Web (Pairing Code). 
            </p>
            <p>
              Sistem tidak menyimpan nomor sandi atau rahasia akun Anda. Semua kredensial authentikasi disimpan langsung ke folder sandboxed kontainer enkripsi Anda secara aman.
            </p>
          </div>

        </section>

        {/* Right Side - WhatsApp Interactive Web UI */}
        <section className="lg:col-span-8 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl h-[calc(100vh-140px)] min-h-[500px] overflow-hidden">
          
          {/* Main conditional display */}
          <AnimatePresence mode="wait">
            
            {status !== "CONNECTED" ? (
              
              /* STATE: EXPLAINER ON UNCONNECTED */
              <motion.div
                key="unconnected-explainer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center p-8 text-center"
              >
                <div className="bg-slate-950 p-6 rounded-full border border-slate-800 text-slate-500 mb-4 max-w-sm flex items-center justify-center shadow-inner">
                  <MessageCircle className="w-16 h-16 text-slate-700 animate-pulse" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">Belum Ada Perangkat Tertaut</h3>
                <p className="text-slate-400 text-xs max-w-md leading-relaxed">
                  Sambungkan akun WhatsApp Anda terlebih dahulu menggunakan kode OTP di panel kiri. Setelah berhasil terhubung, semua log riwayat percakapan dan pesan masuk akan tersinkronisasi serta ditampilkan secara instan di area ini.
                </p>
                <div className="mt-6 flex gap-4 text-xs font-semibold text-slate-500 max-w-md border-t border-slate-850 pt-5">
                  <div className="flex-1">
                    <span className="block text-emerald-400 text-lg mb-0.5">01</span>
                    Masukkan nomor HP dan dapatkan kode pairing
                  </div>
                  <div className="w-px bg-slate-850" />
                  <div className="flex-1">
                    <span className="block text-emerald-400 text-lg mb-0.5">02</span>
                    Input kode 8-digit pada WhatsApp ponsel
                  </div>
                  <div className="w-px bg-slate-850" />
                  <div className="flex-1">
                    <span className="block text-emerald-400 text-lg mb-0.5">03</span>
                    Baca pesan masuk secara langsung & real-time
                  </div>
                </div>
              </motion.div>

            ) : (

              /* STATE: FULL INTERACTIVE MESSAGING CLIENT */
              <motion.div
                key="messaging-app"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden h-full"
              >
                
                {/* Chat Inbox Sidebar List JID (4 Columns on MD) */}
                <div className="md:col-span-5 border-r border-slate-800 flex flex-col bg-slate-900/40 h-full overflow-hidden">
                  
                  {/* Search and Filters Header */}
                  <div className="p-4 border-b border-slate-800 space-y-3 shrink-0">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari chat atau pesan..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    {/* Filter Pills slider */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                      <button
                        onClick={() => setFilterType('all')}
                        className={`px-3 py-1 rounded-full border transition shrink-0 cursor-pointer ${
                          filterType === 'all'
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-semibold"
                            : "bg-slate-950 border-slate-850 hover:bg-slate-900 text-slate-400"
                        }`}
                      >
                        Semua
                      </button>
                      <button
                        onClick={() => setFilterType('received')}
                        className={`px-3 py-1 rounded-full border transition shrink-0 cursor-pointer ${
                          filterType === 'received'
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-semibold"
                            : "bg-slate-950 border-slate-850 hover:bg-slate-900 text-slate-400"
                        }`}
                      >
                        Masuk
                      </button>
                      <button
                        onClick={() => setFilterType('sent')}
                        className={`px-3 py-1 rounded-full border transition shrink-0 cursor-pointer ${
                          filterType === 'sent'
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-semibold"
                            : "bg-slate-950 border-slate-850 hover:bg-slate-900 text-slate-400"
                        }`}
                      >
                        Keluar
                      </button>
                      <button
                        onClick={() => setFilterType('media')}
                        className={`px-3 py-1 rounded-full border transition shrink-0 cursor-pointer ${
                          filterType === 'media'
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-semibold"
                            : "bg-slate-950 border-slate-850 hover:bg-slate-900 text-slate-400"
                        }`}
                      >
                        File / Media
                      </button>
                    </div>
                  </div>

                  {/* Sidebar Contact list body */}
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-850 hover:scrollbar-thin">
                    <AnimatePresence initial={false}>
                      {contactSidebarList.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-xs">
                          Belum ada pesan yang disinkronisasi.
                        </div>
                      ) : (
                        contactSidebarList.map((contact) => {
                          const isSelected = selectedContact === contact.jid;
                          return (
                            <button
                              key={contact.jid}
                              onClick={() => setSelectedContact(contact.jid)}
                              className={`w-full text-left p-3.5 flex items-start gap-3 transition cursor-pointer border-l-3 ${
                                isSelected
                                  ? "bg-slate-850 border-emerald-500 text-white"
                                  : "border-transparent text-slate-300 hover:bg-slate-850/50"
                              }`}
                            >
                              {/* Avatar design placeholder */}
                              <div className="w-9 h-9 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs shrink-0 select-none border border-slate-700">
                                {contact.name.slice(0, 2).toUpperCase()}
                              </div>

                              {/* Text stack details */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1.5 mb-1">
                                  <h4 className="font-semibold text-xs truncate text-slate-200">
                                    {contact.name}
                                  </h4>
                                  <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                                    {formatTime(contact.lastTimestamp)}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400 truncate leading-normal">
                                  {contact.lastMsg}
                                </p>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Chat Feed Messages Thread (7 Columns on MD) */}
                <div className="md:col-span-7 flex flex-col bg-slate-950 h-full overflow-hidden">
                  
                  {selectedContact ? (
                    
                    /* ACTIVE CONTACT CONVERSATION LOADED */
                    <div className="flex-1 flex flex-col h-full overflow-hidden">
                      
                      {/* Active Contact Header header */}
                      <header className="px-5 py-3.5 bg-slate-900 border-b border-slate-850 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-emerald-505 bg-gradient-to-tr from-emerald-600 to-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center shrink-0">
                            {contactSidebarList.find(c => c.jid === selectedContact)?.name?.slice(0, 2).toUpperCase() || 'WA'}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-xs text-white truncate">
                              {contactSidebarList.find(c => c.jid === selectedContact)?.name || selectedContact.split('@')[0]}
                            </h3>
                            <span className="text-[10px] text-slate-500 font-mono truncate block">
                              {selectedContact}
                            </span>
                          </div>
                        </div>
                        
                        <div className="text-[10px] text-slate-500 font-mono">
                          {conversationMessages.length} total pesan log
                        </div>
                      </header>

                      {/* Conversation Scroller bubbles box */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950 border-b border-slate-900">
                        {conversationMessages.map((msg, index) => {
                          const isFirstOfDay = index === 0 || formatDate(conversationMessages[index - 1].timestamp) !== formatDate(msg.timestamp);
                          
                          return (
                            <div key={msg.id} className="space-y-3">
                              {isFirstOfDay && (
                                <div className="flex justify-center my-3 shrink-0">
                                  <span className="bg-slate-900 text-slate-400 border border-slate-800 text-[10px] px-2.5 py-0.5 rounded-full font-medium font-mono">
                                    {formatDate(msg.timestamp)}
                                  </span>
                                </div>
                              )}

                              <div className={`flex w-full ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                                <div
                                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 relative group shadow-lg ${
                                    msg.fromMe
                                      ? "bg-emerald-600 text-slate-950 font-medium rounded-tr-none"
                                      : "bg-slate-900 text-slate-200 rounded-tl-none border border-slate-800"
                                  }`}
                                >
                                  {/* Hover action bar copy */}
                                  <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition duration-150 flex items-center gap-1.5 ml-8 bg-black/30 backdrop-blur-sm px-1.5 py-0.5 rounded-md">
                                    <button
                                      onClick={() => handleCopyMessage(msg.id, msg.message)}
                                      className="p-0.5 rounded text-white hover:text-emerald-300"
                                      title="Salin isi pesan"
                                    >
                                      {copiedMsgId === msg.id ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>

                                  {/* Sender name for received messages */}
                                  {!msg.fromMe && (
                                    <p className="text-[10px] font-bold text-emerald-400 mb-1 font-sans">
                                      {msg.senderName}
                                    </p>
                                  )}

                                  {/* Main plain-text body */}
                                  <p className="text-xs leading-relaxed break-words whitespace-pre-wrap">
                                    {msg.message}
                                  </p>

                                  {/* Timestamp stack footer */}
                                  <div className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${
                                    msg.fromMe ? "text-emerald-950" : "text-slate-500 font-mono"
                                  }`}>
                                    <span>{formatTime(msg.timestamp)}</span>
                                    {msg.fromMe && <CheckCheck className="w-3 h-3 text-slate-900" />}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={chatEndRef} />
                      </div>

                    </div>

                  ) : (
                    
                    /* STATE: EMPTY CORNER CHAT PREVIEW INDICATOR */
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
                      <div className="bg-slate-900 p-4 rounded-full border border-slate-850 mb-3">
                        <MessageSquare className="w-10 h-10 text-slate-700" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-400 mb-1">Ruang Percakapan</h4>
                      <p className="text-xs text-slate-500 max-w-sm">
                        Pilih salah satu obrolan masuk di panel kiri untuk membuka rentetan pesan dan riwayat percakapan lengkap.
                      </p>
                    </div>

                  )}

                </div>

              </motion.div>

            )}

          </AnimatePresence>

        </section>

      </main>

      {/* Footer system indicators */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-500 font-mono mt-auto shrink-0 w-full">
        <span>&copy; {new Date().getFullYear()} WhatsApp OTP Reader Sandbox. All rights reserved.</span>
        <span className="flex items-center gap-1.5 mt-1 sm:mt-0">
          <Activity className="w-3 h-3 text-emerald-500" />
          <span>Status Hub: OK • Terenkripsi • Baileys Engine</span>
        </span>
      </footer>

    </div>
  );
}
