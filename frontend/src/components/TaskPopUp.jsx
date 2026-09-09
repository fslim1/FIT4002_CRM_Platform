import React, {useState, useEffect} from "react";
import {X} from "lucide-react";
import "../styles/TaskBoard.css";
import {createTask} from "../api/tasks";
import {getUsers} from "../api/users";
import {getCustomers} from "../api/customers";
import {getDeals} from "../api/deals";

const CreateTaskPopup = ({onClose, refreshTasks}) => {
    const [taskName, setTaskName] = useState("");
    const [description, setDescription] = useState("");
    const [customer, setCustomer] = useState("");
    const [priority, setPriority] = useState("Medium");
    const [dueDate, setDueDate] = useState("");
    const [pipeline, setPipeline] = useState("");
    const [users, setUsers] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [deals, setDeals] = useState([]);
    const [deal, setDeal] = useState("");
    useEffect(() => {

        getDeals()
            .then(data => setDeals(data))
            .catch(console.error);

        getCustomers()
            .then((data) => setCustomers(data))
            .catch(console.error);

        console.log("Loading users...");

        getUsers()
            .then((data) => {
                console.log("USERS FROM API:", data);
                setUsers(data);
            })
            .catch((err) => {
                console.error("Failed to load users:", err);
            });
    }, []);

    const handleUserSelection = (userId) => {
        setSelectedUsers((prev) => {
            if (prev.includes(userId)) {
                return prev.filter((id) => id !== userId);
            }

            return [...prev, userId];
        });
    };
    const handleCreateTask = async () => {
        try {
            const newTask = {
                title: taskName,
                description,
                customer,
                deal,
                priority,
                dueDate,
                assignedTo: selectedUsers
            };

            const createdTask = await createTask(newTask);

            console.log("Created task:", createdTask);

            refreshTasks();

            onClose();
        } catch (error) {
            console.error("Failed to create task:", error);
        }
    };

    return (
        <div className="create-task-overlay">
            <div className="create-task-modal">
                {/* Header */}
                <div className="create-header">
                    <h2>Create New Task</h2>

                    <button className="create-close-btn" onClick={onClose}>
                        <X size={24}/>
                    </button>
                </div>

                {/* Form */}
                <div className="create-form">
                    {/* Task Title */}
                    <div className="field full">
                        <label>TASK TITLE *</label>

                        <input
                            type="text"
                            placeholder="Enter task title"
                            value={taskName}
                            onChange={(e) => setTaskName(e.target.value)}
                        />
                    </div>

                    {/* Description */}
                    <div className="field full">
                        <label>DESCRIPTION (200 WORDS MAX)</label>

                        <textarea
                            rows={5}
                            placeholder="Enter task description"
                            value={description}
                            onChange={(e) => {
                                const text = e.target.value;
                                const wordCount = text
                                    .trim()
                                    .split(/\s+/)
                                    .filter(Boolean).length;

                                if (wordCount <= 200) {
                                    setDescription(text);
                                }
                            }}
                        />

                        <small>
                            {description.trim().split(/\s+/).filter(Boolean).length}/200 words
                        </small>
                    </div>

                    {/* Customer */}
                    <div className="field">
                        <label>CUSTOMER *</label>

                        <select
                            value={customer}
                            onChange={(e) => setCustomer(e.target.value)}
                        >
                            <option value="">Select Customer</option>

                            {customers.map((customer) => (
                                <option key={customer._id} value={customer._id}>
                                    {customer.fullName}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Priority */}
                    <div className="field">
                        <label>PRIORITY *</label>

                        <select
                            value={priority}
                            onChange={(e) => setPriority(e.target.value)}
                        >
                            <option>High</option>
                            <option>Medium</option>
                            <option>Low</option>
                        </select>
                    </div>

                    {/* Due Date */}
                    <div className="field">
                        <label>DUE DATE *</label>

                        <input
                            type="date"
                            value={dueDate}
                            min={new Date().toISOString().split("T")[0]}
                            onChange={(e) => setDueDate(e.target.value)}
                        />
                    </div>

                    {/* Deal */}
                    <div className="field">
                        <label>PIPELINE DEAL</label>

                        <select
                            value={deal}
                            onChange={(e) => setDeal(e.target.value)}
                        >
                            <option value="">Select Deal</option>

                            {deals.map((deal) => (
                                <option key={deal._id} value={deal._id}>
                                    {deal.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Assign Users */}
                    <div className="field full">
                        <label>ASSIGN TO (TEAM MEMBERS)</label>

                        <div className="assign-box">
                            {users.map((user) => (
                                <label className="member" key={user._id}>
                                    <input
                                        type="checkbox"
                                        checked={selectedUsers.includes(user._id)}
                                        onChange={() => handleUserSelection(user._id)}
                                    />

                                    <span>{user.fullName}</span>
                                </label>
                            ))}
                        </div>

                        <span className="selected-text">
              {selectedUsers.length} assignee(s) selected
            </span>
                    </div>
                </div>

                {/* Footer */}
                <div className="create-footer">
                    <button className="create-submit-btn" onClick={handleCreateTask}>
                        Create Task
                    </button>

                    <button className="cancel-btn" onClick={onClose}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateTaskPopup;
