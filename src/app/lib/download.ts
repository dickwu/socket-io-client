'use client';

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { fetch as fetchHttp } from '@tauri-apps/plugin-http';

/**
 * Opens a file save dialog and download the file from url to the path
 * Supports both regular HTTP(S) URLs and data URIs (data:image/...)
 * @param name The name of the file
 * @param url The url or data URI of the file
 * @returns Promise resolving to the file path or error message if failed
 */
export const showDownloadDialog = async (name: string, url: string): Promise<string> => {
  try {
    // Validate inputs
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL provided');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('Invalid filename provided');
    }

    // Check if it's a data URI
    const isDataUri = url.startsWith('data:');
    let extension = 'txt';
    let uint8Array: Uint8Array;

    if (isDataUri) {
      // Extract mime type and extension from data URI
      // Format: data:image/png;base64,iVBORw0KG...
      const matches = url.match(/^data:([^;,]+)(;base64)?,(.*)$/);
      if (!matches) {
        throw new Error('Invalid data URI format');
      }

      const mimeType = matches[1]; // e.g., "image/png"
      const isBase64 = matches[2] === ';base64';
      const data = matches[3];

      // Extract extension from mime type
      extension = mimeType.split('/')[1] || 'bin';

      // Decode data
      if (isBase64) {
        // Decode base64
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        uint8Array = bytes;
      } else {
        // URL-encoded data
        const decodedData = decodeURIComponent(data);
        const encoder = new TextEncoder();
        uint8Array = encoder.encode(decodedData);
      }
    } else {
      // Regular URL - extract extension from URL
      const extensionWithParams = url.split('?')[0].split('.').pop() || 'txt';
      extension = extensionWithParams.includes('?')
        ? extensionWithParams.split('?')[0]
        : extensionWithParams;
    }

    // Ensure the filename has the correct extension
    const fileName = name.includes('.') ? name : `${name}.${extension}`;
    const filePath = await save({
      title: 'Save File',
      canCreateDirectories: true,
      defaultPath: fileName,
      filters: [{ name: `${extension.toUpperCase()} files`, extensions: [extension] }],
    });

    if (filePath) {
      try {
        if (isDataUri) {
          // Save decoded data URI directly
          await writeFile(filePath, uint8Array!);
        } else {
          // Download from URL and save
          const response = await fetchHttp(url);
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const uint8ArrayFromHttp = new Uint8Array(arrayBuffer);
          await writeFile(filePath, uint8ArrayFromHttp);
        }
        return Promise.resolve('');
      } catch (error) {
        return Promise.reject('Error saving file: ' + error);
      }
    }
    return await Promise.reject('Wrong file path');
  } catch (error) {
    console.error('Error showing download dialog:', error);
    return Promise.reject('User Canceled Save File');
  }
};
