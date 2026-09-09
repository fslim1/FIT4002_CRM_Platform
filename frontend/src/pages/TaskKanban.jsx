import React, { useState, useEffect } from "react";
import { Search, Bell, Building2, Calendar, Users } from "lucide-react";
import NotificationPopup from "./NotificationPopup";
import { getNotifications } from "../api/notifications";
import CreateTaskPopup from "../components/TaskPopUp";
import EditTaskPopup from "../components/EditTaskPopup";

import { useAuth } from "@/context/auth";
import { fetchMyTeam, fetchTeams } from "../api/teams";
import { fetchUsers } from "../api/users";
import { can } from "@/lib/permissions";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

import "../styles/TaskBoard.css";
import TaskDetail from "./TaskDetail";
import { getTasks, updateTaskStatus, deleteTask } from "../api/tasks";

const COLUMNS = [
  { id: "todo", name: "To Do" },
  { id: "inprogress", name: "In Progress" },
  { id: "completed", name: "Completed" }
];

const TaskKanban = () => {
  const [tasks, setTasks] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [selectedTask, setSelectedTask] = useState(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const { user } = useAuth();

  const isAdmin = user?.role === "Admin";
  const isSupervisor = user?.role === "Supervisor";
  const canViewAllData = can(user, "viewAllData");

  const [teamMembers, setTeamMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [userFilter, setUserFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");

  //confirm-delete state
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(null);

  const handleConfirmDelete = async () => {
    try {
      await deleteTask(confirmDeleteTask._id);
      setTasks((prev) => prev.filter((t) => t._id !== confirmDeleteTask._id));
      setConfirmDeleteTask(null);
      setSelectedTask(null); // close the detail panel too
    } catch (err) {
      console.error("Failed to delete task", err);
      alert(err.response?.data?.message || "Failed to delete task");
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  // PRIORITY COLORS
  const getPriorityClass = (priority) => {
    switch (priority) {
      case "High":
        return "prio-high";

      case "Medium":
        return "prio-medium";

      case "Low":
        return "prio-low";

      default:
        return "";
    }
  };

  const handleDragStart = (taskId) => {
    setDraggedTaskId(taskId);
  };

  const handleDrop = async (newStatus) => {
    try {
      setTasks((prev) =>
        prev.map((task) =>
          task._id === draggedTaskId ? { ...task, status: newStatus } : task
        )
      );
      await updateTaskStatus(draggedTaskId, newStatus);
    } catch (err) {
      console.error("Failed to update task", err);
    }
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = (task.title ?? "")
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesPriority =
      filterPriority === "all" ||
      task.priority.toLowerCase() === filterPriority.toLowerCase();

    return matchesSearch && matchesPriority;
  });

  // Load filter options (Admin/Supervisor dropdowns)
  useEffect(() => {
    if (isAdmin) {
      Promise.all([fetchUsers(), fetchTeams()])
        .then(([usersData, teamsData]) => {
          setAllUsers(usersData.users || []);
          setAllTeams(teamsData.teams || []);
        })
        .catch(console.error);
    } else if (isSupervisor) {
      fetchMyTeam()
        .then((data) => setTeamMembers(data.members || []))
        .catch(console.error);
      if (canViewAllData) {
        fetchTeams()
          .then((data) => setAllTeams(data.teams || []))
          .catch(console.error);
      }
    }
  }, [isAdmin, isSupervisor, canViewAllData]);

  // Load tasks whenever filters change
  useEffect(() => {
    const params = {};
    if (userFilter) params.userId = userFilter;
    else if (teamFilter) params.teamId = teamFilter;

    getTasks(params)
      .then((data) => setTasks(data))
      .catch((err) => console.error("API ERROR:", err));

    getNotifications()
      .then((data) => setNotifications(data))
      .catch((err) => console.error(err));
  }, [userFilter, teamFilter]);

  return (
    <div className="task-container">
      {/* POPUP */}

      {showCreateTask && (
        <CreateTaskPopup
          onClose={() => setShowCreateTask(false)}
          refreshTasks={() => {
            getTasks()
              .then((data) => setTasks(data))
              .catch((err) => console.error(err));
          }}
        />
      )}

      {editingTask && (
        <EditTaskPopup
          task={editingTask}
          onClose={() => setEditingTask(null)}
          refreshTasks={(updatedTask) => {
            setTasks((prev) =>
              prev.map((task) =>
                task._id === updatedTask._id ? updatedTask : task
              )
            );

            setSelectedTask(updatedTask);
          }}
        />
      )}

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onEdit={(task) => setEditingTask(task)}
          onDelete={(task) => setConfirmDeleteTask(task)}
        />
      )}

      {confirmDeleteTask && (
        <div
          className="modal-overlay"
          onClick={() => setConfirmDeleteTask(null)}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Delete Task</h2>
            <p>
              Are you sure you want to delete{" "}
              <strong>{confirmDeleteTask.title}</strong>? This cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => setConfirmDeleteTask(null)}
              >
                Cancel
              </button>
              <button className="btn-submit" onClick={handleConfirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showNotifications && (
        <NotificationPopup onClose={() => setShowNotifications(false)} />
      )}

      {/* NAVBAR */}
      <div className="task-navbar">
        <div className="search-wrapper">
          <Search className="search-icon-svg" size={18} />

          <input
            type="text"
            placeholder="Search for task names..."
            className="search-input-field"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          className="create-task-btn"
          onClick={() => setShowCreateTask(true)}
        >
          Create Task +
        </button>

        <Select
          onValueChange={(value) => setFilterPriority(value)}
          defaultValue="all"
        >
          <SelectTrigger className="dropdown-trigger-custom">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>

          <SelectContent className="dropdown-content-custom">
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        {/* Supervisor without viewAllData: team member filter only */}
        {isSupervisor && !canViewAllData && teamMembers.length > 0 && (
          <select
            className="btn-filter"
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value);
              setTeamFilter("");
            }}
          >
            <option value="">All Salesperson</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
        )}

        {/* Supervisor with viewAllData: team member filter + team filter */}
        {isSupervisor && canViewAllData && (
          <>
            <select
              className="btn-filter"
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value);
                setTeamFilter("");
              }}
            >
              <option value="">All Team Members</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </select>
            <select
              className="btn-filter"
              value={teamFilter}
              onChange={(e) => {
                setTeamFilter(e.target.value);
                setUserFilter("");
              }}
            >
              <option value="">All Teams</option>
              {allTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </>
        )}

        {/* Admin: user filter (company-wide) + team filter */}
        {isAdmin && (
          <>
            <select
              className="btn-filter"
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value);
                setTeamFilter("");
              }}
            >
              <option value="">All Users</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.role})
                </option>
              ))}
            </select>
            <select
              className="btn-filter"
              value={teamFilter}
              onChange={(e) => {
                setTeamFilter(e.target.value);
                setUserFilter("");
              }}
            >
              <option value="">All Teams</option>
              {allTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </>
        )}

        <div
          className="notification-wrapper"
          onClick={() => setShowNotifications(true)}
        >
          <Bell size={20} />
          {unreadCount > 0 && <span className="notif-indicator"></span>}
        </div>
      </div>

      {/* BOARD */}
      <div className="kanban-board-gradient">
        <div className="columns-wrapper">
          {COLUMNS.map((column) => (
            <div
              key={column.id}
              className="kanban-column"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(column.id)}
            >
              <h2 className="column-title">{column.name}</h2>

              <div className="cards-stack">
                {filteredTasks
                  .filter((task) => task.status === column.id)
                  .map((task) => (
                    <div
                      key={task._id}
                      className="task-card-item"
                      draggable
                      onDragStart={() => handleDragStart(task._id)}
                      onClick={() => setSelectedTask(task)}
                    >
                      <div className="card-header">
                        <h3 className="task-text-title">{task.title}</h3>

                        <span
                          className={`prio-tag ${getPriorityClass(task.priority)}`}
                        >
                          {task.priority}
                        </span>
                      </div>

                      <div className="card-body">
                        <Building2 size={14} />
                        {task.company}
                      </div>

                      <div className="card-footer">
                        <div
                          className={`date-info ${task.overdue ? "date-overdue" : ""}`}
                        >
                          <Calendar size={14} />{" "}
                          {new Date(task.dueDate).toLocaleDateString()}{" "}
                          {task.overdue && "(Overdue)"}
                        </div>

                        {task.assignedTo?.length > 1 && (
                          <div className="collab-info">
                            <Users size={16} />
                            <span className="collab-plus">
                              +{task.assignedTo.length - 1}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TaskKanban;
