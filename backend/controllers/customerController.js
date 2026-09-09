const Customer = require('../models/Customer');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const path = require('path');
const fs = require('fs');
const { sendGmailMessage }= require('../services/gmailService');
const { getVisibleCustomerFilter, canViewCustomer } = require('../middleware/teamScope');

// @desc    Create new customer
// @route   POST /api/customers
// @access  Authenticated staff (record is stamped with owner + team)
const createCustomer = async (req, res) => {
  try {
    const { fullName, phone, email, company, address, designation, department } = req.body;

    let companyLogo = '';
    if (req.file) {
      companyLogo = `/uploads/${req.file.filename}`;
    }

    if (!fullName || !phone || !email || !company || !address || !designation || !department) {
      return res.status(400).json({ message: 'Please include all required fields' });
    }

    const customer = await Customer.create({
      fullName, phone, email, company, address, designation, department, companyLogo,
      owner: req.user?._id || null,
      team: req.user?.team || null
    });

    res.status(201).json(customer);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get all customers visible to the requester (team scoped)
// @route   GET /api/customers
const getCustomers = async (req, res) => {
  try {
    const filter = await getVisibleCustomerFilter(req.user);
    const customers = await Customer.find(filter)
        .populate('owner', 'fullName')
        .sort({createdAt: -1})
        .lean();

    const isAdmin = req.user.role === 'Admin';
    const withSharedFlag = customers.map((c) => ({
      ...c,
      // Mark records owned by another member of the viewer's team
      shared: Boolean(
          !isAdmin && c.owner && String(c.owner._id) !== String(req.user._id)
      ),
    }));

    res.status(200).json(withSharedFlag);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get single customer (access denied outside the requester's scope)
// @route   GET /api/customers/:id
const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).populate('owner', 'fullName');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    if (!(await canViewCustomer(req.user, customer))) {
      return res.status(403).json({ message: 'You do not have access to this customer' });
    }
    res.status(200).json(customer);
  } catch (error) {
      res.status(500).json({message: 'Server Error'});
  }
};

// @desc    Get single customer by exact full name (case-insensitive)
// @route   GET /api/customers/search?name=...
const getCustomerByName = async (req, res) => {
    try {
        const {name} = req.query;
        if (!name) return res.status(400).json({message: 'Name query parameter is required'});

        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const customer = await Customer.findOne({
            fullName: {$regex: `^${escapeRegex(name)}$`, $options: 'i'}
        });

        if (!customer) return res.status(404).json({message: 'Customer not found'});
        res.status(200).json(customer);
    } catch (error) {
        res.status(500).json({message: 'Server Error'});
    }
};


// @desc    Update customer
// @route   PUT /api/customers/:id
const updateCustomer = async (req, res) => {
  try {
    const { fullName, phone, email, company, address, designation, department } = req.body;
    let customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    if (!(await canViewCustomer(req.user, customer))) {
      return res.status(403).json({ message: 'You do not have access to this customer' });
    }

    const updatedData = { fullName, phone, email, company, address, designation, department };
    if (req.file) updatedData.companyLogo = `/uploads/${req.file.filename}`;

    customer = await Customer.findByIdAndUpdate(req.params.id, updatedData, { new: true, runValidators: true });
    res.status(200).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Delete customer profile. Requires the deleteCustomers permission,
//          enforced in routes; non-admins stay team scoped.
// @route   DELETE /api/customers/:id
const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    if (!(await canViewCustomer(req.user, customer))) {
        return res.status(403).json({message: 'You do not have access to this customer'});
    }

    // Best-effort cleanup of uploaded files belonging to this customer
    for (const file of customer.attachments || []) {
      if (!file.path) continue;
      const filePath = path.join(__dirname, '../', file.path);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (fileErr) {
        console.error('Failed to remove attachment file:', fileErr);
      }
    }

    await Customer.findByIdAndDelete(customer._id);
    res.status(200).json({ message: 'Customer deleted', customerId: customer._id });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// --- FILE ATTACHMENT CONTROLLERS ---

const uploadCustomerFile = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    if (!(await canViewCustomer(req.user, customer))) {
      return res.status(403).json({ message: 'You do not have access to this customer' });
    }
    if (!req.file) return res.status(400).json({ message: 'Please upload a file' });

    const newFile = {
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: `/uploads/documents/${req.file.filename}`,
      mimetype: req.file.mimetype,
      size: req.file.size
    };

    customer.attachments.push(newFile);
    await customer.save();

    res.status(201).json(customer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

const getFileFromCustomer = async (customerId, fileId) => {
  const customer = await Customer.findById(customerId);
  if (!customer) throw new Error('Customer not found');
  const file = customer.attachments.id(fileId);
  if (!file) throw new Error('File not found');
  return file;
};

const viewCustomerFile = async (req, res) => {
  try {
    const file = await getFileFromCustomer(req.params.id, req.params.fileId);
    const filePath = path.join(__dirname, '../', file.path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found on server' });

    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', 'inline; filename="' + file.originalName + '"');
    res.sendFile(filePath);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({ message: error.message || 'Server Error' });
  }
};

const downloadCustomerFile = async (req, res) => {
  try {
    const file = await getFileFromCustomer(req.params.id, req.params.fileId);
    const filePath = path.join(__dirname, '../', file.path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found on server' });

    res.download(filePath, file.originalName);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({ message: error.message || 'Server Error' });
  }
};

const deleteCustomerFile = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    if (!(await canViewCustomer(req.user, customer))) {
        return res.status(403).json({message: 'You do not have access to this customer'});
    }

    const fileIndex = customer.attachments.findIndex(f => f._id.toString() === req.params.fileId);
    if (fileIndex === -1) return res.status(404).json({ message: 'File not found' });

    const file = customer.attachments[fileIndex];
    const filePath = path.join(__dirname, '../', file.path);

    customer.attachments.splice(fileIndex, 1);
    await customer.save();

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(200).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

const addInteraction = async (req, res) => {
  try {
    const { type, details, companyName, priority, dueDate, googleAccessToken, customerEmail, emailSubject } = req.body;
    const customerId = req.params.id;

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    if (!(await canViewCustomer(req.user, customer))) {
      return res.status(403).json({ message: 'You do not have access to this customer' });
    }

    // DUAL-WRITE STEP: If it's a Task, spawn a card on the Kanban board
    if (type === 'Task') {
      await Task.create({
        title: details || "New Task",
        company: companyName || customer.company || "",
        status: "todo",
        priority: priority || "Medium",
        dueDate: dueDate ? new Date(dueDate) : null,
        customer: new mongoose.Types.ObjectId(customerId),
        assignedTo: [new mongoose.Types.ObjectId(req.user._id)],
        collaborative: false
      });
    }

    if (type === 'Email') {
      const tokenToSend = req.user?.gmailAccessToken || googleAccessToken;
      if (!tokenToSend) {
        return res.status(400).json({ message: 'Google authentication required to send emails.' });
      }

      console.log(`✉️ Dispatching email to ${customerEmail || customer.email}...`);
      
      await sendGmailMessage(
        customerEmail || customer.email, 
        emailSubject || "CRM Updates", 
        details, 
        tokenToSend
      );
      console.log("✅ Live email dispatched successfully.");
    }

    customer.interactions.push({ type, details, author: req.user.fullName });
    await customer.save();

    res.status(201).json(customer);
  } catch (error) {
    console.error('Error adding interaction:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

const deleteInteraction = async (req, res) => {
  try {
    const { id, interactionId } = req.params;

    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ status: "fail", message: "Customer not found." });
    }
    if (!(await canViewCustomer(req.user, customer))) {
        return res.status(403).json({status: "fail", message: "You do not have access to this customer."});
    }

    const targetInteraction = customer.interactions.id(interactionId);

    if (targetInteraction && targetInteraction.type === 'Task') {
        if (targetInteraction.taskId) {
            await Task.findByIdAndDelete(targetInteraction.taskId);
        } else {
            await Task.findOneAndDelete({
                customer: new mongoose.Types.ObjectId(id),
                description: targetInteraction.details
            });
        }
    }

    const updatedCustomer = await Customer.findByIdAndUpdate(
        id,
        {$pull: {interactions: {_id: interactionId}}},
        {new: true} // returns the document after the deletion takes effect
    );

    // Success response matching your frontend's 'res.data.status === "success"' check
    return res.status(200).json({
      status: "success",
      message: "Interaction successfully deleted.",
      data: updatedCustomer
    });

  } catch (err) {
    console.error("Error inside deleteCustomerInteraction controller:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal server error while trying to delete interaction."
    });
  }
};

const editInteraction = async (req, res) => {
  try {
    const { id, interactionId } = req.params;
    const { type, desc } = req.body; // Incoming updated data from your frontend form

    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ status: "fail", message: "Customer not found." });
    }
    if (!(await canViewCustomer(req.user, customer))) {
      return res.status(403).json({ status: "fail", message: "You do not have access to this customer." });
    }

    const oldInteraction = customer.interactions.id(interactionId);
    const oldDetails = oldInteraction ? oldInteraction.details : "";

    if (type === 'Task') {
      await Task.findOneAndUpdate(
          {
            customer: new mongoose.Types.ObjectId(id),
            title: oldDetails // Finds the task using the previous description text
          },
          {
            $set: {
              title: desc, // Updates the task title on the Kanban board
              priority: req.body.priority || "Medium",
              dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null
            }
          }
      );
    }

    const updatedCustomer = await Customer.findOneAndUpdate(
        {_id: id, "interactions._id": interactionId},
        {
          $set: {
            "interactions.$[elem].type": type,
            "interactions.$[elem].details": desc, // Maps back to your 'details' schema field
            "interactions.$[elem].date": new Date() // Optional: updates the interaction timestamp
          }
        },
        {
            arrayFilters: [{"elem._id": interactionId}],
          new: true
        }
    );

    if (!updatedCustomer) {
      return res.status(404).json({
        status: "fail",
        message: "Customer or interaction not found."
      });
    }

    // Find the specific interaction we just updated to send back to the UI
    const updatedInteraction = updatedCustomer.interactions.find(
        (item) => item._id.toString() === interactionId
    );

    return res.status(200).json({
      status: "success",
      message: "Interaction successfully updated.",
      data: {
        _id: updatedInteraction._id,
        type: updatedInteraction.type,
        desc: updatedInteraction.details || updatedInteraction.desc || "",
        author: updatedInteraction.author || "",
        time: updatedInteraction.date || updatedInteraction.createdAt
      }
    });

  } catch (err) {
    console.error("Error inside editCustomerInteraction controller:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal server error while trying to update interaction."
    });
  }
};

module.exports = {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  uploadCustomerFile,
  viewCustomerFile,
  downloadCustomerFile,
  deleteCustomerFile,
  addInteraction,
  deleteInteraction,
  editInteraction,
  getCustomerByName,
};
