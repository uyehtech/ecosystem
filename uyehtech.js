// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    UYEH TECH BACKEND SERVER                               ║ 
// ║          Setup, Configuration, Schemas & WebSocket Init                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { Resend } = require('resend');


// ═════════════════════════════════════════════════════════════════════════════
// 🔐 SECURE ACCESS CODE VERIFICATION SYSTEM
// ═════════════════════════════════════════════════════════════════════════════

// Pre-hashed access codes (NEVER store plain text passwords!)
// To generate new hash: node generate-hash.js YOUR_PASSWORD

const SECURE_ACCESS_CODES = {
  // Hash for 'UYEHTECH2025!' - Homepage Secret Access
  home: '$2a$10$7UbRXavrRyKWG8jbvO0D3.m1/dFwprSRUhZeETW69piEy/HSzvf0W',
  
  // Hash for 'UYEH-2026!' - Strict Portal Access (if you still want this)
  strict: '$2a$10$X4V0SAVZvlul1Vs2qJ6AvethuWaq9B6e1T5jY5ir.yzcIzXkZNvEi',
};


// Store active access sessions (In production, use Redis)
const accessSessions = new Map();

// Rate limiting for access attempts (prevent brute force)
const accessAttempts = new Map();

// Clean up expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of accessSessions.entries()) {
    if (now - session.timestamp > 30 * 60 * 1000) { // 30 minutes
      accessSessions.delete(sessionId);
    }
  }
  
  // Clear old failed attempts
  for (const [ip, data] of accessAttempts.entries()) {
    if (now - data.lastAttempt > 15 * 60 * 1000) { // 15 minutes
      accessAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

console.log('✅ Secure Access Code System Initialized');

const app = express();
const server = http.createServer(app);

// ═════════════════════════════════════════════════════════════════════════════
// EMAIL QUEUE SYSTEM (Prevents blocking)
// ═════════════════════════════════════════════════════════════════════════════

const emailQueue = [];
let isProcessingQueue = false;

async function processEmailQueue() {
  if (isProcessingQueue || emailQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (emailQueue.length > 0) {
    const emailTask = emailQueue.shift();
    try {
      await emailTask();
    } catch (error) {
      console.error('❌ Queue email error:', error.message);
    }
  }
  
  isProcessingQueue = false;
}

// Process queue every 100ms
setInterval(processEmailQueue, 100);

global.queueEmail = (emailFunction) => {
  emailQueue.push(emailFunction);
  console.log(`📬 Email queued (${emailQueue.length} in queue)`);
};

// ════════════════════════════════════════════════════════════════════════════
// 🛡️ PRODUCTION STABILITY CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════

const STABILITY_CONFIG = {
  // Allow server to continue even if monitoring fails
  requireMonitoring: process.env.REQUIRE_MONITORING === 'true', // Default: false
  
  // Allow server to continue even if some services are down
  requireAllServices: process.env.REQUIRE_ALL_SERVICES === 'true', // Default: false
  
  // Maximum uncaught exceptions before shutdown
  maxExceptions: parseInt(process.env.MAX_EXCEPTIONS) || 5,
  
  // Auto-restart monitoring if it fails
  autoRestartMonitoring: process.env.AUTO_RESTART_MONITORING !== 'false' // Default: true
};

console.log('🛡️ Stability Configuration:');
console.log(`   Require Monitoring: ${STABILITY_CONFIG.requireMonitoring}`);
console.log(`   Require All Services: ${STABILITY_CONFIG.requireAllServices}`);
console.log(`   Max Exceptions: ${STABILITY_CONFIG.maxExceptions}`);
console.log(`   Auto-Restart Monitoring: ${STABILITY_CONFIG.autoRestartMonitoring}`);
// ═════════════════════════════════════════════════════════════════════════════
// WEBSOCKET SETUP FOR REAL-TIME CHAT
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// WEBSOCKET SETUP FOR REAL-TIME CHAT
// ═════════════════════════════════════════════════════════════════════════════

const wss = new WebSocket.Server({ 
  server,
  path: '/wss',  // ✅ FIXED: Changed from /ws to /wss to match frontend
  verifyClient: (info) => {
    // Allow all connections - authentication handled in message handler
    console.log('🔌 WebSocket connection attempt from:', info.origin);
    return true;
  }
});
global.wss = wss;

// Store active WebSocket connections
const activeConnections = new Map(); // chatId -> Set of WebSocket connections
const agentConnections = new Map();  // agentId -> WebSocket connection
const customerConnections = new Map(); // customerId -> WebSocket connection

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  // ✅ FIXED: Better URL parsing
  const url = new URL(req.url, `http://${req.headers.host}`);
  const chatId = url.searchParams.get('chatId');
  const agentId = url.searchParams.get('agentId');
  const customerId = url.searchParams.get('customerId');
  const token = url.searchParams.get('token');
  
  console.log(`\n🔌 WebSocket Connection Established:`);
  console.log(`   URL: ${req.url}`);
  console.log(`   Chat ID: ${chatId || 'N/A'}`);
  console.log(`   Agent ID: ${agentId || 'N/A'}`);
  console.log(`   Customer ID: ${customerId || 'N/A'}`);
  console.log(`   Token: ${token ? 'Provided' : 'N/A'}`);
  console.log(`   Total Connections: ${wss.clients.size}`);
  
  // Store connection metadata
  wss.isAlive = true;
  wss.chatId = chatId;
  wss.agentId = agentId;
  wss.customerId = customerId;
  wss.connectedAt = new Date();
  
  // Store connection in appropriate map
  if (chatId) {
    if (!activeConnections.has(chatId)) {
      activeConnections.set(chatId, new Set());
    }
    activeConnections.get(chatId).add(ws);
    console.log(`   ✅ Added to chat: ${chatId}`);
  }
  
  if (agentId) {
    agentConnections.set(agentId, ws);
    console.log(`   ✅ Registered agent: ${agentId}`);
  }
  
  if (customerId) {
    customerConnections.set(customerId, ws);
    console.log(`   ✅ Registered customer: ${customerId}`);
  }
  
  // Send welcome message

  // Handle pong responses
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  // Send connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket connection established',
    timestamp: new Date()
  }));

  // Handle incoming messages
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`📨 WebSocket message received:`, data.type);

      switch (data.type) {
        // ✅ AGENT JOINING
        case 'join_agent':
          await handleAgentJoin(ws, data);
          break;

        // ✅ CUSTOMER JOINING
        case 'join_customer':
          await handleCustomerJoin(ws, data);
          break;

        // ✅ AGENT JOINING CHAT ROOM
        case 'join_chat':
          await handleJoinChat(ws, data);
          break;

        // ✅ NEW MESSAGE (INSTANT BROADCAST)
        case 'new_message':
          await handleNewMessage(ws, data);
          break;

        // ✅ TYPING INDICATOR
        case 'typing':
          await handleTyping(ws, data);
          break;

        // ✅ STOP TYPING
        case 'stop_typing':
          await handleStopTyping(ws, data);
          break;

        // ✅ HEARTBEAT
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date() }));
          break;

        default:
          console.log(`❓ Unknown WebSocket message type: ${data.type}`);
      }
    } catch (error) {
      console.error('❌ Error processing WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process message',
        error: error.message
      }));
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    console.log('🔌 WebSocket connection closed');
    // Clean up user data
    if (ws.userId) {
      delete ws.userId;
    }
    if (ws.chatId) {
      delete ws.chatId;
    }
    if (ws.agentId) {
      delete ws.agentId;
    }
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    console.error('   Connection details:', {
      chatId,
      agentId,
      customerId,
      readyState: ws.readyState
    });
  });
});



/**
 * Handle agent joining the WebSocket
 */
async function handleAgentJoin(ws, data) {
  const { userId, agentId } = data;
  
  ws.userId = userId;
  ws.agentId = agentId;
  ws.userType = 'agent';
  
  console.log(`✅ Agent joined: ${agentId}`);
  
  ws.send(JSON.stringify({
    type: 'joined',
    message: 'Successfully joined as agent',
    userId,
    agentId
  }));
}

/**
 * Handle customer joining the WebSocket
 */
async function handleCustomerJoin(ws, data) {
  const { userId, chatId } = data;
  
  ws.userId = userId;
  ws.chatId = chatId;
  ws.userType = 'customer';
  
  console.log(`✅ Customer joined chat: ${chatId}`);
  
  ws.send(JSON.stringify({
    type: 'joined',
    message: 'Successfully joined chat',
    userId,
    chatId
  }));
}

/**
 * Handle agent joining a specific chat room
 */
async function handleJoinChat(ws, data) {
  const { chatId, userId } = data;
  
  ws.chatId = chatId;
  ws.userId = userId;
  
  console.log(`✅ User ${userId} joined chat room: ${chatId}`);
  
  ws.send(JSON.stringify({
    type: 'chat_joined',
    message: 'Successfully joined chat room',
    chatId
  }));
}

/**
 * ✅ CRITICAL: Handle new message with INSTANT broadcasting
 */
async function handleNewMessage(ws, data) {
  try {
    const { chatId, message, sender, senderId, senderName } = data;
    
    console.log(`💬 New message in chat ${chatId} from ${sender}`);

    // Validate message
    if (!chatId || !message || !sender) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Missing required fields'
      }));
      return;
    }

    // Create message object
    const messageObj = {
      messageId: `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender,
      senderId: senderId || ws.userId,
      senderName: senderName || (sender === 'agent' ? 'Agent' : 'Customer'),
      message: message.trim(),
      timestamp: new Date(),
      read: false
    };

    // Save to database
    const chat = await Chat.findOne({ chatId });
    if (!chat) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Chat not found'
      }));
      return;
    }

    // Add message to chat
    chat.messages.push(messageObj);
    chat.updatedAt = new Date();
    await chat.save();

    console.log(`✅ Message saved to database: ${messageObj.messageId}`);

    // ✅ INSTANT BROADCAST to ALL participants in this chat
    const broadcastData = {
      type: 'chat_message',
      chatId,
      message: messageObj
    };

    let broadcastCount = 0;

wss.clients.forEach((client) => {
  if (client.readyState === 1 &&
      (client.chatId === chatId || 
       (client.agentId && client.chatId === chatId))) { // In chat room OR is an agent
        try {
          client.send(JSON.stringify(broadcastData));
          broadcastCount++;
        } catch (error) {
          console.error('Error broadcasting message:', error);
        }
      }
    });

    console.log(`📢 Message broadcasted to ${broadcastCount} clients`);

    // Send confirmation to sender
    ws.send(JSON.stringify({
      type: 'message_sent',
      message: messageObj,
      success: true
    }));

  } catch (error) {
    console.error('❌ Error handling new message:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to send message',
      error: error.message
    }));
  }
}

/**
 * Handle typing indicator
 */
async function handleTyping(ws, data) {
  const { chatId, sender, senderName } = data;
  
  console.log(`⌨️  ${senderName} is typing in chat ${chatId}`);

  // Broadcast to all participants EXCEPT sender
  const typingData = {
    type: 'typing',
    chatId,
    sender,
    senderName
  };

  wss.clients.forEach((client) => {
    if (client.readyState === 1 && 
        client.chatId === chatId && 
        client !== ws) { // Don't send back to sender
      try {
        client.send(JSON.stringify(typingData));
      } catch (error) {
        console.error('Error broadcasting typing:', error);
      }
    }
  });
}

/**
 * Handle stop typing
 */
async function handleStopTyping(ws, data) {
  const { chatId, sender } = data;
  
  // Broadcast to all participants EXCEPT sender
  const stopTypingData = {
    type: 'stop_typing',
    chatId,
    sender
  };

  wss.clients.forEach((client) => {
    if (client.readyState === 1 && 
        client.chatId === chatId && 
        client !== ws) {
      try {
        client.send(JSON.stringify(stopTypingData));
      } catch (error) {
        console.error('Error broadcasting stop typing:', error);
      }
    }
  });
}


// ✅ Performance monitoring middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Log slow requests (> 1 second)
    if (duration > 1000) {
      console.warn(`⚠️  SLOW REQUEST: ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  
  next();
});
// Heartbeat to keep connections alive - Every 30 seconds
const heartbeatInterval = setInterval(() => {
  console.log(`\n💓 WebSocket Heartbeat - Active connections: ${wss.clients.size}`);
  
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('   ❌ Terminating dead connection');
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);




// Handle WebSocket messages
function handleWebSocketMessage(ws, data) {
  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ 
        type: 'pong', 
        timestamp: new Date().toISOString() 
      }));
      break;
      
    case 'typing':
      if (ws.chatId) {
        broadcastToChat(ws.chatId, {
          type: 'typing',
          userId: data.userId || ws.customerId || ws.agentId,
          isTyping: data.isTyping
        }, ws);
      }
      break;
      
    case 'join_chat':
      console.log(`👤 User joining chat: ${data.chatId}`);
      ws.chatId = data.chatId;
      if (!activeConnections.has(data.chatId)) {
        activeConnections.set(data.chatId, new Set());
      }
      activeConnections.get(data.chatId).add(ws);
      ws.send(JSON.stringify({
        type: 'joined_chat',
        chatId: data.chatId,
        message: 'Successfully joined chat'
      }));
      break;
      
    case 'leave_chat':
      if (ws.chatId && activeConnections.has(ws.chatId)) {
        activeConnections.get(ws.chatId).delete(ws);
        if (activeConnections.get(ws.chatId).size === 0) {
          activeConnections.delete(ws.chatId);
        }
      }
      ws.send(JSON.stringify({
        type: 'left_chat',
        chatId: ws.chatId
      }));
      ws.chatId = null;
      break;
      
    default:
      console.log(`⚠️  Unhandled message type: ${data.type}`);
      ws.send(JSON.stringify({
        type: 'unknown_type',
        message: `Message type '${data.type}' not recognized`
      }));
  }
}

// Helper function to broadcast to chat
// âœ… FIXED: Complete broadcast function


function broadcastToChat(chatId, message, excludeWs = null) {
    console.log(`ðŸ"¡ Broadcasting to chat ${chatId}:`, message.type);
    
    if (activeConnections.has(chatId)) {
        const connections = activeConnections.get(chatId);
        let sentCount = 0;
        
        connections.forEach((clientWs) => {
            if (clientWs !== excludeWs && clientWs.readyState === WebSocket.OPEN) {
                try {
                    clientWs.send(JSON.stringify(message));
                    sentCount++;
                } catch (error) {
                    console.error('âŒ Broadcast error:', error);
                }
            }
        });
        
        console.log(`âœ… Broadcast sent to ${sentCount} connections`);
    } else {
        console.log(`âš ï¸ No active connections for chat ${chatId}`);
    }
}

// Helper function to send to specific agent
function sendToAgent(agentId, message) {
  const agentWs = agentConnections.get(agentId);
  if (agentWs && agentWs.readyState === WebSocket.OPEN) {
    agentWs.send(JSON.stringify(message));
  }
}

// Helper function to send to specific customer
function sendToCustomer(customerId, message) {
  const customerWs = customerConnections.get(customerId);
  if (customerWs && customerWs.readyState === WebSocket.OPEN) {
    customerWs.send(JSON.stringify(message));
  }
}

// ═══════════════════════════════════════════════════════
// MIDDLEWARE CONFIGURATION
// ═══════════════════════════════════════════════════════

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-affiliate-code', 'x-bypass-token'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files for uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
}

app.use('/uploads', express.static(uploadsDir));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ═════════════════════════════════════════════════════════════════════════════
// CLOUDINARY + MULTER CONFIGURATION FOR FILE UPLOADS
// ═════════════════════════════════════════════════════════════════════════════

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Use memory storage - file stays in RAM, we stream it to Cloudinary
const storage = multer.memoryStorage();

// ─── EXTENDED FILE FILTER ─────────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  // ── Block video & audio — creators must paste external links for these ────
  const BLOCKED_FOR_UPLOAD = [
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac',
    'audio/x-wav', 'audio/x-flac', 'audio/x-m4a'
  ];
 
  if (BLOCKED_FOR_UPLOAD.includes(file.mimetype)) {
    return cb(
      new Error(
        'Video and audio files cannot be uploaded directly. ' +
        'Please paste an external link (YouTube, Vimeo, SoundCloud, Google Drive, etc.) instead.'
      ),
      false
    );
  }
 
  // ── Allow everything else (images, docs, scripts, ZIPs, etc.) ────────────
  const ALLOWED_MIMES = [
    // Images
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/html', 'text/css', 'text/javascript', 'application/javascript',
    // Archives / Software / Scripts
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-7z-compressed',
    'application/octet-stream', // .exe, .dmg, .apk, etc.
    // Spreadsheets / Presentations (templates)
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ];
 
  if (ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
};
 

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024,  // 500MB — covers course videos & software ZIPs
    files: 10
  },
  fileFilter: fileFilter
});

// Helper: derive Cloudinary resource_type from mimetype
function getCloudinaryResourceType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'video'; // Cloudinary handles audio under 'video'
  return 'raw'; // ZIPs, PDFs, executables, docs
}

// Helper: upload buffer to Cloudinary, returns { secureUrl, publicId, resourceType, bytes }
function uploadToCloudinary(buffer, mimetype, folder, options = {}) {
  return new Promise((resolve, reject) => {
    const resourceType = getCloudinaryResourceType(mimetype);
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        use_filename: true,
        unique_filename: true,
        ...options
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          secureUrl: result.secure_url,
          publicId:  result.public_id,
          resourceType,
          bytes:     result.bytes,
          format:    result.format,
          duration:  result.duration || null,  // for video/audio
        });
      }
    );
    uploadStream.end(buffer);
  });
}

function parseExternalMediaUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { embedType: 'unknown', embedUrl: '', mediaType: 'unknown' };
  }
 
  const url = rawUrl.trim();
 
  // ── YouTube ─────────────────────────────────────────────────────────────
  // Handles: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID
  const ytMatch =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/) ||
    url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/);
 
  if (ytMatch) {
    const videoId = ytMatch[1];
    return {
      embedType: 'youtube',
      embedUrl:  `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`,
      mediaType: 'video',
      videoId
    };
  }
 
  // ── Vimeo ────────────────────────────────────────────────────────────────
  // Handles: vimeo.com/12345678, player.vimeo.com/video/12345678
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) {
    const videoId = vimeoMatch[1];
    return {
      embedType: 'vimeo',
      embedUrl:  `https://player.vimeo.com/video/${videoId}?byline=0&portrait=0`,
      mediaType: 'video',
      videoId
    };
  }
 
  // ── Dailymotion ──────────────────────────────────────────────────────────
  const dmMatch = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
  if (dmMatch) {
    const videoId = dmMatch[1];
    return {
      embedType: 'dailymotion',
      embedUrl:  `https://www.dailymotion.com/embed/video/${videoId}`,
      mediaType: 'video',
      videoId
    };
  }
 
  // ── SoundCloud ───────────────────────────────────────────────────────────
  if (url.includes('soundcloud.com/')) {
    return {
      embedType: 'soundcloud',
      // SoundCloud widget uses the track URL directly as parameter
      embedUrl:  `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%2300b359&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`,
      mediaType: 'audio'
    };
  }
 
  // ── Direct file links (.mp4, .webm, .mp3, .wav, .ogg, etc.) ────────────
  const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];
  const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  const lowerUrl  = url.toLowerCase().split('?')[0]; // strip query params for ext check
 
  if (audioExts.some(ext => lowerUrl.endsWith(ext))) {
    return { embedType: 'direct', embedUrl: url, mediaType: 'audio' };
  }
  if (videoExts.some(ext => lowerUrl.endsWith(ext))) {
    return { embedType: 'direct', embedUrl: url, mediaType: 'video' };
  }
 
  // ── Google Drive share links ─────────────────────────────────────────────
  // Convert sharing URL → embed URL
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch) {
    const fileId = driveMatch[1];
    return {
      embedType: 'gdrive',
      embedUrl:  `https://drive.google.com/file/d/${fileId}/preview`,
      mediaType: 'video' // assume video for Drive links; creator can override
    };
  }
 
  // ── Fallback ─────────────────────────────────────────────────────────────
  return { embedType: 'unknown', embedUrl: url, mediaType: 'unknown' };
}
 
// Export for potential use in other modules
global.parseExternalMediaUrl = parseExternalMediaUrl;
console.log('✅ External Media URL Parser Loaded');
 
// Helper: generate a signed, time-limited delivery URL for a Cloudinary asset
function generateSecureDeliveryUrl(publicId, resourceType, expiresInSeconds = 3600, forDownload = true) {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const signedUrl = cloudinary.utils.private_download_url(publicId, null, {
    resource_type: resourceType,
    expires_at: expires,
    attachment: forDownload,
  });
  return signedUrl;
}




// ═════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
const ADMIN_EMAIL = 'uyehtech@gmail.com';
const PORT = process.env.PORT || 3000;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_SENDER_EMAIL = process.env.RESEND_SENDER_EMAIL || 'onboarding@resend.dev';
const RESEND_SENDER_NAME = process.env.RESEND_SENDER_NAME || 'UYEH TECH';


// Initialize Resend client
let resend = null;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
  console.log('✅ Resend Email Service Initialized');
} else {
  console.warn('⚠️  RESEND_API_KEY not found - Email service will be disabled');
}
// Smart BASE_URL detection for production
const BASE_URL = process.env.BASE_URL || 
                 process.env.RENDER_EXTERNAL_URL || 
                 (process.env.NODE_ENV === 'production' 
                   ? 'https://uyehtechbackend.onrender.com' 
                   : `http://localhost:${PORT}`);


// ✅ NEW: Frontend URL (for email links)
const FRONTEND_URL = process.env.FRONTEND_URL || 
                     (process.env.NODE_ENV === 'production'
                       ? 'https://uyeh.netlify.app'
                       : 'http://localhost:3000');


// ✅ NEW: Logo URL for emails
const LOGO_URL = process.env.LOGO_URL || 
                 `${FRONTEND_URL}/images/uyehtech-logo.png`;
                 
                 
// ═════════════════════════════════════════════════════════════════════════════
// STARTUP VALIDATION & BANNER
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n╔═════════════════════════════════════════════════════════════════════════╗');
console.log('║              🚀 UYEH TECH SERVER       - INITIALIZING                    ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

console.log('📋 Configuration Status:');
console.log('  ├─ MongoDB:', MONGO_URI ? '✅ Configured' : '❌ Missing (REQUIRED)');
console.log('  ├─ Resend API:', RESEND_API_KEY ? '✅ Configured' : '⚠️  Missing (Email disabled)');
console.log('  ├─ Resend Sender:', RESEND_SENDER_EMAIL);
console.log('  ├─ JWT Secret:', JWT_SECRET !== 'default-jwt-secret-change-in-production' ? '✅ Configured' : '⚠️  Using Default (Change in Production)');
console.log('  ├─ Flutterwave:', FLUTTERWAVE_SECRET_KEY ? '✅ Configured' : '⚠️  Missing (Payments disabled)');
console.log('  └─ Admin Email:', ADMIN_EMAIL, '\n');

// ═════════════════════════════════════════════════════════════════════════════
// CONNECT TO MONGODB
// ═════════════════════════════════════════════════════════════════════════════

if (!MONGO_URI) {
  console.error('❌ FATAL: MONGO_URI not configured in .env file');
  console.log('📝 Please add MONGO_URI to your .env file');
  process.exit(1);
}


mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ MongoDB Connected Successfully');
  createDatabaseIndexes(); 
}).catch(err => {
  console.error('❌ MongoDB Connection Error:', err.message);
  process.exit(1);
});

// ═════════════════════════════════════════════════════════════════════════════
// DATABASE SCHEMAS
// ═════════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────────────────
// USER SCHEMA
// ──────────────────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone: String,
  country: String,
  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  profileImage: String,
  bio: String,
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: String,
  notificationPreferences: {
    email: { type: Boolean, default: true },
    orders: { type: Boolean, default: true },
    marketing: { type: Boolean, default: false }
  },
  isAdmin: { type: Boolean, default: false },
  isAgent: { type: Boolean, default: false },
  agentInfo: {
    department: { type: String, enum: ['Sales', 'Support', 'Technical', 'Billing', 'General'] },
    status: { type: String, enum: ['online', 'offline', 'busy', 'away'], default: 'offline' },
    activeChats: { type: Number, default: 0 },
    maxChats: { type: Number, default: 5 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    totalChats: { type: Number, default: 0 },
    resolvedChats: { type: Number, default: 0 }
  },

 
isCreator: { type: Boolean, default: false },
creatorInfo: {
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Creator' },
  storeName: String,
  joinedAt: Date
},

  isBanned: { type: Boolean, default: false },
  banReason: String,
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
  lastActivity: Date,
  updatedAt: { type: Date, default: Date.now }
});

userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (this.email.toLowerCase() === global.ADMIN_EMAIL.toLowerCase()) {
    this.isAdmin = true;
  }
  next();
});

userSchema.index({ isAdmin: 1 });
userSchema.index({ isAgent: 1 });
userSchema.index({ createdAt: -1 });

const User = mongoose.model('User', userSchema);


// ✅ Create compound indexes for better query performance
async function createDatabaseIndexes() {
  try {
    await Chat.collection.createIndex({ chatId: 1, status: 1 });
    await Chat.collection.createIndex({ assignedAgent: 1, status: 1 });
    await Chat.collection.createIndex({ customerId: 1, createdAt: -1 });
    await User.collection.createIndex({ email: 1, isAgent: 1 });
    
    console.log('✅ Database indexes created successfully');
  } catch (error) {
    console.error('❌ Index creation error:', error);
  }
}


// ========== ORDER SCHEMA ==========
const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderReference: { type: String, required: true, unique: true },
  creatorProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CreatorProduct' }],
  items: [{
    id: String,
    title: String,
    category: String,
    price: Number,
    quantity: { type: Number, default: 1 },
    icon: String
  }],
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  couponCode: String,
  customerInfo: {
    name: String,
    email: String,
    phone: String,
    country: String
  },
  paymentInfo: {
    method: { type: String, default: 'flutterwave' },
    transactionId: String,
    transactionRef: String,
    status: { type: String, enum: ['pending', 'successful', 'failed'], default: 'pending' },
    paidAt: Date,
    verifiedAmount: { type: Number },        
    currency:       { type: String, default: 'USD' }  
  },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
  downloadLinks: [String], 
affiliateCode: { type: String, default: null },
affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Affiliate' },
hasCreatorProducts: { type: Boolean, default: false },
commissionsProcessed: { type: Boolean, default: false },
commissionsProcessedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});


orderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Order = mongoose.model('Order', orderSchema);

// ========== PAYMENT METHOD SCHEMA ==========
const paymentMethodSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true, enum: ['Visa', 'Mastercard', 'American Express', 'Discover', 'Credit Card'] },
  lastFour: { type: String, required: true },
  expiry: { type: String, required: true },
  cardholderName: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);




// ========== DOWNLOAD TRACKING SCHEMA (NEW) ==========
const downloadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  downloadedAt: { type: Date, default: Date.now },
  ipAddress: String,
  userAgent: String
});

downloadSchema.index({ userId: 1, productId: 1 });
downloadSchema.index({ downloadedAt: -1 });

const Download = mongoose.model('Download', downloadSchema);

// ========== BLOG POST SCHEMA ==========
const blogPostSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  excerpt: { type: String, required: true, maxlength: 300 },
  content: { type: String, required: true },
  featuredImage: { type: String, default: '' },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String, required: true, enum: ['Technology', 'Business', 'Tutorial', 'News', 'Product', 'Design', 'Marketing', 'Development', 'Other'] },
  tags: [{ type: String, trim: true }],
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    userEmail: String,
    comment: String,
    createdAt: { type: Date, default: Date.now },
    approved: { type: Boolean, default: false }
  }],
  metaTitle: String,
  metaDescription: String,
  metaKeywords: [String],
  publishedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

blogPostSchema.index({ status: 1 });
blogPostSchema.index({ category: 1 });
blogPostSchema.index({ publishedAt: -1 });

blogPostSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (!this.slug && this.title) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = Date.now();
  }
  next();
});

const BlogPost = mongoose.model('BlogPost', blogPostSchema);

// ──────────────────────────────────────────────────────────────────────────────
// CHAT/SUPPORT TICKET SCHEMA (NEW)
// ──────────────────────────────────────────────────────────────────────────────

const chatSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  customerId: { type: String, required: true },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  subject: { type: String, required: true },
  department: { type: String, enum: ['Sales', 'Support', 'Technical', 'Billing', 'General'], default: 'General' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: { type: String, enum: ['open', 'assigned', 'in-progress', 'resolved', 'closed'], default: 'open' },
  assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  messages: [{
    messageId: { type: String, required: true },
    sender: { type: String, enum: ['customer', 'agent', 'system'], required: true },
    senderId: String,
    senderName: String,
    message: String,
    attachments: [{
      filename: String,
      url: String,
      fileType: String,
      fileSize: Number
    }],
    timestamp: { type: Date, default: Date.now },
    read: { type: Boolean, default: false }
  }],
  tags: [String],
  rating: { type: Number, min: 1, max: 5 },
  feedback: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  closedAt: Date,
  resolvedAt: Date,
  firstResponseTime: Number, // Time in minutes
  averageResponseTime: Number, // Time in minutes
  totalMessages: { type: Number, default: 0 }
});

chatSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  this.totalMessages = this.messages.length;
  next();
});

chatSchema.index({ customerId: 1 });
chatSchema.index({ customerEmail: 1 });
chatSchema.index({ status: 1 });
chatSchema.index({ assignedAgent: 1 });
chatSchema.index({ department: 1 });
chatSchema.index({ createdAt: -1 });

const Chat = mongoose.model('Chat', chatSchema);

const supportTicketSchema = new mongoose.Schema({
  ticketId:      { type: String, required: true, unique: true },
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },
  guestEmail:    { type: String, default: null },
  assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  subject:       { type: String, required: true },
  description:   { type: String, required: true },
  priority:      { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  category:      { type: String, default: 'General' },
  status:        { type: String, enum: ['open', 'in-progress', 'resolved', 'closed'], default: 'open' },
  messages: [{
    sender:     { type: String, enum: ['customer', 'agent', 'system'], required: true },
    senderId:   { type: String, default: '' },
    senderName: { type: String, default: '' },
    message:    { type: String, default: '' },
    timestamp:  { type: Date, default: Date.now }
  }],
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null }
});
 
supportTicketSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});
 
const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
 
// Safe index creation — runs in background, never crashes server
mongoose.connection.once('open', async () => {
  try {
    await SupportTicket.collection.createIndex(
      { ticketId: 1 },
      { unique: true, sparse: true, background: true }
    ).catch(e => {
      // codes 85/86 = index already exists — fine
      if (e.code !== 85 && e.code !== 86 &&
          !e.message?.includes('already exists')) {
        console.error('SupportTicket index error:', e.message);
      }
    });
  } catch(e) {
    console.error('SupportTicket index setup (non-fatal):', e.message);
  }
});

global.SupportTicket = SupportTicket;
 
 

// ========== SYSTEM SETTINGS SCHEMA ==========
const systemSettingsSchema = new mongoose.Schema({
  // ── Identity ──────────────────────────────────────────────────
  siteName:          { type: String, default: 'UYEH TECH' },
  siteDescription:   String,
  siteUrl:           String,
  contactEmail:      String,
  supportEmail:      String,
  phone:             String,
  address:           String,
  logo:              String,
  favicon:           String,
  socialMedia: {
    facebook:  String,
    twitter:   String,
    instagram: String,
    linkedin:  String,
    youtube:   String
  },
 
  // ── Maintenance Mode ──────────────────────────────────────────
  maintenanceMode:    { type: Boolean, default: false },
  maintenanceMessage: { type: String,  default: 'We are currently performing scheduled maintenance. We\'ll be back shortly!' },
  maintenanceTitle:   { type: String,  default: 'Under Maintenance' },
  maintenanceETA:     String,   // e.g. "2 hours", "Tomorrow 9 AM"
  maintenanceBypassToken: String, // secret token to bypass maintenance as admin
 
  // Which pages are blocked during maintenance (comma-separated slugs)
  // 'all' = every page, or list: 'store,checkout,dashboard'
  maintenancePages: { type: String, default: 'all' },
 
  // ── Registration & Auth Controls ────────────────────────────
  allowRegistration:         { type: Boolean, default: true },
  requireEmailVerification:  { type: Boolean, default: true },
  allowGuestCheckout:        { type: Boolean, default: true },
 
  // ── Site Features Toggles ────────────────────────────────────
  storeEnabled:       { type: Boolean, default: true },
  blogEnabled:        { type: Boolean, default: true },
  chatEnabled:        { type: Boolean, default: true },
  creatorEnabled:     { type: Boolean, default: true },
  affiliatesEnabled:  { type: Boolean, default: true },
 
  // ── Announcement Banner ──────────────────────────────────────
  bannerEnabled:  { type: Boolean, default: false },
  bannerText:     { type: String,  default: '' },
  bannerType:     { type: String,  enum: ['info', 'success', 'warning', 'urgent'], default: 'info' },
  bannerLink:     String,
  bannerLinkText: String,
  bannerDismissible: { type: Boolean, default: true },
 
  // ── Payment Settings ────────────────────────────────────────
  paymentSettings: {
    flutterwaveEnabled: { type: Boolean, default: true },
    paystackEnabled:    { type: Boolean, default: false },
    stripeEnabled:      { type: Boolean, default: false }
  },
 
  // ── Custom CSS / Injected Code ───────────────────────────────
  customCSS:  { type: String, default: '' },
  customJS:   { type: String, default: '' },   // safe non-eval js snippets
  customHead: { type: String, default: '' },   // extra <meta> tags, scripts
 
  // ── SEO ──────────────────────────────────────────────────────
  seoTitle:       String,
  seoDescription: String,
  seoKeywords:    String,
  googleAnalyticsId:    String,
  facebookPixelId:      String,
 
  updatedAt:  { type: Date, default: Date.now },
  updatedBy:  String   // admin email who last changed settings
});
 

const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);
// ──────────────────────────────────────────────────────────────────────────────
// ANALYTICS SCHEMA
// ──────────────────────────────────────────────────────────────────────────────

const analyticsSchema = new mongoose.Schema({
  date: { type: Date, required: true, index: true },
  pageViews: { type: Number, default: 0 },
  uniqueVisitors: { type: Number, default: 0 },
  newUsers: { type: Number, default: 0 },
  orders: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 },
  chatsStarted: { type: Number, default: 0 }, // NEW
  chatsResolved: { type: Number, default: 0 }, // NEW
  topProducts: [{
    productId: String,
    productName: String,
    sales: Number
  }],
  topPages: [{
    page: String,
    views: Number
  }],
  createdAt: { type: Date, default: Date.now }
});

analyticsSchema.index({ date: -1 });

const Analytics = mongoose.model('Analytics', analyticsSchema);



// ========== COUPON SCHEMA ==========
const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discount: { type: Number, required: true, min: 0 },
  type: { type: String, enum: ['percentage', 'fixed'], required: true },
  isActive: { type: Boolean, default: true },
  usageLimit: { type: Number, default: null },
  usageCount: { type: Number, default: 0 },
  usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  expiresAt: { type: Date, default: null },
  minPurchaseAmount: { type: Number, default: 0 },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});


const Coupon = mongoose.model('Coupon', couponSchema);

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║         UYEH TECH SYSTEM STATUS MONITOR - COMPLETE INTEGRATION            ║
// ║              Fully Compatible with Your Existing Server                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/*
  ✅ INSTALLATION INSTRUCTIONS:
  
  1. This code integrates with your existing server.js file
  2. Add this AFTER all your existing schemas (around line 500)
  3. The monitoring system will automatically start when server starts
  4. Access status at: http://your-domain/api/status/current
*/

// ═════════════════════════════════════════════════════════════════════════════
// MONGODB SCHEMAS FOR STATUS MONITORING
// ═════════════════════════════════════════════════════════════════════════════

// Service Status Schema
const serviceStatusSchema = new mongoose.Schema({
  serviceKey: {
    type: String,
    required: true,
    unique: true,
    enum: ['api', 'database', 'websocket', 'email', 'storage', 'payment']
  },
  serviceName: {
    type: String,
    required: true
  },
  description: String,
  endpoint: String,
  status: {
    type: String,
    enum: ['operational', 'degraded', 'outage', 'maintenance'],
    default: 'operational'
  },
  responseTime: {
    type: Number,
    default: 0
  },
  lastChecked: {
    type: Date,
    default: Date.now
  },
  uptime: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  },
  incidentCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

const ServiceStatus = mongoose.model('ServiceStatus', serviceStatusSchema);

// Health Check History Schema
const healthCheckSchema = new mongoose.Schema({
  serviceKey: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['operational', 'degraded', 'outage'],
    required: true
  },
  responseTime: Number,
  statusCode: Number,
  errorMessage: String,
  metadata: mongoose.Schema.Types.Mixed,
  checkedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false
});

healthCheckSchema.index({ serviceKey: 1, checkedAt: -1 });
const HealthCheck = mongoose.model('HealthCheck', healthCheckSchema);

// Daily Uptime Schema
const dailyUptimeSchema = new mongoose.Schema({
  serviceKey: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  totalChecks: {
    type: Number,
    default: 0
  },
  successfulChecks: {
    type: Number,
    default: 0
  },
  uptimePercentage: {
    type: Number,
    default: 100
  },
  avgResponseTime: Number,
  maxResponseTime: Number,
  minResponseTime: Number
}, {
  timestamps: true
});

dailyUptimeSchema.index({ serviceKey: 1, date: 1 }, { unique: true });
const DailyUptime = mongoose.model('DailyUptime', dailyUptimeSchema);

// Incident Schema
const incidentSchema = new mongoose.Schema({
  incidentNumber: {
    type: String,
    required: true,
    unique: true
  },
  serviceKey: {
    type: String,
    required: true
  },
  serviceName: String,
  title: {
    type: String,
    required: true
  },
  description: String,
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['investigating', 'identified', 'monitoring', 'resolved'],
    default: 'investigating'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  resolvedAt: Date,
  updates: [{
    status: String,
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

const Incident = mongoose.model('Incident', incidentSchema);

// ═══════════════════════════════════════════════
// CREATOR/SELLER SCHEMA
// ═══════════════════════════════════════════════

const creatorSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    unique: true 
  },
  
  // Store Identity
  storeName: { type: String, required: true, unique: true, trim: true },
  storeSlug: { type: String, required: true, unique: true, lowercase: true },
  storeDescription: { type: String, maxlength: 500 },
  storeLogo: String,
  storeBanner: String,
  
  // Personal/Business Info
  businessName: String,
  businessType: { 
    type: String, 
    enum: ['individual', 'company', 'freelancer'], 
    default: 'individual' 
  },
  country: String,
  phone: String,
  website: String,
  socialLinks: {
    twitter: String,
    instagram: String,
    linkedin: String,
    youtube: String
  },
categories: [{ type: String }],

  // Application / Approval
  applicationStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'suspended'], 
    default: 'pending' 
  },
  applicationMessage: String,   // Creator's reason for joining
  rejectionReason: String,       // Admin's reason for rejection
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  approvedAt: Date,

  // Commission Settings (set by admin per creator or globally)
  platformCommissionRate: { type: Number, default: 20, min: 0, max: 100 }, // % platform takes
  affiliateCommissionRate: { type: Number, default: 10, min: 0, max: 100 }, // % affiliates earn

  // Payout Info
  payoutMethod: { 
    type: String, 
    enum: ['bank_transfer', 'paypal', 'flutterwave', 'crypto'], 
    default: 'bank_transfer' 
  },
 payoutDetails: {
  // Common
  country:       String,
  // Bank transfer
  bankName:      String,
  accountNumber: String,
  accountName:   String,
  sortCode:      String,   // UK sort code / branch code
  swift:         String,   // SWIFT/BIC for international
  iban:          String,   // Europe/UK
  routingNumber: String,   // USA ACH routing
  otherDetails:  String,   // Free text for other countries
  // PayPal
  paypalEmail:   String,
  paypalName:    String,
  // Flutterwave
  flwEmail:      String,
  flwAccount:    String,
  flwBank:       String,
  flwCountry:    String,
  // Crypto
  cryptoType:    String,   // e.g. USDT_TRC20
  cryptoAddress: String,
  cryptoName:    String,
},
  payoutThreshold: { type: Number, default: 50 }, // Minimum to request payout
  
  // Analytics
  totalProducts: { type: Number, default: 0 },
  totalSales: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },      // Raw revenue before commission
  totalEarnings: { type: Number, default: 0 },     // After platform commission
  pendingPayout: { type: Number, default: 0 },     // Awaiting withdrawal
  totalPaidOut: { type: Number, default: 0 },
  
  // Status
  isVerified: { type: Boolean, default: false },    // Verified badge
  isFeatured: { type: Boolean, default: false },
  isSuspended: { type: Boolean, default: false },
  suspensionReason: String,
  
  rating: { type: Number, default: 0, min: 0, max: 5 },
  totalRatings: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

creatorSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (!this.storeSlug && this.storeName) {
    this.storeSlug = this.storeName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

creatorSchema.index({ storeSlug: 1 });
creatorSchema.index({ applicationStatus: 1 });

const Creator = mongoose.model('Creator', creatorSchema);


// ═══════════════════════════════════════════════════════════════
// ✅ CREATOR FOLLOW SYSTEM
// ═══════════════════════════════════════════════════════════════

const followSchema = new mongoose.Schema({
  followerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  creatorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Creator', required: true },
  followedAt: { type: Date, default: Date.now }
});
followSchema.index({ followerId: 1, creatorId: 1 }, { unique: true });
const Follow = mongoose.model('Follow', followSchema);
global.Follow = Follow;

// ══════════════════════════════════════════════════════════════════════════════
// CORRECTED productSchema
// Replace your ENTIRE existing productSchema block with this one.
// The creator-related fields now appear exactly ONCE, at the bottom.
// ══════════════════════════════════════════════════════════════════════════════

const productSchema = new mongoose.Schema({

  // ── Core product fields ───────────────────────────────────────────────────
  title:          { type: String, required: true, trim: true },
  description:    { type: String, required: true },
  category:       { type: String, required: true },
  price:          { type: Number, required: true, min: 0 },
  comparePrice:   { type: Number, default: 0 },
  icon:           String,
  image:          String,
  images:         [String],
  features:       [String],

  // Download / file info
  downloadLink:   { type: String, default: '' },
  fileSize:       String,
  version:        String,
  requirements:   [String],

  // ── Product Type & Delivery Mode ─────────────────────────────────────────
  // productType drives how the product is delivered and displayed
  productType: {
    type: String,
    enum: ['download', 'course', 'software', 'music', 'template', 'script', 'component', 'ebook', 'other'],
    default: 'download'
  },

  // ── Hosted File (replaces / extends downloadLink) ────────────────────────
  // When a file is uploaded directly to Cloudinary instead of using an external link
  hostedFile: {
    publicId:     String,           // Cloudinary public_id
    secureUrl:    String,           // full Cloudinary URL (not exposed to buyers directly)
    resourceType: String,           // 'raw' | 'video' | 'image'
    bytes:        Number,
    format:       String,
    uploadedAt:   { type: Date, default: Date.now }
  },

    externalVideoUrl: { type: String, default: null },
  externalAudioUrl: { type: String, default: null },
  embedType: {
    type:    String,
    enum:    ['youtube', 'vimeo', 'soundcloud', 'dailymotion', 'gdrive', 'direct', 'unknown', null],
    default: null
  },
  embedUrl:  { type: String, default: null },
  mediaType: {
    type:    String,
    enum:    ['video', 'audio', 'file', null],
    default: null
  },
  
  // ── Preview / Demo ────────────────────────────────────────────────────────
  previewUrl:   String,             // hosted preview/demo URL (public, no auth needed)
  previewType:  {                   // how to display the preview
    type: String,
    enum: ['video', 'audio', 'image', 'iframe', 'none'],
    default: 'none'
  },

  // ── Course Structure ──────────────────────────────────────────────────────
  // Only populated when productType === 'course'
  courseData: {
    totalDuration:  Number,         // total seconds
    totalChapters:  Number,
    totalSections:  Number,
    level:          { type: String, enum: ['beginner', 'intermediate', 'advanced', 'all'], default: 'all' },
    language:       { type: String, default: 'English' },
    certificate:    { type: Boolean, default: false },
    sections: [
      {
        sectionTitle: String,
        sectionOrder: Number,
        chapters: [
          {
            chapterTitle:   String,
            chapterOrder:   Number,
            duration:       Number,      // seconds
            isFree:         { type: Boolean, default: false },  // free preview chapter
            hostedFile: {
              publicId:     String,
              secureUrl:    String,
              resourceType: String,
              bytes:        Number,
              format:       String,
            },
            externalUrl:    String,      // YouTube/Vimeo fallback
            transcript:     String,
            notes:          String,
          }
        ]
      }
    ]
  },

  // ── Music / Audio metadata ─────────────────────────────────────────────────
  audioData: {
    bpm:        Number,
    key:        String,             // e.g. "C minor"
    genre:      String,
    mood:       String,
    duration:   Number,             // seconds
    stems:      { type: Boolean, default: false },  // whether stems/tracks included
    license:    { type: String, enum: ['personal', 'commercial', 'exclusive'], default: 'personal' },
  },

  // ── Software metadata ─────────────────────────────────────────────────────
  softwareData: {
    platform:       [String],       // ['windows', 'mac', 'linux', 'web', 'android', 'ios']
    licenseType:    { type: String, enum: ['single', 'multi', 'lifetime', 'subscription'], default: 'single' },
    licenseKey:     String,         // optional: key delivered after purchase
    supportPeriod:  String,         // e.g. "6 months"
    updatePeriod:   String,
  },

  // Visibility & merchandising
  isActive:       { type: Boolean, default: true },
  isFeatured:     { type: Boolean, default: false },
  stock:          { type: Number, default: 999 },
  soldCount:      { type: Number, default: 0 },

  // Reviews
  rating:         { type: Number, default: 0, min: 0, max: 5 },
  reviewCount:    { type: Number, default: 0 },

  // Discovery
  tags:           [String],

  // SEO
  seoTitle:       String,
  seoDescription: String,
  seoKeywords:    [String],

  // ── Creator marketplace fields (declared ONCE — removed the duplicate block)
  isCreatorProduct: { type: Boolean, default: false },
  isAdminProduct:   { type: Boolean, default: true  },
  creatorId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Creator'        },
  creatorProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'CreatorProduct' },

  // Timestamps
  createdAt:      { type: Date, default: Date.now },
  updatedAt:      { type: Date, default: Date.now }
});

productSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

const Product = mongoose.model('Product', productSchema);

// ═══════════════════════════════════════════════════════════════
// CREATOR PRODUCT SCHEMA  ← THIS WAS MISSING — ADD THIS BLOCK
// ═══════════════════════════════════════════════════════════════

const creatorProductSchema = new mongoose.Schema({
  creatorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Creator', required: true },
  productId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, // set after approval
 
  // ── Core fields submitted by creator ─────────────────────────────────────
  title:          { type: String, required: true, trim: true },
  description:    { type: String, required: true },
  category:       { type: String, default: 'General' },
  suggestedPrice: { type: Number, required: true, min: 0 },
  tags:           [String],
  images:         [String],
  fileSize:       String,
  version:        String,
  features:       [String],
  requirements:   [String],
 
  // ── Product type ──────────────────────────────────────────────────────────
  productType: {
    type:    String,
    enum:    ['download', 'course', 'software', 'music', 'template', 'script', 'component', 'ebook', 'other'],
    default: 'download'
  },
 
  // ── DELIVERY: Option A — Uploaded file (Cloudinary) ──────────────────────
  // Used for: scripts, templates, PDFs, ZIPs, small files
  // NOT used for: video or audio (those use Option B below)
  downloadLink:   String,    // kept for backwards compatibility / admin products
  hostedFile: {
    publicId:     String,
    secureUrl:    String,
    resourceType: String,   // 'raw' | 'image'
    bytes:        Number,
    format:       String,
    uploadedAt:   { type: Date, default: Date.now }
  },
 
  // ── DELIVERY: Option B — External media links (Video / Audio) ─────────────
  // Used for: YouTube, Vimeo, SoundCloud, Google Drive, direct .mp4/.mp3 links
  // These are GATED — only revealed after payment is verified.
  externalVideoUrl: {
    type:    String,
    default: null
    // Example: 'https://www.youtube.com/watch?v=abc123'
  },
  externalAudioUrl: {
    type:    String,
    default: null
    // Example: 'https://soundcloud.com/artist/trackname'
  },
 
  // ── Parsed/computed embed info (auto-filled by server on save) ────────────
  embedType: {
    type:    String,
    enum:    ['youtube', 'vimeo', 'soundcloud', 'dailymotion', 'gdrive', 'direct', 'unknown', null],
    default: null
  },
  embedUrl: {
    // The ready-to-use embed URL (e.g. youtube.com/embed/ID)
    // Generated by parseExternalMediaUrl() — never set manually by creator
    type:    String,
    default: null
  },
  mediaType: {
    // 'video' | 'audio' | 'file' — drives how the product player renders
    type:    String,
    enum:    ['video', 'audio', 'file', null],
    default: null
  },
 
  // ── Preview (public, visible before purchase) ─────────────────────────────
  previewUrl:  { type: String, default: null }, // short clip or thumbnail
  previewType: {
    type:    String,
    enum:    ['video', 'audio', 'image', 'iframe', 'none'],
    default: 'none'
  },
 
  // ── Course / Audio / Software structured metadata ─────────────────────────
  courseData:   { type: mongoose.Schema.Types.Mixed, default: null },
  audioData:    { type: mongoose.Schema.Types.Mixed, default: null },
  softwareData: { type: mongoose.Schema.Types.Mixed, default: null },
 
  // ── Admin review fields ───────────────────────────────────────────────────
  status: {
    type:    String,
    enum:    ['pending_review', 'approved', 'rejected'],
    default: 'pending_review'
  },
  approvedPrice:          Number,
  platformCommission:     { type: Number, default: 20 },
  affiliateCommission:    { type: Number, default: 10 },
  creatorEarningPerSale:  Number,
  adminNotes:             String,
  rejectionReason:        String,
  approvedBy:             { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:             Date,
 
  // ── Sales tracking ────────────────────────────────────────────────────────
  totalSales:   { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
 
  submittedAt:  { type: Date, default: Date.now },
  createdAt:    { type: Date, default: Date.now },
  updatedAt:    { type: Date, default: Date.now }
});
 
creatorProductSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

creatorProductSchema.index({ creatorId: 1 });
creatorProductSchema.index({ status: 1 });
creatorProductSchema.index({ submittedAt: -1 });

const CreatorProduct = mongoose.model('CreatorProduct', creatorProductSchema);
global.CreatorProduct = CreatorProduct;
console.log('✅ CreatorProduct Model Defined');

// ═══════════════════════════════════════════════
// AFFILIATE SCHEMA
// ═══════════════════════════════════════════════

const affiliateSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    unique: true 
  },
  affiliateCode: { type: String, required: true, unique: true, uppercase: true },
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'suspended', 'pending'], 
    default: 'active' 
  },
  
  // Earnings
  totalClicks: { type: Number, default: 0 },
  totalConversions: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  pendingEarnings: { type: Number, default: 0 },
  paidEarnings: { type: Number, default: 0 },
  
  // Payout Info (same as creator)
  payoutMethod: String,
  payoutDetails: mongoose.Schema.Types.Mixed,
  payoutThreshold: { type: Number, default: 20 },
  
  createdAt: { type: Date, default: Date.now }
});

const Affiliate = mongoose.model('Affiliate', affiliateSchema);


// ═══════════════════════════════════════════════
// AFFILIATE CLICK TRACKING
// ═══════════════════════════════════════════════

const affiliateClickSchema = new mongoose.Schema({
  affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Affiliate'},
  affiliateCode: String,
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  creatorProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'CreatorProduct' },
  
  ipAddress: String,
  userAgent: String,
  referrer: String,
  
  converted: { type: Boolean, default: false },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  conversionAmount: Number,
  commissionEarned: Number,
  
  clickedAt: { type: Date, default: Date.now },
  convertedAt: Date
});

affiliateClickSchema.index({ affiliateCode: 1 });
affiliateClickSchema.index({ affiliateId: 1 });
affiliateClickSchema.index({ clickedAt: -1 });

const AffiliateClick = mongoose.model('AffiliateClick', affiliateClickSchema);


// ═══════════════════════════════════════════════
// COMMISSION / EARNINGS LEDGER
// ═══════════════════════════════════════════════

const earningsLedgerSchema = new mongoose.Schema({
  // Who earned
  recipientId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Creator or Affiliate userId
  recipientType: { type: String, enum: ['creator', 'affiliate'], required: true },
  
  // What sale triggered this
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  creatorProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'CreatorProduct' },
  
  // Amounts
  saleAmount: { type: Number, required: true },       // Full sale price
  platformCut: { type: Number, required: true },       // What platform keeps
  earningAmount: { type: Number, required: true },     // What recipient gets
  commissionRate: Number,                              // % applied
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'paid', 'reversed'], 
    default: 'pending' 
  },
  
  // Payout tracking
  payoutRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayoutRequest' },
  paidAt: Date,
  
  description: String,
  createdAt: { type: Date, default: Date.now }
});

earningsLedgerSchema.index({ recipientId: 1, status: 1 });
earningsLedgerSchema.index({ orderId: 1 });

const EarningsLedger = mongoose.model('EarningsLedger', earningsLedgerSchema);


// ═══════════════════════════════════════════════
// PAYOUT REQUESTS
// ═══════════════════════════════════════════════

const payoutRequestSchema = new mongoose.Schema({
  requesterId: { type: mongoose.Schema.Types.ObjectId, required: true },
  requesterType: { type: String, enum: ['creator', 'affiliate'], required: true },
  
  amount: { type: Number, required: true },
  payoutMethod: String,
  payoutDetails: mongoose.Schema.Types.Mixed,
  
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'rejected'], 
    default: 'pending' 
  },
  adminNotes: String,
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date,
  
  requestedAt: { type: Date, default: Date.now }
});

const PayoutRequest = mongoose.model('PayoutRequest', payoutRequestSchema);

// Schema for Access Requests
const accessRequestSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  reason: String,
  portal: { type: String, enum: ['home', 'strict'], default: 'home' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  accessCode: String,
  requestedAt: { type: Date, default: Date.now },
  processedAt: Date,
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const AccessRequest = mongoose.model('AccessRequest', accessRequestSchema);


// ═══════════════════════════════════════════════
// REGISTER GLOBALS
// ═══════════════════════════════════════════════

global.Creator = Creator;
global.Affiliate = Affiliate;
global.AffiliateClick = AffiliateClick;
global.EarningsLedger = EarningsLedger;
global.PayoutRequest = PayoutRequest;

console.log('✅ Marketplace Schemas Loaded');






// ═════════════════════════════════════════════════════════════════════════════
// INITIALIZE DEFAULT SERVICES
// ═════════════════════════════════════════════════════════════════════════════
// âœ… NEW: Simple in-memory cache for frequent queries
const cache = new Map();
const CACHE_TTL = 60000; // 1 minute
const messageCache = new Map();

function normalizeChats(chats) {
  return chats.map(chat => ({
    ...chat,
    chatId:          chat.chatId || chat._id?.toString(),
    id:              chat.chatId || chat._id?.toString(),
    status:          (chat.status || 'open').toLowerCase(),
    unreadCount:     chat.messages?.filter(m => !m.read && m.sender === 'customer').length || 0,
    lastMessage:     chat.messages?.length > 0 ? chat.messages[chat.messages.length - 1].message : '',
    lastMessageTime: chat.messages?.length > 0 ? chat.messages[chat.messages.length - 1].timestamp : chat.createdAt
  }));
}

async function initializeServices() {
  const defaultServices = [
    {
      serviceKey: 'api',
      serviceName: 'API Services',
      description: 'Backend REST API endpoints',
      endpoint: '/api/health',
      isActive: true
    },
    {
      serviceKey: 'database',
      serviceName: 'Database Services',
      description: 'MongoDB Atlas database cluster',
      endpoint: 'internal',
      isActive: true
    },
    {
      serviceKey: 'websocket',
      serviceName: 'WebSocket Services',
      description: 'Real-time chat and notifications',
      endpoint: 'internal',
      isActive: true
    },
    {
      serviceKey: 'email',
      serviceName: 'Email Services',
      description: 'RESEND email delivery service',
      endpoint: 'internal',
      isActive: true
    },
    {
      serviceKey: 'storage',
      serviceName: 'File Storage',
      description: 'File upload and storage system',
      endpoint: 'internal',
      isActive: true
    },
    {
      serviceKey: 'payment',
      serviceName: 'Payment Gateway',
      description: 'Flutterwave payment processing',
      endpoint: 'internal',
      isActive: true
    }
  ];

  try {
    for (const service of defaultServices) {
      await ServiceStatus.findOneAndUpdate(
        { serviceKey: service.serviceKey },
        service,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    console.log('✅ Default services initialized for monitoring');
  } catch (error) {
    console.error('❌ Error initializing services:', error.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

// Check API endpoint
async function checkAPIService() {
  try {
    const startTime = Date.now();
    
    // Check if server is running and can connect to DB
    const mongoState = mongoose.connection.readyState;
    const responseTime = Date.now() - startTime;

    if (mongoState === 1) {
      return {
        status: 'operational',
        responseTime,
        statusCode: 200,
        metadata: {
          uptime: process.uptime(),
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
          }
        }
      };
    } else {
      return {
        status: 'degraded',
        responseTime,
        statusCode: 503,
        errorMessage: 'Database connection unstable'
      };
    }
  } catch (error) {
    return {
      status: 'outage',
      responseTime: 0,
      statusCode: 0,
      errorMessage: error.message
    };
  }
}

// Check MongoDB database
async function checkDatabase() {
  try {
    const startTime = Date.now();
    
    // Test actual database operation
    await mongoose.connection.db.admin().ping();
    
    // Try a simple query
    await ServiceStatus.findOne().lean();
    
    const responseTime = Date.now() - startTime;

    return {
      status: 'operational',
      responseTime,
      statusCode: 200,
      metadata: {
        readyState: mongoose.connection.readyState,
        name: mongoose.connection.name,
        collections: await mongoose.connection.db.listCollections().toArray().then(c => c.length)
      }
    };
  } catch (error) {
    return {
      status: 'outage',
      responseTime: 0,
      statusCode: 0,
      errorMessage: error.message
    };
  }
}

// Check WebSocket service
function checkWebSocket() {
  try {
    // Access global wss from your server
    const wss = global.wss || (typeof wss !== 'undefined' ? wss : null);
    
    if (!wss) {
      return {
        status: 'outage',
        responseTime: 0,
        statusCode: 0,
        errorMessage: 'WebSocket server not initialized'
      };
    }

    const activeConnections = wss.clients ? wss.clients.size : 0;
    const activeChats = global.activeConnections ? global.activeConnections.size : 0;
    const agentCount = global.agentConnections ? global.agentConnections.size : 0;
    const customerCount = global.customerConnections ? global.customerConnections.size : 0;

    return {
      status: 'operational',
      responseTime: 5,
      statusCode: 200,
      metadata: {
        activeConnections,
        activeChats,
        agentCount,
        customerCount
      }
    };
  } catch (error) {
    return {
      status: 'outage',
      responseTime: 0,
      statusCode: 0,
      errorMessage: error.message
    };
  }
}

// Check Email service (RESEND)
// Check Email service (RESEND)
function checkEmail() {
  try {
    const hasApiKey = !!RESEND_API_KEY;
    
    if (hasApiKey && resend) {
      return {
        status: 'operational',
        responseTime: 10,
        statusCode: 200,
        metadata: {
          provider: 'RESEND',
          configured: true,
          sender: RESEND_SENDER_EMAIL,
          senderName: RESEND_SENDER_NAME
        }
      };
    } else {
      return {
        status: 'degraded',
        responseTime: 0,
        statusCode: 0,
        errorMessage: 'RESEND API key not configured',
        metadata: {
          provider: 'RESEND',
          configured: false
        }
      };
    }
  } catch (error) {
    return {
      status: 'outage',
      responseTime: 0,
      statusCode: 0,
      errorMessage: error.message
    };
  }
}
// Check File Storage
function checkStorage() {
  try {
    const path = require('path');
    const fs = require('fs');
    
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const exists = fs.existsSync(uploadsDir);
    
    if (exists) {
      // Check if writable
      const testFile = path.join(uploadsDir, '.health-check');
      try {
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        
        // Get directory stats
        const stats = fs.readdirSync(uploadsDir);
        
        return {
          status: 'operational',
          responseTime: 5,
          statusCode: 200,
          metadata: {
            path: uploadsDir,
            writable: true,
            filesCount: stats.length
          }
        };
      } catch (err) {
        return {
          status: 'degraded',
          responseTime: 0,
          statusCode: 0,
          errorMessage: 'Storage not writable',
          metadata: {
            path: uploadsDir,
            writable: false
          }
        };
      }
    } else {
      return {
        status: 'outage',
        responseTime: 0,
        statusCode: 0,
        errorMessage: 'Uploads directory does not exist'
      };
    }
  } catch (error) {
    return {
      status: 'outage',
      responseTime: 0,
      statusCode: 0,
      errorMessage: error.message
    };
  }
}

// Check Payment Gateway
async function checkPayment() {
  try {
    const hasSecretKey = !!process.env.FLUTTERWAVE_SECRET_KEY;
    
    if (hasSecretKey) {
      return {
        status: 'operational',
        responseTime: 15,
        statusCode: 200,
        metadata: {
          provider: 'Flutterwave',
          configured: true,
          environment: process.env.FLUTTERWAVE_SECRET_KEY.startsWith('FLWSECK_TEST') ? 'test' : 'live'
        }
      };
    } else {
      return {
        status: 'degraded',
        responseTime: 0,
        statusCode: 0,
        errorMessage: 'Flutterwave secret key not configured',
        metadata: {
          provider: 'Flutterwave',
          configured: false
        }
      };
    }
  } catch (error) {
    return {
      status: 'outage',
      responseTime: 0,
      statusCode: 0,
      errorMessage: error.message
    };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// RUN ALL HEALTH CHECKS
// ═════════════════════════════════════════════════════════════════════════════
async function runAllHealthChecks() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] 🔍 Running health checks...`);

  try {
    const services = await ServiceStatus.find({ isActive: true });

    for (const service of services) {
      let result;

      try {
        switch (service.serviceKey) {
          case 'api':
            result = await checkAPIService();
            break;
          case 'database':
            result = await checkDatabase();
            break;
          case 'websocket':
            result = checkWebSocket();
            break;
          case 'email':
            result = await checkEmail();
            break;
          case 'storage':
            result = checkStorage();
            break;
          case 'payment':
            result = await checkPayment();
            break;
          default:
            continue;
        }
      } catch (error) {
        console.error(`❌ Error checking ${service.serviceKey}:`, error.message);
        
        // 🔧 FIXED: Don't crash - just mark as degraded
        result = {
          status: 'degraded',
          responseTime: 0,
          errorMessage: error.message
        };
      }

      if (!result) continue;

      // Store health check result (wrapped in try-catch)
      try {
        await HealthCheck.create({
          serviceKey: service.serviceKey,
          status: result.status,
          responseTime: result.responseTime || 0,
          statusCode: result.statusCode || 0,
          errorMessage: result.errorMessage,
          metadata: result.metadata,
          checkedAt: new Date()
        });
      } catch (err) {
        // 🔧 FIXED: Don't crash on DB errors
        console.error(`⚠️  Could not store health check for ${service.serviceKey}:`, err.message);
      }

      // Update service status (wrapped in try-catch)
      try {
        const previousStatus = service.status;
        service.status = result.status;
        service.responseTime = result.responseTime || 0;
        service.lastChecked = new Date();
        service.metadata = result.metadata;

        // Calculate 30-day uptime
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const checks = await HealthCheck.find({
          serviceKey: service.serviceKey,
          checkedAt: { $gte: thirtyDaysAgo }
        }).lean();

        if (checks.length > 0) {
          const successfulChecks = checks.filter(c => c.status === 'operational').length;
          service.uptime = (successfulChecks / checks.length) * 100;
        }

        await service.save();

        // Create/resolve incidents (wrapped in try-catch)
        if (result.status === 'outage' && previousStatus !== 'outage') {
          try {
            await createIncident(service, result);
          } catch (incidentErr) {
            console.error('⚠️  Could not create incident:', incidentErr.message);
          }
        }

        if (result.status === 'operational' && previousStatus === 'outage') {
          try {
            await resolveIncident(service);
          } catch (incidentErr) {
            console.error('⚠️  Could not resolve incident:', incidentErr.message);
          }
        }

        const statusEmoji = result.status === 'operational' ? '✓' : 
                           result.status === 'degraded' ? '⚠' : '✗';
        console.log(`   ${statusEmoji} ${service.serviceName}: ${result.status} (${result.responseTime}ms)`);
        
      } catch (updateErr) {
        console.error(`⚠️  Could not update service ${service.serviceKey}:`, updateErr.message);
      }
    }

    console.log('✅ Health checks complete\n');
    
  } catch (error) {
    // 🔧 FIXED: Major error in health check system - don't crash server
    console.error('❌ Critical error in health check system:', error.message);
    console.log('⚠️  Health monitoring will retry in next cycle');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// INCIDENT MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

async function createIncident(service, result) {
  try {
    const incidentNumber = `INC-${Date.now()}`;

    const incident = await Incident.create({
      incidentNumber,
      serviceKey: service.serviceKey,
      serviceName: service.serviceName,
      title: `${service.serviceName} - Service Outage`,
      description: result.errorMessage || 'Service is experiencing issues',
      severity: 'high',
      status: 'investigating',
      startedAt: new Date(),
      updates: [{
        status: 'investigating',
        message: 'We are investigating reports of service disruption.',
        timestamp: new Date()
      }]
    });

    // Increment incident count
    service.incidentCount = (service.incidentCount || 0) + 1;
    await service.save();

    console.log(`🚨 NEW INCIDENT: ${incidentNumber} - ${service.serviceName}`);

    return incident;
  } catch (error) {
    console.error('❌ Error creating incident:', error.message);
  }
}

async function resolveIncident(service) {
  try {
    const incident = await Incident.findOne({
      serviceKey: service.serviceKey,
      status: { $ne: 'resolved' }
    }).sort({ startedAt: -1 });

    if (incident) {
      incident.status = 'resolved';
      incident.resolvedAt = new Date();
      incident.updates.push({
        status: 'resolved',
        message: 'Service has been restored and is operating normally.',
        timestamp: new Date()
      });

      await incident.save();
      console.log(`✅ INCIDENT RESOLVED: ${incident.incidentNumber}`);
    }
  } catch (error) {
    console.error('❌ Error resolving incident:', error.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// DAILY UPTIME CALCULATION
// ═════════════════════════════════════════════════════════════════════════════

async function calculateDailyUptime() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const services = await ServiceStatus.find({ isActive: true });

    for (const service of services) {
      const checks = await HealthCheck.find({
        serviceKey: service.serviceKey,
        checkedAt: {
          $gte: today,
          $lt: tomorrow
        }
      }).lean();

      if (checks.length === 0) continue;

      const successfulChecks = checks.filter(c => c.status === 'operational').length;
      const uptimePercentage = (successfulChecks / checks.length) * 100;

      const responseTimes = checks.map(c => c.responseTime || 0);
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);

      await DailyUptime.findOneAndUpdate(
        {
          serviceKey: service.serviceKey,
          date: today
        },
        {
          totalChecks: checks.length,
          successfulChecks,
          uptimePercentage,
          avgResponseTime,
          maxResponseTime,
          minResponseTime
        },
        { upsert: true }
      );
    }

    console.log('📊 Daily uptime calculated');
  } catch (error) {
    console.error('❌ Error calculating daily uptime:', error.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SCHEDULED TASKS
// ═════════════════════════════════════════════════════════════════════════════

let healthCheckInterval;
let dailyUptimeInterval;
let cleanupInterval;

function startMonitoring() {
  console.log('🚀 Starting system monitoring tasks...');

  // Run health checks every 60 seconds
  healthCheckInterval = setInterval(async () => {
    try {
      await runAllHealthChecks();
    } catch (error) {
      console.error('❌ Health check interval error:', error.message);
    }
  }, 60000);

  // Calculate daily uptime at midnight
  dailyUptimeInterval = setInterval(async () => {
    try {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        await calculateDailyUptime();
      }
    } catch (error) {
      console.error('❌ Daily uptime calculation error:', error.message);
    }
  }, 60000);

  // Clean up old health checks (keep 90 days) - run once per day
  cleanupInterval = setInterval(async () => {
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const result = await HealthCheck.deleteMany({
        checkedAt: { $lt: ninetyDaysAgo }
      });

      if (result.deletedCount > 0) {
        console.log(`🗑️  Cleaned up ${result.deletedCount} old health check records`);
      }
    } catch (error) {
      console.error('❌ Cleanup error:', error.message);
    }
  }, 86400000); // Once per day

  console.log('✅ Monitoring tasks started');
}

function stopMonitoring() {
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  if (dailyUptimeInterval) clearInterval(dailyUptimeInterval);
  if (cleanupInterval) clearInterval(cleanupInterval);
  console.log('⏸️  Monitoring tasks stopped');
}

// ════════════════════════════════════════════════════════════════════════════
// 🔄 MONITORING RECOVERY SYSTEM
// ════════════════════════════════════════════════════════════════════════════

let monitoringFailureCount = 0;
const MAX_MONITORING_FAILURES = 3;

// Wrapper to restart monitoring if it crashes
function startMonitoringWithRecovery() {
  try {
    startMonitoring();
    monitoringFailureCount = 0;
  } catch (error) {
    monitoringFailureCount++;
    console.error(`❌ Monitoring system failed to start (attempt ${monitoringFailureCount}):`, error.message);
    
    if (monitoringFailureCount < MAX_MONITORING_FAILURES) {
      console.log(`🔄 Retrying monitoring system in 30 seconds...`);
      setTimeout(startMonitoringWithRecovery, 30000);
    } else {
      console.error('🚨 Monitoring system permanently disabled after repeated failures');
      console.log('✅ Server will continue without monitoring');
    }
  }
}
let _monitoringRunning = false;
 
setInterval(() => {
  if (!_monitoringRunning) {
    console.log('⚠️  Monitoring detected as stopped — attempting restart...');
    try {
      startMonitoringWithRecovery();
    } catch (e) {
      console.error('❌ Monitoring restart failed:', e.message);
    }
  }
}, 5 * 60 * 1000);
 

// ═════════════════════════════════════════════════════════════════════════════
// INITIALIZE MONITORING SYSTEM
// ═════════════════════════════════════════════════════════════════════════════

async function initializeMonitoring() {
  try {
    console.log('\n🔍 Initializing System Status Monitor...');
    
    // Initialize services
    await initializeServices();
    
    // Run initial health check
    console.log('🔍 Running initial health check...');
    await runAllHealthChecks();
    
    // Start monitoring intervals
    startMonitoring();
    
    console.log('✅ System Status Monitor initialized successfully\n');
  } catch (error) {
    console.error('❌ Failed to initialize monitoring:', error.message);
  }
}







// ========== EMAIL OTP STORAGE ==========
const otpStore = new Map();

// ========== UTILITY FUNCTIONS ==========
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSlug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function generateChatId() {
  return 'CHAT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function generateMessageId() {
  return 'MSG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}


// ✅ ADD THIS — was missing, caused the crash in /api/creator/apply & /api/creator/upgrade
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

global.escapeRegex = escapeRegex;
// ═════════════════════════════════════════════════════════════════════════════
// EXPORT FOR USE IN OTHER PARTS
// ═════════════════════════════════════════════════════════════════════════════

// Models
global.User = User;
global.Order = Order;
global.PaymentMethod = PaymentMethod;
global.Coupon = Coupon;
global.Product = Product;
global.Download = Download;
global.Chat = Chat;
global.BlogPost = BlogPost;
global.SystemSettings = SystemSettings;
global.Analytics = Analytics;

// WebSocket functions
global.broadcastToChat = broadcastToChat;
global.sendToAgent = sendToAgent;
global.sendToCustomer = sendToCustomer;
global.activeConnections = activeConnections;
global.agentConnections = agentConnections;
global.customerConnections = customerConnections;
global.SupportTicket = SupportTicket;
// ── MARKETPLACE GLOBALS ──────────────────────────────────────────
global.Creator = Creator;
global.Affiliate = Affiliate;
global.AffiliateClick = AffiliateClick;
global.EarningsLedger = EarningsLedger;
global.PayoutRequest = PayoutRequest;


// Utility functions
global.generateToken = generateToken;
global.generateOTP = generateOTP;
global.generateSlug = generateSlug;
global.generateChatId = generateChatId;
global.generateMessageId = generateMessageId;
global.otpStore = otpStore;

// Configuration
global.JWT_SECRET = JWT_SECRET;
global.resend = resend;
global.RESEND_SENDER_EMAIL = RESEND_SENDER_EMAIL;
global.RESEND_SENDER_NAME = RESEND_SENDER_NAME;
global.FLUTTERWAVE_SECRET_KEY = FLUTTERWAVE_SECRET_KEY;
global.ADMIN_EMAIL = ADMIN_EMAIL;
global.BASE_URL = BASE_URL;
global.FRONTEND_URL = FRONTEND_URL; 
global.LOGO_URL = LOGO_URL;


// Express app and server
global.app = app;
global.server = server;
global.upload = upload;



console.log('\n✅ Part 1 Loaded: Schemas, Configuration & WebSocket Ready');
console.log('📦 Models: User, Order, Coupon, Product, Download, Chat, Blog, Analytics, Settings');
console.log('🔌 WebSocket: Ready for real-time chat connections\n');

function processChaptersForDelivery(courseData) {
  if (!courseData || !Array.isArray(courseData.sections)) return courseData;
 
  const processed = JSON.parse(JSON.stringify(courseData)); // deep clone
 
  processed.sections = processed.sections.map((section) => {
    section.chapters = (section.chapters || []).map((ch) => {
      // ── Parse externalUrl if embedUrl is missing ──────────────────────
      const rawUrl = ch.externalUrl || ch.embedUrl || null;
      if (rawUrl && (!ch.embedUrl || ch.embedType === 'unknown' || !ch.embedType)) {
        if (typeof parseExternalMediaUrl === 'function') {
          const parsed = parseExternalMediaUrl(rawUrl);
          if (parsed.embedType && parsed.embedType !== 'unknown') {
            ch.embedUrl  = parsed.embedUrl;
            ch.embedType = parsed.embedType;
          }
        }
      }
 
      // ── Derive playerType from embedType ──────────────────────────────
      if (ch.embedUrl && !ch.playerType) {
        const et = ch.embedType || '';
        if (['youtube','vimeo','dailymotion','gdrive'].includes(et)) {
          ch.playerType = 'iframe';
        } else if (et === 'soundcloud') {
          ch.playerType = 'soundcloud_widget';
        } else if (et === 'direct') {
          ch.playerType = 'html5_video';
        } else if (ch.hostedFile && ch.hostedFile.publicId) {
          ch.playerType = 'cloudinary';
        } else {
          ch.playerType = 'iframe';
        }
      }
 
      // ── Cloudinary-hosted chapter ─────────────────────────────────────
      // Keep hostedFile as a plain object — Mongoose Mixed doesn't need
      // re-hydration, but JSON.stringify above already handles that.
      if (ch.hostedFile && ch.hostedFile.publicId && !ch.embedUrl) {
        ch.playerType = 'cloudinary';
      }
 
      return ch;
    });
    return section;
  });
 
  return processed;
}
global.processChaptersForDelivery = processChaptersForDelivery;
 
 
/**
 * inferProductMediaType
 * Given a product-like object, determine the correct mediaType string.
 * Used both at approval time and in media-access delivery.
 */
function inferProductMediaType(p) {
  if (p.mediaType && p.mediaType !== 'unknown') return p.mediaType;
  const pt = p.productType || 'download';
  if (pt === 'course' || p.courseData?.sections?.length)      return 'course';
  if (pt === 'music')                                          return 'audio';
  if (p.externalAudioUrl && !p.externalVideoUrl)              return 'audio';
  if (p.externalVideoUrl)                                     return 'video';
  if (p.embedType === 'soundcloud')                           return 'audio';
  if (p.embedUrl || p.embedType)                              return 'video';
  if (p.hostedFile?.publicId)                                 return 'file';
  if (['download','template','script','component','ebook','software'].includes(pt)) return 'file';
  return 'file';
}
global.inferProductMediaType = inferProductMediaType;
 
 

// ═════════════════════════════════════════════════════════════════════════════
// EMAIL HEADER WITH LOGO (Reusable Component)
// ═════════════════════════════════════════════════════════════════════════════

function getEmailHeader(title) {
  return `
    <div style="
      background: linear-gradient(135deg, #00b359 0%, #00ff88 100%); 
      color: white; 
      padding: 30px 20px; 
      text-align: center; 
      border-radius: 10px 10px 0 0;
    ">
      <div style="margin-bottom: 15px;">
        <img src="${LOGO_URL}" alt="UYEH TECH" style="
          width: 80px; 
          height: 80px; 
          border-radius: 50%; 
          border: 3px solid white;
          background: #1a1a1a;
          padding: 10px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        ">
      </div>
      <h1 style="
        font-size: 24px; 
        margin: 15px 0 5px 0;
        font-weight: bold;
      ">${title}</h1>
      <div style="
        font-size: 14px; 
        opacity: 0.9;
        letter-spacing: 1px;
      ">UYEH TECH</div>
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════════════════════
// SEND EMAIL OTP (Verification & Password Reset)
// ═════════════════════════════════════════════════════════════════════════════


async function sendEmailOTP(to, otp, purpose = 'verification') {
    const startTime = Date.now(); // ✅ Track timing
  
  try {
    // ✅ ALWAYS log OTP prominently regardless of email success/failure
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║           📧 OTP CODE DISPATCHED          ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  To      : ${to}`);
    console.log(`║  Purpose : ${purpose}`);
    console.log(`║  Code    : ${otp}`);
    console.log(`║  Expires : 10 minutes`);
    console.log(`║  Time    : ${new Date().toISOString()}`);
    console.log('╚══════════════════════════════════════════╝\n');

    let subject, htmlBody;
   
    if (purpose === 'verification') {
      subject = '🔐 Verify Your Email - UYEH TECH';
      htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%); padding: 40px 20px; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 255, 136, 0.15); border: 1px solid #2a2a2a; }
    .header { background: linear-gradient(135deg, #00ff88 0%, #00b359 100%); padding: 40px 30px; text-align: center; }
    .logo { width: 80px; height: 80px; background: #0a0a0a; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 10px 30px rgba(0, 255, 136, 0.3); border: 3px solid #00ff88; margin-bottom: 15px; }
    .logo-text { font-size: 32px; font-weight: bold; color: #00ff88; font-family: Arial Black, sans-serif; }
    .company { font-size: 24px; font-weight: bold; color: #0a0a0a; letter-spacing: 2px; text-transform: uppercase; }
    .body { padding: 40px 30px; background: #0a0a0a; color: #ffffff; }
    .title { font-size: 28px; font-weight: bold; color: #00ff88; margin-bottom: 20px; text-align: center; }
    .content p { margin-bottom: 15px; font-size: 16px; color: #ffffff; }
    .otp-box { background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%); border: 2px dashed #00ff88; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; box-shadow: 0 0 30px rgba(0, 255, 136, 0.2); }
    .otp-label { font-size: 14px; color: #a0a0a0; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
    .otp-code { font-size: 48px; font-weight: bold; color: #00ff88; letter-spacing: 8px; font-family: 'Courier New', monospace; text-shadow: 0 0 20px rgba(0, 255, 136, 0.5); }
    .otp-timer { font-size: 13px; color: #a0a0a0; margin-top: 15px; }
    .alert-box { background: #1a1a1a; border-left: 4px solid #00ff88; padding: 20px; margin: 25px 0; border-radius: 8px; }
    .alert-box p { margin: 0; color: #ffffff; }
    .footer { background: #1a1a1a; padding: 30px; text-align: center; border-top: 1px solid #2a2a2a; }
    .footer-text { font-size: 13px; color: #a0a0a0; margin: 8px 0; }
    .footer-link { color: #00ff88; text-decoration: none; }
    @media only screen and (max-width: 600px) { .otp-code { font-size: 36px; letter-spacing: 4px; } }
  </style>
</head>
<body>
  <div class="container">
    ${getEmailHeader(subject)}
    
    <div class="body">
      <h2 class="title">🔐 Email Verification</h2>
      
      <div class="content">
        <p>Hello,</p>
        <p>Thank you for signing up with UYEH TECH! We're excited to have you on board.</p>
        <p>Please use the verification code below to complete your registration:</p>
      </div>
      
      <div class="otp-box">
        <div class="otp-label">Your Verification Code</div>
        <div class="otp-code">${otp}</div>
        <div class="otp-timer">⏱️ Code expires in 10 minutes</div>
      </div>
      
      <div class="alert-box">
        <p><strong>🛡️ Security Tip:</strong> Never share this code with anyone. UYEH TECH will never ask for your verification code via phone or email.</p>
      </div>
      
      <div class="content">
        <p>If you didn't request this verification code, please ignore this email or contact our support team.</p>
        <p style="margin-top: 30px;">Best regards,<br><strong style="color: #00ff88;">The UYEH TECH Team</strong></p>
      </div>
    </div>
    
    <div class="footer">
            <img src="${LOGO_URL}" alt="UYEH TECH" style="width: 40px; height: 40px; margin-bottom: 10px; opacity: 0.7;">
            <p style="margin: 5px 0;">© ${new Date().getFullYear()} UYEH TECH. All rights reserved.</p>
            <p style="margin: 5px 0;">This is an automated message, please do not reply.</p>
          </div>
  </div>
</body>
</html>
      `;
    } else if (purpose === 'password-reset') {
      subject = '🔒 Password Reset Code - UYEH TECH';
      htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%); padding: 40px 20px; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 255, 136, 0.15); border: 1px solid #2a2a2a; }
    .header { background: linear-gradient(135deg, #00ff88 0%, #00b359 100%); padding: 40px 30px; text-align: center; }
    .logo { width: 80px; height: 80px; background: #0a0a0a; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 10px 30px rgba(0, 255, 136, 0.3); border: 3px solid #00ff88; margin-bottom: 15px; }
    .logo-text { font-size: 32px; font-weight: bold; color: #00ff88; font-family: Arial Black, sans-serif; }
    .company { font-size: 24px; font-weight: bold; color: #0a0a0a; letter-spacing: 2px; text-transform: uppercase; }
    .body { padding: 40px 30px; background: #0a0a0a; color: #ffffff; }
    .title { font-size: 28px; font-weight: bold; color: #00ff88; margin-bottom: 20px; text-align: center; }
    .content p { margin-bottom: 15px; font-size: 16px; color: #ffffff; }
    .otp-box { background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%); border: 2px dashed #00ff88; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; box-shadow: 0 0 30px rgba(0, 255, 136, 0.2); }
    .otp-label { font-size: 14px; color: #a0a0a0; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
    .otp-code { font-size: 48px; font-weight: bold; color: #00ff88; letter-spacing: 8px; font-family: 'Courier New', monospace; text-shadow: 0 0 20px rgba(0, 255, 136, 0.5); }
    .otp-timer { font-size: 13px; color: #a0a0a0; margin-top: 15px; }
    .warning-box { background: rgba(255, 59, 59, 0.1); border-left: 4px solid #ff3b3b; padding: 20px; margin: 25px 0; border-radius: 8px; }
    .warning-box p { margin: 0; color: #ff3b3b; font-weight: bold; }
    .footer { background: #1a1a1a; padding: 30px; text-align: center; border-top: 1px solid #2a2a2a; }
    .footer-text { font-size: 13px; color: #a0a0a0; margin: 8px 0; }
    .footer-link { color: #00ff88; text-decoration: none; }
    @media only screen and (max-width: 600px) { .otp-code { font-size: 36px; letter-spacing: 4px; } }
  </style>
</head>
<body>
  <div class="container">
   ${getEmailHeader(subject)}
    
    <div class="body">
      <h2 class="title">🔒 Password Reset Request</h2>
      
      <div class="content">
        <p>Hello,</p>
        <p>We received a request to reset your password for your UYEH TECH account.</p>
        <p>Use the code below to reset your password:</p>
      </div>
      
      <div class="otp-box">
        <div class="otp-label">Password Reset Code</div>
        <div class="otp-code">${otp}</div>
        <div class="otp-timer">⏱️ Code expires in 10 minutes</div>
      </div>
      
      <div class="warning-box">
        <p>⚠️ SECURITY ALERT: If you didn't request a password reset, please ignore this email and ensure your account is secure.</p>
      </div>
      
      <div class="content">
        <p>After entering the code, you'll be able to create a new password for your account.</p>
        <p style="margin-top: 30px;">Stay secure,<br><strong style="color: #00ff88;">UYEH TECH Security Team</strong></p>
      </div>
    </div>
    
    <div class="footer">
     <img src="${LOGO_URL}" alt="UYEH TECH" style="width: 40px; height: 40px; margin-bottom: 10px; opacity: 0.7;">
      <p class="footer-text">© ${new Date().getFullYear()} UYEH TECH. All rights reserved.</p>
      <p class="footer-text">Need help? Contact us at <a href="mailto:uyehtech@gmail.com" class="footer-link">uyehtech@gmail.com</a></p>
    </div>
  </div>
</body>
</html>
      `;
    }

    try {
      const { data, error } = await resend.emails.send({
        from: `${RESEND_SENDER_NAME} <${RESEND_SENDER_EMAIL}>`,
        to: [to],
        subject: subject,
        html: htmlBody
      });

      if (error) {
        console.error('❌ Resend error:', error);
        console.log(`📧 OTP for ${to}: ${otp}`);
        return { success: true, method: 'console_log', otp };
      }
     
      console.log('✅ Email sent via Resend (UYEH TECH branded)');
      console.log('📬 Email ID:', data.id);
      return { success: true, method: 'resend_email', data };
     
    } catch (resendError) {
      console.error('❌ Resend error:', resendError.message);
      console.log(`📧 OTP for ${to}: ${otp}`);
      return { success: true, method: 'console_log', otp };
    }
   
  } catch (error) {
    console.error('❌ Send Email Error:', error);
    console.log(`📧 OTP for ${to}: ${otp}`);
    return { success: false, error: error.message, otp };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ✅ FUNCTION 2: SEND ORDER CONFIRMATION EMAIL
// ═════════════════════════════════════════════════════════════════════════════
async function sendOrderConfirmationEmail(to, orderData) {
  try {
    if (!resend || !RESEND_API_KEY) {
      console.log(`📧 Order confirmation for ${to}: ${orderData.orderReference}`);
      return { success: true, method: 'console_log' };
    }
   
    const subject = `Order Receipt - ${orderData.orderReference}`;
    
    // Calculate tax and subtotal
    const subtotal = orderData.subtotal || orderData.total;
    const discount = orderData.discount || 0;
    const tax = 0; // Add tax calculation if needed
    const total = orderData.total;
    
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f4f4f4; }
          .header { 
            background: linear-gradient(135deg, #00b359 0%, #00ff88 100%); 
            color: white; 
            padding: 30px; 
            text-align: center; 
            border-radius: 10px 10px 0 0; 
          }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
          .receipt-box { 
            background: #f8f9fa; 
            border: 2px solid #00b359;
            border-radius: 8px; 
            padding: 20px; 
            margin: 20px 0; 
          }
          .receipt-header { 
            font-size: 20px; 
            font-weight: bold; 
            color: #00b359; 
            margin-bottom: 20px;
            text-align: center;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .order-info {
            background: white;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 15px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: bold;
            color: #666;
          }
          .info-value {
            color: #333;
          }
          .items-table {
            width: 100%;
            margin: 20px 0;
            border-collapse: collapse;
          }
          .items-table th {
            background: #00b359;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: bold;
          }
          .items-table td {
            padding: 12px;
            border-bottom: 1px solid #e9ecef;
          }
          .items-table tr:last-child td {
            border-bottom: none;
          }
          .item-name {
            font-weight: bold;
            color: #333;
          }
          .totals-section {
            background: white;
            padding: 15px;
            border-radius: 5px;
            margin-top: 20px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 14px;
          }
          .total-row.grand-total {
            border-top: 2px solid #00b359;
            margin-top: 10px;
            padding-top: 15px;
            font-size: 18px;
            font-weight: bold;
            color: #00b359;
          }
          .discount-row {
            color: #dc3545;
            font-weight: bold;
          }
          .view-order-btn {
            display: inline-block;
            background: linear-gradient(135deg, #00b359 0%, #00ff88 100%);
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 8px;
            margin: 20px 0;
            font-weight: bold;
            text-align: center;
          }
          .footer { 
            background: #f5f5f5; 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #666; 
            border-radius: 0 0 10px 10px; 
          }
          .thank-you {
            background: #d4edda;
            border-left: 4px solid #28a745;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${getEmailHeader('🎉 Payment Successful!')}

          <div class="content">
            <h2>Thank you for your purchase, ${orderData.customerInfo?.name || 'Valued Customer'}!</h2>
            <p>Your payment has been processed successfully. Here's your receipt:</p>
            
            <div class="receipt-box">
              <div class="receipt-header">📄 Order Receipt</div>
              
              <div class="order-info">
                <div class="info-row">
                  <span class="info-label">Order Number:</span>
                  <span class="info-value"><strong>${orderData.orderReference}</strong></span>
                </div>
                <div class="info-row">
                  <span class="info-label">Date:</span>
                  <span class="info-value">${new Date(orderData.createdAt || Date.now()).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Customer:</span>
                  <span class="info-value">${orderData.customerInfo?.name || 'N/A'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Email:</span>
                  <span class="info-value">${orderData.customerInfo?.email || to}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Payment Method:</span>
                  <span class="info-value">Flutterwave</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Status:</span>
                  <span class="info-value" style="color: #28a745; font-weight: bold;">✓ PAID</span>
                </div>
              </div>
              
              <table class="items-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style="text-align: right;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${orderData.items.map(item => `
                    <tr>
                      <td>
                        <div class="item-name">${item.title}</div>
                        <div style="font-size: 12px; color: #666;">${item.category || 'Digital Product'}</div>
                      </td>
                      <td style="text-align: right; font-weight: bold; color: #00b359;">$${item.price.toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              
              <div class="totals-section">
                <div class="total-row">
                  <span>Subtotal:</span>
                  <span>$${subtotal.toFixed(2)}</span>
                </div>
                ${discount > 0 ? `
                <div class="total-row discount-row">
                  <span>Discount${orderData.couponCode ? ` (${orderData.couponCode})` : ''}:</span>
                  <span>-$${discount.toFixed(2)}</span>
                </div>
                ` : ''}
                ${tax > 0 ? `
                <div class="total-row">
                  <span>Tax:</span>
                  <span>$${tax.toFixed(2)}</span>
                </div>
                ` : ''}
                <div class="total-row grand-total">
                  <span>Total Paid:</span>
                  <span>$${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
            
            <div class="thank-you">
              <strong>✨ Your digital products are ready!</strong><br>
              Access your downloads from your dashboard anytime.
            </div>
            
            <p style="text-align: center;">
              <a href="${FRONTEND_URL}/dashboard/downloads" class="view-order-btn">
                📥 View Your Products
              </a>
            </p>
            
            <p>If you have any questions about your order, please don't hesitate to contact us.</p>
            
            <p>Best regards,<br><strong>UYEH TECH Team</strong></p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} UYEH TECH. All rights reserved.</p>
            <p>Need help? Contact us at ${RESEND_SENDER_EMAIL}</p>
            <p style="margin-top: 10px; font-size: 11px; color: #999;">
              Order Reference: ${orderData.orderReference}<br>
              This is your official receipt. Please keep it for your records.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const { data, error } = await resend.emails.send({
        from: `${RESEND_SENDER_NAME} <${RESEND_SENDER_EMAIL}>`,
        to: [to],
        subject: subject,
        html: htmlBody
      });

      if (error) {
        console.error('❌ Resend error:', error);
        console.log(`📧 Order confirmation logged: ${orderData.orderReference}`);
        return { success: true, method: 'console_log' };
      }
     
      console.log('✅ Order confirmation sent via Resend');
      console.log('📬 Email ID:', data.id);
      return { success: true, method: 'resend_email', data };
     
    } catch (resendError) {
      console.error('❌ Resend error:', resendError.message);
      console.log(`📧 Order confirmation logged: ${orderData.orderReference}`);
      return { success: true, method: 'console_log' };
    }
   
  } catch (error) {
    console.error('❌ Send confirmation error:', error);
    return { success: false, error: error.message };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ✅ FUNCTION 3: SEND AGENT ASSIGNMENT EMAIL
// ═════════════════════════════════════════════════════════════════════════════
// REPLACE your existing sendAgentAssignmentEmail function with this:

async function sendAgentAssignmentEmail(agentEmail, chatInfo) {
  try {
    if (!resend || !RESEND_API_KEY) {
      console.log(`📧 Agent assignment notification: ${chatInfo.chatId} (Email service disabled)`);
      return { success: true, method: 'console_log' };
    }
   
    const subject = `👨‍💼 New Chat Assignment - ${chatInfo.chatId}`;
    
    // Priority badge styling
    const priorityColors = {
      urgent: { bg: '#ff3b3b', text: '#ffffff' },
      high: { bg: '#ff8c00', text: '#ffffff' },
      medium: { bg: '#ffd700', text: '#0a0a0a' },
      low: { bg: '#00ff88', text: '#0a0a0a' }
    };
    
    const priority = chatInfo.priority?.toLowerCase() || 'medium';
    const priorityColor = priorityColors[priority];
    
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%); padding: 40px 20px; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 255, 136, 0.15); border: 1px solid #2a2a2a; }
    .header { background: linear-gradient(135deg, #00ff88 0%, #00b359 100%); padding: 40px 30px; text-align: center; }
    .logo { width: 80px; height: 80px; background: #0a0a0a; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 10px 30px rgba(0, 255, 136, 0.3); border: 3px solid #00ff88; margin-bottom: 15px; }
    .logo-text { font-size: 32px; font-weight: bold; color: #00ff88; font-family: Arial Black, sans-serif; }
    .company { font-size: 24px; font-weight: bold; color: #0a0a0a; letter-spacing: 2px; text-transform: uppercase; }
    .body { padding: 40px 30px; background: #0a0a0a; color: #ffffff; }
    .title { font-size: 28px; font-weight: bold; color: #00ff88; margin-bottom: 20px; text-align: center; }
    .content p { margin-bottom: 15px; font-size: 16px; color: #ffffff; }
    .info-card { background: #1a1a1a; border-radius: 10px; padding: 20px; margin: 20px 0; border: 1px solid #00ff88; }
    .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #2a2a2a; }
    .info-row:last-child { border-bottom: none; }
    .priority-badge { display: inline-block; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; background: ${priorityColor.bg}; color: ${priorityColor.text}; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #00ff88 0%, #00b359 100%); color: #0a0a0a; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 10px 30px rgba(0, 255, 136, 0.3); }
    .alert-box { background: #1a1a1a; border-left: 4px solid #00ff88; padding: 20px; margin: 25px 0; border-radius: 8px; }
    .footer { background: #1a1a1a; padding: 30px; text-align: center; border-top: 1px solid #2a2a2a; }
    .footer-text { font-size: 13px; color: #a0a0a0; margin: 8px 0; }
    .footer-link { color: #00ff88; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
   ${getEmailHeader('👨‍💼 New Chat Assignment')}
   
    <div class="body">
      <h2 class="title">👨‍💼 New Chat Assignment</h2>
      
      <div class="content">
        <p>Hello Agent,</p>
        <p>A new support chat has been assigned to you. Please review the details below and respond as soon as possible:</p>
      </div>
      
      <div class="info-card">
        <div class="info-row">
          <span style="color: #a0a0a0; font-size: 14px;">Chat ID</span>
          <span style="color: #00ff88; font-weight: bold; font-size: 14px;">${chatInfo.chatId}</span>
        </div>
        <div class="info-row">
          <span style="color: #a0a0a0; font-size: 14px;">Customer</span>
          <span style="color: #00ff88; font-weight: bold; font-size: 14px;">${chatInfo.customerName}</span>
        </div>
        <div class="info-row">
          <span style="color: #a0a0a0; font-size: 14px;">Subject</span>
          <span style="color: #00ff88; font-weight: bold; font-size: 14px;">${chatInfo.subject}</span>
        </div>
        <div class="info-row">
          <span style="color: #a0a0a0; font-size: 14px;">Department</span>
          <span style="color: #00ff88; font-weight: bold; font-size: 14px;">${chatInfo.department}</span>
        </div>
        <div class="info-row">
          <span style="color: #a0a0a0; font-size: 14px;">Priority</span>
          <span><span class="priority-badge">${chatInfo.priority?.toUpperCase() || 'MEDIUM'}</span></span>
        </div>
        <div class="info-row">
          <span style="color: #a0a0a0; font-size: 14px;">Assigned</span>
          <span style="color: #00ff88; font-weight: bold; font-size: 14px;">${new Date().toLocaleString()}</span>
        </div>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${FRONTEND_URL}/super-admin/agent-dashboard" class="cta-button">💬 Open Agent Dashboard</a>
      </div>
      
      <div class="alert-box">
        <p style="margin: 0; color: #ffffff;"><strong>⚡ Quick Response:</strong> Customers expect a response within 5 minutes. Please log in to the Agent Dashboard to assist the customer.</p>
      </div>
      
      <div class="content">
        <p>Remember to maintain our high standards of customer service and professionalism.</p>
        <p style="margin-top: 30px;">Good luck,<br><strong style="color: #00ff88;">UYEH TECH Support System</strong></p>
      </div>
    </div>
    
    <div class="footer">
      <p class="footer-text">© ${new Date().getFullYear()} UYEH TECH. All rights reserved.</p>
      <p class="footer-text">This is an automated notification from the support system.</p>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const { data, error } = await resend.emails.send({
        from: `${RESEND_SENDER_NAME} Support <${RESEND_SENDER_EMAIL}>`,
        to: [agentEmail],
        subject: subject,
        html: htmlBody
      });

      if (error) {
        console.error('❌ Resend error:', error);
        console.log(`📧 Agent assignment logged (Resend failed)`);
        return { success: true, method: 'console_log' };
      }
     
      console.log('✅ Agent assignment email sent (UYEH TECH branded)');
      console.log('📬 Email ID:', data.id);
      return { success: true, method: 'resend_email', data };
     
    } catch (resendError) {
      console.error('❌ Resend error:', resendError.message);
      console.log(`📧 Agent assignment logged (Resend failed)`);
      return { success: true, method: 'console_log' };
    }
   
  } catch (error) {
    console.error('❌ Send agent assignment error:', error);
    return { success: false, error: error.message };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ✅ UPDATE GLOBAL EXPORTS
// ═════════════════════════════════════════════════════════════════════════════
// ADD/UPDATE these lines at the end of your email functions section:

global.sendEmailOTP = sendEmailOTP;
global.sendOrderConfirmationEmail = sendOrderConfirmationEmail;
global.sendAgentAssignmentEmail = sendAgentAssignmentEmail;

console.log('✅ UYEH TECH Branded Email Templates Loaded');
console.log('🎨 Theme: Professional Green (#00ff88) & Black');


// ========== MIDDLEWARE: AUTHENTICATE TOKEN ==========
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}
 

// ========== MIDDLEWARE: AUTHENTICATE ADMIN ==========
async function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }

    try {
      const user = await User.findById(decoded.userId);
      
      if (!user || !user.isAdmin) {
        return res.status(403).json({ 
          success: false, 
          message: 'Admin access required',
          isAdmin: false 
        });
      }

      req.user = decoded;
      req.adminUser = user;
      next();
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Auth failed' });
    }
  });
}
// Authenticate Agent
async function authenticateAgent(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Agent token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }

    try {
      const user = await User.findById(decoded.userId);
      
      if (!user || (!user.isAgent && !user.isAdmin)) {
        return res.status(403).json({ 
          success: false, 
          message: 'Agent access required',
          isAgent: false 
        });
      }

      // Update agent status
      if (user.isAgent) {
        user.lastActivity = new Date();
        await user.save();
      }

      req.user = decoded;
      req.agentUser = user;
      next();
    } catch (error) {
      console.error('❌ Agent auth error:', error);
      return res.status(500).json({ success: false, message: 'Authentication failed' });
    }
  });
}

// Export middleware
global.authenticateToken = authenticateToken;
global.authenticateAdmin = authenticateAdmin;
global.authenticateAgent = authenticateAgent;

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: safely cast a string to ObjectId, returns null on invalid input
// ─────────────────────────────────────────────────────────────────────────────
function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
}

const postLikeIPs = new Map(); // Map<postId, Set<ip>>
 
function hasLiked(postId, ip) {
  return postLikeIPs.has(postId) && postLikeIPs.get(postId).has(ip);
}
function recordLike(postId, ip) {
  if (!postLikeIPs.has(postId)) postLikeIPs.set(postId, new Set());
  postLikeIPs.get(postId).add(ip);
}
 
// ─── helper: resolve real client IP ───
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket.remoteAddress ||
    'unknown'
  );
}
 
// ═══════════════════════════════════════════════════════════════
// ✅ CREATOR MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

async function authenticateCreator(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }

    try {
      const user = await User.findById(decoded.userId);

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const creator = await Creator.findOne({
        userId: decoded.userId,
        applicationStatus: 'approved',
        isSuspended: false
      });

      if (!creator) {
        return res.status(403).json({
          success: false,
          message: 'Approved creator account required',
          isCreator: false
        });
      }

      req.user = decoded;
      req.creatorUser = user;
      req.creator = creator;
      next();

    } catch (error) {
      console.error('❌ Creator auth error:', error);
      return res.status(500).json({ success: false, message: 'Authentication failed' });
    }
  });
}

global.authenticateCreator = authenticateCreator;
console.log('✅ Creator Middleware Loaded');

// ════════════════════════════════════════════════════════════════════════════
// 🏠 ROOT & HEALTH CHECK ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/config/public', (req, res) => {
  res.json({
    success: true,
    FRONTEND_URL: process.env.FRONTEND_URL || 'https://uyehtech.com'
  });
});


app.post('/api/upload/image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const url = await uploadToCloudinary(
      req.file.buffer,
      req.file.mimetype,
      'uyehtech/profiles'
    );

    res.json({ success: true, url });
  } catch (error) {
    console.error('❌ Image upload error:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCT FILE UPLOAD ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Upload a product's main deliverable file (admin)
// Accepts: ZIPs, PDFs, audio, video, executables, docs
app.post('/api/upload/product-file', authenticateAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const folder = 'uyehtech/product-files';
    const result = await uploadToCloudinary(req.file.buffer, req.file.mimetype, folder);

    res.json({
      success: true,
      message: 'Product file uploaded',
      file: {
        publicId:     result.publicId,
        secureUrl:    result.secureUrl,
        resourceType: result.resourceType,
        bytes:        result.bytes,
        format:       result.format,
        fileSizeLabel: formatBytes(result.bytes),
      }
    });
  } catch (error) {
    console.error('❌ Product file upload error:', error);
    res.status(500).json({ success: false, message: 'File upload failed', error: error.message });
  }
});

// Upload a product's main deliverable file (creator — for creator products)
app.post('/api/upload/creator-product-file', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
 
    // ── Safety net: reject video/audio even if fileFilter missed it ──────────
    const VIDEO_AUDIO_MIMES = [
      'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac',
      'audio/x-wav', 'audio/x-flac'
    ];
    if (VIDEO_AUDIO_MIMES.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message:
          'Video and audio files cannot be uploaded to storage. ' +
          'Please paste an external link (YouTube, Vimeo, SoundCloud, Google Drive) when submitting your product.'
      });
    }
 
    const creator = await Creator.findOne({ userId: req.user.userId });
    if (!creator) return res.status(403).json({ success: false, message: 'Creator account required' });
    if (creator.applicationStatus !== 'approved') {
      return res.status(403).json({ success: false, message: 'Creator account must be approved' });
    }
 
    const folder = `uyehtech/creator-products/${creator._id}`;
    const result = await uploadToCloudinary(req.file.buffer, req.file.mimetype, folder);
 
    res.json({
      success:  true,
      message:  'File uploaded successfully',
      file: {
        publicId:      result.publicId,
        secureUrl:     result.secureUrl,
        resourceType:  result.resourceType,
        bytes:         result.bytes,
        format:        result.format,
        fileSizeLabel: formatBytes(result.bytes),
      }
    });
  } catch (error) {
    // Multer fileFilter error comes through here
    if (error.message && error.message.includes('Video and audio')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('❌ Creator product file upload error:', error);
    res.status(500).json({ success: false, message: 'File upload failed', error: error.message });
  }
});
 

// Upload a preview file (short clip, demo image, sample audio — publicly accessible)
app.post('/api/upload/product-preview', authenticateToken, upload.single('preview'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No preview file uploaded' });

    const folder = 'uyehtech/product-previews';
    const result = await uploadToCloudinary(req.file.buffer, req.file.mimetype, folder);

    res.json({
      success: true,
      message: 'Preview uploaded',
      previewUrl:  result.secureUrl,
      previewType: result.resourceType === 'video' ? 'video'
                 : result.resourceType === 'image' ? 'image'
                 : 'none'
    });
  } catch (error) {
    console.error('❌ Preview upload error:', error);
    res.status(500).json({ success: false, message: 'Preview upload failed' });
  }
});

// Upload a single course chapter video/doc
app.post('/api/upload/course-chapter', authenticateToken, upload.single('chapter'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const creator = await Creator.findOne({ userId: req.user.userId });
    // Allow both admins and approved creators
    const isAdmin = req.user?.isAdmin;
    if (!isAdmin && (!creator || creator.applicationStatus !== 'approved')) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const creatorId = creator?._id || 'admin';
    const folder = `uyehtech/courses/${creatorId}/chapters`;
    const result = await uploadToCloudinary(req.file.buffer, req.file.mimetype, folder);

    res.json({
      success: true,
      message: 'Chapter uploaded',
      chapter: {
        publicId:     result.publicId,
        secureUrl:    result.secureUrl,
        resourceType: result.resourceType,
        bytes:        result.bytes,
        format:       result.format,
        duration:     result.duration,
      }
    });
  } catch (error) {
    console.error('❌ Course chapter upload error:', error);
    res.status(500).json({ success: false, message: 'Chapter upload failed' });
  }
});

// Helper: human-readable file size
function formatBytes(bytes) {
  if (!bytes) return 'Unknown';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

app.get('/', (req, res) => {
  res.json({
    message: '🚀 UYEH TECH API v6.0 - Admin Dashboard + Downloads',
    version: '7.0.0',
    status: 'active',
    adminEmail: ADMIN_EMAIL,
    features: [
      '✅ Complete Admin Dashboard',
      '✅ Real-time Chat System with WebSocket',
      '✅ Agent Dashboard & Management',
      '✅ Support Ticket System',
      '✅ File Upload Support',
      '✅ Download Link Management',
      '✅ Download Tracking & Analytics',
      '✅ User Management',
      '✅ Order Management',
      '✅ Coupon System',
      '✅ Blog Management',
      '✅ Product Management',
      '✅ System Settings',
      '✅ Payment Integration (Flutterwave)',
      '✅ Email Notifications (Resend)'
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: require('mongoose').connection.readyState === 1 ? 'connected' : 'disconnected',
    websocket: {
      active: wss.clients.size,
      chats: activeConnections.size,
      agents: agentConnections.size,
      customers: customerConnections.size
    }
  });
});


// ========== AUTH ROUTES ==========
app.post('/api/auth/send-email-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const otp = generateOTP();
   
    otpStore.set(cleanEmail, {
      code: otp,
      expires: Date.now() + 10 * 60 * 1000,
      attempts: 0
    });

    await sendEmailOTP(cleanEmail, otp, 'verification');

    res.json({
      success: true,
      message: 'Verification code sent',
      email: cleanEmail,
      ...(process.env.NODE_ENV === 'development' && { debug_otp: otp })
    });
  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to send code' });
  }
});

app.post('/api/auth/verify-email-otp', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'Email and code required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const storedOTP = otpStore.get(cleanEmail);

    if (!storedOTP) {
      return res.status(400).json({ success: false, message: 'No code found' });
    }

    if (Date.now() > storedOTP.expires) {
      otpStore.delete(cleanEmail);
      return res.status(400).json({ success: false, message: 'Code expired' });
    }

    if (storedOTP.attempts >= 5) {
      otpStore.delete(cleanEmail);
      return res.status(400).json({ success: false, message: 'Too many attempts' });
    }

    if (storedOTP.code !== code) {
      storedOTP.attempts += 1;
      otpStore.set(cleanEmail, storedOTP);
      return res.status(400).json({ success: false, message: 'Invalid code' });
    }

    otpStore.delete(cleanEmail);
    res.json({ success: true, message: 'Email verified' });
  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {

    // ── Check if registration is allowed ──
    const siteSettings = await SystemSettings.findOne().lean();
    if (siteSettings && siteSettings.allowRegistration === false) {
      return res.status(403).json({ success: false, message: 'New registrations are currently closed.' });
    }

    const { fullName, email, password, emailVerified } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }

    if (!emailVerified) {
      return res.status(400).json({ success: false, message: 'Verify email first' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be 8+ characters' });
    }
 // Check email verification requirement from settings
    const requireVerif = !siteSettings || siteSettings.requireEmailVerification !== false;
    if (requireVerif && !emailVerified) {
      return res.status(400).json({ success: false, message: 'Verify email first' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      fullName,
      email: email.toLowerCase(),
      password: hashedPassword,
      emailVerified: true
    });

    await user.save();

    const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: user._id,
        name: user.fullName,
        email: user.email,
        isAdmin: user.isAdmin,
        isCreator: user.isCreator || false
      }
    });
  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({ success: false, message: 'Signup failed' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 🔑 USER LOGIN (🔧 FIXED - Returns fullName + emailVerified)
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await global.User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.isBanned) {
      return res.status(403).json({ 
        success: false, 
        message: `Account is banned. Reason: ${user.banReason || 'Please contact support'}` 
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    user.lastLogin = new Date();
    user.lastActivity = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email }, 
      global.JWT_SECRET, 
      { expiresIn: '7d' }
    );

    console.log(`✅ User logged in: ${user.email}`);

    // 🔧 FIXED: Consistent user object with fullName + emailVerified
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        name: user.fullName,
        email: user.email,
        phone: user.phone || '',
        country: user.country || '',
        profileImage: user.profileImage || '',
        emailVerified: user.emailVerified,
        isAdmin: user.isAdmin,
        isAgent: user.isAgent,
        isCreator: user.isCreator || false, 
        createdAt: user.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Change Password (Authenticated)
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters long' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    // Update to new password
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    console.log(`✅ Password changed: ${user.email}`);

    res.json({ success: true, message: 'Password changed successfully' });
    
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({ success: false, message: 'Password change failed' });
  }
});

// Delete Account
app.delete('/api/auth/delete-account', authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required to delete account' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Incorrect password' });
    }

    // Delete user
    await User.findByIdAndDelete(req.user.userId);

    console.log(`✅ Account deleted: ${user.email}`);

    res.json({ success: true, message: 'Account deleted successfully' });
    
  } catch (error) {
    console.error('❌ Delete account error:', error);
    res.status(500).json({ success: false, message: 'Account deletion failed' });
  }
});

// Toggle Two-Factor Authentication
app.post('/api/auth/toggle-2fa', authenticateToken, async (req, res) => {
  try {
    const { enable } = req.body;
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.twoFactorEnabled = enable === true;
    if (!enable) {
      user.twoFactorSecret = null;
    }
    
    await user.save();

    res.json({ 
      success: true, 
      message: `Two-factor authentication ${enable ? 'enabled' : 'disabled'}`,
      twoFactorEnabled: user.twoFactorEnabled
    });
    
  } catch (error) {
    console.error('❌ Toggle 2FA error:', error);
    res.status(500).json({ success: false, message: '2FA toggle failed' });
  }
});


app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ success: true, message: 'If account exists, code sent' });
    }

    const resetOTP = generateOTP();
   console.log(`🔐 Password reset OTP for ${email}: ${resetOTP}`);
    otpStore.set(`reset_${email.toLowerCase()}`, {
      code: resetOTP,
      expires: Date.now() + 10 * 60 * 1000,
      attempts: 0
    });

    await sendEmailOTP(email, resetOTP, 'password-reset');

    res.json({ success: true, message: 'Reset code sent' });
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Request failed' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be 8+ characters' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const storedOTP = otpStore.get(`reset_${cleanEmail}`);

    if (!storedOTP || Date.now() > storedOTP.expires) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    }

    if (storedOTP.code !== code) {
      return res.status(400).json({ success: false, message: 'Invalid code' });
    }

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    otpStore.delete(`reset_${cleanEmail}`);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ success: false, message: 'Reset failed' });
  }
});



// ========== ADMIN AUTH ==========
app.post('/api/auth/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required', isAdmin: false });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      success: true,
      message: 'Admin login successful',
      token,
      isAdmin: true,
      user: {
        id: user._id,
        name: user.fullName,
        email: user.email
      }
    });
  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

app.get('/api/auth/admin/verify', authenticateAdmin, async (req, res) => {
  res.json({
    success: true,
    isAdmin: true,
    user: {
      id: req.adminUser._id,
      name: req.adminUser.fullName,
      email: req.adminUser.email
    }
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// AGENT AUTHENTICATION (NEW)
// ═════════════════════════════════════════════════════════════════════════════

// Agent Login
app.post('/api/auth/agent/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user || (!user.isAgent && !user.isAdmin)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Agent access required', 
        isAgent: false 
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    user.lastActivity = new Date();
    if (user.isAgent && user.agentInfo) {
      user.agentInfo.status = 'online';
    }
    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email }, 
      JWT_SECRET, 
      { expiresIn: '12h' }
    );

    console.log(`✅ Agent logged in: ${user.email}`);

    res.json({
      success: true,
      message: 'Agent login successful',
      token,
      isAgent: true,
      isAdmin: user.isAdmin,
      user: {
        id: user._id,
        name: user.fullName,
        email: user.email,
        agentInfo: user.agentInfo
      }
    });
    
  } catch (error) {
    console.error('❌ Agent login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Verify Agent Token
app.get('/api/auth/agent/verify', authenticateAgent, async (req, res) => {
  res.json({
    success: true,
    isAgent: true,
    isAdmin: req.agentUser.isAdmin,
    user: {
      id: req.agentUser._id,
      name: req.agentUser.fullName,
      email: req.agentUser.email,
      agentInfo: req.agentUser.agentInfo
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 👤 USER PROFILE ROUTES
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password -twoFactorSecret');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName,
        name: user.fullName,
        email: user.email,
        phone: user.phone,
        country: user.country,
        profileImage: user.profileImage,
        bio: user.bio,
        emailVerified: user.emailVerified,
        isAdmin: user.isAdmin,
        isAgent: user.isAgent,
        isBanned: user.isBanned,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('❌ Profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { fullName, bio, profileImage, phone, country } = req.body;
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (fullName) user.fullName = fullName;
    if (bio !== undefined) user.bio = bio;
    if (profileImage) user.profileImage = profileImage;
    if (phone !== undefined) user.phone = phone;
    if (country) user.country = country;

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated',
      user: {
        id: user._id,
        fullName: user.fullName,
        name: user.fullName,
        email: user.email,
        phone: user.phone,
        country: user.country,
        profileImage: user.profileImage,
        bio: user.bio
      }
    });
  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

// Add this to pro-uyeh.js after the existing /api/profile endpoint

// Profile Picture Upload Endpoint
app.post('/api/profile/upload-picture', authenticateToken, async (req, res) => {
  try {
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ success: false, message: 'No image provided' });
    }
    
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.profileImage = image;
    await user.save();

    res.json({
      success: true,
      message: 'Profile picture updated',
      user: {
        id: user._id,
        fullName: user.fullName,
        name: user.fullName,
        email: user.email,
        phone: user.phone,
        country: user.country,
        profileImage: user.profileImage,
        bio: user.bio
      }
    });
  } catch (error) {
    console.error('❌ Upload picture error:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// Profile Update with separate endpoint
app.put('/api/profile/update', authenticateToken, async (req, res) => {
  try {
    const { name, fullName, email, phone, country, bio } = req.body;
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Accept both 'name' and 'fullName' for compatibility
    if (name || fullName) user.fullName = name || fullName;
    if (phone !== undefined) user.phone = phone;
    if (country) user.country = country;
    if (bio !== undefined) user.bio = bio;
    // Note: email updates should require verification, so we skip it here

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated',
      user: {
        id: user._id,
        fullName: user.fullName,
        name: user.fullName,
        email: user.email,
        phone: user.phone,
        country: user.country,
        profileImage: user.profileImage,
        bio: user.bio
      }
    });
  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});




// Get Notification Preferences
app.get('/api/user/notifications', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      preferences: user.notificationPreferences || {
        email: true,
        orders: true,
        marketing: false
      }
    });
    
  } catch (error) {
    console.error('❌ Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch preferences' });
  }
});

// Update Notification Preferences
app.put('/api/user/notifications/update', authenticateToken, async (req, res) => {
  try {
    const { email, orders, marketing } = req.body;
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.notificationPreferences = {
      email: email !== undefined ? email : user.notificationPreferences.email,
      orders: orders !== undefined ? orders : user.notificationPreferences.orders,
      marketing: marketing !== undefined ? marketing : user.notificationPreferences.marketing
    };

    await user.save();

    res.json({
      success: true,
      message: 'Notification preferences updated',
      preferences: user.notificationPreferences
    });
    
  } catch (error) {
    console.error('❌ Update notifications error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

// Get Payment Methods
app.get('/api/user/payment-methods', authenticateToken, async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      paymentMethods: paymentMethods.map(pm => ({
        id: pm._id,
        type: pm.type,
        lastFour: pm.lastFour,
        expiry: pm.expiry,
        cardholderName: pm.cardholderName,
        isDefault: pm.isDefault
      }))
    });
    
  } catch (error) {
    console.error('❌ Get payment methods error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payment methods' });
  }
});

// Add Payment Method
app.post('/api/user/payment-methods/add', authenticateToken, async (req, res) => {
  try {
    const { type, lastFour, expiry, cardholderName, isDefault } = req.body;

    if (!type || !lastFour || !expiry || !cardholderName) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      await PaymentMethod.updateMany(
        { userId: req.user.userId },
        { $set: { isDefault: false } }
      );
    }

    const paymentMethod = new PaymentMethod({
      userId: req.user.userId,
      type,
      lastFour,
      expiry,
      cardholderName,
      isDefault: isDefault || false
    });

    await paymentMethod.save();

    res.json({
      success: true,
      message: 'Payment method added',
      paymentMethod: {
        id: paymentMethod._id,
        type: paymentMethod.type,
        lastFour: paymentMethod.lastFour,
        expiry: paymentMethod.expiry,
        cardholderName: paymentMethod.cardholderName,
        isDefault: paymentMethod.isDefault
      }
    });
    
  } catch (error) {
    console.error('❌ Add payment method error:', error);
    res.status(500).json({ success: false, message: 'Failed to add payment method' });
  }
});

// ═══════════════════════════════════════════════════════════════
// CREATOR / SELLER ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creator/apply
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/creator/apply', authenticateToken, async (req, res) => {
  try {

    // ── 1. PULL & VALIDATE REQUIRED FIELDS ──────────────────────────────────
    const {
      storeName,
      storeDescription,
      businessType,
      applicationMessage,
      country,
      phone,
      website,
      socialLinks,
      categories
    } = req.body;

    if (!storeName || typeof storeName !== 'string' || storeName.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Store name is required and must be at least 3 characters.'
      });
    }

    if (!applicationMessage || typeof applicationMessage !== 'string' || applicationMessage.trim().length < 20) {
      return res.status(400).json({
        success: false,
        message: 'Please tell us about yourself (minimum 20 characters).'
      });
    }

    const cleanStoreName = storeName.trim();
    const cleanMessage   = applicationMessage.trim();

    // ── 2. CAST userId TO ObjectId CORRECTLY ────────────────────────────────
    const userObjectId = toObjectId(req.user.userId);
    if (!userObjectId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid session. Please log out and log back in.'
      });
    }

    // ── 3. CHECK: user has not already applied ───────────────────────────────
    const existing = await Creator.findOne({ userId: userObjectId });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `You already have a creator account. Current status: "${existing.applicationStatus}".`,
        applicationStatus: existing.applicationStatus,
        storeName: existing.storeName
      });
    }

    // ── 4. CHECK: store name is unique (case-insensitive) ────────────────────
    // ✅ FIX: escapeRegex is now defined — this was the crash point
    const safeStoreName = escapeRegex(cleanStoreName);
    const nameExists = await Creator.findOne({
      storeName: { $regex: new RegExp(`^${safeStoreName}$`, 'i') }
    });
    if (nameExists) {
      return res.status(400).json({
        success: false,
        message: 'That store name is already taken. Please choose a different name.'
      });
    }

    // ── 5. VALIDATE businessType ─────────────────────────────────────────────
    const allowedTypes = ['individual', 'company', 'freelancer'];
    const cleanType    = allowedTypes.includes(businessType) ? businessType : 'individual';

    // ── 6. VALIDATE categories ───────────────────────────────────────────────
    let cleanCategories = [];
    if (Array.isArray(categories) && categories.length > 0) {
      cleanCategories = categories
        .filter(c => typeof c === 'string' && c.trim().length > 0)
        .map(c => c.trim())
        .slice(0, 10);
    }

   // ── 7. CREATE THE CREATO// ✅ Generate storeSlug explicitly — don't rely solely on pre-save hook
const storeSlug = cleanStoreName
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

// Check slug is also unique
const slugExists = await Creator.findOne({ storeSlug });
if (slugExists) {
  return res.status(400).json({
    success: false,
    message: 'That store name is already taken. Please choose a different name.'
  });
}

const creator = new Creator({
  userId:             userObjectId,
  storeName:          cleanStoreName,
  storeSlug:          storeSlug,          // ✅ explicitly set
  storeDescription:   storeDescription    ? String(storeDescription).trim()    : '',
  businessType:       cleanType,
  applicationMessage: cleanMessage,
  country:            country             ? String(country).trim()             : '',
  phone:              phone               ? String(phone).trim()               : '',
  website:            website             ? String(website).trim()             : '',
  socialLinks:        socialLinks && typeof socialLinks === 'object' ? socialLinks : {},
  categories:         cleanCategories,
  applicationStatus:  'pending'
});

await creator.save();

    // ── 8. UPDATE USER RECORD ─────────────────────────────────────────────────
    await User.findByIdAndUpdate(userObjectId, {
      $set: {
        'creatorInfo.creatorId': creator._id,
        'creatorInfo.storeName': cleanStoreName,
        'creatorInfo.joinedAt':  new Date()
      }
    });

    // ── 9. NOTIFY ADMIN via WebSocket (non-fatal) ─────────────────────────────
    if (global.wss && global.wss.clients) {
      global.wss.clients.forEach(client => {
        if (client.isAdmin && client.readyState === 1) {
          try {
            client.send(JSON.stringify({
              type:      'new_creator_application',
              storeName: cleanStoreName,
              userId:    String(userObjectId),
              timestamp: new Date()
            }));
          } catch (_) { /* non-fatal */ }
        }
      });
    }

    console.log(`📋 New creator application: "${cleanStoreName}" — userId: ${userObjectId}`);

    // ── 10. SUCCESS ───────────────────────────────────────────────────────────
    return res.status(201).json({
      success: true,
      message: 'Application submitted! Our team will review it within 24–48 hours.',
      creator: {
        id:                creator._id,
        storeName:         creator.storeName,
        applicationStatus: creator.applicationStatus,
        submittedAt:       creator.createdAt
      }
    });

  } catch (error) {

    // Duplicate key (MongoDB unique index)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(400).json({
        success: false,
        message: field === 'storeName'
          ? 'That store name is already taken. Please choose a different name.'
          : 'An account with that information already exists.'
      });
    }

    // Mongoose validation error
    if (error.name === 'ValidationError') {
      const firstMsg = Object.values(error.errors)[0]?.message || 'Validation failed.';
      return res.status(400).json({ success: false, message: firstMsg });
    }

    console.error('❌ /api/creator/apply error:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong on our end. Please try again in a moment.'
    });
  }
});



// ── GET MY CREATOR PROFILE ──────────────────────────────────────
app.get('/api/creator/me', authenticateToken, async (req, res) => {
  try {
    // BUG FIX: Do NOT populate userId here — after populate, creator.userId becomes
    // a User object and breaks aggregate $match which expects an ObjectId.
    // We fetch the user separately to get name/email/profileImage safely.
    const creator = await Creator.findOne({ userId: req.user.userId });

    if (!creator) {
      return res.status(404).json({ success: false, message: 'Creator profile not found' });
    }

    // Fetch user info separately so creator.userId stays a clean ObjectId
    const user = await User.findById(creator.userId).select('fullName email profileImage');

    // Get product stats
    const products = await CreatorProduct.find({ creatorId: creator._id });

    // BUG FIX: creator.userId is now a plain ObjectId (no populate), safe for aggregate
    const pendingEarnings = await EarningsLedger.aggregate([
      { $match: { recipientId: creator.userId, status: 'confirmed', recipientType: 'creator' }},
      { $group: { _id: null, total: { $sum: '$earningAmount' }}}
    ]);

    // BUG FIX: creatorOut is a plain object, not a function — was `...creatorOut()` before
    const creatorOut = creator.toObject();
    if (creatorOut.storeLogo && !creatorOut.storeLogo.startsWith('http'))
      creatorOut.storeLogo = `${BASE_URL}${creatorOut.storeLogo}`;
    if (creatorOut.storeBanner && !creatorOut.storeBanner.startsWith('http'))
      creatorOut.storeBanner = `${BASE_URL}${creatorOut.storeBanner}`;

    res.json({
      success: true,
      creator: {
        ...creatorOut,                          // ← was ...creatorOut() — TypeError
        fullName:       user?.fullName       || '',
        email:          user?.email          || '',
        profileImage:   user?.profileImage   || '',
        products: {
          total:    products.length,
          approved: products.filter(p => p.status === 'approved').length,
          pending:  products.filter(p => p.status === 'pending_review').length,
          rejected: products.filter(p => p.status === 'rejected').length
        },
        pendingPayout: pendingEarnings[0]?.total || 0
      }
    });

  } catch (error) {
    console.error('❌ Get creator error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

// ── UPDATE CREATOR PROFILE ──────────────────────────────────────
app.put('/api/creator/profile', authenticateToken, async (req, res) => {
  try {
    const creator = await Creator.findOne({ userId: req.user.userId });
    if (!creator || creator.applicationStatus !== 'approved') {
      return res.status(403).json({ success: false, message: 'Approved creator account required' });
    }

    const allowedFields = [
      'storeName', 'storeDescription', 'storeLogo', // storeBanner removed — locked platform-wide
      'businessName', 'businessType', 'country', 'phone',
      'website', 'socialLinks', 'payoutDetails', 'payoutMethod'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        creator[field] = req.body[field];
      }
    });

    if (creator.storeLogo && !creator.storeLogo.startsWith('http'))
      creator.storeLogo = `${BASE_URL}${creator.storeLogo}`;
    if (creator.storeBanner && !creator.storeBanner.startsWith('http'))
      creator.storeBanner = `${BASE_URL}${creator.storeBanner}`;
    await creator.save();

    res.json({ success: true, message: 'Profile updated', creator });

  } catch (error) {
    console.error('❌ Update creator error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});


// ── CREATOR: SUBMIT A PRODUCT ───────────────────────────────────
app.post('/api/creator/products', authenticateToken, async (req, res) => {
  try {
    const creator = await Creator.findOne({ userId: req.user.userId });
 
    if (!creator) {
      return res.status(403).json({ success: false, message: 'Creator account required' });
    }
    if (creator.applicationStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your creator account must be approved before listing products'
      });
    }
    if (creator.isSuspended) {
      return res.status(403).json({ success: false, message: 'Creator account is suspended' });
    }
 
    const {
      title, description, category, suggestedPrice, tags,
      images, downloadLink, fileSize, version, features, requirements,
      productType, hostedFile, previewUrl, previewType,
      audioData, softwareData, courseData,
      // ── NEW: external media fields ──
      externalVideoUrl,
      externalAudioUrl
    } = req.body;
 
    if (!title || !description || !suggestedPrice) {
      return res.status(400).json({ success: false, message: 'Title, description, and price required' });
    }
 
    // ── Parse external media URLs ────────────────────────────────────────────
    // Priority: video > audio. A product can have both but we embed one at a time.
    let parsedEmbed = { embedType: null, embedUrl: null, mediaType: null };
 
    if (externalVideoUrl && externalVideoUrl.trim()) {
      const parsed = parseExternalMediaUrl(externalVideoUrl.trim());
      parsedEmbed = {
        embedType: parsed.embedType,
        embedUrl:  parsed.embedUrl,
        mediaType: 'video'
      };
    } else if (externalAudioUrl && externalAudioUrl.trim()) {
      const parsed = parseExternalMediaUrl(externalAudioUrl.trim());
      parsedEmbed = {
        embedType: parsed.embedType,
        embedUrl:  parsed.embedUrl,
        mediaType: 'audio'
      };
    } else if (hostedFile && hostedFile.publicId) {
      // Uploaded file to Cloudinary — it's a file product
      parsedEmbed.mediaType = 'file';
    }
 
    const creatorProduct = new CreatorProduct({
      creatorId: creator._id,
      title,
      description,
      category,
      suggestedPrice,
      tags:         tags         || [],
      images:       images       || [],
      downloadLink: downloadLink || null,
      fileSize,
      version,
      features:     features     || [],
      requirements: requirements || [],
      status:       'pending_review',
      productType:  productType  || 'download',
      hostedFile:   hostedFile   || null,
      previewUrl:   previewUrl   || null,
      previewType:  previewType  || 'none',
      audioData:    audioData    || null,
      softwareData: softwareData || null,
      courseData:   courseData   || null,
      // ── NEW external media ──
      externalVideoUrl: externalVideoUrl ? externalVideoUrl.trim() : null,
      externalAudioUrl: externalAudioUrl ? externalAudioUrl.trim() : null,
      embedType:        parsedEmbed.embedType,
      embedUrl:         parsedEmbed.embedUrl,
      mediaType:        parsedEmbed.mediaType,
      submittedAt: new Date()
    });
 
    await creatorProduct.save();
    creator.totalProducts += 1;
    await creator.save();
 
    console.log(`📦 New product submitted by creator ${creator.storeName}: ${title} [${parsedEmbed.mediaType || 'file'}]`);
 
    res.status(201).json({
      success: true,
      message: 'Product submitted for review! We will notify you within 24 hours.',
      product: creatorProduct
    });
 
  } catch (error) {
    console.error('❌ Creator submit product error:', error);
    res.status(500).json({ success: false, message: 'Product submission failed' });
  }
});
 


// ── CREATOR: GET MY PRODUCTS ────────────────────────────────────
app.get('/api/creator/products', authenticateToken, async (req, res) => {
  try {
    const creator = await Creator.findOne({ userId: req.user.userId });
    if (!creator) {
      return res.status(404).json({ success: false, message: 'Creator account not found' });
    }

    const { status = 'all' } = req.query;
    let query = { creatorId: creator._id };
    if (status !== 'all') query.status = status;

    const products = await CreatorProduct.find(query)
      .populate('productId')
      .sort({ createdAt: -1 });

    res.json({ success: true, products, count: products.length });

  } catch (error) {
    console.error('❌ Get creator products error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

app.put('/api/creator/products/:id', authenticateToken, async (req, res) => {
  try {
    const creator = await Creator.findOne({ userId: req.user.userId });
    if (!creator) return res.status(403).json({ success: false, message: 'Creator account required' });
 
    const product = await CreatorProduct.findOne({ _id: req.params.id, creatorId: creator._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
 
    const allowedFields = [
      'title', 'description', 'category', 'suggestedPrice', 'tags',
      'images', 'downloadLink', 'fileSize', 'version', 'features', 'requirements',
      'productType', 'hostedFile', 'previewUrl', 'previewType',
      'audioData', 'softwareData', 'courseData',
      'externalVideoUrl', 'externalAudioUrl'
    ];
 
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) product[field] = req.body[field];
    });
 
    // Re-parse embed info if external URLs were updated
    if (req.body.externalVideoUrl !== undefined || req.body.externalAudioUrl !== undefined) {
      const videoUrl = product.externalVideoUrl;
      const audioUrl = product.externalAudioUrl;
 
      if (videoUrl && videoUrl.trim()) {
        const parsed = parseExternalMediaUrl(videoUrl.trim());
        product.embedType  = parsed.embedType;
        product.embedUrl   = parsed.embedUrl;
        product.mediaType  = 'video';
      } else if (audioUrl && audioUrl.trim()) {
        const parsed = parseExternalMediaUrl(audioUrl.trim());
        product.embedType  = parsed.embedType;
        product.embedUrl   = parsed.embedUrl;
        product.mediaType  = 'audio';
      } else {
        product.embedType  = null;
        product.embedUrl   = null;
        product.mediaType  = product.hostedFile?.publicId ? 'file' : null;
      }
    }
 
    // Re-process courseData chapters if updated
    if (req.body.courseData !== undefined && product.courseData) {
      product.courseData = processChaptersForDelivery(
        JSON.parse(JSON.stringify(product.courseData))
      );
    }
 
    // Always re-infer mediaType
    product.mediaType = inferProductMediaType(product);
 
    // If resubmitting a rejected product
    if (req.body.status === 'pending_review' && product.status === 'rejected') {
      product.status = 'pending_review';
      product.rejectionReason = '';
    }
 
    await product.save();
 
    // ── GAP 6 FIX: Sync changes to mirrored Product if approved ──────────
    // Only sync non-pricing fields — price is controlled by admin approval.
    // Only sync if product is approved (productId exists).
    if (product.status === 'approved' && product.productId) {
      try {
        const syncFields = {
          title:            product.title,
          description:      product.description,
          category:         product.category,
          image:            product.images?.[0] || '',
          images:           product.images || [],
          fileSize:         product.fileSize     || null,
          version:          product.version      || null,
          features:         product.features     || [],
          requirements:     product.requirements || [],
          tags:             product.tags         || [],
          productType:      product.productType,
          hostedFile:       product.hostedFile   || null,
          previewUrl:       product.previewUrl   || null,
          previewType:      product.previewType  || 'none',
          courseData:       product.courseData   || null,
          audioData:        product.audioData    || null,
          softwareData:     product.softwareData || null,
          externalVideoUrl: product.externalVideoUrl || null,
          externalAudioUrl: product.externalAudioUrl || null,
          embedType:        product.embedType    || null,
          embedUrl:         product.embedUrl     || null,
          mediaType:        product.mediaType    || null,
          downloadLink:     product.downloadLink || null,
        };
 
        await Product.findByIdAndUpdate(product.productId, { $set: syncFields });
        console.log(`🔄 Mirrored Product synced after creator edit: ${product.title}`);
      } catch (syncErr) {
        // Non-fatal — log but don't fail the creator's save
        console.error('⚠️  Mirror sync failed (non-fatal):', syncErr.message);
      }
    }
 
    res.json({ success: true, message: 'Product updated', product });
  } catch (error) {
    console.error('❌ Update creator product error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});
 

// ══════════════════════════════════════════════════════════════════════════════
// COURSE STRUCTURE MANAGEMENT
// Save/replace the full section+chapter structure for a product (or creator product)
// ══════════════════════════════════════════════════════════════════════════════

// Admin: update course structure on a Product
app.put('/api/admin/products/:id/course-structure', authenticateAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    if (product.productType !== 'course') {
      return res.status(400).json({ success: false, message: 'Product is not a course' });
    }

    const { sections, level, language, certificate } = req.body;

    // Compute totals from sections
    let totalChapters = 0;
    let totalDuration = 0;
    (sections || []).forEach(s => {
      (s.chapters || []).forEach(ch => {
        totalChapters++;
        totalDuration += ch.duration || 0;
      });
    });

    product.courseData = {
      ...product.courseData,
      sections: sections || [],
      totalSections: (sections || []).length,
      totalChapters,
      totalDuration,
      level:        level       || product.courseData?.level,
      language:     language    || product.courseData?.language,
      certificate:  certificate !== undefined ? certificate : product.courseData?.certificate,
    };

    await product.save();
    res.json({ success: true, message: 'Course structure saved', courseData: product.courseData });
  } catch (error) {
    console.error('❌ Course structure save error:', error);
    res.status(500).json({ success: false, message: 'Failed to save course structure' });
  }
});

// Creator: update course structure on a CreatorProduct
app.put('/api/creator/products/:id/course-structure', authenticateToken, async (req, res) => {
  try {
    const creator = await Creator.findOne({ userId: req.user.userId });
    if (!creator) return res.status(403).json({ success: false, message: 'Creator account required' });

    const product = await CreatorProduct.findOne({ _id: req.params.id, creatorId: creator._id });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    if (product.productType !== 'course') {
      return res.status(400).json({ success: false, message: 'Product is not a course' });
    }

    const { sections, level, language, certificate } = req.body;

    let totalChapters = 0, totalDuration = 0;
    (sections || []).forEach(s => {
      (s.chapters || []).forEach(ch => {
        totalChapters++;
        totalDuration += ch.duration || 0;
      });
    });

    product.courseData = {
      ...product.courseData,
      sections: sections || [],
      totalSections: (sections || []).length,
      totalChapters,
      totalDuration,
      level, language, certificate
    };

    await product.save();
    res.json({ success: true, message: 'Course structure saved', courseData: product.courseData });
  } catch (error) {
    console.error('❌ Creator course structure error:', error);
    res.status(500).json({ success: false, message: 'Failed to save' });
  }
});

// Public: get course preview structure (only free chapters exposed, no URLs)
app.get('/api/products/:id/course-preview', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || !product.isActive) return res.status(404).json({ success: false, message: 'Product not found' });
    if (product.productType !== 'course') return res.status(400).json({ success: false, message: 'Not a course' });

    const publicSections = (product.courseData?.sections || []).map(section => ({
      sectionTitle: section.sectionTitle,
      sectionOrder: section.sectionOrder,
      chapters: (section.chapters || []).map(ch => ({
        chapterTitle: ch.chapterTitle,
        chapterOrder: ch.chapterOrder,
        duration:     ch.duration,
        isFree:       ch.isFree,
        // Only provide a playable URL for free preview chapters
        chapterUrl:   ch.isFree ? (ch.externalUrl || ch.hostedFile?.secureUrl || null) : null,
      }))
    }));

    res.json({
      success: true,
      coursePreview: {
        totalChapters: product.courseData?.totalChapters,
        totalDuration: product.courseData?.totalDuration,
        totalSections: product.courseData?.totalSections,
        level:         product.courseData?.level,
        language:      product.courseData?.language,
        certificate:   product.courseData?.certificate,
        sections:      publicSections
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load course preview' });
  }
});

app.get('/api/creator/orders', authenticateToken, async (req, res) => {
  try {
    const creator = await Creator.findOne({ userId: req.user.userId });
    if (!creator) return res.status(404).json({ success: false, message: 'Creator not found' });

    // FIX: filter out nulls before building the $in list, and also
    // match by title as a fallback for any orders placed before productId was linked
    const creatorProducts = await CreatorProduct.find({ creatorId: creator._id });
    const productIds  = creatorProducts.map(p => p.productId?.toString()).filter(Boolean);
    const productTitles = creatorProducts.map(p => p.title).filter(Boolean);

    if (!productIds.length && !productTitles.length) {
      return res.json({ success: true, orders: [], count: 0 });
    }

    const orders = await Order.find({
      $or: [
        { 'items.id':    { $in: productIds    }, status: 'completed' },
        { 'items.title': { $in: productTitles }, status: 'completed' }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('orderReference items total customerInfo createdAt status');

    res.json({ success: true, orders, count: orders.length });
  } catch (error) {
    console.error('❌ Creator orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

app.get('/api/creator/notifications', authenticateToken, async (req, res) => {
  try {
    const creator = await Creator.findOne({ userId: req.user.userId });
    if (!creator) return res.status(404).json({ success: false, message: 'Creator not found' });

    const notifications = [];

    // Pending payout requests
    const pendingPayout = await PayoutRequest.findOne({
      requesterId: creator.userId,
      status: { $in: ['pending', 'processing'] }
    });
    if (pendingPayout) {
      notifications.push({
        type: 'payout',
        message: `Payout of $${pendingPayout.amount.toFixed(2)} is being processed`,
        createdAt: pendingPayout.requestedAt
      });
    }

    // Recently reviewed products
    const recentlyReviewed = await CreatorProduct.find({
      creatorId: creator._id,
      status: { $in: ['approved', 'rejected'] },
      updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).sort({ updatedAt: -1 }).limit(10);

    recentlyReviewed.forEach(p => {
      notifications.push({
        type: p.status === 'approved' ? 'approved' : 'rejected',
        message: p.status === 'approved'
          ? `Your product "${p.title}" was approved!`
          : `Your product "${p.title}" was rejected: ${p.rejectionReason || 'See admin notes'}`,
        createdAt: p.updatedAt
      });
    });

    // Recent sales
    const recentEarnings = await EarningsLedger.find({
      recipientId: creator.userId,
      recipientType: 'creator',
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).sort({ createdAt: -1 }).limit(5);

    recentEarnings.forEach(e => {
      notifications.push({
        type: 'sale',
        message: `You earned $${e.earningAmount.toFixed(2)} from a sale`,
        createdAt: e.createdAt
      });
    });

    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, notifications, count: notifications.length });
  } catch (error) {
    console.error('❌ Creator notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

// ── CREATOR: EARNINGS DASHBOARD ─────────────────────────────────
app.get('/api/creator/earnings', authenticateToken, async (req, res) => {
  try {
    const creator = await Creator.findOne({ userId: req.user.userId });
    if (!creator || creator.applicationStatus !== 'approved') {
      return res.status(403).json({ success: false, message: 'Approved creator required' });
    }
     // ADD THIS LINE immediately after the creator check:
    const creatorUserId = new mongoose.Types.ObjectId(creator.userId.toString());
    
    const [confirmed, pending, paid] = await Promise.all([
      EarningsLedger.aggregate([
        { $match: { recipientId: creatorUserId, recipientType: 'creator', status: 'confirmed' }},
        { $group: { _id: null, total: { $sum: '$earningAmount' }, count: { $sum: 1 }}}
      ]),
      EarningsLedger.aggregate([
        { $match: { recipientId: creatorUserId, recipientType: 'creator', status: 'pending' }},
        { $group: { _id: null, total: { $sum: '$earningAmount' }, count: { $sum: 1 }}}
      ]),
      EarningsLedger.aggregate([
        { $match: { recipientId: creatorUserId, recipientType: 'creator', status: 'paid' }},
        { $group: { _id: null, total: { $sum: '$earningAmount' }}}
      ])
    ]);

    const recentEarnings = await EarningsLedger.find({
      recipientId: creator.userId,
      recipientType: 'creator'
    })
    .populate('orderId', 'orderReference createdAt total')
    .populate('productId', 'title')
    .sort({ createdAt: -1 })
    .limit(20);

    res.json({
      success: true,
      earnings: {
        confirmed: confirmed[0]?.total || 0,
        pending: pending[0]?.total || 0,
        totalPaid: paid[0]?.total || 0,
        platformCommissionRate: creator.platformCommissionRate,
        affiliateCommissionRate: creator.affiliateCommissionRate,
        availableForPayout: confirmed[0]?.total || 0,
        payoutThreshold: creator.payoutThreshold,
        canRequestPayout: (confirmed[0]?.total || 0) >= creator.payoutThreshold
      },
      recentEarnings
    });

  } catch (error) {
    console.error('❌ Creator earnings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch earnings' });
  }
});


// ── CREATOR: REQUEST PAYOUT ─────────────────────────────────────
app.post('/api/creator/payout/request', authenticateToken, async (req, res) => {
  try {
    const creator = await Creator.findOne({ userId: req.user.userId });
    if (!creator || creator.applicationStatus !== 'approved') {
      return res.status(403).json({ success: false, message: 'Approved creator required' });
    }

    // Calculate available balance
// Calculate available balance
const creatorUserId = new mongoose.Types.ObjectId(creator.userId.toString()); // FIX: define before use
const confirmed = await EarningsLedger.aggregate([
  { $match: { recipientId: creatorUserId, recipientType: 'creator', status: 'confirmed' }},
  { $group: { _id: null, total: { $sum: '$earningAmount' }}}
]);

    const available = confirmed[0]?.total || 0;

    if (available < creator.payoutThreshold) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum payout is $${creator.payoutThreshold}. You have $${available.toFixed(2)} available.` 
      });
    }

    // Check no pending payout request
    const pendingRequest = await PayoutRequest.findOne({ 
      requesterId: creatorUserId, 
      status: { $in: ['pending', 'processing'] } 
    });
    if (pendingRequest) {
      return res.status(400).json({ success: false, message: 'You already have a pending payout request' });
    }

    const payoutRequest = new PayoutRequest({
      requesterId: creatorUserId,
      requesterType: 'creator',
      amount: available,
      payoutMethod: creator.payoutMethod,
      payoutDetails: creator.payoutDetails
    });

    await payoutRequest.save();

    // Mark earnings as pending payout
    await EarningsLedger.updateMany(
      { recipientId: creatorUserId, recipientType: 'creator', status: 'confirmed' },
      { status: 'pending', payoutRequestId: payoutRequest._id }  
      // Note: reusing 'pending' here as "queued for payout"
    );

    console.log(`💰 Payout request: ${creator.storeName} - $${available}`);

    res.json({ 
      success: true, 
      message: `Payout request of $${available.toFixed(2)} submitted. Processing within 3-5 business days.`,
      payoutRequest 
    });

  } catch (error) {
    console.error('❌ Payout request error:', error);
    res.status(500).json({ success: false, message: 'Payout request failed' });
  }
});

// ── CREATOR: GET PAYOUT HISTORY ────────────────────────────────
app.get('/api/creator/payout/history', authenticateToken, async (req, res) => {
try {
const creator = await Creator.findOne({ userId: req.user.userId });
if (!creator || creator.applicationStatus !== 'approved') {
return res.status(403).json({ success: false, message: 'Approved creator required' });
}
const creatorUserId = new mongoose.Types.ObjectId(creator.userId.toString());

const payouts = await PayoutRequest.find({
  requesterId: creatorUserId,
  requesterType: 'creator'
}).sort({ requestedAt: -1 }).limit(20);

res.json({ success: true, payouts, count: payouts.length });
} catch (error) {
console.error('❌ Creator payout history error:', error);
res.status(500).json({ success: false, message: 'Failed to fetch payout history' });
}
});


// ── PUBLIC: GET CREATOR STORE ───────────────────────────────────

app.get('/api/stores/:storeSlug', async (req, res) => {
  try {
    const creator = await Creator.findOne({
      storeSlug:         req.params.storeSlug,
      applicationStatus: 'approved',
      isSuspended:       false
    })
      .populate('userId', 'fullName profileImage')
      .select('-payoutDetails -payoutMethod -applicationMessage');

    if (!creator) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    // ✅ FIX: Filter by THIS creator only, and use CreatorProduct (not Product)
    const [products, followerCount] = await Promise.all([
      CreatorProduct.find({ creatorId: creator._id, status: 'approved' })
        .sort({ createdAt: -1 }),
      Follow.countDocuments({ creatorId: creator._id })
        ]);
    const creatorObj = creator.toObject();
    if (creatorObj.storeLogo && !creatorObj.storeLogo.startsWith('http'))
      creatorObj.storeLogo = `${BASE_URL}${creatorObj.storeLogo}`;
    if (creatorObj.storeBanner && !creatorObj.storeBanner.startsWith('http'))
      creatorObj.storeBanner = `${BASE_URL}${creatorObj.storeBanner}`;

    const normalizedProducts = products.map(p => {
      const prod = p.toObject();
      if (!prod.image && prod.images?.length) prod.image = prod.images[0];
      if (prod.image && !prod.image.startsWith('http')) prod.image = `${BASE_URL}${prod.image}`;
      if (prod.images) prod.images = prod.images.map(img =>
        img && !img.startsWith('http') ? `${BASE_URL}${img}` : img);
      return prod;
    });

    res.json({ success: true, creator: { ...creatorObj, followerCount }, products: normalizedProducts });

  } catch (error) {
    console.error('❌ Get store error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch store' });
  }
});


// ─────────────────────────────────────────────────────────────────────────
// FIX 2 — ADD NEW ROUTE: /api/marketplace/products
//
// PURPOSE: The store page JS calls this to get paginated, filterable products
//          for a specific creator. Place this NEAR the other store/creator routes.
// ─────────────────────────────────────────────────────────────────────────

app.get('/api/marketplace/products', async (req, res) => {
  try {
    const {
      creatorId,
      status    = 'approved',
      category,
      search,
      sort      = 'newest',
      page      = 1,
      limit     = 50
    } = req.query;

    const query = { status };
    if (creatorId) query.creatorId = creatorId;
    if (category)  query.category  = category;
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ title: rx }, { description: rx }, { tags: rx }];
    }

    let sortObj = { createdAt: -1 };
    if (sort === 'price-asc')  sortObj = { approvedPrice: 1 };
    if (sort === 'price-desc') sortObj = { approvedPrice: -1 };
    if (sort === 'popular')    sortObj = { totalSales: -1 };

    const [products, total] = await Promise.all([
      CreatorProduct.find(query)
        .populate('creatorId', 'storeName storeSlug storeLogo isVerified')
        .sort(sortObj)
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit)),
      CreatorProduct.countDocuments(query)
    ]);

    res.json({
      success:  true,
      products,
      total,
      page:     parseInt(page),
      pages:    Math.ceil(total / parseInt(limit))
    });

  } catch (error) {
    console.error('❌ Marketplace products error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});


// ─────────────────────────────────────────────────────────────────────────
// FIX 3 — ADD NEW ROUTE: /api/marketplace/stores
//
// PURPOSE: Browse all approved creator stores (for a marketplace listing page)
// ─────────────────────────────────────────────────────────────────────────

app.get('/api/marketplace/stores', async (req, res) => {
  try {
    const {
      search,
      category,
      sort    = 'newest',
      page    = 1,
      limit   = 24
    } = req.query;

    const query = { applicationStatus: 'approved', isSuspended: false };
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ storeName: rx }, { storeDescription: rx }];
    }
    if (category) query.categories = category;

    let sortObj = { approvedAt: -1 };
    if (sort === 'popular')  sortObj = { totalSales: -1 };
    if (sort === 'top-rated') sortObj = { rating: -1 };

    const [stores, total] = await Promise.all([
      Creator.find(query)
       .select('storeName storeSlug storeLogo storeBanner storeDescription isVerified isFeatured rating totalProducts totalSales followerCount approvedAt categories country')
        .sort(sortObj)
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit)),
      Creator.countDocuments(query)
    ]);

    // Add follower counts
    const storeIds = stores.map(s => s._id);
    const followerCounts = await Follow.aggregate([
      { $match: { creatorId: { $in: storeIds } } },
      { $group: { _id: '$creatorId', count: { $sum: 1 } } }
    ]);
    const followerMap = {};
    followerCounts.forEach(f => { followerMap[f._id.toString()] = f.count; });

    const storesWithFollowers = stores.map(s => ({
      ...s.toObject(),
      followerCount: followerMap[s._id.toString()] || 0
    }));

    res.json({
      success: true,
      stores:  storesWithFollowers,
      total,
      page:    parseInt(page),
      pages:   Math.ceil(total / parseInt(limit))
    });

  } catch (error) {
    console.error('❌ Marketplace stores error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stores' });
  }
});


// ═══════════════════════════════════════════════════════════════
// ADMIN: CREATOR & PRODUCT MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// ── LIST ALL CREATOR APPLICATIONS ──────────────────────────────
app.get('/api/admin/creators', authenticateAdmin, async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 20 } = req.query;
    
    let query = {};
    if (status !== 'all') query.applicationStatus = status;

    const [creators, total] = await Promise.all([
      Creator.find(query)
        .populate('userId', 'fullName email createdAt')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit)),
      Creator.countDocuments(query)
    ]);

    res.json({
      success: true,
      creators,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) }
    });

  } catch (error) {
    console.error('❌ Get creators error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch creators' });
  }
});


// ── APPROVE OR REJECT CREATOR APPLICATION ──────────────────────
app.put('/api/admin/creators/:creatorId/review', authenticateAdmin, async (req, res) => {
  try {
    const { action, rejectionReason, platformCommissionRate, affiliateCommissionRate } = req.body;
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be approve or reject' });
    }

    const creator = await Creator.findById(req.params.creatorId)
      .populate('userId', 'fullName email');

    if (!creator) {
      return res.status(404).json({ success: false, message: 'Creator not found' });
    }

    if (creator.applicationStatus !== 'pending') {
      return res.status(400).json({ success: false, message: 'Application already reviewed' });
    }

    creator.applicationStatus = action === 'approve' ? 'approved' : 'rejected';
    creator.reviewedBy = req.adminUser._id;
    creator.reviewedAt = new Date();

    if (action === 'approve') {
      creator.approvedAt = new Date();
      // Admin can set custom commission rates or use defaults
      if (platformCommissionRate !== undefined) creator.platformCommissionRate = platformCommissionRate;
      if (affiliateCommissionRate !== undefined) creator.affiliateCommissionRate = affiliateCommissionRate;

      // Update user to have creator role
      await User.findByIdAndUpdate(creator.userId._id, { isCreator: true });

    } else {
      creator.rejectionReason = rejectionReason || 'Application did not meet our requirements';
    }

    await creator.save();

    // TODO: Send email notification to creator
    // await sendCreatorReviewEmail(creator.userId.email, action, rejectionReason);

    console.log(`${action === 'approve' ? '✅' : '❌'} Creator ${action}d: ${creator.storeName}`);

    res.json({
      success: true,
      message: `Creator application ${action}d successfully`,
      creator: {
        id: creator._id,
        storeName: creator.storeName,
        applicationStatus: creator.applicationStatus,
        platformCommissionRate: creator.platformCommissionRate,
        affiliateCommissionRate: creator.affiliateCommissionRate
      }
    });

  } catch (error) {
    console.error('❌ Review creator error:', error);
    res.status(500).json({ success: false, message: 'Review failed' });
  }
});


// ── ADMIN: REVIEW CREATOR PRODUCTS ─────────────────────────────
app.get('/api/admin/creator-products', authenticateAdmin, async (req, res) => {
  try {
    const { status = 'pending_review', page = 1, limit = 20 } = req.query;
    
    let query = {};
    if (status !== 'all') query.status = status;

    const [products, total] = await Promise.all([
      CreatorProduct.find(query)
        .populate('creatorId', 'storeName userId')
        .sort({ submittedAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit)),
      CreatorProduct.countDocuments(query)
    ]);

    res.json({
      success: true,
      products,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) }
    });

  } catch (error) {
    console.error('❌ Get creator products error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});


// ── ADMIN: APPROVE / REJECT CREATOR PRODUCT ────────────────────
app.put('/api/admin/creator-products/:productId/review', authenticateAdmin, async (req, res) => {
  try {
    const { action, approvedPrice, adminNotes, rejectionReason } = req.body;

    // ── 1. Validate action ────────────────────────────────────────────────────
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be approve or reject' });
    }

    // ── 2. Load CreatorProduct (with creator populated) ───────────────────────
    const creatorProduct = await CreatorProduct.findById(req.params.productId)
      .populate('creatorId');

    if (!creatorProduct) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // ── 3. Resolve creator NOW — before any branching ─────────────────────────
    // creatorId is populated by Mongoose; guard against deleted creators.
    const creator = creatorProduct.creatorId;
    if (!creator || typeof creator !== 'object' || !creator._id) {
      return res.status(400).json({
        success: false,
        message: 'Creator account not found. The creator may have been deleted. Cannot review this product.'
      });
    }

    // ── 4. REJECT path ────────────────────────────────────────────────────────
    if (action === 'reject') {
      creatorProduct.status          = 'rejected';
      creatorProduct.rejectionReason = rejectionReason || 'Product did not meet our quality standards';
      creatorProduct.adminNotes      = adminNotes || '';
      creatorProduct.reviewedBy      = req.adminUser._id;
      creatorProduct.reviewedAt      = new Date();
      await creatorProduct.save();

      console.log(`❌ Product rejected: ${creatorProduct.title}`);

      // Notify creator of rejection
      try {
        const creatorUser = await User.findById(creator.userId).select('fullName email');
        if (creatorUser?.email && resend) {
          await resend.emails.send({
            from: `${RESEND_SENDER_NAME} <${RESEND_SENDER_EMAIL}>`,
            to: [creatorUser.email],
            subject: `Your product "${creatorProduct.title}" was not approved`,
            html: `
              <p>Hi ${creatorUser.fullName || 'Creator'},</p>
              <p>Unfortunately, your product <strong>${creatorProduct.title}</strong> was not approved.</p>
              <p><strong>Reason:</strong> ${creatorProduct.rejectionReason}</p>
              ${adminNotes ? `<p><strong>Admin notes:</strong> ${adminNotes}</p>` : ''}
              <p>You may edit your product and resubmit it for review from your creator dashboard.</p>
              <p>— The ${RESEND_SENDER_NAME} Team</p>
            `
          });
          console.log(`📧 Rejection email sent to ${creatorUser.email}`);
        }
      } catch (emailErr) {
        console.error('⚠️  Rejection notification email failed (non-fatal):', emailErr.message);
      }

      return res.json({ success: true, message: 'Product rejected', product: creatorProduct });
    }

    // ── 5. APPROVE path ───────────────────────────────────────────────────────
    const finalPrice   = approvedPrice || creatorProduct.suggestedPrice;
    const platformCom  = creator.platformCommissionRate  || 20;
    const affiliateCom = creator.affiliateCommissionRate || 10;

    // Serialize courseData safely — avoid calling .toObject() on the whole doc
    let processedCourseData = undefined;
    try {
      if (creatorProduct.productType === 'course' && creatorProduct.courseData) {
        const rawCourse = JSON.parse(JSON.stringify(creatorProduct.courseData));
        processedCourseData = rawCourse ? processChaptersForDelivery(rawCourse) : undefined;
      }
    } catch (e) {
      console.warn('⚠️  courseData serialization failed (non-fatal):', e.message);
      processedCourseData = undefined;
    }

    // Resolve top-level embed fields (handles products submitted before
    // parseExternalMediaUrl was wired up)
    let resolvedEmbedUrl  = creatorProduct.embedUrl  || null;
    let resolvedEmbedType = creatorProduct.embedType || null;
    let resolvedMediaType = inferProductMediaType(creatorProduct);

    if (!resolvedEmbedUrl) {
      const rawUrl = creatorProduct.externalVideoUrl || creatorProduct.externalAudioUrl || null;
      if (rawUrl && typeof parseExternalMediaUrl === 'function') {
        const parsed = parseExternalMediaUrl(rawUrl);
        if (parsed.embedType && parsed.embedType !== 'unknown') {
          resolvedEmbedUrl  = parsed.embedUrl;
          resolvedEmbedType = parsed.embedType;
        }
      }
    }

    // Warn if hostedFile is missing publicId — delivery will fall back to downloadLink
    const hostedFile = creatorProduct.hostedFile || null;
    if (hostedFile && !hostedFile.publicId) {
      console.warn(`⚠️  Product "${creatorProduct.title}" has hostedFile without publicId — delivery will use downloadLink fallback`);
    }

    // ── 6. Mirror to main Product collection ──────────────────────────────────
    // Re-approval after rejection reuses the existing mirrored product if present
    let mainProduct = creatorProduct.productId
      ? await Product.findById(creatorProduct.productId)
      : null;

    const productFields = {
      title:            creatorProduct.title,
      description:      creatorProduct.description,
      category:         creatorProduct.category        || 'General',
      price:            finalPrice,
      icon:             '📦',
      image:            creatorProduct.images?.[0]     || '',
      images:           creatorProduct.images           || [],
      downloadLink:     creatorProduct.downloadLink     || null,
      fileSize:         creatorProduct.fileSize         || null,
      version:          creatorProduct.version          || null,
      features:         creatorProduct.features         || [],
      requirements:     creatorProduct.requirements     || [],
      tags:             creatorProduct.tags             || [],
      productType:      creatorProduct.productType      || 'download',
      hostedFile:       hostedFile,
      previewUrl:       creatorProduct.previewUrl       || null,
      previewType:      creatorProduct.previewType      || 'none',
      courseData:       processedCourseData             || undefined,
      audioData:        creatorProduct.audioData        || null,
      softwareData:     creatorProduct.softwareData     || null,
      externalVideoUrl: creatorProduct.externalVideoUrl || null,
      externalAudioUrl: creatorProduct.externalAudioUrl || null,
      embedType:        resolvedEmbedType,
      embedUrl:         resolvedEmbedUrl,
      mediaType:        resolvedMediaType,
      isActive:         true,
      creatorProductId: creatorProduct._id,
      creatorId:        creator._id,
      isCreatorProduct: true,
      isAdminProduct:   false,
    };

    if (mainProduct) {
      Object.assign(mainProduct, productFields);
      await mainProduct.save();
      console.log(`🔄 Re-approved product updated: ${creatorProduct.title}`);
    } else {
      mainProduct = new Product(productFields);
      await mainProduct.save();
      console.log(`✅ Product approved & mirrored: ${creatorProduct.title}`);
    }

    // ── 7. Update CreatorProduct approval fields ──────────────────────────────
    creatorProduct.status                = 'approved';
    creatorProduct.approvedPrice         = finalPrice;
    creatorProduct.platformCommission    = platformCom;
    creatorProduct.affiliateCommission   = affiliateCom;
    creatorProduct.creatorEarningPerSale = finalPrice * (1 - platformCom / 100);
    creatorProduct.approvedAt            = new Date();
    creatorProduct.approvedBy            = req.adminUser._id;
    creatorProduct.adminNotes            = adminNotes || '';
    creatorProduct.productId             = mainProduct._id;
    creatorProduct.embedUrl              = resolvedEmbedUrl;
    creatorProduct.embedType             = resolvedEmbedType;
    creatorProduct.mediaType             = resolvedMediaType;
    if (processedCourseData) creatorProduct.courseData = processedCourseData;

    await creatorProduct.save();

    // ── 8. Notify creator of approval ─────────────────────────────────────────
    try {
      const creatorUser = await User.findById(creator.userId).select('fullName email');
      if (creatorUser?.email && resend) {
        await resend.emails.send({
          from: `${RESEND_SENDER_NAME} <${RESEND_SENDER_EMAIL}>`,
          to: [creatorUser.email],
          subject: `🎉 Your product "${creatorProduct.title}" is now live!`,
          html: `
            <p>Hi ${creatorUser.fullName || 'Creator'},</p>
            <p>Great news! Your product <strong>${creatorProduct.title}</strong> has been approved and is now live on the store.</p>
            <p><strong>Approved price:</strong> ₦${finalPrice?.toLocaleString() ?? finalPrice}</p>
            <p><strong>Your earning per sale:</strong> ₦${creatorProduct.creatorEarningPerSale?.toLocaleString() ?? creatorProduct.creatorEarningPerSale} (after ${platformCom}% platform commission)</p>
            ${adminNotes ? `<p><strong>Admin notes:</strong> ${adminNotes}</p>` : ''}
            <p>You can view your product and track sales from your creator dashboard.</p>
            <p>— The ${RESEND_SENDER_NAME} Team</p>
          `
        });
        console.log(`📧 Approval email sent to ${creatorUser.email}`);
      }
    } catch (emailErr) {
      console.error('⚠️  Approval notification email failed (non-fatal):', emailErr.message);
    }

    res.json({
      success: true,
      message: 'Product approved and mirrored to store successfully',
      product: creatorProduct,
      mainProductId: mainProduct._id
    });

  } catch (error) {
    console.error('❌ Review product error:', error);
    res.status(500).json({ success: false, message: 'Review failed', error: error.message });
  }
});

// ── ADMIN: GET ALL AFFILIATES ────────────────────────────────────
app.get('/api/admin/affiliates', authenticateAdmin, async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 20 } = req.query;
    const query = status !== 'all' ? { status } : {};
    const [affiliates, total] = await Promise.all([
      Affiliate.find(query)
        .populate('userId', 'fullName email createdAt country')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit)),
      Affiliate.countDocuments(query)
    ]);
    // Attach earnings summary per affiliate
    const enriched = await Promise.all(affiliates.map(async (a) => {
      const earnings = await EarningsLedger.aggregate([
        { $match: { recipientId: a.userId, recipientType: 'affiliate' } },
        { $group: { _id: '$status', total: { $sum: '$earningAmount' } } }
      ]);
      const map = {};
      earnings.forEach(e => map[e._id] = e.total);
      return {
        ...a.toObject(),
        earnings: {
          confirmed: map.confirmed || 0,
          pending:   map.pending   || 0,
          paid:      map.paid      || 0
        }
      };
    }));
    res.json({ success: true, affiliates: enriched, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch(e) {
    console.error('❌ Admin affiliates error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch affiliates' });
  }
});

// ── ADMIN: SUSPEND / REINSTATE AFFILIATE ────────────────────────
app.put('/api/admin/affiliates/:affiliateId/suspend', authenticateAdmin, async (req, res) => {
  try {
    const { suspend } = req.body;
    const affiliate = await Affiliate.findById(req.params.affiliateId).populate('userId','fullName email');
    if (!affiliate) return res.status(404).json({ success: false, message: 'Affiliate not found' });
    affiliate.status = suspend ? 'suspended' : 'active';
    await affiliate.save();
    res.json({ success: true, message: `Affiliate ${suspend ? 'suspended' : 'reinstated'}`, affiliate });
  } catch(e) {
    res.status(500).json({ success: false, message: 'Failed to update affiliate' });
  }
});

// ── ADMIN: GET SINGLE AFFILIATE DETAIL ──────────────────────────
app.get('/api/admin/affiliates/:affiliateId', authenticateAdmin, async (req, res) => {
  try {
    const affiliate = await Affiliate.findById(req.params.affiliateId)
      .populate('userId', 'fullName email country createdAt');
    if (!affiliate) return res.status(404).json({ success: false, message: 'Affiliate not found' });
    const [earnings, clicks, payoutHistory] = await Promise.all([
      EarningsLedger.find({ recipientId: affiliate.userId, recipientType: 'affiliate' })
        .sort({ createdAt: -1 }).limit(20)
        .populate('productId', 'title').populate('orderId', 'orderReference'),
      AffiliateClick.find({ affiliateId: affiliate._id }).sort({ clickedAt: -1 }).limit(20)
        .populate('productId', 'title'),
      PayoutRequest.find({ requesterId: affiliate.userId, requesterType: 'affiliate' })
        .sort({ requestedAt: -1 }).limit(10)
    ]);
    res.json({ success: true, affiliate: affiliate.toObject(), earnings, clicks, payoutHistory });
  } catch(e) {
    res.status(500).json({ success: false, message: 'Failed to fetch affiliate detail' });
  }
});

// ── ADMIN: PROCESS AFFILIATE PAYOUT ─────────────────────────────
app.put('/api/admin/affiliates/payouts/:payoutId', authenticateAdmin, async (req, res) => {
  try {
    const { action, adminNotes } = req.body;
    const payout = await PayoutRequest.findById(req.params.payoutId);
    if (!payout) return res.status(404).json({ success: false, message: 'Payout not found' });
    if (payout.requesterType !== 'affiliate') {
    return res.status(400).json({ success: false, message: 'This endpoint is for affiliate payouts only' });
  }
    if (action === 'complete') {
      payout.status = 'completed'; payout.processedAt = new Date();
      payout.processedBy = req.adminUser._id; payout.adminNotes = adminNotes;
      await EarningsLedger.updateMany({ payoutRequestId: payout._id }, { status: 'paid', paidAt: new Date() });
      await Affiliate.findOneAndUpdate({ userId: payout.requesterId }, {
        $inc: { pendingEarnings: -payout.amount, paidEarnings: payout.amount }
      });
    } else if (action === 'reject') {
      payout.status = 'rejected'; payout.processedAt = new Date();
      payout.processedBy = req.adminUser._id; payout.adminNotes = adminNotes;
      await EarningsLedger.updateMany({ payoutRequestId: payout._id }, { status: 'confirmed', payoutRequestId: null });
    }
    await payout.save();
    res.json({ success: true, message: `Affiliate payout ${action}d`, payout });
  } catch(e) {
    res.status(500).json({ success: false, message: 'Payout update failed' });
  }
});


// ── ADMIN: MANAGE PAYOUTS ───────────────────────────────────────
app.get('/api/admin/payouts', authenticateAdmin, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    
    const payouts = await PayoutRequest.find({ status })
      .populate('requesterId', 'fullName email')
      .sort({ requestedAt: -1 });

    res.json({ success: true, payouts, count: payouts.length });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch payouts' });
  }
});

// ── ADMIN: GET ALL AFFILIATES (with earnings summary) ────────────
app.get('/api/admin/affiliates', authenticateAdmin, async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 50 } = req.query;
    const query = status !== 'all' ? { status } : {};
 
    const [affiliates, total] = await Promise.all([
      Affiliate.find(query)
        .populate('userId', 'fullName email createdAt country')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit)),
      Affiliate.countDocuments(query)
    ]);
 
    // Attach earnings breakdown per affiliate
    const enriched = await Promise.all(affiliates.map(async (a) => {
      const earningsAgg = await EarningsLedger.aggregate([
        { $match: { recipientId: a.userId, recipientType: 'affiliate' } },
        { $group: { _id: '$status', total: { $sum: '$earningAmount' } } }
      ]);
      const map = {};
      earningsAgg.forEach(e => { map[e._id] = e.total; });
      return {
        ...a.toObject(),
        earnings: {
          confirmed: map.confirmed || 0,
          pending:   map.pending   || 0,
          paid:      map.paid      || 0
        }
      };
    }));
 
    res.json({
      success: true,
      affiliates: enriched,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) }
    });
  } catch (e) {
    console.error('❌ Admin affiliates error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch affiliates' });
  }
});
 

// ── ADMIN: GET SINGLE AFFILIATE DETAIL ───────────────────────────
app.get('/api/admin/affiliates/:affiliateId', authenticateAdmin, async (req, res) => {
  try {
    const affiliate = await Affiliate.findById(req.params.affiliateId)
      .populate('userId', 'fullName email country createdAt');
 
    if (!affiliate) {
      return res.status(404).json({ success: false, message: 'Affiliate not found' });
    }
 
    const [earnings, clicks, payoutHistory] = await Promise.all([
      EarningsLedger.find({ recipientId: affiliate.userId, recipientType: 'affiliate' })
        .sort({ createdAt: -1 }).limit(20)
        .populate('productId', 'title')
        .populate('orderId', 'orderReference'),
      AffiliateClick.find({ affiliateId: affiliate._id })
        .sort({ clickedAt: -1 }).limit(20)
        .populate('productId', 'title'),
      PayoutRequest.find({ requesterId: affiliate.userId, requesterType: 'affiliate' })
        .sort({ requestedAt: -1 }).limit(10)
    ]);
 
    res.json({ success: true, affiliate: affiliate.toObject(), earnings, clicks, payoutHistory });
  } catch (e) {
    console.error('❌ Affiliate detail error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch affiliate detail' });
  }
});
 
 
app.put('/api/admin/payouts/:payoutId', authenticateAdmin, async (req, res) => {
  try {
    const { action, adminNotes } = req.body; // action: 'complete' or 'reject'

    const payout = await PayoutRequest.findById(req.params.payoutId);
    if (!payout) {
      return res.status(404).json({ success: false, message: 'Payout not found' });
    }

    if (action === 'complete') {
  payout.status = 'completed';
  payout.processedAt = new Date();
  payout.processedBy = req.adminUser._id;
  payout.adminNotes = adminNotes;

  // Mark all associated earnings as paid
  await EarningsLedger.updateMany(
    { payoutRequestId: payout._id },
    { status: 'paid', paidAt: new Date() }
  );

  // FIX: Decrement pendingPayout and increment totalPaidOut on Creator document
  await Creator.findOneAndUpdate(
    { userId: payout.requesterId },
    {
      $inc: {
        pendingPayout: -payout.amount,
        totalPaidOut:   payout.amount
      }
    }
  );

} else if (action === 'reject') {
  payout.status = 'rejected';
  payout.processedAt = new Date();
  payout.processedBy = req.adminUser._id;
  payout.adminNotes = adminNotes;

  // Revert earnings back to confirmed so creator can request again
  await EarningsLedger.updateMany(
    { payoutRequestId: payout._id },
    { status: 'confirmed', payoutRequestId: null }
  );
  // NOTE: pendingPayout on Creator does NOT change on rejection —
  // the balance was never deducted, so it stays correct.
}

    await payout.save();

    res.json({ success: true, message: `Payout ${action}d`, payout });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Payout update failed' });
  }
});

// ── ADMIN: GET SINGLE CREATOR DETAIL ─────────────────────────────────────────
app.get('/api/admin/creators/:creatorId', authenticateAdmin, async (req, res) => {
  try {
    const creator = await Creator.findById(req.params.creatorId)
      .populate('userId', 'fullName email phone country createdAt lastLogin')
      .populate('reviewedBy', 'fullName email');

    if (!creator) {
      return res.status(404).json({ success: false, message: 'Creator not found' });
    }

    const [products, recentEarnings, payoutHistory] = await Promise.all([
      CreatorProduct.find({ creatorId: creator._id }).sort({ createdAt: -1 }),
      EarningsLedger.find({ recipientId: creator.userId, recipientType: 'creator' })
        .sort({ createdAt: -1 }).limit(10)
        .populate('orderId', 'orderReference total createdAt'),
      PayoutRequest.find({ requesterId: creator.userId, requesterType: 'creator' })
        .sort({ requestedAt: -1 }).limit(5)
    ]);

    res.json({
      success: true,
      creator: {
        ...creator.toObject(),
        products: {
          total:    products.length,
          approved: products.filter(p => p.status === 'approved').length,
          pending:  products.filter(p => p.status === 'pending_review').length,
          rejected: products.filter(p => p.status === 'rejected').length,
          list:     products
        },
        recentEarnings,
        payoutHistory
      }
    });
  } catch (error) {
    console.error('❌ Get creator detail error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch creator details' });
  }
});

// ── ADMIN: SUSPEND / UNSUSPEND CREATOR ────────────────────────────────────────
app.put('/api/admin/creators/:creatorId/suspend', authenticateAdmin, async (req, res) => {
  try {
    const { suspend, reason } = req.body; // suspend: true | false

    const creator = await Creator.findById(req.params.creatorId)
      .populate('userId', 'fullName email');

    if (!creator) {
      return res.status(404).json({ success: false, message: 'Creator not found' });
    }

    creator.isSuspended     = suspend === true;
    creator.suspensionReason = suspend ? (reason || 'Violated marketplace terms') : '';

    if (suspend) {
      creator.applicationStatus = 'suspended';
      // Also flag their products as inactive in the main store
      await Product.updateMany({ creatorId: creator._id }, { isActive: false });
    } else {
      creator.applicationStatus = 'approved';
      await Product.updateMany({ creatorId: creator._id }, { isActive: true });
    }

    await creator.save();

    console.log(`${suspend ? '🚫' : '✅'} Creator ${suspend ? 'suspended' : 'reinstated'}: ${creator.storeName}`);

    res.json({
      success: true,
      message: `Creator ${suspend ? 'suspended' : 'reinstated'} successfully`,
      creator: {
        id:                creator._id,
        storeName:         creator.storeName,
        applicationStatus: creator.applicationStatus,
        isSuspended:       creator.isSuspended
      }
    });
  } catch (error) {
    console.error('❌ Suspend creator error:', error);
    res.status(500).json({ success: false, message: 'Operation failed' });
  }
});

// ── ADMIN: UPDATE CREATOR COMMISSION RATES ────────────────────────────────────
app.put('/api/admin/creators/:creatorId/commissions', authenticateAdmin, async (req, res) => {
  try {
    const { platformCommissionRate, affiliateCommissionRate } = req.body;

    const creator = await Creator.findById(req.params.creatorId);
    if (!creator) {
      return res.status(404).json({ success: false, message: 'Creator not found' });
    }

    if (platformCommissionRate !== undefined) {
      if (platformCommissionRate < 0 || platformCommissionRate > 100)
        return res.status(400).json({ success: false, message: 'Rate must be 0–100' });
      creator.platformCommissionRate = platformCommissionRate;
    }
    if (affiliateCommissionRate !== undefined) {
      if (affiliateCommissionRate < 0 || affiliateCommissionRate > 100)
        return res.status(400).json({ success: false, message: 'Rate must be 0–100' });
      creator.affiliateCommissionRate = affiliateCommissionRate;
    }

    await creator.save();

    res.json({
      success: true,
      message: 'Commission rates updated',
      platformCommissionRate:  creator.platformCommissionRate,
      affiliateCommissionRate: creator.affiliateCommissionRate
    });
  } catch (error) {
    console.error('❌ Update commissions error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// AFFILIATE ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// ── REGISTER AS AFFILIATE (any logged-in user) ──────────────────
app.post('/api/affiliate/register', authenticateToken, async (req, res) => {
  try {
    const existing = await Affiliate.findOne({ userId: toObjectId(req.user.userId) });
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: `You are already registered as an affiliate (Code: ${existing.affiliateCode})` 
      });
    }

    // Generate unique affiliate code from username
    const user = await User.findById(req.user.userId);
    const baseCode = user.fullName.replace(/\s+/g, '').toUpperCase().substring(0, 6);
    let affiliateCode = baseCode + Math.random().toString(36).substring(2, 6).toUpperCase();

    // Ensure uniqueness
    const codeExists = await Affiliate.findOne({ affiliateCode });
    if (codeExists) {
      affiliateCode = baseCode + Date.now().toString(36).toUpperCase().slice(-4);
    }

    const affiliate = new Affiliate({
      userId: req.user.userId,
      affiliateCode,
      status: 'active'
    });

    await affiliate.save();

    console.log(`🔗 New affiliate: ${user.fullName} - Code: ${affiliateCode}`);

    res.status(201).json({
      success: true,
      message: 'Welcome to the affiliate program!',
      affiliate: {
        affiliateCode,
        affiliateLink: `${global.FRONTEND_URL}?ref=${affiliateCode}`,
        status: 'active'
      }
    });

  } catch (error) {
    console.error('❌ Affiliate register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});


// ── GET AFFILIATE DASHBOARD ─────────────────────────────────────
app.get('/api/affiliate/dashboard', authenticateToken, async (req, res) => {
  try {
    const affiliate = await Affiliate.findOne({ userId: toObjectId(req.user.userId) });
    if (!affiliate) {
      return res.status(404).json({ success: false, message: 'Affiliate account not found' });
    }

    const [earnings, recentClicks] = await Promise.all([
      EarningsLedger.aggregate([
        { $match: { recipientId: new mongoose.Types.ObjectId(req.user.userId), recipientType: 'affiliate' }},
        { $group: { 
          _id: '$status', 
          total: { $sum: '$earningAmount' },
          count: { $sum: 1 }
        }}
      ]),
      AffiliateClick.find({ affiliateId: affiliate._id })
        .sort({ clickedAt: -1 })
        .limit(20)
        .populate('productId', 'title price')
    ]);

    const earningsMap = {};
    earnings.forEach(e => { earningsMap[e._id] = e; });

      // Generate affiliate links for all approved creator products
      const availableProducts = await CreatorProduct.find({ status: 'approved' })
    .populate('productId', 'title price category')
    .populate('creatorId', 'storeName storeSlug');

    res.json({
      success: true,
      affiliate: {
        affiliateCode: affiliate.affiliateCode,
        affiliateLink: `${global.FRONTEND_URL}?ref=${affiliate.affiliateCode}`,
        status: affiliate.status,
        totalClicks: affiliate.totalClicks,
         payoutMethod:  affiliate.payoutMethod  || null,   // ← ADD
          payoutDetails: affiliate.payoutDetails || null,   // ← ADD
          payoutThreshold: affiliate.payoutThreshold || 20,  // ← ADD          
        totalConversions: affiliate.totalConversions,
        conversionRate: affiliate.totalClicks > 0 
        
          ? ((affiliate.totalConversions / affiliate.totalClicks) * 100).toFixed(1) + '%' 
          : '0%'
          },
      earnings: {
        pending: earningsMap['pending']?.total || 0,
        confirmed: earningsMap['confirmed']?.total || 0,
        paid: earningsMap['paid']?.total || 0,
        total: affiliate.totalEarnings
      },
      recentClicks,
      availableProducts: availableProducts.map(p => ({
        productId: p.productId?._id,
        title: p.title,
        price: p.approvedPrice,
        commission: p.affiliateCommission,
        commissionAmount: (p.approvedPrice * p.affiliateCommission / 100).toFixed(2),
        storeSlug:        p.creatorId?.storeSlug || null,
        storeName:        p.creatorId?.storeName  || null, 
        affiliateLink: `${global.FRONTEND_URL}/product/${p.productId?._id}?ref=${affiliate.affiliateCode}`
      }))
    });

  } catch (error) {
    console.error('❌ Affiliate dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard' });
  }
});


// ── TRACK AFFILIATE CLICK (called when someone visits via ref link) ─
app.post('/api/affiliate/track-click', async (req, res) => {
  try {
    const { affiliateCode, productId } = req.body;

    const affiliate = await Affiliate.findOne({ affiliateCode, status: 'active' });
    if (!affiliate) {
      return res.json({ success: false, message: 'Invalid affiliate code' });
    }

    await AffiliateClick.create({
      affiliateId: affiliate._id,
      affiliateCode,
      productId: productId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer
    });

    affiliate.totalClicks += 1;
    await affiliate.save();

    res.json({ success: true, message: 'Click tracked' });

  } catch (error) {
    console.error('❌ Track click error:', error);
    res.json({ success: false }); // Silent fail - don't block the user
  }
});


// ── AFFILIATE: REQUEST PAYOUT ───────────────────────────────────
app.post('/api/affiliate/payout/request', authenticateToken, async (req, res) => {
  try {
    const { payoutMethod, payoutDetails } = req.body;
    const affiliate = await Affiliate.findOne({ userId: toObjectId(req.user.userId) });

    if (!affiliate || affiliate.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Active affiliate account required' });
    }

    const confirmed = await EarningsLedger.aggregate([
      { $match: { 
        recipientId: new mongoose.Types.ObjectId(req.user.userId), 
        recipientType: 'affiliate', 
        status: 'confirmed' 
      }},
      { $group: { _id: null, total: { $sum: '$earningAmount' }}}
    ]);

    const available = confirmed[0]?.total || 0;

    if (available < affiliate.payoutThreshold) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum payout is $${affiliate.payoutThreshold}. You have $${available.toFixed(2)}.` 
      });
    }

    const payoutRequest = new PayoutRequest({
      requesterId: new mongoose.Types.ObjectId(req.user.userId),
      requesterType: 'affiliate',
      amount: available,
      payoutMethod,
      payoutDetails
    });

    await payoutRequest.save();

    await EarningsLedger.updateMany(
      { recipientId: new mongoose.Types.ObjectId(req.user.userId), recipientType: 'affiliate', status: 'confirmed' },
      { status: 'pending', payoutRequestId: payoutRequest._id }
    );

    res.json({ 
      success: true, 
      message: `Payout of $${available.toFixed(2)} requested. Processing in 3-5 business days.` 
    });

  } catch (error) {
    console.error('❌ Affiliate payout error:', error);
    res.status(500).json({ success: false, message: 'Payout request failed' });
  }
});

// ── AFFILIATE: SAVE PAYOUT DETAILS ──────────────────────────────
app.put('/api/affiliate/payout/details', authenticateToken, async (req, res) => {
  try {
    const { payoutMethod, payoutDetails } = req.body;
    const affiliate = await Affiliate.findOne({ userId: toObjectId(req.user.userId) });
    if (!affiliate) return res.status(404).json({ success: false, message: 'Affiliate not found' });
    affiliate.payoutMethod  = payoutMethod;
    affiliate.payoutDetails = payoutDetails;
    await affiliate.save();
    res.json({ success: true, message: 'Payout details saved' });
  } catch(e) {
    res.status(500).json({ success: false, message: 'Failed to save payout details' });
  }
});

// ── AFFILIATE: PAYOUT HISTORY ────────────────────────────────────
app.get('/api/affiliate/payout/history', authenticateToken, async (req, res) => {
  try {
    const payouts = await PayoutRequest.find({
      requesterId: toObjectId(req.user.userId),
      requesterType: 'affiliate'
    }).sort({ requestedAt: -1 }).limit(20);
    res.json({ success: true, payouts });
  } catch(e) {
    res.status(500).json({ success: false, message: 'Failed to fetch payout history' });
  }
});

// ── AFFILIATE: EARNINGS LEDGER ───────────────────────────────────
app.get('/api/affiliate/earnings', authenticateToken, async (req, res) => {
  try {
    const ledger = await EarningsLedger.find({
      recipientId: toObjectId(req.user.userId),
      recipientType: 'affiliate'
    })
    .sort({ createdAt: -1 }).limit(50)
    .populate('orderId', 'orderReference')
    .populate('productId', 'title');
    res.json({ success: true, ledger });
  } catch(e) {
    res.status(500).json({ success: false, message: 'Failed to fetch earnings' });
  }
});


// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║              SYSTEM STATUS API ENDPOINTS FOR UYEH TECH                    ║
// ║                  Add these to your existing server.js                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/*
  📝 INSTALLATION:
  
  1. Copy these endpoints into your server.js file
  2. Add them AFTER your other API routes (around line 2500)
  3. Make sure system-status-monitor.js is loaded first
*/

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

// Get current system status (PUBLIC)
app.get('/api/status/current', async (req, res) => {
  try {
    const services = await ServiceStatus.find({ isActive: true }).lean();

    const servicesData = {};
    const statuses = [];

    for (const service of services) {
      servicesData[service.serviceKey] = {
        name: service.serviceName,
        description: service.description,
        status: service.status,
        responseTime: service.responseTime || 0,
        uptime: parseFloat((service.uptime || 100).toFixed(2)),
        incidents: service.incidentCount || 0,
        lastChecked: service.lastChecked,
        metadata: service.metadata
      };

      statuses.push(service.status);
    }

    // Determine overall status
    let overall = 'operational';
    if (statuses.includes('outage')) {
      overall = 'outage';
    } else if (statuses.includes('degraded')) {
      overall = 'degraded';
    } else if (statuses.includes('maintenance')) {
      overall = 'maintenance';
    }

    res.json({
      success: true,
      overall,
      services: servicesData,
      lastUpdate: new Date(),
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Error fetching status:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch system status',
      message: error.message 
    });
  }
});

// Get 90-day uptime history (PUBLIC)
app.get('/api/status/uptime-history', async (req, res) => {
  try {
    const { days = 90, serviceKey } = req.query;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));

    let query = { date: { $gte: daysAgo } };
    if (serviceKey) {
      query.serviceKey = serviceKey;
    }

    const uptimeData = await DailyUptime.find(query)
      .sort({ date: 1 })
      .lean();

    // Group by date and calculate average
    const historyMap = new Map();

    uptimeData.forEach(record => {
      const dateStr = record.date.toISOString().split('T')[0];
      if (!historyMap.has(dateStr)) {
        historyMap.set(dateStr, []);
      }
      historyMap.get(dateStr).push(record.uptimePercentage);
    });

    const history = [];
    for (const [date, uptimes] of historyMap) {
      const avgUptime = uptimes.reduce((a, b) => a + b, 0) / uptimes.length;
      history.push({
        date,
        uptime: parseFloat(avgUptime.toFixed(2))
      });
    }

    // Fill in missing dates with 100% uptime
    const numDays = parseInt(days);
    for (let i = numDays - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      if (!history.find(h => h.date === dateStr)) {
        history.push({ date: dateStr, uptime: 100 });
      }
    }

    // Sort by date
    history.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate overall uptime
    const overall = history.length > 0
      ? (history.reduce((sum, h) => sum + h.uptime, 0) / history.length).toFixed(2)
      : 100;

    res.json({
      success: true,
      history,
      overall: parseFloat(overall),
      period: `${days} days`,
      serviceKey: serviceKey || 'all'
    });
  } catch (error) {
    console.error('❌ Error fetching uptime history:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch uptime history',
      message: error.message 
    });
  }
});

// Get recent incidents (PUBLIC)
app.get('/api/status/incidents', async (req, res) => {
  try {
    const { days = 90, limit = 10, status, serviceKey } = req.query;
    
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));

    let query = { startedAt: { $gte: daysAgo } };
    
    if (status) {
      query.status = status;
    }
    
    if (serviceKey) {
      query.serviceKey = serviceKey;
    }

    const incidents = await Incident.find(query)
      .sort({ startedAt: -1 })
      .limit(parseInt(limit))
      .lean();

    const formattedIncidents = incidents.map(incident => ({
      id: incident.incidentNumber,
      service: incident.serviceName,
      serviceKey: incident.serviceKey,
      title: incident.title,
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
      startTime: incident.startedAt,
      resolvedTime: incident.resolvedAt,
      duration: incident.resolvedAt 
        ? Math.round((incident.resolvedAt - incident.startedAt) / 1000 / 60) // minutes
        : null,
      updates: incident.updates.map(update => ({
        status: update.status,
        message: update.message,
        time: update.timestamp
      }))
    }));

    res.json({ 
      success: true,
      incidents: formattedIncidents,
      count: formattedIncidents.length,
      period: `${days} days`
    });
  } catch (error) {
    console.error('❌ Error fetching incidents:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch incidents',
      message: error.message 
    });
  }
});

// Get service-specific details (PUBLIC)
app.get('/api/status/service/:serviceKey', async (req, res) => {
  try {
    const { serviceKey } = req.params;
    
    const service = await ServiceStatus.findOne({ serviceKey }).lean();
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Get recent health checks (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const recentChecks = await HealthCheck.find({
      serviceKey,
      checkedAt: { $gte: yesterday }
    })
    .sort({ checkedAt: -1 })
    .limit(100)
    .lean();

    // Get recent incidents
    const recentIncidents = await Incident.find({ serviceKey })
      .sort({ startedAt: -1 })
      .limit(5)
      .lean();

    // Calculate statistics
    const checks = recentChecks.length;
    const successful = recentChecks.filter(c => c.status === 'operational').length;
    const avgResponseTime = checks > 0
      ? recentChecks.reduce((sum, c) => sum + (c.responseTime || 0), 0) / checks
      : 0;

    res.json({
      success: true,
      service: {
        key: service.serviceKey,
        name: service.serviceName,
        description: service.description,
        status: service.status,
        uptime: service.uptime,
        responseTime: service.responseTime,
        lastChecked: service.lastChecked,
        metadata: service.metadata
      },
      statistics: {
        last24Hours: {
          checks,
          successful,
          failed: checks - successful,
          uptimePercentage: checks > 0 ? ((successful / checks) * 100).toFixed(2) : 100,
          avgResponseTime: Math.round(avgResponseTime)
        }
      },
      recentChecks: recentChecks.slice(0, 20).map(c => ({
        status: c.status,
        responseTime: c.responseTime,
        checkedAt: c.checkedAt,
        error: c.errorMessage
      })),
      recentIncidents: recentIncidents.map(i => ({
        id: i.incidentNumber,
        title: i.title,
        severity: i.severity,
        status: i.status,
        startTime: i.startedAt,
        resolvedTime: i.resolvedAt
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching service details:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch service details',
      message: error.message
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN-ONLY API ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

// Manual health check trigger (ADMIN)
app.post('/api/admin/status/run-check', authenticateAdmin, async (req, res) => {
  try {
    const { runAllHealthChecks } = require('./system-status-monitor');
    
    console.log('🔍 Manual health check triggered by admin');
    await runAllHealthChecks();
    
    res.json({
      success: true,
      message: 'Health checks completed successfully'
    });
  } catch (error) {
    console.error('❌ Manual health check error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to run health checks',
      message: error.message
    });
  }
});

// Create manual incident (ADMIN)
app.post('/api/admin/status/incidents/create', authenticateAdmin, async (req, res) => {
  try {
    const { serviceKey, title, description, severity } = req.body;
    
    if (!serviceKey || !title) {
      return res.status(400).json({
        success: false,
        message: 'serviceKey and title are required'
      });
    }

    const service = await ServiceStatus.findOne({ serviceKey });
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const incidentNumber = `INC-${Date.now()}`;
    
    const incident = await Incident.create({
      incidentNumber,
      serviceKey,
      serviceName: service.serviceName,
      title,
      description: description || 'Incident created manually',
      severity: severity || 'medium',
      status: 'investigating',
      startedAt: new Date(),
      updates: [{
        status: 'investigating',
        message: 'Incident reported and under investigation.',
        timestamp: new Date()
      }]
    });

    console.log(`🚨 Manual incident created: ${incidentNumber}`);

    res.json({
      success: true,
      message: 'Incident created successfully',
      incident: {
        id: incident.incidentNumber,
        serviceKey: incident.serviceKey,
        title: incident.title,
        severity: incident.severity,
        status: incident.status
      }
    });
  } catch (error) {
    console.error('❌ Create incident error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create incident',
      message: error.message
    });
  }
});

// Update incident (ADMIN)
app.put('/api/admin/status/incidents/:incidentNumber', authenticateAdmin, async (req, res) => {
  try {
    const { incidentNumber } = req.params;
    const { status, message } = req.body;

    const incident = await Incident.findOne({ incidentNumber });
    
    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'Incident not found'
      });
    }

    if (status) {
      incident.status = status;
      
      if (status === 'resolved' && !incident.resolvedAt) {
        incident.resolvedAt = new Date();
      }
    }

    if (message) {
      incident.updates.push({
        status: incident.status,
        message,
        timestamp: new Date()
      });
    }

    await incident.save();

    console.log(`✅ Incident updated: ${incidentNumber}`);

    res.json({
      success: true,
      message: 'Incident updated successfully',
      incident: {
        id: incident.incidentNumber,
        status: incident.status,
        resolvedAt: incident.resolvedAt
      }
    });
  } catch (error) {
    console.error('❌ Update incident error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update incident',
      message: error.message
    });
  }
});

// Update service status manually (ADMIN)
app.put('/api/admin/status/service/:serviceKey', authenticateAdmin, async (req, res) => {
  try {
    const { serviceKey } = req.params;
    const { status, description } = req.body;

    const service = await ServiceStatus.findOne({ serviceKey });
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    if (status) {
      service.status = status;
    }

    if (description) {
      service.description = description;
    }

    await service.save();

    console.log(`✅ Service updated: ${serviceKey} -> ${status}`);

    res.json({
      success: true,
      message: 'Service status updated',
      service: {
        key: service.serviceKey,
        name: service.serviceName,
        status: service.status
      }
    });
  } catch (error) {
    console.error('❌ Update service error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update service',
      message: error.message
    });
  }
});

// Get monitoring statistics (ADMIN)
app.get('/api/admin/status/statistics', authenticateAdmin, async (req, res) => {
  try {
    const totalServices = await ServiceStatus.countDocuments({ isActive: true });
    const operationalServices = await ServiceStatus.countDocuments({ 
      isActive: true, 
      status: 'operational' 
    });
    const degradedServices = await ServiceStatus.countDocuments({ 
      isActive: true, 
      status: 'degraded' 
    });
    const outageServices = await ServiceStatus.countDocuments({ 
      isActive: true, 
      status: 'outage' 
    });

    const totalIncidents = await Incident.countDocuments();
    const openIncidents = await Incident.countDocuments({ 
      status: { $ne: 'resolved' } 
    });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const checksLast24h = await HealthCheck.countDocuments({
      checkedAt: { $gte: yesterday }
    });

    res.json({
      success: true,
      statistics: {
        services: {
          total: totalServices,
          operational: operationalServices,
          degraded: degradedServices,
          outage: outageServices
        },
        incidents: {
          total: totalIncidents,
          open: openIncidents,
          resolved: totalIncidents - openIncidents
        },
        monitoring: {
          checksLast24h,
          monitoringActive: true
        }
      }
    });
  } catch (error) {
    console.error('❌ Statistics error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});


// ========== ADMIN DASHBOARD OVERVIEW ==========

app.get('/api/admin/dashboard', authenticateAdmin, async (req, res) => {
  try {
    // Core counts (all parallel for performance)
    const [
      totalUsers, totalOrders, totalProducts, totalBlogPosts,
      publishedPosts, activeCoupons, totalDownloads, totalChats,
      pendingCreators, pendingCreatorProducts, openChats,
      totalCreators, approvedCreators, suspendedCreators,
      totalCreatorProducts, approvedCreatorProducts,
      totalAffiliates, activeAffiliates, suspendedAffiliates
    ] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      Product.countDocuments(),
      BlogPost.countDocuments(),
      BlogPost.countDocuments({ status: 'published' }),
      Coupon.countDocuments({ isActive: true }),
      Download.countDocuments(),
      Chat.countDocuments(),
      Creator.countDocuments({ applicationStatus: 'pending' }),
      CreatorProduct.countDocuments({ status: 'pending_review' }),
      Chat.countDocuments({ status: { $in: ['open', 'assigned', 'in-progress'] } }),
      Creator.countDocuments(),
      Creator.countDocuments({ applicationStatus: 'approved' }),
      Creator.countDocuments({ applicationStatus: 'suspended' }),
      CreatorProduct.countDocuments(),
      CreatorProduct.countDocuments({ status: 'approved' }),
      Affiliate.countDocuments(),
      Affiliate.countDocuments({ status: 'active' }),
      Affiliate.countDocuments({ status: 'suspended' })
    ]);
 
    // Separate payout counts (need requesterType split)
    const [pendingCreatorPayouts, pendingAffiliatePayouts] = await Promise.all([
      PayoutRequest.countDocuments({ status: 'pending', requesterType: 'creator' }),
      PayoutRequest.countDocuments({ status: 'pending', requesterType: 'affiliate' })
    ]);
    const pendingPayouts = pendingCreatorPayouts + pendingAffiliatePayouts;
 
    // Revenue aggregations
    const [revenueData, creatorEarningsData, affiliateEarningsData] = await Promise.all([
      Order.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      EarningsLedger.aggregate([
        { $match: { recipientType: 'creator', status: { $in: ['confirmed', 'paid'] } } },
        { $group: { _id: null, total: { $sum: '$earningAmount' } } }
      ]),
      EarningsLedger.aggregate([
        { $match: { recipientType: 'affiliate', status: { $in: ['confirmed', 'paid'] } } },
        { $group: { _id: null, total: { $sum: '$earningAmount' } } }
      ])
    ]);
 
    const totalRevenue          = revenueData[0]?.total          || 0;
    const totalCreatorEarnings  = creatorEarningsData[0]?.total  || 0;
    const totalAffiliateEarnings= affiliateEarningsData[0]?.total|| 0;
 
    // Recent stats (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [recentOrders, recentRevenueData, recentDownloads, newUsers, newChats] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Order.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Download.countDocuments({ downloadedAt: { $gte: sevenDaysAgo } }),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Chat.countDocuments({ createdAt: { $gte: sevenDaysAgo } })
    ]);
 
    // Active agents
    const activeAgents = await User.countDocuments({
      isAgent: true,
      'agentInfo.status': { $in: ['online', 'busy'] }
    });
 
    // Top products + recent orders
    const [topProducts, recentOrdersList] = await Promise.all([
      Order.aggregate([
        { $match: { status: 'completed' } },
        { $unwind: '$items' },
        { $group: { _id: '$items.title', count: { $sum: 1 }, revenue: { $sum: '$items.price' } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      Order.find().sort({ createdAt: -1 }).limit(10).populate('userId', 'fullName email')
    ]);
 
    res.json({
      success: true,
      dashboard: {
        overview: {
          // ── Core ──
          totalUsers, totalOrders, totalProducts, totalRevenue,
          activeCoupons, totalBlogPosts, publishedPosts, totalDownloads,
          totalChats, openChats, activeAgents,
          // ── Creator Marketplace ──
          pendingCreators, pendingCreatorProducts,
          pendingPayouts, pendingCreatorPayouts,
          totalCreators, approvedCreators, suspendedCreators,
          totalCreatorProducts, approvedCreatorProducts,
          totalCreatorEarnings,
          // ── Affiliates ──
          totalAffiliates, activeAffiliates, suspendedAffiliates,
          totalAffiliateEarnings, pendingAffiliatePayouts
        },
        recentStats: {
          newUsers, recentOrders,
          recentRevenue: recentRevenueData[0]?.total || 0,
          recentDownloads, newChats
        },
        topProducts,
        recentOrdersList
      }
    });
 
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
  }
});


app.post('/api/chat/:chatId/message', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { message, sender, senderId, senderName } = req.body;

    console.log(`📨 API message received for chat ${chatId} from ${sender}`);

    // Validate
    if (!message || !sender) {
      return res.status(400).json({
        success: false,
        message: 'Message and sender required'
      });
    }

    // Find chat
    const chat = await Chat.findOne({ chatId });
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found'
      });
    }

    // Create message object
    const messageObj = {
      messageId: `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender,
      senderId: senderId || 'system',
      senderName: senderName || (sender === 'agent' ? 'Agent' : 'Customer'),
      message: message.trim(),
      timestamp: new Date(),
      read: false
    };

    // Add to chat
    chat.messages.push(messageObj);
    chat.updatedAt = new Date();
    
    // Update status if needed
    if (chat.status === 'assigned') {
      chat.status = 'in-progress';
    }

    await chat.save();

    console.log(`✅ Message saved: ${messageObj.messageId}`);

    // ✅ INSTANT WebSocket broadcast
    const broadcastData = {
      type: 'chat_message',
      chatId,
      message: messageObj
    };

    let broadcastCount = 0;

    wss.clients.forEach((client) => {
      if (client.readyState === 1 && 
          (client.chatId === chatId || client.agentId)) {
        try {
          client.send(JSON.stringify(broadcastData));
          broadcastCount++;
        } catch (error) {
          console.error('Error broadcasting:', error);
        }
      }
    });

    console.log(`📢 Broadcasted to ${broadcastCount} clients`);

    // Send success response
    res.json({
      success: true,
      message: messageObj,
      broadcastCount
    });

  } catch (error) {
    console.error('❌ Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
});


function getFromCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Auto-clear old cache entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 5 * 60 * 1000);

function cacheMessage(chatId, message) {
  if (!messageCache.has(chatId)) {
    messageCache.set(chatId, []);
  }
  
  const messages = messageCache.get(chatId);
  messages.push({
    message,
    timestamp: Date.now()
  });
  
  // Keep only last 50 messages
  if (messages.length > 50) {
    messages.shift();
  }
  
  // Auto-clear old cache entries
  setTimeout(() => {
    messageCache.delete(chatId);
  }, CACHE_TTL);
}

function getCachedMessages(chatId) {
  const cached = messageCache.get(chatId);
  if (!cached) return null;
  
  const now = Date.now();
  return cached
    .filter(item => (now - item.timestamp) < CACHE_TTL)
    .map(item => item.message);
}


// Get All Chats (Agent/Admin)
app.get('/api/agent/chats', authenticateAgent, async (req, res) => {
  try {
    const { 
      status, 
      department, 
      priority, 
      page = 1,      // ✅ Add pagination
      limit = 20     // ✅ Add limit
    } = req.query;
    
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (department && department !== 'all') {
      query.department = department;
    }

    if (priority && priority !== 'all') {
      query.priority = priority;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [chats, total] = await Promise.all([
      global.Chat.find(query)
        .populate('assignedAgent', 'fullName email agentInfo')
        .sort({ updatedAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(), // ✅ Use lean() for better performance
      global.Chat.countDocuments(query)
    ]);

    res.json({
      success: true,
      chats: normalizeChats(chats),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Get chats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chats' });
  }
});


app.post('/api/agent/chats/:chatId/assign', authenticateAgent, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({ success: false, message: 'Agent ID required' });
    }

    const requestingAgentId = req.agentUser._id.toString();
    const targetAgentId = agentId.toString();
    
    const chat = await global.Chat.findOne({ chatId });
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat session not found' });
    }

    // Check if chat is already assigned to another agent
    if (chat.assignedAgent && chat.assignedAgent.toString() !== targetAgentId) {
      const assignedAgent = await global.User.findById(chat.assignedAgent);
      return res.status(400).json({ 
        success: false, 
        message: `This chat is already being handled by ${assignedAgent?.fullName || 'another agent'}` 
      });
    }

    // Check if chat is closed or resolved
    if (chat.status === 'closed' || chat.status === 'resolved') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot assign a closed or resolved chat' 
      });
    }

    const agent = await global.User.findById(agentId);
    if (!agent) {
      return res.status(400).json({ success: false, message: 'Agent not found' });
    }

    // Verify the person is actually an agent or admin
    if (!agent.isAgent && !agent.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only verified agents can pick up chats' 
      });
    }

    // Update previous agent stats if reassigning
    if (chat.assignedAgent && chat.assignedAgent.toString() !== agentId) {
      const previousAgent = await global.User.findById(chat.assignedAgent);
      if (previousAgent && previousAgent.agentInfo) {
        previousAgent.agentInfo.activeChats = Math.max(0, previousAgent.agentInfo.activeChats - 1);
        await previousAgent.save();
        console.log(`📉 Reduced activeChats for ${previousAgent.fullName}: ${previousAgent.agentInfo.activeChats}`);
      }
    }

    // Check if this is a new assignment or reconfirmation
    const wasAlreadyAssigned = chat.assignedAgent && chat.assignedAgent.toString() === agentId;
    
    // Assign the chat
    chat.assignedAgent = agentId;
    chat.status = 'assigned';
    
    // Add system message only for new assignments
    if (!wasAlreadyAssigned) {
      chat.messages.push({
        messageId: global.generateMessageId(),
        sender: 'system',
        senderId: 'system',
        senderName: 'System',
        message: `Chat picked up by agent: ${agent.fullName}`,
        timestamp: new Date()
      });
    }

    await chat.save();

    // Update agent stats (only for new assignments)
    if (!wasAlreadyAssigned && agent.agentInfo) {
      agent.agentInfo.activeChats = (agent.agentInfo.activeChats || 0) + 1;
      agent.agentInfo.totalChats = (agent.agentInfo.totalChats || 0) + 1;
      await agent.save();
      console.log(`📈 Increased activeChats for ${agent.fullName}: ${agent.agentInfo.activeChats}`);
    }

    // ✅ FIXED: Send email notification to agent
    if (!wasAlreadyAssigned) {
      try {
        await global.sendAgentAssignmentEmail(agent.email, {
          chatId: chat.chatId,
          customerName: chat.customerName,
          subject: chat.subject,
          department: chat.department,
          priority: chat.priority
        });
        console.log(`✅ Assignment email sent to ${agent.email}`);
      } catch (emailError) {
        console.error('❌ Failed to send assignment email:', emailError.message);
        // Don't fail the request if email fails
      }
    }

    // Notify the agent via WebSocket
    if (global.sendToAgent) {
      global.sendToAgent(agentId.toString(), {
        type: 'chat_assigned',
        chat: {
          chatId: chat.chatId,
          customerName: chat.customerName,
          subject: chat.subject,
          department: chat.department,
          priority: chat.priority
        }
      });
    }

    // Broadcast to ALL other agents that this chat is now taken
    if (global.wss && global.wss.clients) {
      global.wss.clients.forEach((client) => {
        if (client.agentId && client.agentId !== agentId.toString() && client.readyState === 1) {
          try {
            client.send(JSON.stringify({
              type: 'chat_taken',
              chatId: chat.chatId,
              assignedTo: agent.fullName,
              assignedAgentId: agentId.toString()
            }));
          } catch (error) {
            console.error('Error broadcasting chat taken:', error);
          }
        }
      });
    }

    console.log(`✅ Chat ${chatId} ${wasAlreadyAssigned ? 'confirmed for' : 'assigned to'} agent ${agent.fullName} (${agent.email})`);

    res.json({
      success: true,
      message: wasAlreadyAssigned ? 'Chat already assigned to you' : 'Chat successfully picked up!',
      chat: {
        chatId: chat.chatId,
        assignedAgent: {
          id: agent._id,
          name: agent.fullName,
          email: agent.email
        },
        status: chat.status
      }
    });
  } catch (error) {
    console.error('❌ Assign chat error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to assign chat',
      error: error.message 
    });
  }
});

// Admin assigns chat to specific agent (different from self-assignment)
app.post('/api/admin/chats/:chatId/assign', authenticateAdmin, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({ success: false, message: 'Agent ID required' });
    }

    const chat = await global.Chat.findOne({ chatId });
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat session not found' });
    }

    const agent = await global.User.findById(agentId);
    if (!agent || (!agent.isAgent && !agent.isAdmin)) {
      return res.status(400).json({ success: false, message: 'Invalid agent ID' });
    }

    // Update previous agent stats if chat was already assigned
    if (chat.assignedAgent) {
      const previousAgent = await global.User.findById(chat.assignedAgent);
      if (previousAgent && previousAgent.agentInfo) {
        previousAgent.agentInfo.activeChats = Math.max(0, previousAgent.agentInfo.activeChats - 1);
        await previousAgent.save();
      }
    }

    chat.assignedAgent = agentId;
    chat.status = 'assigned';
    
    // Add system message
    chat.messages.push({
      messageId: global.generateMessageId(),
      sender: 'system',
      senderId: 'system',
      senderName: 'System',
      message: `Chat assigned to agent: ${agent.fullName} by admin`,
      timestamp: new Date()
    });

    await chat.save();

    // Update new agent stats
    if (agent.agentInfo) {
      agent.agentInfo.activeChats += 1;
      agent.agentInfo.totalChats += 1;
      await agent.save();
    }

    // ✅ SEND EMAIL NOTIFICATION
    try {
      await global.sendAgentAssignmentEmail(agent.email, {
        chatId: chat.chatId,
        customerName: chat.customerName,
        subject: chat.subject,
        department: chat.department,
        priority: chat.priority
      });
      console.log(`✅ Admin assignment email sent to ${agent.email}`);
    } catch (emailError) {
      console.error('❌ Failed to send assignment email:', emailError.message);
    }

    // Notify agent via WebSocket
    if (global.sendToAgent) {
      global.sendToAgent(agentId.toString(), {
        type: 'chat_assigned',
        chat: {
          chatId: chat.chatId,
          customerName: chat.customerName,
          subject: chat.subject,
          department: chat.department,
          priority: chat.priority
        }
      });
    }

    console.log(`👨‍💼 Admin assigned chat ${chatId} to agent ${agent.fullName}`);

    res.json({
      success: true,
      message: 'Chat assigned successfully by admin',
      chat: {
        chatId: chat.chatId,
        assignedAgent: agent.fullName,
        status: chat.status
      }
    });
  } catch (error) {
    console.error('❌ Admin assign chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign chat' });
  }
});

// Around line 1850 - Verify this works
app.put('/api/agent/status', authenticateAgent, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['online', 'offline', 'busy', 'away'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const agent = await global.User.findById(req.agentUser._id);
    if (!agent || !agent.agentInfo) {
      return res.status(400).json({ success: false, message: 'User is not an agent' });
    }

    agent.agentInfo.status = status;
    agent.lastActivity = new Date();
    await agent.save();

    console.log(`👨‍💼 Agent ${agent.fullName} status: ${status}`);

    res.json({
      success: true,
      message: 'Status updated successfully',
      status: status,
      agentInfo: agent.agentInfo // ✅ Return full agent info
    });
  } catch (error) {
    console.error('❌ Update status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// Get All Agents (Admin)
app.get('/api/admin/agents', authenticateAdmin, async (req, res) => {
  try {
    const agents = await User.find({ isAgent: true })
      .select('fullName email agentInfo lastActivity')
      .sort({ 'agentInfo.totalChats': -1 });

    res.json({
      success: true,
      agents: agents.map(agent => ({
        id: agent._id,
        name: agent.fullName,
        email: agent.email,
        department: agent.agentInfo.department,
        status: agent.agentInfo.status,
        activeChats: agent.agentInfo.activeChats,
        maxChats: agent.agentInfo.maxChats,
        totalChats: agent.agentInfo.totalChats,
        resolvedChats: agent.agentInfo.resolvedChats,
        rating: agent.agentInfo.rating,
        lastActivity: agent.lastActivity
      })),
      count: agents.length
    });
  } catch (error) {
    console.error('❌ Get agents error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch agents' });
  }
});

// Update Agent Settings (Admin)
app.put('/api/admin/agents/:agentId', authenticateAdmin, async (req, res) => {
  try {
    const { department, maxChats, status } = req.body;

    const agent = await User.findById(req.params.agentId);
    if (!agent || !agent.isAgent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    if (department) agent.agentInfo.department = department;
    if (maxChats !== undefined) agent.agentInfo.maxChats = maxChats;
    if (status) agent.agentInfo.status = status;

    await agent.save();

    console.log(`⚙️  Agent ${agent.fullName} settings updated`);

    res.json({
      success: true,
      message: 'Agent settings updated successfully',
      agent: {
        id: agent._id,
        name: agent.fullName,
        department: agent.agentInfo.department,
        maxChats: agent.agentInfo.maxChats,
        status: agent.agentInfo.status
      }
    });
  } catch (error) {
    console.error('❌ Update agent error:', error);
    res.status(500).json({ success: false, message: 'Failed to update agent settings' });
  }
});

console.log('\n✅ Part 6 Loaded: Chat System & Support Tickets Ready');
console.log('💬 Endpoints: Customer Chat, Agent Dashboard, File Upload, Real-time Updates\n');


// ========== ADMIN ANALYTICS ==========
app.get('/api/admin/analytics', authenticateAdmin, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    let startDate;
    const now = new Date();
    
    switch(period) {
      case '24h':
        startDate = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    }

    // Daily revenue and orders
    const dailyStats = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        orders: { $sum: 1 },
        revenue: { $sum: '$total' },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
      }},
      { $sort: { _id: 1 } }
    ]);

    // User growth
    const userGrowth = await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

 
    const chatTrends = await Chat.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Download trends
    const downloadTrends = await Download.aggregate([
      { $match: { downloadedAt: { $gte: startDate } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$downloadedAt' } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Product performance
    const productPerformance = await Order.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: startDate } } },
      { $unwind: '$items' },
      { $group: {
        _id: '$items.title',
        sales: { $sum: 1 },
        revenue: { $sum: '$items.price' }
      }},
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ]);

    // Category distribution
    const categoryStats = await Order.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: startDate } } },
      { $unwind: '$items' },
      { $group: {
        _id: '$items.category',
        count: { $sum: 1 },
        revenue: { $sum: '$items.price' }
      }},
      { $sort: { revenue: -1 } }
    ]);

   
    const agentPerformance = await Chat.aggregate([
      { $match: { assignedAgent: { $ne: null }, createdAt: { $gte: startDate } } },
      { $lookup: {
        from: 'users',
        localField: 'assignedAgent',
        foreignField: '_id',
        as: 'agent'
      }},
      { $unwind: '$agent' },
      { $group: {
        _id: '$assignedAgent',
        agentName: { $first: '$agent.fullName' },
        totalChats: { $sum: 1 },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        avgResponseTime: { $avg: '$firstResponseTime' }
      }},
      { $sort: { totalChats: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      analytics: {
        period,
        startDate,
        dailyStats,
        userGrowth,
        downloadTrends,
        chatTrends, 
        productPerformance,
        categoryStats,
        agentPerformance 
      }
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
  }
});


// ========== USER MANAGEMENT ==========

// Get All Users (with pagination and search)
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = 'all', role = 'all' } = req.query;
    
    let query = {};
    
    // Search by name or email
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by status
    if (status === 'banned') {
      query.isBanned = true;
    } else if (status === 'active') {
      query.isBanned = false;
    }

    // Filter by role 
    if (role === 'admin') {
      query.isAdmin = true;
    } else if (role === 'agent') {
      query.isAgent = true;
    } else if (role === 'user') {
      query.isAdmin = false;
      query.isAgent = false;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(query)
      .select('-password -twoFactorSecret')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await User.countDocuments(query);

    // Add statistics for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const orderCount = await Order.countDocuments({ userId: user._id });
        const downloadCount = await Download.countDocuments({ userId: user._id });
        const chatCount = await Chat.countDocuments({ customerId: user.email }); 
        const totalSpent = await Order.aggregate([
          { $match: { userId: user._id, status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$total' } } }
        ]);
        return {
          ...user.toObject(),
          orderCount,
          downloadCount,
          chatCount, 
          totalSpent: totalSpent[0]?.total || 0
        };
      })
    );

    res.json({
      success: true,
      users: usersWithStats,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// Get Single User Details
app.get('/api/admin/users/:userId', authenticateAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password -twoFactorSecret');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get user's orders
    const orders = await Order.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(10);
    
    const orderCount = await Order.countDocuments({ userId: user._id });
    const downloadCount = await Download.countDocuments({ userId: user._id });
    
    // Get user's chats 
    const chats = await Chat.find({ customerId: user.email })
      .sort({ createdAt: -1 })
      .limit(10);
    const chatCount = await Chat.countDocuments({ customerId: user.email });

    // Calculate total spent
    const totalSpent = await Order.aggregate([
      { $match: { userId: user._id, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    res.json({
      success: true,
      user: {
        ...user.toObject(),
        orderCount,
        downloadCount,
        chatCount, 
        totalSpent: totalSpent[0]?.total || 0,
        recentOrders: orders,
        recentChats: chats 
      }
    });
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user details' });
  }
});

// Ban/Unban User
app.put('/api/admin/users/:userId/ban', authenticateAdmin, async (req, res) => {
  try {
    const { isBanned, banReason } = req.body;
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Cannot ban admin users
    if (user.isAdmin) {
      return res.status(400).json({ success: false, message: 'Cannot ban administrator accounts' });
    }

    user.isBanned = isBanned;
    user.banReason = isBanned ? (banReason || 'Violated terms of service') : '';
    await user.save();

    console.log(`${isBanned ? '🚫 User banned' : '✅ User unbanned'}: ${user.email}`);

    res.json({
      success: true,
      message: isBanned ? 'User has been banned' : 'User has been unbanned',
      user: {
        id: user._id,
        name: user.fullName,
        email: user.email,
        isBanned: user.isBanned,
        banReason: user.banReason
      }
    });
  } catch (error) {
    console.error('❌ Ban user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user status' });
  }
});

// Delete User
app.delete('/api/admin/users/:userId', authenticateAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Cannot delete own account
    if (userId === req.user.userId) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Cannot delete admin users
    if (user.isAdmin) {
      return res.status(400).json({ success: false, message: 'Cannot delete administrator accounts' });
    }

    // Delete user's data
    await Order.deleteMany({ userId: user._id });
    await Download.deleteMany({ userId: user._id });
    await PaymentMethod.deleteMany({ userId: user._id });
    await Chat.updateMany(
      { customerId: user.email },
      { $set: { customerName: 'Deleted User', customerEmail: 'deleted@example.com' } }
    );
    
    // Delete the user
    await User.findByIdAndDelete(userId);

    console.log(`🗑️  User deleted: ${user.email}`);

    res.json({
      success: true,
      message: 'User and associated data have been deleted'
    });
  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

// Promote User to Agent 
app.put('/api/admin/users/:userId/promote-agent', authenticateAdmin, async (req, res) => {
  try {
    const { department = 'General', maxChats = 5 } = req.body;
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.isAgent) {
      return res.status(400).json({ success: false, message: 'User is already an agent' });
    }

    user.isAgent = true;
    user.agentInfo = {
      department,
      status: 'offline',
      activeChats: 0,
      maxChats,
      rating: 0,
      totalChats: 0,
      resolvedChats: 0
    };
    await user.save();

    console.log(`👨‍💼 User promoted to agent: ${user.email}`);

    res.json({
      success: true,
      message: 'User has been promoted to agent',
      user: {
        id: user._id,
        name: user.fullName,
        email: user.email,
        isAgent: user.isAgent,
        agentInfo: user.agentInfo
      }
    });
  } catch (error) {
    console.error('❌ Promote agent error:', error);
    res.status(500).json({ success: false, message: 'Failed to promote user' });
  }
});

// Demote Agent to User 
app.put('/api/admin/users/:userId/demote-agent', authenticateAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.isAgent) {
      return res.status(400).json({ success: false, message: 'User is not an agent' });
    }

    // Unassign all chats
    await Chat.updateMany(
      { assignedAgent: user._id, status: { $ne: 'closed' } },
      { $set: { assignedAgent: null, status: 'open' } }
    );

    user.isAgent = false;
    user.agentInfo = undefined;
    await user.save();

    console.log(`👤 Agent demoted to user: ${user.email}`);

    res.json({
      success: true,
      message: 'Agent has been demoted to regular user',
      user: {
        id: user._id,
        name: user.fullName,
        email: user.email,
        isAgent: user.isAgent
      }
    });
  } catch (error) {
    console.error('❌ Demote agent error:', error);
    res.status(500).json({ success: false, message: 'Failed to demote agent' });
  }
});

// ========== SETTINGS MANAGEMENT ==========

app.get('/api/admin/settings', authenticateAdmin, async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = await SystemSettings.create({
        siteName:    'UYEH TECH',
        contactEmail: 'contact@uyehtech.com',
        supportEmail: 'support@uyehtech.com',
        allowRegistration: true,
        requireEmailVerification: true
      });
    }
    res.json({ success: true, settings });
  } catch (error) {
    console.error('❌ Get settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
});
 
 
// ── STEP 4: REPLACE /api/admin/settings PUT with this ───────────
 
app.put('/api/admin/settings', authenticateAdmin, async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = new SystemSettings();
    }
 
    // Merge carefully — don't wipe nested objects
    const allowed = [
      'siteName', 'siteDescription', 'siteUrl', 'contactEmail', 'supportEmail',
      'phone', 'address', 'logo', 'socialMedia',
      'maintenanceMode', 'maintenanceMessage', 'maintenanceTitle',
      'maintenanceETA', 'maintenanceBypassToken', 'maintenancePages',
      'allowRegistration', 'requireEmailVerification', 'allowGuestCheckout',
      'storeEnabled', 'blogEnabled', 'chatEnabled', 'creatorEnabled', 'affiliatesEnabled',
      'bannerEnabled', 'bannerText', 'bannerType', 'bannerLink', 'bannerLinkText', 'bannerDismissible',
      'paymentSettings', 'customCSS',
      'seoTitle', 'seoDescription', 'seoKeywords',
      'googleAnalyticsId', 'facebookPixelId'
    ];
 
    allowed.forEach(field => {
      if (req.body[field] !== undefined) {
        settings[field] = req.body[field];
      }
    });
 
    settings.updatedAt = Date.now();
    settings.updatedBy = req.adminUser.email;
    await settings.save();
 
    // Broadcast change to all connected WebSocket clients
    // so they can re-check settings without waiting for poll
    if (global.wss && global.wss.clients) {
      global.wss.clients.forEach(client => {
        if (client.readyState === 1) {
          try {
            client.send(JSON.stringify({
              type: 'settings_updated',
              maintenanceMode: settings.maintenanceMode,
              bannerEnabled:   settings.bannerEnabled,
              timestamp:       new Date()
            }));
          } catch (_) {}
        }
      });
    }
 
    console.log(`⚙️  Settings updated by ${req.adminUser.email}: maintenanceMode=${settings.maintenanceMode}, banner=${settings.bannerEnabled}`);
 
    res.json({
      success: true,
      message: 'Settings saved and broadcast to all connected clients',
      settings
    });
 
  } catch (error) {
    console.error('❌ Update settings error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});
 
 
// ── STEP 5: ADD this quick-toggle endpoint for maintenance ───────
// Lets admin flip maintenance on/off with one click from dashboard
 
app.post('/api/admin/settings/maintenance/toggle', authenticateAdmin, async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) settings = new SystemSettings();
 
    settings.maintenanceMode = !settings.maintenanceMode;
    settings.updatedAt = Date.now();
    settings.updatedBy = req.adminUser.email;
    await settings.save();
 
    // Broadcast to all WS clients
    if (global.wss && global.wss.clients) {
      global.wss.clients.forEach(client => {
        if (client.readyState === 1) {
          try {
            client.send(JSON.stringify({
              type: 'maintenance_toggled',
              maintenanceMode: settings.maintenanceMode,
              message: settings.maintenanceMessage
            }));
          } catch (_) {}
        }
      });
    }
 
    console.log(`🔧 Maintenance mode ${settings.maintenanceMode ? 'ENABLED' : 'DISABLED'} by ${req.adminUser.email}`);
 
    res.json({
      success: true,
      maintenanceMode: settings.maintenanceMode,
      message: `Maintenance mode ${settings.maintenanceMode ? 'enabled' : 'disabled'}`
    });
 
  } catch (error) {
    console.error('❌ Toggle maintenance error:', error);
    res.status(500).json({ success: false, message: 'Toggle failed' });
  }
});



// ========== ORDER MANAGEMENT ==========
app.get('/api/admin/orders', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'all', search = '' } = req.query;
    
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { orderReference: { $regex: search, $options: 'i' } },
        { 'customerInfo.email': { $regex: search, $options: 'i' } },
        { 'customerInfo.name': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await Order.find(query)
      .populate('userId', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      orders: orders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Get orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

app.get('/api/admin/orders/:orderId', authenticateAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('userId', 'fullName email phone');
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({
      success: true,
      order: order
    });
  } catch (error) {
    console.error('❌ Get order error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order' });
  }
});

app.put('/api/admin/orders/:orderId/status', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['pending', 'completed', 'failed', 'refunded'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.status = status;
    await order.save();

   
order.affiliateCode = req.body.affiliateCode || req.headers['x-affiliate-code'] || null;

    res.json({
      success: true,
      message: 'Order status updated',
      order: order
    });
  } catch (error) {
    console.error('❌ Update order error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

app.delete('/api/admin/orders/:orderId', authenticateAdmin, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.orderId);
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    console.error('❌ Delete order error:', error);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

// ========== USER ORDERS ==========
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.userId }).sort({ createdAt: -1 });

    res.json({
      success: true,
      orders: orders,
      count: orders.length
    });
  } catch (error) {
    console.error('❌ Get orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// ── BUYER: Get purchased products with full product metadata ──────────────
// Replaces the N+1 enrichment pattern on my-products.html
app.get('/api/orders/my-products', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find({
      userId: req.user.userId,
      status: 'completed',
      'paymentInfo.status': 'successful'
    }).sort({ createdAt: -1 }).lean();

    const productMap = new Map(); // deduplicate by product id

    for (const order of orders) {
      if (!order.items?.length) continue;

      for (const item of order.items) {
        const pid = item.id || item.productId;
        if (!pid || productMap.has(pid)) continue;

        // Strategy A: find by ObjectId on Product collection
        let product = null;
        if (pid.match(/^[a-f\d]{24}$/i)) {
         product = await Product.findById(pid)
            .select('title description category image images mediaType embedType embedUrl productType fileSize version hostedFile previewUrl previewType courseData audioData softwareData isActive')
            .lean();
        }

        // Strategy A2: pid might be a CreatorProduct._id — resolve to linked Product
        if (!product && pid.match(/^[a-f\d]{24}$/i)) {
          const cp = await CreatorProduct.findById(pid)
            .select('title description category mediaType embedType embedUrl productType fileSize hostedFile previewUrl previewType courseData audioData softwareData productId')
            .lean();
          if (cp) {
            if (cp.productId) {
              product = await Product.findById(cp.productId)
                .select('title description category image images mediaType embedType embedUrl productType fileSize version hostedFile previewUrl previewType courseData audioData softwareData')
                .lean();
            }
            if (!product) {
              console.warn(`⚠️ my-products: falling back to CreatorProduct doc for pid="${pid}" title="${cp.title}"`);
              product = cp;
            }
          }
        }

        // Strategy A3: pid matches Product.creatorProductId
        if (!product && pid.match(/^[a-f\d]{24}$/i)) {
          product = await Product.findOne({ creatorProductId: pid })
            .select('title description category image images mediaType embedType embedUrl productType fileSize version hostedFile previewUrl previewType courseData audioData softwareData isActive')
            .lean();
        }

        // Log miss so you can see what's failing in Render logs
        if (!product) {
          console.warn(`⚠️ my-products: no product found for pid="${pid}", title="${item.title}" — item will use fallback metadata`);
        }

        // Strategy B: find by title if ObjectId lookup failed
        if (!product && item.title) {
          product = await Product.findOne({ title: item.title, isActive: true })
            .select('title description category image images mediaType embedType embedUrl productType fileSize version hostedFile previewUrl previewType courseData audioData softwareData isActive')
            .lean();
        }

        // Strategy C: check CreatorProduct if still not found
        if (!product && item.title) {
          const cp = await CreatorProduct.findOne({ title: item.title, status: 'approved' })
            .select('title description category mediaType embedType embedUrl productType fileSize hostedFile previewUrl previewType courseData audioData softwareData productId')
            .lean();
            
          if (cp) {
            // Use linked main product if exists, otherwise use CreatorProduct fields
            if (cp.productId) {
              product = await Product.findById(cp.productId)
                .select('title description category image images mediaType embedType embedUrl productType fileSize version hostedFile previewUrl previewType courseData audioData softwareData')
                .lean();
            }
            if (!product) product = cp; // fallback: use CreatorProduct itself
          }
        }

        productMap.set(pid, {
          productId:      pid,
          title:          product?.title       || item.title       || 'Untitled',
          description:    product?.description || '',
          category:       product?.category    || item.category    || 'Digital Product',
          price:          item.price           || 0,
          image:          product?.image       || product?.images?.[0] || null,
          // ── Media fields from Product doc ──
          mediaType:     inferProductMediaType(product) || null,
          embedType:      product?.embedType   || null,
          productType:    product?.productType || 'download',
          fileSize:       product?.fileSize    || null,
          version:        product?.version     || null,
          // ── Delivery indicators (no raw URLs — those stay gated) ──
          hasHostedFile:  !!(product?.hostedFile?.publicId),
          hasEmbed:       !!(
                    (product?.embedType && product?.embedUrl) ||
                    product?.externalVideoUrl ||
                    product?.externalAudioUrl
                   ),
          hasCourse:      !!(product?.courseData?.sections?.length),
          previewType:    product?.previewType || 'none',
          embedUrl:       product?.embedUrl        || null,
          externalVideoUrl: product?.externalVideoUrl || null,
          externalAudioUrl: product?.externalAudioUrl || null,
          embedUrl:         product?.embedUrl         || null,
          embedType:        product?.embedType        || null,
          // ── Course meta (safe public info, no chapter URLs) ──
          coursePreview: product?.courseData ? {
            totalChapters: product.courseData.totalChapters || 0,
            totalDuration: product.courseData.totalDuration || 0,
            totalSections: product.courseData.totalSections || 0,
            level:         product.courseData.level         || 'all',
            language:      product.courseData.language      || 'English',
            certificate:   product.courseData.certificate   || false,
          } : null,
          
          // ── Audio meta (safe public) ──
          audioPreview: product?.audioData ? {
            genre:   product.audioData.genre   || null,
            bpm:     product.audioData.bpm     || null,
            key:     product.audioData.key     || null,
            license: product.audioData.license || null,
            stems:   product.audioData.stems   || false,
          } : null,
          // ── Order context ──
          orderId:        order._id,
          orderReference: order.orderReference,
          purchaseDate:   order.createdAt,
          orderTotal:     order.total,
        });
      }
    }

    res.json({
      success:  true,
      products: Array.from(productMap.values()),
      count:    productMap.size
    });

  } catch (error) {
    console.error('❌ /api/orders/my-products error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

// ========== CREATE ORDER WITH COUPON ==========
app.post('/api/orders/create-with-coupon', authenticateToken, async (req, res) => {
  try {
    const { items, subtotal, couponCode, customerInfo, orderReference, affiliateCode } = req.body;
    const affiliateRef = affiliateCode || req.headers['x-affiliate-code'] || null;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Order must have items' });
    }

    if (!subtotal || !customerInfo) {
      return res.status(400).json({ success: false, message: 'Missing order data' });
    }

    let discount = 0;
    let finalTotal = subtotal;
    let isFree = false;

    if (couponCode) {
      const cleanCode = couponCode.trim().toUpperCase();
      const coupon = await Coupon.findOne({ code: cleanCode, isActive: true });

       if (coupon) {
        if (coupon.usedBy && coupon.usedBy.some(id => id.toString() === req.user.userId.toString())) {
          return res.status(400).json({ success: false, message: 'You have already used this coupon' });
        }

        if (coupon.type === 'percentage') {
          discount = (subtotal * coupon.discount) / 100;
        } else {
          discount = coupon.discount;
        }

        discount = Math.min(discount, subtotal);
        finalTotal = Math.max(0, subtotal - discount);
        isFree = finalTotal === 0;

        coupon.usageCount += 1;
        coupon.usedBy.push(req.user.userId);
        await coupon.save();
      }

    }

    const order = new Order({
      userId: req.user.userId,
      orderReference: orderReference || 'UYEH-' + Date.now(),
      items,
      subtotal,
      discount,
      total: finalTotal,
      couponCode: couponCode || null,
       affiliateCode: affiliateRef || null,
      customerInfo,
      status: isFree ? 'completed' : 'pending',
      paymentInfo: {
        method: isFree ? 'coupon' : 'flutterwave',
        status: isFree ? 'successful' : 'pending',
        paidAt: isFree ? new Date() : null
      }
    });
await order.save();

if (isFree) {
    setImmediate(() => processOrderCommissions(order, affiliateRef || null)); // ← now defined
}

// ✅ FIX: Send email asynchronously (don't wait for it)
    if (isFree) {
      setImmediate(() => {
        sendOrderConfirmationEmail(customerInfo.email, order)
          .then(() => console.log(`✅ Confirmation email queued for ${customerInfo.email}`))
          .catch(err => console.error('❌ Email error:', err.message));
      });
    }

    // ✅ Respond immediately without waiting for email
    res.status(201).json({
      success: true,
      message: isFree ? '🎉 Order completed!' : 'Order created',
      order: {
        _id: order._id,
        orderReference: order.orderReference,
        total: order.total,
        discount: order.discount,
        status: order.status,
        items: order.items,
        isFree: isFree,
        paymentRequired: !isFree
      }
    });

  } catch (error) {
    console.error('❌ Create order error:', error);
    res.status(500).json({ success: false, message: 'Order creation failed' });
  }

});

// ========== VERIFY PAYMENT ==========
app.post('/api/orders/verify-payment', authenticateToken, async (req, res) => {
  try {
    const { transactionId, orderId, affiliateCode: bodyAffiliateCode } = req.body;
 
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
 
    // Guard: already verified — don't process twice
    if (order.status === 'completed') {
      return res.json({ success: true, message: 'Order already verified', order });
    }
 
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      { headers: { 'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}` } }
    );
 
    const paymentData = response.data.data;
 
    // ── Validate the transaction belongs to THIS order ─────────────────────
    // tx_ref is the orderReference we passed to Flutterwave at checkout.
    // This prevents someone reusing a valid transaction ID from a different order.
    const txRefMatchesOrder = paymentData.tx_ref &&
      (paymentData.tx_ref === order.orderReference ||
       paymentData.tx_ref.includes(order.orderReference) ||
       order.orderReference.includes(paymentData.tx_ref));
 
    if (!txRefMatchesOrder) {
      console.warn(`⚠️  tx_ref mismatch! Got "${paymentData.tx_ref}" for order "${order.orderReference}"`);
      return res.status(400).json({
        success: false,
        message: 'Transaction reference does not match this order'
      });
    }
 
    // ── Amount validation ──────────────────────────────────────────────────
    // Flutterwave returns amount in the currency it was charged in (e.g., NGN).
    // order.total should be in the SAME currency you sent to Flutterwave.
    // Allow a tiny tolerance for floating point rounding (0.5 units).
    const amountPaid     = paymentData.amount;          // what Flutterwave confirms
    const amountExpected = order.total;                 // what we expected
    const tolerance      = 0.5;                         // naira & cents tolerance
    const amountIsValid  = amountPaid >= (amountExpected - tolerance);
 
    if (paymentData.status === 'successful' && amountIsValid) {
 
      const affiliateCode = order.affiliateCode || bodyAffiliateCode ||
                            req.headers['x-affiliate-code'] || null;
 
      // ── Store verified payment amount on order ─────────────────────────
      // This is the KEY data processOrderCommissions needs to split correctly.
      order.status                       = 'completed';
      order.paymentInfo.transactionId    = transactionId;
      order.paymentInfo.transactionRef   = paymentData.tx_ref;
      order.paymentInfo.status           = 'successful';
      order.paymentInfo.paidAt           = new Date();
      order.paymentInfo.verifiedAmount   = amountPaid;      // ← NEW: actual amount paid
      order.paymentInfo.currency         = paymentData.currency || 'USD'; // ← NEW
      if (affiliateCode) order.affiliateCode = affiliateCode;
 
      await order.save();
 
      // Process commissions asynchronously — never block the response
      setImmediate(() => processOrderCommissions(order, affiliateCode || null));
 
      // Send confirmation email asynchronously
      setImmediate(() => {
        sendOrderConfirmationEmail(order.customerInfo.email, order)
          .then(() => console.log(`✅ Email queued for ${order.customerInfo.email}`))
          .catch(err => console.error('❌ Email error:', err.message));
      });
 
      return res.json({ success: true, message: 'Payment verified', order });
 
    } else {
      order.status              = 'failed';
      order.paymentInfo.status  = 'failed';
      await order.save();
 
      console.warn(`❌ Payment failed/underpaid: status=${paymentData.status}, paid=${amountPaid}, expected=${amountExpected}`);
      return res.status(400).json({
        success: false,
        message: paymentData.status !== 'successful'
          ? 'Payment was not successful'
          : `Amount paid (${amountPaid}) is less than order total (${amountExpected})`
      });
    }
 
  } catch (error) {
    console.error('❌ Verify payment error:', error);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});
 

// 🔒 GATED MEDIA ACCESS — Revised & fixed
app.get('/api/orders/:orderId/media-access', authenticateToken, async (req, res) => {
  try {
    const { orderId }   = req.params;
    const { productId } = req.query;
 
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId query parameter is required' });
    }
 
    // ── 1. Verify order ownership & payment ──────────────────────────────
    const order = await Order.findById(orderId).lean();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.userId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (order.status !== 'completed' || order.paymentInfo?.status !== 'successful') {
      return res.status(403).json({
        success: false,
        message: 'Payment not completed. Please complete your payment to access this content.',
        paymentRequired: true
      });
    }
 
    // ── 2. Confirm product is in this order ───────────────────────────────
    // Accept both items.id and items.productId fields (some older orders used
    // different field names)
    const orderItem = order.items.find(item =>
      String(item.id)        === String(productId) ||
      String(item.productId) === String(productId)
    );
    if (!orderItem) {
      return res.status(403).json({ success: false, message: 'This product was not part of your order' });
    }
 
    const isValidOid = (id) => id && String(id).match(/^[a-f\d]{24}$/i);
 
    // ── 3. Hardened multi-strategy product lookup ─────────────────────────
    // NOTE: isActive filter is intentionally REMOVED for paid buyers.
    // A paying customer has a right to their product regardless of active flag.
    let product    = null;
    let sourceType = null;
 
    // Strategy A — productId is a main Product ObjectId
    if (isValidOid(productId)) {
      product = await Product.findOne({
        $or: [
          { _id: productId },
          { creatorProductId: productId }   // merged A3 here
        ]
      }).lean();
      if (product) sourceType = 'Product';
    }
 
    // Strategy B — productId is a CreatorProduct._id
    if (!product && isValidOid(productId)) {
      const cp = await CreatorProduct.findById(productId).lean();
      if (cp) {
        if (cp.productId && isValidOid(cp.productId)) {
          product = await Product.findById(cp.productId).lean();
          if (product) sourceType = 'Product';
        }
        // If the mirrored Product doesn't exist yet (pending approval edge case),
        // serve directly from the CreatorProduct document
        if (!product) { product = cp; sourceType = 'CreatorProduct'; }
      }
    }
 
    // Strategy C — title fallback against Product collection
    if (!product && orderItem?.title) {
      product = await Product.findOne({ title: orderItem.title }).lean();
      if (product) sourceType = 'Product(title)';
    }
 
    // Strategy D — title fallback against CreatorProduct collection
    if (!product && orderItem?.title) {
      const cp = await CreatorProduct.findOne({ title: orderItem.title, status: 'approved' }).lean();
      if (cp) {
        if (cp.productId && isValidOid(cp.productId)) {
          product = await Product.findById(cp.productId).lean();
          if (product) sourceType = 'Product(cp-title)';
        }
        if (!product) { product = cp; sourceType = 'CreatorProduct(title)'; }
      }
    }
 
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found. Please contact support with your order reference: ' + (order.orderReference || orderId)
      });
    }
 
    // ── 4. INFER missing mediaType from productType ───────────────────────
    // Many products in the DB have mediaType=null because they were created
    // before that field was populated. We derive it here so delivery works.
    let effectiveMediaType = product.mediaType || null;
    let effectiveEmbedUrl  = product.embedUrl  || null;
    let effectiveEmbedType = product.embedType || null;
 
    if (!effectiveMediaType) {
      const pt = product.productType || 'download';
      if (pt === 'course')                                            effectiveMediaType = 'course';
      else if (pt === 'music')                                        effectiveMediaType = 'audio';
      else if (product.externalVideoUrl || product.externalAudioUrl) effectiveMediaType = product.externalVideoUrl ? 'video' : 'audio';
      else if (product.hostedFile?.publicId)                         effectiveMediaType = 'file';
      else if (product.courseData?.sections?.length)                 effectiveMediaType = 'course';
      else                                                            effectiveMediaType = 'file';
    }
 
    // Re-parse embed URLs if embedUrl is null but raw URL exists
    if (!effectiveEmbedUrl) {
      const rawUrl = product.externalVideoUrl || product.externalAudioUrl || null;
      if (rawUrl && typeof parseExternalMediaUrl === 'function') {
        const parsed = parseExternalMediaUrl(rawUrl);
        if (parsed.embedUrl && parsed.embedType !== 'unknown') {
          effectiveEmbedUrl  = parsed.embedUrl;
          effectiveEmbedType = parsed.embedType;
          // Also infer mediaType if still missing
          if (!effectiveMediaType || effectiveMediaType === 'file') {
            effectiveMediaType = parsed.mediaType || (product.externalVideoUrl ? 'video' : 'audio');
          }
        }
      }
    }
 
    // ── 5. Build response payload ─────────────────────────────────────────
    const responsePayload = {
      success:     true,
      productId,
      title:       product.title,
      productType: product.productType || 'download',
      mediaType:   effectiveMediaType,
      embedType:   effectiveEmbedType,
    };
 
    // ── Shared chapter sanitiser ──────────────────────────────────────────
    const sanitiseChapters_PATCHED = (sections) =>
  (sections || []).map(section => ({
    sectionTitle: section.sectionTitle,
    sectionOrder: section.sectionOrder,
    chapters: (section.chapters || []).map(ch => {
      // ── Resolve the best available source URL ─────────────────────────
      // Priority: pre-resolved embedUrl → raw externalUrl (re-parse live)
      // → hostedFile (generate signed URL)
      let finalEmbedUrl  = ch.embedUrl  || null;
      let finalEmbedType = ch.embedType || null;
      let finalPlayerType= ch.playerType|| null;
      let cloudinaryUrl  = null;
 
      // GAP 1 FIX: parse externalUrl live if embedUrl is still missing
      if (!finalEmbedUrl) {
        const rawUrl = ch.externalUrl || null;
        if (rawUrl && typeof parseExternalMediaUrl === 'function') {
          const parsed = parseExternalMediaUrl(rawUrl);
          if (parsed.embedType && parsed.embedType !== 'unknown') {
            finalEmbedUrl  = parsed.embedUrl;
            finalEmbedType = parsed.embedType;
          }
        }
      }
 
      // GAP 4 FIX: safely read hostedFile from Mixed field
      // After JSON round-trips, ch.hostedFile may be a plain object
      const hf = ch.hostedFile
        ? (typeof ch.hostedFile.toObject === 'function' ? ch.hostedFile.toObject() : ch.hostedFile)
        : null;
 
      if (hf && hf.publicId) {
        try {
          cloudinaryUrl = generateSecureDeliveryUrl(
            hf.publicId,
            hf.resourceType || 'video',
            7200
          );
        } catch (e) {
          cloudinaryUrl = hf.secureUrl || null; // fallback to raw URL
          console.warn(`⚠️  Chapter signed URL failed for ${hf.publicId}:`, e.message);
        }
      }
 
      // Derive playerType if not already set
      if (!finalPlayerType) {
        if (cloudinaryUrl && !finalEmbedUrl)                        finalPlayerType = 'cloudinary';
        else if (['youtube','vimeo','dailymotion','gdrive'].includes(finalEmbedType)) finalPlayerType = 'iframe';
        else if (finalEmbedType === 'soundcloud')                   finalPlayerType = 'soundcloud_widget';
        else if (finalEmbedType === 'direct')                       finalPlayerType = 'html5_video';
        else if (finalEmbedUrl)                                     finalPlayerType = 'iframe';
      }
 
      return {
        chapterTitle:  ch.chapterTitle  || `Chapter`,
        chapterOrder:  ch.chapterOrder  || 0,
        duration:      ch.duration      || null,
        isFree:        ch.isFree        || false,
        transcript:    ch.transcript    || null,
        notes:         ch.notes         || null,
        embedType:     finalEmbedType,
        embedUrl:      finalEmbedUrl,
        playerType:    finalPlayerType,
        cloudinaryUrl: cloudinaryUrl,
      };
    })
  }));
  const sanitiseChapters = sanitiseChapters_PATCHED;
 
    // ── Branch: COURSE (checked first, wins over mediaType) ──────────────
    if (
      effectiveMediaType === 'course' ||
      product.productType === 'course' ||
      product.courseData?.sections?.length
    ) {
      responsePayload.mediaType = 'course';
 
      const trailerUrl = effectiveEmbedUrl || null;
      if (trailerUrl) {
        responsePayload.trailerUrl  = trailerUrl;
        responsePayload.trailerType = effectiveEmbedType || null;
      }
 
      responsePayload.courseData = {
        totalDuration: product.courseData?.totalDuration,
        totalChapters: product.courseData?.totalChapters,
        level:         product.courseData?.level,
        language:      product.courseData?.language,
        certificate:   product.courseData?.certificate,
        sections:      sanitiseChapters(product.courseData?.sections)
      };
 
    // ── Branch: VIDEO / AUDIO embed ───────────────────────────────────────
    } else if (
      (effectiveMediaType === 'video' || effectiveMediaType === 'audio') &&
      effectiveEmbedUrl
    ) {
      responsePayload.embedUrl  = effectiveEmbedUrl;
      responsePayload.embedType = effectiveEmbedType;
 
      if (effectiveEmbedType === 'soundcloud') {
        responsePayload.playerType = 'soundcloud_widget';
      } else if (['youtube','vimeo','dailymotion','gdrive'].includes(effectiveEmbedType)) {
        responsePayload.playerType = 'iframe';
      } else if (effectiveEmbedType === 'direct') {
        responsePayload.playerType = effectiveMediaType === 'audio' ? 'html5_audio' : 'html5_video';
      } else {
        responsePayload.playerType = 'iframe';
      }
 
    // ── Branch: Hosted Cloudinary file ────────────────────────────────────
    } else if (product.hostedFile?.publicId) {
      try {
        responsePayload.downloadUrl = generateSecureDeliveryUrl(
          product.hostedFile.publicId,
          product.hostedFile.resourceType || 'raw',
          3600
        );
      } catch (_) {
        responsePayload.downloadUrl = product.hostedFile.secureUrl;
      }
      responsePayload.fileSize      = product.fileSize || null;
      responsePayload.format        = product.hostedFile.format || null;
      responsePayload.expiresInSecs = 3600;
      responsePayload.mediaType     = 'file';
 
    // ── Branch: Plain external download link (legacy) ─────────────────────
    } else if (product.downloadLink) {
      responsePayload.downloadUrl = product.downloadLink;
      responsePayload.mediaType   = 'file';
 
    // ── Branch: Nothing found ─────────────────────────────────────────────
    } else {
      return res.status(404).json({
        success: false,
        message: 'No downloadable content has been configured for this product yet. Please contact support with order reference: ' + (order.orderReference || '')
      });
    }
 
    // ── Extras: software details (only for software productType) ─────────
    if (product.productType === 'software' && product.softwareData) {
      const sd = product.softwareData;
      responsePayload.softwareData = {
        platform:      sd.platform      || [],
        licenseType:   sd.licenseType   || 'single',
        licenseKey:    sd.licenseKey    || null,
        supportPeriod: sd.supportPeriod || null,
        updatePeriod:  sd.updatePeriod  || null,
      };
    }
 
    // ── Extras: audio metadata (only for music/audio productType) ────────
    if (
      (product.productType === 'music' || effectiveMediaType === 'audio') &&
      product.audioData
    ) {
      const ad = product.audioData;
      responsePayload.audioData = {
        genre:   ad.genre   || null,
        bpm:     ad.bpm     || null,
        key:     ad.key     || null,
        mood:    ad.mood    || null,
        license: ad.license || null,
        stems:   ad.stems   || false,
      };
    }
 
    if (product.fileSize) responsePayload.fileSize = product.fileSize;
    if (product.version)  responsePayload.version  = product.version;
 
    // ── Log & track ───────────────────────────────────────────────────────
    console.log(`🔓 Media access: user ${req.user.userId} → "${product.title}" [${responsePayload.mediaType}/${responsePayload.embedType || '—'}] via ${sourceType}`);
 
    setImmediate(async () => {
      try {
        await Download.create({ userId: req.user.userId, productId: product._id, orderId });
      } catch (_) {}
    });
 
    return res.json(responsePayload);
 
  } catch (error) {
    console.error('❌ Media access error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve media access' });
  }
});
 
 
console.log('✅ Gate 2 — /api/orders/:orderId/media-access (fixed) Loaded');
 
 
// ─────────────────────────────────────────────────────────────────────────────
// 🔒 CHECK IF USER HAS ACCESS TO A PRODUCT (quick check, no URL reveal)
// GET /api/products/:productId/owenership-check
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/products/:productId/ownership-check', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.userId;
 
    const isValidOid = (id) => id && String(id).match(/^[a-f\d]{24}$/i);
 
    // ── Step 1: resolve what the caller's productId actually refers to ────
    // The frontend might pass:
    //   (a) a main Product._id
    //   (b) a CreatorProduct._id  (store page links use this)
    //   (c) a string that is neither (legacy / malformed)
    // We need to collect ALL IDs and titles that could represent this product
    // so the order query below can match on any of them.
 
    const candidateItemIds = new Set();   // values to match against order.items.id
    const candidateTitles  = new Set();   // fallback: match against order.items.title
    let   resolvedAs       = null;        // which strategy found the product
 
    // Strategy A: productId itself is a main Product ObjectId
    if (isValidOid(productId)) {
      const mainProduct = await Product.findById(productId)
        .select('_id title')
        .lean();
 
      if (mainProduct) {
        candidateItemIds.add(String(mainProduct._id));
        candidateTitles.add(mainProduct.title);
        resolvedAs = 'id';
      }
    }
 
    // Strategy B: productId is a CreatorProduct._id
    // (store pages link to CreatorProduct._id, not the mirrored Product._id)
    if (isValidOid(productId)) {
      const cp = await CreatorProduct.findById(productId)
        .select('_id title productId status')
        .lean();
 
      if (cp) {
        // Also add the mirrored main Product._id if it exists
        if (cp.productId && isValidOid(cp.productId)) {
          candidateItemIds.add(String(cp.productId));
          resolvedAs = resolvedAs || 'creatorProductId';
        }
        // Add the CreatorProduct._id itself — some older orders stored this
        candidateItemIds.add(String(cp._id));
        candidateTitles.add(cp.title);
        resolvedAs = resolvedAs || 'creatorProductId';
      }
    }
 
    // Strategy C: productId matches Product.creatorProductId field
    if (isValidOid(productId) && candidateItemIds.size === 0) {
      const linked = await Product.findOne({ creatorProductId: productId })
        .select('_id title')
        .lean();
 
      if (linked) {
        candidateItemIds.add(String(linked._id));
        candidateTitles.add(linked.title);
        resolvedAs = 'creatorProductId';
      }
    }
 
    // Always add the raw productId string as a candidate —
    // some orders stored it directly before the mirroring system existed
    candidateItemIds.add(String(productId));
 
    // ── Step 2: query orders using ALL candidate IDs ─────────────────────
    // BUG 1 FIX: check BOTH items.id AND items.productId
    // BUG 2 FIX: fall through to title match if ID queries return nothing
    const idArray = Array.from(candidateItemIds);
 
    let order = await Order.findOne({
      userId:               userId,
      status:               'completed',
      'paymentInfo.status': 'successful',
      $or: [
        { 'items.id':        { $in: idArray } },
        { 'items.productId': { $in: idArray } }   // BUG 1 FIX
      ]
    })
      .select('_id orderReference paymentInfo.paidAt')
      .lean();
 
    // ── Step 3: title fallback if ID search found nothing ────────────────
    // BUG 2 FIX: attempt title match as last resort
    if (!order && candidateTitles.size > 0) {
      const titleArray = Array.from(candidateTitles);
      order = await Order.findOne({
        userId:               userId,
        status:               'completed',
        'paymentInfo.status': 'successful',
        'items.title':        { $in: titleArray }
      })
        .select('_id orderReference paymentInfo.paidAt')
        .lean();
 
      if (order) resolvedAs = 'title';
    }
 
    if (order) {
      return res.json({
        success:      true,
        hasAccess:    true,
        orderId:      order._id,
        purchasedAt:  order.paymentInfo?.paidAt || null,
        resolvedAs,                   // debug aid — tells frontend/logs which strategy fired
      });
    }
 
    return res.json({
      success:   true,
      hasAccess: false,
      message:   'Purchase required to access this content'
    });
 
  } catch (error) {
    console.error('❌ Ownership check error:', error);
    res.status(500).json({ success: false, message: 'Ownership check failed' });
  }
});
 


// ========================================
// ✅ CUSTOMER MANAGEMENT ENDPOINTS
// ========================================

// Get All Customers (Agent/Admin)
app.get('/api/customers', authenticateAgent, async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    
    let query = {};
    
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [customers, total] = await Promise.all([
      User.find(query)
        .select('-password -twoFactorSecret')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      User.countDocuments(query)
    ]);
    
    // Add chat statistics for each customer
    const customersWithStats = await Promise.all(
      customers.map(async (customer) => {
        const chatCount = await Chat.countDocuments({ 
          customerEmail: customer.email 
        });
        
        const lastChat = await Chat.findOne({ 
          customerEmail: customer.email 
        }).sort({ createdAt: -1 });
        
        return {
          ...customer.toObject(),
          totalChats: chatCount,
          lastContactDate: lastChat?.createdAt || null,
          status: chatCount > 0 ? 'active' : 'inactive'
        };
      })
    );
    
    res.json({
      success: true,
      customers: customersWithStats,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('âŒ Get customers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customers' });
  }
});

// Get Customer Details
app.get('/api/customers/:customerId', authenticateAgent, async (req, res) => {
  try {
    const customer = await User.findById(req.params.customerId)
      .select('-password -twoFactorSecret');
    
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    
    // Get customer's chat history
    const chats = await Chat.find({ customerEmail: customer.email })
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Get customer's orders
    const orders = await Order.find({ userId: customer._id })
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get customer's tickets
    const tickets = await SupportTicket.find({ userId: customer._id })
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.json({
      success: true,
      customer: {
        ...customer.toObject(),
        recentChats: chats,
        recentOrders: orders,
        recentTickets: tickets,
        totalChats: chats.length,
        totalOrders: orders.length,
        totalTickets: tickets.length
      }
    });
    
  } catch (error) {
    console.error('âŒ Get customer details error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customer details' });
  }
});

// ========================================
// âœ… NOTIFICATION ENDPOINTS
// ========================================

// Get Agent Notifications
app.get('/api/notifications', authenticateAgent, async (req, res) => {
  try {
    const agentId = req.agentUser._id;
    
    // Get new chat assignments
    const newChats = await Chat.find({
      assignedAgent: agentId,
      status: { $in: ['assigned', 'in-progress'] },
      'messages.read': false
    }).sort({ updatedAt: -1 }).limit(10);
    
    // Get new tickets
    const newTickets = await SupportTicket.find({
      assignedAgent: agentId,
      status: { $in: ['open', 'in-progress'] }
    }).sort({ updatedAt: -1 }).limit(10);
    
    const notifications = [
      ...newChats.map(chat => ({
        id: chat._id,
        type: 'chat',
        title: 'New message in chat',
        message: `${chat.customerName} sent a message`,
        chatId: chat.chatId,
        timestamp: chat.updatedAt,
        read: false
      })),
      ...newTickets.map(ticket => ({
        id: ticket._id,
        type: 'ticket',
        title: 'New support ticket',
        message: ticket.subject,
        ticketId: ticket.ticketId,
        timestamp: ticket.updatedAt,
        read: false
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
      success: true,
      notifications,
      count: notifications.length
    });
    
  } catch (error) {
    console.error('âŒ Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

// Mark Notification as Read
app.post('/api/notifications/:notificationId/read', authenticateAgent, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    // This is a simple implementation
    // In production, you'd store notifications in a separate collection
    
    res.json({
      success: true,
      message: 'Notification marked as read'
    });
    
  } catch (error) {
    console.error('âŒ Mark notification read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark notification' });
  }
});

// ========== ADMIN NOTIFICATIONS ==========
app.get('/api/admin/notifications', authenticateAdmin, async (req, res) => {
  try {
    // Get recent unread/pending chats
    const newChats = await Chat.find({
      status: { $in: ['open', 'assigned', 'in-progress'] }
    }).sort({ updatedAt: -1 }).limit(10);

    // Get open support tickets
    const newTickets = await SupportTicket.find({
      status: { $in: ['open', 'in-progress'] }
    }).sort({ updatedAt: -1 }).limit(10);

    // Get recent orders pending review
    const newOrders = await Order.find({
      status: 'pending'
    }).sort({ createdAt: -1 }).limit(10);

    const notifications = [
      ...newChats.map(chat => ({
        id: chat._id,
        type: 'chat',
        title: 'Active Chat Session',
        message: `${chat.customerName} - ${chat.status}`,
        chatId: chat.chatId,
        timestamp: chat.updatedAt,
        read: false
      })),
      ...newTickets.map(ticket => ({
        id: ticket._id,
        type: 'ticket',
        title: 'Open Support Ticket',
        message: ticket.subject,
        ticketId: ticket.ticketId,
        timestamp: ticket.updatedAt,
        read: false
      })),
      ...newOrders.map(order => ({
        id: order._id,
        type: 'order',
        title: 'Pending Order',
        message: `Order #${order.orderId || order._id} - ₦${order.total || order.amount}`,
        orderId: order._id,
        timestamp: order.createdAt,
        read: false
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      notifications,
      count: notifications.length
    });

  } catch (error) {
    console.error('❌ Admin notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

// Mark Admin Notification as Read
app.post('/api/admin/notifications/:notificationId/read', authenticateAdmin, async (req, res) => {
  try {
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark notification' });
  }
});


// ========================================
// âœ… WEBSOCKET STATUS ENDPOINT
// ========================================

app.get('/api/websocket/status', authenticateAdmin, (req, res) => {
  res.json({
    success: true,
    connections: {
      total: wss.clients.size,
      activeChats: activeConnections.size,
      connectedAgents: agentConnections.size,
      connectedCustomers: customerConnections.size
    },
    details: {
      chats: Array.from(activeConnections.keys()),
      agents: Array.from(agentConnections.keys()),
      customers: Array.from(customerConnections.keys())
    }
  });
});


app.get('/api/agent/quick-actions', authenticateAgent, async (req, res) => {
  try {
    const agentId = req.agentUser._id;
    
    // Get quick action items
    const [
      urgentChats,
      pendingTickets,
      unreadMessages
    ] = await Promise.all([
      Chat.find({
        assignedAgent: agentId,
        priority: { $in: ['urgent', 'high'] },
        status: { $in: ['assigned', 'in-progress'] }
      }).limit(5),
      SupportTicket.find({
        assignedAgent: agentId,
        status: 'open'
      }).limit(5),
      Chat.find({
        assignedAgent: agentId,
        'messages.read': false
      }).limit(5)
    ]);
    
    res.json({
      success: true,
      quickActions: {
        urgentChats: urgentChats.map(chat => ({
          chatId: chat.chatId,
          customerName: chat.customerName,
          subject: chat.subject,
          priority: chat.priority
        })),
        pendingTickets: pendingTickets.map(ticket => ({
          ticketId: ticket.ticketId,
          subject: ticket.subject,
          priority: ticket.priority
        })),
        unreadMessages: unreadMessages.map(chat => ({
          chatId: chat.chatId,
          customerName: chat.customerName,
          lastMessage: chat.messages[chat.messages.length - 1]?.message
        }))
      }
    });
    
  } catch (error) {
    console.error('âŒ Quick actions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quick actions' });
  }
});

// Get orders with full product details including download links
app.get('/api/orders/detailed', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.userId })
      .sort({ createdAt: -1 });

    // Enhance orders with full product details including download links
    const enhancedOrders = await Promise.all(
      orders.map(async (order) => {
        const enhancedItems = await Promise.all(
          order.items.map(async (item) => {
            // Try to find product by MongoDB ID first, then by title
            let product = null;
            if (mongoose.Types.ObjectId.isValid(item.id)) {
              product = await Product.findById(item.id);
            }
            if (!product) {
              product = await Product.findOne({ title: item.title });
            }
            
            return {
              ...item.toObject(),
              downloadLink: product?.downloadLink || '',
              image: product?.image || item.icon || '',
              description: product?.description || '',
              fileSize: product?.fileSize || '',
              version: product?.version || '',
              productId: product?._id || null
            };
          })
        );

        return {
          ...order.toObject(),
          items: enhancedItems,
          canDownload: order.status === 'completed'
        };
      })
    );

    res.json({
      success: true,
      orders: enhancedOrders,
      count: enhancedOrders.length
    });
  } catch (error) {
    console.error('❌ Get detailed orders error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch orders' 
    });
  }
});

// Track downloads
app.post('/api/orders/track-download', authenticateToken, async (req, res) => {
  try {
    const { productId, orderId } = req.body;

    if (!productId || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and Order ID required'
      });
    }

    // Verify user owns this order
    const order = await Order.findOne({ _id: orderId, userId: req.user.userId });
    if (!order) {
      return res.status(403).json({
        success: false,
        message: 'Order not found or access denied'
      });
    }

    if (order.status !== 'completed') {
      return res.status(403).json({
        success: false,
        message: 'Order must be completed to download'
      });
    }

    const download = new Download({
      userId: req.user.userId,
      productId,
      orderId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await download.save();

    res.json({
      success: true,
      message: 'Download tracked successfully'
    });
  } catch (error) {
    console.error('❌ Track download error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to track download' 
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SECURE PRODUCT DELIVERY — generates a time-limited signed URL
// Called after payment verified. Never exposes raw Cloudinary publicId to client.
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/orders/get-delivery', authenticateToken, async (req, res) => {
  try {
    const { orderId, productId } = req.body;

    if (!orderId || !productId) {
      return res.status(400).json({ success: false, message: 'orderId and productId required' });
    }

    // Verify ownership
    const order = await Order.findOne({ _id: orderId, userId: req.user.userId });
    if (!order) return res.status(403).json({ success: false, message: 'Order not found or access denied' });
    if (order.status !== 'completed') {
      return res.status(403).json({ success: false, message: 'Payment not yet verified' });
    }

    // Find the product
    let product = null;
    if (mongoose.Types.ObjectId.isValid(productId)) {
      product = await Product.findById(productId);
    }
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const delivery = { productId: product._id, title: product.title, productType: product.productType };

    if (product.productType === 'course') {
      // For courses: return the section/chapter structure with
      // per-chapter signed URLs (1hr expiry each)
      const sections = (product.courseData?.sections || []).map(section => ({
        sectionTitle: section.sectionTitle,
        sectionOrder: section.sectionOrder,
        chapters: (section.chapters || []).map(ch => {
          let chapterUrl = ch.externalUrl || null;
          if (ch.hostedFile?.publicId) {
            try {
              chapterUrl = generateSecureDeliveryUrl(ch.hostedFile.publicId, ch.hostedFile.resourceType, 3600);
            } catch (e) {
              chapterUrl = ch.hostedFile.secureUrl; // fallback to raw if signing fails
            }
          }
          return {
            chapterTitle:  ch.chapterTitle,
            chapterOrder:  ch.chapterOrder,
            duration:      ch.duration,
            notes:         ch.notes,
            transcript:    ch.transcript,
            chapterUrl,
          };
        })
      }));

      delivery.type = 'course';
      delivery.courseData = {
        totalDuration: product.courseData?.totalDuration,
        totalChapters: product.courseData?.totalChapters,
        level:         product.courseData?.level,
        certificate:   product.courseData?.certificate,
        sections
      };

    } else {
      // For all other types: generate a single signed download URL (2hr expiry)
      let fileUrl = null;

      if (product.hostedFile?.publicId) {
        try {
          fileUrl = generateSecureDeliveryUrl(product.hostedFile.publicId, product.hostedFile.resourceType, 7200);
        } catch (e) {
          fileUrl = product.hostedFile.secureUrl;
        }
      } else if (product.downloadLink) {
        // Fallback: still support external links for older products
        fileUrl = product.downloadLink;
      }

      delivery.type    = 'file';
      delivery.fileUrl = fileUrl;
      delivery.fileSize = product.fileSize || formatBytes(product.hostedFile?.bytes);
      delivery.version  = product.version;
      delivery.format   = product.hostedFile?.format;

      // Specific extras per type
      if (product.productType === 'music' && product.audioData) {
        delivery.audioData = {
          bpm:      product.audioData.bpm,
          key:      product.audioData.key,
          genre:    product.audioData.genre,
          license:  product.audioData.license,
          stems:    product.audioData.stems,
        };
      }
      if (product.productType === 'software' && product.softwareData) {
        delivery.softwareData = {
          platform:      product.softwareData.platform,
          licenseType:   product.softwareData.licenseType,
          licenseKey:    product.softwareData.licenseKey,
          supportPeriod: product.softwareData.supportPeriod,
        };
      }
    }

    // Log the access
    setImmediate(async () => {
      try {
        const dl = new Download({ userId: req.user.userId, productId: product._id, orderId });
        await dl.save();
      } catch (_) {}
    });

    res.json({ success: true, delivery });

  } catch (error) {
    console.error('❌ Secure delivery error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate delivery' });
  }
});

// Admin: View download statistics
app.get('/api/admin/downloads/stats', authenticateAdmin, async (req, res) => {
  try {
    const totalDownloads = await Download.countDocuments();
    
    const popularProducts = await Download.aggregate([
      { 
        $group: { 
          _id: '$productId', 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } }
    ]);

    const recentDownloads = await Download.find()
      .populate('userId', 'fullName email')
      .populate('productId', 'title category')
      .sort({ downloadedAt: -1 })
      .limit(20);

    // Downloads by date (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const downloadsByDate = await Download.aggregate([
      { $match: { downloadedAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$downloadedAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      stats: {
        totalDownloads,
        popularProducts,
        recentDownloads,
        downloadsByDate
      }
    });
  } catch (error) {
    console.error('❌ Download stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch stats' 
    });
  }
});

// ========== PRODUCT MANAGEMENT ==========
app.get('/api/admin/products', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, category = 'all', status = 'all', search = '' } = req.query;
    
    let query = {};
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    } else if (status === 'featured') {
      query.isFeatured = true;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

   const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select('-hostedFile.secureUrl -hostedFile.publicId -courseData.sections.chapters.hostedFile');
      // ↑ Never send raw Cloudinary credentials to the public listing

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      products: products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Get products error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const { category = 'all', featured = false, limit = 20, skip = 0 } = req.query;
    
    let query = { isActive: true };
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (featured === 'true') {
      query.isFeatured = true;
    }

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      products: products,
      count: products.length,
      total: total
    });
  } catch (error) {
    console.error('❌ Get products error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({
      success: true,
      product: product
    });
  } catch (error) {
    console.error('❌ Get product error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
});

app.post('/api/admin/products', authenticateAdmin, async (req, res) => {
  try {
    const productData = req.body;

    if (!productData.title || !productData.description || !productData.category || productData.price === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // productType defaults to 'download' if not supplied
    if (!productData.productType) productData.productType = 'download';

    const product = new Product(productData);
    await product.save();

    res.status(201).json({ success: true, message: 'Product created successfully', product });
  } catch (error) {
    console.error('❌ Create product error:', error);
    res.status(500).json({ success: false, message: 'Creation failed' });
  }
});

app.put('/api/admin/products/:id', authenticateAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    Object.assign(product, req.body);
    await product.save();

    res.json({
      success: true,
      message: 'Product updated successfully',
      product: product
    });
  } catch (error) {
    console.error('❌ Update product error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

app.delete('/api/admin/products/:id', authenticateAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('❌ Delete product error:', error);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

// Seed products with download links
app.post('/api/admin/products/seed-with-downloads', authenticateAdmin, async (req, res) => {
  try {
    const sampleProducts = [
      {
        title: 'Premium Landing Page Template',
        description: 'Beautiful, responsive landing page template with modern design. Includes source files and documentation.',
        category: 'Templates',
        price: 49.99,
        comparePrice: 99.99,
        icon: '🎨',
        downloadLink: 'https://drive.google.com/file/d/YOUR_FILE_ID_1/view?usp=sharing',
        fileSize: '5.2 MB',
        version: '1.0',
        features: ['Fully Responsive', 'Modern Design', 'Easy Customization', 'Documentation Included'],
        isActive: true,
        isFeatured: true,
        stock: 999
      },
      {
        title: 'React Dashboard Components',
        description: 'Complete set of React dashboard components ready to use in your projects. Built with TypeScript.',
        category: 'Components',
        price: 79.99,
        comparePrice: 149.99,
        icon: '⚛️',
        downloadLink: 'https://drive.google.com/file/d/YOUR_FILE_ID_2/view?usp=sharing',
        fileSize: '12.8 MB',
        version: '2.1',
        features: ['TypeScript Support', '50+ Components', 'Dark Mode', 'Fully Documented'],
        isActive: true,
        isFeatured: true,
        stock: 999
      },
      {
        title: 'Web Development Course Bundle',
        description: 'Complete web development course from beginner to advanced. Includes video tutorials and project files.',
        category: 'Courses',
        price: 129.99,
        comparePrice: 299.99,
        icon: '📚',
        downloadLink: 'https://drive.google.com/file/d/YOUR_FILE_ID_3/view?usp=sharing',
        fileSize: '2.5 GB',
        version: '1.0',
        features: ['40+ Hours Video', 'Source Code', 'Certificate', 'Lifetime Access'],
        isActive: true,
        isFeatured: false,
        stock: 999
      },
      {
        title: 'E-commerce Admin Dashboard',
        description: 'Professional admin dashboard for e-commerce platforms with analytics and management tools.',
        category: 'Templates',
        price: 89.99,
        comparePrice: 179.99,
        icon: '🛒',
        downloadLink: 'https://drive.google.com/file/d/YOUR_FILE_ID_4/view?usp=sharing',
        fileSize: '8.4 MB',
        version: '1.5',
        features: ['Analytics Dashboard', 'Order Management', 'User Management', 'Responsive Design'],
        isActive: true,
        isFeatured: true,
        stock: 999
      }
    ];

    let created = 0;
    for (const productData of sampleProducts) {
      const existing = await Product.findOne({ title: productData.title });
      if (!existing) {
        await Product.create(productData);
        created++;
      }
    }

    res.json({
      success: true,
      message: `Seeded ${created} products with download links`,
      note: 'Remember to update the Google Drive links with actual file IDs!'
    });
  } catch (error) {
    console.error('❌ Seed products error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to seed products' 
    });
  }
});

// ========== COUPON MANAGEMENT ==========
app.get('/api/admin/coupons', authenticateAdmin, async (req, res) => {
  try {
    const { status = 'all' } = req.query;
    
    let query = {};
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    const coupons = await Coupon.find(query).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      coupons: coupons,
      count: coupons.length
    });
  } catch (error) {
    console.error('❌ Get coupons error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch coupons' });
  }
});

app.post('/api/admin/coupons', authenticateAdmin, async (req, res) => {
  try {
    const { code, discount, type, usageLimit, expiresAt, minPurchaseAmount, description } = req.body;

    if (!code || discount === undefined || !type) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const existing = await Coupon.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }

    const coupon = new Coupon({
      code: code.toUpperCase(),
      discount,
      type,
      usageLimit: usageLimit || null,
      expiresAt: expiresAt || null,
      minPurchaseAmount: minPurchaseAmount || 0,
      description: description || ''
    });

    await coupon.save();

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      coupon: coupon
    });
  } catch (error) {
    console.error('❌ Create coupon error:', error);
    res.status(500).json({ success: false, message: 'Creation failed' });
  }
});

app.put('/api/admin/coupons/:code', authenticateAdmin, async (req, res) => {
  try {
    const { discount, type, usageLimit, expiresAt, minPurchaseAmount, description, isActive } = req.body;

    const coupon = await Coupon.findOne({ code: req.params.code.toUpperCase() });
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    if (discount !== undefined) coupon.discount = discount;
    if (type) coupon.type = type;
    if (usageLimit !== undefined) coupon.usageLimit = usageLimit;
    if (expiresAt !== undefined) coupon.expiresAt = expiresAt;
    if (minPurchaseAmount !== undefined) coupon.minPurchaseAmount = minPurchaseAmount;
    if (description !== undefined) coupon.description = description;
    if (isActive !== undefined) coupon.isActive = isActive;

    await coupon.save();

    res.json({
      success: true,
      message: 'Coupon updated successfully',
      coupon: coupon
    });
  } catch (error) {
    console.error('❌ Update coupon error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

app.delete('/api/admin/coupons/:code', authenticateAdmin, async (req, res) => {
  try {
    const coupon = await Coupon.findOneAndDelete({ code: req.params.code.toUpperCase() });
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    res.json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error('❌ Delete coupon error:', error);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

app.post('/api/coupons/validate', authenticateToken, async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Coupon code required' });
    }

    const cleanCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: cleanCode });

    if (!coupon) {
      return res.status(404).json({ success: false, message: `Invalid coupon "${cleanCode}"` });
    }

    if (!coupon.isActive) {
      return res.status(400).json({ success: false, message: 'Coupon inactive' });
    }

    if (coupon.expiresAt && new Date() > coupon.expiresAt) {
      return res.status(400).json({ success: false, message: 'Coupon expired' });
    }
if (coupon.usedBy?.some(id => id.toString() === req.user.userId.toString())) {
  return res.status(400).json({ success: false, message: 'Coupon already used' });
}

 if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Usage limit reached' });
    }

    if (coupon.usedBy && coupon.usedBy.some(id => id.toString() === req.user.userId.toString())) {
      return res.status(400).json({ success: false, message: 'You have already used this coupon' });
    }

    
    if (orderTotal < coupon.minPurchaseAmount) {
      return res.status(400).json({ success: false, message: `Minimum purchase of $${coupon.minPurchaseAmount} required` });
    }

    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = (orderTotal * coupon.discount) / 100;
    } else {
      discountAmount = coupon.discount;
    }

    discountAmount = Math.min(discountAmount, orderTotal);
    const finalAmount = Math.max(0, orderTotal - discountAmount);
    const isFree = finalAmount === 0;

    res.json({
      success: true,
      coupon: {
        code: coupon.code,
        discount: coupon.discount,
        type: coupon.type,
        discountAmount: discountAmount,
        finalAmount: finalAmount,
        isFree: isFree
      },
      message: isFree ? '🎉 Order is FREE!' : `✅ Saved $${discountAmount.toFixed(2)}`
    });

  } catch (error) {
    console.error('❌ Validate coupon error:', error);
    res.status(500).json({ success: false, message: 'Validation failed' });
  }
});

app.post('/api/coupons/seed', authenticateAdmin, async (req, res) => {
  try {
    const defaultCoupons = [
      { code: 'WELCOME10', discount: 10, type: 'percentage', isActive: true, description: 'Welcome bonus - 10% off' },
      { code: 'SAVE20', discount: 20, type: 'percentage', isActive: true, description: 'Save 20% on your order' },
      { code: 'FLAT50', discount: 50, type: 'fixed', isActive: true, description: '$50 off your purchase' },
      { code: 'NEWUSER', discount: 15, type: 'percentage', isActive: true, description: 'New user discount' },
      { code: 'FREE100', discount: 100, type: 'percentage', isActive: true, usageLimit: 50, description: 'Free order - Limited to 50 uses' }
    ];

    let created = 0;
    for (const couponData of defaultCoupons) {
      const existing = await Coupon.findOne({ code: couponData.code });
      if (!existing) {
        await Coupon.create(couponData);
        created++;
      }
    }

    res.json({
      success: true,
      message: `Seeded ${created} coupons`,
      coupons: defaultCoupons.map(c => c.code)
    });
  } catch (error) {
    console.error('❌ Seed coupons error:', error);
    res.status(500).json({ success: false, message: 'Seed failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// ✅ COMMISSION PROCESSOR UTILITY
// ═══════════════════════════════════════════════════════════════
async function processOrderCommissions(order, affiliateCode = null) {
  try {
    console.log(`\n💰 Processing commissions for order: ${order.orderReference}`);
 
    // ── Guard: don't process twice ──────────────────────────────────────────
    if (order.commissionsProcessed) {
      console.log('   ⚠️  Commissions already processed — skipping');
      return;
    }
 
    // ── Atomically claim processing rights ─────────────────────────────────
    // This prevents a race condition where two simultaneous calls (e.g. webhook +
    // verify-payment both fire) both see commissionsProcessed=false and both run.
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, commissionsProcessed: { $ne: true } },
      { $set: { commissionsProcessed: true, commissionsProcessedAt: new Date() } },
      { new: false } // return the OLD doc so we can check if we won the race
    );
 
    if (!claimed) {
      console.log('   ⚠️  Another process already claimed this order — skipping');
      return;
    }
 
    // ── Calculate the discount ratio ────────────────────────────────────────
    // If total=$50 and subtotal=$100, ratio=0.5 — every creator's item
    // is worth only 50% of its listed price for commission purposes.
    // This ensures the discount burden is shared across all items proportionally,
    // and the platform never pays out more than it collected.
    const subtotal      = order.subtotal || order.total;
    const actualTotal   = order.total;
    const discountRatio = subtotal > 0 ? (actualTotal / subtotal) : 1;
    // discountRatio = 1.0 means no discount. 0.5 means 50% coupon applied.
    // We cap it at 1 to prevent edge cases where subtotal < total (shouldn't happen).
    const safeRatio = Math.min(1, Math.max(0, discountRatio));
 
    console.log(`   📊 Subtotal: ${subtotal} | Actual paid: ${actualTotal} | Discount ratio: ${(safeRatio * 100).toFixed(1)}%`);
 
    for (const item of order.items) {
 
      // ── Find the CreatorProduct for this item ───────────────────────────
      let creatorProduct = null;
      if (item.id) {
        try {
          creatorProduct = await CreatorProduct.findOne({
            productId: new mongoose.Types.ObjectId(item.id),
            status: 'approved'
          }).populate('creatorId');
        } catch(e) { /* invalid ObjectId — try by title */ }
      }
      if (!creatorProduct && item.title) {
        creatorProduct = await CreatorProduct.findOne({
          title: item.title,
          status: 'approved'
        }).populate('creatorId');
      }
 
      if (!creatorProduct || !creatorProduct.creatorId) {
        console.log(`   ℹ️  "${item.title}" — admin product, no creator commission`);
        continue;
      }
 
      
 
      // ── Per-item idempotency check ──────────────────────────────────────
      // Even though we set the flag atomically above, this catches the edge
      // case where the function crashed after partial processing on a previous run.
      const alreadyPaid = await EarningsLedger.findOne({
        orderId:          order._id,
        creatorProductId: creatorProduct._id,
        recipientType:    'creator'
      });
      if (alreadyPaid) {
        console.log(`   ⚠️  Creator earning for "${item.title}" already recorded — skipping`);
        continue;
      }
 
      // ── Calculate the CORRECT sale amount ──────────────────────────────
      const qty              = item.quantity || 1;
      const listedItemTotal  = parseFloat((item.price * qty).toFixed(2));

      // Safety: if item.price is 0 or negative, skip — prevents negative earnings
      if (listedItemTotal <= 0) {
          console.log(`   ⚠️  "${item.title}" — zero/negative price, skipping`);
          continue;
      }

      const effectiveSaleAmt = parseFloat((listedItemTotal * safeRatio).toFixed(2));

      // Each creator product can have its own platform rate; default is 20%
      const platformRate   = typeof creatorProduct.platformCommission === 'number'
          ? creatorProduct.platformCommission
          : 20;
      const platformCut    = parseFloat((effectiveSaleAmt * (platformRate / 100)).toFixed(2));
      const creatorEarning = parseFloat((effectiveSaleAmt - platformCut).toFixed(2));

      // Skip if earning rounds to zero (e.g. 100% coupon on this item)
      if (creatorEarning <= 0) {
          console.log(`   ⚠️  "${item.title}" — zero earning after discount/platform cut, skipping`);
          continue;
      }
      console.log(`   💼 "${item.title}" | Listed: ${listedItemTotal} | Effective: ${effectiveSaleAmt} | Platform(${platformRate}%): ${platformCut} | Creator: ${creatorEarning}`);
 
      // ── Record creator earning ──────────────────────────────────────────
      await EarningsLedger.create({
        recipientId:      creator.userId,
        recipientType:    'creator',
        orderId:          order._id,
        productId:        creatorProduct.productId,
        creatorProductId: creatorProduct._id,
        saleAmount:       effectiveSaleAmt,
        platformCut:      platformCut,
        earningAmount:    creatorEarning,
        commissionRate:   platformRate,
        status:           'confirmed',
        description:      `Sale of "${item.title}" (×${qty}) — Order ${order.orderReference}`
      });
 
      // ── Update Creator totals ───────────────────────────────────────────
      await Creator.findByIdAndUpdate(creator._id, {
        $inc: {
          totalSales:    1,
          totalRevenue:  effectiveSaleAmt,
          totalEarnings: creatorEarning,
          pendingPayout: creatorEarning
        }
      });
 
      // ── Update CreatorProduct stats (ONCE — bug fix: was called twice) ──
      await CreatorProduct.findByIdAndUpdate(creatorProduct._id, {
        $inc: {
          totalSales:   1,
          totalRevenue: effectiveSaleAmt
        }
      });
 
      // ── Update mirrored main Product sold count ─────────────────────────
      if (creatorProduct.productId) {
        await Product.findByIdAndUpdate(creatorProduct.productId, {
          $inc: { soldCount: 1 }
        });
      }
 
      console.log(`   ✅ Creator "${creator.storeName}" earns ${creatorEarning.toFixed(2)} (platform keeps ${platformCut.toFixed(2)})`);
 
      // ── Affiliate commission ────────────────────────────────────────────
      if (affiliateCode) {
        const affiliate = await Affiliate.findOne({
          affiliateCode: affiliateCode.toUpperCase(),
          status: 'active'
        });
 
        if (affiliate) {
          // Affiliate earns from creator's portion only, not from platform cut.
          // This is correct — affiliate rate is % of what creator earns.
          const affiliateRate    = creatorProduct.affiliateCommission || 10;
          const affiliateEarning = parseFloat((creatorEarning * (affiliateRate / 100)).toFixed(2));
 
          // Per-item affiliate idempotency check
          const affiliateAlreadyPaid = await EarningsLedger.findOne({
            orderId:          order._id,
            creatorProductId: creatorProduct._id,
            recipientType:    'affiliate',
            recipientId:      affiliate.userId
          });
 
          if (!affiliateAlreadyPaid) {
            await EarningsLedger.create({
              recipientId:      affiliate.userId,
              recipientType:    'affiliate',
              orderId:          order._id,
              productId:        creatorProduct.productId,
              creatorProductId: creatorProduct._id,
              saleAmount:       effectiveSaleAmt,
              platformCut:      platformCut,
              earningAmount:    affiliateEarning,
              commissionRate:   affiliateRate,
              status:           'confirmed',
              description:      `Affiliate commission for "${item.title}" — Order ${order.orderReference}`
            });
 
            await Affiliate.findByIdAndUpdate(affiliate._id, {
              $inc: {
                totalConversions: 1,
                totalEarnings:    affiliateEarning,
                pendingEarnings:  affiliateEarning
              }
            });
 
            await AffiliateClick.findOneAndUpdate(
              { affiliateCode: affiliateCode.toUpperCase(), converted: false },
              {
                converted:        true,
                orderId:          order._id,
                conversionAmount: effectiveSaleAmt,
                commissionEarned: affiliateEarning,
                convertedAt:      new Date()
              },
              { sort: { clickedAt: -1 } }
            );
 
            console.log(`   🔗 Affiliate "${affiliateCode}" earns ${affiliateEarning.toFixed(2)}`);
          }
        }
      }
 
    } // end for (item of order.items)
 
    console.log(`✅ Commission processing complete for ${order.orderReference}\n`);
 
  } catch (error) {
    console.error('❌ Commission processing error:', error.message, error.stack);
  }
}
 
global.processOrderCommissions = processOrderCommissions;
 
 
// ========== BLOG MANAGEMENT ==========
app.get('/api/admin/blog/posts', authenticateAdmin, async (req, res) => {
  try {
    const { status = 'all', category = 'all' } = req.query;
    let query = {};
    if (status   !== 'all') query.status   = status;
    if (category !== 'all') query.category = category;
 
    const posts = await BlogPost.find(query)
      .populate('author', 'fullName email profileImage')
      .sort({ createdAt: -1 });
 
    res.json({ success: true, posts, count: posts.length });
  } catch (error) {
    console.error('❌ Admin get posts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch posts' });
  }
});
 
 
// ════════════════════════════════════════════════════════════════
// ADMIN — GET SINGLE POST (for edit modal)
// ════════════════════════════════════════════════════════════════
app.get('/api/admin/blog/posts/:id', authenticateAdmin, async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id)
      .populate('author', 'fullName email');
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    res.json({ success: true, post });
  } catch (error) {
    console.error('❌ Admin get single post error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch post' });
  }
});
 
 
app.post('/api/admin/blog/posts', authenticateAdmin, async (req, res) => {
  try {
    const {
      title, excerpt, content, featuredImage,
      category, tags, status,
      metaTitle, metaDescription, metaKeywords,
      slug: customSlug
    } = req.body;
 
    if (!title || !excerpt || !content || !category) {
      return res.status(400).json({ success: false, message: 'Missing required fields: title, excerpt, content, category' });
    }
 
    // Build slug — use custom if provided, else auto-generate; ensure uniqueness
    let slug = customSlug
      ? customSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      : generateSlug(title);
 
    // Uniqueness check — append timestamp suffix if slug already taken
    const existingSlug = await BlogPost.findOne({ slug });
    if (existingSlug) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }
 
    const blogPost = new BlogPost({
      title,
      slug,
      excerpt,
      content,
      featuredImage: featuredImage || '',
      author: req.user.userId,
      category,
      tags:             Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : []),
      status:           status || 'draft',
      metaTitle:        metaTitle        || title,
      metaDescription:  metaDescription  || excerpt,
      metaKeywords:     Array.isArray(metaKeywords) ? metaKeywords : (metaKeywords ? String(metaKeywords).split(',').map(k => k.trim()).filter(Boolean) : []),
    });
 
    await blogPost.save();
 
    res.status(201).json({
      success: true,
      message: 'Blog post created',
      post: blogPost
    });
  } catch (error) {
    console.error('❌ Create post error:', error);
    res.status(500).json({ success: false, message: 'Creation failed', error: error.message });
  }
});
 

app.put('/api/admin/blog/posts/:id', authenticateAdmin, async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
 
    const allowedUpdates = [
      'title', 'excerpt', 'content', 'featuredImage',
      'category', 'tags', 'status',
      'metaTitle', 'metaDescription', 'metaKeywords'
    ];
 
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) post[field] = req.body[field];
    });
 
    // Regenerate slug if title changed AND no custom slug provided
    if (req.body.title && req.body.title !== post.title && !req.body.slug) {
      const newSlug = generateSlug(req.body.title);
      const exists  = await BlogPost.findOne({ slug: newSlug, _id: { $ne: post._id } });
      post.slug = exists ? `${newSlug}-${Date.now().toString(36)}` : newSlug;
    } else if (req.body.slug) {
      post.slug = req.body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }
 
    // Normalise tags / metaKeywords if sent as comma-strings
    if (typeof post.tags === 'string') {
      post.tags = post.tags.split(',').map(t => t.trim()).filter(Boolean);
    }
    if (typeof post.metaKeywords === 'string') {
      post.metaKeywords = post.metaKeywords.split(',').map(k => k.trim()).filter(Boolean);
    }
 
    await post.save();
    res.json({ success: true, message: 'Post updated', post });
  } catch (error) {
    console.error('❌ Update post error:', error);
    res.status(500).json({ success: false, message: 'Update failed', error: error.message });
  }
});


app.delete('/api/admin/blog/posts/:id', authenticateAdmin, async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndDelete(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    res.json({ success: true, message: 'Post deleted' });
  } catch (error) {
    console.error('❌ Delete post error:', error);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

app.get('/api/blog/posts', async (req, res) => {
  try {
    const { limit = 100, skip = 0, category = 'all' } = req.query;
    const query = { status: 'published' };
    if (category !== 'all') query.category = category;
 
    const posts = await BlogPost.find(query)
      .populate('author', 'fullName profileImage')
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      // ✅ EXPLICIT field list — content excluded for perf, featuredImage INCLUDED
      .select('title slug excerpt featuredImage category tags status views likes comments author publishedAt createdAt');
 
    const total = await BlogPost.countDocuments(query);
 
    // Only expose approved comments on the public listing
    const sanitised = posts.map(p => {
      const obj      = p.toObject();
      obj.comments   = (obj.comments || []).filter(c => c.approved);
      return obj;
    });
 
    res.json({ success: true, posts: sanitised, count: sanitised.length, total });
  } catch (err) {
    console.error('❌ Get published posts:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch posts' });
  }
});
 
 
app.get('/api/blog/posts/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug })
      .populate('author', 'fullName profileImage bio');
 
    if (!post || post.status !== 'published') {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
 
    // Increment views
    post.views += 1;
    await post.save();
 
    // Return only approved comments to the public
    const postObj = post.toObject();
    postObj.comments = postObj.comments.filter(c => c.approved);
 
    res.json({ success: true, post: postObj });
  } catch (error) {
    console.error('❌ Get post by slug error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch post' });
  }
});
 
app.get('/api/blog/posts/id/:id', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id)
      .populate('author', 'fullName profileImage bio');
 
    if (!post || post.status !== 'published') {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
 
    post.views += 1;
    await post.save();
 
    const postObj = post.toObject();
    postObj.comments = postObj.comments.filter(c => c.approved);
 
    res.json({ success: true, post: postObj });
  } catch (error) {
    console.error('❌ Get post by ID error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch post' });
  }
});
 
app.post('/api/blog/posts/:id/like', async (req, res) => {
  try {
    const ip   = getClientIp(req);
    const postId = req.params.id;
 
    if (hasLiked(postId, ip)) {
      return res.status(429).json({
        success: false,
        message: 'You have already liked this post',
        alreadyLiked: true
      });
    }
 
    const post = await BlogPost.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
 
    post.likes += 1;
    await post.save();
    recordLike(postId, ip);
 
    res.json({ success: true, likes: post.likes });
  } catch (error) {
    console.error('❌ Like post error:', error);
    res.status(500).json({ success: false, message: 'Like failed' });
  }
});
 
app.post('/api/blog/posts/:id/comments', async (req, res) => {
  try {
    const { comment, visitorName, visitorEmail } = req.body;
 
    if (!comment || comment.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }
 
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
 
    let userName  = visitorName  ? String(visitorName).trim()  : null;
    let userEmail = visitorEmail ? String(visitorEmail).trim()  : null;
    let userId    = null;
 
    // ── If a JWT is sent, use the authenticated user's details instead ──
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user    = await User.findById(decoded.userId);
        if (user) {
          userName  = user.fullName;
          userEmail = user.email;
          userId    = user._id;
        }
      } catch (_) {
        // Invalid token — treat as visitor; don't block the request
      }
    }
 
    // Validate visitor fields when no logged-in user
    if (!userId) {
      if (!userName || userName.length < 1) {
        return res.status(400).json({ success: false, message: 'Please provide your name' });
      }
      if (!userEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
        return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
      }
    }
 
    post.comments.push({
      user:      userId  || undefined,
      userName:  userName  || 'Anonymous',
      userEmail: userEmail || '',
      comment:   comment.trim(),
      approved:  false,    // always requires admin approval first
      createdAt: new Date()
    });
 
    await post.save();
 
    res.json({
      success: true,
      message: 'Comment submitted! It will appear once approved by our team.'
    });
  } catch (error) {
    console.error('❌ Add comment error:', error);
    res.status(500).json({ success: false, message: 'Comment failed', error: error.message });
  }
});
 

app.put('/api/admin/blog/posts/:postId/comments/:commentId/approve', authenticateAdmin, async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
 
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });
 
    comment.approved = true;
    await post.save();
 
    res.json({ success: true, message: 'Comment approved' });
  } catch (error) {
    console.error('❌ Approve comment error:', error);
    res.status(500).json({ success: false, message: 'Approval failed' });
  }
});
 
app.delete('/api/admin/blog/posts/:postId/comments/:commentId', authenticateAdmin, async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
 
    const before = post.comments.length;
    post.comments = post.comments.filter(
      c => c._id.toString() !== req.params.commentId
    );
 
    if (post.comments.length === before) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }
 
    await post.save();
    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    console.error('❌ Delete comment error:', error);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});
 

app.get('/api/blog/categories', async (req, res) => {
  try {
    const categories = await BlogPost.aggregate([
      { $match: { status: 'published' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      categories: categories.map(c => ({
        name: c._id,
        count: c.count
      }))
    });
  } catch (error) {
    console.error('❌ Get categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
});

app.get('/api/blog/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query required' });
    }

    const posts = await BlogPost.find({
      status: 'published',
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { excerpt: { $regex: query, $options: 'i' } },
        { content: { $regex: query, $options: 'i' } },
        { tags: { $regex: query, $options: 'i' } }
      ]
    })
    .populate('author', 'fullName')
    .sort({ publishedAt: -1 })
    .limit(20)
    .select('-content');

    res.json({
      success: true,
      posts: posts,
      count: posts.length
    });
  } catch (error) {
    console.error('❌ Search posts error:', error);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
});

app.get('/api/blog/featured', async (req, res) => {
  try {
    const posts = await BlogPost.find({ status: 'published' })
      .populate('author', 'fullName profileImage')
      .sort({ views: -1, likes: -1 })
      .limit(5)
      .select('-content');

    res.json({
      success: true,
      posts: posts
    });
  } catch (error) {
    console.error('❌ Get featured posts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch featured posts' });
  }
});

app.post('/api/upload/blog-image', authenticateAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }
 
    const url = await uploadToCloudinary(
      req.file.buffer,
      req.file.mimetype,
      'uyehtech/blog'          // ← dedicated Cloudinary folder for blog images
    );
 
    console.log('✅ Blog image uploaded to Cloudinary:', url);
    res.json({ success: true, url, message: 'Image uploaded successfully' });
  } catch (error) {
    console.error('❌ Blog image upload error:', error);
    res.status(500).json({ success: false, message: 'Image upload failed', error: error.message });
  }
});
 
// ════════════════════════════════════════════════════════════════════════════
// 💬 CUSTOMER CHAT ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/chat/start', async (req, res) => {
  try {
    const { customerName, customerEmail, subject, department, priority } = req.body;

    if (!customerName || !customerEmail || !subject) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer name, email, and subject are required' 
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    const chatId = global.generateChatId();
    const customerId = customerEmail.toLowerCase();

    const chat = new global.Chat({
      chatId,
      customerId,
      customerName: customerName.trim(),
      customerEmail: customerEmail.toLowerCase(),
      subject: subject.trim(),
      department: department || 'General',
      priority: priority || 'medium',
      status: 'open',
      messages: [{
        messageId: global.generateMessageId(),
        sender: 'system',
        senderId: 'system',
        senderName: 'UYEH TECH Support',
        message: `Chat session started. Subject: ${subject}`,
        timestamp: new Date()
      }]
    });

    await chat.save();

    console.log(`💬 Chat started: ${chatId} by ${customerName}`);

    res.status(201).json({
      success: true,
      message: 'Chat session started successfully',
      chat: {
        chatId: chat.chatId,
        customerId: chat.customerId,
        customerName: chat.customerName,
        subject: chat.subject,
        department: chat.department,
        priority: chat.priority,
        status: chat.status,
        assignedAgent: chat.assignedAgent,
        createdAt: chat.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Start chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to start chat session' });
  }
});

app.get('/api/agent/dashboard/stats', authenticateAgent, async (req, res) => {
  try {
    const agentId = req.agentUser._id;
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalChats,
      openChats,
      assignedChats,
      inProgressChats,
      resolvedChats,
      closedChats,
      todayChats,
      weekChats,
      avgResponseTime,
      customerSatisfaction
    ] = await Promise.all([
      global.Chat.countDocuments({ assignedAgent: agentId }),
      global.Chat.countDocuments({ status: 'open' }),
      global.Chat.countDocuments({ assignedAgent: agentId, status: 'assigned' }),
      global.Chat.countDocuments({ assignedAgent: agentId, status: 'in-progress' }),
      global.Chat.countDocuments({ assignedAgent: agentId, status: 'resolved' }),
      global.Chat.countDocuments({ assignedAgent: agentId, status: 'closed' }),
      global.Chat.countDocuments({ assignedAgent: agentId, createdAt: { $gte: today } }),
      global.Chat.countDocuments({ assignedAgent: agentId, createdAt: { $gte: thisWeek } }),
      global.Chat.aggregate([
        { $match: { assignedAgent: agentId, firstResponseTime: { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$firstResponseTime' } } }
      ]),
      global.Chat.aggregate([
        { $match: { assignedAgent: agentId, rating: { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$rating' } } }
      ])
    ]);

    const resolvedToday = await global.Chat.countDocuments({
      assignedAgent: agentId,
      status: 'resolved',
      resolvedAt: { $gte: today }
    });

    const avgResponse = avgResponseTime[0]?.avg || 0;
    const avgRating = customerSatisfaction[0]?.avg || 0;
    const satisfactionRate = avgRating > 0 ? Math.round((avgRating / 5) * 100) : 0;

    res.json({
      success: true,
      stats: {
        totalChats,
        openChats,
        assignedChats,
        inProgressChats,
        resolvedChats,
        closedChats,
        activeChats: assignedChats + inProgressChats,
        totalChatsToday: todayChats,
        totalChatsWeek: weekChats,
        resolvedToday,
        avgChatDuration: Math.round(avgResponse),
        avgResponseTime: Math.round(avgResponse),
        satisfactionRate,
        rating: avgRating.toFixed(1)
      }
    });
  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats' });
  }
});


app.get('/api/chat/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await global.Chat.findOne({ chatId })
      .populate('assignedAgent', 'fullName email agentInfo')
      .lean();

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat session not found' });
    }

    // ✅ Normalize chat object
    const normalizedChat = {
      ...chat,
      chatId: chat.chatId || chat._id?.toString(),
      id: chat.chatId || chat._id?.toString(),
      status: (chat.status || 'open').toLowerCase(),
      unreadCount: chat.messages?.filter(m => !m.read && m.sender === 'customer').length || 0,
      lastMessage: chat.messages?.length > 0 
        ? chat.messages[chat.messages.length - 1].message 
        : '',
      lastMessageTime: chat.messages?.length > 0 
        ? chat.messages[chat.messages.length - 1].timestamp 
        : chat.createdAt
    };

    console.log(`✅ Chat loaded: ${chatId}`);

    res.json({
      success: true,
      chat: normalizedChat
    });
  } catch (error) {
    console.error('❌ Get chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch chat details' });
  }
});





app.post('/api/agent/chats/:chatId/pickup', authenticateAgent, async (req, res) => {
  try {
    const { chatId } = req.params;
    const agentId = req.agentUser._id;
    const agent = req.agentUser;

    console.log(`🎯 Agent ${agent.fullName} attempting to pick up chat ${chatId}`);

    const chat = await global.Chat.findOne({ chatId });
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat session not found' });
    }

    // ✅ Simple validations only
    
    // 1. Check if already assigned to someone else
    if (chat.assignedAgent && chat.assignedAgent.toString() !== agentId.toString()) {
      const assignedAgent = await global.User.findById(chat.assignedAgent);
      return res.status(400).json({ 
        success: false, 
        message: `This chat is already being handled by ${assignedAgent?.fullName || 'another agent'}` 
      });
    }

    // 2. Check if chat is closed
    if (chat.status === 'closed' || chat.status === 'resolved') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot pick up a closed or resolved chat' 
      });
    }

    // 3. Verify requester is actually an agent
    if (!agent.isAgent && !agent.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only verified agents can pick up chats' 
      });
    }

    // Check if already assigned to this agent
    const wasAlreadyAssigned = chat.assignedAgent && chat.assignedAgent.toString() === agentId.toString();

    // Assign the chat
    chat.assignedAgent = agentId;
    chat.status = 'assigned';

    // ✅ Send email asynchronously
if (!wasAlreadyAssigned) {
  setImmediate(() => {
    global.sendAgentAssignmentEmail(agent.email, {
      chatId: chat.chatId,
      customerName: chat.customerName,
      subject: chat.subject,
      department: chat.department,
      priority: chat.priority
    })
    .then(() => console.log(`✅ Assignment email queued for ${agent.email}`))
    .catch(err => console.error('❌ Email error:', err.message));
  });
}

    await chat.save();

    // Update agent stats
    if (!wasAlreadyAssigned && agent.agentInfo) {
      agent.agentInfo.activeChats = (agent.agentInfo.activeChats || 0) + 1;
      agent.agentInfo.totalChats = (agent.agentInfo.totalChats || 0) + 1;
      await agent.save();
      console.log(`📈 Agent ${agent.fullName} now has ${agent.agentInfo.activeChats} active chats`);
    }

    // Notify via WebSocket
    if (global.sendToAgent) {
      global.sendToAgent(agentId.toString(), {
        type: 'chat_assigned',
        chat: {
          chatId: chat.chatId,
          customerName: chat.customerName,
          subject: chat.subject,
          department: chat.department,
          priority: chat.priority
        }
      });
    }

    // Broadcast to other agents
    if (global.wss && global.wss.clients) {
      global.wss.clients.forEach((client) => {
        if (client.agentId && client.agentId !== agentId.toString() && client.readyState === 1) {
          try {
            client.send(JSON.stringify({
              type: 'chat_taken',
              chatId: chat.chatId,
              assignedTo: agent.fullName,
              assignedAgentId: agentId.toString()
            }));
          } catch (error) {
            console.error('Error broadcasting:', error);
          }
        }
      });
    }

    console.log(`✅ Chat ${chatId} picked up by ${agent.fullName}`);

    res.json({
      success: true,
      message: wasAlreadyAssigned ? 'Chat already assigned to you' : 'Chat successfully picked up!',
      chat: {
        chatId: chat.chatId,
        customerName: chat.customerName,
        customerEmail: chat.customerEmail,
        subject: chat.subject,
        department: chat.department,
        priority: chat.priority,
        status: chat.status,
        assignedAgent: {
          id: agent._id,
          name: agent.fullName,
          email: agent.email
        }
      }
    });
  } catch (error) {
    console.error('❌ Pickup chat error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to pick up chat',
      error: error.message 
    });
  }
});



app.post('/api/chat/:chatId/send', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { sender, senderId, senderName, message, attachments } = req.body;

    if (!sender || !message) {
      return res.status(400).json({ success: false, message: 'Sender and message are required' });
    }

    const chat = await global.Chat.findOne({ chatId });
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat session not found' });
    }

    const newMessage = {
      messageId: global.generateMessageId(),
      sender,
      senderId: senderId || chat.customerId,
      senderName: senderName || chat.customerName,
      message: message.trim(),
      attachments: attachments || [],
      timestamp: new Date(),
      read: false
    };

    chat.messages.push(newMessage);
    await chat.save();

    // âœ… CRITICAL: Broadcast message immediately via WebSocket
    broadcastToChat(chatId, {
      type: 'new_message',
      message: newMessage,
      chatId: chatId,
      timestamp: new Date().toISOString()
    });

    console.log(`âœ… Message broadcast to chat ${chatId}`);

    res.json({
      success: true,
      message: 'Message sent successfully',
      messageData: newMessage
    });
  } catch (error) {
    console.error('âŒ Send message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

app.post('/api/chat/upload', upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    // Upload all files to Cloudinary in parallel
    const uploadedFiles = await Promise.all(
      req.files.map(async (file) => {
        const url = await uploadToCloudinary(file.buffer, file.mimetype, 'uyehtech/chat');
        return {
          filename: file.originalname,
          url,
          fileType: file.mimetype,
          fileSize: file.size
        };
      })
    );

    console.log(`📎 ${uploadedFiles.length} file(s) uploaded for chat`);

    res.json({
      success: true,
      message: 'Files uploaded successfully',
      files: uploadedFiles
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ success: false, message: 'File upload failed' });
  }
});


app.post('/api/chat/:chatId/read', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { messageIds } = req.body;

    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ success: false, message: 'Message IDs array required' });
    }

    const chat = await Chat.findOne({ chatId });
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat session not found' });
    }

    let markedCount = 0;
    chat.messages.forEach(msg => {
      if (messageIds.includes(msg.messageId) && !msg.read) {
        msg.read = true;
        markedCount++;
      }
    });

    await chat.save();

    // Broadcast via WebSocket
    broadcastToChat(chatId, {
      type: 'messages_read',
      messageIds: messageIds,
      chatId: chatId
    });

    res.json({ 
      success: true, 
      message: `${markedCount} message(s) marked as read` 
    });
  } catch (error) {
    console.error('❌ Mark read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark messages as read' });
  }
});

app.post('/api/chat/:chatId/end', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { rating, feedback } = req.body;

    const chat = await global.Chat.findOne({ chatId });
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat session not found' });
    }

    if (chat.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Chat session already closed' });
    }

    chat.messages.push({
      messageId: global.generateMessageId(),
      sender: 'system',
      senderId: 'system',
      senderName: 'System',
      message: 'Chat session ended.',
      timestamp: new Date()
    });

    chat.status = 'closed';
    chat.closedAt = new Date();
    
    if (rating && rating >= 1 && rating <= 5) {
      chat.rating = rating;
    }
    if (feedback) {
      chat.feedback = feedback.trim();
    }

    if (chat.assignedAgent) {
      const agent = await global.User.findById(chat.assignedAgent);
      if (agent && agent.agentInfo) {
        agent.agentInfo.activeChats = Math.max(0, agent.agentInfo.activeChats - 1);
        if (chat.status === 'resolved') {
          agent.agentInfo.resolvedChats += 1;
        }
        if (rating) {
          const totalRatings = agent.agentInfo.totalChats;
          const currentRating = agent.agentInfo.rating || 0;
          agent.agentInfo.rating = ((currentRating * (totalRatings - 1)) + rating) / totalRatings;
        }
        await agent.save();
      }
    }

    await chat.save();

    broadcastToChat(chatId, {
      type: 'chat_closed',
      chatId: chatId,
      rating: rating,
      feedback: feedback
    });

    console.log(`✅ Chat ended: ${chatId}`);

    res.json({
      success: true,
      message: 'Chat session ended successfully',
      rating: rating,
      feedback: feedback
    });
  } catch (error) {
    console.error('❌ End chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to end chat session' });
  }
});

// Resolve Chat (Mark as resolved before closing)
app.post('/api/chat/:chatId/resolve', async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findOne({ chatId });
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat session not found' });
    }

    if (chat.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Chat session already closed' });
    }

    chat.status = 'resolved';
    chat.resolvedAt = new Date();
    
    chat.messages.push({
      messageId: generateMessageId(),
      sender: 'system',
      senderId: 'system',
      senderName: 'System',
      message: 'Issue resolved.',
      timestamp: new Date()
    });

    await chat.save();

    // Broadcast via WebSocket
    broadcastToChat(chatId, {
      type: 'chat_resolved',
      chatId: chatId
    });

    console.log(`✅ Chat resolved: ${chatId}`);

    res.json({
      success: true,
      message: 'Chat marked as resolved'
    });
  } catch (error) {
    console.error('❌ Resolve chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to resolve chat' });
  }
});


// ════════════════════════════════════════════════════════════════════════════
// 👨‍💼 AGENT DASHBOARD ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/agent/stats', authenticateAgent, async (req, res) => {
  try {
    const agentId = req.agentUser._id;
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ✅ Add error handling for each query
    const [
      totalChats,
      openChats,
      assignedChats,
      inProgressChats,
      resolvedChats,
      closedChats,
      todayChats,
      weekChats,
      avgResponseTimeData,
      customerSatisfactionData
    ] = await Promise.all([
      global.Chat.countDocuments({ assignedAgent: agentId }).catch(() => 0),
      global.Chat.countDocuments({ status: 'open' }).catch(() => 0),
      global.Chat.countDocuments({ assignedAgent: agentId, status: 'assigned' }).catch(() => 0),
      global.Chat.countDocuments({ assignedAgent: agentId, status: 'in-progress' }).catch(() => 0),
      global.Chat.countDocuments({ assignedAgent: agentId, status: 'resolved' }).catch(() => 0),
      global.Chat.countDocuments({ assignedAgent: agentId, status: 'closed' }).catch(() => 0),
      global.Chat.countDocuments({ assignedAgent: agentId, createdAt: { $gte: today } }).catch(() => 0),
      global.Chat.countDocuments({ assignedAgent: agentId, createdAt: { $gte: thisWeek } }).catch(() => 0),
      global.Chat.aggregate([
        { $match: { assignedAgent: agentId, firstResponseTime: { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$firstResponseTime' } } }
      ]).catch(() => []),
      global.Chat.aggregate([
        { $match: { assignedAgent: agentId, rating: { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$rating' } } }
      ]).catch(() => [])
    ]);

    const resolvedToday = await global.Chat.countDocuments({
      assignedAgent: agentId,
      status: 'resolved',
      resolvedAt: { $gte: today }
    }).catch(() => 0);

    const avgResponse = avgResponseTimeData[0]?.avg || 0;
    const avgRating = customerSatisfactionData[0]?.avg || 0;
    const satisfactionRate = avgRating > 0 ? Math.round((avgRating / 5) * 100) : 0;

    const stats = {
      totalChats,
      openChats,
      assignedChats,
      inProgressChats,
      resolvedChats,
      closedChats,
      activeChats: assignedChats + inProgressChats,
      totalChatsToday: todayChats,
      totalChatsWeek: weekChats,
      resolvedToday,
      avgChatDuration: Math.round(avgResponse),
      avgResponseTime: Math.round(avgResponse),
      satisfactionRate,
      rating: avgRating.toFixed(1)
    };

    console.log(`✅ Agent stats calculated for ${req.agentUser.fullName}:`, stats);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch statistics',
      error: error.message 
    });
  }
});

console.log('✅ Part 7/8 Loaded: Chat System & Agent Dashboard Ready');
console.log('💬 Routes: Customer Chat, Agent Dashboard, Self-Assignment (FIXED)\n');


// IN SERVER.JS - Add this new endpoint around line 1400

// Analytics Endpoint - Track Chat Metrics
// ========================================
// âœ… COMPLETE ANALYTICS ENDPOINTS
// ========================================

app.get('/api/agent/analytics', authenticateAgent, async (req, res) => {
  try {
    const agentId = req.agentUser._id;
    const { timeRange = 'week' } = req.query;
    
    const now = new Date();
    let startDate;
    
    switch(timeRange) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    
    const chats = await Chat.find({
      assignedAgent: agentId,
      createdAt: { $gte: startDate }
    });
    
    const totalChats = chats.length;
    const resolvedChats = chats.filter(c => c.status === 'resolved').length;
    
    const avgResponseTime = chats.reduce((sum, chat) => {
      return sum + (chat.firstResponseTime || 0);
    }, 0) / (chats.filter(c => c.firstResponseTime).length || 1);
    
    const totalMessages = chats.reduce((sum, chat) => {
      return sum + chat.messages.filter(m => m.sender === 'agent').length;
    }, 0);
    
    const resolutionRate = totalChats > 0 
      ? Math.round((resolvedChats / totalChats) * 100) 
      : 0;
    
    // Calculate daily breakdown
    const dailyBreakdown = {};
    chats.forEach(chat => {
      const date = new Date(chat.createdAt).toISOString().split('T')[0];
      if (!dailyBreakdown[date]) {
        dailyBreakdown[date] = { total: 0, resolved: 0 };
      }
      dailyBreakdown[date].total++;
      if (chat.status === 'resolved') {
        dailyBreakdown[date].resolved++;
      }
    });
    
    res.json({
      success: true,
      analytics: {
        timeRange,
        totalChats,
        resolvedChats,
        resolutionRate: `${resolutionRate}%`,
        avgResponseTime: `${Math.round(avgResponseTime)}min`,
        totalMessages,
        dailyBreakdown: Object.entries(dailyBreakdown).map(([date, data]) => ({
          date,
          ...data
        }))
      }
    });
    
  } catch (error) {
    console.error('âŒ Analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
  }
});


// ═══════════════════════════════════════════════════════════════════
// PUBLIC: Create a support ticket
// POST /api/tickets/create
// No auth required — works for guests and logged-in users
// ═══════════════════════════════════════════════════════════════════
app.post('/api/tickets/create', async (req, res) => {
  // Guard: ensure model is available (belt-and-suspenders)
  if (!global.SupportTicket) {
    return res.status(503).json({ success: false, message: 'Service starting up, please retry in a moment.' });
  }
  try {
    const { subject, description, priority, category, name, email } = req.body;

    // ── Validate ─────────────────────────────────────────────────
    if (!name    || String(name).trim().length < 2)
      return res.status(400).json({ success: false, message: 'Your name is required.' });

    if (!email   || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()))
      return res.status(400).json({ success: false, message: 'A valid email address is required.' });

    if (!category || String(category).trim().length < 1)
      return res.status(400).json({ success: false, message: 'Please select a category.' });

    if (!subject  || String(subject).trim().length < 3)
      return res.status(400).json({ success: false, message: 'Subject is required (min 3 characters).' });

    if (!description || String(description).trim().length < 10)
      return res.status(400).json({ success: false, message: 'Please describe your issue (min 10 characters).' });

    // ── Sanitise inputs ───────────────────────────────────────────
    const cleanName  = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanSub   = String(subject).trim();
    const cleanDesc  = String(description).trim();
    const cleanCat   = String(category).trim();

    const VALID_PRI  = ['low', 'medium', 'high', 'urgent'];
    const cleanPri   = VALID_PRI.includes(priority) ? priority : 'medium';

    // ── Generate guaranteed-unique ticketId ───────────────────────
    const ticketId = 'TKT-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex').toUpperCase();

    // ── Optionally link to registered user ────────────────────────
    let linkedUserId = null;
    try {
      const found = await User.findOne({ email: cleanEmail }).select('_id').lean();
      if (found) linkedUserId = found._id;
    } catch (_) { /* non-fatal */ }

    // ── Create and save ───────────────────────────────────────────
    const ticket = new SupportTicket({
      ticketId,
      userId:      linkedUserId || null,
      guestEmail:  linkedUserId ? null : cleanEmail,
      subject:     cleanSub,
      description: cleanDesc,
      priority:    cleanPri,
      category:    cleanCat,
      status:      'open',
      messages: [{
        sender:     'customer',
        senderId:   linkedUserId ? String(linkedUserId) : cleanEmail,
        senderName: cleanName,
        message:    cleanDesc,
        timestamp:  new Date()
      }]
    });

    await ticket.save();

    console.log(`🎫 Ticket created: ${ticketId} | ${cleanEmail} | ${cleanPri} | ${cleanCat}`);

    // ── Notify agents via WebSocket ───────────────────────────────
    if (global.wss && global.wss.clients) {
      const wsMsg = JSON.stringify({
        type: 'new_ticket', ticketId,
        subject: cleanSub, priority: cleanPri,
        category: cleanCat, name: cleanName, email: cleanEmail
      });
      global.wss.clients.forEach(function(client) {
        if (client.readyState === 1) {
          try { client.send(wsMsg); } catch (_) {}
        }
      });
    }

    // ── Send emails async — never block the response ──────────────
    setImmediate(async function() {
      try {
        if (typeof global.sendTicketConfirmationEmail === 'function') {
          await global.sendTicketConfirmationEmail(cleanEmail, {
            ticketId, name: cleanName, category: cleanCat,
            priority: cleanPri, message: cleanDesc
          });
        }
      } catch (e) { console.error('Ticket confirm email error:', e.message); }

      try {
        if (typeof global.sendNewTicketAlertToAdmin === 'function') {
          await global.sendNewTicketAlertToAdmin({
            ticketId, name: cleanName, email: cleanEmail,
            category: cleanCat, priority: cleanPri, message: cleanDesc
          });
        }
      } catch (e) { console.error('Admin alert email error:', e.message); }
    });

    // ── Done ──────────────────────────────────────────────────────
    return res.status(201).json({
      success:           true,
      message:           'Ticket submitted successfully. We will respond within 24 hours.',
      ticketId,
      priority:          cleanPri,
      estimatedResponse: (cleanPri === 'urgent' || cleanPri === 'high') ? '2–4 hours' : '24 hours'
    });

  } catch (err) {

    // Duplicate ticketId (E11000) — retry once with a fresh ID
    if (err.code === 11000) {
      console.error('E11000 on ticket create — retrying with new ID');
      try {
        const { subject, description, priority, category, name, email } = req.body;
        const retryId  = 'TKT-' + Date.now() + '-' + crypto.randomBytes(9).toString('hex').toUpperCase();
        const VALID2   = ['low','medium','high','urgent'];
        const cleanPri2= VALID2.includes(priority) ? priority : 'medium';
        const cleanEmail2 = String(email  || '').trim().toLowerCase();
        const cleanName2  = String(name   || '').trim();

        const retry = new SupportTicket({
          ticketId:    retryId,
          guestEmail:  cleanEmail2,
          subject:     String(subject     || '').trim(),
          description: String(description || '').trim(),
          priority:    cleanPri2,
          category:    String(category    || '').trim(),
          status:      'open',
          messages: [{
            sender: 'customer', senderId: cleanEmail2,
            senderName: cleanName2,
            message: String(description || '').trim(),
            timestamp: new Date()
          }]
        });

        await retry.save();

        return res.status(201).json({
          success: true,
          message: 'Ticket submitted.',
          ticketId: retryId,
          priority: cleanPri2
        });

      } catch (retryErr) {
        console.error('Retry also failed:', retryErr.message);
        return res.status(500).json({ success: false, message: 'Could not save ticket. Please try again.' });
      }
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
      const first = Object.values(err.errors)[0]?.message || 'Validation failed.';
      return res.status(400).json({ success: false, message: first });
    }

    console.error('❌ /api/tickets/create error:', err.message, err.stack);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

// Get Agent's Tickets
app.get('/api/agent/tickets', authenticateAgent, async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 20 } = req.query;
    
   // AFTER — show both assigned-to-me AND unassigned open tickets:
let query = status !== 'all' && status !== 'open'
  ? { assignedAgent: req.agentUser._id }
  : { $or: [{ assignedAgent: req.agentUser._id }, { assignedAgent: null, status: 'open' }] };

    if (status !== 'all') {
      query.status = status;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [tickets, total] = await Promise.all([
      SupportTicket.find(query)
        .populate('userId', 'fullName email')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      SupportTicket.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      tickets,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('âŒ Get tickets error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

// Get All Tickets (Admin/Agent)
app.get('/api/admin/tickets', authenticateAdmin, async (req, res) => {
  try {
    const { status = 'all', priority = 'all', page = 1, limit = 20, search = '', assigned = 'all' } = req.query;

    let query = {};

    if (status !== 'all')   query.status   = status;
    if (priority !== 'all') query.priority = priority;
    if (assigned === 'unassigned') query.assignedAgent = null;
    else if (assigned === 'assigned') query.assignedAgent = { $ne: null };

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { ticketId:    { $regex: s, $options: 'i' } },
        { subject:     { $regex: s, $options: 'i' } },
        { guestEmail:  { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [tickets, total] = await Promise.all([
      SupportTicket.find(query)
        .populate('userId', 'fullName email')
        .populate('assignedAgent', 'fullName email')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      SupportTicket.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      tickets,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('âŒ Get all tickets error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

// Update Ticket
app.put('/api/tickets/:ticketId', authenticateAgent, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, priority, assignedAgent, response } = req.body;
    
    const ticket = await SupportTicket.findOne({ ticketId });
    
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    if (status) ticket.status = status;
    if (priority) ticket.priority = priority;
    if (assignedAgent) ticket.assignedAgent = assignedAgent;
    
    if (response) {
      ticket.messages.push({
        sender: 'agent',
        senderId: req.agentUser._id,
        senderName: req.agentUser.fullName || 'Agent',
        message: response,
        timestamp: new Date()
      });
    }
    
    if (status === 'resolved') {
      ticket.resolvedAt = new Date();
    }
    
    await ticket.save();
    
    console.log(`âœ… Ticket updated: ${ticketId}`);
    
    res.json({
      success: true,
      message: 'Ticket updated successfully',
      ticket
    });
    
  } catch (error) {
    console.error('âŒ Update ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to update ticket' });
  }
});

// Assign Ticket to Agent
app.post('/api/tickets/:ticketId/assign', authenticateAdmin, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { agentId } = req.body;
    
    if (!agentId) {
      return res.status(400).json({ success: false, message: 'Agent ID required' });
    }
    
    const ticket = await SupportTicket.findOne({ ticketId });
    
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    const agent = await User.findById(agentId);
    
    if (!agent || (!agent.isAgent && !agent.isAdmin)) {
      return res.status(400).json({ success: false, message: 'Invalid agent ID' });
    }
    
    ticket.assignedAgent = agentId;
    ticket.status = 'in-progress';
    
    ticket.messages.push({
      sender: 'system',
      message: `Ticket assigned to ${agent.fullName}`,
      timestamp: new Date()
    });
    
    await ticket.save();
    
    console.log(`âœ… Ticket ${ticketId} assigned to ${agent.fullName}`);
    
    res.json({
      success: true,
      message: 'Ticket assigned successfully',
      ticket
    });
    
  } catch (error) {
    console.error('âŒ Assign ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign ticket' });
  }
});
// ═══════════════════════════════════════════════════════════════════════════
// 🎫 SUPPORT TICKET SYSTEM — COMPLETE API
// Missing routes for contact page + agent self-assignment
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// EMAIL HELPERS (ticket-specific)
// ─────────────────────────────────────────────────────────────────────────

async function sendTicketConfirmationEmail(to, ticketData) {
  try {
    if (!resend || !process.env.RESEND_API_KEY) {
      console.log(`📧 Ticket confirmation skipped (email not configured): ${ticketData.ticketId}`);
      return { success: true, method: 'console_log' };
    }

    const priorityColors = {
      low: '#22c55e', medium: '#f59e0b', high: '#ef4444', urgent: '#dc2626'
    };
    const color = priorityColors[ticketData.priority] || '#f59e0b';

    const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#0a0a0a;padding:40px 20px;margin:0">
<div style="max-width:600px;margin:0 auto;background:#1a1a1a;border-radius:16px;overflow:hidden;border:1px solid #2a2a2a">
  <div style="background:linear-gradient(135deg,#00ff88,#00b359);padding:30px;text-align:center">
    <h1 style="color:#0a0a0a;margin:0;font-size:22px">Support Ticket Received</h1>
    <p style="color:#0a0a0a;margin:8px 0 0;opacity:0.8">We've got your message, ${String(ticketData.name || 'there')}</p>
  </div>
  <div style="padding:32px;color:#fff">
    <div style="background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;padding:20px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px">
        <span style="color:#a0a0a0;font-size:13px">Ticket ID</span>
        <span style="color:#00ff88;font-weight:bold;font-size:14px">${String(ticketData.ticketId || '')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px">
        <span style="color:#a0a0a0;font-size:13px">Category</span>
        <span style="color:#fff;font-size:14px">${String(ticketData.category || '')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px">
        <span style="color:#a0a0a0;font-size:13px">Priority</span>
        <span style="background:${color};color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:bold;text-transform:uppercase">${String(ticketData.priority || 'medium')}</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:#a0a0a0;font-size:13px">Status</span>
        <span style="color:#fff;font-size:14px">Open — being reviewed</span>
      </div>
    </div>
    <div style="background:#0a0a0a;border-left:3px solid #00ff88;padding:16px;border-radius:0 8px 8px 0;margin-bottom:20px">
      <p style="color:#a0a0a0;font-size:12px;margin:0 0 6px">Your message:</p>
      <p style="color:#fff;font-size:14px;margin:0;line-height:1.6">${String(ticketData.message || '')}</p>
    </div>
    <p style="color:#a0a0a0;font-size:13px;line-height:1.7">
      Our team will respond within <strong style="color:#00ff88">24 hours</strong>.
      For urgent issues, use
      <a href="${FRONTEND_URL}/marketplace/support" style="color:#00ff88">Live Chat</a> instead.
    </p>
    <p style="color:#a0a0a0;font-size:12px;margin-top:20px">
      Keep your ticket ID handy: <strong style="color:#00ff88">${String(ticketData.ticketId || '')}</strong>
    </p>
  </div>
  <div style="background:#111;padding:20px;text-align:center;border-top:1px solid #2a2a2a">
    <p style="color:#666;font-size:12px;margin:0">© ${new Date().getFullYear()} UYEH TECH — uyehtech@gmail.com</p>
  </div>
</div>
</body></html>`;

    const { data, error } = await resend.emails.send({
      from: `${RESEND_SENDER_NAME} <${RESEND_SENDER_EMAIL}>`,
      to: [to],
      subject: `🎫 Ticket ${ticketData.ticketId} — We received your message`,
      html
    });

    if (error) {
      console.error('❌ Ticket email send error:', error);
      return { success: false, method: 'resend_error', error };
    }

    console.log('✅ Ticket confirmation sent:', data?.id);
    return { success: true, method: 'resend', data };

  } catch (err) {
    console.error('❌ sendTicketConfirmationEmail threw:', err.message);
    return { success: false, error: err.message };
  }
}

async function sendNewTicketAlertToAdmin(ticketData) {
  try {
    if (!resend || !process.env.RESEND_API_KEY) {
      console.log(`📧 Admin ticket alert skipped (email not configured): ${ticketData.ticketId}`);
      return;
    }

    await resend.emails.send({
      from: `${RESEND_SENDER_NAME} <${RESEND_SENDER_EMAIL}>`,
      to: [ADMIN_EMAIL],
      subject: `🚨 New Ticket [${(ticketData.priority || 'medium').toUpperCase()}] — ${ticketData.ticketId}`,
      html: `
<div style="font-family:Arial,sans-serif;max-width:500px;padding:24px;background:#0a0a0a;color:#fff;border-radius:12px;border:1px solid #333">
  <h2 style="color:#00ff88;margin:0 0 16px">New Support Ticket</h2>
  <p><b>ID:</b> <span style="color:#00ff88">${String(ticketData.ticketId || '')}</span></p>
  <p><b>From:</b> ${String(ticketData.name || '')} &lt;${String(ticketData.email || '')}&gt;</p>
  <p><b>Role:</b> ${String(ticketData.role || 'Not specified')}</p>
  <p><b>Category:</b> ${String(ticketData.category || '')}</p>
  <p><b>Priority:</b> ${String(ticketData.priority || 'medium')}</p>
  ${ticketData.orderId        ? `<p><b>Order ID:</b> ${String(ticketData.orderId)}</p>`        : ''}
  ${ticketData.transactionRef ? `<p><b>Transaction Ref:</b> ${String(ticketData.transactionRef)}</p>` : ''}
  <div style="background:#1a1a1a;padding:14px;border-radius:8px;margin-top:12px">
    <p style="color:#a0a0a0;font-size:12px;margin:0 0 6px">Message:</p>
    <p style="margin:0;line-height:1.6">${String(ticketData.message || '')}</p>
  </div>
  <a href="${FRONTEND_URL}/super-admin/support-tickets"
     style="display:inline-block;margin-top:16px;background:#00ff88;color:#000;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:bold">
    View in Dashboard →
  </a>
</div>`
    });
    console.log('✅ Admin ticket alert sent');
  } catch (err) {
    console.error('❌ sendNewTicketAlertToAdmin:', err.message);
  }
}


async function sendTicketReplyEmail(to, replyData) {
  try {
    if (!global.resend || !process.env.RESEND_API_KEY) return;

    await global.resend.emails.send({
      from: `${global.RESEND_SENDER_NAME} Support <${global.RESEND_SENDER_EMAIL}>`,
      to: [to],
      subject: `Re: Ticket ${replyData.ticketId} — ${replyData.subject}`,
      html: `
<div style="font-family:Arial,sans-serif;max-width:600px;background:#0a0a0a;border-radius:16px;overflow:hidden;border:1px solid #2a2a2a">
  <div style="background:linear-gradient(135deg,#00ff88,#00b359);padding:20px 30px">
    <h2 style="color:#0a0a0a;margin:0;font-size:18px">Reply to Your Support Ticket</h2>
    <p style="color:#0a0a0a;margin:4px 0 0;font-size:13px;opacity:0.8">${replyData.ticketId}</p>
  </div>
  <div style="padding:28px;color:#fff">
    <div style="background:#111;border-left:3px solid #00ff88;padding:16px;border-radius:0 8px 8px 0;margin-bottom:20px">
      <p style="color:#a0a0a0;font-size:12px;margin:0 0 8px">Response from ${replyData.agentName}:</p>
      <p style="color:#fff;font-size:14px;margin:0;line-height:1.7">${replyData.message}</p>
    </div>
    ${replyData.status === 'resolved' ? `<div style="background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.25);border-radius:10px;padding:14px;text-align:center"><p style="color:#00ff88;margin:0;font-weight:bold">✅ Your ticket has been marked as resolved</p></div>` : ''}
    <p style="color:#a0a0a0;font-size:13px;margin-top:20px">If you need further help, reply to this email or <a href="${global.FRONTEND_URL}/marketplace/support" style="color:#00ff88">start a live chat</a>.</p>
  </div>
</div>`
    });
    console.log(`✅ Ticket reply email sent to ${to}`);
  } catch (err) {
    console.error('❌ sendTicketReplyEmail:', err.message);
  }
}

global.sendTicketConfirmationEmail = sendTicketConfirmationEmail;
global.sendNewTicketAlertToAdmin   = sendNewTicketAlertToAdmin;
global.sendTicketReplyEmail        = sendTicketReplyEmail;

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC: Submit ticket from contact page (no auth required)
// This is what your contact form POSTs to
// ─────────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// FIX 1 — ONE-TIME DATABASE CLEANUP (add this route temporarily)
// Hit GET /api/admin/fix-tickets once after deploying, then remove it
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/admin/fix-tickets', authenticateAdmin, async (req, res) => {
  try {
    // 1. Delete malformed tickets
    const deleteResult = await global.SupportTicket.deleteMany({
      $or: [
        { ticketId: null },
        { ticketId: '' },
        { ticketId: { $regex: /^TKT-undefined/ } },
        { subject: null },
        { description: null }
      ]
    });

    // 2. Remove duplicates — keep only the most recent per ticketId
    const allTickets = await global.SupportTicket.find({}).sort({ createdAt: -1 }).lean();
    const seen = new Set();
    const duplicateIds = [];
    for (const ticket of allTickets) {
      if (!ticket.ticketId) continue;
      if (seen.has(ticket.ticketId)) {
        duplicateIds.push(ticket._id);
      } else {
        seen.add(ticket.ticketId);
      }
    }
    let dupResult = { deletedCount: 0 };
    if (duplicateIds.length > 0) {
      dupResult = await global.SupportTicket.deleteMany({ _id: { $in: duplicateIds } });
    }

    // 3. Rebuild the index cleanly (catch "already exists" — that's fine)
    try {
      await global.SupportTicket.collection.dropIndex('ticketId_1');
    } catch (e) {
      // Index may not exist — that's fine
    }
    try {
      await global.SupportTicket.collection.createIndex(
        { ticketId: 1 },
        { unique: true, sparse: true, background: false }
      );
    } catch (e) {
      if (!e.message.includes('already exists')) {
        throw e; // Only rethrow unexpected errors
      }
    }

    const remaining = await global.SupportTicket.countDocuments();

    console.log(`🔧 fix-tickets: deleted ${deleteResult.deletedCount} malformed, ${dupResult.deletedCount} duplicates`);

    res.json({
      success: true,
      message: 'Database cleaned and index rebuilt',
      deleted: {
        malformed: deleteResult.deletedCount,
        duplicates: dupResult.deletedCount
      },
      remaining
    });

  } catch (error) {
    console.error('❌ fix-tickets error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/backfill-creator-products', authenticateAdmin, async (req, res) => {
  try {
    const products = await Product.find({ isCreatorProduct: true }).lean();
    let fixed   = 0;
    let skipped = 0;
    const log   = [];
 
    for (const p of products) {
      if (!p.creatorProductId) { skipped++; continue; }
 
      const cp = await CreatorProduct.findById(p.creatorProductId).lean();
      if (!cp) { skipped++; continue; }
 
      const update = {};
 
      // ── 1. Resolve embed fields from raw URLs ─────────────────────
      // This is what was missing — parseExternalMediaUrl was never
      // called on submit, so we call it now during backfill.
      const rawVideoUrl = cp.externalVideoUrl || p.externalVideoUrl || null;
      const rawAudioUrl = cp.externalAudioUrl || p.externalAudioUrl || null;
      const rawUrl      = rawVideoUrl || rawAudioUrl;
 
      if (rawUrl && typeof parseExternalMediaUrl === 'function') {
        const parsed = parseExternalMediaUrl(rawUrl);
 
        if (parsed.embedUrl && parsed.embedUrl !== p.embedUrl) {
          update.embedUrl  = parsed.embedUrl;
        }
        if (parsed.embedType && parsed.embedType !== 'unknown' && parsed.embedType !== p.embedType) {
          update.embedType = parsed.embedType;
        }
        if (parsed.mediaType && parsed.mediaType !== 'unknown' && parsed.mediaType !== p.mediaType) {
          update.mediaType = parsed.mediaType;
        }
 
        // Also patch the raw URL fields if Product was missing them
        if (rawVideoUrl && !p.externalVideoUrl) update.externalVideoUrl = rawVideoUrl;
        if (rawAudioUrl && !p.externalAudioUrl) update.externalAudioUrl = rawAudioUrl;
      }
 
      // ── 2. Infer mediaType from hostedFile if still missing ───────
      const hasHostedFile = !!(
        (cp.hostedFile?.publicId && cp.hostedFile.publicId.trim().length > 0) ||
        (p.hostedFile?.publicId  && p.hostedFile.publicId.trim().length  > 0)
      );
 
      if (!update.mediaType && !p.mediaType) {
        if (hasHostedFile)                    update.mediaType = 'file';
        else if (p.productType === 'course')  update.mediaType = 'course';
        else if (p.productType === 'music')   update.mediaType = 'audio';
      }
 
      // ── 3. Copy hostedFile if Product is missing it ───────────────
      if (
        cp.hostedFile?.publicId &&
        cp.hostedFile.publicId.trim().length > 0 &&
        (!p.hostedFile?.publicId || p.hostedFile.publicId.trim().length === 0)
      ) {
        update.hostedFile = cp.hostedFile;
      }
 
      // ── 4. Copy other missing delivery fields from cp → Product ───
      const copyFields = [
        'courseData', 'audioData', 'softwareData',
        'fileSize', 'version', 'requirements', 'features',
        'previewUrl', 'previewType', 'downloadLink'
      ];
      for (const field of copyFields) {
        if (!p[field] && cp[field]) update[field] = cp[field];
      }
 
      // ── 5. Also patch the CreatorProduct itself so future
      //       approvals copy correct values ─────────────────────────
      const cpUpdate = {};
      if (update.embedUrl  && !cp.embedUrl)  cpUpdate.embedUrl  = update.embedUrl;
      if (update.embedType && !cp.embedType) cpUpdate.embedType = update.embedType;
      if (update.mediaType && !cp.mediaType) cpUpdate.mediaType = update.mediaType;
 
      if (Object.keys(cpUpdate).length > 0) {
        await CreatorProduct.findByIdAndUpdate(cp._id, { $set: cpUpdate });
      }
 
      // ── 6. Save if anything changed ───────────────────────────────
      if (Object.keys(update).length > 0) {
        await Product.findByIdAndUpdate(p._id, { $set: update });
        fixed++;
        log.push({
          title:   p.title,
          patched: Object.keys(update)
        });
      } else {
        skipped++;
        log.push({ title: p.title, patched: [] });
      }
    }
 
    console.log('🔧 Backfill complete:', JSON.stringify(log, null, 2));
 
    res.json({
      success: true,
      message: `Backfilled ${fixed} of ${products.length} products (${skipped} already correct or unlinked)`,
      fixed,
      skipped,
      total: products.length,
      log
    });
 
  } catch (e) {
    console.error('❌ Backfill error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});
 
 
// ═══════════════════════════════════════════════════════════════════════════
// ADMIN UTILITY ROUTE — backfill all existing approved products
// Add this route so you can fix products already in the DB without manual work.
// Hit POST /api/admin/creator-products/sync-all once after deploying.
// ═══════════════════════════════════════════════════════════════════════════
 
app.post('/api/admin/creator-products/sync-all', authenticateAdmin, async (req, res) => {
  const log     = [];
  let fixed     = 0;
  let skipped   = 0;
  let errors    = 0;
 
  try {
    const approved = await CreatorProduct.find({ status: 'approved', productId: { $exists: true, $ne: null } })
      .populate('creatorId')
      .lean();
 
    console.log(`🔄 Sync-all: processing ${approved.length} approved creator products…`);
 
    for (const cp of approved) {
      try {
        // Re-process courseData chapters
        const processedCourse = cp.courseData
          ? processChaptersForDelivery(JSON.parse(JSON.stringify(cp.courseData)))
          : null;
 
        // Resolve embed fields
        let embedUrl  = cp.embedUrl  || null;
        let embedType = cp.embedType || null;
 
        if (!embedUrl) {
          const rawUrl = cp.externalVideoUrl || cp.externalAudioUrl || null;
          if (rawUrl && typeof parseExternalMediaUrl === 'function') {
            const parsed = parseExternalMediaUrl(rawUrl);
            if (parsed.embedType && parsed.embedType !== 'unknown') {
              embedUrl  = parsed.embedUrl;
              embedType = parsed.embedType;
            }
          }
        }
 
        const mediaType = inferProductMediaType({ ...cp, embedUrl, embedType, courseData: processedCourse });
 
        const update = {
          productType:      cp.productType  || 'download',
          hostedFile:       cp.hostedFile   || null,
          downloadLink:     cp.downloadLink || null,
          fileSize:         cp.fileSize     || null,
          version:          cp.version      || null,
          features:         cp.features     || [],
          requirements:     cp.requirements || [],
          tags:             cp.tags         || [],
          previewUrl:       cp.previewUrl   || null,
          previewType:      cp.previewType  || 'none',
          courseData:       processedCourse,
          audioData:        cp.audioData    || null,
          softwareData:     cp.softwareData || null,
          externalVideoUrl: cp.externalVideoUrl || null,
          externalAudioUrl: cp.externalAudioUrl || null,
          embedType,
          embedUrl,
          mediaType,
        };
 
        await Product.findByIdAndUpdate(cp.productId, { $set: update });
 
        // Also update CreatorProduct with resolved fields
        await CreatorProduct.findByIdAndUpdate(cp._id, {
          $set: { embedUrl, embedType, mediaType, courseData: processedCourse || cp.courseData }
        });
 
        fixed++;
        log.push({ title: cp.title, mediaType, embedType: embedType || '—', fixed: true });
      } catch (err) {
        errors++;
        log.push({ title: cp.title, error: err.message, fixed: false });
        console.error(`❌ Sync failed for "${cp.title}":`, err.message);
      }
    }
 
    console.log(`✅ Sync-all complete: ${fixed} fixed, ${skipped} skipped, ${errors} errors`);
 
    res.json({
      success: true,
      message: `Synced ${fixed} of ${approved.length} products`,
      fixed, skipped, errors,
      total: approved.length,
      log
    });
 
  } catch (err) {
    console.error('❌ Sync-all fatal error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});
 
console.log('✅ Creator Product Pipeline Patch Loaded');



// ─────────────────────────────────────────────────────────────────────────
// PUBLIC: Check ticket status by ticketId + email (no auth)
// ─────────────────────────────────────────────────────────────────────────
app.get('/api/tickets/status/:ticketId', async (req, res) => {
  let ticket;
  try {
    const { ticketId } = req.params;
    const { email } = req.query;

    

    const ticket = await global.SupportTicket.findOne({ ticketId })
      .populate('assignedAgent', 'fullName agentInfo')
      .lean();

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // email is optional — if provided, used only for soft ownership hint, not enforcement
    const emailProvided = email && String(email).trim().length > 0;
    
    // Return safe public view — no internal notes
    const publicMessages = (ticket.messages || [])
      .filter(m => m.sender !== 'system')
      .map(m => ({
        sender: m.sender,
        senderName: m.sender === 'agent' ? (ticket.assignedAgent?.fullName || 'Support Agent') : m.senderName,
        message: m.message,
        timestamp: m.timestamp
      }));

    res.json({
      success: true,
      ticket: {
        ticketId: ticket.ticketId,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        resolvedAt: ticket.resolvedAt,
        assignedAgent: ticket.assignedAgent
          ? { name: ticket.assignedAgent.fullName }
          : null,
        messages: publicMessages
      }
    });
  } catch (error) {
    console.error('❌ Ticket status error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// CUSTOMER (auth): Get own tickets
// ─────────────────────────────────────────────────────────────────────────

app.get('/api/my-tickets', global.authenticateToken, async (req, res) => {
  try {
    const tickets = await global.SupportTicket.find({ userId: req.user.userId })
      .populate('assignedAgent', 'fullName')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, tickets, count: tickets.length });
  } catch (error) {
    console.error('❌ My tickets error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// AGENT: Self-assign (pickup) a ticket
// ─────────────────────────────────────────────────────────────────────────

app.post('/api/agent/tickets/:ticketId/pickup', global.authenticateAgent, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const agent = req.agentUser;

    const ticket = await global.SupportTicket.findOne({ ticketId });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Cannot pick up a resolved or closed ticket' });
    }

    // Already assigned to this agent
    if (ticket.assignedAgent && ticket.assignedAgent.toString() === agent._id.toString()) {
      return res.json({ success: true, message: 'Ticket already assigned to you', ticket });
    }

    // Assigned to someone else
    if (ticket.assignedAgent && ticket.assignedAgent.toString() !== agent._id.toString()) {
      const other = await global.User.findById(ticket.assignedAgent).select('fullName');
      return res.status(400).json({
        success: false,
        message: `This ticket is already being handled by ${other?.fullName || 'another agent'}`
      });
    }

    ticket.assignedAgent = agent._id;
    ticket.status = 'in-progress';
    ticket.messages.push({
      sender: 'system',
      senderId: 'system',
      senderName: 'System',
      message: `Ticket picked up by ${agent.fullName}`,
      timestamp: new Date()
    });
    await ticket.save();

    // Notify agent's browser via WebSocket
    if (global.wss && global.wss.clients) {
      global.wss.clients.forEach(client => {
        if (client.readyState === 1) {
          try {
            client.send(JSON.stringify({
              type: 'ticket_assigned',
              ticketId,
              agentName: agent.fullName
            }));
          } catch (_) {}
        }
      });
    }

    console.log(`🎫 Ticket ${ticketId} picked up by ${agent.fullName}`);

    res.json({ success: true, message: `You have picked up ticket ${ticketId}`, ticket });
  } catch (error) {
    console.error('❌ Ticket pickup error:', error);
    res.status(500).json({ success: false, message: 'Failed to pick up ticket' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// AGENT: Reply to a ticket
// ─────────────────────────────────────────────────────────────────────────

app.post('/api/agent/tickets/:ticketId/reply', global.authenticateAgent, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message, status } = req.body;
    const agent = req.agentUser;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Reply message required' });
    }

    const ticket = await global.SupportTicket.findOne({ ticketId });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    // Auto-assign if not yet assigned
    if (!ticket.assignedAgent) {
      ticket.assignedAgent = agent._id;
      ticket.status = 'in-progress';
    }

    ticket.messages.push({
      sender: 'agent',
      senderId: agent._id.toString(),
      senderName: agent.fullName,
      message: message.trim(),
      timestamp: new Date()
    });

    // Update status if provided
    const allowedStatuses = ['open', 'in-progress', 'resolved', 'closed'];
    if (status && allowedStatuses.includes(status)) {
      ticket.status = status;
    }
    if (ticket.status === 'resolved') ticket.resolvedAt = new Date();

    await ticket.save();

    // Find customer email for reply notification
    const submitterMessage = ticket.messages.find(m => m.sender === 'customer');
    const customerEmail = submitterMessage?.senderId?.includes('@')
      ? submitterMessage.senderId
      : null;

    if (customerEmail) {
      setImmediate(() => sendTicketReplyEmail(customerEmail, {
        ticketId: ticket.ticketId,
        subject: ticket.subject,
        message: message.trim(),
        agentName: agent.fullName,
        status: ticket.status
      }));
    }

    // Notify via WebSocket
    if (global.wss && global.wss.clients) {
      global.wss.clients.forEach(client => {
        if (client.readyState === 1) {
          try {
            client.send(JSON.stringify({
              type: 'ticket_reply',
              ticketId,
              agentName: agent.fullName,
              status: ticket.status
            }));
          } catch (_) {}
        }
      });
    }

    console.log(`📝 Agent ${agent.fullName} replied to ticket ${ticketId} [${ticket.status}]`);

    res.json({ success: true, message: 'Reply sent', ticket });
  } catch (error) {
    console.error('❌ Ticket reply error:', error);
    res.status(500).json({ success: false, message: 'Failed to send reply' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// AGENT: Get all open/unassigned tickets (for the dashboard queue)
// ─────────────────────────────────────────────────────────────────────────

app.get('/api/agent/tickets/queue', global.authenticateAgent, async (req, res) => {
  try {
    const { priority, page = 1, limit = 30 } = req.query;
    const query = { assignedAgent: null, status: 'open' };
    if (priority && priority !== 'all') query.priority = priority;

    const [tickets, total] = await Promise.all([
      global.SupportTicket.find(query)
        .sort({ priority: -1, createdAt: 1 }) // urgent first, oldest first
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean(),
      global.SupportTicket.countDocuments(query)
    ]);

    res.json({
      success: true,
      tickets,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('❌ Ticket queue error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch queue' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// AGENT: Get agent's own assigned tickets
// ─────────────────────────────────────────────────────────────────────────

app.get('/api/agent/tickets/mine', global.authenticateAgent, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { assignedAgent: req.agentUser._id };
    if (status && status !== 'all') query.status = status;

    const [tickets, total] = await Promise.all([
      global.SupportTicket.find(query)
        .sort({ updatedAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean(),
      global.SupportTicket.countDocuments(query)
    ]);

    res.json({
      success: true,
      tickets,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('❌ Agent mine tickets error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// AGENT/ADMIN: Get single ticket with full thread
// ─────────────────────────────────────────────────────────────────────────

app.get('/api/agent/tickets/:ticketId', global.authenticateAgent, async (req, res) => {
  try {
    const ticket = await global.SupportTicket.findOne({ ticketId: req.params.ticketId })
      .populate('userId', 'fullName email country createdAt')
      .populate('assignedAgent', 'fullName email agentInfo')
      .lean();

    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    res.json({ success: true, ticket });
  } catch (error) {
    console.error('❌ Get ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// ADMIN: Update any ticket (status, priority, re-assign)
// ─────────────────────────────────────────────────────────────────────────

app.put('/api/admin/tickets/:ticketId', global.authenticateAdmin, async (req, res) => {
  try {
    const { status, priority, assignedAgent, adminNote } = req.body;
    const ticket = await global.SupportTicket.findOne({ ticketId: req.params.ticketId });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    if (status)         ticket.status = status;
    if (priority)       ticket.priority = priority;
    if (assignedAgent)  ticket.assignedAgent = assignedAgent;
    if (status === 'resolved') ticket.resolvedAt = new Date();

    if (adminNote) {
      ticket.messages.push({
        sender: 'agent',
        senderId: req.adminUser._id.toString(),
        senderName: `Admin: ${req.adminUser.fullName}`,
        message: adminNote.trim(),
        timestamp: new Date()
      });
    }

    await ticket.save();
    res.json({ success: true, message: 'Ticket updated', ticket });
  } catch (error) {
    console.error('❌ Admin update ticket error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// ADMIN: Ticket stats for dashboard
// ─────────────────────────────────────────────────────────────────────────

app.get('/api/admin/tickets/stats', global.authenticateAdmin, async (req, res) => {
  try {
    const [open, inProgress, resolved, closed, urgent, unassigned] = await Promise.all([
      global.SupportTicket.countDocuments({ status: 'open' }),
      global.SupportTicket.countDocuments({ status: 'in-progress' }),
      global.SupportTicket.countDocuments({ status: 'resolved' }),
      global.SupportTicket.countDocuments({ status: 'closed' }),
      global.SupportTicket.countDocuments({ priority: 'urgent', status: { $nin: ['resolved', 'closed'] } }),
      global.SupportTicket.countDocuments({ assignedAgent: null, status: { $in: ['open', 'in-progress'] } })
    ]);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyNew = await global.SupportTicket.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

    res.json({
      success: true,
      stats: { open, inProgress, resolved, closed, urgent, unassigned, weeklyNew, total: open + inProgress + resolved + closed }
    });
  } catch (error) {
    console.error('❌ Ticket stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// ADMIN: Delete a ticket
app.delete('/api/admin/tickets/:ticketId', global.authenticateAdmin, async (req, res) => {
  try {
    const ticket = await global.SupportTicket.findOneAndDelete({ ticketId: req.params.ticketId });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    console.log(`🗑️  Ticket deleted: ${req.params.ticketId}`);
    res.json({ success: true, message: 'Ticket deleted' });
  } catch (error) {
    console.error('❌ Delete ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete ticket' });
  }
});

// ADMIN: Bulk-close all resolved tickets
app.post('/api/admin/tickets/bulk-close', global.authenticateAdmin, async (req, res) => {
  try {
    const result = await global.SupportTicket.updateMany(
      { status: 'resolved' },
      { $set: { status: 'closed', updatedAt: new Date() } }
    );
    res.json({ success: true, message: `${result.modifiedCount} ticket(s) closed`, count: result.modifiedCount });
  } catch (error) {
    console.error('❌ Bulk close error:', error);
    res.status(500).json({ success: false, message: 'Bulk close failed' });
  }
});
console.log('✅ Support Ticket System Loaded');

// ========== SYSTEM SETTINGS ==========

app.get('/api/settings/public', async (req, res) => {
  try {
    // Allow bypass: if ?bypass=TOKEN matches maintenanceBypassToken, skip maintenance
    const bypass = req.query.bypass || req.headers['x-bypass-token'];
 
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = await SystemSettings.create({ siteName: 'UYEH TECH' });
    }
 
    const bypassGranted = bypass && settings.maintenanceBypassToken &&
                          bypass === settings.maintenanceBypassToken;
 
    res.json({
      success: true,
      settings: {
        // Identity
        siteName:        settings.siteName        || 'UYEH TECH',
        siteDescription: settings.siteDescription || '',
        contactEmail:    settings.contactEmail    || '',
        phone:           settings.phone           || '',
        socialMedia:     settings.socialMedia     || {},
        seoTitle:        settings.seoTitle        || settings.siteName || 'UYEH TECH',
        seoDescription:  settings.seoDescription  || settings.siteDescription || '',
        seoKeywords:     settings.seoKeywords      || '',
 
        // Maintenance
        maintenanceMode:    bypassGranted ? false : (settings.maintenanceMode || false),
        maintenanceMessage: settings.maintenanceMessage || 'We\'ll be back shortly!',
        maintenanceTitle:   settings.maintenanceTitle   || 'Under Maintenance',
        maintenanceETA:     settings.maintenanceETA     || '',
        maintenancePages:   settings.maintenancePages   || 'all',
 
        // Registration
        allowRegistration:       settings.allowRegistration        !== false,
        requireEmailVerification: settings.requireEmailVerification !== false,
        allowGuestCheckout:       settings.allowGuestCheckout       !== false,
 
        // Feature switches
        storeEnabled:      settings.storeEnabled      !== false,
        blogEnabled:       settings.blogEnabled        !== false,
        chatEnabled:       settings.chatEnabled        !== false,
        creatorEnabled:    settings.creatorEnabled     !== false,
        affiliatesEnabled: settings.affiliatesEnabled  !== false,
 
        // Announcement banner
        banner: {
          enabled:     settings.bannerEnabled    || false,
          text:        settings.bannerText       || '',
          type:        settings.bannerType       || 'info',
          link:        settings.bannerLink       || '',
          linkText:    settings.bannerLinkText   || '',
          dismissible: settings.bannerDismissible !== false
        },
 
        // Custom code (CSS only — never serve raw JS publicly from here)
        customCSS:  settings.customCSS  || '',
 
        // Analytics IDs (only IDs, not full scripts)
        googleAnalyticsId: settings.googleAnalyticsId || '',
        facebookPixelId:   settings.facebookPixelId   || '',
 
        // Meta
        lastUpdated: settings.updatedAt
      }
    });
 
  } catch (error) {
    console.error('❌ Public settings error:', error);
    // Never fail — return safe defaults
    res.json({
      success: true,
      settings: {
        siteName: 'UYEH TECH',
        maintenanceMode: false,
        allowRegistration: true,
        storeEnabled: true,
        blogEnabled: true,
        chatEnabled: true,
        creatorEnabled: true,
        affiliatesEnabled: true,
        banner: { enabled: false }
      }
    });
  }
});
 


// GET creator public profile + follower count
app.get('/api/creators/:creatorId/profile', async (req, res) => {
  try {
    const creator = await Creator.findOne({
      _id:               req.params.creatorId,
      applicationStatus: 'approved',
      isSuspended:       false
    })
      .select('storeName storeSlug storeDescription storeLogo storeBanner isFeatured isVerified rating totalSales totalProducts approvedAt categories country socialLinks businessType')
      .populate('userId', 'fullName profileImage');

    if (!creator) {
      return res.status(404).json({ success: false, message: 'Creator not found' });
    }

    const [followerCount, products] = await Promise.all([
      Follow.countDocuments({ creatorId: creator._id }),
      CreatorProduct.find({ creatorId: creator._id, status: 'approved' })
        .sort({ totalSales: -1 })
        .limit(6)
    ]);

    res.json({
      success: true,
      creator: { ...creator.toObject(), followerCount },
      products
    });

  } catch (error) {
    console.error('❌ Get creator profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch creator' });
  }
});

// POST follow a creator
app.post('/api/creators/:creatorId/follow', authenticateToken, async (req, res) => {
  try {
    const { creatorId } = req.params;

    const creator = await Creator.findById(creatorId);
    if (!creator) return res.status(404).json({ success: false, message: 'Creator not found' });

    // Prevent self-follow
    if (creator.userId.toString() === req.user.userId) {
      return res.status(400).json({ success: false, message: "You can't follow yourself" });
    }

    const existing = await Follow.findOne({ followerId: req.user.userId, creatorId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already following' });
    }

    await Follow.create({ followerId: req.user.userId, creatorId });

    const followerCount = await Follow.countDocuments({ creatorId });

    console.log(`⛏️  User ${req.user.userId} followed creator ${creator.storeName}`);
    res.json({ success: true, message: `Now following ${creator.storeName}!`, followerCount });

  } catch (error) {
    console.error('❌ Follow error:', error);
    res.status(500).json({ success: false, message: 'Follow failed' });
  }
});

// DELETE unfollow a creator
app.delete('/api/creators/:creatorId/follow', authenticateToken, async (req, res) => {
  try {
    const { creatorId } = req.params;
    await Follow.findOneAndDelete({ followerId: req.user.userId, creatorId });

    const followerCount = await Follow.countDocuments({ creatorId });
    const creator = await Creator.findById(creatorId).select('storeName');

    res.json({ success: true, message: `Unfollowed ${creator?.storeName}`, followerCount });
  } catch (error) {
    console.error('❌ Unfollow error:', error);
    res.status(500).json({ success: false, message: 'Unfollow failed' });
  }
});

// GET check if current user follows a creator
app.get('/api/creators/:creatorId/follow-status', authenticateToken, async (req, res) => {
  try {
    const follow = await Follow.findOne({
      followerId: req.user.userId,
      creatorId: req.params.creatorId
    });
    const followerCount = await Follow.countDocuments({ creatorId: req.params.creatorId });

    res.json({ success: true, isFollowing: !!follow, followerCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to check follow status' });
  }
});

// GET user's followed creators
app.get('/api/my/following', authenticateToken, async (req, res) => {
  try {
    const follows = await Follow.find({ followerId: req.user.userId })
      .populate({
        path: 'creatorId',
        select: 'storeName storeSlug storeLogo totalProducts totalSales isVerified'
      })
      .sort({ followedAt: -1 });

    res.json({
      success: true,
      following: follows.map(f => f.creatorId),
      count: follows.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch following' });
  }
});

console.log('✅ Creator Follow System Loaded');


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creator/upgrade  (logged-in users upgrading their existing account)
// Identical logic — kept as a separate route for clarity
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/creator/upgrade', authenticateToken, async (req, res) => {
  try {
    const {
      storeName,
      storeDescription,
      businessType,
      applicationMessage,
      country,
      phone,
      website,
      socialLinks,
      categories
    } = req.body;

    if (!storeName || storeName.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Store name is required and must be at least 3 characters.'
      });
    }
    if (!applicationMessage || applicationMessage.trim().length < 20) {
      return res.status(400).json({
        success: false,
        message: 'Please tell us about yourself (minimum 20 characters).'
      });
    }

    const cleanStoreName = storeName.trim();
    const userObjectId   = toObjectId(req.user.userId);

    if (!userObjectId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid session. Please log out and log back in.'
      });
    }

    // Already applied?
    const existing = await Creator.findOne({ userId: userObjectId });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `You already have a creator account (Status: "${existing.applicationStatus}").`,
        applicationStatus: existing.applicationStatus,
        storeName:         existing.storeName
      });
    }

    // ✅ FIX: escapeRegex is now defined — this was the crash point
    const safeStoreName = escapeRegex(cleanStoreName);
    const nameExists = await Creator.findOne({
      storeName: { $regex: new RegExp(`^${safeStoreName}$`, 'i') }
    });
    if (nameExists) {
      return res.status(400).json({
        success: false,
        message: 'That store name is already taken. Please choose a different name.'
      });
    }

    const allowedTypes    = ['individual', 'company', 'freelancer'];
    const cleanType       = allowedTypes.includes(businessType) ? businessType : 'individual';
    const cleanCategories = Array.isArray(categories)
      ? categories.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim()).slice(0, 10)
      : [];

    const user = await User.findById(userObjectId).select('fullName email country phone');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    const creator = new Creator({
      userId:             userObjectId,
      storeName:          cleanStoreName,
      storeDescription:   storeDescription   ? String(storeDescription).trim()   : '',
      businessType:       cleanType,
      applicationMessage: applicationMessage.trim(),
      country:            country || user.country || '',
      phone:              phone   || user.phone   || '',
      website:            website ? String(website).trim() : '',
      socialLinks:        socialLinks && typeof socialLinks === 'object' ? socialLinks : {},
      categories:         cleanCategories,
      applicationStatus:  'pending'
    });

    await creator.save();

    await User.findByIdAndUpdate(userObjectId, {
      $set: {
        'creatorInfo.creatorId': creator._id,
        'creatorInfo.storeName': cleanStoreName,
        'creatorInfo.joinedAt':  new Date()
      }
    });

    console.log(`🔄 Account upgrade to creator: ${user.email} → "${cleanStoreName}"`);

    return res.status(201).json({
      success: true,
      message: 'Creator application submitted! We will review within 24–48 hours.',
      creator: {
        id:                creator._id,
        storeName:         creator.storeName,
        applicationStatus: creator.applicationStatus
      }
    });

  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(400).json({
        success: false,
        message: field === 'storeName'
          ? 'That store name is already taken.'
          : 'An account with that information already exists.'
      });
    }
    if (error.name === 'ValidationError') {
      const firstMsg = Object.values(error.errors)[0]?.message || 'Validation failed.';
      return res.status(400).json({ success: false, message: firstMsg });
    }
    console.error('❌ /api/creator/upgrade error:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again.'
    });
  }
});





// ══════════════════════════════════════════════════════════════════════════════
// GET /api/creator/upgrade/status  — check if current user has an application
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/creator/upgrade/status', authenticateToken, async (req, res) => {
  try {
    const userObjectId = toObjectId(req.user.userId);
    if (!userObjectId) {
      return res.status(401).json({ success: false, message: 'Invalid session.' });
    }

    const creator = await Creator.findOne({ userId: userObjectId });

    if (!creator) {
      return res.json({
        success:        true,
        hasApplication: false,
        message:        'No creator application found.'
      });
    }

    return res.json({
      success:           true,
      hasApplication:    true,
      applicationStatus: creator.applicationStatus,
      storeName:         creator.storeName,
      storeSlug:         creator.storeSlug,
      submittedAt:       creator.createdAt,
      rejectionReason:   creator.rejectionReason || null
    });

  } catch (error) {
    console.error('❌ /api/creator/upgrade/status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to check status.' });
  }
});

app.post('/api/creator/upload-logo', authenticateToken, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const url = await uploadToCloudinary(req.file.buffer, req.file.mimetype, 'uyehtech/logos');
    res.json({ success: true, url });
  } catch (error) {
    console.error('❌ Logo upload error:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// 🔐 SECURE ACCESS CODE API ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

// Verify Access Code
app.post('/api/access/verify', async (req, res) => {
  try {
    const { accessCode, portal } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    console.log(`\n🔐 Access Verification Attempt:`);
    console.log(`   IP: ${clientIP}`);
    console.log(`   Portal: ${portal}`);
    console.log(`   Time: ${new Date().toISOString()}`);

    // Input validation
    if (!accessCode || !portal) {
      return res.status(400).json({
        success: false,
        message: 'Access code and portal type are required'
      });
    }

    // Check if portal exists
    if (!SECURE_ACCESS_CODES[portal]) {
      console.log(`   ❌ Invalid portal type: ${portal}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid portal type'
      });
    }

    // Rate limiting - prevent brute force
    const attemptData = accessAttempts.get(clientIP) || { count: 0, lastAttempt: 0 };
    const now = Date.now();

    // Check if IP is locked out
    if (attemptData.count >= 5 && now - attemptData.lastAttempt < 15 * 60 * 1000) {
      console.log(`   🚫 IP locked out: ${clientIP}`);
      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts. Please try again in 15 minutes.',
        lockoutTime: 15 * 60 * 1000 - (now - attemptData.lastAttempt)
      });
    }

    // Reset counter if cooldown period passed
    if (now - attemptData.lastAttempt > 15 * 60 * 1000) {
      attemptData.count = 0;
    }

    // Verify access code using bcrypt (secure comparison)
    const isValid = await bcrypt.compare(accessCode, SECURE_ACCESS_CODES[portal]);

    if (isValid) {
      // SUCCESS - Generate secure session
      const sessionId = `session_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
      const token = jwt.sign(
        {
          sessionId,
          portal,
          ip: clientIP,
          timestamp: Date.now()
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '30m' }
      );

      // Store session
      accessSessions.set(sessionId, {
        token,
        portal,
        ip: clientIP,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000
      });

      // Clear failed attempts
      accessAttempts.delete(clientIP);

      console.log(`   ✅ Access GRANTED`);
      console.log(`   Session ID: ${sessionId}`);

      return res.json({
        success: true,
        message: 'Access granted',
        token,
        sessionId,
        portal,
        expiresIn: 1800 // 30 minutes
      });

    } else {
      // FAILED - Record attempt
      attemptData.count++;
      attemptData.lastAttempt = now;
      accessAttempts.set(clientIP, attemptData);

      console.log(`   ❌ Access DENIED`);
      console.log(`   Failed attempts: ${attemptData.count}/5`);

      return res.status(401).json({
        success: false,
        message: 'Invalid access code',
        attemptsRemaining: 5 - attemptData.count
      });
    }

  } catch (error) {
    console.error('❌ Access verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Verify Session Token
app.post('/api/access/verify-session', (req, res) => {
  try {
    const { token, sessionId } = req.body;

    if (!token || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Token and session ID required'
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Check session exists
    const session = accessSessions.get(sessionId);
    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Session not found or expired'
      });
    }

    // Verify session hasn't expired
    if (Date.now() > session.expiresAt) {
      accessSessions.delete(sessionId);
      return res.status(401).json({
        success: false,
        message: 'Session expired'
      });
    }

    return res.json({
      success: true,
      message: 'Session valid',
      portal: decoded.portal,
      expiresAt: session.expiresAt
    });

  } catch (error) {
    console.error('❌ Session verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Logout / Invalidate Session
app.post('/api/access/logout', (req, res) => {
  try {
    const { sessionId } = req.body;

    if (sessionId && accessSessions.has(sessionId)) {
      accessSessions.delete(sessionId);
      console.log(`🔓 Session invalidated: ${sessionId}`);
    }

    return res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('❌ Logout error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get Access Stats (Admin only)
app.get('/api/access/stats',authenticateAdmin, (req, res) => {
  try {
    // Only allow admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    return res.json({
      success: true,
      stats: {
        activeSessions: accessSessions.size,
        blockedIPs: accessAttempts.size,
        sessions: Array.from(accessSessions.values()).map(s => ({
          portal: s.portal,
          timestamp: s.timestamp,
          expiresAt: s.expiresAt
        }))
      }
    });

  } catch (error) {
    console.error('❌ Stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

console.log('✅ Secure Access Code Endpoints Added');

// ═════════════════════════════════════════════════════════════════════════════
// 🔄 KEEP-ALIVE SYSTEM (Prevents Free Tier Shutdown)
// ═════════════════════════════════════════════════════════════════════════════

const SELF_PING_INTERVAL = 14 * 60 * 1000; // 14 minutes
const SELF_PING_URL = BASE_URL + '/api/health';

function keepServerAlive() {
  setInterval(async () => {
    try {
      const response = await axios.get(SELF_PING_URL);
      console.log(`💓 Keep-alive ping: ${response.data.status} at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('❌ Keep-alive ping failed:', error.message);
    }
  }, SELF_PING_INTERVAL);
}

// Start keep-alive after server starts process.on('uncaughtException
setTimeout(() => {
  console.log('🔄 Keep-alive system started');
  keepServerAlive();
}, 5000); // Wait 5 seconds after startup

console.log('✅ Keep-Alive System Configured');

// ═════════════════════════════════════════════════════════════════════════════
// 🛡️ PRODUCTION-GRADE ERROR HANDLING & RECOVERY SYSTEM
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const ERROR_HANDLING_CONFIG = {
  // Exception handling
  maxUncaughtExceptions: parseInt(process.env.MAX_EXCEPTIONS) || 5,
  exceptionResetInterval: 60000, // Reset counter every minute
  
  // Monitoring recovery
  enableMonitoringRecovery: process.env.AUTO_RESTART_MONITORING !== 'false',
  monitoringCheckInterval: 5 * 60 * 1000, // 5 minutes
  maxMonitoringRestarts: 3,
  
  // Database recovery
  enableDbReconnect: process.env.AUTO_RECONNECT_DB !== 'false',
  dbReconnectDelay: 5000,
  maxDbReconnectAttempts: 5,
  
  // Graceful shutdown
  shutdownTimeout: 30000, // 30 seconds to cleanup
  forceShutdown: process.env.FORCE_SHUTDOWN_ON_ERROR === 'true'
};

console.log('\n🛡️ Error Handling Configuration:');
console.log(`   Max Uncaught Exceptions: ${ERROR_HANDLING_CONFIG.maxUncaughtExceptions}`);
console.log(`   Monitoring Recovery: ${ERROR_HANDLING_CONFIG.enableMonitoringRecovery ? 'Enabled' : 'Disabled'}`);
console.log(`   Database Auto-Reconnect: ${ERROR_HANDLING_CONFIG.enableDbReconnect ? 'Enabled' : 'Disabled'}`);
console.log(`   Force Shutdown on Error: ${ERROR_HANDLING_CONFIG.forceShutdown ? 'Yes' : 'No'}\n`);

// ─────────────────────────────────────────────────────────────────────────────
// Error Tracking
// ─────────────────────────────────────────────────────────────────────────────

let uncaughtExceptionCount = 0;
let unhandledRejectionCount = 0;
let monitoringRestartCount = 0;
let dbReconnectAttempts = 0;
let isShuttingDown = false;

// Reset exception counters periodically
setInterval(() => {
  if (uncaughtExceptionCount > 0) {
    console.log(`🔄 Resetting exception counter (was ${uncaughtExceptionCount})`);
    uncaughtExceptionCount = 0;
  }
  if (unhandledRejectionCount > 0) {
    console.log(`🔄 Resetting rejection counter (was ${unhandledRejectionCount})`);
    unhandledRejectionCount = 0;
  }
}, ERROR_HANDLING_CONFIG.exceptionResetInterval);

// ─────────────────────────────────────────────────────────────────────────────
// Monitoring Recovery System
// ─────────────────────────────────────────────────────────────────────────────

function startMonitoringWithRecovery() {
  if (!ERROR_HANDLING_CONFIG.enableMonitoringRecovery) {
    console.log('⏸️  Monitoring recovery disabled - starting once');
    try {
      if (typeof initializeMonitoring === 'function') {
        initializeMonitoring();
      }
    } catch (error) {
      console.error('❌ Monitoring failed to start:', error.message);
    }
    return;
  }

  try {
    if (typeof initializeMonitoring === 'function') {
      initializeMonitoring();
      monitoringRestartCount = 0;
      console.log('✅ Monitoring system started successfully');
    }
  } catch (error) {
    monitoringRestartCount++;
    console.error(`❌ Monitoring system failed to start (attempt ${monitoringRestartCount}/${ERROR_HANDLING_CONFIG.maxMonitoringRestarts}):`, error.message);
    
    if (monitoringRestartCount < ERROR_HANDLING_CONFIG.maxMonitoringRestarts) {
      console.log(`🔄 Retrying monitoring system in 30 seconds...`);
      setTimeout(startMonitoringWithRecovery, 30000);
    } else {
      console.error('🚨 Monitoring system permanently disabled after repeated failures');
      console.log('✅ Server will continue WITHOUT monitoring (degraded mode)');
    }
  }
}

// Monitor health check interval and restart if needed
if (ERROR_HANDLING_CONFIG.enableMonitoringRecovery) {
  setInterval(() => {
    // Check if monitoring is running (you may need to adjust this check)
    if (typeof healthCheckInterval !== 'undefined' && !healthCheckInterval) {
      console.log('⚠️  Health check interval stopped unexpectedly - restarting...');
      startMonitoringWithRecovery();
    }
  }, ERROR_HANDLING_CONFIG.monitoringCheckInterval);
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Reconnection System
// ─────────────────────────────────────────────────────────────────────────────

async function attemptDatabaseReconnect() {
  if (!ERROR_HANDLING_CONFIG.enableDbReconnect) {
    console.log('⏸️  Database auto-reconnect disabled');
    return false;
  }

  if (dbReconnectAttempts >= ERROR_HANDLING_CONFIG.maxDbReconnectAttempts) {
    console.error('🚨 Max database reconnect attempts reached');
    return false;
  }

  dbReconnectAttempts++;
  console.log(`🔄 Attempting database reconnection (${dbReconnectAttempts}/${ERROR_HANDLING_CONFIG.maxDbReconnectAttempts})...`);

  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Database reconnected successfully');
    dbReconnectAttempts = 0;
    return true;
  } catch (error) {
    console.error('❌ Database reconnection failed:', error.message);
    
    if (dbReconnectAttempts < ERROR_HANDLING_CONFIG.maxDbReconnectAttempts) {
      console.log(`⏳ Waiting ${ERROR_HANDLING_CONFIG.dbReconnectDelay / 1000}s before retry...`);
      setTimeout(attemptDatabaseReconnect, ERROR_HANDLING_CONFIG.dbReconnectDelay);
    }
    
    return false;
  }
}

// MongoDB event handlers
let _reconnectTimer = null;
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB Disconnected');
  if (!isShuttingDown) {
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      attemptDatabaseReconnect();
    }, 3000); // wait 3s before reconnecting — lets in-flight saves finish
  }
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB Error:', err.message);
  if (!isShuttingDown) {
    setTimeout(attemptDatabaseReconnect, ERROR_HANDLING_CONFIG.dbReconnectDelay);
  }
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB Reconnected');
  dbReconnectAttempts = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
// Uncaught Exception Handler
// ─────────────────────────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  uncaughtExceptionCount++;
  
  console.error('\n╔═══════════════════════════════════════════════════════════════╗');
  console.error('║              ❌ UNCAUGHT EXCEPTION DETECTED                   ║');
  console.error('╚═══════════════════════════════════════════════════════════════╝');
  console.error(`📊 Exception #${uncaughtExceptionCount} of ${ERROR_HANDLING_CONFIG.maxUncaughtExceptions}`);
  console.error(`⏰ Time: ${new Date().toISOString()}`);
  console.error(`🔍 Error: ${err.message}`);
  console.error(`📍 Stack Trace:\n${err.stack}\n`);
  
  // Send alert (implement your notification system here)
  // sendAlertEmail(err);
  
  if (ERROR_HANDLING_CONFIG.forceShutdown || 
      uncaughtExceptionCount >= ERROR_HANDLING_CONFIG.maxUncaughtExceptions) {
    
    console.error('🚨 CRITICAL: Maximum exceptions reached or force shutdown enabled');
    console.error('⚠️  Initiating graceful shutdown...\n');
    
    initiateGracefulShutdown(1, 'Too many uncaught exceptions');
  } else {
    const remaining = ERROR_HANDLING_CONFIG.maxUncaughtExceptions - uncaughtExceptionCount;
    console.log(`⚠️  Exception logged - server continuing`);
    console.log(`   ${remaining} exception(s) remaining before shutdown\n`);
    console.log('═══════════════════════════════════════════════════════════════\n');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Unhandled Promise Rejection Handler
// ─────────────────────────────────────────────────────────────────────────────

process.on('unhandledRejection', (reason, promise) => {
  unhandledRejectionCount++;
  
  console.error('\n╔═══════════════════════════════════════════════════════════════╗');
  console.error('║           ⚠️  UNHANDLED PROMISE REJECTION                     ║');
  console.error('╚═══════════════════════════════════════════════════════════════╝');
  console.error(`📊 Rejection #${unhandledRejectionCount}`);
  console.error(`⏰ Time: ${new Date().toISOString()}`);
  console.error(`🔍 Reason:`, reason);
  console.error(`📍 Promise:`, promise);
  
  if (reason && reason.stack) {
    console.error(`📍 Stack Trace:\n${reason.stack}`);
  }
  
  console.log('\n⚠️  Promise rejection logged - server continuing');
  console.log('💡 Tip: Add .catch() handlers to promises to prevent this\n');
  console.log('═══════════════════════════════════════════════════════════════\n');
});


// ─────────────────────────────────────────────────────────────────────────────
// Warning Handler
// ─────────────────────────────────────────────────────────────────────────────

process.on('warning', (warning) => {
  console.warn('\n⚠️  Node.js Warning:');
  console.warn(`   Name: ${warning.name}`);
  console.warn(`   Message: ${warning.message}`);
  if (warning.stack) {
    console.warn(`   Stack: ${warning.stack}`);
  }
  console.warn('');
});

// ─────────────────────────────────────────────────────────────────────────────
// Graceful Shutdown System
// ─────────────────────────────────────────────────────────────────────────────

async function initiateGracefulShutdown(exitCode = 0, reason = 'Unknown') {
  if (isShuttingDown) {
    console.log('⏳ Shutdown already in progress...');
    return;
  }
  
  isShuttingDown = true;
  
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              🛑 INITIATING GRACEFUL SHUTDOWN                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`📋 Reason: ${reason}`);
  console.log(`⏰ Time: ${new Date().toISOString()}\n`);
  
  // Force shutdown after timeout
  const forceShutdownTimer = setTimeout(() => {
    console.error('⚠️  Graceful shutdown timeout - forcing exit');
    process.exit(exitCode);
  }, ERROR_HANDLING_CONFIG.shutdownTimeout);
  
  try {
    // 1. Stop accepting new connections
    console.log('1️⃣  Stopping HTTP server...');
    await new Promise((resolve) => {
      server.close((err) => {
        if (err) {
          console.error('   ❌ Error closing HTTP server:', err.message);
        } else {
          console.log('   ✅ HTTP server closed');
        }
        resolve();
      });
    });
    
    // 2. Stop monitoring system
    console.log('2️⃣  Stopping monitoring system...');
    if (typeof stopMonitoring === 'function') {
      stopMonitoring();
      console.log('   ✅ Monitoring stopped');
    }
    
    // 3. Close WebSocket connections
    console.log('3️⃣  Closing WebSocket connections...');
    let wsCount = 0;
    if (wss && wss.clients) {
      wss.clients.forEach((client) => {
        try {
          client.send(JSON.stringify({
            type: 'server_shutdown',
            message: 'Server is shutting down. Please reconnect in a moment.'
          }));
          client.close();
          wsCount++;
        } catch (err) {
          // Ignore errors during shutdown
        }
      });
    }
    console.log(`   ✅ Closed ${wsCount} WebSocket connections`);
    
    // 4. Close database connection
    console.log('4️⃣  Closing MongoDB connection...');
    try {
      await mongoose.connection.close(false);
      console.log('   ✅ MongoDB connection closed');
    } catch (error) {
      console.error('   ❌ Error closing MongoDB:', error.message);
    }
    
    // 5. Clear all intervals/timeouts
    console.log('5️⃣  Clearing all timers...');
    // Node.js will handle this automatically
    console.log('   ✅ Timers cleared');
    
    console.log('\n✅ Graceful shutdown complete');
    console.log('👋 UYEH TECH Server - Goodbye\n');
    
    clearTimeout(forceShutdownTimer);
    process.exit(exitCode);
    
  } catch (error) {
    console.error('\n❌ Error during graceful shutdown:', error);
    clearTimeout(forceShutdownTimer);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// System Signal Handlers
// ─────────────────────────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('\n📡 SIGTERM signal received');
  initiateGracefulShutdown(0, 'SIGTERM signal (deployment/restart)');
});

process.on('SIGINT', () => {
  console.log('\n📡 SIGINT signal received (Ctrl+C)');
  initiateGracefulShutdown(0, 'SIGINT signal (manual stop)');
});

process.on('SIGHUP', () => {
  console.log('\n📡 SIGHUP signal received');
  initiateGracefulShutdown(0, 'SIGHUP signal (terminal closed)');
});

// ─────────────────────────────────────────────────────────────────────────────
// Memory & Performance Monitoring
// ─────────────────────────────────────────────────────────────────────────────

const MEMORY_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MEMORY_WARNING_THRESHOLD = 0.9; // 90% of heap size

setInterval(() => {
  const memUsage = process.memoryUsage();
  const heapUsedPercent = memUsage.heapUsed / memUsage.heapTotal;
  
  if (heapUsedPercent > MEMORY_WARNING_THRESHOLD) {
    console.warn('\n⚠️  HIGH MEMORY USAGE WARNING');
    console.warn(`   Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    console.warn(`   Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
    console.warn(`   Usage: ${Math.round(heapUsedPercent * 100)}%`);
    console.warn('   Consider investigating memory leaks\n');
  }
}, MEMORY_CHECK_INTERVAL);

// ─────────────────────────────────────────────────────────────────────────────
// Health Check Endpoint Enhancement
// ─────────────────────────────────────────────────────────────────────────────

// Add detailed error stats to health check
app.get('/api/health/detailed', (req, res) => {
  const memUsage = process.memoryUsage();
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      cpuUsage: process.cpuUsage(),
      memoryUsage: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
        external: Math.round(memUsage.external / 1024 / 1024) + 'MB'
      }
    },
    database: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      readyState: mongoose.connection.readyState,
      reconnectAttempts: dbReconnectAttempts
    },
    websocket: {
      activeConnections: wss.clients ? wss.clients.size : 0,
      activeChats: activeConnections ? activeConnections.size : 0,
      connectedAgents: agentConnections ? agentConnections.size : 0,
      connectedCustomers: customerConnections ? customerConnections.size : 0
    },
    errors: {
      uncaughtExceptions: uncaughtExceptionCount,
      unhandledRejections: unhandledRejectionCount,
      maxExceptions: ERROR_HANDLING_CONFIG.maxUncaughtExceptions,
      monitoringRestarts: monitoringRestartCount
    },
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      monitoringRecovery: ERROR_HANDLING_CONFIG.enableMonitoringRecovery,
      dbAutoReconnect: ERROR_HANDLING_CONFIG.enableDbReconnect
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Start Monitoring (with recovery)
// ─────────────────────────────────────────────────────────────────────────────

// Wait for server to be ready before starting monitoring
setTimeout(() => {
  console.log('🔄 Initializing monitoring system...\n');
  startMonitoringWithRecovery();
}, 10000); // Wait 10 seconds after server starts

// ═════════════════════════════════════════════════════════════════════════════


// ═════════════════════════════════════════════════════════════════════════════
// END OF ERROR HANDLING SYSTEM
// ═════════════════════════════════════════════════════════════════════════════

server.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║         🚀 UYEH TECH SERVER - FULLY OPERATIONAL                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`📡 Server Information:`);
  console.log(`   └─ HTTP Server: http://localhost:${PORT}`);
  console.log(`   └─ WebSocket Server: ws://localhost:${PORT}/ws`);
  console.log(`   └─ Environment: ${process.env.NODE_ENV }`);
  console.log(`   └─ Base URL: ${BASE_URL}\n`);
  
});


// ════════════════════════════════════════════════════════════════════════════
// 🛡️ IMPROVED ERROR HANDLING - PREVENT SHUTDOWN
// ════════════════════════════════════════════════════════════════════════════

process.on('unhandledRejection', (err) => {
  console.error('\n❌ Unhandled Promise Rejection:');
  console.error(err);
  console.error('Stack:', err.stack);
  
  // Don't shutdown for promise rejections - just log them
  console.log('⚠️  Promise rejection logged - server continuing');
});

console.log('✅ Resilient Error Handling Enabled');


// ════════════════════════════════════════════════════════════════════════════
// END OF UYEH TECH SERVER
// ════════════════════════════════════════════════════════════════════════════

/* 
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         🎉 CONGRATULATIONS! 🎉                               ║
║                                                                               ║
║                         UYEH TECH Backend Server                              ║
║                            happy coding                                       ║
╚═══════════════════════════════════════════════════════════════════════════════╝
*/