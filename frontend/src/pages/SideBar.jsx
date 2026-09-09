import {useState} from "react";
import {Menu as MenuIcon, ChevronLeft} from "lucide-react";
import Menu from "./Menu";

function Sidebar({ currentPage, setCurrentPage }) {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <aside className={`app-sidebar ${collapsed ? "collapsed" : ""}`}>
            <button
                className="sidebar-toggle"
                onClick={() => setCollapsed(!collapsed)}
            >
                {collapsed ? <MenuIcon size={22}/> : <ChevronLeft size={22}/>}
            </button>

            {!collapsed && (
                <div className="menu-wrapper">
                    <h2 className="menu-title">Menu</h2>
                    <Menu
                        currentPage={currentPage}
                        setCurrentPage={setCurrentPage}
                    />
                </div>
            )}
        </aside>
    );
}

export default Sidebar;