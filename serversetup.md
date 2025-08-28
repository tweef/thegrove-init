# Sales Invoice Generator

A beautiful, locally hosted web application for generating professional sales invoices with PDF export functionality.

## 🚀 Features

- **Beautiful Web Interface**: Modern, responsive form design
- **Real-time Calculations**: Automatic calculation of totals, discounts, and remaining amounts
- **Dynamic Items**: Add/remove invoice items dynamically
- **PDF Generation**: High-quality PDF export with your original luxury design
- **Local Hosting**: Runs entirely on your machine - no internet required
- **Professional Design**: Maintains your original color scheme and branding

## 📁 Project Structure

```
sales-invoice-generator/
├── server.js              # Express server with PDF generation
├── package.json           # Project dependencies
├── public/
│   └── index.html         # Web form interface
├── logo.png               # Your company logo (optional)
└── README.md              # This file
```

## 🛠️ Setup Instructions

### 1. Prerequisites

Make sure you have **Node.js** installed on your machine:
- Download from: https://nodejs.org/
- Choose the LTS (Long Term Support) version

### 2. Create Project Directory

```bash
mkdir sales-invoice-generator
cd sales-invoice-generator
```

### 3. Create Project Files

Create the following files in your project directory:

1. **server.js** - Copy the Express server code
2. **package.json** - Copy the dependencies configuration
3. Create a **public** folder and add **index.html** inside it
4. **(Optional)** Add your **logo.png** file for branding

### 4. Install Dependencies

Run the following command in your project directory:

```bash
npm install
```

This will install:
- `express` - Web server framework
- `pdfkit` - PDF generation library
- `nodemon` - Development server (auto-restart)

### 5. Start the Application

```bash
npm start
```

Or for development (auto-restart on changes):

```bash
npm run dev
```

### 6. Access the Application

Open your web browser and go to:
```
http://localhost:3000
```

## 📋 How to Use

1. **Fill out the form** with your invoice details:
   - Basic information (Invoice number, date)
   - Client information (name, phone, address, etc.)
   - Invoice items (with automatic calculations)
   - Financial summary
   - Delivery information
   - Additional notes

2. **Add/Remove Items**: Use the "Add Another Item" button to add more products, or "Remove" to delete items

3. **Automatic Calculations**: The form automatically calculates:
   - Final price per item (with discounts)
   - Total amount
   - Remaining amount after payments

4. **Generate PDF**: Click "Generate Invoice PDF" to download your professional invoice

## 🎨 Customization

### Adding Your Logo

1. Place your logo file as `logo.png` in the project root directory
2. The logo will automatically appear on the invoice
3. Recommended size: 130px width, 75px height

### Changing Colors

Edit the `colors` object in `server.js`:

```javascript
const colors = {
    primary: '#2C3E50',      // Deep navy
    accent: '#B8860B',       // Dark gold
    lightGray: '#F8F9FA'     // Light gray
};
```

### Modifying the Form

Edit `public/index.html` to:
- Add new fields
- Change styling
- Modify layout
- Update validation rules

## 🔧 Troubleshooting

### Port Already in Use

If port 3000 is busy, modify `server.js`:

```javascript
const PORT = 3001; // or any other port
```

### Missing Dependencies

If you get errors about missing modules:

```bash
npm install
```

### Logo Not Showing

- Ensure `logo.png` is in the project root directory
- Check file name spelling and case sensitivity
- The app will show a placeholder if logo is missing

## 📝 Sample Data

Here's an example of how to fill out the form:

- **Invoice Number**: INV-2024-001
- **Client Name**: John Smith
- **Phone**: +1 (555) 123-4567
- **Address**: 123 Main St, Anytown, ST 12345
- **Items**: 
  - Code: LAPTOP001, Description: Gaming Laptop, Qty: 1, Price: 1200.00
  - Code: MOUSE001, Description: Wireless Mouse, Qty: 2, Price: 25.00

## 🎯 Benefits

- **No Internet Required**: Works completely offline
- **Data Privacy**: All data stays on your machine
- **Professional Output**: High-quality PDF invoices
- **Easy to Use**: Intuitive web interface
- **Customizable**: Easy to modify for your needs
- **Fast**: Instant PDF generation

## 📞 Support

If you encounter any issues:

1. Check that all files are in the correct locations
2. Ensure Node.js is properly installed
3. Run `npm install` to install dependencies
4. Check the console for error messages

---

**Enjoy your new Sales Invoice Generator!** 🎉