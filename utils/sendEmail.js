const nodemailer = require('nodemailer');

async function sendEmail(to, subject, htmlContent) {
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USERNAME,
            pass: process.env.EMAIL_PASSWORD
        },
        tls: {
             rejectUnauthorized: false
        }
    });

    const mailOptions = {
        from: `"VisionSphere Support" <${process.env.EMAIL_USERNAME}>`,
        to,
        subject,
        html: htmlContent
    };

    await transporter.sendMail(mailOptions);
}

module.exports = sendEmail;