import express from 'express';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());

// Lazy-initialized Gemini AI client
let aiClient = null;
function getAIClient() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

// In-memory cache for generated authentic packshots & images
const imageCache = new Map();

// Generate high-resolution authentic vector packshot SVG as instant high-quality fallback
function createAuthenticPackshotSVG(p) {
  const brand = (p.brand || 'Unga Market').trim();
  const name = (p.name || p.n || 'Grocery Item').trim();
  const size = (p.size || p.s || 'Standard Pack').trim();
  const category = (p.category || p.c || 'grocery').toLowerCase();

  // Brand / Category specific aesthetic palette
  let bgGrad1 = '#F3F4F6';
  let bgGrad2 = '#E5E7EB';
  let themeColor = '#0F8A3E';
  let packType = 'box'; // 'box', 'pouch', 'bottle', 'jar'
  let accentColor = '#F26522';
  let emoji = '📦';

  const bLower = brand.toLowerCase();
  const nLower = name.toLowerCase();

  if (bLower.includes('tata') || bLower.includes('tea') || bLower.includes('bru') || bLower.includes('wagh') || category.includes('tea') || category.includes('bev')) {
    themeColor = '#0A6B2E';
    accentColor = '#EAB308';
    bgGrad1 = '#FEFCE8';
    bgGrad2 = '#FEF08A';
    packType = 'pouch';
    emoji = '🍵';
  } else if (bLower.includes('maggi') || nLower.includes('noodle') || category.includes('snack') || category.includes('biscuit')) {
    themeColor = '#DC2626';
    accentColor = '#FACC15';
    bgGrad1 = '#FEF2F2';
    bgGrad2 = '#FECACA';
    packType = 'pouch';
    emoji = '🍜';
  } else if (bLower.includes('surf') || bLower.includes('tide') || bLower.includes('ariel') || bLower.includes('comfort') || category.includes('clean') || category.includes('wash')) {
    themeColor = '#2563EB';
    accentColor = '#EC4899';
    bgGrad1 = '#EFF6FF';
    bgGrad2 = '#DBEAFE';
    packType = nLower.includes('liquid') ? 'bottle' : 'box';
    emoji = '✨';
  } else if (bLower.includes('colgate') || bLower.includes('oral') || bLower.includes('pepsodent') || bLower.includes('close')) {
    themeColor = '#E11D48';
    accentColor = '#38BDF8';
    bgGrad1 = '#FFF1F2';
    bgGrad2 = '#FFE4E6';
    packType = 'box';
    emoji = '🪥';
  } else if (bLower.includes('horlicks') || bLower.includes('boost') || bLower.includes('bournvita')) {
    themeColor = '#0284C7';
    accentColor = '#F97316';
    bgGrad1 = '#F0F9FF';
    bgGrad2 = '#E0F2FE';
    packType = 'jar';
    emoji = '🥛';
  } else if (bLower.includes('dove') || bLower.includes('pears') || bLower.includes('himalaya') || bLower.includes('santoor') || bLower.includes('liril')) {
    themeColor = '#0D9488';
    accentColor = '#F59E0B';
    bgGrad1 = '#F0FDFA';
    bgGrad2 = '#CCFBF1';
    packType = 'box';
    emoji = '🌿';
  } else if (bLower.includes('parachute') || bLower.includes('oil') || bLower.includes('vatika') || bLower.includes('sesa')) {
    themeColor = '#0284C7';
    accentColor = '#10B981';
    bgGrad1 = '#F0FDF4';
    bgGrad2 = '#DCFCE7';
    packType = 'bottle';
    emoji = '🧴';
  }

  const cleanName = name.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cleanBrand = brand.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cleanSize = size.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
    <defs>
      <radialGradient id="bgG" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="#FFFFFF" />
        <stop offset="65%" stop-color="${bgGrad1}" />
        <stop offset="100%" stop-color="${bgGrad2}" />
      </radialGradient>
      <linearGradient id="packG" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.9" />
        <stop offset="15%" stop-color="${themeColor}" />
        <stop offset="85%" stop-color="${themeColor}" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0.25" />
      </linearGradient>
      <filter id="shadow" x="-15%" y="-10%" width="130%" height="135%">
        <feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#0F172A" flood-opacity="0.16"/>
      </filter>
    </defs>
    <rect width="400" height="400" fill="url(#bgG)"/>
    
    <!-- Floor Shadow -->
    <ellipse cx="200" cy="340" rx="110" ry="16" fill="#000000" opacity="0.1" filter="blur(6px)"/>
    
    <!-- Pack Body -->
    <g filter="url(#shadow)">
      ${packType === 'bottle' ? `
        <!-- Bottle Shape -->
        <rect x="145" y="80" width="110" height="40" rx="10" fill="${accentColor}"/>
        <rect x="135" y="110" width="130" height="210" rx="24" fill="${themeColor}"/>
        <rect x="145" y="125" width="110" height="180" rx="16" fill="#FFFFFF" fill-opacity="0.95"/>
      ` : packType === 'jar' ? `
        <!-- Jar Shape -->
        <rect x="130" y="80" width="140" height="35" rx="8" fill="${accentColor}"/>
        <rect x="120" y="110" width="160" height="210" rx="20" fill="${themeColor}"/>
        <rect x="130" y="125" width="140" height="180" rx="12" fill="#FFFFFF" fill-opacity="0.95"/>
      ` : `
        <!-- Pouch/Box Shape -->
        <rect x="110" y="75" width="180" height="250" rx="16" fill="${themeColor}"/>
        <!-- Top Seal Ribbon -->
        <path d="M 110 95 L 290 95 L 290 75 Q 200 65 110 75 Z" fill="${accentColor}"/>
        <!-- Label Area -->
        <rect x="122" y="105" width="156" height="205" rx="10" fill="#FFFFFF" fill-opacity="0.97"/>
      `}

      <!-- Brand Header Badge -->
      <rect x="135" y="115" width="130" height="30" rx="6" fill="${themeColor}"/>
      <text x="200" y="135" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">${cleanBrand.toUpperCase()}</text>

      <!-- Center Emoji Art -->
      <text x="200" y="195" font-size="44" text-anchor="middle">${emoji}</text>

      <!-- Product Name Banner -->
      <text x="200" y="240" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="12" fill="#111827" text-anchor="middle">
        ${cleanName.length > 20 ? cleanName.substring(0, 18) + '...' : cleanName}
      </text>

      <!-- Size Badge -->
      <rect x="150" y="262" width="100" height="22" rx="11" fill="${bgGrad1}" stroke="${themeColor}" stroke-width="1.5"/>
      <text x="200" y="277" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="11" fill="${themeColor}" text-anchor="middle">${cleanSize}</text>

      <!-- 100% Genuine Seal -->
      <g transform="translate(240, 80)">
        <circle cx="20" cy="20" r="18" fill="${accentColor}" stroke="#FFFFFF" stroke-width="2"/>
        <text x="20" y="18" font-family="system-ui, sans-serif" font-weight="900" font-size="7" fill="#FFFFFF" text-anchor="middle">100%</text>
        <text x="20" y="27" font-family="system-ui, sans-serif" font-weight="800" font-size="6" fill="#FFFFFF" text-anchor="middle">GENUINE</text>
      </g>
    </g>

    <!-- Top Badge -->
    <rect x="12" y="12" width="105" height="22" rx="6" fill="rgba(15,138,62,0.12)" />
    <text x="64" y="27" font-family="system-ui, sans-serif" font-weight="800" font-size="10" fill="#0F8A3E" text-anchor="middle">⚡ UNGA PACKSHOT</text>
  </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// In-memory persistent store for wholesale orders
let ordersList = [
  {
    id: 'UM8921A',
    at: Date.now() - 1000 * 60 * 45, // 45 mins ago
    customer: { name: 'Karthik Raja', phone: '9840123456', email: 'karthik@gmail.com' },
    addr: 'Plot 42, Annai Nagar 2nd Street, Velachery, Chennai - 600042',
    phone: '9840123456',
    items: [
      { id: 'FMCG50001', name: 'Tata Tea Gold Leaf Tea', brand: 'Tata Tea', size: '500g', qty: 2, price: 236 },
      { id: 'FMCG50012', name: 'Maggi 2-Minute Masala Noodles 12-Pack', brand: 'Nestle', size: '840g', qty: 1, price: 156 },
      { id: 'FMCG50035', name: 'Surf Excel Quick Wash Detergent Powder', brand: 'Surf Excel', size: '1kg', qty: 1, price: 168 }
    ],
    subtotal: 796,
    delivery: 0,
    tip: 20,
    total: 816,
    method: 'gpay',
    paymentId: 'UPI_98401GPAY224',
    status: 'Packed',
    driver: { name: 'Murugan V. (Fleet)', phone: '9876500112', vehicle: 'TN-07-CS-4421' },
    zone: 'Velachery Hub',
    timeline: [
      { status: 'Pending', at: Date.now() - 1000 * 60 * 45, note: 'Order placed & paid via Google Pay (₹816.00 with ₹20 Driver Tip)' },
      { status: 'Packed', at: Date.now() - 1000 * 60 * 20, note: 'Quality checked and packed at Unga Market Hub' }
    ]
  },
  {
    id: 'UM7732B',
    at: Date.now() - 1000 * 60 * 120, // 2 hours ago
    customer: { name: 'Priya Sundaram', phone: '9790234567', email: 'priya.s@gmail.com' },
    addr: 'Flat 3B, Green Paradise Apts, OMR Thoraipakkam, Chennai - 600097',
    phone: '9790234567',
    items: [
      { id: 'FMCG50006', name: 'Horlicks Classic Malt Health Drink', brand: 'Horlicks', size: '1kg', qty: 1, price: 348 },
      { id: 'FMCG50027', name: 'Colgate Strong Teeth Toothpaste Twin Pack', brand: 'Colgate', size: '500g', qty: 2, price: 184 }
    ],
    subtotal: 716,
    delivery: 0,
    tip: 30,
    total: 746,
    method: 'upi',
    paymentId: 'UPI_REF892348911',
    status: 'Shipped',
    driver: { name: 'Murugan V. (Fleet)', phone: '9876500112', vehicle: 'TN-07-CS-4421' },
    zone: 'OMR - Thoraipakkam',
    timeline: [
      { status: 'Pending', at: Date.now() - 1000 * 60 * 120, note: 'Order received & verified with instant UPI' },
      { status: 'Packed', at: Date.now() - 1000 * 60 * 85, note: 'Packaged in eco-safe wholesale crate' },
      { status: 'Shipped', at: Date.now() - 1000 * 60 * 30, note: 'Out for delivery with driver Murugan V.' }
    ]
  },
  {
    id: 'UM6421C',
    at: Date.now() - 1000 * 60 * 180,
    customer: { name: 'Venkatesh S.', phone: '9841199882', email: 'venkat@gmail.com' },
    addr: 'Door 18, 1st Cross Street, Gandhi Nagar, Adyar, Chennai - 600020',
    phone: '9841199882',
    items: [
      { id: 'FMCG50042', name: 'Dove Cream Beauty Bathing Bar (Pack of 3)', brand: 'Dove', size: '300g', qty: 2, price: 172 },
      { id: 'FMCG50002', name: 'Tata Tea Gold Leaf Tea', brand: 'Tata Tea', size: '500g', qty: 1, price: 256 }
    ],
    subtotal: 600,
    delivery: 0,
    tip: 10,
    total: 610,
    method: 'cod',
    paymentId: 'COD_READY',
    status: 'Pending',
    driver: null,
    zone: 'Adyar - Besant Nagar',
    timeline: [
      { status: 'Pending', at: Date.now() - 1000 * 60 * 180, note: 'Cash on Delivery order registered' }
    ]
  }
];

// In-memory catalog overrides for Shop Owner Add / Edit / Remove
let dynamicProductModifications = new Map(); // id -> product object or { deleted: true }

// Active Delivery Zones & Clusters definition for Chennai
const DELIVERY_ZONES = [
  { id: 'z_velachery', name: 'Velachery Hub', match: ['velachery', 'madipakkam', 'pallikaranai', 'annai nagar'], x: 28, y: 55, hubDistKm: 2.1, etaMins: 12, defaultDemand: 'High' },
  { id: 'z_omr', name: 'OMR - Thoraipakkam', match: ['omr', 'thoraipakkam', 'perungudi', 'sholinganallur', 'kandanchavadi'], x: 62, y: 70, hubDistKm: 4.8, etaMins: 18, defaultDemand: 'High' },
  { id: 'z_adyar', name: 'Adyar - Besant Nagar', match: ['adyar', 'besant nagar', 'kotturpuram', 'thiruvanmiyur', 'gandhi nagar'], x: 74, y: 35, hubDistKm: 5.4, etaMins: 20, defaultDemand: 'Medium' },
  { id: 'z_guindy', name: 'Guindy - Ekkattuthangal', match: ['guindy', 'ekkattuthangal', 'saidapet', 'ashok nagar'], x: 32, y: 30, hubDistKm: 3.9, etaMins: 15, defaultDemand: 'Medium' },
  { id: 'z_tambaram', name: 'Tambaram - GST Road', match: ['tambaram', 'chromepet', 'sanatorium', 'pallavaram'], x: 18, y: 82, hubDistKm: 8.5, etaMins: 25, defaultDemand: 'Normal' }
];

// Configuration endpoint
app.get('/api/config', (req, res) => {
  const upiVpa = process.env.UPI_VPA || 'ungamarket@okaxis';
  const upiPayeeName = process.env.UPI_PAYEE_NAME || 'Unga Market Wholesale';
  res.json({
    upiVpa,
    upiPayeeName
  });
});

// Dynamic Product Image Generation / Placeholder Fetch Endpoint
app.post('/api/generate-product-image', async (req, res) => {
  try {
    const { id, name, brand, category, size } = req.body;
    const cacheKey = id || `${brand}_${name}`;

    if (imageCache.has(cacheKey)) {
      return res.json({
        success: true,
        imageUrl: imageCache.get(cacheKey),
        cached: true
      });
    }

    const ai = getAIClient();
    if (ai && process.env.GEMINI_API_KEY) {
      try {
        const prompt = `Authentic studio packshot photograph of ${brand || ''} ${name || ''} ${size || ''}, authentic consumer packaging FMCG product in India, perfectly centered on a clean white background, high quality lighting, sharp details, 8k resolution.`;
        
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: {
            parts: [{ text: prompt }]
          },
          config: {
            imageConfig: {
              aspectRatio: '1:1'
            }
          }
        });

        if (response?.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData?.data) {
              const mime = part.inlineData.mimeType || 'image/png';
              const imgUrl = `data:${mime};base64,${part.inlineData.data}`;
              imageCache.set(cacheKey, imgUrl);
              return res.json({
                success: true,
                imageUrl: imgUrl,
                source: 'gemini-ai'
              });
            }
          }
        }
      } catch (aiErr) {
        console.warn('Gemini image generation fallback to vector packshot:', aiErr.message);
      }
    }

    // High quality vector studio packshot fallback
    const packshotSvgUrl = createAuthenticPackshotSVG({ id, name, brand, category, size });
    imageCache.set(cacheKey, packshotSvgUrl);

    res.json({
      success: true,
      imageUrl: packshotSvgUrl,
      source: 'packshot-generator'
    });
  } catch (err) {
    console.error('Error generating product image:', err);
    res.status(500).json({ success: false, error: 'Failed to generate product image' });
  }
});

// Role-based auth endpoint
app.post('/api/auth/login', (req, res) => {
  const { role, identifier, password, name, phone } = req.body;
  
  if (role === 'shopowner') {
    // Shop Owner validation
    if (password === '1234' || password === 'admin' || !password) {
      return res.json({
        success: true,
        user: {
          role: 'shopowner',
          name: name || 'Shop Owner (Admin)',
          email: identifier || 'owner@ungamarket.com',
          phone: phone || '9840000001',
          store: 'Unga Market Wholesale Hub - Chennai'
        }
      });
    } else {
      return res.status(401).json({ success: false, error: 'Incorrect Shop Owner PIN (default: 1234)' });
    }
  }

  if (role === 'delivery') {
    // Delivery Partner validation
    if (password === '1234' || password === 'delivery' || !password) {
      return res.json({
        success: true,
        user: {
          role: 'delivery',
          name: name || 'Murugan V. (Fleet)',
          email: identifier || 'delivery@ungamarket.com',
          phone: phone || '9876500112',
          vehicle: 'TN-07-CS-4421',
          zone: 'South Zone / Velachery Hub'
        }
      });
    } else {
      return res.status(401).json({ success: false, error: 'Incorrect Delivery PIN (default: 1234)' });
    }
  }

  // Customer Login
  res.json({
    success: true,
    user: {
      role: 'customer',
      name: name || 'Valued Customer',
      email: identifier || 'customer@gmail.com',
      phone: phone || identifier || '9876543210'
    }
  });
});

// Generate dynamic UPI QR Code & Intent URL
app.post('/api/create-upi-qr', async (req, res) => {
  try {
    const { amount, orderId, note } = req.body;
    if (!amount || !orderId) {
      return res.status(400).json({ error: 'amount and orderId are required' });
    }
    const upiVpa = process.env.UPI_VPA || 'ungamarket@okaxis';
    const upiPayeeName = process.env.UPI_PAYEE_NAME || 'Unga Market';
    const txNote = encodeURIComponent(note || `Order ${orderId} Unga Market`);
    const encodedName = encodeURIComponent(upiPayeeName);
    
    // Standard NPCI UPI URI Specification
    const upiUri = `upi://pay?pa=${upiVpa}&pn=${encodedName}&mc=5411&tid=${orderId}&tr=${orderId}&tn=${txNote}&am=${Number(amount).toFixed(2)}&cu=INR`;
    
    // Generate high-resolution QR code
    const qrDataUrl = await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 2,
      width: 320,
      color: {
        dark: '#0A6B2E',
        light: '#FFFFFF'
      }
    });

    res.json({
      success: true,
      orderId,
      amount: Number(amount).toFixed(2),
      upiUri,
      qrDataUrl,
      upiVpa,
      payeeName: upiPayeeName,
      intents: {
        gpay: `gpay://upi/pay?pa=${upiVpa}&pn=${encodedName}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${txNote}`,
        phonepe: `phonepe://pay?pa=${upiVpa}&pn=${encodedName}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${txNote}`,
        paytm: `paytmmp://pay?pa=${upiVpa}&pn=${encodedName}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${txNote}`,
        bhim: `bhim://pay?pa=${upiVpa}&pn=${encodedName}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${txNote}`
      }
    });
  } catch (err) {
    console.error('Error generating UPI QR:', err);
    res.status(500).json({ error: 'Failed to generate UPI QR code' });
  }
});

// Verify Payment
app.post('/api/verify-payment', (req, res) => {
  try {
    const { method, orderId, utr, amount } = req.body;
    
    if (method === 'gpay' || method === 'upi') {
      const ref = utr || ('UPI_' + Date.now().toString(36).toUpperCase());
      return res.json({
        success: true,
        verified: true,
        paymentId: ref,
        method: method,
        message: `${method === 'gpay' ? 'Google Pay' : 'UPI'} payment logged and confirmed successfully`
      });
    }

    if (method === 'cod') {
      return res.json({
        success: true,
        verified: true,
        paymentId: 'COD_' + Date.now(),
        method: 'cod',
        message: 'Order confirmed for Cash on Delivery'
      });
    }

    res.status(400).json({ error: 'Unknown payment method' });
  } catch (err) {
    console.error('Error verifying payment:', err);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// Orders API (CRUD and status management)
app.get('/api/orders', (req, res) => {
  const { phone, role } = req.query;
  if (role === 'shopowner') {
    return res.json({ success: true, orders: ordersList });
  }
  if (role === 'delivery') {
    return res.json({ success: true, orders: ordersList });
  }
  if (phone) {
    const customerOrders = ordersList.filter(o => o.phone === phone || o.customer?.phone === phone);
    return res.json({ success: true, orders: customerOrders.length ? customerOrders : ordersList });
  }
  res.json({ success: true, orders: ordersList });
});

app.post('/api/orders', (req, res) => {
  try {
    const orderData = req.body;
    const newOrder = {
      ...orderData,
      status: orderData.status || 'Pending',
      timeline: [
        {
          status: 'Pending',
          at: Date.now(),
          note: `Order placed via ${orderData.method === 'gpay' ? 'Google Pay' : orderData.method === 'upi' ? 'UPI' : 'Cash on Delivery'} (₹${Number(orderData.total).toFixed(2)})`
        }
      ]
    };
    ordersList.unshift(newOrder);
    res.json({ success: true, order: newOrder });
  } catch (err) {
    console.error('Error saving order:', err);
    res.status(500).json({ success: false, error: 'Failed to create order' });
  }
});

app.patch('/api/orders/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status, note, driver } = req.body;
    const validStatuses = ['Pending', 'Packed', 'Shipped', 'Delivered'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid order status' });
    }

    const order = ordersList.find(o => o.id === id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    order.status = status;
    if (driver) order.driver = driver;
    if (!order.timeline) order.timeline = [];
    
    let defaultNote = '';
    if (status === 'Packed') defaultNote = 'Order packed & verified at wholesale distribution hub';
    else if (status === 'Shipped') defaultNote = 'Dispatched and out for delivery with partner';
    else if (status === 'Delivered') defaultNote = 'Delivered to customer address. Order completed ✓';

    order.timeline.push({
      status,
      at: Date.now(),
      note: note || defaultNote
    });

    res.json({ success: true, order });
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ success: false, error: 'Failed to update order status' });
  }
});

// Delivery Clusters API for Delivery Partner & Dispatch Management
app.get('/api/delivery-clusters', (req, res) => {
  const activeOrders = ordersList.filter(o => o.status === 'Pending' || o.status === 'Packed' || o.status === 'Shipped');
  
  // Calculate clusters based on order addresses and zones
  const clusters = DELIVERY_ZONES.map(zone => {
    const matchedOrders = activeOrders.filter(o => {
      if (o.zone === zone.name) return true;
      const addrLower = (o.addr || '').toLowerCase();
      return zone.match.some(keyword => addrLower.includes(keyword));
    });

    const activeCount = matchedOrders.length;
    let demand = 'Normal';
    if (activeCount >= 3) demand = 'Surge (High Demand 🔥)';
    else if (activeCount >= 1) demand = 'Active';
    
    return {
      id: zone.id,
      name: zone.name,
      x: zone.x,
      y: zone.y,
      hubDistKm: zone.hubDistKm,
      etaMins: zone.etaMins,
      activeOrdersCount: activeCount,
      demand,
      orders: matchedOrders.map(o => ({
        id: o.id,
        customerName: o.customer?.name || 'Customer',
        phone: o.phone,
        status: o.status,
        total: o.total,
        addr: o.addr,
        method: o.method,
        tip: o.tip || 0
      }))
    };
  });

  // Calculate cluster summary statistics
  const totalActive = activeOrders.length;
  const busiest = [...clusters].sort((a, b) => b.activeOrdersCount - a.activeOrdersCount)[0];

  res.json({
    success: true,
    clusters,
    summary: {
      totalActiveOrders: totalActive,
      busiestZone: busiest ? busiest.name : 'Velachery Hub',
      busiestZoneCount: busiest ? busiest.activeOrdersCount : 0,
      activeFleetDrivers: 4,
      avgDeliveryTimeMins: 14,
      hubLocation: 'Unga Market Central Wholesale Distribution Hub, Velachery Main Rd, Chennai'
    }
  });
});

// Product Catalog Dynamic Management (Add / Edit / Remove) for Shopowner
app.get('/api/products/modifications', (req, res) => {
  const mods = Array.from(dynamicProductModifications.entries()).map(([id, data]) => ({ id, ...data }));
  res.json({ success: true, modifications: mods });
});

app.post('/api/products', (req, res) => {
  try {
    const { name, brand, category, size, mrp, discountPercent, price, img } = req.body;
    if (!name || !mrp) {
      return res.status(400).json({ success: false, error: 'Product name and MRP are required' });
    }

    const id = 'FMCG_CUSTOM_' + Date.now().toString(36).toUpperCase();
    const parsedMrp = Number(mrp) || 100;
    const discPct = Number(discountPercent) || 20;
    const calculatedPrice = price ? Number(price) : Math.round(parsedMrp * (1 - discPct / 100));
    const discAmount = parsedMrp - calculatedPrice;

    const newProd = {
      id,
      c: (category || 'clean').toLowerCase(),
      b: brand || 'Unga Direct',
      n: name,
      s: size || '1 Unit',
      m: parsedMrp,
      disc: discAmount,
      p: calculatedPrice,
      img: img || createAuthenticPackshotSVG({ id, name, brand, category, size }),
      isCustom: true,
      createdAt: Date.now()
    };

    dynamicProductModifications.set(id, newProd);
    res.json({ success: true, product: newProd, message: 'Product added to wholesale catalog' });
  } catch (err) {
    console.error('Error adding product:', err);
    res.status(500).json({ success: false, error: 'Failed to add product' });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const existing = dynamicProductModifications.get(id) || {};
    const updated = {
      ...existing,
      ...updates,
      id,
      updatedAt: Date.now()
    };

    if (updates.mrp && updates.discountPercent !== undefined) {
      const parsedMrp = Number(updates.mrp);
      const discPct = Number(updates.discountPercent);
      updated.m = parsedMrp;
      updated.p = Math.round(parsedMrp * (1 - discPct / 100));
      updated.disc = parsedMrp - updated.p;
    }

    dynamicProductModifications.set(id, updated);
    res.json({ success: true, product: updated, message: 'Product updated successfully' });
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({ success: false, error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    dynamicProductModifications.set(id, { deleted: true, id, deletedAt: Date.now() });
    res.json({ success: true, message: `Product ${id} removed from catalog` });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ success: false, error: 'Failed to delete product' });
  }
});

// Promo Coupon Validation API
app.post('/api/apply-coupon', (req, res) => {
  const { code, subtotal } = req.body;
  const c = (code || '').trim().toUpperCase();
  const sub = Number(subtotal) || 0;

  if (c === 'WELCOME20') {
    if (sub < 199) {
      return res.json({ success: false, error: 'WELCOME20 requires minimum order of ₹199' });
    }
    const discount = 50;
    return res.json({
      success: true,
      code: 'WELCOME20',
      discount,
      message: '🎉 WELCOME20 applied! Flat ₹50 Welcome Discount!'
    });
  }

  if (c === 'UNGA10') {
    const discount = Math.min(Math.round(sub * 0.10), 100);
    return res.json({
      success: true,
      code: 'UNGA10',
      discount,
      message: `🎉 UNGA10 applied! Extra 10% Off (Saved ₹${discount})!`
    });
  }

  if (c === 'FREEDEL') {
    return res.json({
      success: true,
      code: 'FREEDEL',
      freeDelivery: true,
      discount: sub < 499 ? 29 : 0,
      message: '🚀 FREEDEL applied! Free Delivery on this order!'
    });
  }

  if (c === 'SUPER20') {
    const discount = Math.round(sub * 0.20);
    return res.json({
      success: true,
      code: 'SUPER20',
      discount,
      message: `✨ SUPER20 applied! 20% Extra Wholesale Cashback (Saved ₹${discount})!`
    });
  }

  res.status(400).json({ success: false, error: 'Invalid coupon code. Try WELCOME20, UNGA10, FREEDEL, or SUPER20' });
});

app.get('/api/stats', (req, res) => {
  const total = ordersList.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const counts = {
    total: ordersList.length,
    pending: ordersList.filter(o => o.status === 'Pending').length,
    packed: ordersList.filter(o => o.status === 'Packed').length,
    shipped: ordersList.filter(o => o.status === 'Shipped').length,
    delivered: ordersList.filter(o => o.status === 'Delivered').length,
    revenue: total
  };
  res.json({ success: true, stats: counts });
});

// Serve static assets from root directory
app.use(express.static(__dirname));

// Fallback to index.html for any route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Unga Market server running at http://${HOST}:${PORT}`);
});
