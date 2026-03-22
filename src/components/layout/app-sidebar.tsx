import { BriefcaseBusiness, CalendarClock, Lightbulb, Lock, LogOut, Plus, Search, Settings, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

type AppPage = 'chat' | 'cowork' | 'scheduled' | 'settings';

type AppSidebarProps = {
  sidebarOpen: boolean;
  activeMenuItem: string;
  activePage: AppPage;
  userEmail: string;
  guestMode: boolean;
  onSelectMenuItem: (item: string) => void;
  onSelectPage: (page: AppPage) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onRequireCloudMode: (feature: string) => void;
};

const navItems = [
  { label: 'New task', icon: Plus, page: 'cowork' as const },
  { label: 'Search', icon: Search },
  { label: 'Scheduled', icon: CalendarClock, page: 'scheduled' as const, cloudOnly: true },
  { label: 'Ideas', icon: Lightbulb },
  { label: 'Customize', icon: BriefcaseBusiness },
] as const;

const recentTasks = [
  'Run SEO audit for benai.co',
  'Analyze YouTube Studio data structure',
  'Curate newsletter ideas from AI source docs',
  'Create Google Doc with campaign brief',
  'Convert LinkedIn post to infographic outline',
  'Build newsletter writer skill from examples',
  'Review sales pipeline and next actions',
];

export function AppSidebar({
  sidebarOpen,
  activeMenuItem,
  activePage,
  userEmail,
  guestMode,
  onSelectMenuItem,
  onSelectPage,
  onOpenSettings,
  onLogout,
  onRequireCloudMode,
}: AppSidebarProps) {
  return (
    <Sidebar
      className={`rounded-none border-y-0 border-l-0 transition-all duration-200 ${
        sidebarOpen ? 'w-full opacity-100' : 'w-0 opacity-0 pointer-events-none'
      }`}
    >
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu aria-label="primary workspace menu">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    type="button"
                    active={item.label === activeMenuItem}
                    onClick={() => {
                      if (guestMode && item.cloudOnly) {
                        onRequireCloudMode(item.label);
                        return;
                      }

                      onSelectMenuItem(item.label);
                      if (item.page) {
                        onSelectPage(item.page);
                      }
                    }}
                    className="gap-2 font-sans text-[13px]"
                    title={guestMode && item.cloudOnly ? `${item.label} requires cloud sign-in` : item.label}
                  >
                    <item.icon className="size-3.5 text-muted-foreground" />
                    <span>{item.label}</span>
                    {guestMode && item.cloudOnly ? <Lock className="ml-auto size-3.5 text-muted-foreground" /> : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-1" />

        <SidebarGroup className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <SidebarGroupLabel>Recents</SidebarGroupLabel>
          <SidebarGroupContent className="min-h-0">
            <ScrollArea className="h-full min-h-0">
              <SidebarMenu className="gap-1 pr-1">
                {recentTasks.map((task) => (
                  <SidebarMenuItem key={task}>
                    <SidebarMenuButton type="button" className="w-full truncate font-sans text-[12px]" title={task}>
                      {task}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="grid gap-1">
          <Button
            type="button"
            variant="ghost"
            className={`h-8 w-full justify-start gap-2 rounded-lg px-2.5 font-sans text-xs ${
              activePage === 'settings' ? 'bg-muted text-foreground' : ''
            }`}
            onClick={onOpenSettings}
          >
            <Settings className="size-3.5 text-muted-foreground" />
            Settings
          </Button>
          <Button type="button" variant="ghost" className="h-8 w-full justify-start gap-2 rounded-lg px-2.5 font-sans text-xs" title={userEmail}>
            <UserRound className="size-3.5 text-muted-foreground" />
            {userEmail}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full justify-start gap-2 rounded-lg px-2.5 font-sans text-xs"
            onClick={onLogout}
          >
            <LogOut className="size-3.5 text-muted-foreground" />
            {guestMode ? 'Exit local mode' : 'Logout'}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
