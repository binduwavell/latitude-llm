import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import { env } from '@latitude-data/env'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params
    const filePath = path.join('/')
    
    // Only handle local drive requests - S3 files are served directly from S3
    const isDriveLocal = env.DRIVE_DISK === 'local'
    if (!isDriveLocal) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const publicStoragePath = env.PUBLIC_FILES_STORAGE_PATH
    if (!publicStoragePath) {
      return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
    }

    // Construct the full file path
    const fullFilePath = join(publicStoragePath, filePath)
    
    // Security: Ensure the path doesn't escape the storage directory
    if (!fullFilePath.startsWith(publicStoragePath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    // Check if file exists and get stats
    const fileStats = await stat(fullFilePath)
    if (!fileStats.isFile()) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Read the file
    const fileBuffer = await readFile(fullFilePath)
    
    // Get the file extension to determine content type
    const extension = filePath.split('.').pop()?.toLowerCase()
    let contentType = 'application/octet-stream'
    
    // Set appropriate content type based on file extension
    switch (extension) {
      case 'png':
        contentType = 'image/png'
        break
      case 'jpg':
      case 'jpeg':
        contentType = 'image/jpeg'
        break
      case 'gif':
        contentType = 'image/gif'
        break
      case 'webp':
        contentType = 'image/webp'
        break
      case 'svg':
        contentType = 'image/svg+xml'
        break
      case 'pdf':
        contentType = 'application/pdf'
        break
      case 'txt':
        contentType = 'text/plain'
        break
      case 'json':
        contentType = 'application/json'
        break
      case 'csv':
        contentType = 'text/csv'
        break
      case 'mp3':
        contentType = 'audio/mpeg'
        break
      case 'wav':
        contentType = 'audio/wav'
        break
      case 'mp4':
        contentType = 'video/mp4'
        break
      case 'webm':
        contentType = 'video/webm'
        break
    }

    // Return the file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileStats.size.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year since files have unique names
        'ETag': `"${fileStats.mtime.getTime()}"`, // Use modification time as ETag
      },
    })
  } catch (error) {
    console.error('Error serving file:', error)
    
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}