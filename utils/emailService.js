const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Use SSL
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 10000
});

exports.sendOTP = async (email, otp) => {
    try {
        await transporter.sendMail({
            from: `"Shadamon Security" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Your SHADAMON.com verification code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4F46E5;">Verify Your Identity</h2>
                    <p>Please use the verification code below to confirm your identity.</p>
                    <div style="background-color: #F3F4F6; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0;">
                        <h1 style="color: #111827; letter-spacing: 5px; margin: 0;">${otp}</h1>
                    </div>
                    <p style="color: #6B7280; font-size: 14px;">Don't share with others. Helpline: 01752842084</p>
                </div>
            `
        });
        return true;
    } catch (error) {
        console.error("Email send failed:", error);
        return false;
    }
};

exports.sendNotificationEmail = async (email, message) => {
    try {
        await transporter.sendMail({
            from: `"Shadamon Notifications" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'New Notification from Shadamon',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 10px auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #1A202C; color: white; padding: 20px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px;">SHADAMON</h1>
                    </div>
                    <div style="padding: 30px; line-height: 1.6; color: #2d3748;">
                        <h2 style="color: #1A202C; margin-top: 0;">New message for you</h2>
                        <p style="font-size: 16px;">${message}</p>
                        <div style="margin-top: 30px; text-align: center;">
                            <a href="${process.env.FRONTEND_URL || 'https://shadamon.com'}" style="background-color: #4A5568; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">View in Dashboard</a>
                        </div>
                    </div>
                    <div style="background-color: #f7fafc; padding: 15px; text-align: center; font-size: 12px; color: #718096;">
                        © ${new Date().getFullYear()} Shadamon. All rights reserved.
                    </div>
                </div>
            `
        });
        return true;
    } catch (error) {
        console.error("Notification Email send failed:", error);
        return false;
    }
};
