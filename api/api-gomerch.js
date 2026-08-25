const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const QRCode = require("qrcode");

/*
 * GoMerchant API
 *
 * Flow legacy/internal yang dipakai source asli:
 *
 * Tahap 1:
 *   /goid/login/request
 *
 * Tahap 2:
 *   /goid/token
 *
 * CATATAN:
 * Endpoint /goid/* bukan API publik GoBiz yang didokumentasikan.
 * Jadi kode ini mempertahankan kompatibilitas dengan source lama,
 * tetapi tidak menjamin endpoint internal tersebut selalu aktif.
 *
 * Perbaikan utama:
 * 1. unique_id Tahap 1 -> Tahap 2 dipertahankan.
 * 2. Error upstream GoBiz ditampilkan.
 * 3. Timeout request.
 * 4. Validasi input.
 * 5. Tidak mencetak OTP/token ke console.
 */

const BASE_URL =
    process.env.GOBIZ_BASE_URL || "https://api.gobiz.co.id";

const CLIENT_ID =
    process.env.GOBIZ_CLIENT_ID || "go-biz-web-new";

const APP_ID =
    process.env.GOBIZ_APP_ID || "go-biz-web-dashboard";

const APP_VERSION =
    process.env.GOBIZ_APP_VERSION ||
    "platform-v3.101.0-8918927d";

const TIMEOUT =
    Number(process.env.GOBIZ_TIMEOUT_MS || 30000);


/* =========================================================
 * HELPER
 * ======================================================= */

function getApiKeys() {
    if (!Array.isArray(global.apikey)) {
        return [];
    }

    return global.apikey.map(String);
}

function checkApiKey(apikey) {
    if (!apikey) {
        return false;
    }

    return getApiKeys().includes(String(apikey));
}

function required(value, name) {
    const result = String(value || "").trim();

    if (!result) {
        throw new Error(`${name} wajib diisi`);
    }

    return result;
}

function normalizePhone(phone) {
    let value = String(phone || "")
        .trim()
        .replace(/[^\d+]/g, "");

    if (value.startsWith("+62")) {
        value = value.slice(3);
    } else if (value.startsWith("62")) {
        value = value.slice(2);
    } else if (value.startsWith("0")) {
        value = value.slice(1);
    }

    if (!/^\d{8,15}$/.test(value)) {
        throw new Error("Nomor HP tidak valid");
    }

    return value;
}

function normalizeOtp(otp) {
    const value = String(otp || "").trim();

    if (!/^\d{4,8}$/.test(value)) {
        throw new Error("OTP harus berupa 4-8 digit");
    }

    return value;
}


/*
 * Mengambil informasi error dari Axios.
 *
 * Ini penting karena source lama hanya mengembalikan:
 *
 *     Error: HTTP 500
 *
 * sehingga kita tidak tahu GoBiz sebenarnya membalas apa.
 */
function getUpstreamError(error) {
    return {
        message: error?.message || "Request gagal",

        upstream_status:
            error?.response?.status ?? null,

        upstream_status_text:
            error?.response?.statusText ?? null,

        upstream_data:
            error?.response?.data ?? null,

        request_id:
            error?.response?.headers?.["x-request-id"] ||
            error?.response?.headers?.["x-correlation-id"] ||
            null
    };
}


/*
 * Response error untuk API kita.
 *
 * Sengaja tidak menampilkan Authorization/token/API key.
 */
function sendError(res, error, defaultStatus = 500) {
    const info = getUpstreamError(error);

    let status = defaultStatus;

    if (
        Number.isInteger(info.upstream_status) &&
        info.upstream_status >= 400 &&
        info.upstream_status < 600
    ) {
        status = info.upstream_status;
    }

    return res.status(status).json({
        status: false,
        error: info.message,

        upstream_status:
            info.upstream_status,

        upstream_status_text:
            info.upstream_status_text,

        upstream_error:
            info.upstream_data,

        request_id:
            info.request_id
    });
}


/* =========================================================
 * GO MERCHANT CLASS
 * ======================================================= */

class GoMerchant {

    constructor(uniqueId = null) {

        /*
         * PENTING:
         *
         * Kalau uniqueId diberikan dari Tahap 1,
         * Tahap 2 menggunakan UUID yang sama.
         *
         * Source lama selalu membuat UUID baru.
         */
        this.uniqueId = uniqueId || uuidv4();

        this.baseUrl = BASE_URL;
        this.clientId = CLIENT_ID;
        this.appId = APP_ID;
    }


    /* =====================================================
     * HEADERS
     * =================================================== */

    headers(accessToken = null, extraHeaders = {}) {

        const headers = {

            "Accept":
                "application/json, text/plain, */*",

            "Authentication-Type":
                "go-id",

            "X-PhoneMake":
                process.env.GOBIZ_PHONE_MAKE || "Android",

            "X-PhoneModel":
                process.env.GOBIZ_PHONE_MODEL || "K",

            "x-DeviceOS":
                "Web",

            "X-Platform":
                "Web",

            "X-User-Type":
                "merchant",

            "x-appId":
                this.appId,

            "x-uniqueid":
                this.uniqueId,

            "X-AppVersion":
                APP_VERSION,

            "Gojek-Country-Code":
                "ID",

            "Gojek-Timezone":
                "Asia/Jakarta",

            "Content-Type":
                "application/json",

            "User-Agent":
                process.env.GOBIZ_USER_AGENT ||
                "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/146.0.0.0 Mobile Safari/537.36",

            ...extraHeaders
        };

        if (accessToken) {
            headers.Authorization =
                `Bearer ${accessToken}`;
        }

        return headers;
    }


    /* =====================================================
     * AXIOS POST
     * =================================================== */

    async post(path, payload, options = {}) {

        try {

            const response = await axios.post(
                `${this.baseUrl}${path}`,
                payload,
                {
                    timeout: TIMEOUT,

                    /*
                     * Kita handle status sendiri supaya
                     * response asli dari GoBiz bisa dibaca.
                     */
                    validateStatus: () => true,

                    ...options
                }
            );

            if (
                response.status < 200 ||
                response.status >= 300
            ) {

                const error =
                    new Error(
                        `GoBiz returned HTTP ${response.status}`
                    );

                error.response = response;

                throw error;
            }

            return response;

        } catch (error) {

            throw error;
        }
    }


    /* =====================================================
     * AXIOS GET
     * =================================================== */

    async get(path, options = {}) {

        try {

            const response = await axios.get(
                `${this.baseUrl}${path}`,
                {
                    timeout: TIMEOUT,

                    validateStatus: () => true,

                    ...options
                }
            );

            if (
                response.status < 200 ||
                response.status >= 300
            ) {

                const error =
                    new Error(
                        `GoBiz returned HTTP ${response.status}`
                    );

                error.response = response;

                throw error;
            }

            return response;

        } catch (error) {

            throw error;
        }
    }


    /* =====================================================
     * TAHAP 1
     * REQUEST OTP VIA PHONE
     * =================================================== */

    async requestOtp(phoneNumber) {

        const phone =
            normalizePhone(phoneNumber);

        const payload = {

            client_id:
                this.clientId,

            phone_number:
                phone,

            country_code:
                "62"
        };

        const response =
            await this.post(
                "/goid/login/request",
                payload,
                {
                    headers:
                        this.headers()
                }
            );

        return response.data;
    }


    /* =====================================================
     * TAHAP 1
     * REQUEST OTP VIA EMAIL
     * =================================================== */

    async requestOtpEmail(email) {

        const emailValue =
            required(email, "Email");

        const payload = {

            email:
                emailValue,

            client_id:
                this.clientId
        };

        const response =
            await this.post(
                "/goid/login/request",
                payload,
                {
                    headers:
                        this.headers()
                }
            );

        return response.data;
    }


    /* =====================================================
     * TAHAP 2
     * VERIFY OTP
     * =================================================== */

    async verifyOtp(otp, otpToken) {

        const otpValue =
            normalizeOtp(otp);

        const tokenValue =
            required(
                otpToken,
                "otp_token"
            );

        const payload = {

            client_id:
                this.clientId,

            data: {

                otp:
                    otpValue,

                otp_token:
                    tokenValue
            },

            grant_type:
                "otp"
        };

        const response =
            await this.post(
                "/goid/token",
                payload,
                {
                    headers:
                        this.headers()
                }
            );

        return response.data;
    }


    /* =====================================================
     * REFRESH TOKEN LEGACY
     * =================================================== */

    async refreshToken(refreshToken) {

        const refresh =
            required(
                refreshToken,
                "refresh_token"
            );

        const payload = {

            client_id:
                this.clientId,

            grant_type:
                "refresh_token",

            data: {

                refresh_token:
                    refresh
            }
        };

        const response =
            await this.post(
                "/goid/token",
                payload,
                {
                    headers:
                        this.headers()
                }
            );

        return response.data;
    }


    /* =====================================================
     * GET PROFILE
     * =================================================== */

    async getMe(accessToken) {

        const token =
            required(
                accessToken,
                "access_token"
            );

        const response =
            await this.get(
                "/v1/users/me",
                {
                    headers:
                        this.headers(token)
                }
            );

        return response.data;
    }


    /* =====================================================
     * JOURNALS / MUTASI
     * =================================================== */

    async getJournals(
        accessToken,
        merchantId,
        startTime = null
    ) {

        const token =
            required(
                accessToken,
                "access_token"
            );

        const merchant =
            required(
                merchantId,
                "merchant_id"
            );

        const dateTo =
            new Date().toISOString();

        const dateFrom =
            startTime ||
            new Date(
                Date.now() -
                7 * 24 * 60 * 60 * 1000
            ).toISOString();


        const payload = {

            from:
                0,

            size:
                50,

            sort: {

                time: {

                    order:
                        "desc"
                }
            },

            included_categories: {

                incoming: [
                    "transaction_share",
                    "action"
                ]
            },

            query: [

                {

                    clauses: [

                        {
                            field:
                                "metadata.transaction.status",

                            op:
                                "in",

                            value: [
                                "settlement",
                                "capture"
                            ]
                        },

                        {
                            field:
                                "metadata.transaction.transaction_time",

                            op:
                                "gte",

                            value:
                                dateFrom
                        },

                        {
                            field:
                                "metadata.transaction.transaction_time",

                            op:
                                "lte",

                            value:
                                dateTo
                        },

                        {
                            field:
                                "metadata.transaction.merchant_id",

                            op:
                                "equal",

                            value:
                                merchant
                        }
                    ],

                    op:
                        "and"
                }
            ]
        };


        const response =
            await this.post(
                "/journals/search",
                payload,
                {
                    headers: {

                        ...this.headers(token),

                        "accept":
                            "application/vnd.journal.v1+json"
                    }
                }
            );

        return response.data;
    }


    /* =====================================================
     * QRIS CRC16
     * =================================================== */

    convertCRC16(str) {

        let crc =
            0xFFFF;

        for (
            let c = 0;
            c < str.length;
            c++
        ) {

            crc ^=
                str.charCodeAt(c) << 8;

            for (
                let i = 0;
                i < 8;
                i++
            ) {

                if (
                    crc & 0x8000
                ) {

                    crc =
                        (crc << 1) ^
                        0x1021;

                } else {

                    crc =
                        crc << 1;
                }

                crc &=
                    0xFFFF;
            }
        }

        return (
            "0000" +
            (crc & 0xFFFF)
                .toString(16)
                .toUpperCase()
        ).slice(-4);
    }


    /* =====================================================
     * CREATE DYNAMIC QRIS
     * =================================================== */

    async createDynamicQRIS(
        amount,
        staticQr
    ) {

        const numericAmount =
            Number(amount);

        if (
            !Number.isFinite(
                numericAmount
            ) ||
            numericAmount <= 0
        ) {

            throw new Error(
                "Amount tidak valid"
            );
        }

        const qr =
            String(staticQr || "")
                .trim();

        if (!qr) {

            throw new Error(
                "Static QRIS wajib diisi"
            );
        }


        /*
         * QRIS harus memiliki CRC16
         */
        if (qr.length < 8) {

            throw new Error(
                "Static QRIS tidak valid"
            );
        }


        /*
         * Hilangkan CRC lama.
         */
        let qrisData =
            qr.slice(0, -4);


        /*
         * Static -> Dynamic
         */
        if (
            !qrisData.includes(
                "010211"
            )
        ) {

            throw new Error(
                "Static QRIS tidak memiliki format payload yang didukung"
            );
        }

        qrisData =
            qrisData.replace(
                "010211",
                "010212"
            );


        /*
         * Cari country code.
         *
         * Source lama menggunakan:
         * 5802ID
         */
        const countryIndex =
            qrisData.indexOf("5802ID");

        if (countryIndex === -1) {

            throw new Error(
                "Field country code QRIS (5802ID) tidak ditemukan"
            );
        }


        const beforeCountry =
            qrisData.slice(
                0,
                countryIndex
            );

        const afterCountry =
            qrisData.slice(
                countryIndex
            );


        const amountText =
            String(
                Math.trunc(
                    numericAmount
                )
            );


        if (
            amountText.length > 13
        ) {

            throw new Error(
                "Amount terlalu besar untuk field QRIS"
            );
        }


        const amountField =
            "54" +
            String(
                amountText.length
            ).padStart(2, "0") +
            amountText;


        const payloadWithoutCRC =
            beforeCountry +
            amountField +
            afterCountry;


        const crc =
            this.convertCRC16(
                payloadWithoutCRC
            );


        const dynamicQr =
            payloadWithoutCRC +
            crc;


        const qrBuffer =
            await QRCode.toBuffer(
                dynamicQr,
                {
                    type:
                        "png",

                    width:
                        800,

                    margin:
                        2
                }
            );


        return {

            qr_buffer:
                qrBuffer.toString(
                    "base64"
                ),

            qr_string:
                dynamicQr,

            amount:
                numericAmount,

            created_at:
                new Date().toISOString()
        };
    }
}


/* =========================================================
 * ROUTE HELPER
 * ======================================================= */

function authOrFail(req, res) {

    const apikey =
        req.query?.apikey;

    if (
        !apikey ||
        !checkApiKey(apikey)
    ) {

        res.status(401).json({

            status:
                false,

            error:
                "Apikey invalid"
        });

        return false;
    }

    return true;
}


/* =========================================================
 * ROUTES
 * ======================================================= */

module.exports = [

    /* =====================================================
     * TAHAP 1
     * =================================================== */

    {

        name:
            "Request OTP (Tahap 1)",

        desc:
            "Mengirim OTP ke email atau nomor HP GoPay Merchant",

        category:
            "Gopay Merchant",

        parameters: {

            apikey:
                {
                    type:
                        "string"
                },

            email:
                {
                    type:
                        "string",
                    required:
                        false
                },

            phone:
                {
                    type:
                        "string",
                    required:
                        false
                }
        },

        path:
            "/gomerch/getotp",


        async run(req, res) {

            if (
                !authOrFail(
                    req,
                    res
                )
            ) {
                return;
            }


            const {
                email,
                phone
            } = req.query;


            if (
                !email &&
                !phone
            ) {

                return res.status(400).json({

                    status:
                        false,

                    error:
                        "Email or phone is required"
                });
            }


            try {

                /*
                 * UUID dibuat SEKALI.
                 *
                 * unique_id ini wajib disimpan
                 * client untuk Tahap 2.
                 */
                const gopay =
                    new GoMerchant();


                let result;


                if (email) {

                    result =
                        await gopay.requestOtpEmail(
                            email
                        );

                } else {

                    result =
                        await gopay.requestOtp(
                            phone
                        );
                }


                return res.status(200).json({

                    status:
                        true,

                    unique_id:
                        gopay.uniqueId,

                    result
                });


            } catch (err) {

                return sendError(
                    res,
                    err
                );
            }
        }
    },


    /* =====================================================
     * TAHAP 2
     * =================================================== */

    {

        name:
            "Verify OTP (Tahap 2)",

        desc:
            "Verifikasi OTP dan mendapatkan token akses",

        category:
            "Gopay Merchant",

        parameters: {

            apikey:
                {
                    type:
                        "string"
                },

            otp:
                {
                    type:
                        "string"
                },

            otp_token:
                {
                    type:
                        "string"
                },

            unique_id:
                {
                    type:
                        "string",
                    required:
                        true
                }
        },

        path:
            "/gomerch/gettoken",


        async run(req, res) {

            if (
                !authOrFail(
                    req,
                    res
                )
            ) {
                return;
            }


            const {
                otp,
                otp_token,
                unique_id
            } = req.query;


            if (
                !otp ||
                !otp_token
            ) {

                return res.status(400).json({

                    status:
                        false,

                    error:
                        "OTP and OTP token are required"
                });
            }


            if (!unique_id) {

                return res.status(400).json({

                    status:
                        false,

                    error:
                        "unique_id dari Tahap 1 wajib dikirim"
                });
            }


            try {

                /*
                 * INI PERBAIKAN PALING PENTING.
                 *
                 * Gunakan unique_id dari Tahap 1.
                 */
                const gopay =
                    new GoMerchant(
                        unique_id
                    );


                const result =
                    await gopay.verifyOtp(
                        otp,
                        otp_token
                    );


                return res.status(200).json({

                    status:
                        true,

                    unique_id:
                        gopay.uniqueId,

                    result
                });


            } catch (err) {

                /*
                 * Sekarang kalau GoBiz membalas
                 * 400/401/403/500, status + body
                 * aslinya ikut ditampilkan.
                 */
                return sendError(
                    res,
                    err
                );
            }
        }
    },


    /* =====================================================
     * REFRESH TOKEN
     * =================================================== */

    {

        name:
            "Refresh Token",

        desc:
            "Memperbarui token akses menggunakan refresh token",

        category:
            "Gopay Merchant",

        parameters: {

            apikey:
                {
                    type:
                        "string"
                },

            refresh_token:
                {
                    type:
                        "string"
                }
        },

        path:
            "/gomerch/refreshtoken",


        async run(req, res) {

            if (
                !authOrFail(
                    req,
                    res
                )
            ) {
                return;
            }


            const {
                refresh_token
            } = req.query;


            if (!refresh_token) {

                return res.status(400).json({

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
                    await gopay.refreshToken(
                        refresh_token
                    );


                return res.status(200).json({

                    status:
                        true,

                    result
                });


            } catch (err) {

                return sendError(
                    res,
                    err
                );
            }
        }
    },


    /* =====================================================
     * MUTASI
     * =================================================== */

    {

        name:
            "Mutasi Transaksi",

        desc:
            "Melihat riwayat transaksi QRIS",

        category:
            "Gopay Merchant",

        parameters: {

            apikey:
                {
                    type:
                        "string"
                },

            token:
                {
                    type:
                        "string"
                },

            start_time:
                {
                    type:
                        "string",
                    required:
                        false
                }
        },

        path:
            "/gomerch/mutasi",


        async run(req, res) {

            if (
                !authOrFail(
                    req,
                    res
                )
            ) {
                return;
            }


            const {
                token,
                start_time
            } = req.query;


            if (!token) {

                return res.status(400).json({

                    status:
                        false,

                    error:
                        "Access token is required"
                });
            }


            try {

                const gopay =
                    new GoMerchant();


                /*
                 * Ambil profil merchant.
                 */
                const user =
                    await gopay.getMe(
                        token
                    );


                const merchantId =
                    user?.user?.merchant_id ||
                    user?.merchant_id ||
                    user?.data?.merchant_id;


                if (!merchantId) {

                    throw new Error(
                        "merchant_id tidak ditemukan dari response /v1/users/me"
                    );
                }


                const defaultStartTime =
                    new Date(
                        Date.now() -
                        7 * 24 * 60 * 60 * 1000
                    ).toISOString();


                const journals =
                    await gopay.getJournals(
                        token,
                        merchantId,
                        start_time ||
                        defaultStartTime
                    );


                const hits =
                    Array.isArray(
                        journals?.hits
                    )
                        ? journals.hits
                        : [];


                const data =
                    hits
                        .filter(
                            item =>
                                item?.metadata
                                    ?.transaction
                                    ?.payment_type ===
                                "qris"
                        )
                        .map(
                            item => {

                                const tx =
                                    item?.metadata
                                        ?.transaction ||
                                    {};

                                const aspi =
                                    item?.metadata
                                        ?.provider_metadata
                                        ?.aspi ||
                                    {};

                                const aspiData =
                                    aspi?.data ||
                                    {};


                                return {

                                    id:
                                        item?.id ||
                                        null,

                                    reference_id:
                                        item?.reference_id ||
                                        null,

                                    status:
    (
        item?.status ||
        tx?.status ||
        ""
    ).toLowerCase() === "settlement" ||
    (
        item?.status ||
        tx?.status ||
        ""
    ).toLowerCase() === "capture"
        ? "success"
        : (
            item?.status ||
            tx?.status ||
            null
        ),

                                    time:
                                        item?.time ||
                                        tx?.transaction_time ||
                                        null,

                                    amount:
                                        aspiData?.amount ||
                                        tx?.amount ||
                                        0,

                                    issuer:
                                        aspi?.issuer ||
                                        null,

                                    acquirer:
                                        aspi?.acquirer ||
                                        null,

                                    merchant_name:
                                        aspiData
                                            ?.merchant_name ||
                                        null,

                                    merchant_id:
                                        aspiData
                                            ?.merchant_id ||
                                        merchantId,

                                    merchant_city:
                                        aspiData
                                            ?.merchant_city ||
                                        null,

                                    terminal_label:
                                        aspiData
                                            ?.additional_data
                                            ?.terminal_label ||
                                        null
                                };
                            }
                        );


                return res.status(200).json({

                    status:
                        true,

                    merchant_id:
                        merchantId,

                    total:
                        data.length,

                    data
                });


            } catch (err) {

                return sendError(
                    res,
                    err
                );
            }
        }
    },


    /* =====================================================
     * CREATE PAYMENT / QRIS DINAMIS
     * =================================================== */

    {

        name:
            "Buat QRIS Dinamis",

        desc:
            "Membuat kode QR pembayaran dinamis",

        category:
            "Gopay Merchant",

        parameters: {

            apikey:
                {
                    type:
                        "string"
                },

            amount:
                {
                    type:
                        "string"
                },

            static_qr:
                {
                    type:
                        "string"
                }
        },

        path:
            "/gomerch/createpayment",


        async run(req, res) {

            if (
                !authOrFail(
                    req,
                    res
                )
            ) {
                return;
            }


            const {
                amount,
                static_qr
            } = req.query;


            if (
                !amount ||
                !static_qr
            ) {

                return res.status(400).json({

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
                    await gopay.createDynamicQRIS(
                        amount,
                        static_qr
                    );


                return res.status(200).json({

                    status:
                        true,

                    result
                });


            } catch (err) {

                return sendError(
                    res,
                    err,
                    400
                );
            }
        }
    },

    /* =====================================================
     * ALIAS: /auth/refresh/token
     * Dipakai oleh server.js
     * =================================================== */
    {
        name:
            "Refresh Token Alias",

        desc:
            "Alias kompatibilitas untuk /gomerch/refreshtoken",

        category:
            "Gopay Merchant",

        parameters: {
            refresh_token:
                {
                    type:
                        "string"
                }
        },

        path:
            "/auth/refresh/token",

        async run(req, res) {

            /*
             * server.js mengirim API key lewat:
             * x-api-key
             *
             * Tetap dukung ?apikey= juga.
             */
            const apikey =
                req.headers?.["x-api-key"] ||
                req.headers?.["X-API-Key"] ||
                req.query?.apikey;

            if (
                !apikey ||
                !checkApiKey(apikey)
            ) {
                return res.status(401).json({
                    success:
                        false,

                    error:
                        "Apikey invalid"
                });
            }

            const {
                refresh_token
            } = req.query;

            if (!refresh_token) {
                return res.status(400).json({
                    success:
                        false,

                    error:
                        "Refresh token is required"
                });
            }

            try {

                const gopay =
                    new GoMerchant();

                /*
                 * PAKAI METHOD ASLI
                 * Tidak mengubah logic GoBiz.
                 */
                const result =
                    await gopay.refreshToken(
                        refresh_token
                    );

                return res.status(200).json({

                    success:
                        true,

                    data:
                        result

                });

            } catch (err) {

                return sendError(
                    res,
                    err
                );
            }
        }
    },


    /* =====================================================
     * ALIAS: /api/history
     * Dipakai oleh server.js
     *
     * Alias dari /gomerch/mutasi
     * =================================================== */
    {
        name:
            "History Alias",

        desc:
            "Alias kompatibilitas untuk /gomerch/mutasi",

        category:
            "Gopay Merchant",

        parameters: {
            token:
                {
                    type:
                        "string"
                },

            start_time:
                {
                    type:
                        "string",

                    required:
                        false
                }
        },

        path:
            "/api/history",

        async run(req, res) {

            /*
             * server.js mengirim x-api-key.
             */
            const apikey =
                req.headers?.["x-api-key"] ||
                req.headers?.["X-API-Key"] ||
                req.query?.apikey;

            if (
                !apikey ||
                !checkApiKey(apikey)
            ) {
                return res.status(401).json({
                    success:
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
                return res.status(400).json({
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
                 * Sama dengan logic /gomerch/mutasi asli.
                 */
                const user =
                    await gopay.getMe(
                        token
                    );

                const merchantId =
                    user?.user?.merchant_id ||
                    user?.merchant_id ||
                    user?.data?.merchant_id;

                if (!merchantId) {
                    throw new Error(
                        "merchant_id tidak ditemukan dari response /v1/users/me"
                    );
                }

                const defaultStartTime =
                    new Date(
                        Date.now() -
                        7 *
                        24 *
                        60 *
                        60 *
                        1000
                    ).toISOString();

                const journals =
                    await gopay.getJournals(
                        token,
                        merchantId,
                        start_time ||
                        defaultStartTime
                    );

                const hits =
                    Array.isArray(
                        journals?.hits
                    )
                        ? journals.hits
                        : [];

                const data =
                    hits
                        .filter(
                            item =>
                                item?.metadata
                                    ?.transaction
                                    ?.payment_type ===
                                "qris"
                        )
                        .map(
                            item => {

                                const tx =
                                    item?.metadata
                                        ?.transaction ||
                                    {};

                                const aspi =
                                    item?.metadata
                                        ?.provider_metadata
                                        ?.aspi ||
                                    {};

                                const aspiData =
                                    aspi?.data ||
                                    {};

                                return {

                                    id:
                                        item?.id ||
                                        null,

                                    reference_id:
                                        item?.reference_id ||
                                        null,

                                    status:
                                        item?.status ||
                                        tx?.status ||
                                        null,

                                    time:
                                        item?.time ||
                                        tx?.transaction_time ||
                                        null,

                                    amount:
                                        aspiData?.amount ||
                                        tx?.amount ||
                                        0,

                                    issuer:
                                        aspi?.issuer ||
                                        null,

                                    acquirer:
                                        aspi?.acquirer ||
                                        null,

                                    merchant_name:
                                        aspiData
                                            ?.merchant_name ||
                                        null,

                                    merchant_id:
                                        aspiData
                                            ?.merchant_id ||
                                        merchantId,

                                    merchant_city:
                                        aspiData
                                            ?.merchant_city ||
                                        null,

                                    terminal_label:
                                        aspiData
                                            ?.additional_data
                                            ?.terminal_label ||
                                        null
                                };
                            }
                        );

                /*
                 * server.js MENGHARAPKAN:
                 *
                 * {
                 *   success: true,
                 *   data: [...]
                 * }
                 */
                return res.status(200).json({

                    success:
                        true,

                    merchant_id:
                        merchantId,

                    total:
                        data.length,

                    data:
                        data

                });

            } catch (err) {

                return sendError(
                    res,
                    err
                );
            }
        }
    },


    /* =====================================================
     * ALIAS: /api/qris/create
     * Dipakai oleh server.js
     *
     * Alias dari /gomerch/createpayment
     * =================================================== */
    {
        name:
            "Create QRIS Alias",

        desc:
            "Alias kompatibilitas untuk /gomerch/createpayment",

        category:
            "Gopay Merchant",

        parameters: {
            amount:
                {
                    type:
                        "string"
                },

            static_qr:
                {
                    type:
                        "string"
                }
        },

        path:
            "/api/qris/create",

        async run(req, res) {

            const apikey =
                req.headers?.["x-api-key"] ||
                req.headers?.["X-API-Key"] ||
                req.query?.apikey;

            if (
                !apikey ||
                !checkApiKey(apikey)
            ) {
                return res.status(401).json({
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
                return res.status(400).json({
                    success:
                        false,

                    error:
                        "Amount and static QR string are required"
                });
            }

            try {

                const gopay =
                    new GoMerchant();

                /*
                 * PAKAI METHOD ASLI.
                 */
                const result =
                    await gopay.createDynamicQRIS(
                        amount,
                        static_qr
                    );

                /*
                 * server.js mengharapkan:
                 *
                 * data.success
                 * data.image_url
                 */
                return res.status(200).json({

                    success:
                        true,

                    image_url:
                        `data:image/png;base64,${result.qr_buffer}`,

                    data:
                        result

                });

            } catch (err) {

                return sendError(
                    res,
                    err,
                    400
                );
            }
        }
    }

];