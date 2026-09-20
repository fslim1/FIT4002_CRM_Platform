import AdminUsers from '@/pages/AdminUsers';

// Renders the full Admin User Management view (including Create User, role and
// team assignment, and Delete User) within Settings, telling the surrounding
// page when the directory changed so the sibling tabs stay in step.
function UsersTab({onDirectoryChanged}) {
    return <AdminUsers onDirectoryChanged={onDirectoryChanged}/>;
}

export default UsersTab;
