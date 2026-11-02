import AppShell from "@/shared/components/AppShell";
import { isAdmin } from "@/shared/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ManagersTab from "./components/ManagersTab";
import EmployeesTab from "@/features/employees/components/EmployeesTab";

export default function TeamPage() {
  // Only a company admin can list or invite managers.
  const admin = isAdmin();

  return (
    <AppShell title="Team" subtitle="Managers and site employees">
      <Tabs defaultValue="employees">
        <TabsList className="mb-6">
          <TabsTrigger value="employees">Employees</TabsTrigger>
          {admin && <TabsTrigger value="managers">Managers</TabsTrigger>}
        </TabsList>

        <TabsContent value="employees">
          <EmployeesTab />
        </TabsContent>

        {admin && (
          <TabsContent value="managers">
            <ManagersTab />
          </TabsContent>
        )}
      </Tabs>
    </AppShell>
  );
}
