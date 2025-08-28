const express = require('express');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const app = express();
const PORT = 3000;
// Add these to the top of your server.js file, after other requires

const twilio = require('twilio');

// Twilio Configuration - UPDATE THESE WITH YOUR CREDENTIALS
const TWILIO_ACCOUNT_SID = ''; // Get from Twilio Console
const TWILIO_AUTH_TOKEN = '';   // Get from Twilio Console
const TWILIO_WHATSAPP_NUMBER = ''; // Twilio Sandbox number (or your approved number)

// Initialize Twilio client
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Function to format phone number for WhatsApp
function formatPhoneForWhatsApp(phoneNumber) {
    // Remove all non-digit characters
    let cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // Handle Jordan numbers
    if (cleanNumber.startsWith('0')) {
        cleanNumber = '962' + cleanNumber.substring(1); // Remove 0, add 962
    }
    
    if (!cleanNumber.startsWith('962') && cleanNumber.length === 9) {
        cleanNumber = '962' + cleanNumber;
    }
    
    return 'whatsapp:+' + cleanNumber;
}

// PKG compatibility - detect if running as executable
const isPackaged = typeof process.pkg !== 'undefined';
const basePath = isPackaged ? path.dirname(process.execPath) : __dirname;

// Database file paths
const DATABASE_FILE = path.join(basePath, 'sales_database.json');
const CONFIG_FILE = path.join(basePath, 'config.json');
const GOOGLE_CREDENTIALS_FILE = path.join(basePath, 'google-credentials.json');

// Google Drive configuration
let googleAuth = null;
let googleDrive = null;

// Initialize Google Drive
function initializeGoogleDrive() {
    try {
        if (fs.existsSync(GOOGLE_CREDENTIALS_FILE)) {
            const credentials = JSON.parse(fs.readFileSync(GOOGLE_CREDENTIALS_FILE, 'utf8'));
            
            googleAuth = new google.auth.GoogleAuth({
                keyFile: GOOGLE_CREDENTIALS_FILE,
                scopes: ['https://www.googleapis.com/auth/drive.file']
            });
            
            googleDrive = google.drive({ version: 'v3', auth: googleAuth });
            console.log('✅ Google Drive initialized successfully');
            return true;
        } else {
            console.log('⚠️  Google Drive credentials not found. Cloud upload will be disabled.');
            console.log('📋 To enable: Place google-credentials.json in the project root');
            return false;
        }
    } catch (error) {
        console.error('❌ Error initializing Google Drive:', error.message);
        return false;
    }
}

// Upload PDF to Google Drive
async function uploadToGoogleDrive(pdfBuffer, fileName) {
    if (!googleDrive) {
        throw new Error('Google Drive not initialized');
    }
    
    try {
        const fileMetadata = {
            name: fileName,
            parents: ['1your-folder-id'], // Optional: specify folder ID
        };
        
        const media = {
            mimeType: 'application/pdf',
            body: require('stream').Readable.from(pdfBuffer),
        };
        
        const file = await googleDrive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',
        });
        
        // Make the file publicly accessible
        await googleDrive.permissions.create({
            fileId: file.data.id,
            resource: {
                role: 'reader',
                type: 'anyone',
            },
        });
        
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.data.id}`;
        const viewUrl = `https://drive.google.com/file/d/${file.data.id}/view`;
        
        console.log(`📤 PDF uploaded to Google Drive: ${fileName}`);
        
        return {
            fileId: file.data.id,
            downloadUrl: downloadUrl,
            viewUrl: viewUrl
        };
        
    } catch (error) {
        console.error('Error uploading to Google Drive:', error);
        throw error;
    }
}

// Fallback: Create local temporary file with public access
function createLocalFileLink(pdfBuffer, fileName) {
    try {
        const tempDir = path.join(basePath, 'temp_invoices');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, pdfBuffer);
        
        // Get local IP for network access
        const nets = require('os').networkInterfaces();
        let localIP = 'localhost';
        
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    localIP = net.address;
                    break;
                }
            }
        }
        
        const downloadUrl = `http://${localIP}:${PORT}/temp-pdf/${fileName}`;
        
        console.log(`📁 PDF saved locally: ${fileName}`);
        
        return {
            downloadUrl: downloadUrl,
            isLocal: true,
            fileName: fileName
        };
        
    } catch (error) {
        console.error('Error creating local file:', error);
        throw error;
    }
}

// Initialize config file if it doesn't exist
function initializeConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        const initialConfig = {
            admin: {
                password: "123",
                lastPasswordChange: new Date().toISOString()
            },
            app: {
                name: "THEGROVE Sales Invoice System",
                version: "1.0.0"
            }
        };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(initialConfig, null, 2));
        console.log('🔧 Config initialized: config.json');
    }
}

// Read config
function readConfig() {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading config:', error);
        return { admin: { password: "123" } };
    }
}

// Update config
function updateConfig(newConfig) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));
        return true;
    } catch (error) {
        console.error('Error updating config:', error);
        return false;
    }
}

// Initialize database file if it doesn't exist
function initializeDatabase() {
    if (!fs.existsSync(DATABASE_FILE)) {
        const initialData = {
            invoices: [],
            stats: {
                totalSales: 0,
                totalAmount: 0,
                lastInvoiceNumber: 0
            }
        };
        fs.writeFileSync(DATABASE_FILE, JSON.stringify(initialData, null, 2));
        console.log('📁 Database initialized: sales_database.json');
    }
}

// Read database
function readDatabase() {
    try {
        const data = fs.readFileSync(DATABASE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading database:', error);
        return { invoices: [], stats: { totalSales: 0, totalAmount: 0, lastInvoiceNumber: 0 } };
    }
}

// Write to database
function writeDatabase(data) {
    try {
        fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing to database:', error);
        return false;
    }
}

// Save invoice to database
function saveInvoiceToDatabase(invoiceData) {
    const db = readDatabase();
    
    const invoice = {
        id: Date.now(),
        invoiceNumber: invoiceData.invoiceNumber || `INV-${db.stats.lastInvoiceNumber + 1}`,
        clientName: invoiceData.clientName,
        phoneNumber: invoiceData.phoneNumber,
        address: invoiceData.address,
        totalAmount: parseFloat(invoiceData.totalAmount) || 0,
        amountReceived: parseFloat(invoiceData.amountReceived) || 0,
        remainingAmount: parseFloat(invoiceData.remainingAmount) || 0,
        salesRepresentative: invoiceData.salesRepresentative,
        date: invoiceData.date,
        day: invoiceData.day,
        deliveryDate: invoiceData.deliveryDate,
        deliveryDay: invoiceData.deliveryDay,
        items: invoiceData.items || [],
        notes: invoiceData.notes,
        timestamp: new Date().toISOString(),
        accountNumber: invoiceData.accountNumber,
        addressTitle: invoiceData.addressTitle,
        entryNumber: invoiceData.entryNumber
    };
    
    db.invoices.push(invoice);
    
    // Update stats
    db.stats.totalSales += 1;
    db.stats.totalAmount += invoice.totalAmount;
    db.stats.lastInvoiceNumber = Math.max(db.stats.lastInvoiceNumber, 
        parseInt(invoice.invoiceNumber.replace(/\D/g, '')) || 0);
    
    if (writeDatabase(db)) {
        console.log(`📊 Invoice saved to database: ${invoice.invoiceNumber} - ${invoice.clientName}`);
        return invoice;
    }
    return null;
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(basePath, 'public')));

// Initialize database, config, and Google Drive on startup
initializeDatabase();
initializeConfig();
const googleDriveEnabled = initializeGoogleDrive();

// Colors from your original design
const colors = {
    primary: '#2C3E50',
    accent: '#B8860B',
    lightGray: '#F8F9FA'
};

// Helper function to detect Arabic text
function containsArabic(text) {
    if (!text) return false;
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F]/;
    return arabicRegex.test(text);
}

// Helper function to get adaptive font size based on text length
function getAdaptiveFontSize(text, baseSize = 10) {
    if (!text) return baseSize;
    if (text.length > 22) {
        return Math.max(7, baseSize - 2);
    }
    return baseSize;
}

// Helper function to draw watermark
function drawWatermark(doc) {
    const watermarkPath = path.join(basePath, 'watermark.png');
    try {
        if (fs.existsSync(watermarkPath)) {
            // Save the current graphics state
            doc.save();
            
            // Set transparency for the watermark
            doc.opacity(0.10); // 15% opacity for subtle effect
            
            // Calculate position to center the watermark on the page
            const pageWidth = 595.28; // A4 width in points
            const pageHeight = 701.89; // A4 height in points
            
            // Make watermark cover most of the page but with margins
            const watermarkWidth = pageWidth - 30; // Leave 40pt margin on each side
            const watermarkHeight = pageHeight - 80; // Leave more space for header/footer
            
            const x = (pageWidth - watermarkWidth) / 2;
            const y = (pageHeight - watermarkHeight) / 2;
            
            // Draw the watermark image
            doc.image(watermarkPath, x, y, {
                width: watermarkWidth,
                height: watermarkHeight,
                fit: [watermarkWidth, watermarkHeight],
                align: 'center',
                valign: 'center'
            });
            
            // Restore the graphics state (removes transparency for subsequent elements)
            doc.restore();
        }
    } catch (error) {
        console.log('Watermark image not found or could not be loaded:', error.message);
    }
}

// Helper function to draw table cell with RTL support
function drawCell(doc, x, y, width, height, text, options = {}) {
    const {
        align = 'left',
        fontSize = 10,
        bold = false,
        fillColor = '#FFFFFF',
        textColor = '#000000',
        borderColor = '#000000',
        padding = 5,
        allowWrap = false,
        isDescription = false
    } = options;

    // Draw cell background
    doc.fillColor(fillColor)
       .rect(x, y, width, height)
       .fill();

    // Draw cell border
    doc.strokeColor(borderColor)
       .lineWidth(0.5)
       .rect(x, y, width, height)
       .stroke();

    // Add text
    if (text) {
        const actualFontSize = isDescription ? getAdaptiveFontSize(text, fontSize) : fontSize;
        const isArabic = containsArabic(text);

        doc.fillColor(textColor)
           .fontSize(actualFontSize);

        if (isDescription && isArabic) {
            // Try to use Arabic font if available, fallback to Helvetica
            try {
                doc.font('NotoArabic');
            } catch (e) {
                doc.font('Helvetica');
            }
        } else {
            doc.font(bold ? 'Times-Bold' : 'Times-Roman');
        }

        if (allowWrap || isDescription) {
            const textOptions = {
                width: width - (padding * 2),
                height: height - (padding * 2),
                align: isArabic ? 'right' : (align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'),
                ellipsis: true
            };

            // Add RTL support for Arabic text
            if (isArabic && isDescription) {
                textOptions.features = ['rtla']; // Enable right-to-left Arabic
                textOptions.bidi = true; // Enable bidirectional text
            }

            doc.text(text, x + padding, y + padding, textOptions);
        } else {
            let textX = x + padding;
            let textY = y + (height - actualFontSize) / 2;

            if (isArabic) {
                // For Arabic text, align to the right
                textX = x + width - doc.widthOfString(text) - padding;
            } else if (align === 'center') {
                textX = x + (width - doc.widthOfString(text)) / 2;
            } else if (align === 'right') {
                textX = x + width - doc.widthOfString(text) - padding;
            }

            // Add RTL features for Arabic text
            if (isArabic) {
                doc.text(text, textX, textY, { features: ['rtla'], bidi: true });
            } else {
                doc.text(text, textX, textY);
            }
        }
    }
}

// Email configuration - UPDATE THESE VALUES
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: '', // UPDATE THIS
        pass: '' // UPDATE THIS
    }
});

// Function to generate PDF buffer (for email attachment)
function generateInvoicePDFBuffer(data) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: {
                top: 40,
                bottom: 40,
                left: 50,
                right: 50
            },
            compress: true
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            resolve(pdfData);
        });
        doc.on('error', reject);

        generatePDFContent(doc, data);
        doc.end();
    });
}

// Function to generate PDF with user data
function generateInvoicePDF(data, res) {
    const doc = new PDFDocument({
        size: 'A4',
        margins: {
            top: 40,
            bottom: 40,
            left: 50,
            right: 50
        },
        compress: true
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-invoice.pdf"');

    doc.pipe(res);
    generatePDFContent(doc, data);
    doc.end();
}

// Shared function for PDF content generation
function generatePDFContent(doc, data) {
    // Try to register Arabic font if available
    const fontPath = path.join(basePath, 'fonts', 'NotoNaskhArabic-Regular.ttf');
    try {
        if (fs.existsSync(fontPath)) {
            doc.registerFont('NotoArabic', fontPath);
        }
    } catch (error) {
        console.log('Arabic font not found, using fallback fonts');
    }

    let currentY = 40;

    // Add subtle top accent line
    doc.strokeColor(colors.accent)
       .lineWidth(2)
       .moveTo(50, currentY)
       .lineTo(545, currentY)
       .stroke();

    currentY += 10;

    // Company info area (right side)
    doc.fillColor(colors.primary)
       .fontSize(18)
       .font('Times-Bold')
       .text('SALES INVOICE', 380, currentY + 10);

    doc.fillColor('#666666')
       .fontSize(10)
       .font('Times-Roman')
       .text(`Invoice #: ${data.invoiceNumber || ''}`, 380, currentY + 35);

    // Add logo if exists
    const logoPath = path.join(basePath, 'logo.png');
    try {
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 50, currentY + 10, { width: 130 });
        } else {
            throw new Error('Logo not found');
        }
    } catch (error) {
        doc.fillColor('#E0E0E0')
           .rect(50, currentY + 10, 130, 65)
           .fill();
        doc.fillColor('#666666')
           .fontSize(14)
           .text('LOGO', 100, currentY + 35);
    }

    currentY += 60;

    // Header information section
    const infoHeaderY = currentY;
    const fieldWidth = 100;
    const fieldHeight = 21;

    // Top row: Client Name, Phone Number
    drawCell(doc, 50, infoHeaderY, fieldWidth, fieldHeight, 'Client Name:', {
        bold: true,
        fillColor: colors.lightGray,
        align: 'center',
        textColor: colors.primary,
        fontSize: 9
    });
    drawCell(doc, 150, infoHeaderY, 147.5, fieldHeight, data.clientName || '', { fillColor: '#FFFFFF', fontSize: 9 });

    drawCell(doc, 297.5, infoHeaderY, fieldWidth, fieldHeight, 'Phone Number:', {
        bold: true,
        fillColor: colors.lightGray,
        align: 'center',
        textColor: colors.primary,
        fontSize: 9
    });
    drawCell(doc, 397.5, infoHeaderY, 147.5, fieldHeight, data.phoneNumber || '', { fillColor: '#FFFFFF', fontSize: 9 });

    // Second row: Address, Account Number
    const row2Y = infoHeaderY + fieldHeight;
    drawCell(doc, 50, row2Y, fieldWidth, fieldHeight, 'Address:', {
        bold: true,
        fillColor: colors.lightGray,
        align: 'center',
        textColor: colors.primary,
        fontSize: 9
    });
    drawCell(doc, 150, row2Y, 147.5, fieldHeight, data.address || '', { fillColor: '#FFFFFF', fontSize: 9 });

    drawCell(doc, 297.5, row2Y, fieldWidth, fieldHeight, 'Account Number:', {
        bold: true,
        fillColor: colors.lightGray,
        align: 'center',
        textColor: colors.primary,
        fontSize: 9
    });
    drawCell(doc, 397.5, row2Y, 147.5, fieldHeight, data.accountNumber || '', { fillColor: '#FFFFFF', fontSize: 9 });

    // Third row: Address Title, Entry Number
    const row3Y = row2Y + fieldHeight;
    drawCell(doc, 50, row3Y, fieldWidth, fieldHeight, 'Address Title:', {
        bold: true,
        fillColor: colors.lightGray,
        align: 'center',
        textColor: colors.primary,
        fontSize: 9
    });
    drawCell(doc, 150, row3Y, 147.5, fieldHeight, data.addressTitle || '', { fillColor: '#FFFFFF', fontSize: 9 });

    drawCell(doc, 297.5, row3Y, fieldWidth, fieldHeight, 'Entry Number:', {
        bold: true,
        fillColor: colors.lightGray,
        align: 'center',
        textColor: colors.primary,
        fontSize: 9
    });
    drawCell(doc, 397.5, row3Y, 147.5, fieldHeight, data.entryNumber || '', { fillColor: '#FFFFFF', fontSize: 9 });

    currentY = row3Y + fieldHeight + 12;

    // Date and Day section
    const dateY = currentY;
    drawCell(doc, 50, dateY, 100, fieldHeight, 'Day:', {
        bold: true,
        fillColor: colors.lightGray,
        align: 'center',
        textColor: colors.primary,
        fontSize: 9
    });
    drawCell(doc, 150, dateY, 147.5, fieldHeight, data.day || '', { fillColor: '#FFFFFF', fontSize: 9 });

    drawCell(doc, 297.5, dateY, 100, fieldHeight, 'Date:', {
        bold: true,
        fillColor: colors.lightGray,
        align: 'center',
        textColor: colors.primary,
        fontSize: 9
    });
    drawCell(doc, 397.5, dateY, 147.5, fieldHeight, data.date || '', { fillColor: '#FFFFFF', fontSize: 9 });

    currentY = dateY + fieldHeight + 10;

    // Main table
    const tableStartY = currentY;
    const colWidths = [60, 220, 40, 50, 50, 75];
    let tableX = 50;

    // Table headers
    const headers = ['Code', 'Description', 'Qty', 'Price', 'Disc %', 'Final Price'];
    let tableHeaderY = tableStartY;

    headers.forEach((header, index) => {
        drawCell(doc, tableX, tableHeaderY, colWidths[index], 23, header, {
            bold: true,
            fillColor: colors.primary,
            textColor: '#FFFFFF',
            align: 'center',
            fontSize: 9
        });
        tableX += colWidths[index];
    });

    // Table rows with user data - restored to 8 rows
    const rowHeight = 23;
    const items = data.items || [];

    for (let row = 0; row < 8; row++) {
        tableX = 50;
        const rowY = tableHeaderY + 23 + (row * rowHeight);
        const item = items[row] || {};

        drawCell(doc, tableX, rowY, colWidths[0], rowHeight, item.code || '', { fillColor: '#FFFFFF', fontSize: 8 });
        tableX += colWidths[0];

        // Description with RTL support for Arabic text
        drawCell(doc, tableX, rowY, colWidths[1], rowHeight, item.description || '', {
            fillColor: '#FFFFFF',
            allowWrap: true,
            fontSize: 8,
            isDescription: true
        });
        tableX += colWidths[1];

        drawCell(doc, tableX, rowY, colWidths[2], rowHeight, item.qty || '', { fillColor: '#FFFFFF', align: 'center', fontSize: 8 });
        tableX += colWidths[2];

        drawCell(doc, tableX, rowY, colWidths[3], rowHeight, item.price || '', { fillColor: '#FFFFFF', align: 'right', fontSize: 8 });
        tableX += colWidths[3];

        drawCell(doc, tableX, rowY, colWidths[4], rowHeight, item.discount || '', { fillColor: '#FFFFFF', align: 'center', fontSize: 8 });
        tableX += colWidths[4];

        drawCell(doc, tableX, rowY, colWidths[5], rowHeight, item.finalPrice || '', { fillColor: '#FFFFFF', align: 'right', fontSize: 8 });
    }

    // Summary section
    const summaryY = tableHeaderY + 23 + (8 * rowHeight);
    const summaryX = 50;

    // Total Amount
    drawCell(doc, summaryX, summaryY, 120, 21, 'Total Amount:', {
        bold: true,
        fillColor: colors.lightGray,
        align: 'center',
        textColor: colors.primary,
        fontSize: 9
    });
    drawCell(doc, summaryX + 120, summaryY, 100, 21, data.totalAmount || '', { fillColor: '#FFFFFF', align: 'right', fontSize: 9 });

    // Amount Received
    drawCell(doc, summaryX, summaryY + 21, 120, 21, 'Amount Received:', {
        bold: true,
        fillColor: colors.lightGray,
        align: 'center',
        textColor: colors.primary,
        fontSize: 9
    });
    drawCell(doc, summaryX + 120, summaryY + 21, 100, 21, data.amountReceived || '', { fillColor: '#FFFFFF', align: 'right', fontSize: 9 });

    // Remaining Amount
    drawCell(doc, summaryX, summaryY + 42, 120, 21, 'Remaining Amount:', {
        bold: true,
        fillColor: colors.lightGray,
        align: 'center',
        textColor: colors.primary,
        fontSize: 9
    });
    drawCell(doc, summaryX + 120, summaryY + 42, 100, 21, data.remainingAmount || '', { fillColor: '#FFFFFF', align: 'right', fontSize: 9 });

    // Delivery section (right side)
    const deliveryX = 330;
    drawCell(doc, deliveryX, summaryY, 110, 21, 'Delivery Day:', {
        bold: true,
        fillColor: colors.lightGray,
        align: 'center',
        textColor: colors.primary,
        fontSize: 9
    });
    drawCell(doc, deliveryX + 110, summaryY, 105, 21, data.deliveryDay || '', { fillColor: '#FFFFFF', fontSize: 9 });

    drawCell(doc, deliveryX, summaryY + 21, 110, 42, 'Delivery Date:', {
        bold: true,
        fillColor: colors.lightGray,
        align: 'center',
        textColor: colors.primary,
        fontSize: 9
    });
    drawCell(doc, deliveryX + 110, summaryY + 21, 105, 42, data.deliveryDate || '', { fillColor: '#FFFFFF', fontSize: 9 });

    // Notes section with RTL support - expanded
    const notesY = summaryY + 65;

    doc.strokeColor('#000000')
       .lineWidth(0.5)
       .rect(50, notesY + 10, 495, 55)
       .stroke();

    doc.fillColor('#FFFFFF')
       .rect(60, notesY + 5, 40, 10)
       .fill();

    doc.fillColor(colors.primary)
       .fontSize(10)
       .font('Times-Bold')
       .text('Notes:', 65, notesY + 7);

    if (data.notes) {
        const isArabicNotes = containsArabic(data.notes);

        doc.fillColor('#000000')
           .fontSize(8);

        if (isArabicNotes) {
            try {
                doc.font('NotoArabic');
            } catch (e) {
                doc.font('Helvetica');
            }
        } else {
            doc.font('Times-Roman');
        }

        // Add RTL support for notes
        const noteOptions = {
            width: 480,
            height: 40
        };

        if (isArabicNotes) {
            noteOptions.features = ['rtla'];
            noteOptions.bidi = true;
            noteOptions.align = 'right';
        }

        doc.text(data.notes, 60, notesY + 20, noteOptions);
    }

    // Footer section with terms - moved down
    const footerY = notesY + 70;

    doc.fillColor('#000000')
       .fontSize(8)
       .font('Times-Roman')
       .text('• After reviewing all form items, I confirm my approval of everything mentioned.', 50, footerY)
       .text('• Sold goods are non-returnable and non-exchangeable', 50, footerY + 15)
       .text('• Deposit is non-refundable', 50, footerY + 30);

    // Signature section with Sales Representative name
    const signatureY = footerY + 45;

    doc.fontSize(11)
       .font('Times-Bold')
       .fillColor(colors.primary)
       .text('Client Approval:', 50, signatureY)
       .text('Sales Representative:', 300, signatureY);

    // Add signature lines
    doc.strokeColor(colors.accent)
       .lineWidth(1)
       .moveTo(50, signatureY + 30)
       .lineTo(250, signatureY + 30)
       .stroke()
       .moveTo(300, signatureY + 30)
       .lineTo(545, signatureY + 30)
       .stroke();

    // Add Sales Representative name on the golden line
    if (data.salesRepresentative) {
        doc.fillColor(colors.primary)
           .fontSize(11)
           .font('Times-Italic')
           .text(data.salesRepresentative, 300, signatureY + 15, {
               width: 245,
               align: 'center'
           });
    }

    // Add watermark last (so it appears on top but transparent)
    drawWatermark(doc);
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(basePath, 'public', 'index.html'));
});

// Admin login page
app.get('/admin-login', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Login - Sales Invoice System</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #2C3E50 0%, #34495e 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .login-container {
                background: white;
                padding: 40px;
                border-radius: 15px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                text-align: center;
                max-width: 400px;
                width: 90%;
            }
            .logo {
                font-size: 2rem;
                font-weight: bold;
                color: #2C3E50;
                margin-bottom: 10px;
            }
            .subtitle {
                color: #666;
                margin-bottom: 30px;
            }
            input[type="password"] {
                width: 100%;
                padding: 15px;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                font-size: 1rem;
                margin-bottom: 20px;
                transition: border-color 0.3s;
            }
            input[type="password"]:focus {
                outline: none;
                border-color: #B8860B;
            }
            button {
                background: linear-gradient(135deg, #B8860B 0%, #996f0a 100%);
                color: white;
                border: none;
                padding: 15px 30px;
                font-size: 1.1rem;
                border-radius: 8px;
                cursor: pointer;
                width: 100%;
                transition: transform 0.3s;
            }
            button:hover {
                transform: translateY(-2px);
            }
            .error {
                color: #e74c3c;
                margin-top: 15px;
                display: none;
            }
            .back-link {
                margin-top: 20px;
            }
            .back-link a {
                color: #2C3E50;
                text-decoration: none;
            }
            .back-link a:hover {
                text-decoration: underline;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="logo">THEGROVE</div>
            <div class="subtitle">Admin Dashboard Access</div>
            <form id="loginForm">
                <input type="password" id="password" placeholder="Enter admin password" required>
                <button type="submit">🔐 Login to Dashboard</button>
            </form>
            <div class="error" id="errorMsg">❌ Invalid password. Please try again.</div>
            <div class="back-link">
                <a href="/">← Back to Invoice Generator</a>
            </div>
        </div>

        <script>
            document.getElementById('loginForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                const password = document.getElementById('password').value;
                
                try {
                    const response = await fetch('/admin-verify', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ password: password })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        window.location.href = '/admin-dashboard';
                    } else {
                        document.getElementById('errorMsg').style.display = 'block';
                        document.getElementById('password').value = '';
                        document.getElementById('password').focus();
                    }
                } catch (error) {
                    console.error('Login error:', error);
                    alert('Login error. Please try again.');
                }
            });
        </script>
    </body>
    </html>
    `);
});



// Admin settings page
app.get('/admin-settings', (req, res) => {
    const config = readConfig();
    
    res.send(`
    <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Settings - Sales Invoice System</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f8f9fa;
            color: #333;
        }
        .header {
            background: linear-gradient(135deg, #2C3E50 0%, #34495e 100%);
            color: white;
            padding: 20px 0;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 5px;
        }
        .container {
            max-width: 800px;
            margin: 40px auto;
            padding: 0 20px;
        }
        .settings-card {
            background: white;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            padding: 30px;
            margin-bottom: 30px;
        }
        .settings-title {
            font-size: 1.5rem;
            color: #2C3E50;
            margin-bottom: 20px;
            border-bottom: 2px solid #B8860B;
            padding-bottom: 10px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            font-weight: 600;
            color: #2C3E50;
            margin-bottom: 8px;
        }
        input[type="password"], input[type="text"] {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.3s;
        }
        input:focus {
            outline: none;
            border-color: #B8860B;
        }
        .btn {
            background: linear-gradient(135deg, #B8860B 0%, #996f0a 100%);
            color: white;
            border: none;
            padding: 12px 25px;
            font-size: 1rem;
            border-radius: 8px;
            cursor: pointer;
            transition: transform 0.3s;
            margin-right: 10px;
            margin-bottom: 10px;
        }
        .btn:hover {
            transform: translateY(-2px);
        }
        .btn-secondary {
            background: linear-gradient(135deg, #2C3E50 0%, #34495e 100%);
        }
        .btn-export {
            background: linear-gradient(135deg, #27ae60 0%, #229954 100%);
        }
        .btn-export-detailed {
            background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
        }
        .nav-links {
            text-align: center;
            margin-bottom: 30px;
        }
        .nav-links a {
            display: inline-block;
            margin: 0 15px;
            padding: 10px 20px;
            background: #B8860B;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            transition: background 0.3s;
        }
        .nav-links a:hover {
            background: #996f0a;
        }
        .success-msg, .error-msg {
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            display: none;
        }
        .success-msg {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .error-msg {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .info-text {
            color: #666;
            font-size: 0.9rem;
            margin-top: 5px;
        }
        .current-info {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 20px;
        }
        .export-section {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        .export-card {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }
        .export-card h4 {
            color: #2C3E50;
            margin-bottom: 10px;
        }
        .export-card p {
            font-size: 0.9rem;
            color: #666;
            margin-bottom: 15px;
        }
        .stats-info {
            background: #e8f4fd;
            border: 1px solid #bee5eb;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 20px;
        }
        .stats-info h4 {
            color: #2C3E50;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Admin Settings</h1>
        <p>System Configuration</p>
    </div>

    <div class="container">
        <div class="nav-links">
            <a href="/admin-dashboard">📊 Dashboard</a>
            <a href="/">🏠 Invoice Generator</a>
            <a href="/admin-login">🚪 Logout</a>
        </div>

        <!-- Data Export Section -->
        <div class="settings-card">
            <h2 class="settings-title">📱 Client Data Export</h2>
            
            <div class="stats-info" id="exportStats">
                <h4>Export Statistics</h4>
                <p id="statsText">Loading...</p>
            </div>
            
            <div class="export-section">
                <div class="export-card">
                    <h4>📋 Simple Phone List</h4>
                    <p>Export unique phone numbers as a simple text list, one per line. Perfect for importing into other systems.</p>
                    <button type="button" class="btn btn-export" onclick="exportPhones()">
                        📱 Export Phone Numbers
                    </button>
                </div>
                
                <div class="export-card">
                    <h4>📊 Detailed Client Report</h4>
                    <p>Export phone numbers with client names, invoice counts, and spending totals. Includes both detailed format and simple list.</p>
                    <button type="button" class="btn btn-export-detailed" onclick="exportPhonesDetailed()">
                        📈 Export Detailed Report
                    </button>
                </div>
            </div>
        </div>

        <!-- Security Settings Section -->
        <div class="settings-card">
            <h2 class="settings-title">🔐 Security Settings</h2>
            
            <div class="current-info">
                <strong>Last Password Change:</strong> <span id="lastPasswordChange">Loading...</span><br>
                <strong>Current Password:</strong> ••••••••
            </div>
            
            <div class="success-msg" id="successMsg">✅ Password updated successfully!</div>
            <div class="error-msg" id="errorMsg">❌ Error updating password. Please try again.</div>
            
            <form id="passwordForm">
                <div class="form-group">
                    <label for="currentPassword">Current Password</label>
                    <input type="password" id="currentPassword" name="currentPassword" required placeholder="Enter current password">
                </div>
                
                <div class="form-group">
                    <label for="newPassword">New Password</label>
                    <input type="password" id="newPassword" name="newPassword" required placeholder="Enter new password">
                    <div class="info-text">Choose a strong password for better security</div>
                </div>
                
                <div class="form-group">
                    <label for="confirmPassword">Confirm New Password</label>
                    <input type="password" id="confirmPassword" name="confirmPassword" required placeholder="Confirm new password">
                </div>
                
                <button type="submit" class="btn">🔐 Update Password</button>
                <button type="button" class="btn btn-secondary" onclick="window.location.href='/admin-dashboard'">Cancel</button>
            </form>
        </div>
        
        <!-- System Information Section -->
        <div class="settings-card">
            <h2 class="settings-title">📊 System Information</h2>
            <p><strong>Application:</strong> THEGROVE Sales Invoice System</p>
            <p><strong>Version:</strong> 1.0.0</p>
            <p><strong>Database File:</strong> sales_database.json</p>
            <p><strong>Config File:</strong> config.json</p>
        </div>
    </div>

    <script>
        // Load export statistics on page load
        document.addEventListener('DOMContentLoaded', function() {
            loadExportStats();
            loadPasswordInfo();
        });

        async function loadExportStats() {
            try {
                const response = await fetch('/api/invoices');
                const data = await response.json();
                
                // Calculate unique phone numbers
                const phoneNumbers = data.invoices
                    .map(invoice => invoice.phoneNumber)
                    .filter(phone => phone && phone.trim());
                
                const uniquePhones = [...new Set(phoneNumbers)];
                
document.getElementById('statsText').innerHTML = 
    '<strong>Total Invoices:</strong> ' + data.invoices.length + '<br>' +
    '<strong>Total Phone Entries:</strong> ' + phoneNumbers.length + '<br>' +
    '<strong>Unique Phone Numbers:</strong> ' + uniquePhones.length + '<br>' +
    '<strong>Duplicate Entries:</strong> ' + (phoneNumbers.length - uniquePhones.length);
            } catch (error) {
                document.getElementById('statsText').textContent = 'Error loading statistics';
                console.error('Error loading export stats:', error);
            }
        }

        function loadPasswordInfo() {
            // This would be loaded from server - for now showing placeholder
            document.getElementById('lastPasswordChange').textContent = new Date().toLocaleDateString();
        }

        async function exportPhones() {
            try {
                const response = await fetch('/admin-export-phones');
                if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = 'thegrove-phone-numbers.txt';
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    
                    alert('✅ Phone numbers exported successfully!');
                } else {
                    throw new Error('Export failed');
                }
            } catch (error) {
                console.error('Export error:', error);
                alert('❌ Error exporting phone numbers. Please try again.');
            }
        }

        async function exportPhonesDetailed() {
            try {
                const response = await fetch('/admin-export-phones-detailed');
                if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = 'thegrove-clients-detailed.txt';
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    
                    alert('✅ Detailed client report exported successfully!');
                } else {
                    throw new Error('Export failed');
                }
            } catch (error) {
                console.error('Export error:', error);
                alert('❌ Error exporting detailed report. Please try again.');
            }
        }

        // Password form handling
        document.getElementById('passwordForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            // Validate passwords match
            if (newPassword !== confirmPassword) {
                showError('New passwords do not match!');
                return;
            }
            
            // Validate password length
            if (newPassword.length < 3) {
                showError('Password must be at least 3 characters long!');
                return;
            }
            
            try {
                const response = await fetch('/admin-change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        currentPassword: currentPassword,
                        newPassword: newPassword
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showSuccess('Password updated successfully!');
                    document.getElementById('passwordForm').reset();
                } else {
                    showError(result.message || 'Error updating password');
                }
            } catch (error) {
                console.error('Error:', error);
                showError('Connection error. Please try again.');
            }
        });
        
        function showSuccess(message) {
            const successMsg = document.getElementById('successMsg');
            const errorMsg = document.getElementById('errorMsg');
            successMsg.textContent = '✅ ' + message;
            successMsg.style.display = 'block';
            errorMsg.style.display = 'none';
            setTimeout(() => successMsg.style.display = 'none', 5000);
        }
        
        function showError(message) {
            const errorMsg = document.getElementById('errorMsg');
            const successMsg = document.getElementById('successMsg');
            errorMsg.textContent = '❌ ' + message;
            errorMsg.style.display = 'block';
            successMsg.style.display = 'none';
            setTimeout(() => errorMsg.style.display = 'none', 5000);
        }
    </script>
</body>
</html>
    `);
});



// Change password endpoint
app.post('/admin-change-password', (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const config = readConfig();
    
    // Verify current password
    if (currentPassword !== config.admin.password) {
        return res.json({ success: false, message: 'Current password is incorrect' });
    }
    
    // Update password
    config.admin.password = newPassword;
    config.admin.lastPasswordChange = new Date().toISOString();
    
    if (updateConfig(config)) {
        console.log('🔐 Admin password updated successfully');
        res.json({ success: true, message: 'Password updated successfully' });
    } else {
        res.json({ success: false, message: 'Error saving new password' });
    }
});

// Admin password verification endpoint
app.post('/admin-verify', (req, res) => {
    const { password } = req.body;
    const config = readConfig();
    
    if (password === config.admin.password) {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Invalid password' });
    }
});

// ✨ ADD THE NEW PHONE EXPORT CODE RIGHT HERE ✨
// Export unique phone numbers endpoint
app.get('/admin-export-phones', (req, res) => {
    try {
        const db = readDatabase();
        
        // Extract all phone numbers from invoices
        const phoneNumbers = db.invoices
            .map(invoice => invoice.phoneNumber)
            .filter(phone => phone && phone.trim()) // Remove empty/null phone numbers
            .map(phone => phone.trim()); // Clean whitespace
        
        // Remove duplicates using Set
        const uniquePhones = [...new Set(phoneNumbers)];
        
        // Sort the phone numbers for better organization
        uniquePhones.sort();
        
        // Create the text content
        const textContent = uniquePhones.join('\n');
        
        // Set headers for file download
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', 'attachment; filename="thegrove-phone-numbers.txt"');
        res.send(textContent);
        
        console.log(`📱 Exported ${uniquePhones.length} unique phone numbers out of ${phoneNumbers.length} total`);
        
    } catch (error) {
        console.error('Error exporting phone numbers:', error);
        res.status(500).json({ error: 'Failed to export phone numbers' });
    }
});

// Export phone numbers with client names (alternative format)
app.get('/admin-export-phones-detailed', (req, res) => {
    try {
        const db = readDatabase();
        
        // Create a map to store unique phone numbers with client names
        const phoneMap = new Map();
        
        db.invoices.forEach(invoice => {
            if (invoice.phoneNumber && invoice.phoneNumber.trim()) {
                const phone = invoice.phoneNumber.trim();
                if (!phoneMap.has(phone)) {
                    phoneMap.set(phone, {
                        phone: phone,
                        clientName: invoice.clientName || 'Unknown',
                        invoiceCount: 1,
                        firstInvoice: invoice.invoiceNumber || 'N/A',
                        lastInvoice: invoice.invoiceNumber || 'N/A',
                        totalAmount: parseFloat(invoice.totalAmount) || 0
                    });
                } else {
                    // Update existing entry
                    const existing = phoneMap.get(phone);
                    existing.invoiceCount++;
                    existing.lastInvoice = invoice.invoiceNumber || 'N/A';
                    existing.totalAmount += parseFloat(invoice.totalAmount) || 0;
                }
            }
        });
        
        // Convert to array and sort by phone number
        const phoneData = Array.from(phoneMap.values()).sort((a, b) => a.phone.localeCompare(b.phone));
        
        // Create detailed text content
        let textContent = `THEGROVE - Client Phone Numbers Export\n`;
        textContent += `Generated: ${new Date().toLocaleString()}\n`;
        textContent += `Total Unique Numbers: ${phoneData.length}\n`;
        textContent += `${'='.repeat(50)}\n\n`;
        
        phoneData.forEach((client, index) => {
            textContent += `${index + 1}. ${client.clientName}\n`;
            textContent += `   Phone: ${client.phone}\n`;
            textContent += `   Invoices: ${client.invoiceCount}\n`;
            textContent += `   Total Spent: $${client.totalAmount.toFixed(2)}\n`;
            textContent += `   First Invoice: ${client.firstInvoice}\n`;
            textContent += `   Last Invoice: ${client.lastInvoice}\n\n`;
        });
        
        // Simple list at the end for easy copying
        textContent += `${'='.repeat(50)}\n`;
        textContent += `PHONE NUMBERS ONLY (for easy copying):\n`;
        textContent += `${'='.repeat(50)}\n`;
        phoneData.forEach(client => {
            textContent += `${client.phone}\n`;
        });
        
        // Set headers for file download
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="thegrove-clients-detailed.txt"');
        res.send(textContent);
        
        console.log(`📱 Exported ${phoneData.length} unique clients with detailed information`);
        
    } catch (error) {
        console.error('Error exporting detailed phone numbers:', error);
        res.status(500).json({ error: 'Failed to export detailed phone numbers' });
    }
});


// Admin dashboard
app.get('/admin-dashboard', (req, res) => {
    const db = readDatabase();
    
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Dashboard - Sales Invoice System</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: #f8f9fa;
                color: #333;
            }
            .header {
                background: linear-gradient(135deg, #2C3E50 0%, #34495e 100%);
                color: white;
                padding: 20px 0;
                text-align: center;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header h1 {
                font-size: 2.5rem;
                margin-bottom: 5px;
            }
            .header p {
                font-size: 1.1rem;
                opacity: 0.9;
            }
            .container {
                max-width: 1400px;
                margin: 0 auto;
                padding: 30px 20px;
            }
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin-bottom: 40px;
            }
            .stat-card {
                background: white;
                padding: 25px;
                border-radius: 10px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                text-align: center;
            }
            .stat-card .number {
                font-size: 2.5rem;
                font-weight: bold;
                color: #2C3E50;
                margin-bottom: 5px;
            }
            .stat-card .label {
                font-size: 1.1rem;
                color: #666;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .invoices-section {
                background: white;
                border-radius: 15px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .section-header {
                background: #2C3E50;
                color: white;
                padding: 20px 30px;
                font-size: 1.3rem;
                font-weight: 600;
            }
            .table-container {
                overflow-x: auto;
                max-height: 600px;
            }
            .invoices-table {
                width: 100%;
                border-collapse: collapse;
            }
            .invoices-table th {
                background: #f8f9fa;
                padding: 15px 10px;
                text-align: left;
                font-weight: 600;
                color: #2C3E50;
                border-bottom: 2px solid #e0e0e0;
                white-space: nowrap;
                position: sticky;
                top: 0;
            }
            .invoices-table td {
                padding: 12px 10px;
                border-bottom: 1px solid #e0e0e0;
                white-space: nowrap;
            }
            .invoices-table tbody tr:hover {
                background: #f8f9fa;
            }
            .amount {
                font-weight: 600;
                color: #B8860B;
            }
            .date {
                color: #666;
                font-size: 0.9rem;
            }
            .status-paid {
                background: #27ae60;
                color: white;
                padding: 3px 8px;
                border-radius: 12px;
                font-size: 0.8rem;
            }
            .status-pending {
                background: #f39c12;
                color: white;
                padding: 3px 8px;
                border-radius: 12px;
                font-size: 0.8rem;
            }
            .nav-links {
                text-align: center;
                margin-bottom: 30px;
            }
            .nav-links a {
                display: inline-block;
                margin: 0 15px;
                padding: 10px 20px;
                background: #B8860B;
                color: white;
                text-decoration: none;
                border-radius: 6px;
                transition: background 0.3s;
            }
            .nav-links a:hover {
                background: #996f0a;
            }
            .search-box {
                margin: 20px 30px;
            }
            .search-box input {
                width: 100%;
                max-width: 400px;
                padding: 10px 15px;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                font-size: 1rem;
            }
            .search-box input:focus {
                outline: none;
                border-color: #B8860B;
            }
            .no-data {
                text-align: center;
                padding: 50px;
                color: #666;
                font-style: italic;
            }
            .refresh-btn {
                position: fixed;
                bottom: 30px;
                right: 30px;
                background: #B8860B;
                color: white;
                border: none;
                padding: 15px;
                border-radius: 50px;
                font-size: 1.2rem;
                cursor: pointer;
                box-shadow: 0 5px 15px rgba(184, 134, 11, 0.3);
                transition: transform 0.3s;
            }
            .refresh-btn:hover {
                transform: translateY(-2px);
            }
            @media (max-width: 768px) {
                .container {
                    padding: 20px 10px;
                }
                .header h1 {
                    font-size: 2rem;
                }
                .invoices-table {
                    font-size: 0.9rem;
                }
                .invoices-table th,
                .invoices-table td {
                    padding: 8px 5px;
                }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>THEGROVE Admin Dashboard</h1>
            <p>Sales Invoice Management System</p>
        </div>

        <div class="container">
            <div class="nav-links">
                <a href="/">🏠 Invoice Generator</a>
                <a href="/admin-dashboard">🔄 Refresh Dashboard</a>
                <a href="/admin-settings">⚙️ Settings</a>
                <a href="/admin-login">🚪 Logout</a>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="number">${db.stats.totalSales}</div>
                    <div class="label">Total Sales</div>
                </div>
                <div class="stat-card">
                    <div class="number">$${db.stats.totalAmount.toLocaleString()}</div>
                    <div class="label">Total Revenue</div>
                </div>
                <div class="stat-card">
                    <div class="number">${db.stats.totalSales > 0 ? Math.round(db.stats.totalAmount / db.stats.totalSales) : 0}</div>
                    <div class="label">Avg. Invoice</div>
                </div>
                <div class="stat-card">
                    <div class="number">${db.invoices.filter(inv => parseFloat(inv.remainingAmount) > 0).length}</div>
                    <div class="label">Pending Payments</div>
                </div>
            </div>

            <div class="invoices-section">
                <div class="section-header">
                    📊 All Sales Invoices (${db.invoices.length} total)
                </div>
                
                <div class="search-box">
                    <input type="text" id="searchInput" placeholder="🔍 Search by invoice number, client name, or sales rep...">
                </div>

                <div class="table-container">
                    ${db.invoices.length > 0 ? `
                    <table class="invoices-table" id="invoicesTable">
                        <thead>
                            <tr>
                                <th>Invoice #</th>
                                <th>Date</th>
                                <th>Client Name</th>
                                <th>Phone</th>
                                <th>Sales Rep</th>
                                <th>Total Amount</th>
                                <th>Amount Received</th>
                                <th>Remaining</th>
                                <th>Status</th>
                                <th>Items</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${db.invoices.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(invoice => `
                                <tr>
                                    <td><strong>${invoice.invoiceNumber}</strong></td>
                                    <td class="date">${new Date(invoice.timestamp).toLocaleDateString()}<br>
                                        <small>${new Date(invoice.timestamp).toLocaleTimeString()}</small></td>
                                    <td><strong>${invoice.clientName}</strong></td>
                                    <td>${invoice.phoneNumber || 'N/A'}</td>
                                    <td>${invoice.salesRepresentative}</td>
                                    <td class="amount">$${parseFloat(invoice.totalAmount).toFixed(2)}</td>
                                    <td class="amount">$${parseFloat(invoice.amountReceived).toFixed(2)}</td>
                                    <td class="amount">$${parseFloat(invoice.remainingAmount).toFixed(2)}</td>
                                    <td>
                                        <span class="${parseFloat(invoice.remainingAmount) <= 0 ? 'status-paid' : 'status-pending'}">
                                            ${parseFloat(invoice.remainingAmount) <= 0 ? 'PAID' : 'PENDING'}
                                        </span>
                                    </td>
                                    <td>
                                        <small>${invoice.items.filter(item => item.description).length} items</small><br>
                                        ${invoice.items.slice(0, 2).map(item => item.description ? `<small>${item.description}</small>` : '').join('<br>')}
                                        ${invoice.items.length > 2 ? '<small>...</small>' : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ` : '<div class="no-data">📝 No invoices generated yet. Start by creating your first invoice!</div>'}
                </div>
            </div>
        </div>

        <button class="refresh-btn" onclick="location.reload()">🔄</button>

        <script>
            // Search functionality
            document.getElementById('searchInput')?.addEventListener('input', function() {
                const searchTerm = this.value.toLowerCase();
                const table = document.getElementById('invoicesTable');
                if (!table) return;
                
                const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');
                
                for (let row of rows) {
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(searchTerm) ? '' : 'none';
                }
            });

            // Auto refresh every 30 seconds
            setInterval(() => {
                location.reload();
            }, 30000);
        </script>
    </body>
    </html>
    `);
});

// API endpoint to get all invoices (for external access)
app.get('/api/invoices', (req, res) => {
    const db = readDatabase();
    res.json(db);
});

// API endpoint to get specific invoice
app.get('/api/invoice/:id', (req, res) => {
    const db = readDatabase();
    const invoice = db.invoices.find(inv => inv.id == req.params.id);
    
    if (invoice) {
        res.json(invoice);
    } else {
        res.status(404).json({ error: 'Invoice not found' });
    }
});

app.post('/generate-pdf', (req, res) => {
    try {
        const formData = req.body;
        
        // Save invoice to database
        const savedInvoice = saveInvoiceToDatabase(formData);
        
        generateInvoicePDF(formData, res);
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
});

// Replace your entire /send-whatsapp route with this updated version:

app.post('/send-whatsapp', async (req, res) => {
    try {
        const formData = req.body;
        
        console.log('📱 Starting WhatsApp send with approved template...');
        
        // Validate phone number
        if (!formData.phoneNumber) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required to send via WhatsApp'
            });
        }
        
        // Save invoice to database
        const savedInvoice = saveInvoiceToDatabase(formData);
        console.log('💾 Invoice saved to database');
        
        // Generate PDF buffer
        const pdfBuffer = await generateInvoicePDFBuffer(formData);
        console.log('📄 PDF generated successfully');
        
        // Create temporary PDF file
        const tempPdfPath = path.join(basePath, 'temp_invoices');
        if (!fs.existsSync(tempPdfPath)) {
            fs.mkdirSync(tempPdfPath, { recursive: true });
        }
        
        const fileName = `invoice-${formData.invoiceNumber || Date.now()}.pdf`;
        const filePath = path.join(tempPdfPath, fileName);
        
        // Save PDF to temp directory
        fs.writeFileSync(filePath, pdfBuffer);
        console.log('💾 PDF saved:', fileName);
        
        // Format phone number
        const whatsappNumber = formatPhoneForWhatsApp(formData.phoneNumber);
        console.log('📞 Formatted phone number:', whatsappNumber);
        
        // Format items for template
        const itemsList = formData.items ? 
            formData.items.filter(item => item.description).map(item => 
                `◦ ${item.description} ${item.qty > 1 ? `(${item.qty} pieces)` : ''}\n   $${item.finalPrice || item.price || '0.00'}`
            ).join('\n\n') : 'Custom curated selection';
        
        console.log('📋 Items formatted for template');
        
        // Get server IP for PDF URL
        const ipAddress = getLocalIPAddress();
        const pdfUrl = `http://${ipAddress}:${PORT}/temp-pdf/${fileName}`;
        console.log('🔗 PDF URL:', pdfUrl);

        // Send WhatsApp message using approved template
        const messageResponse = await twilioClient.messages.create({
            from: TWILIO_WHATSAPP_NUMBER,
            to: whatsappNumber,
            contentSid: 'HX05a44640a19e49aa20da91e00e70885c', // Your approved template SID
            contentVariables: JSON.stringify({
                "1": formData.invoiceNumber || 'N/A',
                "2": formData.date || new Date().toLocaleDateString(),
                "3": formData.clientName || 'Valued Client',
                "4": formData.salesRepresentative || 'Personal Consultant',
                "5": itemsList,
                "6": formData.totalAmount || '0.00',
                "7": formData.amountReceived || '0.00',
                "8": formData.remainingAmount || '0.00',
                "9": formData.deliveryDate || 'As arranged',
                "10": fileName // This should match your media URL template variable
            })
        });

        console.log('✅ WhatsApp message sent using approved template!');
        console.log('📱 To:', whatsappNumber);
        console.log('📄 PDF:', fileName);
        console.log('🆔 Message SID:', messageResponse.sid);
        console.log('📋 Template SID:', 'HX05a44640a19e49aa20da91e00e70885c');

        // Return success response
        res.json({
            success: true,
            message: 'Invoice sent successfully via WhatsApp using approved template!',
            phoneNumber: formData.phoneNumber,
            whatsappNumber: whatsappNumber,
            fileName: fileName,
            messageSid: messageResponse.sid,
            templateSid: 'HX05a44640a19e49aa20da91e00e70885c',
            pdfUrl: pdfUrl
        });

        // Schedule PDF cleanup after 30 minutes
        setTimeout(() => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`🗑️ Cleaned up temp PDF: ${fileName}`);
                }
            } catch (cleanupError) {
                console.log('Could not delete temp file:', cleanupError.message);
            }
        }, 30 * 60 * 1000); // 30 minutes

    } catch (error) {
        console.error('❌ Error sending WhatsApp message:', error);
        
        let errorMessage = 'Failed to send WhatsApp message';
        
        // Handle specific Twilio errors
        if (error.code === 21211) {
            errorMessage = 'Invalid phone number format';
        } else if (error.code === 21408) {
            errorMessage = 'Permission to send to this number has not been granted (Sandbox requires join)';
        } else if (error.code === 21610) {
            errorMessage = 'Phone number is not a valid WhatsApp number';
        } else if (error.status === 401) {
            errorMessage = 'Invalid Twilio credentials - check Account SID and Auth Token';
        } else if (error.code === 21617) {
            errorMessage = 'Template content issue - check your template variables';
        }
        
        res.status(500).json({
            success: false,
            error: errorMessage,
            details: error.message,
            code: error.code
        });
    }
});

// Serve temporary PDF files
app.get('/temp-pdf/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(basePath, 'temp_invoices', filename);
    
    if (fs.existsSync(filePath)) {
        res.download(filePath, (err) => {
            if (!err) {
                // Delete temp file after download
                setTimeout(() => {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (deleteError) {
                        console.log('Could not delete temp file:', deleteError.message);
                    }
                }, 5000); // Delete after 5 seconds
            }
        });
    } else {
        res.status(404).send('File not found');
    }
});

// Clean up old temp files (run periodically)
function cleanupTempFiles() {
    const tempDir = path.join(basePath, 'temp_invoices');
    if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        const now = Date.now();
        
        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            const stats = fs.statSync(filePath);
            const fileAge = now - stats.mtime.getTime();
            
            // Delete files older than 1 hour
            if (fileAge > 60 * 60 * 1000) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`🗑️ Cleaned up old temp file: ${file}`);
                } catch (error) {
                    console.log('Could not delete old temp file:', error.message);
                }
            }
        });
    }
}

// Run cleanup every hour
setInterval(cleanupTempFiles, 60 * 60 * 1000);

// Get computer's IP address for mobile access
function getLocalIPAddress() {
    const nets = require('os').networkInterfaces();
    const results = {};

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                if (!results[name]) {
                    results[name] = [];
                }
                results[name].push(net.address);
            }
        }
    }

    const addresses = Object.values(results).flat();
    return addresses[0] || 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
    const ipAddress = getLocalIPAddress();
    console.log('🚀 Invoice Generator Started Successfully!');
    console.log('╔═══════════════════════════════════════════╗');
    console.log(`📱 Open in browser:`);
    console.log(` Local: http://localhost:${PORT}`);
    console.log(` Network: http://${ipAddress}:${PORT}`);
    console.log(` Admin: http://localhost:${PORT}/admin-login`);
    console.log('╚═══════════════════════════════════════════╝');
    console.log('📱 For mobile access: Use the Network URL');
    console.log('🔐 Admin password: 123');
    console.log('🛑 To stop: Press Ctrl+C');
    console.log('╚═══════════════════════════════════════════╝');
});