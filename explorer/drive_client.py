"""
Google Drive Integration Manager for KOSIS Project.
Supports both:
1. OAuth2 User Credentials (token.json / client_secret.json) - Uses personal Google Drive storage quota.
2. Service Account (kosis-509114-*.json) - Supports Shared Drives.
"""

import os
import io
import mimetypes
from pathlib import Path
from typing import Optional, List, Dict, Any

import httplib2
import google_auth_httplib2
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseUpload

SCOPES = ["https://www.googleapis.com/auth/drive"]
DEFAULT_FOLDER_ID = "1SWQZFs_jkistL4kr-cczybKtXy4XW_8N"
SERVICE_ACCOUNT_FILE = r"D:\kosis\kosis-509114-7117303173fe.json"
CLIENT_SECRET_FILE = r"D:\kosis\client_secret.json"
TOKEN_FILE = r"D:\kosis\token.json"
CA_CERTS = r"D:\zscaler_root.pem" if os.path.exists(r"D:\zscaler_root.pem") else None


class GoogleDriveClient:
    def __init__(
        self,
        folder_id: str = DEFAULT_FOLDER_ID,
        service_account_path: str = SERVICE_ACCOUNT_FILE,
        client_secret_path: str = CLIENT_SECRET_FILE,
        token_path: str = TOKEN_FILE,
    ):
        self.folder_id = folder_id
        self.service_account_path = service_account_path
        self.client_secret_path = client_secret_path
        self.token_path = token_path
        self.service = None

    def get_service(self):
        if self.service is not None:
            return self.service

        # 1. Prefer OAuth2 if client_secret.json or token.json exists
        if os.path.exists(self.token_path) or os.path.exists(self.client_secret_path):
            creds = None
            if os.path.exists(self.token_path):
                creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                elif os.path.exists(self.client_secret_path):
                    flow = InstalledAppFlow.from_client_secrets_file(self.client_secret_path, SCOPES)
                    creds = flow.run_local_server(port=0)
                    with open(self.token_path, "w", encoding="utf-8") as token_file:
                        token_file.write(creds.to_json())

            http = httplib2.Http(ca_certs=CA_CERTS)
            authed_http = google_auth_httplib2.AuthorizedHttp(creds, http=http)
            self.service = build("drive", "v3", http=authed_http)
            return self.service

        # 2. Fall back to Service Account
        if os.path.exists(self.service_account_path):
            creds = service_account.Credentials.from_service_account_file(
                self.service_account_path, scopes=SCOPES
            )
            http = httplib2.Http(ca_certs=CA_CERTS)
            authed_http = google_auth_httplib2.AuthorizedHttp(creds, http=http)
            self.service = build("drive", "v3", http=authed_http)
            return self.service

        raise RuntimeError("No Google Drive credentials found (neither client_secret.json nor service account json).")

    def list_folder_files(self, folder_id: Optional[str] = None) -> List[Dict[str, Any]]:
        target_folder = folder_id or self.folder_id
        service = self.get_service()
        query = f"'{target_folder}' in parents and trashed = false"
        res = service.files().list(
            q=query,
            fields="files(id, name, mimeType, size, modifiedTime, webViewLink)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True
        ).execute()
        return res.get("files", [])

    def upload_file(
        self,
        local_path: str | Path,
        remote_name: Optional[str] = None,
        folder_id: Optional[str] = None,
        overwrite: bool = True
    ) -> Dict[str, Any]:
        local_path = Path(local_path)
        if not local_path.exists():
            raise FileNotFoundError(f"Local file does not exist: {local_path}")

        target_folder = folder_id or self.folder_id
        file_name = remote_name or local_path.name
        mime_type, _ = mimetypes.guess_type(str(local_path))
        mime_type = mime_type or "application/octet-stream"

        service = self.get_service()

        if overwrite:
            existing = self.list_folder_files(target_folder)
            for f in existing:
                if f.get("name") == file_name:
                    # Update existing file content
                    media = MediaFileUpload(str(local_path), mimetype=mime_type, resumable=True)
                    updated = service.files().update(
                        fileId=f["id"],
                        media_body=media,
                        fields="id, name, mimeType, webViewLink",
                        supportsAllDrives=True
                    ).execute()
                    return updated

        # Create new file
        meta = {
            "name": file_name,
            "parents": [target_folder]
        }
        media = MediaFileUpload(str(local_path), mimetype=mime_type, resumable=True)
        created = service.files().create(
            body=meta,
            media_body=media,
            fields="id, name, mimeType, webViewLink",
            supportsAllDrives=True
        ).execute()
        return created

    def upload_bytes(
        self,
        data: bytes,
        remote_name: str,
        mimetype: str = "text/csv;charset=utf-8",
        folder_id: Optional[str] = None,
        overwrite: bool = True
    ) -> Dict[str, Any]:
        target_folder = folder_id or self.folder_id
        service = self.get_service()

        if overwrite:
            existing = self.list_folder_files(target_folder)
            for f in existing:
                if f.get("name") == remote_name:
                    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=mimetype, resumable=True)
                    updated = service.files().update(
                        fileId=f["id"],
                        media_body=media,
                        fields="id, name, mimeType, webViewLink",
                        supportsAllDrives=True
                    ).execute()
                    return updated

        meta = {
            "name": remote_name,
            "parents": [target_folder]
        }
        media = MediaIoBaseUpload(io.BytesIO(data), mimetype=mimetype, resumable=True)
        created = service.files().create(
            body=meta,
            media_body=media,
            fields="id, name, mimeType, webViewLink",
            supportsAllDrives=True
        ).execute()
        return created


# Singleton instance
drive_client = GoogleDriveClient()
