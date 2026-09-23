const cron = require('node-cron');
const User = require('../models/User');
const { setupGmailWatch } = require('./gmailService');

let renewalJob = null;

const shouldRenewWatch = (user) => {
  if (!user || !user.isGmailLinked) return false;
  if (!user.gmailAccessToken && !user.gmailRefreshToken) return false;
  if (!user.gmailWatchExpiration) return true;

  const expiresAt = new Date(user.gmailWatchExpiration).getTime();
  const now = Date.now();
  const renewalWindowMs = 7 * 24 * 60 * 60 * 1000;

  return expiresAt - now <= renewalWindowMs;
};

const renewExpiredGmailWatches = async () => {
  try {
    const users = await User.find({
      isGmailLinked: true,
      $or: [
        { gmailAccessToken: { $ne: null } },
        { gmailRefreshToken: { $ne: null } },
      ],
    });

    for (const user of users) {
      try {
        if (!shouldRenewWatch(user)) continue;

        await setupGmailWatch(user._id);
        console.log(`✅ Gmail watch renewed for ${user.email}`);
      } catch (error) {
        console.error(`Failed to renew Gmail watch for ${user.email}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Gmail watch renewal sweep failed:', error.message);
  }
};

const startGmailWatchRenewalCron = () => {
  if (renewalJob) return renewalJob;

  renewalJob = cron.schedule('0 */6 * * *', async () => {
    await renewExpiredGmailWatches();
  }, {
    timezone: 'UTC',
  });

  console.log('📧 Gmail watch renewal cron started');
  return renewalJob;
};

module.exports = {
  startGmailWatchRenewalCron,
  renewExpiredGmailWatches,
  shouldRenewWatch,
};
