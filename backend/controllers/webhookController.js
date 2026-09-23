const { google } = require('googleapis');
const User = require('../models/User');
const Customer = require('../models/Customer');

exports.handleGmailPush = async (req, res) => {
  // Pub/Sub expects an immediate 200 OK to acknowledge receipt
  // Return immediately so Google doesn't keep retrying the delivery
  res.status(200).send('OK');

  try {
    if (!req.body || !req.body.message) return;

    // 1. Decode base64 payload from Pub/Sub
    const encodedData = req.body.message.data;
    const decodedString = Buffer.from(encodedData, 'base64').toString('utf-8');
    const pubSubPayload = JSON.parse(decodedString);

    const { emailAddress, historyId: incomingHistoryId } = pubSubPayload;
    if (!emailAddress) return;

    // 2. Locate the salesperson in your system
    const user = await User.findOne({ email: emailAddress });
    if (!user || !user.lastHistoryId) return;

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({
      access_token: user.gmailAccessToken,
      refresh_token: user.gmailRefreshToken,
    });

    const gmail = google.gmail({ version: 'v1', auth });

    // 3. Fetch incremental updates since the last recorded historyId
    const historyRes = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: user.lastHistoryId,
      historyTypes: ['messageAdded'],
      labelId: 'INBOX',
    });

    // Update user's history pointer to the latest checkpoint
    user.lastHistoryId = incomingHistoryId;
    await user.save();

    const historyItems = historyRes.data.history || [];

    for (const record of historyItems) {
      if (!record.messagesAdded) continue;

      for (const item of record.messagesAdded) {
        const msgId = item.message.id;

        // Fetch headers to identify sender and subject
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });

        const headers = msg.data.payload.headers;
        const fromHeader = headers.find((h) => h.name === 'From')?.value || '';
        const subject = headers.find((h) => h.name === 'Subject')?.value || 'No Subject';

        // Extract sender email (e.g. from "Jane Doe <jane@client.com>")
        const emailMatch = fromHeader.match(/<([^>]+)>/) || [null, fromHeader];
        const senderEmail = (emailMatch[1] || fromHeader).trim().toLowerCase();

        // 4. Match against CRM Customer database
        const customer = await Customer.findOne({ email: senderEmail });
        if (!customer) continue;

        // Prevent duplicate interaction logging
        const isLogged = customer.interactions.some(
          (i) => i.details && i.details.includes(`(Msg ID: ${msgId})`)
        );

        if (!isLogged) {
          customer.interactions.push({
            type: 'Email',
            details: `Received Email - Subject: ${subject} (Msg ID: ${msgId})`,
            author: customer.fullName,
            date: new Date(),
          });
          await customer.save();

          console.log(`📥 Inbound email logged for customer: ${customer.fullName}`);

          // Optional: Emit a WebSocket event if using Socket.IO
          // io.to(user._id.toString()).emit('new-email-notification', { customer, subject, msgId });
        }
      }
    }
  } catch (error) {
    console.error('Error handling Gmail webhook payload:', error.message);
  }
};