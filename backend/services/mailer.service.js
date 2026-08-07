const nodemailer = require('nodemailer');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Configuration du transporteur SMTP (Gmail par défaut)
 */
const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("❌ CONFIGURATION MAILLER : EMAIL_USER ou EMAIL_PASS manquant dans le .env");
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// --- 1. EMAIL DE BIENVENUE (Création de compte) ---
const sendWelcomeEmail = async (toEmail, username, password, companyName, companyCode) => {
  const transporter = createTransporter();
  if (!transporter) return { success: false, error: "Configuration manquante" };

  const mailOptions = {
    from: `"Système LEDI EXPERT" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `🚀 Vos accès collaborateur - ${companyName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 550px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #2563eb; padding: 25px; text-align: center; color: white;">
          <h2 style="margin: 0;">Bienvenue chez ${companyName}</h2>
        </div>
        <div style="padding: 30px;">
          <p>Bonjour <strong>${username}</strong>,</p>
          <p>Un compte collaborateur vous a été créé sur la plateforme de gestion. Voici vos accès confidentiels :</p>
          <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>🏢 Code Entreprise :</strong> <span style="color: #e11d48; font-weight: bold;">${companyCode}</span></p>
            <p style="margin: 5px 0;"><strong>📧 Identifiant :</strong> ${toEmail}</p>
            <p style="margin: 5px 0;"><strong>🔑 Mot de passe :</strong> <span style="color: #2563eb; font-weight: bold;">${password}</span></p>
          </div>
          <p style="font-size: 13px; color: #64748b;">Il est recommandé de changer ce mot de passe dès votre première connexion.</p>
        </div>
        <div style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 12px; color: #94a3b8;">
          © 2026 ERP LEDI EXPERT PRO - Gestion Intégrée
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("❌ Erreur Envoi Welcome Mail:", error.message);
    return { success: false, error: error.message };
  }
};

// --- 2. EMAIL DE RÉINITIALISATION (Récupération) ---
const sendResetPasswordEmail = async (toEmail, username, resetLink) => {
  const transporter = createTransporter();
  if (!transporter) return { success: false, error: "Configuration manquante" };

  const mailOptions = {
    from: `"Support LEDI EXPERT" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `🔑 Réinitialisation de votre mot de passe`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #1e293b; padding: 20px; text-align: center; color: white;">
          <h2 style="margin: 0;">Récupération de compte</h2>
        </div>
        <div style="padding: 30px; text-align: center;">
          <p style="text-align: left;">Bonjour <strong>${username}</strong>,</p>
          <p style="text-align: left;">Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour définir une nouvelle clé d'accès :</p>
          
          <div style="margin: 35px 0;">
            <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Changer mon mot de passe
            </a>
          </div>
          
          <p style="color: #ef4444; font-size: 12px; background: #fef2f2; padding: 10px; border-radius: 6px;">
            ⚠️ Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 15px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
          Ceci est un message automatique, merci de ne pas y répondre.
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Mail de récupération envoyé à ${toEmail}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Erreur SMTP Reset:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { sendWelcomeEmail, sendResetPasswordEmail };