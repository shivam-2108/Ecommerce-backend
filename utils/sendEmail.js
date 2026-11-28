
import "dotenv/config";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const sendEmail = async (options) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        const err = new Error("Email service is not configured.");
        err.code = "EMAIL_NOT_CONFIGURED";
        throw err;
    }

   const mailOptions = {
    from: `"Shivam E-commerce" <${process.env.EMAIL_USER}>`,
    to: options.email,
    subject: options.subject,
    html: options.message,
};

    await transporter.sendMail(mailOptions);
};

export default sendEmail;
