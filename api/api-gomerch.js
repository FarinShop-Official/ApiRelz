const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

class GoMerchant {
    constructor() {
        this.baseUrl = 'https://api.gobiz.co.id';
        this.clientId = 'go-biz-web-new';
        this.appId = 'go-biz-web-dashboard';
        this.uniqueId = uuidv4();
    }

    headers(token = null) {
        const h = {
            'Accept': 'application/json, text/plain, */*',
            'Authentication-Type': 'go-id',
            'X-PhoneMake': 'Android 10',
            'X-PhoneModel': 'K',
            'x-DeviceOS': 'Web',
            'X-Platform': 'Web',
            'X-User-Type': 'merchant',
            'x-appId': this.appId,
            'x-uniqueid': this.uniqueId,
            'X-AppVersion': 'platform-v3.101.0-8918927d',
            'Gojek-Country-Code': 'ID',
            'Gojek-Timezone': 'Asia/Jakarta',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36'
        };
        if (token) h['Authorization'] = `Bearer ${token}`;
        return h;
    }

    convertCRC16(str) {
        let crc = 0xFFFF;
        const strlen = str.length;
        for (let c = 0; c < strlen; c++) {
            crc ^= str.charCodeAt(c) << 8;
            for (let i = 0; i < 8; i++) {
                if (crc & 0x8000) {
                    crc = (crc << 1) ^ 0x1021;
                } else {
                    crc = crc << 1;
                }
            }
        }
        let hex = crc & 0xFFFF;
        hex = ("000" + hex.toString(16).toUpperCase()).slice(-4);
        return hex;
    }

    async createDynamicQRIS(amount, staticQr) {
        try {
            let qrisData = staticQr;
            qrisData = qrisData.slice(0, -4);
            const step1 = qrisData.replace("010211", "010212");
            const step2 = step1.split("5802ID");
            const amountStr = amount.toString();
            let uang = "54" + ("0" + amountStr.length).slice(-2) + amountStr;
            uang += "5802ID";
            const result = step2[0] + uang + step2[1] + this.convertCRC16(step2[0] + uang + step2[1]);
            const qrCodeBuffer = await QRCode.toBuffer(result);
            return {
                qr_buffer: qrCodeBuffer.toString('base64'), // kirim sebagai base64 agar JSON aman
                qr_string: result,
                amount: amount,
                created_at: new Date().toISOString()
            };
        } catch (error) {
            throw error;
        }
    }

    async requestOtp(phoneNumber) {
        const payload = {
            client_id: this.clientId,
            phone_number: phoneNumber,
            country_code: '62'
        };
        const response = await axios.post(`${this.baseUrl}/goid/login/request`, payload, {
            headers: this.headers()
        });
        return response.data;
    }

    // OTP via email
    async requestOtpEmail(email) {
        const payload = {
            email: email,
            client_id: this.clientId
        };
        const response = await axios.post(`${this.baseUrl}/goid/login/request`, payload, {
            headers: this.headers()
        });
        return response.data;
    }

    async verifyOtp(otp, otpToken) {
        const payload = {
            client_id: this.clientId,
            data: {
                otp: otp,
                otp_token: otpToken
            },
            grant_type: 'otp'
        };
        const response = await axios.post(`${this.baseUrl}/goid/token`, payload, {
            headers: this.headers()
        });
        return response.data;
    }

    async refreshToken(refreshToken) {
        const payload = {
            client_id: this.clientId,
            grant_type: 'refresh_token',
            data: {
                refresh_token: refreshToken
            }
        };
        const response = await axios.post(`${this.baseUrl}/goid/token`, payload, {
            headers: this.headers()
        });
        return response.data;
    }

    async getMe(accessToken) {
        const response = await axios.get(`${this.baseUrl}/v1/users/me`, {
            headers: this.headers(accessToken)
        });
        return response.data;
    }

    async getJournals(accessToken, merchantId, startTime = null) {
        const dateTo = new Date().toISOString();
        const dateFrom = startTime || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const payload = {
            from: 0,
            size: 50,
            sort: { time: { order: 'desc' } },
            included_categories: { incoming: ['transaction_share', 'action'] },
            query: [{
                clauses: [
                    { field: 'metadata.transaction.status', op: 'in', value: ['settlement', 'capture'] },
                    { field: 'metadata.transaction.transaction_time', op: 'gte', value: dateFrom },
                    { field: 'metadata.transaction.transaction_time', op: 'lte', value: dateTo },
                    { field: 'metadata.transaction.merchant_id', op: 'equal', value: merchantId }
                ],
                op: 'and'
            }]
        };
        const response = await axios.post(`${this.baseUrl}/journals/search`, payload, {
            headers: {
                ...this.headers(accessToken),
                'accept': 'application/vnd.journal.v1+json'
            }
        });
        return response.data;
    }
}

// Endpoint Routes
module.exports = [
    {
        name: "Request OTP (Tahap 1)",
        desc: "Mengirim OTP ke email atau nomor HP GoPay Merchant",
        category: "Gopay Merchant",
        parameters: {
            apikey: { type: "string" },
            email: { type: "string", required: false },
            phone: { type: "string", required: false }
        },
        path: "/gomerch/getotp",
        async run(req, res) {
            const { apikey, email, phone } = req.query;
            if (!apikey || !global.apikey.includes(apikey))
                return res.json({ status: false, error: "Apikey invalid" });

            if (!email && !phone)
                return res.json({ status: false, error: "Email or phone is required" });

            try {
                const gopay = new GoMerchant();
                let result;
                if (email) {
                    result = await gopay.requestOtpEmail(email);
                } else {
                    let phoneNumber = phone;
                    if (phoneNumber.startsWith("62")) phoneNumber = phoneNumber.slice(2);
                    result = await gopay.requestOtp(phoneNumber);
                }
                return res.status(200).json({ status: true, result });
            } catch (err) {
                return res.status(500).json({ status: false, error: err.message });
            }
        }
    },
    {
        name: "Verify OTP (Tahap 2)",
        desc: "Verifikasi OTP dan dapatkan token akses",
        category: "Gopay Merchant",
        parameters: {
            apikey: { type: "string" },
            otp: { type: "string" },
            otp_token: { type: "string" }
        },
        path: "/gomerch/gettoken",
        async run(req, res) {
            const { apikey, otp, otp_token } = req.query;
            if (!apikey || !global.apikey.includes(apikey))
                return res.json({ status: false, error: "Apikey invalid" });
            if (!otp || !otp_token)
                return res.json({ status: false, error: "OTP and OTP token are required" });

            try {
                const gopay = new GoMerchant();
                const result = await gopay.verifyOtp(otp, otp_token);
                return res.status(200).json({ status: true, result });
            } catch (err) {
                return res.status(500).json({ status: false, error: err.message });
            }
        }
    },
    {
        name: "Refresh Token",
        desc: "Memperbarui token akses menggunakan refresh token",
        category: "Gopay Merchant",
        parameters: {
            apikey: { type: "string" },
            refresh_token: { type: "string" }
        },
        path: "/gomerch/refreshtoken",
        async run(req, res) {
            const { apikey, refresh_token } = req.query;
            if (!apikey || !global.apikey.includes(apikey))
                return res.json({ status: false, error: "Apikey invalid" });
            if (!refresh_token)
                return res.json({ status: false, error: "Refresh token is required" });

            try {
                const gopay = new GoMerchant();
                const result = await gopay.refreshToken(refresh_token);
                return res.status(200).json({ status: true, result });
            } catch (err) {
                return res.status(500).json({ status: false, error: err.message });
            }
        }
    },
    {
        name: "Mutasi Transaksi",
        desc: "Melihat riwayat transaksi QRIS",
        category: "Gopay Merchant",
        parameters: {
            apikey: { type: "string" },
            token: { type: "string" },
            start_time: { type: "string", required: false }
        },
        path: "/gomerch/mutasi",
        async run(req, res) {
            const { apikey, token, start_time } = req.query;
            if (!apikey || !global.apikey.includes(apikey))
                return res.json({ status: false, error: "Apikey invalid" });
            if (!token)
                return res.json({ status: false, error: "Access token is required" });

            try {
                const gopay = new GoMerchant();
                // Ambil merchant_id dari profil
                const user = await gopay.getMe(token);
                const merchantId = user.user?.merchant_id;
                if (!merchantId) throw new Error("merchant_id tidak ditemukan");

                const defaultStartTime = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();
                const journals = await gopay.getJournals(token, merchantId, start_time || defaultStartTime);

                const data = (journals.hits || [])
                    .filter(item => item?.metadata?.transaction?.payment_type === 'qris')
                    .map(item => {
                        const aspi = item.metadata?.provider_metadata?.aspi;
                        return {
                            id: item.id,
                            reference_id: item.reference_id,
                            status: item.status,
                            time: item.time,
                            amount: aspi?.data?.amount || 0,
                            issuer: aspi?.issuer || null,
                            acquirer: aspi?.acquirer || null,
                            merchant_name: aspi?.data?.merchant_name || null,
                            merchant_id: aspi?.data?.merchant_id || null,
                            merchant_city: aspi?.data?.merchant_city || null,
                            terminal_label: aspi?.data?.additional_data?.terminal_label || null
                        };
                    });

                return res.status(200).json({ status: true, total: data.length, data });
            } catch (err) {
                return res.status(500).json({ status: false, error: err.message });
            }
        }
    },
    {
        name: "Buat QRIS Dinamis",
        desc: "Membuat kode QR pembayaran dinamis",
        category: "Gopay Merchant",
        parameters: {
            apikey: { type: "string" },
            amount: { type: "string" },
            static_qr: { type: "string" }
        },
        path: "/gomerch/createpayment",
        async run(req, res) {
            const { apikey, amount, static_qr } = req.query;
            if (!apikey || !global.apikey.includes(apikey))
                return res.json({ status: false, error: "Apikey invalid" });
            if (!amount || !static_qr)
                return res.json({ status: false, error: "Amount and static QR string are required" });

            try {
                const gopay = new GoMerchant();
                const result = await gopay.createDynamicQRIS(amount, static_qr);
                return res.status(200).json({ status: true, result });
            } catch (err) {
                return res.status(500).json({ status: false, error: err.message });
            }
        }
    }
];