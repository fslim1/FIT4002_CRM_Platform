const express = require("express");

const router = express.Router();

const Task = require("../models/Task");

const Notification = require("../models/Notification");

require("../models/Stage");

const { requireAuth } = require("../middleware/auth");

// GET USER NOTIFICATIONS
router.get("/", requireAuth, async (req, res) => {

  try {

    const notifications =
        await Notification.find({
            user: req.user._id
        })

            .sort({createdAt: -1})

            .limit(20);

    res.json(notifications);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Failed to fetch notifications"
    });

  }

});


// MARK ALL AS READ
router.patch("/read", requireAuth, async (req, res) => {

  try {

    await Notification.updateMany(
        {user: req.user._id},

        {read: true}
    );

    res.json({
      message: "Notifications marked as read"
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "Failed to update notifications"
    });

  }

});

module.exports = router;