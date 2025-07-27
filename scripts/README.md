# Admin Setup Scripts

## Making a User Admin

To promote a user to admin role, use the `make-admin.js` script:

```bash
node scripts/make-admin.js your-email@example.com
```

### Prerequisites
- The user must already be registered in the system
- You must run this from the root directory of the project
- Make sure your `.env` file is properly configured

### Example
```bash
node scripts/make-admin.js john.doe@company.com
```

This will:
1. Find the user by email
2. Update their role to 'ADMIN'
3. Display confirmation

### After promoting to admin
Once a user is promoted to admin, they will:
- See an "Admin" link in the navigation menu
- Have access to the `/admin` dashboard
- Be able to review and approve/deny override requests

### Security Note
Keep this script secure and only run it for trusted users who should have administrative access to the system. 