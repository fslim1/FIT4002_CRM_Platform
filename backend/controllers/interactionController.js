const mongoose = require('mongoose');
const Interaction = require('../models/Interaction');
const Task = require('../models/Task');

// Fetch all logs for a customer (GET)
const getInteractions = async (req, res) => {
  try {
    const logs = await Interaction.find({ entityId: req.params.customerId }).sort({ createdAt: -1 });
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Log a brand new interaction (POST)
const createInteraction = async (req, res) => {
  try {
    const { type, details, companyName, priority, dueDate } = req.body;
    const customerId = req.params.id;
    const authorName = req.user?.fullName

    const normalizedType = type?.trim();

    if (normalizedType === 'Task') {
      const newTaskCard = await Task.create({
        title: details,
        company: companyName || "",
        status: "todo",
        priority: priority || "Medium",
        dueDate: dueDate ? new Date(dueDate) : null,
        customer: new mongoose.Types.ObjectId(customerId),
        assignedTo: [new mongoose.Types.ObjectId(req.user._id)],
        collaborative: false
      });

    } else {
    }

    const newLog = new Interaction({ entityId: customerId, type, desc: details, author: authorName });
    await newLog.save();
    res.status(201).json({ status: 'success', data: newLog });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteInteraction = async (req, res) => {
  try {
    const { interactionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(interactionId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid interaction ID",
      });
    }

    const deletedInteraction = await Interaction.findByIdAndDelete(
        req.params.interactionId
    );

    if (!deletedInteraction) {
      return res.status(404).json({ status: "error", message: "Interaction not found" });
    }

    res.json({ status: "success", data: deletedInteraction });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Failed to delete interaction" });
  }
};

const editInteraction = async (req, res) => {
  try {
    const updatedInteraction = await Interaction.findByIdAndUpdate(
        req.params.interactionId,
        {
          type: req.body.type,
          desc: req.body.desc,
        },
        {new: true, runValidators: true}
    );

    if (!updatedInteraction) {
      return res.status(404).json({ status: "error", message: "Interaction not found" });
    }

    res.json({ status: "success", data: updatedInteraction });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Failed to update interaction" });
  }
};

module.exports = { getInteractions, createInteraction, deleteInteraction, editInteraction};