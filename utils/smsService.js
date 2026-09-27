const axios = require('axios');

/**
 * Send SMS OTP via smsbangla.com.bd
 * @param {string} phone - Recipient phone number
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<boolean>} - Success status
 */
const sendSMSOTP = async (phone, otp) => {
    try {
        const apikey = process.env.SMS_API_KEY;
        const sender = process.env.SMS_SENDER_ID;
        const msg = `${otp} is your SHADAMON.com verification code. Don't share with others. Helpline: 01752842084`;

        // Ensure phone starts with 88 or similar if required by API, 
        // but API example shows 017...
        // Let's use the phone as provided but ensure it's formatted if needed.

        const url = `https://api.smsbangla.com.bd/smsapiv3?apikey=${apikey}&sender=${sender}&msisdn=${phone}&smstext=${encodeURIComponent(msg)}`;

        const response = await axios.get(url);

        if (response.data && response.data.response && response.data.response[0].status === 0) {
            console.log(`SMS sent successfully to ${phone}`);
            return true;
        } else {
            console.error('SMS API Error:', response.data);
            return false;
        }
    } catch (error) {
        console.error('Error sending SMS:', error.message);
        return false;
    }
};

const sendSMSNotification = async (phone, message) => {
    try {
        const apikey = process.env.SMS_API_KEY;
        const sender = process.env.SMS_SENDER_ID;
        const msg = message;

        const url = `https://api.smsbangla.com.bd/smsapiv3?apikey=${apikey}&sender=${sender}&msisdn=${phone}&smstext=${encodeURIComponent(msg)}`;

        const response = await axios.get(url);

        if (response.data && response.data.response && response.data.response[0].status === 0) {
            console.log(`Notification SMS sent successfully to ${phone}`);
            return true;
        } else {
            console.error('SMS Notification API Error:', response.data);
            return false;
        }
    } catch (error) {
        console.error('Error sending SMS Notification:', error.message);
        return false;
    }
};

module.exports = { sendSMSOTP, sendSMSNotification };
