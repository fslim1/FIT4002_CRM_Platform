const User = require('../models/User');
const Task = require('../models/Task');
 
// ---------------------------------------------------------------------------
// Identity resolution
// Looks up a CRM user and returns the three identifiers UAP's contract wants:
// our own id (for display if nothing else resolves), their Google id (if they
// ever signed in with Google), and their email (UAP's fallback match).
// ---------------------------------------------------------------------------
async function resolveIdentity(userId) {
    const user = await User.findById(userId).select('_id googleId email');
    if (!user) {
        return { externalUserId: userId, googleId: null, email: null };
    }
    return {
        externalUserId: user._id,
        googleId: user.googleId || null,
        email: user.email
    };
}
 
// ---------------------------------------------------------------------------
// Source context
// Turns a task's linked customer/deal (internal MongoDB references) into
// plain display labels, since UAP has no way to look up our internal ids.
// ---------------------------------------------------------------------------
function buildSourceContext(task) {
    return {
        customerName: (task.customer && task.customer.fullName) || undefined,
        dealName: (task.deal && task.deal.name) || undefined
    };
}
 
// ---------------------------------------------------------------------------
// Payload builder
// Assembles the exact JSON shape UAP's task sync expects.
// `task` must already have assignedTo / createdBy / customer / deal populated
// if you want buildSourceContext to have customer/deal names available;
// resolveIdentity re-fetches the user directly so assignedTo/createdBy can be
// either populated docs or raw ObjectIds - both work.
// ---------------------------------------------------------------------------
async function buildTaskPayload(task) {
    const assignees = await Promise.all(
        (task.assignedTo || []).map(entry => {
            const id = entry && entry._id ? entry._id : entry;
            return resolveIdentity(id);
        })
    );
 
    const createdByEntry = task.createdBy && task.createdBy._id ? task.createdBy._id : task.createdBy;
    const createdBy = await resolveIdentity(createdByEntry);
 
    return {
        externalId: task._id,
        title: task.title,
        description: task.description || '',
        status: task.status,
        priority: task.priority,
        dueAt: task.dueDate || null,
        assignees,
        createdBy,
        sourceContext: buildSourceContext(task)
    };
}
 
// ---------------------------------------------------------------------------
// Push with retry
// Sends one HTTP request to UAP. If it fails (network error or non-2xx
// response), retries a few times with increasing delay before giving up.
// ---------------------------------------------------------------------------
async function pushWithRetry(url, options, attempts = 3) {
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url, options);
            if (res.ok) return true;
            console.error(`UAP push responded with status ${res.status} (attempt ${i + 1}/${attempts})`);
        } catch (err) {
            console.error(`UAP push failed (attempt ${i + 1}/${attempts}):`, err.message);
        }
 
        if (i < attempts - 1) {
            const delayMs = 1000 * Math.pow(2, i); // 1s, 2s, 4s...
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    return false;
}
 
// ---------------------------------------------------------------------------
// pushTaskSync
// Sends a create/update event for a task. On success, stamps lastSyncedAt so
// the daily sweep job knows this task doesn't need to be resent.
// ---------------------------------------------------------------------------
async function pushTaskSync(task) {
    if (!process.env.UAP_TASK_SYNC_URL) {
        console.warn('UAP_TASK_SYNC_URL not configured - skipping UAP sync');
        return false;
    }
 
    const payload = await buildTaskPayload(task);
 
    const ok = await pushWithRetry(process.env.UAP_TASK_SYNC_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.UAP_SYNC_SECRET}`
        },
        body: JSON.stringify(payload)
    });
 
    if (ok) {
        await Task.findByIdAndUpdate(task._id, { lastSyncedAt: new Date() });
    }
 
    return ok;
}
 
// ---------------------------------------------------------------------------
// pushTaskDelete
// Notifies UAP that a task was deleted. No body needed - the URL path alone
// identifies which task, per UAP's contract.
// ---------------------------------------------------------------------------
async function pushTaskDelete(taskId) {
    if (!process.env.UAP_BASE_URL || !process.env.UAP_PLATFORM_ID) {
        console.warn('UAP_BASE_URL or UAP_PLATFORM_ID not configured - skipping UAP delete sync');
        return false;
    }
 
    const url = `${process.env.UAP_BASE_URL}/api/platforms/${process.env.UAP_PLATFORM_ID}/tasks/${taskId}/delete`;
 
    return pushWithRetry(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.UAP_SYNC_SECRET}`
        }
    });
}
 
module.exports = {
    resolveIdentity,
    buildSourceContext,
    buildTaskPayload,
    pushTaskSync,
    pushTaskDelete
};
 