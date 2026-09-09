import {useState} from "react";
import {useAuth} from "@/context/auth";
import {useLocation} from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import Menu from "@/pages/Menu";
import {Button} from "@/components/ui/button";
import {LogOut, Menu as MenuIcon, ChevronLeft} from "lucide-react";
import "../styles/AppLayout.css";

function AppLayout({ children }) {
    const {logout} = useAuth();
    const location = useLocation();

    const [collapsed, setCollapsed] = useState(false);

    const currentPage =
        location.pathname === "/" ? "home" : location.pathname.replace("/", "");

    return (
        <div className="app-layout-wrapper">
            <AppHeader
                actions={
                    <Button
                        onClick={logout}
                        size="lg"
                        className="rounded-full"
                        style={{
                            background: "#253984",
                            color: "#EAF6FF",
                            border: "1px solid rgba(234,246,255,0.25)"
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#2A2A72")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#253984")}
                    >
                        <LogOut className="h-4 w-4"/>
                        Log out
                    </Button>
                }
            />

            <div className="app-body">
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
                            <Menu currentPage={currentPage} setCurrentPage={() => {
                            }}/>
                        </div>
                    )}
                </aside>

                <div className="app-main">
                    <div className="app-content">{children}</div>
                </div>
            </div>
        </div>
    );
}

export default AppLayout;
