
# SITE14 — Frontend Guide

How we build the frontend. Read this before adding anything.

---

## 1. Stack

| Tool | What it does | Docs |
|---|---|---|
| React 19 | Builds the UI. You describe what the screen looks like for some data, React updates the DOM | react.dev/learn |
| TypeScript | JavaScript + types. Catches wrong field names before runtime | typescriptlang.org/docs/handbook |
| react-router-dom 7 | Maps a URL to a page | reactrouter.com |
| Vite 8 | Dev server + build. Also proxies `/api/v1` to the backend | vite.dev |
| Tailwind v4 | Styling through class names | tailwindcss.com/docs |
| shadcn | UI pieces copied **into** our repo at `src/components/ui`. Not an npm package | ui.shadcn.com |
| zod | Input validation schemas | zod.dev |
| leaflet | Maps | leafletjs.com |

**File extensions:** `.tsx` = contains JSX markup. `.ts` = logic only.

**You do not need deep React knowledge to add a feature.** You need four things:
- `useState` — a value that, when changed, re-renders the component
- `useEffect(fn, [])` — run once when the component first appears. Use it to fetch
- props — data passed from parent to child, like function arguments
- `.map()` — turn an array into rows. Always pass `key={item.id}`

That is 90% of what we use. Everything else, look up when you hit it.

---

## 2. Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

The backend must run in parallel.

**After every `git pull`, run `npm install`.** Pull brings code, not packages. If the dev server won't start, this is why.

---

## 3. Folder map

```
src/
├── main.tsx                  entry point
├── App.tsx                   all routes
├── index.css                 Tailwind + color tokens
│
├── components/ui/            shadcn. Don't hand-edit
├── lib/utils.ts              shadcn's cn()
│
├── shared/                   used by every feature
│   ├── components/
│   │   ├── AppShell.tsx      sidebar + header. Takes title, subtitle, children
│   │   ├── ProtectedRoute.tsx redirects to /signin if no session
│   │   ├── FormField.tsx     label + input + error message
│   │   ├── EmptyState.tsx    "no data yet"
│   │   ├── StatusBadge.tsx   colored status chip
│   │   └── Logo.tsx          do not delete, holds the SVG paths
│   └── lib/
│       ├── api.ts            apiFetch, ApiError, silent token refresh
│       ├── auth.ts           token storage, isLoggedIn(), isAdmin()
│       ├── validation.ts     all zod schemas
│       └── useFormValidation.ts form errors hook
│
└── features/
    ├── landing/              Landing.tsx          → /
    ├── auth/                 Signin, Signup, ...  → /signin ...
    ├── account/              Account.tsx          → /account
    ├── map/                  MapPage.tsx          → /home
    ├── sites/                SitesPage, SiteEditPage → /sites
    ├── team/                 TeamPage.tsx         → /team
    └── employees/            no page — rendered inside TeamPage as a tab
```

**One folder per feature.** Everything about employees lives in `features/employees`. Delete the folder and the feature is gone.

**Rule: a feature does not import from another feature.** If two features need the same thing, move it to `shared/`.

Two accepted exceptions, both deliberate:
- `team/TeamPage.tsx` imports `EmployeesTab`, because employees has no page of its own
- `sites/components/SiteEmployees.tsx` imports the employee **type**, not components

---

## 4. What goes in each file

### `types.ts` — the shape of the data

Types only. Field names copied **exactly** from the backend, `snake_case`, no renaming.

```ts
export type EmployeeStatus = "active" | "inactive";

export type Employee = {
  id: string;
  full_name: string;
  employee_number?: string | null;
  job_category: string;
  status: EmployeeStatus;
  site_id: string | null;
  site_name?: string | null;
};

export type ListEmployeesResponse = {
  data: Employee[];
  page: number;
  limit: number;
  total: number;
};

export type CreateEmployeeInput = {
  full_name: string;
  job_category: string;
  employee_number?: string | null;
  site_id?: string | null;
};
```

- `?` → the field may be missing
- `| null` → the field is there but may be empty
- `"active" | "inactive"` → must be exactly one of these
- Separate `Employee` from `CreateEmployeeInput`. What you send is not what you get back — the backend generates `id` and `status`

A small pure formatting helper is allowed here, like `shiftLabel` in `sites/types.ts`. Nothing bigger.

### `api.ts` — one function per endpoint

No JSX. Every call goes through `apiFetch`, never raw `fetch`.

```ts
import { apiFetch } from "@/shared/lib/api";
import type {
  CreateEmployeeInput,
  Employee,
  EmployeeStatus,
  ListEmployeesResponse,
} from "./types";

export function listEmployees(params?: {
  siteId?: string;
  status?: EmployeeStatus;
  search?: string;
}) {
  const query = new URLSearchParams();
  if (params?.siteId) query.set("site_id", params.siteId);
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return apiFetch<ListEmployeesResponse>(`/employees${qs ? `?${qs}` : ""}`);
}

export const createEmployee = (body: CreateEmployeeInput) =>
  apiFetch<Employee>("/employees", { method: "POST", body: JSON.stringify(body) });

export const deactivateEmployee = (id: string) =>
  apiFetch<void>(`/employees/${id}`, { method: "DELETE" });
```

- `apiFetch<ListEmployeesResponse>` — the part in `< >` tells TypeScript the response shape, so you get autocomplete on the result
- Paths are relative: `/employees`, not `/api/v1/employees`. The prefix is inside `apiFetch`
- Use `URLSearchParams`, don't build the query string by hand — it escapes spaces and special characters
- `apiFetch` already handles the auth header, the refresh-token retry, and error messages. That is the whole reason this file exists

**Import convention:** functions from `./api`, types from `./types`, two separate lines.

```ts
import { listEmployees } from "./api";
import type { Employee } from "./types";
```

### `<Feature>Page.tsx` — the route

Named after the feature: `SitesPage.tsx`, `TeamPage.tsx`, `MapPage.tsx`.

Two jobs only: wrap in `AppShell`, compose the feature's components. No fetching here.

```tsx
import AppShell from "@/shared/components/AppShell";
import { isAdmin } from "@/shared/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ManagersTab from "./components/ManagersTab";
import EmployeesTab from "@/features/employees/components/EmployeesTab";

export default function TeamPage() {
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
```

- The title is a **prop on `AppShell`**, not a component inside it
- `{admin && <X />}` shows `X` only when `admin` is true
- **Hiding a button is not security.** The backend returns 403. This only stops users seeing things that would fail

**Not every feature needs a page.** `employees` has no page and no route — it renders inside `TeamPage`. Give a feature a page when it is a destination someone navigates to. Keep it page-less when it is a piece shown inside another screen.

### `components/` — the feature's own pieces

Split into three roles. This is the part that matters most.

**Table / list — displays, never fetches**

```tsx
import type { Employee } from "../types";

type Props = {
  employees: Employee[];
  onDelete: (id: string) => void;
};

export default function EmployeeTable({ employees, onDelete }: Props) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {employees.map((e) => (
          <tr key={e.id} className="border-b">
            <td className="py-2">{e.full_name}</td>
            <td className="py-2">{e.site_name ?? "—"}</td>
            <td className="py-2 text-right">
              <button onClick={() => onDelete(e.id)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Takes data in, sends events out. Reusable anywhere. `key={e.id}` is required on `.map`.

**Dialog — owns its form, not whether it's open**

```tsx
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};
```

The parent owns `open` because the parent owns the button. `onCreated` lets the parent refresh its list. The dialog doesn't know what happens next.

**Tab / container — the brain**

```tsx
export default function EmployeesTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await listEmployees();
      setEmployees(res.data);
    } catch {
      setError("Could not load employees.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-sm text-danger">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">All employees</h2>
        <Button onClick={() => setAddOpen(true)}>Add employee</Button>
      </div>

      {employees.length === 0 ? (
        <EmptyState title="No employees yet" />
      ) : (
        <EmployeeTable employees={employees} onDelete={handleDelete} />
      )}

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} onCreated={load} />
    </div>
  );
}
```

Three things to copy from this:
- **`load` is a named function, not inline inside `useEffect`.** That's what makes `onCreated={load}` work. If you write the fetch inside `useEffect` you can't call it again and the list never refreshes after adding
- **`useEffect(() => {...}, [])`** — the empty array means "run once". Remove it and you get an infinite loop
- **Four states every list handles:** loading, error, empty, data

### Where does a component go?

Ask: **does it know what an "employee" is?**

- Yes → `features/employees/components/`
- No, but it's ours → `shared/components/`
- No, it's a generic primitive → `components/ui/`, from shadcn

---

## 5. Build a feature — checklist

Example: a `perimeters` feature.

```
0. Read the backend first
   routes/perimeter.routes.js   → the endpoints
   services/perimeter.service.js → toPublic(), it decides the field names
   utils/schemas.js              → validation limits

1. mkdir src/features/perimeters src/features/perimeters/components

2. types.ts          Perimeter, ListPerimetersResponse, CreatePerimeterInput
3. api.ts            listPerimeters, createPerimeter, deletePerimeter
                     test it in the browser console before building any UI
4. validation.ts     add perimeterSchema in shared/lib/validation.ts
                     copy the limits from the backend exactly
5. components/PerimeterTable.tsx       display only
6. components/AddPerimeterDialog.tsx   the form
7. components/PerimetersTab.tsx        fetch, state, wiring

   -- is this a destination or a piece inside another page? --
   piece       → stop here, import the Tab where it belongs
   destination → continue

8. PerimetersPage.tsx    <AppShell title=... subtitle=...>
9. App.tsx               <Route path="/perimeters" element={<ProtectedRoute><PerimetersPage /></ProtectedRoute>} />
10. AppShell.tsx         add the sidebar link to MAIN

11. npx tsc --noEmit     must return zero errors
```

**Always build bottom-up: data first, UI last.** Start with the UI and you will invent field names the backend doesn't have, then rewrite everything.

**Why so many files:** each one has a single job, so you can find a bug without reading the rest, two people can edit different files without a git conflict, and the table stays reusable because it doesn't know where its data came from.

---

## 6. Conventions

- Feature folders: lowercase plural — `employees`, `sites`
- Components: `PascalCase.tsx` · logic files: `camelCase.ts` · hooks start with `use`
- Import with `@/` from `src` root; use relative paths inside the same feature
- Types with `import type`
- Field names `snake_case`, matching the backend
- Validation limits copied verbatim from `src/utils/schemas.js`
- Colors: `bg-primary`, `text-muted-foreground` — never `bg-orange-600` or `text-gray-500`
- Loading state: `<Skeleton />` from `components/ui/skeleton`, not a "Loading..." string

---

## 7. Gotchas we already hit

| Symptom | Cause | Fix |
|---|---|---|
| Dev server won't start after a pull | Packages not installed | `npm install` |
| `asChild does not exist` | Our shadcn is on Base UI, not Radix | Style the trigger itself, drop the inner `<Button>` |
| Red squiggles but the code is fine | Stale VS Code TS state | `npx tsc --noEmit` is the truth. Restart the TS server |
| Request fires twice in the Network tab | `StrictMode` runs twice in dev | Normal. Gone in `npm run build` |
| Added a row but the list doesn't update | `load` was written inside `useEffect` | Make it a named function, pass `onCreated={load}` |
| Mojibake like `â€"` in a file | Non-ASCII typed into a PowerShell command | Never put non-ASCII in terminal commands |
| Logged out after a few minutes | Parallel refreshes cancelling each other | Single-flight guard in `shared/lib/api.ts` |

---

## 8. Safety

- `.env` is never committed. `.env.example` is
- **Never run `npm run db:seed` or `prisma migrate dev` against the shared team database.** The seed empties every table
- `DATABASE_URL_TEST` must never point at the shared database — tests wipe it
- `ALLOW_REMOTE_RESET` stays `false`
- The refresh token lives in an `httpOnly` cookie, never in `localStorage`

---

## 9. Before a PR

```bash
npx tsc --noEmit
npm run build
```

Then click through it yourself: the new page, loading, error, empty, and the form with bad input.

---

## Known cleanup

`shared/components/PageHeader.tsx` is unused — written before `AppShell` took `title` and `subtitle`. Delete it or repurpose it for a page that needs action buttons in the header.