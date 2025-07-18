import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }

  // A basic security check for file type
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type.' }, { status: 400 });
  }

  // Convert the file to a buffer
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Store the file temporarily
  const tempFilePath = join(tmpdir(), `upload_${Date.now()}_${file.name}`);
  
  try {
    await writeFile(tempFilePath, buffer);
    console.log(`File saved to ${tempFilePath}`);

    // This is where the analysis will happen in future steps.
    // For now, we'll just return a success message.

    // We should clean up the file after analysis, but for now we will leave it
    // for debugging purposes.

    return NextResponse.json({
      message: 'File uploaded successfully.',
      // In the future, this will be the real analysis result
      annualizedIncome: 0,
    });
  } catch (error) {
    console.error('Error saving file:', error);
    return NextResponse.json({ error: 'Error saving file.' }, { status: 500 });
  }
} 