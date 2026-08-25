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

        if (token) {
            h['Authorization'] = `Bearer ${token}`;
        }

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

        hex = (
            "000" +
            hex.toString(16).toUpperCase()
        ).slice(-4);

        return hex;
    }

    async createDynamicQRIS(amount, staticQr) {
        try {
            if (!staticQr) {
                throw new Error(
                    'Static QRIS tidak boleh kosong'
                );
            }

            const numericAmount =
                Number(amount);

            if (
                !Number.isFinite(
                    numericAmount
                ) ||
                numericAmount <= 0
            ) {
                throw new Error(
                    'Amount tidak valid'
                );
            }

            let qrisData =
                String(staticQr).trim();

            /*
             * Static QRIS normal biasanya
             * mempunyai CRC16 4 karakter
             * di bagian paling akhir.
             */
            if (qrisData.length < 8) {
                throw new Error(
                    'String QRIS terlalu pendek'
                );
            }

            qrisData =
                qrisData.slice(0, -4);

            /*
             * Ubah QRIS static menjadi
             * QRIS dynamic.
             */
            const step1 =
                qrisData.replace(
                    "010211",
                    "010212"
                );

            const step2 =
                step1.split("5802ID");

            if (step2.length < 2) {
                throw new Error(
                    'Format static QRIS tidak valid'
                );
            }

            const amountStr =
                String(numericAmount);

            let uang =
                "54" +
                ("0" + amountStr.length)
                    .slice(-2) +
                amountStr;

            uang += "5802ID";

            const qrWithoutCRC =
                step2[0] +
                uang +
                step2[1];

            const result =
                qrWithoutCRC +
                this.convertCRC16(
                    qrWithoutCRC
                );

            const qrCodeBuffer =
                await QRCode.toBuffer(
                    result,
                    {
                        type: 'png',
                        width: 500,
                        margin: 2
                    }
                );

            return {
                qr_buffer:
                    qrCodeBuffer.toString(
                        'base64'
                    ),

                qr_string:
                    result,

                amount:
                    numericAmount,

                created_at:
                    new Date().toISOString()
            };

        } catch (error) {
            throw error;
        }
    }

    async requestOtp(phoneNumber) {
        const payload = {
            client_id:
                this.clientId,

            phone_number:
                phoneNumber,

            country_code:
                '62'
        };

        const response =
            await axios.post(
                `${this.baseUrl}/goid/login/request`,
                payload,
                {
                    headers:
                        this.headers()
                }
            );

        return response.data;
    }

    async requestOtpEmail(email) {
        const payload = {
            email:
                email,

            client_id:
                this.clientId
        };

        const response =
            await axios.post(
                `${this.baseUrl}/goid/login/request`,
                payload,
                {
                    headers:
                        this.headers()
                }
            );

        return response.data;
    }

    async verifyOtp(
        otp,
        otpToken
    ) {
        const payload = {
            client_id:
                this.clientId,

            data: {
                otp:
                    otp,

                otp_token:
                    otpToken
            },

            grant_type:
                'otp'
        };

        const response =
            await axios.post(
                `${this.baseUrl}/goid/token`,
                payload,
                {
                    headers:
                        this.headers()
                }
            );

        return response.data;
    }

    async refreshToken(
        refreshToken
    ) {
        const payload = {
            client_id:
                this.clientId,

            grant_type:
                'refresh_token',

            data: {
                refresh_token:
                    refreshToken
            }
        };

        const response =
            await axios.post(
                `${this.baseUrl}/goid/token`,
                payload,
                {
                    headers:
                        this.headers()
                }
            );

        return response.data;
    }

    async getMe(
        accessToken
    ) {
        const response =
            await axios.get(
                `${this.baseUrl}/v1/users/me`,
                {
                    headers:
                        this.headers(
                            accessToken
                        )
                }
            );

        return response.data;
    }

    async getJournals(
        accessToken,
        merchantId,
        startTime = null
    ) {
        const dateTo =
            new Date().toISOString();

        const dateFrom =
            startTime ||
            new Date(
                Date.now() -
                30 *
                24 *
                60 *
                60 *
                1000
            ).toISOString();

        const payload = {
            from:
                0,

            size:
                50,

            sort: {
                time: {
                    order:
                        'desc'
                }
            },

            included_categories: {
                incoming: [
                    'transaction_share',
                    'action'
                ]
            },

            query: [
                {
                    clauses: [
                        {
                            field:
                                'metadata.transaction.status',

                            op:
                                'in',

                            value: [
                                'settlement',
                                'capture'
                            ]
                        },

                        {
                            field:
                                'metadata.transaction.transaction_time',

                            op:
                                'gte',

                            value:
                                dateFrom
                        },

                        {
                            field:
                                'metadata.transaction.transaction_time',

                            op:
                                'lte',

                            value:
                                dateTo
                        },

                        {
                            field:
                                'metadata.transaction.merchant_id',

                            op:
                                'equal',

                            value:
                                merchantId
                        }
                    ],

                    op:
                        'and'
                }
            ]
        };

        const response =
            await axios.post(
                `${this.baseUrl}/journals/search`,
                payload,
                {
                    headers: {
                        ...this.headers(
                            accessToken
                        ),

                        'accept':
                            'application/vnd.journal.v1+json'
                    }
                }
            );

        return response.data;
    }
}


/*
|--------------------------------------------------------------------------
| COMPATIBILITY HELPERS
|--------------------------------------------------------------------------
|
| server.js lama kamu tidak mengirim:
|
|   ?apikey=...
|
| melainkan:
|
|   x-api-key: ...
|
| API GoMerchant lama menggunakan:
|
|   apikey
|
| Jadi kedua format diterima.
|
|--------------------------------------------------------------------------
*/

function getApiKey(req) {
    const queryApiKey =
        req.query?.apikey;

    const headerApiKey =
        req.headers?.['x-api-key'];

    const headerApiKeyAlt =
        req.headers?.['X-API-Key'];

    return (
        queryApiKey ||
        headerApiKey ||
        headerApiKeyAlt ||
        ''
    ).trim();
}


function validateApiKey(req) {
    const apiKey =
        getApiKey(req);

    if (
        !apiKey ||
        !Array.isArray(
            global.apikey
        ) ||
        !global.apikey.includes(
            apiKey
        )
    ) {
        return false;
    }

    return true;
}


/*
|--------------------------------------------------------------------------
| NORMALIZE TOKEN RESPONSE
|--------------------------------------------------------------------------
*/

function normalizeTokenResult(result) {
    if (!result) {
        return {};
    }

    /*
     * Beberapa response GoID
     * langsung berupa:
     *
     * {
     *   access_token,
     *   refresh_token
     * }
     */

    if (
        result.access_token ||
        result.refresh_token
    ) {
        return {
            access_token:
                result.access_token,

            refresh_token:
                result.refresh_token,

            token_type:
                result.token_type,

            expires_in:
                result.expires_in
        };
    }

    /*
     * Kalau response mempunyai
     * data di dalamnya.
     */

    if (
        result.data &&
        typeof result.data ===
            'object'
    ) {
        return {
            access_token:
                result.data.access_token,

            refresh_token:
                result.data.refresh_token,

            token_type:
                result.data.token_type,

            expires_in:
                result.data.expires_in
        };
    }

    return result;
}


/*
|--------------------------------------------------------------------------
| ENDPOINT ROUTES
|--------------------------------------------------------------------------
*/

module.exports = [

    /*
    |--------------------------------------------------------------------------
    | REQUEST OTP
    |--------------------------------------------------------------------------
    */

    {
        name:
            "Request OTP (Tahap 1)",

        desc:
            "Mengirim OTP ke email atau nomor HP GoPay Merchant",

        category:
            "Gopay Merchant",

        parameters: {
            apikey: {
                type:
                    "string"
            },

            email: {
                type:
                    "string",

                required:
                    false
            },

            phone: {
                type:
                    "string",

                required:
                    false
            }
        },

        path:
            "/gomerch/getotp",

        async run(
            req,
            res
        ) {
            if (
                !validateApiKey(req)
            ) {
                return res.json({
                    status:
                        false,

                    error:
                        "Apikey invalid"
                });
            }

            const {
                email,
                phone
            } = req.query;

            if (
                !email &&
                !phone
            ) {
                return res.json({
                    status:
                        false,

                    error:
                        "Email or phone is required"
                });
            }

            try {
                const gopay =
                    new GoMerchant();

                let result;

                if (email) {
                    result =
                        await gopay
                            .requestOtpEmail(
                                email
                            );
                } else {
                    let phoneNumber =
                        phone;

                    if (
                        phoneNumber.startsWith(
                            "62"
                        )
                    ) {
                        phoneNumber =
                            phoneNumber.slice(
                                2
                            );
                    }

                    result =
                        await gopay
                            .requestOtp(
                                phoneNumber
                            );
                }

                return res
                    .status(200)
                    .json({
                        status:
                            true,

                        result
                    });

            } catch (err) {
                console.error(
                    'GoPay Request OTP:',
                    err.response?.data ||
                    err.message
                );

                return res
                    .status(500)
                    .json({
                        status:
                            false,

                        error:
                            err.response?.data
                                ?.error ||
                            err.message
                    });
            }
        }
    },


    /*
    |--------------------------------------------------------------------------
    | VERIFY OTP
    |--------------------------------------------------------------------------
    */

    {
        name:
            "Verify OTP (Tahap 2)",

        desc:
            "Verifikasi OTP dan dapatkan token akses",

        category:
            "Gopay Merchant",

        parameters: {
            apikey: {
                type:
                    "string"
            },

            otp: {
                type:
                    "string"
            },

            otp_token: {
                type:
                    "string"
            }
        },

        path:
            "/gomerch/gettoken",

        async run(
            req,
            res
        ) {
            if (
                !validateApiKey(req)
            ) {
                return res.json({
                    status:
                        false,

                    error:
                        "Apikey invalid"
                });
            }

            const {
                otp,
                otp_token
            } = req.query;

            if (
                !otp ||
                !otp_token
            ) {
                return res.json({
                    status:
                        false,

                    error:
                        "OTP and OTP token are required"
                });
            }

            try {
                const gopay =
                    new GoMerchant();

                const result =
                    await gopay
                        .verifyOtp(
                            otp,
                            otp_token
                        );

                return res
                    .status(200)
                    .json({
                        status:
                            true,

                        result
                    });

            } catch (err) {
                console.error(
                    'GoPay Verify OTP:',
                    err.response?.data ||
                    err.message
                );

                return res
                    .status(500)
                    .json({
                        status:
                            false,

                        error:
                            err.response?.data
                                ?.error ||
                            err.message
                    });
            }
        }
    },


    /*
    |--------------------------------------------------------------------------
    | REFRESH TOKEN - ORIGINAL
    |--------------------------------------------------------------------------
    */

    {
        name:
            "Refresh Token",

        desc:
            "Memperbarui token akses menggunakan refresh token",

        category:
            "Gopay Merchant",

        parameters: {
            apikey: {
                type:
                    "string"
            },

            refresh_token: {
                type:
                    "string"
            }
        },

        path:
            "/gomerch/refreshtoken",

        async run(
            req,
            res
        ) {
            if (
                !validateApiKey(req)
            ) {
                return res.json({
                    status:
                        false,

                    error:
                        "Apikey invalid"
                });
            }

            const {
                refresh_token
            } = req.query;

            if (
                !refresh_token
            ) {
                return res.json({
                    status:
                        false,

                    error:
                        "Refresh token is required"
                });
            }

            try {
                const gopay =
                    new GoMerchant();

                const result =
                    await gopay
                        .refreshToken(
                            refresh_token
                        );

                return res
                    .status(200)
                    .json({
                        status:
                            true,

                        result
                    });

            } catch (err) {
                console.error(
                    'GoPay Refresh Token:',
                    err.response?.data ||
                    err.message
                );

                return res
                    .status(500)
                    .json({
                        status:
                            false,

                        error:
                            err.response?.data
                                ?.error ||
                            err.message
                    });
            }
        }
    },


    /*
    |--------------------------------------------------------------------------
    | MUTASI - ORIGINAL
    |--------------------------------------------------------------------------
    */

    {
        name:
            "Mutasi Transaksi",

        desc:
            "Melihat riwayat transaksi QRIS",

        category:
            "Gopay Merchant",

        parameters: {
            apikey: {
                type:
                    "string"
            },

            token: {
                type:
                    "string"
            },

            start_time: {
                type:
                    "string",

                required:
                    false
            }
        },

        path:
            "/gomerch/mutasi",

        async run(
            req,
            res
        ) {
            if (
                !validateApiKey(req)
            ) {
                return res.json({
                    status:
                        false,

                    error:
                        "Apikey invalid"
                });
            }

            const {
                token,
                start_time
            } = req.query;

            if (!token) {
                return res.json({
                    status:
                        false,

                    error:
                        "Access token is required"
                });
            }

            try {
                const gopay =
                    new GoMerchant();

                const user =
                    await gopay
                        .getMe(
                            token
                        );

                const merchantId =
                    user?.user
                        ?.merchant_id;

                if (!merchantId) {
                    throw new Error(
                        "merchant_id tidak ditemukan"
                    );
                }

                const defaultStartTime =
                    new Date(
                        Date.now() -
                        (
                            7 *
                            24 *
                            60 *
                            60 *
                            1000
                        )
                    ).toISOString();

                const journals =
                    await gopay
                        .getJournals(
                            token,
                            merchantId,
                            start_time ||
                                defaultStartTime
                        );

                const data =
                    (journals?.hits || [])
                        .filter(
                            item =>
                                item
                                    ?.metadata
                                    ?.transaction
                                    ?.payment_type ===
                                'qris'
                        )
                        .map(
                            item => {
                                const aspi =
                                    item
                                        ?.metadata
                                        ?.provider_metadata
                                        ?.aspi;

                                return {
                                    id:
                                        item.id,

                                    reference_id:
                                        item.reference_id,

                                    status:
                                        item.status,

                                    time:
                                        item.time,

                                    amount:
                                        Number(
                                            aspi
                                                ?.data
                                                ?.amount ||
                                            0
                                        ),

                                    issuer:
                                        aspi
                                            ?.issuer ||
                                        null,

                                    acquirer:
                                        aspi
                                            ?.acquirer ||
                                        null,

                                    merchant_name:
                                        aspi
                                            ?.data
                                            ?.merchant_name ||
                                        null,

                                    merchant_id:
                                        aspi
                                            ?.data
                                            ?.merchant_id ||
                                        null,

                                    merchant_city:
                                        aspi
                                            ?.data
                                            ?.merchant_city ||
                                        null,

                                    terminal_label:
                                        aspi
                                            ?.data
                                            ?.additional_data
                                            ?.terminal_label ||
                                        null
                                };
                            }
                        );

                return res
                    .status(200)
                    .json({
                        status:
                            true,

                        total:
                            data.length,

                        data
                    });

            } catch (err) {
                console.error(
                    'GoPay Mutasi:',
                    err.response?.data ||
                    err.message
                );

                return res
                    .status(500)
                    .json({
                        status:
                            false,

                        error:
                            err.response?.data
                                ?.error ||
                            err.message
                    });
            }
        }
    },


    /*
    |--------------------------------------------------------------------------
    | CREATE PAYMENT - ORIGINAL
    |--------------------------------------------------------------------------
    */

    {
        name:
            "Buat QRIS Dinamis",

        desc:
            "Membuat kode QR pembayaran dinamis",

        category:
            "Gopay Merchant",

        parameters: {
            apikey: {
                type:
                    "string"
            },

            amount: {
                type:
                    "string"
            },

            static_qr: {
                type:
                    "string"
            }
        },

        path:
            "/gomerch/createpayment",

        async run(
            req,
            res
        ) {
            if (
                !validateApiKey(req)
            ) {
                return res.json({
                    status:
                        false,

                    error:
                        "Apikey invalid"
                });
            }

            const {
                amount,
                static_qr
            } = req.query;

            if (
                !amount ||
                !static_qr
            ) {
                return res.json({
                    status:
                        false,

                    error:
                        "Amount and static QR string are required"
                });
            }

            try {
                const gopay =
                    new GoMerchant();

                const result =
                    await gopay
                        .createDynamicQRIS(
                            amount,
                            static_qr
                        );

                return res
                    .status(200)
                    .json({
                        status:
                            true,

                        result
                    });

            } catch (err) {
                console.error(
                    'GoPay Create Payment:',
                    err.response?.data ||
                    err.message
                );

                return res
                    .status(500)
                    .json({
                        status:
                            false,

                        error:
                            err.response?.data
                                ?.error ||
                            err.message
                    });
            }
        }
    },


    /*
    |--------------------------------------------------------------------------
    | COMPATIBILITY:
    | /auth/refresh/token
    |
    | FORMAT YANG DIMINTA SERVER.JS LAMA
    |--------------------------------------------------------------------------
    */

    {
        name:
            "Refresh Token Compatibility",

        desc:
            "Compatibility endpoint untuk server.js lama",

        category:
            "Gopay Merchant Compatibility",

        parameters: {
            refresh_token: {
                type:
                    "string"
            }
        },

        path:
            "/auth/refresh/token",

        async run(
            req,
            res
        ) {
            /*
             * server.js lama:
             *
             * GET /auth/refresh/token
             * Header:
             * x-api-key
             *
             * Query:
             * refresh_token
             */

            if (
                !validateApiKey(req)
            ) {
                return res.json({
                    success:
                        false,

                    error:
                        "Apikey invalid"
                });
            }

            const {
                refresh_token
            } = req.query;

            if (
                !refresh_token
            ) {
                return res.json({
                    success:
                        false,

                    error:
                        "Refresh token is required"
                });
            }

            try {
                const gopay =
                    new GoMerchant();

                const rawResult =
                    await gopay
                        .refreshToken(
                            refresh_token
                        );

                const result =
                    normalizeTokenResult(
                        rawResult
                    );

                if (
                    !result.access_token
                ) {
                    return res
                        .status(500)
                        .json({
                            success:
                                false,

                            error:
                                "Access token tidak ditemukan pada response GoPay"
                        });
                }

                return res
                    .status(200)
                    .json({
                        success:
                            true,

                        data: {
                            access_token:
                                result.access_token,

                            refresh_token:
                                result.refresh_token ||
                                refresh_token,

                            token_type:
                                result.token_type,

                            expires_in:
                                result.expires_in
                        }
                    });

            } catch (err) {
                console.error(
                    'Compatibility Refresh Token:',
                    err.response?.data ||
                    err.message
                );

                return res
                    .status(
                        err.response?.status >= 400 &&
                        err.response?.status < 600
                            ? err.response.status
                            : 500
                    )
                    .json({
                        success:
                            false,

                        error:
                            err.response?.data
                                ?.error ||
                            err.message ||
                            "Gagal refresh token"
                    });
            }
        }
    },


    /*
    |--------------------------------------------------------------------------
    | COMPATIBILITY:
    | /api/qris/create
    |
    | FORMAT YANG DIMINTA SERVER.JS LAMA
    |--------------------------------------------------------------------------
    */

    {
        name:
            "Create QRIS Compatibility",

        desc:
            "Compatibility endpoint untuk server.js lama",

        category:
            "Gopay Merchant Compatibility",

        parameters: {
            amount: {
                type:
                    "string"
            },

            static_qr: {
                type:
                    "string"
            }
        },

        path:
            "/api/qris/create",

        async run(
            req,
            res
        ) {
            /*
             * server.js lama mengirim:
             *
             * ?amount=10000
             * &static_qr=...
             *
             * dan x-api-key.
             *
             * gopayToken memang diwajibkan
             * oleh server.js lama, tetapi
             * endpoint createpayment Relz
             * tidak membutuhkan access token.
             */

            if (
                !validateApiKey(req)
            ) {
                return res.json({
                    success:
                        false,

                    error:
                        "Apikey invalid"
                });
            }

            const {
                amount,
                static_qr
            } = req.query;

            if (
                !amount ||
                !static_qr
            ) {
                return res.json({
                    success:
                        false,

                    error:
                        "Amount and static QR string are required"
                });
            }

            try {
                const numericAmount =
                    Number(amount);

                if (
                    !Number.isFinite(
                        numericAmount
                    ) ||
                    numericAmount <= 0
                ) {
                    return res.json({
                        success:
                            false,

                        error:
                            "Amount tidak valid"
                    });
                }

                const gopay =
                    new GoMerchant();

                const result =
                    await gopay
                        .createDynamicQRIS(
                            numericAmount,
                            static_qr
                        );

                /*
                 * server.js lama mengharapkan:
                 *
                 * data.success
                 * data.image_url
                 */

                const imageUrl =
                    result.qr_buffer
                        ? `data:image/png;base64,${result.qr_buffer}`
                        : null;

                if (!imageUrl) {
                    return res
                        .status(500)
                        .json({
                            success:
                                false,

                            error:
                                "QR image gagal dibuat"
                        });
                }

                return res
                    .status(200)
                    .json({
                        success:
                            true,

                        image_url:
                            imageUrl,

                        data: {
                            qr_buffer:
                                result.qr_buffer,

                            qr_string:
                                result.qr_string,

                            amount:
                                result.amount,

                            created_at:
                                result.created_at
                        }
                    });

            } catch (err) {
                console.error(
                    'Compatibility Create QRIS:',
                    err.response?.data ||
                    err.message
                );

                return res
                    .status(500)
                    .json({
                        success:
                            false,

                        error:
                            err.response?.data
                                ?.error ||
                            err.message ||
                            "Gagal membuat QRIS"
                    });
            }
        }
    },


    /*
    |--------------------------------------------------------------------------
    | COMPATIBILITY:
    | /api/history
    |
    | FORMAT YANG DIMINTA SERVER.JS LAMA
    |--------------------------------------------------------------------------
    */

    {
        name:
            "History Compatibility",

        desc:
            "Compatibility endpoint untuk server.js lama",

        category:
            "Gopay Merchant Compatibility",

        parameters: {
            token: {
                type:
                    "string"
            }
        },

        path:
            "/api/history",

        async run(
            req,
            res
        ) {
            /*
             * server.js lama:
             *
             * GET /api/history?token=...
             *
             * Header:
             * x-api-key
             */

            if (
                !validateApiKey(req)
            ) {
                return res.json({
                    success:
                        false,

                    error:
                        "Apikey invalid"
                });
            }

            const {
                token
            } = req.query;

            if (!token) {
                return res.json({
                    success:
                        false,

                    error:
                        "Access token is required"
                });
            }

            try {
                const gopay =
                    new GoMerchant();

                /*
                 * Ambil merchant ID
                 * dari access token.
                 */

                const user =
                    await gopay
                        .getMe(
                            token
                        );

                const merchantId =
                    user?.user
                        ?.merchant_id;

                if (!merchantId) {
                    throw new Error(
                        "merchant_id tidak ditemukan"
                    );
                }

                /*
                 * server.js lama tidak
                 * mengirim start_time.
                 *
                 * Gunakan 7 hari terakhir.
                 */

                const startTime =
                    new Date(
                        Date.now() -
                        (
                            7 *
                            24 *
                            60 *
                            60 *
                            1000
                        )
                    ).toISOString();

                const journals =
                    await gopay
                        .getJournals(
                            token,
                            merchantId,
                            startTime
                        );

                const data =
                    (journals?.hits || [])
                        .filter(
                            item => {
                                return (
                                    item
                                        ?.metadata
                                        ?.transaction
                                        ?.payment_type ===
                                    'qris'
                                );
                            }
                        )
                        .map(
                            item => {
                                const aspi =
                                    item
                                        ?.metadata
                                        ?.provider_metadata
                                        ?.aspi;

                                /*
                                 * server.js lama
                                 * membutuhkan:
                                 *
                                 * id
                                 * status
                                 * amount
                                 * time
                                 */

                                return {
                                    id:
                                        item.id,

                                    reference_id:
                                        item.reference_id,

                                    status:
                                        item.status,

                                    time:
                                        item.time,

                                    amount:
                                        Number(
                                            aspi
                                                ?.data
                                                ?.amount ||
                                            item
                                                ?.metadata
                                                ?.transaction
                                                ?.amount ||
                                            0
                                        ),

                                    issuer:
                                        aspi
                                            ?.issuer ||
                                        null,

                                    acquirer:
                                        aspi
                                            ?.acquirer ||
                                        null,

                                    merchant_name:
                                        aspi
                                            ?.data
                                            ?.merchant_name ||
                                        null,

                                    merchant_id:
                                        aspi
                                            ?.data
                                            ?.merchant_id ||
                                        null,

                                    merchant_city:
                                        aspi
                                            ?.data
                                            ?.merchant_city ||
                                        null,

                                    terminal_label:
                                        aspi
                                            ?.data
                                            ?.additional_data
                                            ?.terminal_label ||
                                        null
                                };
                            }
                        );

                return res
                    .status(200)
                    .json({
                        success:
                            true,

                        total:
                            data.length,

                        data
                    });

            } catch (err) {
                console.error(
                    'Compatibility History:',
                    err.response?.data ||
                    err.message
                );

                const errorMessage =
                    err.response?.data
                        ?.error ||
                    err.message ||
                    "Gagal mengambil mutasi GoPay";

                /*
                 * Kalau token sudah expired,
                 * kembalikan HTTP 401 supaya
                 * callGopayApiWithRetry()
                 * di server.js lama bisa
                 * menjalankan refresh token.
                 */

                const isTokenError =
                    /expired token/i.test(
                        errorMessage
                    ) ||
                    /invalid token/i.test(
                        errorMessage
                    ) ||
                    /unauthorized/i.test(
                        errorMessage
                    );

                return res
                    .status(
                        isTokenError
                            ? 401
                            : 500
                    )
                    .json({
                        success:
                            false,

                        error:
                            errorMessage
                    });
            }
        }
    }

];