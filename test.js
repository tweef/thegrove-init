const PDFDocument = require('pdfkit');
const fs = require('fs');

// Create a new PDF document
const doc = new PDFDocument({
    size: 'A4',
    margins: {
        top: 50,
        bottom: 50,
        left: 50,
        right: 50
    }
});

// Pipe the PDF to a file
doc.pipe(fs.createWriteStream('sales-invoice-template.pdf'));

// Simple luxury colors
const colors = {
    primary: '#2C3E50',      // Deep navy
    accent: '#B8860B',       // Dark gold
    lightGray: '#F8F9FA'     // Light gray
};

// Helper function to draw table cell
function drawCell(x, y, width, height, text, options = {}) {
    const { 
        align = 'left', 
        fontSize = 10, 
        bold = false, 
        fillColor = '#FFFFFF',
        textColor = '#000000',
        borderColor = '#000000',
        padding = 5 
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
        doc.fillColor(textColor)
           .fontSize(fontSize)
           .font(bold ? 'Helvetica-Bold' : 'Helvetica');
        
        let textX = x + padding;
        let textY = y + (height - fontSize) / 2; // Center vertically
        
        if (align === 'center') {
            textX = x + (width - doc.widthOfString(text)) / 2;
        } else if (align === 'right') {
            textX = x + width - doc.widthOfString(text) - padding;
        }
        
        doc.text(text, textX, textY);
    }
}

// Start building the form
let currentY = 50;

// Add subtle top accent line
doc.strokeColor(colors.accent)
   .lineWidth(2)
   .moveTo(50, currentY)
   .lineTo(545, currentY)
   .stroke();

currentY += 10;

// Company info area (right side) - enhanced - aligned with logo
doc.fillColor(colors.primary)
   .fontSize(18)
   .font('Helvetica-Bold')
   .text('SALES INVOICE', 380, currentY + 10);

// Add invoice number field
doc.fillColor('#666666')
   .fontSize(10)
   .font('Helvetica')
   .text('Invoice #: ________________', 380, currentY + 35);

// Add logo (you'll need to have logo.png in your directory) - positioned to align with SALES INVOICE
try {
    doc.image('logo.png', 50, currentY + 10, { width: 130 });
} catch (error) {
    // If logo doesn't exist, create a placeholder - aligned with text
    doc.fillColor('#E0E0E0')
       .rect(50, currentY + 10, 130, 75)
       .fill();
    doc.fillColor('#666666')
       .fontSize(14)
       .text('LOGO', 100, currentY + 42);
}

currentY += 70;

// Header information section
const infoHeaderY = currentY;
const fieldWidth = 100;
const fieldHeight = 25;

// Top row: Client Name, Phone Number - with subtle luxury styling
drawCell(50, infoHeaderY, fieldWidth, fieldHeight, 'Client Name:', { 
    bold: true, 
    fillColor: colors.lightGray, 
    align: 'center',
    textColor: colors.primary
});
drawCell(150, infoHeaderY, 147.5, fieldHeight, '', { fillColor: '#FFFFFF' });

drawCell(297.5, infoHeaderY, fieldWidth, fieldHeight, 'Phone Number:', { 
    bold: true, 
    fillColor: colors.lightGray, 
    align: 'center',
    textColor: colors.primary
});
drawCell(397.5, infoHeaderY, 147.5, fieldHeight, '', { fillColor: '#FFFFFF' });

// Second row: Address, Account Number  
const row2Y = infoHeaderY + fieldHeight;
drawCell(50, row2Y, fieldWidth, fieldHeight, 'Address:', { 
    bold: true, 
    fillColor: colors.lightGray, 
    align: 'center',
    textColor: colors.primary
});
drawCell(150, row2Y, 147.5, fieldHeight, '', { fillColor: '#FFFFFF' });

drawCell(297.5, row2Y, fieldWidth, fieldHeight, 'Account Number:', { 
    bold: true, 
    fillColor: colors.lightGray, 
    align: 'center',
    textColor: colors.primary
});
drawCell(397.5, row2Y, 147.5, fieldHeight, '', { fillColor: '#FFFFFF' });

// Third row: Address Title, Entry Number
const row3Y = row2Y + fieldHeight;
drawCell(50, row3Y, fieldWidth, fieldHeight, 'Address Title:', { 
    bold: true, 
    fillColor: colors.lightGray, 
    align: 'center',
    textColor: colors.primary
});
drawCell(150, row3Y, 147.5, fieldHeight, '', { fillColor: '#FFFFFF' });

drawCell(297.5, row3Y, fieldWidth, fieldHeight, 'Entry Number:', { 
    bold: true, 
    fillColor: colors.lightGray, 
    align: 'center',
    textColor: colors.primary
});
drawCell(397.5, row3Y, 147.5, fieldHeight, '', { fillColor: '#FFFFFF' });

currentY = row3Y + fieldHeight + 20;

// Date and Day section
const dateY = currentY;
drawCell(50, dateY, 100, fieldHeight, 'Day:', { 
    bold: true, 
    fillColor: colors.lightGray, 
    align: 'center',
    textColor: colors.primary
});
drawCell(150, dateY, 147.5, fieldHeight, '', { fillColor: '#FFFFFF' });

drawCell(297.5, dateY, 100, fieldHeight, 'Date:', { 
    bold: true, 
    fillColor: colors.lightGray, 
    align: 'center',
    textColor: colors.primary
});
drawCell(397.5, dateY, 147.5, fieldHeight, '', { fillColor: '#FFFFFF' });

currentY = dateY + fieldHeight + 15;

// Main table
const tableStartY = currentY;
const colWidths = [60, 180, 50, 60, 60, 85];
let tableX = 50;

// Table headers - enhanced with luxury colors
const headers = ['Code', 'Description', 'Qty', 'Price', 'Disc %', 'Final Price'];
let tableHeaderY = tableStartY;

headers.forEach((header, index) => {
    drawCell(tableX, tableHeaderY, colWidths[index], 30, header, { 
        bold: true, 
        fillColor: colors.primary, 
        textColor: '#FFFFFF',
        align: 'center',
        fontSize: 10
    });
    tableX += colWidths[index];
});

// Table rows (8 empty rows for items)
const rowHeight = 25;
for (let row = 0; row < 8; row++) {
    tableX = 50;
    const rowY = tableHeaderY + 30 + (row * rowHeight);
    
    colWidths.forEach((width, index) => {
        drawCell(tableX, rowY, width, rowHeight, '', { fillColor: '#FFFFFF' });
        tableX += width;
    });
}

// Summary section
const summaryY = tableHeaderY + 30 + (8 * rowHeight);
const summaryX = 50;

// Total Amount
drawCell(summaryX, summaryY, 120, 25, 'Total Amount:', { 
    bold: true, 
    fillColor: colors.lightGray, 
    align: 'center',
    textColor: colors.primary
});
drawCell(summaryX + 120, summaryY, 100, 25, '', { fillColor: '#FFFFFF' });

// Amount Received
drawCell(summaryX, summaryY + 25, 120, 25, 'Amount Received:', { 
    bold: true, 
    fillColor: colors.lightGray, 
    align: 'center',
    textColor: colors.primary
});
drawCell(summaryX + 120, summaryY + 25, 100, 25, '', { fillColor: '#FFFFFF' });

// Remaining Amount
drawCell(summaryX, summaryY + 50, 120, 25, 'Remaining Amount:', { 
    bold: true, 
    fillColor: colors.lightGray, 
    align: 'center',
    textColor: colors.primary
});
drawCell(summaryX + 120, summaryY + 50, 100, 25, '', { fillColor: '#FFFFFF' });

// Delivery section (right side)
const deliveryX = 330;
drawCell(deliveryX, summaryY, 110, 25, 'Delivery Day:', { 
    bold: true, 
    fillColor: colors.lightGray, 
    align: 'center',
    textColor: colors.primary
});
drawCell(deliveryX + 110, summaryY, 105, 25, '', { fillColor: '#FFFFFF' });

drawCell(deliveryX, summaryY + 25, 110, 50, 'Delivery Date:', { 
    bold: true, 
    fillColor: colors.lightGray, 
    align: 'center',
    textColor: colors.primary
});
drawCell(deliveryX + 110, summaryY + 25, 105, 50, '', { fillColor: '#FFFFFF' });

// Notes section with subtle enhancement
const notesY = summaryY + 80;

// Draw the main notes border
doc.strokeColor('#000000')
   .lineWidth(0.5)
   .rect(50, notesY + 10, 495, 50)
   .stroke();

// Create legend effect by drawing white background for "Notes:" text
doc.fillColor('#FFFFFF')
   .rect(60, notesY + 5, 50, 10)
   .fill();

// Add "Notes:" text on top of the border - enhanced
doc.fillColor(colors.primary)
   .fontSize(12)
   .font('Helvetica-Bold')
   .text('Notes:', 65, notesY + 7);

// Footer section with terms
const footerY = notesY + 70;

// Bullet point 1
doc.fillColor('#000000')
   .fontSize(10)
   .font('Helvetica')
   .text('• After reviewing all form items, I confirm my approval of everything mentioned.', 50, footerY);

// Bullet point 2
doc.text('• Sold goods are non-returnable and non-exchangeable', 50, footerY + 20);

// Bullet point 3  
doc.text('• Deposit is non-refundable', 50, footerY + 40);

// Signature section with enhanced styling
const signatureY = footerY + 70;

// Client approval signature section
doc.fontSize(12)
   .font('Helvetica-Bold')
   .fillColor(colors.primary)
   .text('Client Approval:', 50, signatureY);

// Add signature line for client - enhanced with accent color
doc.strokeColor(colors.accent)
   .lineWidth(1)
   .moveTo(50, signatureY + 40)
   .lineTo(250, signatureY + 40)
   .stroke();

// Sales representative signature section  
doc.fontSize(12)
   .font('Helvetica-Bold')
   .fillColor(colors.primary)
   .text('Sales Representative Signature:', 300, signatureY);

// Add signature line for sales rep - enhanced with accent color
doc.strokeColor(colors.accent)
   .lineWidth(1)
   .moveTo(300, signatureY + 40)
   .lineTo(545, signatureY + 40)
   .stroke();

// Date lines under signatures
doc.fontSize(10)
   .font('Helvetica')
   .fillColor('#666666')
   .text('Date: ________________', 50, signatureY + 50);

doc.fontSize(10)
   .font('Helvetica')
   .fillColor('#666666')
   .text('Date: ________________', 300, signatureY + 50);

// Finalize the PDF
doc.end();

console.log('Sales invoice template created successfully! Check sales-invoice-template.pdf');
console.log('Make sure you have logo.png in the same directory as this script.');

