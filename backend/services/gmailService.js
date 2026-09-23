const {google} = require('googleapis');
const User = require('../models/User');

// Helper to construct an authenticated OAuth2 client
const getOAuth2Client = (tokens) => {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oAuth2Client.setCredentials(tokens);
  return oAuth2Client;
};

const buildMimeEmail = (to, subject, bodyText) => {
    const messageParts = [
        `To: ${to}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${subject}`,
        '',
        bodyText,
    ];
    const message = messageParts.join('\n');

    return Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};


const sendGmailMessage = async (toEmail, subject, body, accessToken) => {
    try {
        const oAuth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );
        oAuth2Client.setCredentials({access_token: accessToken});

        const gmail = google.gmail({version: 'v1', auth: oAuth2Client});

        const rawMime = buildMimeEmail(toEmail, subject, body);

        const response = await gmail.users.messages.send({
            userId: 'me',
            resource: {
                raw: rawMime,
            },
        });

        return response.data;
    } catch (error) {
        console.error("Gmail API Core Failure:", error);
        throw new Error(`Gmail engine failed: ${error.message}`);
    }
};

//Register Pub/Sub inbox watch for a user
const setupGmailWatch = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user || (!user.gmailAccessToken && !user.gmailRefreshToken)) {
      throw new Error('User has not linked their Google account or tokens are missing.');
    }

    const tokens = {};
    if (user.gmailAccessToken) tokens.access_token = user.gmailAccessToken;
    if (user.gmailRefreshToken) tokens.refresh_token = user.gmailRefreshToken;

    const oAuth2Client = getOAuth2Client(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: process.env.GOOGLE_PUBSUB_TOPIC, // e.g. "projects/<PROJECT_ID>/topics/<TOPIC_NAME>"
        labelIds: ['INBOX'],
      },
    });

    // Save current checkpoint and expiry to database
    user.lastHistoryId = response.data.historyId;
    user.gmailWatchExpiration = new Date(Number(response.data.expiration));
    await user.save();

    console.log(`✅ Gmail watch successfully registered for ${user.email}. Expires on ${user.gmailWatchExpiration}`);
    return response.data;
  } catch (error) {
    console.error('Gmail Watch Setup Failure:', error);
    throw new Error(`Gmail watch registration failed: ${error.message}`);
  }
};

module.exports = {sendGmailMessage, setupGmailWatch};