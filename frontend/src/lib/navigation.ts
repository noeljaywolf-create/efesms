// Module navigation map (SRS Â§37 â€” Screen Inventory / routes)
// Menu items are filtered to the logged-in role's permissions (SRS Â§29).

export type MenuItem = {
  path: string
  label: string
  roles: string[]
}

export const NAV: { label: string; items: MenuItem[] }[] = [
  {
    label: 'Operations',
    items: [
      { path: '/dashboard', label: 'Dashboard', roles: ['*'] },
      { path: '/jobs', label: 'Job Cards', roles: ['*'] },
      { path: '/inspections', label: 'Inspections', roles: ['*'] },
      { path: '/services', label: 'Services', roles: ['*'] },
      { path: '/refills', label: 'Refilling', roles: ['*'] },
      { path: '/maintenance', label: 'Maintenance', roles: ['*'] },
      { path: '/anomalies', label: 'Anomalies', roles: ['*'] },
    ],
  },
  {
    label: 'Assets',
    items: [
      { path: '/customers', label: 'Customers', roles: ['*'] },
      { path: '/sites', label: 'Sites', roles: ['*'] },
      { path: '/equipment', label: 'Equipment', roles: ['*'] },
      { path: '/technicians', label: 'Technicians', roles: ['*'] },
    ],
  },
  {
    label: 'Stock & Finance',
    items: [
      { path: '/stores', label: 'Stores', roles: ['admin', 'administrator', 'management', 'stores man'] },
      { path: '/inventory', label: 'Inventory', roles: ['*'] },
      { path: '/quotations', label: 'Quotations', roles: ['*'] },
      { path: '/invoices', label: 'Invoicing', roles: ['*'] },
      { path: '/certificates', label: 'Certificates', roles: ['*'] },
      { path: '/reminders', label: 'Reminders', roles: ['*'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { path: '/reports', label: 'Reports', roles: ['*'] },
      { path: '/users', label: 'Users', roles: ['admin', 'administrator', 'contracts manager'] },
      { path: '/settings', label: 'Settings', roles: ['admin', 'management', 'contracts manager'] },
    ],
  },
]

export const hasAccess = (roles: string[], userRole?: string) =>
  roles.includes('*') || (!!userRole && roles.includes(userRole))
