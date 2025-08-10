# Production Database Safety Guide

## ⚠️ CRITICAL: Never Run These Commands in Production

```bash
# 🚨 NEVER USE IN PRODUCTION - Will destroy all data
npx prisma migrate reset --force
npx prisma migrate reset
npx prisma db push --force-reset

# 🚨 NEVER USE - Will overwrite schema
npx prisma db push --accept-data-loss
```

## ✅ Safe Production Migration Commands

```bash
# Safe: Only applies new migrations
npx prisma migrate deploy

# Safe: Generate Prisma client after migrations
npx prisma generate

# Safe: Check migration status
npx prisma migrate status
```

## Production Deployment Checklist

### Before Any Schema Changes:

1. **✅ Test in staging environment first**
2. **✅ Create database backup**
3. **✅ Review migration files manually**
4. **✅ Test rollback procedures**
5. **✅ Validate data integrity after migration**

### Migration Best Practices:

1. **Always use `npx prisma migrate dev --name descriptive-name`** in development
2. **Never edit migration files directly** once they're applied
3. **Use `npx prisma db push`** only for rapid prototyping in dev
4. **Create separate migration files** for each logical change
5. **Test migrations on production-like data volumes**

### Environment-Specific Commands:

```bash
# Development (safe to reset)
npx prisma migrate dev --name add-feature
npx prisma db push  # For rapid prototyping

# Staging (test production migrations)
npx prisma migrate deploy
npx prisma generate

# Production (only safe operations)
npx prisma migrate deploy
npx prisma generate
```

### Database Backup Strategy:

```bash
# Before any production migration
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Automated backups (recommended)
# Use your cloud provider's automated backup features
# - AWS RDS automated backups
# - Google Cloud SQL backups  
# - Azure Database backups
```

### Emergency Recovery:

If data loss occurs in production:

1. **Stop all application traffic immediately**
2. **Restore from most recent backup**
3. **Review and apply only necessary migrations**
4. **Validate data integrity**
5. **Resume application traffic**
6. **Post-mortem analysis**

## Development vs Production

| Environment | Safe Commands | Purpose |
|------------|---------------|---------|
| **Development** | `migrate reset`, `db push`, `migrate dev` | Rapid prototyping |
| **Staging** | `migrate deploy`, `generate` | Production testing |
| **Production** | `migrate deploy`, `generate` ONLY | Safe deployment |

## Remember:
- **Development data is disposable**
- **Production data is irreplaceable**
- **Always backup before migrations**
- **Test everything in staging first** 