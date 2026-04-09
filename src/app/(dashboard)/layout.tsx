import { SidebarProvider } from "@/contexts/SidebarContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { Sidebar } from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <CurrencyProvider>
        <div className="min-h-screen bg-background flex">
          {/* Fixed sidebar — never scrolls */}
          <Sidebar />
          {/* Main content area — offset by sidebar width on md+ */}
          <div className="flex-1 flex flex-col md:ml-64">
            {children}
          </div>
        </div>
      </CurrencyProvider>
    </SidebarProvider>
  );
}
