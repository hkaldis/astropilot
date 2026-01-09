import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Telescope,
  MapPin,
  Star,
  Wand2,
  BookOpen,
  LogOut,
  GitCompare,
  Eye,
  Trophy,
  Settings,
  ListTodo,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { DonationDialog } from "./DonationDialog";
import darkModeLogo from "@assets/Dark_mode_logo_1764867508003.png";

const navItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Equipment",
    url: "/equipment",
    icon: Telescope,
  },
  {
    title: "Locations",
    url: "/locations",
    icon: MapPin,
  },
  {
    title: "Objects Catalog",
    url: "/objects",
    icon: Star,
  },
];

const observingItems = [
  {
    title: "Watch List",
    url: "/watchlist",
    icon: ListTodo,
  },
  {
    title: "New Observation",
    url: "/wizard",
    icon: Wand2,
  },
  {
    title: "Star Journal",
    url: "/sessions",
    icon: BookOpen,
  },
];

const toolsItems = [
  {
    title: "Equipment Analyzer",
    url: "/equipment-analyzer",
    icon: GitCompare,
  },
  {
    title: "Sky Tonight",
    url: "/sky-tonight",
    icon: Eye,
  },
  {
    title: "Achievements",
    url: "/achievements",
    icon: Trophy,
  },
  {
    title: "Settings & Guide",
    url: "/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      setLocation("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const getDisplayName = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user?.email || "User";
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-3" data-testid="link-home">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center p-1.5 overflow-hidden">
            <img 
              src={darkModeLogo} 
              alt="AstroPilot Logo" 
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="font-semibold text-lg tracking-tight">AstroPilot</h1>
            <p className="text-xs text-muted-foreground">Observing Planner</p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    tooltip={item.title}
                  >
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Observing</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {observingItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    tooltip={item.title}
                  >
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    tooltip={item.title}
                  >
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarSeparator className="mb-2" />
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="h-9 w-9">
            <AvatarImage 
              src={user?.profileImageUrl ?? undefined} 
              alt={getDisplayName()}
              className="object-cover"
            />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{getDisplayName()}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <div className="flex flex-col gap-1 px-2">
          <DonationDialog />
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start"
            onClick={handleLogout}
            disabled={isLoggingOut}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {isLoggingOut ? "Logging out..." : "Log out"}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
