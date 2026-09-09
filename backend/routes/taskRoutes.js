
const { hasPermission } = require('../middleware/permissions'); 
const express = require("express");
const Notification = require("../models/Notification");
const router = express.Router();
const Task = require("../models/Task");
const Customer = require("../models/Customer");
const User = require("../models/User");
const mongoose = require("mongoose");
const { requireAuth, requireRole } = require("../middleware/auth");
const { seesEverything, getCompanyUserIds, getTeamMemberIds } = require('../middleware/teamScope');

// every logged in users tasks
router.get("/", requireAuth, async (req, res) => {
  try {
    const { userId, teamId } = req.query;

    if (userId) {
      const targetUser = await User.findById(userId).select('_id team companyName');
      if (!targetUser) return res.status(404).json({ message: 'User not found' });

      if (seesEverything(req.user)) {
        const companyIds = await getCompanyUserIds(req.user);
        const inCompany = companyIds.some(id => String(id) === String(userId));
        if (!inCompany) return res.status(403).json({ message: 'Access denied' });
      } else if (req.user.role === 'Supervisor') {
        const teamIds = await getTeamMemberIds(req.user);
        const inTeam = teamIds.some(id => String(id) === String(userId));
        if (!inTeam) return res.status(403).json({ message: 'Access denied' });
      } else {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }

      const tasks = await Task.find({
          $or: [{ assignedTo: targetUser._id }, { createdBy: targetUser._id }]
      })
          .populate("assignedTo", "_id fullName")
          .populate("createdBy", "fullName")
          .populate("customer", "fullName company interactions")
          .populate("deal", "name stage company")
          .sort({ createdAt: -1 });
      return res.json(tasks);
    }

    if (teamId) {
      if (req.user.role !== 'Admin' && !hasPermission(req.user, 'viewAllData')) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }
      const teamMembers = await User.find({ team: teamId }).select('_id');
      const memberIds = teamMembers.map(m => m._id);

      const tasks = await Task.find({
          $or: [{ assignedTo: { $in: memberIds } }, { createdBy: { $in: memberIds } }]
      })
          .populate("assignedTo", "_id fullName")
          .populate("createdBy", "fullName")
          .populate("customer", "fullName company interactions")
          .populate("deal", "name stage company")
          .sort({ createdAt: -1 });
      return res.json(tasks);
    }

    // Default: everything visible to this user
    let allowedUserIds = [];
    if (seesEverything(req.user)) {
        allowedUserIds = await getCompanyUserIds(req.user);
    } else if (req.user.role === 'Supervisor') {
        allowedUserIds = await getTeamMemberIds(req.user);
    } else {
        allowedUserIds = [req.user._id];
    }

    const tasks = await Task.find({
        $or: [
            {assignedTo: {$in: allowedUserIds}},
            {createdBy: {$in: allowedUserIds}}
        ]
    })
        .populate("assignedTo", "_id fullName")
        .populate("createdBy", "fullName")
        .populate("customer", "fullName company interactions")
        .populate("deal", "name stage company")
        .sort({createdAt: -1});

    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch tasks" });
  }
});

router.post("/", requireAuth, async (req, res) => {
    try {
        const task = new Task({
            title: req.body.title,
            description: req.body.description,
            customer: req.body.customer,
            deal: req.body.deal,
            priority: req.body.priority,
            dueDate: req.body.dueDate,
            status: "todo",
            createdBy: req.user._id,
            assignedTo:
                req.body.assignedTo?.length > 0 ? req.body.assignedTo : [req.user._id]
        });

        await task.save();

        if (req.body.customer) {
            await Customer.findByIdAndUpdate(req.body.customer, {
                $push: {
                    interactions: {
                        type: "Task",
                        summary: req.body.title ? `${req.body.title}: ${req.body.description || ""}` : (req.body.description || ""),
                        details: req.body.description || "",
                        taskId: task._id,
                        createdBy: req.user._id,
                        author: req.user.fullName || (task.createdBy && task.createdBy.fullName),
                        date: new Date()
                    }
                }
            });
        }

        const populatedTask = await Task.findById(task._id)
            .populate("assignedTo", "fullName")
            .populate("createdBy", "fullName")
            .populate("customer", "fullName company interactions");

        res.status(201).json(populatedTask);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to create task" });
    }
});

router.delete("/:id", requireAuth, requireRole('Supervisor', 'Admin'), async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: "Task not found" });

        if (req.user.role === 'Supervisor') {
            const teamIds = (await getTeamMemberIds(req.user)).map(String);
            if (!teamIds.includes(task.createdBy.toString())) {
                return res.status(403).json({ message: "You can only delete tasks from your team." });
            }
        }

        await Task.findByIdAndDelete(req.params.id);
        res.json({ message: "Task deleted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to delete task" });
    }
});

router.patch("/:id/status", requireAuth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: "Task not found" });

        const myId = req.user._id.toString();
        const isInvolved = task.createdBy.toString() === myId ||
            task.assignedTo.some(id => id.toString() === myId);

        let allowed = isInvolved;
        if (!allowed && req.user.role === 'Supervisor') {
            const teamIds = (await getTeamMemberIds(req.user)).map(String);
            allowed = teamIds.includes(task.createdBy.toString());
        }
        if (!allowed && seesEverything(req.user)) allowed = true;

        if (!allowed) return res.status(403).json({ message: "Not authorized to update this task" });

        const { status } = req.body;
        const updatedTask = await Task.findByIdAndUpdate(req.params.id, {status}, {new: true});
        res.json(updatedTask);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to update task status" });
    }
});

router.patch("/:id", requireAuth, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        const isCreator = task.createdBy.toString() === req.user._id.toString();
        let canEdit = isCreator;

        if (!canEdit && req.user.role === 'Supervisor') {
            const teamIds = (await getTeamMemberIds(req.user)).map(String);
            canEdit = teamIds.includes(task.createdBy.toString());
        }
        if (!canEdit && seesEverything(req.user)) {
            canEdit = true;
        }

        if (!canEdit) {
            return res.status(403).json({ message: "You don't have permission to edit this task." });
        }

        task.title = req.body.title ?? task.title;
        task.description = req.body.description ?? task.description;
        task.customer = req.body.customer ?? task.customer;
        task.priority = req.body.priority ?? task.priority;
        task.dueDate = req.body.dueDate ?? task.dueDate;
        task.assignedTo = req.body.assignedTo ?? task.assignedTo;

        await task.save();

        const updatedTask = await Task.findById(task._id)
            .populate("assignedTo", "fullName")
            .populate("createdBy", "fullName")
            .populate("customer", "fullName company interactions");

        res.json(updatedTask);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to update task" });
    }
});

module.exports = router;