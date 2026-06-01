const TelegramBot = require('node-telegram-bot-api');
const Database = require('./database');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const express = require('express');

// ========== CONFIGURACIÓN ==========
const TOKEN = process.env.BOT_TOKEN || '8938813988:AAHqVTcOENymN7sByb-Bx4rBFTZvKL4WF0A';
const ADMIN_ID = '525658261168'; // Tu ID de Telegram
const OUTPUT_DIR = path.join(__dirname, 'uploads');

// Asegurar carpeta de salida
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const db = new Database();
const bot = new TelegramBot(TOKEN, { polling: true });

// Servidor web mínimo para Render
const app = express();
app.get('/', (req, res) => res.send('🤖 Bot de Constancias activo'));
app.listen(process.env.PORT || 3000);

// Estado de conversaciones
const userStates = new Map();

console.log('🤖 Bot de Constancias iniciado');

// ========== COMANDOS ==========

// /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from.first_name || 'Usuario';
    
    await db.addUser(chatId.toString());
    
    bot.sendMessage(chatId, 
        `👋 ¡Hola *${name}*!\n\n` +
        `🤖 *Bot de Constancias Fiscales*\n\n` +
        `💳 Créditos: *${await db.getCredits(chatId.toString())}*\n\n` +
        `*Comandos disponibles:*\n` +
        `• /generar - Crear constancia fiscal\n` +
        `• /saldo - Ver tus créditos\n` +
        `• /menu - Mostrar menú\n` +
        `• /ayuda - Ayuda\n\n` +
        `📞 Para recargar créditos, contacta al administrador.`,
        { parse_mode: 'Markdown' }
    );
});

// /menu
bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const stats = await db.getStats(chatId.toString());
    
    bot.sendMessage(chatId,
        `🤖 *Menú Principal*\n\n` +
        `💳 Créditos: *${stats.credits}*\n` +
        `📄 Generadas: *${stats.total_generated}*\n\n` +
        `*Opciones:*\n` +
        `• /generar - Nueva constancia\n` +
        `• /saldo - Ver saldo\n` +
        `• /ayuda - Cómo usar el bot\n\n` +
        `Para recargar, contacta al admin.`,
        { parse_mode: 'Markdown' }
    );
});

// /saldo
bot.onText(/\/saldo/, async (msg) => {
    const chatId = msg.chat.id;
    const stats = await db.getStats(chatId.toString());
    
    bot.sendMessage(chatId,
        `💳 *Tu Saldo*\n\n` +
        `• Créditos disponibles: *${stats.credits}*\n` +
        `• Constancias generadas: *${stats.total_generated}*\n\n` +
        `Para recargar, contacta al administrador.`,
        { parse_mode: 'Markdown' }
    );
});

// /ayuda
bot.onText(/\/ayuda/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
        `❓ *Ayuda*\n\n` +
        `*Cómo generar una constancia:*\n` +
        `1. Escribe /generar\n` +
        `2. Envía tu idCIF (13 dígitos)\n` +
        `3. Envía tu RFC\n` +
        `4. El bot generará la constancia automáticamente\n\n` +
        `*Costo:* 1 crédito por constancia\n\n` +
        `*Nota:* La emisión será *CUAUHTEMOC, CIUDAD DE MEXICO* por defecto.`,
        { parse_mode: 'Markdown' }
    );
});

// /generar
bot.onText(/\/generar/, async (msg) => {
    const chatId = msg.chat.id;
    const credits = await db.getCredits(chatId.toString());
    
    if (credits <= 0) {
        bot.sendMessage(chatId,
            '❌ *Sin créditos*\n\n' +
            'No tienes créditos disponibles.\n' +
            'Contacta al administrador para recargar.\n\n' +
            '💰 Precio: $50 pesos por constancia',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    userStates.set(chatId, { step: 'waiting_idcif' });
    
    bot.sendMessage(chatId,
        '📋 *Generar Constancia Fiscal*\n\n' +
        'Paso 1 de 2:\n' +
        'Envía tu *idCIF* (13 dígitos numéricos)\n\n' +
        'Ejemplo: `22080403949`',
        { parse_mode: 'Markdown' }
    );
});

// ========== ADMIN COMANDOS ==========

// /admin recargar [userId] [cantidad]
bot.onText(/\/admin (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== ADMIN_ID) {
        bot.sendMessage(chatId, '⛔ No tienes permisos de administrador.');
        return;
    }
    
    const args = match[1].split(' ');
    const command = args[0];
    
    if (command === 'recargar' && args.length >= 3) {
        const targetId = args[1];
        const amount = parseInt(args[2]) || 0;
        
        await db.addCredits(targetId, amount, `Recarga admin`);
        const newBalance = await db.getCredits(targetId);
        
        bot.sendMessage(chatId,
            `✅ *Recarga exitosa*\n\n` +
            `Usuario: \`${targetId}\`\n` +
            `Créditos añadidos: +${amount}\n` +
            `Saldo actual: ${newBalance}`,
            { parse_mode: 'Markdown' }
        );
        
        // Notificar al usuario
        bot.sendMessage(targetId,
            `🎉 *¡Créditos recibidos!*\n\n` +
            `Se han añadido *${amount}* créditos a tu cuenta.\n` +
            `Saldo actual: *${newBalance}*\n\n` +
            `Escribe /generar para usar tus créditos.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (command === 'usuarios') {
        const users = await db.getAllUsers();
        let message = `👥 *Usuarios registrados (${users.length})*\n\n`;
        
        users.forEach((u, i) => {
            message += `${i+1}. \`${u.user_id}\`\n` +
                       `   💳 ${u.credits} créditos | 📄 ${u.total_generated} generadas\n`;
        });
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        return;
    }
    
    if (command === 'stats') {
        const users = await db.getAllUsers();
        const totalUsers = users.length;
        const totalGenerated = users.reduce((sum, u) => sum + u.total_generated, 0);
        const totalCredits = users.reduce((sum, u) => sum + u.credits, 0);
        
        bot.sendMessage(chatId,
            `📊 *Estadísticas*\n\n` +
            `👥 Usuarios: ${totalUsers}\n` +
            `📄 Constancias generadas: ${totalGenerated}\n` +
            `💳 Créditos en circulación: ${totalCredits}`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (command === 'dar' && args.length >= 3) {
        const targetId = args[1];
        const amount = parseInt(args[2]) || 5;
        
        await db.addCredits(targetId, amount, 'Créditos de bienvenida');
        
        bot.sendMessage(targetId,
            `🎁 *¡Bienvenido!*\n\n` +
            `Has recibido *${amount}* créditos gratis.\n` +
            `Escribe /generar para crear tu primera constancia.`,
            { parse_mode: 'Markdown' }
        );
        
        bot.sendMessage(chatId, `✅ Créditos de bienvenida enviados a ${targetId}`);
        return;
    }
    
    bot.sendMessage(chatId,
        `🔧 *Comandos de Admin:*\n\n` +
        `• /admin recargar [userId] [cantidad]\n` +
        `• /admin dar [userId] [cantidad] - Créditos gratis\n` +
        `• /admin usuarios\n` +
        `• /admin stats`,
        { parse_mode: 'Markdown' }
    );
});

// ========== MENSAJES GENERALES ==========

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    
    if (text.startsWith('/')) return; // Ignorar comandos
    
    const state = userStates.get(chatId) || { step: 'idle' };
    
    if (state.step === 'waiting_idcif') {
        if (!/^\d{13}$/.test(text)) {
            bot.sendMessage(chatId,
                '❌ *idCIF inválido*\n\n' +
                'Debe ser exactamente 13 dígitos numéricos.\n' +
                'Ejemplo: `22080403949`\n\n' +
                'Envía tu idCIF:',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        userStates.set(chatId, { step: 'waiting_rfc', idcif: text });
        bot.sendMessage(chatId,
            '✅ *idCIF guardado*\n\n' +
            'Paso 2 de 2:\n' +
            'Envía tu *RFC*\n\n' +
            'Ejemplo: `CAGJ020721KX5`',
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (state.step === 'waiting_rfc') {
        if (!/^[A-ZÑ&]{3,4}\d{6}[A-ZÑ&0-9]{3}$/i.test(text)) {
            bot.sendMessage(chatId,
                '❌ *RFC inválido*\n\n' +
                'Formato correcto: ABCD123456XXX\n\n' +
                'Envía tu RFC:',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        const { idcif } = state;
        const rfc = text.toUpperCase();
        const emision = 'CUAUHTEMOC, CIUDAD DE MEXICO';
        
        // Verificar créditos
        const hasCredits = await db.deductCredit(chatId.toString());
        if (!hasCredits) {
            bot.sendMessage(chatId, '❌ *Créditos insuficientes*\nTu saldo se agotó.');
            userStates.delete(chatId);
            return;
        }
        
        bot.sendMessage(chatId,
            '⏳ *Generando constancia...*\n\n' +
            `idCIF: \`${idcif}\`\n` +
            `RFC: \`${rfc}\`\n` +
            `Emisión: \`${emision}\`\n\n` +
            'Esto puede tardar unos segundos...',
            { parse_mode: 'Markdown' }
        );
        
        try {
            const result = await generarConstancia(idcif, rfc, emision);
            
            if (result.success && fs.existsSync(result.filePath)) {
                // Enviar documento
                await bot.sendDocument(chatId, result.filePath, {
                    caption: `✅ *Constancia generada*\n\n` +
                             `RFC: \`${rfc}\`\n` +
                             `Créditos restantes: ${await db.getCredits(chatId.toString())}`,
                    parse_mode: 'Markdown'
                });
                
                // Guardar en DB
                await db.addConstancia(chatId.toString(), rfc, idcif, 'success', result.filePath);
                
                // Notificar admin
                bot.sendMessage(ADMIN_ID,
                    `📄 Constancia generada\n` +
                    `Usuario: ${chatId}\n` +
                    `RFC: ${rfc}\n` +
                    `Créditos restantes del usuario: ${await db.getCredits(chatId.toString())}`
                );
            } else {
                bot.sendMessage(chatId, '❌ *Error al generar*\n\n' + (result.error || 'No se pudo descargar.'));
                await db.addCredits(chatId.toString(), 1, 'Reembolso por error');
            }
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, '❌ *Error del sistema*\nPor favor intenta más tarde.');
            await db.addCredits(chatId.toString(), 1, 'Reembolso por error');
        }
        
        userStates.delete(chatId);
        return;
    }
    
    // Mensaje no reconocido
    bot.sendMessage(chatId,
        '❓ No entendí.\n\n' +
        'Escribe /menu para ver las opciones disponibles.'
    );
});

// ========== GENERAR CONSTANCIA ==========

async function generarConstancia(idcif, rfc, emision) {
    return new Promise((resolve, reject) => {
        const timestamp = Date.now();
        const fileName = `Constancia_${rfc}_${timestamp}.docx`;
        const filePath = path.join(OUTPUT_DIR, fileName);

        exec(`python3 ${__dirname}/rfc_bot.py "${idcif}" "${rfc}" "${emision}" "${filePath}"`, 
            { timeout: 120000 }, 
            (error, stdout, stderr) => {
                if (error) {
                    console.error('Error:', error);
                    console.error('Stderr:', stderr);
                    resolve({ success: false, error: stderr || error.message });
                } else {
                    console.log('Stdout:', stdout);
                    resolve({
                        success: true,
                        filePath: filePath,
                        fileName: fileName
                    });
                }
            }
        );
    });
}
