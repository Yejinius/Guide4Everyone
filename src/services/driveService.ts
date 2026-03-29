export async function fetchDriveFolders(token: string) {
  const query = "'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&orderBy=name`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error('Failed to fetch folders');
  const data = await response.json();
  return data.files || [];
}

export async function fetchFilesInFolder(folderId: string, token: string) {
  const query = `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime desc`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error('Failed to fetch files');
  const data = await response.json();
  return data.files || [];
}

export async function downloadDriveFile(fileId: string, token: string): Promise<Blob> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error('Failed to download file');
  return await response.blob();
}
