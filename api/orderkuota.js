const axios = require('axios');
const qs = require('qs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { ImageUploadService } = require('node-upload-images');

// ==================== KONFIGURASI API ====================
const API_URL = 'https://app.orderkuota.com/api/v2';
const HOST = 'app.orderkuota.com';
const USER_AGENT = 'okhttp/4.12.0';

// ==================== DEVICE FINGERPRINT ACAK ====================
class OrderKuota {
    constructor(username = null, authToken = null) {
        this.username = username;
        this.authToken = authToken;
        this.generateDeviceFingerprint();
    }

    generateDeviceFingerprint() {
        const rawUuid = crypto.randomBytes(16).toString('hex');
        this.phoneUuid = [
            rawUuid.slice(0, 8),
            rawUuid.slice(8, 12),
            rawUuid.slice(12, 16),
            rawUuid.slice(16, 20),
            rawUuid.slice(20, 32)
        ].join('-');

        const fcmHash = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex');
        this.appRegId = `${this.phoneUuid}:APA91b${fcmHash.slice(0, 100)}`;

        this.phoneModel = 'SM-G973F';
        this.phoneAndroidVersion = '15';
        this.appVersionCode = '260115';
        this.appVersionName = '26.01.15';
        this.uiMode = 'light';
    }

    basePayload(extra = {}) {
        return {
            app_reg_id: this.appRegId,
            phone_uuid: this.phoneUuid,
            phone_model: this.phoneModel,
            phone_android_version: this.phoneAndroidVersion,
            app_version_code: this.appVersionCode,
            app_version_name: this.appVersionName,
            ui_mode: this.uiMode,
            ...extra
        };
    }

    async login(username, password) {
        const payload = qs.stringify({
            ...this.basePayload(),
            username,
            password
        });
        const { data } = await axios.post(`${API_URL}/login`, payload, {
            headers: { 'User-Agent': USER_AGENT, 'Host': HOST, 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 30000
        });
        return data;
    }

    async generateQr(amount) {
        const timestamp = Date.now().toString();
        const payload = qs.stringify({
            ...this.basePayload(),
            auth_username: this.username,
            auth_token: this.authToken,
            request_time: timestamp,
            'requests[qris_merchant_terms][jumlah]': amount,
            'requests[0]': 'qris_merchant_terms'
        });
        const { data } = await axios.post(`${API_URL}/get`, payload, {
            headers: { 'User-Agent': USER_AGENT, 'Host': HOST, 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 30000
        });
        return data;
    }
    
    async getProfile() {
        const timestamp = Date.now().toString();

        const paramsForSign = {
            auth_username: this.username,
            auth_token: this.authToken,
            phone_uuid: this.phoneUuid,
            request_time: timestamp
        };
        const sortedKeys = Object.keys(paramsForSign).sort();
        const base = sortedKeys.map(k => `${k}=${paramsForSign[k]}`).join('&') + `&timestamp=${timestamp}&secret=orderkuota_mobile_app_2024`;
        const signature = crypto.createHmac('sha256', 'orderkuota_mobile_app_2024').update(base).digest('hex');

        const payload = qs.stringify({
            app_reg_id: this.appRegId,
            phone_uuid: this.phoneUuid,
            phone_model: this.phoneModel,
            request_time: timestamp,
            phone_android_version: this.phoneAndroidVersion,
            app_version_code: this.appVersionCode,
            auth_username: this.username,
            'requests[2]': 'home_toolbar_button',
            'requests[1]': 'point',
            'requests[0]': 'account',
            auth_token: this.authToken,
            app_version_name: this.appVersionName,
            ui_mode: this.uiMode
        });

        const { data } = await axios.post(`${API_URL}/get`, payload, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept-Encoding': 'gzip',
                'Content-Type': 'application/x-www-form-urlencoded',
                'signature': signature,
                'timestamp': timestamp
            },
            timeout: 30000
        });
        return data;
    }

    async withdraw(amount) {
        const timestamp = Date.now().toString();
        const payload = qs.stringify({
            ...this.basePayload(),
            auth_username: this.username,
            auth_token: this.authToken,
            request_time: timestamp,
            'requests[qris_withdraw][amount]': amount.toString(),
            'requests[0]': 'account'
        });
        const { data } = await axios.post(`${API_URL}/get`, payload, {
            headers: { 'User-Agent': USER_AGENT, 'Host': HOST, 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 30000
        });
        return data;
    }

    async getTransactionQris() {
        const resellerId = this.authToken.split(':')[0];
        const timestamp = Date.now().toString();

        const paramsForSign = {
            auth_username: this.username,
            auth_token: this.authToken,
            phone_uuid: this.phoneUuid,
            request_time: timestamp
        };
        const sortedKeys = Object.keys(paramsForSign).sort();
        const base = sortedKeys.map(k => `${k}=${paramsForSign[k]}`).join('&') + `&timestamp=${timestamp}&secret=orderkuota_mobile_app_2024`;
        const signature = crypto.createHmac('sha256', 'orderkuota_mobile_app_2024').update(base).digest('hex');

        const payload = qs.stringify({
            app_reg_id: this.appRegId,
            phone_uuid: this.phoneUuid,
            phone_model: this.phoneModel,
            'requests[qris_history][keterangan]': '',
            'requests[qris_history][jumlah]': '',
            'requests[qris_history][jenis]': 'kredit',
            request_time: timestamp,
            phone_android_version: this.phoneAndroidVersion,
            app_version_code: this.appVersionCode,
            auth_username: this.username,
            'requests[qris_history][page]': '1',
            auth_token: this.authToken,
            app_version_name: this.appVersionName,
            ui_mode: this.uiMode,
            'requests[qris_history][dari_tanggal]': '',
            'requests[0]': 'account',
            'requests[qris_history][ke_tanggal]': ''
        });

        const { data } = await axios.post(`${API_URL}/qris/mutasi/${resellerId}`, payload, {
            headers: {
                'User-Agent': USER_AGENT,
                'Host': HOST,
                'Content-Type': 'application/x-www-form-urlencoded',
                'signature': signature,
                'timestamp': timestamp
            },
            timeout: 30000
        });
        return data;
    }
}

// ==================== FUNGSI PEMBANTU ====================
function convertCRC16(str) {
    let crc = 0xFFFF;
    for (let c = 0; c < str.length; c++) {
        crc ^= str.charCodeAt(c) << 8;
        for (let i = 0; i < 8; i++) {
            crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
        }
    }
    return ("000" + (crc & 0xFFFF).toString(16).toUpperCase()).slice(-4);
}

function generateTransactionId() {
    return 'NDY-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function generateExpirationTime() {
    const exp = new Date();
    exp.setMinutes(exp.getMinutes() + 30);
    return exp.toISOString().replace('T', ' ').split('.')[0];
}

async function uploadImage(imagePath) {
    const service = new ImageUploadService('pixhost.to');
    const { directLink } = await service.uploadFromBinary(imagePath, 'qris.png');
    return directLink;
}

async function createQRIS(amount, codeqr) {
    let qrisData = codeqr.slice(0, -4);
    const step1 = qrisData.replace("010211", "010212");
    const step2 = step1.split("5802ID");
    amount = amount.toString();
    let uang = "54" + amount.length.toString().padStart(2, '0') + amount + "5802ID";
    const final = step2[0] + uang + step2[1];
    const qrString = final + convertCRC16(final);

    const qrBuffer = await QRCode.toBuffer(qrString);
    const imageUrl = await uploadImage(qrBuffer);

    return {
        idtransaksi: generateTransactionId(),
        jumlah: amount,
        expired: generateExpirationTime(),
        imageqris: { url: imageUrl },
        qr_string: qrString
    };
}

// ==================== ENDPOINT ROUTES ====================
module.exports = [
    {
        name: "Request OTP (Tahap 1)",
        desc: "Mendapatkan OTP untuk login OrderKuota",
        category: "Orderkuota",
        parameters: {
            apikey: { type: "string" },
            username: { type: "string" },
            password: { type: "string" }
        },
        path: "/orderkuota/getotp",
        async run(req, res) {
            const { apikey, username, password } = req.query;
            if (!global.apikey.includes(apikey))
                return res.status(403).json({ status: false, message: "API Key tidak valid." });
            if (!username || !password)
                return res.status(400).json({ status: false, message: "Parameter 'username' dan 'password' wajib diisi." });

            try {
                const ok = new OrderKuota();
                const rese = await ok.login(username, password);
                const teks = rese?.results?.otp && rese?.results?.otp_value ? `Kode otp berhasil di kirim ke email ${rese.results.otp_value}` : "Gagal mengambil otp! kesalahan akun atau terjadi error."
                return res.json({ status: true, action: "getotp", result: teks });
            } catch (err) {
                return res.status(500).json({ status: false, message: err.message });
            }
        }
    },
    {
        name: "Get Token (Tahap 2)",
        desc: "Tukar OTP dengan token akses",
        category: "Orderkuota",
        parameters: {
            apikey: { type: "string" },
            username: { type: "string" },
            otp: { type: "string" }
        },
        path: "/orderkuota/gettoken",
        async run(req, res) {
            const { apikey, username, otp } = req.query;
            if (!global.apikey.includes(apikey))
                return res.status(403).json({ status: false, message: "API Key tidak valid." });
            if (!username || !otp)
                return res.status(400).json({ status: false, message: "Parameter 'username' dan 'otp' wajib diisi." });

            try {
                const ok = new OrderKuota();
                const result = await ok.login(username, otp);
                // Tidak ada lagi notifikasi Telegram
                return res.json({ status: true, action: "gettoken", result: result?.results || {} });
            } catch (err) {
                return res.status(500).json({ status: false, message: err.message });
            }
        }
    },
    {
        name: "Create Payment",
        desc: "Buat QRIS dinamis langsung dari static QR string",
        category: "Orderkuota",
        parameters: {
            apikey: { type: "string" },
            amount: { type: "string" },
            static_qr: { type: "string" }
        },
        path: "/orderkuota/createpayment",
        async run(req, res) {
            const { apikey, amount, static_qr } = req.query;
            if (!global.apikey.includes(apikey))
                return res.status(403).json({ status: false, message: "API Key tidak valid." });
            if (!amount || !static_qr)
                return res.status(400).json({ status: false, message: "Parameter 'amount' dan 'static_qr' wajib diisi." });
            if (isNaN(amount) || Number(amount) <= 0)
                return res.status(400).json({ status: false, message: "Nominal 'amount' harus > 0" });

            try {
                const qrisResult = await createQRIS(amount, static_qr);
                return res.json({
                    status: true,
                    action: "createpayment",
                    result: {
                        trxid: qrisResult.idtransaksi,
                        nominal: qrisResult.jumlah,
                        expired: qrisResult.expired,
                        qris_image: qrisResult.imageqris.url,
                        qris_string: qrisResult.qr_string
                    }
                });
            } catch (err) {
                return res.status(500).json({ status: false, message: err.message });
            }
        }
    },
    {
        name: "Mutasi QRIS",
        desc: "Cek riwayat transaksi QRIS",
        category: "Orderkuota",
        parameters: {
            apikey: { type: "string" },
            username: { type: "string" },
            token: { type: "string" }
        },
        path: "/orderkuota/mutasiqr",
        async run(req, res) {
            const { apikey, username, token } = req.query;
            if (!global.apikey.includes(apikey))
                return res.status(403).json({ status: false, message: "API Key tidak valid." });
            if (!username || !token)
                return res.status(400).json({ status: false, message: "Parameter 'username' dan 'token' wajib diisi." });

            try {
                const ok = new OrderKuota(username, token);
                const result = await ok.getTransactionQris();
                // Tidak ada lagi notifikasi Telegram
                return res.json({ status: true, action: "mutasiqr", result: result.qris_history || result });
            } catch (err) {
                return res.status(500).json({ status: false, message: err.message });
            }
        }
    },
    {
        name: "Withdraw QRIS",
        desc: "Tarik saldo QRIS",
        category: "Orderkuota",
        parameters: {
            apikey: { type: "string" },
            username: { type: "string" },
            token: { type: "string" },
            amount: { type: "string" }
        },
        path: "/orderkuota/wdqr",
        async run(req, res) {
            const { apikey, username, token, amount } = req.query;
            if (!global.apikey.includes(apikey))
                return res.status(403).json({ status: false, message: "API Key tidak valid." });
            if (!username || !token || !amount)
                return res.status(400).json({ status: false, message: "Parameter 'username', 'token', dan 'amount' wajib diisi." });
            if (isNaN(amount) || Number(amount) <= 0)
                return res.status(400).json({ status: false, message: "Nominal 'amount' harus > 0" });

            try {
                const ok = new OrderKuota(username, token);
                const result = await ok.withdraw(amount);
                return res.json({ status: true, action: "wdqr", result });
            } catch (err) {
                return res.status(500).json({ status: false, message: err.message });
            }
        }
    },
    {
        name: "Cek Profil",
        desc: "Melihat informasi profil akun OrderKuota",
        category: "Orderkuota",
        parameters: {
            apikey: { type: "string" },
            username: { type: "string" },
            token: { type: "string" }
        },
        path: "/orderkuota/cekprofile",
        async run(req, res) {
            const { apikey, username, token } = req.query;
            if (!global.apikey.includes(apikey))
                return res.status(403).json({ status: false, message: "API Key tidak valid." });
            if (!username || !token)
                return res.status(400).json({ status: false, message: "Parameter 'username' dan 'token' wajib diisi." });

            try {
                const ok = new OrderKuota(username, token);
                const rese = await ok.getProfile();
                const result = rese?.account?.results || {}
                return res.json({ status: true, action: "cekprofile", result });
            } catch (err) {
                return res.status(500).json({ status: false, message: err.message });
            }
        }
    }, 
    {
        name: "Cek E-Wallet",
        desc: "Periksa nama pemilik akun e-wallet",
        category: "Orderkuota",
        parameters: {
            apikey: { type: "string" },
            provider: { type: "select", selection: ["dana", "ovo", "gopay", "shopeepay", "linkaja"] }, 
            nomor: { type: "string" }
        },
        path: "/orderkuota/cekewallet",
        async run(req, res) {
            const { apikey, provider, nomor } = req.query;
            if (!global.apikey.includes(apikey))
                return res.status(403).json({ status: false, message: "API Key tidak valid." });
            const token = "2990425:sqtmNSZujFgXLK3JWaQO9AdBHcT8C56o"
            const username = "panji05"
            const validProviders = ["dana", "ovo", "gopay", "shopeepay", "linkaja"];
            if (!provider || !validProviders.includes(provider.toLowerCase()))
                return res.status(400).json({ status: false, message: "Provider tidak valid", valid_providers: validProviders });
            if (!nomor || !username || !token)
                return res.status(400).json({ status: false, message: "Parameter 'nomor', 'username', 'token' wajib diisi." });

            try {
                const ok = new OrderKuota();
                const device = {
                    app_reg_id: ok.appRegId,
                    phone_uuid: ok.phoneUuid,
                    phone_model: ok.phoneModel,
                    phone_android_version: ok.phoneAndroidVersion,
                    app_version_code: ok.appVersionCode,
                    app_version_name: ok.appVersionName,
                    ui_mode: ok.uiMode
                };

                const timestamp = Date.now().toString();
                const payload = qs.stringify({
                    ...device,
                    auth_username: username,
                    auth_token: token,
                    phoneNumber: nomor,
                    customerId: '',
                    id: provider.toLowerCase(),
                    request_time: timestamp,
                    ui_mode: 'dark'
                });

                const url = `https://checker.orderkuota.com/api/checkname/produk/a3bf6fef873fbdde505891410456070d2c3c92f7cf/13/2088243/${provider.toLowerCase()}?phone=${nomor}&cust_id=&b=101310&t=fe62303a`;

                const { data } = await axios.post(url, payload, {
                    headers: {
                        'User-Agent': USER_AGENT,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept-Encoding': 'gzip',
                        'signature': '63c7cce025a219cf50ad08513d2a669e1c7bacf3233e42810aa42ced97eca2e6c6a926afd5afd93eb2fd90854e045d12921a2c84049f8096f4ec2b849097e940',
                        'timestamp': timestamp
                    },
                    timeout: 30000
                });

                return res.json({ status: true, action: "cekewallet", result: data });
            } catch (err) {
                return res.status(500).json({ status: false, message: err.message });
            }
        }
    }
];