const express = require('express');
const chalk = require('chalk');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 8000;
app.enable("trust proxy");
app.set("json spaces", 2);

app.use(express.static(path.join(__dirname, 'src')));
app.use(express.json());
app.use(cors());

global.getBuffer = async (url, options = {}) => {
  try {
    const res = await axios({ method: 'get', url, headers: { 'DNT': 1, 'Upgrade-Insecure-Request': 1 }, ...options, responseType: 'arraybuffer' });
    return res.data;
  } catch (err) { return err; }
};

global.fetchJson = async (url, options = {}) => {
  try {
    const res = await axios({ method: 'GET', url, headers: { 'User-Agent': 'Mozilla/5.0' }, ...options });
    return res.data;
  } catch (err) { return err; }
};


const settings = {
  name: "Rest API Payment",
  description: "Payment Gateway Unofficial untuk Orderkuota & GoPay Merchant dengan API sederhana",
  apiSettings: { creator: "FarinShop" },
  linkWhatsapp: "https://t.me/farinmodssv2",
  linkChannel: "https://t.me/farinmods", 
  linkGithub: "https://github.com/-", 
  linkYoutube: "https://www.youtube.com/@"
};

global.apikey = ["yoll122"]

app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (data) {
    if (data && typeof data === 'object') {
      const responseData = { status: data.status, creator: settings.apiSettings.creator || "Created Using FarinShop", ...data };
      return originalJson.call(this, responseData);
    }
    return originalJson.call(this, data);
  };
  next();
});

let totalRoutes = 0;
let rawEndpoints = {};

const apiFolder = path.join(__dirname, './api');

// Fungsi helper untuk mengonversi parameter ke format frontend
function convertParametersForFrontend(parameters) {
  if (!parameters) return {};
  
  const converted = {};
  for (const [paramName, paramConfig] of Object.entries(parameters)) {
    converted[paramName] = {
      type: paramConfig.type || "string",
      ...(paramConfig.required !== undefined && { required: paramConfig.required }),
      ...(paramConfig.example && { example: paramConfig.example }),
      ...(paramConfig.value && { value: paramConfig.value }),
      ...(paramConfig.selection && { selection: paramConfig.selection })
    };
  }
  return converted;
}

const register = (ep, file) => {
  if (ep && ep.name && ep.category && ep.path && typeof ep.run === "function") {
    const cleanPath = ep.path.split("?")[0];
    const method = ep.method ? ep.method.toLowerCase() : 'get';
        
      app.get(cleanPath, (req, res, next) => {
        console.log(`GET ${cleanPath} - Query:`, req.query);
        ep.run(req, res, next);
      });

    if (!rawEndpoints[ep.category]) rawEndpoints[ep.category] = [];
    
    // Data endpoint untuk frontend
    const endpointData = {
      name: ep.name,
      description: ep?.description || ep?.desc || null,
      path: ep.path,
      method: ep.method || 'GET',
      // Konversi parameter ke format frontend
      parameters: convertParametersForFrontend(ep.parameters),
      // Untuk kompatibilitas dengan format lama
      ...(ep.innerDesc ? { innerDesc: ep.innerDesc } : {}),
      ...(ep.body ? { body: ep.body } : {})
    };
    
    rawEndpoints[ep.category].push(endpointData);
    totalRoutes++;
    console.log(chalk.bgHex('#FFFF99').hex('#333').bold(` Loaded Route: ${file} → ${ep.name} (${method.toUpperCase()}) `));
    
    // Log parameter jika ada
    if (ep.parameters) {
      console.log(chalk.hex('#FFA500')(`  Parameters: ${Object.keys(ep.parameters).join(', ')}`));
    }
  }
};

fs.readdirSync(apiFolder).forEach((file) => {
  const filePath = path.join(apiFolder, file);
  if (path.extname(file) === '.js') {
    try {
      delete require.cache[require.resolve(filePath)];
      const routeModule = require(filePath);
      if (Array.isArray(routeModule)) {
        routeModule.forEach(ep => register(ep, file));
      } else if (routeModule.endpoint) {
        register(routeModule.endpoint, file);
      } else if (typeof routeModule === "function") {
        routeModule(app);
      } else {
        register(routeModule, file);
      }
    } catch (err) {
      console.error(chalk.red(`Error loading ${file}:`), err.message);
    }
  }
});

console.log(chalk.bgHex('#90EE90').hex('#333').bold(' Load Complete! ✓ '));
console.log(chalk.bgHex('#90EE90').hex('#333').bold(` Total Routes Loaded: ${totalRoutes} `));

// Urutan custom untuk kategori tertentu (kalau tidak ada di sini, default sort alfabetis)
const customOrder = {
  'Orderkuota': [
    'Request OTP (Tahap 1)',
    'Get Token (Tahap 2)',
    'Cek E-Wallet',
    'Cek Profil',
    'Withdraw QRIS',
    'Create Payment',
    'Mutasi QRIS'
  ],
  'Gopay Merchant': [
    'Request OTP (Tahap 1)',
    'Verify OTP (Tahap 2)',
    'Refresh Token',
    'Buat QRIS Dinamis',
    'Mutasi Transaksi'
  ]
};

function sortCategoryItems(category, items) {
  const order = customOrder[category];
  if (order) {
    return items.slice().sort((a, b) => {
      const ia = order.indexOf(a.name);
      const ib = order.indexOf(b.name);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }
  return items.slice().sort((a, b) => a.name.localeCompare(b.name));
}

// Endpoint settings untuk frontend
app.get('/settings', (req, res) => {
  const endpoints = {
    categories: Object.keys(rawEndpoints)
      .sort((a, b) => a.localeCompare(b))
      .map(category => ({
        name: category,
        items: sortCategoryItems(category, rawEndpoints[category])
          .map(endpoint => ({
            name: endpoint.name,
            method: endpoint.method || 'GET',
            path: endpoint.path,
            description: endpoint.description || endpoint.desc || null,
            parameters: endpoint.parameters || {}
          }))
      }))
  };
  
  // Gabungkan settings dengan endpoints
  const fullSettings = {
    ...settings,
    categories: endpoints.categories,
    // Tambahkan metadata
    metadata: {
      totalEndpoints: totalRoutes,
      totalCategories: endpoints.categories.length,
      lastUpdated: new Date().toISOString()
    }
  };
  
  res.json(fullSettings);
});

// ===== Endpoint per kategori (otomatis berdasarkan kategori yang terdaftar) =====
Object.keys(rawEndpoints).forEach(category => {
  // Buat slug dari nama kategori (contoh: "AI Tools" -> "/ai-tools")
  const slug = '/' + category.toLowerCase().replace(/\s+/g, '-');
  app.get(slug, (req, res) => {
    const items = sortCategoryItems(category, rawEndpoints[category]).map(endpoint => ({
      name: endpoint.name,
      method: endpoint.method || 'GET',
      path: endpoint.path,
      description: endpoint.description || endpoint.desc || null,
      parameters: endpoint.parameters || {}
    }));
    res.json({
      success: true,
      category,
      items
    });
  });
  console.log(chalk.cyan(`Category route: ${slug} → ${category}`));
});


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/docs.html'));
});


app.listen(PORT, () => {
  console.log(chalk.bgHex('#90EE90').hex('#333').bold(` Server is running on port ${PORT} `));
  console.log(chalk.cyan(`Documentation: http://localhost:${PORT}`));
});

module.exports = app;