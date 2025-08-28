# 📧 Email Setup Guide

Your invoice generator now includes email functionality! Here's how to set it up:

## 🚀 Quick Setup Steps

### 1. Install New Dependencies

Run this command in your project directory:

```bash
npm install nodemailer
```

### 2. Configure Gmail Account

You need to set up a Gmail account to send emails. Here's how:

#### Option A: Use Your Existing Gmail
1. Go to your **Google Account settings**
2. Navigate to **Security** → **2-Step Verification** 
3. Scroll down to **App passwords**
4. Generate a new app password for "Mail"
5. Copy the 16-character password

#### Option B: Create a New Gmail Account
1. Create a new Gmail account specifically for this app
2. Follow the same steps as Option A

### 3. Update Server Configuration

In your `server.js` file, find this section and update it:

```javascript
// Email configuration
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: 'your-actual-email@gmail.com',     // ← Replace with your Gmail
        pass: 'your-16-character-app-password'   // ← Replace with your App Password
    }
});
```

**Example:**
```javascript
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: 'johnsmith@gmail.com',
        pass: 'abcd efgh ijkl mnop'  // App password (with spaces)
    }
});
```

### 4. Update Sender Email

Also update the sender email in two places in `server.js`:

```javascript
// In mailOptions
from: 'your-actual-email@gmail.com',  // ← Same as above

// And in the email route
from: 'your-actual-email@gmail.com',  // ← Same as above
```

## 🎯 How It Works

1. **User fills form** → clicks "📧 Send to Email"
2. **App generates PDF** → creates email with attachment
4. **Email includes:**
   - Professional HTML message
   - Invoice details summary
   - PDF attachment

## 📱 Testing

1. **Start your server**: `npm start`
2. **Fill out a test invoice**
3. **Click "📧 Send to Email"**

## 🔧 Troubleshooting

### "Invalid login" Error
- Make sure you're using an **App Password**, not your regular Gmail password
- Enable **2-Step Verification** first
- The app password should be 16 characters

### "Connection refused" Error
- Check your internet connection
- Verify the Gmail credentials are correct
- Make sure "Less secure app access" is disabled (use App Passwords instead)

### Email Not Received
- Check spam/junk folder
- Check server console for error messages

## 🛡️ Security Tips

1. **Never commit credentials** to version control
2. **Use environment variables** for production:

```javascript
// Better approach for production
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});
```

3. **Create .env file**:
```
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

## 📋 Email Template

The email includes:
- **Subject**: Sales Invoice [Invoice Number]
- **Professional HTML formatting**
- **Invoice summary** (number, client, date, total)
- **PDF attachment** with full invoice details

## 🎉 You're All Set!

Once configured, your users can:
- **📄 Generate PDF** → Download to computer

Both buttons work independently, so users can do one or both actions as needed!

---

**Need help?** Check the server console for detailed error messages if something isn't working.

myaccount.google.com/apppasswords