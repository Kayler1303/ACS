# Azure Blob Storage Setup Guide

This guide will help you set up Azure Blob Storage for document file storage in your application.

## Prerequisites

- Azure account with an active subscription
- Existing Azure Document Intelligence service (which you already have)

## Step 1: Create Azure Storage Account

1. Go to the [Azure Portal](https://portal.azure.com)
2. Click "Create a resource" → "Storage" → "Storage account"
3. Fill in the details:
   - **Resource Group**: Use the same one as your Document Intelligence service
   - **Storage account name**: Choose a unique name (e.g., `yourappnamestorage`)
   - **Region**: Same region as your Document Intelligence service
   - **Performance**: Standard
   - **Redundancy**: LRS (Locally Redundant Storage) is sufficient for most cases

## Step 2: Get Connection String

1. After the storage account is created, go to the storage account
2. In the left menu, click "Access keys"
3. Copy the "Connection string" from key1 or key2

## Step 3: Add Environment Variables

Add these environment variables to your Vercel deployment:

```bash
# Azure Blob Storage
AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=yourstorageaccount;AccountKey=youraccountkey;EndpointSuffix=core.windows.net"
AZURE_STORAGE_CONTAINER_NAME="documents"
```

### In Vercel Dashboard:
1. Go to your project settings
2. Click "Environment Variables"
3. Add the two variables above with your actual values

### For Local Development:
Add the same variables to your `.env.local` file.

## Step 4: Container Configuration

The application will automatically create the "documents" container with private access when the first file is uploaded. No manual container creation is needed.

## Step 5: Test the Integration

1. Deploy the updated code
2. Try uploading a document
3. Check the Vercel function logs to see blob storage activity
4. Try viewing a document as an admin

## Security Notes

- The container is set to **private access** - files are only accessible with proper authentication
- Files are served through your application's API, maintaining access control
- Connection strings contain sensitive information - never commit them to code

## Cost Estimation

For typical usage (1000 documents, 2MB average):
- **Storage**: ~$0.036/month
- **Transactions**: ~$0.01/month
- **Total**: Less than $0.05/month

## Troubleshooting

### "Azure Storage connection string not configured"
- Verify the `AZURE_STORAGE_CONNECTION_STRING` environment variable is set
- Check that the connection string format is correct

### "Failed to upload file to blob storage"
- Check Azure portal for storage account status
- Verify the connection string has the correct permissions
- Check Vercel function logs for detailed error messages

### "File not found in cloud storage"
- This may happen for files uploaded before blob storage was configured
- Old files will need to be re-uploaded or migrated manually

## Migration from Local Storage

Files uploaded before this update are stored locally and won't be accessible in production. You'll need to:

1. Re-upload important documents after blob storage is configured
2. Or migrate existing files manually (contact support if needed)

## Benefits of This Setup

✅ **Persistent Storage**: Files survive deployments and server restarts
✅ **Scalable**: Handles millions of documents
✅ **Cost-Effective**: Pay only for what you use
✅ **Secure**: Private access with proper authentication
✅ **Fast**: Global CDN distribution available
✅ **Integrated**: Uses same Azure account as Document Intelligence
