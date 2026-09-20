const {google} = require('googleapis');


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

module.exports = {sendGmailMessage};